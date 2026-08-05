import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./verify-live-agent.mjs", import.meta.url), "utf8");

assert.match(source, /versionNumber\(latestWorkbenchAgentVersion\)/);
assert.match(source, /defaultExpectedResponse/);
assert.match(source, /trustedAgentPlatform\(health\.platform\)/);
assert.match(source, /taskStatus !== "done"/);
assert.match(source, /taskOutcome !== "success"/);
assert.match(source, /taskExitCode !== "0"/);
assert.match(source, /!expectedResponse \|\| response !== expectedResponse/);
assert.match(source, /createMode === "create-now"/);

console.log("live Agent verifier fail-closed regression: ok");
