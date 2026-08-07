import assert from "node:assert/strict";
import {
  interactiveSshConnectTimeoutSeconds,
  isRetryableSshConnectionError,
  isSshStaleConnectionError,
  isSshTransportUnavailableError,
  runWithSshReconnect,
  withInteractiveSshConnectTimeout,
} from "../src/core/sshReconnect.js";
import {
  isTransientSshSyncError,
  shortError,
} from "../src/core/agentOutput.js";

const noWait = async () => {};

{
  let calls = 0;
  const result = await runWithSshReconnect(
    async () => {
      calls += 1;
      return "ok";
    },
    { wait: noWait },
  );
  assert.equal(result, "ok");
  assert.equal(calls, 1);
}

{
  let calls = 0;
  const retries = [];
  const result = await runWithSshReconnect(
    async () => {
      calls += 1;
      if (calls < 3) throw new Error("Connection closed");
      return "recovered";
    },
    {
      wait: noWait,
      onRetry: ({ reconnectAttempt }) => retries.push(reconnectAttempt),
    },
  );
  assert.equal(result, "recovered");
  assert.equal(calls, 3);
  assert.deepEqual(retries, [1, 2]);
}

{
  let calls = 0;
  await assert.rejects(
    runWithSshReconnect(
      async () => {
        calls += 1;
        throw new Error("ECONNREFUSED");
      },
      { wait: noWait },
    ),
    (error) => error.code === "AIWB_SSH_CONNECTION_FAILED" && error.message === "连接异常",
  );
  assert.equal(calls, 4);
}

{
  let calls = 0;
  await assert.rejects(
    runWithSshReconnect(
      async () => {
        calls += 1;
        throw new Error("All configured authentication methods failed");
      },
      { wait: noWait },
    ),
    /authentication methods failed/i,
  );
  assert.equal(calls, 1);
}

assert.equal(isRetryableSshConnectionError(new Error("SSH command timed out")), false);
assert.equal(isRetryableSshConnectionError(new Error("Connection lost before handshake")), true);
assert.equal(isRetryableSshConnectionError(new Error("SSH command failed: NIOSSHError.tcpShutdown")), true);
assert.equal(isTransientSshSyncError(new Error("SSH command failed: NIOSSHError.tcpShutdown")), true);
assert.equal(shortError(new Error("SSH command failed: NIOSSHError.tcpShutdown")), "连接断开");

assert.equal(interactiveSshConnectTimeoutSeconds, 10);
assert.equal(withInteractiveSshConnectTimeout({ connectTimeoutSeconds: 30 }).connectTimeoutSeconds, 10);
assert.equal(withInteractiveSshConnectTimeout({ connectTimeoutSeconds: 6 }).connectTimeoutSeconds, 6);
assert.equal(isSshTransportUnavailableError(new Error("Connect timeout (30 s)")), true);
assert.equal(
  isSshTransportUnavailableError(new Error("SSH 连接超时：请确认网络可达。原始错误：Connect timeout (30 s)")),
  true,
);
assert.equal(isSshTransportUnavailableError(new Error("NIOSSHError.creatingChannelAfterClosure")), true);
assert.equal(isSshStaleConnectionError(new Error("NIOSSHError.creatingChannelAfterClosure")), true);
assert.equal(isSshStaleConnectionError(new Error("Connect timeout (10 s)")), false);
assert.equal(isSshTransportUnavailableError(new Error("All configured authentication methods failed")), false);
assert.equal(isSshTransportUnavailableError(new Error("remote command exited with status 1")), false);

console.log("SSH reconnect tests passed.");
