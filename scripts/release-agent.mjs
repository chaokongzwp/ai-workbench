import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  latestWorkbenchAgentVersion,
  workbenchAgentControlEndpoint,
} from "../src/core/agent.js";

const repoRoot = join(fileURLToPath(new URL("..", import.meta.url)));
const version = String(process.env.AIWB_AGENT_VERSION || latestWorkbenchAgentVersion).trim();
const releaseRoot = join(repoRoot, "agent", `v${version}`);
const controlEndpoint = String(process.env.AIWB_AGENT_CONTROL_ENDPOINT || workbenchAgentControlEndpoint).replace(/\/+$/, "");
const agentControlKeychainService = "com.beexofficial.aiworkbench.agent-control-admin";
const minimumControlServiceVersion = 8;

const platformFiles = {
  linux: { manifest: "linux-manifest.json", entry: "aiwbctl-linux" },
  macos: { manifest: "macos-manifest.json", entry: "aiwbctl-macos" },
  windows: { manifest: "windows-manifest.json", entry: "aiwb-agent-windows.mjs" },
};

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function agentControlAdminToken() {
  const environmentToken = String(process.env.AIWB_AGENT_CONTROL_ADMIN_TOKEN || "").trim();
  if (environmentToken) return environmentToken;
  if (process.platform !== "darwin") return "";
  try {
    return execFileSync(
      "security",
      ["find-generic-password", "-s", agentControlKeychainService, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
  } catch {
    return "";
  }
}

async function verifyControlCenterCanHostArtifacts() {
  const response = await fetch(`${controlEndpoint.replace(/\/v1\/agent-control$/, "")}/v1/version`, { cache: "no-store" });
  if (!response.ok) throw new Error(`配置中心发布前检查失败：HTTP ${response.status}`);
  const status = await response.json();
  const serviceVersion = Number(status?.version || 0);
  if (!Number.isFinite(serviceVersion) || serviceVersion < minimumControlServiceVersion) {
    throw new Error(
      `配置中心版本过旧（当前 v${serviceVersion || "未知"}，至少需要 v${minimumControlServiceVersion}），` +
      "请先部署支持三平台 Agent 制品托管的配置中心服务。",
    );
  }
}

await verifyControlCenterCanHostArtifacts();
execFileSync(process.execPath, ["scripts/export-agent-release.mjs"], { cwd: repoRoot, stdio: "inherit" });

const manifests = {};
const entries = {};
for (const [platform, files] of Object.entries(platformFiles)) {
  const manifest = JSON.parse(await readFile(join(releaseRoot, files.manifest), "utf8"));
  const entry = await readFile(join(releaseRoot, files.entry));
  if (manifest.version !== version || manifest.platform !== platform || manifest.sha256 !== sha256(entry)) {
    throw new Error(`生成的 ${platform} Agent 清单与入口文件不一致。`);
  }
  manifests[platform] = manifest;
  entries[platform] = entry;
}
const unixVersionOutput = execFileSync(join(releaseRoot, platformFiles.macos.entry), ["--version"], {
  encoding: "utf8",
}).trim();
const unixReportedVersion =
  unixVersionOutput.match(/__AIWB_AGENT_VERSION__([^\r\n]+)/)?.[1]?.trim()
  || unixVersionOutput.match(/^v?([0-9]+(?:\.[0-9]+)*)$/)?.[1];
if (unixReportedVersion !== version) {
  throw new Error(`POSIX Agent 入口报告 v${unixReportedVersion || "?"}，与清单 v${version} 不一致。`);
}

const directRuntime = await readFile(join(releaseRoot, "aiwb-agent-http.mjs"));
const updaterRuntime = await readFile(join(releaseRoot, "aiwb-agent-updater.mjs"));
const verifiedHostedRuntimeUrls = new Map();
for (const [platform, manifest] of Object.entries(manifests)) {
  if (manifest.directRuntime?.sha256 !== sha256(directRuntime)) {
    throw new Error(`${platform} Agent 的 direct runtime 校验值不一致。`);
  }
  if (manifest.updaterRuntime?.sha256 !== sha256(updaterRuntime)) {
    throw new Error(`${platform} Agent 的 updater runtime 校验值不一致。`);
  }
}

const controlAdminToken = agentControlAdminToken();
if (!controlAdminToken) {
  throw new Error(
    `配置中心尚未收到发布凭证。请设置 AIWB_AGENT_CONTROL_ADMIN_TOKEN，` +
    `或将凭证存入 macOS 钥匙串服务 ${agentControlKeychainService}。`,
  );
}

const publishResponse = await fetch(`${controlEndpoint}/publish`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${controlAdminToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    version,
    manifests,
    artifacts: {
      "linux/aiwbctl": entries.linux.toString("base64"),
      "macos/aiwbctl": entries.macos.toString("base64"),
      "windows/aiwb-agent.mjs": entries.windows.toString("base64"),
      "common/aiwb-agent-http.mjs": directRuntime.toString("base64"),
      "common/aiwb-agent-updater.mjs": updaterRuntime.toString("base64"),
    },
  }),
});
if (!publishResponse.ok) {
  const detail = (await publishResponse.text()).replace(/\s+/g, " ").slice(0, 500);
  throw new Error(`配置中心发布失败：HTTP ${publishResponse.status}${detail ? `（${detail}）` : ""}`);
}

const latestResponse = await fetch(`${controlEndpoint}/latest`, { cache: "no-store" });
if (!latestResponse.ok) throw new Error(`配置中心版本验证失败：HTTP ${latestResponse.status}`);
const latest = await latestResponse.json();
if (String(latest?.agent?.version || "") !== version || latest?.agent?.source !== "config-center") {
  throw new Error(`配置中心版本验证失败：目标不是托管的 Agent v${version}。`);
}

for (const [platform, manifest] of Object.entries(manifests)) {
  const manifestUrl = String(
    latest?.platforms?.[platform]?.manifestUrl
      || latest?.agent?.platforms?.[platform]?.manifestUrl
      || latest?.[`${platform}ManifestUrl`]
      || "",
  );
  if (!manifestUrl.startsWith("https://")) throw new Error(`配置中心没有返回 ${platform} Agent 清单。`);
  const hostedResponse = await fetch(manifestUrl, { cache: "no-store" });
  if (!hostedResponse.ok) throw new Error(`配置中心 ${platform} Agent 清单验证失败：HTTP ${hostedResponse.status}`);
  const hosted = await hostedResponse.json();
  if (
    hosted.version !== version
    || hosted.platform !== platform
    || hosted.sha256 !== manifest.sha256
    || hosted.directRuntime?.sha256 !== manifest.directRuntime?.sha256
    || hosted.updaterRuntime?.sha256 !== manifest.updaterRuntime?.sha256
    || hosted.source !== "config-center"
  ) {
    throw new Error(`配置中心 ${platform} Agent 清单内容不一致。`);
  }
  const entryResponse = await fetch(hosted.scriptUrl, { cache: "no-store" });
  if (!entryResponse.ok || sha256(Buffer.from(await entryResponse.arrayBuffer())) !== manifest.sha256) {
    throw new Error(`配置中心 ${platform} Agent 入口文件校验失败。`);
  }
  for (const [runtimeName, runtime] of [
    ["HTTP runtime", hosted.directRuntime],
    ["updater runtime", hosted.updaterRuntime],
  ]) {
    const runtimeUrl = String(runtime?.url || "");
    const expectedSha256 = String(runtime?.sha256 || "").toLowerCase();
    if (!runtimeUrl.startsWith("https://") || !/^[a-f0-9]{64}$/.test(expectedSha256)) {
      throw new Error(`配置中心 ${platform} Agent 的 ${runtimeName} 清单无效。`);
    }
    const previousSha256 = verifiedHostedRuntimeUrls.get(runtimeUrl);
    if (previousSha256 && previousSha256 !== expectedSha256) {
      throw new Error(`配置中心共享 ${runtimeName} 在不同平台清单中的校验值不一致。`);
    }
    if (previousSha256) continue;
    const runtimeResponse = await fetch(runtimeUrl, { cache: "no-store" });
    if (!runtimeResponse.ok || sha256(Buffer.from(await runtimeResponse.arrayBuffer())) !== expectedSha256) {
      throw new Error(`配置中心 ${platform} Agent 的 ${runtimeName} 下载校验失败。`);
    }
    verifiedHostedRuntimeUrls.set(runtimeUrl, expectedSha256);
  }
}

console.log(`Published AI Workbench Agent v${version} to the configuration center.`);
console.log("Platforms: linux, macos, windows");
