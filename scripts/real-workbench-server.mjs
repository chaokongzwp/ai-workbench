import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Client } from "ssh2";

const root = resolve(new URL("..", import.meta.url).pathname);
const port = Number(process.env.AIWB_PORT || 4187);
const sessions = new Map();

const defaultProfile = {
  port: 22,
  workdir: "/opt/limpet-workspace",
  tmuxPrefix: "ai-workbench",
  codexCommand: "/usr/local/bin/codex",
  claudeCommand: "/usr/local/bin/claude",
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function shQuote(value) {
  return `'${String(value ?? "").replace(/'/g, "'\\''")}'`;
}

function bashCommand(script) {
  return `bash -lc ${shQuote(script)}`;
}

function sanitizeId(value) {
  return String(value || "session").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48);
}

function agentCommand(profile, agent) {
  return agent === "claude" ? profile.claudeCommand : profile.codexCommand;
}

function tmuxSession(profile, agent, sessionId) {
  return `${sanitizeId(profile.tmuxPrefix)}-${sanitizeId(sessionId)}-${sanitizeId(agent)}`;
}

function sessionKey(workdir, agent, sessionId) {
  return `${String(workdir || "").trim()}::${sanitizeId(agent)}::${sanitizeId(sessionId)}`;
}

function sshExec(profile, command, timeoutMs = 120000) {
  return new Promise((resolvePromise, reject) => {
    const conn = new Client();
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      conn.end();
      reject(new Error("连接或命令执行超时"));
    }, timeoutMs);

    conn
      .on("ready", () => {
        conn.exec(command, { pty: true }, (error, stream) => {
          if (error) {
            clearTimeout(timer);
            settled = true;
            conn.end();
            reject(error);
            return;
          }

          stream
            .on("close", (code) => {
              if (settled) return;
              clearTimeout(timer);
              settled = true;
              conn.end();
              resolvePromise({ code, stdout, stderr });
            })
            .on("data", (chunk) => {
              stdout += chunk.toString("utf8");
            });

          stream.stderr.on("data", (chunk) => {
            stderr += chunk.toString("utf8");
          });
        });
      })
      .on("error", (error) => {
        if (settled) return;
        clearTimeout(timer);
        settled = true;
        reject(error);
      })
      .connect({
        host: profile.host,
        port: profile.port,
        username: profile.username,
        password: profile.password,
        readyTimeout: 20000,
        keepaliveInterval: 10000,
      });
  });
}

function buildHealthCommand(profile) {
  return bashCommand(`
set -e
mkdir -p ${shQuote(profile.workdir)}
cd ${shQuote(profile.workdir)}
printf 'AI Workbench connected\\n'
printf 'workdir=%s\\n' "$(pwd)"
command -v tmux >/dev/null
`);
}

function buildCodexExecCommand(profile, prompt, codexSessionId = "") {
  const outputFile = `/tmp/aiwb-codex-${randomUUID()}.txt`;
  const logFile = `/tmp/aiwb-codex-${randomUUID()}.log`;
  const resumeArgs = codexSessionId ? `resume ${shQuote(codexSessionId)}` : "";

  return bashCommand(`
set -e
mkdir -p ${shQuote(profile.workdir)}
cd ${shQuote(profile.workdir)}
set +e
${shQuote(profile.codexCommand)} exec --skip-git-repo-check --sandbox workspace-write --cd ${shQuote(profile.workdir)} --output-last-message ${shQuote(outputFile)} ${resumeArgs} ${shQuote(prompt)} >${shQuote(logFile)} 2>&1
AIWB_STATUS=$?
set -e
if [ "$AIWB_STATUS" -ne 0 ]; then
  cat ${shQuote(logFile)}
  exit "$AIWB_STATUS"
fi
printf '__AIWB_RESPONSE_START__\\n'
cat ${shQuote(outputFile)}
printf '\\n__AIWB_RESPONSE_END__\\n'
AIWB_LATEST=$(find "$HOME/.codex/sessions" -type f -name '*.jsonl' -printf '%T@ %p\\n' 2>/dev/null | sort -nr | head -n 1 | cut -d' ' -f2-)
AIWB_SESSION=$(basename "$AIWB_LATEST" 2>/dev/null | grep -Eo '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}' | tail -n 1 || true)
printf '\\n__AIWB_SESSION__%s\\n' "$AIWB_SESSION"
rm -f ${shQuote(outputFile)} ${shQuote(logFile)}
`);
}

function buildSendCommand(profile, agent, sessionId, prompt, remoteSessionId = "") {
  if (agent === "codex") {
    return buildCodexExecCommand(profile, prompt, remoteSessionId);
  }

  const target = tmuxSession(profile, agent, sessionId);
  const command = agentCommand(profile, agent);
  const encodedPrompt = Buffer.from(prompt, "utf8").toString("base64");

  return bashCommand(`
set -e
mkdir -p ${shQuote(profile.workdir)}
cd ${shQuote(profile.workdir)}
if ! tmux has-session -t ${shQuote(target)} 2>/dev/null; then
  tmux new-session -d -s ${shQuote(target)} -c ${shQuote(profile.workdir)} ${shQuote(command)}
  sleep 2
fi
AIWB_PROMPT=$(printf '%s' ${shQuote(encodedPrompt)} | base64 -d)
tmux set-buffer -b aiwb-prompt "$AIWB_PROMPT"
tmux paste-buffer -t ${shQuote(target)} -b aiwb-prompt
tmux send-keys -t ${shQuote(target)} C-m
sleep 8
tmux capture-pane -t ${shQuote(target)} -p -S -180
`);
}

function cleanOutput(output) {
  return String(output || "")
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line, index, lines) => line.trim() || (lines[index - 1]?.trim() && lines[index + 1]?.trim()))
    .join("\n")
    .trim();
}

function parseCodexOutput(output) {
  const text = cleanOutput(output);
  const sessionMatch = text.match(/__AIWB_SESSION__([0-9a-fA-F-]{36})/);
  const responseMatch = text.match(/__AIWB_RESPONSE_START__\n([\s\S]*?)\n__AIWB_RESPONSE_END__/);
  return {
    response: responseMatch ? responseMatch[1].trim() : text.replace(/__AIWB_SESSION__[0-9a-fA-F-]{36}/g, "").trim(),
    sessionId: sessionMatch?.[1] || "",
  };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function validateProfile(input) {
  const host = String(input.host || "").trim();
  const username = String(input.username || "").trim();
  const password = String(input.password || "");
  const workdir = String(input.workdir || defaultProfile.workdir).trim() || defaultProfile.workdir;
  const portValue = Number(input.port || defaultProfile.port);
  if (!host) throw new Error("请填写服务器地址");
  if (!username) throw new Error("请填写用户名");
  if (!password) throw new Error("请填写登录密码");
  return {
    ...defaultProfile,
    host,
    username,
    password,
    workdir,
    port: Number.isFinite(portValue) && portValue > 0 ? portValue : defaultProfile.port,
  };
}

async function handleApi(req, res) {
  try {
    const body = await readBody(req);

    if (req.url === "/api/connect") {
      const profile = validateProfile(body);
      const health = await sshExec(profile, buildHealthCommand(profile), 45000);
      if (health.code !== 0) throw new Error(cleanOutput(health.stderr || health.stdout) || "连接失败");
      const token = randomUUID();
      sessions.set(token, {
        profile,
        sessionId: randomUUID().slice(0, 8),
        remoteSessions: new Map(),
      });
      const session = sessions.get(token);
      sendJson(res, 200, {
        ok: true,
        token,
        sessionId: session.sessionId,
        workdir: profile.workdir,
        message: cleanOutput(health.stdout) || "已连接",
      });
      return;
    }

    if (req.url === "/api/new-session") {
      const session = sessions.get(body.token);
      if (!session) throw new Error("请先连接云服务器");
      session.sessionId = randomUUID().slice(0, 8);
      sendJson(res, 200, { ok: true, sessionId: session.sessionId });
      return;
    }

    if (req.url === "/api/send") {
      const session = sessions.get(body.token);
      if (!session) throw new Error("请先连接云服务器");
      const prompt = String(body.prompt || "").trim();
      if (!prompt) throw new Error("请输入任务内容");
      const agent = body.agent === "claude" ? "claude" : "codex";
      if (body.workdir) session.profile.workdir = String(body.workdir).trim() || session.profile.workdir;
      const key = sessionKey(session.profile.workdir, agent, session.sessionId);
      const remoteSessionId = session.remoteSessions.get(key) || "";
      const result = await sshExec(
        session.profile,
        buildSendCommand(session.profile, agent, session.sessionId, prompt, remoteSessionId),
        180000,
      );
      const parsed = agent === "codex" ? parseCodexOutput(result.stdout || result.stderr) : null;
      if (agent === "codex" && parsed?.sessionId) session.remoteSessions.set(key, parsed.sessionId);
      const output = agent === "codex" ? parsed?.response : cleanOutput(result.stdout || result.stderr);
      sendJson(res, 200, {
        ok: true,
        sessionKey: key,
        remoteSessionId: agent === "codex" ? session.remoteSessions.get(key) || "" : tmuxSession(session.profile, agent, session.sessionId),
        output: output || "已发送到云服务器，暂时没有捕获到回复。",
      });
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    sendJson(res, 400, { ok: false, error: error.message || String(error) });
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  const pathname = url.pathname === "/" ? "/interaction-design.html" : url.pathname;
  const filePath = resolve(join(root, pathname.replace(/^\/+/, "")));
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const bytes = await readFile(filePath);
    const ext = extname(filePath);
    const type =
      ext === ".html"
        ? "text/html; charset=utf-8"
        : ext === ".css"
          ? "text/css; charset=utf-8"
          : ext === ".js"
            ? "text/javascript; charset=utf-8"
            : "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = createServer((req, res) => {
  if (req.url?.startsWith("/api/")) {
    if (req.method !== "POST") {
      sendJson(res, 405, { ok: false, error: "Method not allowed" });
      return;
    }
    handleApi(req, res);
    return;
  }

  serveStatic(req, res);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`AI Workbench real HTML: http://127.0.0.1:${port}/interaction-design.html`);
});
