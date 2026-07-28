import {
  taskStateForMessage,
  taskStateIsActive,
  taskStateSubmitting,
  taskStateSyncing,
} from "./messageLifecycle.js";

export function composerLockPresentation({
  busy = false,
  pendingAction = false,
  profileReady = true,
  runningTask = null,
} = {}) {
  const taskState = taskStateForMessage(runningTask);
  if (runningTask && taskStateIsActive(taskState)) {
    if (taskState === taskStateSyncing) {
      return {
        locked: true,
        sendBlocked: true,
        code: "syncing",
        text: "正在同步上一条任务",
      };
    }

    if (taskState === taskStateSubmitting) {
      return {
        locked: true,
        sendBlocked: true,
        code: "submitting",
        text: "正在发送",
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
      locked: false,
      sendBlocked: true,
      code: "action-required",
      text: "请先完成上方的登录或选择，输入内容会保留",
    };
  }

  if (!profileReady) {
    return {
      locked: false,
      sendBlocked: true,
      code: "setup-required",
      text: "请先完成会话设置，输入内容会保留",
    };
  }

  if (busy) {
    return {
      locked: false,
      sendBlocked: false,
      code: "operation",
      text: "",
    };
  }

  return {
    locked: false,
    sendBlocked: false,
    code: "ready",
    text: "",
  };
}
