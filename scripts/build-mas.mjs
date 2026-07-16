#!/usr/bin/env node
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const target = process.argv[2] || "mas";
const arch = process.env.AIWB_MAC_ARCH || process.argv[3] || "arm64";
const supportedTargets = new Set(["mas", "mas-dev"]);
const supportedArch = new Set(["arm64", "x64", "universal"]);

if (!supportedTargets.has(target)) {
  console.error(`Unknown MAS target: ${target}. Use "mas" or "mas-dev".`);
  process.exit(1);
}

if (!supportedArch.has(arch)) {
  console.error(`Unknown Mac arch: ${arch}. Use arm64, x64, or universal.`);
  process.exit(1);
}

const profile =
  process.env.AIWB_MAS_PROFILE ||
  process.env.AIWB_MAC_PROVISIONING_PROFILE ||
  process.env.MAS_PROVISIONING_PROFILE ||
  "";
const buildNumber =
  process.env.AIWB_MAC_BUILD_NUMBER ||
  process.env.BUILD_NUMBER ||
  new Date().toISOString().replace(/\D/g, "").slice(0, 12);

const args = [resolve("node_modules/electron-builder/cli.js"), "--mac", target, `--${arch}`];
const targetConfigKey = target === "mas-dev" ? "masDev" : "mas";

args.push(`--config.mac.bundleVersion=${buildNumber}`);
args.push(`--config.${targetConfigKey}.bundleVersion=${buildNumber}`);

if (profile) {
  const profilePath = resolve(profile);
  if (!existsSync(profilePath)) {
    console.error(`MAS provisioning profile not found: ${profilePath}`);
    process.exit(1);
  }
  args.push(`--config.${targetConfigKey}.provisioningProfile=${profilePath}`);
}

if (target === "mas-dev" && !profile) {
  console.warn(
    "MAS dev build usually needs a macOS development provisioning profile. Set AIWB_MAS_PROFILE=/path/to/profile.provisionprofile if signing fails.",
  );
}

if (target === "mas" && process.env.AIWB_SKIP_MAS_PREFLIGHT !== "1") {
  const identities = execFileSync("security", ["find-identity", "-v"], { encoding: "utf8" });
  const hasAppIdentity = /Apple Distribution:|3rd Party Mac Developer Application:/.test(identities);
  const hasInstallerIdentity = /3rd Party Mac Developer Installer:/.test(identities);

  if (!hasAppIdentity || !hasInstallerIdentity) {
    console.error("Mac App Store signing prerequisites are incomplete.");
    if (!hasAppIdentity) {
      console.error("- Missing app signing identity: Apple Distribution or 3rd Party Mac Developer Application.");
    }
    if (!hasInstallerIdentity) {
      console.error("- Missing installer identity: 3rd Party Mac Developer Installer.");
      console.error("  Create/install it from Xcode > Settings > Accounts > Manage Certificates > + > Mac Installer Distribution.");
    }
    console.error("After installing the certificate, run npm run mac:mas again.");
    console.error("Set AIWB_SKIP_MAS_PREFLIGHT=1 only if you intentionally want electron-builder to attempt signing anyway.");
    process.exit(1);
  }
}

console.log(`Building AI Workbench for ${target} (${arch}), build ${buildNumber}...`);
const child = spawn(process.execPath, args, {
  stdio: "inherit",
  env: {
    ...process.env,
    ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || "https://npmmirror.com/mirrors/electron/",
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`electron-builder stopped by signal ${signal}.`);
    process.exit(1);
  }
  process.exit(code || 0);
});
