import assert from "node:assert/strict";
import { patchMessage } from "../src/core/messageStore.js";
import { patchSession, sessionById } from "../src/core/sessionStore.js";

const sessions = [
  { id: "a", profile: { agentId: "codex" }, messages: [{ id: "m1", body: "before" }] },
  { id: "b", profile: { agentId: "claude" }, messages: [] },
];

const patched = patchSession(sessions, "a", { conversationId: "conv-a" });
assert.equal(sessionById(patched, "a").conversationId, "conv-a");
assert.equal(sessionById(patched, "b"), sessions[1]);

const messages = patchMessage(sessionById(patched, "a").messages, "m1", { body: "after" });
assert.equal(messages[0].body, "after");
assert.equal(patchMessage(messages, "missing", { body: "ignored" }), messages);

console.log("session and message store regression: ok");
