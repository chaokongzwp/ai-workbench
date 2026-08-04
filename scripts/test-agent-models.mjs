import assert from "node:assert/strict";
import {
  agentModelOptions,
  normalizeAgentModel,
  normalizeProfile,
} from "../src/core/foundation.js";
import { classifyAgentFailure } from "../src/core/agentOutput.js";
import { extractAgentFailureMessage } from "../src/core/agentOutput.js";

assert.equal(
  agentModelOptions.codex.some((option) => option.id === "gpt-5.6"),
  false,
);
assert.equal(normalizeAgentModel("codex", "gpt-5.6"), "");
assert.equal(
  normalizeProfile({ agentId: "codex", aiModel: "gpt-5.6" }).aiModel,
  "",
);
assert.equal(normalizeAgentModel("codex", "gpt-5.5"), "gpt-5.5");

const failure = classifyAgentFailure(
  `ERROR: {"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The 'gpt-5.6' model is not supported when using Codex with a ChatGPT account."}}`,
  { id: "codex", shortName: "Codex" },
  { taskStatus: "error", exitCode: "1" },
);
assert.equal(failure.kind, "agent_model_chatgpt_unsupported");
assert.match(failure.body, /gpt-5\.6/);
assert.match(failure.hint, /默认模型/);
assert.equal(
  extractAgentFailureMessage(
    `__AIWB_AGENT_STATUS__ready
__AIWB_AGENT_TASK_OUTPUT_START__
ERROR: {"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The 'gpt-5.6' model is not supported when using Codex with a ChatGPT account."}}
__AIWB_AGENT_TASK_OUTPUT_END__`,
  ),
  "The 'gpt-5.6' model is not supported when using Codex with a ChatGPT account.",
);
const wrappedError = `Agent 状态：ready
任务状态：error
退出码：1

输出：
ERROR: {"type":"error","status":400,"error":{"type":"invalid_request_error","mes

ssage":"The 'gpt-5.6' model is not supported when using Codex with a ChatGPT acco

unt."}}`;
assert.equal(
  extractAgentFailureMessage(wrappedError),
  "The 'gpt-5.6' model is not supported when using Codex with a ChatGPT account.",
);
assert.equal(
  classifyAgentFailure(
    wrappedError,
    { id: "codex", shortName: "Codex" },
    { taskStatus: "error", exitCode: "1" },
  ).kind,
  "agent_model_chatgpt_unsupported",
);

console.log("agent model compatibility tests passed");
