import { auth } from "./firebase-config.js";

const MAX_STORED_NOTIFICATIONS = 120;
const AUDIO_SETTINGS_KEY = "ptg_audio_settings";
const DEFAULT_AUDIO_SETTINGS = Object.freeze({
  masterVolume: 100,
  popupVolume: 70,
  musicVolume: 70,
  lastMasterVolume: 100,
  lastPopupVolume: 70,
  lastMusicVolume: 70
});

let toastQueue = [];
let toastActive = false;
let toastAudioContext = null;
let toastAudioUnlockInstalled = false;
let lastToastSoundAt = 0;
let activeToastTimer = 0;

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

function ensureToastAudioContext() {
  if (toastAudioContext) return toastAudioContext;
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;
  toastAudioContext = new AudioContextCtor();
  return toastAudioContext;
}

function installToastAudioUnlock() {
  if (toastAudioUnlockInstalled || typeof window === "undefined") return;
  toastAudioUnlockInstalled = true;

  const unlock = async () => {
    const ctx = ensureToastAudioContext();
    if (!ctx) return;

    try {
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
    } catch {}

    if (ctx.state === "running") {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
      window.removeEventListener("touchstart", unlock, true);
    }
  };

  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
  window.addEventListener("touchstart", unlock, true);
}

async function playToastSound() {
  try {
    const now = Date.now();
    if (now - lastToastSoundAt < 120) return;
    lastToastSoundAt = now;

    const audioSettings = getToastAudioSettings();
    const masterVolume = clampPercent(audioSettings.masterVolume, DEFAULT_AUDIO_SETTINGS.masterVolume);
    const popupVolume = clampPercent(audioSettings.popupVolume, DEFAULT_AUDIO_SETTINGS.popupVolume);
    const effectivePopupVolume = Math.round((masterVolume * popupVolume) / 100);
    if (effectivePopupVolume <= 0) return;

    const ctx = ensureToastAudioContext();
    if (!ctx) return;

    if (ctx.state === "suspended") {
      await ctx.resume().catch(() => {});
    }
    if (ctx.state !== "running") return;

    const start = ctx.currentTime + 0.01;
    const master = ctx.createGain();
    const peakGain = 0.01 + (effectivePopupVolume / 100) * 0.04;
    master.gain.setValueAtTime(0.0001, start);
    master.gain.exponentialRampToValueAtTime(peakGain, start + 0.02);
    master.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);
    master.connect(ctx.destination);

    const primary = ctx.createOscillator();
    primary.type = "sine";
    primary.frequency.setValueAtTime(740, start);
    primary.frequency.exponentialRampToValueAtTime(980, start + 0.18);
    primary.connect(master);
    primary.start(start);
    primary.stop(start + 0.24);

    const shimmer = ctx.createOscillator();
    shimmer.type = "triangle";
    shimmer.frequency.setValueAtTime(1180, start + 0.02);
    shimmer.frequency.exponentialRampToValueAtTime(1560, start + 0.20);
    shimmer.connect(master);
    shimmer.start(start + 0.02);
    shimmer.stop(start + 0.26);
  } catch {}
}

function currentUid(uid = auth.currentUser?.uid) {
  return String(uid || "").trim();
}

function notificationsKey(uid) {
  return `ptg_notifications_${uid}`;
}

function clampPercent(value, fallback = 0) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(0, Math.min(100, Math.round(next)));
}

function audioMemoryKey(channel) {
  if (channel === "masterVolume") return "lastMasterVolume";
  if (channel === "popupVolume") return "lastPopupVolume";
  if (channel === "musicVolume") return "lastMusicVolume";
  return "";
}

function normalizeAudioSettings(value = {}) {
  const next = {
    masterVolume: clampPercent(value.masterVolume, DEFAULT_AUDIO_SETTINGS.masterVolume),
    popupVolume: clampPercent(value.popupVolume, DEFAULT_AUDIO_SETTINGS.popupVolume),
    musicVolume: clampPercent(value.musicVolume, DEFAULT_AUDIO_SETTINGS.musicVolume),
    lastMasterVolume: clampPercent(value.lastMasterVolume, DEFAULT_AUDIO_SETTINGS.lastMasterVolume),
    lastPopupVolume: clampPercent(value.lastPopupVolume, DEFAULT_AUDIO_SETTINGS.lastPopupVolume),
    lastMusicVolume: clampPercent(value.lastMusicVolume, DEFAULT_AUDIO_SETTINGS.lastMusicVolume)
  };

  if (next.masterVolume > 0) next.lastMasterVolume = next.masterVolume;
  if (next.popupVolume > 0) next.lastPopupVolume = next.popupVolume;
  if (next.musicVolume > 0) next.lastMusicVolume = next.musicVolume;

  return next;
}

function emitAudioSettingsChange(settings) {
  window.dispatchEvent(new CustomEvent("panategwa:audio-settings-change", {
    detail: { settings: normalizeAudioSettings(settings) }
  }));
}

export function getToastAudioSettings() {
  try {
    const raw = localStorage.getItem(AUDIO_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_AUDIO_SETTINGS };
    return normalizeAudioSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

export function updateToastAudioSettings(patch = {}) {
  const next = normalizeAudioSettings({
    ...getToastAudioSettings(),
    ...(patch || {})
  });

  try {
    localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(next));
  } catch {}

  emitAudioSettingsChange(next);
  return next;
}

export function setToastAudioChannelVolume(channel, value) {
  const targetChannel = String(channel || "").trim();
  const memoryKey = audioMemoryKey(targetChannel);
  if (!memoryKey) return getToastAudioSettings();

  const nextVolume = clampPercent(value, DEFAULT_AUDIO_SETTINGS[targetChannel]);
  const patch = { [targetChannel]: nextVolume };
  if (nextVolume > 0) {
    patch[memoryKey] = nextVolume;
  }

  return updateToastAudioSettings(patch);
}

export function toggleToastAudioChannelMute(channel) {
  const targetChannel = String(channel || "").trim();
  const memoryKey = audioMemoryKey(targetChannel);
  if (!memoryKey) return getToastAudioSettings();

  const current = getToastAudioSettings();
  const currentVolume = clampPercent(current[targetChannel], DEFAULT_AUDIO_SETTINGS[targetChannel]);
  const rememberedVolume = clampPercent(current[memoryKey], DEFAULT_AUDIO_SETTINGS[memoryKey]);

  if (currentVolume > 0) {
    return updateToastAudioSettings({
      [targetChannel]: 0,
      [memoryKey]: currentVolume
    });
  }

  return updateToastAudioSettings({
    [targetChannel]: rememberedVolume > 0 ? rememberedVolume : DEFAULT_AUDIO_SETTINGS[targetChannel]
  });
}

export function clearPanategwaToasts() {
  toastQueue = [];
  toastActive = false;

  if (activeToastTimer) {
    window.clearTimeout(activeToastTimer);
    activeToastTimer = 0;
  }

  if (typeof document === "undefined") return;
  const stack = document.getElementById("achievement-toast-stack");
  if (stack) {
    stack.replaceChildren();
  }
}

function emitNotificationChange(uid) {
  if (!uid) return;
  window.dispatchEvent(new CustomEvent("panategwa:notifications-changed", {
    detail: { uid }
  }));
}

function openToastHref(href) {
  const target = String(href || "").trim();
  if (!target) return;

  try {
    const url = new URL(target, window.location.href);
    const page = String(url.pathname.split("/").pop() || "").trim().toLowerCase();

    if (page === "account-page.html" && typeof window.openAccountArea === "function") {
      const section = String(url.searchParams.get("tab") || "info").trim().toLowerCase();
      const sub = String(url.searchParams.get("sub") || "").trim() || null;
      const targetId = String(url.searchParams.get("target") || "").trim() || null;
      window.openAccountArea(section, sub, targetId);
      return;
    }

    window.location.href = url.toString();
  } catch {
    window.location.href = target;
  }
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
  installToastAudioUnlock();

  window.PanategwaToast = ({
    title = "Message",
    body = "",
    href = "",
    duration = 5000,
    persist = false,
    notificationId = "",
    kind = "general",
    clearExisting = false
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

    if (clearExisting) {
      clearPanategwaToasts();
    }

    toastQueue.push({
      title,
      body,
      href,
      notificationId: String(notificationId || "").trim(),
      persist: !!persist,
      clearExisting: !!clearExisting,
      duration: Math.max(1200, Number(duration) || 5000)
    });
    if (toastActive) return;
    toastActive = true;

    const next = () => {
      const item = toastQueue.shift();
      if (!item) {
        toastActive = false;
        return;
      }

      playToastSound();

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
        if (item.persist && item.notificationId) {
          setStoredNotificationRead(item.notificationId, true);
        }
        if (item.href) openToastHref(item.href);
      });

      getStack().appendChild(toast);

      activeToastTimer = window.setTimeout(() => {
        activeToastTimer = 0;
        toast.remove();
        next();
      }, item.duration);
    };

    next();
  };

  return window.PanategwaToast;
}
