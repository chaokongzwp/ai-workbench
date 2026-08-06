import * as Foundation from "./foundation.js";
import * as Agent from "./agent.js";
import * as RemoteCommands from "./remoteCommands.js";

const {
  SSHWorkbench,
  VoiceWorkbench,
  agentCommand,
  agentRuntimeProfile,
  agents,
  appLog,
  appearanceModeOptions,
  appendBrowserDiagnosticLog,
  applyGlobalSettings,
  assetBase,
  assetPath,
  automaticTaskWakePhrases,
  bashCommand,
  browserDiagnosticLogStorageKey,
  buildClaudePrintCommand,
  buildCodexExecCommand,
  buildCodexLoginDeviceCommand,
  buildDiscoveryCommand,
  buildHealthCommand,
  buildInstallWorkbenchAgentCommand,
  buildModelChoiceCommand,
  buildWindowsCodexExecCommand,
  buildWindowsDiscoveryCommand,
  buildWindowsHealthCommand,
  buildWindowsNoTmuxCommand,
  buildWindowsUnsupportedAgentCommand,
  buildWorkbenchAgentCancelCommand,
  buildWorkbenchAgentConversationListCommand,
  buildWorkbenchAgentConversationStatusCommand,
  buildWorkbenchAgentCreateCommand,
  buildWorkbenchAgentStatusCommand,
  buildWorkspaceMigrationPayload,
  builtInAliyunVoiceConfig,
  chineseNumber,
  claudeSetupAutomationSnippet,
  clipPersistedText,
  commandDiagnosticPayload,
  commandName,
  compactInlineText,
  connectionForAppLaunch,
  connectionIsLive,
  createConversationId,
  createMessage,
  createRemoteTaskId,
  createServerId,
  createServerSession,
  currentResultPlaybackPhrases,
  defaultProfile,
  defaultWakeWordPhrases,
  desktopBridge,
  directoryPrefKey,
  directoryPrefsStorageKey,
  directoryUsageBadge,
  dirnameRemote,
  dirnameWindows,
  discoverySeedWorkdir,
  displayMarker,
  displayMarkers,
  dormantConnectionForProfile,
  finalAnswerEnd,
  finalAnswerStart,
  formatAgentPrompt,
  formatDuration,
  globalSettingsFromProfile,
  healthFromWorkbenchAgentStatus,
  initialConnectionForProfile,
  isEventLike,
  isGlobalWakePhrase,
  isLegacyDefaultWorkdir,
  isNoisyDiagnosticKey,
  isSensitiveDiagnosticKey,
  isSpeechStopPhrase,
  isWindowsProfile,
  isWslProfile,
  joinWindowsPath,
  lastSpeakableMessageForServer,
  legacyDefaultWakeWordPhrases,
  legacyDefaultWorkdirs,
  loadBrowserDiagnosticLogs,
  loadDirectoryPrefs,
  loadLocalMessageHistory,
  loadManualWorkdirHistory,
  loadWorkspaceMirror,
  localMessageHistoryFromServers,
  localMessageHistoryStorageKey,
  mainAIRouteSchema,
  mainAIRouterInstructions,
  manualWorkdirHistoryStorageKey,
  manualWorkdirScope,
  markerLabels,
  maxPersistedMessagesPerServer,
  maxPersistedTextLength,
  mergeAgentConversationsIntoDiscovery,
  mergeDirectoryPrefs,
  mergeImportedServers,
  mergeLocalMessageHistory,
  mergeManualWorkdirHistory,
  messageCounter,
  messagesForStorage,
  migrationFileKind,
  migrationFileName,
  migrationFileVersion,
  normalizeAppearanceMode,
  normalizeDirectoryPrefs,
  normalizeDiscovery,
  normalizeManualWorkdirHistory,
  normalizePersistedMessage,
  normalizeProfile,
  normalizeResultAudioMode,
  normalizeServerPlatform,
  normalizeVoiceText,
  normalizeWorkspaceStore,
  parseDiscovery,
  parseHealth,
  parsePlaybackCommandIndex,
  parseSessionSelectionKey,
  parseSessionSwitchIndex,
  parseSmallChineseNumber,
  parseWorkbenchAgentConversations,
  parseWorkbenchAgentOutput,
  parseWorkspaceMigrationText,
  playbackCommandMatchFromPhrase,
  playbackPhrasesForServer,
  powershellCommand,
  powershellStdinCommand,
  profileConnectionKey,
  profileIssue,
  profileReady,
  profileWithDetectedTools,
  psQuote,
  readableVoiceNameCandidate,
  readyConnectionForSession,
  recentManualWorkdirs,
  rememberManualWorkdir,
  remoteBashCommand,
  resultAudioModeOptions,
  sameWorkdir,
  sanitizeDiagnosticValue,
  sanitizeId,
  saveDirectoryPrefs,
  saveLocalMessageHistory,
  saveManualWorkdirHistory,
  saveWorkspaceMirror,
  serializeWakePhrases,
  serializeWorkspaceMigrationStore,
  serializeWorkspaceStore,
  serverCompletionSpeech,
  serverDisplayName,
  serverPlatformDefaults,
  serverPlatformLabel,
  serverPlatforms,
  serverSessionName,
  serverTaskRunning,
  sessionName,
  sessionSelectionKey,
  shQuote,
  sleep,
  speakAssistantText,
  speechInterruptContextForServers,
  speechInterruptPhrases,
  speechTextFromMessage,
  stopAssistantSpeech,
  stripLegacyDefaultWorkdirFromPlaceholder,
  stripTextForSpeech,
  taskForStorage,
  taskTextFromValue,
  taskWakeMatchFromPhrase,
  taskWakeMatchFromText,
  taskWakePhrasesForServer,
  timestampFromAgentTime,
  toBase64Bytes,
  toBase64Utf16Le,
  toBase64Utf8,
  toggleListValue,
  trimVisibleText,
  ttsModelOptions,
  voiceToneOptions,
  waitUntil,
  wakeContextForServers,
  wakePhrasesForProfile,
  wakePhrasesFromText,
  workbenchAgentAvailableFromOutput,
  workbenchAgentScript,
  workbenchAgentVersionNumber,
  workdirDisplayName,
  wslDistroFromProfile,
  workspaceDiagnosticSummary,
  workspaceMirrorStorageKey,
  workspaceStoreHasServers
} = { ...Foundation, ...Agent, ...RemoteCommands };

export const codeFileExtensions = [
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "py",
  "go",
  "java",
  "kt",
  "swift",
  "rs",
  "c",
  "cc",
  "cpp",
  "h",
  "hpp",
  "cs",
  "php",
  "rb",
  "sh",
  "bash",
  "zsh",
  "fish",
  "sql",
  "css",
  "scss",
  "sass",
  "less",
  "vue",
  "svelte",
  "xml",
  "yml",
  "yaml",
  "toml",
  "ini",
  "env",
  "dockerfile",
];

export const previewFileExtensions = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "heic",
  "heif",
  "bmp",
  "pdf",
  "csv",
  "html",
  "htm",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "txt",
  "md",
  "json",
  ...codeFileExtensions,
];

export const previewFileExtensionPattern = [...previewFileExtensions].sort((left, right) => right.length - left.length).join("|");

export const maxPreviewFileBytes = 5 * 1024 * 1024;

export const maxDownloadFileBytes = 50 * 1024 * 1024;

export const maxImageAttachmentBytes = 8 * 1024 * 1024;

export const maxFileAttachmentBytes = 20 * 1024 * 1024;

export const remoteFilePayloadOverhead = 12_288;

export const conversationBottomThreshold = 180;

export function remoteFileResponseSizeForBytes(bytes) {
  return Math.ceil(Math.max(1, Number(bytes || 0)) * 1.38) + remoteFilePayloadOverhead;
}

export function remoteFileExtension(path) {
  return String(path || "")
    .split(/[?#]/)[0]
    .replace(/:\d+(?::\d+)?$/g, "")
    .match(/\.([a-z0-9]+)$/i)?.[1]?.toLocaleLowerCase() || "";
}

export function previewMimeFromExtension(extension) {
  const ext = String(extension || "").toLocaleLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "heic", "heif", "bmp"].includes(ext)) {
    const subtype = ext === "jpg" ? "jpeg" : ext;
    return `image/${subtype}`;
  }
  if (ext === "pdf") return "application/pdf";
  if (ext === "csv") return "text/csv";
  if (ext === "html" || ext === "htm") return "text/html";
  if (ext === "doc") return "application/msword";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "xls") return "application/vnd.ms-excel";
  if (ext === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === "json") return "application/json";
  if (codeFileExtensions.includes(ext)) return "text/plain";
  if (["txt", "md"].includes(ext)) return "text/plain";
  return "application/octet-stream";
}

export function previewKindFromExtension(extension) {
  const ext = String(extension || "").toLocaleLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "heic", "heif", "bmp"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (ext === "csv") return "csv";
  if (ext === "html" || ext === "htm") return "html";
  if (ext === "doc" || ext === "docx") return "word";
  if (ext === "xls" || ext === "xlsx") return "excel";
  if (codeFileExtensions.includes(ext)) return "code";
  if (["txt", "md", "json"].includes(ext)) return "text";
  return "binary";
}

export function previewLabelFromKind(kind) {
  if (kind === "image") return "图片";
  if (kind === "pdf") return "PDF";
  if (kind === "csv") return "CSV";
  if (kind === "html") return "网页";
  if (kind === "word") return "Word";
  if (kind === "excel") return "Excel";
  if (kind === "code") return "代码";
  if (kind === "text") return "文本";
  return "文件";
}

export function remoteBasename(path) {
  return String(path || "").replace(/[\\/]+$/g, "").split(/[\\/]/).pop() || "文件";
}

export function stripFileCandidate(value) {
  return String(value || "")
    .trim()
    .replace(/^["'`([{<]+/, "")
    .replace(/["'`.,，。;；:：!?！？)\]}>]+$/g, "")
    .replace(/:\d+(?::\d+)?$/g, "");
}

export function isUrlLikeFileCandidate(value, source = "", matchIndex = 0) {
  const candidate = String(value || "").trim();
  if (!candidate) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) return true;
  if (/^\/\//.test(candidate)) return true;

  const before = String(source || "").slice(Math.max(0, matchIndex - 14), matchIndex);
  return /(?:https?|ftp):\/?$/i.test(before) || /[a-z][a-z0-9+.-]*:\/\/[^\s]*$/i.test(before);
}

export function isAbsoluteRemotePath(path, profile = defaultProfile) {
  const value = String(path || "");
  if (isWindowsProfile(profile)) return /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value);
  return value.startsWith("/") || value.startsWith("~/");
}

export function joinRemotePath(profile, path) {
  const value = stripFileCandidate(path);
  if (!value || isAbsoluteRemotePath(value, profile)) return value;
  const base = String(profile?.workdir || "").trim();
  if (!base) return value;
  const cleaned = value.replace(/^\.?[\\/]+/, "");
  if (isWindowsProfile(profile)) return `${base.replace(/[\\/]+$/g, "")}\\${cleaned.replace(/\//g, "\\")}`;
  return `${base.replace(/\/+$/g, "")}/${cleaned.replace(/\\/g, "/")}`;
}

export function cleanBase64Payload(value) {
  return String(value || "").replace(/^data:[^,]+,/i, "").replace(/\s+/g, "");
}

export function imageExtensionFromFile(file) {
  const nameExt = remoteFileExtension(file?.name || "");
  if (["png", "jpg", "jpeg", "gif", "webp", "heic", "heif", "bmp", "tif", "tiff"].includes(nameExt)) {
    return nameExt === "jpeg" ? "jpg" : nameExt;
  }
  const mime = String(file?.type || file?.mime || "").toLocaleLowerCase();
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("heic")) return "heic";
  if (mime.includes("heif")) return "heif";
  if (mime.includes("bmp")) return "bmp";
  if (mime.includes("tiff")) return "tiff";
  return "png";
}

export function sanitizeUploadName(name, fallbackExtension = "png") {
  const original = String(name || "image").trim();
  const extension = remoteFileExtension(original) || fallbackExtension || "png";
  const normalizedBase = original
    .replace(/\.[a-z0-9]+$/i, "")
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  const base = Array.from(normalizedBase).slice(0, 48).join("") || "image";
  return `${base}.${extension}`;
}

export function imageUploadRemoteName(attachment, index = 0) {
  const extension =
    remoteFileExtension(attachment?.name || "") ||
    (String(attachment?.mime || attachment?.type || "").startsWith("image/") ? imageExtensionFromFile(attachment) : "bin");
  const safeName = sanitizeUploadName(attachment?.name, extension);
  const suffix = Math.random().toString(16).slice(2, 8);
  return `${Date.now()}-${index + 1}-${suffix}-${safeName}`;
}

export function buildRemoteImageUploadTarget(profile, attachment, index = 0) {
  const remoteName = imageUploadRemoteName(attachment, index);
  const uploadDir = joinRemotePath(profile, ".ai-workbench/uploads");
  const remotePath = joinRemotePath(profile, `.ai-workbench/uploads/${remoteName}`);
  const mime = String(attachment?.mime || attachment?.type || "image/png");
  const originalName = String(attachment?.name || remoteName);
  return {
    uploadDir,
    path: remotePath,
    remoteName,
    name: originalName,
    mime,
    size: Number(attachment?.size || 0) || 0,
  };
}

export function base64DecodedByteLength(value) {
  const base64 = cleanBase64Payload(value);
  if (!base64) return 0;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function buildRemoteImageUploadCommand(profile, attachment, index = 0) {
  const target = buildRemoteImageUploadTarget(profile, attachment, index);
  const {
    uploadDir,
    path: remotePath,
    remoteName,
    name: originalName,
    mime,
    size,
  } = target;
  const base64 = cleanBase64Payload(attachment?.base64);

  if (isWindowsProfile(profile)) {
    const uploadScript = `
$AIWB_DIR = ${psQuote(uploadDir)}
$AIWB_PATH = ${psQuote(remotePath)}
$AIWB_NAME = ${psQuote(remoteName)}
$AIWB_ORIGINAL = ${psQuote(originalName)}
$AIWB_MIME = ${psQuote(mime)}
$AIWB_BASE64 = @'
${base64}
'@
New-Item -ItemType Directory -Force -Path $AIWB_DIR | Out-Null
$AIWB_BASE64 = ($AIWB_BASE64 -replace '\\s', '')
[System.IO.File]::WriteAllBytes($AIWB_PATH, [System.Convert]::FromBase64String($AIWB_BASE64))
$AIWB_FILE = Get-Item -LiteralPath $AIWB_PATH
Write-Output "__AIWB_UPLOAD_START__"
Write-Output "__AIWB_UPLOAD_NAME__$AIWB_NAME"
Write-Output "__AIWB_UPLOAD_ORIGINAL__$AIWB_ORIGINAL"
Write-Output "__AIWB_UPLOAD_PATH__$AIWB_PATH"
Write-Output "__AIWB_UPLOAD_MIME__$AIWB_MIME"
Write-Output "__AIWB_UPLOAD_SIZE__$($AIWB_FILE.Length)"
Write-Output "__AIWB_UPLOAD_END__"
`;
    return {
      ...powershellStdinCommand(uploadScript),
      path: remotePath,
      name: originalName,
      mime,
      size,
    };
  }

  const bashUploadScript = `
AIWB_DIR=${shQuote(uploadDir)}
AIWB_PATH=${shQuote(remotePath)}
mkdir -p "$AIWB_DIR"
tr -d '[:space:]' | base64 -d > "$AIWB_PATH"
AIWB_SIZE=$(wc -c < "$AIWB_PATH" | tr -d '[:space:]')
printf '__AIWB_UPLOAD_START__\\n'
printf '__AIWB_UPLOAD_NAME__%s\\n' ${shQuote(remoteName)}
printf '__AIWB_UPLOAD_ORIGINAL__%s\\n' ${shQuote(originalName)}
printf '__AIWB_UPLOAD_PATH__%s\\n' "$AIWB_PATH"
printf '__AIWB_UPLOAD_MIME__%s\\n' ${shQuote(mime)}
printf '__AIWB_UPLOAD_SIZE__%s\\n' "$AIWB_SIZE"
printf '__AIWB_UPLOAD_END__\\n'
`;

  if (isWslProfile(profile)) {
    const encodedScript = toBase64Utf8(bashUploadScript);
    const wslDistro = wslDistroFromProfile(profile);
    return {
      path: remotePath,
      name: originalName,
      mime,
      size,
      command: powershellCommand(`
$AIWB_DISTRO = ${psQuote(wslDistro)}
if (-not $AIWB_DISTRO) { throw "请先重新连接并扫描 Windows 机器，确定要使用的 WSL Linux 发行版。" }
$AIWB_BASE64 = [Console]::In.ReadToEnd()
$AIWB_RUN = New-Object System.Diagnostics.Process
$AIWB_RUN.StartInfo = New-Object System.Diagnostics.ProcessStartInfo
$AIWB_RUN.StartInfo.FileName = "wsl.exe"
$AIWB_RUN.StartInfo.Arguments = '-d ' + $AIWB_DISTRO + ' -u root -- bash -lc "echo ${encodedScript} | base64 -d | bash"'
$AIWB_RUN.StartInfo.UseShellExecute = $false
$AIWB_RUN.StartInfo.CreateNoWindow = $true
$AIWB_RUN.StartInfo.RedirectStandardInput = $true
$AIWB_RUN.StartInfo.RedirectStandardOutput = $true
$AIWB_RUN.StartInfo.RedirectStandardError = $true
$AIWB_RUN.StartInfo.StandardOutputEncoding = [System.Text.Encoding]::UTF8
$AIWB_RUN.StartInfo.StandardErrorEncoding = [System.Text.Encoding]::Unicode
[void]$AIWB_RUN.Start()
$AIWB_STDOUT_TASK = $AIWB_RUN.StandardOutput.ReadToEndAsync()
$AIWB_STDERR_TASK = $AIWB_RUN.StandardError.ReadToEndAsync()
$AIWB_RUN.StandardInput.Write($AIWB_BASE64)
$AIWB_RUN.StandardInput.Close()
$AIWB_RUN.WaitForExit()
if ($AIWB_STDOUT_TASK.Result) { [Console]::Out.Write($AIWB_STDOUT_TASK.Result) }
if ($AIWB_RUN.ExitCode -ne 0) {
  if ($AIWB_STDERR_TASK.Result) { [Console]::Error.Write($AIWB_STDERR_TASK.Result) }
  exit $AIWB_RUN.ExitCode
}
`),
      stdin: base64,
    };
  }

  return {
    path: remotePath,
    name: originalName,
    mime,
    size,
    command: bashCommand(bashUploadScript),
    stdin: base64,
  };
}

export function parseRemoteImageUploadPayload(output, fallback = {}) {
  const text = String(output || "");
  if (!text.includes("__AIWB_UPLOAD_START__")) {
    throw new Error(trimVisibleText(text) || "文件上传失败。");
  }
  const readMarker = (marker) => text.match(new RegExp(`__AIWB_UPLOAD_${marker}__(.*)`))?.[1]?.trim() || "";
  return {
    // The local name is authoritative. Older Windows shells can return a
    // mojibake ORIGINAL marker even when the uploaded file itself is valid.
    name: fallback.name || readMarker("ORIGINAL") || readMarker("NAME") || "文件",
    remoteName: readMarker("NAME") || "",
    path: readMarker("PATH") || fallback.path || "",
    mime: readMarker("MIME") || fallback.mime || "image/png",
    size: Number(readMarker("SIZE") || fallback.size || 0) || 0,
  };
}

export function appendUploadedImagesToPrompt(text, uploads = []) {
  const validUploads = uploads.filter((item) => item?.path);
  if (!validUploads.length) return text;
  const lines = validUploads.map((item, index) => `${index + 1}. ${item.name || "文件"}：${item.path}`);
  return [
    text || "请查看这些附件。",
    "",
    "下面是我通过 AI Workbench 上传到当前远端工作目录的附件，请直接读取这些路径并结合文件内容完成任务：",
    ...lines,
  ].join("\n");
}

export function userBodyWithUploadedImages(text, uploads = []) {
  const validUploads = uploads.filter((item) => item?.path);
  if (!validUploads.length) return text;
  return [
    text || "请查看这些附件。",
    "",
    ...validUploads.map((item) =>
      String(item?.mime || "").startsWith("image/")
        ? `![${item.name || "图片"}](${item.path})`
        : `[文件] ${item.name || "文件"}：${item.path}`,
    ),
  ].join("\n");
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("读取文件失败。"));
    reader.readAsDataURL(file);
  });
}

export async function fileToImageAttachment(file) {
  if (!file) throw new Error("没有选择文件。");
  const mime = String(file.type || "").toLocaleLowerCase();
  const extension = remoteFileExtension(file.name || "") || imageExtensionFromFile(file) || "bin";
  if (file.size > maxFileAttachmentBytes) {
    throw new Error(`文件太大，当前单个文件最多支持 ${Math.round(maxFileAttachmentBytes / 1024 / 1024)}MB。`);
  }
  const dataUrl = await readFileAsDataUrl(file);
  const isImage =
    mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "heic", "heif", "bmp", "tif", "tiff"].includes(extension);
  return {
    id: `file-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: file.name || `attachment.${extension}`,
    mime: file.type || (isImage ? `image/${extension === "jpg" ? "jpeg" : extension}` : "application/octet-stream"),
    size: file.size || 0,
    base64: cleanBase64Payload(dataUrl),
    isImage,
    previewUrl: isImage && typeof URL !== "undefined" && URL.createObjectURL ? URL.createObjectURL(file) : "",
  };
}

export function filesFromClipboardEvent(event) {
  const clipboard = event?.clipboardData;
  if (!clipboard) return [];

  const files = [
    ...Array.from(clipboard.files || []),
    ...Array.from(clipboard.items || [])
      .filter((item) => item?.kind === "file")
      .map((item) => item.getAsFile?.())
      .filter(Boolean),
  ];
  const seen = new Set();
  return files.filter((file) => {
    const key = [file.name, file.size, file.type, file.lastModified].join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function dataTransferHasFiles(dataTransfer) {
  if (!dataTransfer) return false;
  return Boolean(dataTransfer.files?.length) || Array.from(dataTransfer.types || []).includes("Files");
}

export const fileToUploadAttachment = fileToImageAttachment;
export const buildRemoteFileUploadCommand = buildRemoteImageUploadCommand;
export const parseRemoteFileUploadPayload = parseRemoteImageUploadPayload;
export const appendUploadedFilesToPrompt = appendUploadedImagesToPrompt;
export const userBodyWithUploadedFiles = userBodyWithUploadedImages;

function comparableRemotePath(profile, path) {
  const windows = isWindowsProfile(profile);
  const separator = windows ? "\\" : "/";
  const raw = String(path || "").trim().replace(windows ? /\//g : /\\/g, separator);
  const drive = windows ? raw.match(/^[A-Za-z]:/)?.[0] || "" : "";
  const absolute = !windows && raw.startsWith("/");
  const withoutPrefix = drive ? raw.slice(drive.length) : raw;
  const parts = [];
  withoutPrefix.split(/[\\/]+/).forEach((part) => {
    if (!part || part === ".") return;
    if (part === "..") parts.pop();
    else parts.push(part);
  });
  let normalized = parts.join(separator);
  if (drive) normalized = `${drive}${separator}${normalized}`;
  else if (absolute) normalized = `${separator}${normalized}`;
  while (normalized.length > 1 && normalized.endsWith(separator)) normalized = normalized.slice(0, -1);
  return windows ? normalized.toLocaleLowerCase() : normalized;
}

export function remoteFileIsInsideWorkdir(profile, path) {
  const workdir = comparableRemotePath(profile, profile?.workdir);
  const candidate = comparableRemotePath(profile, path);
  if (!workdir || !candidate) return false;
  const separator = isWindowsProfile(profile) ? "\\" : "/";
  return candidate === workdir || candidate.startsWith(`${workdir}${separator}`);
}

export function buildRemoteFileDeleteCommand(profile, path) {
  const remotePath = String(path || "").trim();
  if (!remotePath || !remoteFileIsInsideWorkdir(profile, remotePath)) {
    throw new Error("只能删除当前工作目录内的文件。");
  }

  if (isWindowsProfile(profile)) {
    return powershellCommand(`
$AIWB_PATH = ${psQuote(remotePath)}
if (-not (Test-Path -LiteralPath $AIWB_PATH -PathType Leaf)) { throw "文件不存在或不是普通文件：$AIWB_PATH" }
Remove-Item -LiteralPath $AIWB_PATH -Force
Write-Output "__AIWB_DELETE_OK__$AIWB_PATH"
`);
  }

  return remoteBashCommand(profile, `
AIWB_PATH=${shQuote(remotePath)}
if [ ! -f "$AIWB_PATH" ]; then
  printf '文件不存在或不是普通文件：%s\\n' "$AIWB_PATH" >&2
  exit 2
fi
rm -- "$AIWB_PATH"
printf '__AIWB_DELETE_OK__%s\\n' "$AIWB_PATH"
`);
}

export function buildRemoteDirectoryListCommand(profile, remotePath = profile?.workdir) {
  const path = String(remotePath || profile?.workdir || "").trim();
  if (!path || !remoteFileIsInsideWorkdir(profile, path)) {
    throw new Error("只能查看当前工作目录内的文件夹。");
  }

  if (isWindowsProfile(profile)) {
    return powershellCommand(`
$AIWB_PATH = ${psQuote(path)}
if (-not (Test-Path -LiteralPath $AIWB_PATH -PathType Container)) { throw "文件夹不存在：$AIWB_PATH" }
Write-Output "__AIWB_DIRECTORY_START__"
Write-Output "__AIWB_DIRECTORY_PATH__$AIWB_PATH"
$AIWB_ITEMS = @(Get-ChildItem -LiteralPath $AIWB_PATH -Force -ErrorAction Stop | Sort-Object @{Expression={$_.PSIsContainer};Descending=$true}, Name | Select-Object -First 300)
foreach ($AIWB_ITEM in $AIWB_ITEMS) {
  $AIWB_KIND = if ($AIWB_ITEM.PSIsContainer) { "directory" } else { "file" }
  $AIWB_SIZE = if ($AIWB_ITEM.PSIsContainer) { 0 } else { [int64]$AIWB_ITEM.Length }
  $AIWB_JSON = [ordered]@{
    kind = $AIWB_KIND
    name = [string]$AIWB_ITEM.Name
    path = [string]$AIWB_ITEM.FullName
    size = $AIWB_SIZE
    modifiedAt = $AIWB_ITEM.LastWriteTimeUtc.ToString("o")
  } | ConvertTo-Json -Compress
  $AIWB_B64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($AIWB_JSON))
  Write-Output "__AIWB_DIRECTORY_ITEM__$AIWB_B64"
}
Write-Output "__AIWB_DIRECTORY_END__"
`);
  }

  return remoteBashCommand(profile, `
AIWB_PATH=${shQuote(path)}
if [ ! -d "$AIWB_PATH" ]; then
  printf '文件夹不存在：%s\\n' "$AIWB_PATH" >&2
  exit 2
fi
printf '__AIWB_DIRECTORY_START__\\n'
printf '__AIWB_DIRECTORY_PATH__%s\\n' "$AIWB_PATH"
find "$AIWB_PATH" -mindepth 1 -maxdepth 1 -print0 2>/dev/null | while IFS= read -r -d '' AIWB_ITEM; do
  if [ -d "$AIWB_ITEM" ]; then AIWB_KIND=directory; else AIWB_KIND=file; fi
  AIWB_NAME=$(basename "$AIWB_ITEM")
  AIWB_NAME_B64=$(printf '%s' "$AIWB_NAME" | base64 | tr -d '\\n')
  AIWB_PATH_B64=$(printf '%s' "$AIWB_ITEM" | base64 | tr -d '\\n')
  printf '__AIWB_DIRECTORY_ITEM__%s\\t%s\\t%s\\n' "$AIWB_KIND" "$AIWB_NAME_B64" "$AIWB_PATH_B64"
done | sort -t "$(printf '\\t')" -k1,1 -k2,2 | head -n 300
printf '__AIWB_DIRECTORY_END__\\n'
`);
}

function decodeRemoteBase64Utf8(value) {
  if (!value || typeof window === "undefined" || !window.atob) return "";
  try {
    const binary = window.atob(String(value).replace(/\s+/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return "";
  }
}

export function parseRemoteDirectoryPayload(output) {
  // Windows OpenSSH commonly returns CRLF. Normalize before the line-based
  // marker parser so the trailing carriage return cannot hide every entry.
  const text = String(output || "").replace(/\r\n?/g, "\n");
  if (!text.includes("__AIWB_DIRECTORY_START__")) {
    throw new Error(trimVisibleText(text) || "没有读取到远程文件夹内容。");
  }
  const directoryPath = text.match(/__AIWB_DIRECTORY_PATH__(.*)/)?.[1]?.trim() || "";
  const entries = [];
  const windowsItemPattern = /^__AIWB_DIRECTORY_ITEM__([A-Za-z0-9+/=]+)$/gm;
  let windowsMatch;
  while ((windowsMatch = windowsItemPattern.exec(text))) {
    const json = decodeRemoteBase64Utf8(windowsMatch[1]);
    if (!json) continue;
    try {
      const item = JSON.parse(json);
      if (item?.kind && item?.name && item?.path) {
        entries.push({
          kind: item.kind === "directory" ? "directory" : "file",
          name: String(item.name),
          path: String(item.path),
          size: Number(item.size || 0) || 0,
          modifiedAt: String(item.modifiedAt || ""),
        });
      }
    } catch {
      // Ignore malformed entries and keep the rest of the directory usable.
    }
  }
  const itemPattern = /^__AIWB_DIRECTORY_ITEM__(directory|file)\t([^\t\r\n]*)\t([^\t\r\n]*)$/gm;
  let match;
  while ((match = itemPattern.exec(text))) {
    const name = decodeRemoteBase64Utf8(match[2]);
    const path = decodeRemoteBase64Utf8(match[3]);
    if (!name || !path) continue;
    entries.push({ kind: match[1], name, path });
  }
  entries.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  });
  return { path: directoryPath, entries };
}

export function extractRemoteFileReferences(text, profile = defaultProfile) {
  const source = String(text || "");
  if (!source) return [];

  const pattern = new RegExp(
    `(["'\`])([^"'\`\\n]+\\.(${previewFileExtensionPattern}))\\1|((?:[A-Za-z]:[\\\\/]|/|\\.\\.?[\\\\/]|[\\w.-]+[\\\\/])[^\\s'"<>{}\\[\\]，。；;]+\\.(${previewFileExtensionPattern}))|\\b([\\w@.+-]+\\.(${previewFileExtensionPattern}))\\b`,
    "gi",
  );
  const seen = new Set();
  const files = [];
  let match;

  while ((match = pattern.exec(source))) {
    const raw = stripFileCandidate(match[2] || match[4] || match[6] || "");
    const extension = remoteFileExtension(raw);
    if (isUrlLikeFileCandidate(raw, source, match.index)) continue;
    if (!raw || !previewFileExtensions.includes(extension)) continue;

    const path = joinRemotePath(profile, raw);
    const key = path.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const kind = previewKindFromExtension(extension);
    files.push({
      path,
      name: remoteBasename(path),
      extension,
      kind,
      label: previewLabelFromKind(kind),
    });
    if (files.length >= 6) break;
  }

  return files;
}

export function buildRemoteFileReadCommand(profile, remotePath, options = {}) {
  const path = String(remotePath || "").trim();
  const extension = remoteFileExtension(path);
  const fallbackMime = previewMimeFromExtension(extension);
  const maxBytes = Math.max(1, Number(options.maxBytes || maxPreviewFileBytes) || maxPreviewFileBytes);
  const maxLabel = maxBytes >= 1024 * 1024 ? `${Math.round(maxBytes / 1024 / 1024)}MB` : `${maxBytes} bytes`;
  const workdir = String(profile?.workdir || "").trim();

  if (isWindowsProfile(profile)) {
    return powershellCommand(`
$AIWB_PATH = ${psQuote(path)}
$AIWB_WORKDIR = ${psQuote(workdir)}
$AIWB_LIMIT = ${maxBytes}
if (-not (Test-Path -LiteralPath $AIWB_PATH -PathType Leaf)) {
  $AIWB_NAME = [System.IO.Path]::GetFileName($AIWB_PATH)
  if ($AIWB_NAME -and $AIWB_WORKDIR -and (Test-Path -LiteralPath $AIWB_WORKDIR -PathType Container)) {
    $AIWB_MATCHES = @(Get-ChildItem -LiteralPath $AIWB_WORKDIR -Recurse -File -Filter $AIWB_NAME -ErrorAction SilentlyContinue | Select-Object -First 2)
    if ($AIWB_MATCHES.Count -eq 1) {
      $AIWB_PATH = $AIWB_MATCHES[0].FullName
    } elseif ($AIWB_MATCHES.Count -gt 1) {
      throw "找到多个同名文件：$AIWB_NAME，请让 AI 给出完整路径。"
    }
  }
}
if (-not (Test-Path -LiteralPath $AIWB_PATH -PathType Leaf)) {
  throw "文件不存在：$AIWB_PATH"
}
$AIWB_FILE = Get-Item -LiteralPath $AIWB_PATH
if ($AIWB_FILE.Length -gt $AIWB_LIMIT) {
  throw "文件太大，当前最多支持读取 ${maxLabel}：$($AIWB_FILE.Length) bytes"
}
$AIWB_BYTES = [System.IO.File]::ReadAllBytes($AIWB_PATH)
$AIWB_BASE64 = [Convert]::ToBase64String($AIWB_BYTES)
Write-Output "__AIWB_FILE_START__"
Write-Output "__AIWB_FILE_NAME__$([System.IO.Path]::GetFileName($AIWB_PATH))"
Write-Output "__AIWB_FILE_PATH__$AIWB_PATH"
Write-Output "__AIWB_FILE_MIME__${fallbackMime}"
Write-Output "__AIWB_FILE_SIZE__$($AIWB_FILE.Length)"
Write-Output "__AIWB_FILE_DATA__"
Write-Output $AIWB_BASE64
Write-Output "__AIWB_FILE_END__"
`);
  }

  return remoteBashCommand(profile, `
AIWB_PATH=${shQuote(path)}
AIWB_WORKDIR=${shQuote(workdir)}
AIWB_LIMIT=${maxBytes}
if [ ! -f "$AIWB_PATH" ]; then
  AIWB_NAME=$(basename "$AIWB_PATH")
  AIWB_FOUND_COUNT=0
  AIWB_FOUND=""
  if [ -n "$AIWB_NAME" ] && [ -n "$AIWB_WORKDIR" ] && [ -d "$AIWB_WORKDIR" ]; then
    AIWB_FOUND=$(find "$AIWB_WORKDIR" -maxdepth 8 -type f -name "$AIWB_NAME" 2>/dev/null | head -n 2)
    AIWB_FOUND_COUNT=$(printf '%s\\n' "$AIWB_FOUND" | sed '/^$/d' | wc -l | tr -d '[:space:]')
    if [ "$AIWB_FOUND_COUNT" = "1" ]; then
      AIWB_PATH=$(printf '%s\\n' "$AIWB_FOUND" | sed -n '1p')
    fi
  fi
  if [ "$AIWB_FOUND_COUNT" -gt 1 ]; then
    printf '找到多个同名文件：%s，请让 AI 给出完整路径。\\n' "$AIWB_NAME" >&2
    printf '%s\\n' "$AIWB_FOUND" >&2
    exit 4
  fi
fi
if [ ! -f "$AIWB_PATH" ]; then
  printf '文件不存在：%s\\n' "$AIWB_PATH" >&2
  exit 2
fi
AIWB_SIZE=$(wc -c < "$AIWB_PATH" | tr -d '[:space:]')
if [ "$AIWB_SIZE" -gt "$AIWB_LIMIT" ]; then
  printf '文件太大，当前最多支持读取 ${maxLabel}：%s bytes\\n' "$AIWB_SIZE" >&2
  exit 3
fi
AIWB_MIME=$(file -b --mime-type "$AIWB_PATH" 2>/dev/null || printf '%s' ${shQuote(fallbackMime)})
printf '__AIWB_FILE_START__\\n'
printf '__AIWB_FILE_NAME__%s\\n' "$(basename "$AIWB_PATH")"
printf '__AIWB_FILE_PATH__%s\\n' "$AIWB_PATH"
printf '__AIWB_FILE_MIME__%s\\n' "$AIWB_MIME"
printf '__AIWB_FILE_SIZE__%s\\n' "$AIWB_SIZE"
printf '__AIWB_FILE_DATA__\\n'
base64 < "$AIWB_PATH" | tr -d '\\n'
printf '\\n__AIWB_FILE_END__\\n'
`);
}

export function parseRemoteFilePayload(output) {
  const text = String(output || "");
  if (!text.includes("__AIWB_FILE_START__")) {
    throw new Error(trimVisibleText(text) || "没有读取到文件内容。");
  }

  const readMarker = (marker) => text.match(new RegExp(`__AIWB_FILE_${marker}__(.*)`))?.[1]?.trim() || "";
  const rawData = text.match(/__AIWB_FILE_DATA__\s*([\s\S]*?)\s*__AIWB_FILE_END__/)?.[1] || "";
  let data = "";
  try {
    data = Foundation.normalizeBase64Payload(rawData, "文件内容");
  } catch {
    throw new Error("文件内容传输不完整，无法预览或下载，请重新尝试。");
  }
  if (!data) throw new Error("文件内容为空或读取失败。");

  const path = readMarker("PATH");
  const size = Number(readMarker("SIZE") || 0) || 0;
  const expectedBase64Length = size > 0 ? Math.ceil(size / 3) * 4 : 0;
  if (expectedBase64Length && data.length !== expectedBase64Length) {
    throw new Error("文件内容传输不完整，无法预览或下载，请重新尝试。");
  }
  const extension = remoteFileExtension(path || readMarker("NAME"));
  return {
    name: readMarker("NAME") || remoteBasename(path),
    path,
    mime: readMarker("MIME") || previewMimeFromExtension(extension),
    size,
    base64: data,
    extension,
    kind: previewKindFromExtension(extension),
  };
}
