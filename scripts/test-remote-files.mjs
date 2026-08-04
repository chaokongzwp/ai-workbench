import assert from "node:assert/strict";
import { powershellCommand } from "../src/core/foundation.js";
import {
  buildRemoteImageUploadCommand,
  parseRemoteImageUploadPayload,
  sanitizeUploadName,
} from "../src/core/remoteFiles.js";

assert.equal(
  sanitizeUploadName("支付流程 异常截图（终稿）.png"),
  "支付流程-异常截图-终稿.png",
);
assert.equal(
  sanitizeUploadName("报告 2026-07-31.csv"),
  "报告-2026-07-31.csv",
);

const parsedUpload = parseRemoteImageUploadPayload(
  [
    "__AIWB_UPLOAD_START__",
    "__AIWB_UPLOAD_NAME__1785478826-image.png",
    "__AIWB_UPLOAD_ORIGINAL__æµ‹è¯•æˆªå›¾.png",
    "__AIWB_UPLOAD_PATH__E:\\codex\\dd-device\\.ai-workbench\\uploads\\1785478826-image.png",
    "__AIWB_UPLOAD_MIME__image/png",
    "__AIWB_UPLOAD_SIZE__128",
    "__AIWB_UPLOAD_END__",
  ].join("\n"),
  {
    name: "测试截图.png",
    path: "E:\\codex\\dd-device\\.ai-workbench\\uploads\\测试截图.png",
    mime: "image/png",
    size: 128,
  },
);
assert.equal(parsedUpload.name, "测试截图.png");
assert.equal(parsedUpload.remoteName, "1785478826-image.png");

const command = powershellCommand('Write-Output "中文输出"');
const encoded = command.match(/-EncodedCommand\s+(\S+)/)?.[1] || "";
const decoded = Buffer.from(encoded, "base64").toString("utf16le");
assert.match(decoded, /\[Console\]::OutputEncoding = \$AIWB_UTF8/);
assert.match(decoded, /\$OutputEncoding = \$AIWB_UTF8/);
assert.match(decoded, /中文输出/);

const windowsUpload = buildRemoteImageUploadCommand(
  {
    platform: "windows",
    workdir: "E:\\codex\\dd-device",
  },
  {
    name: "中文附件.txt",
    mime: "text/plain",
    size: 6,
    base64: Buffer.from("测试").toString("base64"),
  },
);
assert.equal(windowsUpload.uploadScript, true);
assert.match(windowsUpload.stdin, /\$AIWB_BASE64 = @'/);
assert.equal(windowsUpload.stdin.includes("5rWL6K+V"), true);
assert.doesNotMatch(windowsUpload.command, /EncodedCommand/);

console.log("remote file encoding tests passed");
