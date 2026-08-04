function list(value) {
  return Array.isArray(value) ? value : [];
}

// Pure session collection operations. React persistence and side effects stay
// in the controller; this module owns only deterministic session mutations.
export function sessionById(sessions, sessionId) {
  const id = String(sessionId || "").trim();
  return id ? list(sessions).find((session) => session?.id === id) : undefined;
}

export function patchSession(sessions, sessionId, updater, reconcile = (value) => value) {
  const id = String(sessionId || "").trim();
  if (!id) return list(sessions);

  let changed = false;
  const next = list(sessions).map((session) => {
    if (session?.id !== id) return session;
    const patch = typeof updater === "function" ? updater(session) : updater;
    const candidate = reconcile({ ...session, ...(patch || {}) });
    if (candidate !== session) changed = true;
    return candidate;
  });
  return changed ? next : list(sessions);
}

export function patchSessionsMatchingConnection(sessions, connectionKey, profileKey, updater, reconcile = (value) => value) {
  if (!connectionKey) return list(sessions);
  let changed = false;
  const next = list(sessions).map((session) => {
    if (profileKey(session?.profile || {}) !== connectionKey) return session;
    const candidate = reconcile(updater(session));
    if (candidate !== session) changed = true;
    return candidate;
  });
  return changed ? next : list(sessions);
}
