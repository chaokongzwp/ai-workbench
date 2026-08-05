import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  latestWorkbenchAgentVersion,
  workbenchAgentControlEndpoint,
  workbenchAgentScript,
} from "../src/core/agent.js";
import { windowsWorkbenchAgentScript } from "../src/core/windowsAgent.js";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const version = String(process.env.AIWB_AGENT_VERSION || latestWorkbenchAgentVersion).trim();
if (version !== latestWorkbenchAgentVersion) {
  throw new Error(
    `AIWB_AGENT_VERSION=${version} 与源码 Agent v${latestWorkbenchAgentVersion} 不一致；请先提升源码版本，禁止伪造清单版本。`,
  );
}
const releaseRoot = join(repoRoot, "agent", `v${version}`);
const hostedReleaseUrl = `${workbenchAgentControlEndpoint}/releases/v${encodeURIComponent(version)}`;

const linuxEntryName = "aiwbctl-linux";
const macosEntryName = "aiwbctl-macos";
const windowsEntryName = "aiwb-agent-windows.mjs";
const directRuntimeName = "aiwb-agent-http.mjs";
const updaterRuntimeName = "aiwb-agent-updater.mjs";

const unixScript = workbenchAgentScript();
const unixBytes = Buffer.from(unixScript, "utf8");
const unixSha256 = createHash("sha256").update(unixBytes).digest("hex");
const windowsScript = windowsWorkbenchAgentScript(version);
const windowsBytes = Buffer.from(windowsScript, "utf8");
const windowsSha256 = createHash("sha256").update(windowsBytes).digest("hex");

await mkdir(releaseRoot, { recursive: true });
await Promise.all([
  writeFile(join(releaseRoot, linuxEntryName), unixBytes),
  writeFile(join(releaseRoot, macosEntryName), unixBytes),
  writeFile(join(releaseRoot, windowsEntryName), windowsBytes),
  copyFile(join(repoRoot, "agent", "runtime", directRuntimeName), join(releaseRoot, directRuntimeName)),
  copyFile(join(repoRoot, "agent", "runtime", updaterRuntimeName), join(releaseRoot, updaterRuntimeName)),
]);
await Promise.all([
  chmod(join(releaseRoot, linuxEntryName), 0o755),
  chmod(join(releaseRoot, macosEntryName), 0o755),
]);

const directRuntime = await readFile(join(releaseRoot, directRuntimeName));
const updaterRuntime = await readFile(join(releaseRoot, updaterRuntimeName));
const directRuntimeSha256 = createHash("sha256").update(directRuntime).digest("hex");
const updaterRuntimeSha256 = createHash("sha256").update(updaterRuntime).digest("hex");
let publishedAt = String(process.env.SOURCE_DATE_EPOCH || "").trim()
  ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString()
  : "";
if (!publishedAt) {
  try {
    const existing = JSON.parse(await readFile(join(releaseRoot, "linux-manifest.json"), "utf8"));
    const sameGeneration =
      existing?.version === version
      && existing?.sha256 === unixSha256
      && existing?.directRuntime?.sha256 === directRuntimeSha256
      && existing?.updaterRuntime?.sha256 === updaterRuntimeSha256;
    if (sameGeneration) publishedAt = String(existing?.publishedAt || "").trim();
  } catch {}
}
if (!publishedAt) publishedAt = new Date().toISOString();
const sharedRuntime = {
  directRuntime: {
    url: `${hostedReleaseUrl}/common/${directRuntimeName}`,
    sha256: directRuntimeSha256,
  },
  updaterRuntime: {
    url: `${hostedReleaseUrl}/common/${updaterRuntimeName}`,
    sha256: updaterRuntimeSha256,
  },
};

function manifest({ platform, hostedEntryName, sha256, runtime }) {
  return {
    kind: "ai-workbench-agent",
    platform,
    version,
    scriptUrl: `${hostedReleaseUrl}/${platform}/${hostedEntryName}`,
    scriptKey: `agent/v${version}/${platform}/${hostedEntryName}`,
    sha256,
    runtime,
    source: "config-center",
    publishedAt,
    ...sharedRuntime,
  };
}

const manifests = {
  linux: manifest({
    platform: "linux",
    hostedEntryName: "aiwbctl",
    sha256: unixSha256,
    runtime: "linux-shell",
  }),
  macos: manifest({
    platform: "macos",
    hostedEntryName: "aiwbctl",
    sha256: unixSha256,
    runtime: "macos-shell",
  }),
  windows: manifest({
    platform: "windows",
    hostedEntryName: "aiwb-agent.mjs",
    sha256: windowsSha256,
    runtime: "windows-node",
  }),
};

await Promise.all([
  writeFile(join(repoRoot, "agent", "latest.json"), `${JSON.stringify(manifests.linux, null, 2)}\n`, "utf8"),
  writeFile(join(repoRoot, "agent", "macos-latest.json"), `${JSON.stringify(manifests.macos, null, 2)}\n`, "utf8"),
  writeFile(join(repoRoot, "agent", "windows-latest.json"), `${JSON.stringify(manifests.windows, null, 2)}\n`, "utf8"),
  writeFile(join(releaseRoot, "linux-manifest.json"), `${JSON.stringify(manifests.linux, null, 2)}\n`, "utf8"),
  // Keep manifest.json as the legacy Linux pointer consumed by v52 updaters.
  writeFile(join(releaseRoot, "manifest.json"), `${JSON.stringify(manifests.linux, null, 2)}\n`, "utf8"),
  writeFile(join(releaseRoot, "macos-manifest.json"), `${JSON.stringify(manifests.macos, null, 2)}\n`, "utf8"),
  writeFile(join(releaseRoot, "windows-manifest.json"), `${JSON.stringify(manifests.windows, null, 2)}\n`, "utf8"),
]);

console.log(`Exported AI Workbench Agent v${version} for linux, macos, and windows.`);
