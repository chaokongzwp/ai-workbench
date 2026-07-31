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
