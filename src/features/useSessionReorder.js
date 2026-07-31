import { useCallback, useEffect, useRef, useState } from "react";

const LONG_PRESS_DELAY_MS = 420;
const PRESS_MOVE_TOLERANCE_PX = 10;
const REORDER_ROW_SELECTOR = "[data-session-reorder-id]";

export function useSessionReorder(onReorder) {
  const [draggingId, setDraggingId] = useState("");
  const pressRef = useRef(null);
  const timerRef = useRef(null);
  const suppressClickRef = useRef(false);
  const lastTargetRef = useRef("");

  const clearTimer = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const finish = useCallback(() => {
    clearTimer();
    const press = pressRef.current;
    if (press?.active) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
    pressRef.current = null;
    lastTargetRef.current = "";
    setDraggingId("");
  }, [clearTimer]);

  useEffect(() => finish, [finish]);

  const getReorderProps = useCallback(
    (sessionId) => ({
      "data-session-reorder-id": sessionId,
      onPointerDown: (event) => {
        if (!onReorder || (event.pointerType === "mouse" && event.button !== 0)) return;
        if (event.target.closest?.("[data-reorder-ignore]")) return;

        clearTimer();
        pressRef.current = {
          id: sessionId,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          active: false,
          element: event.currentTarget,
        };
        timerRef.current = window.setTimeout(() => {
          const press = pressRef.current;
          if (!press || press.id !== sessionId) return;
          press.active = true;
          press.element?.setPointerCapture?.(press.pointerId);
          setDraggingId(sessionId);
          globalThis.navigator?.vibrate?.(10);
        }, LONG_PRESS_DELAY_MS);
      },
      onPointerMove: (event) => {
        const press = pressRef.current;
        if (!press || press.pointerId !== event.pointerId) return;

        if (!press.active) {
          const distance = Math.hypot(event.clientX - press.startX, event.clientY - press.startY);
          if (distance > PRESS_MOVE_TOLERANCE_PX) {
            clearTimer();
            pressRef.current = null;
          }
          return;
        }

        event.preventDefault();
        const targetRow = document.elementFromPoint(event.clientX, event.clientY)?.closest?.(REORDER_ROW_SELECTOR);
        const targetId = targetRow?.dataset?.sessionReorderId || "";
        if (!targetId || targetId === press.id) return;

        const targetRect = targetRow.getBoundingClientRect();
        const placement = event.clientY >= targetRect.top + targetRect.height / 2 ? "after" : "before";
        const targetKey = `${targetId}:${placement}`;
        if (lastTargetRef.current === targetKey) return;
        lastTargetRef.current = targetKey;
        onReorder(press.id, targetId, placement);
      },
      onPointerUp: finish,
      onPointerCancel: finish,
      onLostPointerCapture: finish,
      onClickCapture: (event) => {
        if (!suppressClickRef.current) return;
        event.preventDefault();
        event.stopPropagation();
      },
      onDoubleClickCapture: (event) => {
        if (!suppressClickRef.current) return;
        event.preventDefault();
        event.stopPropagation();
      },
      onContextMenu: (event) => {
        if (!pressRef.current?.active) return;
        event.preventDefault();
      },
    }),
    [clearTimer, finish, onReorder],
  );

  return { draggingId, getReorderProps };
}
