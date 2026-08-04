function list(value) {
  return Array.isArray(value) ? value : [];
}

// Message mutations are kept pure so local persistence and Agent recovery use
// the same update semantics.
export function patchMessage(messages, messageId, patch, options = {}) {
  const id = String(messageId || "").trim();
  if (!id) return list(messages);
  const normalize =
    typeof options.normalize === "function" ? options.normalize : (message, update) => ({ ...message, ...update });
  const resolvePatch = typeof patch === "function" ? patch : () => patch;

  let changed = false;
  const next = list(messages).map((message) => {
    if (message?.id !== id) return message;
    const update = resolvePatch(message) || {};
    if (message.cancelledAt && !update.forceUpdate) return message;
    const entries = Object.entries(update).filter(([key]) => key !== "forceUpdate");
    if (!update.forceUpdate && !entries.some(([key, value]) => message[key] !== value)) return message;
    changed = true;
    return normalize(message, update);
  });
  return changed ? next : list(messages);
}
