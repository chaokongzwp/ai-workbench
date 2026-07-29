import {
  isWindowsProfile,
  normalizeProfile,
  taskForStorage,
} from "../core/foundation.js";
import {
  lastPendingAgentResponse,
  mergeTaskMessages,
  normalizeMessageLifecycle,
  sortConversationMessages,
  taskStateForMessage,
  taskStateFailed,
  taskStateIsTerminal,
  taskStateSucceeded,
} from "../core/messageLifecycle.js";
import {
  agentById,
  looksLikeDeferredWaitingAnswer,
} from "../core/routingOutput.js";

function earliestMessageTime(left, right) {
  const values = [Number(left || 0), Number(right || 0)].filter(
    (value) => Number.isFinite(value) && value > 0,
  );
  return values.length ? Math.min(...values) : undefined;
}

function messageTextKey(message) {
  return String(message?.body || message?.promptText || "").trim();
}

function mergeRemoteUserMessages(existing, incoming) {
  const preferred = messageTextKey(incoming) ? incoming : existing;
  const fallback = preferred === incoming ? existing : incoming;
  const createdAtMs = earliestMessageTime(existing.createdAtMs, incoming.createdAtMs);

  return {
    ...fallback,
    ...preferred,
    id: existing.id,
    body: preferred.body || fallback.body || "",
    promptText: preferred.promptText || fallback.promptText || preferred.body || fallback.body || "",
    remoteTaskId: existing.remoteTaskId || incoming.remoteTaskId,
    conversationId: existing.conversationId || incoming.conversationId,
    agentId: existing.agentId || incoming.agentId,
    backend: existing.backend || incoming.backend,
    turnId: existing.turnId || incoming.turnId || existing.messagePairId || incoming.messagePairId || "",
    messagePairId: existing.messagePairId || incoming.messagePairId || "",
    replyToMessageId: existing.replyToMessageId || incoming.replyToMessageId || "",
    createdAtMs,
    createdAt: existing.createdAt || incoming.createdAt,
  };
}

function isMessageListDiagnostic(message) {
  const title = String(message?.title || "").trim();
  return title === "消息列表已拉取" || /输出已刷新$/.test(title);
}

function normalizeDeferredWaitingMessage(message) {
  const output = String(message?.output || "").trim();
  const technicalDetail = String(message?.technicalDetail || "").trim();
  if (
    message?.role === "assistant" &&
    message?.remoteTaskStatus === "deferred-waiting-answer" &&
    technicalDetail &&
    !looksLikeDeferredWaitingAnswer(technicalDetail)
  ) {
    return normalizeMessageLifecycle({
      ...message,
      title: `${agentById(message.agentId).shortName} 回复`,
      body: "",
      output: technicalDetail,
      liveOutput: "",
      taskState: taskStateSucceeded,
      resultMissing: false,
      technicalDetail: undefined,
      remoteTaskStatus: "done",
      remoteSyncError: "",
      completedAt: Number(message.completedAt || 0) || Date.now(),
    });
  }
  if (message?.role === "assistant" && message?.backend === "agent") {
    return normalizeMessageLifecycle(message);
  }
  if (
    message?.role !== "assistant" ||
    (message?.backend === "agent" && message?.remoteTaskStatus === "done") ||
    !taskStateIsTerminal(taskStateForMessage(message)) ||
    !output ||
    !looksLikeDeferredWaitingAnswer(output)
  ) {
    return normalizeMessageLifecycle(message);
  }

  const executionSummary = String(message.executionSummary || "").trim();
  return normalizeMessageLifecycle({
    ...message,
    title: executionSummary ? "AI 回复不完整" : "没有最终结果",
    body: executionSummary
      ? "远端 AI 没有给出完整结论。下面是 Agent 独立记录的实际执行痕迹。"
      : "远端 AI 只返回了等待中的过程状态，没有给出最终结果。可以重新同步或重新发送。",
    output: executionSummary,
    liveOutput: "",
    taskState: taskStateFailed,
    resultMissing: true,
    technicalDetail: message.technicalDetail || output,
    remoteTaskStatus: "deferred-waiting-answer",
    remoteSyncError: "",
  });
}

export function dedupeRemoteTaskMessages(messages = []) {
  const nextMessages = [];
  const identityIndexes = new Map();

  function identityKeys(message) {
    const role = String(message?.role || "").trim();
    const id = String(message?.id || "").trim();
    const turnId = String(message?.turnId || message?.messagePairId || "").trim();
    const taskId = String(message?.remoteTaskId || "").trim();
    return [
      id ? `id:${id}` : "",
      role && turnId ? `turn:${role}:${turnId}` : "",
      role && taskId ? `task:${role}:${taskId}` : "",
    ].filter(Boolean);
  }

  for (const source of Array.isArray(messages) ? messages : []) {
    if (!source || typeof source !== "object") continue;
    const turnId = String(source.turnId || source.messagePairId || "").trim();
    const message = normalizeMessageLifecycle(normalizeDeferredWaitingMessage(
      turnId && !source.turnId ? { ...source, turnId } : { ...source },
    ));
    const keys = identityKeys(message);
    const existingIndex = keys
      .map((key) => identityIndexes.get(key))
      .find((index) => Number.isInteger(index));

    if (existingIndex === undefined) {
      const index = nextMessages.length;
      nextMessages.push(message);
      keys.forEach((key) => identityIndexes.set(key, index));
      continue;
    }

    const existing = nextMessages[existingIndex];
    const merged = normalizeMessageLifecycle(normalizeDeferredWaitingMessage(
      message.role === "assistant"
        ? mergeTaskMessages(existing, message)
        : message.role === "user"
          ? mergeRemoteUserMessages(existing, message)
          : { ...existing, ...message, id: existing.id || message.id },
    ));
    const body = String(merged?.body || "").trim();
    const hasTerminalResult =
      merged?.role === "assistant" &&
      taskStateIsTerminal(taskStateForMessage(merged)) &&
      String(merged?.output || "").trim();
    nextMessages[existingIndex] =
      hasTerminalResult && /正在等待.+回复|任务还在服务器后台运行|App 已重新打开，无法确认/.test(body)
        ? { ...merged, body: "", liveOutput: "" }
        : merged;
    [...identityKeys(existing), ...keys, ...identityKeys(nextMessages[existingIndex])].forEach((key) =>
      identityIndexes.set(key, existingIndex),
    );
  }

  return sortConversationMessages(nextMessages);
}

export function reconcileServerMessageLifecycle(server) {
  const messages = dedupeRemoteTaskMessages(server?.messages || []);
  const pendingMessage = lastPendingAgentResponse(
    messages.filter((message) => !isMessageListDiagnostic(message)),
  );
  return {
    ...server,
    messages,
    task: pendingMessage
      ? {
          ...taskForStorage(server?.task),
          backend: "agent",
          remoteTaskId: pendingMessage.remoteTaskId,
          agentId: pendingMessage.agentId || server?.profile?.agentId || "codex",
          startedAt: pendingMessage.startedAt || pendingMessage.createdAtMs || Date.now(),
        }
      : taskForStorage(server?.task),
  };
}

export function dedupeServerRemoteTaskMessages(servers = []) {
  return servers.map(reconcileServerMessageLifecycle);
}

export function agentPreferredForProfile(profile) {
  const normalized = normalizeProfile(profile || {});
  return normalized.useWorkbenchAgent === true || isWindowsProfile(normalized);
}
