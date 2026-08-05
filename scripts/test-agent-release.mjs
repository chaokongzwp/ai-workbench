import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./release-agent.mjs", import.meta.url), "utf8");
const updaterSource = readFileSync(new URL("../agent/runtime/aiwb-agent-updater.mjs", import.meta.url), "utf8");
const directRuntimeSource = readFileSync(new URL("../agent/runtime/aiwb-agent-http.mjs", import.meta.url), "utf8");

assert.match(source, /workbenchAgentControlEndpoint/);
assert.match(source, /AIWB_AGENT_CONTROL_ADMIN_TOKEN/);
assert.match(source, /com\.beexofficial\.aiworkbench\.agent-control-admin/);
assert.match(source, /fetch\(`\$\{controlEndpoint\}\/publish`/);
assert.match(source, /fetch\(`\$\{controlEndpoint\}\/latest`/);
assert.match(source, /String\(controlLatest\?\.agent\?\.version \|\| ""\) !== version/);
assert.match(source, /const releaseSourcePaths = \[/);
assert.match(source, /"src\/core\/windowsAgent\.js"/);
assert.match(updaterSource, /if \(!singleRun && result\?\.updated\)/);
assert.match(updaterSource, /await restartInstalledRuntime\(\)/);
assert.match(updaterSource, /join\(home, "http\.pid"\)/);
assert.match(directRuntimeSource, /directRuntimePidPath/);

console.log("agent release control-center regression: ok");
