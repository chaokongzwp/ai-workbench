import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  connectionForAppLaunch,
  profileConnectionKey,
  serializeWorkspaceMigrationStore,
} from "../src/core/foundation.js";

function loadedServer(connection, task = {}) {
  const server = {
    id: "session-1",
    name: "测试会话",
    conversationId: "conversation-1",
    profile: {
      host: "127.0.0.1",
      port: 22,
      username: "tester",
      password: "secret",
      workdir: "/workspace",
      agentId: "claude",
    },
    connection,
    task,
  };
  return {
    ...server,
    connection: connectionForAppLaunch(server),
  };
}

for (const previousState of ["connected", "testing", "error"]) {
  const server = loadedServer({
    state: previousState,
    label: "旧状态",
    detail: "上一次 App 运行留下的状态",
    mode: "agent",
  });
  assert.equal(server.connection.state, "idle");
  assert.equal(server.connection.label, "未连接");
  assert.equal(server.connection.mode, "agent");
  assert.equal(server.connection.detail, "tester@127.0.0.1");
}

const recovering = loadedServer(
  {
    state: "connected",
    label: "已连接",
    detail: "旧连接",
    mode: "agent",
  },
  {
    backend: "agent",
    remoteTaskId: "task-1",
    agentId: "claude",
    startedAt: Date.now(),
  },
);
assert.equal(recovering.connection.state, "idle");
assert.equal("state" in recovering.task, false);
assert.equal(recovering.task.remoteTaskId, "task-1");

const migration = serializeWorkspaceMigrationStore([recovering], recovering.id);
assert.equal("connection" in migration.servers[0], false);

const machineProfile = recovering.profile;
assert.equal(
  profileConnectionKey({ ...machineProfile, workdir: "/another-project", agentId: "codex" }),
  profileConnectionKey({ ...machineProfile, workdir: "/workspace", agentId: "claude" }),
);
assert.notEqual(
  profileConnectionKey({ ...machineProfile, username: "another-user" }),
  profileConnectionKey(machineProfile),
);

const electronSource = readFileSync(new URL("../electron/main.mjs", import.meta.url), "utf8");
assert.match(electronSource, /const sshCommandConnections = new Map\(\);/);
assert.match(electronSource, /const sshCommandSessions = new Map\(\);/);
assert.match(electronSource, /sshCommandConnections\.get\(fingerprint\)/);
assert.match(electronSource, /record\.sessionIds\.add\(sessionId\)/);
assert.match(electronSource, /for \(const sessionId of record\?\.sessionIds \|\| \[\]\)/);
const machineCommandSource = electronSource.slice(
  electronSource.indexOf("function executeSshCommand"),
  electronSource.indexOf("async function runSshCommand"),
);
assert.match(machineCommandSource, /client\.exec\(config\.command, \{\},/);
assert.doesNotMatch(machineCommandSource, /pty\s*:/);

console.log("session connection lifecycle regression: ok");
