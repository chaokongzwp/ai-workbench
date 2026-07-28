import { app, safeStorage } from "electron";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

function profileFilePath() {
  return process.env.AIWB_PROFILE_PATH || join(app.getPath("userData"), "connection-profile.json");
}

function decryptProfile(profile) {
  if (profile?.payloadEncrypted) {
    return JSON.parse(safeStorage.decryptString(Buffer.from(profile.payloadEncrypted, "base64")));
  }
  if (profile?.passwordEncrypted) {
    return {
      ...profile,
      password: safeStorage.decryptString(Buffer.from(profile.passwordEncrypted, "base64")),
    };
  }
  return profile && typeof profile === "object" ? profile : {};
}

function encryptProfilePayload(profile) {
  const value = profile && typeof profile === "object" ? profile : {};
  if (!safeStorage.isEncryptionAvailable()) return { ...value, insecurePasswordStorage: true };
  return {
    payloadEncrypted: safeStorage.encryptString(JSON.stringify(value)).toString("base64"),
  };
}

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function createConnection(profile) {
  return {
    state: "idle",
    label: "待连接",
    detail: `${profile.username}@${profile.host}`,
    mode: profile.useWorkbenchAgent ? "agent" : "ssh",
  };
}

function normalizePlatform(value) {
  return value === "wsl" || value === "windows" ? value : "linux";
}

function profileConnectionKey(profile = {}) {
  return [
    normalizePlatform(profile.platform),
    String(profile.host || "").trim().toLocaleLowerCase(),
    Number(profile.port || 22) || 22,
    String(profile.username || "").trim(),
  ].join("|");
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

function normalizeProfile(profile = {}) {
  const platform = normalizePlatform(profile.platform);
  const platformDefaults =
    platform === "windows"
      ? { workdir: "", codexCommand: "codex", claudeCommand: "claude" }
      : platform === "wsl"
        ? { workdir: "", codexCommand: "codex", claudeCommand: "claude" }
        : { workdir: "", codexCommand: "/usr/local/bin/codex", claudeCommand: "claude" };
  const useWorkbenchAgent =
    platform === "windows" ? false : profile.useWorkbenchAgent === undefined ? true : Boolean(profile.useWorkbenchAgent);
  return {
    platform,
    host: String(profile.host || "").trim(),
    port: Number(profile.port || 22) || 22,
    username: String(profile.username || "").trim(),
    password: String(profile.password || ""),
    workdir: String(profile.workdir ?? platformDefaults.workdir ?? ""),
    agentId: profile.agentId === "claude" ? "claude" : "codex",
    aiModel: String(profile.aiModel || ""),
    tmuxSession: String(profile.tmuxSession || "ai-dev"),
    codexCommand: String(profile.codexCommand || platformDefaults.codexCommand),
    claudeCommand: String(profile.claudeCommand || platformDefaults.claudeCommand),
    name: String(profile.name || ""),
    mainAIEnabled: Boolean(profile.mainAIEnabled),
    mainAIModel: String(profile.mainAIModel || "gpt-5.4-mini"),
    openAIAPIKey: String(profile.openAIAPIKey || ""),
    wakeWordPhrases: String(profile.wakeWordPhrases || "未来"),
    taskWakePhrases: String(profile.taskWakePhrases || ""),
    voiceInputEnabled: Boolean(profile.voiceInputEnabled),
    aliyunApiKey: String(profile.aliyunApiKey || ""),
    aliyunWorkspaceId: String(profile.aliyunWorkspaceId || "llm-0hn2qaqnqgcdfnbg"),
    ttsVoiceName: String(profile.ttsVoiceName || "longanhuan"),
    ttsModel: String(profile.ttsModel || "cosyvoice-v3-flash"),
    playResultAudio: Boolean(profile.playResultAudio),
    resultAudioMode: String(profile.resultAudioMode || "summary"),
    useWorkbenchAgent,
    appearanceMode: String(profile.appearanceMode || "light"),
    connectTimeoutSeconds: Number(profile.connectTimeoutSeconds || 15) || 15,
  };
}

function createServerSession(partial = {}, index = 0) {
  const profile = normalizeProfile(partial.profile || partial);
  const id = partial.id || createId("server");
  const name = String(partial.name || profile.name || "").trim() || (index === 0 ? "默认服务器" : `服务器 ${index + 1}`);
  return {
    id,
    conversationId: String(partial.conversationId || "").trim() || createId("conv"),
    name,
    profile: { ...profile, name },
    connection: partial.connection || createConnection(profile),
    diagnostics: partial.diagnostics || {},
    discovery: partial.discovery || null,
    rawOutput: partial.rawOutput || "原始输出会在测试连接或发送任务后显示。",
    messages: Array.isArray(partial.messages) ? partial.messages : [],
    task: partial.task || { state: "idle" },
    unreadResult: partial.unreadResult || null,
    agentHistoryCursor: String(partial.agentHistoryCursor || "").trim(),
    agentHistoryHasMore: partial.agentHistoryHasMore !== false,
  };
}

await app.whenReady();

const filePath = profileFilePath();
const current = existsSync(filePath) ? decryptProfile(JSON.parse(await readFile(filePath, "utf8"))) : {};
const servers = Array.isArray(current.servers) ? current.servers : [];
const useWorkbenchAgentEnv = process.env.AIWB_USE_AGENT;

const profile = normalizeProfile({
  name: process.env.AIWB_SERVER_NAME || "局域网 Windows",
  platform: process.env.AIWB_SERVER_PLATFORM || "windows",
  host: requiredEnv("AIWB_SERVER_HOST"),
  port: Number(process.env.AIWB_SERVER_PORT || 22) || 22,
  username: requiredEnv("AIWB_SERVER_USERNAME"),
  password: requiredEnv("AIWB_SERVER_PASSWORD"),
  workdir: process.env.AIWB_SERVER_WORKDIR || "",
  agentId: process.env.AIWB_SERVER_AGENT || "codex",
  aiModel: process.env.AIWB_SERVER_MODEL || "",
  useWorkbenchAgent:
    useWorkbenchAgentEnv === undefined
      ? undefined
      : !["0", "false", "no", "off"].includes(String(useWorkbenchAgentEnv).trim().toLowerCase()),
});

const targetKey = profileConnectionKey(profile);
const existingIndex = servers.findIndex((server) => profileConnectionKey(server.profile) === targetKey);
const nextServer = createServerSession(
  {
    ...(existingIndex >= 0 ? servers[existingIndex] : {}),
    name: profile.name,
    profile,
    connection: createConnection(profile),
    diagnostics: existingIndex >= 0 ? servers[existingIndex].diagnostics || {} : {},
    discovery: existingIndex >= 0 ? servers[existingIndex].discovery || null : null,
    messages: existingIndex >= 0 ? servers[existingIndex].messages || [] : [],
    rawOutput: existingIndex >= 0 ? servers[existingIndex].rawOutput || "" : "已添加局域网机器，点击连接后扫描工作目录。",
  },
  servers.length,
);

const nextServers = [...servers];
if (existingIndex >= 0) nextServers[existingIndex] = nextServer;
else nextServers.push(nextServer);

const nextProfile = {
  ...current,
  version: 4,
  activeServerId: nextServer.id,
  servers: nextServers,
  updatedAt: new Date().toISOString(),
};

await mkdir(dirname(filePath), { recursive: true });
await writeFile(filePath, JSON.stringify(encryptProfilePayload(nextProfile), null, 2), { mode: 0o600 });

console.log(
  JSON.stringify({
    ok: true,
    action: existingIndex >= 0 ? "updated" : "added",
    filePath,
    serverId: nextServer.id,
    serverName: nextServer.name,
    serverCount: nextServers.length,
  }),
);

app.exit(0);
