import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const controller = readFileSync(new URL("../src/app/useWorkbenchController.jsx", import.meta.url), "utf8");
const composer = readFileSync(new URL("../src/features/composer.jsx", import.meta.url), "utf8");
const iphone = readFileSync(new URL("../src/platforms/iphone/IphoneWorkbenchShell.jsx", import.meta.url), "utf8");
const mac = readFileSync(new URL("../src/platforms/mac/MacWorkbenchShell.jsx", import.meta.url), "utf8");
const native = readFileSync(new URL("../src/platforms/native/NativeWorkbenchShell.jsx", import.meta.url), "utf8");

const clearDraft = controller.slice(
  controller.indexOf("  function clearComposerDraft() {"),
  controller.indexOf("  async function addImageAttachments", controller.indexOf("  function clearComposerDraft() {")),
);

assert.match(clearDraft, /sendingServerIdsRef\.current\.has\(serverId\)/);
assert.match(clearDraft, /activeUploadByServerRef\.current\.has\(serverId\)/);
assert.match(clearDraft, /voiceStateRef\.current !== "idle"/);
assert.match(clearDraft, /composerDraftsRef\.current\.set\(serverId, ""\)/);
assert.match(clearDraft, /invalidateAttachmentDraft\(serverId\)/);
assert.match(clearDraft, /revokeImagePreviews\(items\)/);
assert.match(clearDraft, /return \[\]/);
assert.match(controller, /onClearComposer: clearComposerDraft/);
assert.match(controller, /attachmentDraftVersion\(serverId\) !== draftVersion/);

for (const source of [composer, iphone]) {
  assert.match(source, /aria-label="清空输入内容和附件"/);
  assert.match(source, /onPointerDown=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(source, /onClearComposer\?\.\(\)/);
}

for (const source of [mac, native, iphone]) {
  assert.match(source, /onClearComposer=\{onClearComposer\}/);
}

console.log("Composer clear tests passed.");
