import assert from "node:assert/strict";
import {
  canonicalConnectionState,
  channelStateForConnection,
  connectionIsLive,
  taskChannelState,
} from "../src/core/connectionState.js";

assert.equal(channelStateForConnection({ state: "idle" }), "disconnected");
assert.equal(channelStateForConnection({ state: "testing" }), "connecting");
assert.equal(channelStateForConnection({ state: "connected" }), "connected");
assert.deepEqual(canonicalConnectionState({ state: "error" }), { state: "error", channelState: "disconnected" });
assert.equal(connectionIsLive({ channelState: "connected", state: "idle" }), true);

// The transport dropping must not turn a remote running task into a failure.
assert.equal(taskChannelState({ channelState: "disconnected" }, "running"), "sync-lost");
assert.equal(taskChannelState({ channelState: "connecting" }, "running"), "syncing");
assert.equal(taskChannelState({ channelState: "connected" }, "running"), "running");
assert.equal(taskChannelState({ channelState: "disconnected" }, "completed"), "completed");

console.log("connection and task state regression: ok");
