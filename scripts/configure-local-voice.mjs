import { chmod, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const envPath = resolve(".env.local");
const apiKey = String(
  process.env.AIWB_DASHSCOPE_API_KEY || process.env.PISEN_DASHSCOPE_API_KEY || "",
).trim();
const workspaceId = String(
  process.env.AIWB_DASHSCOPE_WORKSPACE_ID ||
    process.env.PISEN_DASHSCOPE_WORKSPACE_ID ||
    "llm-0hn2qaqnqgcdfnbg",
).trim();

if (!apiKey) {
  console.error(
    "Missing AIWB_DASHSCOPE_API_KEY. Pass it only for this command; it will be stored in ignored .env.local.",
  );
  process.exit(1);
}

let current = "";
try {
  current = await readFile(envPath, "utf8");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const values = new Map();
for (const line of current.split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (match) values.set(match[1], match[2]);
}

values.set("VITE_AIWB_DASHSCOPE_API_KEY", apiKey);
values.set("VITE_AIWB_DASHSCOPE_WORKSPACE_ID", workspaceId);

const output = `${[...values.entries()].map(([key, value]) => `${key}=${value}`).join("\n")}\n`;
await writeFile(envPath, output, { mode: 0o600 });
await chmod(envPath, 0o600);

console.log("Local voice build configuration is ready in .env.local.");
