export function createConversationRevealRequest(serverId, messageId, requestedAt = Date.now()) {
  const normalizedServerId = String(serverId || "").trim();
  const normalizedMessageId = String(messageId || "").trim();
  if (!normalizedServerId || !normalizedMessageId) return null;
  return {
    serverId: normalizedServerId,
    messageId: normalizedMessageId,
    requestedAt: Number(requestedAt || 0) || Date.now(),
  };
}

export function conversationRevealReady(request, activeServerId, messages = []) {
  if (!request || String(request.serverId || "") !== String(activeServerId || "")) return false;
  const targetMessageId = String(request.messageId || "");
  return Boolean(targetMessageId) && (Array.isArray(messages) ? messages : []).some(
    (message) => String(message?.id || "") === targetMessageId,
  );
}

export function scrollConversationContainerToBottom(container) {
  if (!container) return false;
  const bottom = Math.max(0, Number(container.scrollHeight || 0));
  // Direct assignment is deterministic in Chromium when queued scroll events
  // race with the React layout effect. Keep scrollTo for native WebViews.
  container.scrollTop = bottom;
  container.scrollTo?.({ top: bottom, behavior: "auto" });
  return true;
}

function messageElementId(element) {
  return String(
    element?.dataset?.messageId || element?.getAttribute?.("data-message-id") || "",
  );
}

export function findConversationMessageElement(container, messageId) {
  const targetMessageId = String(messageId || "");
  if (!container || !targetMessageId || typeof container.querySelectorAll !== "function") return null;
  return Array.from(container.querySelectorAll("[data-message-id]")).find(
    (element) => messageElementId(element) === targetMessageId,
  ) || null;
}

function rectIsVisible(containerRect, targetRect) {
  if (!containerRect || !targetRect) return false;
  return targetRect.bottom > containerRect.top && targetRect.top < containerRect.bottom;
}

export function revealConversationMessage(container, messageId) {
  const target = findConversationMessageElement(container, messageId);
  if (!target) return { found: false, visible: false };

  const containerRect = container.getBoundingClientRect?.();
  const targetRect = target.getBoundingClientRect?.();
  if (!containerRect || !targetRect) {
    target.scrollIntoView?.({ block: "end", inline: "nearest", behavior: "auto" });
    return { found: true, visible: true };
  }

  if (!rectIsVisible(containerRect, targetRect)) {
    const currentTop = Number(container.scrollTop || 0);
    const delta = targetRect.bottom > containerRect.bottom
      ? targetRect.bottom - containerRect.bottom
      : targetRect.top - containerRect.top;
    const nextTop = Math.max(0, currentTop + delta);
    container.scrollTop = nextTop;
    container.scrollTo?.({ top: nextTop, behavior: "auto" });
  }

  const settledContainerRect = container.getBoundingClientRect?.() || containerRect;
  const settledTargetRect = target.getBoundingClientRect?.() || targetRect;
  return {
    found: true,
    visible: rectIsVisible(settledContainerRect, settledTargetRect),
  };
}
