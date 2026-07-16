import { createHash } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  latestWorkbenchAgentVersion,
  workbenchAgentGithubRawBaseUrl,
  workbenchAgentScript,
} from "../src/core/agent.js";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const version = String(process.env.AIWB_AGENT_VERSION || latestWorkbenchAgentVersion).trim();
const scriptKey = `agent/v${version}/aiwbctl`;
const scriptPath = join(repoRoot, scriptKey);
const manifestPath = join(repoRoot, "agent/latest.json");
const versionManifestPath = join(repoRoot, `agent/v${version}/manifest.json`);
const script = workbenchAgentScript();
const sha256 = createHash("sha256").update(script, "utf8").digest("hex");
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

console.log(`Exported AI Workbench Agent v${version}`);
console.log(`Script: ${scriptKey}`);
console.log(`Manifest: agent/latest.json`);
