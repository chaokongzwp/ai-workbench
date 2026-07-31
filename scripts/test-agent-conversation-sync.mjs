import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWorkbenchAgentConversationStatusCommand,
  latestWorkbenchAgentConversationTask,
} from "../src/core/agent.js";

function decodePowerShellCommand(command) {
  const encoded = String(command).match(/-EncodedCommand\s+(\S+)/)?.[1] || "";
  return Buffer.from(encoded, "base64").toString("utf16le");
}

test("conversation recovery always requests at most the latest Agent task", () => {
  const linuxCommand = buildWorkbenchAgentConversationStatusCommand(
    { platform: "linux", serverType: "linux" },
    "conversation-test",
    { limit: 5 },
  );
  assert.match(
    linuxCommand.replace(/'\\''/g, "'"),
    /conversation-status\s+'conversation-test'\s+'1'/,
  );

  const windowsCommand = buildWorkbenchAgentConversationStatusCommand(
    { platform: "windows", serverType: "windows-powershell" },
    "conversation-test",
    { limit: 5 },
  );
  assert.match(
    decodePowerShellCommand(windowsCommand),
    /\('conversation-status', 'conversation-test', '1', ''\)/,
  );
});

test("conversation recovery ignores older Agent task history", () => {
  const latest = latestWorkbenchAgentConversationTask(
    {
      id: "conversation-test",
      taskId: "task-latest",
      history: [
        { taskId: "task-older", lastPrompt: "旧任务" },
        { taskId: "task-latest", lastPrompt: "最新任务" },
        { taskId: "task-oldest", lastPrompt: "更旧任务" },
      ],
    },
    "claude",
  );
  assert.equal(latest.taskId, "task-latest");
  assert.equal(latest.lastPrompt, "最新任务");
});
