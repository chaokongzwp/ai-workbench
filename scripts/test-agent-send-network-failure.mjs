import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const controller = readFileSync(new URL("../src/app/useWorkbenchController.jsx", import.meta.url), "utf8");

assert.match(
  controller,
  /const agentSetupPromisesRef = useRef\(new Map\(\)\);/,
  "Agent setup must be shared by every session targeting the same connection",
);
assert.match(
  controller,
  /const existingPromise = agentSetupPromisesRef\.current\.get\(connectionKey\);[\s\S]*return existingPromise;/,
  "a concurrent Agent setup must reuse the in-flight promise",
);

const setupStart = controller.indexOf("async function ensureWorkbenchAgentForProfileOnce");
const setupEnd = controller.indexOf("async function uploadImageAttachmentsForProfile", setupStart);
assert.ok(setupStart >= 0 && setupEnd > setupStart, "Agent setup implementation must remain discoverable");
const setupSource = controller.slice(setupStart, setupEnd);
const transportAbort = setupSource.indexOf("isSshTransportUnavailableError(probeError)");
const installAttempt = setupSource.indexOf("buildInstallWorkbenchAgentCommand(currentProfile)");
assert.ok(transportAbort >= 0, "Agent setup must classify SSH transport failures");
assert.ok(installAttempt > transportAbort, "network failure must abort before Agent installation is attempted");
assert.match(
  setupSource,
  /withInteractiveSshConnectTimeout\(withKnownPassword\(requestedProfile\)\)/,
  "interactive Agent setup must cap SSH connection time",
);

assert.match(
  controller,
  /runRemoteCommandForProfile\(\s*withInteractiveSshConnectTimeout\(healthResolvedProfile\)/,
  "the first send-time Agent probe must use the short connection timeout",
);
assert.match(
  controller,
  /routeProbeError &&[\s\S]*isSshTransportUnavailableError\(routeProbeError\)[\s\S]*!isSshStaleConnectionError\(routeProbeError\)[\s\S]*throw routeProbeError;/,
  "a send-time connect failure must stop before a second Agent setup probe",
);

console.log("Agent send network failure regression: ok");
