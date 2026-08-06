export function reorderSessionsById(sessions, sourceId, targetId, placement = "before") {
  if (!Array.isArray(sessions) || sourceId === targetId) return sessions;

  const sourceIndex = sessions.findIndex((session) => session?.id === sourceId);
  const targetIndex = sessions.findIndex((session) => session?.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return sessions;

  const nextSessions = [...sessions];
  const [sourceSession] = nextSessions.splice(sourceIndex, 1);
  const nextTargetIndex = nextSessions.findIndex((session) => session?.id === targetId);
  const insertionIndex = nextTargetIndex + (placement === "after" ? 1 : 0);
  nextSessions.splice(insertionIndex, 0, sourceSession);
  return nextSessions;
}

const activeTaskStates = new Set(["queued", "starting", "running", "streaming", "waiting", "processing"]);

function timestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function timestampFromIdentity(session) {
  for (const value of [session?.id, session?.conversationId]) {
    const match = String(value || "").match(/(?:^|[-_])(\d{13})(?:[-_]|$)/);
    if (match) return Number(match[1]) || 0;
  }
  return 0;
}

export function sessionCreatedTimestamp(session) {
  const messageTimes = (Array.isArray(session?.messages) ? session.messages : [])
    .flatMap((message) => [message?.createdAtMs, message?.startedAt, message?.finishedAt, message?.completedAt])
    .map(timestamp)
    .filter(Boolean);
  const earliestMessage = messageTimes.length ? Math.min(...messageTimes) : 0;
  return timestamp(session?.createdAtMs) || timestampFromIdentity(session) || earliestMessage;
}

export function sessionActivityTimestamp(session) {
  const messageTimes = (Array.isArray(session?.messages) ? session.messages : [])
    .flatMap((message) => [
      message?.updatedAt,
      message?.completedAt,
      message?.finishedAt,
      message?.startedAt,
      message?.createdAtMs,
    ])
    .map(timestamp);
  return Math.max(sessionCreatedTimestamp(session), timestamp(session?.unreadResult?.createdAt), ...messageTimes);
}

function sessionName(session) {
  const explicit = String(session?.name || session?.profile?.name || "").trim();
  if (explicit) return explicit;
  const workdir = String(session?.profile?.workdir || "").trim().replace(/[\\/]+$/, "");
  return workdir.split(/[\\/]/).pop() || String(session?.id || "");
}

function sessionStatePriority(session) {
  const messages = Array.isArray(session?.messages) ? session.messages : [];
  const running = messages.some((message) => activeTaskStates.has(String(message?.taskState || "").toLowerCase()));
  if (running) return 0;
  if (session?.unreadResult) return 1;
  if (session?.connection?.state === "connected" || session?.connection?.channelState === "connected") return 2;
  if (session?.connection?.state === "error") return 4;
  return 3;
}

export function sortSessions(sessions, mode = "recent") {
  if (!Array.isArray(sessions)) return sessions;
  const indexed = sessions.map((session, index) => ({ session, index }));
  const compareRecent = (left, right) => sessionActivityTimestamp(right.session) - sessionActivityTimestamp(left.session);

  indexed.sort((left, right) => {
    let result = 0;
    if (mode === "created") {
      result = sessionCreatedTimestamp(left.session) - sessionCreatedTimestamp(right.session);
    } else if (mode === "name") {
      result = sessionName(left.session).localeCompare(sessionName(right.session), "zh-CN", {
        numeric: true,
        sensitivity: "base",
      });
    } else if (mode === "status") {
      result = sessionStatePriority(left.session) - sessionStatePriority(right.session) || compareRecent(left, right);
    } else {
      result = compareRecent(left, right);
    }
    return result || left.index - right.index;
  });
  return indexed.map(({ session }) => session);
}
