import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwise,
  ArrowBendDownLeft,
  CaretDown,
  CaretUp,
  Eraser,
  Plugs,
  TerminalWindow,
  X,
} from "@phosphor-icons/react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import {
  SSHWorkbench,
  isRetryableSshConnectionError,
  maxSshReconnectAttempts,
  runWithSshReconnect,
} from "../../core/workbenchCore.js";
import "./native-ssh-terminal.css";

function createTerminalId(sessionKey) {
  const suffix =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return `native-terminal-${String(sessionKey || "session").replace(/[^a-zA-Z0-9_-]/g, "-")}-${suffix}`;
}

function terminalTheme(theme) {
  if (theme === "light") {
    return {
      background: "#f7f7f8",
      foreground: "#1f2328",
      cursor: "#202124",
      cursorAccent: "#f7f7f8",
      selectionBackground: "rgba(60, 60, 67, 0.18)",
      black: "#24262b",
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

  return {
    background: "#0d0f12",
    foreground: "#e5e7eb",
    cursor: "#f4f4f5",
    cursorAccent: "#0d0f12",
    selectionBackground: "rgba(148, 163, 184, 0.28)",
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

function decodeBase64Bytes(value) {
  const binary = window.atob(String(value || ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function statusPresentation(status, detail) {
  if (status === "connecting") {
    return {
      label: String(detail || "").startsWith("连接断开") ? "连接断开" : "连接中",
      tone: "connecting",
    };
  }
  if (status === "connected") return { label: "已连接", tone: "connected" };
  if (status === "error") return { label: "连接异常", tone: "error" };
  return { label: "已断开", tone: "closed" };
}

export function NativeSshTerminal({
  open,
  profile,
  sessionKey,
  theme,
  formFactor = "iphone",
  onClose,
}) {
  const containerRef = useRef(null);
  const terminalRef = useRef(null);
  const fitAddonRef = useRef(null);
  const terminalIdRef = useRef("");
  const connectRunRef = useRef(0);
  const connectRef = useRef(null);
  const reconnectInFlightRef = useRef(false);
  const manualDisconnectRef = useRef(false);
  const [terminalReady, setTerminalReady] = useState(false);
  const [listenersReady, setListenersReady] = useState(false);
  const [status, setStatus] = useState("closed");
  const [detail, setDetail] = useState("");
  const endpoint = useMemo(
    () => `${String(profile?.username || "").trim() || "user"}@${String(profile?.host || "").trim() || "server"}`,
    [profile?.host, profile?.username],
  );
  const statusCopy = statusPresentation(status, detail);

  const fitTerminal = useCallback(() => {
    if (!open || !terminalRef.current || !fitAddonRef.current || !containerRef.current) return;
    try {
      fitAddonRef.current.fit();
    } catch {
      // The full-screen view can need one more layout frame after opening.
    }
  }, [open]);

  const closeConnection = useCallback(async ({ manual = false } = {}) => {
    manualDisconnectRef.current = manual;
    connectRunRef.current += 1;
    reconnectInFlightRef.current = false;
    const terminalId = terminalIdRef.current;
    terminalIdRef.current = "";
    if (terminalId) {
      try {
        await SSHWorkbench.closeTerminal({ terminalId });
      } catch {
        // Closing an already-ended native channel is harmless.
      }
    }
    setStatus("closed");
    setDetail("");
  }, []);

  const connect = useCallback(async ({ afterDisconnect = false } = {}) => {
    if (!open || terminalIdRef.current || reconnectInFlightRef.current) return;
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
    const runId = connectRunRef.current + 1;
    connectRunRef.current = runId;
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
          if (connectRunRef.current !== runId) {
            const cancelled = new Error("Terminal connection cancelled");
            cancelled.code = "AIWB_TERMINAL_CONNECT_CANCELLED";
            throw cancelled;
          }
          const terminalId = createTerminalId(sessionKey);
          terminalIdRef.current = terminalId;
          try {
            await SSHWorkbench.startTerminal({
              terminalId,
              host,
              port: profile?.port,
              username,
              password,
              platform: profile?.platform,
              wslDistro: profile?.wslDistro,
              workdir: profile?.workdir,
              connectTimeoutSeconds: profile?.connectTimeoutSeconds,
              commandTimeoutSeconds: profile?.commandTimeoutSeconds,
              cols: terminalRef.current?.cols || 80,
              rows: terminalRef.current?.rows || 24,
            });
          } catch (error) {
            if (terminalIdRef.current === terminalId) terminalIdRef.current = "";
            throw error;
          }
          if (connectRunRef.current !== runId) {
            await SSHWorkbench.closeTerminal({ terminalId }).catch(() => {});
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
      if (connectRunRef.current !== runId) return;
      terminalIdRef.current = "";
      setStatus("error");
      setDetail("连接异常");
      terminalRef.current?.writeln(`\r\n\x1b[31m连接异常\x1b[0m`);
    } finally {
      if (connectRunRef.current === runId) reconnectInFlightRef.current = false;
    }
  }, [fitTerminal, open, profile, sessionKey]);
  connectRef.current = connect;

  const writeData = useCallback((data) => {
    const terminalId = terminalIdRef.current;
    if (!terminalId) return;
    void SSHWorkbench.writeTerminal({ terminalId, data }).catch((error) => {
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
  }, []);

  useEffect(() => {
    if (!open || terminalRef.current || !containerRef.current) return undefined;
    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: true,
      cursorBlink: true,
      cursorStyle: "bar",
      fontFamily: '"SFMono-Regular", "SF Mono", Menlo, Monaco, Consolas, monospace',
      fontSize: formFactor === "ipad" ? 13 : 12,
      fontWeight: "400",
      lineHeight: 1.28,
      scrollback: 5000,
      theme: terminalTheme(theme),
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const inputSubscription = terminal.onData(writeData);
    const resizeSubscription = terminal.onResize(({ cols, rows }) => {
      const terminalId = terminalIdRef.current;
      if (!terminalId) return;
      void SSHWorkbench.resizeTerminal({ terminalId, cols, rows }).catch(() => {});
    });
    const observer = new ResizeObserver(fitTerminal);
    observer.observe(containerRef.current);
    const terminalTextarea = terminal.textarea;
    const root = document.documentElement;
    const body = document.body;
    const repairTimers = [];
    const repairTerminalViewport = () => {
      window.requestAnimationFrame(() => {
        fitTerminal();
        terminal.scrollToBottom();
      });
    };
    const setKeyboardFocused = (focused) => {
      if (formFactor !== "iphone") return;
      root.classList.toggle("aiwb-keyboard-focus", focused);
      body?.classList.toggle("aiwb-keyboard-focus", focused);
      repairTerminalViewport();
      if (focused) {
        [80, 180, 320, 520].forEach((delay) => {
          repairTimers.push(window.setTimeout(repairTerminalViewport, delay));
        });
      }
    };
    const handleTerminalFocus = () => setKeyboardFocused(true);
    const handleTerminalBlur = () => setKeyboardFocused(false);
    terminalTextarea?.addEventListener("focus", handleTerminalFocus);
    terminalTextarea?.addEventListener("blur", handleTerminalBlur);
    window.visualViewport?.addEventListener("resize", repairTerminalViewport);
    window.visualViewport?.addEventListener("scroll", repairTerminalViewport);
    setTerminalReady(true);
    window.requestAnimationFrame(fitTerminal);

    return () => {
      repairTimers.forEach((timer) => window.clearTimeout(timer));
      terminalTextarea?.removeEventListener("focus", handleTerminalFocus);
      terminalTextarea?.removeEventListener("blur", handleTerminalBlur);
      window.visualViewport?.removeEventListener("resize", repairTerminalViewport);
      window.visualViewport?.removeEventListener("scroll", repairTerminalViewport);
      if (formFactor === "iphone") {
        root.classList.remove("aiwb-keyboard-focus");
        body?.classList.remove("aiwb-keyboard-focus");
      }
      observer.disconnect();
      inputSubscription.dispose();
      resizeSubscription.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      setTerminalReady(false);
    };
  }, [fitTerminal, formFactor, open, theme, writeData]);

  useEffect(() => {
    if (!terminalRef.current) return;
    terminalRef.current.options.theme = terminalTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (!open) return undefined;
    let disposed = false;
    let dataHandle;
    let stateHandle;

    setListenersReady(false);
    void Promise.all([
      SSHWorkbench.addListener("terminalData", (payload) => {
        if (payload?.terminalId !== terminalIdRef.current) return;
        if (payload.base64) terminalRef.current?.write(decodeBase64Bytes(payload.base64));
        else terminalRef.current?.write(String(payload.data || ""));
      }),
      SSHWorkbench.addListener("terminalState", (payload) => {
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
      }),
    ]).then(([nextDataHandle, nextStateHandle]) => {
      if (disposed) {
        void nextDataHandle.remove();
        void nextStateHandle.remove();
        return;
      }
      dataHandle = nextDataHandle;
      stateHandle = nextStateHandle;
      setListenersReady(true);
    });

    return () => {
      disposed = true;
      setListenersReady(false);
      void dataHandle?.remove();
      void stateHandle?.remove();
    };
  }, [open]);

  useEffect(() => {
    if (!open || !terminalReady || !listenersReady || terminalIdRef.current || manualDisconnectRef.current) return;
    void connect();
  }, [connect, listenersReady, open, sessionKey, terminalReady]);

  useEffect(() => {
    if (open) return;
    void closeConnection();
  }, [closeConnection, open]);

  useEffect(
    () => () => {
      void closeConnection();
    },
    [closeConnection],
  );

  if (!open) return null;

  return (
    <section
      className={`native-ssh-screen ${formFactor}`}
      data-theme={theme}
      role="dialog"
      aria-modal="true"
      aria-label="当前会话 SSH 终端"
    >
      <header className="native-ssh-header">
        <button type="button" className="native-ssh-close" onClick={onClose} aria-label="关闭 SSH 终端">
          <X size={19} weight="bold" aria-hidden="true" />
        </button>
        <div className="native-ssh-title">
          <TerminalWindow size={16} weight="bold" aria-hidden="true" />
          <strong>SSH</strong>
          <span>{endpoint}</span>
        </div>
        <div className="native-ssh-actions">
          <span className={`native-ssh-state ${statusCopy.tone}`}>
            <i aria-hidden="true" />
            {statusCopy.label}
          </span>
          {status !== "connected" ? (
            <button type="button" onClick={() => void connect({ afterDisconnect: false })} aria-label="重新连接">
              <ArrowClockwise size={17} weight="bold" aria-hidden="true" />
            </button>
          ) : null}
          <button type="button" onClick={() => terminalRef.current?.clear()} aria-label="清空终端">
            <Eraser size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => void closeConnection({ manual: true })}
            disabled={status === "closed"}
            aria-label="断开 SSH"
          >
            <Plugs size={17} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="native-ssh-terminal" ref={containerRef} />
      <footer className="native-ssh-keys" aria-label="终端快捷键">
        <button type="button" onClick={() => writeData("\u001b")}>Esc</button>
        <button type="button" onClick={() => writeData("\u0003")}>Ctrl C</button>
        <button type="button" onClick={() => writeData("\t")}>Tab</button>
        <button type="button" onClick={() => writeData("\r")} aria-label="执行命令">
          <ArrowBendDownLeft size={17} weight="bold" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => writeData("\u001b[A")} aria-label="上一条命令">
          <CaretUp size={17} weight="bold" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => writeData("\u001b[B")} aria-label="下一条命令">
          <CaretDown size={17} weight="bold" aria-hidden="true" />
        </button>
      </footer>
    </section>
  );
}
