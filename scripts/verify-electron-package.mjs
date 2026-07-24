#!/usr/bin/env node
import { listPackage } from "@electron/asar";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const appPath = resolve(process.argv[2] || "");
const asarPath = resolve(appPath, "Contents", "Resources", "app.asar");

if (!appPath || !existsSync(asarPath)) {
  console.error(`Electron package is missing app.asar: ${asarPath}`);
  process.exit(1);
}

const packagedFiles = new Set(listPackage(asarPath));
const requiredFiles = [
  "/dist/index.html",
  "/electron/main.mjs",
  "/electron/preload.cjs",
  "/src/core/messageLifecycle.js",
];
const missingFiles = requiredFiles.filter((file) => !packagedFiles.has(file));

if (missingFiles.length) {
  console.error("Electron package is incomplete:");
  for (const file of missingFiles) console.error(`- missing ${file}`);
  process.exit(1);
}

console.log(`Verified Electron package contents: ${appPath}`);
