import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

const defaultInitialCount = 6;
const defaultBatchSize = 6;

export function useProgressiveMessages({
  messages,
  sessionId,
  onScroll,
  initialCount = defaultInitialCount,
  batchSize = defaultBatchSize,
}) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const [renderedCount, setRenderedCount] = useState(initialCount);
  const pendingOlderMessagesRef = useRef(null);
  const visibleMessages = useMemo(
    () => safeMessages.slice(-renderedCount),
    [safeMessages, renderedCount],
  );
  const hasOlderMessages = visibleMessages.length < safeMessages.length;

  useEffect(() => {
    setRenderedCount(initialCount);
    pendingOlderMessagesRef.current = null;
  }, [initialCount, sessionId]);

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
