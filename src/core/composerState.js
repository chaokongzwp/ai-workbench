export function composerLockPresentation({
  busy = false,
  pendingAction = false,
  profileReady = true,
  runningTask = null,
} = {}) {
  if (runningTask) {
    const remoteTaskStatus = String(runningTask.remoteTaskStatus || "").trim();
    const remoteTaskId = String(runningTask.remoteTaskId || "").trim();

    if (remoteTaskStatus === "sync-lost") {
      return {
        locked: true,
        sendBlocked: true,
        code: "syncing",
        text: "正在同步上一条任务",
      };
    }

    if (!remoteTaskId) {
      return {
        locked: true,
        sendBlocked: true,
        code: "checking",
        text: "正在确认上一条任务状态",
      };
    }

    return {
      locked: true,
      sendBlocked: true,
      code: "running",
      text: "任务执行中，完成或停止后可继续",
    };
  }

  if (pendingAction) {
    return {
      locked: true,
      sendBlocked: true,
      code: "action-required",
      text: "请先完成上方的登录或选择",
    };
  }

  if (!profileReady) {
    return {
      locked: true,
      sendBlocked: true,
      code: "setup-required",
      text: "请先完成会话设置",
    };
  }

  if (busy) {
    return {
      locked: false,
      sendBlocked: true,
      code: "operation",
      text: "会话处理中，可以继续编辑",
    };
  }

  return {
    locked: false,
    sendBlocked: false,
    code: "ready",
    text: "",
  };
}
