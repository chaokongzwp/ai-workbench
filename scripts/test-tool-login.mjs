import assert from "node:assert/strict";
import test from "node:test";

import { classifyAgentFailure, detectAgentIssue } from "../src/core/agentOutput.js";
import { defaultProfile } from "../src/core/foundation.js";
import {
  buildClaudePrintCommand,
  buildToolLoginStartCommand,
  buildToolLoginSubmitCommand,
} from "../src/core/remoteCommands.js";
import { agentById } from "../src/core/routingOutput.js";

const claude = agentById("claude");
const profile = {
  ...defaultProfile,
  host: "mac.example",
  username: "a0",
  workdir: "/Users/a0/Documents/x",
  agentId: "claude",
};

test("Claude login capture joins a soft-wrapped OAuth URL", () => {
  const command = buildToolLoginStartCommand(profile, claude);
  assert.match(command, /capture-pane -J/);
  assert.match(command, /new-session -d -x 2000 -y 50/);
  assert.match(command, /resize-window/);
});

test("Claude authorization code is pasted literally without exposing plaintext", () => {
  const authorizationCode = "secret#value+/=";
  const command = buildToolLoginSubmitCommand(profile, claude, authorizationCode);
  assert.match(command, /send-keys/);
  assert.match(command, /-l --/);
  assert.doesNotMatch(command, new RegExp(authorizationCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(command, /loggedIn/);
  assert.match(command, /rm -f .*\.claude-session/);
});

test("Claude on macOS retries a stalled startup once without resuming", () => {
  const command = buildClaudePrintCommand(profile, claude, "reply with OK");
  assert.match(command, /AIWB_BASE_ARGS=/);
  assert.match(command, /AIWB_STALLED_SAMPLES/);
  assert.match(command, /lsof -nP -a -p/);
  assert.match(command, /AIWB_RETRY_FRESH/);
  assert.match(command, /连续两次启动/);
  assert.match(command, /rm -f .*\.claude-session/);
  assert.match(command, /aiwb_run_claude_with_startup_watchdog "\$\{AIWB_BASE_ARGS\[@\]\}"/);
});

test("Claude not-logged-in JSON becomes a useful App error", () => {
  const raw = JSON.stringify({
    is_error: true,
    terminal_reason: "api_error",
    result: "Not logged in · Please run /login",
  });
  assert.match(detectAgentIssue(raw, claude), /尚未登录/);
  const failure = classifyAgentFailure(raw, claude, { taskStatus: "error" });
  assert.equal(failure?.kind, "agent_not_logged_in");
  assert.equal(failure?.canOpenSettings, true);
});
