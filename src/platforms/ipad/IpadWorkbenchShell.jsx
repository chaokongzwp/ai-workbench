import { useLayoutEffect, useMemo, useState } from "react";
import { Plus } from "@phosphor-icons/react";
import { NativeWorkbenchShell } from "../native/NativeWorkbenchShell.jsx";
import { currentIpadViewportWidth, ipadLayoutModeForWidth } from "./ipadLayout.js";

function IpadSidebarEmptyState({ busy, onAddServer }) {
  return (
    <button
      className="ipad-sidebar-empty"
      type="button"
      aria-label="添加会话"
      onClick={onAddServer}
      disabled={busy}
    >
      <span className="ipad-sidebar-empty-icon" aria-hidden="true">
        <Plus size={28} weight="regular" />
      </span>
      <strong>添加会话</strong>
      <span>连接一台机器并选择工作目录，即可开始与 AI 对话。</span>
    </button>
  );
}

function IpadNavigationPanel({ NavigationPanel, ...props }) {
  const emptyState =
    props.servers?.length === 0 && props.onAddServer ? (
      <IpadSidebarEmptyState busy={props.busy} onAddServer={props.onAddServer} />
    ) : null;

  return (
    <NavigationPanel
      {...props}
      variant="ipad"
      emptyState={emptyState}
      hideAddWhenEmpty
      hideDuplicate
    />
  );
}

export function IpadWorkbenchShell(props) {
  const [layoutMode, setLayoutMode] = useState(() => ipadLayoutModeForWidth(currentIpadViewportWidth()));

  useLayoutEffect(() => {
    if (typeof window === "undefined") return undefined;
    let animationFrame = 0;
    const updateLayoutMode = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        setLayoutMode(ipadLayoutModeForWidth(currentIpadViewportWidth()));
      });
    };

    updateLayoutMode();
    window.addEventListener("resize", updateLayoutMode);
    window.addEventListener("orientationchange", updateLayoutMode);
    window.visualViewport?.addEventListener("resize", updateLayoutMode);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", updateLayoutMode);
      window.removeEventListener("orientationchange", updateLayoutMode);
      window.visualViewport?.removeEventListener("resize", updateLayoutMode);
    };
  }, []);

  useLayoutEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return undefined;

    const viewportMeta = document.querySelector('meta[name="viewport"]');
    const originalViewport = viewportMeta?.getAttribute("content") || "";
    viewportMeta?.setAttribute(
      "content",
      "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover",
    );

    return () => {
      if (viewportMeta) viewportMeta.setAttribute("content", originalViewport);
    };
  }, []);

  useLayoutEffect(() => {
    if (props.settingsOpen || typeof window === "undefined" || typeof document === "undefined") return undefined;

    const activeElement = document.activeElement;
    if (activeElement?.matches?.("input, textarea, select")) activeElement.blur();

    let animationFrame = 0;
    const timers = [];
    const restoreIpadViewport = () => {
      const root = document.documentElement;
      const width = Math.round(window.innerWidth || root.clientWidth || 0);
      const height = Math.round(window.innerHeight || root.clientHeight || 0);
      root.classList.remove("aiwb-keyboard-focus");
      document.body?.classList.remove("aiwb-keyboard-focus");
      if (width > 0) root.style.setProperty("--app-viewport-width", `${width}px`);
      if (height > 0) root.style.setProperty("--app-viewport-height", `${height}px`);
      root.scrollLeft = 0;
      root.scrollTop = 0;
      if (document.body) {
        document.body.scrollLeft = 0;
        document.body.scrollTop = 0;
      }
      window.scrollTo(0, 0);
    };

    animationFrame = window.requestAnimationFrame(() => {
      restoreIpadViewport();
      window.requestAnimationFrame(restoreIpadViewport);
    });
    timers.push(window.setTimeout(restoreIpadViewport, 120));
    timers.push(window.setTimeout(restoreIpadViewport, 320));

    return () => {
      window.cancelAnimationFrame(animationFrame);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [props.settingsOpen]);

  const ipadComponents = useMemo(() => {
    const SharedNavigationPanel = props.components.NavigationPanel;
    return {
      ...props.components,
      NavigationPanel: (navigationProps) => (
        <IpadNavigationPanel NavigationPanel={SharedNavigationPanel} {...navigationProps} />
      ),
    };
  }, [props.components]);

  return (
    <NativeWorkbenchShell
      {...props}
      components={ipadComponents}
      nativeFormFactor="ipad"
      compactNavigation={layoutMode === "compact"}
    />
  );
}
