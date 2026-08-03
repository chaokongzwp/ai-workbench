#!/usr/bin/env node
// AI Workbench Agent direct transport. It deliberately delegates task lifecycle
// ownership to the existing Agent CLI so HTTP and SSH observe the same tasks.
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const agentHome = process.env.AIWB_AGENT_HOME || join(homedir(), ".ai-workbench", "agent");
const configPath = process.env.AIWB_AGENT_HTTP_CONFIG || join(agentHome, "http.json");
const taskRoot = join(agentHome, "tasks");
const maxBodyBytes = 512 * 1024;
const pollingIntervalMs = 700;

function text(value) {
  return String(value ?? "").trim();
}

function safeId(value, label) {
  const candidate = text(value);
  if (!/^[A-Za-z0-9_.:-]{1,180}$/.test(candidate)) throw new Error(`${label} 格式无效。`);
  return candidate;
}

function readText(path) {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return "";
  }
}

function taskPath(taskId) {
  return join(taskRoot, safeId(taskId, "任务 ID"));
}

function taskOutcome(status) {
  if (status === "done") return "success";
  if (status === "cancelled") return "cancelled";
  if (["error", "missing"].includes(status)) return "error";
  return "";
}

function toTaskDto(taskId) {
  const directory = taskPath(taskId);
  if (!existsSync(directory)) return { id: taskId, status: "missing", outcome: "error", terminal: true };
  const rawStatus = readText(join(directory, "status")) || "unknown";
  const outcome = taskOutcome(rawStatus);
  return {
    id: taskId,
    status: outcome ? "completed" : "running",
    outcome,
    rawStatus,
    conversationId: readText(join(directory, "conversation_id")),
    turnId: readText(join(directory, "turn_id")),
    agentId: readText(join(directory, "agent_id")),
    model: readText(join(directory, "model")),
    workdir: readText(join(directory, "workdir")),
    startedAt: readText(join(directory, "started_at")),
    runnerStartedAt: readText(join(directory, "runner_started_at")),
    finishedAt: readText(join(directory, "finished_at")),
    exitCode: readText(join(directory, "exit_code")),
    output: readText(join(directory, "output.log")),
    terminal: Boolean(outcome),
  };
}

function taskIds() {
  try {
    return readdirSync(taskRoot).filter((item) => {
      try {
        return statSync(join(taskRoot, item)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

function latestConversationTask(conversationId) {
  const candidate = safeId(conversationId, "会话 ID");
  const matching = taskIds()
    .map((id) => toTaskDto(id))
    .filter((task) => task.conversationId === candidate)
    .sort((left, right) => {
      const leftTime = Date.parse(left.finishedAt || left.startedAt || 0) || 0;
      const rightTime = Date.parse(right.finishedAt || right.startedAt || 0) || 0;
      return rightTime - leftTime || right.id.localeCompare(left.id);
    });
  return matching[0] || null;
}

function loadConfig() {
  let raw = {};
  try {
    raw = JSON.parse(readFileSync(configPath, "utf8"));
  } catch {}
  const token = text(raw.accessToken) || randomBytes(32).toString("base64url");
  const next = {
    listenHost: text(raw.listenHost) || "127.0.0.1",
    port: Math.max(1, Math.min(65535, Number(raw.port) || 8787)),
    accessToken: token,
    tls: raw.tls && typeof raw.tls === "object" ? { certPath: text(raw.tls.certPath), keyPath: text(raw.tls.keyPath) } : null,
  };
  mkdirSync(dirname(configPath), { recursive: true });
  if (!raw.accessToken) writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  return next;
}

function authorize(request, config) {
  const header = text(request.headers.authorization);
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || token.length !== config.accessToken.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(config.accessToken));
}

function json(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) throw new Error("请求内容过大。");
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("请求不是有效 JSON。");
  }
}

function controlInvocation(args) {
  if (platform() === "win32") return { command: process.execPath, args: [join(agentHome, "aiwb-agent.mjs"), ...args] };
  return { command: join(agentHome, "aiwbctl"), args };
}

function invokeControl(args) {
  const invocation = controlInvocation(args);
  return new Promise((resolvePromise, reject) => {
    const child = spawn(invocation.command, invocation.args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code: Number(code || 0), stdout, stderr }));
  });
}

function prepareTask(payload) {
  const taskId = safeId(payload.taskId, "任务 ID");
  const command = payload.command && typeof payload.command === "object" ? payload.command : null;
  if (!command || !text(command.script) || !["bash", "powershell"].includes(text(command.kind))) {
    throw new Error("任务命令缺失或格式无效。\n");
  }
  const directory = taskPath(taskId);
  mkdirSync(directory, { recursive: true });
  const files = {
    "command.b64": Buffer.from(JSON.stringify(command), "utf8").toString("base64"),
    "conversation_id": safeId(payload.conversationId, "会话 ID"),
    name: text(payload.name),
    workdir: text(payload.workdir),
    agent_id: text(payload.agentId),
    model: text(payload.model),
    turn_id: text(payload.turnId),
    request_message_id: text(payload.requestMessageId),
    response_message_id: text(payload.responseMessageId),
    "prompt.txt": text(payload.prompt),
  };
  for (const [name, value] of Object.entries(files)) writeFileSync(join(directory, name), `${value}\n`, "utf8");
  return taskId;
}

function wsFrame(payload) {
  const body = Buffer.from(JSON.stringify(payload));
  if (body.length >= 65_536) return null;
  const header = body.length < 126 ? Buffer.from([0x81, body.length]) : Buffer.from([0x81, 126, body.length >> 8, body.length & 255]);
  return Buffer.concat([header, body]);
}

function websocketAuthorized(request, config) {
  const protocols = text(request.headers["sec-websocket-protocol"]).split(",").map((value) => value.trim());
  const token = protocols.find((value) => value.startsWith("bearer."))?.slice("bearer.".length) || "";
  return token.length === config.accessToken.length && timingSafeEqual(Buffer.from(token), Buffer.from(config.accessToken));
}

export function createAgentDirectServer({ config = loadConfig(), control = invokeControl } = {}) {
  const clients = new Set();
  const fingerprints = new Map();
  const handler = async (request, response) => {
    if (request.method === "OPTIONS") return json(response, 204, {});
    if (!authorize(request, config)) return json(response, 401, { error: { code: "unauthorized", message: "Agent access token 无效。" } });
    const url = new URL(request.url || "/", "http://localhost");
    try {
      if (request.method === "GET" && url.pathname === "/v1/health") {
        return json(response, 200, { version: "direct-v1", transport: config.tls ? "https" : "http", agentHome });
      }
      if (request.method === "POST" && url.pathname === "/v1/tasks") {
        const payload = await readJson(request);
        const taskId = prepareTask(payload);
        const result = await control(["create", taskId]);
        const task = toTaskDto(taskId);
        if (result.code !== 0 || task.rawStatus === "missing") {
          return json(response, 502, { error: { code: "task_create_failed", message: text(result.stderr || result.stdout) || "Agent 创建任务失败。" } });
        }
        return json(response, 202, { task });
      }
      const taskMatch = url.pathname.match(/^\/v1\/tasks\/([^/]+)$/);
      if (request.method === "GET" && taskMatch) return json(response, 200, { task: toTaskDto(decodeURIComponent(taskMatch[1])) });
      const cancelMatch = url.pathname.match(/^\/v1\/tasks\/([^/]+)\/cancel$/);
      if (request.method === "POST" && cancelMatch) {
        const taskId = decodeURIComponent(cancelMatch[1]);
        await control(["cancel", taskId]);
        return json(response, 200, { task: toTaskDto(taskId) });
      }
      const conversationMatch = url.pathname.match(/^\/v1\/conversations\/([^/]+)\/latest-task$/);
      if (request.method === "GET" && conversationMatch) {
        return json(response, 200, { task: latestConversationTask(decodeURIComponent(conversationMatch[1])) });
      }
      return json(response, 404, { error: { code: "not_found", message: "Agent API 路径不存在。" } });
    } catch (error) {
      return json(response, 400, { error: { code: "bad_request", message: text(error?.message) || "请求无效。" } });
    }
  };
  const tls = config.tls?.certPath && config.tls?.keyPath;
  const server = tls
    ? createHttpsServer({ cert: readFileSync(resolve(config.tls.certPath)), key: readFileSync(resolve(config.tls.keyPath)) }, handler)
    : createHttpServer(handler);

  server.on("upgrade", (request, socket) => {
    const url = new URL(request.url || "/", "http://localhost");
    if (url.pathname !== "/v1/events" || !websocketAuthorized(request, config)) return socket.destroy();
    const key = text(request.headers["sec-websocket-key"]);
    if (!key) return socket.destroy();
    const accept = createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\nSec-WebSocket-Protocol: aiwb.v1\r\n\r\n`);
    clients.add(socket);
    socket.on("close", () => clients.delete(socket));
    socket.on("error", () => clients.delete(socket));
  });

  const timer = setInterval(() => {
    for (const id of taskIds()) {
      const task = toTaskDto(id);
      const fingerprint = JSON.stringify([task.status, task.outcome, task.rawStatus, task.startedAt, task.finishedAt, task.output.length]);
      if (fingerprints.get(id) === fingerprint) continue;
      fingerprints.set(id, fingerprint);
      const frame = wsFrame({ type: "task.updated", task });
      if (!frame) continue;
      for (const socket of clients) if (!socket.destroyed) socket.write(frame);
    }
  }, pollingIntervalMs);
  server.on("close", () => clearInterval(timer));
  return server;
}

export async function startAgentDirectServer(options = {}) {
  const server = createAgentDirectServer(options);
  const config = options.config || loadConfig();
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.listenHost, () => {
      server.off("error", reject);
      resolvePromise();
    });
  });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  startAgentDirectServer().then((server) => {
    const address = server.address();
    process.stdout.write(`AI Workbench Agent direct API listening on ${typeof address === "object" ? `${address.address}:${address.port}` : address}\n`);
  }).catch((error) => {
    process.stderr.write(`AI Workbench Agent direct API failed: ${error?.stack || error}\n`);
    process.exitCode = 1;
  });
}
