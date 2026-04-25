import {
  login,
  loginWithGoogle,
  createAccount,
  requestPasswordReset,
  resendVerificationEmail,
  refreshCurrentUserSession,
  getDefaultAvatarDataUrl,
  watchAuth,
  getProfile
} from "./auth.js";
import { auth, authReady } from "./firebase-config.js";

import {
  subscribeSocial,
  sendFriendRequestById,
  respondToFriendRequest,
  removeFriend,
  blockUser,
  viewProfileById,
  getUnreadIncomingCount
} from "./social.js";

import { ACHIEVEMENTS } from "./achievements.js";

const $ = (id) => document.getElementById(id);
const AUTH_REQUIRED_SECTIONS = new Set(["settings", "friends", "messages"]);

let currentState = {
  user: null,
  profile: null,
  socialError: null,
  friends: [],
  blocked: [],
  incomingRequests: [],
  outgoingRequests: [],
  friendProfiles: {},
  selectedProfile: null,
  selectedProfileId: null
};

let authMode = "login";
const baseOpenAccountArea = typeof window.openAccountArea === "function"
  ? window.openAccountArea.bind(window)
  : null;
const FRIENDS_SUBSECTIONS = new Set(["friends", "requests", "blocked"]);
const SETTINGS_SUBSECTIONS = new Set(["account", "privacy"]);
let copiedUserIdValue = null;
let copiedUserIdUntil = 0;
let copiedUserIdTimer = null;
let lastAchievementSignature = "";
let authHydrated = false;

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

function isVerifiedState(user, profile = null) {
  return !!(user?.emailVerified || profile?.verified);
}

function resolvedUser(state = currentState) {
  return state?.user || auth.currentUser || null;
}

function resolvedProfile(state = currentState) {
  return state?.profile || null;
}

function normalizeAccountSection(section = "info") {
  const nextSection = String(section || "info").trim().toLowerCase();
  return nextSection === "friends" ? "messages" : nextSection;
}

function isFriendsView(section = "info", sub = null) {
  const rawSection = String(section || "info").trim().toLowerCase();
  const nextSub = String(sub || "").trim().toLowerCase();
  return rawSection === "messages" || rawSection === "friends" || ["direct", "chat", "groups", "requests", "blocked"].includes(nextSub);
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

function updateSidebarAvatar(profile, user) {
  const photoURL = profile?.photoURL || (user ? getDefaultAvatarDataUrl() : "");
  localStorage.setItem("panategwa_sidebar_avatar_url", photoURL || "");

  if (typeof window.PanategwaUpdateSidebarAvatar === "function") {
    window.PanategwaUpdateSidebarAvatar(user && photoURL ? photoURL : "");
  }
}

function syncMessagesTabBadge(state) {
  const button = $("tab-messages");
  if (!button) return;

  const unread = Number(state.unreadCount || 0);
  const canUseMessages = isVerifiedState(resolvedUser(state), resolvedProfile(state));
  button.classList.toggle("has-dot", canUseMessages && unread > 0);
  button.setAttribute("aria-label", canUseMessages && unread > 0 ? `Friends (${unread} unread)` : "Friends");
  button.title = canUseMessages && unread > 0 ? `${unread} unread chat${unread === 1 ? "" : "s"}` : "Friends";
}

function setVisible(id, visible) {
  const el = $(id);
  if (!el) return;
  el.classList.toggle("section-hidden", !visible);
}

function isAuthRestoring() {
  return !authHydrated;
}

function updateLockedPanel(prefix, loggedIn, verified, restoring = false) {
  const title = $(`${prefix}-locked-title`);
  const copy = $(`${prefix}-locked-copy`);
  const refreshBtn = $(`${prefix}-locked-refresh-btn`);
  const resendBtn = $(`${prefix}-locked-resend-btn`);

  if (restoring) {
    if (title) {
      title.textContent = prefix === "messages"
        ? "Loading your friends system"
        : "Loading your account";
    }

    if (copy) {
      copy.textContent = prefix === "messages"
        ? "Your chats, friend requests, and friend list are syncing now."
        : "Your profile, settings, and account tools are syncing now.";
    }

    setVisible(`${prefix}-locked-refresh-btn`, false);
    setVisible(`${prefix}-locked-resend-btn`, false);
    return;
  }

  if (title) {
    title.textContent = !loggedIn
      ? (prefix === "messages" ? "Log in to use the friends system" : "Log in to edit your settings")
      : (prefix === "messages" ? "Verify your email to unlock friends" : "Verify your email to unlock settings");
  }

  if (copy) {
    copy.textContent = !loggedIn
      ? (prefix === "messages"
        ? "Your friends, chats, and requests only load after you sign in."
        : "Your profile, password, avatar, and account actions are available after you sign in.")
      : (prefix === "messages"
        ? "Direct messages, friend requests, and friend actions unlock after your email is verified."
        : "Profile edits, avatars, privacy settings, and account actions unlock after your email is verified.");
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
    renderAll(currentState);
    if (typeof window.PanategwaMessagesRender === "function") {
      window.PanategwaMessagesRender();
    }
    setStatus(isVerifiedState(refreshed.user, refreshed.profile)
      ? "Email verified. Everything is unlocked now."
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

function setAuthMode(mode = "login") {
  authMode = mode === "signup" ? "signup" : "login";

  const loginActive = authMode === "login";
  $("auth-mode-login-btn")?.classList.toggle("active", loginActive);
  $("auth-mode-signup-btn")?.classList.toggle("active", !loginActive);
  document.querySelectorAll("[data-auth-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.authPanel === authMode);
  });

  const heading = $("auth-mode-heading");
  const copy = $("auth-mode-copy");
  const switchCopy = $("auth-switch-copy");
  const switchButton = $("auth-switch-btn");

  if (heading) heading.textContent = loginActive ? "Log in" : "Create account";
  if (copy) {
    copy.textContent = loginActive
      ? "Use your email and password or Google to sign in."
      : "Create your account to unlock friends, messages, and synced progress.";
  }
  if (switchCopy) switchCopy.textContent = loginActive ? "Don't have an account?" : "Already have an account?";
  if (switchButton) switchButton.textContent = loginActive ? "Create one" : "Log in";
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
  const unlocked = loggedIn && verified;

  setVisible("settings-locked", restoring || !unlocked);
  setVisible("settings-content", !restoring && unlocked);
  setVisible("friends-locked", restoring || !unlocked);
  setVisible("friends-content", !restoring && unlocked);
  setVisible("messages-locked", restoring || !unlocked);
  setVisible("messages-content", !restoring && unlocked);
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
        : "Verify your email to fully unlock synced account features.");
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
    const nextSub = isFriendsView(requestedSection, sub) ? (sub || "direct") : sub;
    let finalSub = nextSub || null;

    document.querySelectorAll(".account-section").forEach((el) => {
      el.classList.toggle("active", el.dataset.section === nextSection);
    });

    document.querySelectorAll(".tab-button").forEach((button) => {
      button.classList.toggle("active", button.dataset.target === nextSection);
    });

    if (isFriendsView(requestedSection, sub)) {
      finalSub = nextSub || "direct";
      if (typeof window.PanategwaMessagesOpen === "function") {
        window.PanategwaMessagesOpen(finalSub, targetId || null);
      } else if (typeof window.PanategwaMessagesRender === "function") {
        window.PanategwaMessagesRender();
      }
    } else if (nextSection === "settings") {
      finalSub = nextSub || "account";
      showSettingsSubsection(finalSub);
    }

    if (nextSection === "progress" && targetId) {
      setTimeout(() => {
        document.getElementById(`achievement-card-${targetId}`)?.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
      }, 180);
    }

    syncQuery(nextSection, finalSub, targetId);
  } catch (error) {
    console.error("Account navigation error:", error);
    if (baseOpenAccountArea) {
      baseOpenAccountArea(section, sub, targetId);
    }
  }
};

function renderAuth(state) {
  const user = resolvedUser(state);
  const profile = resolvedProfile(state) || {};
  const authCard = $("auth-card");
  const accountCard = $("account-card");
  const info = $("user-info");

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

  const username = profile.username || user.displayName || "Player";
  const email = user.email || profile.email || "--";
  const verified = user.emailVerified ? "Yes" : "No";
  const xp = typeof profile.xp === "number" ? profile.xp : 0;
  const streak = profile?.streak?.current || 0;
  const longestStreak = profile?.longestStreak || profile?.streak?.longest || streak || 0;
  const memberFor = relativeSince(profile.createdAt);
  const avatarUrl = profile.photoURL || getDefaultAvatarDataUrl();
  const avatar = `<img src="${escapeHtml(avatarUrl)}" alt="Avatar" class="account-avatar" />`;
  const copied = isUserIdCopied(user.uid);
  const verifyNotice = !isVerifiedState(user, profile) ? `
    <div class="verify-callout">
      <strong>Verify your email to unlock account features</strong>
      <p>Friends, direct messages, avatars, privacy controls, and the rest of your account tools open as soon as your email is verified.</p>
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
      <div class="info-row"><span>Status</span><strong>Logged in</strong></div>
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
      <div class="info-row"><span>Created</span><strong>${escapeHtml(formatDateOnly(profile.createdAt))}</strong></div>
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

  updateSidebarAvatar(profile, user);
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

    return `
      <div class="achievement-card ${isUnlocked ? "unlocked" : "locked"}" id="achievement-card-${escapeHtml(achievement.id)}" data-achievement-id="${escapeHtml(achievement.id)}">
        <div class="achievement-status ${isUnlocked ? "unlocked" : "locked"}">${isUnlocked ? "Unlocked" : "Locked"}</div>
        <div class="achievement-copy">
          <div class="achievement-name">${escapeHtml(title)}</div>
          <div class="achievement-desc">${escapeHtml(description)}</div>
          <div class="achievement-desc">Reward: +${escapeHtml(String(achievement.reward || 0))} XP</div>
        </div>
      </div>
    `;
  }).join("");
}

function renderSelectedProfile(state) {
  const container = $("friend-profile-view");
  if (!container) return;

  const user = resolvedUser(state);
  if (!user) {
    container.innerHTML = `
      <div class="friend-profile-card">
        <div class="subsection-head"><h3>Profile preview</h3></div>
        <div class="msg-empty">Log in to preview profiles.</div>
      </div>
    `;
    return;
  }

  const profile = state.selectedProfile || resolvedProfile(state) || {};
  const username = profile.username || "Player";
  const isSelf = profile.uid === user.uid;
  const canViewProfile = isSelf || profile.canViewProfile !== false;
  const resolvedStateProfile = resolvedProfile(state) || {};
  const rank = profile.currentRank ?? (isSelf ? getRank(profile.xp || 0) : null);
  const streakCurrent = profile.streakCurrent ?? (isSelf ? (resolvedStateProfile?.streak?.current || 0) : null);
  const streakLongest = profile.streakLongest ?? (isSelf ? (resolvedStateProfile?.longestStreak || resolvedStateProfile?.streak?.longest || streakCurrent || 0) : null);
  const avatar = `<img src="${escapeHtml(profile.photoURL || getDefaultAvatarDataUrl())}" alt="${escapeHtml(username)} avatar" class="profile-avatar-large" />`;

  if (!canViewProfile) {
    container.innerHTML = `
      <div class="friend-profile-card">
        <div class="subsection-head">
          <h3>${isSelf ? "Your profile" : "Profile preview"}</h3>
          <span class="profile-badge">${isSelf ? "You" : "Friends only"}</span>
        </div>

        <div class="profile-hero">
          ${avatar}
          <div>
            <div class="profile-name">${escapeHtml(username)}</div>
            <div class="friend-entry-meta">ID: ${escapeHtml(profile.uid || "--")}</div>
          </div>
        </div>

        <div class="msg-empty">Only friends can view this account. Accept each other first to unlock full profile info.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="friend-profile-card">
      <div class="subsection-head">
        <h3>${isSelf ? "Your profile" : "Profile preview"}</h3>
        <span class="profile-badge">${isSelf ? "You" : "Friend"}</span>
      </div>

      <div class="profile-hero">
        ${avatar}
        <div>
          <div class="profile-name">${escapeHtml(username)}</div>
          <div class="friend-entry-meta">ID: ${escapeHtml(profile.uid || "--")}</div>
        </div>
      </div>

      <div class="profile-meta">
        <div><span>Rank</span><strong>${escapeHtml(rank || "Hidden")}</strong></div>
        <div><span>Friends</span><strong>${escapeHtml(String((profile.friends || []).length || 0))}</strong></div>
        <div><span>Current streak</span><strong>${streakCurrent == null ? "Hidden" : `${streakCurrent} day${streakCurrent === 1 ? "" : "s"}`}</strong></div>
        <div><span>Longest streak</span><strong>${streakLongest == null ? "Hidden" : `${streakLongest} day${streakLongest === 1 ? "" : "s"}`}</strong></div>
      </div>

      <div class="info-grid">
        <div class="info-row"><span>Username</span><strong>${escapeHtml(username)}</strong></div>
        <div class="info-row"><span>Rank</span><strong>${escapeHtml(rank || "Hidden")}</strong></div>
        <div class="info-row"><span>Joined</span><strong>${profile.createdAt ? escapeHtml(formatDateOnly(profile.createdAt)) : "Hidden"}</strong></div>
        <div class="info-row"><span>Status</span><strong>${isSelf ? "Your account" : "Friend profile"}</strong></div>
        <div class="info-row"><span>Current streak</span><strong>${streakCurrent == null ? "Hidden" : `${streakCurrent} day${streakCurrent === 1 ? "" : "s"}`}</strong></div>
        <div class="info-row"><span>Longest streak</span><strong>${streakLongest == null ? "Hidden" : `${streakLongest} day${streakLongest === 1 ? "" : "s"}`}</strong></div>
      </div>

      <div class="profile-body-note">${escapeHtml(isSelf ? "Only friends can view your account. Privacy controls below decide which details they can see." : "Only friends can view this account. Some details may be hidden by your friend's privacy settings.")}</div>
    </div>
  `;
}

function profileAvatarMarkup(profile) {
  return `<img src="${escapeHtml(profile.photoURL || getDefaultAvatarDataUrl())}" alt="" style="width: 46px; height: 46px; border-radius: 50%; object-fit: cover;" />`;
}

function renderFriends(state) {
  const friendsStatus = $("friends-status");
  const friendsWarning = $("friends-warning");
  const friendsList = $("friends-list");
  const blockedList = $("blocked-list");
  const requestsList = $("requests-list");

  if (!state.user) {
    if (friendsWarning) {
      friendsWarning.textContent = "";
      friendsWarning.classList.add("section-hidden");
    }
    if (friendsStatus) friendsStatus.textContent = "Log in to use the friends system.";
    if (friendsList) friendsList.innerHTML = `<div class="msg-empty">Log in to see your friend list.</div>`;
    if (blockedList) blockedList.innerHTML = `<div class="msg-empty">Log in to manage blocked users.</div>`;
    if (requestsList) requestsList.innerHTML = `<div class="msg-empty">Log in to view friend requests.</div>`;
    renderSelectedProfile(state);
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
    friendsStatus.textContent = `${friends.length} friends. ${incoming.length} incoming requests. ${getUnreadIncomingCount()} unread messages.`;
  }

  if (friendsWarning) {
    friendsWarning.textContent = state.socialError || "";
    friendsWarning.classList.toggle("section-hidden", !state.socialError);
  }

  if (friendsList) {
    friendsList.innerHTML = friendProfiles.length ? friendProfiles.map((friend) => `
      <div class="friend-entry">
        <button class="friend-entry-button ${state.selectedProfileId === friend.uid ? "active" : ""}" type="button" data-action="friend-view" data-uid="${escapeHtml(friend.uid)}">
          <span class="friend-entry-main">
            <span class="friend-entry-avatar">${profileAvatarMarkup(friend)}</span>
            <span class="friend-entry-text">
              <span class="friend-entry-name">${escapeHtml(friend.username || "Player")}</span>
              <span class="friend-entry-meta">${escapeHtml(friend.uid || "")}</span>
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
            <div class="social-icon">${escapeHtml(initials(profile.username || profile.uid || "B", "B"))}</div>
            <div class="social-main">
              <div class="social-title">${escapeHtml(profile.username || "Player")}</div>
              <div class="social-sub">${escapeHtml(profile.uid || "")}</div>
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
                <button type="button" data-action="request-view-profile" data-uid="${escapeHtml(request.fromUid || "")}">View profile</button>
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

  renderSelectedProfile(state);
}

function renderAll(state) {
  const user = resolvedUser(state);
  const profile = resolvedProfile(state) || {};
  const authSignature = JSON.stringify({
    authHydrated,
    uid: user?.uid || "",
    username: profile?.username || "",
    email: user?.email || profile?.email || "",
    verified: isVerifiedState(user, profile),
    photoURL: profile?.photoURL || "",
    xp: profile?.xp || 0,
    streak: profile?.streak?.current || 0,
    longest: profile?.longestStreak || profile?.streak?.longest || 0,
    createdAt: formatDateOnly(profile?.createdAt),
    copied: isUserIdCopied(user?.uid || "")
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

  const friendsSignature = JSON.stringify({
    authHydrated,
    uid: user?.uid || "",
    verified: isVerifiedState(user, profile),
    socialError: state.socialError || "",
    friends: [...new Set(state.friends || [])].sort(),
    blocked: [...new Set(state.blocked || [])].sort(),
    incoming: (state.incomingRequests || []).map((entry) => `${entry.id || ""}:${entry.status || "pending"}`).sort(),
    outgoing: (state.outgoingRequests || []).map((entry) => `${entry.id || ""}:${entry.status || "pending"}`).sort(),
    selectedProfileId: state.selectedProfileId || "",
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

  applyAuthGuards();
  syncMessagesTabBadge(state);
}
renderAll.lastAuthSignature = "";
renderAll.lastProgressSignature = "";
renderAll.lastFriendsSignature = "";

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
  document.addEventListener("click", (event) => {
    const sectionButton = event.target.closest("[data-target], [data-open-section], [data-auth-mode], [data-settings-subtab]");
    if (!sectionButton) return;

    if (sectionButton.dataset.target) {
      window.openAccountArea(sectionButton.dataset.target);
      return;
    }

    if (sectionButton.dataset.openSection) {
      window.openAccountArea(sectionButton.dataset.openSection);
      return;
    }

    if (sectionButton.dataset.authMode) {
      setAuthMode(sectionButton.dataset.authMode);
      return;
    }

    if (sectionButton.dataset.settingsSubtab) {
      window.openAccountArea("settings", sectionButton.dataset.settingsSubtab);
    }
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".friend-entry-menu")) {
      document.querySelectorAll(".friend-entry-menu[open]").forEach((menu) => menu.removeAttribute("open"));
    }
  });
}

function bindAuthForms() {
  $("auth-switch-btn")?.addEventListener("click", () => {
    setAuthMode(authMode === "login" ? "signup" : "login");
  });

  $("login-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      setStatus("Logging in...", "info");
      await login($("login-email")?.value || "", $("login-password")?.value || "");
      setStatus("Logged in. Loading your account...", "success");
    } catch (error) {
      console.error(error);
      setStatus(error?.message || "Login failed.", "error");
      window.alert(error?.message || "Login failed.");
    }
  });

  $("signup-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = $("signup-password")?.value || "";
    const confirmPassword = $("signup-password-confirm")?.value || "";

    if (password !== confirmPassword) {
      setStatus("Passwords do not match.", "error");
      return;
    }

    try {
      setStatus("Creating account...", "info");
      await createAccount(
        $("signup-email")?.value || "",
        password,
        $("signup-username")?.value || ""
      );
      setStatus("Account created. Check your inbox to verify your email.", "success");
      setAuthMode("login");
      if ($("login-email")) $("login-email").value = $("signup-email")?.value || "";
      if ($("login-password")) $("login-password").value = "";
    } catch (error) {
      console.error(error);
      setStatus(error?.message || "Could not create account.", "error");
      window.alert(error?.message || "Could not create account.");
    }
  });

  $("google-btn")?.addEventListener("click", async () => {
    try {
      setStatus("Opening Google sign-in...", "info");
      await loginWithGoogle();
      setStatus("Logged in with Google.", "success");
    } catch (error) {
      console.error(error);
      setStatus(error?.message || "Google sign-in failed.", "error");
      window.alert(error?.message || "Google sign-in failed.");
    }
  });

  $("reset-password-btn")?.addEventListener("click", async () => {
    const email = $("login-email")?.value || $("signup-email")?.value || "";
    if (!email) {
      setStatus("Type your email first.", "error");
      return;
    }

    try {
      setStatus("Sending reset email...", "info");
      await requestPasswordReset(email);
      setStatus("Password reset email sent.", "success");
    } catch (error) {
      console.error(error);
      setStatus(error?.message || "Could not send reset email.", "error");
      window.alert(error?.message || "Could not send reset email.");
    }
  });

  $("settings-locked-refresh-btn")?.addEventListener("click", handleVerificationRefresh);
  $("settings-locked-resend-btn")?.addEventListener("click", handleVerificationResend);
  $("messages-locked-refresh-btn")?.addEventListener("click", handleVerificationRefresh);
  $("messages-locked-resend-btn")?.addEventListener("click", handleVerificationResend);
}

function bindFriends() {
  $("friend-search-input")?.addEventListener("input", () => renderFriends(currentState));

  $("friend-request-send-btn")?.addEventListener("click", async () => {
    try {
      await sendFriendRequestById($("friend-id-input")?.value || "", $("friend-note-input")?.value || "");
      if ($("friend-id-input")) $("friend-id-input").value = "";
      if ($("friend-note-input")) $("friend-note-input").value = "";
      setStatus("Friend request sent.", "success");
      window.openAccountArea("info", "requests");
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
      window.openAccountArea("info", "blocked");
    } catch (error) {
      setStatus(error?.message || "Could not block user.", "error");
      window.alert(error?.message || "Could not block user.");
    }
  });

  document.body.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const action = button.dataset.action;
    const uid = button.dataset.uid || "";
    const id = button.dataset.id || "";

    try {
      if (action === "friend-view" || action === "request-view-profile") {
        await viewProfileById(uid);
        window.openAccountArea("info", "friends", uid);
        return;
      }

      if (action === "friend-message") {
        window.openAccountArea("messages", "chat", uid);
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

      if (action === "request-accept") {
        await respondToFriendRequest(id, "accept");
        await viewProfileById(uid);
        setStatus("Friend request accepted.", "success");
        window.openAccountArea("info", "friends", uid);
        return;
      }

      if (action === "request-ignore") {
        await respondToFriendRequest(id, "ignore");
        setStatus("Friend request ignored.", "info");
        window.openAccountArea("info", "requests");
        return;
      }

      if (action === "request-decline") {
        await respondToFriendRequest(id, "decline");
        setStatus("Friend request declined.", "info");
        window.openAccountArea("info", "requests");
      }
    } catch (error) {
      console.error(error);
      window.alert(error?.message || "Action failed.");
    }
  });
}

function start() {
  bindNavigation();
  bindAuthForms();
  setAuthMode("login");
  showSettingsSubsection("account");
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
      if (typeof window.PanategwaMessagesRender === "function") {
        window.PanategwaMessagesRender();
      }
    })
    .catch((error) => {
      authHydrated = true;
      console.error("Auth restore failed:", error);
      renderAll(currentState);
    });

  watchAuth(async (user, profile) => {
    if (!user || copiedUserIdValue !== user.uid) {
      copiedUserIdValue = null;
      copiedUserIdUntil = 0;
      if (copiedUserIdTimer) {
        window.clearTimeout(copiedUserIdTimer);
        copiedUserIdTimer = null;
      }
    }

    currentState.user = user;
    currentState.profile = profile || (user ? await getProfile(user.uid) : null);
    renderAll(currentState);

    if (!user) {
      setStatus("Not logged in.", "info");
      return;
    }

    setStatus(isVerifiedState(user, currentState.profile)
      ? "Logged in and verified."
      : "Logged in. Verify your email to unlock account features.", "success");
    if (typeof window.PanategwaMessagesRender === "function") {
      window.PanategwaMessagesRender();
    }
  });

  subscribeSocial((state) => {
    const authUser = auth.currentUser || currentState.user || null;
    const loggedOut = !auth.currentUser && !state.user;

    currentState = {
      ...currentState,
      ...state,
      user: loggedOut ? null : (state.user || authUser),
      profile: loggedOut ? null : (state.profile || currentState.profile)
    };
    renderAll(currentState);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
