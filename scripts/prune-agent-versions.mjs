import { readdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const agentRoot = join(repoRoot, "agent");
const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const keepArgument = process.argv.slice(2).find((argument) => argument.startsWith("--keep="));
const keepCount = Math.max(1, Number.parseInt(keepArgument?.split("=")[1] || "1", 10) || 1);

async function readManifest(name) {
  return JSON.parse(await readFile(join(agentRoot, name), "utf8"));
}

const [linuxManifest, macosManifest, windowsManifest, entries] = await Promise.all([
  readManifest("latest.json"),
  readManifest("macos-latest.json"),
  readManifest("windows-latest.json"),
  readdir(agentRoot, { withFileTypes: true }),
]);

const linuxVersion = String(linuxManifest.version || "").trim();
const macosVersion = String(macosManifest.version || "").trim();
const windowsVersion = String(windowsManifest.version || "").trim();
if (!linuxVersion || linuxVersion !== macosVersion || linuxVersion !== windowsVersion) {
  throw new Error(
    `Agent manifest versions do not match: Linux=${linuxVersion || "missing"}, macOS=${macosVersion || "missing"}, Windows=${windowsVersion || "missing"}.`,
  );
}

const versions = entries
  .filter((entry) => entry.isDirectory() && /^v\d+$/.test(entry.name))
  .map((entry) => ({
    name: entry.name,
    version: Number.parseInt(entry.name.slice(1), 10),
  }))
  .sort((left, right) => right.version - left.version);
const currentDirectory = `v${linuxVersion}`;
if (!versions.some(({ name }) => name === currentDirectory)) {
  throw new Error(`Current Agent directory is missing: agent/${currentDirectory}`);
}

const protectedDirectories = new Set([
  currentDirectory,
  ...versions.slice(0, keepCount).map(({ name }) => name),
]);
const candidates = versions.filter(({ name }) => !protectedDirectories.has(name));

console.log(`Current Agent: ${currentDirectory}`);
console.log(`Retention: ${keepCount} newest versions plus the current manifest target`);
if (!candidates.length) {
  console.log("No historical Agent directories are eligible for cleanup.");
  process.exit(0);
}

console.log(`${apply ? "Removing" : "Would remove"}: ${candidates.map(({ name }) => name).join(", ")}`);
if (!apply) {
  console.log("Preview only. Run npm run agent:prune:apply to remove these tracked directories.");
  process.exit(0);
}

for (const { name } of candidates) {
  await rm(join(agentRoot, name), { recursive: true, force: false });
}
console.log(`Removed ${candidates.length} historical Agent directories.`);
