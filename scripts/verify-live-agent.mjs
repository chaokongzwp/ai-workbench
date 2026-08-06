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
const generationDiagnosticsOnly = process.argv.includes("--generation-diagnostics");
const schedulerDiagnosticsOnly = process.argv.includes("--scheduler-diagnostics");
const schedulerProbe = process.argv.includes("--scheduler-probe");
const schedulerEvents = process.argv.includes("--scheduler-events");
const processDiagnostics = process.argv.includes("--process-diagnostics");
const startScheduledService = process.argv.includes("--start-scheduled-service");
const latestTaskOnly = process.argv.includes("--latest-task");
const latestTaskDiagnostics = process.argv.includes("--latest-task-diagnostics");
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

async function windowsGenerationDiagnostics(server) {
  const script = String.raw`
$Root = Join-Path $env:USERPROFILE '.ai-workbench\agent'
function Read-AiwbText([string]$Name) {
  $Path = Join-Path $Root $Name
  if (Test-Path -LiteralPath $Path) { return [string](Get-Content -LiteralPath $Path -Raw) }
  return ''
}
function Read-AiwbPid([string]$Name) {
  $Value = (Read-AiwbText $Name).Trim()
  $Number = 0
  if ([int]::TryParse($Value, [ref]$Number)) { return $Number }
  return 0
}
function Test-AiwbPid([int]$ProcessId) {
  if ($ProcessId -lt 2) { return $false }
  return $null -ne (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)
}
$ServicePid = Read-AiwbPid 'service.pid'
$DaemonPid = Read-AiwbPid 'daemon.pid'
$HttpPid = Read-AiwbPid 'http.pid'
$UpdaterPid = Read-AiwbPid 'updater.pid'
$UpdateLockOwnerPid = Read-AiwbPid 'update.lock\owner.pid'
$Fence = Read-AiwbText 'runtime-update.fence'
$TaskRows = @()
$TasksRoot = Join-Path $Root 'tasks'
if (Test-Path -LiteralPath $TasksRoot) {
  $TaskRows = @(Get-ChildItem -LiteralPath $TasksRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $StatusPath = Join-Path $_.FullName 'status'
    $PidPath = Join-Path $_.FullName 'pid'
    $TaskStatus = if (Test-Path -LiteralPath $StatusPath) { [string](Get-Content -LiteralPath $StatusPath -Raw).Trim() } else { '' }
    $TaskPid = 0
    if (Test-Path -LiteralPath $PidPath) { [void][int]::TryParse(([string](Get-Content -LiteralPath $PidPath -Raw)).Trim(), [ref]$TaskPid) }
    if ($TaskStatus -in @('queued', 'preparing', 'busy', 'running')) {
      [pscustomobject]@{ id = $_.Name; status = $TaskStatus; pid = $TaskPid; pidAlive = Test-AiwbPid $TaskPid }
    }
  })
}
[pscustomobject]@{
  fenceExists = Test-Path -LiteralPath (Join-Path $Root 'runtime-update.fence')
  fence = $Fence.Trim()
  generation = (Read-AiwbText 'runtime.generation').Trim()
  updaterStatus = (Read-AiwbText 'updater-status.json').Trim()
  servicePid = $ServicePid
  serviceAlive = Test-AiwbPid $ServicePid
  daemonPid = $DaemonPid
  daemonAlive = Test-AiwbPid $DaemonPid
  httpPid = $HttpPid
  httpAlive = Test-AiwbPid $HttpPid
  updaterPid = $UpdaterPid
  updaterAlive = Test-AiwbPid $UpdaterPid
  updateLockOwnerPid = $UpdateLockOwnerPid
  updateLockOwnerAlive = Test-AiwbPid $UpdateLockOwnerPid
  updateLockOwnerStartedAt = (Read-AiwbText 'update.lock\owner.started_at_ms').Trim()
  activeTasks = $TaskRows
  shortDatePattern = [System.Globalization.CultureInfo]::CurrentCulture.DateTimeFormat.ShortDatePattern
  shortTimePattern = [System.Globalization.CultureInfo]::CurrentCulture.DateTimeFormat.ShortTimePattern
  daemonLogTail = if (Test-Path -LiteralPath (Join-Path $Root 'daemon.log')) { [string]((Get-Content -LiteralPath (Join-Path $Root 'daemon.log') -Tail 40) -join [Environment]::NewLine) } else { '' }
} | ConvertTo-Json -Compress
`;
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const output = await sshExec(
    server.profile || {},
    `powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ${encoded}`,
    60_000,
  );
  return { name: String(server.name || ""), ...JSON.parse(String(output || "{}").trim()) };
}

async function windowsSchedulerDiagnostics(server) {
  const script = String.raw`
$Names = @('AI Workbench Agent', 'AI Workbench Agent Update Handoff')
$Results = foreach ($Name in $Names) {
  $Task = Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
  $Info = if ($null -ne $Task) { Get-ScheduledTaskInfo -TaskName $Name -ErrorAction SilentlyContinue } else { $null }
  [pscustomobject]@{
    name = $Name
    exists = $null -ne $Task
    state = if ($null -ne $Task) { [string]$Task.State } else { '' }
    lastRunTime = if ($null -ne $Info -and $Info.LastRunTime.Year -gt 2000) { $Info.LastRunTime.ToUniversalTime().ToString('o') } else { '' }
    lastTaskResult = if ($null -ne $Info) { [long]$Info.LastTaskResult } else { $null }
    nextRunTime = if ($null -ne $Info -and $Info.NextRunTime.Year -gt 2000) { $Info.NextRunTime.ToUniversalTime().ToString('o') } else { '' }
    execute = if ($null -ne $Task) { [string]$Task.Actions.Execute } else { '' }
    arguments = if ($null -ne $Task) { [string]$Task.Actions.Arguments } else { '' }
    userId = if ($null -ne $Task) { [string]$Task.Principal.UserId } else { '' }
    logonType = if ($null -ne $Task) { [string]$Task.Principal.LogonType } else { '' }
    runLevel = if ($null -ne $Task) { [string]$Task.Principal.RunLevel } else { '' }
  }
}
$Results | ConvertTo-Json -Compress
`;
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const output = await sshExec(
    server.profile || {},
    `powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ${encoded}`,
  );
  const tasks = JSON.parse(String(output || "[]").trim());
  return { name: String(server.name || ""), tasks: Array.isArray(tasks) ? tasks : [tasks] };
}

async function windowsStartScheduledService(server) {
  const script = String.raw`
$TaskName = 'AI Workbench Agent'
$Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
$ExpectedControl = Join-Path $env:USERPROFILE '.ai-workbench\agent\aiwb-agent.mjs'
$Action = @($Task.Actions)[0]
if ($null -eq $Action -or [string]$Action.Arguments -notlike ('*' + $ExpectedControl + '*') -or [string]$Action.Arguments -notlike '*service-run*') {
  throw '拒绝启动：计划任务动作不是当前用户的 AI Workbench Agent。'
}
Start-ScheduledTask -TaskName $TaskName -ErrorAction Stop
Start-Sleep -Milliseconds 500
$Current = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
[pscustomobject]@{ started = $true; state = [string]$Current.State } | ConvertTo-Json -Compress
`;
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const output = await sshExec(
    server.profile || {},
    `powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ${encoded}`,
  );
  return { name: String(server.name || ""), ...JSON.parse(String(output || "{}").trim()) };
}

async function windowsSchedulerProbe(server) {
  const script = String.raw`
$ProbeTaskName = 'AI Workbench Agent Scheduler PowerShell Probe'
$ActionTaskName = 'AI Workbench Agent Scheduler PowerShell Action Probe'
$ProbeCode = -1
$ProbeOutput = ''
$ActionCode = -1
$ActionOutput = ''
try {
  $Identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $Principal = New-ScheduledTaskPrincipal -UserId $Identity -LogonType Interactive -RunLevel Limited
  $Trigger = New-ScheduledTaskTrigger -AtLogOn -User $Identity
  $NodePath = [string](Get-Command node.exe -ErrorAction Stop).Source
  $ControlPath = Join-Path $env:USERPROFILE '.ai-workbench\agent\aiwb-agent.mjs'
  try {
    $ProbeAction = New-ScheduledTaskAction -Execute $env:ComSpec -Argument '/d /c exit 0'
    Register-ScheduledTask -TaskName $ProbeTaskName -Action $ProbeAction -Trigger $Trigger -Principal $Principal -Force -ErrorAction Stop | Out-Null
    Start-ScheduledTask -TaskName $ProbeTaskName -ErrorAction Stop
    $ProbeCode = 0
    $ProbeOutput = 'registered-and-started'
  } catch {
    $ProbeCode = 1
    $ProbeOutput = [string]$_.Exception.Message
  }
  try {
    $ExactAction = New-ScheduledTaskAction -Execute $NodePath -Argument ('"' + $ControlPath + '" install-service-handoff')
    Register-ScheduledTask -TaskName $ActionTaskName -Action $ExactAction -Trigger $Trigger -Principal $Principal -Force -ErrorAction Stop | Out-Null
    $RegisteredAction = @((Get-ScheduledTask -TaskName $ActionTaskName -ErrorAction Stop).Actions)[0]
    $ActionCode = 0
    $ActionOutput = ([string]$RegisteredAction.Execute) + ' | ' + ([string]$RegisteredAction.Arguments)
  } catch {
    $ActionCode = 1
    $ActionOutput = [string]$_.Exception.Message
  }
} finally {
  Unregister-ScheduledTask -TaskName $ProbeTaskName -Confirm:$false -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $ActionTaskName -Confirm:$false -ErrorAction SilentlyContinue
}
[pscustomobject]@{
  probeCode = $ProbeCode
  probeOutput = $ProbeOutput.Trim()
  actionCode = $ActionCode
  actionOutput = $ActionOutput.Trim()
} | ConvertTo-Json -Compress
`;
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const output = await sshExec(
    server.profile || {},
    `powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ${encoded}`,
    60_000,
  );
  return { name: String(server.name || ""), ...JSON.parse(String(output || "{}").trim()) };
}

async function windowsSchedulerEvents(server) {
  const script = String.raw`
$Rows = @()
try {
  $Rows = @(Get-WinEvent -FilterHashtable @{
    LogName = 'Microsoft-Windows-TaskScheduler/Operational'
    StartTime = (Get-Date).AddMinutes(-20)
  } -ErrorAction Stop | Where-Object {
    [string]$_.Message -like '*AI Workbench Agent*'
  } | Select-Object -First 80 | ForEach-Object {
    [pscustomobject]@{
      timeCreated = $_.TimeCreated.ToUniversalTime().ToString('o')
      id = $_.Id
      level = [string]$_.LevelDisplayName
      message = [string]$_.Message
    }
  })
} catch {
  $Rows = @([pscustomobject]@{ timeCreated = ''; id = -1; level = 'query-error'; message = [string]$_.Exception.Message })
}
$Rows | ConvertTo-Json -Compress
`;
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const output = await sshExec(
    server.profile || {},
    `powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ${encoded}`,
  );
  const events = JSON.parse(String(output || "[]").trim());
  return { name: String(server.name || ""), events: Array.isArray(events) ? events : [events] };
}

async function windowsProcessDiagnostics(server) {
  const script = String.raw`
$Rows = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue | Where-Object {
  [string]$_.CommandLine -like '*\.ai-workbench\agent\*'
} | ForEach-Object {
  [pscustomobject]@{
    pid = [int]$_.ProcessId
    parentPid = [int]$_.ParentProcessId
    executablePath = [string]$_.ExecutablePath
    commandLine = [string]$_.CommandLine
  }
})
$Rows | Sort-Object pid | ConvertTo-Json -Compress
`;
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const output = await sshExec(
    server.profile || {},
    `powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ${encoded}`,
  );
  const processes = JSON.parse(String(output || "[]").trim());
  return { name: String(server.name || ""), processes: Array.isArray(processes) ? processes : [processes] };
}

async function windowsTaskDiagnostics(profile, taskId) {
  const safeTaskId = String(taskId || "").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 96);
  const script = String.raw`
$Directory = Join-Path $env:USERPROFILE ${JSON.stringify(`.ai-workbench\\agent\\tasks\\${safeTaskId}`)}
function Read-AiwbTaskFile([string]$Name) {
  $Path = Join-Path $Directory $Name
  if (Test-Path -LiteralPath $Path) { return [string](Get-Content -LiteralPath $Path -Raw) }
  return ''
}
[pscustomobject]@{
  launcherLog = Read-AiwbTaskFile 'launcher.log'
  bootstrapLog = Read-AiwbTaskFile 'bootstrap.log'
  executionSummary = Read-AiwbTaskFile 'execution-summary.md'
} | ConvertTo-Json -Compress
`;
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const output = await sshExec(
    profile || {},
    `powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ${encoded}`,
  );
  return JSON.parse(String(output || "{}").trim());
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

  if (latestTaskOnly || latestTaskDiagnostics) {
    const conversationId = String(profile.conversationId || "").trim();
    const payload = await directRequest(
      profile,
      `/v1/conversations/${encodeURIComponent(conversationId)}/latest-task`,
      { requestTimeoutMs: 20_000 },
    );
    const task = payload?.task || {};
    const diagnostics = latestTaskDiagnostics && healthPlatform === "windows"
      ? await windowsTaskDiagnostics(profile, task.id)
      : {};
    return {
      ...result,
      taskId: String(task.id || ""),
      taskStatus: String(task.rawStatus || task.status || "").toLowerCase(),
      outcome: String(task.outcome || "").toLowerCase(),
      exitCode: String(task.exitCode ?? "").trim(),
      response: responseText(task.output),
      ...diagnostics,
    };
  }

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
  if (generationDiagnosticsOnly) {
    const results = [];
    for (const server of servers) {
      if (String(server.profile?.platform || "") !== "windows") continue;
      results.push(await windowsGenerationDiagnostics(server));
    }
    process.stdout.write(`${JSON.stringify({ ok: true, results }, null, 2)}\n`);
    process.exit(0);
  }
  if (schedulerDiagnosticsOnly) {
    const results = [];
    for (const server of servers) {
      if (String(server.profile?.platform || "") !== "windows") continue;
      results.push(await windowsSchedulerDiagnostics(server));
    }
    process.stdout.write(`${JSON.stringify({ ok: true, results }, null, 2)}\n`);
    process.exit(0);
  }
  if (schedulerProbe) {
    const results = [];
    for (const server of servers) {
      if (String(server.profile?.platform || "") !== "windows") continue;
      results.push(await windowsSchedulerProbe(server));
    }
    process.stdout.write(`${JSON.stringify({ ok: true, results }, null, 2)}\n`);
    process.exit(0);
  }
  if (schedulerEvents) {
    const results = [];
    for (const server of servers) {
      if (String(server.profile?.platform || "") !== "windows") continue;
      results.push(await windowsSchedulerEvents(server));
    }
    process.stdout.write(`${JSON.stringify({ ok: true, results }, null, 2)}\n`);
    process.exit(0);
  }
  if (processDiagnostics) {
    const results = [];
    for (const server of servers) {
      if (String(server.profile?.platform || "") !== "windows") continue;
      results.push(await windowsProcessDiagnostics(server));
    }
    process.stdout.write(`${JSON.stringify({ ok: true, results }, null, 2)}\n`);
    process.exit(0);
  }
  if (startScheduledService) {
    const results = [];
    for (const server of servers) {
      if (String(server.profile?.platform || "") !== "windows") continue;
      results.push(await windowsStartScheduledService(server));
    }
    process.stdout.write(`${JSON.stringify({ ok: true, results }, null, 2)}\n`);
    process.exit(0);
  }
  const results = [];
  for (const server of servers) results.push(await verifyServer(server));
  process.stdout.write(`${JSON.stringify({ ok: true, results }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: String(error?.message || error) }, null, 2)}\n`);
  process.exitCode = 1;
}
