import {
  login,
  loginWithGoogle,
  createAccount,
  logout,
  saveUsername,
  resendVerificationEmail,
  requestPasswordReset,
  deleteAccount
} from "./auth.js";

import {
  subscribeSocial,
  sendFriendRequestById,
  respondToFriendRequest,
  sendChatMessage,
  removeFriend,
  blockUser,
  toggleRequestsEnabled,
  toggleChatEnabled,
  toggleProfileHidden,
  disableSocialSystem,
  enableSocialSystem,
  markMessageRead,
  markAllMessagesRead,
  markAllMessagesUnread,
  undoLastAction,
  redoLastAction,
  viewProfileById,
  setSelectedConversation
} from "./social.js";

const $ = (id) => document.getElementById(id);

let currentState = null;
let currentMessageFilter = "all";
let profileUsernameDirty = false;
let profileUsernameLastRendered = "";

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

function formatDate(value) {
  if (!value) return "—";
  if (typeof value === "number") return new Date(value).toLocaleString();
  if (typeof value?.toDate === "function") return value.toDate().toLocaleString();
  if (value instanceof Date) return value.toLocaleString();
  return "—";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showSection(sectionName) {
  document.querySelectorAll(".account-section").forEach(section => {
    section.classList.toggle("active", section.dataset.section === sectionName);
  });

  document.querySelectorAll(".tab-button").forEach(button => {
    button.classList.toggle("active", button.dataset.target === sectionName);
  });
}

function showFriendsSubsection(name) {
  document.querySelectorAll("[data-friends-subpanel]").forEach(panel => {
    panel.classList.toggle("active", panel.dataset.friendsSubpanel === name);
  });

  document.querySelectorAll("[data-friends-subtab]").forEach(button => {
    button.classList.toggle("active", button.dataset.friendsSubtab === name);
  });
}

function getProfileUsername() {
  const user = currentState?.user || null;
  const profile = currentState?.profile || null;
  return profile?.username || user?.displayName || "Player";
}

function syncUsernameInput(force = false) {
  const input = $("profile-username");
  if (!input) return;

  const currentName = getProfileUsername();

  if (force || (!profileUsernameDirty && document.activeElement !== input)) {
    input.value = currentName;
    profileUsernameLastRendered = currentName;
    profileUsernameDirty = false;
  }
}

window.openAccountArea = function openAccountArea(section = "friends", sub = "friends", targetUid = null) {
  showSection(section);

  if (section === "friends") {
    showFriendsSubsection(sub || "friends");

    if (targetUid && sub === "profile") {
      viewProfileById(targetUid);
    }

    if (targetUid && sub === "messages") {
      const input = $("message-to-id");
      if (input) input.value = targetUid;
    }
  }

  if (section === "messages") {
    setSelectedConversation(targetUid || null);
    const input = $("message-to-id");
    if (input && targetUid) input.value = targetUid;
  }
};

function filteredMessages(state) {
  let messages = [...(state?.messages || [])];

  if (currentMessageFilter !== "all") {
    messages = messages.filter(m => m.kind === currentMessageFilter);
  }

  return messages;
}

function renderUser(state) {
  const info = $("user-info");
  const authCard = $("auth-card");
  const accountCard = $("account-card");
  const logoutBtn = $("logout-btn");
  const deleteBtn = $("delete-account-btn");
  const saveBtn = $("save-username-btn");
  const resendBtn = $("resend-verification-btn");

  const user = state?.user || null;
  const profile = state?.profile || null;

  if (!info) return;

  if (!user) {
    if (authCard) authCard.style.display = "block";
    if (accountCard) accountCard.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "none";
    if (deleteBtn) deleteBtn.style.display = "none";
    if (saveBtn) saveBtn.style.display = "none";
    if (resendBtn) resendBtn.style.display = "none";

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

    const input = $("profile-username");
    if (input) {
      input.value = "";
      profileUsernameDirty = false;
      profileUsernameLastRendered = "";
    }
    return;
  }

  if (authCard) authCard.style.display = "none";
  if (accountCard) accountCard.style.display = "block";
  if (logoutBtn) logoutBtn.style.display = "inline-block";
  if (deleteBtn) deleteBtn.style.display = "inline-block";
  if (saveBtn) saveBtn.style.display = "inline-block";
  if (resendBtn) resendBtn.style.display = "inline-block";

  const username = profile?.username || user.displayName || "Player";
  const email = user.email || profile?.email || "—";
  const verified = user.emailVerified ? "Yes" : "No";
  const xp = typeof profile?.xp === "number" ? profile.xp : 0;
  const rank = getRank(xp);

  info.innerHTML = `
    <div class="account-header">
      ${
        user.photoURL
          ? `<img src="${escapeHtml(user.photoURL)}" alt="Avatar" class="account-avatar">`
          : `<div class="account-avatar-placeholder">👤</div>`
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
      <div class="info-row"><span>XP</span><strong>${xp}</strong></div>
      <div class="info-row"><span>Rank</span><strong>${rank}</strong></div>
      <div class="info-row"><span>Account ID</span><strong>${escapeHtml(user.uid)}</strong></div>
      <div class="info-row"><span>Created</span><strong>${escapeHtml(formatDate(profile?.createdAt))}</strong></div>
      <div class="info-row"><span>Last login</span><strong>${escapeHtml(formatDate(profile?.lastLoginAt))}</strong></div>
    </div>
  `;

  syncUsernameInput(false);
}

function renderFriendsSection(state) {
  const friendsStatus = $("friends-status");
  const friendList = $("friends-list");
  const requestList = $("requests-list");
  const settingsList = $("friends-settings-list");
  const profileView = $("friend-profile-view");

  if (friendsStatus) {
    friendsStatus.textContent = `Friends: ${(state?.friends || []).length} • Requests: ${(state?.incomingRequests || []).length} • Unread messages: ${state?.unreadCount || 0}`;
  }

  if (friendList) {
    const friends = state?.friends || [];
    friendList.innerHTML = friends.length
      ? friends.map(uid => {
          const friend = state.friendProfiles?.[uid];
          const name = friend?.username || uid;

          return `
            <div class="social-item">
              <div class="social-icon">👥</div>
              <div class="social-main">
                <div class="social-title">${escapeHtml(name)}</div>
                <div class="social-sub">${escapeHtml(uid)}</div>
              </div>
              <div class="social-actions">
                <button data-action="friend-view" data-uid="${escapeHtml(uid)}">View profile</button>
                <button data-action="friend-message" data-uid="${escapeHtml(uid)}">Message</button>
                <button data-action="friend-remove" data-uid="${escapeHtml(uid)}">Remove</button>
                <button data-action="friend-block" data-uid="${escapeHtml(uid)}">Block</button>
              </div>
            </div>
          `;
        }).join("")
      : `<div class="empty-state">No friends yet.</div>`;
  }

  if (requestList) {
    const incoming = state?.incomingRequests || [];
    const outgoing = state?.outgoingRequests || [];

    requestList.innerHTML = `
      <div class="subsection-head">
        <h3>Incoming</h3>
      </div>
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
                <button data-action="request-accept" data-id="${escapeHtml(req.id)}">Accept</button>
                <button data-action="request-decline" data-id="${escapeHtml(req.id)}">Decline</button>
                <button data-action="request-block" data-id="${escapeHtml(req.id)}">Block</button>
                <button data-action="request-ignore" data-id="${escapeHtml(req.id)}">Ignore</button>
                <button data-action="request-view-messages" data-uid="${escapeHtml(req.fromUid)}">View in messages</button>
              </div>
            </div>
          `).join("")
          : `<div class="empty-state">No incoming requests.</div>`
      }

      <div class="subsection-head" style="margin-top:16px;">
        <h3>Outgoing</h3>
      </div>
      ${
        outgoing.length
          ? outgoing.map(req => `
            <div class="social-item">
              <div class="social-icon">📤</div>
              <div class="social-main">
                <div class="social-title">${escapeHtml(req.toName || req.toUid)}</div>
                <div class="social-sub">${escapeHtml(req.status || "pending")}</div>
              </div>
              <div class="social-actions">
                <button data-action="request-view-messages" data-uid="${escapeHtml(req.toUid)}">View in messages</button>
              </div>
            </div>
          `).join("")
          : `<div class="empty-state">No outgoing requests.</div>`
      }
    `;
  }

  if (settingsList) {
    const s = state?.settings || {};
    settingsList.innerHTML = `
      <div class="settings-grid">
        <div class="setting-card">
          <div class="setting-top">
            <div>
              <div class="setting-title">Friend system</div>
              <div class="setting-desc">Turn the whole social system on or off.</div>
            </div>
          </div>
          <div class="button-row">
            <button data-action="social-enable-restore">Enable & restore</button>
            <button data-action="social-enable-fresh">Enable fresh</button>
            <button data-action="social-disable-keep">Disable & keep backup</button>
            <button data-action="social-disable-clear">Disable & clear</button>
          </div>
        </div>

        <div class="setting-card">
          <div class="setting-title">Requests</div>
          <div class="setting-desc">${s.requestsEnabled ? "On" : "Off"}</div>
          <div class="button-row">
            <button data-action="requests-toggle" data-enabled="${(!s.requestsEnabled).toString()}">${s.requestsEnabled ? "Turn requests off" : "Turn requests on"}</button>
          </div>
        </div>

        <div class="setting-card">
          <div class="setting-title">Chatting</div>
          <div class="setting-desc">${s.chatEnabled ? "On" : "Off"}</div>
          <div class="button-row">
            <button data-action="chat-toggle" data-enabled="${(!s.chatEnabled).toString()}">${s.chatEnabled ? "Turn chat off" : "Turn chat on"}</button>
          </div>
        </div>

        <div class="setting-card">
          <div class="setting-title">Profile privacy</div>
          <div class="setting-desc">${s.profileHidden ? "Others only see your name and ID." : "People can see your full public profile."}</div>
          <div class="button-row">
            <button data-action="privacy-toggle" data-enabled="${(!s.profileHidden).toString()}">${s.profileHidden ? "Show full profile" : "Hide profile details"}</button>
          </div>
        </div>
      </div>
    `;
  }

  if (profileView) {
    const profile = state?.selectedProfile || state?.profile;
    if (!profile) {
      profileView.innerHTML = `<div class="empty-state">No profile selected.</div>`;
    } else {
      const visibleFull = profile.uid === state?.user?.uid || !profile.socialSettings?.profileHidden;

      profileView.innerHTML = `
        <div class="profile-card">
          <div class="profile-card-top">
            <div>
              <div class="profile-name">${escapeHtml(profile.username || "Player")}</div>
              <div class="profile-id">ID: ${escapeHtml(profile.uid)}</div>
            </div>
            <div class="profile-badge">${visibleFull ? "Public" : "Private"}</div>
          </div>

          <div class="profile-meta">
            ${visibleFull ? `<div><span>XP</span><strong>${profile.xp || 0}</strong></div>` : ""}
            ${visibleFull ? `<div><span>Friends</span><strong>${(profile.friends || []).length}</strong></div>` : ""}
            ${visibleFull ? `<div><span>Verified</span><strong>${profile.verified ? "Yes" : "No"}</strong></div>` : ""}
          </div>

          <div class="button-row">
            <button data-action="profile-self">View my profile</button>
            <button data-action="profile-open-message" data-uid="${escapeHtml(profile.uid)}">Message</button>
          </div>
        </div>
      `;
    }
  }
}

function renderMessagesSection(state) {
  const summary = $("messages-summary");
  const list = $("messages-list");
  const filter = $("message-filter-select");
  const conversation = $("message-to-id");

  if (filter && filter.value !== currentMessageFilter) {
    filter.value = currentMessageFilter;
  }

  if (conversation && state?.selectedConversationId && conversation.value !== state.selectedConversationId) {
    conversation.value = state.selectedConversationId;
  }

  if (summary) {
    summary.textContent = `Unread messages: ${state?.unreadCount || 0}`;
  }

  if (!list) return;

  const messages = filteredMessages(state);

  list.innerHTML = messages.length
    ? messages.map(msg => {
        const unread = msg.toUid === state?.user?.uid && !(msg.readBy || []).includes(state?.user?.uid);
        const label = msg.kind === "chat"
          ? `Chat • ${msg.fromName || msg.fromUid}`
          : msg.kind === "friend-request"
            ? `Request • ${msg.fromName || msg.fromUid}`
            : msg.title || "Message";

        return `
          <div class="social-message ${unread ? "unread" : "read"}">
            <div class="social-icon">${unread ? "✉️" : "📭"}</div>
            <div class="social-main">
              <div class="social-title">${escapeHtml(label)}</div>
              <div class="social-sub">${escapeHtml(msg.body || "")}</div>
            </div>
            <div class="social-actions">
              <button data-action="message-open" data-id="${escapeHtml(msg.id)}" data-section="${escapeHtml(msg.targetSection || "messages")}" data-sub="${escapeHtml(msg.targetSubSection || "messages")}" data-uid="${escapeHtml(msg.conversationUid || msg.fromUid || "")}">Open</button>
              <button data-action="message-view-inbox" data-uid="${escapeHtml(msg.conversationUid || msg.fromUid || "")}">View in messages</button>
              <button data-action="message-read-toggle" data-id="${escapeHtml(msg.id)}" data-read="${unread ? "true" : "false"}">${unread ? "Read" : "Unread"}</button>
            </div>
          </div>
        `;
      }).join("")
    : `<div class="empty-state">No messages yet.</div>`;
}

function bindTabs() {
  $("tab-info")?.addEventListener("click", () => showSection("info"));
  $("tab-progress")?.addEventListener("click", () => showSection("progress"));
  $("tab-friends")?.addEventListener("click", () => showSection("friends"));
  $("tab-messages")?.addEventListener("click", () => showSection("messages"));

  document.querySelectorAll("[data-friends-subtab]").forEach(btn => {
    btn.addEventListener("click", () => showFriendsSubsection(btn.dataset.friendsSubtab));
  });

  $("login-tab-btn")?.addEventListener("click", () => {
    $("login-panel").style.display = "block";
    $("signup-panel").style.display = "none";
    $("login-tab-btn").classList.add("active");
    $("signup-tab-btn").classList.remove("active");
  });

  $("signup-tab-btn")?.addEventListener("click", () => {
    $("login-panel").style.display = "none";
    $("signup-panel").style.display = "block";
    $("signup-tab-btn").classList.add("active");
    $("login-tab-btn").classList.remove("active");
  });

  $("message-filter-select")?.addEventListener("change", (e) => {
    currentMessageFilter = e.target.value || "all";
    renderMessagesSection(currentState);
  });

  const usernameInput = $("profile-username");
  if (usernameInput) {
    usernameInput.addEventListener("input", () => {
      profileUsernameDirty = true;
    });

    usernameInput.addEventListener("focus", () => {
      profileUsernameDirty = true;
    });

    usernameInput.addEventListener("blur", () => {
      if (usernameInput.value.trim() === profileUsernameLastRendered.trim()) {
        profileUsernameDirty = false;
      }
    });
  }
}

function bindButtons() {
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
      setStatus("Saving name...", "info");
      const nextName = $("profile-username")?.value || "";
      await saveUsername(nextName);
      profileUsernameDirty = false;
      profileUsernameLastRendered = nextName;
      syncUsernameInput(true);
      setStatus("Name saved.", "success");
      alert("Name saved.");
    } catch (error) {
      console.error(error);
      setStatus(error?.message || "Could not save name.", "error");
      alert(error?.message || "Could not save name.");
    }
  });

  $("reset-password-btn")?.addEventListener("click", async () => {
    try {
      setStatus("Sending reset email...", "info");
      await requestPasswordReset(
        $("login-email")?.value || $("signup-email")?.value || ""
      );
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
      await sendFriendRequestById(
        $("friend-id-input")?.value || "",
        $("friend-note-input")?.value || ""
      );
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

  $("send-message-btn")?.addEventListener("click", async () => {
    try {
      const toId = $("message-to-id")?.value || "";
      const text = $("message-text")?.value || "";
      await sendChatMessage(toId, text);
      $("message-text").value = "";
      alert("Message sent.");
    } catch (error) {
      alert(error?.message || "Could not send message.");
    }
  });

  $("read-all-btn")?.addEventListener("click", async () => {
    try {
      await markAllMessagesRead();
    } catch (error) {
      alert(error?.message || "Could not mark messages read.");
    }
  });

  $("unread-all-btn")?.addEventListener("click", async () => {
    try {
      await markAllMessagesUnread();
    } catch (error) {
      alert(error?.message || "Could not mark messages unread.");
    }
  });

  $("undo-btn")?.addEventListener("click", async () => {
    try {
      await undoLastAction();
    } catch (error) {
      alert(error?.message || "Undo failed.");
    }
  });

  $("redo-btn")?.addEventListener("click", async () => {
    try {
      await redoLastAction();
    } catch (error) {
      alert(error?.message || "Redo failed.");
    }
  });
}

function bindDelegatedClicks() {
  $("friends-list")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const uid = btn.dataset.uid;

    try {
      if (action === "friend-view") {
        await viewProfileById(uid);
        showFriendsSubsection("profile");
      }

      if (action === "friend-message") {
        const input = $("message-to-id");
        if (input) input.value = uid;
        setSelectedConversation(uid);
        showSection("messages");
      }

      if (action === "friend-remove") {
        await removeFriend(uid);
      }

      if (action === "friend-block") {
        await blockUser(uid);
      }
    } catch (err) {
      alert(err.message || "Action failed.");
    }
  });

  $("requests-list")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    const uid = btn.dataset.uid;

    try {
      if (action === "request-accept") await respondToFriendRequest(id, "accept");
      if (action === "request-decline") await respondToFriendRequest(id, "decline");
      if (action === "request-block") await respondToFriendRequest(id, "block");
      if (action === "request-ignore") return;

      if (action === "request-view-messages") {
        const input = $("message-to-id");
        if (input) input.value = uid;
        setSelectedConversation(uid);
        showSection("messages");
      }
    } catch (err) {
      alert(err.message || "Action failed.");
    }
  });

  $("messages-list")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    const section = btn.dataset.section || "messages";
    const sub = btn.dataset.sub || "messages";
    const uid = btn.dataset.uid || null;
    const read = btn.dataset.read === "true";

    try {
      if (action === "message-open") {
        window.openAccountArea(section, sub, uid);
      }

      if (action === "message-view-inbox") {
        window.openAccountArea("messages", "messages", uid);
      }

      if (action === "message-read-toggle") {
        await markMessageRead(id, read);
      }
    } catch (error) {
      alert(error?.message || "Action failed.");
    }
  });

  $("friends-settings-list")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const enabled = btn.dataset.enabled === "true";

    try {
      if (action === "requests-toggle") await toggleRequestsEnabled(enabled);
      if (action === "chat-toggle") await toggleChatEnabled(enabled);
      if (action === "privacy-toggle") await toggleProfileHidden(enabled);
      if (action === "social-disable-keep") await disableSocialSystem("keep");
      if (action === "social-disable-clear") await disableSocialSystem("clear");
      if (action === "social-enable-restore") await enableSocialSystem("restore");
      if (action === "social-enable-fresh") await enableSocialSystem("fresh");
      if (action === "profile-self") {
        await viewProfileById(currentState?.user?.uid);
      }
      if (action === "profile-open-message") {
        const input = $("message-to-id");
        if (input) input.value = btn.dataset.uid;
        setSelectedConversation(btn.dataset.uid || null);
        showSection("messages");
      }
    } catch (error) {
      alert(error?.message || "Action failed.");
    }
  });
}

function renderSocial(state) {
  currentState = state;
  renderUser(state);
  renderFriendsSection(state);
  renderMessagesSection(state);
}

document.addEventListener("DOMContentLoaded", () => {
  bindTabs();
  bindButtons();
  bindDelegatedClicks();

  showSection("info");
  showFriendsSubsection("friends");
  setStatus("Checking account...", "info");

  const usernameInput = $("profile-username");
  if (usernameInput) {
    usernameInput.addEventListener("input", () => {
      profileUsernameDirty = true;
    });
  }

  setTimeout(() => {
    const status = $("auth-status");
    if (status && String(status.textContent || "").includes("Checking account")) {
      setStatus("Not logged in.", "info");
    }
  }, 5000);

  subscribeSocial((state) => {
    renderSocial(state);
    if (!state.user) {
      setStatus("Not logged in.", "info");
      return;
    }
    setStatus(state.user.emailVerified ? "Logged in and verified." : "Logged in.", "success");
  });
});