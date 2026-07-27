import assert from "node:assert/strict";
import {
  isRetryableSshConnectionError,
  runWithSshReconnect,
} from "../src/core/sshReconnect.js";

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

console.log("SSH reconnect tests passed.");
