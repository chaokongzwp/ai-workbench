import {
  mergeTaskMessages,
  sortConversationMessages,
} from "./messageLifecycle.js";

export function mergeWorkspaceMessages(currentMessages = [], incomingMessages = []) {
  const byId = new Map();
  for (const message of [...currentMessages, ...incomingMessages]) {
    const id = String(message?.id || "").trim();
    if (!id) continue;
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, message);
      continue;
    }
    byId.set(
      id,
      message?.role === "assistant" || existing?.role === "assistant"
        ? mergeTaskMessages(existing, message)
        : { ...existing, ...message },
    );
  }
  return sortConversationMessages([...byId.values()]).slice(-120);
}

export function workspaceProfileRevision(value) {
  const revision = Number(value || 0);
  return Number.isFinite(revision) && revision > 0 ? Math.floor(revision) : 0;
}

function normalizeRevisionMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([serverId, revision]) => [String(serverId || "").trim(), workspaceProfileRevision(revision)])
      .filter(([serverId, revision]) => serverId && revision > 0),
  );
}

function normalizedServerId(server) {
  return String(server?.id || "").trim();
}

function maximumRevisionInMap(value) {
  return Math.max(0, ...Object.values(normalizeRevisionMap(value)));
}

export function workspaceProfileEffectiveRevision(profile = {}) {
  return Math.max(
    workspaceProfileRevision(profile.workspaceRevision),
    maximumRevisionInMap(profile.serverTombstones),
    maximumRevisionInMap(profile.messageResetRevisions),
  );
}

function normalizedIdSet(value, fallback = []) {
  return new Set(
    (Array.isArray(value) ? value : fallback)
      .map((serverId) => String(serverId || "").trim())
      .filter(Boolean),
  );
}

function valuesEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (left === undefined || right === undefined) return false;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function plainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function applyThreeWayObject(baseValue = {}, pendingValue = {}, authoritativeValue = {}) {
  if (!plainObject(baseValue) || !plainObject(pendingValue)) return pendingValue;
  const authoritativeObject = plainObject(authoritativeValue) ? authoritativeValue : {};
  const result = { ...authoritativeObject };
  const keys = new Set([...Object.keys(baseValue), ...Object.keys(pendingValue)]);
  for (const key of keys) {
    const baseHasKey = Object.prototype.hasOwnProperty.call(baseValue, key);
    const pendingHasKey = Object.prototype.hasOwnProperty.call(pendingValue, key);
    if (!pendingHasKey && baseHasKey) {
      delete result[key];
      continue;
    }
    if (!pendingHasKey) continue;
    if (!baseHasKey) {
      result[key] = pendingValue[key];
      continue;
    }
    if (valuesEqual(baseValue[key], pendingValue[key])) continue;
    result[key] =
      plainObject(baseValue[key]) && plainObject(pendingValue[key])
        ? applyThreeWayObject(baseValue[key], pendingValue[key], authoritativeObject[key])
        : pendingValue[key];
  }
  return result;
}

function rebaseChangedMessages(authoritativeMessages = [], baseMessages = [], pendingMessages = []) {
  const baseById = new Map(
    (Array.isArray(baseMessages) ? baseMessages : [])
      .map((message) => [String(message?.id || "").trim(), message])
      .filter(([messageId]) => messageId),
  );
  const changedMessages = (Array.isArray(pendingMessages) ? pendingMessages : []).filter((message) => {
    const messageId = String(message?.id || "").trim();
    return messageId && !valuesEqual(baseById.get(messageId), message);
  });
  return mergeWorkspaceMessages(authoritativeMessages, changedMessages);
}

function insertLocallyAddedServerIds(authoritativeOrder, pendingOrder, locallyAddedOrder) {
  const result = [...authoritativeOrder];
  const localIds = new Set(locallyAddedOrder);
  for (const serverId of locallyAddedOrder) {
    const pendingIndex = pendingOrder.indexOf(serverId);
    const previousAnchor = pendingOrder
      .slice(0, pendingIndex)
      .reverse()
      .find((candidateId) => result.includes(candidateId));
    if (previousAnchor) {
      result.splice(result.indexOf(previousAnchor) + 1, 0, serverId);
      continue;
    }
    const nextAnchor = pendingOrder
      .slice(pendingIndex + 1)
      .find((candidateId) => result.includes(candidateId) && !localIds.has(candidateId));
    if (nextAnchor) result.splice(result.indexOf(nextAnchor), 0, serverId);
    else result.push(serverId);
  }
  return result;
}

function mergeMatchingServer(current, server, messages) {
  const currentServerProfile = current.profile && typeof current.profile === "object" ? current.profile : {};
  const incomingServerProfile = server.profile && typeof server.profile === "object" ? server.profile : {};
  const mergedServerProfile = { ...currentServerProfile, ...incomingServerProfile };
  const machineFields = [
    "platform",
    "wslDistro",
    "codexCommand",
    "claudeCommand",
    "agentDirectEndpoint",
    "agentDirectAccessToken",
    "agentDirectTlsFingerprint",
  ];
  const currentMachineRevision = Number(currentServerProfile.machineProfileUpdatedAt || 0);
  const incomingMachineRevision = Number(incomingServerProfile.machineProfileUpdatedAt || 0);
  if (currentMachineRevision > incomingMachineRevision) {
    for (const field of machineFields) mergedServerProfile[field] = currentServerProfile[field];
    mergedServerProfile.machineProfileUpdatedAt = currentMachineRevision;
  } else {
    for (const field of ["agentDirectEndpoint", "agentDirectAccessToken", "agentDirectTlsFingerprint"]) {
      if (!String(incomingServerProfile[field] || "").trim() && String(currentServerProfile[field] || "").trim()) {
        mergedServerProfile[field] = currentServerProfile[field];
      }
    }
    const legacyPlatformDowngrade =
      String(incomingServerProfile.platform || "linux") === "linux" &&
      ["macos", "windows", "wsl"].includes(String(currentServerProfile.platform || ""));
    if (legacyPlatformDowngrade) {
      for (const field of ["platform", "wslDistro", "codexCommand", "claudeCommand"]) {
        mergedServerProfile[field] = currentServerProfile[field];
      }
    }
  }
  const currentSshRevision = Number(currentServerProfile.sshIdentityUpdatedAt || 0);
  const incomingSshRevision = Number(incomingServerProfile.sshIdentityUpdatedAt || 0);
  if (
    currentSshRevision > incomingSshRevision ||
    (!String(incomingServerProfile.sshHostKeyFingerprint || "").trim() &&
      String(currentServerProfile.sshHostKeyFingerprint || "").trim())
  ) {
    mergedServerProfile.sshHostKeyFingerprint = currentServerProfile.sshHostKeyFingerprint;
    mergedServerProfile.sshIdentityUpdatedAt = Math.max(currentSshRevision, incomingSshRevision);
  }
  return {
    ...current,
    ...server,
    profile: mergedServerProfile,
    messages,
  };
}

export function mergeWorkspaceProfile(currentProfile = {}, incomingProfile = {}, options = {}) {
  if (!Array.isArray(incomingProfile.servers)) return incomingProfile;
  const currentRevision = workspaceProfileEffectiveRevision(currentProfile);
  const requestedBaseRevision = workspaceProfileRevision(options.baseRevision ?? incomingProfile.workspaceRevision);
  const serverTombstones = normalizeRevisionMap(currentProfile.serverTombstones);
  const messageResetRevisions = normalizeRevisionMap(currentProfile.messageResetRevisions);
  // Full workspace snapshots are compare-and-set writes. A stale snapshot must
  // be rebased in its renderer from a three-way delta; it is never merged into
  // persistent state here.
  if (requestedBaseRevision !== currentRevision) {
    return {
      ...currentProfile,
      workspaceRevision: currentRevision,
      serverTombstones,
      messageResetRevisions,
    };
  }
  const nextRevision = Math.max(currentRevision + 1, workspaceProfileRevision(options.nextRevision));
  const deletedServerIds = new Set(
    (Array.isArray(options.deletedServerIds) ? options.deletedServerIds : [])
      .map((serverId) => String(serverId || "").trim())
      .filter(Boolean),
  );
  for (const serverId of deletedServerIds) serverTombstones[serverId] = nextRevision;
  const replaceMessageServerIds = normalizedIdSet(
    options.replaceMessageServerIds,
    incomingProfile.servers.map(normalizedServerId),
  );
  if (options.replaceMessages === true) {
    for (const serverId of replaceMessageServerIds) messageResetRevisions[serverId] = nextRevision;
  }

  const currentServers = new Map(
    (Array.isArray(currentProfile.servers) ? currentProfile.servers : [])
      .map((server) => [normalizedServerId(server), server])
      .filter(([serverId]) => serverId && !serverTombstones[serverId] && !deletedServerIds.has(serverId)),
  );
  const incomingServerList = incomingProfile.servers.filter((server) => {
    const serverId = normalizedServerId(server);
    if (!serverId || deletedServerIds.has(serverId)) return false;
    // A deleted session id is never inferred to be restored from a full snapshot.
    // New sessions already receive a new id; a future explicit restore operation can
    // be added without making stale renderer snapshots authoritative again.
    return !serverTombstones[serverId];
  });
  const incomingServers = new Map(
    incomingServerList.map((server) => [normalizedServerId(server), server]),
  );
  const serverIds = [...new Set([
    ...incomingServerList.map(normalizedServerId),
    ...[...currentServers.keys()].filter((serverId) => !incomingServers.has(serverId)),
  ])];
  const servers = serverIds.map((serverId) => {
    const server = incomingServers.get(serverId);
    const current = currentServers.get(serverId);
    if (!server) return current;
    if (!current) return server;
    const messages = options.replaceMessages === true && replaceMessageServerIds.has(serverId)
      ? (Array.isArray(server.messages) ? server.messages : [])
      : mergeWorkspaceMessages(current.messages, server.messages);
    return mergeMatchingServer(current, server, messages);
  });
  const requestedActiveServerId = String(incomingProfile.activeServerId || "").trim();
  const currentActiveServerId = String(currentProfile.activeServerId || "").trim();
  const activeServerId =
    (servers.some((server) => normalizedServerId(server) === requestedActiveServerId) && requestedActiveServerId) ||
    (servers.some((server) => normalizedServerId(server) === currentActiveServerId) && currentActiveServerId) ||
    normalizedServerId(servers[0]);

  return {
    ...currentProfile,
    ...incomingProfile,
    workspaceRevision: nextRevision,
    serverTombstones,
    messageResetRevisions,
    activeServerId,
    servers,
  };
}

export function rebaseWorkspaceProfile(authoritativeProfile = {}, pendingProfile = {}, options = {}) {
  if (!Array.isArray(pendingProfile.servers)) return authoritativeProfile;
  const baseProfile = options.baseProfile && typeof options.baseProfile === "object"
    ? options.baseProfile
    : {};
  const currentRevision = workspaceProfileEffectiveRevision(authoritativeProfile);
  const serverTombstones = normalizeRevisionMap(authoritativeProfile.serverTombstones);
  const messageResetRevisions = normalizeRevisionMap(authoritativeProfile.messageResetRevisions);
  const deletedServerIds = normalizedIdSet(options.deletedServerIds);
  const replaceMessageServerIds = normalizedIdSet(
    options.replaceMessageServerIds,
    pendingProfile.servers.map(normalizedServerId),
  );
  const baseServers = new Map(
    (Array.isArray(baseProfile.servers) ? baseProfile.servers : [])
      .map((server) => [normalizedServerId(server), server])
      .filter(([serverId]) => serverId),
  );
  const authoritativeServers = new Map(
    (Array.isArray(authoritativeProfile.servers) ? authoritativeProfile.servers : [])
      .map((server) => [normalizedServerId(server), server])
      .filter(([serverId]) => serverId && !serverTombstones[serverId] && !deletedServerIds.has(serverId)),
  );
  const pendingServers = new Map(
    pendingProfile.servers
      .map((server) => [normalizedServerId(server), server])
      .filter(([serverId]) => serverId && !serverTombstones[serverId] && !deletedServerIds.has(serverId)),
  );
  const baseOrder = (Array.isArray(baseProfile.servers) ? baseProfile.servers : [])
    .map(normalizedServerId)
    .filter((serverId) => serverId && pendingServers.has(serverId));
  const pendingOrder = pendingProfile.servers
    .map(normalizedServerId)
    .filter((serverId) => serverId && pendingServers.has(serverId));
  const commonPendingOrder = pendingOrder.filter((serverId) => baseServers.has(serverId));
  const commonBaseOrder = baseOrder.filter((serverId) => pendingServers.has(serverId));
  const localOrderChanged = !valuesEqual(commonBaseOrder, commonPendingOrder);
  const authoritativeOrder = (Array.isArray(authoritativeProfile.servers) ? authoritativeProfile.servers : [])
    .map(normalizedServerId)
    .filter((serverId) => serverId && authoritativeServers.has(serverId));
  const locallyAddedOrder = pendingOrder.filter((serverId) => !baseServers.has(serverId));
  const rebasedOrder = localOrderChanged
    ? pendingOrder
    : insertLocallyAddedServerIds(authoritativeOrder, pendingOrder, locallyAddedOrder);
  const serverIds = [...new Set([
    ...rebasedOrder,
    ...authoritativeOrder,
  ])];
  const servers = serverIds.map((serverId) => {
    const authoritativeServer = authoritativeServers.get(serverId);
    const pendingServer = pendingServers.get(serverId);
    const baseServer = baseServers.get(serverId);
    if (!pendingServer) return authoritativeServer;
    if (!baseServer) {
      return authoritativeServer
        ? applyThreeWayObject({}, pendingServer, authoritativeServer)
        : pendingServer;
    }
    if (!authoritativeServer) return pendingServer;
    const rebased = applyThreeWayObject(baseServer, pendingServer, authoritativeServer);
    rebased.messages = options.replaceMessages === true && replaceMessageServerIds.has(serverId)
      ? (Array.isArray(pendingServer.messages) ? pendingServer.messages : [])
      : rebaseChangedMessages(authoritativeServer.messages, baseServer.messages, pendingServer.messages);
    return rebased;
  }).filter(Boolean);
  const rebasedTopLevel = applyThreeWayObject(
    { ...baseProfile, servers: undefined },
    { ...pendingProfile, servers: undefined },
    { ...authoritativeProfile, servers: undefined },
  );
  const requestedActiveServerId = String(rebasedTopLevel.activeServerId || "").trim();
  const authoritativeActiveServerId = String(authoritativeProfile.activeServerId || "").trim();
  const activeServerId =
    (servers.some((server) => normalizedServerId(server) === requestedActiveServerId) && requestedActiveServerId) ||
    (servers.some((server) => normalizedServerId(server) === authoritativeActiveServerId) && authoritativeActiveServerId) ||
    normalizedServerId(servers[0]);
  return {
    ...rebasedTopLevel,
    workspaceRevision: currentRevision,
    serverTombstones,
    messageResetRevisions,
    activeServerId,
    servers,
  };
}

export function mergePendingWorkspaceMutations(existingEntry, incomingEntry = {}) {
  const existing = existingEntry && typeof existingEntry === "object" ? existingEntry : {};
  const incoming = incomingEntry && typeof incomingEntry === "object" ? incomingEntry : {};
  return {
    ...existing,
    ...incoming,
    servers: Array.isArray(incoming.servers)
      ? incoming.servers
      : Array.isArray(existing.servers)
        ? existing.servers
        : [],
    activeServerId: incoming.activeServerId ?? existing.activeServerId ?? "",
    baseRevision: incoming.baseRevision ?? existing.baseRevision ?? 0,
    baseProfile: incoming.baseProfile || existing.baseProfile || null,
    deletedServerIds: [...new Set([
      ...(Array.isArray(existing.deletedServerIds) ? existing.deletedServerIds : []),
      ...(Array.isArray(incoming.deletedServerIds) ? incoming.deletedServerIds : []),
    ].map((serverId) => String(serverId || "").trim()).filter(Boolean))],
    replaceMessages: existing.replaceMessages === true || incoming.replaceMessages === true,
    replaceMessageServerIds: [...new Set([
      ...(Array.isArray(existing.replaceMessageServerIds) ? existing.replaceMessageServerIds : []),
      ...(Array.isArray(incoming.replaceMessageServerIds) ? incoming.replaceMessageServerIds : []),
    ].map((serverId) => String(serverId || "").trim()).filter(Boolean))],
  };
}
