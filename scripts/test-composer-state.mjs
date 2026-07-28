import assert from "node:assert/strict";
import { composerLockPresentation } from "../src/core/composerState.js";

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
  runningTask: { remoteTaskStatus: "preparing" },
});
assert.equal(preparingTask.locked, true);
assert.equal(preparingTask.sendBlocked, true);
assert.equal(preparingTask.code, "checking");

const syncingTask = composerLockPresentation({
  runningTask: { remoteTaskId: "task-1", remoteTaskStatus: "sync-lost" },
});
assert.equal(syncingTask.locked, true);
assert.equal(syncingTask.sendBlocked, true);
assert.equal(syncingTask.code, "syncing");

const runningTask = composerLockPresentation({
  runningTask: { remoteTaskId: "task-1", remoteTaskStatus: "running" },
});
assert.equal(runningTask.locked, true);
assert.equal(runningTask.sendBlocked, true);
assert.equal(runningTask.code, "running");

console.log("Composer state tests passed.");
