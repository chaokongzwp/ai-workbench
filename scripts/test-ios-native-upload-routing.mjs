import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const controllerSource = readFileSync(new URL("../src/app/useWorkbenchController.jsx", import.meta.url), "utf8");
const foundationSource = readFileSync(new URL("../src/core/foundation.js", import.meta.url), "utf8");

assert.match(
  controllerSource,
  /const result = await agentDirectUpload\(current, attachment,/,
  "every platform must use the Agent binary upload route",
);
const uploadStart = controllerSource.indexOf("async function uploadImageAttachmentsForProfile");
const uploadEnd = controllerSource.indexOf("async function routeUserIntent", uploadStart);
const uploadSource = controllerSource.slice(uploadStart, uploadEnd);
assert.doesNotMatch(uploadSource, /SSHWorkbench\.uploadFile|buildRemoteImageUploadCommand|runRemoteCommandForProfile/);
assert.match(uploadSource, /const current = await ensureAgentBinaryUploadProfile\(targetProfile, serverId\)/);
assert.match(uploadSource, /attachments\.filter\(agentUploadAttachmentReady\)/);
assert.match(uploadSource, /workdir: current\.workdir/);

const ensureStart = controllerSource.indexOf("async function ensureAgentBinaryUploadProfile");
const ensureEnd = controllerSource.indexOf("async function uploadImageAttachmentsForProfile", ensureStart);
const ensureSource = controllerSource.slice(ensureStart, ensureEnd);
assert.ok(ensureStart >= 0 && ensureEnd > ensureStart, "binary upload preflight must exist");
assert.match(ensureSource, /agentDirectConfig\(current\)\.enabled/);
assert.match(ensureSource, /agentDirectRequest\(current, "\/v1\/health"/);
assert.match(ensureSource, /verifiedAgentDirectHealth\(health, \["binary-upload-v1"\]\)/);
assert.match(ensureSource, /bootstrapAgentDirectProfile\(current,/);
assert.match(ensureSource, /ensureWorkbenchAgentForProfile\(current,/);
assert.match(ensureSource, /reason: "upload-retry"/);
assert.match(ensureSource, /isSshTransportUnavailableError\(error\)/);
assert.match(ensureSource, /assertUploadBootstrapNotCancelled\(serverId\)/);
assert.ok(
  uploadSource.indexOf("ensureAgentBinaryUploadProfile") < uploadSource.indexOf("agentDirectUpload"),
  "a first-message attachment must bootstrap and verify the secure upload route before upload",
);

const sendStart = controllerSource.indexOf("async function sendTask");
const sendEnd = controllerSource.indexOf("async function startVoiceInput", sendStart);
const sendSource = controllerSource.slice(sendStart, sendEnd);
const uploadAwait = sendSource.indexOf("uploadedImages = await uploadImageAttachmentsForProfile");
const removeUploaded = sendSource.indexOf("removeUploadedImageAttachments(pendingFiles, serverId)");
assert.ok(uploadAwait >= 0 && removeUploaded > uploadAwait, "attachments must only be removed after every upload succeeds");
assert.match(
  sendSource.slice(uploadAwait, removeUploaded),
  /currentProfile = withKnownPassword\(sourceServer\.profile \|\| currentProfile\)/,
  "task creation must reuse the direct profile persisted by upload preflight",
);
assert.match(
  sendSource,
  /catch \(error\) \{\s*const message = shortError\(error\);\s*uploadedFileCount = Math\.max\(/,
  "the send failure path should report files that completed before a later upload failed",
);
assert.equal(
  sendSource.slice(0, uploadAwait).includes("clearImageAttachments()"),
  false,
  "send must retain attachments while upload is pending or when upload fails",
);

assert.match(controllerSource, /SSHWorkbench\.addListener\(["']uploadProgress["']/);
assert.match(controllerSource, /cancelAgentDirectUpload\(activeUpload\.uploadId\)/);
assert.match(controllerSource, /cancelledUploadBootstrapServerIdsRef\.current\.add\(serverId\)/);
assert.match(controllerSource, /cancelledUploadBootstrapServerIdsRef\.current\.delete\(serverId\)/);
assert.match(controllerSource, /error\.code = "AIWB_UPLOAD_CANCELLED"/);
assert.match(foundationSource, /async agentUpload\(payload\)/);
assert.match(foundationSource, /async pickAttachments\(payload = \{\}\)/);
assert.match(foundationSource, /async releaseAttachment\(payload = \{\}\)/);
assert.match(foundationSource, /async cancelAgentUpload\(payload\)/);

console.log("Agent binary upload routing tests passed");
