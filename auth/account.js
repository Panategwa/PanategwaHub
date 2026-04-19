import {
  login,
  loginWithGoogle,
  createAccount,
  logout,
  saveUsername,
  saveProfileEmoji,
  resendVerificationEmail,
  requestPasswordReset,
  deleteAccount
} from "./auth.js";

import {
  subscribeSocial,
  sendFriendRequestById,
  respondToFriendRequest,
  removeFriend,
  blockUser,
  toggleRequestsEnabled,
  toggleChatEnabled,
  toggleGroupChatsEnabled,
  toggleShowNonFriendGroupMessages,
  toggleProfileHidden,
  disableSocialSystem,
  enableSocialSystem,
  viewProfileById,
  getUnreadIncomingCount
} from "./social.js";

const $ = (id) => document.getElementById(id);

let currentState = null;
let profileUsernameDirty = false;

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
  const span = Math.max(1, info.end - info.start);
  return Math.max(0, Math.min(100, ((xp - info.start) / span) * 100));
}

function showSection(sectionName) {
  document.querySelectorAll(".account-section").forEach(section => {
    section.classList.toggle("active", section.dataset.section === sectionName);
  });

  document.querySelectorAll(".tab-button").forEach(button => {
    button.classList.toggle("active", button.dataset.target === sectionName);
  });

  if (sectionName === "messages" && typeof window.PanategwaMessagesRender === "function") {
    window.PanategwaMessagesRender();
  }
}

function showFriendsSubsection(name) {
  document.querySelectorAll("[data-friends-subpanel]").forEach(panel => {
    panel.classList.toggle("active", panel.dataset.friendsSubpanel === name);
  });

  document.querySelectorAll("[data-friends-subtab]").forEach(button => {
    button.classList.toggle("active", button.dataset.friendsSubtab === name);
  });
}

window.openAccountArea = function openAccountArea(section = "messages", sub = "direct", targetId = null) {
  showSection(section);

  if (section === "friends") {
    showFriendsSubsection(sub || "friends");
    if (targetId && sub === "profile") {
      viewProfileById(targetId);
    }
  }

  if (section === "progress" && targetId) {
    setTimeout(() => {
      document.getElementById(`achievement-card-${targetId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }, 150);
  }
};

function formatDate(value) {
  if (!value) return "—";
  if (typeof value === "number") return new Date(value).toLocaleString();
  if (typeof value?.toDate === "function") return value.toDate().toLocaleString();
  if (value instanceof Date) return value.toLocaleString();
  return "—";
}

function syncUsernameInput(force = false) {
  const input = $("profile-username");
  if (!input) return;
  const username = currentState?.profile?.username || currentState?.user?.displayName || "Player";
  if (force || (!profileUsernameDirty && document.activeElement !== input)) {
    input.value = username;
  }
}

function updateSidebarAvatar(user, profile) {
  const emoji = profile?.avatarEmoji || "👤";
  const photoURL = user?.photoURL || profile?.photoURL || "";
  localStorage.setItem("panategwa_sidebar_avatar_emoji", emoji);
  localStorage.setItem("panategwa_sidebar_avatar_url", photoURL || "");

  if (typeof window.PanategwaUpdateSidebarAvatar === "function") {
    window.PanategwaUpdateSidebarAvatar(emoji, photoURL);
  }
}

function renderAuth(state) {
  const info = $("user-info");
  const authCard = $("auth-card");
  const accountCard = $("account-card");

  if (!info) return;

  if (!state.user) {
    if (authCard) authCard.style.display = "block";
    if (accountCard) accountCard.style.display = "none";
    info.innerHTML = `
      <p><b>Status:</b> Not logged in</p>
      <p><b>Username:</b> —</p>
      <p><b>Email:</b> —</p>
      <p><b>Verified:</b> —</p>
      <p><b>XP:</b> 0</p>
      <p><b>Rank:</b> Explorer</p>
      <p><b>Account ID:</b> —</p>
      <p><b>Created:</b> —</p>
      <p><b>Last login:</b> —</p>
    `;
    updateSidebarAvatar(null, null);
    return;
  }

  if (authCard) authCard.style.display = "none";
  if (accountCard) accountCard.style.display = "block";

  const user = state.user;
  const profile = state.profile || {};
  const username = profile.username || user.displayName || "Player";
  const email = user.email || profile.email || "—";
  const verified = user.emailVerified ? "Yes" : "No";
  const xp = typeof profile.xp === "number" ? profile.xp : 0;
  const rank = getRank(xp);

  info.innerHTML = `
    <div class="account-header">
      ${
        user.photoURL
          ? `<img src="${escapeHtml(user.photoURL)}" alt="Avatar" class="account-avatar">`
          : `<div class="account-avatar-placeholder">${escapeHtml(profile.avatarEmoji || "👤")}</div>`
      }
      <div>
        <p style="margin:0;"><b>${escapeHtml(username)}</b></p>
        <p style="margin:0; opacity:0.8;">${escapeHtml(email)}</p>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-row"><span>Status</span><strong>Logged in</strong></div>
      <div class="info-row"><span>Username</span><strong>${escapeHtml(username)}</strong></div>
      <div class="info-row"><span>Email</span><strong>${escapeHtml(email)}</strong></div>
      <div class="info-row"><span>Verified</span><strong>${verified}</strong></div>
      <div class="info-row"><span>Account ID</span><strong style="word-break:break-all;">${escapeHtml(user.uid)}</strong></div>
      <div class="info-row"><span>Created</span><strong>${escapeHtml(formatDate(profile.createdAt))}</strong></div>
      <div class="info-row"><span>Last login</span><strong>${escapeHtml(formatDate(profile.lastLoginAt))}</strong></div>
      <div class="info-row"><span>XP</span><strong>${xp}</strong></div>
      <div class="info-row"><span>Rank</span><strong>${escapeHtml(rank)}</strong></div>
    </div>
  `;

  syncUsernameInput(false);
  updateSidebarAvatar(user, profile);
}

function renderProgress(state) {
  const xp = typeof state.profile?.xp === "number" ? state.profile.xp : 0;
  const info = getRankInfo(xp);

  const left = $("xp-left-rank");
  const right = $("xp-right-rank");
  const fill = $("xp-bar-fill");
  const total = $("xp-total");
  const need = $("xp-need");
  const count = $("xp-count");
  const achCount = $("achievement-count");

  if (left) left.textContent = info.current;
  if (right) right.textContent = info.next;
  if (fill) fill.style.width = `${progressPercent(xp)}%`;
  if (total) total.textContent = String(xp);
  if (count) count.textContent = String(xp);
  if (achCount) achCount.textContent = String((state.profile?.achievements || []).length);
  if (need) need.textContent = xp >= 20 ? "Max rank reached" : `${info.end - xp} XP to next rank`;
}

function renderAchievements(state) {
  const list = $("achievements-list");
  if (!list) return;

  const unlocked = new Set(state.profile?.achievements || []);
  const achievements = [
    { id: "achievement_collector", name: "Achievement Collector", description: "Unlock 10 achievements.", secret: false },
    { id: "all_planets", name: "Astronaut", description: "Visit all celestial bodies of the Panategwa system.", secret: false },
    { id: "big_reader", name: "Need some glasses?", description: "Set text size to Large.", secret: true },
    { id: "dark_mode", name: "Dark Night", description: "Use Dark Mode.", secret: false },
    { id: "first_login", name: "First Contact", description: "Log in for the first time.", secret: false },
    { id: "light_mode", name: "Sunshine", description: "Use Light Mode.", secret: false },
    { id: "morning_person", name: "Morning Person", description: "Visit between 3am and 10am.", secret: true },
    { id: "nocturnal", name: "Nocturnal", description: "Visit between 9pm and 3am.", secret: true },
    { id: "ocean_mode", name: "Wavefinder", description: "Use the Ocean theme.", secret: false },
    { id: "profile_name", name: "True Name", description: "Set your username.", secret: false },
    { id: "space_mode", name: "Stargazer", description: "Use the Space theme.", secret: false },
    { id: "theme_shifter", name: "Aesthetic Control", description: "Change your theme.", secret: false },
    { id: "tiny_text", name: "Microscopic Text", description: "Set text size to Small.", secret: true },
    { id: "verified_email", name: "Verified Signal", description: "Verify your email address.", secret: false },
    { id: "veteran", name: "Veteran", description: "Reach 20 XP.", secret: false }
  ].sort((a, b) => a.name.localeCompare(b.name));

  const ordered = [
    ...achievements.filter(a => unlocked.has(a.id)).sort((a, b) => a.name.localeCompare(b.name)),
    ...achievements.filter(a => !unlocked.has(a.id)).sort((a, b) => a.name.localeCompare(b.name))
  ];

  list.innerHTML = ordered.map(a => {
    const isUnlocked = unlocked.has(a.id);
    return `
      <div class="achievement-card ${isUnlocked ? "unlocked" : "locked"}" id="achievement-card-${escapeHtml(a.id)}" data-achievement-id="${escapeHtml(a.id)}">
        <div class="achievement-icon">${isUnlocked ? "🏆" : "🔒"}</div>
        <div>
          <div class="achievement-name">${escapeHtml(a.secret && !isUnlocked ? "Secret" : a.name)}</div>
          <div class="achievement-desc">${escapeHtml(a.secret && !isUnlocked ? "Hidden achievement" : a.description)}</div>
        </div>
      </div>
    `;
  }).join("");
}

function renderFriends(state) {
  const status = $("friends-status");
  const friendsList = $("friends-list");
  const requestsList = $("requests-list");
  const settingsList = $("friends-settings-list");
  const profileView = $("friend-profile-view");
  const searchInput = $("friend-search-input");

  const q = String(searchInput?.value || "").trim().toLowerCase();
  const friends = (state.friends || [])
    .map(uid => state.friendProfiles?.[uid] || { uid, username: uid, avatarEmoji: "👤" })
    .filter(f => !q || String(f.username || "").toLowerCase().includes(q) || String(f.uid || "").toLowerCase().includes(q));

  if (status) {
    status.textContent = `Friends: ${(state.friends || []).length} • Requests: ${(state.incomingRequests || []).length} • Unread: ${getUnreadIncomingCount()}`;
  }

  const searchResults = $("friend-search-results");
  if (searchResults) {
    searchResults.innerHTML = friends.length
      ? friends.map(friend => `
        <div class="social-item">
          <div class="social-icon">${escapeHtml(friend.avatarEmoji || "👤")}</div>
          <div class="social-main">
            <div class="social-title">${escapeHtml(friend.username || "Player")}</div>
            <div class="social-sub">${escapeHtml(friend.uid)}</div>
          </div>
          <div class="social-actions">
            <button data-action="friend-search-message" data-uid="${escapeHtml(friend.uid)}" type="button">Message</button>
            <button data-action="friend-search-copy" data-uid="${escapeHtml(friend.uid)}" type="button">Copy ID</button>
          </div>
        </div>
      `).join("")
      : `<div class="empty-state">No matching friends.</div>`;
  }

  if (friendsList) {
    friendsList.innerHTML = friends.length
      ? friends.map(friend => `
        <div class="social-item">
          <div class="social-icon">${escapeHtml(friend.avatarEmoji || "👤")}</div>
          <div class="social-main">
            <div class="social-title">${escapeHtml(friend.username || "Player")}</div>
            <div class="social-sub">${escapeHtml(friend.uid)}</div>
          </div>
          <div class="social-actions">
            <button data-action="friend-view" data-uid="${escapeHtml(friend.uid)}" type="button">View profile</button>
            <button data-action="friend-message" data-uid="${escapeHtml(friend.uid)}" type="button">Message</button>
            <button data-action="friend-copy" data-uid="${escapeHtml(friend.uid)}" type="button">Copy ID</button>
            <button data-action="friend-remove" data-uid="${escapeHtml(friend.uid)}" type="button">Remove</button>
            <button data-action="friend-block" data-uid="${escapeHtml(friend.uid)}" type="button">Block</button>
          </div>
        </div>
      `).join("")
      : `<div class="empty-state">No friends yet.</div>`;
  }

  if (requestsList) {
    const incoming = state.incomingRequests || [];
    const outgoing = state.outgoingRequests || [];
    requestsList.innerHTML = `
      <div class="subsection-head"><h3>Incoming</h3></div>
      ${
        incoming.length
          ? incoming.map(req => `
            <div class="social-item">
              <div class="social-icon">📨</div>
              <div class="social-main">
                <div class="social-title">${escapeHtml(req.fromName || req.fromUid)}</div>
                <div class="social-sub">${escapeHtml(req.note || "Friend request")}</div>
              </div>
              <div class="social-actions">
                <button data-action="request-accept" data-id="${escapeHtml(req.id)}" type="button">Accept</button>
                <button data-action="request-decline" data-id="${escapeHtml(req.id)}" type="button">Decline</button>
                <button data-action="request-block" data-id="${escapeHtml(req.id)}" type="button">Block</button>
                <button data-action="request-view-messages" data-uid="${escapeHtml(req.fromUid)}" type="button">Show in Messages</button>
              </div>
            </div>
          `).join("")
          : `<div class="empty-state">No incoming requests.</div>`
      }

      <div class="subsection-head" style="margin-top:16px;"><h3>Outgoing</h3></div>
      ${
        outgoing.length
          ? outgoing.map(req => `
            <div class="social-item">
              <div class="social-icon">📤</div>
              <div class="social-main">
                <div class="social-title">${escapeHtml(req.toName || req.toUid)}</div>
                <div class="social-sub">${escapeHtml(req.status || "pending")}</div>
              </div>
            </div>
          `).join("")
          : `<div class="empty-state">No outgoing requests.</div>`
      }
    `;
  }

  if (settingsList) {
    const s = state.settings || {};
    settingsList.innerHTML = `
      <div class="settings-grid">
        <div class="setting-card">
          <div class="setting-title">Friend requests</div>
          <div class="setting-desc">${s.requestsEnabled ? "On" : "Off"}</div>
          <div class="button-row"><button data-action="requests-toggle" data-enabled="${(!s.requestsEnabled).toString()}" type="button">${s.requestsEnabled ? "Turn off" : "Turn on"}</button></div>
        </div>
        <div class="setting-card">
          <div class="setting-title">Direct messages</div>
          <div class="setting-desc">${s.chatEnabled ? "On" : "Off"}</div>
          <div class="button-row"><button data-action="chat-toggle" data-enabled="${(!s.chatEnabled).toString()}" type="button">${s.chatEnabled ? "Turn off" : "Turn on"}</button></div>
        </div>
        <div class="setting-card">
          <div class="setting-title">Group chats</div>
          <div class="setting-desc">${s.groupChatsEnabled ? "On" : "Off"}</div>
          <div class="button-row"><button data-action="group-toggle" data-enabled="${(!s.groupChatsEnabled).toString()}" type="button">${s.groupChatsEnabled ? "Turn off" : "Turn on"}</button></div>
        </div>
        <div class="setting-card">
          <div class="setting-title">Show non-friend group messages</div>
          <div class="setting-desc">${s.showNonFriendGroupMessages ? "On" : "Off"}</div>
          <div class="button-row"><button data-action="group-nonfriend-toggle" data-enabled="${(!s.showNonFriendGroupMessages).toString()}" type="button">${s.showNonFriendGroupMessages ? "Hide" : "Show"}</button></div>
        </div>
        <div class="setting-card">
          <div class="setting-title">Profile privacy</div>
          <div class="setting-desc">${s.profileHidden ? "Private" : "Public"}</div>
          <div class="button-row"><button data-action="privacy-toggle" data-enabled="${(!s.profileHidden).toString()}" type="button">${s.profileHidden ? "Make public" : "Make private"}</button></div>
        </div>
        <div class="setting-card">
          <div class="setting-title">Whole social system</div>
          <div class="setting-desc">Turn everything on or off at once.</div>
          <div class="button-row">
            <button data-action="social-enable-restore" type="button">Enable & restore</button>
            <button data-action="social-enable-fresh" type="button">Enable fresh</button>
            <button data-action="social-disable-keep" type="button">Disable & keep backup</button>
            <button data-action="social-disable-clear" type="button">Disable & clear</button>
          </div>
        </div>
      </div>
    `;
  }

  if (profileView) {
    const profile = state.selectedProfile || state.profile || {};
    profileView.innerHTML = `
      <div class="profile-card">
        <div class="profile-card-top">
          <div>
            <div class="profile-name">${escapeHtml(profile.avatarEmoji || "👤")} ${escapeHtml(profile.username || "Player")}</div>
            <div class="profile-id">ID: ${escapeHtml(profile.uid || "")}</div>
          </div>
          <div class="profile-badge">${profile.uid === state.user?.uid ? "You" : (profile.socialSettings?.profileHidden ? "Private" : "Public")}</div>
        </div>

        <div class="profile-meta">
          <div><span>XP</span><strong>${profile.xp || 0}</strong></div>
          <div><span>Friends</span><strong>${(profile.friends || []).length}</strong></div>
          <div><span>Verified</span><strong>${profile.verified ? "Yes" : "No"}</strong></div>
        </div>
      </div>
    `;
  }
}

function bind() {
  $("tab-info")?.addEventListener("click", () => showSection("info"));
  $("tab-profile")?.addEventListener("click", () => showSection("profile"));
  $("tab-progress")?.addEventListener("click", () => showSection("progress"));
  $("tab-friends")?.addEventListener("click", () => showSection("friends"));
  $("tab-messages")?.addEventListener("click", () => showSection("messages"));

  document.querySelectorAll("[data-friends-subtab]").forEach(btn => {
    btn.addEventListener("click", () => showFriendsSubsection(btn.dataset.friendsSubtab));
  });

  $("login-btn")?.addEventListener("click", async () => {
    try {
      setStatus("Logging in...", "info");
      await login($("login-email")?.value || "", $("login-password")?.value || "");
      setStatus("Logged in.", "success");
    } catch (error) {
      console.error(error);
      setStatus(error?.message || "Login failed.", "error");
      alert(error?.message || "Login failed.");
    }
  });

  $("google-btn")?.addEventListener("click", async () => {
    try {
      setStatus("Signing in with Google...", "info");
      await loginWithGoogle();
      setStatus("Logged in.", "success");
    } catch (error) {
      console.error(error);
      setStatus(error?.message || "Google login failed.", "error");
      alert(error?.message || "Google login failed.");
    }
  });

  $("signup-btn")?.addEventListener("click", async () => {
    try {
      setStatus("Creating account...", "info");
      await createAccount(
        $("signup-email")?.value || "",
        $("signup-password")?.value || "",
        $("signup-username")?.value || ""
      );
      setStatus("Account created. Check your email for verification.", "success");
      alert("Account created. Check your email for verification.");
    } catch (error) {
      console.error(error);
      setStatus(error?.message || "Sign up failed.", "error");
      alert(error?.message || "Sign up failed.");
    }
  });

  $("save-username-btn")?.addEventListener("click", async () => {
    try {
      const nextName = $("profile-username")?.value || "";
      await saveUsername(nextName);
      profileUsernameDirty = false;
      syncUsernameInput(true);
      setStatus("Name saved.", "success");
      alert("Name saved.");
    } catch (error) {
      console.error(error);
      setStatus(error?.message || "Could not save name.", "error");
      alert(error?.message || "Could not save name.");
    }
  });

  $("save-avatar-btn")?.addEventListener("click", async () => {
    try {
      const emoji = $("profile-emoji")?.value || "👤";
      await saveProfileEmoji(emoji);
      const user = currentState?.user || null;
      const profile = currentState?.profile || {};
      profile.avatarEmoji = emoji;
      updateSidebarAvatar(user, profile);
      setStatus("Profile picture saved.", "success");
      alert("Profile picture saved.");
    } catch (error) {
      console.error(error);
      setStatus(error?.message || "Could not save profile picture.", "error");
      alert(error?.message || "Could not save profile picture.");
    }
  });

  $("reset-password-btn")?.addEventListener("click", async () => {
    try {
      setStatus("Sending reset email...", "info");
      await requestPasswordReset($("login-email")?.value || $("signup-email")?.value || "");
      setStatus("Password reset email sent.", "success");
      alert("Password reset email sent.");
    } catch (error) {
      console.error(error);
      setStatus(error?.message || "Could not send reset email.", "error");
      alert(error?.message || "Could not send reset email.");
    }
  });

  $("resend-verification-btn")?.addEventListener("click", async () => {
    try {
      const sent = await resendVerificationEmail();
      if (sent === false) {
        setStatus("Your email is already verified.", "info");
        alert("Your email is already verified.");
        return;
      }
      setStatus("Verification email sent.", "success");
      alert("Verification email sent.");
    } catch (error) {
      console.error(error);
      setStatus(error?.message || "Could not resend verification email.", "error");
      alert(error?.message || "Could not resend verification email.");
    }
  });

  $("logout-btn")?.addEventListener("click", async () => {
    try {
      await logout();
      setStatus("Logged out.", "info");
    } catch (error) {
      console.error(error);
      setStatus(error?.message || "Logout failed.", "error");
      alert(error?.message || "Logout failed.");
    }
  });

  $("delete-account-btn")?.addEventListener("click", async () => {
    const password = $("delete-password")?.value || "";
    if (!confirm("Delete your account permanently?")) return;

    try {
      setStatus("Deleting account...", "info");
      await deleteAccount(password);
      setStatus("Account deleted.", "success");
      alert("Account deleted.");
      window.location.reload();
    } catch (error) {
      console.error(error);
      setStatus(error?.message || "Delete failed.", "error");
      alert(error?.message || "Delete failed.");
    }
  });

  $("friend-request-send-btn")?.addEventListener("click", async () => {
    try {
      await sendFriendRequestById($("friend-id-input")?.value || "", $("friend-note-input")?.value || "");
      alert("Friend request sent.");
    } catch (error) {
      alert(error?.message || "Could not send request.");
    }
  });

  $("block-user-btn")?.addEventListener("click", async () => {
    try {
      await blockUser($("friend-id-input")?.value || "");
      alert("User blocked.");
    } catch (error) {
      alert(error?.message || "Could not block user.");
    }
  });

  document.body.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const uid = btn.dataset.uid;
    const id = btn.dataset.id;

    try {
      if (action === "friend-view") {
        await viewProfileById(uid);
        showFriendsSubsection("profile");
      }
      if (action === "friend-message" || action === "friend-search-message") {
        window.openAccountArea("messages", "direct", uid);
      }
      if (action === "friend-copy" || action === "friend-search-copy" || action === "profile-copy") {
        await navigator.clipboard.writeText(uid || "");
        btn.textContent = "Copied";
        setTimeout(() => { if (btn.isConnected) btn.textContent = "Copy ID"; }, 900);
      }
      if (action === "friend-remove") await removeFriend(uid);
      if (action === "friend-block") await blockUser(uid);

      if (action === "request-accept") await respondToFriendRequest(id, "accept");
      if (action === "request-decline") await respondToFriendRequest(id, "decline");
      if (action === "request-block") await respondToFriendRequest(id, "block");
      if (action === "request-view-messages") window.openAccountArea("messages", "direct", uid);
      if (action === "request-ignore") return;

      if (action === "requests-toggle") await toggleRequestsEnabled(btn.dataset.enabled === "true");
      if (action === "chat-toggle") await toggleChatEnabled(btn.dataset.enabled === "true");
      if (action === "group-toggle") await toggleGroupChatsEnabled(btn.dataset.enabled === "true");
      if (action === "group-nonfriend-toggle") await toggleShowNonFriendGroupMessages(btn.dataset.enabled === "true");
      if (action === "privacy-toggle") await toggleProfileHidden(btn.dataset.enabled === "true");
      if (action === "social-disable-keep") await disableSocialSystem("keep");
      if (action === "social-disable-clear") await disableSocialSystem("clear");
      if (action === "social-enable-restore") await enableSocialSystem("restore");
      if (action === "social-enable-fresh") await enableSocialSystem("fresh");
    } catch (error) {
      alert(error?.message || "Action failed.");
    }
  });
}

function render(state) {
  currentState = state;
  renderAuth(state);
  renderProgress(state);
  renderAchievements(state);
  renderFriends(state);
}

function start() {
  bind();
  showSection("info");
  showFriendsSubsection("friends");
  setStatus("Checking account...", "info");

  setTimeout(() => {
    const status = $("auth-status");
    if (status && String(status.textContent || "").includes("Checking account")) {
      setStatus("Not logged in.", "info");
    }
  }, 5000);

  subscribeSocial((state) => {
    render(state);
    if (!state.user) {
      setStatus("Not logged in.", "info");
      return;
    }
    setStatus(state.user.emailVerified ? "Logged in and verified." : "Logged in.", "success");
    if (typeof window.PanategwaMessagesRender === "function") window.PanategwaMessagesRender();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}