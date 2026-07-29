export const executionPermissionModeStandard = "standard";
export const executionPermissionModeFullAccess = "full-access";

export const executionPermissionModeOptions = [
  { id: executionPermissionModeStandard, label: "标准权限" },
  { id: executionPermissionModeFullAccess, label: "完全访问" },
];

export function normalizeExecutionPermissionMode(value) {
  return String(value || "").trim().toLowerCase() === executionPermissionModeFullAccess
    ? executionPermissionModeFullAccess
    : executionPermissionModeStandard;
}

export function profileUsesFullAccess(profile) {
  return normalizeExecutionPermissionMode(profile?.executionPermissionMode) === executionPermissionModeFullAccess;
}

export function codexPermissionArgs(profile) {
  if (profileUsesFullAccess(profile)) {
    return ["--dangerously-bypass-approvals-and-sandbox"];
  }
  return ["--sandbox", "danger-full-access"];
}

export function claudeFullAccessBlockedByRoot(profile) {
  const platform = String(profile?.platform || "linux").trim().toLowerCase();
  const username = String(profile?.username || "").trim().toLowerCase();
  return platform !== "windows" && username === "root";
}

export function claudePermissionMode(profile) {
  if (!profileUsesFullAccess(profile) || claudeFullAccessBlockedByRoot(profile)) return "acceptEdits";
  return "bypassPermissions";
}
