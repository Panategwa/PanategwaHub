import {
  resendVerificationEmail,
  refreshCurrentUserSession,
  getDefaultAvatarDataUrl,
  formatSiteTimeDuration,
  getResolvedProfileSiteTime,
  normalizePrivacySettings,
  createAccount,
  login,
  loginWithGoogle,
  getAccountSlots,
  getActiveAccountSlotId,
  activateAccountSlot,
  activateFirstEmptyAccountSlot,
  removeAccountSlot,
  subscribeAccountSlots,
  watchAuth,
  getProfile
} from "./auth.js";
import { initializeLoginUI } from "./login.js";
import { auth, authReady } from "./firebase-config.js";

import {
  subscribeSocial,
  sendFriendRequestById,
  respondToFriendRequest,
  removeFriend,
  blockUser,
  unblockUser,
  markMessageRead,
  setMessageDeletedForCurrentUser,
  loadAccountProfile,
  sendDirectMessage
} from "./social.js";

import { ACHIEVEMENTS } from "./achievements.js";
import {
  getStoredNotifications,
  pushStoredNotification,
  setStoredNotificationRead,
  deleteStoredNotification,
  subscribeStoredNotifications
} from "./toast.js";

const $ = (id) => document.getElementById(id);

let currentState = {
  user: null,
  profile: null,
  ready: false,
  socialError: null,
  friends: [],
  blocked: [],
  incomingRequests: [],
  outgoingRequests: [],
  friendProfiles: {},
  messages: [],
  unreadCount: 0,
  localNotifications: []
};

const baseOpenAccountArea = typeof window.openAccountArea === "function"
  ? window.openAccountArea.bind(window)
  : null;
const FRIENDS_SUBSECTIONS = new Set(["friends", "requests", "blocked"]);
const SETTINGS_SUBSECTIONS = new Set(["account", "privacy"]);
let copiedUserIdValue = null;
let copiedUserIdUntil = 0;
let accountUnsubs = [];
let accountBound = false;
let copiedUserIdTimer = null;
let lastAchievementSignature = "";
let authHydrated = false;
const MAX_NOTIFICATION_HISTORY = 20;
let notificationUndoStack = [];
let notificationRedoStack = [];
let notificationHistoryUserId = "";
let viewedProfileLoadKey = "";
let viewedProfileLoadVersion = 0;
const directMessageReadInFlight = new Set();
const directMessageReadRequested = new Set();

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(text, kind = "info") {
  const el = $("auth-status");
  if (!el) return;
  el.textContent = text;
  el.dataset.kind = kind;
}

function copyIcon() {
  return `
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path fill="currentColor" d="M8 7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2z"/>
      <path fill="currentColor" d="M6 3h9v2H6a1 1 0 0 0-1 1v9H3V6a3 3 0 0 1 3-3z"/>
    </svg>
  `;
}

function verifiedBadgeMarkup(verified) {
  if (!verified) return "";
  return `
    <span class="avatar-verified-badge" aria-label="Verified account" title="Verified account">
      <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
        <path fill="currentColor" d="M9.55 18.2 4.8 13.45l1.4-1.4 3.35 3.35 8.25-8.25 1.4 1.4z"/>
      </svg>
    </span>
  `;
}

function avatarMarkup(src, alt, className, verified = false) {
  return `
    <span class="avatar-shell ${verified ? "verified" : ""}">
      <img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" class="${escapeHtml(className)}" />
      ${verifiedBadgeMarkup(verified)}
    </span>
  `;
}

function checkIcon() {
  return `
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path fill="currentColor" d="M9.55 18.2 4.8 13.45l1.4-1.4 3.35 3.35 8.25-8.25 1.4 1.4z"/>
    </svg>
  `;
}

function getRank(xp) {
  if (xp >= 30) return "Veteran";
  if (xp >= 20) return "Experienced";
  if (xp >= 10) return "Explorer";
  return "Adventurer";
}

function getRankInfo(xp) {
  if (xp >= 30) return { current: "Veteran", next: "Max rank", start: 30, end: 30 };
  if (xp >= 20) return { current: "Experienced", next: "Veteran", start: 20, end: 30 };
  if (xp >= 10) return { current: "Explorer", next: "Experienced", start: 10, end: 20 };
  return { current: "Adventurer", next: "Explorer", start: 0, end: 10 };
}

function progressPercent(xp) {
  const info = getRankInfo(xp);
  if (xp >= 30) return 100;
  return Math.max(0, Math.min(100, ((xp - info.start) / Math.max(1, info.end - info.start)) * 100));
}

function relativeSince(value) {
  let ms = 0;
  if (value?.toDate) ms = value.toDate().getTime();
  else if (typeof value?.toMillis === "function") ms = value.toMillis();
  else if (typeof value?.seconds === "number") ms = value.seconds * 1000;
  else if (typeof value === "number") ms = value;
  else if (value instanceof Date) ms = value.getTime();
  if (!ms) return "--";

  const diff = Math.max(0, Date.now() - ms);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const month = 30 * day;
  const year = 365 * day;

  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))} mins`;
  if (diff < day) return `${Math.floor(diff / hour)} hours`;
  if (diff < month) return `${Math.floor(diff / day)} days`;
  if (diff < year) return `${Math.floor(diff / month)} months`;
  return `${Math.floor(diff / year)} years`;
}

function toMs(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  return 0;
}

function relativeTime(value) {
  const ms = toMs(value);
  if (!ms) return "Just now";

  const diff = Math.max(0, Date.now() - ms);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  if (diff < minute) return "Just now";
  if (diff < hour) {
    const amount = Math.floor(diff / minute);
    return `${amount} min${amount === 1 ? "" : "s"} ago`;
  }
  if (diff < day) {
    const amount = Math.floor(diff / hour);
    return `${amount} hour${amount === 1 ? "" : "s"} ago`;
  }
  if (diff < week) {
    const amount = Math.floor(diff / day);
    return `${amount} day${amount === 1 ? "" : "s"} ago`;
  }
  if (diff < month) {
    const amount = Math.floor(diff / week);
    return `${amount} week${amount === 1 ? "" : "s"} ago`;
  }
  if (diff < year) {
    const amount = Math.floor(diff / month);
    return `${amount} month${amount === 1 ? "" : "s"} ago`;
  }

  const amount = Math.floor(diff / year);
  return `${amount} year${amount === 1 ? "" : "s"} ago`;
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line, index, list) => line || index < list.length - 1)
    .join("\n")
    .trim();
}

function formatAchievementBody(text) {
  return String(text || "").replace(/\s-\s(\+\d+\sXP\b)/i, "\n$1");
}

function formatNotificationBody(kind, value) {
  const text = stripHtml(value || "");
  if (String(kind || "") === "achievement") {
    return formatAchievementBody(text);
  }
  return text;
}

function isVerifiedState(user, profile = null) {
  // Only Firebase's current Auth state is authoritative. Profile documents
  // can lag behind a changed email or a refreshed verification link.
  return user?.emailVerified === true;
}

function resolvedUser(state = currentState) {
  return state?.user || auth.currentUser || null;
}

function resolvedProfile(state = currentState) {
  return state?.profile || null;
}

function resolvedOwnSiteTimeMs(profile = resolvedProfile(currentState), user = resolvedUser(currentState)) {
  const uid = String(user?.uid || profile?.uid || "").trim();
  return getResolvedProfileSiteTime(profile || {}, uid);
}

function withResolvedOwnSiteTime(profile, user) {
  if (!profile || !user?.uid) return profile;
  return {
    ...profile,
    siteTimeMs: getResolvedProfileSiteTime(profile, user.uid)
  };
}

function normalizeAccountSection(section = "info") {
  return String(section || "info").trim().toLowerCase();
}

function isFriendsView(section = "info", sub = null) {
  const rawSection = String(section || "info").trim().toLowerCase();
  const nextSub = String(sub || "").trim().toLowerCase();
  return rawSection === "friends" || FRIENDS_SUBSECTIONS.has(nextSub);
}

function isSettingsView(section = "info", sub = null) {
  return normalizeAccountSection(section) === "settings" || SETTINGS_SUBSECTIONS.has(String(sub || "").trim().toLowerCase());
}

function isUserIdCopied(uid) {
  return copiedUserIdValue === uid && Date.now() < copiedUserIdUntil;
}

function scheduleCopiedUserIdReset() {
  if (copiedUserIdTimer) {
    window.clearTimeout(copiedUserIdTimer);
    copiedUserIdTimer = null;
  }

  const remaining = copiedUserIdUntil - Date.now();
  if (remaining <= 0) {
    copiedUserIdValue = null;
    copiedUserIdUntil = 0;
    return;
  }

  copiedUserIdTimer = window.setTimeout(() => {
    copiedUserIdValue = null;
    copiedUserIdUntil = 0;
    copiedUserIdTimer = null;
    renderAuth(currentState);
  }, remaining);
}

function markUserIdCopied(uid) {
  copiedUserIdValue = uid;
  copiedUserIdUntil = Date.now() + 5000;
  scheduleCopiedUserIdReset();
}

function formatDateOnly(value) {
  if (!value) return "--";
  if (typeof value?.toDate === "function") return value.toDate().toLocaleDateString();
  if (typeof value === "number") return new Date(value).toLocaleDateString();
  if (value instanceof Date) return value.toLocaleDateString();
  return "--";
}

function initials(value, fallback = "P") {
  return String(value || "").trim().slice(0, 1).toUpperCase() || fallback;
}

function currentInfoTargetId() {
  const params = new URLSearchParams(window.location.search);
  const section = normalizeAccountSection(params.get("tab") || "info");
  const targetId = String(params.get("target") || "").trim();
  return section === "info" && targetId ? targetId : "";
}

function currentMessageSub() {
  const params = new URLSearchParams(window.location.search);
  return String(params.get("tab") || "").toLowerCase() === "messages"
    ? String(params.get("sub") || "inbox").toLowerCase()
    : "inbox";
}

function currentChatUid() {
  return currentMessageSub() === "chat"
    ? String(new URLSearchParams(window.location.search).get("target") || "").trim()
    : "";
}

function setMessageView(view) {
  const selected = view === "activity" ? "activity" : "inbox";
  document.querySelectorAll("[data-message-view]").forEach((button) => {
    const active = button.dataset.messageView === selected;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-message-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.messagePanel !== selected;
  });
}

function ensureViewedProfileLoaded(state) {
  const user = resolvedUser(state);
  const targetUid = currentInfoTargetId();
  if (!user || !targetUid || targetUid === user.uid) {
    viewedProfileLoadKey = "";
    return;
  }

  const cachedProfile = state.friendProfiles?.[targetUid];
  if (user.emailVerified !== true) {
    viewedProfileLoadKey = "";
    if (cachedProfile?.unavailableReason !== "verification-required") {
      currentState.friendProfiles = {
        ...(currentState.friendProfiles || {}),
        [targetUid]: {
          uid: targetUid,
          username: "Player",
          profileUnavailable: true,
          unavailableReason: "verification-required"
        }
      };
    }
    return;
  }

  if (cachedProfile && cachedProfile.unavailableReason !== "verification-required") return;
  if (cachedProfile?.unavailableReason === "verification-required") {
    const nextProfiles = { ...(currentState.friendProfiles || {}) };
    delete nextProfiles[targetUid];
    currentState.friendProfiles = nextProfiles;
  }

  const key = `${user.uid}:${targetUid}`;
  if (viewedProfileLoadKey === key) return;
  viewedProfileLoadKey = key;
  const version = ++viewedProfileLoadVersion;
  loadAccountProfile(targetUid).then((profile) => {
    if (version !== viewedProfileLoadVersion || currentInfoTargetId() !== targetUid) return;
    currentState.friendProfiles = {
      ...(currentState.friendProfiles || {}),
      [targetUid]: profile || { uid: targetUid, username: "Player", profileUnavailable: true }
    };
    renderAll(currentState);
  }).catch((error) => {
    console.error("Could not load profile:", error);
    if (version !== viewedProfileLoadVersion || currentInfoTargetId() !== targetUid) return;
    currentState.friendProfiles = {
      ...(currentState.friendProfiles || {}),
      [targetUid]: { uid: targetUid, username: "Player", profileUnavailable: true }
    };
    renderAll(currentState);
  });
}

function updateSidebarAvatar(profile, user) {
  const photoURL = profile?.photoURL || (user ? getDefaultAvatarDataUrl() : "");
  localStorage.setItem("panategwa_sidebar_avatar_url", photoURL || "");

  if (typeof window.PanategwaUpdateSidebarAvatar === "function") {
    window.PanategwaUpdateSidebarAvatar(user && photoURL ? photoURL : "");
  }
}

function buildAccountHref(section, sub = null, targetId = null) {
  const params = new URLSearchParams();
  if (section) params.set("tab", normalizeAccountSection(section));
  if (sub) params.set("sub", String(sub || "").trim());
  if (targetId) params.set("target", String(targetId || "").trim());
  const query = params.toString();
  const root = typeof window !== "undefined" && window.PanategwaRoot ? window.PanategwaRoot : "";
  const page = `${root}main-pages/account/account-page.html`;
  return query ? `${page}?${query}` : page;
}

function socialNotificationHref(message) {
  const kind = String(message?.kind || "").trim();
  const targetUid = String(message?.fromUid || message?.targetId || "").trim();

  if (kind === "friend-request") return buildAccountHref("friends", "requests");
  if (kind === "friend-accepted") return buildAccountHref("info", null, targetUid || null);
  if (kind === "friend-declined") return buildAccountHref("friends", "requests");
  if (kind === "friend-removed") return buildAccountHref("friends", "friends");
  if (kind === "friend-blocked") return buildAccountHref("friends", "blocked");

  const section = normalizeAccountSection(message?.targetSection || "messages");
  const sub = String(message?.targetSubSection || "").trim() || null;
  const targetId = String(message?.targetId || "").trim() || null;
  return buildAccountHref(section, sub, targetId);
}

function localNotificationHref(entry) {
  const kind = String(entry?.kind || "").trim();
  const rawId = String(entry?.id || "").trim();

  if (kind === "achievement") {
    const achievementId = rawId.startsWith("achievement:") ? rawId.slice("achievement:".length).trim() : "";
    return buildAccountHref("progress", null, achievementId || null);
  }

  if (kind === "streak") {
    const streakRoot = typeof window !== "undefined" && window.PanategwaRoot ? window.PanategwaRoot : "";
    return `${streakRoot}main-pages/streak/streak-page.html`;
  }

  return String(entry?.href || "").trim();
}

// Only follow http(s). Notification hrefs are built here, but the records
// behind them round-trip through localStorage, and assigning a "javascript:"
// URL to location.href would execute it.
function navigateTo(target) {
  let url;
  try {
    url = new URL(target, window.location.href);
  } catch {
    return;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  window.location.href = url.href;
}

function openNotificationHref(href) {
  const target = String(href || "").trim();
  if (!target) return;

  try {
    const url = new URL(target, window.location.href);
    const page = String(url.pathname.split("/").pop() || "").trim().toLowerCase();

    if (page === "account-page.html" && typeof window.openAccountArea === "function") {
      const section = normalizeAccountSection(url.searchParams.get("tab") || "info");
      const sub = String(url.searchParams.get("sub") || "").trim() || null;
      const targetId = String(url.searchParams.get("target") || "").trim() || null;
      window.openAccountArea(section, sub, targetId);
      return;
    }

    navigateTo(url.toString());
  } catch {
    navigateTo(target);
  }
}

function syncMessagesTabBadge(state) {
  const button = $("tab-messages");
  if (!button) return;

  const unread = Number(state.unreadCount || 0) + (Array.isArray(state.localNotifications) ? state.localNotifications.filter((entry) => !entry.read).length : 0);
  const canUseMessages = isVerifiedState(resolvedUser(state), resolvedProfile(state));
  button.classList.toggle("has-dot", canUseMessages && unread > 0);
  button.setAttribute("aria-label", canUseMessages && unread > 0 ? `Messages and activity (${unread} unread)` : "Messages and activity");
  button.title = canUseMessages && unread > 0 ? `${unread} unread item${unread === 1 ? "" : "s"}` : "Messages and activity";
}

function setVisible(id, visible) {
  const el = $(id);
  if (!el) return;
  el.classList.toggle("section-hidden", !visible);
}

function isAuthRestoring() {
  return !authHydrated && !resolvedUser(currentState);
}

function updateLockedPanel(prefix, loggedIn, verified, restoring = false) {
  const title = $(`${prefix}-locked-title`);
  const copy = $(`${prefix}-locked-copy`);
  const refreshBtn = $(`${prefix}-locked-refresh-btn`);
  const resendBtn = $(`${prefix}-locked-resend-btn`);

  if (restoring) {
    if (title) {
      title.textContent = prefix === "messages"
        ? "Loading your messages and activity"
        : prefix === "friends"
          ? "Loading your friends"
          : "Loading your account";
    }

    if (copy) {
      copy.textContent = prefix === "messages"
        ? "Your conversations, friend activity, achievements, and streak updates are syncing now."
        : prefix === "friends"
          ? "Your friend list, requests, and blocks are syncing now."
          : "Your profile, settings, and account tools are syncing now.";
    }

    setVisible(`${prefix}-locked-refresh-btn`, false);
    setVisible(`${prefix}-locked-resend-btn`, false);
    return;
  }

  if (title) {
    title.textContent = !loggedIn
      ? (prefix === "messages"
        ? "Log in to use messages and activity"
        : prefix === "friends"
          ? "Log in to use the friends system"
          : "Log in to edit your settings")
      : (prefix === "messages"
        ? "Verify your email to unlock messaging"
        : prefix === "friends"
          ? "Verify your email to unlock friends"
          : "Log in to edit your settings");
  }

  if (copy) {
    copy.textContent = !loggedIn
      ? (prefix === "messages"
        ? "Your chats and activity only load after you sign in."
        : prefix === "friends"
          ? "Your friends, requests, and saved profiles only load after you sign in."
        : "Your profile, password, avatar, and account actions are available after you sign in.")
      : (prefix === "messages"
        ? "Direct messages, friend activity, achievements, and streak updates unlock after your email is verified."
        : prefix === "friends"
          ? "Friend requests, blocked users, and your friends list unlock after your email is verified."
        : "Sign in to manage your email, privacy, and account settings.");
  }

  setVisible(`${prefix}-locked-refresh-btn`, loggedIn && !verified);
  setVisible(`${prefix}-locked-resend-btn`, loggedIn && !verified);
}

async function handleVerificationRefresh() {
  try {
    setStatus("Checking verification...", "info");
    const refreshed = await refreshCurrentUserSession();
    currentState.user = refreshed.user;
    currentState.profile = refreshed.profile || currentState.profile;
    refreshLocalNotifications(refreshed.user?.uid || "");
    renderAll(currentState);
    setStatus(isVerifiedState(refreshed.user, refreshed.profile)
      ? "Email verified. Friends, messages, and player profiles are now available."
      : "Your email still looks unverified. Check the inbox link, then try again.", isVerifiedState(refreshed.user, refreshed.profile) ? "success" : "info");
  } catch (error) {
    console.error(error);
    setStatus(error?.message || "Could not refresh verification.", "error");
  }
}

async function handleVerificationResend() {
  try {
    const sent = await resendVerificationEmail();
    setStatus(sent === false ? "Your email is already verified." : "Verification email sent.", sent === false ? "info" : "success");
  } catch (error) {
    console.error(error);
    setStatus(error?.message || "Could not resend verification email.", "error");
  }
}

function syncQuery(section, sub = null, targetId = null) {
  const url = new URL(window.location.href);
  url.searchParams.set("tab", section);
  if (sub) url.searchParams.set("sub", sub);
  else url.searchParams.delete("sub");
  if (targetId) url.searchParams.set("target", targetId);
  else url.searchParams.delete("target");
  window.history.replaceState({}, "", url);
}

function showFriendsSubsection(name) {
  document.querySelectorAll("[data-friends-subpanel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.friendsSubpanel === name);
  });

  document.querySelectorAll("[data-friends-subtab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.friendsSubtab === name);
  });
}

function showSettingsSubsection(name = "account") {
  const next = SETTINGS_SUBSECTIONS.has(String(name || "").trim().toLowerCase()) ? String(name).trim().toLowerCase() : "account";

  document.querySelectorAll("[data-settings-subpanel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.settingsSubpanel === next);
  });

  document.querySelectorAll("[data-settings-subtab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.settingsSubtab === next);
  });
}

function applyAuthGuards() {
  const user = resolvedUser(currentState);
  const profile = resolvedProfile(currentState);
  const restoring = isAuthRestoring();
  const loggedIn = !!user;
  const verified = isVerifiedState(user, profile);
  const socialUnlocked = loggedIn && verified;

  setVisible("settings-locked", restoring || !loggedIn);
  setVisible("settings-content", !restoring && loggedIn);
  setVisible("friends-locked", restoring || !socialUnlocked);
  setVisible("friends-content", !restoring && socialUnlocked);
  setVisible("messages-locked", restoring || !socialUnlocked);
  setVisible("messages-content", !restoring && socialUnlocked);
  updateLockedPanel("settings", loggedIn, verified, restoring);
  updateLockedPanel("friends", loggedIn, verified, restoring);
  updateLockedPanel("messages", loggedIn, verified, restoring);

  const progressHint = $("progress-login-hint");
  if (progressHint) {
    progressHint.textContent = restoring
      ? "Checking your account and synced progress..."
      : !loggedIn
      ? "Log in to sync achievements and XP to your account."
      : (verified
        ? "Achievements and XP sync automatically while you explore the site."
        : "Verify your email to unlock friends, messages, and other player profiles.");
  }
}

function applyInitialAccountArea() {
  const params = new URLSearchParams(window.location.search);
  const section = String(params.get("tab") || "info").trim().toLowerCase();
  const sub = String(params.get("sub") || "").trim() || null;
  const targetId = String(params.get("target") || "").trim() || null;
  const allowed = new Set(["info", "settings", "progress", "friends", "messages"]);
  window.openAccountArea(allowed.has(section) ? section : "info", sub, targetId);
}

window.openAccountArea = function openAccountArea(section = "info", sub = null, targetId = null) {
  if (baseOpenAccountArea) {
    baseOpenAccountArea(section, sub, targetId);
  }

  try {
    const requestedSection = String(section || "info").toLowerCase();
    const nextSection = normalizeAccountSection(requestedSection);
    const nextSub = isFriendsView(requestedSection, sub) ? (sub || "friends") : sub;
    let finalSub = nextSub || null;

    document.querySelectorAll(".account-section").forEach((el) => {
      el.classList.toggle("active", el.dataset.section === nextSection);
    });

    document.querySelectorAll(".tab-button").forEach((button) => {
      button.classList.toggle("active", button.dataset.target === nextSection);
    });

    if (isFriendsView(requestedSection, sub)) {
      finalSub = nextSub || "friends";
      showFriendsSubsection(finalSub);
    } else if (nextSection === "settings") {
      finalSub = nextSub || "account";
      showSettingsSubsection(finalSub);
    } else if (nextSection === "messages") {
      finalSub = ["chat", "activity"].includes(String(nextSub || "").toLowerCase())
        ? String(nextSub).toLowerCase()
        : "inbox";
      setMessageView(finalSub === "activity" ? "activity" : "inbox");
      if (finalSub !== "chat") targetId = null;
    }

    if (nextSection === "progress" && targetId) {
      // The notification path and a pasted ?tab=progress&target=... link both
      // land here, so the spotlight needs no separate wiring per entry point.
      startAchievementSpotlight(targetId);
      setTimeout(() => {
        document.getElementById(`achievement-card-${targetId}`)?.scrollIntoView({
          behavior: window.PanategwaScrollBehavior ? window.PanategwaScrollBehavior() : "smooth",
          block: "center"
        });
      }, 180);
    }

    syncQuery(nextSection, finalSub, targetId);
    renderAll(currentState);
  } catch (error) {
    console.error("Account navigation error:", error);
    if (baseOpenAccountArea) {
      baseOpenAccountArea(section, sub, targetId);
    }
  }
};

function renderAuth(state) {
  const user = resolvedUser(state);
  const ownProfile = resolvedProfile(state) || {};
  const authCard = $("auth-card");
  const accountCard = $("account-card");
  const info = $("user-info");
  const cardTitle = $("account-card-title");
  const cardBadge = $("account-card-badge");

  if (!info) return;

  if (!user) {
    if (authCard) authCard.style.display = "grid";
    if (accountCard) accountCard.style.display = "none";
    info.innerHTML = "";
    updateSidebarAvatar(null, null);
    return;
  }

  if (authCard) authCard.style.display = "none";
  if (accountCard) accountCard.style.display = "block";

  const targetId = currentInfoTargetId();
  const friendProfile = targetId && targetId !== user.uid ? (state.friendProfiles?.[targetId] || null) : null;
  const viewingOther = !!targetId && targetId !== user.uid;
  const isFriend = viewingOther && (state.friends || []).includes(targetId);

  if (cardTitle) cardTitle.textContent = viewingOther ? "Player profile" : "Your profile";
  if (cardBadge) cardBadge.textContent = viewingOther ? (isFriend ? "Friend" : "Community") : "Signed in";

  if (viewingOther && (!friendProfile || friendProfile.profileUnavailable)) {
    const stillLoading = viewedProfileLoadKey === `${user.uid}:${targetId}`;
    const needsVerification = friendProfile?.unavailableReason === "verification-required";
    if (cardTitle) cardTitle.textContent = stillLoading ? "Loading profile" : needsVerification ? "Verify your email" : "Profile unavailable";
    if (cardBadge) cardBadge.textContent = "Player";

    info.innerHTML = `
      <div class="account-header">
        ${avatarMarkup(getDefaultAvatarDataUrl(), "", "account-avatar", false)}
        <div><p style="margin: 0;"><strong>${stillLoading ? "Loading player" : needsVerification ? "Verify your email" : "Profile unavailable"}</strong></p></div>
      </div>
      <div class="button-row" style="margin-bottom: 14px;">
        <button id="back-to-friends-btn" type="button" class="small">Back to friends</button>
      </div>
      <div class="msg-empty">${stillLoading
        ? "Loading the profile…"
        : needsVerification
          ? "Verify your email in Account settings to view other player profiles."
          : "This account could not be found, or its profile is not available."}</div>
    `;

    $("back-to-friends-btn")?.addEventListener("click", () => {
      window.openAccountArea("friends", "friends");
    });

    updateSidebarAvatar(ownProfile, user);
    return;
  }

  if (viewingOther) {
    const username = friendProfile.username || "Player";
    const avatar = avatarMarkup(
      friendProfile.photoURL || getDefaultAvatarDataUrl(),
      `${username} avatar`,
      "account-avatar",
      friendProfile.verified === true
    );
    const profileVisible = friendProfile.canViewProfile !== false;
    const rows = [];
    if (friendProfile.verified != null) rows.push(["Verified", friendProfile.verified ? "Yes" : "No"]);
    if (friendProfile.currentRank) rows.push(["Rank", friendProfile.currentRank]);
    if (friendProfile.xp != null) rows.push(["XP", String(friendProfile.xp)]);
    if (friendProfile.createdAt) rows.push(["Joined", formatDateOnly(friendProfile.createdAt)]);
    if (friendProfile.siteTimeMs != null) rows.push(["On the site for", formatSiteTimeDuration(friendProfile.siteTimeMs, { includeSeconds: true })]);
    if (friendProfile.streakCurrent != null) rows.push(["Current streak", `${friendProfile.streakCurrent} day${friendProfile.streakCurrent === 1 ? "" : "s"}`]);
    if (friendProfile.streakLongest != null) rows.push(["Longest streak", `${friendProfile.streakLongest} day${friendProfile.streakLongest === 1 ? "" : "s"}`]);
    const requestPending = (state.outgoingRequests || []).some((request) => request.toUid === targetId && request.status === "pending");
    const incomingRequest = (state.incomingRequests || []).some((request) => request.fromUid === targetId && request.status === "pending");
    const profileSubtitle = isFriend ? "Friend profile" : profileVisible ? "Panategwa player" : "Private profile";

    info.innerHTML = `
      <div class="account-header">
        ${avatar}
        <div>
          <p style="margin: 0;"><strong>${escapeHtml(username)}</strong></p>
          <p style="margin: 0; opacity: 0.8;">${profileSubtitle}</p>
        </div>
      </div>

      <div class="button-row" style="margin-bottom: 14px;">
        <button id="back-to-friends-btn" type="button" class="small">Back to friends</button>
        ${isFriend && friendProfile.canMessage ? `<button id="player-message-btn" type="button" class="small">Message</button>` : ""}
        ${!isFriend
          ? (requestPending
            ? `<button type="button" class="small" disabled>Request pending</button>`
            : incomingRequest
              ? `<button id="player-view-requests-btn" type="button" class="small">Review request</button>`
              : `<button id="player-add-friend-btn" type="button" class="small">Add friend</button>`)
          : ""}
      </div>

      ${profileVisible && rows.length ? `<div class="info-grid">${rows.map(([label, value]) => `<div class="info-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div>` : `<p class="section-note">${profileVisible ? "This player has kept their profile details private." : "Only this player's username is visible. Add them as a friend to connect."}</p>`}
    `;

    $("back-to-friends-btn")?.addEventListener("click", () => {
      window.openAccountArea("friends", "friends");
    });
    $("player-message-btn")?.addEventListener("click", () => openDirectConversation(targetId));
    $("player-view-requests-btn")?.addEventListener("click", () => window.openAccountArea("friends", "requests"));
    $("player-add-friend-btn")?.addEventListener("click", async () => {
      const button = $("player-add-friend-btn");
      if (button) button.disabled = true;
      try {
        await sendFriendRequestById(targetId);
        setStatus("Friend request sent.", "success");
        renderAll(currentState);
      } catch (error) {
        if (button) button.disabled = false;
        setStatus(error?.message || "Could not send a friend request.", "error");
        window.alert(error?.message || "Could not send a friend request.");
      }
    });

    updateSidebarAvatar(ownProfile, user);
    return;
  }

  const username = ownProfile.username || user.displayName || "Player";
  const email = user.email || "--";
  const verified = user.emailVerified ? "Yes" : "No";
  const xp = typeof ownProfile.xp === "number" ? ownProfile.xp : 0;
  const streak = ownProfile?.streak?.current || 0;
  const longestStreak = ownProfile?.longestStreak || ownProfile?.streak?.longest || streak || 0;
  const memberFor = formatSiteTimeDuration(resolvedOwnSiteTimeMs(ownProfile, user), { includeSeconds: true });
  const avatarUrl = ownProfile.photoURL || getDefaultAvatarDataUrl();
  const avatar = avatarMarkup(avatarUrl, "Avatar", "account-avatar", isVerifiedState(user, ownProfile));
  const copied = isUserIdCopied(user.uid);
  const verifyNotice = !isVerifiedState(user, ownProfile) ? `
    <div class="verify-callout">
      <strong>Verify your email to unlock social features</strong>
      <p>Verify your email to use friends and messages or view other player profiles. You can manage your email and privacy settings now.</p>
      <div class="button-row">
        <button id="inline-refresh-verification-btn" type="button">I've verified my email</button>
        <button id="inline-resend-verification-btn" type="button">Resend verification email</button>
      </div>
    </div>
  ` : "";

  info.innerHTML = `
    <div class="account-header">
      ${avatar}
      <div>
        <p style="margin: 0;"><strong>${escapeHtml(username)}</strong></p>
        <p style="margin: 0; opacity: 0.8;">${escapeHtml(email)}</p>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-row"><span>Verified</span><strong>${verified}</strong></div>
      <div class="info-row"><span>Username</span><strong>${escapeHtml(username)}</strong></div>
      <div class="info-row"><span>Email</span><strong>${escapeHtml(email)}</strong></div>
      <div class="info-row">
        <span>Account ID</span>
        <strong style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <span>${escapeHtml(user.uid)}</span>
          <button id="copy-user-id-btn" type="button" class="copy-icon-btn" aria-label="${copied ? "Copied account ID" : "Copy account ID"}" title="${copied ? "Copied" : "Copy account ID"}">
            ${copied ? checkIcon() : copyIcon()}
          </button>
        </strong>
      </div>
      <div class="info-row"><span>Created</span><strong>${escapeHtml(formatDateOnly(ownProfile.createdAt))}</strong></div>
      <div class="info-row"><span>On the site for</span><strong>${escapeHtml(memberFor)}</strong></div>
      <div class="info-row"><span>XP</span><strong>${xp}</strong></div>
      <div class="info-row"><span>Rank</span><strong>${escapeHtml(getRank(xp))}</strong></div>
      <div class="info-row"><span>Streak</span><strong>${streak} day${streak === 1 ? "" : "s"}</strong></div>
      <div class="info-row"><span>Longest streak</span><strong>${longestStreak} day${longestStreak === 1 ? "" : "s"}</strong></div>
    </div>

    ${verifyNotice}
  `;

  $("copy-user-id-btn")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(user.uid);
      markUserIdCopied(user.uid);
      renderAuth(currentState);
    } catch {
      window.prompt("Copy this ID:", user.uid);
    }
  });
  $("inline-refresh-verification-btn")?.addEventListener("click", handleVerificationRefresh);
  $("inline-resend-verification-btn")?.addEventListener("click", handleVerificationResend);

  updateSidebarAvatar(ownProfile, user);
}

// ========================================================
// Achievement spotlight
// ========================================================

// Opening a notification for an achievement should not just scroll to it. The
// card is lifted out of the list for two seconds with everything else pushed
// back, then the list eases back over three. The easing is CSS's job (see the
// .is-spotlighting rules in account.css); these timers only decide when to let
// go of the classes.
const ACHIEVEMENT_SPOTLIGHT_HOLD_MS = 2000;
const ACHIEVEMENT_SPOTLIGHT_SETTLE_MS = 3000;

let achievementSpotlightId = "";
let achievementSpotlightTimers = [];

// Toggling the classes off is the half that animates, so it must be its own
// step: removing them in the same tick as adding them would mean the spotlight
// state was never committed and the browser would have nothing to transition
// from. Hence clear, then wait, then re-apply on the next frame.
function applyAchievementSpotlightClasses() {
  const list = $("achievements-list");
  if (!list) return;

  const active = String(achievementSpotlightId || "").trim();
  list.classList.toggle("is-spotlighting", Boolean(active));

  list.querySelectorAll(".achievement-card").forEach((card) => {
    const isTarget = Boolean(active) && card.dataset.achievementId === active;
    card.classList.toggle("is-spotlight", isTarget);
  });
}

function clearAchievementSpotlightClasses() {
  const list = $("achievements-list");
  if (!list) return;
  list.classList.remove("is-spotlighting");
  list.querySelectorAll(".achievement-card.is-spotlight").forEach((card) => {
    card.classList.remove("is-spotlight");
  });
}

function startAchievementSpotlight(achievementId) {
  const id = String(achievementId || "").trim();
  if (!id) return;

  stopAchievementSpotlight();
  achievementSpotlightId = id;

  // Deferred by a turn, not to give the browser a frame: openAccountArea calls
  // this before its synchronous renderAll, and opening a second notification
  // while the progress tab is already up re-renders nothing at all (the list is
  // rebuilt only when the achievement signature changes). Applying on the next
  // turn is what covers both cases -- by then the cards exist either way.
  // renderAchievements also re-applies, which is what makes a fresh render land
  // in the spotlight state without waiting.
  achievementSpotlightTimers.push(setTimeout(() => {
    applyAchievementSpotlightClasses();

    // Two steps, deliberately. Dropping the classes is what animates, so the
    // removal has to be its own task; clearing and re-adding in the same tick
    // would mean the browser never saw the spotlight state to begin with.
    achievementSpotlightTimers.push(setTimeout(() => {
      clearAchievementSpotlightClasses();
    }, ACHIEVEMENT_SPOTLIGHT_HOLD_MS));

    achievementSpotlightTimers.push(setTimeout(() => {
      achievementSpotlightId = "";
    }, ACHIEVEMENT_SPOTLIGHT_HOLD_MS + ACHIEVEMENT_SPOTLIGHT_SETTLE_MS));
  }, 0));
}

function stopAchievementSpotlight() {
  achievementSpotlightTimers.forEach((timer) => clearTimeout(timer));
  achievementSpotlightTimers = [];
  achievementSpotlightId = "";
  clearAchievementSpotlightClasses();
}

function renderProgress(state) {
  const profile = resolvedProfile(state) || {};
  const xp = typeof profile.xp === "number" ? profile.xp : 0;
  const info = getRankInfo(xp);
  const unlockedCount = Array.isArray(profile.achievements) ? profile.achievements.length : 0;

  if ($("xp-left-rank")) $("xp-left-rank").textContent = info.current;
  if ($("xp-right-rank")) $("xp-right-rank").textContent = info.next;
  if ($("xp-bar-fill")) $("xp-bar-fill").style.width = `${progressPercent(xp)}%`;
  if ($("xp-total")) $("xp-total").textContent = String(xp);
  if ($("xp-count")) $("xp-count").textContent = String(xp);
  if ($("achievement-count")) $("achievement-count").textContent = String(unlockedCount);
  if ($("xp-need")) {
    $("xp-need").textContent = xp >= 30 ? "You reached the top rank." : `${info.end - xp} XP to next rank`;
  }
}

function renderAchievements(state) {
  const list = $("achievements-list");
  if (!list) return;

  const user = resolvedUser(state);
  const profile = resolvedProfile(state);

  const signature = JSON.stringify({
    uid: user?.uid || "",
    xp: typeof profile?.xp === "number" ? profile.xp : 0,
    achievements: [...new Set(profile?.achievements || [])].sort()
  });

  if (signature === lastAchievementSignature) return;
  lastAchievementSignature = signature;

  const unlocked = new Set(profile?.achievements || []);
  const ordered = [...ACHIEVEMENTS].sort((a, b) => {
    const unlockedDiff = Number(unlocked.has(b.id)) - Number(unlocked.has(a.id));
    return unlockedDiff !== 0 ? unlockedDiff : a.name.localeCompare(b.name);
  });

  list.innerHTML = ordered.map((achievement) => {
    const isUnlocked = unlocked.has(achievement.id);
    const title = achievement.secret && !isUnlocked ? "Secret achievement" : achievement.name;
    const description = achievement.secret && !isUnlocked ? "Hidden until unlocked." : achievement.description;
    const requirement = achievement.secret && !isUnlocked
      ? "Requirement hidden."
      : (achievement.requirement?.note || achievement.description);

    return `
      <div class="achievement-card ${isUnlocked ? "unlocked" : "locked"}" id="achievement-card-${escapeHtml(achievement.id)}" data-achievement-id="${escapeHtml(achievement.id)}" data-anim="full">
        <div class="achievement-status ${isUnlocked ? "unlocked" : "locked"}">${isUnlocked ? "Unlocked" : "Locked"}</div>
        <div class="achievement-copy">
          <div class="achievement-name">${escapeHtml(title)}</div>
          <div class="achievement-desc">${escapeHtml(description)}</div>
          <div class="achievement-desc">Requirement: ${escapeHtml(requirement)}</div>
          <div class="achievement-desc">Reward: +${escapeHtml(String(achievement.reward || 0))} XP</div>
        </div>
      </div>
    `;
  }).join("");

  // The list is rebuilt from scratch, which drops any class the spotlight put
  // on it. Re-apply, otherwise a progress update arriving mid-spotlight would
  // silently cancel the effect the user is meant to be looking at.
  if (achievementSpotlightId) applyAchievementSpotlightClasses();
}

function renderPrivacyProfilePreview(state) {
  const container = $("privacy-profile-preview");
  if (!container) return;

  const user = resolvedUser(state);
  if (!user) {
    container.innerHTML = `
      <div class="friend-profile-card">
        <div class="subsection-head"><h3>Player view preview</h3></div>
        <div class="msg-empty">Log in to preview what friends can see.</div>
      </div>
    `;
    return;
  }

  const profile = resolvedProfile(state) || {};
  const username = profile.username || "Player";
  const privacy = normalizePrivacySettings(profile?.privacySettings);
  const showAvatar = privacy.showAvatar;
  const showVerified = privacy.showVerified;
  const showRank = privacy.showRank;
  const showJoined = privacy.showJoined;
  const showStreaks = privacy.showStreaks;
  const showSiteAge = privacy.showSiteAge;
  const rank = showRank ? getRank(profile.xp || 0) : null;
  const streakCurrent = showStreaks ? (profile?.streak?.current || 0) : null;
  const streakLongest = showStreaks ? (profile?.longestStreak || profile?.streak?.longest || streakCurrent || 0) : null;
  const siteAge = showSiteAge ? formatSiteTimeDuration(resolvedOwnSiteTimeMs(profile, user), { includeSeconds: true }) : null;
  const privacyCard = (label, value, visible, key, note = "") => `
    <div class="privacy-preview-card ${visible ? "" : "is-hidden"}">
      <div class="privacy-preview-card-top">
        <span>${escapeHtml(label)}</span>
        <button
          type="button"
          class="privacy-inline-toggle"
          data-privacy-toggle-key="${escapeHtml(key)}"
          data-privacy-toggle-value="${visible ? "false" : "true"}"
        >${visible ? "Hide" : "Show"}</button>
      </div>
      <strong>${escapeHtml(value)}</strong>
      ${note ? `<small>${escapeHtml(note)}</small>` : ""}
    </div>
  `;
  const avatar = showAvatar
    ? avatarMarkup(
      profile.photoURL || getDefaultAvatarDataUrl(),
      `${username} avatar`,
      "profile-avatar-large",
      showVerified && isVerifiedState(user, profile)
    )
    : `<div class="profile-avatar-large privacy-avatar-hidden" aria-label="Profile picture hidden">?</div>`;

  container.innerHTML = `
    <div class="friend-profile-card">
      <div class="subsection-head">
        <h3>Player view preview</h3>
        <span class="profile-badge">${privacy.preset === "private" ? "Username only" : "Visible to players"}</span>
      </div>

      <div class="profile-hero">
        ${avatar}
        <div>
          <div class="profile-name">${escapeHtml(username)}</div>
          <div class="friend-entry-meta">${privacy.preset === "private" ? "Only your username is visible" : "Your selected profile details are visible"}</div>
        </div>
      </div>

      <div class="profile-meta">
        <div><span>Username</span><strong>${escapeHtml(username)}</strong></div>
        <div><span>Visibility</span><strong>${escapeHtml(privacy.preset[0].toUpperCase() + privacy.preset.slice(1))}</strong></div>
      </div>

      <div class="privacy-preview-grid">
        ${privacyCard("Profile picture", showAvatar ? "Visible" : "Hidden", showAvatar, "showAvatar", "Players can see your avatar.")}
        ${privacyCard("Verified badge", showVerified ? (isVerifiedState(user, profile) ? "Verified" : "Not verified") : "Hidden", showVerified, "showVerified", "Players can see your verification status.")}
        ${privacyCard("Rank and XP", rank || "Hidden", showRank, "showRank", "Players can see your rank and XP progress.")}
        ${privacyCard("Joined", showJoined && profile.createdAt ? formatDateOnly(profile.createdAt) : "Hidden", showJoined, "showJoined", "Players can see when your account was created.")}
        ${privacyCard("Current streak", streakCurrent == null ? "Hidden" : `${streakCurrent} day${streakCurrent === 1 ? "" : "s"}`, showStreaks, "showStreaks", "This also controls your longest streak.")}
        ${privacyCard("Longest streak", streakLongest == null ? "Hidden" : `${streakLongest} day${streakLongest === 1 ? "" : "s"}`, showStreaks, "showStreaks", "This uses the same streak setting.")}
        ${privacyCard("Time on site", siteAge || "Hidden", showSiteAge, "showSiteAge", "Players can see your total time spent on the site.")}
      </div>

      <div class="profile-body-note">Your email, password, friend list, and account controls are never shown. Use Hide and Show to change your custom profile.</div>
    </div>
  `;
}

function profileAvatarMarkup(profile) {
  return avatarMarkup(
    profile.photoURL || getDefaultAvatarDataUrl(),
    "",
    "friend-avatar-img",
    !!profile?.verified
  );
}

function renderFriends(state) {
  const user = resolvedUser(state);
  const friendsStatus = $("friends-status");
  const friendsWarning = $("friends-warning");
  const friendsList = $("friends-list");
  const blockedList = $("blocked-list");
  const requestsList = $("requests-list");

  if (!user) {
    if (friendsWarning) {
      friendsWarning.textContent = "";
      friendsWarning.classList.add("section-hidden");
    }
    if (friendsStatus) friendsStatus.textContent = "Log in to use the friends system.";
    if (friendsList) friendsList.innerHTML = `<div class="msg-empty">Log in to see your friend list.</div>`;
    if (blockedList) blockedList.innerHTML = `<div class="msg-empty">Log in to manage blocked users.</div>`;
    if (requestsList) requestsList.innerHTML = `<div class="msg-empty">Log in to view friend requests.</div>`;
    return;
  }

  const socialReady = state.ready !== false;
  if (!socialReady) {
    if (friendsWarning) {
      friendsWarning.textContent = "";
      friendsWarning.classList.add("section-hidden");
    }
    if (friendsStatus) friendsStatus.textContent = "Loading your friends...";
    if (friendsList) friendsList.innerHTML = `<div class="msg-empty">Your friend list is syncing now.</div>`;
    if (blockedList) blockedList.innerHTML = `<div class="msg-empty">Blocked users are syncing now.</div>`;
    if (requestsList) requestsList.innerHTML = `<div class="msg-empty">Friend requests are syncing now.</div>`;
    return;
  }

  const friends = state.friends || [];
  const blocked = state.blocked || [];
  const incoming = state.incomingRequests || [];
  const outgoing = state.outgoingRequests || [];
  const search = String($("friend-search-input")?.value || "").trim().toLowerCase();

  const friendProfiles = friends
    .map((uid) => state.friendProfiles?.[uid] || { uid, username: uid, photoURL: "" })
    .filter((profile) => {
      return !search
        || String(profile.username || "").toLowerCase().includes(search)
        || String(profile.uid || "").toLowerCase().includes(search);
    });

  const blockedProfiles = blocked.map((uid) => state.friendProfiles?.[uid] || { uid, username: uid });

  if (friendsStatus) {
    friendsStatus.textContent = `${friends.length} friends. ${incoming.length} incoming requests. ${outgoing.length} outgoing requests.`;
  }

  if (friendsWarning) {
    friendsWarning.textContent = state.socialError || "";
    friendsWarning.classList.toggle("section-hidden", !state.socialError);
  }

  if (friendsList) {
    friendsList.innerHTML = friendProfiles.length ? friendProfiles.map((friend) => `
      <div class="friend-entry">
        <button type="button" class="friend-entry-button friend-entry-profile" data-action="friend-view" data-uid="${escapeHtml(friend.uid)}">
          <span class="friend-entry-main">
            <span class="friend-entry-avatar">${profileAvatarMarkup(friend)}</span>
            <span class="friend-entry-text">
              <span class="friend-entry-name">${escapeHtml(friend.username || "Player")}</span>
              <span class="friend-entry-meta">Friend</span>
            </span>
          </span>
        </button>

        <details class="friend-entry-menu">
          <summary aria-label="Friend actions">&#8942;</summary>
          <div class="friend-entry-popover">
            <button type="button" data-action="friend-message" data-uid="${escapeHtml(friend.uid)}">Message</button>
            <button type="button" data-action="friend-copy" data-uid="${escapeHtml(friend.uid)}">Copy ID</button>
            <button type="button" data-action="friend-remove" data-uid="${escapeHtml(friend.uid)}">Unfriend</button>
            <button type="button" data-action="friend-block" data-uid="${escapeHtml(friend.uid)}">Block</button>
          </div>
        </details>
      </div>
    `).join("") : `<div class="msg-empty">No friends yet.</div>`;
  }

  if (blockedList) {
    blockedList.innerHTML = blockedProfiles.length ? `
      <div class="blocked-card">
        <div class="subsection-head"><h3>Blocked users</h3></div>
        ${blockedProfiles.map((profile) => `
          <div class="social-item">
            <div class="social-icon">${profileAvatarMarkup(profile)}</div>
            <div class="social-main">
              <div class="social-title">${escapeHtml(profile.username || "Player")}</div>
              <div class="social-sub">${escapeHtml(profile.uid || "")}</div>
            </div>
            <div class="social-actions social-actions-start">
              <button type="button" class="small" data-action="friend-copy" data-uid="${escapeHtml(profile.uid || "")}">Copy ID</button>
              <button type="button" class="small" data-action="friend-unblock" data-uid="${escapeHtml(profile.uid || "")}">Unblock</button>
            </div>
          </div>
        `).join("")}
      </div>
    ` : `<div class="msg-empty">No blocked users.</div>`;
  }

  if (requestsList) {
    requestsList.innerHTML = `
      <div class="requests-card">
        <div class="request-block">
          <div class="subsection-head"><h3>Incoming</h3></div>
          ${incoming.length ? incoming.map((request) => `
            <div class="request-card">
              <div class="request-card-top">
                <div>
                  <div class="request-card-title">${escapeHtml(request.fromName || request.fromUid || "Friend request")}</div>
                  <div class="request-card-meta">${escapeHtml(request.fromUid || "")}</div>
                </div>
                <span class="profile-badge">Pending</span>
              </div>
              <div class="request-card-note">${escapeHtml(request.body || request.note || "Friend request")}</div>
              <div class="request-card-actions">
                <button type="button" data-action="request-accept" data-id="${escapeHtml(request.id)}" data-uid="${escapeHtml(request.fromUid || "")}">Accept</button>
                <button type="button" data-action="request-ignore" data-id="${escapeHtml(request.id)}" data-uid="${escapeHtml(request.fromUid || "")}">Ignore</button>
                <button type="button" data-action="request-decline" data-id="${escapeHtml(request.id)}" data-uid="${escapeHtml(request.fromUid || "")}">Decline</button>
              </div>
            </div>
          `).join("") : `<div class="msg-empty">No incoming requests.</div>`}
        </div>

        <div class="request-block">
          <div class="subsection-head"><h3>Outgoing</h3></div>
          ${outgoing.length ? outgoing.map((request) => `
            <div class="request-card">
              <div class="request-card-top">
                <div>
                  <div class="request-card-title">${escapeHtml(request.toName || request.toUid || "Pending request")}</div>
                  <div class="request-card-meta">${escapeHtml(request.toUid || "")}</div>
                </div>
                <span class="profile-badge">${escapeHtml(request.status || "pending")}</span>
              </div>
              <div class="request-card-note">${escapeHtml(request.body || "Friend request sent.")}</div>
            </div>
          `).join("") : `<div class="msg-empty">No outgoing requests.</div>`}
        </div>
      </div>
    `;
  }

}

function socialNotificationItems(state) {
  const user = resolvedUser(state);
  if (!user) return [];

  return (state.messages || [])
    .filter((message) => String(message?.toUid || "").trim() === user.uid)
    .filter((message) => message.kind !== "direct-message")
    .filter((message) => message.kind !== "friend-request" || String(message.status || "pending") === "pending")
    .map((message) => ({
      id: `social:${message.id}`,
      source: "social",
      rawId: message.id,
      kind: String(message.kind || "social"),
      title: String(message.title || "Notification"),
      body: formatNotificationBody(message.kind, message.body || ""),
      href: socialNotificationHref(message),
      createdAt: toMs(message.createdAt),
      unread: !(Array.isArray(message.readBy) ? message.readBy : []).includes(user.uid),
      uid: String(message.fromUid || message.targetId || "").trim(),
      message
    }));
}

function openDirectConversation(peerUid) {
  const id = String(peerUid || "").trim();
  if (!id) return;
  window.openAccountArea("messages", "chat", id);
  markDirectMessagesRead(currentState, id);
}

function markDirectMessagesRead(state, peerUid) {
  const uid = resolvedUser(state)?.uid || "";
  const peer = String(peerUid || "").trim();
  if (!uid || !peer) return;
  const unread = (state.messages || []).filter((message) => message.kind === "direct-message"
    && String(message.fromUid || "") === peer
    && String(message.toUid || "") === uid
    && !(Array.isArray(message.readBy) ? message.readBy : []).includes(uid)
    && !directMessageReadRequested.has(String(message.id || ""))
    && !directMessageReadInFlight.has(String(message.id || "")));
  unread.forEach((message) => directMessageReadInFlight.add(String(message.id || "")));
  Promise.all(unread.map((message) => markMessageRead(message.id, true)))
    .then(() => unread.forEach((message) => directMessageReadRequested.add(String(message.id || ""))))
    .catch((error) => console.error("Could not mark chat as read:", error))
    .finally(() => unread.forEach((message) => directMessageReadInFlight.delete(String(message.id || ""))));
}

function directMessageThreads(state) {
  const uid = resolvedUser(state)?.uid;
  if (!uid) return [];
  const threads = new Map();
  for (const message of state.messages || []) {
    if (message.kind !== "direct-message") continue;
    const fromUid = String(message.fromUid || "");
    const toUid = String(message.toUid || "");
    if (fromUid !== uid && toUid !== uid) continue;
    const peerUid = fromUid === uid ? toUid : fromUid;
    if (!peerUid) continue;
    const previous = threads.get(peerUid) || { uid: peerUid, messages: [] };
    previous.messages.push(message);
    threads.set(peerUid, previous);
  }

  return [...threads.values()].map((thread) => {
    thread.messages.sort((left, right) => toMs(left.createdAt) - toMs(right.createdAt));
    const latest = thread.messages[thread.messages.length - 1];
    const unread = thread.messages.filter((message) => String(message.toUid || "") === uid
      && !(Array.isArray(message.readBy) ? message.readBy : []).includes(uid)).length;
    const profile = state.friendProfiles?.[thread.uid] || {};
    const messageName = latest?.fromUid === uid ? latest?.toName : latest?.fromName;
    return {
      ...thread,
      latest,
      unread,
      username: profile.username && profile.username !== thread.uid ? profile.username : (messageName || "Player"),
      photoURL: profile.photoURL || ""
    };
  }).sort((left, right) => toMs(right.latest?.createdAt) - toMs(left.latest?.createdAt));
}

function renderDirectMessages(state) {
  const list = $("dm-thread-list");
  const count = $("dm-thread-count");
  const empty = $("dm-chat-empty");
  const chatView = $("dm-chat-view");
  const status = $("dm-status");
  const header = $("dm-chat-header");
  const messages = $("dm-chat-messages");
  const form = $("dm-compose-form");
  const input = $("dm-compose-input");
  const uid = resolvedUser(state)?.uid || "";
  if (!list || !chatView || !empty || !messages) return;

  if (!uid) {
    if (status) status.textContent = "Sign in and verify your email to chat with friends.";
    list.innerHTML = `<div class="msg-empty">Sign in to see your chats.</div>`;
    count && (count.textContent = "0");
    empty.hidden = false;
    chatView.hidden = true;
    return;
  }

  const threads = directMessageThreads(state);
  const selectedUid = currentChatUid();
  if (count) count.textContent = String(threads.length);
  if (status) status.textContent = `${threads.length} conversation${threads.length === 1 ? "" : "s"}. Messages are private between you and each friend.`;

  list.innerHTML = threads.length ? threads.map((thread) => `
    <button type="button" class="dm-thread-button ${thread.uid === selectedUid ? "active" : ""} ${thread.unread ? "unread" : ""}" data-dm-open="${escapeHtml(thread.uid)}" aria-current="${thread.uid === selectedUid ? "true" : "false"}">
      <span class="dm-thread-avatar">${profileAvatarMarkup({ photoURL: thread.photoURL, verified: null })}</span>
      <span class="dm-thread-copy">
        <span class="dm-thread-name"><span>${escapeHtml(thread.username)}</span><time class="dm-thread-time">${escapeHtml(relativeTime(toMs(thread.latest?.createdAt)))}</time></span>
        <span class="dm-thread-preview">${escapeHtml(thread.latest?.body || "Message")}</span>
      </span>
      ${thread.unread ? `<span class="dm-thread-unread" aria-hidden="true"></span><span class="sr-only">${thread.unread} unread messages</span>` : ""}
    </button>
  `).join("") : `<div class="msg-empty">No chats yet. Open a friend's profile to start a conversation.</div>`;

  const knownFriend = (state.friends || []).includes(selectedUid);
  const selectedProfile = state.friendProfiles?.[selectedUid] || {};
  const thread = threads.find((entry) => entry.uid === selectedUid) || (selectedUid && knownFriend ? {
    uid: selectedUid,
    messages: [],
    unread: 0,
    username: selectedProfile.username || "Player",
    photoURL: selectedProfile.photoURL || ""
  } : null);
  if (thread) markDirectMessagesRead(state, selectedUid);
  if (!selectedUid || !thread) {
    empty.hidden = false;
    chatView.hidden = true;
    if (selectedUid && status) status.textContent = "That conversation is unavailable. Start a chat from a friend's profile.";
    return;
  }

  const canSend = (state.friends || []).includes(selectedUid) && !(state.blocked || []).includes(selectedUid);
  empty.hidden = true;
  chatView.hidden = false;
  if (header) {
    header.innerHTML = `
      <div class="dm-thread-avatar">${profileAvatarMarkup({ photoURL: thread.photoURL, verified: null })}</div>
      <div class="dm-chat-header-copy">
        <strong>${escapeHtml(thread.username)}</strong><span>${canSend ? "Friend" : "Chat history"}</span>
      </div>
      <div class="dm-chat-actions">
        <button type="button" class="small" data-dm-profile="${escapeHtml(selectedUid)}">View profile</button>
      </div>
    `;
  }

  messages.innerHTML = thread.messages.length ? thread.messages.map((message) => {
    const sent = String(message.fromUid || "") === uid;
    const stamp = toMs(message.createdAt);
    const time = stamp ? new Date(stamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Sending…";
    const seen = sent && (Array.isArray(message.readBy) ? message.readBy : []).includes(selectedUid);
    return `<div class="dm-message-row ${sent ? "mine" : ""}"><div class="dm-message-bubble">${escapeHtml(message.body || "")}<time class="dm-message-time">${escapeHtml(time)}${seen ? " · Seen" : ""}</time></div></div>`;
  }).join("") : `<div class="dm-conversation-empty">Say hello to ${escapeHtml(thread.username)}.</div>`;
  if (canSend) {
    form?.removeAttribute("hidden");
    if (input) input.disabled = false;
    $("dm-send-btn")?.removeAttribute("disabled");
  } else {
    form?.setAttribute("hidden", "");
    if (input) input.disabled = true;
    $("dm-send-btn")?.setAttribute("disabled", "");
    if (status) status.textContent = "You need to be friends to send messages.";
  }
  messages.scrollTop = messages.scrollHeight;
}

function localNotificationItems(state) {
  return (state.localNotifications || []).map((entry) => ({
    id: `local:${entry.id}`,
    source: "local",
    rawId: entry.id,
    kind: String(entry.kind || "general"),
    title: String(entry.title || "Notification"),
    body: formatNotificationBody(entry.kind, entry.body || ""),
    href: localNotificationHref(entry),
    createdAt: Number(entry.createdAt || 0),
    unread: !entry.read,
    uid: "",
    message: entry
  }));
}

function notificationItemsFromState(state) {
  return [...socialNotificationItems(state), ...localNotificationItems(state)]
    .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0));
}

function notificationTag(kind) {
  if (kind === "friend-request") return "Request";
  if (kind === "friend-accepted") return "Accepted";
  if (kind === "friend-declined") return "Declined";
  if (kind === "friend-removed") return "Removed";
  if (kind === "friend-blocked") return "Blocked";
  if (kind === "achievement") return "Achievement";
  if (kind === "streak") return "Streak";
  return "Notification";
}

function notificationActions(item) {
  const actions = [];

  if (item.source === "social" && item.kind === "friend-request") {
    actions.push(`<button type="button" data-notification-action="accept-request" data-id="${escapeHtml(item.rawId)}" data-uid="${escapeHtml(item.uid)}">Accept</button>`);
    actions.push(`<button type="button" data-notification-action="ignore-request" data-id="${escapeHtml(item.rawId)}" data-uid="${escapeHtml(item.uid)}">Ignore</button>`);
    actions.push(`<button type="button" data-notification-action="decline-request" data-id="${escapeHtml(item.rawId)}" data-uid="${escapeHtml(item.uid)}">Decline</button>`);
  }

  if (item.href) {
    actions.push(`<button type="button" data-notification-action="open-link" data-source="${escapeHtml(item.source)}" data-id="${escapeHtml(item.rawId)}">Open</button>`);
  }

  actions.push(`<button type="button" data-notification-action="${item.unread ? "mark-read" : "mark-unread"}" data-source="${escapeHtml(item.source)}" data-id="${escapeHtml(item.rawId)}">${item.unread ? "Mark read" : "Mark unread"}</button>`);
  actions.push(`<button type="button" data-notification-action="delete" data-source="${escapeHtml(item.source)}" data-id="${escapeHtml(item.rawId)}">Delete</button>`);

  return actions.join("");
}

function syncNotificationHistoryButtons() {
  $("notifications-undo-btn")?.toggleAttribute("disabled", notificationUndoStack.length < 1);
  $("notifications-redo-btn")?.toggleAttribute("disabled", notificationRedoStack.length < 1);
}

function rememberNotificationHistory(undoOps = [], redoOps = []) {
  if (!undoOps.length || !redoOps.length) return;
  notificationUndoStack.push({ undoOps, redoOps });
  if (notificationUndoStack.length > MAX_NOTIFICATION_HISTORY) {
    notificationUndoStack = notificationUndoStack.slice(-MAX_NOTIFICATION_HISTORY);
  }
  notificationRedoStack = [];
  syncNotificationHistoryButtons();
}

function notificationReadOp(item, read) {
  if (item.source === "social") {
    return { type: "social-read", id: item.rawId, read: !!read };
  }

  return { type: "local-read", id: item.rawId, read: !!read };
}

function notificationDeleteUndoOp(item) {
  if (item.source === "social") {
    return { type: "social-hidden", id: item.rawId, hidden: false };
  }

  return { type: "local-upsert", entry: { ...(item.message || {}), id: item.rawId } };
}

function notificationDeleteRedoOp(item) {
  if (item.source === "social") {
    return { type: "social-hidden", id: item.rawId, hidden: true };
  }

  return { type: "local-delete", id: item.rawId };
}

function findNotificationItem(source, id, state = currentState) {
  return notificationItemsFromState(state).find((item) => item.source === source && item.rawId === id) || null;
}

async function applyNotificationOps(ops = []) {
  let touchedLocal = false;

  for (const op of Array.isArray(ops) ? ops : []) {
    if (!op?.type) continue;

    if (op.type === "social-read") {
      await markMessageRead(op.id, op.read);
      continue;
    }

    if (op.type === "social-hidden") {
      await setMessageDeletedForCurrentUser(op.id, op.hidden);
      continue;
    }

    if (op.type === "local-read") {
      touchedLocal = true;
      setStoredNotificationRead(op.id, op.read);
      continue;
    }

    if (op.type === "local-delete") {
      touchedLocal = true;
      deleteStoredNotification(op.id);
      continue;
    }

    if (op.type === "local-upsert" && op.entry) {
      touchedLocal = true;
      pushStoredNotification(op.entry);
    }
  }

  if (touchedLocal) {
    refreshLocalNotifications();
  }

  renderAll(currentState);
}

async function runNotificationHistory(direction = "undo") {
  const fromStack = direction === "redo" ? notificationRedoStack : notificationUndoStack;
  const toStack = direction === "redo" ? notificationUndoStack : notificationRedoStack;
  const entry = fromStack.pop();
  if (!entry) return;

  try {
    await applyNotificationOps(direction === "redo" ? entry.redoOps : entry.undoOps);
    toStack.push(entry);
    syncNotificationHistoryButtons();
  } catch (error) {
    if (direction === "redo") notificationRedoStack.push(entry);
    else notificationUndoStack.push(entry);
    syncNotificationHistoryButtons();
    throw error;
  }
}

function renderNotifications(state) {
  const root = $("notifications-root");
  const summary = $("notifications-summary");
  const readAllBtn = $("notifications-read-all-btn");
  const unreadAllBtn = $("notifications-unread-all-btn");
  if (!root) return;

  const user = resolvedUser(state);
  if (!user) {
    if (summary) summary.textContent = "Log in to see your activity.";
    readAllBtn?.toggleAttribute("disabled", true);
    unreadAllBtn?.toggleAttribute("disabled", true);
    root.innerHTML = `<div class="msg-empty">Log in to see your activity.</div>`;
    syncNotificationHistoryButtons();
    return;
  }

  const items = notificationItemsFromState(state);
  const unreadCount = items.filter((item) => item.unread).length;
  readAllBtn?.toggleAttribute("disabled", unreadCount < 1);
  unreadAllBtn?.toggleAttribute("disabled", items.length < 1 || unreadCount === items.length);
  if (summary) {
    summary.textContent = `${items.length} notification${items.length === 1 ? "" : "s"}. ${unreadCount} unread.`;
  }

  if (!items.length) {
    syncNotificationHistoryButtons();
    root.innerHTML = `<div class="msg-empty">No notifications yet.</div>`;
    return;
  }

  root.innerHTML = `
    <div class="notification-stack">
      ${items.map((item) => `
        <article class="notification-card ${item.unread ? "unread" : ""}">
          <div class="notification-card-top">
            <div>
              <div class="notification-title-row">
                <strong>${escapeHtml(item.title)}</strong>
                <span class="notification-tag">${escapeHtml(notificationTag(item.kind))}</span>
              </div>
              <div class="notification-meta">${escapeHtml(relativeTime(item.createdAt))}</div>
            </div>
            ${item.unread ? `<span class="notification-dot" aria-hidden="true"></span>` : ""}
          </div>
          <p class="notification-body">${escapeHtml(item.body || "")}</p>
          <div class="notification-actions">
            ${notificationActions(item)}
          </div>
        </article>
      `).join("")}
    </div>
  `;
  syncNotificationHistoryButtons();
}

function renderAll(state) {
  const user = resolvedUser(state);
  const profile = resolvedProfile(state) || {};
  ensureViewedProfileLoaded(state);
  const resolvedSiteTimeMs = resolvedOwnSiteTimeMs(profile, user);
  const authSignature = JSON.stringify({
    authHydrated,
    socialReady: !!state.ready,
    uid: user?.uid || "",
    targetId: currentInfoTargetId(),
    username: profile?.username || "",
    email: user?.email || "",
    verified: isVerifiedState(user, profile),
    photoURL: profile?.photoURL || "",
    xp: profile?.xp || 0,
    streak: profile?.streak?.current || 0,
    longest: profile?.longestStreak || profile?.streak?.longest || 0,
    siteTimeMs: resolvedSiteTimeMs,
    createdAt: formatDateOnly(profile?.createdAt),
    copied: isUserIdCopied(user?.uid || ""),
    viewedFriend: (() => {
      const id = currentInfoTargetId();
      const friend = id ? state.friendProfiles?.[id] : null;
      return friend
        ? `${friend.uid || ""}:${friend.username || ""}:${friend.photoURL || ""}:${friend.canViewProfile !== false}:${friend.canMessage === true}:${friend.verified ?? ""}:${friend.currentRank || ""}:${friend.streakCurrent ?? ""}:${friend.streakLongest ?? ""}:${friend.siteTimeMs ?? ""}:${formatDateOnly(friend.createdAt)}`
        : "";
    })()
  });
  if (renderAll.lastAuthSignature !== authSignature) {
    renderAuth(state);
    renderAll.lastAuthSignature = authSignature;
  }

  const progressSignature = JSON.stringify({
    uid: user?.uid || "",
    xp: profile?.xp || 0,
    achievements: [...new Set(profile?.achievements || [])].sort()
  });
  if (renderAll.lastProgressSignature !== progressSignature) {
    renderProgress(state);
    renderAchievements(state);
    renderAll.lastProgressSignature = progressSignature;
  }

  const settingsSignature = JSON.stringify({
    uid: user?.uid || "",
    username: profile?.username || "",
    photoURL: profile?.photoURL || "",
    xp: profile?.xp || 0,
    createdAt: formatDateOnly(profile?.createdAt),
    siteTimeMs: resolvedSiteTimeMs,
    streak: profile?.streak?.current || 0,
    longest: profile?.longestStreak || profile?.streak?.longest || 0,
    privacyPreset: profile?.privacySettings?.preset || "private",
    privacyShowAvatar: profile?.privacySettings?.showAvatar === true,
    privacyShowVerified: profile?.privacySettings?.showVerified === true,
    privacyShowRank: profile?.privacySettings?.showRank !== false,
    privacyShowJoined: profile?.privacySettings?.showJoined !== false,
    privacyShowStreaks: profile?.privacySettings?.showStreaks !== false,
    privacyShowSiteAge: profile?.privacySettings?.showSiteAge !== false,
    friends: [...new Set(profile?.friends || [])].sort()
  });
  if (renderAll.lastSettingsSignature !== settingsSignature) {
    renderPrivacyProfilePreview(state);
    renderAll.lastSettingsSignature = settingsSignature;
  }

  const friendsSignature = JSON.stringify({
    authHydrated,
    uid: user?.uid || "",
    verified: isVerifiedState(user, profile),
    ready: !!state.ready,
    socialError: state.socialError || "",
    friends: [...new Set(state.friends || [])].sort(),
    blocked: [...new Set(state.blocked || [])].sort(),
    incoming: (state.incomingRequests || []).map((entry) => `${entry.id || ""}:${entry.status || "pending"}`).sort(),
    outgoing: (state.outgoingRequests || []).map((entry) => `${entry.id || ""}:${entry.status || "pending"}`).sort(),
    friendProfiles: Object.entries(state.friendProfiles || {}).map(([uid, info]) => [
      uid,
      info?.username || "",
      info?.photoURL || "",
      info?.currentRank || "",
      info?.streakCurrent ?? "",
      info?.streakLongest ?? ""
    ])
  });
  if (renderAll.lastFriendsSignature !== friendsSignature) {
    renderFriends(state);
    renderAll.lastFriendsSignature = friendsSignature;
  }

  const directMessagesSignature = JSON.stringify({
    uid: user?.uid || "",
    selected: currentChatUid(),
    friends: [...new Set(state.friends || [])].sort(),
    blocked: [...new Set(state.blocked || [])].sort(),
    messages: (state.messages || []).filter((message) => message.kind === "direct-message").map((message) => [
      message.id || "",
      message.fromUid || "",
      message.toUid || "",
      message.body || "",
      toMs(message.createdAt),
      [...new Set(message.readBy || [])].sort().join(",")
    ]),
    profiles: Object.entries(state.friendProfiles || {}).map(([uid, info]) => [uid, info?.username || "", info?.photoURL || ""])
  });
  if (renderAll.lastDirectMessagesSignature !== directMessagesSignature) {
    renderDirectMessages(state);
    renderAll.lastDirectMessagesSignature = directMessagesSignature;
  }

  const notificationsSignature = JSON.stringify({
    authHydrated,
    uid: user?.uid || "",
    verified: isVerifiedState(user, profile),
    ready: !!state.ready,
    unread: state.unreadCount || 0,
    undoDepth: notificationUndoStack.length,
    redoDepth: notificationRedoStack.length,
    local: (state.localNotifications || []).map((entry) => `${entry.id || ""}:${entry.read ? "1" : "0"}:${entry.createdAt || 0}`),
    social: (state.messages || [])
      .filter((message) => message.kind !== "direct-message")
      .filter((message) => String(message.kind || "") !== "friend-request" || String(message.status || "pending") === "pending")
      .map((message) => `${message.id || ""}:${(Array.isArray(message.readBy) ? message.readBy : []).includes(user?.uid || "") ? "1" : "0"}:${toMs(message.createdAt)}`)
  });
  if (renderAll.lastNotificationsSignature !== notificationsSignature) {
    renderNotifications(state);
    renderAll.lastNotificationsSignature = notificationsSignature;
  }

  applyAuthGuards();
  syncMessagesTabBadge(state);
}
renderAll.lastAuthSignature = "";
renderAll.lastProgressSignature = "";
renderAll.lastSettingsSignature = "";
renderAll.lastFriendsSignature = "";
renderAll.lastNotificationsSignature = "";
renderAll.lastDirectMessagesSignature = "";

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    window.prompt("Copy this value:", value);
    return false;
  }
}

function bindNavigation() {
  // Both of these are delegated to document rather than to an element inside
  // the page, so the client-side router swapping the content out does not take
  // them with it. Named and unsubscribed, or every return to the account page
  // would add another copy and a single click would fire all of them.
  const onSectionClick = (event) => {
    const sectionButton = event.target.closest("[data-target], [data-open-section], [data-settings-subtab]");
    if (!sectionButton) return;

    if (sectionButton.dataset.target) {
      window.openAccountArea(sectionButton.dataset.target);
      return;
    }

    if (sectionButton.dataset.openSection) {
      window.openAccountArea(sectionButton.dataset.openSection);
      return;
    }

    if (sectionButton.dataset.settingsSubtab) {
      window.openAccountArea("settings", sectionButton.dataset.settingsSubtab);
    }
  };

  const onDocumentClick = (event) => {
    if (!event.target.closest(".friend-entry-menu")) {
      document.querySelectorAll(".friend-entry-menu[open]").forEach((menu) => menu.removeAttribute("open"));
    }
  };

  document.addEventListener("click", onSectionClick);
  document.addEventListener("click", onDocumentClick);
  accountUnsubs.push(() => document.removeEventListener("click", onSectionClick));
  accountUnsubs.push(() => document.removeEventListener("click", onDocumentClick));
}

function bindFriends() {
  $("friend-search-input")?.addEventListener("input", () => renderFriends(currentState));

  $("friend-request-send-btn")?.addEventListener("click", async () => {
    try {
      await sendFriendRequestById($("friend-id-input")?.value || "", $("friend-note-input")?.value || "");
      if ($("friend-id-input")) $("friend-id-input").value = "";
      if ($("friend-note-input")) $("friend-note-input").value = "";
      setStatus("Friend request sent.", "success");
      window.openAccountArea("friends", "requests");
    } catch (error) {
      setStatus(error?.message || "Could not send friend request.", "error");
      window.alert(error?.message || "Could not send friend request.");
    }
  });

  $("block-user-btn")?.addEventListener("click", async () => {
    try {
      await blockUser($("friend-id-input")?.value || "");
      if ($("friend-id-input")) $("friend-id-input").value = "";
      if ($("friend-note-input")) $("friend-note-input").value = "";
      setStatus("User blocked.", "success");
      window.openAccountArea("friends", "blocked");
    } catch (error) {
      setStatus(error?.message || "Could not block user.", "error");
      window.alert(error?.message || "Could not block user.");
    }
  });

  const onFriendActionClick = async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const action = button.dataset.action;
    const uid = button.dataset.uid || "";
    const id = button.dataset.id || "";

    try {
      if (action === "friend-view") {
        window.openAccountArea("info", null, uid);
        return;
      }

      if (action === "friend-message") {
        openDirectConversation(uid);
        return;
      }

      if (action === "friend-copy") {
        const copied = await copyText(uid);
        if (copied) {
          button.textContent = "Copied";
          setTimeout(() => {
            if (button.isConnected) button.textContent = "Copy ID";
          }, 1200);
        }
        return;
      }

      if (action === "friend-remove") {
        await removeFriend(uid);
        setStatus("Friend removed.", "success");
        return;
      }

      if (action === "friend-block") {
        await blockUser(uid);
        setStatus("User blocked.", "success");
        return;
      }

      if (action === "friend-unblock") {
        await unblockUser(uid);
        setStatus("User unblocked.", "success");
        return;
      }

      if (action === "request-accept") {
        await respondToFriendRequest(id, "accept");
        setStatus("Friend request accepted.", "success");
        window.openAccountArea("friends", "friends");
        return;
      }

      if (action === "request-ignore") {
        await respondToFriendRequest(id, "ignore");
        setStatus("Friend request ignored.", "info");
        window.openAccountArea("friends", "requests");
        return;
      }

      if (action === "request-decline") {
        await respondToFriendRequest(id, "decline");
        setStatus("Friend request declined.", "info");
        window.openAccountArea("friends", "requests");
      }
    } catch (error) {
      console.error(error);
      window.alert(error?.message || "Action failed.");
    }
  };
  document.body.addEventListener("click", onFriendActionClick);
  accountUnsubs.push(() => document.body.removeEventListener("click", onFriendActionClick));
}

function bindDirectMessages() {
  const onMessageTabClick = (event) => {
    const button = event.target.closest("[data-message-view]");
    if (!button) return;
    const view = button.dataset.messageView === "activity" ? "activity" : "inbox";
    window.openAccountArea("messages", view === "activity" ? "activity" : "inbox");
  };
  const onThreadClick = (event) => {
    const button = event.target.closest("[data-dm-open]");
    if (!button) return;
    openDirectConversation(button.dataset.dmOpen);
  };
  const onProfileClick = (event) => {
    const button = event.target.closest("[data-dm-profile]");
    if (!button) return;
    window.openAccountArea("info", null, button.dataset.dmProfile);
  };

  document.body.addEventListener("click", onMessageTabClick);
  document.body.addEventListener("click", onThreadClick);
  document.body.addEventListener("click", onProfileClick);
  accountUnsubs.push(() => document.body.removeEventListener("click", onMessageTabClick));
  accountUnsubs.push(() => document.body.removeEventListener("click", onThreadClick));
  accountUnsubs.push(() => document.body.removeEventListener("click", onProfileClick));

  $("dm-compose-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const peerUid = currentChatUid();
    const messageInput = $("dm-compose-input");
    const sendButton = $("dm-send-btn");
    const body = messageInput?.value || "";
    if (!peerUid || !body.trim()) return;
    if (sendButton) sendButton.disabled = true;
    if ($("dm-status")) $("dm-status").textContent = "Sending message…";
    try {
      await sendDirectMessage(peerUid, body);
      if (messageInput) messageInput.value = "";
      if ($("dm-status")) $("dm-status").textContent = "Message sent.";
      renderDirectMessages(currentState);
    } catch (error) {
      if ($("dm-status")) $("dm-status").textContent = error?.message || "Could not send your message.";
    } finally {
      if (sendButton) sendButton.disabled = false;
    }
  });
}

function refreshLocalNotifications(uid = resolvedUser(currentState)?.uid || "") {
  currentState.localNotifications = getStoredNotifications(uid);
}

function bindNotifications() {
  const onNotificationBulkClick = async (event) => {
    const button = event.target.closest("[id^='notifications-'][id$='-btn']");
    if (!button) return;

    try {
      if (button.id === "notifications-read-all-btn") {
        const items = notificationItemsFromState(currentState).filter((item) => item.unread);
        if (!items.length) return;
        const undoOps = items.map((item) => notificationReadOp(item, false));
        const redoOps = items.map((item) => notificationReadOp(item, true));
        await applyNotificationOps(redoOps);
        rememberNotificationHistory(undoOps, redoOps);
        setStatus("All notifications marked as read.", "success");
        return;
      }

      if (button.id === "notifications-unread-all-btn") {
        const items = notificationItemsFromState(currentState).filter((item) => !item.unread);
        if (!items.length) return;
        const undoOps = items.map((item) => notificationReadOp(item, true));
        const redoOps = items.map((item) => notificationReadOp(item, false));
        await applyNotificationOps(redoOps);
        rememberNotificationHistory(undoOps, redoOps);
        setStatus("All notifications marked as unread.", "info");
        return;
      }

      if (button.id === "notifications-undo-btn") {
        await runNotificationHistory("undo");
        setStatus("Last notification action undone.", "info");
        return;
      }

      if (button.id === "notifications-redo-btn") {
        await runNotificationHistory("redo");
        setStatus("Last notification action redone.", "info");
      }
    } catch (error) {
      console.error(error);
      window.alert(error?.message || "Action failed.");
    }
  };
  document.body.addEventListener("click", onNotificationBulkClick);
  accountUnsubs.push(() => document.body.removeEventListener("click", onNotificationBulkClick));

  const onNotificationActionClick = async (event) => {
    const button = event.target.closest("[data-notification-action]");
    if (!button) return;

    const action = String(button.dataset.notificationAction || "").trim();
    const source = String(button.dataset.source || "").trim();
    const id = String(button.dataset.id || "").trim();
    const uid = String(button.dataset.uid || "").trim();

    try {
      if (action === "open-link") {
        const item = findNotificationItem(source, id);
        if (!item) return;
        if (item.unread) {
          await applyNotificationOps([notificationReadOp(item, true)]);
        }
        if (item.href) {
          openNotificationHref(item.href);
        }
        return;
      }

      if (action === "accept-request") {
        await respondToFriendRequest(id, "accept");
        setStatus("Friend request accepted.", "success");
        window.openAccountArea("friends", "friends");
        return;
      }

      if (action === "ignore-request") {
        await respondToFriendRequest(id, "ignore");
        setStatus("Friend request ignored.", "info");
        return;
      }

      if (action === "decline-request") {
        await respondToFriendRequest(id, "decline");
        setStatus("Friend request declined.", "info");
        return;
      }

      if (action === "mark-read") {
        const item = findNotificationItem(source, id);
        if (!item) return;
        const undoOps = [notificationReadOp(item, false)];
        const redoOps = [notificationReadOp(item, true)];
        await applyNotificationOps(redoOps);
        rememberNotificationHistory(undoOps, redoOps);
        return;
      }

      if (action === "mark-unread") {
        const item = findNotificationItem(source, id);
        if (!item) return;
        const undoOps = [notificationReadOp(item, true)];
        const redoOps = [notificationReadOp(item, false)];
        await applyNotificationOps(redoOps);
        rememberNotificationHistory(undoOps, redoOps);
        return;
      }

      if (action === "delete") {
        const item = findNotificationItem(source, id);
        if (!item) return;
        const undoOps = [notificationDeleteUndoOp(item)];
        const redoOps = [notificationDeleteRedoOp(item)];
        await applyNotificationOps(redoOps);
        rememberNotificationHistory(undoOps, redoOps);
      }
    } catch (error) {
      console.error(error);
      window.alert(error?.message || "Action failed.");
    }
  };
  document.body.addEventListener("click", onNotificationActionClick);
  accountUnsubs.push(() => document.body.removeEventListener("click", onNotificationActionClick));
}

function accountAddPrivacySettings() {
  const preset = document.querySelector('input[name="account-add-privacy"]:checked')?.value;
  if (!preset) return null;
  const settings = { preset };
  for (const input of document.querySelectorAll("[data-account-add-privacy-field]")) {
    settings[input.dataset.accountAddPrivacyField] = input.checked === true;
  }
  return normalizePrivacySettings(settings);
}

function setAccountAddStatus(message = "", kind = "info") {
  const status = $("account-add-status");
  if (!status) return;
  status.textContent = message;
  status.dataset.kind = kind;
}

function setAccountAddMode(mode = "login") {
  const next = mode === "signup" ? "signup" : "login";
  document.querySelectorAll("[data-account-add-mode]").forEach((button) => {
    const selected = button.dataset.accountAddMode === next;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  document.querySelectorAll("[data-account-add-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.accountAddPanel !== next;
  });
}

function bindAccountSwitcher() {
  const list = $("account-switcher-list");
  const addButton = $("account-add-btn");
  const dialog = $("account-add-dialog");
  if (!list || !addButton || !dialog) return () => {};

  let live = true;
  let originalSlotId = "";
  let busy = false;
  const removers = [];
  const bind = (element, eventName, handler) => {
    if (!element) return;
    element.addEventListener(eventName, handler);
    removers.push(() => element.removeEventListener(eventName, handler));
  };

  const setBusy = (value) => {
    busy = value;
    dialog.querySelectorAll("button").forEach((button) => { button.disabled = value; });
  };

  const render = (slots = []) => {
    if (!live) return;
    const signedIn = slots.filter((slot) => slot.signedIn);
    const count = $("account-switcher-count");
    if (count) count.textContent = `${signedIn.length} of 3`;
    addButton.disabled = signedIn.length >= 3;
    addButton.setAttribute("aria-disabled", String(signedIn.length >= 3));

    if (!signedIn.length) {
      list.innerHTML = '<div class="account-switcher-empty"><span class="account-switcher-empty-icon" aria-hidden="true">＋</span><div><strong>No saved accounts yet</strong><span>Sign in or create an account to keep it ready on this device.</span></div></div>';
    } else {
      list.innerHTML = signedIn.map((slot) => {
        const name = escapeHtml(slot.displayName || "Player");
        const email = escapeHtml(slot.email || "");
        const photo = String(slot.photoURL || "");
        const safePhoto = /^https:\/\//i.test(photo) || /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(photo);
        const avatar = safePhoto
          ? `<img class="account-slot-avatar" src="${escapeHtml(photo)}" alt="" />`
          : `<span class="account-slot-avatar account-slot-avatar-fallback" aria-hidden="true">${escapeHtml((slot.displayName || "P").trim().slice(0, 1).toUpperCase() || "P")}</span>`;
        const current = slot.active;
        return `<article class="account-slot${current ? " is-active" : ""}">
          ${avatar}
          <div class="account-slot-identity"><strong>${name}</strong><span>${email || "Signed-in account"}</span></div>
          <span class="account-slot-state${current ? " is-current" : ""}">${current ? "Current" : "Ready"}</span>
          <div class="account-slot-actions">
            <button type="button" class="account-slot-switch" data-account-switch="${escapeHtml(slot.id)}" ${current ? "disabled aria-current=\"true\"" : ""}>${current ? "Selected" : "Switch"}</button>
            <button type="button" class="account-slot-remove" data-account-remove="${escapeHtml(slot.id)}" aria-label="Remove ${name} from this device">Remove</button>
          </div>
        </article>`;
      }).join("");
    }

    const status = $("account-switcher-status");
    if (status) {
      status.textContent = signedIn.length >= 3
        ? "All three account spaces are in use. Remove one from this device to add another."
        : "Each account stays signed in separately on this device.";
      status.dataset.kind = signedIn.length >= 3 ? "info" : "";
    }
  };

  const unsubscribe = subscribeAccountSlots(render);
  bind(list, "click", async (event) => {
    const switchButton = event.target.closest("[data-account-switch]");
    const removeButton = event.target.closest("[data-account-remove]");
    try {
      if (switchButton) {
        switchButton.disabled = true;
        await activateAccountSlot(switchButton.dataset.accountSwitch);
        setStatus("Switched account.", "success");
      } else if (removeButton) {
        const slots = await getAccountSlots();
        const slot = slots.find((entry) => entry.id === removeButton.dataset.accountRemove);
        if (!slot?.signedIn) return;
        const label = slot.displayName || slot.email || "this account";
        if (!window.confirm(`Remove ${label} from this device? This signs it out here but does not delete the account.`)) return;
        removeButton.disabled = true;
        await removeAccountSlot(slot.id);
        setStatus(`${label} was signed out on this device.`, "info");
      }
    } catch (error) {
      setStatus(error?.message || "That account action could not be completed.", "error");
    }
  });

  bind(addButton, "click", async () => {
    const slots = await getAccountSlots();
    if (slots.filter((slot) => slot.signedIn).length >= 3) {
      const status = $("account-switcher-status");
      if (status) status.textContent = "Remove one saved account before adding another.";
      return;
    }
    originalSlotId = getActiveAccountSlotId();
    setAccountAddMode("login");
    setAccountAddStatus("Your other signed-in accounts will stay ready to switch back to.");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    $("account-add-login-email")?.focus();
  });

  bind($("account-add-close"), "click", () => dialog.close());
  bind(dialog, "cancel", (event) => { if (busy) event.preventDefault(); });
  bind(dialog, "click", (event) => {
    if (event.target === dialog && !busy) dialog.close();
  });
  bind(dialog, "close", async () => {
    dialog.querySelectorAll('input[type="password"]').forEach((input) => { input.value = ""; });
    if (busy || !originalSlotId) return;
    try {
      const slots = await getAccountSlots();
      const original = slots.find((slot) => slot.id === originalSlotId);
      const active = slots.find((slot) => slot.active);
      if (original?.signedIn && active && !active.signedIn) await activateAccountSlot(originalSlotId);
    } catch (error) {
      console.warn("Could not restore the previous account after closing the add-account dialog:", error);
    }
  });

  for (const tab of dialog.querySelectorAll("[data-account-add-mode]")) {
    bind(tab, "click", () => setAccountAddMode(tab.dataset.accountAddMode));
  }
  for (const radio of dialog.querySelectorAll('input[name="account-add-privacy"]')) {
    bind(radio, "change", () => {
      const custom = $("account-add-custom-privacy");
      if (custom) custom.hidden = radio.value !== "custom" || !radio.checked;
    });
  }

  const runInEmptySlot = async (action) => {
    if (busy) return;
    const previousSlotId = getActiveAccountSlotId();
    let targetSlotId = "";
    setBusy(true);
    try {
      targetSlotId = await activateFirstEmptyAccountSlot();
      const result = await action();
      const addedUser = result?.user || result;
      if (addedUser?.uid) {
        const duplicate = (await getAccountSlots()).find((slot) => slot.signedIn && !slot.active && slot.uid === addedUser.uid);
        if (duplicate) {
          await removeAccountSlot(targetSlotId);
          await activateAccountSlot(duplicate.id);
          originalSlotId = "";
          setStatus("That account is already saved on this device. Switched to it.", "info");
          dialog.close();
          return null;
        }
      }
      setAccountAddStatus("Account added. You can switch to it any time.", "success");
      originalSlotId = "";
      dialog.close();
      if (result?.needsPrivacySelection) {
        setStatus("Your new Google profile starts private. Choose what to share in account settings.", "info");
        window.openAccountArea?.("settings", "privacy");
      }
      return result;
    } catch (error) {
      try {
        const slots = await getAccountSlots();
        if (targetSlotId && slots.some((slot) => slot.id === targetSlotId && slot.signedIn)) {
          await removeAccountSlot(targetSlotId);
        }
        const refreshedSlots = await getAccountSlots();
        if (refreshedSlots.some((slot) => slot.id === previousSlotId && slot.signedIn)) await activateAccountSlot(previousSlotId);
      } catch (restoreError) {
        console.warn("Could not restore the previous active account:", restoreError);
      }
      setAccountAddStatus(error?.message || "We couldn't add that account. Check your details and try again.", "error");
      return null;
    } finally {
      setBusy(false);
    }
  };

  bind($("account-add-login-form"), "submit", async (event) => {
    event.preventDefault();
    await runInEmptySlot(() => login($("account-add-login-email")?.value || "", $("account-add-login-password")?.value || ""));
  });
  bind($("account-add-signup-form"), "submit", async (event) => {
    event.preventDefault();
    const privacy = accountAddPrivacySettings();
    const password = $("account-add-signup-password")?.value || "";
    const confirmation = $("account-add-signup-confirm")?.value || "";
    if (!privacy) {
      setAccountAddStatus("Choose a privacy preset before creating your account.", "error");
      return;
    }
    if (password !== confirmation) {
      setAccountAddStatus("Those passwords don't match yet.", "error");
      $("account-add-signup-confirm")?.focus();
      return;
    }
    await runInEmptySlot(() => createAccount(
      $("account-add-signup-email")?.value || "",
      password,
      $("account-add-username")?.value || "",
      privacy
    ));
  });

  const signInWithGoogle = (includePrivacy) => runInEmptySlot(async () => {
    const privacy = includePrivacy ? accountAddPrivacySettings() : null;
    if (includePrivacy && !privacy) throw new Error("Choose a privacy preset before continuing with Google.");
    return loginWithGoogle(privacy);
  });
  bind($("account-add-google-login"), "click", () => signInWithGoogle(false));
  bind($("account-add-google-signup"), "click", () => signInWithGoogle(true));

  return () => {
    live = false;
    unsubscribe();
    removers.forEach((remove) => remove());
    if (dialog.open) dialog.close();
  };
}

function disposeAccountModule() {
  stopAchievementSpotlight();
  for (let i = 0; i < accountUnsubs.length; i++) {
    try { accountUnsubs[i](); } catch (e) { console.error("Account disposal error:", e); }
  }
  accountUnsubs = [];
  accountBound = false;
}

// The client-side router navigates without a document load, so nothing else
// would ever call the dispose above. Handing it over keeps this module's
// Firestore subscriptions and document listeners from stacking up when you
// leave the account page and come back.
window.PanategwaRouteDispose = window.PanategwaRouteDispose || {};
window.PanategwaRouteDispose.account = disposeAccountModule;

function start() {
  if (accountBound) disposeAccountModule();
  accountBound = true;
  accountUnsubs = [];

  bindNavigation();
  accountUnsubs.push(initializeLoginUI());
  accountUnsubs.push(bindAccountSwitcher());
  bindFriends();
  bindDirectMessages();
  bindNotifications();
  showSettingsSubsection("account");
  refreshLocalNotifications();
  renderAll(currentState);
  applyInitialAccountArea();
  setStatus("Checking account...", "info");

  authReady
    .then(async () => {
      authHydrated = true;

      if (auth.currentUser && !currentState.user) {
        currentState.user = auth.currentUser;
      }

      if (auth.currentUser && !currentState.profile) {
        try {
          currentState.profile = await getProfile(auth.currentUser.uid);
        } catch (error) {
          console.error("Could not hydrate account profile:", error);
        }
      }

      renderAll(currentState);
    })
    .catch((error) => {
      authHydrated = true;
      console.error("Auth restore failed:", error);
      renderAll(currentState);
    });

  const __watchAuthUnsub = watchAuth(async (user, profile) => {
    authHydrated = true;

    const nextUid = user?.uid || "";
    if (notificationHistoryUserId !== nextUid) {
      notificationHistoryUserId = nextUid;
      notificationUndoStack = [];
      notificationRedoStack = [];
      syncNotificationHistoryButtons();
    }

    if (!user || copiedUserIdValue !== user.uid) {
      copiedUserIdValue = null;
      copiedUserIdUntil = 0;
      if (copiedUserIdTimer) {
        window.clearTimeout(copiedUserIdTimer);
        copiedUserIdTimer = null;
      }
    }

    currentState.user = user;
    currentState.profile = withResolvedOwnSiteTime(
      profile || (user ? await getProfile(user.uid) : null),
      user
    );
    refreshLocalNotifications(user?.uid || "");
    renderAll(currentState);

    if (!user) {
      setStatus("Not logged in.", "info");
      return;
    }

    setStatus(isVerifiedState(user, currentState.profile)
      ? "Logged in and verified."
      : "Logged in. Verify your email to unlock friends, messages, and player profiles.", "success");
  });
  if (typeof __watchAuthUnsub === "function") accountUnsubs.push(__watchAuthUnsub);

  const __socialUnsub = subscribeSocial((state) => {
    const authUser = auth.currentUser || currentState.user || null;
    const loggedOut = !auth.currentUser && !state.user;

    if (authUser || state.user || state.ready) {
      authHydrated = true;
    }

    currentState = {
      ...currentState,
      ...state,
      user: loggedOut ? null : (state.user || authUser),
      profile: loggedOut
        ? null
        : withResolvedOwnSiteTime(state.profile || currentState.profile, state.user || authUser)
    };
    renderAll(currentState);
  });
  if (typeof __socialUnsub === "function") accountUnsubs.push(__socialUnsub);

  const __notificationsUnsub = subscribeStoredNotifications((notifications) => {
    currentState.localNotifications = notifications;
    renderAll(currentState);
  }, () => resolvedUser(currentState)?.uid || "");
  if (typeof __notificationsUnsub === "function") accountUnsubs.push(__notificationsUnsub);

  function __accountSiteTimeListener(event) {
    const detail = event?.detail || {};
    const uid = detail.uid || "";
    if (!uid || currentState.user?.uid !== uid || !currentState.profile) return;
    currentState.profile = {
      ...currentState.profile,
      siteTimeMs: Number(detail.siteTimeMs || 0)
    };
    renderAll(currentState);
  }
  window.addEventListener("panategwa:sitetimechange", __accountSiteTimeListener);
  accountUnsubs.push(() => window.removeEventListener("panategwa:sitetimechange", __accountSiteTimeListener));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function () {
    start();
  });
} else {
  start();
}
