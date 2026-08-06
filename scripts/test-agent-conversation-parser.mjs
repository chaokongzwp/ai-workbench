import assert from "node:assert/strict";
import {
  latestWorkbenchAgentConversationTask,
  parseWorkbenchAgentConversations,
} from "../src/core/agent.js";

function wrapAtTerminalColumns(line, columns = 80) {
  const chunks = [];
  for (let offset = 0; offset < line.length; offset += columns) {
    chunks.push(line.slice(offset, offset + columns));
  }
  return chunks;
}

const conversationId = "conv-E--codex-1785376137913-19e730e7";
const taskId = "task-1786006375455-bc69cf-codex-conv-E-codex-17";
const turnId = "turn-1786006341866-kwg19e";
const requestMessageId = `${turnId}-request`;
const responseMessageId = `${turnId}-response`;
const marker = (name, value = "") =>
  wrapAtTerminalColumns(`__AIWB_AGENT_CONVERSATION_${name}__${value}`).join("\r\n");
const historyMarker = (name, value = "") =>
  wrapAtTerminalColumns(`__AIWB_AGENT_CONVERSATION_HISTORY_${name}__${value}`).join("\r\n");

const output = [
  "__AIWB_AGENT_CONVERSATION_START__",
  marker("ID", conversationId),
  marker("NAME", "06"),
  marker("WORKDIR", "E:\\codex\\cat-litter-box"),
  marker("AGENT_ID", "codex"),
  marker("STATUS", "running"),
  marker("TASK_ID", taskId),
  marker("CREATED_AT", "2026-08-06T08:52:58.000Z"),
  marker("UPDATED_AT", "2026-08-06T08:54:23.000Z"),
  "__AIWB_AGENT_CONVERSATION_LAST_PROMPT_START__",
  "我是要让你登录飞书cli工具",
  "__AIWB_AGENT_CONVERSATION_LAST_PROMPT_END__",
  "__AIWB_AGENT_CONVERSATION_LAST_RESULT_START__",
  "正在处理",
  "__AIWB_AGENT_CONVERSATION_LAST_RESULT_END__",
  "__AIWB_AGENT_CONVERSATION_HISTORY_START__",
  "__AIWB_AGENT_CONVERSATION_HISTORY_ITEM_START__",
  historyMarker("TASK_ID", taskId),
  historyMarker("SORT_KEY", `1786006378000:${taskId}`),
  historyMarker("STATUS", "running"),
  historyMarker("TURN_ID", turnId),
  historyMarker("REQUEST_MESSAGE_ID", requestMessageId),
  historyMarker("RESPONSE_MESSAGE_ID", responseMessageId),
  historyMarker("AGENT_ID", "codex"),
  "__AIWB_AGENT_CONVERSATION_HISTORY_PROMPT_START__",
  "我是要让你登录飞书cli工具",
  "__AIWB_AGENT_CONVERSATION_HISTORY_PROMPT_END__",
  "__AIWB_AGENT_CONVERSATION_HISTORY_RESULT_START__",
  "正在处理",
  "__AIWB_AGENT_CONVERSATION_HISTORY_RESULT_END__",
  "__AIWB_AGENT_CONVERSATION_HISTORY_ITEM_END__",
  historyMarker("NEXT_BEFORE", `1786006378000:${taskId}`),
  historyMarker("HAS_MORE", "0"),
  "__AIWB_AGENT_CONVERSATION_HISTORY_END__",
  "__AIWB_AGENT_CONVERSATION_END__",
].join("\r\n");

assert.ok(
  wrapAtTerminalColumns(`__AIWB_AGENT_CONVERSATION_HISTORY_TASK_ID__${taskId}`).length > 1,
  "the fixture must reproduce an 80-column PTY wrap",
);

const conversations = parseWorkbenchAgentConversations(output);
assert.equal(conversations.length, 1);
assert.equal(conversations[0].id, conversationId);
assert.equal(conversations[0].workdir, "E:\\codex\\cat-litter-box");
assert.equal(conversations[0].taskId, taskId);
assert.equal(conversations[0].history.length, 1);
assert.equal(conversations[0].history[0].taskId, taskId);
assert.equal(conversations[0].history[0].turnId, turnId);
assert.equal(conversations[0].history[0].requestMessageId, requestMessageId);
assert.equal(conversations[0].history[0].responseMessageId, responseMessageId);
assert.equal(latestWorkbenchAgentConversationTask(conversations[0]).taskId, taskId);

console.log("Agent conversation 80-column marker regression: ok");
