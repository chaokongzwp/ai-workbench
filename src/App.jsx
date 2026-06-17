import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";

function desktopBridge() {
  return typeof window !== "undefined" ? window.aiWorkbench : undefined;
}

const SSHWorkbench = registerPlugin("SSHWorkbench", {
  web: () => ({
    async runCommand(payload) {
      const bridge = desktopBridge();
      if (bridge?.runCommand) return bridge.runCommand(payload);
      throw new Error("浏览器预览不能直接发起 SSH，请在 iPhone 或 iPad App 中测试。");
    },
    async saveProfile({ profile }) {
      const bridge = desktopBridge();
      if (bridge?.saveProfile) return bridge.saveProfile({ profile });
      localStorage.setItem("ai-workbench-profile", JSON.stringify(profile ?? {}));
      return { ok: true };
    },
    async loadProfile() {
      const bridge = desktopBridge();
      if (bridge?.loadProfile) return bridge.loadProfile();
      const raw = localStorage.getItem("ai-workbench-profile");
      return { profile: raw ? JSON.parse(raw) : {} };
    },
    async clearProfile() {
      const bridge = desktopBridge();
      if (bridge?.clearProfile) return bridge.clearProfile();
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

const assetBase = import.meta.env.BASE_URL || "./";
const finalAnswerStart = "AIWB_FINAL_START";
const finalAnswerEnd = "AIWB_FINAL_END";

function assetPath(path) {
  return `${assetBase}${path.replace(/^\/+/, "")}`;
}

function formatAgentPrompt(prompt) {
  return `${String(prompt || "").trim()}

请只在任务完成后，把最终给用户看的回答放在下面两个标记之间。标记中不要放命令行日志、过程、菜单、tmux 输出或工具调用记录。

${finalAnswerStart}
这里写最终回答
${finalAnswerEnd}`;
}

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
  if (!String(profile?.username || "").trim()) return "请填写登录用户名";
  if (!String(profile?.password || "").trim()) return "请先填写登录密码";
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

function dirnameRemote(path) {
  const normalized = String(path || "").replace(/\/+$/, "");
  const index = normalized.lastIndexOf("/");
  if (index <= 0) return ".";
  return normalized.slice(0, index);
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
  const encodedPrompt = toBase64Utf8(formatAgentPrompt(prompt));
  const command = agentCommand(profile, agent);
  const starterPath = `${String(profile.workdir || ".").replace(/\/+$/, "")}/.ai-workbench/start-${targetSession}.sh`;
  const starterScript = `#!/usr/bin/env bash
cd ${shQuote(profile.workdir)}
printf 'AI Workbench: 正在启动 ${agent.shortName}...\\n'
${command}
code=$?
printf '\\nAI Workbench: ${agent.shortName} 已退出，退出码 %s。\\n' "$code"
printf '请在服务器上单独运行 ${commandName(command) || agent.shortName} 查看启动原因。\\n'
exec bash -l
`;

  return bashCommand(`
set -e
mkdir -p ${shQuote(profile.workdir)}
mkdir -p ${shQuote(dirnameRemote(starterPath))}
cat > ${shQuote(starterPath)} <<'AIWB_STARTER'
${starterScript}
AIWB_STARTER
chmod 700 ${shQuote(starterPath)}

if tmux has-session -t ${shQuote(targetSession)} 2>/dev/null; then
  CURRENT_COMMAND=$(tmux display-message -p -t ${shQuote(targetSession)} '#{pane_current_command}' 2>/dev/null || true)
  if printf '%s' "$CURRENT_COMMAND" | grep -Eiq '^(bash|zsh|sh|fish)$'; then
    tmux kill-session -t ${shQuote(targetSession)}
  fi
fi

if ! tmux has-session -t ${shQuote(targetSession)} 2>/dev/null; then
  tmux new-session -d -s ${shQuote(targetSession)} -c ${shQuote(profile.workdir)} ${shQuote(starterPath)}
  sleep 1.8
fi

CURRENT_COMMAND=$(tmux display-message -p -t ${shQuote(targetSession)} '#{pane_current_command}' 2>/dev/null || true)
if printf '%s' "$CURRENT_COMMAND" | grep -Eiq '^(bash|zsh|sh|fish)$'; then
  tmux capture-pane -t ${shQuote(targetSession)} -p -S -220
  exit 46
fi

AIWB_PANE=$(tmux capture-pane -t ${shQuote(targetSession)} -p -S -120 2>/dev/null || true)
if printf '%s' "$AIWB_PANE" | grep -Fq 'Introducing GPT-5.5' &&
   printf '%s' "$AIWB_PANE" | grep -Fq 'Use existing model'; then
  tmux capture-pane -t ${shQuote(targetSession)} -p -S -220
  exit 47
fi

AIWB_PROMPT=$(printf '%s' ${shQuote(encodedPrompt)} | base64 -d)
tmux set-buffer -b aiwb-prompt "$AIWB_PROMPT"
tmux paste-buffer -t ${shQuote(targetSession)} -b aiwb-prompt
tmux send-keys -t ${shQuote(targetSession)} C-m
sleep 1
tmux capture-pane -t ${shQuote(targetSession)} -p -S -260
`);
}

function buildModelChoiceCommand(profile, agent, choice) {
  const targetSession = sessionName(profile, agent.id);
  const key = choice === "new" ? "1" : "2";

  return bashCommand(`
if tmux has-session -t ${shQuote(targetSession)} 2>/dev/null; then
  tmux send-keys -t ${shQuote(targetSession)} ${shQuote(key)} C-m
  sleep 1.2
  tmux capture-pane -t ${shQuote(targetSession)} -p -S -180
else
  printf 'tmux session not running: %s\\n' ${shQuote(targetSession)}
fi
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

function isCodexModelChoicePrompt(output) {
  const text = String(output || "");
  return /Introducing GPT-5\.5/i.test(text) && /Try new model/i.test(text) && /Use existing model/i.test(text);
}

function detectAgentIssue(output, agent) {
  const text = String(output || "");
  if (/tmux session not running/i.test(text)) {
    return `${agent.shortName} 会话没有保持运行，这次任务没有完成。请先点“检查服务器”，再重新发送。`;
  }
  if (text.includes(`AI Workbench: ${agent.shortName} 已退出`)) {
    return `${agent.shortName} 没有启动成功。原始原因已放在“详情”里，通常是服务器上的命令路径、登录状态或工具配置需要处理。`;
  }
  return "";
}

function stripTerminalControl(text) {
  return String(text || "")
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "")
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, "");
}

function trimVisibleText(text) {
  return String(text || "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractMarkedFinalOutput(text) {
  const pattern = new RegExp(`${finalAnswerStart}\\s*([\\s\\S]*?)\\s*${finalAnswerEnd}`, "gi");
  let match;
  let answer = "";

  while ((match = pattern.exec(text))) {
    const candidate = trimVisibleText(match[1]);
    if (candidate && !candidate.includes("这里写最终回答")) answer = candidate;
  }

  if (answer) return answer;

  const lastStart = text.lastIndexOf(finalAnswerStart);
  if (lastStart < 0) return "";

  const openAnswer = trimVisibleText(text.slice(lastStart + finalAnswerStart.length).replace(finalAnswerEnd, ""));
  return openAnswer && !openAnswer.includes("这里写最终回答") ? openAnswer : "";
}

function looksLikeTerminalNoise(line, prompt = "") {
  const text = String(line || "").trim();
  const userPrompt = String(prompt || "").trim();

  if (!text) return false;
  if (userPrompt && text === userPrompt) return true;
  if (text === finalAnswerStart || text === finalAnswerEnd || text === "这里写最终回答") return true;
  if (/^(请只在任务完成后|标记中不要放命令行日志)/.test(text)) return true;
  if (/^[╭╮╰╯│┃─━┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬\s]+$/.test(text)) return true;
  if (/^(›|▌|>_|\$|#)\s*/.test(text)) return true;
  if (/^(Introducing GPT-5\.5|Learn more:|Choose how|Use ↑|1\. Try new model|2\. Use existing model)/i.test(text)) {
    return true;
  }
  if (/^(AI Workbench:|tmux session not running|Missing required field:)/i.test(text)) return true;
  if (/^(thinking|working|running|reading|edited|applied|searched|opened|ran|tool|shell)\b/i.test(text)) return true;
  if (/^(ctrl|shift|enter|esc|press enter)\b/i.test(text)) return true;
  if (/^[\w.-]+@[\w.-]+:[~/\w.-]*[$#]/.test(text)) return true;
  if (/^\d+% context left/i.test(text)) return true;

  return false;
}

function fallbackFinalOutput(text, prompt = "") {
  const lines = stripTerminalControl(text)
    .replace(/^AI Workbench: 正在启动 .*\n?/gm, "")
    .replace(/Introducing GPT-5\.5[\s\S]*?press enter to confirm\s*/gi, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""));

  const filtered = [];
  for (const line of lines) {
    if (looksLikeTerminalNoise(line, prompt)) continue;
    filtered.push(line);
  }

  let startIndex = 0;
  const userPrompt = String(prompt || "").trim();
  if (userPrompt) {
    for (let index = filtered.length - 1; index >= 0; index -= 1) {
      if (filtered[index].includes(userPrompt)) {
        startIndex = index + 1;
        break;
      }
    }
  }

  return trimVisibleText(filtered.slice(startIndex).slice(-80).join("\n"));
}

function extractAgentFinalOutput(output, prompt = "") {
  const normalized = stripTerminalControl(output);
  const marked = extractMarkedFinalOutput(normalized);
  if (marked) return { text: marked, final: true };

  return {
    text: fallbackFinalOutput(normalized, prompt),
    final: false,
  };
}

function cleanAgentOutput(output, prompt = "") {
  return extractAgentFinalOutput(output, prompt).text;
}

export function App() {
  const [profile, setProfile] = useState(defaultProfile);
  const [draftProfile, setDraftProfile] = useState(defaultProfile);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
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
  const [messages, setMessages] = useState([]);

  const activeAgent = useMemo(
    () => agents.find((item) => item.id === activeAgentId) ?? agents[0],
    [activeAgentId],
  );
  const isProfileReady = useMemo(() => profileReady(profile), [profile]);
  const hasPendingChoice = messages.some((message) => message.status === "choice");
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
          body: `工作目录 ${parsed.pwd || nextProfile.workdir} 可用，Codex 与 Claude 已完成探测。`,
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

  async function runAgentPrompt({ currentProfile, agent, text, assistantMessageId }) {
    const applyAgentOutput = (output, final = false) => {
      const raw = String(output || "").trim();
      setRawOutput(raw);

      if (isCodexModelChoicePrompt(raw)) {
        setRawOpen(false);
        updateAssistantMessage(assistantMessageId, {
          title: `${agent.shortName} 需要选择模型`,
          body: "Codex CLI 检测到 GPT-5.5 可用。选择后会继续发送刚才的任务。",
          output: "",
          status: "choice",
          modelChoice: { prompt: text, agentId: agent.id },
        });
        setConnection({ state: "idle", label: "等待选择", detail: agent.shortName });
        return false;
      }

      const issue = detectAgentIssue(raw, agent);
      if (issue) {
        setRawOpen(true);
        updateAssistantMessage(assistantMessageId, {
          title: `${agent.shortName} 没有启动成功`,
          body: issue,
          output: "",
          status: "error",
          modelChoice: undefined,
        });
        setConnection({ state: "error", label: "启动失败", detail: agent.shortName });
        return false;
      }

      const extracted = extractAgentFinalOutput(raw, text);
      const visibleOutput = extracted.text;
      const done = extracted.final || (final && Boolean(visibleOutput));
      updateAssistantMessage(assistantMessageId, {
        title: done ? `${agent.shortName} 回复` : `等待 ${agent.shortName} 回复`,
        body: visibleOutput
          ? ""
          : final
            ? `还没有拿到最终回复，稍后点“刷新状态”。`
            : `正在等待 ${agent.shortName} 回复。`,
        output: visibleOutput,
        status: done ? "done" : "running",
        modelChoice: undefined,
      });
      return true;
    };

    const firstOutput = await runRemoteCommand(buildAgentSendCommand(currentProfile, agent, text), 2_097_152);
    if (!applyAgentOutput(firstOutput)) return false;

    for (let index = 0; index < 5; index += 1) {
      await sleep(1800);
      const output = await runRemoteCommand(buildCaptureCommand(currentProfile, agent), 2_097_152);
      if (!applyAgentOutput(output, index === 4)) return false;
    }

    setConnection({
      state: "connected",
      label: "会话运行中",
      detail: sessionName(currentProfile, agent.id),
    });
    return true;
  }

  async function sendTask() {
    const text = composer.trim();
    if (!text || busy || hasPendingChoice) return;

    const currentProfile = normalizeProfile(profileRef.current);
    if (showProfileIssue(currentProfile)) return;

    const agent = activeAgent;
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
        agentId: agent.id,
        title: `已发送到 ${agent.shortName}`,
        body: `正在等待 ${agent.shortName} 回复。`,
        status: "running",
      }),
    ]);

    try {
      await runAgentPrompt({ currentProfile, agent, text, assistantMessageId });
    } catch (error) {
      const message = shortError(error);
      setRawOpen(true);
      setRawOutput(message);
      updateAssistantMessage(assistantMessageId, {
        title: "远端执行失败",
        body: message,
        status: "error",
        modelChoice: undefined,
      });
      setConnection({ state: "error", label: "执行失败", detail: message });
    } finally {
      setBusy(false);
    }
  }

  async function chooseCodexModel(message, choice) {
    if (busy || !message?.modelChoice) return;

    const currentProfile = normalizeProfile(profileRef.current);
    if (showProfileIssue(currentProfile)) return;

    const agent = agents.find((item) => item.id === message.modelChoice.agentId) ?? activeAgent;
    const text = message.modelChoice.prompt;
    const choiceText = choice === "new" ? "试用 GPT-5.5" : "继续使用当前模型";

    setBusy(true);
    setRawOpen(false);
    updateAssistantMessage(message.id, {
      title: `已选择：${choiceText}`,
      body: "正在应用选择，并继续发送刚才的任务。",
      status: "running",
      modelChoice: undefined,
    });

    try {
      const choiceOutput = await runRemoteCommand(buildModelChoiceCommand(currentProfile, agent, choice), 1_048_576);
      setRawOutput(String(choiceOutput || "").trim());
      await runAgentPrompt({ currentProfile, agent, text, assistantMessageId: message.id });
    } catch (error) {
      const detail = shortError(error);
      setRawOpen(true);
      setRawOutput(detail);
      updateAssistantMessage(message.id, {
        title: "模型选择失败",
        body: detail,
        status: "error",
        modelChoice: undefined,
      });
      setConnection({ state: "error", label: "选择失败", detail });
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
          body: `已读取 ${activeAgent.shortName} 当前输出。`,
          output: cleanAgentOutput(output),
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

  const bridge = desktopBridge();
  const platform = Capacitor.getPlatform();
  const desktopPreview =
    !bridge &&
    platform === "web" &&
    typeof window !== "undefined" &&
    window.matchMedia?.("(min-width: 1024px) and (hover: hover)").matches;

  const platformLabel =
    bridge?.platform === "mac"
      ? "macOS 本机调试"
      : platform === "ios"
        ? "iOS 原生 SSH"
        : "Web 预览";

  const shellClassName = `app-shell ${bridge?.platform === "mac" || desktopPreview ? "mac-shell" : ""}`;

  return (
    <main className={shellClassName}>
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
            connection={connection}
            diagnostics={diagnostics}
            onOpenSettings={() => setSettingsOpen(true)}
            onTestConnection={testConnection}
            onRefreshOutput={refreshOutput}
            busy={busy}
          />
        </aside>

        <section className="conversation">
          <div className="conversation-scroll">
            {messages.length === 0 ? (
              <ConnectionSummary
                profile={profile}
                connection={connection}
                diagnostics={diagnostics}
                profileReady={isProfileReady}
                busy={busy}
                activeAgent={activeAgent}
                onOpenSettings={() => setSettingsOpen(true)}
                onTestConnection={testConnection}
              />
            ) : null}
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                activeAgent={activeAgent}
                busy={busy}
                onModelChoice={chooseCodexModel}
              />
            ))}
          </div>

          <Composer
            activeAgent={activeAgent}
            activeAgentId={activeAgentId}
            composer={composer}
            busy={busy}
            pendingChoice={hasPendingChoice}
            profileReady={isProfileReady}
            setActiveAgentId={setActiveAgentId}
            setComposer={setComposer}
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
              connection={connection}
              diagnostics={diagnostics}
              onOpenSettings={() => {
                setSettingsOpen(true);
                setMobileNavOpen(false);
              }}
              onTestConnection={testConnection}
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
        <WorkbenchLogo />
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
  connection,
  diagnostics,
  onOpenSettings,
  onTestConnection,
  onRefreshOutput,
  busy,
}) {
  const connected = connection.state === "connected" || Boolean(diagnostics.host);
  const connectLabel =
    connection.state === "testing" ? "连接中" : connected ? "重连" : connection.state === "error" ? "重试" : "连接";

  function openSettingsFromCard(event) {
    if (event.key && event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onOpenSettings();
  }

  return (
    <>
      <SectionHeader title="服务器" />
      <div
        className="nav-card server-card active"
        role="button"
        tabIndex={0}
        onClick={onOpenSettings}
        onKeyDown={openSettingsFromCard}
      >
        <span className="nav-title">
          <StatusDot status={connected ? "connected" : "idle"} />
          <strong>默认服务器</strong>
        </span>
        <span className="nav-subtitle">{profile.host || "未添加"}</span>
        <button
          className={`connect-badge ${connection.state}`}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onTestConnection();
          }}
          disabled={busy || connection.state === "testing"}
        >
          {connectLabel}
        </button>
      </div>

      <div className="sidebar-meta" aria-label="当前工作区">
        <div>
          <span>工作区</span>
          <strong>{diagnostics.pwd || profile.workdir}</strong>
        </div>
      </div>

      <div className="sidebar-actions">
        <button className="sidebar-action" type="button" onClick={onRefreshOutput} disabled={busy}>
          刷新
        </button>
        <button className="sidebar-action" type="button" onClick={onOpenSettings}>
          设置
        </button>
      </div>
    </>
  );
}

function ConnectionSummary({
  profile,
  connection,
  diagnostics,
  profileReady: ready,
  busy,
  activeAgent,
  onOpenSettings,
  onTestConnection,
}) {
  const title = ready ? `问 ${activeAgent.shortName} 一个任务` : "连接云服务器";
  const body = ready
    ? `当前工作路径 ${diagnostics.pwd || profile.workdir}。`
    : "添加服务器后即可开始对话。";

  return (
    <section className={`summary-strip codex-intro ${ready ? "" : "setup-required"}`}>
      <div className="summary-main">
        <div className="intro-mark">
          <AgentLogo agentId={activeAgent.id} compact />
        </div>
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

function MessageBubble({ message, activeAgent, busy, onModelChoice }) {
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
        <AgentLogo agentId={agent.id} compact />
        <strong>{message.title || agent.name}</strong>
        <time>{message.createdAt}</time>
        <span className={`streaming ${message.status}`}>{statusLabel(message.status)}</span>
        <button type="button" className="copy-message" onClick={copyMessage}>
          复制
        </button>
      </header>
      {message.body ? <p className="assistant-copy">{message.body}</p> : null}
      {message.modelChoice ? (
        <div className="model-choice-actions" aria-label="选择 Codex 模型">
          <button type="button" onClick={() => onModelChoice(message, "new")} disabled={busy}>
            试用 GPT-5.5
          </button>
          <button type="button" onClick={() => onModelChoice(message, "existing")} disabled={busy}>
            继续当前模型
          </button>
        </div>
      ) : null}
      {message.output ? (
        <section className="assistant-answer">
          <pre>{message.output}</pre>
        </section>
      ) : null}
    </article>
  );
}

function statusLabel(status) {
  if (status === "choice") return "待选择";
  if (status === "running") return "运行中";
  if (status === "error") return "失败";
  if (status === "idle") return "待命";
  return "完成";
}

function Composer({
  activeAgent,
  activeAgentId,
  composer,
  busy,
  pendingChoice,
  profileReady: ready,
  setActiveAgentId,
  setComposer,
  onOpenSettings,
  onSend,
}) {
  const disabled = busy || pendingChoice || !ready;

  return (
    <footer className="composer">
      <div className="composer-tools">
        <label className="select-shell">
          <AgentLogo agentId={activeAgent.id} compact />
          <select value={activeAgentId} onChange={(event) => setActiveAgentId(event.target.value)} disabled={!ready || pendingChoice || busy}>
            {agents.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="input-row">
        <textarea
          value={composer}
          disabled={!ready}
          onChange={(event) => setComposer(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") onSend();
          }}
          placeholder={
            pendingChoice
              ? "先完成上面的模型选择"
              : ready
                ? `告诉 ${activeAgent.shortName} 你想做什么`
                : "先添加服务器后再发送任务"
          }
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

function AgentLogo({ agentId, compact = false }) {
  const normalized = agentId === "claude" ? "claude" : "codex";
  const label = normalized === "claude" ? "Claude" : "Codex";
  return (
    <span className={`agent-logo ${normalized} ${compact ? "compact" : ""}`} aria-label={label}>
      <img src={assetPath(`icons/${normalized}.svg`)} alt="" />
    </span>
  );
}

function WorkbenchLogo() {
  return (
    <span className="workbench-logo" aria-label="AI Workbench">
      <img src={assetPath("icons/workbench.png")} alt="" />
    </span>
  );
}

function StatusDot({ status = "connected" }) {
  const normalized = status === "testing" || status === "running" ? "testing" : status;
  return <span className={`status-dot ${normalized}`} />;
}
