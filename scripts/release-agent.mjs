import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  latestWorkbenchAgentVersion,
  workbenchAgentControlEndpoint,
  workbenchAgentGithubRawBaseUrl,
} from "../src/core/agent.js";

const repoRoot = join(fileURLToPath(new URL("..", import.meta.url)));
const version = String(process.env.AIWB_AGENT_VERSION || latestWorkbenchAgentVersion).trim();
const manifestPath = join(repoRoot, "agent", "latest.json");
const scriptPath = join(repoRoot, "agent", `v${version}`, "aiwbctl");
const windowsManifestPath = join(repoRoot, "agent", "windows-latest.json");
const windowsScriptPath = join(repoRoot, "agent", `v${version}`, "aiwb-agent.mjs");
const directRuntimePath = join(repoRoot, "agent", `v${version}`, "aiwb-agent-http.mjs");
const updaterRuntimePath = join(repoRoot, "agent", `v${version}`, "aiwb-agent-updater.mjs");
const remote = String(process.env.AIWB_AGENT_GIT_REMOTE || "origin").trim();
const branch = String(process.env.AIWB_AGENT_GIT_BRANCH || "main").trim();
const controlEndpoint = String(process.env.AIWB_AGENT_CONTROL_ENDPOINT || workbenchAgentControlEndpoint).replace(/\/+$/, "");
const agentControlKeychainService = "com.beexofficial.aiworkbench.agent-control-admin";

function git(args, options = {}) {
  const output = execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.stdio || "pipe",
  });
  return typeof output === "string" ? output.trim() : "";
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

execFileSync(process.execPath, ["scripts/export-agent-github.mjs"], {
  cwd: repoRoot,
  stdio: "inherit",
});

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const script = await readFile(scriptPath);
const sha256 = createHash("sha256").update(script).digest("hex");
if (manifest.version !== version || manifest.sha256 !== sha256) {
  throw new Error("Generated Agent manifest does not match the published script.");
}
const windowsManifest = JSON.parse(await readFile(windowsManifestPath, "utf8"));
const windowsScript = await readFile(windowsScriptPath);
const windowsSha256 = createHash("sha256").update(windowsScript).digest("hex");
if (windowsManifest.version !== version || windowsManifest.sha256 !== windowsSha256) {
  throw new Error("Generated Windows Agent manifest does not match the published script.");
}
for (const [runtime, path] of [[manifest.directRuntime, directRuntimePath], [manifest.updaterRuntime, updaterRuntimePath]]) {
  const file = await readFile(path);
  const runtimeSha256 = createHash("sha256").update(file).digest("hex");
  if (!runtime?.url || runtime.sha256 !== runtimeSha256) {
    throw new Error(`Generated Agent runtime manifest does not match ${path}.`);
  }
}

const releaseSourcePaths = [
  "agent/README.md",
  "agent/runtime/aiwb-agent-http.mjs",
  "agent/runtime/aiwb-agent-updater.mjs",
  "scripts/export-agent-github.mjs",
  "scripts/release-agent.mjs",
  "src/core/agent.js",
  "src/core/windowsAgent.js",
];
git(["add", "agent/latest.json", "agent/windows-latest.json", `agent/v${version}`, ...releaseSourcePaths]);
const allowedStagedPaths = new Set([
  "agent/latest.json",
  "agent/windows-latest.json",
  `agent/v${version}/aiwbctl`,
  `agent/v${version}/aiwb-agent.mjs`,
  `agent/v${version}/aiwb-agent-http.mjs`,
  `agent/v${version}/aiwb-agent-updater.mjs`,
  `agent/v${version}/manifest.json`,
  `agent/v${version}/windows-manifest.json`,
  ...releaseSourcePaths,
]);
const unexpectedStagedPaths = git(["diff", "--cached", "--name-only"])
  .split(/\r?\n/)
  .map((path) => path.trim())
  .filter(Boolean)
  .filter((path) => !allowedStagedPaths.has(path));
if (unexpectedStagedPaths.length) {
  throw new Error(
    `Refusing to publish Agent because unrelated files are already staged: ${unexpectedStagedPaths.join(", ")}`,
  );
}
try {
  git(["diff", "--cached", "--quiet"]);
  console.log(`AI Workbench Agent v${version} is already staged and unchanged.`);
} catch {
  git(["commit", "-m", `Release AI Workbench Agent v${version}`], { stdio: "inherit" });
}

git(["push", remote, branch], { stdio: "inherit" });

const manifestUrl = `${workbenchAgentGithubRawBaseUrl}/agent/v${encodeURIComponent(version)}/manifest.json`;
const response = await fetch(manifestUrl, { cache: "no-store" });
if (!response.ok) throw new Error(`Cloud manifest verification failed: HTTP ${response.status}`);
const cloudManifest = await response.json();
if (cloudManifest.version !== version || cloudManifest.sha256 !== sha256) {
  throw new Error(`Cloud manifest verification failed: expected Agent v${version}.`);
}

const windowsManifestUrl = `${workbenchAgentGithubRawBaseUrl}/agent/v${encodeURIComponent(version)}/windows-manifest.json`;
const windowsResponse = await fetch(windowsManifestUrl, { cache: "no-store" });
if (!windowsResponse.ok) throw new Error(`Cloud Windows manifest verification failed: HTTP ${windowsResponse.status}`);
const cloudWindowsManifest = await windowsResponse.json();
if (cloudWindowsManifest.version !== version || cloudWindowsManifest.sha256 !== windowsSha256) {
  throw new Error(`Cloud Windows manifest verification failed: expected Agent v${version}.`);
}

const controlAdminToken = agentControlAdminToken();
if (!controlAdminToken) {
  throw new Error(
    `Agent 已推送到 GitHub，但配置中心尚未收到发布通知。请设置 AIWB_AGENT_CONTROL_ADMIN_TOKEN，` +
    `或将凭证存入 macOS 钥匙串服务 ${agentControlKeychainService}，然后重新运行发布命令。`,
  );
}
const controlPublishResponse = await fetch(`${controlEndpoint}/publish`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${controlAdminToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ version, manifestUrl, windowsManifestUrl }),
});
if (!controlPublishResponse.ok) {
  throw new Error(`配置中心发布通知失败：HTTP ${controlPublishResponse.status}`);
}
const controlLatestResponse = await fetch(`${controlEndpoint}/latest`, { cache: "no-store" });
if (!controlLatestResponse.ok) {
  throw new Error(`配置中心版本验证失败：HTTP ${controlLatestResponse.status}`);
}
const controlLatest = await controlLatestResponse.json();
if (String(controlLatest?.agent?.version || "") !== version) {
  throw new Error(`配置中心版本验证失败：目标版本不是 v${version}。`);
}

console.log(`Published AI Workbench Agent v${version} to GitHub cloud.`);
console.log(`Manifest: ${manifestUrl}`);
console.log(`Windows manifest: ${windowsManifestUrl}`);
console.log(`Agent control target: v${version}`);
