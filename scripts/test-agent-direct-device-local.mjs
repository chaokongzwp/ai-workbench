import assert from "node:assert/strict";

import {
  buildCloudSyncPlainPayload,
  buildWorkspaceMigrationPayload,
  createServerSession,
  mergeCloudDownloadedServers,
  mergeCloudSharedSessions,
  mergeImportedServers,
  parseWorkspaceMigrationText,
  sessionShareFromServer,
} from "../src/core/foundation.js";

const directFields = {
  agentDirectEndpoint: "https://100.88.88.36:8787",
  agentDirectAccessToken: "local-device-token",
  agentDirectTlsFingerprint: "sha256/local-device-fingerprint",
};

const revisionFields = {
  machineProfileUpdatedAt: 1_785_700_001_000,
  sshIdentityUpdatedAt: 1_785_700_002_000,
};

const local = createServerSession({
  id: "local-session",
  conversationId: "local-runtime",
  name: "Local",
  profile: {
    platform: "macos",
    host: "100.88.88.36",
    port: 22,
    username: "a0",
    password: "password",
    workdir: "/Users/a0/Documents/x",
    agentId: "claude",
    ...revisionFields,
    ...directFields,
  },
});

function assertDirectFieldsExcluded(profile, label) {
  for (const key of Object.keys(directFields)) {
    assert.equal(Object.hasOwn(profile, key), false, `${label} must exclude ${key}`);
  }
}

assertDirectFieldsExcluded(
  buildCloudSyncPlainPayload([local], local.id).workspace.servers[0].profile,
  "cloud sync",
);
const cloudProfile = buildCloudSyncPlainPayload([local], local.id).workspace.servers[0].profile;
const migrationProfile = buildWorkspaceMigrationPayload([local], local.id).workspace.servers[0].profile;
assertDirectFieldsExcluded(migrationProfile, "migration export");
assertDirectFieldsExcluded(sessionShareFromServer(local).profile, "session share");
for (const [key, value] of Object.entries(revisionFields)) {
  assert.equal(cloudProfile[key], value, `cloud sync must retain ${key}`);
  assert.equal(migrationProfile[key], value, `migration export must retain ${key}`);
}

const hostileShare = sessionShareFromServer(local);
hostileShare.profile = { ...hostileShare.profile, ...directFields };
const importedShare = mergeCloudSharedSessions([], [{ id: "hostile-share", session: hostileShare }]).addedServers[0];
assert.ok(importedShare, "a valid shared session should still import");
for (const key of Object.keys(directFields)) {
  assert.equal(importedShare.profile[key], "", `shared input must clear untrusted ${key}`);
}

const legacyImport = parseWorkspaceMigrationText(JSON.stringify({
  version: 5,
  activeServerId: local.id,
  servers: [{ ...local, profile: { ...local.profile, ...directFields } }],
}));
for (const key of Object.keys(directFields)) {
  assert.equal(legacyImport.store.servers[0].profile[key], "", `legacy migration import must clear ${key}`);
}
const imported = mergeImportedServers([local], legacyImport.store.servers)[0];
for (const [key, value] of Object.entries(directFields)) {
  assert.equal(imported.profile[key], value, `same-connection import must preserve local ${key}`);
}

const changedCloud = buildCloudSyncPlainPayload([
  createServerSession({
    ...local,
    name: "Cloud rename",
    profile: {
      ...local.profile,
      name: "Cloud rename",
      environmentVariables: "UPLOAD_TEST=1",
      ...Object.fromEntries(Object.keys(directFields).map((key) => [key, "cloud-must-not-win"])),
    },
  }),
], local.id);
const merged = mergeCloudDownloadedServers([local], changedCloud).updatedServers[0];
assert.ok(merged, "same-connection cloud edits should update the local session");
assert.equal(merged.profile.environmentVariables, "UPLOAD_TEST=1");
for (const [key, value] of Object.entries(directFields)) {
  assert.equal(merged.profile[key], value, `same-connection merge must preserve local ${key}`);
}

const movedCloud = buildCloudSyncPlainPayload([
  createServerSession({
    ...local,
    name: "Moved",
    profile: {
      ...local.profile,
      host: "100.88.88.99",
      ...directFields,
    },
  }),
], local.id);
const moved = mergeCloudDownloadedServers([local], movedCloud).updatedServers[0];
assert.ok(moved, "connection identity changes should update an idle session");
for (const key of Object.keys(directFields)) {
  assert.equal(moved.profile[key], "", `a different machine must not inherit local ${key}`);
}

console.log("Agent direct device-local profile tests passed");
