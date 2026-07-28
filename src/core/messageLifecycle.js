export const responsePhasePending = "pending";
export const responsePhaseCompleted = "completed";

const pendingMessageStatuses = new Set(["running", "preparing", "queued", "unknown"]);
const terminalMessageStatuses = new Set(["done", "error", "cancelled", "idle"]);
const pendingRemoteTaskStatuses = new Set([
  "",
  "preparing",
  "queued",
  "running",
  "unknown",
  "sync-lost",
  "sync-timeout",
]);
const successfulRemoteTaskStatuses = new Set(["done"]);
const failedRemoteTaskStatuses = new Set([
  "error",
  "missing",
  "deferred-waiting-answer",
  "sync-lost-no-task-id",
]);
const cancelledRemoteTaskStatuses = new Set(["cancelled"]);

function text(value) {
  return String(value || "").trim();
}

export function remoteTaskIsTerminal(status) {
  const value = text(status);
  return successfulRemoteTaskStatuses.has(value) || failedRemoteTaskStatuses.has(value) || cancelledRemoteTaskStatuses.has(value);
}

export function responsePhaseForMessage(message) {
  if (message?.role !== "assistant") return responsePhaseCompleted;
  const status = text(message?.status);
  const remoteStatus = text(message?.remoteTaskStatus);
  if (remoteTaskIsTerminal(remoteStatus)) return responsePhaseCompleted;
  if (status === "cancelled" || Number(message?.cancelledAt || 0) > 0) return responsePhaseCompleted;
  if (pendingMessageStatuses.has(status)) return responsePhasePending;
  if (
    message?.backend === "agent" &&
    text(message?.remoteTaskId) &&
    remoteStatus &&
    pendingRemoteTaskStatuses.has(remoteStatus)
  ) {
    return responsePhasePending;
  }
  if (terminalMessageStatuses.has(status)) return responsePhaseCompleted;
  if (message?.responsePhase === responsePhasePending || message?.responsePhase === responsePhaseCompleted) {
    return message.responsePhase;
  }
  if (message?.syncState === "pending") return responsePhasePending;
  return responsePhaseCompleted;
}

export function responseOutcomeForMessage(message) {
  if (responsePhaseForMessage(message) === responsePhasePending) return "pending";
  const status = text(message?.status);
  const remoteStatus = text(message?.remoteTaskStatus);
  if (successfulRemoteTaskStatuses.has(remoteStatus) && text(message?.output)) return "success";
  if (
    status === "cancelled" ||
    cancelledRemoteTaskStatuses.has(remoteStatus) ||
    (Number(message?.cancelledAt || 0) > 0 && status !== "error")
  ) {
    return "cancelled";
  }
  if (
    status === "error" ||
    failedRemoteTaskStatuses.has(remoteStatus) ||
    message?.agentFailure ||
    (message?.resultMissing === true && !text(message?.output))
  ) {
    return "error";
  }
  return "success";
}

export function normalizeMessageLifecycle(message, now = Date.now()) {
  const source = message && typeof message === "object" ? message : {};
  if (source.role !== "assistant") return { ...source };

  const responsePhase = responsePhaseForMessage(source);
  const responseOutcome = responseOutcomeForMessage({ ...source, responsePhase });
  if (responsePhase === responsePhasePending) {
    return {
      ...source,
      responsePhase,
      responseOutcome,
      status: "running",
      syncState: "pending",
    };
  }

  const completedAt = Number(source.completedAt || 0) || now;
  const startedAt = Number(source.startedAt || source.createdAtMs || 0);
  const status =
    responseOutcome === "cancelled"
      ? "cancelled"
      : responseOutcome === "error"
        ? "error"
        : "done";
  return {
    ...source,
    responsePhase,
    responseOutcome,
    status,
    syncState: "completed",
    liveOutput: "",
    completedAt,
    durationMs:
      Number(source.durationMs || 0) ||
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

function contentQuality(message) {
  const normalized = normalizeMessageLifecycle(message);
  const phase = normalized.responsePhase;
  const outcome = normalized.responseOutcome;
  const hasOutput = Boolean(text(normalized.output));
  const hasBody = Boolean(text(normalized.body));
  const hasLiveOutput = Boolean(text(normalized.liveOutput));

  if (phase === responsePhaseCompleted && outcome === "success" && hasOutput) return 100;
  if (phase === responsePhaseCompleted && outcome === "success" && hasBody) return 90;
  if (phase === responsePhaseCompleted && hasOutput) return 80;
  if (phase === responsePhaseCompleted && hasBody) return 70;
  if (phase === responsePhaseCompleted) return 60;
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

export function mergeResponseLifecycle(existingMessage, incomingMessage) {
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
  const completed = preferred.responsePhase === responsePhaseCompleted;
  const successful = completed && preferred.responseOutcome === "success";
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
    responsePhaseForMessage(message) === responsePhasePending
  );
}

export function lastPendingAgentResponse(messages = []) {
  const lastConversationMessage = [...(Array.isArray(messages) ? messages : [])]
    .reverse()
    .find((message) => message?.role === "user" || message?.role === "assistant");
  return isPendingAgentResponse(lastConversationMessage) ? lastConversationMessage : null;
}
