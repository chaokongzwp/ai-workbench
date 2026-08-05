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

test("Claude execution delegates liveness to the Agent without a client-side watchdog", () => {
  const command = buildClaudePrintCommand(profile, claude, "reply with OK");
  assert.match(command, /AIWB_BASE_ARGS=/);
  assert.match(command, /"\$AIWB_COMMAND" "\$\{AIWB_ARGS\[@\]\}"/);
  assert.doesNotMatch(command, /AIWB_STALLED_SAMPLES|aiwb_run_claude_with_startup_watchdog/);
  assert.doesNotMatch(command, /连续两次启动|lsof -nP -a -p/);
});

test("Agent resume state is isolated by conversation", () => {
  const first = buildClaudePrintCommand({ ...profile, conversationId: "conversation-a" }, claude, "reply with OK");
  const second = buildClaudePrintCommand({ ...profile, conversationId: "conversation-b" }, claude, "reply with OK");
  assert.match(first, /ai-dev-claude-conversation-a\.claude-session/);
  assert.match(second, /ai-dev-claude-conversation-b\.claude-session/);
  assert.notEqual(first, second);
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
