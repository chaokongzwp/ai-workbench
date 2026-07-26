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
        code: "syncing",
        text: "正在同步上一条任务，暂时不能输入。",
      };
    }

    if (!remoteTaskId) {
      return {
        locked: true,
        code: "checking",
        text: "正在确认上一条任务状态，暂时不能输入。",
      };
    }

    return {
      locked: true,
      code: "running",
      text: "上一条任务正在执行，完成或停止后可继续。",
    };
  }

  if (pendingAction) {
    return {
      locked: true,
      code: "action-required",
      text: "请先完成上方的登录或选项。",
    };
  }

  if (busy) {
    return {
      locked: true,
      code: "busy",
      text: "正在处理会话操作，请稍候。",
    };
  }

  if (!profileReady) {
    return {
      locked: true,
      code: "setup-required",
      text: "会话配置不完整，请先完成设置。",
    };
  }

  return {
    locked: false,
    code: "ready",
    text: "",
  };
}
