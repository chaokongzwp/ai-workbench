import { registerPlugin } from "@capacitor/core";
import {
  lastActiveTaskMessage,
  mergeTaskMessages,
  messageChronologyTimestamp,
  normalizeMessageLifecycle,
  sortConversationMessages,
  taskStateForMessage,
  taskStateIsActive,
  taskStateIsTerminal,
  taskStateSucceeded,
} from "./messageLifecycle.js";
import { normalizeExecutionPermissionMode } from "./executionPermissions.js";

export {
  claudeFullAccessBlockedByRoot,
  claudePermissionArgs,
  claudePermissionMode,
  codexPermissionArgs,
  executionPermissionModeFullAccess,
  executionPermissionModeOptions,
  executionPermissionModeStandard,
  normalizeExecutionPermissionMode,
  profileUsesFullAccess,
} from "./executionPermissions.js";

export function desktopBridge() {
  return typeof window !== "undefined" ? window.aiWorkbench : undefined;
}

export const SSHWorkbench = registerPlugin("SSHWorkbench", {
  web: () => ({
    async connectSession(payload) {
      const bridge = desktopBridge();
      if (bridge?.connectSession) return bridge.connectSession(payload);
      throw new Error("浏览器预览不能建立 SSH 长连接，请在 App 中测试。");
    },
    async disconnectSession(payload) {
      const bridge = desktopBridge();
      if (bridge?.disconnectSession) return bridge.disconnectSession(payload);
      return { ok: true, alreadyDisconnected: true };
    },
    async runCommand(payload) {
      const bridge = desktopBridge();
      if (bridge?.runCommand) return bridge.runCommand(payload);
      throw new Error("浏览器预览不能直接发起 SSH，请在 iPhone 或 iPad App 中测试。");
    },
    async haptic(payload = {}) {
      const bridge = desktopBridge();
      if (bridge?.haptic) return bridge.haptic(payload);
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        const kind = String(payload.kind || payload.style || "light");
        const pattern = kind === "error" ? [18, 30, 18] : kind === "success" ? [12, 20, 12] : 12;
        navigator.vibrate(pattern);
      }
      return { ok: true };
    },
    async openTerminal(payload) {
      const bridge = desktopBridge();
      if (bridge?.openTerminal) return bridge.openTerminal(payload);
      throw new Error("当前环境不能打开本机 SSH 终端，请在 Mac App 中使用。");
    },
    async saveFile(payload = {}) {
      const bridge = desktopBridge();
      if (bridge?.saveFile) return bridge.saveFile(payload);

      const rawBase64 = String(payload.base64 || "");
      const base64 = rawBase64.includes(",") ? rawBase64.split(",").pop() : rawBase64;
      if (!base64) throw new Error("Missing required field: base64");

      const binary = window.atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      const blob = new Blob([bytes], { type: payload.mime || "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = payload.name || "download";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      return { ok: true };
    },
    async routeIntent(payload) {
      const bridge = desktopBridge();
      if (bridge?.routeIntent) return bridge.routeIntent(payload);
      throw new Error("浏览器预览不能调用主 AI，请在 Mac、iPhone 或 iPad App 中测试。");
    },
    async saveProfile({ profile, replaceMessages = false }) {
      const bridge = desktopBridge();
      if (bridge?.saveProfile) return bridge.saveProfile({ profile, replaceMessages });
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
    async appendLog(payload = {}) {
      const bridge = desktopBridge();
      if (bridge?.appendLog) return bridge.appendLog(payload);
      appendBrowserDiagnosticLog(payload);
      return { ok: true };
    },
    async getAppInfo() {
      const bridge = desktopBridge();
      if (bridge?.getAppInfo) return bridge.getAppInfo();
      return {
        name: "AI Workbench",
        version: appVersion,
        build: appBuild,
        displayVersion: appBuild && appBuild !== appVersion ? `${appVersion} (${appBuild})` : appVersion,
        platform: "web",
        arch: "",
        packaged: false,
      };
    },
    async exportLogs(payload = {}) {
      const bridge = desktopBridge();
      if (bridge?.exportLogs) return bridge.exportLogs(payload);
      const name = `AI-Workbench-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      const diagnostics = {
        exportedAt: new Date().toISOString(),
        appVersion,
        appBuild,
        platform: "web",
        context: sanitizeDiagnosticValue(payload.context || payload.workspace || {}),
        logs: loadBrowserDiagnosticLogs(),
      };
      const blob = new Blob([JSON.stringify(diagnostics, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      return { ok: true, name };
    },
    async clearLogs() {
      const bridge = desktopBridge();
      if (bridge?.clearLogs) return bridge.clearLogs();
      clearBrowserDiagnosticLogs();
      return { ok: true };
    },
  }),
});

export const VoiceWorkbench = registerPlugin("VoiceWorkbench", {
  web: () => {
    let recognition = null;
    let wakeRecognition = null;
    let wakeStopRequested = false;

    const fallbackWakePhrases = ["未来"];

    function normalizeWakeText(text) {
      return String(text || "")
        .toLowerCase()
        .replace(/[\s，。,.!?！？、]/g, "");
    }

    function findWakePhrase(text, phrases) {
      const normalized = normalizeWakeText(text);
      return (phrases || fallbackWakePhrases).find((phrase) => {
        const target = normalizeWakeText(phrase);
        return target && normalized.includes(target);
      });
    }

    function isQuietSpeechError(error) {
      return ["no-speech", "aborted"].includes(String(error || ""));
    }

    function emitVoiceTranscript(text) {
      window.dispatchEvent(
        new CustomEvent("aiwb:voice-transcript", {
          detail: { text: String(text || "") },
        }),
      );
    }

    return {
      async start({ locale = "zh-CN", timeoutSeconds = 30, silenceSeconds = 3 } = {}) {
        const bridge = desktopBridge();
        if (bridge?.startVoice) return bridge.startVoice({ locale, timeoutSeconds, silenceSeconds });

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
          throw new Error("当前环境不支持语音识别，请在 Mac、iPhone 或 iPad App 中使用。");
        }

        if (recognition) recognition.stop();

        return new Promise((resolve, reject) => {
          let settled = false;
          let transcript = "";
          recognition = new SpeechRecognition();
          recognition.lang = locale;
          recognition.interimResults = true;
          recognition.continuous = false;

          recognition.onresult = (event) => {
            let text = "";
            for (let index = 0; index < event.results.length; index += 1) {
              text += event.results[index][0]?.transcript || "";
            }
            transcript = text.trim();
            emitVoiceTranscript(transcript);
          };

          recognition.onerror = (event) => {
            if (settled) return;
            settled = true;
            recognition = null;
            if (isQuietSpeechError(event?.error)) {
              resolve({ ok: true, text: "" });
              return;
            }
            const message = event?.error === "not-allowed" ? "没有麦克风权限。" : "语音识别失败。";
            reject(new Error(message));
          };

          recognition.onend = () => {
            recognition = null;
            if (settled) return;
            settled = true;
            resolve({ ok: true, text: transcript });
          };

          recognition.start();
        });
      },
      async stop() {
        const bridge = desktopBridge();
        if (bridge?.stopVoice) return bridge.stopVoice();

        if (recognition) recognition.stop();
        return { ok: true };
      },
      async startWakeWord({ locale = "zh-CN", phrases = fallbackWakePhrases, timeoutSeconds = 50 } = {}) {
        const bridge = desktopBridge();
        if (bridge?.startWakeWord) return bridge.startWakeWord({ locale, phrases, timeoutSeconds });

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
          throw new Error("当前环境不支持唤醒词监听，请在 Mac、iPhone 或 iPad App 中使用。");
        }

        if (wakeRecognition) wakeRecognition.stop();
        wakeStopRequested = false;

        return new Promise((resolve, reject) => {
          let settled = false;
          const wakePhrases = Array.isArray(phrases) && phrases.length ? phrases : fallbackWakePhrases;

          const finish = (payload) => {
            if (settled) return;
            settled = true;
            wakeRecognition = null;
            resolve(payload);
          };

          const startRecognition = () => {
            if (settled || wakeStopRequested) return;
            wakeRecognition = new SpeechRecognition();
            wakeRecognition.lang = locale;
            wakeRecognition.interimResults = true;
            wakeRecognition.continuous = true;

            wakeRecognition.onresult = (event) => {
              let text = "";
              for (let index = 0; index < event.results.length; index += 1) {
                text += event.results[index][0]?.transcript || "";
              }
              const phrase = findWakePhrase(text, wakePhrases);
              if (phrase) {
                wakeStopRequested = true;
                try {
                  wakeRecognition.stop();
                } catch {
                  // ignore stop races from browser speech APIs
                }
                finish({ ok: true, detected: true, phrase, text: text.trim() });
              }
            };

            wakeRecognition.onerror = (event) => {
              if (settled) return;
              wakeRecognition = null;
              if (wakeStopRequested) {
                finish({ ok: true, detected: false });
                return;
              }
              if (isQuietSpeechError(event?.error)) {
                finish({ ok: true, detected: false });
                return;
              }
              const message = event?.error === "not-allowed" ? "没有麦克风权限。" : "唤醒词监听失败。";
              reject(new Error(message));
            };

            wakeRecognition.onend = () => {
              wakeRecognition = null;
              if (settled) return;
              if (wakeStopRequested) {
                finish({ ok: true, detected: false });
                return;
              }
              window.setTimeout(startRecognition, 180);
            };

            wakeRecognition.start();
          };

          startRecognition();
        });
      },
      async stopWakeWord() {
        const bridge = desktopBridge();
        if (bridge?.stopWakeWord) return bridge.stopWakeWord();

        wakeStopRequested = true;
        if (wakeRecognition) wakeRecognition.stop();
        return { ok: true };
      },
      async speak(payload = {}) {
        const bridge = desktopBridge();
        if (bridge?.speakText) return bridge.speakText(payload);

        throw new Error("语音播放已统一使用阿里云 TTS，请在 Mac、iPhone 或 iPad App 中使用。");
      },
      async stopSpeech() {
        const bridge = desktopBridge();
        if (bridge?.stopSpeechOutput) return bridge.stopSpeechOutput();

        return { ok: true };
      },
    };
  },
});

export const serverPlatformDefaults = {
  linux: {
    workdir: "",
    codexCommand: "/usr/local/bin/codex",
    claudeCommand: "claude",
  },
  wsl: {
    workdir: "",
    codexCommand: "codex",
    claudeCommand: "claude",
  },
  windows: {
    workdir: "",
    codexCommand: "codex",
    claudeCommand: "claude",
  },
};

export const legacyDefaultWorkdirs = {
  linux: "/opt/limpet-workspace",
  wsl: "/home/ai-workbench",
  windows: "C:\\AIWorkbench",
};

export const serverPlatforms = [
  { id: "linux", label: "Linux" },
  { id: "wsl", label: "Windows + WSL" },
  { id: "windows", label: "Windows PowerShell" },
];

export const builtInAliyunVoiceConfig = {
  apiKey: String(import.meta.env?.VITE_AIWB_DASHSCOPE_API_KEY || "").trim(),
  workspaceId: String(
    import.meta.env?.VITE_AIWB_DASHSCOPE_WORKSPACE_ID || "llm-0hn2qaqnqgcdfnbg",
  ).trim(),
};

export const defaultProfile = {
  platform: "linux",
  wslDistro: "",
  host: "",
  hostAlternates: [],
  port: 22,
  username: "root",
  password: "",
  workdir: "",
  gitRepoUrl: "",
  gitTargetDir: "",
  gitBranch: "",
  agentId: "codex",
  aiModel: "",
  tmuxSession: "ai-dev",
  codexCommand: serverPlatformDefaults.linux.codexCommand,
  claudeCommand: serverPlatformDefaults.linux.claudeCommand,
  mainAIEnabled: false,
  mainAIModel: "gpt-5.4-mini",
  openAIAPIKey: "",
  wakeWordPhrases: "未来",
  taskWakePhrases: "",
  voiceInputEnabled: false,
  aliyunApiKey: builtInAliyunVoiceConfig.apiKey,
  aliyunWorkspaceId: builtInAliyunVoiceConfig.workspaceId,
  ttsVoiceName: "longanhuan",
  ttsModel: "cosyvoice-v3-flash",
  playResultAudio: false,
  resultAudioMode: "summary",
  taskPushNotificationsEnabled: false,
  useWorkbenchAgent: true,
  executionPermissionMode: "standard",
  appearanceMode: "light",
  messageFontFamily: "system",
  messageFontSize: "16",
  messageFontWeight: "500",
  messageLineHeight: "1.65",
  connectTimeoutSeconds: 30,
};

export const agents = [
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

export const defaultModelOption = { id: "", label: "默认模型" };

export const agentModelOptions = {
  codex: [
    defaultModelOption,
    { id: "gpt-5.6", label: "GPT-5.6" },
    { id: "gpt-5.5", label: "GPT-5.5" },
    { id: "gpt-5.4", label: "GPT-5.4" },
    { id: "gpt-5.4-mini", label: "GPT-5.4 mini" },
  ],
  claude: [
    defaultModelOption,
    { id: "sonnet", label: "Sonnet（推荐）" },
    { id: "opus", label: "Opus" },
  ],
};

const legacyClaudeModelAliases = {
  "claude-5.0": "sonnet",
  "claude-4.8": "sonnet",
  "claude-sonnet-5": "sonnet",
  "claude-sonnet-4.5": "sonnet",
  "claude-opus-5": "opus",
  "claude-opus-4.5": "opus",
};

const invalidAgentModelValues = new Set([
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
  "longanhuan",
  "longanyang",
  "cosyvoice-v2",
  "cosyvoice-v3-flash",
]);

export function normalizeAgentModel(agentId, value) {
  const normalizedAgent = agentId === "claude" ? "claude" : "codex";
  const rawModel = String(value || "").trim();
  if (invalidAgentModelValues.has(rawModel.toLowerCase())) return "";
  const model = normalizedAgent === "claude" ? legacyClaudeModelAliases[rawModel] || rawModel : rawModel;
  if (!model) return "";
  const options = agentModelOptions[normalizedAgent] || [];
  const matched = options.find((option) => option.id === model || option.label === model);
  return matched?.id ?? model;
}

export function agentModelOptionsForAgent(agentId, currentModel = "") {
  const normalizedAgent = agentId === "claude" ? "claude" : "codex";
  const options = agentModelOptions[normalizedAgent] || [defaultModelOption];
  const model = normalizeAgentModel(normalizedAgent, currentModel);
  if (!model || options.some((option) => option.id === model)) return options;
  return [...options, { id: model, label: model }];
}

export function agentModelLabel(agentId, value) {
  const model = normalizeAgentModel(agentId, value);
  if (!model) return "";
  const option = agentModelOptionsForAgent(agentId, model).find((item) => item.id === model);
  return option?.label || model;
}

export const voiceToneOptions = [
  { id: "longanhuan", label: "爱小欢" },
  { id: "longanyang", label: "爱小洋" },
  { id: "longanwen_v3", label: "成熟女人风" },
  { id: "longanyue_v3", label: "湾区小威" },
  { id: "longanmin_v3", label: "小甜系宣仪" },
];

export const ttsModelOptions = [
  { id: "cosyvoice-v3-flash", label: "CosyVoice v3 Flash" },
  { id: "cosyvoice-v2", label: "CosyVoice v2" },
];

export const resultAudioModeOptions = [
  { id: "summary", label: "只播报任务完成" },
  { id: "full", label: "播放完整结果" },
];

export const appearanceModeOptions = [
  { id: "light", label: "浅色" },
  { id: "dark", label: "深色" },
  { id: "system", label: "跟随系统" },
];

export const messageFontFamilyOptions = [
  { id: "system", label: "系统字体" },
  { id: "rounded", label: "圆润字体" },
  { id: "serif", label: "衬线字体" },
];

export const messageFontSizeOptions = [
  { id: "14", label: "小 · 14" },
  { id: "15", label: "较小 · 15" },
  { id: "16", label: "标准 · 16" },
  { id: "17", label: "较大 · 17" },
  { id: "18", label: "大 · 18" },
];

export const messageFontWeightOptions = [
  { id: "400", label: "常规" },
  { id: "500", label: "适中" },
  { id: "600", label: "强调" },
];

export const messageLineHeightOptions = [
  { id: "1.45", label: "紧凑" },
  { id: "1.65", label: "标准" },
  { id: "1.85", label: "宽松" },
];

export function normalizeMessageFontFamily(value) {
  const candidate = String(value || "").trim();
  return messageFontFamilyOptions.some((option) => option.id === candidate) ? candidate : defaultProfile.messageFontFamily;
}

export function normalizeMessageFontSize(value) {
  const candidate = String(value || "").trim();
  return messageFontSizeOptions.some((option) => option.id === candidate) ? candidate : defaultProfile.messageFontSize;
}

export function normalizeMessageFontWeight(value) {
  const candidate = String(value || "").trim();
  return messageFontWeightOptions.some((option) => option.id === candidate) ? candidate : defaultProfile.messageFontWeight;
}

export function normalizeMessageLineHeight(value) {
  const candidate = String(value || "").trim();
  return messageLineHeightOptions.some((option) => option.id === candidate) ? candidate : defaultProfile.messageLineHeight;
}

export function messageFontFamilyCss(value) {
  switch (normalizeMessageFontFamily(value)) {
    case "rounded":
      return 'ui-rounded, "SF Pro Rounded", -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
    case "serif":
      return '"Songti SC", "STSong", "Noto Serif CJK SC", serif';
    default:
      return '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif';
  }
}

export const markerLabels = {
  history: "历史会话",
  active: "运行中",
  agent: "Agent 会话",
  "agent-session": "已关联",
  running: "运行中",
  manual: "手动添加",
  saved: "最近添加",
};

export const directoryPrefsStorageKey = "ai-workbench-directory-prefs-v1";

export const manualWorkdirHistoryStorageKey = "ai-workbench-manual-workdirs-v1";

export const workspaceStoreVersion = 4;

export const localMessageHistoryVersion = 2;

export const localMessageHistoryStorageKey = "ai-workbench-local-message-history-v2";

export const workspaceMirrorStorageKey = "ai-workbench-workspace-mirror-v2";

const legacyLocalMessageHistoryStorageKey = "ai-workbench-local-message-history-v1";

const legacyWorkspaceMirrorStorageKey = "ai-workbench-workspace-mirror-v1";

export const browserDiagnosticLogStorageKey = "ai-workbench-diagnostics-log-v1";

export const migrationFileKind = "ai-workbench-config";

export const migrationFileVersion = 1;

export const cloudSyncDefaultEndpoint = "https://inner-api.limpet-inc.cn/aiwb-config-sync";

export const cloudSyncSettingsStorageKey = "ai-workbench-cloud-sync-settings-v1";

export const cloudSyncPayloadKind = "ai-workbench-cloud-config";

export const cloudSyncPayloadVersion = 2;

export const cloudSyncEncryptionKind = "ai-workbench-cloud-config-encrypted";

const cloudSyncKdfIterations = 150000;

const cloudSyncTextEncoder = new TextEncoder();

const cloudSyncTextDecoder = new TextDecoder();

const cloudSyncAccountPattern = /^[A-Za-z0-9_.@+-]{2,96}$/;

export const appVersion =
  typeof __AIWB_APP_VERSION__ === "string" && __AIWB_APP_VERSION__ ? __AIWB_APP_VERSION__ : "1.0.0";

export const appBuild = typeof __AIWB_APP_BUILD__ === "string" ? __AIWB_APP_BUILD__ : "";

export const appDisplayVersion = appBuild && appBuild !== appVersion ? `v${appVersion} · build ${appBuild}` : `v${appVersion}`;

export const assetBase = import.meta.env?.BASE_URL || "./";

export const finalAnswerStart = "AIWB_FINAL_START";

export const finalAnswerEnd = "AIWB_FINAL_END";

export const mainAIRouteSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: ["run_agent_task", "switch_agent", "ask_clarification", "answer_directly", "stop", "no_action"],
    },
    agent: {
      type: "string",
      enum: ["codex", "claude", "current"],
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
    requiresConfirmation: {
      type: "boolean",
    },
    task: {
      type: "string",
    },
    reply: {
      type: "string",
    },
    reason: {
      type: "string",
    },
  },
  required: ["action", "agent", "confidence", "requiresConfirmation", "task", "reply", "reason"],
};

export const mainAIRouterInstructions = [
  "你是 AI Workbench 的主 AI 路由器，只输出结构化 JSON。",
  "你的任务是理解用户自然语言，并决定 App 下一步做什么。",
  "不要执行代码，不要编造远端结果，不要输出 Markdown。",
  "如果用户明确要停止、取消、中断，action=stop。",
  "如果只是闲聊或问 App 能力，action=answer_directly。",
  "如果缺少必要目标或用户还没说清楚，action=ask_clarification。",
  "如果用户只是要切换 Codex 或 Claude，action=switch_agent。",
  "如果用户要检查、修改、运行、查询项目或让 AI 工作，action=run_agent_task。",
  "写代码、改工程、排错、执行命令优先选 codex；阅读解释、总结分析可以选 claude；不确定则 current。",
  "删除、发布、安装依赖、改生产配置、覆盖文件等风险操作 requiresConfirmation=true。",
  "task 必须是可以直接发给 Codex/Claude 的中文任务，不要包含底层路由解释。",
].join("\n");

export const defaultWakeWordPhrases = ["未来"];

export const speechInterruptPhrases = ["停止", "停止播放", "停一下", "别说了", "打断", "中断", "取消播放"];

export const currentResultPlaybackPhrases = ["播放结果", "播放当前结果", "重播结果", "再播一遍", "重复播放"];

export const legacyDefaultWakeWordPhrases = "你好工作台,AI Workbench,hey jarvis";

export function normalizeDirectoryPrefs(value) {
  const favorites = Array.isArray(value?.favorites) ? value.favorites.filter(Boolean) : [];
  const hidden = Array.isArray(value?.hidden) ? value.hidden.filter(Boolean) : [];
  return {
    favorites: [...new Set(favorites)],
    hidden: [...new Set(hidden)],
  };
}

export function loadDirectoryPrefs() {
  if (typeof window === "undefined" || !window.localStorage) return normalizeDirectoryPrefs();
  try {
    const raw = window.localStorage.getItem(directoryPrefsStorageKey);
    return normalizeDirectoryPrefs(raw ? JSON.parse(raw) : {});
  } catch {
    return normalizeDirectoryPrefs();
  }
}

export function saveDirectoryPrefs(prefs) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(directoryPrefsStorageKey, JSON.stringify(normalizeDirectoryPrefs(prefs)));
  } catch {
    // Local preference persistence is optional.
  }
}

export function isSensitiveDiagnosticKey(key) {
  return /password|token|secret|accesskey|api[-_]?key|authorization|credential|base64/i.test(String(key || ""));
}

export function isNoisyDiagnosticKey(key) {
  return /stdout|stderr|requestBody|body|messages|output|rawOutput|transcript/i.test(String(key || ""));
}

export function sanitizeDiagnosticValue(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 4) return "[depth-limit]";
  if (typeof value === "string") {
    if (value.length > 600) return `${value.slice(0, 600)}...[truncated:${value.length}]`;
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 80).map((item) => sanitizeDiagnosticValue(item, depth + 1));
  if (typeof value === "object") {
    return Object.entries(value).reduce((acc, [key, item]) => {
      if (isSensitiveDiagnosticKey(key)) {
        acc[key] = "[redacted]";
      } else if (isNoisyDiagnosticKey(key)) {
        const length = typeof item === "string" ? item.length : JSON.stringify(item ?? "").length;
        acc[key] = `[omitted:${length}]`;
      } else {
        acc[key] = sanitizeDiagnosticValue(item, depth + 1);
      }
      return acc;
    }, {});
  }
  return String(value);
}

export function loadBrowserDiagnosticLogs() {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(browserDiagnosticLogStorageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearBrowserDiagnosticLogs() {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(browserDiagnosticLogStorageKey);
  } catch {
    // Diagnostics are best-effort cache data.
  }
}

export function appendBrowserDiagnosticLog(payload = {}) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const entry = {
      ts: new Date().toISOString(),
      level: String(payload.level || "info"),
      event: String(payload.event || "app.event"),
      fields: sanitizeDiagnosticValue(payload.fields || {}),
    };
    const next = [...loadBrowserDiagnosticLogs(), entry].slice(-500);
    window.localStorage.setItem(browserDiagnosticLogStorageKey, JSON.stringify(next));
  } catch {
    // Diagnostics are best-effort and must never break the app.
  }
}

function diagnosticErrorText(error) {
  return String(error?.message || error || "未知错误");
}

export async function appLog(level, event, fields = {}) {
  try {
    await SSHWorkbench.appendLog({
      level,
      event,
      fields: sanitizeDiagnosticValue(fields),
    });
  } catch (error) {
    const method = level === "error" ? "error" : level === "warn" ? "warn" : "info";
    console[method]?.(`[aiwb:${event}]`, sanitizeDiagnosticValue(fields), diagnosticErrorText(error));
  }
}

export function workspaceStoreHasServers(value) {
  return Boolean([2, 3, workspaceStoreVersion].includes(Number(value?.version)) && Array.isArray(value.servers));
}

export function saveWorkspaceMirror(profile) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(workspaceMirrorStorageKey, JSON.stringify(profile || {}));
    window.localStorage.removeItem(legacyWorkspaceMirrorStorageKey);
  } catch (error) {
    void appLog("warn", "workspace.mirror.save.failed", { error: diagnosticErrorText(error) });
  }
}

export function loadWorkspaceMirror() {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw =
      window.localStorage.getItem(workspaceMirrorStorageKey) ||
      window.localStorage.getItem(legacyWorkspaceMirrorStorageKey);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!workspaceStoreHasServers(parsed)) return null;
    if (Number(parsed.version) === workspaceStoreVersion) return parsed;

    const normalized = normalizeWorkspaceStore(parsed);
    const migrated = serializeWorkspaceStore(normalized.servers, normalized.activeServerId);
    saveWorkspaceMirror(migrated);
    return migrated;
  } catch (error) {
    void appLog("warn", "workspace.mirror.load.failed", { error: diagnosticErrorText(error) });
    return null;
  }
}

export function workspaceDiagnosticSummary(servers = [], activeServerId = "") {
  return {
    activeServerId,
    serverCount: Array.isArray(servers) ? servers.length : 0,
    servers: (Array.isArray(servers) ? servers : []).map((server, index) => {
      const profile = normalizeProfile(server?.profile || {});
      return {
        id: server.id,
        index: index + 1,
        name: serverSessionName(server, index),
        active: server.id === activeServerId,
        agentId: profile.agentId,
        platform: normalizeServerPlatform(profile.platform),
        host: profile.host,
        port: profile.port,
        username: profile.username,
        workdir: profile.workdir,
        hasPassword: Boolean(profile.password),
        passwordLength: String(profile.password || "").length,
        connectionStatus: server?.connection?.state || "unknown",
        taskState:
          taskStateForMessage(
            [...(Array.isArray(server?.messages) ? server.messages : [])]
              .reverse()
              .find((message) => message?.role === "assistant"),
          ) || "idle",
        messageCount: Array.isArray(server?.messages) ? server.messages.length : 0,
        hasUnreadResult: Boolean(server?.unreadResult),
      };
    }),
  };
}

export function commandDiagnosticPayload(profile, commandPayload, maxResponseSize, commandTimeoutSeconds) {
  const current = normalizeProfile(profile || {});
  return {
    host: current.host,
    port: current.port,
    username: current.username,
    platform: normalizeServerPlatform(current.platform),
    agentId: current.agentId,
    workdir: current.workdir,
    hasPassword: Boolean(current.password),
    passwordLength: String(current.password || "").length,
    commandKind: commandPayload?.uploadScript ? "uploaded-powershell" : commandPayload?.stdin ? "stdin" : "exec",
    commandLength: String(commandPayload?.command || "").length,
    stdinLength: String(commandPayload?.stdin || "").length,
    commandTimeoutSeconds,
    maxResponseSize,
  };
}

export function directoryPrefKey(agentId, path) {
  return `${agentId || "codex"}:${String(path || "").trim()}`;
}

export function manualWorkdirScope(profile) {
  const normalized = normalizeProfile(profile || {});
  return [
    normalizeServerPlatform(normalized.platform),
    String(normalized.host || "").trim(),
    String(normalized.port || "").trim(),
    String(normalized.username || "").trim(),
  ].join("|");
}

export function normalizeManualWorkdirHistory(value) {
  const entries = Array.isArray(value?.entries) ? value.entries : Array.isArray(value) ? value : [];
  const seen = new Set();
  const normalized = [];
  entries
    .map((item) => ({
      scope: String(item?.scope || "").trim(),
      agentId: item?.agentId === "claude" ? "claude" : "codex",
      path: String(item?.path || "").trim(),
      updatedAt: Number(item?.updatedAt || 0),
    }))
    .filter((item) => item.scope && item.path)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .forEach((item) => {
      const key = `${item.scope}:${item.agentId}:${item.path}`;
      if (seen.has(key)) return;
      seen.add(key);
      normalized.push(item);
    });
  return { entries: normalized.slice(0, 160) };
}

export function loadManualWorkdirHistory() {
  if (typeof window === "undefined" || !window.localStorage) return normalizeManualWorkdirHistory();
  try {
    const raw = window.localStorage.getItem(manualWorkdirHistoryStorageKey);
    return normalizeManualWorkdirHistory(raw ? JSON.parse(raw) : {});
  } catch {
    return normalizeManualWorkdirHistory();
  }
}

export function saveManualWorkdirHistory(history) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(manualWorkdirHistoryStorageKey, JSON.stringify(normalizeManualWorkdirHistory(history)));
  } catch {
    // Local history is a convenience only.
  }
}

export function recentManualWorkdirs(scope, agentId) {
  const normalizedAgent = agentId === "claude" ? "claude" : "codex";
  return loadManualWorkdirHistory().entries.filter(
    (item) => item.scope === scope && item.agentId === normalizedAgent,
  );
}

export function rememberManualWorkdir(scope, agentId, path) {
  const cleanPath = String(path || "").trim();
  if (!scope || !cleanPath) return;
  const normalizedAgent = agentId === "claude" ? "claude" : "codex";
  const history = loadManualWorkdirHistory();
  saveManualWorkdirHistory({
    entries: [
      {
        scope,
        agentId: normalizedAgent,
        path: cleanPath,
        updatedAt: Date.now(),
      },
      ...history.entries,
    ],
  });
}

export function toggleListValue(list, value) {
  const next = new Set(Array.isArray(list) ? list : []);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return [...next];
}

export function trimVisibleText(text) {
  return String(text || "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function compactInlineText(value, maxLength = 34) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function assetPath(path) {
  return `${assetBase}${path.replace(/^\/+/, "")}`;
}

export function isEventLike(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      (typeof value.preventDefault === "function" ||
        typeof value.stopPropagation === "function" ||
        Object.prototype.hasOwnProperty.call(value, "nativeEvent") ||
      Object.prototype.hasOwnProperty.call(value, "currentTarget")),
  );
}

export function messageDisplayText(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(messageDisplayText).filter(Boolean).join("\n");
  if (typeof value === "object") {
    for (const key of ["text", "output", "body", "content", "message", "reply", "title"]) {
      if (value[key] !== undefined) {
        const text = messageDisplayText(value[key]);
        if (text) return text;
      }
    }
  }
  return "";
}

export function taskTextFromValue(value, fallback = "") {
  if (value === undefined || value === null || isEventLike(value)) return String(fallback || "").trim();
  if (typeof value === "string") {
    const text = value.trim();
    return text === "[object Object]" ? String(fallback || "").trim() : text;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (Array.isArray(value)) return value.map((item) => taskTextFromValue(item)).filter(Boolean).join("\n").trim();
  if (typeof value === "object") {
    for (const key of ["text", "transcript", "task", "body", "content", "message", "reply"]) {
      if (value[key] !== undefined) {
        const text = taskTextFromValue(value[key], fallback);
        if (text) return text;
      }
    }
    const display = messageDisplayText(value).trim();
    return display && display !== "[object Object]" ? display : String(fallback || "").trim();
  }
  return String(value || fallback || "").trim();
}

export function formatAgentPrompt(prompt) {
  const userTask = JSON.stringify(taskTextFromValue(prompt));
  return [
    `请完成这个用户任务。用户任务是一个 JSON 字符串，请先解析它再执行：${userTask}。`,
    "执行方式必须是同步最终交付：如果你启动了测试、构建、部署、脚本、监控、子任务或任何后台命令，必须等它们全部结束并确认结果后，才能给最终答案。",
    "不要先给阶段性结论再继续等待其它任务；如果还在等待，就继续等待，不要输出最终答案标记。",
    "禁止把“等待通知后继续”“I'll wait for the notification before continuing”“等测试完成后再继续”等等待话术作为最终答案；这类回答不是完成。",
    "如果外部系统不会主动把结果返回到当前进程，请主动轮询或检查状态，直到得到成功、失败或明确阻塞原因。",
    "最终答案必须明确说明：实际完成了什么、修改了哪些文件、做了什么验证、验证是否通过；如果无法完成，必须给出明确阻塞原因和当前已完成部分。",
    `输出要求：只输出最终给用户看的答案，不要复述本段规则，不要输出过程、菜单、命令行日志或工具调用记录；最终答案必须放在 ${finalAnswerStart} 和 ${finalAnswerEnd} 之间。`,
  ].join("");
}

export let messageCounter = 0;

export function createMessage(partial) {
  messageCounter += 1;
  const now = Date.now();
  return normalizeMessageLifecycle({
    id: `msg-${now}-${messageCounter}`,
    taskState: partial?.role === "assistant" ? taskStateSucceeded : undefined,
    output: "",
    createdAt: new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    createdAtMs: now,
    ...partial,
  }, now);
}

export const maxPersistedMessagesPerServer = 120;

export const maxPersistedTextLength = 60_000;

export function clipPersistedText(value, limit = maxPersistedTextLength) {
  const text = String(value ?? "");
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n\n[内容较长，已在本地历史中截断]`;
}

export function normalizePersistedMessage(message) {
  const source = message && typeof message === "object" ? message : { body: String(message ?? "") };
  const createdAtMs = messageChronologyTimestamp(source) || Date.now();
  const lifecycleSource = normalizeMessageLifecycle({ ...source, createdAtMs });
  const remoteTaskStatus = String(source.remoteTaskStatus || "").trim();
  const hasCompletedRemoteOutput =
    lifecycleSource.role === "assistant" &&
    lifecycleSource.backend === "agent" &&
    Boolean(String(lifecycleSource.output || "").trim()) &&
    !["error", "cancelled", "missing", "deferred-waiting-answer"].includes(remoteTaskStatus) &&
    !["failed", "cancelled"].includes(String(lifecycleSource.taskState || "").trim());
  const taskState = hasCompletedRemoteOutput ? "succeeded" : lifecycleSource.taskState;
  const active = lifecycleSource.role === "assistant" && taskStateIsActive(taskState);
  const startedAt =
    Number(lifecycleSource.startedAt || 0) ||
    (active ? createdAtMs : 0);
  const resumableRemoteTask =
    active &&
    lifecycleSource.backend === "agent" &&
    lifecycleSource.remoteTaskId;
  const completedAt =
    Number(source.completedAt || 0) ||
    (startedAt && taskStateIsTerminal(taskState) ? Date.now() : 0);
  const durationMs =
    Number(source.durationMs || 0) ||
    (startedAt && completedAt && taskStateIsTerminal(taskState) ? Math.max(0, completedAt - startedAt) : 0);
  const turnId = String(source.turnId || source.messagePairId || "").trim();
  const agentFailure =
    source.agentFailure && typeof source.agentFailure === "object"
      ? {
          ...source.agentFailure,
          detail: clipPersistedText(source.agentFailure.detail, 12_000),
        }
      : source.agentFailure;

  return normalizeMessageLifecycle({
    ...lifecycleSource,
    agentFailure,
    technicalDetail: clipPersistedText(source.technicalDetail, 12_000),
    executionSummary: clipPersistedText(source.executionSummary, 30_000),
    taskState,
    turnId: turnId || undefined,
    remoteTaskStatus: hasCompletedRemoteOutput ? "done" : source.remoteTaskStatus,
    resultMissing: hasCompletedRemoteOutput ? false : source.resultMissing,
    body:
      active
        ? clipPersistedText(
            resumableRemoteTask
              ? lifecycleSource.body || "正在重新同步远端任务状态。"
              : lifecycleSource.body || "上次任务在应用关闭前还没有完成。",
          )
        : clipPersistedText(lifecycleSource.body),
    output: clipPersistedText(lifecycleSource.output),
    liveOutput: clipPersistedText(lifecycleSource.liveOutput, 30_000),
    createdAt: source.createdAt || new Date(createdAtMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    createdAtMs,
    startedAt: startedAt || undefined,
    completedAt: completedAt || undefined,
    durationMs: durationMs || undefined,
  });
}

export function messagesForStorage(messages) {
  return (Array.isArray(messages) ? messages : [])
    .slice(-maxPersistedMessagesPerServer)
    .map(normalizePersistedMessage);
}

export function localMessageHistoryFromServers(servers = []) {
  return {
    version: localMessageHistoryVersion,
    updatedAt: Date.now(),
    servers: (Array.isArray(servers) ? servers : []).map((server) => ({
      id: server.id,
      messages: messagesForStorage(server.messages),
    })),
  };
}

function earliestPositiveNumber(left, right) {
  const values = [Number(left || 0), Number(right || 0)].filter(
    (value) => Number.isFinite(value) && value > 0,
  );
  return values.length ? Math.min(...values) : undefined;
}

export function mergePersistedMessageLists(currentMessages = [], incomingMessages = []) {
  const byId = new Map();
  for (const message of [...(Array.isArray(currentMessages) ? currentMessages : []), ...(Array.isArray(incomingMessages) ? incomingMessages : [])]) {
    const id = String(message?.id || "").trim();
    if (!id) continue;
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, message);
      continue;
    }

    if (message?.role === "assistant" && existing?.role === "assistant") {
      byId.set(id, mergeTaskMessages(existing, message));
      continue;
    }
    const preferred = String(message?.body || message?.output || "").trim() ? message : existing;
    const fallback = preferred === message ? existing : message;
    const terminal = taskStateIsTerminal(preferred?.taskState);
    byId.set(id, {
      ...fallback,
      ...preferred,
      body: terminal
        ? String(preferred?.body || "")
        : String(preferred?.body || "").trim()
          ? preferred.body
          : fallback.body || "",
      output: String(preferred?.output || "").trim() ? preferred.output : fallback.output || "",
      liveOutput: terminal
        ? ""
        : String(preferred?.liveOutput || "").trim()
          ? preferred.liveOutput
          : fallback.liveOutput || "",
      promptText: String(preferred?.promptText || "").trim() ? preferred.promptText : fallback.promptText || "",
      attachments:
        Array.isArray(preferred?.attachments) && preferred.attachments.length
          ? preferred.attachments
          : fallback.attachments,
      createdAtMs: earliestPositiveNumber(existing.createdAtMs, message.createdAtMs),
      startedAt: earliestPositiveNumber(existing.startedAt, message.startedAt),
    });
  }
  return sortConversationMessages([...byId.values()])
    .slice(-maxPersistedMessagesPerServer)
    .map(normalizePersistedMessage);
}

export function saveLocalMessageHistory(servers = []) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    // The controller has already paired and deduplicated the current state.
    // Re-merging the old cache here would bring stale assistant placeholders
    // back after every save and make one task look like several replies.
    const next = localMessageHistoryFromServers(servers);
    window.localStorage.setItem(localMessageHistoryStorageKey, JSON.stringify(next));
    window.localStorage.removeItem(legacyLocalMessageHistoryStorageKey);
  } catch {
    // Local chat history is a convenience cache. The encrypted profile save remains the primary store.
  }
}

export function loadLocalMessageHistory() {
  if (typeof window === "undefined" || !window.localStorage) return {};
  try {
    const currentRaw = window.localStorage.getItem(localMessageHistoryStorageKey);
    const legacyRaw = currentRaw ? "" : window.localStorage.getItem(legacyLocalMessageHistoryStorageKey);
    const raw = currentRaw || legacyRaw;
    const parsed = raw ? JSON.parse(raw) : null;
    if (
      !parsed ||
      ![1, localMessageHistoryVersion].includes(Number(parsed.version)) ||
      !Array.isArray(parsed.servers)
    ) {
      return {};
    }

    const history = parsed.servers.reduce((acc, item) => {
      if (!item?.id) return acc;
      acc[item.id] = messagesForStorage(item.messages);
      return acc;
    }, {});
    if (legacyRaw || Number(parsed.version) !== localMessageHistoryVersion) {
      const migrated = localMessageHistoryFromServers(
        parsed.servers.map((server) => ({
          ...server,
          messages: history[server.id] || [],
        })),
      );
      window.localStorage.setItem(localMessageHistoryStorageKey, JSON.stringify(migrated));
      window.localStorage.removeItem(legacyLocalMessageHistoryStorageKey);
    }
    return history;
  } catch {
    return {};
  }
}

export function mergeLocalMessageHistory(servers = []) {
  const history = loadLocalMessageHistory();
  if (!Object.keys(history).length) return servers;
  return servers.map((server) => {
    const localMessages = history[server.id] || [];
    const currentMessages = Array.isArray(server.messages) ? server.messages : [];
    if (!localMessages.length && !currentMessages.length) return server;
    return {
      ...server,
      messages: mergePersistedMessageLists(localMessages, currentMessages),
    };
  });
}

export function taskForStorage(task) {
  if (!task || typeof task !== "object") return {};
  const { state: _legacyState, ...metadata } = task;
  return metadata;
}

export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function normalizeProfile(profile) {
  const platform = normalizeServerPlatform(profile?.platform);
  const platformDefaults = serverPlatformDefaults[platform] || serverPlatformDefaults.linux;
  const normalizedAgentId = agents.some((agent) => agent.id === profile?.agentId) ? profile.agentId : defaultProfile.agentId;
  const defaultUseWorkbenchAgent = defaultProfile.useWorkbenchAgent;
  const normalized = {
    ...defaultProfile,
    ...platformDefaults,
    ...(profile ?? {}),
    platform,
    host: String(profile?.host || "").trim(),
    hostAlternates: normalizeHostAlternates(profile?.hostAlternates, profile?.host),
    wslDistro: String(profile?.wslDistro || "").trim(),
    gitRepoUrl: String(profile?.gitRepoUrl || "").trim(),
    gitTargetDir: String(profile?.gitTargetDir || "").trim(),
    gitBranch: String(profile?.gitBranch || "").trim(),
    port: Number(profile?.port ?? defaultProfile.port) || defaultProfile.port,
    mainAIEnabled: profile?.mainAIEnabled === undefined ? defaultProfile.mainAIEnabled : Boolean(profile.mainAIEnabled),
    mainAIModel: String(profile?.mainAIModel || defaultProfile.mainAIModel).trim() || defaultProfile.mainAIModel,
    openAIAPIKey: String(profile?.openAIAPIKey || ""),
    agentId: normalizedAgentId,
    aiModel: normalizeAgentModel(normalizedAgentId, profile?.aiModel),
    wakeWordPhrases:
      String(profile?.wakeWordPhrases || defaultProfile.wakeWordPhrases).trim() === legacyDefaultWakeWordPhrases
        ? defaultProfile.wakeWordPhrases
        : String(profile?.wakeWordPhrases || defaultProfile.wakeWordPhrases).trim(),
    taskWakePhrases: String(profile?.taskWakePhrases || ""),
    voiceInputEnabled:
      profile?.voiceInputEnabled === undefined ? defaultProfile.voiceInputEnabled : Boolean(profile.voiceInputEnabled),
    aliyunApiKey: String(profile?.aliyunApiKey || defaultProfile.aliyunApiKey || "").trim(),
    aliyunWorkspaceId: String(profile?.aliyunWorkspaceId || defaultProfile.aliyunWorkspaceId || "").trim(),
    ttsVoiceName: String(profile?.ttsVoiceName || defaultProfile.ttsVoiceName).trim() || defaultProfile.ttsVoiceName,
    ttsModel: String(profile?.ttsModel || defaultProfile.ttsModel).trim() || defaultProfile.ttsModel,
    playResultAudio:
      profile?.playResultAudio === undefined ? defaultProfile.playResultAudio : Boolean(profile.playResultAudio),
    resultAudioMode: normalizeResultAudioMode(profile?.resultAudioMode),
    taskPushNotificationsEnabled:
      profile?.taskPushNotificationsEnabled === undefined
        ? defaultProfile.taskPushNotificationsEnabled
        : Boolean(profile.taskPushNotificationsEnabled),
    useWorkbenchAgent:
      profile?.useWorkbenchAgent === undefined
        ? defaultUseWorkbenchAgent
        : Boolean(profile.useWorkbenchAgent),
    executionPermissionMode: normalizeExecutionPermissionMode(profile?.executionPermissionMode),
    appearanceMode: normalizeAppearanceMode(profile?.appearanceMode),
    messageFontFamily: normalizeMessageFontFamily(profile?.messageFontFamily),
    messageFontSize: normalizeMessageFontSize(profile?.messageFontSize),
    messageFontWeight: normalizeMessageFontWeight(profile?.messageFontWeight),
    messageLineHeight: normalizeMessageLineHeight(profile?.messageLineHeight),
    connectTimeoutSeconds: Math.min(
      60,
      Math.max(
        30,
        Number(profile?.connectTimeoutSeconds ?? defaultProfile.connectTimeoutSeconds) || defaultProfile.connectTimeoutSeconds,
      ),
    ),
  };

  if (platform === "linux" && normalized.claudeCommand === "/usr/local/bin/claude") {
    normalized.claudeCommand = "claude";
  }

  return normalized;
}

export function normalizeHostAlternates(value, primaryHost = "") {
  const primary = String(primaryHost || "").trim().toLocaleLowerCase();
  const candidates = Array.isArray(value) ? value : String(value || "").split(/[\n,，;；]/);
  const seen = new Set(primary ? [primary] : []);
  return candidates
    .map((item) => String(item || "").trim())
    .filter((item) => {
      const key = item.toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function profileHostCandidates(profile) {
  const normalized = normalizeProfile(profile || {});
  return [normalized.host, ...normalized.hostAlternates].filter(Boolean);
}

export function sameWorkdir(left, right, platform = "linux") {
  const normalize = (value) => {
    const text = String(value || "").trim().replace(/[\\/]+$/g, "");
    return platform === "windows" ? text.replace(/\//g, "\\").toLocaleLowerCase() : text;
  };
  return Boolean(normalize(left)) && normalize(left) === normalize(right);
}

export function isLegacyDefaultWorkdir(platform, workdir) {
  return sameWorkdir(workdir, legacyDefaultWorkdirs[normalizeServerPlatform(platform)], normalizeServerPlatform(platform));
}

export function stripLegacyDefaultWorkdirFromPlaceholder(server, index = 0) {
  const profile = server?.profile || {};
  const platform = normalizeServerPlatform(profile.platform);
  const name = String(server?.name || profile.name || "").trim();
  const looksLikePlaceholder =
    server?.id === "default-server" ||
    name === "默认服务器" ||
    /^服务器 \d+$/.test(name) ||
    (!name && index === 0);

  if (!looksLikePlaceholder || !isLegacyDefaultWorkdir(platform, profile.workdir)) return server;

  return {
    ...server,
    profile: {
      ...profile,
      workdir: "",
    },
  };
}

export function globalSettingsFromProfile(profile) {
  const normalized = normalizeProfile(profile || defaultProfile);
  return {
    mainAIEnabled: normalized.mainAIEnabled,
    mainAIModel: normalized.mainAIModel,
    openAIAPIKey: normalized.openAIAPIKey,
    voiceInputEnabled: normalized.voiceInputEnabled,
    wakeWordPhrases: normalized.wakeWordPhrases,
    aliyunApiKey: normalized.aliyunApiKey,
    aliyunWorkspaceId: normalized.aliyunWorkspaceId,
    ttsVoiceName: normalized.ttsVoiceName,
    ttsModel: normalized.ttsModel,
    playResultAudio: normalized.playResultAudio,
    resultAudioMode: normalized.resultAudioMode,
    taskPushNotificationsEnabled: normalized.taskPushNotificationsEnabled,
    executionPermissionMode: normalized.executionPermissionMode,
    appearanceMode: normalized.appearanceMode,
    messageFontFamily: normalized.messageFontFamily,
    messageFontSize: normalized.messageFontSize,
    messageFontWeight: normalized.messageFontWeight,
    messageLineHeight: normalized.messageLineHeight,
  };
}

export function applyGlobalSettings(profile, settings) {
  return normalizeProfile({
    ...profile,
    ...globalSettingsFromProfile(settings),
  });
}

export function wakePhrasesForProfile(profile) {
  const phrases = wakePhrasesFromText(profile?.wakeWordPhrases);
  return phrases.length ? phrases : defaultWakeWordPhrases;
}

export function wakePhrasesFromText(value) {
  const seen = new Set();
  return String(value || "")
    .split(/[,\n，、|；;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function serializeWakePhrases(phrases) {
  return phrases.map((phrase) => String(phrase || "").trim()).filter(Boolean).join("\n");
}

export function normalizeVoiceText(value) {
  return String(value || "")
    .toLocaleLowerCase()
    .replace(/[\s，。,.!?！？、；;：:「」"'“”‘’（）()【】[\]{}<>《》|/-]/g, "");
}

export function normalizeAppearanceMode(value) {
  return appearanceModeOptions.some((option) => option.id === value) ? value : defaultProfile.appearanceMode;
}

export function normalizeResultAudioMode(value) {
  return resultAudioModeOptions.some((option) => option.id === value) ? value : defaultProfile.resultAudioMode;
}

export function chineseNumber(value) {
  const numbers = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  return numbers[value - 1] || String(value);
}

export function readableVoiceNameCandidate(value) {
  const text = String(value || "")
    .replace(/[·•]/g, " ")
    .replace(/\b(Codex|Claude|CLI|AI|Workbench|server|服务器|会话|任务|项目|目录|工作区)\b/gi, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";

  const chineseTokens = text.match(/[\u4e00-\u9fa5]{2,5}/g) || [];
  const shortChinese = chineseTokens.find((token) => token.length >= 2 && token.length <= 5);
  if (shortChinese) return shortChinese;

  const words = text
    .split(/[^a-zA-Z0-9\u4e00-\u9fa5]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const compact = words.find((word) => {
    const normalized = normalizeVoiceText(word);
    return normalized.length >= 2 && normalized.length <= 5 && !/^\d+$/.test(normalized);
  });
  if (compact) return compact;

  return "";
}

export function automaticTaskWakePhrases(server, index = 0) {
  const profile = normalizeProfile(server?.profile);
  const sources = [
    String(profile.name || ""),
    serverDisplayName(server, index),
    serverSessionName(server, index),
    workdirDisplayName(profile.workdir),
  ];
  const candidates = sources
    .map(readableVoiceNameCandidate)
    .filter((phrase) => normalizeVoiceText(phrase).length >= 2 && normalizeVoiceText(phrase).length <= 5);

  return candidates;
}

export function taskWakePhrasesForServer(server, index = 0) {
  const profile = normalizeProfile(server?.profile);
  const configured = wakePhrasesFromText(profile.taskWakePhrases);
  const fallback = [
    ...automaticTaskWakePhrases(server, index),
    `第${chineseNumber(index + 1)}个`,
    `第${index + 1}个`,
  ];

  const seen = new Set();
  return [...configured, ...fallback]
    .map((phrase) => String(phrase || "").trim())
    .filter(Boolean)
    .filter((phrase) => {
      const key = normalizeVoiceText(phrase);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function playbackPhrasesForServer(index = 0) {
  const number = index + 1;
  const chinese = chineseNumber(number);
  return [
    `播放任务${number}`,
    `播放任务${chinese}`,
    `播放第${number}个`,
    `播放第${chinese}个`,
    `重播任务${number}`,
    `重播任务${chinese}`,
  ];
}

export function wakeContextForServers(servers = [], activeServerId = "", activeProfile = defaultProfile) {
  const globalPhrases = wakePhrasesForProfile(activeProfile);
  const entries = servers.flatMap((server, index) =>
    taskWakePhrasesForServer(server, index).map((phrase) => ({
      phrase,
      serverId: server.id,
      index,
    })),
  );
  const playbackEntries = servers.flatMap((server, index) =>
    playbackPhrasesForServer(index).map((phrase) => ({
      phrase,
      serverId: server.id,
      index,
    })),
  );
  const phrases = [
    ...globalPhrases,
    ...currentResultPlaybackPhrases,
    ...entries.map((entry) => entry.phrase),
    ...playbackEntries.map((entry) => entry.phrase),
  ];
  return { globalPhrases, entries, playbackEntries, currentResultPlaybackPhrases, phrases };
}

export function speechInterruptContextForServers(servers = [], activeServerId = "", activeProfile = defaultProfile) {
  const wakeContext = wakeContextForServers(servers, activeServerId, activeProfile);
  const seen = new Set();
  const phrases = [
    ...speechInterruptPhrases,
    ...wakeContext.currentResultPlaybackPhrases,
    ...wakeContext.playbackEntries.map((entry) => entry.phrase),
    ...wakeContext.entries.map((entry) => entry.phrase),
    ...wakeContext.globalPhrases,
  ]
    .map((phrase) => String(phrase || "").trim())
    .filter(Boolean)
    .filter((phrase) => {
      const key = normalizeVoiceText(phrase);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return {
    ...wakeContext,
    phrases,
    interruptPhrases: speechInterruptPhrases,
  };
}

export function isSpeechStopPhrase(phrase) {
  const normalized = normalizeVoiceText(phrase);
  return speechInterruptPhrases.some((item) => normalizeVoiceText(item) === normalized);
}

export function isGlobalWakePhrase(phrase, context) {
  const normalized = normalizeVoiceText(phrase);
  return (context?.globalPhrases || []).some((item) => normalizeVoiceText(item) === normalized);
}

export function taskWakeMatchFromPhrase(phrase, context) {
  const normalized = normalizeVoiceText(phrase);
  if (!normalized) return null;
  return context.entries.find((entry) => normalizeVoiceText(entry.phrase) === normalized) || null;
}

export function playbackCommandMatchFromPhrase(phrase, context) {
  const normalized = normalizeVoiceText(phrase);
  if (!normalized) return null;
  return context.playbackEntries.find((entry) => normalizeVoiceText(entry.phrase) === normalized) || null;
}

export function taskWakeMatchFromText(text, servers = []) {
  const normalized = normalizeVoiceText(text);
  if (!normalized) return null;

  const commands = ["切换到", "切到", "打开", "进入", "换到", "转到"];
  const candidates = [normalized];
  commands.forEach((command) => {
    const key = normalizeVoiceText(command);
    if (normalized.startsWith(key)) candidates.push(normalized.slice(key.length));
  });

  for (const candidate of candidates) {
    const cleaned = candidate.replace(/(任务|会话|项目|目录|工作区)$/g, "");
    for (let index = 0; index < servers.length; index += 1) {
      const server = servers[index];
      const matched = taskWakePhrasesForServer(server, index).some((phrase) => normalizeVoiceText(phrase) === cleaned);
      if (matched) return { serverId: server.id, index, phrase: cleaned };
    }
  }

  return null;
}

export function serverTaskRunning(server) {
  return Boolean(lastActiveTaskMessage(server?.messages || []));
}

export function createServerId() {
  return `server-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function initialConnectionForProfile(profile) {
  const normalized = normalizeProfile(profile || {});
  const mode = normalized.useWorkbenchAgent === true || isWindowsProfile(normalized) ? "agent" : "ssh";
  return profileReady(normalized)
    ? { state: "idle", label: "未连接", detail: `${normalized.username}@${normalized.host}`, mode }
    : { state: "idle", label: "未连接", detail: profileIssue(normalized), mode };
}

export function dormantConnectionForProfile(profile, previous = {}, label = "未连接") {
  const normalized = normalizeProfile(profile);
  return {
    ...initialConnectionForProfile(normalized),
    mode: previous?.mode || previous?.transport || previous?.backend || "",
    state: "idle",
    label,
    detail: String(normalized.workdir || `${normalized.username}@${normalized.host}`),
  };
}

export function connectionForAppLaunch(server) {
  const profile = normalizeProfile(server?.profile);
  if (!profileReady(profile)) return initialConnectionForProfile(profile);
  return initialConnectionForProfile(profile);
}

export function readyConnectionForSession(profile, previous = {}) {
  const normalized = normalizeProfile(profile);
  const previousMode = previous?.mode || previous?.transport || previous?.backend || "";
  return {
    ...initialConnectionForProfile(normalized),
    mode: normalized.useWorkbenchAgent === true || isWindowsProfile(normalized) ? "agent" : previousMode,
    state: "idle",
    label: "未连接",
    detail: String(normalized.workdir || "").trim() ? workdirDisplayName(normalized.workdir) : `${normalized.username}@${normalized.host}`,
  };
}

export function connectionIsLive(connection) {
  return connection?.state === "connected";
}

export function connectionStatusPresentation(connection) {
  const state = String(connection?.state || "idle").trim().toLowerCase();
  if (state === "connected") return { label: "已连接", tone: "connected" };
  if (state === "testing") {
    const label = String(connection?.label || "").trim();
    return { label: label === "连接断开" ? "连接断开" : "连接中", tone: "testing" };
  }
  if (state === "error") return { label: "连接异常", tone: "error" };
  return { label: "未连接", tone: "idle" };
}

export function serverDisplayName(server, index = 0) {
  const profile = server?.profile || {};
  return (
    String(server?.name || profile.name || "").trim() ||
    (index === 0 ? "默认服务器" : `服务器 ${index + 1}`)
  );
}

export function serverSessionName(server, index = 0) {
  const profile = server?.profile || {};
  const explicit = String(server?.name || profile.name || "").trim();
  if (explicit && explicit !== "默认服务器" && !/^服务器 \d+$/.test(explicit)) return explicit;
  const workdirName = String(profile.workdir || "").trim() ? workdirDisplayName(profile.workdir) : "";
  return workdirName || explicit || (index === 0 ? "默认服务器" : `服务器 ${index + 1}`);
}

export function createServerSession(partial = {}, index = 0) {
  const profile = normalizeProfile(partial.profile || partial);
  const conversationId = String(partial.conversationId || partial.sessionId || "").trim() || createConversationId(profile.workdir || profile.name);
  const server = {
    id: partial.id || createServerId(),
    conversationId,
    name: String(partial.name || profile.name || "").trim(),
    profile,
    connection: partial.connection || initialConnectionForProfile(profile),
    diagnostics: partial.diagnostics || {},
    discovery: partial.discovery || null,
    rawOutput: partial.rawOutput || "原始输出会在测试连接或发送任务后显示。",
    messages: messagesForStorage(partial.messages),
    task: taskForStorage(partial.task),
    unreadResult: partial.unreadResult || null,
    shared: partial.shared || null,
    agentHistoryCursor: String(partial.agentHistoryCursor || "").trim(),
    agentHistoryHasMore: partial.agentHistoryHasMore !== false,
  };
  return {
    ...server,
    name: server.name || serverDisplayName(server, index),
  };
}

export function normalizeWorkspaceStore(value) {
  if (workspaceStoreHasServers(value)) {
    const servers = value.servers.map((server, index) => {
      const normalized = createServerSession(
        stripLegacyDefaultWorkdirFromPlaceholder(
          {
            ...server,
            messages: messagesForStorage(server?.messages),
            task: taskForStorage(server?.task),
          },
          index,
        ),
        index,
      );
      return {
        ...normalized,
        connection: connectionForAppLaunch(normalized),
      };
    });
    const onlyEmptyPlaceholder =
      servers.length === 1 &&
      (servers[0]?.id === "default-server" || serverDisplayName(servers[0], 0) === "默认服务器") &&
      !String(servers[0]?.profile?.host || "").trim();
    if (onlyEmptyPlaceholder) return { activeServerId: "", servers: [] };
    const activeServerId = servers.some((server) => server.id === value.activeServerId)
      ? value.activeServerId
      : servers[0]?.id || "";
    return { activeServerId, servers };
  }

  if (!value || !Object.keys(value).length) {
    return { activeServerId: "", servers: [] };
  }

  const migrated = createServerSession({
    id: "default-server",
    name: "默认服务器",
    profile:
      value && Object.keys(value).length
        ? stripLegacyDefaultWorkdirFromPlaceholder({ id: "default-server", name: "默认服务器", profile: value }, 0).profile
        : defaultProfile,
  });
  if (!String(migrated.profile?.host || "").trim()) {
    return { activeServerId: "", servers: [] };
  }
  return { activeServerId: migrated.id, servers: [migrated] };
}

export function serializeWorkspaceStore(servers, activeServerId) {
  return {
    version: workspaceStoreVersion,
    activeServerId,
    servers: servers.map((server, index) => ({
      id: server.id,
      conversationId: server.conversationId || createConversationId(server.profile?.workdir || server.name),
      name: serverDisplayName(server, index),
      profile: {
        ...server.profile,
        name: serverDisplayName(server, index),
      },
      diagnostics: server.diagnostics || {},
      rawOutput: clipPersistedText(server.rawOutput),
      messages: messagesForStorage(server.messages),
      task: taskForStorage(server.task),
      unreadResult: server.unreadResult || null,
      shared: server.shared || null,
      agentHistoryCursor: String(server.agentHistoryCursor || "").trim(),
      agentHistoryHasMore: server.agentHistoryHasMore !== false,
    })),
  };
}

export function serializeWorkspaceMigrationStore(servers, activeServerId) {
  return {
    version: workspaceStoreVersion,
    activeServerId,
    servers: (Array.isArray(servers) ? servers : []).map((server, index) => {
      const profile = normalizeProfile(server.profile);
      const displayName = serverDisplayName(server, index);
      return {
        id: server.id,
        sessionId: server.id,
        conversationId: server.conversationId || createConversationId(profile.workdir || displayName),
        name: displayName,
        profile: {
          ...profile,
          name: displayName,
        },
        agentSessionName: sessionName(profile, profile.agentId),
        diagnostics: server.diagnostics || {},
        rawOutput: "",
        messages: [],
        task: {},
        unreadResult: null,
        shared: server.shared || null,
      };
    }),
  };
}

export function buildWorkspaceMigrationPayload(servers, activeServerId) {
  const workspace = serializeWorkspaceMigrationStore(servers, activeServerId);
  return {
    kind: migrationFileKind,
    version: migrationFileVersion,
    app: "AI Workbench",
    exportedAt: new Date().toISOString(),
    includesSecrets: true,
    includesChatHistory: false,
    note: "This file contains server passwords/API keys and should be kept private.",
    workspace,
    directoryPrefs: normalizeDirectoryPrefs(loadDirectoryPrefs()),
    manualWorkdirHistory: normalizeManualWorkdirHistory(loadManualWorkdirHistory()),
  };
}

export function parseWorkspaceMigrationText(text) {
  const parsed = JSON.parse(String(text || ""));
  const workspace =
    parsed?.kind === migrationFileKind
      ? parsed.workspace
      : parsed?.workspace && parsed.workspace.version
        ? parsed.workspace
        : parsed;
  const store = normalizeWorkspaceStore(workspace);
  if (!Array.isArray(store.servers) || !store.servers.length) {
    throw new Error("配置文件里没有可导入的会话。");
  }
  return {
    source: parsed,
    store,
    directoryPrefs: parsed?.directoryPrefs ? normalizeDirectoryPrefs(parsed.directoryPrefs) : null,
    manualWorkdirHistory: parsed?.manualWorkdirHistory ? normalizeManualWorkdirHistory(parsed.manualWorkdirHistory) : null,
  };
}

export function mergeDirectoryPrefs(left, right) {
  return normalizeDirectoryPrefs({
    favorites: [...(left?.favorites || []), ...(right?.favorites || [])],
    hidden: [...(left?.hidden || []), ...(right?.hidden || [])],
  });
}

export function mergeManualWorkdirHistory(left, right) {
  return normalizeManualWorkdirHistory({
    entries: [...(right?.entries || []), ...(left?.entries || [])],
  });
}

export function mergeImportedServers(currentServers, importedServers) {
  const current = Array.isArray(currentServers) ? currentServers : [];
  const incoming = Array.isArray(importedServers) ? importedServers : [];
  const incomingIds = new Set(incoming.map((server) => server.id).filter(Boolean));
  const currentById = new Map(current.map((server) => [server.id, server]));
  const currentIsOnlyPlaceholder =
    current.length === 1 &&
    (current[0]?.id === "default-server" || serverDisplayName(current[0], 0) === "默认服务器") &&
    !String(current[0]?.profile?.host || "").trim();

  const kept = currentIsOnlyPlaceholder ? [] : current.filter((server) => !incomingIds.has(server.id));
  const mergedIncoming = incoming.map((server, index) => {
    const existing = currentById.get(server.id);
    return createServerSession(
      {
        ...server,
        id: server.id || createServerId(),
        messages: existing?.messages || [],
        rawOutput: existing?.rawOutput || server.rawOutput,
        task: {},
        unreadResult: existing?.unreadResult || null,
      },
      kept.length + index,
    );
  });

  return [...kept, ...mergedIncoming];
}

export function normalizeCloudSyncEndpoint(value) {
  const text = String(value || cloudSyncDefaultEndpoint).trim() || cloudSyncDefaultEndpoint;
  return text.replace(/\/+$/g, "");
}

export function normalizeCloudSyncAccount(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .trim()
    .toLowerCase();
}

export function validateCloudSyncCredentials({ account, password } = {}) {
  const cleanAccount = normalizeCloudSyncAccount(account);
  const cleanPassword = String(password || "");
  if (!cleanAccount) {
    return {
      ok: false,
      field: "account",
      message: "请填写同步账号。",
      account: cleanAccount,
    };
  }
  if (!cloudSyncAccountPattern.test(cleanAccount)) {
    return {
      ok: false,
      field: "account",
      message: "同步账号只能包含字母、数字、点、下划线、@、+ 和 -，长度 2-96。",
      account: cleanAccount,
    };
  }
  if (!cleanPassword) {
    return { ok: false, field: "password", message: "请填写同步密码。", account: cleanAccount };
  }
  return { ok: true, account: cleanAccount, password: cleanPassword };
}

export function normalizeCloudSyncSettings(value = {}) {
  return {
    endpoint: normalizeCloudSyncEndpoint(value.endpoint),
    account: normalizeCloudSyncAccount(value.account),
    lastSyncedAt: String(value.lastSyncedAt || "").trim(),
  };
}

export function loadCloudSyncSettings() {
  if (typeof window === "undefined" || !window.localStorage) return normalizeCloudSyncSettings();
  try {
    const raw = window.localStorage.getItem(cloudSyncSettingsStorageKey);
    return normalizeCloudSyncSettings(raw ? JSON.parse(raw) : {});
  } catch {
    return normalizeCloudSyncSettings();
  }
}

export function saveCloudSyncSettings(settings = {}) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(cloudSyncSettingsStorageKey, JSON.stringify(normalizeCloudSyncSettings(settings)));
  } catch {
    // Cloud sync settings are convenience state only.
  }
}

function normalizeCloudSyncAgentId(value) {
  return value === "claude" ? "claude" : "codex";
}

function normalizeCloudSyncSessionIdentity(identity = {}, profile = {}) {
  const profileValue = profile && typeof profile === "object" ? profile : {};
  const profileField = (key) => String(profileValue?.[key] ?? "").trim();
  const normalized = normalizeProfile(profile || {});
  const profilePlatform = profileField("platform") ? normalizeServerPlatform(profileValue.platform) : "";
  const platform = profilePlatform || normalizeServerPlatform(identity.platform);
  const rawWorkdir = profileField("workdir") || String(identity.workdir || normalized.workdir || "").trim();
  const workdir = rawWorkdir.replace(/[\\/]+$/g, "");
  const profileAgentId = agents.some((agent) => agent.id === profileValue?.agentId) ? profileValue.agentId : "";
  return {
    host: (profileField("host") || String(identity.host || normalized.host || "").trim()).toLocaleLowerCase(),
    username: profileField("username") || String(identity.username || normalized.username || "").trim(),
    workdir: platform === "windows" ? workdir.replace(/\//g, "\\").toLocaleLowerCase() : workdir,
    agentId: normalizeCloudSyncAgentId(profileAgentId || identity.agentId || normalized.agentId),
  };
}

export function cloudSyncSessionIdentityFromProfile(profile) {
  const normalized = normalizeProfile(profile || {});
  return normalizeCloudSyncSessionIdentity({}, normalized);
}

export function cloudSyncSessionKeyFromIdentity(identity = {}) {
  const normalized = normalizeCloudSyncSessionIdentity(identity);
  if (!normalized.host || !normalized.username || !normalized.workdir || !normalized.agentId) return "";
  return [normalized.host, normalized.username, normalized.workdir, normalized.agentId].join("|");
}

export function cloudSyncSessionKeyForProfile(profile) {
  return cloudSyncSessionKeyFromIdentity(cloudSyncSessionIdentityFromProfile(profile));
}

export function cloudSyncSessionKeyForServer(server) {
  const profileKey = cloudSyncSessionKeyForProfile(server?.profile || {});
  if (profileKey) return profileKey;
  const identityKey = cloudSyncSessionKeyFromIdentity(server?.syncIdentity || {});
  if (identityKey) return identityKey;
  return String(server?.syncKey || server?.cloudSyncKey || "").trim();
}

export function sessionShareFromServer(server) {
  const profile = normalizeProfile(server?.profile || {});
  const conversationId = String(server?.conversationId || "").trim() || createConversationId(profile.workdir || profile.name);
  const syncKey = [
    cloudSyncSessionKeyForProfile(profile),
    conversationId,
  ]
    .filter(Boolean)
    .join("|");
  return {
    conversationId,
    name: serverDisplayName(server, 0),
    syncKey,
    profile: {
      ...profile,
      // SSH credentials are intentionally included in an explicit session share.
      // API keys remain excluded because they are not needed to connect to the host.
      password: String(profile.password || ""),
      openAIAPIKey: "",
      aliyunApiKey: "",
      aliyunWorkspaceId: "",
    },
  };
}

export function sharedSessionKey(session = {}) {
  const computedKey = [
    cloudSyncSessionKeyForProfile(session.profile || {}),
    String(session.conversationId || session.sessionId || "").trim(),
  ]
    .filter(Boolean)
    .join("|");
  return computedKey || String(session.syncKey || "").trim();
}

export function mergeCloudSharedSessions(currentServers, records = []) {
  const current = Array.isArray(currentServers) ? currentServers : [];
  const currentIsOnlyPlaceholder =
    current.length === 1 &&
    (current[0]?.id === "default-server" || serverDisplayName(current[0], 0) === "默认服务器") &&
    !String(current[0]?.profile?.host || "").trim();
  const kept = currentIsOnlyPlaceholder ? [] : current;
  const existingKeys = new Set(
    kept
      .map((server) => sharedSessionKey({
        ...server,
        profile: server?.profile,
      }))
      .filter(Boolean),
  );
  const addedServers = [];
  const skippedShares = [];

  (Array.isArray(records) ? records : []).forEach((record) => {
    const session = record?.session && typeof record.session === "object" ? record.session : record;
    const profile = normalizeProfile({
      ...(session?.profile || {}),
      openAIAPIKey: "",
      aliyunApiKey: "",
      aliyunWorkspaceId: "",
    });
    const normalizedSession = {
      ...session,
      conversationId: String(session?.conversationId || session?.sessionId || "").trim(),
      name: String(session?.name || "共享会话").trim() || "共享会话",
      profile,
    };
    const key = sharedSessionKey(normalizedSession);
    if (!key || !normalizedSession.conversationId || existingKeys.has(key)) {
      skippedShares.push(record);
      return;
    }
    existingKeys.add(key);
    addedServers.push(
      createServerSession(
        {
          id: createServerId(),
          conversationId: normalizedSession.conversationId,
          name: normalizedSession.name,
          profile,
          connection: initialConnectionForProfile(profile),
          diagnostics: {},
          discovery: null,
          rawOutput: profile.password
            ? "这是共享会话，SSH 登录信息已同步，可以直接连接。"
            : "这是共享会话。首次连接前，请在会话设置中填写 SSH 密码。",
          messages: [],
          task: {},
          shared: {
            shareId: String(record?.id || "").trim(),
            ownerAccount: String(record?.ownerAccount || "").trim(),
            permission: String(record?.permission || "use").trim() || "use",
            sharedAt: String(record?.createdAt || "").trim(),
          },
        },
        kept.length + addedServers.length,
      ),
    );
  });

  return {
    servers: [...kept, ...addedServers],
    addedServers,
    skippedShares,
  };
}

export function buildCloudSyncPlainPayload(servers, activeServerId) {
  const workspace = serializeWorkspaceMigrationStore(servers, activeServerId);
  const cloudServers = workspace.servers
    .map((server) => {
      const syncIdentity = cloudSyncSessionIdentityFromProfile(server.profile);
      const syncKey = cloudSyncSessionKeyFromIdentity(syncIdentity);
      if (!syncKey) return null;
      return {
        ...server,
        syncKey,
        syncIdentity,
        messages: [],
        rawOutput: "",
        task: {},
        unreadResult: null,
      };
    })
    .filter(Boolean);

  return {
    kind: cloudSyncPayloadKind,
    version: cloudSyncPayloadVersion,
    app: "AI Workbench",
    exportedAt: new Date().toISOString(),
    includesSecrets: true,
    includesChatHistory: false,
    uniqueBy: ["host", "username", "workdir", "agentId"],
    workspace: {
      ...workspace,
      servers: cloudServers,
      activeServerId: cloudServers.some((server) => server.id === workspace.activeServerId)
        ? workspace.activeServerId
        : cloudServers[0]?.id || "",
    },
    directoryPrefs: normalizeDirectoryPrefs(loadDirectoryPrefs()),
    manualWorkdirHistory: normalizeManualWorkdirHistory(loadManualWorkdirHistory()),
  };
}

export function normalizeCloudSyncPlainPayload(value = {}) {
  const payload =
    value?.kind === migrationFileKind
      ? {
          ...value,
          kind: cloudSyncPayloadKind,
          version: cloudSyncPayloadVersion,
        }
      : value;
  const workspace = normalizeWorkspaceStore(payload?.workspace || { version: workspaceStoreVersion, servers: [] });
  const servers = (workspace.servers || [])
    .map((server) => {
      const profile = normalizeProfile(server?.profile || {});
      const syncIdentity = normalizeCloudSyncSessionIdentity(server?.syncIdentity || {}, profile);
      const syncKey = cloudSyncSessionKeyFromIdentity(syncIdentity);
      if (!syncKey) return null;
      return {
        ...server,
        profile,
        syncKey,
        syncIdentity,
        messages: [],
        rawOutput: "",
        task: {},
        unreadResult: null,
      };
    })
    .filter(Boolean);
  return {
    kind: cloudSyncPayloadKind,
    version: cloudSyncPayloadVersion,
    app: payload?.app || "AI Workbench",
    exportedAt: String(payload?.exportedAt || "").trim() || new Date().toISOString(),
    includesSecrets: true,
    includesChatHistory: false,
    uniqueBy: ["host", "username", "workdir", "agentId"],
    workspace: {
      version: workspaceStoreVersion,
      activeServerId: servers.some((server) => server.id === workspace.activeServerId)
        ? workspace.activeServerId
        : servers[0]?.id || "",
      servers,
    },
    directoryPrefs: payload?.directoryPrefs ? normalizeDirectoryPrefs(payload.directoryPrefs) : normalizeDirectoryPrefs(),
    manualWorkdirHistory: payload?.manualWorkdirHistory
      ? normalizeManualWorkdirHistory(payload.manualWorkdirHistory)
      : normalizeManualWorkdirHistory(),
  };
}

export function mergeCloudSyncPayloads(remotePayload, localPayload) {
  const remote = normalizeCloudSyncPlainPayload(remotePayload || {});
  const local = normalizeCloudSyncPlainPayload(localPayload || {});
  const existingKeys = new Set(remote.workspace.servers.map((server) => cloudSyncSessionKeyForServer(server)));
  const addedServers = [];
  const skippedServers = [];

  local.workspace.servers.forEach((server) => {
    const key = cloudSyncSessionKeyForServer(server);
    if (!key || existingKeys.has(key)) {
      skippedServers.push(server);
      return;
    }
    existingKeys.add(key);
    addedServers.push(server);
  });

  const servers = [...remote.workspace.servers, ...addedServers];
  return {
    payload: {
      ...local,
      exportedAt: new Date().toISOString(),
      workspace: {
        version: workspaceStoreVersion,
        activeServerId:
          remote.workspace.activeServerId && servers.some((server) => server.id === remote.workspace.activeServerId)
            ? remote.workspace.activeServerId
            : local.workspace.activeServerId && servers.some((server) => server.id === local.workspace.activeServerId)
              ? local.workspace.activeServerId
              : servers[0]?.id || "",
        servers,
      },
      directoryPrefs: mergeDirectoryPrefs(remote.directoryPrefs, local.directoryPrefs),
      manualWorkdirHistory: mergeManualWorkdirHistory(remote.manualWorkdirHistory, local.manualWorkdirHistory),
    },
    addedServers,
    skippedServers,
  };
}

export function mergeCloudDownloadedServers(currentServers, cloudPayload) {
  const current = Array.isArray(currentServers) ? currentServers : [];
  const cloud = normalizeCloudSyncPlainPayload(cloudPayload || {});
  const currentIsOnlyPlaceholder =
    current.length === 1 &&
    (current[0]?.id === "default-server" || serverDisplayName(current[0], 0) === "默认服务器") &&
    !String(current[0]?.profile?.host || "").trim();
  const kept = currentIsOnlyPlaceholder ? [] : current;
  const existingKeys = new Set(kept.map((server) => cloudSyncSessionKeyForServer(server)).filter(Boolean));
  const existingIds = new Set(kept.map((server) => server.id).filter(Boolean));
  const addedServers = [];
  const skippedServers = [];

  cloud.workspace.servers.forEach((server) => {
    const key = cloudSyncSessionKeyForServer(server);
    if (!key || existingKeys.has(key)) {
      skippedServers.push(server);
      return;
    }
    existingKeys.add(key);
    const nextId = existingIds.has(server.id) ? createServerId() : server.id || createServerId();
    existingIds.add(nextId);
    addedServers.push(
      createServerSession(
        {
          ...server,
          id: nextId,
          messages: [],
          rawOutput: "",
          task: {},
          unreadResult: null,
          connection: initialConnectionForProfile(server.profile),
        },
        kept.length + addedServers.length,
      ),
    );
  });

  return {
    servers: [...kept, ...addedServers],
    addedServers,
    skippedServers,
    cloud,
  };
}

function cloudSyncCrypto() {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle || !cryptoApi.getRandomValues) {
    throw new Error("当前设备不支持安全加密，无法同步会话配置。");
  }
  return cryptoApi;
}

function fromBase64Bytes(base64) {
  const binary = atob(String(base64 || ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function deriveCloudSyncKey(password, saltBytes, iterations = cloudSyncKdfIterations) {
  const cryptoApi = cloudSyncCrypto();
  const baseKey = await cryptoApi.subtle.importKey(
    "raw",
    cloudSyncTextEncoder.encode(String(password || "")),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return cryptoApi.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptCloudSyncPayload(payload, password) {
  const cleanPassword = String(password || "");
  if (!cleanPassword) throw new Error("请填写同步密码。");
  const cryptoApi = cloudSyncCrypto();
  const salt = new Uint8Array(16);
  const iv = new Uint8Array(12);
  cryptoApi.getRandomValues(salt);
  cryptoApi.getRandomValues(iv);
  const key = await deriveCloudSyncKey(cleanPassword, salt);
  const encodedPayload = cloudSyncTextEncoder.encode(JSON.stringify(payload || {}));
  const ciphertext = await cryptoApi.subtle.encrypt({ name: "AES-GCM", iv }, key, encodedPayload);
  return JSON.stringify({
    kind: cloudSyncEncryptionKind,
    version: 1,
    algorithm: "AES-GCM",
    kdf: "PBKDF2-SHA256",
    iterations: cloudSyncKdfIterations,
    salt: toBase64Bytes(salt),
    iv: toBase64Bytes(iv),
    ciphertext: toBase64Bytes(new Uint8Array(ciphertext)),
  });
}

export async function decryptCloudSyncPayload(encryptedPayload, password) {
  const envelope = JSON.parse(String(encryptedPayload || ""));
  if (envelope?.kind !== cloudSyncEncryptionKind || envelope?.algorithm !== "AES-GCM") {
    throw new Error("云端配置格式不支持。");
  }
  const salt = fromBase64Bytes(envelope.salt);
  const iv = fromBase64Bytes(envelope.iv);
  const ciphertext = fromBase64Bytes(envelope.ciphertext);
  const key = await deriveCloudSyncKey(String(password || ""), salt, Number(envelope.iterations || cloudSyncKdfIterations));
  try {
    const decrypted = await cloudSyncCrypto().subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return normalizeCloudSyncPlainPayload(JSON.parse(cloudSyncTextDecoder.decode(decrypted)));
  } catch (error) {
    throw new Error("同步密码可以登录，但无法解密云端配置。请确认这是上传配置时使用的密码。");
  }
}

async function cloudSyncRequest(endpoint, path, { method = "GET", token = "", body = null } = {}) {
  const response = await fetch(`${normalizeCloudSyncEndpoint(endpoint)}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || `配置同步请求失败：${response.status}`);
  }
  return data;
}

export async function loginCloudConfigSync({ endpoint, account, password, device = {} }) {
  const validation = validateCloudSyncCredentials({ account, password });
  if (!validation.ok) throw new Error(validation.message);
  return cloudSyncRequest(endpoint, "/v1/auth/login", {
    method: "POST",
    body: {
      account: validation.account,
      password: validation.password,
      ...device,
    },
  });
}

export async function fetchCloudConfigSync({ endpoint, token }) {
  return cloudSyncRequest(endpoint, "/v1/config", { token });
}

export async function fetchCloudSessionShares({ endpoint, token }) {
  return cloudSyncRequest(endpoint, "/v1/shares", { token });
}

export async function createCloudSessionShare({ endpoint, token, recipientAccount, session }) {
  return cloudSyncRequest(endpoint, "/v1/shares", {
    method: "POST",
    token,
    body: {
      recipientAccount: normalizeCloudSyncAccount(recipientAccount),
      session,
    },
  });
}

export async function deleteCloudSessionShare({ endpoint, token, shareId }) {
  return cloudSyncRequest(endpoint, `/v1/shares/${encodeURIComponent(String(shareId || "").trim())}`, {
    method: "DELETE",
    token,
  });
}

export async function putCloudConfigSync({ endpoint, token, encryptedPayload, baseRevision, device = {} }) {
  return cloudSyncRequest(endpoint, "/v1/config", {
    method: "PUT",
    token,
    body: {
      baseRevision,
      encrypted: true,
      contentType: "application/vnd.ai-workbench.cloud-config+json",
      encoding: "json",
      schemaVersion: cloudSyncPayloadVersion,
      encryptedPayload,
      ...device,
    },
  });
}

export async function deleteCloudConfigSync({ endpoint, token }) {
  return cloudSyncRequest(endpoint, "/v1/config", {
    method: "DELETE",
    token,
  });
}

export function migrationFileName() {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+$/, "")
    .replace("T", "-");
  return `AI-Workbench-config-${stamp}.aiwb.json`;
}

export function profileIssue(profile) {
  if (!String(profile?.host || "").trim()) return "请填写服务器 IP 或域名";
  if (!String(profile?.username || "").trim()) return "请填写登录用户名";
  if (!String(profile?.password || "").trim()) return "请先填写登录密码";
  return "";
}

export function profileReady(profile) {
  return !profileIssue(profile);
}

export function profileConnectionKey(profile) {
  const normalized = normalizeProfile(profile);
  return [
    normalizeServerPlatform(normalized.platform),
    String(normalized.host || "").trim().toLocaleLowerCase(),
    Number(normalized.port || 22) || 22,
    String(normalized.username || "").trim(),
  ].join("|");
}

export function shQuote(value) {
  return `'${String(value ?? "").replace(/'/g, "'\\''")}'`;
}

export function bashCommand(script) {
  return `bash -lc ${shQuote(script)}`;
}

export function commandName(command) {
  return String(command || "").trim().split(/\s+/)[0] || "";
}

export function sanitizeId(value) {
  return String(value || "session").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48);
}

export function toBase64Utf8(text) {
  return toBase64Bytes(new TextEncoder().encode(text));
}

export function toBase64Utf16Le(text) {
  const source = String(text || "");
  const bytes = new Uint8Array(source.length * 2);
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    bytes[index * 2] = code & 0xff;
    bytes[index * 2 + 1] = code >> 8;
  }
  return toBase64Bytes(bytes);
}

export function toBase64Bytes(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function waitUntil(check, { timeoutMs = 5000, intervalMs = 120 } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (check()) return true;
    await sleep(intervalMs);
  }
  return check();
}

export function speechTextFromMessage(message) {
  if (!message || message.role !== "assistant" || taskStateForMessage(message) !== taskStateSucceeded) return "";
  return stripTextForSpeech(message.output || message.body || "");
}

export function lastSpeakableMessageForServer(server) {
  return [...(server?.messages || [])].reverse().find((message) => speechTextFromMessage(message)) || null;
}

export function serverCompletionSpeech(server, index = 0, ok = true, mode = defaultProfile.resultAudioMode) {
  const name = serverSessionName(server, index);
  const summary = ok ? `${name}任务完成。` : `${name}执行失败。`;
  if (normalizeResultAudioMode(mode) !== "full") return summary;
  return speechTextFromMessage(lastSpeakableMessageForServer(server)) || summary;
}

export function stripTextForSpeech(value) {
  return String(value || "")
    .replace(/```[\s\S]*?```/g, " 这里有一段代码，已显示在界面上。 ")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/#{1,6}\s*/g, "")
    .replace(/[*_~>]/g, "")
    .replace(/^\s*[-+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1800);
}

export async function speakAssistantText(text, shouldContinue = () => true, voiceProfile = {}) {
  const cleanText = stripTextForSpeech(text);
  if (!cleanText) return;

  if (!shouldContinue()) return;
  const apiKey = String(voiceProfile.aliyunApiKey || builtInAliyunVoiceConfig.apiKey || "").trim();
  const workspaceId = String(
    voiceProfile.aliyunWorkspaceId || builtInAliyunVoiceConfig.workspaceId || "",
  ).trim();
  const voiceName = String(voiceProfile.ttsVoiceName || defaultProfile.ttsVoiceName).trim();
  const model = String(voiceProfile.ttsModel || defaultProfile.ttsModel).trim();

  if (!apiKey) {
    const error = new Error("语音服务配置缺失，请安装包含阿里云语音配置的版本。");
    await appLog("error", "voice.tts.blocked", {
      reason: "missing_dashscope_api_key",
      textLength: cleanText.length,
      voiceName,
      model,
    });
    throw error;
  }

  await appLog("info", "voice.tts.start", {
    textLength: cleanText.length,
    voiceName,
    model,
    workspaceConfigured: Boolean(workspaceId),
  });

  try {
    const result = await VoiceWorkbench.speak?.({
      text: cleanText,
      locale: "zh-CN",
      streaming: true,
      apiKey,
      workspaceId,
      voiceName,
      model,
    });
    await appLog("info", "voice.tts.success", {
      textLength: cleanText.length,
      voiceName,
      model,
      provider: String(result?.provider || ""),
    });
    return result;
  } catch (error) {
    await appLog("error", "voice.tts.failed", {
      error: diagnosticErrorText(error),
      textLength: cleanText.length,
      voiceName,
      model,
    });
    throw error;
  }
}

export function stopAssistantSpeech() {
  VoiceWorkbench.stopSpeech?.().catch(() => {});
}

export function sessionName(profile, agentId) {
  const base = String(profile.tmuxSession || "ai-dev").trim() || "ai-dev";
  return `${base}-${agentId}`;
}

export function agentCommand(profile, agent) {
  return profile[agent.commandKey] || defaultProfile[agent.commandKey];
}

export function normalizeServerPlatform(value) {
  if (value === "windows" || value === "wsl") return value;
  return "linux";
}

export function discoverySeedWorkdir(profile) {
  const platform = normalizeServerPlatform(profile?.platform);
  const defaults = serverPlatformDefaults[platform] || serverPlatformDefaults.linux;
  const workdir = String(profile?.workdir || "").trim();
  if (!workdir || workdir === defaults.workdir || isLegacyDefaultWorkdir(platform, workdir)) return "";
  return workdir;
}

export function serverPlatformLabel(profile) {
  const platform = normalizeServerPlatform(profile?.platform);
  return serverPlatforms.find((item) => item.id === platform)?.label || serverPlatforms[0].label;
}

export function workdirDisplayName(path) {
  const normalized = String(path || "").replace(/[\\/]+$/, "");
  const parts = normalized.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) || normalized || "工作目录";
}

export function createConversationId(seed = "") {
  const cleanSeed = sanitizeId(String(seed || "").trim()).slice(0, 28);
  const suffix = Math.random().toString(16).slice(2, 10);
  return sanitizeId(["conv", cleanSeed, Date.now(), suffix].filter(Boolean).join("-"));
}

export function conversationIdSuffix(conversationId, length = 4) {
  const text = String(conversationId || "").trim();
  if (!text) return "";
  const compact = text.replace(/[^a-zA-Z0-9]/g, "");
  return (compact || text).slice(-Math.max(1, length));
}

export function sessionSelectionKey(agentId, path, conversationId = "", title = "", sourceSessionId = "") {
  return JSON.stringify({
    agentId: agentId === "claude" ? "claude" : "codex",
    path: String(path || "").trim(),
    conversationId: String(conversationId || "").trim(),
    title: String(title || "").trim(),
    sourceSessionId: String(sourceSessionId || "").trim(),
  });
}

export function parseSessionSelectionKey(key) {
  const text = String(key || "");
  try {
    const parsed = JSON.parse(text);
    return {
      agentId: parsed?.agentId === "claude" ? "claude" : "codex",
      path: String(parsed?.path || "").trim(),
      conversationId: String(parsed?.conversationId || "").trim(),
      title: String(parsed?.title || parsed?.name || "").trim(),
      sourceSessionId: String(parsed?.sourceSessionId || parsed?.sessionId || "").trim(),
    };
  } catch {
    // Legacy selection keys used "agent:path".
  }
  const index = text.indexOf(":");
  return {
    agentId: text.slice(0, index) === "claude" ? "claude" : "codex",
    path: index >= 0 ? text.slice(index + 1) : text,
    conversationId: "",
    title: "",
    sourceSessionId: "",
  };
}

export function parseSmallChineseNumber(token) {
  const value = String(token || "").trim();
  const chineseNumbers = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  return /^\d+$/.test(value) ? Number(value) : chineseNumbers[value];
}

export function parseSessionSwitchIndex(text) {
  const value = String(text || "").trim().replace(/[，。,.!?！？\s]/g, "");
  const intent = value.match(/^(?:切换到|切到|打开|进入|换到|转到)?第([一二两三四五六七八九十]|\d{1,2})个$/);
  const token = intent?.[1];
  if (!token) return -1;
  const number = parseSmallChineseNumber(token);
  return Number.isFinite(number) && number > 0 ? number - 1 : -1;
}

export function parsePlaybackCommandIndex(text) {
  const value = normalizeVoiceText(text);
  if (!value) return null;

  if (/^(?:播放|重播|再播|朗读|重复播放)(?:当前|这个|本)?(?:任务|会话)?(?:结果|回复|回答)?$/.test(value)) {
    return { current: true };
  }

  const match = value.match(
    /^(?:播放|重播|再播|朗读|重复播放)(?:任务|会话)?(?:第)?([一二两三四五六七八九十]|\d{1,2})(?:个)?(?:任务|会话)?(?:结果|回复|回答)?$/,
  );
  const number = parseSmallChineseNumber(match?.[1]);
  if (!Number.isFinite(number) || number <= 0) return null;
  return { index: number - 1 };
}

export function isWindowsProfile(profile) {
  return normalizeServerPlatform(profile?.platform) === "windows";
}

export function isWslProfile(profile) {
  return normalizeServerPlatform(profile?.platform) === "wsl";
}

export function wslDistroFromProfile(profile) {
  return String(profile?.wslDistro || "").trim();
}

export function wslPowerShellHelpers() {
  return `
function Invoke-AiwbWslText {
  param([string]$Arguments)
  $AIWB_PROCESS = New-Object System.Diagnostics.Process
  $AIWB_PROCESS.StartInfo = New-Object System.Diagnostics.ProcessStartInfo
  $AIWB_PROCESS.StartInfo.FileName = "wsl.exe"
  $AIWB_PROCESS.StartInfo.Arguments = $Arguments
  $AIWB_PROCESS.StartInfo.UseShellExecute = $false
  $AIWB_PROCESS.StartInfo.CreateNoWindow = $true
  $AIWB_PROCESS.StartInfo.RedirectStandardOutput = $true
  $AIWB_PROCESS.StartInfo.RedirectStandardError = $true
  $AIWB_PROCESS.StartInfo.StandardOutputEncoding = [System.Text.Encoding]::Unicode
  $AIWB_PROCESS.StartInfo.StandardErrorEncoding = [System.Text.Encoding]::Unicode
  [void]$AIWB_PROCESS.Start()
  $AIWB_STDOUT = $AIWB_PROCESS.StandardOutput.ReadToEnd()
  $AIWB_STDERR = $AIWB_PROCESS.StandardError.ReadToEnd()
  $AIWB_PROCESS.WaitForExit()
  return [PSCustomObject]@{
    ExitCode = $AIWB_PROCESS.ExitCode
    Output = $AIWB_STDOUT
    Error = $AIWB_STDERR
  }
}
function Get-AiwbUsableWslDistros {
  try {
    $AIWB_LIST_RESULT = Invoke-AiwbWslText "--list --quiet"
    if ($AIWB_LIST_RESULT.ExitCode -ne 0) { return @() }
    return @(
      $AIWB_LIST_RESULT.Output -split "[\\r\\n]+" |
        ForEach-Object { ([string]$_).Trim() } |
        Where-Object {
          $_ -and $_ -notmatch '^(docker-desktop(?:-data)?|rancher-desktop(?:-data)?|podman-machine(?:-.+)?)$'
        }
    )
  } catch { return @() }
}
function Invoke-AiwbWslBash {
  param(
    [string]$Distro,
    [string]$ScriptBase64,
    [string]$InputText = ""
  )
  $AIWB_PROCESS = New-Object System.Diagnostics.Process
  $AIWB_PROCESS.StartInfo = New-Object System.Diagnostics.ProcessStartInfo
  $AIWB_PROCESS.StartInfo.FileName = "wsl.exe"
  $AIWB_PROCESS.StartInfo.Arguments = '-d ' + $Distro + ' -u root -- bash -lc "echo ' + $ScriptBase64 + ' | base64 -d | bash"'
  $AIWB_PROCESS.StartInfo.UseShellExecute = $false
  $AIWB_PROCESS.StartInfo.CreateNoWindow = $true
  $AIWB_PROCESS.StartInfo.RedirectStandardInput = $true
  $AIWB_PROCESS.StartInfo.RedirectStandardOutput = $true
  $AIWB_PROCESS.StartInfo.RedirectStandardError = $true
  $AIWB_PROCESS.StartInfo.StandardOutputEncoding = [System.Text.Encoding]::UTF8
  $AIWB_PROCESS.StartInfo.StandardErrorEncoding = [System.Text.Encoding]::Unicode
  [void]$AIWB_PROCESS.Start()
  $AIWB_STDOUT_TASK = $AIWB_PROCESS.StandardOutput.ReadToEndAsync()
  $AIWB_STDERR_TASK = $AIWB_PROCESS.StandardError.ReadToEndAsync()
  if ($InputText) { $AIWB_PROCESS.StandardInput.Write($InputText) }
  $AIWB_PROCESS.StandardInput.Close()
  $AIWB_PROCESS.WaitForExit()
  return [PSCustomObject]@{
    ExitCode = $AIWB_PROCESS.ExitCode
    Output = $AIWB_STDOUT_TASK.Result
    Error = $AIWB_STDERR_TASK.Result
  }
}
`;
}

export function wslPowerShellDistroSetup(profile) {
  const configuredDistro = wslDistroFromProfile(profile);
  return `
${wslPowerShellHelpers()}
$AIWB_DISTRO = ${psQuote(configuredDistro)}
$AIWB_USABLE_DISTROS = @(Get-AiwbUsableWslDistros)
if ($AIWB_DISTRO -and -not ($AIWB_USABLE_DISTROS -contains $AIWB_DISTRO)) { $AIWB_DISTRO = "" }
if (-not $AIWB_DISTRO -and $AIWB_USABLE_DISTROS.Count -gt 0) {
  $AIWB_DISTRO = [string]$AIWB_USABLE_DISTROS[0]
}
if (-not $AIWB_DISTRO) {
  throw "没有找到可用的 WSL Linux 发行版。docker-desktop 不能作为 AI 工作环境。"
}
`;
}

export function dirnameRemote(path) {
  const normalized = String(path || "").replace(/\/+$/, "");
  const index = normalized.lastIndexOf("/");
  if (index <= 0) return ".";
  return normalized.slice(0, index);
}

export function dirnameWindows(path) {
  const normalized = String(path || "").replace(/[\\/]+$/, "");
  const index = Math.max(normalized.lastIndexOf("\\"), normalized.lastIndexOf("/"));
  if (index <= 2) return normalized || ".";
  return normalized.slice(0, index);
}

export function joinWindowsPath(...parts) {
  return parts
    .map((part, index) => {
      const value = String(part || "");
      if (index === 0) return value.replace(/[\\/]+$/, "");
      return value.replace(/^[\\/]+|[\\/]+$/g, "");
    })
    .filter(Boolean)
    .join("\\");
}

export function psQuote(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

export function powershellCommand(script) {
  const encoded = toBase64Utf16Le(`$ErrorActionPreference = 'Stop'\n${script}`);
  return `powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`;
}

export function powershellStdinCommand(script) {
  return {
    command: "powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command -",
    stdin: `$ErrorActionPreference = 'Stop'\n$ProgressPreference = 'SilentlyContinue'\n$InformationPreference = 'SilentlyContinue'\n$AIWB_UTF8 = [System.Text.UTF8Encoding]::new($false)\n[Console]::OutputEncoding = $AIWB_UTF8\n$OutputEncoding = $AIWB_UTF8\n${script}`,
    uploadScript: true,
  };
}

export function remoteBashCommand(profile, script) {
  if (!isWslProfile(profile)) return bashCommand(script);
  const encoded = toBase64Utf8(script);
  return powershellStdinCommand(`
${wslPowerShellDistroSetup(profile)}
$AIWB_RUN = Invoke-AiwbWslBash -Distro $AIWB_DISTRO -ScriptBase64 ${psQuote(encoded)}
if ($AIWB_RUN.Output) { [Console]::Out.Write($AIWB_RUN.Output) }
if ($AIWB_RUN.ExitCode -ne 0) {
  if ($AIWB_RUN.Error) { [Console]::Error.Write($AIWB_RUN.Error) }
  exit $AIWB_RUN.ExitCode
}
exit 0
`);
}
