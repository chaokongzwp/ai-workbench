import assert from "node:assert/strict";
import test from "node:test";

import { buildWorkbenchAgentConversationStatusCommand } from "../src/core/agent.js";

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
