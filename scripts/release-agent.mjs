import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { latestWorkbenchAgentVersion, workbenchAgentGithubRawBaseUrl } from "../src/core/agent.js";

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

function git(args, options = {}) {
  const output = execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.stdio || "pipe",
  });
  return typeof output === "string" ? output.trim() : "";
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

git(["add", "agent/latest.json", "agent/windows-latest.json", `agent/v${version}`]);
const allowedStagedPaths = new Set([
  "agent/latest.json",
  "agent/windows-latest.json",
  `agent/v${version}/aiwbctl`,
  `agent/v${version}/aiwb-agent.mjs`,
  `agent/v${version}/aiwb-agent-http.mjs`,
  `agent/v${version}/aiwb-agent-updater.mjs`,
  `agent/v${version}/manifest.json`,
  `agent/v${version}/windows-manifest.json`,
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

console.log(`Published AI Workbench Agent v${version} to GitHub cloud.`);
console.log(`Manifest: ${manifestUrl}`);
console.log(`Windows manifest: ${windowsManifestUrl}`);
