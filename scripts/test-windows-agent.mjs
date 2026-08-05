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

  assert.match(script, /const accepted = created\.status === 0 && started\.status === 0/);
  assert.match(script, /if \(!accepted\) \{[\s\S]*process\.exitCode = 3/);
  assert.match(script, /function installServiceHandoff\(\) \{[\s\S]*ready = installService\(\)[\s\S]*if \(!ready\) process\.exitCode = 3/);
  assert.match(script, /const command = '\"' \+ process\.execPath \+ '\" \"' \+ CONTROL_FILE \+ '\" install-service-handoff'/);
  assert.match(script, /return ready;\n\}/);
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
