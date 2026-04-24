import { auth } from "./firebase-config.js";
import {
  socialState,
  subscribeSocial,
  setSelectedConversation,
  markMessageRead,
  sendChatMessage,
  respondToFriendRequest,
  getConversationMessages,
  sendFriendRequestById,
  removeFriend,
  blockUser,
  viewProfileById
} from "./social.js";

const $ = (id) => document.getElementById(id);

let activeView = "direct";
let directSearchValue = "";
const directDrafts = {};
let openFriendMenuUid = "";
let profileSheetUid = "";
let pendingScrollMode = "keep";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cleanId(value) {
  return String(value || "").trim();
}

function unique(list) {
  return [...new Set((Array.isArray(list) ? list : []).map(cleanId).filter(Boolean))];
}

function toMs(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  if (value instanceof Date) return value.getTime();
  return 0;
}

function sortOldestFirst(list) {
  return [...list].sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));
}

function formatRelativeTime(value) {
  const ms = toMs(value);
  if (!ms) return "";
  const diff = Math.max(0, Date.now() - ms);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;
  if (diff < minute) return "Just now";
  if (diff < hour) return `${Math.floor(diff / minute)} min${Math.floor(diff / minute) === 1 ? "" : "s"} ago`;
  if (diff < day) return `${Math.floor(diff / hour)} hour${Math.floor(diff / hour) === 1 ? "" : "s"} ago`;
  if (diff < week) return `${Math.floor(diff / day)} day${Math.floor(diff / day) === 1 ? "" : "s"} ago`;
  if (diff < month) return `${Math.floor(diff / week)} week${Math.floor(diff / week) === 1 ? "" : "s"} ago`;
  if (diff < year) return `${Math.floor(diff / month)} month${Math.floor(diff / month) === 1 ? "" : "s"} ago`;
  return `${Math.floor(diff / year)} year${Math.floor(diff / year) === 1 ? "" : "s"} ago`;
}

function formatExactTime(value) {
  const ms = toMs(value);
  if (!ms) return "";
  return new Date(ms).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function relativeSince(value) {
  const ms = toMs(value);
  if (!ms) return "Hidden";
  const diff = Math.max(0, Date.now() - ms);
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  const month = 30 * day;
  const year = 365 * day;
  if (diff < hour) return "Under 1 hour";
  if (diff < day) return `${Math.floor(diff / hour)} hour${Math.floor(diff / hour) === 1 ? "" : "s"}`;
  if (diff < month) return `${Math.floor(diff / day)} day${Math.floor(diff / day) === 1 ? "" : "s"}`;
  if (diff < year) return `${Math.floor(diff / month)} month${Math.floor(diff / month) === 1 ? "" : "s"}`;
  return `${Math.floor(diff / year)} year${Math.floor(diff / year) === 1 ? "" : "s"}`;
}

function initials(value, fallback = "P") {
  return String(value || "").trim().slice(0, 1).toUpperCase() || fallback;
}

function activeUser(state) {
  return state?.user || socialState.user || auth.currentUser || null;
}

function isVerifiedState(state) {
  const user = activeUser(state);
  return !!(user?.emailVerified || state?.profile?.verified || socialState.profile?.verified);
}

function isIncoming(message) {
  const uid = socialState.user?.uid;
  return !!uid && cleanId(message?.toUid) === uid;
}

function isUnread(message) {
  const uid = socialState.user?.uid;
  return !!uid && isIncoming(message) && !unique(message.readBy).includes(uid);
}

function friendProfile(uid) {
  const id = cleanId(uid);
  if (!id) return null;
  if (socialState.friendProfiles?.[id]) return socialState.friendProfiles[id];
  if (cleanId(socialState.selectedProfileId) === id) return socialState.selectedProfile || null;
  return null;
}

function friendName(uid) {
  return friendProfile(uid)?.username || uid || "Player";
}

function conversationEntries(state) {
  return (state.friends || []).map((uid) => {
    const messages = sortOldestFirst(getConversationMessages(uid));
    const last = messages[messages.length - 1] || null;
    const profile = state.friendProfiles?.[uid] || { uid, username: uid, photoURL: "" };
    return {
      uid,
      profile,
      unreadCount: messages.filter((message) => isUnread(message)).length,
      last,
      lastAt: toMs(last?.createdAt)
    };
  }).sort((left, right) => {
    if (right.lastAt !== left.lastAt) return right.lastAt - left.lastAt;
    return String(left.profile?.username || left.uid).localeCompare(String(right.profile?.username || right.uid));
  });
}

function captureUiState() {
  const list = $("social-list-scroll");
  const stream = $("social-message-stream");
  const activeElement = document.activeElement;
  const focus = activeElement && activeElement.id === "direct-message-input"
    ? { id: activeElement.id, start: activeElement.selectionStart ?? null, end: activeElement.selectionEnd ?? null }
    : null;

  return {
    listTop: list ? list.scrollTop : 0,
    streamTop: stream ? stream.scrollTop : 0,
    focus
  };
}

function restoreUiState(state = {}, options = {}) {
  requestAnimationFrame(() => {
    const list = $("social-list-scroll");
    const stream = $("social-message-stream");

    if (list) {
      list.scrollTop = Math.min(Number(state.listTop || 0), Math.max(0, list.scrollHeight - list.clientHeight));
    }

    if (stream) {
      if (options.forceBottom) {
        stream.scrollTop = Math.max(0, stream.scrollHeight - stream.clientHeight);
      } else {
        stream.scrollTop = Math.min(Number(state.streamTop || 0), Math.max(0, stream.scrollHeight - stream.clientHeight));
      }
    }

    if (state.focus?.id) {
      const input = document.getElementById(state.focus.id);
      if (input) {
        input.focus();
        if (typeof state.focus.start === "number" && typeof state.focus.end === "number") {
          input.setSelectionRange(state.focus.start, state.focus.end);
        }
      }
    }
  });
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

async function markConversationRead(uid) {
  const targetUid = cleanId(uid);
  if (!targetUid) return;

  const unread = getConversationMessages(targetUid).filter((message) => cleanId(message.fromUid) === targetUid && isUnread(message));
  for (const message of unread) {
    try {
      await markMessageRead(message.id, true);
    } catch (error) {
      console.error(error);
    }
  }
}

function profileAvatarMarkup(profile) {
  if (profile?.photoURL) {
    return `<img src="${escapeHtml(profile.photoURL)}" alt="" class="social-avatar-img" />`;
  }
  return `<span>${escapeHtml(initials(profile?.username || profile?.uid || "P"))}</span>`;
}

function messageBubble(message) {
  const mine = cleanId(message.fromUid) === cleanId(socialState.user?.uid);
  const who = mine ? "You" : friendName(message.fromUid);
  return `
    <div class="chat-message ${mine ? "mine" : "theirs"}">
      <div class="chat-bubble-shell">
        <div class="chat-bubble">${escapeHtml(message.body || "")}</div>
        <div class="chat-meta" title="${escapeHtml(formatExactTime(message.createdAt))}">${escapeHtml(`${who} â€¢ ${formatRelativeTime(message.createdAt)}`)}</div>
      </div>
    </div>
  `;
}

function profileFacts(profile, options = {}) {
  const full = !!options.full;
  if (!profile) return `<div class="social-empty">Pick a friend to see their profile.</div>`;

  if (profile.canViewProfile === false) {
    return `
      <div class="social-profile-sheet-body">
        <div class="social-detail-hero">
          <span class="social-avatar detail">${profileAvatarMarkup(profile)}</span>
          <div>
            <div class="social-detail-name">${escapeHtml(profile.username || "Player")}</div>
            <div class="social-detail-id">${escapeHtml(profile.uid || "--")}</div>
          </div>
        </div>
        <div class="social-empty">Only friends can view this profile.</div>
      </div>
    `;
  }

  const streakCurrent = profile.streakCurrent == null ? "Hidden" : `${profile.streakCurrent} day${profile.streakCurrent === 1 ? "" : "s"}`;
  const streakLongest = profile.streakLongest == null ? "Hidden" : `${profile.streakLongest} day${profile.streakLongest === 1 ? "" : "s"}`;

  return `
    <div class="social-profile-sheet-body ${full ? "full" : ""}">
      <div class="social-detail-hero">
        <span class="social-avatar detail">${profileAvatarMarkup(profile)}</span>
        <div>
          <div class="social-detail-name">${escapeHtml(profile.username || "Player")}</div>
          <div class="social-detail-id">${escapeHtml(profile.uid || "--")}</div>
        </div>
      </div>
      <div class="profile-meta compact">
        <div><span>Rank</span><strong>${escapeHtml(profile.currentRank || "Hidden")}</strong></div>
        <div><span>Friends</span><strong>${escapeHtml(String((profile.friends || []).length || 0))}</strong></div>
        <div><span>Joined</span><strong>${toMs(profile.createdAt) ? escapeHtml(new Date(toMs(profile.createdAt)).toLocaleDateString()) : "Hidden"}</strong></div>
        <div><span>On the site for</span><strong>${escapeHtml(relativeSince(profile.createdAt))}</strong></div>
        <div><span>Current streak</span><strong>${escapeHtml(streakCurrent)}</strong></div>
        <div><span>Longest streak</span><strong>${escapeHtml(streakLongest)}</strong></div>
      </div>
    </div>
  `;
}

function toolbarMarkup(state) {
  const directUnread = (state.friends || []).reduce((sum, uid) => {
    return sum + getConversationMessages(uid).filter((message) => isUnread(message)).length;
  }, 0);

  return `
    <div class="social-shell-head">
      <div>
        <h3>Friends</h3>
        <p>Direct messages, requests, and blocked users.</p>
      </div>
      <div class="social-filter-row">
        <button type="button" class="social-switch ${activeView === "direct" ? "active" : ""}" data-social-view="direct">Direct${directUnread ? ` <span class="social-counter">${directUnread}</span>` : ""}</button>
        <button type="button" class="social-switch ${activeView === "requests" ? "active" : ""}" data-social-view="requests">Requests${state.incomingRequests?.length ? ` <span class="social-counter">${state.incomingRequests.length}</span>` : ""}</button>
        <button type="button" class="social-switch ${activeView === "blocked" ? "active" : ""}" data-social-view="blocked">Blocked</button>
      </div>
    </div>
    <div class="social-quick-card social-quick-card-inline">
      <div class="social-quick-title">Add someone</div>
      <div class="social-form-stack compact">
        <input id="quick-friend-id" type="text" placeholder="User ID" />
        <input id="quick-friend-note" type="text" placeholder="Optional note" />
      </div>
      <div class="button-row split">
        <button type="button" data-action="social-send-request">Send request</button>
        <button type="button" data-action="social-quick-block">Block</button>
      </div>
    </div>
  `;
}

function directListMarkup(state) {
  const query = directSearchValue.trim().toLowerCase();
  const entries = conversationEntries(state).filter((entry) => {
    return !query
      || String(entry.profile?.username || "").toLowerCase().includes(query)
      || entry.uid.toLowerCase().includes(query);
  });
  const selectedUid = cleanId(state.selectedConversationId);

  return `
    <div class="social-list-head">
      <div><h3>Direct messages</h3><p>${entries.length} friend${entries.length === 1 ? "" : "s"}</p></div>
      <input id="social-direct-search" type="text" placeholder="Search friends" value="${escapeHtml(directSearchValue)}" />
    </div>
    <div id="social-list-scroll" class="social-list-scroll">
      ${entries.length ? entries.map((entry) => `
        <article class="social-friend-card ${entry.uid === selectedUid ? "active" : ""}">
          <div class="social-friend-row">
            <button class="social-entry-main" type="button" data-action="social-pick-direct" data-uid="${escapeHtml(entry.uid)}">
              <span class="social-avatar">${profileAvatarMarkup(entry.profile)}</span>
              <span class="social-entry-copy">
                <span class="social-entry-topline">
                  <strong>${escapeHtml(entry.profile?.username || "Player")}</strong>
                  <small>${escapeHtml(entry.last ? formatRelativeTime(entry.last.createdAt) : "No messages yet")}</small>
                </span>
                <span class="social-entry-subline">
                  <span>${escapeHtml(entry.last?.body || entry.uid)}</span>
                  ${entry.unreadCount ? `<span class="social-counter">${entry.unreadCount}</span>` : ""}
                </span>
              </span>
            </button>
            <button type="button" class="social-menu-toggle" data-action="social-toggle-menu" data-uid="${escapeHtml(entry.uid)}" aria-label="Friend actions">&#8942;</button>
          </div>
          ${openFriendMenuUid === entry.uid ? `
            <div class="social-inline-actions">
              <button type="button" data-action="social-view-profile" data-uid="${escapeHtml(entry.uid)}">View profile</button>
              <button type="button" data-action="social-copy-id" data-uid="${escapeHtml(entry.uid)}">Copy ID</button>
              <button type="button" data-action="social-remove-friend" data-uid="${escapeHtml(entry.uid)}">Unfriend</button>
              <button type="button" class="danger" data-action="social-block-user" data-uid="${escapeHtml(entry.uid)}">Block</button>
            </div>
          ` : ""}
        </article>
      `).join("") : `<div class="social-empty">No friends yet. Send a request to start chatting.</div>`}
    </div>
  `;
}

function requestsListMarkup(state) {
  return `
    <div class="social-list-head">
      <div><h3>Friend requests</h3><p>${(state.incomingRequests || []).length} incoming, ${(state.outgoingRequests || []).length} outgoing</p></div>
    </div>
    <div id="social-list-scroll" class="social-list-scroll">
      <div class="social-subsection">
        <h4>Incoming</h4>
        ${(state.incomingRequests || []).length ? state.incomingRequests.map((request) => `
          <div class="request-card request-tight">
            <div class="request-card-top">
              <div>
                <div class="request-card-title">${escapeHtml(request.fromName || request.fromUid || "Friend request")}</div>
                <div class="request-card-meta">${escapeHtml(request.fromUid || "")}</div>
              </div>
              <span class="profile-badge">Pending</span>
            </div>
            <div class="request-card-note">${escapeHtml(request.body || "Friend request")}</div>
            <div class="social-inline-actions social-inline-actions-tight">
              <button type="button" data-action="social-view-profile" data-uid="${escapeHtml(request.fromUid || "")}">View profile</button>
              <button type="button" data-action="social-accept-request" data-id="${escapeHtml(request.id)}" data-uid="${escapeHtml(request.fromUid || "")}">Accept</button>
              <button type="button" data-action="social-ignore-request" data-id="${escapeHtml(request.id)}">Ignore</button>
              <button type="button" class="danger" data-action="social-decline-request" data-id="${escapeHtml(request.id)}">Decline</button>
            </div>
          </div>
        `).join("") : `<div class="social-empty inline">No incoming requests.</div>`}
      </div>
      <div class="social-subsection">
        <h4>Outgoing</h4>
        ${(state.outgoingRequests || []).length ? state.outgoingRequests.map((request) => `
          <div class="request-card request-tight">
            <div class="request-card-top">
              <div>
                <div class="request-card-title">${escapeHtml(request.toName || request.toUid || "Pending request")}</div>
                <div class="request-card-meta">${escapeHtml(request.toUid || "")}</div>
              </div>
              <span class="profile-badge">${escapeHtml(request.status || "pending")}</span>
            </div>
            <div class="request-card-note">${escapeHtml(request.body || "Friend request sent.")}</div>
          </div>
        `).join("") : `<div class="social-empty inline">No outgoing requests.</div>`}
      </div>
    </div>
  `;
}

function blockedListMarkup(state) {
  const blocked = (state.blocked || []).map((uid) => state.friendProfiles?.[uid] || { uid, username: uid });
  return `
    <div class="social-list-head">
      <div><h3>Blocked users</h3><p>${blocked.length} blocked</p></div>
    </div>
    <div id="social-list-scroll" class="social-list-scroll">
      ${blocked.length ? blocked.map((profile) => `
        <article class="social-friend-card">
          <div class="social-friend-row">
            <button class="social-entry-main" type="button" data-action="social-view-profile" data-uid="${escapeHtml(profile.uid)}">
              <span class="social-avatar">${profileAvatarMarkup(profile)}</span>
              <span class="social-entry-copy">
                <span class="social-entry-topline"><strong>${escapeHtml(profile.username || "Player")}</strong></span>
                <span class="social-entry-subline"><span>${escapeHtml(profile.uid || "")}</span></span>
              </span>
            </button>
            <button type="button" class="social-menu-toggle" data-action="social-copy-id" data-uid="${escapeHtml(profile.uid)}" aria-label="Copy ID">ID</button>
          </div>
        </article>
      `).join("") : `<div class="social-empty">No blocked users.</div>`}
    </div>
  `;
}

function listMarkup(state) {
  if (activeView === "requests") return requestsListMarkup(state);
  if (activeView === "blocked") return blockedListMarkup(state);
  return directListMarkup(state);
}

function chatHeaderMarkup(profile, uid) {
  return `
    <div class="social-chat-head social-chat-head-strong">
      <div class="social-chat-hero">
        <span class="social-avatar">${profileAvatarMarkup(profile)}</span>
        <div>
          <h3>${escapeHtml(profile?.username || friendName(uid))}</h3>
          <p>${escapeHtml(profile?.currentRank || "Friend")} • ${escapeHtml(uid)}</p>
        </div>
      </div>
      <div class="social-chat-actions">
        <button type="button" class="button-ghost small" data-action="social-view-profile" data-uid="${escapeHtml(uid)}">View profile</button>
        <button type="button" class="button-ghost small" data-action="social-copy-id" data-uid="${escapeHtml(uid)}">Copy ID</button>
      </div>
    </div>
  `;
}

function profileSheetMarkup(uid) {
  const profile = friendProfile(uid) || socialState.selectedProfile || null;
  const targetUid = cleanId(uid) || cleanId(profile?.uid);
  return `
    <div class="social-profile-sheet">
      <div class="social-profile-sheet-top">
        <button type="button" class="button-ghost small" data-action="social-close-profile">Back to chat</button>
        ${targetUid ? `
          <div class="social-chat-actions">
            <button type="button" class="button-ghost small" data-action="social-copy-id" data-uid="${escapeHtml(targetUid)}">Copy ID</button>
            <button type="button" class="button-ghost small" data-action="social-remove-friend" data-uid="${escapeHtml(targetUid)}">Unfriend</button>
            <button type="button" class="danger small" data-action="social-block-user" data-uid="${escapeHtml(targetUid)}">Block</button>
          </div>
        ` : ""}
      </div>
      ${profileFacts(profile, { full: true })}
    </div>
  `;
}

function chatMarkup(state) {
  if (profileSheetUid) {
    return profileSheetMarkup(profileSheetUid);
  }

  if (activeView === "requests") {
    return `
      <div class="social-chat-empty">
        <h3>Friend requests</h3>
        <p>Accept, ignore, or decline requests from the left side. You can also open a profile before deciding.</p>
      </div>
    `;
  }

  if (activeView === "blocked") {
    return `
      <div class="social-chat-empty">
        <h3>Blocked users</h3>
        <p>Your blocked list is on the left. Open a profile there if you want to review it.</p>
      </div>
    `;
  }

  const selectedUid = cleanId(state.selectedConversationId);
  const profile = selectedUid ? (state.friendProfiles?.[selectedUid] || state.selectedProfile || { uid: selectedUid, username: selectedUid }) : null;
  const messages = selectedUid ? sortOldestFirst(getConversationMessages(selectedUid)) : [];

  if (!selectedUid) {
    return `
      <div class="social-chat-empty">
        <h3>Pick a friend</h3>
        <p>Your direct messages will show up here.</p>
      </div>
    `;
  }

  return `
    ${chatHeaderMarkup(profile, selectedUid)}
    <div id="social-message-stream" class="social-message-stream">
      ${messages.length ? messages.map((message) => messageBubble(message)).join("") : `<div class="social-empty">No messages yet. Say hi.</div>`}
    </div>
    <div class="social-composer">
      <input id="direct-message-input" type="text" placeholder="Message ${escapeHtml(friendName(selectedUid))}" value="${escapeHtml(directDrafts[selectedUid] || "")}" />
      <button type="button" data-action="social-send-direct" data-uid="${escapeHtml(selectedUid)}">Send</button>
    </div>
  `;
}

function render(state) {
  const root = $("messages-root");
  if (!root) return;
  const uiState = captureUiState();
  const user = activeUser(state);

  if (!user) {
    root.innerHTML = `<div class="msg-empty">Log in to open your friends, direct messages, and requests.</div>`;
    return;
  }

  if (!isVerifiedState(state)) {
    root.innerHTML = `
      <div class="locked-state">
        <h3>Verify your email to unlock friends</h3>
        <p>Direct messages, friend requests, and the rest of the friends system unlock right after your email is verified.</p>
      </div>
    `;
    return;
  }

  if (!new Set(["direct", "requests", "blocked"]).has(activeView)) {
    activeView = "direct";
  }

  if (activeView === "direct") {
    const entries = conversationEntries(state);
    const currentUid = cleanId(state.selectedConversationId);
    const nextUid = entries.some((entry) => entry.uid === currentUid) ? currentUid : (entries[0]?.uid || null);
    if (nextUid !== currentUid) {
      setSelectedConversation(nextUid);
    }
    if (openFriendMenuUid && !entries.some((entry) => entry.uid === openFriendMenuUid)) {
      openFriendMenuUid = "";
    }
    if (profileSheetUid && !entries.some((entry) => entry.uid === profileSheetUid) && cleanId(state.selectedProfileId) !== profileSheetUid) {
      profileSheetUid = "";
    }
  } else {
    openFriendMenuUid = "";
  }

  root.innerHTML = `
    <div class="social-layout social-layout-direct-only">
      <section class="social-panel social-panel-friends">
        ${toolbarMarkup(state)}
        ${listMarkup(state)}
      </section>
      <section class="social-panel social-panel-chat social-panel-chat-wide">
        ${chatMarkup(state)}
      </section>
    </div>
  `;

  restoreUiState(uiState, { forceBottom: pendingScrollMode === "bottom" });
  pendingScrollMode = "keep";

  if (activeView === "direct" && cleanId(state.selectedConversationId)) {
    markConversationRead(state.selectedConversationId);
  }
}

function openMessagesView(sub = "direct", targetId = null) {
  const next = String(sub || "direct").trim().toLowerCase();
  activeView = new Set(["direct", "requests", "blocked", "chat"]).has(next) ? (next === "chat" ? "direct" : next) : "direct";
  openFriendMenuUid = "";
  profileSheetUid = "";

  if (activeView === "direct" && targetId) {
    setSelectedConversation(targetId);
    viewProfileById(targetId).catch((error) => console.error(error));
    pendingScrollMode = "bottom";
  } else if (targetId && (activeView === "requests" || activeView === "blocked")) {
    viewProfileById(targetId).catch((error) => console.error(error));
  }

  render(socialState);
}

function bindRoot(root) {
  document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-action='social-toggle-menu']") && !event.target.closest(".social-inline-actions")) {
      if (openFriendMenuUid) {
        openFriendMenuUid = "";
        render(socialState);
      }
    }
  });

  root.addEventListener("input", (event) => {
    if (event.target?.id === "social-direct-search") {
      directSearchValue = event.target.value;
      render(socialState);
    }
    if (event.target?.id === "direct-message-input") {
      const uid = cleanId(socialState.selectedConversationId);
      if (uid) directDrafts[uid] = event.target.value;
    }
  });

  root.addEventListener("keydown", async (event) => {
    try {
      if (event.target?.id === "direct-message-input" && event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        const uid = cleanId(socialState.selectedConversationId);
        const body = directDrafts[uid] || event.target.value || "";
        if (!uid || !body.trim()) return;
        await sendChatMessage(uid, body);
        directDrafts[uid] = "";
        pendingScrollMode = "bottom";
        render(socialState);
      }
    } catch (error) {
      console.error(error);
      window.alert(error?.message || "Action failed.");
    }
  });

  root.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action], [data-social-view]");
    if (!button) return;

    const action = button.dataset.action || "";
    const uid = cleanId(button.dataset.uid || "");
    const id = cleanId(button.dataset.id || "");

    try {
      if (button.dataset.socialView) {
        activeView = String(button.dataset.socialView || "direct");
        openFriendMenuUid = "";
        profileSheetUid = "";
        render(socialState);
        return;
      }

      if (action === "social-pick-direct") {
        setSelectedConversation(uid);
        openFriendMenuUid = "";
        profileSheetUid = "";
        viewProfileById(uid).catch((error) => console.error(error));
        pendingScrollMode = "bottom";
      } else if (action === "social-toggle-menu") {
        openFriendMenuUid = openFriendMenuUid === uid ? "" : uid;
      } else if (action === "social-send-request") {
        await sendFriendRequestById($("quick-friend-id")?.value || "", $("quick-friend-note")?.value || "");
        if ($("quick-friend-id")) $("quick-friend-id").value = "";
        if ($("quick-friend-note")) $("quick-friend-note").value = "";
        activeView = "requests";
        openFriendMenuUid = "";
      } else if (action === "social-quick-block") {
        await blockUser($("quick-friend-id")?.value || "");
        if ($("quick-friend-id")) $("quick-friend-id").value = "";
        if ($("quick-friend-note")) $("quick-friend-note").value = "";
        activeView = "blocked";
        openFriendMenuUid = "";
      } else if (action === "social-copy-id") {
        await copyText(uid);
        return;
      } else if (action === "social-remove-friend") {
        await removeFriend(uid);
        openFriendMenuUid = "";
        if (profileSheetUid === uid) profileSheetUid = "";
      } else if (action === "social-block-user") {
        await blockUser(uid);
        openFriendMenuUid = "";
        if (profileSheetUid === uid) profileSheetUid = "";
      } else if (action === "social-view-profile") {
        await viewProfileById(uid);
        profileSheetUid = uid;
        openFriendMenuUid = "";
      } else if (action === "social-close-profile") {
        profileSheetUid = "";
      } else if (action === "social-accept-request") {
        await respondToFriendRequest(id, "accept");
        if (uid) {
          setSelectedConversation(uid);
          await viewProfileById(uid);
          activeView = "direct";
          profileSheetUid = "";
          pendingScrollMode = "bottom";
        }
      } else if (action === "social-ignore-request") {
        await respondToFriendRequest(id, "ignore");
      } else if (action === "social-decline-request") {
        await respondToFriendRequest(id, "decline");
      } else if (action === "social-send-direct") {
        const body = directDrafts[uid] || $("direct-message-input")?.value || "";
        if (!uid || !body.trim()) return;
        await sendChatMessage(uid, body);
        directDrafts[uid] = "";
        pendingScrollMode = "bottom";
      }

      render(socialState);
    } catch (error) {
      console.error(error);
      window.alert(error?.message || "Action failed.");
    }
  });
}

function start() {
  const root = $("messages-root");
  if (!root) return;
  bindRoot(root);
  render(socialState);
  subscribeSocial(render);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}

window.PanategwaMessagesRender = () => render(socialState);
window.PanategwaMessagesOpen = openMessagesView;

export { render, openMessagesView };
