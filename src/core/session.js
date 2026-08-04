function clean(value) {
  return String(value || "").trim();
}

export function normalizeSessionAgentId(value) {
  return value === "claude" ? "claude" : "codex";
}

export class SessionDispatchInvariantError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "SessionDispatchInvariantError";
    this.code = "AIWB_SESSION_DISPATCH_MISMATCH";
    this.details = details;
  }
}

// This is the immutable identity for one local work session. Host identity is
// deliberately separate: several sessions may share one remote machine.
export function sessionIdentity(session = {}) {
  const profile = session?.profile || {};
  return {
    sessionId: clean(session?.id),
    host: clean(profile?.host).toLowerCase(),
    username: clean(profile?.username),
    workdir: clean(profile?.workdir),
    agentId: normalizeSessionAgentId(profile?.agentId),
    conversationId: clean(session?.conversationId),
  };
}

export function assertSessionDispatch(session, dispatch = {}) {
  const identity = sessionIdentity(session);
  const dispatchSessionId = clean(dispatch?.sessionId);
  const dispatchProfile = dispatch?.profile || {};
  const dispatchHost = clean(dispatchProfile.host).toLowerCase();
  const dispatchUsername = clean(dispatchProfile.username);
  const dispatchWorkdir = clean(dispatchProfile.workdir);
  const dispatchAgentId = normalizeSessionAgentId(dispatch?.agentId);
  const dispatchConversationId = clean(dispatch?.conversationId);

  if (!identity.sessionId) {
    throw new SessionDispatchInvariantError("会话不存在，已阻止任务发送。", { identity, dispatch });
  }
  if (dispatchSessionId && dispatchSessionId !== identity.sessionId) {
    throw new SessionDispatchInvariantError("会话标识不一致，已阻止任务发送。", { identity, dispatch });
  }
  if (dispatchHost && dispatchHost !== identity.host) {
    throw new SessionDispatchInvariantError("会话服务器不一致，已阻止任务发送。", { identity, dispatch });
  }
  if (dispatchUsername && dispatchUsername !== identity.username) {
    throw new SessionDispatchInvariantError("会话登录账号不一致，已阻止任务发送。", { identity, dispatch });
  }
  if (dispatchWorkdir && dispatchWorkdir !== identity.workdir) {
    throw new SessionDispatchInvariantError("会话工作目录不一致，已阻止任务发送。", { identity, dispatch });
  }
  if (dispatchAgentId !== identity.agentId) {
    throw new SessionDispatchInvariantError("会话 AI 类型不一致，已阻止任务发送。", { identity, dispatch });
  }
  if (identity.conversationId && dispatchConversationId && dispatchConversationId !== identity.conversationId) {
    throw new SessionDispatchInvariantError("远端会话标识不一致，已阻止任务发送。", { identity, dispatch });
  }
  return identity;
}
