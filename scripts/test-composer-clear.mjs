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

assert.match(clearDraft, /voiceStateRef\.current !== "idle"/);
assert.match(clearDraft, /composerDraftsRef\.current\.set\(serverId, ""\)/);
assert.doesNotMatch(clearDraft, /updateImageAttachmentsForSession/);
assert.doesNotMatch(clearDraft, /revokeImagePreviews/);
assert.match(controller, /onClearComposer: clearComposerDraft/);

for (const source of [composer, iphone]) {
  assert.match(source, /const hasTextDraft = Boolean\(composer\)/);
  assert.match(source, /aria-label="清空输入文字"/);
  assert.match(source, /onPointerDown=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(source, /onClearComposer\?\.\(\)/);
}

for (const source of [mac, native, iphone]) {
  assert.match(source, /onClearComposer=\{onClearComposer\}/);
}

console.log("Composer clear tests passed.");
