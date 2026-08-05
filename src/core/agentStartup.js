export function agentCanContinueAfterUpgradeFailure({ alreadyReady = false, installedVersion = 0 } = {}) {
  return Boolean(alreadyReady && Number(installedVersion) > 0);
}

export function agentTaskSubmissionReady({
  available = false,
  installedVersion = 0,
  requiredVersion = 0,
  generationReady = false,
} = {}) {
  const installed = Number(installedVersion) || 0;
  const required = Number(requiredVersion) || 0;
  return Boolean(
    available
    && installed > 0
    && installed >= required
    && (installed < 54 || generationReady === true),
  );
}

export function trustedAgentPlatform(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (["darwin", "mac", "macos"].includes(raw)) return "macos";
  if (raw === "linux" || raw === "windows" || raw === "wsl") return raw;
  return "";
}

export function agentTaskSubmissionTransport({ platform = "", directRouteReady = false, directConfigured = false } = {}) {
  if (trustedAgentPlatform(platform) === "macos") return "ssh-create-now";
  if (directRouteReady === true && directConfigured === true) return "direct";
  return "ssh-create";
}

export function agentTaskMatchesInterruptedSubmission(task = {}, message = {}, conversationId = "") {
  const taskId = String(task?.id || "").trim();
  const taskConversationId = String(task?.conversationId || "").trim();
  const expectedConversationId = String(conversationId || message?.conversationId || "").trim();
  const taskTurnId = String(task?.turnId || "").trim();
  const expectedTurnId = String(message?.turnId || message?.messagePairId || "").trim();
  return Boolean(
    taskId &&
    taskConversationId &&
    expectedConversationId &&
    taskConversationId === expectedConversationId &&
    taskTurnId &&
    expectedTurnId &&
    taskTurnId === expectedTurnId
  );
}
