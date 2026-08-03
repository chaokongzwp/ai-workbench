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
    if (!["https:", "http:"].includes(url.protocol)) return "";
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
  const insecure = endpoint.startsWith("http:");
  return {
    endpoint,
    accessToken,
    insecure,
    enabled: Boolean(endpoint && accessToken && (!insecure || profile?.agentDirectAllowInsecure === true)),
  };
}

export function agentDirectEventUrl(profile = {}) {
  const { endpoint, enabled } = agentDirectConfig(profile);
  if (!enabled) return "";
  const url = new URL(`${endpoint}/v1/events`);
  url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
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
    command: command && typeof command === "object" ? command : undefined,
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

export async function agentDirectRequest(profile, path, { method = "GET", body, timeoutMs = 12_000, fetchImpl = globalThis.fetch } = {}) {
  const { endpoint, accessToken, enabled } = agentDirectConfig(profile);
  if (!enabled) {
    throw new AgentDirectRequestError("Agent 直连尚未配置。", { code: "agent_direct_not_configured" });
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

export function createAgentDirectEventStream(profile, { onEvent, onOpen, onClose, onError, WebSocketImpl = globalThis.WebSocket } = {}) {
  const { accessToken, enabled } = agentDirectConfig(profile);
  const eventUrl = agentDirectEventUrl(profile);
  if (!enabled || typeof WebSocketImpl !== "function") return null;

  const socket = new WebSocketImpl(eventUrl, ["aiwb.v1", `bearer.${accessToken}`]);
  socket.addEventListener?.("open", () => onOpen?.());
  socket.addEventListener?.("close", (event) => onClose?.(event));
  socket.addEventListener?.("error", (event) => onError?.(event));
  socket.addEventListener?.("message", (event) => {
    const payload = jsonOrNull(typeof event.data === "string" ? event.data : "");
    if (payload && typeof payload === "object") onEvent?.(payload);
  });
  return socket;
}
