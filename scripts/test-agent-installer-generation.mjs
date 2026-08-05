import assert from "node:assert/strict";
import {
  buildInstallWorkbenchAgentCommand,
  healthFromWorkbenchAgentStatus,
  parseWorkbenchAgentOutput,
  workbenchAgentAvailableFromOutput,
  workbenchAgentScript,
} from "../src/core/agent.js";
import { windowsWorkbenchAgentScript } from "../src/core/windowsAgent.js";

const windowsInstall = buildInstallWorkbenchAgentCommand({ platform: "windows", host: "127.0.0.1" });
assert.equal(typeof windowsInstall, "object");
const powershell = windowsInstall.stdin;

assert.match(powershell, /function Get-AiwbActiveTaskCount/);
assert.match(powershell, /function Test-AiwbTaskRunner/);
assert.match(powershell, /function Test-AiwbPidDescendant/);
assert.match(powershell, /__AIWB_AGENT_INSTALL_DEFER_REASON__active_tasks/);
assert.match(powershell, /command_pid/);
assert.match(powershell, /status -eq "preparing".*Get-AiwbTaskAgeSeconds/s);
assert.match(powershell, /A queued task without a live process is preserved/);
assert.match(powershell, /function Enter-AiwbUpgradeLock/);
assert.match(powershell, /Join-Path \$AIWB_HOME "tick\.lock"/);
assert.match(powershell, /function Exit-AiwbUpgradeLock/);
assert.match(powershell, /-not \(Test-AiwbProcessAlive \$owner\).*TotalSeconds -gt 30/s);
assert.match(powershell, /function Test-AiwbComponentPidFile/);
assert.match(powershell, /Get-CimInstance Win32_Process/);
assert.match(powershell, /service\.runtime\.sha256/);
assert.match(powershell, /Test-AiwbHeartbeatFresh/);
assert.doesNotMatch(powershell, /function Test-AiwbPidFile/);
assert.match(powershell, /function Restore-AiwbReplacementSet/);
assert.match(powershell, /function Restart-AiwbPreviousSupervisor/);
assert.match(powershell, /__AIWB_AGENT_INSTALL_ROLLBACK__restored/);
assert.match(powershell, /Join-Path \$AIWB_HOME "runtime\.generation"/);
assert.match(powershell, /Join-Path \$AIWB_HOME "runtime-update\.fence"/);
assert.match(powershell, /function Test-AiwbCommittedGeneration/);
assert.match(powershell, /\$record\["format"\] -eq "1"/);
assert.match(powershell, /\$record\["state"\] -eq "committed"/);
assert.match(powershell, /\$record\["control_sha256"\] -eq \$AIWB_EXPECTED_SHA/);
assert.match(powershell, /\$record\["http_sha256"\] -eq \$directSha/);
assert.match(powershell, /\$record\["updater_sha256"\] -eq \$updaterSha/);
assert.match(powershell, /function Enter-AiwbInstallFence/);
assert.match(powershell, /"format=1",\s*"state=draining"/);
assert.match(powershell, /"target_version=" \+ \(ConvertTo-AiwbGenerationField \$AIWB_REMOTE_VERSION_NORMALIZED\)/);
assert.match(powershell, /"target_control_sha256=" \+ \(ConvertTo-AiwbGenerationField \$AIWB_EXPECTED_SHA\)/);
assert.match(powershell, /function Exit-AiwbInstallTransaction[\s\S]*Exit-AiwbInstallFence[\s\S]*Exit-AiwbUpgradeLock/);
assert.match(powershell, /\$AIWB_INSTALLED_VERSION_NUM -ge \$AIWB_REMOTE_VERSION_NUM -and\s*\(Test-AiwbCommittedGeneration\) -and/);
assert.match(powershell, /"state=committed"/);
assert.match(powershell, /Source = \$AIWB_GENERATION_STAGE; Target = \$AIWB_RUNTIME_GENERATION/);

const directStage = powershell.indexOf("Receive-AiwbRuntimeStage $AIWB_DIRECT_RUNTIME");
const updaterStage = powershell.indexOf("Receive-AiwbRuntimeStage $AIWB_UPDATER_RUNTIME");
const lock = powershell.indexOf("Enter-AiwbUpgradeLock", updaterStage);
const fence = powershell.indexOf("if (-not (Enter-AiwbInstallFence))", lock);
const quiet = powershell.indexOf("Start-Sleep -Milliseconds 250", fence);
const lateDrain = powershell.indexOf("$AIWB_ACTIVE_TASK_COUNT = Get-AiwbActiveTaskCount", quiet);
const generationStage = powershell.indexOf("$AIWB_GENERATION_STAGE = $AIWB_RUNTIME_GENERATION", lateDrain);
const replacements = powershell.indexOf("$AIWB_REPLACEMENTS = @(", generationStage);
const controlReplacement = powershell.indexOf("Source = $AIWB_SCRIPT_TMP", replacements);
const directReplacement = powershell.indexOf("Source = $AIWB_DIRECT_TMP", replacements);
const updaterReplacement = powershell.indexOf("Source = $AIWB_UPDATER_TMP", replacements);
const generationReplacement = powershell.indexOf("Source = $AIWB_GENERATION_STAGE", replacements);
const firstReplacement = powershell.indexOf("Move-Item -LiteralPath $item.Source", lock);
const releaseFence = powershell.indexOf("Exit-AiwbInstallFence", firstReplacement);
const installService = powershell.indexOf("& $AIWB_NODE_COMMAND.Source $AIWB_SCRIPT install-service", releaseFence);
assert.ok(directStage > 0 && updaterStage > directStage);
assert.ok(lock > updaterStage, "all runtime artifacts must be staged before taking the replacement lock");
assert.ok(fence > lock, "the update fence must be published only while tick.lock is held");
assert.ok(quiet > fence && lateDrain > quiet, "a quiet window and second active-task scan must follow fence publication");
assert.ok(generationStage > lateDrain, "the committed generation must be staged only after the late drain check");
assert.ok(controlReplacement > replacements && directReplacement > controlReplacement);
assert.ok(updaterReplacement > directReplacement && generationReplacement > updaterReplacement);
assert.ok(firstReplacement > lock, "replacement must happen only after the task-launch lock is held");
assert.ok(releaseFence > firstReplacement, "the fence must remain until the generation commit loop finishes");
assert.ok(installService > releaseFence, "the committed generation must be visible before the new supervisor starts");
assert.ok(
  powershell.lastIndexOf("Remove-AiwbReplacementBackups") > powershell.indexOf("$AIWB_INSTALL_EXIT_CODE = $LASTEXITCODE"),
  "backups must remain available until supervisor startup has succeeded",
);
assert.ok(
  powershell.indexOf("Restore-AiwbReplacementSet", powershell.indexOf("if ($AIWB_INSTALL_EXIT_CODE -ne 0)")) > installService,
  "a failed supervisor start must restore runtime files and runtime.generation",
);
assert.equal(
  powershell.includes('$AIWB_GENERATION_LINES -join "`n"'),
  true,
  "the generated PowerShell must retain its newline escape instead of terminating the JS template",
);

assert.match(workbenchAgentScript(), /__AIWB_AGENT_GENERATION_READY__%s/);
assert.match(windowsWorkbenchAgentScript(), /__AIWB_AGENT_GENERATION_READY__/);

const completeV54Status = [
  "__AIWB_AGENT_STATUS__ready",
  "__AIWB_AGENT_VERSION__54",
  "__AIWB_AGENT_GENERATION_READY__1",
  "__AIWB_AGENT_SERVICE_PROCESS_STATUS__running",
  "__AIWB_AGENT_DAEMON_STATUS__running",
  "__AIWB_AGENT_HTTP_STATUS__running",
  "__AIWB_AGENT_UPDATER_STATUS__running",
].join("\n");
const parsedV54 = parseWorkbenchAgentOutput(completeV54Status);
assert.equal(parsedV54.generationReady, "1");
assert.equal(healthFromWorkbenchAgentStatus(parsedV54).agent_generation_ready, "1");
assert.equal(workbenchAgentAvailableFromOutput(completeV54Status), true);
assert.equal(
  workbenchAgentAvailableFromOutput(completeV54Status.replace("GENERATION_READY__1", "GENERATION_READY__0")),
  false,
);
assert.equal(
  workbenchAgentAvailableFromOutput(
    completeV54Status.replace("VERSION__54", "VERSION__53").replace("__AIWB_AGENT_GENERATION_READY__1\n", ""),
  ),
  true,
);

console.log("cross-platform Agent installer safety generation: ok");
