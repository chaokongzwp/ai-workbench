import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { buildGitDownloadCommand } from "../src/core/agent.js";
import { windowsWorkbenchAgentScript } from "../src/core/windowsAgent.js";

test("Windows Agent does not expose an empty stdin pipe to Codex", () => {
  const script = windowsWorkbenchAgentScript("test");

  assert.match(script, /stdio: \[input \? "pipe" : "ignore", "pipe", "pipe"\]/);
  assert.match(script, /if \(input && child\.stdin\) child\.stdin\.end\(input, "utf8"\)/);
  assert.doesNotMatch(script, /if \(input\) child\.stdin\.end\(input, "utf8"\); else child\.stdin\.end\(\)/);
});

test("generated Windows Agent is valid ESM", () => {
  const script = windowsWorkbenchAgentScript("syntax-test");
  const checked = spawnSync(process.execPath, ["--input-type=module", "--check"], {
    encoding: "utf8",
    input: script,
  });

  assert.equal(checked.status, 0, checked.stderr || checked.stdout);
});

function windowsAtomicWriteHarness(renameSync) {
  const script = windowsWorkbenchAgentScript("atomic-write-test");
  const helpersStart = script.indexOf("const ATOMIC_WRITE_RETRY_CODES");
  const helpersEnd = script.indexOf("function append", helpersStart);
  assert.ok(helpersStart > 0 && helpersEnd > helpersStart);

  const files = new Map();
  const unlinked = [];
  const waits = [];
  const fs = {
    mkdirSync() {},
    writeFileSync(file, value) { files.set(file, String(value)); },
    renameSync(from, to) { renameSync({ files, from, to }); },
    unlinkSync(file) {
      unlinked.push(file);
      if (!files.delete(file)) {
        const error = new Error("missing temporary file");
        error.code = "ENOENT";
        throw error;
      }
    },
  };
  const helpers = Function(
    "fs",
    "path",
    "process",
    "Atomics",
    `"use strict";\n${script.slice(helpersStart, helpersEnd)}\nreturn { write };`,
  )(fs, path.win32, { pid: 17504 }, { wait(_array, _index, _expected, milliseconds) { waits.push(milliseconds); } });
  return { ...helpers, files, unlinked, waits };
}

test("Windows atomic write retries transient rename contention without removing the destination", () => {
  const destination = String.raw`C:\tasks\task-1\status`;
  let renameAttempts = 0;
  const destinationPresence = [];
  const harness = windowsAtomicWriteHarness(({ files, from, to }) => {
    renameAttempts += 1;
    destinationPresence.push(files.has(to));
    if (renameAttempts <= 3) {
      const error = new Error("file is temporarily occupied");
      error.code = "EPERM";
      throw error;
    }
    files.set(to, files.get(from));
    files.delete(from);
  });
  harness.files.set(destination, "running");

  harness.write(destination, "done");

  assert.equal(renameAttempts, 4);
  assert.deepEqual(destinationPresence, [true, true, true, true]);
  assert.deepEqual(harness.waits, [10, 20, 40]);
  assert.equal(harness.files.get(destination), "done");
  assert.equal(harness.files.has(`${destination}.tmp-17504`), false);
  assert.deepEqual(harness.unlinked, []);
});

test("Windows atomic write recognizes every transient Windows rename error", () => {
  for (const errorCode of ["EPERM", "EBUSY", "EACCES"]) {
    const destination = String.raw`C:\tasks\task-contention\status`;
    let renameAttempts = 0;
    const harness = windowsAtomicWriteHarness(({ files, from, to }) => {
      renameAttempts += 1;
      if (renameAttempts === 1) {
        const error = new Error(errorCode);
        error.code = errorCode;
        throw error;
      }
      files.set(to, files.get(from));
      files.delete(from);
    });
    harness.files.set(destination, "running");

    harness.write(destination, "done");

    assert.equal(renameAttempts, 2, errorCode);
    assert.deepEqual(harness.waits, [10], errorCode);
    assert.equal(harness.files.get(destination), "done", errorCode);
  }
});

test("Windows atomic write preserves a permanent rename error and cleans its temporary file", () => {
  const destination = String.raw`C:\tasks\task-2\status`;
  const permanentError = new Error("destination remains occupied");
  permanentError.code = "EPERM";
  let renameAttempts = 0;
  const harness = windowsAtomicWriteHarness(() => {
    renameAttempts += 1;
    throw permanentError;
  });
  harness.files.set(destination, "running");

  let caught;
  try {
    harness.write(destination, "done");
  } catch (error) {
    caught = error;
  }

  assert.equal(caught, permanentError);
  assert.equal(renameAttempts, 8);
  assert.deepEqual(harness.waits, [10, 20, 40, 80, 160, 250, 250]);
  assert.equal(harness.files.get(destination), "running");
  assert.equal(harness.files.has(`${destination}.tmp-17504`), false);
  assert.deepEqual(harness.unlinked, [`${destination}.tmp-17504`]);
});

test("Windows process matching uses exact executable, script, and command tokens", () => {
  const script = windowsWorkbenchAgentScript("test");
  const helpersStart = script.indexOf("function normalizeProcessPath");
  const helpersEnd = script.indexOf("function processDescriptors");
  assert.ok(helpersStart > 0 && helpersEnd > helpersStart);
  const helpers = Function(
    "path",
    `"use strict";\n${script.slice(helpersStart, helpersEnd)}\nreturn { commandLineHasToken };`,
  )(path.win32);
  const controlPath = String.raw`C:\Users\a0\.ai-workbench\agent\aiwb-agent.mjs`;
  const commandLine = String.raw`"C:\Program Files\nodejs\node.exe" "C:\Users\a0\.ai-workbench\agent\aiwb-agent.mjs" service-run`;

  assert.equal(helpers.commandLineHasToken(commandLine, controlPath, true), true);
  assert.equal(helpers.commandLineHasToken(commandLine, "service-run"), true);
  assert.equal(helpers.commandLineHasToken(commandLine, `${controlPath}.backup`, true), false);
  assert.equal(helpers.commandLineHasToken(commandLine, "service"), false);
  assert.match(script, /normalizeProcessPath\(descriptor\.executablePath\) !== normalizeProcessPath\(process\.execPath\)/);
  assert.doesNotMatch(script, /commandLine\.includes\(controlPath\)/);
});

test("Windows runtime readiness proves process identity, generation, and heartbeat", () => {
  const script = windowsWorkbenchAgentScript("test");

  assert.match(script, /const RUNTIME_GENERATION_FILE = path\.join\(ROOT, "runtime\.generation"\)/);
  assert.match(script, /const RUNTIME_UPDATE_FENCE_FILE = path\.join\(ROOT, "runtime-update\.fence"\)/);
  assert.match(script, /const PROCESS_CONTROL_SHA256 = fileSha256\(CONTROL_FILE\)\.toLowerCase\(\)/);
  assert.match(script, /const PROCESS_GENERATION_RECORD = readTrim\(RUNTIME_GENERATION_FILE\)/);
  assert.match(script, /function committedGenerationMatchesCurrent[\s\S]*record\.format === "1"[\s\S]*record\.state === "committed"/);
  assert.match(script, /record\.version === String\(VERSION\)\.replace\(\/\^v\/i, ""\)/);
  assert.match(script, /record\.control_sha256 === controlSha/);
  assert.match(script, /record\.http_sha256 === httpSha/);
  assert.match(script, /record\.updater_sha256 === updaterSha/);
  assert.match(script, /function runtimeReady[\s\S]*return committedGenerationMatchesCurrent\(\)/);
  assert.match(script, /const descriptorCache = processDescriptors\(\[servicePid, daemonPid, httpPid, updaterPid\]\)/);
  assert.match(script, /snapshot\.servicePid === snapshot\.daemonPid/);
  assert.match(script, /readTrim\(SERVICE_RUNTIME_SHA_FILE\)\.toLowerCase\(\) === controlSha/);
  assert.match(script, /&& heartbeatReady\(\)/);
  assert.match(script, /&& snapshot\.httpReady[\s\S]*runtimeGenerationReady\("aiwb-agent-http\.mjs", "http\.runtime\.sha256"\)/);
  assert.match(script, /&& snapshot\.updaterReady[\s\S]*runtimeGenerationReady\("aiwb-agent-updater\.mjs", "updater\.runtime\.sha256"\)/);
  assert.match(script, /__AIWB_AGENT_GENERATION_READY__" \+ \(runtimeReady\(snapshot\) \? "1" : "0"\)/);
  assert.match(script, /write\(SERVICE_RUNTIME_SHA_FILE, PROCESS_CONTROL_SHA256\)/);
});

test("Windows task admission rejects update fences and stale process generations", () => {
  const script = windowsWorkbenchAgentScript("test");
  const createStart = script.indexOf("function createTask(id)");
  const createEnd = script.indexOf("function cancelTask(id)", createStart);
  const createSource = script.slice(createStart, createEnd);
  const launchStart = script.indexOf("function launchTask(id, tickLockToken)");
  const launchEnd = script.indexOf("function markStale(id)", launchStart);
  const launchSource = script.slice(launchStart, launchEnd);

  assert.ok(createStart > 0 && createEnd > createStart);
  assert.match(createSource, /if \(runtimeUpdateInProgress\(\)\)[\s\S]*runtime_update_in_progress/);
  assert.ok(createSource.indexOf("runtimeUpdateInProgress()") < createSource.indexOf("activeTaskForConversation"));
  assert.match(createSource, /write\(path\.join\(directory, "status"\), "preparing"\)[\s\S]*const tickLockToken = waitForTickLock\(\)/);
  assert.match(createSource, /try \{[\s\S]*if \(!processGenerationIsCurrent\(\)\)[\s\S]*write\(path\.join\(directory, "status"\), "queued"\)[\s\S]*releaseTickLock\(tickLockToken\)/);
  assert.match(launchSource, /if \(!tickLockOwned\(tickLockToken\)\)[\s\S]*if \(!processGenerationIsCurrent\(\)\)/);
  assert.match(script, /function processGenerationIsCurrent[\s\S]*fileSha256\(CONTROL_FILE\)\.toLowerCase\(\) === PROCESS_CONTROL_SHA256[\s\S]*readTrim\(RUNTIME_GENERATION_FILE\) === PROCESS_GENERATION_RECORD/);
  assert.match(script, /__AIWB_AGENT_ERROR_CODE__generation_changed/);
  assert.match(script, /__AIWB_AGENT_RETRYABLE__1/);
  assert.match(script, /write\(path\.join\(directory, "retryable_error_code"\), "generation_changed"\)/);
  assert.match(script, /setStatus\(id, "error", "76"\)/);
  assert.match(createSource, /process\.exitCode = 44/);
});

test("Windows stale PID files never authorize an unrelated process kill", () => {
  const script = windowsWorkbenchAgentScript("test");
  const stopStart = script.indexOf("function stopPidFile");
  const stopEnd = script.indexOf("function stopDaemon", stopStart);
  const stopSource = script.slice(stopStart, stopEnd);

  assert.match(stopSource, /if \(!processMatchesComponent\(pid, component\)\) \{[\s\S]*return false/);
  assert.match(stopSource, /if \(result\.status !== 0\) \{[\s\S]*if \(processMatchesComponent\(pid, component\)\)/);
  assert.ok(stopSource.indexOf("processMatchesComponent(pid, component)") < stopSource.indexOf('spawnSync("taskkill.exe"'));
  assert.match(script, /function stopTaskRunner\(id\) \{[\s\S]*if \(!processMatchesTaskRunner\(pid, id\)\) return false;[\s\S]*spawnSync\("taskkill\.exe"/);
  assert.doesNotMatch(script, /if \(pid && isAlive\(pid\)\) spawnSync\("taskkill\.exe"/);
});

test("Windows daemon launch is serialized with the installer tick lock", () => {
  const script = windowsWorkbenchAgentScript("test");

  assert.match(script, /const TICK_LOCK = path\.join\(ROOT, "tick\.lock"\)/);
  assert.match(script, /fs\.mkdirSync\(TICK_LOCK\)/);
  assert.match(script, /fs\.writeFileSync\(path\.join\(TICK_LOCK, "owner\.pid"\), String\(process\.pid\)/);
  assert.match(script, /tickLockAgeMilliseconds\(\) < TICK_LOCK_STALE_MILLISECONDS/);
  assert.match(script, /if \(isAlive\(ownerPid\)\) return false/);
  assert.match(script, /fs\.renameSync\(TICK_LOCK, quarantine\)/);
  assert.match(script, /function launchTask\(id, tickLockToken\) \{[\s\S]*if \(!tickLockOwned\(tickLockToken\)\)[\s\S]*return false/);
  assert.match(script, /const tickLockToken = acquireTickLock\(\);[\s\S]*try \{[\s\S]*launchTask\(id, tickLockToken\)[\s\S]*finally \{[\s\S]*releaseTickLock\(tickLockToken\)/);
});

test("Windows scheduled update handoff propagates failures", () => {
  const script = windowsWorkbenchAgentScript("test");
  const scheduleSource = script.slice(
    script.indexOf("function scheduleInstallService()"),
    script.indexOf("function installServiceHandoff()"),
  );

  assert.match(scheduleSource, /New-ScheduledTaskAction -Execute [\s\S]* -Argument /);
  assert.match(scheduleSource, /New-ScheduledTaskTrigger -AtLogOn -User \$AIWB_IDENTITY/);
  assert.match(scheduleSource, /Register-ScheduledTask -TaskName [\s\S]*Start-ScheduledTask -TaskName/);
  assert.match(scheduleSource, /const accepted = scheduled\.status === 0/);
  assert.doesNotMatch(scheduleSource, /"\/SD"|"\/ST"|"\/TR"/);
  assert.match(scheduleSource, /if \(!accepted\) \{[\s\S]*"\/Delete", "\/TN", UPDATE_HANDOFF_TASK/);
  assert.match(scheduleSource, /if \(!accepted\) \{[\s\S]*process\.exitCode = 3/);
  assert.match(script, /function installServiceHandoff\(\) \{[\s\S]*ready = installService\(\)[\s\S]*if \(!ready && !process\.exitCode\) process\.exitCode = 3/);
  assert.match(scheduleSource, /const actionArguments = '\"' \+ CONTROL_FILE \+ '\" install-service-handoff'/);
  assert.match(script, /return ready;\n\}/);
});

test("Windows service replacement drains every conversation before taskkill", () => {
  const script = windowsWorkbenchAgentScript("test");
  const scheduleStart = script.indexOf("function scheduleInstallService()");
  const handoffStart = script.indexOf("function installServiceHandoff()", scheduleStart);
  const installStart = script.indexOf('function installService(parentLockOwnerPid = "")', handoffStart);
  const uninstallStart = script.indexOf("function uninstallService()", installStart);
  const scheduleSource = script.slice(scheduleStart, handoffStart);
  const installSource = script.slice(installStart, uninstallStart);

  assert.match(script, /function globalActiveTaskIds\(\)[\s\S]*\["queued", "preparing", "busy"\]/);
  assert.match(script, /status !== "running"[\s\S]*processMatchesTaskRunner\(readTrim\(path\.join\(taskDir\(id\), "pid"\)\), id\)/);
  assert.doesNotMatch(script, /globalActiveTaskIds[\s\S]{0,300}conversation_id/);
  assert.match(scheduleSource, /const activeTaskIds = globalActiveTaskIds\(\)[\s\S]*emitInstallDeferred\("active_tasks", activeTaskIds\)/);
  assert.match(installSource, /const transaction = beginServiceInstall\(parentLockOwnerPid\)/);
  assert.ok(installSource.indexOf("beginServiceInstall") < installSource.indexOf('spawnSync("schtasks.exe", ["/End"'));
  assert.ok(installSource.indexOf("beginServiceInstall") < installSource.indexOf("stopDaemon()"));
  assert.match(script, /function beginServiceInstall[\s\S]*waitForUpdaterDrainFenceRelease\(fenceWaitMilliseconds\)[\s\S]*waitForTickLock\(fenceWaitMilliseconds\)[\s\S]*resolveUpdaterDrainFenceUnderLock\(\)[\s\S]*acquireServiceInstallFence\(\)[\s\S]*globalActiveTaskIds\(\)/);
  assert.match(script, /function committedGenerationMatchesDrainFence[\s\S]*committed\.epoch === fence\.epoch[\s\S]*committed\.http_sha256 === httpSha[\s\S]*committed\.updater_sha256 === updaterSha/);
  assert.match(script, /function resolveUpdaterDrainFenceUnderLock[\s\S]*isAlive\(ownerPid\)\) return false[\s\S]*committedGenerationMatchesDrainFence\(fence\)/);
  assert.match(script, /__AIWB_AGENT_INSTALL_FENCE_RECOVERED__1/);
  assert.match(script, /__AIWB_AGENT_INSTALL_DEFER_REASON__/);
  assert.match(script, /updater 会自动重试/);
  assert.match(script, /if \(command === "install-service"\) return installService\(args\[0\]\)/);
  assert.match(script, /function matchingComponentProcessIds\(component\)[\s\S]*Get-CimInstance Win32_Process[\s\S]*descriptorMatchesComponent\(item, component\)/);
  assert.match(script, /function stopMatchingComponentProcesses[\s\S]*processMatchesComponent\(pid, component\)[\s\S]*spawnSync\("taskkill\.exe"/);
  assert.match(script, /const remaining = matchingComponentProcessIds\(component\)[\s\S]*if \(liveRemaining\.length\)[\s\S]*ok: false/);
  assert.match(installSource, /cleanupReady = stopDaemon\(\)[\s\S]*if \(cleanupReady\)[\s\S]*registerAndStartServiceTask/);
  assert.match(installSource, /if \(!ready && cleanupReady && !fallbackStarted\)[\s\S]*spawnServiceFallback\(\)/);
});

test("Windows service registration preserves executable and argument boundaries", () => {
  const script = windowsWorkbenchAgentScript("test");
  const registerStart = script.indexOf("function registerAndStartServiceTask(taskName)");
  const installStart = script.indexOf('function installService(parentLockOwnerPid = "")', registerStart);
  const registerSource = script.slice(registerStart, installStart);
  const uninstallStart = script.indexOf("function uninstallService()", installStart);
  const installSource = script.slice(installStart, uninstallStart);

  assert.match(registerSource, /New-ScheduledTaskAction -Execute [\s\S]* -Argument /);
  assert.match(registerSource, /const actionArguments = '\"' \+ CONTROL_FILE \+ '\" service-run'/);
  assert.match(registerSource, /Register-ScheduledTask[\s\S]*Start-ScheduledTask/);
  assert.doesNotMatch(registerSource, /"\/TR"|"\/Create"/);
  assert.doesNotMatch(installSource, /"\/TR"|"\/Create"/);
});

test("Windows service-run owns one machine-wide supervisor tree", () => {
  const script = windowsWorkbenchAgentScript("test");
  const serviceStart = script.indexOf("async function serviceRun()");
  const serviceEnd = script.indexOf("function scheduleInstallService()", serviceStart);
  const serviceSource = script.slice(serviceStart, serviceEnd);

  assert.match(script, /const SERVICE_LOCK = path\.join\(ROOT, "service\.lock"\)/);
  assert.match(script, /function acquireServiceLock\(\)[\s\S]*fs\.mkdirSync\(SERVICE_LOCK\)/);
  assert.match(script, /function clearStaleServiceLock\(\)[\s\S]*if \(!descriptor \|\| !descriptor\.executablePath \|\| !descriptor\.commandLine\) return false/);
  assert.match(script, /if \(descriptorMatchesComponent\(descriptor, "service"\)\) return false/);
  assert.match(script, /fs\.renameSync\(SERVICE_LOCK, quarantine\)/);
  assert.match(serviceSource, /const serviceLockToken = acquireServiceLock\(\)[\s\S]*if \(!serviceLockToken\)[\s\S]*return false/);
  assert.ok(serviceSource.indexOf("acquireServiceLock()") < serviceSource.indexOf("write(SERVICE_PID_FILE"));
  assert.match(serviceSource, /releaseServiceLock\(serviceLockToken\)/);
  assert.match(script, /function ensureDaemon\(\)[\s\S]*spawn\(process\.execPath[\s\S]*child\.unref\(\)/);
  assert.doesNotMatch(script.slice(script.indexOf("function ensureDaemon()"), script.indexOf("async function daemon()")), /write\(PID_FILE, child\.pid\)/);
});

test("superseded Windows supervisor waits for the installer and never self-replaces", () => {
  const script = windowsWorkbenchAgentScript("test");
  const daemonStart = script.indexOf("async function daemon()");
  const serviceStart = script.indexOf("async function serviceRun()", daemonStart);
  const daemonSource = script.slice(daemonStart, serviceStart);
  const supersededCheck = daemonSource.indexOf("installedVersion() !== VERSION");
  const activeScan = daemonSource.indexOf("globalActiveTaskIds()", supersededCheck);

  assert.ok(supersededCheck >= 0 && activeScan > supersededCheck);
  assert.match(daemonSource, /daemon version superseded; waiting for installer handoff/);
  assert.match(daemonSource, /write\(HEARTBEAT_FILE, now\(\)\)[\s\S]*continue/);
  assert.match(daemonSource, /daemon upgrade handoff deferred active_tasks=/);
  assert.doesNotMatch(daemonSource, /spawn\(process\.execPath, \[process\.argv\[1\], "service-run"\]/);
  assert.doesNotMatch(daemonSource.slice(supersededCheck), /return;/);
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
