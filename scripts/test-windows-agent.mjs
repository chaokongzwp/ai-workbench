import assert from "node:assert/strict";
import test from "node:test";
import { buildGitDownloadCommand } from "../src/core/agent.js";
import { windowsWorkbenchAgentScript } from "../src/core/windowsAgent.js";

test("Windows Agent does not expose an empty stdin pipe to Codex", () => {
  const script = windowsWorkbenchAgentScript("test");

  assert.match(script, /stdio: \[input \? "pipe" : "ignore", "pipe", "pipe"\]/);
  assert.match(script, /if \(input && child\.stdin\) child\.stdin\.end\(input, "utf8"\)/);
  assert.doesNotMatch(script, /if \(input\) child\.stdin\.end\(input, "utf8"\); else child\.stdin\.end\(\)/);
});

test("Windows Git download returns the original Git failure detail", () => {
  const command = buildGitDownloadCommand(
    { platform: "windows", workdir: "E:\\codex\\wali-device" },
    { repoUrl: "git@github.com:example/private-repo.git", targetDir: "E:\\codex\\wali-device" },
  );

  assert.equal(command.uploadScript, true);
  assert.match(command.stdin, /__AIWB_GIT_OPERATION_DETAIL_B64__/);
  assert.match(command.stdin, /git clone .*2>&1 \| Out-String/);
  assert.match(command.stdin, /Assert-AiwbGitSucceeded "下载仓库" \$AIWB_GIT_EXIT_CODE \$AIWB_GIT_OUTPUT/);
});
