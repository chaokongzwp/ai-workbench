import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";

const SSHWorkbench = registerPlugin("SSHWorkbench", {
  web: () => ({
    async runCommand() {
      throw new Error("浏览器预览不能直接发起 SSH，请在 iPhone 或 iPad App 中测试。");
    },
    async saveProfile({ profile }) {
      localStorage.setItem("ai-workbench-profile", JSON.stringify(profile ?? {}));
      return { ok: true };
    },
    async loadProfile() {
      const raw = localStorage.getItem("ai-workbench-profile");
      return { profile: raw ? JSON.parse(raw) : {} };
    },
    async clearProfile() {
      localStorage.removeItem("ai-workbench-profile");
      return { ok: true };
    },
  }),
});

const defaultProfile = {
  host: "47.236.117.100",
  port: 22,
  username: "root",
  password: "",
  workdir: "/opt/limpet-workspace",
  tmuxSession: "ai-dev",
  codexCommand: "/usr/local/bin/codex",
  claudeCommand: "/usr/local/bin/claude",
  connectTimeoutSeconds: 15,
};

const agents = [
  {
    id: "codex",
    name: "Codex CLI",
    shortName: "Codex",
    accent: "primary",
    commandKey: "codexCommand",
  },
  {
    id: "claude",
    name: "Claude Code",
    shortName: "Claude",
    accent: "neutral",
    commandKey: "claudeCommand",
  },
];

let messageCounter = 0;

function createMessage(partial) {
  messageCounter += 1;
  return {
    id: `msg-${Date.now()}-${messageCounter}`,
    status: "done",
    output: "",
    createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    ...partial,
  };
}

function normalizeProfile(profile) {
  return {
    ...defaultProfile,
    ...(profile ?? {}),
    port: Number(profile?.port ?? defaultProfile.port) || defaultProfile.port,
    connectTimeoutSeconds:
      Number(profile?.connectTimeoutSeconds ?? defaultProfile.connectTimeoutSeconds) ||
      defaultProfile.connectTimeoutSeconds,
  };
}

function profileIssue(profile) {
  if (!String(profile?.host || "").trim()) return "请填写 ECS IP 或域名";
  if (!String(profile?.username || "").trim()) return "请填写 SSH 用户名";
  if (!String(profile?.password || "").trim()) return "请先填写 SSH 密码";
  return "";
}

function profileReady(profile) {
  return !profileIssue(profile);
}

function shQuote(value) {
  return `'${String(value ?? "").replace(/'/g, "'\\''")}'`;
}

function bashCommand(script) {
  return `bash -lc ${shQuote(script)}`;
}

function commandName(command) {
  return String(command || "").trim().split(/\s+/)[0] || "";
}

function toBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function sessionName(profile, agentId) {
  const base = String(profile.tmuxSession || "ai-dev").trim() || "ai-dev";
  return `${base}-${agentId}`;
}

function agentCommand(profile, agent) {
  return profile[agent.commandKey] || defaultProfile[agent.commandKey];
}

function buildHealthCommand(profile) {
  const codexProbe = commandName(profile.codexCommand);
  const claudeProbe = commandName(profile.claudeCommand);

  return bashCommand(`
set -e
mkdir -p ${shQuote(profile.workdir)}
cd ${shQuote(profile.workdir)}
printf '__AIWB_HOST__%s\\n' "$(hostname)"
printf '__AIWB_USER__%s\\n' "$(whoami)"
printf '__AIWB_PWD__%s\\n' "$(pwd)"
printf '__AIWB_TMUX__%s\\n' "$(command -v tmux || true)"
printf '__AIWB_CODEX__%s\\n' "$(command -v ${codexProbe ? shQuote(codexProbe) : "codex"} || true)"
printf '__AIWB_CLAUDE__%s\\n' "$(command -v ${claudeProbe ? shQuote(claudeProbe) : "claude"} || true)"
printf '__AIWB_TMUX_VERSION__'
(tmux -V 2>&1 || true) | head -n 1
printf '__AIWB_CODEX_VERSION__'
(${profile.codexCommand} --version 2>&1 || true) | head -n 1
printf '__AIWB_CLAUDE_VERSION__'
(${profile.claudeCommand} --version 2>&1 || true) | head -n 1
`);
}

function parseHealth(output) {
  const result = {};
  for (const line of String(output || "").split("\n")) {
    const match = line.match(/^__AIWB_([^_]+(?:_[^_]+)*)__([\s\S]*)$/);
    if (match) {
      result[match[1].toLowerCase()] = match[2].trim();
    }
  }
  return result;
}

function buildAgentSendCommand(profile, agent, prompt) {
  const targetSession = sessionName(profile, agent.id);
  const encodedPrompt = toBase64Utf8(prompt);
  const command = agentCommand(profile, agent);

  return bashCommand(`
set -e
mkdir -p ${shQuote(profile.workdir)}
if ! tmux has-session -t ${shQuote(targetSession)} 2>/dev/null; then
  tmux new-session -d -s ${shQuote(targetSession)} -c ${shQuote(profile.workdir)} ${shQuote(command)}
  sleep 2
fi
AIWB_PROMPT=$(printf '%s' ${shQuote(encodedPrompt)} | base64 -d)
tmux set-buffer -b aiwb-prompt "$AIWB_PROMPT"
tmux paste-buffer -t ${shQuote(targetSession)} -b aiwb-prompt
tmux send-keys -t ${shQuote(targetSession)} C-m
sleep 1
tmux capture-pane -t ${shQuote(targetSession)} -p -S -260
`);
}

function buildCaptureCommand(profile, agent) {
  const targetSession = sessionName(profile, agent.id);
  return bashCommand(`
if tmux has-session -t ${shQuote(targetSession)} 2>/dev/null; then
  tmux capture-pane -t ${shQuote(targetSession)} -p -S -260
else
  printf 'tmux session not running: %s\\n' ${shQuote(targetSession)}
fi
`);
}

function buildInterruptCommand(profile, agent) {
  const targetSession = sessionName(profile, agent.id);
  return bashCommand(`
if tmux has-session -t ${shQuote(targetSession)} 2>/dev/null; then
  tmux send-keys -t ${shQuote(targetSession)} C-c
  sleep 0.4
  tmux capture-pane -t ${shQuote(targetSession)} -p -S -160
else
  printf 'tmux session not running: %s\\n' ${shQuote(targetSession)}
fi
`);
}

function buildKillCommand(profile, agent) {
  const targetSession = sessionName(profile, agent.id);
  return bashCommand(`
if tmux has-session -t ${shQuote(targetSession)} 2>/dev/null; then
  tmux kill-session -t ${shQuote(targetSession)}
  printf 'killed tmux session: %s\\n' ${shQuote(targetSession)}
else
  printf 'tmux session not running: %s\\n' ${shQuote(targetSession)}
fi
`);
}

function shortError(error) {
  return error?.message || String(error || "未知错误");
}

export function App() {
  const [profile, setProfile] = useState(defaultProfile);
  const [draftProfile, setDraftProfile] = useState(defaultProfile);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const [historyEnabled, setHistoryEnabled] = useState(false);
  const [activeAgentId, setActiveAgentId] = useState("codex");
  const [composer, setComposer] = useState("");
  const [connection, setConnection] = useState({
    state: "idle",
    label: "待配置",
    detail: "添加服务器后即可开始",
  });
  const [diagnostics, setDiagnostics] = useState({});
  const [rawOutput, setRawOutput] = useState("原始输出会在测试连接或发送任务后显示。");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([
    createMessage({
      role: "assistant",
      title: "准备开始远程工作",
      body: "先完成 SSH 配置，然后把任务发送到 ECS 上的 Codex 或 Claude tmux 会话。",
      status: "idle",
    }),
  ]);

  const activeAgent = useMemo(
    () => agents.find((item) => item.id === activeAgentId) ?? agents[0],
    [activeAgentId],
  );
  const isProfileReady = useMemo(() => profileReady(profile), [profile]);
  const profileRef = useRef(profile);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        const result = await SSHWorkbench.loadProfile();
        if (cancelled) return;

        const loaded = normalizeProfile(result?.profile);
        setProfile(loaded);
        setDraftProfile(loaded);
        setConnection(
          profileReady(loaded)
            ? { state: "idle", label: "未测试", detail: `${loaded.username}@${loaded.host}` }
            : { state: "idle", label: "待配置", detail: profileIssue(loaded) },
        );
      } catch {
        if (cancelled) return;
        setProfile(defaultProfile);
        setDraftProfile(defaultProfile);
        setConnection({ state: "idle", label: "待配置", detail: profileIssue(defaultProfile) });
      }
    }

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  const runRemoteCommand = useCallback(async (command, maxResponseSize = 1_048_576) => {
    const current = normalizeProfile(profileRef.current);
    const missing = profileIssue(current);
    if (missing) {
      throw new Error(missing);
    }

    const result = await SSHWorkbench.runCommand({
      host: current.host,
      port: current.port,
      username: current.username,
      password: current.password,
      connectTimeoutSeconds: current.connectTimeoutSeconds,
      command,
      maxResponseSize,
    });

    return result?.stdout ?? "";
  }, []);

  const saveCurrentProfile = useCallback(async (nextProfile = draftProfile) => {
    const normalized = normalizeProfile(nextProfile);
    await SSHWorkbench.saveProfile({ profile: normalized });
    setProfile(normalized);
    setDraftProfile(normalized);
    profileRef.current = normalized;
    return normalized;
  }, [draftProfile]);

  function showProfileIssue(nextProfile, openSettings = true) {
    const issue = profileIssue(nextProfile);
    if (!issue) return false;

    setConnection({ state: "error", label: "待配置", detail: issue });
    setRawOpen(false);
    setRawOutput(issue);
    if (openSettings) setSettingsOpen(true);
    return true;
  }

  async function testConnection() {
    const nextProfile = await saveCurrentProfile();
    if (showProfileIssue(nextProfile)) return;

    setBusy(true);
    setRawOpen(false);
    setConnection({ state: "testing", label: "测试中", detail: `${nextProfile.username}@${nextProfile.host}` });

    try {
      const stdout = await runRemoteCommand(buildHealthCommand(nextProfile), 512_000);
      const parsed = parseHealth(stdout);
      setDiagnostics(parsed);
      setRawOutput(stdout.trim() || "连接成功，但没有返回输出。");
      setConnection({
        state: "connected",
        label: "已连接",
        detail: `${parsed.user || nextProfile.username}@${parsed.host || nextProfile.host}`,
      });
      setMessages((items) => [
        ...items,
        createMessage({
          role: "assistant",
          title: "ECS 连接通过",
          body: `工作目录 ${parsed.pwd || nextProfile.workdir} 可用，tmux、Codex 与 Claude 已完成探测。`,
          status: "done",
        }),
      ]);
    } catch (error) {
      const message = shortError(error);
      setRawOpen(true);
      setRawOutput(message);
      setConnection({ state: "error", label: "连接失败", detail: message });
    } finally {
      setBusy(false);
    }
  }

  async function sendTask() {
    const text = composer.trim();
    if (!text || busy) return;

    const currentProfile = normalizeProfile(profileRef.current);
    if (showProfileIssue(currentProfile)) return;

    const assistantMessageId = `agent-${Date.now()}`;
    setComposer("");
    setRawOpen(false);
    setBusy(true);
    setMessages((items) => [
      ...items,
      createMessage({ role: "user", body: text }),
      createMessage({
        id: assistantMessageId,
        role: "assistant",
        agentId: activeAgent.id,
        title: `已发送到 ${activeAgent.shortName}`,
        body: `tmux: ${sessionName(currentProfile, activeAgent.id)}，正在等待远端输出。`,
        status: "running",
      }),
    ]);

    try {
      const firstOutput = await runRemoteCommand(
        buildAgentSendCommand(currentProfile, activeAgent, text),
        2_097_152,
      );
      setRawOutput(firstOutput.trim());
      updateAssistantMessage(assistantMessageId, {
        output: firstOutput.trim(),
        status: "running",
      });

      for (let index = 0; index < 5; index += 1) {
        await sleep(1800);
        const output = await runRemoteCommand(buildCaptureCommand(currentProfile, activeAgent), 2_097_152);
        setRawOutput(output.trim());
        updateAssistantMessage(assistantMessageId, {
          output: output.trim(),
          status: index === 4 ? "done" : "running",
        });
      }

      setConnection({
        state: "connected",
        label: "会话运行中",
        detail: sessionName(currentProfile, activeAgent.id),
      });
    } catch (error) {
      const message = shortError(error);
      setRawOpen(true);
      setRawOutput(message);
      updateAssistantMessage(assistantMessageId, {
        title: "远端执行失败",
        body: message,
        status: "error",
      });
      setConnection({ state: "error", label: "执行失败", detail: message });
    } finally {
      setBusy(false);
    }
  }

  function updateAssistantMessage(id, patch) {
    setMessages((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function refreshOutput() {
    if (busy) return;
    const currentProfile = normalizeProfile(profileRef.current);
    if (showProfileIssue(currentProfile)) return;

    setBusy(true);
    setRawOpen(true);
    try {
      const output = await runRemoteCommand(buildCaptureCommand(currentProfile, activeAgent), 2_097_152);
      setRawOutput(output.trim());
      setMessages((items) => [
        ...items,
        createMessage({
          role: "assistant",
          agentId: activeAgent.id,
          title: `${activeAgent.shortName} 输出已刷新`,
          body: `tmux: ${sessionName(currentProfile, activeAgent.id)}`,
          output: output.trim(),
        }),
      ]);
    } catch (error) {
      setRawOutput(shortError(error));
    } finally {
      setBusy(false);
    }
  }

  async function interruptAgent() {
    if (busy) return;
    const currentProfile = normalizeProfile(profileRef.current);
    if (showProfileIssue(currentProfile)) return;

    setBusy(true);
    setRawOpen(true);
    try {
      const output = await runRemoteCommand(buildInterruptCommand(currentProfile, activeAgent), 1_048_576);
      setRawOutput(output.trim());
      setConnection({
        state: "connected",
        label: "已发送中断",
        detail: sessionName(currentProfile, activeAgent.id),
      });
    } catch (error) {
      setRawOutput(shortError(error));
    } finally {
      setBusy(false);
    }
  }

  async function killAgentSession() {
    if (busy) return;
    const currentProfile = normalizeProfile(profileRef.current);
    if (showProfileIssue(currentProfile)) return;

    setBusy(true);
    setRawOpen(true);
    try {
      const output = await runRemoteCommand(buildKillCommand(currentProfile, activeAgent), 512_000);
      setRawOutput(output.trim());
      setConnection({
        state: "idle",
        label: "会话已关闭",
        detail: sessionName(currentProfile, activeAgent.id),
      });
    } catch (error) {
      setRawOutput(shortError(error));
    } finally {
      setBusy(false);
    }
  }

  async function clearProfile() {
    await SSHWorkbench.clearProfile();
    setProfile(defaultProfile);
    setDraftProfile(defaultProfile);
    setDiagnostics({});
    setRawOpen(false);
    setRawOutput("连接配置已清空。");
    setConnection({ state: "idle", label: "待配置", detail: profileIssue(defaultProfile) });
  }

  const platformLabel = Capacitor.getPlatform() === "ios" ? "iOS 原生 SSH" : "Web 预览";

  return (
    <main className="app-shell">
      <TopBar
        connection={connection}
        profile={profile}
        profileReady={isProfileReady}
        platformLabel={platformLabel}
        onOpenNav={() => setMobileNavOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onTestConnection={testConnection}
        busy={busy}
      />

      <div className="workspace">
        <aside className="sidebar desktop-sidebar">
          <NavigationPanel
            profile={profile}
            activeAgentId={activeAgentId}
            diagnostics={diagnostics}
            historyEnabled={historyEnabled}
            setActiveAgentId={setActiveAgentId}
            setHistoryEnabled={setHistoryEnabled}
            onOpenSettings={() => setSettingsOpen(true)}
            onRefreshOutput={refreshOutput}
            busy={busy}
          />
        </aside>

        <section className="conversation">
          <div className="conversation-scroll">
            <ConnectionSummary
              profile={profile}
              connection={connection}
              diagnostics={diagnostics}
              profileReady={isProfileReady}
              busy={busy}
              onOpenSettings={() => setSettingsOpen(true)}
              onTestConnection={testConnection}
            />
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} activeAgent={activeAgent} />
            ))}
          </div>

          <Composer
            activeAgent={activeAgent}
            activeAgentId={activeAgentId}
            composer={composer}
            historyEnabled={historyEnabled}
            rawOpen={rawOpen}
            busy={busy}
            profile={profile}
            profileReady={isProfileReady}
            setActiveAgentId={setActiveAgentId}
            setComposer={setComposer}
            setRawOpen={setRawOpen}
            onOpenSettings={() => setSettingsOpen(true)}
            onSend={sendTask}
          />
        </section>
      </div>

      <RawOutput
        open={rawOpen}
        agent={activeAgent}
        profile={profile}
        connection={connection}
        rawOutput={rawOutput}
        busy={busy}
        onToggle={() => setRawOpen((value) => !value)}
        onRefresh={refreshOutput}
        onInterrupt={interruptAgent}
        onKill={killAgentSession}
      />

      {mobileNavOpen ? (
        <div className="mobile-drawer" role="dialog" aria-modal="true">
          <button
            className="drawer-backdrop"
            type="button"
            aria-label="关闭导航"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="sidebar drawer-panel">
            <div className="drawer-header">
              <strong>AI Workbench</strong>
              <button type="button" className="text-button" onClick={() => setMobileNavOpen(false)}>
                完成
              </button>
            </div>
            <NavigationPanel
              profile={profile}
              activeAgentId={activeAgentId}
              diagnostics={diagnostics}
              historyEnabled={historyEnabled}
              setActiveAgentId={setActiveAgentId}
              setHistoryEnabled={setHistoryEnabled}
              onOpenSettings={() => {
                setSettingsOpen(true);
                setMobileNavOpen(false);
              }}
              onRefreshOutput={refreshOutput}
              busy={busy}
            />
          </aside>
        </div>
      ) : null}

      {settingsOpen ? (
        <SettingsPanel
          draftProfile={draftProfile}
          busy={busy}
          setDraftProfile={setDraftProfile}
          onClose={() => setSettingsOpen(false)}
          onSave={async () => {
            const saved = await saveCurrentProfile();
            setConnection(
              profileReady(saved)
                ? { state: "idle", label: "未测试", detail: `${saved.username}@${saved.host}` }
                : { state: "idle", label: "待配置", detail: profileIssue(saved) },
            );
            setSettingsOpen(false);
          }}
          onTest={testConnection}
          onClear={clearProfile}
        />
      ) : null}
    </main>
  );
}

function TopBar({ connection, profile, profileReady: ready, platformLabel, onOpenNav, onOpenSettings, onTestConnection, busy }) {
  return (
    <header className="topbar">
      <button className="nav-trigger" type="button" aria-label="打开菜单" onClick={onOpenNav}>
        <span>≡</span>
      </button>
      <div className="brand">
        <ShellIcon label=">" />
        <div>
          <strong>AI Workbench</strong>
          <span>{ready ? platformLabel : "添加服务器后开始"}</span>
        </div>
      </div>
      <div className={`connection-pill ${connection.state}`}>
        <StatusDot status={connection.state} />
        <span>{connection.label}</span>
        <b>{ready ? profile.host : "未连接"}</b>
      </div>
      <div className="topbar-actions">
        <button type="button" className="ghost-button topbar-test" onClick={onTestConnection} disabled={busy}>
          测试
        </button>
        <button type="button" className="ghost-button" onClick={onOpenSettings}>
          服务器
        </button>
      </div>
    </header>
  );
}

function NavigationPanel({
  profile,
  activeAgentId,
  diagnostics,
  historyEnabled,
  setActiveAgentId,
  setHistoryEnabled,
  onOpenSettings,
  onRefreshOutput,
  busy,
}) {
  const connected = Boolean(diagnostics.host);

  return (
    <>
      <SectionHeader title="服务器" />
      <button className="nav-card active" type="button" onClick={onOpenSettings}>
        <span className="nav-title">
          <StatusDot status={connected ? "connected" : "idle"} />
          <strong>默认服务器</strong>
        </span>
        <span className="nav-subtitle">{profile.host || "未添加"}</span>
        <span className="ssh-badge">{connected ? "在线" : "待连接"}</span>
      </button>

      <SectionHeader title="会话" />
      <div className="stack compact">
        {agents.map((agent) => (
          <button
            className={`row-button ${activeAgentId === agent.id ? "active" : ""}`}
            type="button"
            key={agent.id}
            onClick={() => setActiveAgentId(agent.id)}
          >
            <span>
              <StatusDot status={activeAgentId === agent.id ? "connected" : "idle"} />
              {agent.shortName} 会话
            </span>
            <span>›</span>
          </button>
        ))}
      </div>

      <SectionHeader title="模型" />
      <div className="stack">
        {agents.map((agent) => (
          <button
            className={`agent-button ${activeAgentId === agent.id ? "active" : ""}`}
            type="button"
            key={agent.id}
            onClick={() => setActiveAgentId(agent.id)}
          >
            <ShellIcon label={agent.id === "claude" ? "AI" : ">"} />
            <span>
              <strong>{agent.shortName}</strong>
              <small>{agent.id === "codex" ? "适合写代码和改工程" : "适合阅读和解释代码"}</small>
            </span>
          </button>
        ))}
      </div>

      <SectionHeader title="状态" />
      <div className="diagnostic-list">
        <DiagnosticRow label="环境" value={diagnostics.tmux_version || diagnostics.tmux || "未测试"} />
        <DiagnosticRow label="Codex" value={diagnostics.codex_version || diagnostics.codex || "未测试"} />
        <DiagnosticRow label="Claude" value={diagnostics.claude_version || diagnostics.claude || "未测试"} />
      </div>

      <div className="sidebar-footer">
        <button className="row-button" type="button" onClick={onRefreshOutput} disabled={busy}>
          <span>刷新状态</span>
          <span>↻</span>
        </button>
        <label className="toggle-row">
          <span>不保存聊天历史</span>
          <input
            type="checkbox"
            checked={!historyEnabled}
            onChange={(event) => setHistoryEnabled(!event.target.checked)}
          />
        </label>
        <button className="row-button" type="button" onClick={onOpenSettings}>
          <span>服务器设置</span>
          <span>›</span>
        </button>
      </div>
    </>
  );
}

function ConnectionSummary({ profile, connection, diagnostics, profileReady: ready, busy, onOpenSettings, onTestConnection }) {
  const title = ready ? "工作台就绪" : "先添加服务器";
  const body = ready
    ? "选择模型，输入任务，AI 会在你的云端工程里继续工作。"
    : "第一次使用只需要填写服务器和登录密码，之后会直接进入对话。";

  return (
    <section className={`summary-strip ${ready ? "" : "setup-required"}`}>
      <div className="summary-main">
        <span className="eyebrow">Remote AI Workbench</span>
        <h1>{title}</h1>
        <p>{body}</p>
        <div className="summary-actions">
          <button type="button" className="send-button" onClick={ready ? onTestConnection : onOpenSettings} disabled={busy}>
            {ready ? "检查服务器" : "添加服务器"}
          </button>
          <button type="button" className="ghost-button" onClick={onOpenSettings}>
            设置
          </button>
        </div>
      </div>
      <div className="summary-metrics">
        <SummaryMetric label="服务器" value={profile.host} />
        <SummaryMetric label="状态" value={connection.detail} />
        <SummaryMetric label="路径" value={diagnostics.pwd || profile.workdir} mono />
      </div>
    </section>
  );
}

function SummaryMetric({ label, value, mono = false }) {
  return (
    <div className="summary-metric">
      <span>{label}</span>
      <strong className={mono ? "mono" : ""}>{value}</strong>
    </div>
  );
}

function MessageBubble({ message, activeAgent }) {
  const copyText = message.output || message.body || "";

  function copyMessage() {
    if (!copyText || !navigator.clipboard) return;
    navigator.clipboard.writeText(copyText);
  }

  if (message.role === "user") {
    return (
      <article className="user-prompt">
        <p>{message.body}</p>
        <button type="button" className="copy-message" onClick={copyMessage}>
          复制
        </button>
      </article>
    );
  }

  const agent = agents.find((item) => item.id === message.agentId) ?? activeAgent;

  return (
    <article className={`agent-response ${message.status}`}>
      <header className="message-header">
        <ShellIcon label={agent.id === "claude" ? "AI" : ">"} />
        <strong>{message.title || agent.name}</strong>
        <time>{message.createdAt}</time>
        <span className={`streaming ${message.status}`}>{statusLabel(message.status)}</span>
        <button type="button" className="copy-message" onClick={copyMessage}>
          复制
        </button>
      </header>
      {message.body ? <p className="assistant-copy">{message.body}</p> : null}
      {message.output ? (
        <section className="preview-block emphasis">
          <header>
            <div>
              <strong>结果</strong>
              <span>详情输出</span>
            </div>
          </header>
          <pre>{message.output}</pre>
        </section>
      ) : null}
    </article>
  );
}

function statusLabel(status) {
  if (status === "running") return "运行中";
  if (status === "error") return "失败";
  if (status === "idle") return "待命";
  return "完成";
}

function Composer({
  activeAgent,
  activeAgentId,
  composer,
  historyEnabled,
  rawOpen,
  busy,
  profile,
  profileReady: ready,
  setActiveAgentId,
  setComposer,
  setRawOpen,
  onOpenSettings,
  onSend,
}) {
  const disabled = busy || !ready;

  return (
    <footer className="composer">
      <div className="composer-tools">
        <label className="select-shell">
          <ShellIcon label={activeAgent.id === "claude" ? "AI" : ">"} />
          <select value={activeAgentId} onChange={(event) => setActiveAgentId(event.target.value)} disabled={!ready}>
            {agents.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <span className="path-chip">{profile.workdir}</span>
        <button type="button" className={`raw-chip ${rawOpen ? "active" : ""}`} onClick={() => setRawOpen(!rawOpen)}>
          详情
        </button>
        <span className="history-note">{historyEnabled ? "本地记录开启" : "不保存历史"}</span>
      </div>
      <div className="input-row">
        <textarea
          value={composer}
          disabled={!ready}
          onChange={(event) => setComposer(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") onSend();
          }}
          placeholder={ready ? `告诉 ${activeAgent.shortName} 你想做什么` : "先添加服务器后再发送任务"}
          rows={2}
        />
        <div className="input-actions">
          {ready ? (
            <button type="button" className="send-button" onClick={onSend} disabled={disabled || !composer.trim()}>
              {busy ? "等待" : "发送"}
            </button>
          ) : (
            <button type="button" className="send-button" onClick={onOpenSettings}>
              添加服务器
            </button>
          )}
        </div>
      </div>
    </footer>
  );
}

function RawOutput({
  open,
  agent,
  profile,
  connection,
  rawOutput,
  busy,
  onToggle,
  onRefresh,
  onInterrupt,
  onKill,
}) {
  return (
    <section className={`raw-output ${open ? "open" : "collapsed"}`}>
      <header>
        <button type="button" onClick={onToggle} className="raw-title">
          <span>{open ? "⌄" : "›"}</span>
          <strong>详情</strong>
          <StatusDot status={connection.state} />
          <span>{connection.label}</span>
        </button>
        {open ? (
          <div className="raw-meta">
            <span>{agent.shortName}</span>
            <span>{sessionName(profile, agent.id)}</span>
            <button type="button" onClick={onRefresh} disabled={busy}>
              刷新
            </button>
            <button type="button" onClick={onInterrupt} disabled={busy}>
              中断
            </button>
            <button type="button" onClick={onKill} disabled={busy}>
              关闭会话
            </button>
          </div>
        ) : (
          <button type="button" className="raw-expand" onClick={onToggle}>
            查看
          </button>
        )}
      </header>
      {open ? <pre>{rawOutput || "暂无输出。"}</pre> : null}
    </section>
  );
}

function SettingsPanel({ draftProfile, busy, setDraftProfile, onClose, onSave, onTest, onClear }) {
  function updateField(field, value) {
    setDraftProfile((current) => ({ ...current, [field]: value }));
  }

  const missingPassword = !String(draftProfile.password || "").trim();

  return (
    <div className="settings-layer" role="dialog" aria-modal="true">
      <button className="settings-backdrop" type="button" aria-label="关闭设置" onClick={onClose} />
      <section className="settings-panel">
        <header>
          <div>
            <strong>服务器</strong>
            <span>登录信息只保存在本机 Keychain</span>
          </div>
          <button type="button" className="text-button" onClick={onClose}>
            完成
          </button>
        </header>

        {missingPassword ? (
          <p className="settings-note">第一次使用填写登录密码即可，测试通过后就能开始对话。</p>
        ) : null}

        <div className="settings-grid">
          <ConfigField label="服务器地址" value={draftProfile.host} onChange={(value) => updateField("host", value)} />
          <ConfigField
            label="端口"
            value={draftProfile.port}
            inputMode="numeric"
            onChange={(value) => updateField("port", value)}
          />
          <ConfigField
            label="用户名"
            value={draftProfile.username}
            autoComplete="username"
            onChange={(value) => updateField("username", value)}
          />
          <ConfigField
            label="登录密码"
            type="password"
            value={draftProfile.password}
            autoComplete="current-password"
            required
            onChange={(value) => updateField("password", value)}
          />
          <ConfigField
            label="工作路径"
            value={draftProfile.workdir}
            onChange={(value) => updateField("workdir", value)}
          />
        </div>

        <details className="advanced-settings">
          <summary>高级设置</summary>
          <div className="settings-grid">
            <ConfigField
              label="会话前缀"
              value={draftProfile.tmuxSession}
              onChange={(value) => updateField("tmuxSession", value)}
            />
            <ConfigField
              label="Codex 命令"
              value={draftProfile.codexCommand}
              onChange={(value) => updateField("codexCommand", value)}
            />
            <ConfigField
              label="Claude 命令"
              value={draftProfile.claudeCommand}
              onChange={(value) => updateField("claudeCommand", value)}
            />
          </div>
        </details>

        <div className="settings-actions">
          <button type="button" className="danger-button" onClick={onClear} disabled={busy}>
            清空
          </button>
          <button type="button" className="ghost-button" onClick={onSave} disabled={busy}>
            保存
          </button>
          <button type="button" className="send-button" onClick={onTest} disabled={busy}>
            连接
          </button>
        </div>
      </section>
    </div>
  );
}

function ConfigField({ label, value, onChange, type = "text", inputMode, autoComplete, required = false }) {
  return (
    <label className={`config-field ${required ? "required" : ""}`}>
      <span>{label}</span>
      <input
        value={value ?? ""}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function DiagnosticRow({ label, value }) {
  return (
    <div className="diagnostic-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SectionHeader({ title }) {
  return (
    <div className="section-header">
      <span>{title}</span>
    </div>
  );
}

function ShellIcon({ label }) {
  return <span className="shell-icon">{label}</span>;
}

function StatusDot({ status = "connected" }) {
  const normalized = status === "testing" || status === "running" ? "testing" : status;
  return <span className={`status-dot ${normalized}`} />;
}
