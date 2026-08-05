import { execFileSync } from "node:child_process";
import { createDecipheriv, createHash, pbkdf2Sync, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import { homedir } from "node:os";
import { join } from "node:path";
import { Client } from "ssh2";

import {
  buildWorkbenchAgentCreateCommand,
  buildWorkbenchAgentDirectConfigCommand,
  latestWorkbenchAgentVersion,
  workbenchAgentTaskCreateMode,
} from "../src/core/agent.js";
import { trustedAgentPlatform } from "../src/core/agentStartup.js";
import {
  agentRuntimeProfile,
  buildAgentTaskCommand,
  createRemoteTaskId,
} from "../src/core/remoteCommands.js";
import { agents } from "../src/core/foundation.js";
import { extractAgentFinalOutput } from "../src/core/routingOutput.js";

const profilePath = process.env.AIWB_PROFILE_PATH
  || join(homedir(), "Library", "Application Support", "ecs-ai-workbench", "connection-profile.json");
const requestedNames = String(process.env.AIWB_LIVE_SERVER_NAMES || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const healthOnly = process.argv.includes("--health-only");
const listProfiles = process.argv.includes("--list-profiles");
const timeoutMs = Math.max(30_000, Number(process.env.AIWB_LIVE_TIMEOUT_MS) || 5 * 60_000);
const requiredVersion = Math.max(
  1,
  Number(process.env.AIWB_LIVE_REQUIRED_VERSION) || versionNumber(latestWorkbenchAgentVersion),
);
const defaultExpectedResponse = (agentId) => `AIWB_${agentId.toUpperCase()}_V${requiredVersion}_E2E_OK`;
const promptByAgent = {
  claude: String(
    process.env.AIWB_LIVE_CLAUDE_PROMPT
      || `只回复 ${defaultExpectedResponse("claude")}，不要添加其他内容。`,
  ).trim(),
  codex: String(
    process.env.AIWB_LIVE_CODEX_PROMPT
      || `只回复 ${defaultExpectedResponse("codex")}，不要添加其他内容。`,
  ).trim(),
};
const expectedResponseByAgent = {
  claude: String(process.env.AIWB_LIVE_CLAUDE_EXPECTED || defaultExpectedResponse("claude")).trim(),
  codex: String(process.env.AIWB_LIVE_CODEX_EXPECTED || defaultExpectedResponse("codex")).trim(),
};
const commandByAgent = {
  claude: String(process.env.AIWB_LIVE_CLAUDE_COMMAND || "").trim(),
  codex: String(process.env.AIWB_LIVE_CODEX_COMMAND || "").trim(),
};

function versionNumber(value) {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function macSafeStoragePasswords() {
  const services = [
    String(process.env.AIWB_SAFE_STORAGE_SERVICE || "").trim(),
    "ecs-ai-workbench Safe Storage",
    "AI Workbench Safe Storage",
    "Electron Safe Storage",
  ].filter(Boolean);
  return services.flatMap((service) => {
    try {
      const password = execFileSync("security", ["find-generic-password", "-s", service, "-w"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      return password ? [password] : [];
    } catch {
      return [];
    }
  });
}

function decryptMacSafeStorage(value) {
  const encrypted = Buffer.from(String(value || ""), "base64");
  if (encrypted.length <= 3 || !["v10", "v11"].includes(encrypted.subarray(0, 3).toString("utf8"))) {
    throw new Error("本地会话配置不是受支持的 macOS Safe Storage 数据。");
  }
  for (const password of macSafeStoragePasswords()) {
    try {
      const key = pbkdf2Sync(password, "saltysalt", 1003, 16, "sha1");
      const decipher = createDecipheriv("aes-128-cbc", key, Buffer.alloc(16, 0x20));
      return Buffer.concat([decipher.update(encrypted.subarray(3)), decipher.final()]).toString("utf8");
    } catch {}
  }
  throw new Error("无法解密本地会话配置。");
}

function decryptProfile(profile) {
  if (profile?.payloadEncrypted) return JSON.parse(decryptMacSafeStorage(profile.payloadEncrypted));
  if (profile?.passwordEncrypted) return { ...profile, password: decryptMacSafeStorage(profile.passwordEncrypted) };
  return profile && typeof profile === "object" ? profile : {};
}

function normalizeFingerprint(value) {
  return String(value || "").trim().replace(/^sha256\//i, "");
}

function sshExec(profile, command, requestTimeoutMs = 20_000) {
  return new Promise((resolvePromise, reject) => {
    const client = new Client();
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      client.end();
      error ? reject(error) : resolvePromise(value);
    };
    const timer = setTimeout(() => finish(new Error("SSH 命令超时。")), requestTimeoutMs);
    client.once("ready", () => {
      client.exec(command, (error, stream) => {
        if (error) {
          clearTimeout(timer);
          finish(error);
          return;
        }
        const stdout = [];
        const stderr = [];
        stream.on("data", (chunk) => stdout.push(chunk));
        stream.stderr.on("data", (chunk) => stderr.push(chunk));
        stream.once("close", (code) => {
          clearTimeout(timer);
          const output = Buffer.concat(stdout).toString("utf8");
          if (code === 0) finish(null, output);
          else finish(new Error(
            Buffer.concat(stderr).toString("utf8").trim()
            || output.trim()
            || `SSH 命令失败（${code}）。`,
          ));
        });
      });
    });
    client.once("error", (error) => {
      clearTimeout(timer);
      finish(error);
    });
    client.connect({
      host: String(profile.host || "").trim(),
      port: Number(profile.port || 22),
      username: String(profile.username || "").trim(),
      password: String(profile.password || ""),
      readyTimeout: Math.min(requestTimeoutMs, 15_000),
    });
  });
}

async function profileWithDirectBootstrap(profile) {
  if (
    String(profile.agentDirectEndpoint || "").trim()
    && String(profile.agentDirectAccessToken || "").trim()
    && String(profile.agentDirectTlsFingerprint || "").trim()
  ) {
    return profile;
  }
  const output = await sshExec(profile, buildWorkbenchAgentDirectConfigCommand(profile));
  const encoded = output.match(/__AIWB_AGENT_DIRECT_CONFIG_B64__([^\r\n]+)/)?.[1]?.trim();
  if (!encoded) throw new Error("Agent 没有返回 HTTPS 直连配置。");
  const config = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  const accessToken = String(config?.accessToken || "").trim();
  const fingerprint = String(config?.tls?.fingerprint || "").trim();
  const port = Number(config?.port) || 8787;
  if (!config?.tls || !accessToken || !fingerprint) throw new Error("Agent HTTPS 直连配置不完整。");
  return {
    ...profile,
    agentDirectEndpoint: `https://${String(profile.host || "").trim()}:${port}`,
    agentDirectAccessToken: accessToken,
    agentDirectTlsFingerprint: fingerprint,
  };
}

function directRequest(profile, path, { method = "GET", body, requestTimeoutMs = 15_000 } = {}) {
  const endpoint = new URL(path, `${String(profile.agentDirectEndpoint || "").replace(/\/+$/, "")}/`);
  const accessToken = String(profile.agentDirectAccessToken || "").trim();
  const expectedFingerprint = normalizeFingerprint(profile.agentDirectTlsFingerprint);
  if (endpoint.protocol !== "https:" || !accessToken || !expectedFingerprint) {
    throw new Error("Agent HTTPS 直连配置不完整。");
  }
  const encodedBody = body === undefined ? "" : JSON.stringify(body);
  return new Promise((resolvePromise, reject) => {
    let certificateVerified = false;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error instanceof Error ? error : new Error(String(error || "Agent 请求失败。")));
    };
    const request = httpsRequest(endpoint, {
      method,
      agent: false,
      rejectUnauthorized: false,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(encodedBody ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(encodedBody) } : {}),
      },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.once("error", fail);
      response.once("end", () => {
        if (settled) return;
        if (!certificateVerified) return fail(new Error("Agent TLS 证书校验失败。"));
        const raw = Buffer.concat(chunks).toString("utf8");
        const status = Number(response.statusCode || 0);
        let payload = {};
        try {
          payload = raw ? JSON.parse(raw) : {};
        } catch {
          payload = { raw };
        }
        if (status < 200 || status >= 300) {
          return fail(new Error(payload?.error?.message || `Agent 请求失败（HTTP ${status}）。`));
        }
        settled = true;
        resolvePromise(payload);
      });
    });
    request.once("socket", (socket) => {
      socket.once("secureConnect", () => {
        const rawCertificate = socket.getPeerCertificate?.(true)?.raw;
        const received = rawCertificate ? createHash("sha256").update(rawCertificate).digest("base64") : "";
        if (!received || received !== expectedFingerprint) {
          request.destroy(new Error("Agent TLS 证书指纹不匹配。"));
          return;
        }
        certificateVerified = true;
      });
    });
    request.once("error", fail);
    request.setTimeout(requestTimeoutMs, () => request.destroy(new Error("Agent 请求超时。")));
    if (encodedBody) request.write(encodedBody);
    request.end();
  });
}

function responseText(output, prompt = "") {
  const match = String(output || "").match(/__AIWB_RESPONSE_START__\s*([\s\S]*?)\s*__AIWB_RESPONSE_END__/);
  return extractAgentFinalOutput(String(match?.[1] || "").trim(), prompt).text;
}

async function waitForTask(profile, taskId) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const payload = await directRequest(profile, `/v1/tasks/${encodeURIComponent(taskId)}`, {
      requestTimeoutMs: 20_000,
    });
    if (payload?.task?.terminal) return payload.task;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
  }
  throw new Error(`任务 ${taskId} 在 ${timeoutMs}ms 内没有结束。`);
}

async function verifyServer(server) {
  let profile = await profileWithDirectBootstrap({
    ...(server.profile || {}),
    conversationId: String(server.conversationId || "").trim(),
  });
  const health = await directRequest(profile, "/v1/health");
  const healthPlatform = trustedAgentPlatform(health.platform);
  if (!healthPlatform) throw new Error(`${server.name} 的 Agent 未返回可信平台类型。`);
  profile = { ...profile, platform: healthPlatform };
  const result = {
    name: String(server.name || ""),
    platform: healthPlatform,
    version: health.version || "",
    serviceStatus: health.serviceStatus || "",
    serviceProcessStatus: health.serviceProcessStatus || "",
    daemonStatus: health.daemonStatus || "",
    httpStatus: health.httpStatus || "",
    updaterStatus: health.updaterStatus || "",
    generationReady: health.generationReady === true,
  };
  if (versionNumber(result.version) < requiredVersion) {
    throw new Error(`${server.name} 仍是 Agent v${result.version || "?"}，要求至少 v${requiredVersion}。`);
  }
  if (
    result.generationReady !== true
    || result.serviceProcessStatus !== "running"
    || result.daemonStatus !== "running"
    || result.httpStatus !== "running"
    || result.updaterStatus !== "running"
  ) {
    throw new Error(`${server.name} 的 Agent v${result.version} 运行代际未完整就绪。`);
  }
  if (healthOnly) return result;

  const agentId = profile.agentId === "claude" ? "claude" : "codex";
  if (commandByAgent[agentId]) {
    profile = {
      ...profile,
      [agentId === "claude" ? "claudeCommand" : "codexCommand"]: commandByAgent[agentId],
    };
  }
  const prompt = promptByAgent[agentId];
  if (!prompt) throw new Error(`${server.name} 缺少 ${agentId} 实测提示词。`);
  const agent = agents.find((candidate) => candidate.id === agentId);
  const runtimeProfile = agentRuntimeProfile(profile);
  const taskId = createRemoteTaskId(profile.conversationId, agentId);
  const turnId = `e2e-${randomUUID()}`;
  const command = buildAgentTaskCommand(runtimeProfile, agent, prompt);
  const startedAt = Date.now();
  const taskMetadata = {
    conversationId: profile.conversationId,
    turnId,
    agentId,
    model: String(profile.aiModel || ""),
    workdir: String(profile.workdir || ""),
    promptText: prompt,
    requestMessageId: `${turnId}-user`,
    responseMessageId: `${turnId}-assistant`,
    name: String(server.name || ""),
  };
  const createMode = workbenchAgentTaskCreateMode(profile);
  if (createMode === "create-now") {
    const createOutput = await sshExec(
      profile,
      buildWorkbenchAgentCreateCommand(profile, taskId, command, taskMetadata, { createMode }),
      30_000,
    );
    if (!createOutput.includes(`__AIWB_AGENT_TASK_ID__${taskId}`)) {
      throw new Error(`${server.name} 的 macOS Agent 未确认 SSH 上下文任务。`);
    }
  } else {
    const created = await directRequest(profile, "/v1/tasks", {
      method: "POST",
      body: {
        taskId,
        conversationId: taskMetadata.conversationId,
        turnId: taskMetadata.turnId,
        agentId: taskMetadata.agentId,
        model: taskMetadata.model,
        workdir: taskMetadata.workdir,
        prompt,
        requestMessageId: taskMetadata.requestMessageId,
        responseMessageId: taskMetadata.responseMessageId,
        command,
        name: taskMetadata.name,
      },
      requestTimeoutMs: 20_000,
    });
    if (!created?.task?.id) throw new Error(`${server.name} 的 Agent 未返回任务 ID。`);
  }
  const task = await waitForTask(profile, taskId);
  const taskStatus = String(task.rawStatus || task.status || "").toLowerCase();
  const taskOutcome = String(task.outcome || "").toLowerCase();
  const taskExitCode = String(task.exitCode ?? "").trim();
  if (taskStatus !== "done" || taskOutcome !== "success" || taskExitCode !== "0") {
    throw new Error(
      `${server.name} 的 ${agentId} 任务未成功完成（status=${taskStatus || "?"}, outcome=${taskOutcome || "?"}, exit=${taskExitCode || "?"}）。`,
    );
  }
  const response = responseText(task.output, prompt);
  const expectedResponse = expectedResponseByAgent[agentId];
  if (!expectedResponse || response !== expectedResponse) {
    throw new Error(`${server.name} 的 ${agentId} 回复校验失败。`);
  }
  return {
    ...result,
    taskStatus,
    outcome: taskOutcome,
    exitCode: taskExitCode,
    durationMs: Date.now() - startedAt,
    response,
  };
}

try {
  const stored = JSON.parse(await readFile(profilePath, "utf8"));
  const workspace = decryptProfile(stored);
  if (listProfiles) {
    const profiles = (Array.isArray(workspace.servers) ? workspace.servers : []).map((server) => ({
      name: String(server.name || ""),
      host: String(server.profile?.host || ""),
      username: String(server.profile?.username || ""),
      platform: String(server.profile?.platform || ""),
    }));
    process.stdout.write(`${JSON.stringify({ ok: true, profiles }, null, 2)}\n`);
    process.exit(0);
  }
  const servers = (Array.isArray(workspace.servers) ? workspace.servers : []).filter(
    (server) => !requestedNames.length || requestedNames.includes(String(server.name || "")),
  );
  if (!servers.length) throw new Error("没有找到要验证的会话。");
  const results = [];
  for (const server of servers) results.push(await verifyServer(server));
  process.stdout.write(`${JSON.stringify({ ok: true, results }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: String(error?.message || error) }, null, 2)}\n`);
  process.exitCode = 1;
}
