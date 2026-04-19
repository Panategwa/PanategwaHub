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
  toggleGroupChatsEnabled,
  toggleShowNonFriendGroupMessages,
  toggleProfileHidden,
  disableSocialSystem,
  enableSocialSystem,
  markMessageRead,
  markAllMessagesRead,
  markAllMessagesUnread,
  undoLastAction,
  redoLastAction,
  viewProfileById,
  setSelectedConversation,
  setSelectedGroupChatId,
  createGroupChat,
  inviteToGroupChat,
  respondToGroupInvite,
  sendGroupMessage,
  leaveGroupChat,
  getGroupChatMessages,
  socialState
} from "./social.js";

const $ = (id) => document.getElementById(id);

let currentState = null;
let currentDirectFilter = "all";
let profileUsernameDirty = false;
let profileUsernameLastRendered = "";
let currentMessagesSubtab = "direct";

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

function showMessagesSubsection(name) {
  currentMessagesSubtab = name;

  document.querySelectorAll("[data-message-subpanel]").forEach(panel => {
    panel.classList.toggle("active", panel.dataset.messageSubpanel === name);
  });

  document.querySelectorAll("[data-message-subtab]").forEach(button => {
    button.classList.toggle("active", button.dataset.messageSubtab === name);
  });

  renderMessagesSection(currentState);
}

window.openAccountArea = function openAccountArea(section = "messages", sub = "direct", targetUid = null) {
  showSection(section);

  if (section === "friends") {
    showFriendsSubsection(sub || "friends");
    if (targetUid && sub === "profile") viewProfileById(targetUid);
    if (targetUid && sub === "messages") {
      const input = $("direct-message-friend-search");
      if (input) input.value = targetUid;
    }
  }

  if (section === "messages") {
    showMessagesSubsection(sub || "direct");
    if (sub === "direct" && targetUid) {
      setSelectedConversation(targetUid);
      const input = $("direct-message-friend-search");
      if (input) input.value = targetUid;
    }
    if (sub === "groups" && targetUid) {
      setSelectedGroupChatId(targetUid);
    }
  }
};

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

function friendMatchesSearch(friend, term) {
  const q = String(term || "").trim().toLowerCase();
  if (!q) return true;
  return String(friend?.username || "").toLowerCase().includes(q) || String(friend?.uid || "").toLowerCase().includes(q);
}

function copyText(value) {
  return navigator.clipboard.writeText(String(value || ""));
}

function getCurrentXP(state) {
  return typeof state?.profile?.xp === "number" ? state.profile.xp : 0;
}

function getRankInfo(xp) {
  if (xp < 5) return { current: "Explorer", next: "Adventurer", start: 0, end: 5 };
  if (xp < 20) return { current: "Adventurer", next: "Veteran", start: 5, end: 20 };
  return { current: "Veteran", next: "Max rank", start: 20, end: 20 };
}

function progressForXp(xp) {
  const rank = getRankInfo(xp);
  if (xp >= 20) return { ...rank, pct: 100, remaining: 0 };

  const range = Math.max(rank.end - rank.start, 1);
  const inRank = Math.max(0, Math.min(xp - rank.start, range));
  const pct = Math.max(0, Math.min(100, (inRank / range) * 100));
  const remaining = Math.max(0, rank.end - xp);

  return { ...rank, pct, remaining };
}

function filteredDirectMessages(state) {
  const uid = state?.user?.uid;
  let list = [...(state?.messages || [])].filter(m => m.toUid === uid || m.fromUid === uid);

  if (currentDirectFilter === "system") {
    list = list.filter(m => m.kind === "system");
  } else if (currentDirectFilter === "friends") {
    list = list.filter(m => m.kind !== "system");
  }

  return list;
}

function renderUser(state) {
  const info = $("user-info");
  const authCard = $("auth-card");
  const accountCard = $("account-card");
  const logoutBtn = $("logout-btn");
  const deleteBtn = $("delete-account-btn");
  const saveBtn = $("save-username-btn");
  const resendBtn = $("resend-verification-btn");
  const copyBtn = $("copy-user-id-btn");

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
    if (copyBtn) copyBtn.style.display = "none";

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
  if (copyBtn) copyBtn.style.display = "inline-flex";

  const username = profile?.username || user.displayName || "Player";
  const email = user.email || profile?.email || "—";
  const verified = user.emailVerified ? "Yes" : "No";
  const xp = getCurrentXP(state);
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
      <div class="info-row">
        <span>Account ID</span>
        <strong style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span style="word-break:break-all;">${escapeHtml(user.uid)}</span>
          <button id="copy-user-id-btn" type="button">Copy</button>
        </strong>
      </div>
      <div class="info-row"><span>Created</span><strong>${escapeHtml(formatDate(profile?.createdAt))}</strong></div>
      <div class="info-row"><span>Last login</span><strong>${escapeHtml(formatDate(profile?.lastLoginAt))}</strong></div>
    </div>
  `;

  syncUsernameInput(false);

  const copyAfterRender = $("copy-user-id-btn");
  if (copyAfterRender) {
    copyAfterRender.onclick = async () => {
      try {
        await navigator.clipboard.writeText(user.uid);
        copyAfterRender.textContent = "Copied";
        setTimeout(() => {
          if (copyAfterRender.isConnected) copyAfterRender.textContent = "Copy";
        }, 1200);
      } catch {
        prompt("Copy this ID:", user.uid);
      }
    };
  }
}

function renderProgressSection(state) {
  const xp = getCurrentXP(state);
  const info = progressForXp(xp);
  const leftRank = $("xp-left-rank");
  const rightRank = $("xp-right-rank");
  const bar = $("xp-bar-fill");
  const total = $("xp-total");
  const need = $("xp-need");
  const count = $("xp-count");
  const achievementCount = $("achievement-count");

  if (leftRank) leftRank.textContent = info.current;
  if (rightRank) rightRank.textContent = info.next;
  if (bar) bar.style.width = `${info.pct}%`;
  if (total) total.textContent = String(xp);
  if (need) need.textContent = info.remaining > 0 ? `${info.remaining} XP to next rank` : "Max rank reached";
  if (count) count.textContent = String(xp);
  if (achievementCount) achievementCount.textContent = String((state?.profile?.achievements || []).length);
}

function renderAchievementsSection(state) {
  const container = $("achievements-list");
  if (!container) return;

  const achievements = Array.isArray(state?.profile?.achievements) ? state.profile.achievements : [];
  const xp = getCurrentXP(state);
  const unlocked = new Set(achievements);

  const list = [
    { id: "achievement_collector", name: "Achievement Collector", description: "Unlock 10 achievements.", secret: false },
    { id: "all_planets", name: "Astronaut", description: "Visit all celestial bodies of the Panategwa system.", secret: false },
    { id: "big_reader", name: "Need some glasses?", description: "Set text size to Large.", secret: true },
    { id: "dark_mode", name: "Dark Night", description: "Use Dark Mode.", secret: false },
    { id: "first_login", name: "First Contact", description: "Log in for the first time.", secret: false },
    { id: "light_mode", name: "Sunshine", description: "Use Light Mode.", secret: false },
    { id: "morning_person", name: "Morning Person", description: "Visit the site between 3am and 10am.", secret: true },
    { id: "nocturnal", name: "Nocturnal", description: "Visit the site between 9pm and 3am.", secret: true },
    { id: "ocean_mode", name: "Wavefinder", description: "Use the Ocean theme.", secret: false },
    { id: "profile_name", name: "True Name", description: "Set your username.", secret: false },
    { id: "space_mode", name: "Stargazer", description: "Use the Space theme.", secret: false },
    { id: "theme_shifter", name: "Aesthetic Control", description: "Change your theme.", secret: false },
    { id: "tiny_text", name: "Microscopic Text", description: "Set text size to Small.", secret: true },
    { id: "verified_email", name: "Verified Signal", description: "Verify your email address.", secret: false },
    { id: "veteran", name: "Veteran", description: "Reach 20 XP.", secret: false }
  ].sort((a, b) => a.name.localeCompare(b.name));

  const sorted = [
    ...list.filter(a => unlocked.has(a.id)).sort((a, b) => a.name.localeCompare(b.name)),
    ...list.filter(a => !unlocked.has(a.id)).sort((a, b) => a.name.localeCompare(b.name))
  ];

  container.innerHTML = sorted.map(a => {
    const isUnlocked = unlocked.has(a.id);
    const title = a.secret && !isUnlocked ? "Secret" : a.name;
    const desc = a.secret && !isUnlocked ? "Hidden achievement" : a.description;
    const icon = isUnlocked ? "🏆" : "🔒";

    return `
      <div class="achievement-card ${isUnlocked ? "unlocked" : "locked"}">
        <div class="achievement-icon">${icon}</div>
        <div>
          <div class="achievement-name">${escapeHtml(title)}</div>
          <div class="achievement-desc">${escapeHtml(desc)}</div>
        </div>
      </div>
    `;
  }).join("");
}

function renderFriendsSection(state) {
  const friendsStatus = $("friends-status");
  const friendList = $("friends-list");
  const requestList = $("requests-list");
  const settingsList = $("friends-settings-list");
  const profileView = $("friend-profile-view");
  const search = String($("friend-search-input")?.value || "").trim().toLowerCase();

  if (friendsStatus) {
    friendsStatus.textContent = `Friends: ${(state?.friends || []).length} • Requests: ${(state?.incomingRequests || []).length} • Unread messages: ${state?.unreadCount || 0}`;
  }

  const friends = (state?.friends || [])
    .map(uid => state.friendProfiles?.[uid] || { uid, username: uid })
    .filter(friend => friendMatchesSearch(friend, search));

  const searchResults = $("friend-search-results");
  if (searchResults) {
    searchResults.innerHTML = friends.length
      ? friends.map(friend => `
        <div class="social-item">
          <div class="social-icon">👤</div>
          <div class="social-main">
            <div class="social-title">${escapeHtml(friend.username || "Player")}</div>
            <div class="social-sub">${escapeHtml(friend.uid)}</div>
          </div>
          <div class="social-actions">
            <button data-action="friend-search-message" data-uid="${escapeHtml(friend.uid)}">Message</button>
            <button data-action="friend-search-copy" data-uid="${escapeHtml(friend.uid)}">Copy ID</button>
          </div>
        </div>
      `).join("")
      : `<div class="empty-state">No matching friends.</div>`;
  }

  if (friendList) {
    friendList.innerHTML = friends.length
      ? friends.map(friend => `
        <div class="social-item">
          <div class="social-icon">👥</div>
          <div class="social-main">
            <div class="social-title">${escapeHtml(friend.username || "Player")}</div>
            <div class="social-sub">${escapeHtml(friend.uid)}</div>
          </div>
          <div class="social-actions">
            <button data-action="friend-view" data-uid="${escapeHtml(friend.uid)}">View profile</button>
            <button data-action="friend-message" data-uid="${escapeHtml(friend.uid)}">Message</button>
            <button data-action="friend-copy" data-uid="${escapeHtml(friend.uid)}">Copy ID</button>
            <button data-action="friend-remove" data-uid="${escapeHtml(friend.uid)}">Remove</button>
            <button data-action="friend-block" data-uid="${escapeHtml(friend.uid)}">Block</button>
          </div>
        </div>
      `).join("")
      : `<div class="empty-state">No friends yet.</div>`;
  }

  if (requestList) {
    const incoming = state?.incomingRequests || [];
    const outgoing = state?.outgoingRequests || [];

    requestList.innerHTML = `
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
          <div class="setting-title">Friend requests</div>
          <div class="setting-desc">${s.requestsEnabled ? "On" : "Off"}</div>
          <div class="button-row">
            <button data-action="requests-toggle" data-enabled="${(!s.requestsEnabled).toString()}">${s.requestsEnabled ? "Turn off" : "Turn on"}</button>
          </div>
        </div>

        <div class="setting-card">
          <div class="setting-title">Direct messages</div>
          <div class="setting-desc">${s.chatEnabled ? "On" : "Off"}</div>
          <div class="button-row">
            <button data-action="chat-toggle" data-enabled="${(!s.chatEnabled).toString()}">${s.chatEnabled ? "Turn off" : "Turn on"}</button>
          </div>
        </div>

        <div class="setting-card">
          <div class="setting-title">Group chats</div>
          <div class="setting-desc">${s.groupChatsEnabled ? "On" : "Off"}</div>
          <div class="button-row">
            <button data-action="group-toggle" data-enabled="${(!s.groupChatsEnabled).toString()}">${s.groupChatsEnabled ? "Turn off" : "Turn on"}</button>
          </div>
        </div>

        <div class="setting-card">
          <div class="setting-title">Show non-friend group messages</div>
          <div class="setting-desc">${s.showNonFriendGroupMessages ? "On" : "Off"}</div>
          <div class="button-row">
            <button data-action="group-nonfriend-toggle" data-enabled="${(!s.showNonFriendGroupMessages).toString()}">${s.showNonFriendGroupMessages ? "Hide" : "Show"}</button>
          </div>
        </div>

        <div class="setting-card">
          <div class="setting-title">Profile privacy</div>
          <div class="setting-desc">${s.profileHidden ? "Private" : "Public"}</div>
          <div class="button-row">
            <button data-action="privacy-toggle" data-enabled="${(!s.profileHidden).toString()}">${s.profileHidden ? "Make public" : "Make private"}</button>
          </div>
        </div>

        <div class="setting-card">
          <div class="setting-title">Whole social system</div>
          <div class="setting-desc">Turn everything on or off at once.</div>
          <div class="button-row">
            <button data-action="social-enable-restore">Enable & restore</button>
            <button data-action="social-enable-fresh">Enable fresh</button>
            <button data-action="social-disable-keep">Disable & keep backup</button>
            <button data-action="social-disable-clear">Disable & clear</button>
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
            <button data-action="profile-copy" data-uid="${escapeHtml(profile.uid)}">Copy ID</button>
          </div>
        </div>
      `;
    }
  }
}

function renderDirectMessagesSection(state) {
  const list = $("direct-messages-list");
  const summary = $("messages-summary");
  const filterLabel = $("direct-filter-label");
  const search = String($("direct-message-friend-search")?.value || "").trim().toLowerCase();

  const friends = (state?.friends || [])
    .map(uid => state.friendProfiles?.[uid] || { uid, username: uid })
    .filter(friend => friendMatchesSearch(friend, search));

  const friendResults = $("direct-message-friend-results");
  if (friendResults) {
    friendResults.innerHTML = friends.length
      ? friends.map(friend => `
        <div class="social-item" style="cursor:pointer;" data-action="direct-pick-friend" data-uid="${escapeHtml(friend.uid)}">
          <div class="social-icon">💬</div>
          <div class="social-main">
            <div class="social-title">${escapeHtml(friend.username || "Player")}</div>
            <div class="social-sub">${escapeHtml(friend.uid)}</div>
          </div>
          <div class="social-actions">
            <button data-action="direct-pick-friend" data-uid="${escapeHtml(friend.uid)}">Select</button>
          </div>
        </div>
      `).join("")
      : `<div class="empty-state">No matching friends.</div>`;
  }

  if (filterLabel) {
    filterLabel.textContent = currentDirectFilter === "all"
      ? "All messages"
      : currentDirectFilter === "system"
        ? "System messages"
        : "Friend messages";
  }

  const selectedUid = state?.selectedConversationId || null;
  const selectedFriend = selectedUid ? (state.friendProfiles?.[selectedUid] || { uid: selectedUid, username: selectedUid }) : null;
  const selectedBox = $("selected-direct-friend");
  if (selectedBox) {
    selectedBox.innerHTML = selectedFriend
      ? `
        <div class="profile-card" style="margin-bottom:14px;">
          <div class="profile-card-top">
            <div>
              <div class="profile-name">${escapeHtml(selectedFriend.username || "Player")}</div>
              <div class="profile-id">${escapeHtml(selectedFriend.uid)}</div>
            </div>
            <div class="profile-badge">Selected</div>
          </div>
        </div>
      `
      : `<div class="empty-state">Pick a friend to start messaging.</div>`;
  }

  if (summary) {
    summary.textContent = `Unread messages: ${state?.unreadCount || 0}`;
  }

  if (!list) return;

  const messages = filteredDirectMessages(state);

  list.innerHTML = messages.length
    ? messages.map(msg => {
        const unread = msg.toUid === state?.user?.uid && !(msg.readBy || []).includes(state?.user?.uid);
        const label = msg.kind === "chat"
          ? `Chat • ${msg.fromName || msg.fromUid}`
          : msg.kind === "friend-request"
            ? `Request • ${msg.fromName || msg.fromUid}`
            : msg.kind === "friend-accepted"
              ? "Friend accepted"
              : msg.kind === "friend-declined"
                ? "Friend declined"
                : msg.kind === "friend-blocked"
                  ? "Blocked"
                  : msg.title || "Message";

        return `
          <div class="social-message ${unread ? "unread" : "read"}" data-message-card="1" data-kind="${escapeHtml(msg.kind || "system")}" data-uid="${escapeHtml(msg.conversationUid || msg.fromUid || "")}">
            <div class="social-icon">${unread ? "✉️" : "📭"}</div>
            <div class="social-main">
              <div class="social-title">${escapeHtml(label)}</div>
              <div class="social-sub">${escapeHtml(msg.body || "")}</div>
            </div>
            <div class="social-actions">
              <button data-action="message-open" data-id="${escapeHtml(msg.id)}" data-section="${escapeHtml(msg.targetSection || "messages")}" data-sub="${escapeHtml(msg.targetSubSection || "direct")}" data-uid="${escapeHtml(msg.conversationUid || msg.fromUid || "")}">Open</button>
              <button data-action="message-view-inbox" data-uid="${escapeHtml(msg.conversationUid || msg.fromUid || "")}">View in messages</button>
              <button data-action="message-read-toggle" data-id="${escapeHtml(msg.id)}" data-read="${unread ? "true" : "false"}">${unread ? "Read" : "Unread"}</button>
            </div>
          </div>
        `;
      }).join("")
    : `<div class="empty-state">No messages yet.</div>`;
}

function renderGroupsSection(state) {
  const chats = state?.groupChats || [];
  const selectedId = state?.selectedGroupChatId || chats[0]?.id || null;
  const selectedChat = chats.find(c => c.id === selectedId) || chats[0] || null;
  if (selectedChat && selectedId !== selectedChat.id) setSelectedGroupChatId(selectedChat.id);

  const chatList = $("group-chat-list");
  const chatView = $("group-chat-view");
  const inviteBox = $("group-invites-list");
  const groupSearch = String($("group-search-input")?.value || "").trim().toLowerCase();

  if (chatList) {
    const filtered = chats.filter(chat => {
      if (!groupSearch) return true;
      return String(chat.name || "").toLowerCase().includes(groupSearch) || String(chat.id || "").toLowerCase().includes(groupSearch);
    });

    chatList.innerHTML = filtered.length
      ? filtered.map(chat => `
        <div class="social-item" style="cursor:pointer;" data-action="group-select" data-id="${escapeHtml(chat.id)}">
          <div class="social-icon">👥</div>
          <div class="social-main">
            <div class="social-title">${escapeHtml(chat.name || "Group chat")}</div>
            <div class="social-sub">${escapeHtml((chat.members || []).length + " members")}</div>
          </div>
          <div class="social-actions">
            <button data-action="group-select" data-id="${escapeHtml(chat.id)}">Open</button>
            <button data-action="group-leave" data-id="${escapeHtml(chat.id)}">Leave</button>
          </div>
        </div>
      `).join("")
      : `<div class="empty-state">No group chats yet.</div>`;
  }

  if (chatView) {
    const messages = selectedChat ? getGroupChatMessages(selectedChat.id) : [];
    const hideNonFriend = currentState?.settings?.showNonFriendGroupMessages === false;
    const me = state?.user?.uid;
    const friendSet = new Set(state?.friends || []);

    chatView.innerHTML = selectedChat
      ? `
        <div class="profile-card" style="margin-bottom:14px;">
          <div class="profile-card-top">
            <div>
              <div class="profile-name">${escapeHtml(selectedChat.name || "Group chat")}</div>
              <div class="profile-id">${escapeHtml(selectedChat.id)}</div>
            </div>
            <div class="profile-badge">${escapeHtml((selectedChat.members || []).length + " members")}</div>
          </div>

          <div class="button-row">
            <button data-action="group-copy" data-id="${escapeHtml(selectedChat.id)}">Copy group ID</button>
            <button data-action="group-invite-mode" data-id="${escapeHtml(selectedChat.id)}">Invite member</button>
          </div>
        </div>

        <div class="field-row">
          <input id="group-message-text" type="text" placeholder="Type a group message..." />
        </div>
        <div class="button-row" style="margin-bottom:14px;">
          <button id="send-group-message-btn" type="button" data-group-id="${escapeHtml(selectedChat.id)}">Send group message</button>
        </div>

        <div id="group-chat-messages" class="achievement-list">
          ${
            messages.length
              ? messages.map(msg => {
                  const senderFriend = friendSet.has(msg.fromUid);
                  const hiddenBody = hideNonFriend && msg.fromUid !== me && !senderFriend;
                  return `
                    <div class="social-message" data-message-card="1" data-kind="group" data-uid="${escapeHtml(msg.fromUid || "")}">
                      <div class="social-icon">💬</div>
                      <div class="social-main">
                        <div class="social-title">${escapeHtml(msg.fromName || msg.fromUid || "Someone")}</div>
                        <div class="social-sub">${escapeHtml(hiddenBody ? "Hidden by your settings" : (msg.body || ""))}</div>
                      </div>
                    </div>
                  `;
                }).join("")
              : `<div class="empty-state">No group messages yet.</div>`
          }
        </div>
      `
      : `<div class="empty-state">Select a group chat to view it.</div>`;
  }

  if (inviteBox) {
    const invites = state?.groupInvites || [];
    inviteBox.innerHTML = invites.length
      ? invites.map(invite => `
        <div class="social-item">
          <div class="social-icon">🎫</div>
          <div class="social-main">
            <div class="social-title">${escapeHtml(invite.chatName || "Group invite")}</div>
            <div class="social-sub">${escapeHtml(invite.fromName || invite.fromUid)}</div>
          </div>
          <div class="social-actions">
            <button data-action="group-invite-accept" data-id="${escapeHtml(invite.id)}">Accept</button>
            <button data-action="group-invite-decline" data-id="${escapeHtml(invite.id)}">Decline</button>
            <button data-action="group-invite-view" data-id="${escapeHtml(invite.chatId)}">View group</button>
          </div>
        </div>
      `).join("")
      : `<div class="empty-state">No group invites.</div>`;
  }

  const groupComposer = $("group-compose-box");
  if (groupComposer) {
    groupComposer.innerHTML = `
      <div class="setting-card">
        <div class="setting-title">Create group chat</div>
        <div class="field-row">
          <input id="group-chat-name" type="text" placeholder="Group name" />
          <input id="group-chat-members" type="text" placeholder="Optional member IDs, comma separated" />
        </div>
        <div class="button-row">
          <button id="create-group-chat-btn" type="button">Create group</button>
        </div>
      </div>

      <div class="setting-card" style="margin-top:12px;">
        <div class="setting-title">Invite a person to the selected group</div>
        <div class="field-row">
          <input id="group-invite-uid" type="text" placeholder="User ID to invite" />
        </div>
        <div class="button-row">
          <button id="invite-to-group-btn" type="button" data-group-id="${escapeHtml(selectedId || "")}">Send invite</button>
        </div>
      </div>
    `;
  }
}

function renderMessagesSection(state) {
  const summary = $("messages-summary");
  const directTab = $("message-subtab-direct");
  const groupsTab = $("message-subtab-groups");
  const invitesTab = $("message-subtab-invites");
  const directPanel = $("message-subpanel-direct");
  const groupsPanel = $("message-subpanel-groups");
  const invitesPanel = $("message-subpanel-invites");

  if (directTab) directTab.classList.toggle("active", currentMessagesSubtab === "direct");
  if (groupsTab) groupsTab.classList.toggle("active", currentMessagesSubtab === "groups");
  if (invitesTab) invitesTab.classList.toggle("active", currentMessagesSubtab === "invites");
  if (directPanel) directPanel.classList.toggle("active", currentMessagesSubtab === "direct");
  if (groupsPanel) groupsPanel.classList.toggle("active", currentMessagesSubtab === "groups");
  if (invitesPanel) invitesPanel.classList.toggle("active", currentMessagesSubtab === "invites");

  if (summary) {
    summary.textContent = `Unread messages: ${state?.unreadCount || 0}`;
  }

  renderDirectMessagesSection(state);
  renderGroupsSection(state);
}

function bindTabs() {
  $("tab-info")?.addEventListener("click", () => showSection("info"));
  $("tab-progress")?.addEventListener("click", () => showSection("progress"));
  $("tab-friends")?.addEventListener("click", () => showSection("friends"));
  $("tab-messages")?.addEventListener("click", () => showSection("messages"));

  document.querySelectorAll("[data-friends-subtab]").forEach(btn => {
    btn.addEventListener("click", () => showFriendsSubsection(btn.dataset.friendsSubtab));
  });

  document.querySelectorAll("[data-message-subtab]").forEach(btn => {
    btn.addEventListener("click", () => showMessagesSubsection(btn.dataset.messageSubtab));
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

  const usernameInput = $("profile-username");
  if (usernameInput) {
    usernameInput.addEventListener("input", () => {
      profileUsernameDirty = true;
    });
  }

  $("friend-search-input")?.addEventListener("input", () => renderFriendsSection(currentState));
  $("direct-message-friend-search")?.addEventListener("input", () => renderDirectMessagesSection(currentState));
  $("group-search-input")?.addEventListener("input", () => renderGroupsSection(currentState));

  $("message-filter-all")?.addEventListener("click", () => {
    currentDirectFilter = "all";
    renderDirectMessagesSection(currentState);
  });
  $("message-filter-system")?.addEventListener("click", () => {
    currentDirectFilter = "system";
    renderDirectMessagesSection(currentState);
  });
  $("message-filter-friends")?.addEventListener("click", () => {
    currentDirectFilter = "friends";
    renderDirectMessagesSection(currentState);
  });
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

  $("send-direct-message-btn")?.addEventListener("click", async () => {
    try {
      const friendId = currentState?.selectedConversationId || "";
      const text = $("direct-message-text")?.value || "";
      await sendChatMessage(friendId, text);
      $("direct-message-text").value = "";
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

      if (action === "friend-message") {
        setSelectedConversation(uid);
        showSection("messages");
        showMessagesSubsection("direct");
      }

      if (action === "friend-search-message") {
        setSelectedConversation(uid);
        showSection("messages");
        showMessagesSubsection("direct");
      }

      if (action === "friend-copy" || action === "friend-search-copy" || action === "profile-copy") {
        await copyText(uid);
        btn.textContent = "Copied";
        setTimeout(() => {
          if (btn.isConnected) btn.textContent = "Copy ID";
        }, 1100);
      }

      if (action === "friend-remove") await removeFriend(uid);
      if (action === "friend-block") await blockUser(uid);

      if (action === "request-accept") await respondToFriendRequest(id, "accept");
      if (action === "request-decline") await respondToFriendRequest(id, "decline");
      if (action === "request-block") await respondToFriendRequest(id, "block");
      if (action === "request-ignore") return;
      if (action === "request-view-messages") {
        setSelectedConversation(uid);
        showSection("messages");
        showMessagesSubsection("direct");
      }

      if (action === "message-open") {
        window.openAccountArea("messages", "direct", uid);
      }

      if (action === "message-view-inbox") {
        window.openAccountArea("messages", "direct", uid);
      }

      if (action === "message-read-toggle") {
        await markMessageRead(id, btn.dataset.read === "true");
      }

      if (action === "requests-toggle") await toggleRequestsEnabled(btn.dataset.enabled === "true");
      if (action === "chat-toggle") await toggleChatEnabled(btn.dataset.enabled === "true");
      if (action === "group-toggle") await toggleGroupChatsEnabled(btn.dataset.enabled === "true");
      if (action === "group-nonfriend-toggle") await toggleShowNonFriendGroupMessages(btn.dataset.enabled === "true");
      if (action === "privacy-toggle") await toggleProfileHidden(btn.dataset.enabled === "true");
      if (action === "social-disable-keep") await disableSocialSystem("keep");
      if (action === "social-disable-clear") await disableSocialSystem("clear");
      if (action === "social-enable-restore") await enableSocialSystem("restore");
      if (action === "social-enable-fresh") await enableSocialSystem("fresh");
      if (action === "profile-self") await viewProfileById(currentState?.user?.uid);

      if (action === "profile-open-message") {
        setSelectedConversation(uid);
        showSection("messages");
        showMessagesSubsection("direct");
      }

      if (action === "group-select") {
        setSelectedGroupChatId(id);
        showMessagesSubsection("groups");
      }

      if (action === "group-copy") {
        await copyText(id);
        btn.textContent = "Copied";
        setTimeout(() => {
          if (btn.isConnected) btn.textContent = "Copy group ID";
        }, 1100);
      }

      if (action === "group-leave") {
        await leaveGroupChat(id);
      }

      if (action === "group-invite-accept") {
        await respondToGroupInvite(id, "accept");
      }

      if (action === "group-invite-decline") {
        await respondToGroupInvite(id, "decline");
      }

      if (action === "group-invite-view") {
        setSelectedGroupChatId(id);
        showSection("messages");
        showMessagesSubsection("groups");
      }

      if (action === "group-invite-mode") {
        showMessagesSubsection("groups");
      }

      if (action === "direct-pick-friend") {
        setSelectedConversation(uid);
        showMessagesSubsection("direct");
      }

      if (action === "message-card-open") {
        window.openAccountArea("messages", btn.dataset.section || "direct", uid);
      }
    } catch (err) {
      alert(err.message || "Action failed.");
    }
  });
}

function renderSocial(state) {
  currentState = state;
  renderUser(state);
  renderProgressSection(state);
  renderAchievementsSection(state);
  renderFriendsSection(state);
  renderMessagesSection(state);
}

document.addEventListener("DOMContentLoaded", () => {
  bindTabs();
  bindButtons();
  bindDelegatedClicks();

  showSection("info");
  showFriendsSubsection("friends");
  showMessagesSubsection("direct");
  setStatus("Checking account...", "info");

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