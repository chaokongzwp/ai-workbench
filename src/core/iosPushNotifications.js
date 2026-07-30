import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

const registrationStorageKey = "ai-workbench-ios-push-registration-v1";
const installationStorageKey = "ai-workbench-ios-installation-id-v1";
const registrationRefreshMs = 6 * 24 * 60 * 60 * 1000;
const gatewayTimeoutMs = 3_000;

let listenersPromise = null;
let registrationWaiters = [];
let registrationErrorWaiters = [];

function normalizeEndpoint(value) {
  return String(value || "").trim().replace(/\/+$/g, "");
}

function randomId(prefix) {
  const value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${value}`;
}

function loadJson(key) {
  try {
    return JSON.parse(window.localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function saveJson(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

async function gatewayFetch(url, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), gatewayTimeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Push 服务连接超时。");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function installationId() {
  const current = String(window.localStorage.getItem(installationStorageKey) || "").trim();
  if (current) return current;
  const created = randomId("ios");
  window.localStorage.setItem(installationStorageKey, created);
  return created;
}

function deviceName() {
  const isIpad =
    /iPad/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && Number(navigator.maxTouchPoints || 0) > 1);
  return isIpad ? "iPad" : "iPhone";
}

function notificationData(notification) {
  return notification?.notification?.data || notification?.data || {};
}

function emitPushEvent(notification, opened) {
  if (typeof window === "undefined") return;
  const data = notificationData(notification);
  window.dispatchEvent(
    new CustomEvent("aiwb:ios-push", {
      detail: {
        opened: Boolean(opened),
        conversationId: String(data?.conversationId || "").trim(),
        taskId: String(data?.taskId || "").trim(),
        status: String(data?.status || "").trim(),
        agentId: String(data?.agentId || "").trim(),
      },
    }),
  );
}

export function iosPushSupported() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

async function ensureListeners() {
  if (!iosPushSupported()) return false;
  if (listenersPromise) return listenersPromise;
  listenersPromise = Promise.all([
    PushNotifications.addListener("registration", ({ value }) => {
      const waiters = registrationWaiters;
      registrationWaiters = [];
      registrationErrorWaiters = [];
      waiters.forEach((resolve) => resolve(String(value || "").trim()));
    }),
    PushNotifications.addListener("registrationError", (error) => {
      const waiters = registrationErrorWaiters;
      registrationWaiters = [];
      registrationErrorWaiters = [];
      const resolved = new Error(String(error?.error || error || "iOS Push 注册失败。"));
      waiters.forEach((reject) => reject(resolved));
    }),
    PushNotifications.addListener("pushNotificationReceived", (notification) => {
      emitPushEvent(notification, false);
    }),
    PushNotifications.addListener("pushNotificationActionPerformed", (notification) => {
      emitPushEvent(notification, true);
    }),
  ]).then(() => true);
  return listenersPromise;
}

async function nativeDeviceToken() {
  await ensureListeners();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      registrationWaiters = registrationWaiters.filter((item) => item !== onResolve);
      registrationErrorWaiters = registrationErrorWaiters.filter((item) => item !== onReject);
      reject(new Error("等待 iOS Push 令牌超时。"));
    }, 15_000);
    const onResolve = (value) => {
      window.clearTimeout(timeout);
      resolve(value);
    };
    const onReject = (error) => {
      window.clearTimeout(timeout);
      reject(error);
    };
    registrationWaiters.push(onResolve);
    registrationErrorWaiters.push(onReject);
    PushNotifications.register().catch(onReject);
  });
}

async function registerWithGateway(endpoint, token) {
  const response = await gatewayFetch(`${normalizeEndpoint(endpoint)}/v1/push/devices/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      installationId: installationId(),
      deviceToken: token,
      deviceName: deviceName(),
      platform: "ios",
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.ok === false) {
    throw new Error(result?.error || `Push 设备注册失败：${response.status}`);
  }
  const registration = {
    installationId: String(result.installationId || installationId()),
    deviceToken: token,
    deviceSecret: String(result.deviceSecret || ""),
    pushReady: result.pushReady === true,
    registeredAt: Date.now(),
  };
  saveJson(registrationStorageKey, registration);
  return registration;
}

export async function ensureIosPushRegistration({ endpoint, requestPermission = false } = {}) {
  if (!iosPushSupported()) return null;
  await ensureListeners();
  const permission = requestPermission
    ? await PushNotifications.requestPermissions()
    : await PushNotifications.checkPermissions();
  if (permission.receive !== "granted") {
    if (requestPermission) throw new Error("通知权限未开启。请在系统设置中允许 AI Workbench 发送通知。");
    return null;
  }

  const current = loadJson(registrationStorageKey);
  if (
    current?.deviceSecret &&
    current?.deviceToken &&
    Date.now() - Number(current.registeredAt || 0) < registrationRefreshMs
  ) {
    return current;
  }
  const token = await nativeDeviceToken();
  if (!token) throw new Error("没有取得 iOS Push 令牌。");
  return registerWithGateway(endpoint, token);
}

export async function disableIosPushNotifications() {
  if (!iosPushSupported()) return;
  window.localStorage.removeItem(registrationStorageKey);
  await PushNotifications.unregister();
}

export async function createIosTaskPushTicket({
  endpoint,
  taskId,
  conversationId,
  conversationName,
  agentId,
} = {}) {
  if (!iosPushSupported()) return null;
  const registration = await ensureIosPushRegistration({ endpoint, requestPermission: false });
  if (!registration?.deviceSecret) return null;

  const request = () =>
    gatewayFetch(`${normalizeEndpoint(endpoint)}/v1/push/tickets`, {
      method: "POST",
      headers: {
        Authorization: `Device ${registration.installationId}:${registration.deviceSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        taskId,
        conversationId,
        conversationName,
        agentId,
      }),
    });
  let response = await request();
  if (response.status === 401) {
    window.localStorage.removeItem(registrationStorageKey);
    const refreshed = await ensureIosPushRegistration({ endpoint, requestPermission: false });
    if (!refreshed?.deviceSecret) return null;
    response = await gatewayFetch(`${normalizeEndpoint(endpoint)}/v1/push/tickets`, {
      method: "POST",
      headers: {
        Authorization: `Device ${refreshed.installationId}:${refreshed.deviceSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ taskId, conversationId, conversationName, agentId }),
    });
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.ok === false) {
    throw new Error(result?.error || `创建 Push 通知票据失败：${response.status}`);
  }
  return {
    ticketId: String(result.ticketId || ""),
    notifyUrl: `${normalizeEndpoint(endpoint)}${String(result.notifyPath || "")}`,
    notifyToken: String(result.notifyToken || ""),
    pushReady: result.pushReady === true,
  };
}
