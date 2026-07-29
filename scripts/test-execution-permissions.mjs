import assert from "node:assert/strict";
import test from "node:test";

import {
  claudeFullAccessBlockedByRoot,
  claudePermissionMode,
  codexPermissionArgs,
  normalizeExecutionPermissionMode,
} from "../src/core/executionPermissions.js";
import {
  applyGlobalSettings,
  globalSettingsFromProfile,
} from "../src/core/foundation.js";

test("normalizes execution permission modes", () => {
  assert.equal(normalizeExecutionPermissionMode("full-access"), "full-access");
  assert.equal(normalizeExecutionPermissionMode("unexpected"), "standard");
  assert.equal(normalizeExecutionPermissionMode(), "standard");
});

test("uses the Codex no-confirmation flag only for full access", () => {
  assert.deepEqual(codexPermissionArgs({ executionPermissionMode: "standard" }), [
    "--sandbox",
    "danger-full-access",
  ]);
  assert.deepEqual(codexPermissionArgs({ executionPermissionMode: "full-access" }), [
    "--dangerously-bypass-approvals-and-sandbox",
  ]);
});

test("uses Claude bypass mode for full access except Linux root", () => {
  assert.equal(
    claudePermissionMode({
      executionPermissionMode: "full-access",
      platform: "linux",
      username: "aiworker",
    }),
    "bypassPermissions",
  );
  assert.equal(
    claudePermissionMode({
      executionPermissionMode: "full-access",
      platform: "windows",
      username: "root",
    }),
    "bypassPermissions",
  );
  assert.equal(
    claudePermissionMode({
      executionPermissionMode: "full-access",
      platform: "linux",
      username: "root",
    }),
    "acceptEdits",
  );
  assert.equal(
    claudeFullAccessBlockedByRoot({
      executionPermissionMode: "full-access",
      platform: "linux",
      username: "root",
    }),
    true,
  );
});

test("applies the selected permission mode to every session profile", () => {
  const globalSettings = globalSettingsFromProfile({
    executionPermissionMode: "full-access",
  });
  const sessionProfile = applyGlobalSettings(
    {
      host: "server.example.com",
      username: "developer",
      workdir: "/srv/project",
      executionPermissionMode: "standard",
    },
    globalSettings,
  );

  assert.equal(globalSettings.executionPermissionMode, "full-access");
  assert.equal(sessionProfile.executionPermissionMode, "full-access");
  assert.equal(sessionProfile.host, "server.example.com");
  assert.equal(sessionProfile.workdir, "/srv/project");
});
