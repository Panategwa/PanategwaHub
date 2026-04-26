import { auth } from "./firebase-config.js";

const MAX_STORED_NOTIFICATIONS = 120;

let toastQueue = [];
let toastActive = false;

function ensureToastStyle() {
  const styleId = "achievement-toast-style";
  if (document.getElementById(styleId)) return;

  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    #achievement-toast-stack {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 99999;
      display: grid;
      gap: 10px;
      width: min(360px, calc(100vw - 32px));
    }

    .achievement-toast {
      cursor: pointer;
      border-radius: 14px;
      padding: 14px 16px;
      background: rgba(15, 23, 42, 0.86);
      color: #fff;
      border: 1px solid rgba(148, 163, 184, 0.22);
      box-shadow: 0 12px 28px rgba(2, 6, 23, 0.24);
      backdrop-filter: blur(18px);
      display: grid;
      gap: 5px;
    }

    .achievement-toast-title {
      font-weight: 700;
    }

    .achievement-toast-desc {
      font-size: 0.92rem;
      opacity: 0.86;
      line-height: 1.35;
      white-space: pre-line;
    }
  `;
  document.head.appendChild(style);
}

function getStack() {
  let stack = document.getElementById("achievement-toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "achievement-toast-stack";
    document.body.appendChild(stack);
  }
  return stack;
}

function currentUid(uid = auth.currentUser?.uid) {
  return String(uid || "").trim();
}

function notificationsKey(uid) {
  return `ptg_notifications_${uid}`;
}

function emitNotificationChange(uid) {
  if (!uid) return;
  window.dispatchEvent(new CustomEvent("panategwa:notifications-changed", {
    detail: { uid }
  }));
}

function normalizeStoredNotification(value = {}) {
  return {
    id: String(value.id || `note:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`),
    kind: String(value.kind || "general"),
    title: String(value.title || "Notification"),
    body: String(value.body || ""),
    href: String(value.href || ""),
    read: !!value.read,
    createdAt: Number(value.createdAt || Date.now())
  };
}

function loadNotifications(uid = currentUid()) {
  if (!uid) return [];

  try {
    const raw = localStorage.getItem(notificationsKey(uid));
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => normalizeStoredNotification(entry))
      .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0));
  } catch {
    return [];
  }
}

function saveNotifications(uid, notifications) {
  if (!uid) return;

  try {
    const next = (Array.isArray(notifications) ? notifications : [])
      .map((entry) => normalizeStoredNotification(entry))
      .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0))
      .slice(0, MAX_STORED_NOTIFICATIONS);
    localStorage.setItem(notificationsKey(uid), JSON.stringify(next));
  } catch {}

  emitNotificationChange(uid);
}

export function getStoredNotifications(uid = currentUid()) {
  return loadNotifications(uid);
}

export function getUnreadStoredNotificationCount(uid = currentUid()) {
  return loadNotifications(uid).filter((entry) => !entry.read).length;
}

export function pushStoredNotification(notification = {}, uid = currentUid()) {
  if (!uid) return null;

  const next = normalizeStoredNotification(notification);
  const current = loadNotifications(uid);
  const existingIndex = current.findIndex((entry) => entry.id === next.id);

  if (existingIndex >= 0) {
    current[existingIndex] = {
      ...current[existingIndex],
      ...next,
      createdAt: Math.max(Number(current[existingIndex].createdAt || 0), Number(next.createdAt || 0))
    };
  } else {
    current.unshift(next);
  }

  saveNotifications(uid, current);
  return next;
}

export function setStoredNotificationRead(id, read = true, uid = currentUid()) {
  const targetId = String(id || "").trim();
  if (!uid || !targetId) return;

  const current = loadNotifications(uid);
  const next = current.map((entry) => entry.id === targetId ? { ...entry, read: !!read } : entry);
  saveNotifications(uid, next);
}

export function deleteStoredNotification(id, uid = currentUid()) {
  const targetId = String(id || "").trim();
  if (!uid || !targetId) return;

  const next = loadNotifications(uid).filter((entry) => entry.id !== targetId);
  saveNotifications(uid, next);
}

export function subscribeStoredNotifications(callback, resolveUid = () => currentUid()) {
  const notify = () => callback(loadNotifications(resolveUid()), resolveUid());

  const onLocal = (event) => {
    const activeUid = resolveUid();
    if (!activeUid) {
      callback([], "");
      return;
    }

    if (!event?.detail?.uid || event.detail.uid === activeUid) {
      notify();
    }
  };

  const onStorage = (event) => {
    const activeUid = resolveUid();
    if (!activeUid) return;
    if (event.key === notificationsKey(activeUid)) {
      notify();
    }
  };

  window.addEventListener("panategwa:notifications-changed", onLocal);
  window.addEventListener("storage", onStorage);
  notify();

  return () => {
    window.removeEventListener("panategwa:notifications-changed", onLocal);
    window.removeEventListener("storage", onStorage);
  };
}

export function ensurePanategwaToast() {
  if (typeof document === "undefined") return null;
  if (window.PanategwaToast) return window.PanategwaToast;

  ensureToastStyle();

  window.PanategwaToast = ({
    title = "Message",
    body = "",
    href = "",
    duration = 5000,
    persist = false,
    notificationId = "",
    kind = "general"
  } = {}) => {
    if (persist) {
      pushStoredNotification({
        id: notificationId || "",
        title,
        body,
        href,
        kind,
        read: false,
        createdAt: Date.now()
      });
    }

    toastQueue.push({ title, body, href, duration: Math.max(1200, Number(duration) || 5000) });
    if (toastActive) return;
    toastActive = true;

    const next = () => {
      const item = toastQueue.shift();
      if (!item) {
        toastActive = false;
        return;
      }

      const toast = document.createElement("div");
      toast.className = "achievement-toast";
      const titleEl = document.createElement("div");
      titleEl.className = "achievement-toast-title";
      titleEl.textContent = item.title;

      const bodyEl = document.createElement("div");
      bodyEl.className = "achievement-toast-desc";
      bodyEl.textContent = item.body;

      toast.appendChild(titleEl);
      toast.appendChild(bodyEl);
      toast.addEventListener("click", () => {
        if (item.href) window.location.href = item.href;
      });

      getStack().appendChild(toast);

      window.setTimeout(() => {
        toast.remove();
        next();
      }, item.duration);
    };

    next();
  };

  return window.PanategwaToast;
}
