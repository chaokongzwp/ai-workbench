import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { workbenchAgentScript } from "../src/core/agent.js";
import { windowsWorkbenchAgentScript } from "../src/core/windowsAgent.js";

const execFileAsync = promisify(execFile);
const testHome = await mkdtemp(join(tmpdir(), "aiwb-agent-retention-"));
const agentHome = join(testHome, ".ai-workbench", "agent");
const tasks = join(agentHome, "tasks");
const controlPath = join(agentHome, "aiwbctl");
const conversationId = "conversation-retention";

async function task(id, status, targetConversation = conversationId, extras = {}) {
  const directory = join(tasks, id);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "conversation_id"), `${targetConversation}\n`);
  await writeFile(join(directory, "status"), `${status}\n`);
  for (const [name, value] of Object.entries(extras)) await writeFile(join(directory, name), String(value));
  return directory;
}

try {
  await mkdir(tasks, { recursive: true });
  await writeFile(controlPath, workbenchAgentScript(), "utf8");
  await chmod(controlPath, 0o700);
  await task("old-done", "done", conversationId, { "output.log": "obsolete result\n" });
  await task("old-error", "error");
  await task("active-running", "running");
  await task("other-conversation", "done", "conversation-other");
  const current = await task("current-done", "done", conversationId, { "prompt.txt": "latest prompt\n" });

  const conversation = join(agentHome, "conversations", conversationId);
  await mkdir(conversation, { recursive: true });
  await writeFile(join(conversation, "last_result.txt"), "must be cleared\n");
  await execFileAsync(controlPath, ["finalize-task", "current-done"], { env: { ...process.env, HOME: testHome } });

  await assert.rejects(readFile(join(tasks, "old-done", "status"), "utf8"), { code: "ENOENT" });
  await assert.rejects(readFile(join(tasks, "old-error", "status"), "utf8"), { code: "ENOENT" });
  assert.equal((await readFile(join(tasks, "active-running", "status"), "utf8")).trim(), "running");
  assert.equal((await readFile(join(tasks, "other-conversation", "status"), "utf8")).trim(), "done");
  assert.equal((await readFile(join(current, "status"), "utf8")).trim(), "done");
  assert.equal((await readFile(join(conversation, "task_id"), "utf8")).trim(), "current-done");
  assert.equal(await readFile(join(conversation, "last_result.txt"), "utf8"), "");
  assert.match(await readFile(join(agentHome, "daemon.log"), "utf8"), /removed=2/);

  const unixSource = workbenchAgentScript();
  assert.match(unixSource, /"\$aiwb_control" finalize-task "\$\(basename "\$AIWB_TASK_DIR"\)"/);

  const windowsSource = windowsWorkbenchAgentScript("retention-test");
  assert.match(windowsSource, /function pruneConversationTasks\(currentId\)/);
  assert.match(windowsSource, /scheduleTerminalNotification\(id\);\s*pruneConversationTasks\(id\);/);
  assert.doesNotMatch(
    windowsSource.slice(windowsSource.indexOf("function tick()"), windowsSource.indexOf("function ensureDaemon()")),
    /scheduleTerminalNotification/,
  );
  process.stdout.write("agent per-conversation task retention regression: ok\n");
} finally {
  await rm(testHome, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
