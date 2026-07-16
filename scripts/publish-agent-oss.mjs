import { createHash, createHmac } from "node:crypto";

import {
  latestWorkbenchAgentVersion,
  workbenchAgentOssBucket,
  workbenchAgentOssEndpoint,
  workbenchAgentScript,
} from "../src/core/agent.js";

const accessKeyId = String(process.env.ALIYUN_ACCESS_KEY_ID || "").trim();
const accessKeySecret = String(process.env.ALIYUN_ACCESS_KEY_SECRET || "").trim();
const bucket = String(process.env.AIWB_OSS_BUCKET || workbenchAgentOssBucket).trim();
const endpoint = String(process.env.AIWB_OSS_ENDPOINT || workbenchAgentOssEndpoint).trim();
const version = String(process.env.AIWB_AGENT_VERSION || latestWorkbenchAgentVersion).trim();
const signedUrlExpiresAt = Number(process.env.AIWB_OSS_SIGNED_EXPIRES || "4102444800") || 4102444800;

if (!accessKeyId || !accessKeySecret) {
  throw new Error("Missing ALIYUN_ACCESS_KEY_ID or ALIYUN_ACCESS_KEY_SECRET.");
}

if (!bucket || !endpoint || !version) {
  throw new Error("Missing AI Workbench OSS publish configuration.");
}

const host = `${bucket}.${endpoint}`;
const baseUrl = `https://${host}`;

function objectUrl(key) {
  return `${baseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function canonicalizedOssHeaders(headers) {
  return Object.entries(headers)
    .map(([name, value]) => [name.toLowerCase(), String(value).trim().replace(/\s+/g, " ")])
    .filter(([name]) => name.startsWith("x-oss-"))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}:${value}\n`)
    .join("");
}

function canonicalizedResource(key = "", query = "") {
  const resourceKey = key ? `/${key}` : "/";
  return `/${bucket}${resourceKey}${query ? `?${query}` : ""}`;
}

function authorization({ method, key = "", query = "", headers, contentType = "", contentMd5 = "" }) {
  const stringToSign =
    `${method}\n${contentMd5}\n${contentType}\n${headers.Date}\n` +
    canonicalizedOssHeaders(headers) +
    canonicalizedResource(key, query);
  const signature = createHmac("sha1", accessKeySecret).update(stringToSign).digest("base64");
  return `OSS ${accessKeyId}:${signature}`;
}

function signedGetUrl(key) {
  const stringToSign = `GET\n\n\n${signedUrlExpiresAt}\n${canonicalizedResource(key)}`;
  const signature = createHmac("sha1", accessKeySecret).update(stringToSign).digest("base64");
  const query = new URLSearchParams({
    OSSAccessKeyId: accessKeyId,
    Expires: String(signedUrlExpiresAt),
    Signature: signature,
  });
  return `${objectUrl(key)}?${query.toString()}`;
}

async function ossRequest({ method, key = "", query = "", body, contentType = "", headers = {}, allowConflict = false }) {
  const date = new Date().toUTCString();
  const requestHeaders = {
    Date: date,
    ...headers,
  };
  if (contentType) requestHeaders["Content-Type"] = contentType;
  requestHeaders.Authorization = authorization({
    method,
    key,
    query,
    headers: requestHeaders,
    contentType,
  });

  const url = `${objectUrl(key)}${query ? `?${query}` : ""}`;
  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body,
  });
  const text = await response.text();
  if (!response.ok) {
    if (allowConflict && response.status === 409 && /BucketAlreadyOwnedByYou/i.test(text)) {
      return { ok: true, status: response.status, text };
    }
    const detail = text.replace(/\s+/g, " ").trim();
    throw new Error(`OSS ${method} ${key || "/"} failed with ${response.status}: ${detail}`);
  }
  return { ok: true, status: response.status, text };
}

async function ensureBucket() {
  await ossRequest({
    method: "PUT",
    headers: {
      "x-oss-acl": "private",
    },
    allowConflict: true,
  });
}

async function putObject(key, body, contentType) {
  await ossRequest({
    method: "PUT",
    key,
    body,
    contentType,
  });
}

async function verifySignedObject(key) {
  const response = await fetch(signedGetUrl(key), { method: "GET" });
  if (!response.ok) {
    throw new Error(`Signed read verification failed for ${key}: ${response.status}`);
  }
  return response.text();
}

const script = workbenchAgentScript();
const scriptBuffer = Buffer.from(script, "utf8");
const sha256 = createHash("sha256").update(scriptBuffer).digest("hex");
const scriptKey = `agent/v${version}/aiwbctl`;
const manifestKey = "agent/latest.json";
const manifest = {
  kind: "ai-workbench-agent",
  version,
  scriptUrl: signedGetUrl(scriptKey),
  scriptKey,
  sha256,
  runtime: "linux-shell",
  publishedAt: new Date().toISOString(),
};

await ensureBucket();
await putObject(scriptKey, scriptBuffer, "text/x-shellscript; charset=utf-8");
await putObject(`agent/v${version}/manifest.json`, JSON.stringify(manifest, null, 2), "application/json; charset=utf-8");
await putObject(manifestKey, JSON.stringify(manifest, null, 2), "application/json; charset=utf-8");

const verifiedManifestText = await verifySignedObject(manifestKey);
const verifiedManifest = JSON.parse(verifiedManifestText);
if (verifiedManifest.sha256 !== sha256 || verifiedManifest.version !== version) {
  throw new Error("OSS manifest verification returned unexpected content.");
}
await verifySignedObject(scriptKey);

console.log(`Published AI Workbench Agent v${version}`);
console.log(`Bucket: ${bucket}`);
console.log(`Manifest signed URL: ${signedGetUrl(manifestKey)}`);
console.log(`Script signed URL: ${signedGetUrl(scriptKey)}`);
