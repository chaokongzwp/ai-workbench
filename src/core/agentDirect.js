import { SSHWorkbench, desktopBridge } from "./foundation.js";

const terminalOutcomes = new Set(["success", "error", "cancelled", "rejected"]);
const activeStatuses = new Set(["queued", "accepted", "preparing", "running"]);

function text(value) {
  return String(value || "").trim();
}

function jsonOrNull(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function normalizeAgentDirectEndpoint(value) {
  const candidate = text(value);
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:") return "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function agentDirectConfig(profile = {}) {
  const endpoint = normalizeAgentDirectEndpoint(profile?.agentDirectEndpoint);
  const accessToken = text(profile?.agentDirectAccessToken);
  const tlsFingerprint = text(profile?.agentDirectTlsFingerprint);
  return {
    endpoint,
    accessToken,
    insecure: false,
    tlsFingerprint,
    enabled: Boolean(endpoint && accessToken && tlsFingerprint),
  };
}

export function agentDirectEventUrl(profile = {}) {
  const { endpoint, enabled } = agentDirectConfig(profile);
  if (!enabled) return "";
  const url = new URL(endpoint);
  url.protocol = "wss:";
  url.pathname = "/v1/events";
  return url.toString();
}

export function agentDirectTaskLifecycle(task = {}) {
  const rawStatus = text(task.status || task.taskStatus).toLowerCase();
  const rawOutcome = text(task.outcome).toLowerCase();
  const cancelled = rawStatus === "cancelled" || rawOutcome === "cancelled";
  const rejected = rawStatus === "rejected" || rawOutcome === "rejected" || rawStatus === "busy";
  const failed = rawStatus === "error" || rawOutcome === "error" || rawStatus === "missing";
  const successful = rawStatus === "done" || rawOutcome === "success" || rawStatus === "completed" && rawOutcome === "success";

  if (cancelled) return { status: "completed", outcome: "cancelled" };
  if (rejected) return { status: "completed", outcome: "rejected" };
  if (failed) return { status: "completed", outcome: "error" };
  if (successful) return { status: "completed", outcome: "success" };
  if (activeStatuses.has(rawStatus) || !rawStatus) return { status: "running", outcome: "" };
  return terminalOutcomes.has(rawOutcome)
    ? { status: "completed", outcome: rawOutcome }
    : { status: "running", outcome: "" };
}

export function agentDirectTaskNeedsSync(task = {}) {
  return agentDirectTaskLifecycle(task).status !== "completed";
}

export function agentDirectTaskStatusSnapshot(task = {}) {
  const outcome = text(task.outcome).toLowerCase();
  const rawStatus = text(task.rawStatus).toLowerCase();
  const taskStatus =
    rawStatus ||
    (outcome === "success" ? "done" : outcome === "cancelled" ? "cancelled" : outcome === "error" ? "error" : "running");
  const output = String(task.output || "");
  return {
    taskStatus,
    output,
    raw: output,
    eventFingerprint: JSON.stringify([
      taskStatus,
      task.startedAt || "",
      task.finishedAt || "",
      Number(task.activityBytes || 0),
      task.activityUpdatedAt || "",
      output.length,
    ]),
    pid: "",
    startedAt: text(task.startedAt),
    runnerStartedAt: text(task.runnerStartedAt),
    finishedAt: text(task.finishedAt),
    exitCode: text(task.exitCode),
    executionSummary: text(task.executionSummary),
  };
}

export function agentDirectTaskRequest({
  taskId,
  conversationId,
  turnId,
  agentId,
  model,
  workdir,
  prompt,
  requestMessageId,
  responseMessageId,
  command,
  name,
} = {}) {
  return {
    taskId: text(taskId),
    conversationId: text(conversationId),
    turnId: text(turnId),
    agentId: text(agentId),
    model: text(model),
    workdir: text(workdir),
    prompt: text(prompt),
    requestMessageId: text(requestMessageId),
    responseMessageId: text(responseMessageId),
    command: typeof command === "string" || (command && typeof command === "object") ? command : undefined,
    name: text(name),
  };
}

export class AgentDirectRequestError extends Error {
  constructor(message, { status = 0, code = "agent_direct_request_failed", body = null } = {}) {
    super(message);
    this.name = "AgentDirectRequestError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

function base64Bytes(value) {
  const compact = String(value || "").replace(/\s+/g, "");
  const binary = globalThis.atob(compact);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function base64UrlUtf8(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseAgentUploadResponse(response) {
  const raw = String(response?.body || "");
  const parsed = jsonOrNull(raw);
  const status = Number(response?.status || 0);
  if (status < 200 || status >= 300) {
    throw new AgentDirectRequestError(
      text(parsed?.error?.message || parsed?.message || raw) || `附件上传失败（${status || "未知状态"}）。`,
      { status, code: text(parsed?.error?.code) || "agent_upload_http_error", body: parsed },
    );
  }
  if (!parsed?.file?.path) {
    throw new AgentDirectRequestError("Agent 没有返回附件路径。", { code: "agent_upload_invalid_response" });
  }
  return parsed.file;
}

export function agentUploadAttachmentReady(attachment) {
  return Boolean(text(attachment?.nativeAttachmentId) || String(attachment?.base64 || "").replace(/\s+/g, ""));
}

export async function agentDirectUpload(profile, attachment, {
  uploadId,
  workdir,
  timeoutMs = 240_000,
  fetchImpl = globalThis.fetch,
} = {}) {
  const { endpoint, accessToken, enabled, tlsFingerprint } = agentDirectConfig(profile);
  if (!enabled) throw new AgentDirectRequestError("Agent 安全上传尚未配置。", { code: "agent_direct_not_configured" });
  const payload = {
    endpoint,
    accessToken,
    tlsFingerprint,
    allowInsecure: false,
    path: "/v1/files",
    uploadId: text(uploadId),
    workdir: text(workdir),
    name: text(attachment?.name) || "attachment.bin",
    mime: text(attachment?.mime) || "application/octet-stream",
    size: Number(attachment?.size || 0),
    nativeAttachmentId: text(attachment?.nativeAttachmentId),
    base64: String(attachment?.base64 || ""),
    timeoutMs,
  };
  if (!payload.uploadId || !payload.workdir || (!payload.nativeAttachmentId && !payload.base64)) {
    throw new AgentDirectRequestError("附件上传参数不完整。", { code: "agent_upload_invalid" });
  }
  const nativePlatform = typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.() === true;
  const nativeUpload = desktopBridge()?.agentUpload || (nativePlatform ? SSHWorkbench?.agentUpload : null);
  if (typeof nativeUpload === "function") {
    try {
      return parseAgentUploadResponse(await nativeUpload(payload));
    } catch (error) {
      if (error instanceof AgentDirectRequestError) throw error;
      throw new AgentDirectRequestError(text(error?.message) || "无法上传附件到 Agent。", { code: "agent_upload_network_error" });
    }
  }
  if (typeof fetchImpl !== "function") {
    throw new AgentDirectRequestError("当前平台不支持 Agent 附件上传。", { code: "agent_direct_fetch_unavailable" });
  }
  if (payload.nativeAttachmentId && !payload.base64) {
    throw new AgentDirectRequestError("原生附件只能由 iPhone 或 iPad App 上传。", { code: "agent_upload_native_only" });
  }
  const bytes = base64Bytes(payload.base64);
  const expectedSha256 = await sha256Hex(bytes);
  const controller = typeof AbortController === "undefined" ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), Math.max(1_000, Number(timeoutMs) || 240_000)) : null;
  try {
    const response = await fetchImpl(new URL("/v1/files", `${endpoint}/`), {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/octet-stream",
        "X-AIWB-Upload-Id": payload.uploadId,
        "X-AIWB-Workdir": base64UrlUtf8(payload.workdir),
        "X-AIWB-File-Name": base64UrlUtf8(payload.name),
        "X-AIWB-File-Mime": payload.mime,
        "X-AIWB-Content-SHA256": expectedSha256,
      },
      body: bytes,
      signal: controller?.signal,
    });
    return parseAgentUploadResponse({ status: response.status, body: await response.text() });
  } catch (error) {
    if (error instanceof AgentDirectRequestError) throw error;
    throw new AgentDirectRequestError(error?.name === "AbortError" ? "附件上传超时。" : "无法连接 Agent 上传附件。", {
      code: error?.name === "AbortError" ? "agent_upload_timeout" : "agent_upload_network_error",
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function cancelAgentDirectUpload(uploadId) {
  const nativePlatform = typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.() === true;
  const cancel = desktopBridge()?.cancelAgentUpload || (nativePlatform ? SSHWorkbench?.cancelAgentUpload : null);
  return typeof cancel === "function"
    ? cancel({ uploadId: text(uploadId) })
    : { ok: true, cancelled: false, active: false, uploadId: text(uploadId) };
}

// The native bridge (Electron `agentRequest`, iOS `SSHWorkbench.agentRequest`)
// is trusted to honor `timeoutMs`, but a dropped iOS URLSession completion can
// orphan the promise and hang the send forever. The browser fetch branch already
// aborts on a client deadline; give the native branch the same guarantee so a
// stuck request always settles and the sender can hand off to the status sweep.
export async function raceAgentDirectTimeout(promise, timeoutMs) {
  const limitMs = Math.max(1_000, Number(timeoutMs) || 12_000);
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new AgentDirectRequestError("连接 Agent 超时。", { code: "agent_direct_timeout" })),
          limitMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function agentDirectRequest(profile, path, { method = "GET", body, timeoutMs = 12_000, fetchImpl = globalThis.fetch } = {}) {
  const { endpoint, accessToken, enabled, tlsFingerprint } = agentDirectConfig(profile);
  if (!enabled) {
    throw new AgentDirectRequestError("Agent 直连尚未配置。", { code: "agent_direct_not_configured" });
  }
  const nativePlatform = typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.() === true;
  const nativeRequest = desktopBridge()?.agentRequest || (nativePlatform ? SSHWorkbench?.agentRequest : null);
  if (typeof nativeRequest === "function") {
    try {
      const response = await raceAgentDirectTimeout(
        nativeRequest({
          endpoint,
          accessToken,
          tlsFingerprint,
          allowInsecure: false,
          path,
          method,
          body,
          timeoutMs,
        }),
        timeoutMs,
      );
      const raw = String(response?.body || "");
      const parsed = jsonOrNull(raw);
      const status = Number(response?.status || 0);
      if (status < 200 || status >= 300) {
        throw new AgentDirectRequestError(
          text(parsed?.error?.message || parsed?.message || raw) || `Agent 请求失败（${status || "未知状态"}）。`,
          { status, code: text(parsed?.error?.code) || "agent_direct_http_error", body: parsed },
        );
      }
      return parsed ?? {};
    } catch (error) {
      if (error instanceof AgentDirectRequestError) throw error;
      throw new AgentDirectRequestError(text(error?.message) || "无法建立安全的 Agent 连接。", { code: "agent_direct_network_error" });
    }
  }
  if (typeof fetchImpl !== "function") {
    throw new AgentDirectRequestError("当前平台不支持 Agent 直连请求。", { code: "agent_direct_fetch_unavailable" });
  }

  const url = new URL(String(path || ""), `${endpoint}/`);
  const controller = typeof AbortController === "undefined" ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), Math.max(1_000, Number(timeoutMs) || 12_000)) : null;
  try {
    const response = await fetchImpl(url, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller?.signal,
    });
    const raw = await response.text();
    const parsed = jsonOrNull(raw);
    if (!response.ok) {
      throw new AgentDirectRequestError(
        text(parsed?.error?.message || parsed?.message || raw) || `Agent 请求失败（${response.status}）。`,
        { status: response.status, code: text(parsed?.error?.code) || "agent_direct_http_error", body: parsed },
      );
    }
    return parsed ?? {};
  } catch (error) {
    if (error instanceof AgentDirectRequestError) throw error;
    const aborted = error?.name === "AbortError";
    throw new AgentDirectRequestError(
      aborted ? "连接 Agent 超时。" : "无法连接 Agent 直连服务。",
      { code: aborted ? "agent_direct_timeout" : "agent_direct_network_error" },
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createAgentDirectEventStream(profile, { onEvent, onOpen, onClose, onError } = {}) {
  const { endpoint, accessToken, tlsFingerprint, enabled } = agentDirectConfig(profile);
  if (!enabled) return null;

  const streamId = globalThis.crypto?.randomUUID?.() || `agent-events-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const payload = { streamId, endpoint, accessToken, tlsFingerprint };
  const bridge = desktopBridge();
  let disposed = false;
  let opened = false;
  let terminalNotified = false;
  let removeListener = null;
  let nativeListener = null;
  const pendingRequests = new Map();

  const rejectPending = (error) => {
    for (const pending of pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    pendingRequests.clear();
  };

  const notifyTerminal = (event, isError = false) => {
    if (disposed || terminalNotified) return;
    terminalNotified = true;
    opened = false;
    rejectPending(new AgentDirectRequestError(
      text(event?.error) || "Agent WebSocket 已断开。",
      { code: isError ? "agent_event_error" : "agent_event_closed" },
    ));
    if (isError) onError?.(event);
    onClose?.(event);
  };
  const handle = (message = {}) => {
    if (disposed || String(message.streamId || "") !== streamId) return;
    if (message.state === "open") {
      opened = true;
      onOpen?.();
    }
    else if (message.state === "event" && message.event && typeof message.event === "object") {
      const event = message.event;
      const requestId = text(event.requestId);
      const pending = requestId ? pendingRequests.get(requestId) : null;
      if (pending && (event.type === "task.accepted" || event.type === "command.error")) {
        pendingRequests.delete(requestId);
        clearTimeout(pending.timer);
        if (event.type === "task.accepted") pending.resolve(event);
        else pending.reject(new AgentDirectRequestError(
          text(event.error?.message) || "Agent WebSocket 命令失败。",
          { code: text(event.error?.code) || "agent_event_command_error", body: event },
        ));
        return;
      }
      onEvent?.(event);
    }
    else if (message.state === "error") notifyTerminal(message, true);
    else if (message.state === "closed") notifyTerminal(message, false);
  };

  const ready = (async () => {
    try {
      if (bridge?.startAgentEventStream && bridge?.onAgentEvent) {
        removeListener = bridge.onAgentEvent(handle);
        await bridge.startAgentEventStream(payload);
        return true;
      }
      nativeListener = await SSHWorkbench.addListener("agentEvent", handle);
      await SSHWorkbench.startAgentEventStream(payload);
      return true;
    } catch (error) {
      notifyTerminal(error, true);
      return false;
    }
  })();

  return {
    streamId,
    ready,
    isOpen() {
      return opened && !disposed && !terminalNotified;
    },
    request(command, { timeoutMs = 5_000 } = {}) {
      if (!opened || disposed || terminalNotified) {
        return Promise.reject(new AgentDirectRequestError("Agent WebSocket 当前不可用。", { code: "agent_event_not_open" }));
      }
      const requestId = globalThis.crypto?.randomUUID?.() || `agent-command-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      return new Promise((resolvePromise, reject) => {
        const timer = setTimeout(() => {
          pendingRequests.delete(requestId);
          reject(new AgentDirectRequestError("Agent WebSocket 确认超时。", { code: "agent_event_ack_timeout" }));
        }, Math.max(1_000, Math.min(Number(timeoutMs) || 5_000, 30_000)));
        pendingRequests.set(requestId, { resolve: resolvePromise, reject, timer });
        const sendPayload = { streamId, message: { ...command, requestId } };
        Promise.resolve().then(() => bridge?.sendAgentEventStream
          ? bridge.sendAgentEventStream(sendPayload)
          : SSHWorkbench.sendAgentEventStream(sendPayload)).catch((error) => {
          const pending = pendingRequests.get(requestId);
          if (!pending) return;
          pendingRequests.delete(requestId);
          clearTimeout(timer);
          reject(new AgentDirectRequestError(
            text(error?.message) || "Agent WebSocket 消息发送失败。",
            { code: "agent_event_send_failed" },
          ));
        });
      });
    },
    close() {
      if (disposed) return;
      disposed = true;
      opened = false;
      rejectPending(new AgentDirectRequestError("Agent WebSocket 已关闭。", { code: "agent_event_closed" }));
      removeListener?.();
      nativeListener?.remove?.();
      if (bridge?.stopAgentEventStream) bridge.stopAgentEventStream({ streamId }).catch?.(() => {});
      else SSHWorkbench.stopAgentEventStream({ streamId }).catch(() => {});
    },
  };
}
