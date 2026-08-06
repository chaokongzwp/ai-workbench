import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

const defaultInitialCount = 6;
const defaultBatchSize = 6;

export function progressiveMessageWindow(messages, renderedCount, revealMessageId = "") {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const targetId = String(revealMessageId || "").trim();
  const revealIndex = targetId
    ? safeMessages.findIndex((message) => String(message?.id || "").trim() === targetId)
    : -1;
  const revealCount = revealIndex >= 0 ? safeMessages.length - revealIndex : 0;
  const effectiveRenderedCount = Math.max(renderedCount, revealCount);

  return {
    visibleMessages: safeMessages.slice(-effectiveRenderedCount),
    revealCount,
  };
}

export function useProgressiveMessages({
  messages,
  sessionId,
  onScroll,
  revealMessageId = "",
  initialCount = defaultInitialCount,
  batchSize = defaultBatchSize,
}) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const [renderedCount, setRenderedCount] = useState(initialCount);
  const pendingOlderMessagesRef = useRef(null);
  const { visibleMessages, revealCount } = useMemo(
    () => progressiveMessageWindow(safeMessages, renderedCount, revealMessageId),
    [revealMessageId, renderedCount, safeMessages],
  );
  const hasOlderMessages = visibleMessages.length < safeMessages.length;

  useEffect(() => {
    setRenderedCount(initialCount);
    pendingOlderMessagesRef.current = null;
  }, [initialCount, sessionId]);

  useEffect(() => {
    if (revealCount <= renderedCount) return;
    setRenderedCount(revealCount);
  }, [renderedCount, revealCount]);

  useLayoutEffect(() => {
    const pending = pendingOlderMessagesRef.current;
    if (!pending) return;
    pendingOlderMessagesRef.current = null;
    pending.element.scrollTop = pending.element.scrollHeight - pending.previousScrollHeight;
  }, [renderedCount]);

  function handleProgressiveScroll(event) {
    onScroll?.(event);
    const container = event.currentTarget;
    if (!hasOlderMessages || container.scrollTop > 48 || pendingOlderMessagesRef.current) return;
    pendingOlderMessagesRef.current = {
      element: container,
      previousScrollHeight: container.scrollHeight,
    };
    setRenderedCount((count) => Math.min(safeMessages.length, count + batchSize));
  }

  return {
    visibleMessages,
    handleProgressiveScroll,
  };
}
