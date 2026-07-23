import { createHash } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  latestWorkbenchAgentVersion,
  workbenchAgentGithubRawBaseUrl,
  workbenchAgentScript,
} from "../src/core/agent.js";
import { windowsWorkbenchAgentScript } from "../src/core/windowsAgent.js";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const version = String(process.env.AIWB_AGENT_VERSION || latestWorkbenchAgentVersion).trim();
const scriptKey = `agent/v${version}/aiwbctl`;
const scriptPath = join(repoRoot, scriptKey);
const manifestPath = join(repoRoot, "agent/latest.json");
const versionManifestPath = join(repoRoot, `agent/v${version}/manifest.json`);
const script = workbenchAgentScript();
const sha256 = createHash("sha256").update(script, "utf8").digest("hex");
const windowsScriptKey = `agent/v${version}/aiwb-agent.mjs`;
const windowsScriptPath = join(repoRoot, windowsScriptKey);
const windowsManifestPath = join(repoRoot, "agent/windows-latest.json");
const windowsVersionManifestPath = join(repoRoot, `agent/v${version}/windows-manifest.json`);
const windowsScript = windowsWorkbenchAgentScript(version);
const windowsSha256 = createHash("sha256").update(windowsScript, "utf8").digest("hex");
const manifest = {
  kind: "ai-workbench-agent",
  version,
  scriptUrl: `${workbenchAgentGithubRawBaseUrl}/${scriptKey}`,
  scriptKey,
  sha256,
  runtime: "linux-shell",
  source: "github",
  publishedAt: new Date().toISOString(),
};

await mkdir(dirname(scriptPath), { recursive: true });
await mkdir(dirname(manifestPath), { recursive: true });
await writeFile(scriptPath, script, "utf8");
await chmod(scriptPath, 0o755);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await writeFile(versionManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const windowsManifest = {
  kind: "ai-workbench-agent",
  platform: "windows",
  version,
  scriptUrl: `${workbenchAgentGithubRawBaseUrl}/${windowsScriptKey}`,
  scriptKey: windowsScriptKey,
  sha256: windowsSha256,
  runtime: "windows-node",
  source: "github",
  publishedAt: manifest.publishedAt,
};
await writeFile(windowsScriptPath, windowsScript, "utf8");
await writeFile(windowsManifestPath, `${JSON.stringify(windowsManifest, null, 2)}\n`, "utf8");
await writeFile(windowsVersionManifestPath, `${JSON.stringify(windowsManifest, null, 2)}\n`, "utf8");

console.log(`Exported AI Workbench Agent v${version}`);
console.log(`Script: ${scriptKey}`);
console.log(`Manifest: agent/latest.json`);
console.log(`Windows script: ${windowsScriptKey}`);
console.log(`Windows manifest: agent/windows-latest.json`);
