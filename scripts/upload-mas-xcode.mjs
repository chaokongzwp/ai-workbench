#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import plist from "plist";

const appPath = resolve(process.env.AIWB_MAS_APP || "build/mac/mas-arm64/AI Workbench.app");
const uploadRoot = resolve(process.env.AIWB_MAS_UPLOAD_DIR || "build/mac/mas-upload");
const teamId = process.env.AIWB_APPLE_TEAM_ID || "47T37CCFZ2";
const prepareOnly = process.argv.includes("--prepare-only");

if (!existsSync(appPath)) {
  console.error(`MAS app not found: ${appPath}`);
  console.error("Run npm run mac:mas first.");
  process.exit(1);
}

const infoPath = join(appPath, "Contents/Info.plist");
const appInfo = plist.parse(await readFile(infoPath, "utf8"));
const productName = appInfo.CFBundleName || "AI Workbench";
const bundleId = appInfo.CFBundleIdentifier;
const shortVersion = appInfo.CFBundleShortVersionString || "1.0.0";
const buildNumber = appInfo.CFBundleVersion || "1";
const archivePath = join(uploadRoot, `AIWorkbench-${shortVersion}-${buildNumber}.xcarchive`);
const exportPath = join(uploadRoot, "export");
const exportOptionsPath = join(uploadRoot, "ExportOptions.MAS.Upload.plist");

rmSync(archivePath, { recursive: true, force: true });
rmSync(exportPath, { recursive: true, force: true });
await mkdir(join(archivePath, "Products/Applications"), { recursive: true });
await mkdir(join(archivePath, "dSYMs"), { recursive: true });
await mkdir(uploadRoot, { recursive: true });

await run("ditto", [appPath, join(archivePath, `Products/Applications/${basename(appPath)}`)]);

const archiveInfo = {
  ApplicationProperties: {
    ApplicationPath: `Applications/${basename(appPath)}`,
    Architectures: ["arm64"],
    CFBundleIdentifier: bundleId,
    CFBundleShortVersionString: shortVersion,
    CFBundleVersion: buildNumber,
    SigningIdentity: "Apple Distribution: Limpet International Co., Limited (47T37CCFZ2)",
    Team: teamId,
  },
  ArchiveVersion: 2,
  CreationDate: new Date(),
  Name: productName,
  SchemeName: productName,
};

const exportOptions = {
  destination: "upload",
  installerSigningCertificate: "Mac Installer Distribution",
  manageAppVersionAndBuildNumber: false,
  method: "app-store-connect",
  signingCertificate: "Apple Distribution",
  signingStyle: "automatic",
  teamID: teamId,
  uploadSymbols: true,
};

await writeFile(join(archivePath, "Info.plist"), plist.build(archiveInfo));
await writeFile(exportOptionsPath, plist.build(exportOptions));

console.log(`Prepared MAS archive: ${archivePath}`);
console.log(`Prepared export options: ${exportOptionsPath}`);

if (prepareOnly) {
  process.exit(0);
}

await run("xcodebuild", [
  "-exportArchive",
  "-archivePath",
  archivePath,
  "-exportPath",
  exportPath,
  "-exportOptionsPlist",
  exportOptionsPath,
  "-allowProvisioningUpdates",
]);

async function run(command, args) {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} stopped by signal ${signal}`));
        return;
      }
      if (code) {
        reject(new Error(`${command} exited with code ${code}`));
        return;
      }
      resolvePromise();
    });
  });
}
