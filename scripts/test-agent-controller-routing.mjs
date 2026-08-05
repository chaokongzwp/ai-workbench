import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/app/useWorkbenchController.jsx", import.meta.url), "utf8");

assert.match(source, /trustedDirectPlatform = trustedAgentPlatform\(directHealth\?\.platform\)/);
assert.match(source, /platform: trustedDirectPlatform/);
assert.match(source, /agentTaskSubmissionReady\(/);
assert.match(source, /setup\.taskSubmissionReady === false/);
assert.match(source, /plannedCreateTransport === "direct"/);
assert.match(source, /createThroughSshContext \? "ssh-create-now" : "ssh-create"/);
assert.match(source, /__AIWB_AGENT_ERROR_CODE__generation_changed/);
assert.match(source, /Agent 刚完成升级/);

console.log("Agent controller fail-closed routing regression: ok");
