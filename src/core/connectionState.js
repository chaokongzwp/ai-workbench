const channelStates = new Set(["disconnected", "connecting", "connected"]);
const activeTaskStates = new Set(["submitting", "running", "syncing"]);

// Connection and task state are intentionally orthogonal. A task may still be
// running remotely when the App loses its SSH/Agent channel.
export function channelStateForConnection(connection = {}) {
  const explicit = String(connection.channelState || "").trim().toLowerCase();
  if (channelStates.has(explicit)) return explicit;

  const legacy = String(connection.state || "idle").trim().toLowerCase();
  if (legacy === "connected") return "connected";
  if (legacy === "testing") return "connecting";
  return "disconnected";
}

export function legacyConnectionState(channelState, previousState = "idle") {
  if (channelState === "connected") return "connected";
  if (channelState === "connecting") return "testing";
  return String(previousState || "").trim().toLowerCase() === "error" ? "error" : "idle";
}

export function canonicalConnectionState(connection = {}) {
  const channelState = channelStateForConnection(connection);
  return {
    ...connection,
    channelState,
    state: legacyConnectionState(channelState, connection.state),
  };
}

export function connectionIsLive(connection) {
  return channelStateForConnection(connection) === "connected";
}

export function connectionStatusPresentation(connection) {
  const channelState = channelStateForConnection(connection);
  if (channelState === "connected") return { label: "已连接", tone: "connected" };
  if (channelState === "connecting") {
    const label = String(connection?.label || "").trim();
    return { label: label === "连接断开" ? "连接断开" : "连接中", tone: "testing" };
  }
  if (String(connection?.state || "").trim().toLowerCase() === "error") {
    return { label: "连接异常", tone: "error" };
  }
  return { label: "未连接", tone: "idle" };
}

export function taskChannelState(connection, taskState) {
  const task = String(taskState || "idle").trim().toLowerCase();
  if (!activeTaskStates.has(task)) return task;
  const channelState = channelStateForConnection(connection);
  if (channelState === "disconnected") return "sync-lost";
  if (channelState === "connecting") return "syncing";
  return task;
}
