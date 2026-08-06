import assert from "node:assert/strict";
import {
  composerLockPresentation,
  sessionAttachmentDraft,
  switchSessionAttachmentDraft,
  updateSessionAttachmentDraft,
} from "../src/core/composerState.js";

const attachmentDrafts = new Map();
const firstAttachments = [{ id: "first-file" }];
assert.deepEqual(switchSessionAttachmentDraft(attachmentDrafts, "session-a", firstAttachments, "session-b"), []);
assert.equal(sessionAttachmentDraft(attachmentDrafts, "session-a"), firstAttachments);

const secondAttachments = updateSessionAttachmentDraft(attachmentDrafts, "session-b", (items) => [
  ...items,
  { id: "second-file" },
]);
assert.deepEqual(secondAttachments.map(({ id }) => id), ["second-file"]);
assert.deepEqual(sessionAttachmentDraft(attachmentDrafts, "session-a").map(({ id }) => id), ["first-file"]);
assert.equal(
  switchSessionAttachmentDraft(attachmentDrafts, "session-b", secondAttachments, "session-a"),
  firstAttachments,
);

const ready = composerLockPresentation();
assert.deepEqual(ready, {
  locked: false,
  sendBlocked: false,
  code: "ready",
  text: "",
});

const operation = composerLockPresentation({ busy: true });
assert.equal(operation.locked, false);
assert.equal(operation.sendBlocked, false);
assert.equal(operation.code, "operation");
assert.equal(operation.text, "");

const setup = composerLockPresentation({ busy: true, profileReady: false });
assert.equal(setup.locked, false);
assert.equal(setup.sendBlocked, true);
assert.equal(setup.code, "setup-required");

const pendingAction = composerLockPresentation({ pendingAction: true });
assert.equal(pendingAction.locked, false);
assert.equal(pendingAction.sendBlocked, true);
assert.equal(pendingAction.code, "action-required");

const preparingTask = composerLockPresentation({
  runningTask: { role: "assistant", taskState: "submitting" },
});
assert.equal(preparingTask.locked, true);
assert.equal(preparingTask.sendBlocked, true);
assert.equal(preparingTask.code, "submitting");

const syncingTask = composerLockPresentation({
  runningTask: { role: "assistant", taskState: "syncing" },
});
assert.equal(syncingTask.locked, true);
assert.equal(syncingTask.sendBlocked, true);
assert.equal(syncingTask.code, "syncing");

const runningTask = composerLockPresentation({
  runningTask: { role: "assistant", taskState: "running" },
});
assert.equal(runningTask.locked, true);
assert.equal(runningTask.sendBlocked, true);
assert.equal(runningTask.code, "running");

console.log("Composer state tests passed.");
