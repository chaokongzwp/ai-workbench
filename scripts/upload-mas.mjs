#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createSign } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

function collectPkgFiles(dir, files = []) {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }

  for (const entry of entries) {
    const file = join(dir, entry);
    const stat = statSync(file);
    if (stat.isDirectory()) {
      collectPkgFiles(file, files);
    } else if (file.endsWith(".pkg")) {
      files.push({ file, mtimeMs: stat.mtimeMs });
    }
  }
  return files;
}

const validateCredentialsOnly = process.argv.includes("--validate-credentials");
const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const pkg = validateCredentialsOnly
  ? ""
  : positionalArgs[0] ||
    collectPkgFiles(resolve("build/mac"))
      .sort((left, right) => right.mtimeMs - left.mtimeMs)
      .at(0)?.file;

if (!validateCredentialsOnly && !pkg) {
  console.error("No MAS .pkg found under build/mac. Run npm run mac:mas first.");
  process.exit(1);
}

function findDefaultApiKey() {
  const candidates = [
    resolve("private_keys"),
    join(homedir(), "private_keys"),
    join(homedir(), ".private_keys"),
    join(homedir(), ".appstoreconnect/private_keys"),
  ];

  for (const dir of candidates) {
    if (!existsSync(dir)) {
      continue;
    }
    const keys = readdirSync(dir)
      .filter((entry) => /^AuthKey_[A-Z0-9]+\.p8$/.test(entry))
      .map((entry) => join(dir, entry));
    if (keys.length === 1) {
      const match = /AuthKey_([A-Z0-9]+)\.p8$/.exec(keys[0]);
      return match ? { key: match[1], path: keys[0] } : null;
    }
  }
  return null;
}

function loadProfile() {
  const profileName = process.env.ASC_PROFILE || process.env.APPLE_CONNECT_PROFILE;
  if (!profileName) {
    return {};
  }

  const profileFile =
    process.env.ASC_PROFILE_FILE ||
    process.env.APPLE_CONNECT_PROFILE_FILE ||
    join(homedir(), ".appstoreconnect/ai-workbench-profiles.json");

  if (!existsSync(profileFile)) {
    console.error(`ASC profile "${profileName}" requested, but profile file does not exist: ${profileFile}`);
    process.exit(1);
  }

  const profiles = JSON.parse(readFileSync(profileFile, "utf8"));
  const profile = profiles[profileName];
  if (!profile) {
    console.error(`ASC profile "${profileName}" not found in ${profileFile}.`);
    console.error(`Available profiles: ${Object.keys(profiles).join(", ") || "(none)"}`);
    process.exit(1);
  }

  console.log(`Using App Store Connect profile: ${profileName}`);
  return profile;
}

const profile = loadProfile();
const defaultApiKey = findDefaultApiKey();
const apiKey = process.env.ASC_API_KEY || process.env.APPLE_API_KEY || profile.apiKey || defaultApiKey?.key;
const apiIssuer = process.env.ASC_API_ISSUER || process.env.APPLE_API_ISSUER || profile.apiIssuer;
const apiKeyPath =
  process.env.ASC_API_KEY_PATH || process.env.APPLE_API_KEY_PATH || profile.apiKeyPath || defaultApiKey?.path;
const username = process.env.ASC_USERNAME || process.env.APPLE_ID;
const password = process.env.ASC_PASSWORD || process.env.APP_SPECIFIC_PASSWORD;
const provider = process.env.ASC_PROVIDER || profile.provider;

if (validateCredentialsOnly && apiKey && apiIssuer) {
  await validateApiCredentials({ apiKey, apiIssuer, apiKeyPath });
  process.exit(0);
}

const args = validateCredentialsOnly
  ? ["altool", "--list-providers"]
  : ["altool", "--upload-app", "--type", "macos", "--file", pkg];

if (apiKey && apiIssuer) {
  args.push("--api-key", apiKey, "--api-issuer", apiIssuer);
  if (apiKeyPath) {
    args.push("--p8-file-path", apiKeyPath);
  }
} else if (username && password) {
  args.push("--username", username, "--password", password);
} else {
  if (apiKey && !apiIssuer) {
    console.error(`Found App Store Connect API key ${apiKey}, but missing ASC_API_ISSUER.`);
    console.error("Set ASC_API_ISSUER to the Issuer ID from App Store Connect > Users and Access > Integrations.");
  } else {
    console.error(
      "Missing App Store Connect credentials. Set ASC_API_KEY + ASC_API_ISSUER, or APPLE_ID + APP_SPECIFIC_PASSWORD.",
    );
  }
  process.exit(1);
}

if (provider) {
  args.push("--asc-provider", provider);
}

console.log(validateCredentialsOnly ? "Validating App Store Connect credentials..." : `Uploading MAS package: ${pkg}`);
const child = spawn("xcrun", args, { stdio: "inherit" });

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`xcrun altool stopped by signal ${signal}.`);
    process.exit(1);
  }
  process.exit(code || 0);
});

async function validateApiCredentials({ apiKey: keyId, apiIssuer: issuerId, apiKeyPath: keyPath }) {
  if (!keyPath || !existsSync(keyPath)) {
    console.error(`App Store Connect API private key does not exist: ${keyPath || "(missing path)"}`);
    process.exit(1);
  }

  const now = Math.floor(Date.now() / 1000);
  const header = encodeJson({ alg: "ES256", kid: keyId, typ: "JWT" });
  const payload = encodeJson({ iss: issuerId, iat: now - 10, exp: now + 600, aud: "appstoreconnect-v1" });
  const unsignedToken = `${header}.${payload}`;
  const signer = createSign("SHA256");
  signer.update(unsignedToken);
  signer.end();
  const signature = signer.sign({ key: readFileSync(keyPath, "utf8"), dsaEncoding: "ieee-p1363" }).toString("base64url");
  const response = await fetch("https://api.appstoreconnect.apple.com/v1/apps?limit=1", {
    headers: { Authorization: `Bearer ${unsignedToken}.${signature}` },
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error(`App Store Connect credential validation failed (${response.status}).`);
    console.error(detail);
    process.exit(1);
  }

  console.log(`App Store Connect API credentials are valid (${keyId}).`);
}

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
