import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { windowsWorkbenchAgentScript } from "../src/core/windowsAgent.js";

test("Windows install-service and handoff defer across all host conversations", async () => {
  const testHome = await mkdtemp(join(tmpdir(), "aiwb-windows-upgrade-drain-"));
  const agentHome = join(testHome, ".ai-workbench", "agent");
  const tasksRoot = join(agentHome, "tasks");
  const controlPath = join(agentHome, "aiwb-agent.mjs");
  const fakeBin = join(testHome, "bin");
  const processCalls = join(testHome, "process-calls.log");
  let runningTaskProcess;
  try {
    await mkdir(tasksRoot, { recursive: true });
    await mkdir(fakeBin, { recursive: true });
    await writeFile(controlPath, windowsWorkbenchAgentScript("upgrade-drain-test"));
    for (const executable of ["schtasks.exe", "taskkill.exe"]) {
      const path = join(fakeBin, executable);
      await writeFile(path, "#!/bin/sh\nprintf '%s %s\\n' \"$0\" \"$*\" >> \"$AIWB_TEST_PROCESS_CALLS\"\nexit 0\n");
      await chmod(path, 0o700);
    }

    const statuses = ["queued", "preparing", "running", "busy"];
    let runningTaskId = "";
    for (let index = 0; index < statuses.length; index += 1) {
      const taskId = index % 2 === 0 ? `task-session-06-${index}` : `task-session-07-${index}`;
      const directory = join(tasksRoot, taskId);
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, "conversation_id"), index % 2 === 0 ? "conversation-06\n" : "conversation-07\n");
      await writeFile(join(directory, "status"), `${statuses[index]}\n`);
      if (statuses[index] === "running") {
        runningTaskId = taskId;
        runningTaskProcess = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)", controlPath, "runner", taskId], {
          stdio: "ignore",
        });
        await writeFile(join(directory, "pid"), `${runningTaskProcess.pid}\n`);
      }
    }
    const runnerDescriptor = JSON.stringify([{
      ProcessId: runningTaskProcess.pid,
      ExecutablePath: process.execPath,
      CommandLine: `"${process.execPath}" "${controlPath}" runner ${runningTaskId}`,
    }]);
    const powershellPath = join(fakeBin, "powershell.exe");
    await writeFile(powershellPath, `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(runnerDescriptor)});\n`);
    await chmod(powershellPath, 0o700);

    // Model the config-center installer: its PowerShell parent owns tick.lock
    // and delegates the final guarded restart to the newly installed control.
    const tickLock = join(agentHome, "tick.lock");
    await mkdir(tickLock);
    await writeFile(join(tickLock, "owner.pid"), `${process.pid}\n`);
    await writeFile(join(tickLock, "owner.token"), "parent-installer-token\n");
    await writeFile(join(tickLock, "started_at"), `${new Date().toISOString()}\n`);

    const env = {
      ...process.env,
      HOME: testHome,
      PATH: `${fakeBin}:${process.env.PATH || ""}`,
      AIWB_TEST_PROCESS_CALLS: processCalls,
    };
    const run = (command, args = []) => spawnSync(process.execPath, [controlPath, command, ...args], {
      encoding: "utf8",
      env,
      timeout: 10_000,
    });
    const assertDeferred = (result) => {
      assert.equal(result.status, 20, result.stderr || result.stdout);
      assert.match(result.stdout, /__AIWB_AGENT_STATUS__deferred/);
      assert.match(result.stdout, /__AIWB_AGENT_INSTALL_RESULT__deferred/);
      assert.match(result.stdout, /__AIWB_AGENT_INSTALL_DEFER_REASON__active_tasks/);
      assert.match(result.stdout, /__AIWB_AGENT_ACTIVE_TASKS__4/);
      assert.match(result.stdout, /updater 会自动重试/);
    };

    assertDeferred(run("install-service", [String(process.pid)]));
    assert.equal((await readFile(join(tickLock, "owner.pid"), "utf8")).trim(), String(process.pid));
    await assert.rejects(readFile(join(agentHome, "runtime-update.fence"), "utf8"), /ENOENT/);
    await rm(tickLock, { recursive: true, force: true });

    assertDeferred(run("schedule-install-service"));
    assertDeferred(run("install-service-handoff"));

    // A crashed runner may leave a stale running status. Once every durable
    // queued/preparing/busy item is terminal, that dead PID must not block the
    // updater's later automatic handoff forever.
    runningTaskProcess.kill("SIGTERM");
    await new Promise((resolve) => runningTaskProcess.once("exit", resolve));
    runningTaskProcess = null;
    for (let index = 0; index < statuses.length; index += 1) {
      if (statuses[index] === "running") continue;
      const taskId = index % 2 === 0 ? `task-session-06-${index}` : `task-session-07-${index}`;
      await writeFile(join(tasksRoot, taskId, "status"), "done\n");
    }
    const retried = run("schedule-install-service");
    assert.equal(retried.status, 0, retried.stderr || retried.stdout);
    assert.match(retried.stdout, /__AIWB_AGENT_STATUS__handoff-scheduled/);

    const calls = await readFile(processCalls, "utf8").catch(() => "");
    assert.doesNotMatch(calls, /taskkill\.exe/i, "no active-task path may terminate the Windows service tree");
    const generatedControl = await readFile(controlPath, "utf8");
    const generatedSchedule = generatedControl.slice(
      generatedControl.indexOf("function scheduleInstallService()"),
      generatedControl.indexOf("function installServiceHandoff()"),
    );
    assert.match(generatedSchedule, /New-ScheduledTaskAction -Execute/);
    assert.match(generatedSchedule, /New-ScheduledTaskTrigger -AtLogOn/);
    assert.doesNotMatch(generatedSchedule, /"\/(?:SD|ST|TR)"/, "handoff scheduling must not depend on locale-sensitive or shell-parsed schtasks fields");
  } finally {
    try { runningTaskProcess?.kill("SIGTERM"); } catch {}
    await rm(testHome, { recursive: true, force: true });
  }
});
