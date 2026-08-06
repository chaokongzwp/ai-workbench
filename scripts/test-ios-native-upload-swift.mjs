import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const swift = readFileSync(
  new URL("../ios/App/App/SSHWorkbenchPlugin.swift", import.meta.url),
  "utf8",
);

assert.match(swift, /CAPPluginMethod\(name: "uploadFile"/);
assert.match(swift, /CAPPluginMethod\(name: "cancelUpload"/);
assert.match(swift, /@objc func uploadFile\(_ call: CAPPluginCall\)/);
assert.match(swift, /@objc func cancelUpload\(_ call: CAPPluginCall\)/);
assert.match(swift, /notifyListeners\("uploadProgress"/);

const uploadStart = swift.indexOf("private func performNativeUpload(");
const uploadEnd = swift.indexOf("private func decodeUploadBase64", uploadStart);
assert.ok(uploadStart >= 0 && uploadEnd > uploadStart, "native SFTP upload helper must exist");
const upload = swift.slice(uploadStart, uploadEnd);

assert.match(upload, /let connectedClient = try await createSSHClient\(config: config\)/);
assert.match(upload, /guard operation\.attachClient\(connectedClient\)/);
assert.match(upload, /try await connectedClient\.openSFTP\(\)/);
assert.match(upload, /UUID\(\)\.uuidString\.lowercased\(\).*\.part/);
assert.match(upload, /flags: \[\.write, \.create, \.truncate, \.forceCreate\]/);
assert.ok(
  upload.indexOf("partMayExist = true") < upload.indexOf("let file = try await openedSFTP.openFile("),
  "cleanup ownership must be recorded before SFTP OPEN because its response can be lost",
);
assert.match(upload, /let chunkSize = 256 \* 1024/);
assert.match(upload, /try await file\.write\(buffer, at: UInt64\(offset\)\)/);
assert.equal(
  [...upload.matchAll(/getAttributes\(at:/g)].length >= 2,
  true,
  "both temporary and final file sizes must be checked",
);
assert.match(upload, /partAttributes\.size == UInt64\(totalBytes\)/);
assert.match(upload, /try await openedSFTP\.rename\(at: partPath, to: sftpPath\)/);
assert.match(upload, /finalAttributes\.size == UInt64\(totalBytes\)/);
assert.match(upload, /SHA256\.hash\(data: data\)/);
assert.doesNotMatch(upload, /executeWithRetry|executeCommand|EncodedCommand|base64EncodedString/);

assert.match(swift, /SSH_UPLOAD_WSL_UNSUPPORTED/);
assert.match(swift, /let timeoutNanoseconds = UInt64\(config\.commandTimeoutSeconds\)/);
assert.match(swift, /let client = operation\.requestCancellation\(\)/);
assert.match(swift, /self\.rejectUploadCall\(call, failure: failure, uploadId: uploadId\)[\s\S]*if let client \{ try\? await client\.close\(\) \}/);
assert.match(swift, /cleanupNativeUploadArtifacts\([\s\S]*partPath: partPath,[\s\S]*finalPath:/);
assert.match(swift, /guard operation\.claimCompletion\(\) else \{[\s\S]*partPath: nil,[\s\S]*finalPath:/);
assert.match(swift, /connectTimeoutOverrideSeconds: min\(config\.connectTimeoutSeconds, 10\)/);
assert.match(swift, /Task\.sleep\(nanoseconds: 20_000_000_000\)/);
assert.match(swift, /"stage": failure\.stage,[\s\S]*"retryable": failure\.retryable/);

const project = readFileSync(
  new URL("../ios/App/App.xcodeproj/project.pbxproj", import.meta.url),
  "utf8",
);
assert.match(project, /CURRENT_PROJECT_VERSION = 128;/, "the user's iOS build 128 must be preserved");

console.log("iOS native SFTP upload Swift guards passed");
