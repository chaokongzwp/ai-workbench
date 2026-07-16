#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createWriteStream, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const argv = process.argv.slice(2);
const target = readOption("--target") || "all";
const checkOnly = argv.includes("--check");
const upload = argv.includes("--upload");
const requestedVersion = readOption("--version");
const requestedIosBuild = readOption("--ios-build");
const requestedMacBuild = readOption("--mac-build");
const supportedTargets = new Set(["all", "ios", "macos"]);

if (argv.includes("--help") || argv.includes("-h")) {
  printUsage();
  process.exit(0);
}

if (!supportedTargets.has(target)) {
  fail(`不支持的发布目标：${target}。请选择 all、ios 或 macos。`);
}

const includeIos = target === "all" || target === "ios";
const includeMac = target === "all" || target === "macos";
const teamId = process.env.AIWB_APPLE_TEAM_ID || "47T37CCFZ2";
const packageJson = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
const projectFile = join(projectRoot, "ios/App/App.xcodeproj/project.pbxproj");
const exportOptions = join(projectRoot, "ios/ExportOptions.TestFlight.plist");
const currentProjectText = readFileSync(projectFile, "utf8");
const currentIosBuild = readCurrentIosBuild(currentProjectText);
const marketingVersion = requestedVersion || packageJson.version || "1.0.0";
const iosBuild = normalizeBuildNumber(requestedIosBuild || String(currentIosBuild + 1), "iOS");
const macBuild = normalizeBuildNumber(requestedMacBuild || timestampBuildNumber(), "macOS");
const releaseId = new Date().toISOString().replace(/[:.]/g, "-");
const releaseDir = join(projectRoot, "build/releases", releaseId);
await mkdir(releaseDir, { recursive: true });
const logPath = join(releaseDir, "release.log");
const logStream = createWriteStream(logPath, { flags: "a" });
let iosArchived = false;
let iosUploaded = false;
let macBuilt = false;
let macUploaded = false;

process.stdout.on("error", ignoreBrokenPipe);
process.stderr.on("error", ignoreBrokenPipe);

writeHeader();

try {
  await preflight();
  await run("npm", ["run", "build:web"]);

  if (includeIos) {
    await prepareIosProject();
  }

  if (checkOnly) {
    log("\n发布检查通过。未生成归档，也没有上传到 App Store Connect。\n");
    await finish(0);
  }

  if (includeIos) {
    persistIosBuildNumber(iosBuild);
    await archiveIos();
    iosArchived = true;
    if (upload) {
      await uploadIos();
      iosUploaded = true;
    }
  }

  if (includeMac) {
    await buildMacAppStore();
    macBuilt = true;
    if (upload) {
      await uploadMacAppStore();
      macUploaded = true;
    }
  }

  log("\n========================================\n");
  log(upload ? "发布命令已全部完成\n" : "归档已全部生成，未执行上传\n");
  if (includeIos) log(`iPhone / iPad：${marketingVersion} (${iosBuild})${upload ? "，已提交 App Store Connect" : ""}\n`);
  if (includeMac) log(`macOS：${marketingVersion} (${macBuild})${upload ? "，已提交 App Store Connect" : ""}\n`);
  log(`日志：${logPath}\n`);
  log("上传完成后，App Store Connect 仍需几分钟处理构建。\n");
  log("========================================\n");
  await finish(0);
} catch (error) {
  log(`\n发布失败：${error.message}\n`);
  writeCompletionSummary();
  log(`完整日志：${logPath}\n`);
  await finish(1);
}

async function preflight() {
  log("\n[1/4] 发布前检查\n");
  await run("xcode-select", ["-p"]);
  await run("xcrun", ["--find", "xcodebuild"]);

  if (!existsSync(exportOptions)) fail(`缺少 TestFlight 导出配置：${exportOptions}`);

  const identities = await capture("security", ["find-identity", "-v"]);
  const escapedTeam = teamId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hasDistribution = new RegExp(`Apple Distribution:.*\\(${escapedTeam}\\)`).test(identities);
  const hasMacInstaller = new RegExp(`(?:3rd Party Mac Developer Installer|Mac Installer Distribution):.*\\(${escapedTeam}\\)`).test(identities);

  if (!hasDistribution) fail(`没有找到 Team ${teamId} 的 Apple Distribution 证书。`);
  if (includeMac && !hasMacInstaller) fail(`没有找到 Team ${teamId} 的 Mac Installer Distribution 证书。`);
  const status = await capture("git", ["status", "--short"]);
  if (status.trim()) {
    log("提示：工作区存在未提交修改；发布会保留这些修改并按当前内容构建。\n");
  }
}

async function prepareIosProject() {
  log("\n[2/4] 同步 iPhone / iPad 工程\n");
  await run(resolve(projectRoot, "node_modules/.bin/cap"), ["sync", "ios"]);
  await run(process.execPath, [join(projectRoot, "scripts/register-ios-plugin.mjs")]);

  if (checkOnly) {
    const buildSettings = await capture("xcodebuild", [
      "-project",
      join(projectRoot, "ios/App/App.xcodeproj"),
      "-scheme",
      "App",
      "-configuration",
      "Release",
      "-destination",
      "generic/platform=iOS",
      `DEVELOPMENT_TEAM=${teamId}`,
      "CODE_SIGN_STYLE=Automatic",
      `MARKETING_VERSION=${marketingVersion}`,
      `CURRENT_PROJECT_VERSION=${iosBuild}`,
      "-showBuildSettings",
    ]);
    const bundleId = readBuildSetting(buildSettings, "PRODUCT_BUNDLE_IDENTIFIER");
    const deviceFamily = readBuildSetting(buildSettings, "TARGETED_DEVICE_FAMILY");
    const deploymentTarget = readBuildSetting(buildSettings, "IPHONEOS_DEPLOYMENT_TARGET");
    if (!bundleId) fail("Xcode Release 配置缺少 PRODUCT_BUNDLE_IDENTIFIER。");
    if (!deviceFamily.split(",").map((item) => item.trim()).includes("2")) {
      fail(`当前 iOS 工程没有包含 iPad 设备族：TARGETED_DEVICE_FAMILY=${deviceFamily || "未配置"}`);
    }
    log(`Xcode Release：${bundleId} · iOS ${deploymentTarget || "未知"}+ · 设备族 ${deviceFamily}\n`);
  }
}

async function archiveIos() {
  log("\n[3/4] 归档 iPhone / iPad\n");
  const archivePath = iosArchivePath();
  rmSync(archivePath, { recursive: true, force: true });
  await run("xcodebuild", [
    "-project",
    join(projectRoot, "ios/App/App.xcodeproj"),
    "-scheme",
    "App",
    "-configuration",
    "Release",
    "-destination",
    "generic/platform=iOS",
    "-archivePath",
    archivePath,
    "-allowProvisioningUpdates",
    `DEVELOPMENT_TEAM=${teamId}`,
    "CODE_SIGN_STYLE=Automatic",
    `MARKETING_VERSION=${marketingVersion}`,
    `CURRENT_PROJECT_VERSION=${iosBuild}`,
    "archive",
  ]);
}

async function uploadIos() {
  log("\n[4/4] 上传 iPhone / iPad 到 TestFlight\n");
  const exportPath = join(releaseDir, `ios-export-${iosBuild}`);
  rmSync(exportPath, { recursive: true, force: true });
  await run("xcodebuild", [
    "-exportArchive",
    "-archivePath",
    iosArchivePath(),
    "-exportPath",
    exportPath,
    "-exportOptionsPlist",
    exportOptions,
    "-allowProvisioningUpdates",
  ]);
}

async function buildMacAppStore() {
  log("\n[3/4] 构建 macOS App Store 版本\n");
  await run(process.execPath, [join(projectRoot, "scripts/build-mas.mjs"), "mas"], {
    AIWB_MAC_BUILD_NUMBER: macBuild,
    AIWB_APPLE_TEAM_ID: teamId,
  });
}

async function uploadMacAppStore() {
  log("\n[4/4] 上传 macOS 到 App Store Connect\n");
  const appPath = join(projectRoot, "build/mac/mas-arm64/AI Workbench.app");
  if (!existsSync(appPath)) fail(`macOS App 不存在：${appPath}`);
  await run(process.execPath, [join(projectRoot, "scripts/upload-mas-xcode.mjs")], {
    AIWB_MAC_BUILD_NUMBER: macBuild,
    AIWB_APPLE_TEAM_ID: teamId,
  });
}

function persistIosBuildNumber(nextBuild) {
  const nextText = readFileSync(projectFile, "utf8").replace(
    /CURRENT_PROJECT_VERSION = \d+;/g,
    `CURRENT_PROJECT_VERSION = ${nextBuild};`,
  );
  writeFileSync(projectFile, nextText);
  log(`iOS Build 已更新为 ${nextBuild}。\n`);
}

function iosArchivePath() {
  return join(projectRoot, "build/ios-release", `AIWorkbench-${marketingVersion}-${iosBuild}.xcarchive`);
}

function readCurrentIosBuild(text) {
  const values = [...text.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map((match) => Number(match[1]));
  if (!values.length) fail("无法从 Xcode 工程读取 CURRENT_PROJECT_VERSION。");
  return Math.max(...values);
}

function readBuildSetting(output, name) {
  const match = output.match(new RegExp(`^\\s*${name}\\s*=\\s*(.+)$`, "m"));
  return match?.[1]?.trim() || "";
}

function normalizeBuildNumber(value, platform) {
  if (!/^\d+$/.test(String(value)) || Number(value) <= 0) {
    fail(`${platform} Build 必须是正整数：${value}`);
  }
  return String(value);
}

function timestampBuildNumber() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ].join("");
}

function readOption(name) {
  const index = argv.indexOf(name);
  if (index < 0) return "";
  return argv[index + 1] || "";
}

async function capture(command, args) {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, env: process.env });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) return reject(new Error(`${command} 被信号 ${signal} 中断`));
      if (code) return reject(new Error(`${command} 退出码 ${code}\n${output.trim()}`));
      resolvePromise(output);
    });
  });
}

async function run(command, args, extraEnv = {}) {
  log(`\n$ ${command} ${args.map(shellQuote).join(" ")}\n`);
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: { ...process.env, ...extraEnv },
      stdio: ["inherit", "pipe", "pipe"],
    });
    child.stdout.on("data", relay);
    child.stderr.on("data", relayError);
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) return reject(new Error(`${command} 被信号 ${signal} 中断`));
      if (code) return reject(new Error(`${command} 退出码 ${code}`));
      resolvePromise();
    });
  });
}

function relay(chunk) {
  const text = chunk.toString();
  try {
    process.stdout.write(text);
  } catch (error) {
    ignoreBrokenPipe(error);
  }
  logStream.write(text);
}

function relayError(chunk) {
  const text = chunk.toString();
  try {
    process.stderr.write(text);
  } catch (error) {
    ignoreBrokenPipe(error);
  }
  logStream.write(text);
}

function log(message) {
  try {
    process.stdout.write(message);
  } catch (error) {
    ignoreBrokenPipe(error);
  }
  logStream.write(message);
}

function ignoreBrokenPipe(error) {
  if (error?.code !== "EPIPE") throw error;
}

function shellQuote(value) {
  return /[\s"']/.test(value) ? JSON.stringify(value) : value;
}

function writeHeader() {
  log("AI Workbench 统一发布\n");
  log("========================================\n");
  log(`目标：${target}\n`);
  log(`模式：${checkOnly ? "仅检查" : upload ? "构建并上传" : "仅构建归档"}\n`);
  log(`版本：${marketingVersion}\n`);
  if (includeIos) log(`iPhone / iPad Build：${iosBuild}\n`);
  if (includeMac) log(`macOS Build：${macBuild}\n`);
  log(`Team：${teamId}\n`);
  log(`日志：${logPath}\n`);
  log("========================================\n");
}

function writeCompletionSummary() {
  const items = [];
  if (iosUploaded) items.push(`iPhone / iPad ${marketingVersion} (${iosBuild}) 已上传`);
  else if (iosArchived) items.push(`iPhone / iPad ${marketingVersion} (${iosBuild}) 已归档但未上传`);
  if (macUploaded) items.push(`macOS ${marketingVersion} (${macBuild}) 已上传`);
  else if (macBuilt) items.push(`macOS ${marketingVersion} (${macBuild}) 已构建但未上传`);
  if (items.length) log(`已完成：${items.join("；")}。\n`);
}

async function finish(code) {
  await new Promise((resolvePromise) => logStream.end(resolvePromise));
  process.exit(code);
}

function fail(message) {
  throw new Error(message);
}

function printUsage() {
  console.log(`
AI Workbench 统一发布

用法：
  node scripts/release-all.mjs --check [--target all|ios|macos]
  node scripts/release-all.mjs --target all|ios|macos [--upload]

参数：
  --check             运行证书、工程和 Web 构建检查，不归档、不上传
  --upload            归档后上传 App Store Connect
  --target            all（默认）、ios 或 macos
  --version           覆盖 Marketing Version
  --ios-build         覆盖 iOS Build
  --mac-build         覆盖 macOS Build
`);
}
