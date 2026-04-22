import {
  login,
  loginWithGoogle,
  createAccount,
  requestPasswordReset,
  watchAuth,
  getProfile
} from "./auth.js";

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
  if (xp < 5) return "Explorer";
  if (xp < 20) return "Adventurer";
  return "Veteran";
}

function getRankInfo(xp) {
  if (xp < 5) return { current: "Explorer", next: "Adventurer", start: 0, end: 5 };
  if (xp < 20) return { current: "Adventurer", next: "Veteran", start: 5, end: 20 };
  return { current: "Veteran", next: "Max rank", start: 20, end: 20 };
}

function progressPercent(xp) {
  const info = getRankInfo(xp);
  if (xp >= 20) return 100;
  return Math.max(0, Math.min(100, ((xp - info.start) / Math.max(1, info.end - info.start)) * 100));
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
  const photoURL = user?.photoURL || profile?.photoURL || "";
  localStorage.setItem("panategwa_sidebar_avatar_url", photoURL || "");

  if (typeof window.PanategwaUpdateSidebarAvatar === "function") {
    window.PanategwaUpdateSidebarAvatar(user && photoURL ? photoURL : "");
  }
}

function setVisible(id, visible) {
  const el = $(id);
  if (!el) return;
  el.classList.toggle("section-hidden", !visible);
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

function applyAuthGuards() {
  const loggedIn = !!currentState.user;
  setVisible("settings-locked", !loggedIn);
  setVisible("settings-content", loggedIn);
  setVisible("friends-locked", !loggedIn);
  setVisible("friends-content", loggedIn);
  setVisible("messages-locked", !loggedIn);
  setVisible("messages-content", loggedIn);

  const progressHint = $("progress-login-hint");
  if (progressHint) {
    progressHint.textContent = loggedIn
      ? "Achievements and XP sync automatically while you explore the site."
      : "Log in to sync achievements and XP to your account.";
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
    const nextSection = String(section || "info").toLowerCase();

    document.querySelectorAll(".account-section").forEach((el) => {
      el.classList.toggle("active", el.dataset.section === nextSection);
    });

    document.querySelectorAll(".tab-button").forEach((button) => {
      button.classList.toggle("active", button.dataset.target === nextSection);
    });

    if (nextSection === "friends") {
      const nextSub = sub || "friends";
      showFriendsSubsection(nextSub);
      if (currentState.user && targetId) {
        viewProfileById(targetId).catch((error) => {
          console.error(error);
        });
      }
      syncQuery(nextSection, nextSub, targetId);
      return;
    }

    if (nextSection === "messages" && currentState.user) {
      if (typeof window.PanategwaMessagesOpen === "function") {
        window.PanategwaMessagesOpen(sub || "system", targetId || null);
      } else if (typeof window.PanategwaMessagesRender === "function") {
        window.PanategwaMessagesRender();
      }
    }

    if (nextSection === "progress" && targetId) {
      setTimeout(() => {
        document.getElementById(`achievement-card-${targetId}`)?.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
      }, 180);
    }

    syncQuery(nextSection, sub, targetId);
  } catch (error) {
    console.error("Account navigation error:", error);
    if (baseOpenAccountArea) {
      baseOpenAccountArea(section, sub, targetId);
    }
  }
};

function renderAuth(state) {
  const user = state.user;
  const profile = state.profile || {};
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
  const avatar = user.photoURL || profile.photoURL
    ? `<img src="${escapeHtml(user.photoURL || profile.photoURL)}" alt="Avatar" class="account-avatar" />`
    : `<div class="account-avatar-placeholder">${escapeHtml(initials(username))}</div>`;

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
          <button id="copy-user-id-btn" type="button" class="copy-icon-btn" aria-label="Copy account ID" title="Copy account ID">
            ${copyIcon()}
          </button>
        </strong>
      </div>
      <div class="info-row"><span>Created</span><strong>${escapeHtml(formatDateOnly(profile.createdAt))}</strong></div>
      <div class="info-row"><span>XP</span><strong>${xp}</strong></div>
      <div class="info-row"><span>Rank</span><strong>${escapeHtml(getRank(xp))}</strong></div>
      <div class="info-row"><span>Streak</span><strong>${streak} day${streak === 1 ? "" : "s"}</strong></div>
      <div class="info-row"><span>Longest streak</span><strong>${longestStreak} day${longestStreak === 1 ? "" : "s"}</strong></div>
    </div>
  `;

  $("copy-user-id-btn")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(user.uid);
      $("copy-user-id-btn").innerHTML = checkIcon();
      setTimeout(() => {
        if ($("copy-user-id-btn")) $("copy-user-id-btn").innerHTML = copyIcon();
      }, 1500);
    } catch {
      window.prompt("Copy this ID:", user.uid);
    }
  });

  updateSidebarAvatar(profile, user);
}

function renderProgress(state) {
  const profile = state.profile || {};
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
    $("xp-need").textContent = xp >= 20 ? "You reached the top rank." : `${info.end - xp} XP to next rank`;
  }
}

function renderAchievements(state) {
  const list = $("achievements-list");
  if (!list) return;

  const unlocked = new Set(state.profile?.achievements || []);
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
        <div class="achievement-icon">${isUnlocked ? "Unlocked" : "Locked"}</div>
        <div>
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

  if (!state.user) {
    container.innerHTML = `
      <div class="friend-profile-card">
        <div class="subsection-head"><h3>Profile preview</h3></div>
        <div class="msg-empty">Log in to preview profiles.</div>
      </div>
    `;
    return;
  }

  const profile = state.selectedProfile || state.profile || {};
  const username = profile.username || "Player";
  const isSelf = profile.uid === state.user.uid;
  const isPrivate = !!profile.socialSettings?.profileHidden && !isSelf;
  const avatar = profile.photoURL
    ? `<img src="${escapeHtml(profile.photoURL)}" alt="${escapeHtml(username)} avatar" class="profile-avatar-large" />`
    : `<div class="profile-avatar-large">${escapeHtml(initials(username))}</div>`;

  container.innerHTML = `
    <div class="friend-profile-card">
      <div class="subsection-head">
        <h3>${isSelf ? "Your profile" : "Profile preview"}</h3>
        <span class="profile-badge">${isSelf ? "You" : (isPrivate ? "Private" : "Public")}</span>
      </div>

      <div class="profile-hero">
        ${avatar}
        <div>
          <div class="profile-name">${escapeHtml(username)}</div>
          <div class="friend-entry-meta">ID: ${escapeHtml(profile.uid || "--")}</div>
        </div>
      </div>

      <div class="profile-meta">
        <div><span>XP</span><strong>${escapeHtml(String(profile.xp || 0))}</strong></div>
        <div><span>Friends</span><strong>${escapeHtml(String((profile.friends || []).length || 0))}</strong></div>
        <div><span>Verified</span><strong>${profile.verified ? "Yes" : "No"}</strong></div>
      </div>

      <div class="info-grid">
        <div class="info-row"><span>Username</span><strong>${escapeHtml(username)}</strong></div>
        <div class="info-row"><span>Email</span><strong>${escapeHtml(isPrivate ? "Hidden" : (profile.email || "--"))}</strong></div>
        <div class="info-row"><span>Joined</span><strong>${escapeHtml(formatDateOnly(profile.createdAt))}</strong></div>
        <div class="info-row"><span>Status</span><strong>${isSelf ? "Your account" : "Friend profile"}</strong></div>
      </div>

      <div class="profile-body-note">${escapeHtml(isPrivate ? "This account is private, so only public information is shown here." : "Public profile details are shown here.")}</div>
    </div>
  `;
}

function profileAvatarMarkup(profile) {
  if (profile.photoURL) {
    return `<img src="${escapeHtml(profile.photoURL)}" alt="" style="width: 46px; height: 46px; border-radius: 50%; object-fit: cover;" />`;
  }
  return escapeHtml(initials(profile.username || profile.uid || "P"));
}

function renderFriends(state) {
  const friendsStatus = $("friends-status");
  const friendsList = $("friends-list");
  const blockedList = $("blocked-list");
  const requestsList = $("requests-list");

  if (!state.user) {
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
          <summary aria-label="Friend actions">...</summary>
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
  renderAuth(state);
  renderProgress(state);
  renderAchievements(state);
  renderFriends(state);
  applyAuthGuards();
}

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
    const sectionButton = event.target.closest("[data-target], [data-open-section], [data-auth-mode], [data-friends-subtab]");
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

    if (sectionButton.dataset.friendsSubtab) {
      window.openAccountArea("friends", sectionButton.dataset.friendsSubtab, currentState.selectedProfileId || null);
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
      setStatus("Logged in.", "success");
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

  document.body.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const action = button.dataset.action;
    const uid = button.dataset.uid || "";
    const id = button.dataset.id || "";

    try {
      if (action === "friend-view" || action === "request-view-profile") {
        await viewProfileById(uid);
        window.openAccountArea("friends", "friends", uid);
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
        window.openAccountArea("friends", "friends", uid);
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
  });
}

function start() {
  bindNavigation();
  bindAuthForms();
  bindFriends();
  setAuthMode("login");
  showFriendsSubsection("friends");
  renderAll(currentState);
  applyInitialAccountArea();
  setStatus("Checking account...", "info");

  watchAuth(async (user, profile) => {
    currentState.user = user;
    currentState.profile = profile || (user ? await getProfile(user.uid) : null);
    renderAll(currentState);

    if (!user) {
      setStatus("Not logged in.", "info");
      return;
    }

    setStatus(user.emailVerified ? "Logged in and verified." : "Logged in.", "success");
    if (typeof window.PanategwaMessagesRender === "function") {
      window.PanategwaMessagesRender();
    }
  });

  subscribeSocial((state) => {
    currentState = { ...currentState, ...state };
    renderAll(currentState);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
