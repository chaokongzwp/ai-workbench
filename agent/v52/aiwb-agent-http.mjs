#!/usr/bin/env node
// AI Workbench Agent direct transport. It deliberately delegates task lifecycle
// ownership to the existing Agent CLI so HTTP and SSH observe the same tasks.
import { createServer as createHttpServer, request as httpRequest } from "node:http";
import { createServer as createHttpsServer, request as httpsRequest } from "node:https";
import { createHash, randomBytes, timingSafeEqual, X509Certificate } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, hostname, platform } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const agentHome = process.env.AIWB_AGENT_HOME || join(homedir(), ".ai-workbench", "agent");
const configPath = process.env.AIWB_AGENT_HTTP_CONFIG || join(agentHome, "http.json");
const taskRoot = join(agentHome, "tasks");
const maxBodyBytes = 512 * 1024;
const pollingIntervalMs = 700;
const controlRegistrationIntervalMs = 60_000;
const directRuntimePath = fileURLToPath(import.meta.url);
const directRuntimePidPath = join(agentHome, "http.pid");

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid < 2) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireRuntimePid() {
  mkdirSync(agentHome, { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = openSync(directRuntimePidPath, "wx", 0o600);
      writeFileSync(descriptor, String(process.pid));
      closeSync(descriptor);
      return true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const owner = Number(readText(directRuntimePidPath));
      if (owner !== process.pid && processAlive(owner)) return false;
      try { unlinkSync(directRuntimePidPath); } catch {}
    }
  }
  return false;
}

function releaseRuntimePid() {
  try {
    if (readText(directRuntimePidPath) === String(process.pid)) unlinkSync(directRuntimePidPath);
  } catch {}
}

function text(value) {
  return String(value ?? "").trim();
}

function requestUrl(url, { method = "GET", headers = {}, body = null, timeoutMs = 12_000 } = {}) {
  return new Promise((resolvePromise, reject) => {
    const endpoint = new URL(url);
    const transport = endpoint.protocol === "https:" ? httpsRequest : httpRequest;
    const request = transport(endpoint, { method, headers }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolvePromise({
        ok: (response.statusCode || 0) >= 200 && (response.statusCode || 0) < 300,
        status: response.statusCode || 0,
        body: Buffer.concat(chunks),
      }));
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error("请求超时")));
    request.once("error", reject);
    if (body) request.write(body);
    request.end();
  });
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

function certificateFingerprint(certPath) {
  try {
    const certificate = new X509Certificate(readFileSync(certPath));
    return `sha256/${createHash("sha256").update(certificate.raw).digest("base64")}`;
  } catch {
    return "";
  }
}

function powerShellLiteral(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function createWindowsCertificate(pfxPath, certPath, passphrase) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$certificate = New-SelfSignedCertificate -Subject 'CN=AI Workbench Agent' -CertStoreLocation 'Cert:\\CurrentUser\\My' -KeyExportPolicy Exportable -NotAfter (Get-Date).AddDays(825)",
    `$password = ConvertTo-SecureString -String ${powerShellLiteral(passphrase)} -Force -AsPlainText`,
    `Export-PfxCertificate -Cert $certificate -FilePath ${powerShellLiteral(pfxPath)} -Password $password -Force | Out-Null`,
    `Export-Certificate -Cert $certificate -FilePath ${powerShellLiteral(certPath)} -Force | Out-Null`,
    "Remove-Item -LiteralPath ('Cert:\\CurrentUser\\My\\' + $certificate.Thumbprint) -Force",
  ].join("\n");
  const result = spawnSync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 30_000,
  });
  return result.status === 0 && existsSync(pfxPath) && existsSync(certPath);
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

export function loadAgentDirectConfig() {
  let raw = {};
  try {
    raw = JSON.parse(readFileSync(configPath, "utf8"));
  } catch {}
  const token = text(raw.accessToken) || randomBytes(32).toString("base64url");
  const certificatesDirectory = join(agentHome, "certificates");
  const defaultKeyPath = join(certificatesDirectory, "agent.key.pem");
  const defaultCertPath = join(certificatesDirectory, "agent.cert.pem");
  const defaultPfxPath = join(certificatesDirectory, "agent.pfx");
  const requestedTls = raw.tls && typeof raw.tls === "object" ? raw.tls : {};
  const certPath = text(requestedTls.certPath) || defaultCertPath;
  const keyPath = text(requestedTls.keyPath) || defaultKeyPath;
  const pfxPath = text(requestedTls.pfxPath) || defaultPfxPath;
  const pfxPassphrase = text(requestedTls.passphrase) || randomBytes(24).toString("base64url");
  let tls = existsSync(certPath) && existsSync(keyPath) ? { certPath, keyPath } : null;
  if (!tls && platform() === "win32" && existsSync(certPath) && existsSync(pfxPath) && text(requestedTls.passphrase)) {
    tls = { certPath, pfxPath, passphrase: text(requestedTls.passphrase) };
  }
  if (!tls) {
    try {
      mkdirSync(certificatesDirectory, { recursive: true, mode: 0o700 });
      if (platform() === "win32" && createWindowsCertificate(pfxPath, certPath, pfxPassphrase)) {
        tls = { certPath, pfxPath, passphrase: pfxPassphrase };
      } else {
        const result = spawnSync(
          "openssl",
          ["req", "-x509", "-newkey", "rsa:2048", "-sha256", "-nodes", "-days", "825", "-subj", "/CN=AI Workbench Agent", "-keyout", keyPath, "-out", certPath],
          { stdio: "ignore" },
        );
        if (result.status === 0 && existsSync(certPath) && existsSync(keyPath)) tls = { certPath, keyPath };
      }
    } catch {}
  }
  if (!tls) throw new Error("Agent HTTPS 无法生成本地证书。");
  const tlsFingerprint = tls ? certificateFingerprint(tls.certPath) : "";
  const next = {
    securityVersion: 1,
    listenHost: text(raw.listenHost) || "127.0.0.1",
    port: Math.max(1, Math.min(65535, Number(raw.port) || 8787)),
    accessToken: token,
    tls: { enabled: true, ...tls, fingerprint: tlsFingerprint },
  };
  mkdirSync(dirname(configPath), { recursive: true });
  if (!raw.accessToken || raw.securityVersion !== 1 || raw.tls?.fingerprint !== tlsFingerprint || "insecureReason" in raw) {
    writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  }
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
  const command = typeof payload.command === "string" ? payload.command : payload.command && typeof payload.command === "object" ? payload.command : null;
  if (!command || (typeof command === "object" && (!text(command.script) || !["bash", "powershell"].includes(text(command.kind))))) {
    throw new Error("任务命令缺失或格式无效。\n");
  }
  const directory = taskPath(taskId);
  mkdirSync(directory, { recursive: true });
  const files = {
    // Linux Agent runners expect a base64 shell command. Windows runners
    // expect a base64 JSON command object, matching the SSH creator exactly.
    "command.b64": Buffer.from(typeof command === "string" ? command : JSON.stringify(command), "utf8").toString("base64"),
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

function equalSecret(left, right) {
  const first = Buffer.from(text(left));
  const second = Buffer.from(text(right));
  return first.length > 0 && first.length === second.length && timingSafeEqual(first, second);
}

function readUpdaterConfig() {
  try {
    const value = JSON.parse(readFileSync(join(agentHome, "updater.json"), "utf8"));
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function controlIdentity() {
  const path = join(agentHome, "agent-control.json");
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    if (/^[A-Za-z0-9._:-]{16,160}$/.test(text(value?.agentId)) && /^[A-Za-z0-9_-]{24,256}$/.test(text(value?.updateToken))) return value;
  } catch {}
  const identity = {
    agentId: `agent-${randomBytes(18).toString("base64url")}`,
    updateToken: randomBytes(32).toString("base64url"),
    createdAt: new Date().toISOString(),
  };
  writeFileSync(path, `${JSON.stringify(identity, null, 2)}\n`, { mode: 0o600 });
  return identity;
}

function configuredCallbackEndpoint(value) {
  try {
    const endpoint = new URL(text(value));
    if (!["http:", "https:"].includes(endpoint.protocol) || !endpoint.hostname || endpoint.pathname !== "/") return "";
    endpoint.search = "";
    endpoint.hash = "";
    return endpoint.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

async function agentVersion(control) {
  try {
    const result = await control(["--version"]);
    const output = text(result.stdout);
    return output.match(/__AIWB_AGENT_VERSION__([^\r\n]+)/)?.[1]?.trim() || output.split(/\r?\n/)[0]?.trim() || "";
  } catch {
    return "";
  }
}

async function registerWithControlPlane(config, control) {
  const updater = readUpdaterConfig();
  const endpoint = configuredCallbackEndpoint(updater.advertisedEndpoint);
  const controlEndpoint = text(updater.controlEndpoint).replace(/\/$/, "");
  if (!endpoint || !controlEndpoint) return;
  const identity = controlIdentity();
  const response = await requestUrl(`${controlEndpoint}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agentId: identity.agentId,
      updateToken: identity.updateToken,
      endpoint,
      version: await agentVersion(control),
      platform: platform(),
      hostname: hostname(),
    }),
  });
  if (!response.ok) throw new Error(`控制中心登记失败：HTTP ${response.status}`);
}

export function createAgentDirectServer({ config = loadAgentDirectConfig(), control = invokeControl } = {}) {
  const clients = new Set();
  const fingerprints = new Map();
  let updateInProgress = false;
  const scheduleSelfUpdate = () => {
    if (updateInProgress) return false;
    updateInProgress = true;
    setTimeout(() => {
      const updaterPath = join(agentHome, "aiwb-agent-updater.mjs");
      const child = spawn(process.execPath, [updaterPath, "--once"], { detached: false, stdio: "ignore", windowsHide: true });
      child.once("close", async () => {
        try {
          await control(["install-service"]);
        } catch {}
        for (const socket of clients) socket.destroy();
        server.close(() => {
          const next = spawn(process.execPath, [directRuntimePath], { detached: true, stdio: "ignore", windowsHide: true });
          next.unref();
          process.exit(0);
        });
      });
      child.once("error", () => { updateInProgress = false; });
    }, 20);
    return true;
  };
  const handler = async (request, response) => {
    if (request.method === "OPTIONS") return json(response, 204, {});
    const url = new URL(request.url || "/", "http://localhost");
    try {
      if (request.method === "POST" && url.pathname === "/v1/control/update") {
        const identity = controlIdentity();
        if (!equalSecret(request.headers["x-aiwb-agent-update-token"], identity.updateToken)) {
          return json(response, 401, { error: { code: "unauthorized", message: "Agent 控制中心凭证无效。" } });
        }
        return json(response, 202, { ok: true, accepted: scheduleSelfUpdate() });
      }
      if (!authorize(request, config)) return json(response, 401, { error: { code: "unauthorized", message: "Agent access token 无效。" } });
      if (request.method === "GET" && url.pathname === "/v1/health") {
        return json(response, 200, {
          version: await agentVersion(control),
          protocolVersion: 1,
          transport: "https",
          tlsFingerprint: text(config.tls?.fingerprint),
          agentHome,
        });
      }
      if (request.method === "POST" && url.pathname === "/v1/cache/clear") {
        const result = await control(["clear-cache"]);
        if (result.code !== 0) {
          return json(response, 409, {
            error: {
              code: "agent_cache_busy",
              message: text(result.stderr || result.stdout) || "Agent 缓存清理失败。",
            },
          });
        }
        return json(response, 200, { ok: true, detail: text(result.stdout) });
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
  const tls = config.tls?.pfxPath || (config.tls?.certPath && config.tls?.keyPath);
  const tlsOptions = !tls
    ? {}
    : config.tls?.pfxPath
      ? { pfx: readFileSync(resolve(config.tls.pfxPath)), passphrase: text(config.tls.passphrase) }
      : { cert: readFileSync(resolve(config.tls.certPath)), key: readFileSync(resolve(config.tls.keyPath)) };
  const server = tls
    ? createHttpsServer(tlsOptions, handler)
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
  if (!acquireRuntimePid()) throw new Error("AI Workbench Agent direct API 已在运行。");
  const server = createAgentDirectServer(options);
  const config = options.config || loadAgentDirectConfig();
  try {
    await new Promise((resolvePromise, reject) => {
      server.once("error", reject);
      server.listen(config.port, config.listenHost, () => {
        server.off("error", reject);
        resolvePromise();
      });
    });
  } catch (error) {
    releaseRuntimePid();
    throw error;
  }
  process.once("exit", releaseRuntimePid);
  const register = () => registerWithControlPlane(config, options.control || invokeControl).catch(() => {});
  const registrationTimer = setInterval(register, controlRegistrationIntervalMs);
  server.once("close", () => {
    clearInterval(registrationTimer);
    releaseRuntimePid();
  });
  void register();
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(directRuntimePath)) {
  startAgentDirectServer().then((server) => {
    const address = server.address();
    process.stdout.write(`AI Workbench Agent direct API listening on ${typeof address === "object" ? `${address.address}:${address.port}` : address}\n`);
  }).catch((error) => {
    process.stderr.write(`AI Workbench Agent direct API failed: ${error?.stack || error}\n`);
    process.exitCode = 1;
  });
}
