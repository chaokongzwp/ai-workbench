import assert from "node:assert/strict";
import {
  SessionDispatchInvariantError,
  assertSessionDispatch,
  sessionIdentity,
} from "../src/core/session.js";

const claudeSession = {
  id: "session-claude",
  conversationId: "conv-claude-1",
  profile: { agentId: "claude", host: "host-a", username: "root", workdir: "/srv/a" },
};
const codexSession = {
  id: "session-codex",
  conversationId: "conv-codex-1",
  profile: { agentId: "codex", host: "host-a", username: "root", workdir: "/srv/b" },
};

assert.deepEqual(sessionIdentity(claudeSession), {
  sessionId: "session-claude",
  host: "host-a",
  username: "root",
  workdir: "/srv/a",
  agentId: "claude",
  conversationId: "conv-claude-1",
});

assert.doesNotThrow(() =>
  assertSessionDispatch(claudeSession, {
    sessionId: "session-claude",
    agentId: "claude",
    conversationId: "conv-claude-1",
    profile: claudeSession.profile,
  }),
);

// A Claude work session can never launch the Codex command.
assert.throws(
  () => assertSessionDispatch(claudeSession, { sessionId: "session-claude", agentId: "codex" }),
  (error) => error instanceof SessionDispatchInvariantError && error.code === "AIWB_SESSION_DISPATCH_MISMATCH",
);

// Reusing a stale conversation ID on another directory or host is also a
// dispatch failure, even if the selected AI happens to be the same.
assert.throws(
  () =>
    assertSessionDispatch(claudeSession, {
      sessionId: "session-claude",
      agentId: "claude",
      profile: { ...claudeSession.profile, workdir: "/srv/other" },
    }),
  SessionDispatchInvariantError,
);

// Two sessions on one machine may use the same AI, but never each other's
// conversationId. This prevents task/result cross-talk between projects.
assert.throws(
  () =>
    assertSessionDispatch(claudeSession, {
      sessionId: "session-claude",
      agentId: "claude",
      conversationId: codexSession.conversationId,
    }),
  SessionDispatchInvariantError,
);

assert.throws(
  () => assertSessionDispatch(claudeSession, { sessionId: codexSession.id, agentId: "claude" }),
  SessionDispatchInvariantError,
);

console.log("session dispatch invariant regression: ok");
