import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const controllerSource = readFileSync(new URL("../src/app/useWorkbenchController.jsx", import.meta.url), "utf8");
const foundationSource = readFileSync(new URL("../src/core/foundation.js", import.meta.url), "utf8");

assert.match(
  controllerSource,
  /Capacitor\.isNativePlatform\(\)\s*&&\s*Capacitor\.getPlatform\(\)\s*===\s*["']ios["']/,
  "only a native iOS runtime should select the native SFTP upload route",
);
assert.match(controllerSource, /const result = await SSHWorkbench\.uploadFile\(payload\)/);
assert.match(controllerSource, /remoteDirectory: target\.uploadDir/);
assert.match(controllerSource, /remotePath: target\.path/);
assert.match(controllerSource, /wslDistro: wslDistroFromProfile\(current\)/);
assert.match(controllerSource, /expectedSize,/);
assert.match(controllerSource, /base64,/);

assert.match(
  controllerSource,
  /const command = buildRemoteImageUploadCommand\(targetProfile, attachment, index\);\s*try \{\s*const output = await runRemoteCommandForProfile/,
  "non-iOS runtimes must retain the existing command upload path",
);

const sendStart = controllerSource.indexOf("async function sendTask");
const sendEnd = controllerSource.indexOf("async function startVoiceInput", sendStart);
const sendSource = controllerSource.slice(sendStart, sendEnd);
const uploadAwait = sendSource.indexOf("uploadedImages = await uploadImageAttachmentsForProfile");
const removeUploaded = sendSource.indexOf("removeUploadedImageAttachments(pendingFiles)");
assert.ok(uploadAwait >= 0 && removeUploaded > uploadAwait, "attachments must only be removed after every upload succeeds");
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
assert.match(controllerSource, /SSHWorkbench\.cancelUpload\(\{ uploadId: activeUpload\.uploadId \}\)/);
assert.match(
  controllerSource,
  /stage === ["']connect["']\s*&&\s*retryable === true\s*&&\s*hostIndex < hosts\.length - 1/,
  "alternate hosts must only be tried for an explicitly retryable connect-stage failure",
);
assert.match(foundationSource, /async uploadFile\(payload\)/);
assert.match(foundationSource, /async cancelUpload\(payload\)/);

console.log("iOS native upload routing tests passed");
