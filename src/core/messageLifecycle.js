export const taskStateSubmitting = "submitting";
export const taskStateAccepted = "accepted";
export const taskStateRunning = "running";
export const taskStateSyncing = "syncing";
export const taskStateSucceeded = "succeeded";
export const taskStateFailed = "failed";
export const taskStateCancelled = "cancelled";

export const taskStates = Object.freeze({
  submitting: taskStateSubmitting,
  accepted: taskStateAccepted,
  running: taskStateRunning,
  syncing: taskStateSyncing,
  succeeded: taskStateSucceeded,
  failed: taskStateFailed,
  cancelled: taskStateCancelled,
});

const validTaskStates = new Set(Object.values(taskStates));
const activeTaskStates = new Set([
  taskStateSubmitting,
  taskStateAccepted,
  taskStateRunning,
  taskStateSyncing,
]);
const terminalTaskStates = new Set([
  taskStateSucceeded,
  taskStateFailed,
  taskStateCancelled,
]);

const taskOutcomeByState = Object.freeze({
  [taskStateSucceeded]: "success",
  [taskStateFailed]: "error",
  [taskStateCancelled]: "cancelled",
});
const failedRemoteTaskStatuses = new Set([
  "error",
  "missing",
  "deferred-waiting-answer",
  "sync-lost-no-task-id",
  "ssh-unrecoverable",
]);

function text(value) {
  return String(value || "").trim();
}

export function taskStateIsActive(state) {
  return activeTaskStates.has(text(state));
}

export function taskStateIsTerminal(state) {
  return terminalTaskStates.has(text(state));
}

// The UI can retain its detailed local presentation while transport code only
// needs this stable two-level contract: running, or completed with an outcome.
export function taskLifecycleForState(state) {
  const normalized = text(state);
  if (taskStateIsTerminal(normalized)) {
    return { status: "completed", outcome: taskOutcomeByState[normalized] || "error" };
  }
  return { status: "running", outcome: "" };
}

export function taskLifecycleForMessage(message) {
  return taskLifecycleForState(taskStateForMessage(message));
}

export function taskNeedsRemoteSync(message) {
  return message?.role === "assistant" && taskLifecycleForMessage(message).status !== "completed";
}

export function taskStateFromRemoteStatus(remoteStatus, { hasTaskId = false, resultMissing = false } = {}) {
  const status = text(remoteStatus);
  if (status === "preparing") return taskStateSubmitting;
  if (status === "queued" || status === "busy") return taskStateAccepted;
  if (status === "running") return taskStateRunning;
  if (status === "syncing" || status === "sync-lost" || status === "sync-timeout" || status === "unknown") {
    return hasTaskId ? taskStateSyncing : taskStateFailed;
  }
  if (status === "done") return resultMissing ? taskStateFailed : taskStateSucceeded;
  if (status === "cancelled") return taskStateCancelled;
  if (failedRemoteTaskStatuses.has(status)) return taskStateFailed;
  return "";
}

// Old local records are translated once, then normalizeMessageLifecycle removes
// their legacy fields before the rest of the app sees them.
function migratedTaskState(message) {
  const status = text(message?.status);
  const remoteStatus = text(message?.remoteTaskStatus);
  const stateFromRemote = taskStateFromRemoteStatus(remoteStatus, {
    hasTaskId: Boolean(text(message?.remoteTaskId)),
    resultMissing: message?.resultMissing === true || Boolean(message?.agentFailure),
  });

  if (status === "cancelled" || remoteStatus === "cancelled" || Number(message?.cancelledAt || 0) > 0) {
    return taskStateCancelled;
  }
  if (status === "done") return message?.resultMissing === true ? taskStateFailed : taskStateSucceeded;
  if (status === "error") {
    return ["sync-lost", "sync-timeout"].includes(remoteStatus) && text(message?.remoteTaskId)
      ? taskStateSyncing
      : taskStateFailed;
  }
  if (stateFromRemote) return stateFromRemote;
  if (status === "running" || status === "preparing" || status === "queued" || status === "unknown") {
    return taskStateRunning;
  }
  if (message?.resultMissing === true || Boolean(message?.agentFailure)) return taskStateFailed;
  return taskStateSucceeded;
}

export function taskStateForMessage(message) {
  if (message?.role !== "assistant") return "";
  const explicit = text(message?.taskState);
  return validTaskStates.has(explicit) ? explicit : migratedTaskState(message);
}

export function taskStateForUpdate(currentMessage, patch = {}) {
  const explicit = text(patch?.taskState);
  if (validTaskStates.has(explicit)) return explicit;
  return taskStateForMessage(currentMessage);
}

export function normalizeMessageLifecycle(message, now = Date.now()) {
  const source = message && typeof message === "object" ? message : {};
  const {
    status: _legacyStatus,
    responsePhase: _legacyResponsePhase,
    responseOutcome: _legacyResponseOutcome,
    syncState: _legacySyncState,
    ...clean
  } = source;
  if (source.role !== "assistant") return clean;

  const taskState = taskStateForMessage(source);
  const active = taskStateIsActive(taskState);
  const requiredAction =
    text(source.requiredAction) ||
    (_legacyStatus === "login" ? "login" : _legacyStatus === "choice" ? "model-choice" : "");
  const completedAt = active ? undefined : Number(source.completedAt || 0) || now;
  const startedAt = Number(source.startedAt || source.createdAtMs || 0);
  return {
    ...clean,
    taskState,
    requiredAction: requiredAction || undefined,
    liveOutput: active ? source.liveOutput || "" : "",
    completedAt: active ? undefined : completedAt,
    durationMs:
      active
        ? undefined
        : Number(source.durationMs || 0) ||
          (startedAt > 0 ? Math.max(0, completedAt - startedAt) : undefined),
  };
}

export function messageLifecycleIdentity(message) {
  const role = text(message?.role);
  const taskId = text(message?.remoteTaskId);
  const turnId = text(message?.turnId || message?.messagePairId);
  const id = text(message?.id);
  if (role && taskId) return `task:${role}:${taskId}`;
  if (role && turnId) return `turn:${role}:${turnId}`;
  return id ? `id:${id}` : "";
}

function positiveTimestamp(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function timestampFromMessageId(message) {
  const match = text(message?.id).match(/(?:^|\D)([12]\d{12})(?:\D|$)/);
  return positiveTimestamp(match?.[1]);
}

export function messageChronologyTimestamp(message) {
  return (
    positiveTimestamp(message?.createdAtMs) ||
    positiveTimestamp(message?.startedAt) ||
    timestampFromMessageId(message) ||
    positiveTimestamp(message?.completedAt)
  );
}

export function sortConversationMessages(messages = []) {
  const entries = (Array.isArray(messages) ? messages : [])
    .filter((message) => message && typeof message === "object")
    .map((message, index) => ({
      message,
      index,
      timestamp: messageChronologyTimestamp(message),
      turnId: text(message?.turnId || message?.messagePairId),
    }));
  const messageTurnIds = new Map(
    entries
      .filter(({ message, turnId }) => text(message?.id) && turnId)
      .map(({ message, turnId }) => [text(message.id), turnId]),
  );
  const turnAnchors = new Map();

  for (const entry of entries) {
    if (!entry.turnId) entry.turnId = messageTurnIds.get(text(entry.message?.replyToMessageId)) || "";
    if (!entry.turnId) continue;
    const current = turnAnchors.get(entry.turnId);
    if (!current) {
      turnAnchors.set(entry.turnId, { timestamp: entry.timestamp, index: entry.index });
      continue;
    }
    if (entry.timestamp && (!current.timestamp || entry.timestamp < current.timestamp)) {
      current.timestamp = entry.timestamp;
    }
    current.index = Math.min(current.index, entry.index);
  }

  const roleOrder = (message) => (message?.role === "user" ? 0 : message?.role === "assistant" ? 1 : 2);
  return entries
    .sort((left, right) => {
      const leftAnchor = left.turnId ? turnAnchors.get(left.turnId) : null;
      const rightAnchor = right.turnId ? turnAnchors.get(right.turnId) : null;
      const leftTime = leftAnchor?.timestamp || left.timestamp;
      const rightTime = rightAnchor?.timestamp || right.timestamp;

      if (leftTime && rightTime && leftTime !== rightTime) return leftTime - rightTime;
      if (left.turnId && left.turnId === right.turnId) {
        const roleDifference = roleOrder(left.message) - roleOrder(right.message);
        if (roleDifference) return roleDifference;
      }
      if (leftTime && !rightTime) return -1;
      if (!leftTime && rightTime) return 1;
      return (leftAnchor?.index ?? left.index) - (rightAnchor?.index ?? right.index) || left.index - right.index;
    })
    .map(({ message }) => message);
}

function contentQuality(message) {
  const normalized = normalizeMessageLifecycle(message);
  const state = normalized.taskState;
  const hasOutput = Boolean(text(normalized.output));
  const hasBody = Boolean(text(normalized.body));
  const hasLiveOutput = Boolean(text(normalized.liveOutput));

  if (state === taskStateSucceeded && hasOutput) return 100;
  if (state === taskStateSucceeded && hasBody) return 90;
  if (taskStateIsTerminal(state) && hasOutput) return 80;
  if (taskStateIsTerminal(state) && hasBody) return 70;
  if (taskStateIsTerminal(state)) return 60;
  if (hasLiveOutput) return 30;
  if (hasBody) return 20;
  return 10;
}

function earliestPositiveNumber(left, right) {
  const values = [Number(left || 0), Number(right || 0)].filter(
    (value) => Number.isFinite(value) && value > 0,
  );
  return values.length ? Math.min(...values) : undefined;
}

export function mergeTaskMessages(existingMessage, incomingMessage) {
  const existing = normalizeMessageLifecycle(existingMessage);
  const incoming = normalizeMessageLifecycle(incomingMessage);
  const existingIdentity = messageLifecycleIdentity(existing);
  const incomingIdentity = messageLifecycleIdentity(incoming);

  if (existingIdentity && incomingIdentity && existingIdentity !== incomingIdentity) {
    return incoming;
  }

  const incomingWins = contentQuality(incoming) > contentQuality(existing);
  const preferred = incomingWins ? incoming : existing;
  const fallback = incomingWins ? existing : incoming;
  const completed = taskStateIsTerminal(preferred.taskState);
  const successful = preferred.taskState === taskStateSucceeded;
  return normalizeMessageLifecycle({
    ...fallback,
    ...preferred,
    id: existing.id || incoming.id,
    turnId: preferred.turnId || fallback.turnId || preferred.messagePairId || fallback.messagePairId || "",
    messagePairId: preferred.messagePairId || fallback.messagePairId || "",
    replyToMessageId: preferred.replyToMessageId || fallback.replyToMessageId || "",
    remoteTaskId: preferred.remoteTaskId || fallback.remoteTaskId || "",
    conversationId: preferred.conversationId || fallback.conversationId || "",
    agentId: preferred.agentId || fallback.agentId || "",
    backend: preferred.backend || fallback.backend || "",
    body: completed ? text(preferred.body) : preferred.body || fallback.body || "",
    output: preferred.output || fallback.output || "",
    liveOutput: completed ? "" : preferred.liveOutput || fallback.liveOutput || "",
    promptText: preferred.promptText || fallback.promptText || "",
    technicalDetail: successful ? undefined : preferred.technicalDetail || fallback.technicalDetail,
    executionSummary: preferred.executionSummary || fallback.executionSummary,
    agentFailure: successful ? undefined : preferred.agentFailure || fallback.agentFailure,
    resultMissing: successful ? false : preferred.resultMissing === true,
    remoteSyncError: successful ? "" : preferred.remoteSyncError || fallback.remoteSyncError || "",
    attachments:
      Array.isArray(preferred.attachments) && preferred.attachments.length
        ? preferred.attachments
        : fallback.attachments,
    createdAtMs: earliestPositiveNumber(existing.createdAtMs, incoming.createdAtMs),
    startedAt: earliestPositiveNumber(
      existing.startedAt || existing.createdAtMs,
      incoming.startedAt || incoming.createdAtMs,
    ),
    createdAt: existing.createdAt || incoming.createdAt,
  });
}

export function isPendingAgentResponse(message) {
  return (
    message?.role === "assistant" &&
    message?.backend === "agent" &&
    Boolean(text(message?.remoteTaskId)) &&
    taskStateIsActive(taskStateForMessage(message))
  );
}

export function lastActiveTaskMessage(messages = []) {
  const lastConversationMessage = [...(Array.isArray(messages) ? messages : [])]
    .reverse()
    .find((message) => message?.role === "user" || message?.role === "assistant");
  return lastConversationMessage?.role === "assistant" &&
    taskStateIsActive(taskStateForMessage(lastConversationMessage))
    ? lastConversationMessage
    : null;
}

export function lastPendingAgentResponse(messages = []) {
  const activeMessage = lastActiveTaskMessage(messages);
  return isPendingAgentResponse(activeMessage) ? activeMessage : null;
}
