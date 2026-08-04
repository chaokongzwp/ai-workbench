import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwise,
  CaretDown,
  Eraser,
  Plugs,
  TerminalWindow,
} from "@phosphor-icons/react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import {
  isRetryableSshConnectionError,
  maxSshReconnectAttempts,
  runWithSshReconnect,
} from "../../core/workbenchCore.js";

const terminalMinHeight = 190;

function terminalTheme(theme) {
  if (theme === "dark") {
    return {
      background: "#0d0f12",
      foreground: "#e5e7eb",
      cursor: "#f4f4f5",
      cursorAccent: "#0d0f12",
      selectionBackground: "rgba(148, 163, 184, 0.3)",
      black: "#111318",
      brightBlack: "#6b7280",
      red: "#ef6b73",
      brightRed: "#ff858c",
      green: "#67c587",
      brightGreen: "#83d9a0",
      yellow: "#d8b76a",
      brightYellow: "#ebcc84",
      blue: "#7aa2d6",
      brightBlue: "#9bbbe2",
      magenta: "#b995d8",
      brightMagenta: "#cdb0e6",
      cyan: "#70b8bd",
      brightCyan: "#91d0d4",
      white: "#d7d9df",
      brightWhite: "#ffffff",
    };
  }

  return {
    background: "#f8f8fa",
    foreground: "#25272b",
    cursor: "#202124",
    cursorAccent: "#f8f8fa",
    selectionBackground: "rgba(60, 60, 67, 0.2)",
    black: "#25272b",
    brightBlack: "#737780",
    red: "#b94249",
    brightRed: "#cf5960",
    green: "#2f8050",
    brightGreen: "#3f9762",
    yellow: "#896c26",
    brightYellow: "#a48234",
    blue: "#436f9e",
    brightBlue: "#5885b3",
    magenta: "#785b91",
    brightMagenta: "#906da9",
    cyan: "#397b80",
    brightCyan: "#4d9297",
    white: "#e4e4e7",
    brightWhite: "#ffffff",
  };
}

function createTerminalId(sessionKey) {
  const suffix =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return `terminal-${String(sessionKey || "session").replace(/[^a-zA-Z0-9_-]/g, "-")}-${suffix}`;
}

export function MacSshPanel({
  open,
  profile,
  sessionKey,
  theme,
  onCollapse,
}) {
  const bridge = typeof window !== "undefined" ? window.aiWorkbench : undefined;
  const openRef = useRef(open);
  const containerRef = useRef(null);
  const terminalRef = useRef(null);
  const fitAddonRef = useRef(null);
  const terminalIdRef = useRef("");
  const activeSessionKeyRef = useRef("");
  const manualDisconnectRef = useRef(false);
  const connectionRunRef = useRef(0);
  const connectRef = useRef(null);
  const reconnectInFlightRef = useRef(false);
  const resizeStartRef = useRef(null);
  const [terminalReady, setTerminalReady] = useState(false);
  const [status, setStatus] = useState("closed");
  const [detail, setDetail] = useState("");
  const [height, setHeight] = useState(270);
  const endpoint = useMemo(
    () => `${String(profile?.username || "").trim() || "user"}@${String(profile?.host || "").trim() || "server"}`,
    [profile?.host, profile?.username],
  );
  const workdir = String(profile?.workdir || "").trim();
  openRef.current = open;

  const fitTerminal = useCallback(() => {
    if (!openRef.current || !terminalRef.current || !fitAddonRef.current || !containerRef.current) return;
    try {
      fitAddonRef.current.fit();
    } catch {
      // The drawer may still be entering layout; the ResizeObserver retries.
    }
  }, []);

  const closeConnection = useCallback(
    async ({ manual = false, clear = false } = {}) => {
      manualDisconnectRef.current = manual;
      connectionRunRef.current += 1;
      reconnectInFlightRef.current = false;
      const terminalId = terminalIdRef.current;
      terminalIdRef.current = "";
      if (terminalId && bridge?.closeEmbeddedTerminal) {
        try {
          await bridge.closeEmbeddedTerminal({ terminalId });
        } catch {
          // Closing an already-ended channel is harmless.
        }
      }
      if (clear) terminalRef.current?.clear();
      setStatus("closed");
      setDetail("");
    },
    [bridge],
  );

  const connect = useCallback(async ({ afterDisconnect = false } = {}) => {
    if (!bridge?.startEmbeddedTerminal || terminalIdRef.current || reconnectInFlightRef.current) return;
    const host = String(profile?.host || "").trim();
    const username = String(profile?.username || "").trim();
    const password = String(profile?.password || "");
    if (!host || !username || !password) {
      setStatus("error");
      setDetail(!password ? "请先在会话设置中保存登录密码" : "会话连接信息不完整");
      return;
    }

    manualDisconnectRef.current = false;
    reconnectInFlightRef.current = true;
    const runId = connectionRunRef.current + 1;
    connectionRunRef.current = runId;
    setStatus("connecting");
    setDetail(afterDisconnect ? `连接断开，正在自动重连 1/${maxSshReconnectAttempts}` : "");
    if (!afterDisconnect) {
      terminalRef.current?.reset();
      terminalRef.current?.writeln(`\x1b[2m正在连接 ${username}@${host}…\x1b[0m`);
    } else {
      terminalRef.current?.writeln(`\r\n\x1b[2m连接断开，正在自动重连…\x1b[0m`);
    }
    fitTerminal();

    try {
      await runWithSshReconnect(
        async () => {
          if (connectionRunRef.current !== runId) {
            const cancelled = new Error("Terminal connection cancelled");
            cancelled.code = "AIWB_TERMINAL_CONNECT_CANCELLED";
            throw cancelled;
          }
          const terminalId = createTerminalId(sessionKey);
          terminalIdRef.current = terminalId;
          try {
            await bridge.startEmbeddedTerminal({
              terminalId,
              host,
              port: profile?.port,
              username,
              password,
              platform: profile?.platform,
              wslDistro: profile?.wslDistro,
              workdir,
              connectTimeoutSeconds: profile?.connectTimeoutSeconds,
              cols: terminalRef.current?.cols || 100,
              rows: terminalRef.current?.rows || 24,
            });
          } catch (error) {
            if (terminalIdRef.current === terminalId) terminalIdRef.current = "";
            throw error;
          }
          if (connectionRunRef.current !== runId) {
            await bridge.closeEmbeddedTerminal({ terminalId }).catch(() => {});
            const cancelled = new Error("Terminal connection cancelled");
            cancelled.code = "AIWB_TERMINAL_CONNECT_CANCELLED";
            throw cancelled;
          }
        },
        {
          maxReconnectAttempts: afterDisconnect ? maxSshReconnectAttempts - 1 : maxSshReconnectAttempts,
          onRetry: ({ reconnectAttempt }) => {
            const visibleAttempt = afterDisconnect ? reconnectAttempt + 1 : reconnectAttempt;
            setStatus("connecting");
            setDetail(`连接断开，正在自动重连 ${visibleAttempt}/${maxSshReconnectAttempts}`);
          },
        },
      );
      setStatus("connected");
      setDetail("");
    } catch (error) {
      if (connectionRunRef.current !== runId) return;
      terminalIdRef.current = "";
      setStatus("error");
      setDetail("连接异常");
      terminalRef.current?.writeln(`\r\n\x1b[31m连接异常\x1b[0m`);
    } finally {
      if (connectionRunRef.current === runId) reconnectInFlightRef.current = false;
    }
  }, [bridge, fitTerminal, profile, sessionKey, workdir]);
  connectRef.current = connect;

  useEffect(() => {
    if (terminalRef.current || !containerRef.current) return;
    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: true,
      cursorBlink: true,
      cursorStyle: "bar",
      fontFamily: '"SFMono-Regular", "SF Mono", Menlo, Monaco, Consolas, monospace',
      fontSize: 12,
      fontWeight: "400",
      lineHeight: 1.25,
      scrollback: 6000,
      theme: terminalTheme(theme),
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const inputSubscription = terminal.onData((data) => {
      const terminalId = terminalIdRef.current;
      if (!terminalId || !bridge?.writeEmbeddedTerminal) return;
      void bridge.writeEmbeddedTerminal({ terminalId, data }).catch((error) => {
        terminalIdRef.current = "";
        if (isRetryableSshConnectionError(error) && !manualDisconnectRef.current) {
          setStatus("connecting");
          setDetail(`连接断开，正在自动重连 1/${maxSshReconnectAttempts}`);
          void connectRef.current?.({ afterDisconnect: true });
          return;
        }
        setStatus("error");
        setDetail("连接异常");
      });
    });
    const resizeSubscription = terminal.onResize(({ cols, rows }) => {
      const terminalId = terminalIdRef.current;
      if (!terminalId || !bridge?.resizeEmbeddedTerminal) return;
      void bridge.resizeEmbeddedTerminal({ terminalId, cols, rows }).catch(() => {});
    });
    const observer = new ResizeObserver(() => fitTerminal());
    observer.observe(containerRef.current);
    setTerminalReady(true);
    window.requestAnimationFrame(() => fitTerminal());

    return () => {
      observer.disconnect();
      inputSubscription.dispose();
      resizeSubscription.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [bridge, fitTerminal]);

  useEffect(() => {
    if (!terminalRef.current) return;
    terminalRef.current.options.theme = terminalTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (!bridge) return undefined;
    const removeDataListener = bridge.onEmbeddedTerminalData?.((payload) => {
      if (payload?.terminalId !== terminalIdRef.current) return;
      terminalRef.current?.write(String(payload.data || ""));
    });
    const removeStateListener = bridge.onEmbeddedTerminalState?.((payload) => {
      if (payload?.terminalId !== terminalIdRef.current) return;
      const nextState = String(payload.state || "");
      if (nextState === "connected") {
        setStatus("connected");
        setDetail("");
        return;
      }
      if (nextState === "error" || nextState === "closed") {
        terminalIdRef.current = "";
        if (manualDisconnectRef.current) {
          setStatus("closed");
          setDetail("");
          return;
        }
        if (reconnectInFlightRef.current) return;
        setStatus("connecting");
        setDetail(`连接断开，正在自动重连 1/${maxSshReconnectAttempts}`);
        void connectRef.current?.({ afterDisconnect: true });
      }
    });
    return () => {
      removeDataListener?.();
      removeStateListener?.();
    };
  }, [bridge]);

  useEffect(() => {
    if (!terminalReady) return;
    const sessionChanged = activeSessionKeyRef.current !== sessionKey;
    if (sessionChanged) {
      activeSessionKeyRef.current = sessionKey;
      manualDisconnectRef.current = false;
      void closeConnection({ clear: true }).then(() => {
        if (open) void connect();
      });
      return;
    }
    if (open && !terminalIdRef.current && !manualDisconnectRef.current) void connect();
  }, [closeConnection, connect, open, sessionKey, terminalReady]);

  useEffect(
    () => () => {
      void closeConnection();
    },
    [closeConnection],
  );

  useEffect(() => {
    function handlePointerMove(event) {
      const start = resizeStartRef.current;
      if (!start) return;
      const maxHeight = Math.max(terminalMinHeight, Math.round(window.innerHeight * 0.62));
      setHeight(Math.max(terminalMinHeight, Math.min(maxHeight, start.height + start.y - event.clientY)));
    }

    function handlePointerUp() {
      if (!resizeStartRef.current) return;
      resizeStartRef.current = null;
      document.body.classList.remove("mac-terminal-resizing");
      window.requestAnimationFrame(() => fitTerminal());
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [fitTerminal]);

  return (
    <section
      className={`mac-ssh-panel ${open ? "" : "is-collapsed"}`}
      style={{ height: open ? height : 0 }}
      aria-label="当前会话 SSH 终端"
      inert={!open ? true : undefined}
    >
      <button
        type="button"
        className="mac-ssh-resize-handle"
        aria-label="调整终端高度"
        onPointerDown={(event) => {
          resizeStartRef.current = { y: event.clientY, height };
          document.body.classList.add("mac-terminal-resizing");
        }}
      />
      <header className="mac-ssh-header">
        <div className="mac-ssh-title">
          <TerminalWindow size={15} weight="bold" aria-hidden="true" />
          <strong>SSH</strong>
          <span>{endpoint}</span>
          {workdir ? <code>{workdir}</code> : null}
        </div>
        <div className="mac-ssh-header-actions">
          {status !== "connected" ? (
            <button
              type="button"
              onClick={() => void connect({ afterDisconnect: false })}
              title="重新连接"
              aria-label="重新连接"
            >
              <ArrowClockwise size={15} weight="bold" aria-hidden="true" />
            </button>
          ) : null}
          <button type="button" onClick={() => terminalRef.current?.clear()} title="清空终端" aria-label="清空终端">
            <Eraser size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => void closeConnection({ manual: true })}
            disabled={status === "closed"}
            title="断开 SSH"
            aria-label="断开 SSH"
          >
            <Plugs size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.currentTarget.blur();
              onCollapse?.();
            }}
            title="收起终端"
            aria-label="收起终端"
          >
            <CaretDown size={15} weight="bold" aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className="mac-ssh-terminal" ref={containerRef} />
    </section>
  );
}
