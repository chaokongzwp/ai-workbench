import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./release-agent.mjs", import.meta.url), "utf8");
const exportSource = readFileSync(new URL("./export-agent-release.mjs", import.meta.url), "utf8");
const updaterSource = readFileSync(new URL("../agent/runtime/aiwb-agent-updater.mjs", import.meta.url), "utf8");
const directRuntimeSource = readFileSync(new URL("../agent/runtime/aiwb-agent-http.mjs", import.meta.url), "utf8");
const unixAgentSource = readFileSync(new URL("../src/core/agent.js", import.meta.url), "utf8");
const windowsAgentSource = readFileSync(new URL("../src/core/windowsAgent.js", import.meta.url), "utf8");

assert.match(source, /workbenchAgentControlEndpoint/);
assert.match(source, /AIWB_AGENT_CONTROL_ADMIN_TOKEN/);
assert.match(source, /com\.beexofficial\.aiworkbench\.agent-control-admin/);
assert.match(source, /minimumControlServiceVersion = 8/);
assert.match(source, /fetch\(`\$\{controlEndpoint\}\/publish`/);
assert.match(source, /fetch\(`\$\{controlEndpoint\}\/latest`/);
assert.match(source, /String\(latest\?\.agent\?\.version \|\| ""\) !== version/);
assert.match(source, /"linux\/aiwbctl": entries\.linux\.toString\("base64"\)/);
assert.match(source, /"macos\/aiwbctl": entries\.macos\.toString\("base64"\)/);
assert.match(source, /"windows\/aiwb-agent\.mjs": entries\.windows\.toString\("base64"\)/);
assert.match(source, /latest\?\.agent\?\.source !== "config-center"/);
assert.match(source, /verifiedHostedRuntimeUrls/);
assert.match(source, /hosted\.directRuntime/);
assert.match(source, /hosted\.updaterRuntime/);
assert.match(source, /runtimeResponse = await fetch\(runtimeUrl/);
assert.match(source, /HTTP runtime/);
assert.match(source, /updater runtime/);
assert.match(source, /unixVersionOutput\.match\(\/\^v\?\(\[0-9\]\+/);
assert.doesNotMatch(source, /git\(\[|git push|raw\.githubusercontent|workbenchAgentGithub/);
assert.doesNotMatch(exportSource, /github|raw\.githubusercontent/i);
assert.match(exportSource, /platform: "linux"/);
assert.match(exportSource, /platform: "macos"/);
assert.match(exportSource, /platform: "windows"/);
assert.match(exportSource, /const sameGeneration =/);
assert.match(exportSource, /existing\?\.sha256 === unixSha256/);
assert.match(exportSource, /existing\?\.directRuntime\?\.sha256 === directRuntimeSha256/);
assert.match(exportSource, /existing\?\.updaterRuntime\?\.sha256 === updaterRuntimeSha256/);

assert.match(updaterSource, /function inspectRuntimeConsistency\(expectation\)/);
assert.match(updaterSource, /runtimeRecoveryPending: true/);
assert.match(updaterSource, /await restartInstalledRuntime\(\)/);
const updaterRestartCall = updaterSource.indexOf("await restartInstalledRuntime()");
assert.ok(updaterRestartCall > 0);
assert.ok(
  updaterSource.lastIndexOf("runtimeRecoveryPending: true", updaterRestartCall)
    > updaterSource.lastIndexOf("runtimeRecoveryPending: false", updaterRestartCall),
  "updater must persist recovery intent before restarting the runtime",
);
assert.match(updaterSource, /join\(home, "http\.pid"\)/);
assert.match(updaterSource, /function managedServiceConfigured\(\)/);
assert.match(updaterSource, /function activeTaskCount\(\)/);
assert.match(updaterSource, /reason: "active_tasks"/);
assert.match(updaterSource, /function clearFinishedOrAbandonedRuntimeUpdateFence\(\)/);
assert.match(updaterSource, /function runtimeUpdateFenceTransactionCommitted\(\)/);
assert.match(updaterSource, /committed\.epoch === fence\.epoch/);
assert.match(updaterSource, /ownerPid > 1 && processAlive\(ownerPid\)/);
assert.match(updaterSource, /if \(!transactionCommitted\) return false/);
assert.match(updaterSource, /fence\.state === "draining"/);
assert.match(updaterSource, /committed\.http_sha256 === fileSha256/);
assert.match(updaterSource, /committed\.updater_sha256 === fileSha256/);
const acquireUpdateLockSource = updaterSource.slice(
  updaterSource.indexOf("function acquireUpdateLock()"),
  updaterSource.indexOf("function releaseUpdateLock()"),
);
assert.match(acquireUpdateLockSource, /if \(sameOwner\) return false/);
assert.doesNotMatch(acquireUpdateLockSource, /committedTakeover/);
assert.match(acquireUpdateLockSource, /Date\.now\(\) - fileModifiedAtMs\(updateLockPath\) < lockAcquisitionGraceMs/);
const updaterLockIndex = updaterSource.indexOf("if (!acquireUpdateLock())");
const abandonedFenceRecoveryIndex = updaterSource.indexOf("clearFinishedOrAbandonedRuntimeUpdateFence();", updaterLockIndex);
const updaterFetchIndex = updaterSource.indexOf("const result = await updateOnce();", updaterLockIndex);
assert.ok(
  updaterLockIndex >= 0 && abandonedFenceRecoveryIndex > updaterLockIndex && abandonedFenceRecoveryIndex < updaterFetchIndex,
  "the updater must clear a dead owner's generation fence while holding the update lock",
);
assert.match(updaterSource, /function agentPlatform\(\)/);
assert.match(updaterSource, /body\?\.platforms\?\.\[platform\]\?\.manifestUrl/);
assert.match(updaterSource, /process\.platform === "darwin"/);
assert.match(updaterSource, /if \(managedServiceConfigured\(\)\)/);
assert.doesNotMatch(updaterSource, /if \(managedServiceConfigured\(\)\) return/);
assert.match(updaterSource, /openSync\(updaterPidPath, "wx"/);
assert.match(updaterSource, /function requestUrl\(/);
assert.doesNotMatch(updaterSource, /\bfetch\(/);

assert.match(directRuntimeSource, /directRuntimePidPath/);
assert.match(directRuntimeSource, /openSync\(directRuntimePidPath, "wx"/);
assert.match(directRuntimeSource, /setInterval\(register, controlRegistrationIntervalMs\)/);
assert.doesNotMatch(directRuntimeSource, /\bfetch\(/);
assert.match(directRuntimeSource, /New-SelfSignedCertificate/);
assert.match(directRuntimeSource, /pfx: readFileSync/);
assert.match(directRuntimeSource, /resolve\(directRuntimePath\)/);
assert.doesNotMatch(directRuntimeSource, /new URL\(import\.meta\.url\)\.pathname/);
assert.match(directRuntimeSource, /control\(\["--version"\]\)/);
assert.match(directRuntimeSource, /if \(runtime === "darwin"\) return "macos"/);
assert.match(directRuntimeSource, /!existsSync\(join\(agentHome, "runtime-update\.fence"\)\)/);
assert.match(directRuntimeSource, /generation\.state === "committed"/);

assert.match(unixAgentSource, /aiwb_service_run\(\)/);
assert.match(unixAgentSource, /<string>service-run<\/string>/);
assert.match(unixAgentSource, /ExecStart=\$AIWB_HOME\/aiwbctl service-run/);
assert.match(unixAgentSource, /WantedBy=default\.target/);
assert.match(unixAgentSource, /systemctl --user enable --now ai-workbench-agent\.service/);
assert.match(unixAgentSource, /loginctl enable-linger/);
const launchdLoadedBlock = unixAgentSource.slice(
  unixAgentSource.indexOf('if [ "$launchd_loaded" = "1" ]'),
  unixAgentSource.indexOf('__AIWB_AGENT_SERVICE__launchd-fallback'),
);
const macInstallBlock = unixAgentSource.slice(
  unixAgentSource.indexOf("aiwb_install_service()"),
  unixAgentSource.indexOf('if ! command -v systemctl', unixAgentSource.indexOf("aiwb_install_service()")),
);
assert.doesNotMatch(
  macInstallBlock,
  /launchctl bootout/,
  "macOS service installation must be idempotent when update triggers overlap",
);
assert.doesNotMatch(
  launchdLoadedBlock,
  /launchctl bootout/,
  "a slow runtime restart must not unload a valid macOS auto-start service",
);
assert.match(
  unixAgentSource,
  /if \[ -f "\$AIWB_LAUNCH_AGENT_PLIST" \]; then\s*launchctl bootout/,
  "an isolated Agent home must not unload another instance's macOS service",
);
assert.match(updaterSource, /\.config", "systemd", "user", "ai-workbench-agent\.service/);
assert.match(updaterSource, /\["--user", "is-active", "--quiet", "ai-workbench-agent\.service"\]/);
assert.match(windowsAgentSource, /async function serviceRun\(\)/);
assert.match(windowsAgentSource, /process\.argv\[1\], "service-run"/);
assert.match(windowsAgentSource, /if \(installedVersion\(\) !== VERSION\)/);
assert.match(unixAgentSource, /WriteAllText\(\(Join-Path \$AIWB_HOME "updater\.json"\)/);
assert.match(unixAgentSource, /AIWB_AGENT_CONTROL_URL=\$\{shQuote\(workbenchAgentControlLatestUrl\)\}/);
assert.match(unixAgentSource, /AIWB_AGENT_MANIFEST_FIELD="macosManifestUrl"/);
assert.match(unixAgentSource, /AIWB_AGENT_MANIFEST_FIELD="linuxManifestUrl"/);
assert.match(unixAgentSource, /\$AIWB_MANIFEST_URL = \[string\]\$AIWB_CONTROL\.windowsManifestUrl/);
assert.match(unixAgentSource, /__AIWB_AGENT_INSTALL_SOURCE__config-center/);
assert.doesNotMatch(unixAgentSource, /raw\.githubusercontent/);

console.log("agent release control-center regression: ok");
