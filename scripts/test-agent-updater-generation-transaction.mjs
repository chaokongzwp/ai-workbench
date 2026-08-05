import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const updaterPath = new URL("../agent/runtime/aiwb-agent-updater.mjs", import.meta.url);
const testHome = await mkdtemp(join(tmpdir(), "aiwb-updater-generation-transaction-"));
const agentHome = join(testHome, ".ai-workbench", "agent");
const oldArtifacts = {
  control: Buffer.from("old-control\n"),
  http: Buffer.from("old-http\n"),
  updater: Buffer.from("old-updater\n"),
};
const newArtifacts = {
  "/control": Buffer.from("new-control\n"),
  "/http": Buffer.from("new-http\n"),
  "/updater": Buffer.from("new-updater\n"),
};
const sha = (value) => createHash("sha256").update(value).digest("hex");

let server;
try {
  await mkdir(agentHome, { recursive: true });
  await writeFile(join(agentHome, "aiwbctl"), oldArtifacts.control);
  await writeFile(join(agentHome, "aiwb-agent-http.mjs"), oldArtifacts.http);
  await writeFile(join(agentHome, "aiwb-agent-updater.mjs"), oldArtifacts.updater);

  // A directory at the generation target deterministically makes the final
  // atomic rename fail after all three runtime artifacts were replaced. The
  // updater must roll those artifacts back as one transaction.
  await mkdir(join(agentHome, "runtime.generation"));

  server = createServer((request, response) => {
    if (request.url === "/manifest.json") {
      const base = `http://127.0.0.1:${server.address().port}`;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        version: "transaction-test",
        scriptUrl: `${base}/control`,
        sha256: sha(newArtifacts["/control"]),
        directRuntime: { url: `${base}/http`, sha256: sha(newArtifacts["/http"]) },
        updaterRuntime: { url: `${base}/updater`, sha256: sha(newArtifacts["/updater"]) },
      }));
      return;
    }
    const artifact = newArtifacts[request.url];
    if (artifact) {
      response.end(artifact);
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  await writeFile(join(agentHome, "updater.json"), JSON.stringify({
    manifestUrl: `http://127.0.0.1:${server.address().port}/manifest.json`,
  }));

  await execFileAsync(process.execPath, [updaterPath.pathname, "--once"], {
    env: {
      ...process.env,
      HOME: testHome,
      AIWB_AGENT_HOME: agentHome,
      AIWB_AGENT_CREATOR_DRAIN_QUIET_MS: "50",
    },
  });

  assert.deepEqual(await readFile(join(agentHome, "aiwbctl")), oldArtifacts.control);
  assert.deepEqual(await readFile(join(agentHome, "aiwb-agent-http.mjs")), oldArtifacts.http);
  assert.deepEqual(await readFile(join(agentHome, "aiwb-agent-updater.mjs")), oldArtifacts.updater);
  assert.equal((await stat(join(agentHome, "runtime.generation"))).isDirectory(), true);
  const status = JSON.parse(await readFile(join(agentHome, "updater-status.json"), "utf8"));
  assert.equal(status.ok, false);
  assert.match(status.error, /directory|EISDIR|ENOTDIR|operation not permitted/i);
  await assert.rejects(readFile(join(agentHome, "runtime-update.fence"), "utf8"), /ENOENT/);
  await assert.rejects(readFile(join(agentHome, "tick.lock", "owner.pid"), "utf8"), /ENOENT/);
  await assert.rejects(readFile(join(agentHome, "update.lock", "owner.pid"), "utf8"), /ENOENT/);
  process.stdout.write("agent updater generation transaction rollback regression: ok\n");
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(testHome, { recursive: true, force: true });
}
