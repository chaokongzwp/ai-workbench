import assert from "node:assert/strict";
import test from "node:test";

import {
  claudeFullAccessBlockedByRoot,
  claudePermissionArgs,
  claudePermissionMode,
  codexPermissionArgs,
  normalizeExecutionPermissionMode,
} from "../src/core/executionPermissions.js";
import {
  applyGlobalSettings,
  globalSettingsFromProfile,
  normalizeProfile,
  parseSessionEnvironmentVariables,
  sessionEnvironmentBashScript,
  sessionEnvironmentPowerShellScript,
} from "../src/core/foundation.js";
import { buildClaudePrintCommand, buildCodexExecCommand, buildWindowsCodexExecCommand } from "../src/core/remoteCommands.js";

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
  assert.deepEqual(
    claudePermissionArgs({
      executionPermissionMode: "full-access",
      platform: "linux",
      username: "root",
    }),
    [
      "--permission-mode",
      "acceptEdits",
      "--allowedTools",
      "Bash",
      "Edit",
      "Write",
      "Read",
      "Glob",
      "Grep",
      "WebFetch",
      "WebSearch",
      "Agent",
      "Skill",
    ],
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

test("parses and isolates session environment variables", () => {
  const parsed = parseSessionEnvironmentVariables(`
# local settings
API_URL=https://example.test/v1
export FEATURE_FLAG="enabled value"
API_URL=https://override.test
AIWB_TASK_DIR=/tmp/hijack
INVALID LINE
`);
  assert.deepEqual(parsed.entries, [
    { name: "API_URL", value: "https://override.test", line: 5 },
    { name: "FEATURE_FLAG", value: "enabled value", line: 4 },
  ]);
  assert.equal(parsed.errors.length, 2);
  assert.equal(normalizeProfile({ environmentVariables: "A=1\r\nB=2" }).environmentVariables, "A=1\nB=2");
  assert.equal(sessionEnvironmentBashScript("TOKEN=a'b"), "export TOKEN='a'\\''b'");
  assert.match(sessionEnvironmentPowerShellScript("TOKEN=a'b"), /\$env:TOKEN = 'a''b'/);
});

test("injects session environment only into the selected AI task", () => {
  const linuxProfile = {
    platform: "linux",
    username: "developer",
    workdir: "/srv/project",
    codexCommand: "codex",
    claudeCommand: "claude",
    environmentVariables: "API_URL=https://session.test\nFEATURE_FLAG=on",
  };
  const codex = buildCodexExecCommand(linuxProfile, { id: "codex" }, "check env");
  const claude = buildClaudePrintCommand(linuxProfile, { id: "claude" }, "check env");
  for (const command of [codex, claude]) {
    assert.match(command, /export API_URL=/);
    assert.match(command, /https:\/\/session\.test/);
    assert.match(command, /export FEATURE_FLAG=/);
  }

  const windows = buildWindowsCodexExecCommand(
    { ...linuxProfile, platform: "windows", workdir: "C:\\project" },
    { id: "codex" },
    "check env",
  );
  assert.match(windows.stdin, /\$env:API_URL = 'https:\/\/session\.test'/);
  assert.match(windows.stdin, /\$env:FEATURE_FLAG = 'on'/);
});
