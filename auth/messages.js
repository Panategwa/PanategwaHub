import {
  socialState,
  subscribeSocial,
  setSelectedConversation,
  setSelectedGroupChatId,
  markMessageRead,
  sendChatMessage,
  sendGroupMessage,
  createGroupChat,
  joinGroupChatById,
  updateGroupChatInfo,
  addMembersToGroupChat,
  deleteGroupChat,
  respondToGroupInvite,
  respondToFriendRequest,
  leaveGroupChat,
  getConversationMessages,
  getGroupChatMessages,
  sendFriendRequestById,
  removeFriend,
  blockUser,
  viewProfileById
} from "./social.js";

const $ = (id) => document.getElementById(id);

let activeView = "direct";
let directSearchValue = "";
let groupSearchValue = "";
const directDrafts = {};
const groupDrafts = {};
let lastThreadKey = "";
let pendingForceBottomKey = "";

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

function initials(value, fallback = "P") {
  return String(value || "").trim().slice(0, 1).toUpperCase() || fallback;
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
  return socialState.friendProfiles?.[uid] || socialState.selectedProfile || null;
}

function friendName(uid) {
  return friendProfile(uid)?.username || uid || "Player";
}

function conversationEntries(state) {
  return (state.friends || []).map((uid) => {
    const messages = sortOldestFirst(getConversationMessages(uid));
    const last = messages[messages.length - 1] || null;
    return {
      uid,
      profile: state.friendProfiles?.[uid] || { uid, username: uid, photoURL: "" },
      messages,
      unreadCount: messages.filter((message) => isUnread(message)).length,
      last,
      lastAt: toMs(last?.createdAt)
    };
  }).sort((left, right) => {
    if (right.lastAt !== left.lastAt) return right.lastAt - left.lastAt;
    return String(left.profile?.username || left.uid).localeCompare(String(right.profile?.username || right.uid));
  });
}

function groupEntries(state) {
  return [...(state.groupChats || [])].sort((left, right) => toMs(right.updatedAt) - toMs(left.updatedAt));
}

function activeThreadKey(state) {
  if (activeView === "groups") return `group:${cleanId(state.selectedGroupChatId)}`;
  if (activeView === "direct") return `direct:${cleanId(state.selectedConversationId)}`;
  return activeView;
}

function captureUiState() {
  const list = $("social-list-scroll");
  const stream = $("social-message-stream");
  const activeElement = document.activeElement;
  const focus = activeElement && ["direct-message-input", "group-message-input"].includes(activeElement.id)
    ? { id: activeElement.id, start: activeElement.selectionStart ?? null, end: activeElement.selectionEnd ?? null }
    : null;

  const captureScroll = (element) => {
    if (!element) return null;
    const offsetFromBottom = Math.max(0, element.scrollHeight - element.clientHeight - element.scrollTop);
    return { top: element.scrollTop, atBottom: offsetFromBottom < 28, offsetFromBottom };
  };

  return { list: captureScroll(list), stream: captureScroll(stream), focus };
}

function restoreUiState(state = {}, options = {}) {
  requestAnimationFrame(() => {
    const list = $("social-list-scroll");
    const stream = $("social-message-stream");

    if (list && state.list) {
      list.scrollTop = Math.min(state.list.top, Math.max(0, list.scrollHeight - list.clientHeight));
    }

    if (stream) {
      if (options.forceBottom) {
        stream.scrollTop = Math.max(0, stream.scrollHeight - stream.clientHeight);
      } else if (state.stream) {
        stream.scrollTop = state.stream.atBottom
          ? Math.max(0, stream.scrollHeight - stream.clientHeight)
          : Math.max(0, stream.scrollHeight - stream.clientHeight - state.stream.offsetFromBottom);
      }
    }

    if (state.focus) {
      const input = document.getElementById(state.focus.id);
      if (input) {
        input.focus();
        if (typeof state.focus.start === "number" && typeof state.focus.end === "number") {
          input.setSelectionRange(state.focus.start, state.focus.end);
        }
      }
    }

    updateJumpButton();
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

function messageBubble(message, group = false) {
  const mine = cleanId(message.fromUid) === cleanId(socialState.user?.uid);
  const who = mine ? "You" : (group ? (message.fromName || "Member") : friendName(message.fromUid));
  return `
    <div class="chat-message ${mine ? "mine" : "theirs"}">
      <div class="chat-bubble-shell">
        ${group && !mine ? `<div class="chat-author">${escapeHtml(who)}</div>` : ""}
        <div class="chat-bubble">${escapeHtml(message.body || "")}</div>
        <div class="chat-meta" title="${escapeHtml(formatExactTime(message.createdAt))}">${escapeHtml(`${who} - ${formatRelativeTime(message.createdAt)}`)}</div>
      </div>
    </div>
  `;
}

function profileFacts(profile) {
  if (!profile) return `<div class="social-empty">Pick someone to see details.</div>`;

  const rank = profile.currentRank || "Hidden";
  const joined = toMs(profile.createdAt) ? new Date(toMs(profile.createdAt)).toLocaleDateString() : "Hidden";
  const memberFor = toMs(profile.createdAt) ? relativeSince(profile.createdAt) : "Hidden";
  const streakCurrent = profile.streakCurrent == null ? "Hidden" : `${profile.streakCurrent} day${profile.streakCurrent === 1 ? "" : "s"}`;
  const streakLongest = profile.streakLongest == null ? "Hidden" : `${profile.streakLongest} day${profile.streakLongest === 1 ? "" : "s"}`;

  return `
    <div class="social-detail-profile">
      <div class="social-detail-hero">
        <span class="social-avatar detail">${profileAvatarMarkup(profile)}</span>
        <div>
          <div class="social-detail-name">${escapeHtml(profile.username || "Player")}</div>
          <div class="social-detail-id">${escapeHtml(profile.uid || "--")}</div>
        </div>
      </div>
      <div class="profile-meta compact">
        <div><span>Rank</span><strong>${escapeHtml(rank)}</strong></div>
        <div><span>Joined</span><strong>${escapeHtml(joined)}</strong></div>
        <div><span>Member for</span><strong>${escapeHtml(memberFor)}</strong></div>
        <div><span>Friends</span><strong>${escapeHtml(String((profile.friends || []).length || 0))}</strong></div>
        <div><span>Current streak</span><strong>${escapeHtml(streakCurrent)}</strong></div>
        <div><span>Longest streak</span><strong>${escapeHtml(streakLongest)}</strong></div>
      </div>
    </div>
  `;
}

function railMarkup(state) {
  const directUnread = (state.friends || []).reduce((sum, uid) => sum + getConversationMessages(uid).filter((message) => isUnread(message)).length, 0);
  return `
    <div class="social-rail-card">
      <button class="social-switch ${activeView === "direct" ? "active" : ""}" type="button" data-social-view="direct">Direct${directUnread ? ` <span class="social-counter">${directUnread}</span>` : ""}</button>
      <button class="social-switch ${activeView === "groups" ? "active" : ""}" type="button" data-social-view="groups">Groups${state.groupInvites?.length ? ` <span class="social-counter">${state.groupInvites.length}</span>` : ""}</button>
      <button class="social-switch ${activeView === "requests" ? "active" : ""}" type="button" data-social-view="requests">Requests${state.incomingRequests?.length ? ` <span class="social-counter">${state.incomingRequests.length}</span>` : ""}</button>
      <button class="social-switch ${activeView === "blocked" ? "active" : ""}" type="button" data-social-view="blocked">Blocked</button>
    </div>
    <div class="social-quick-card">
      <h3>Quick add</h3>
      <div class="social-form-stack">
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

function listMarkup(state) {
  if (activeView === "groups") {
    const query = groupSearchValue.trim().toLowerCase();
    const groups = groupEntries(state).filter((group) => !query || String(group.name || "").toLowerCase().includes(query) || String(group.id || "").toLowerCase().includes(query));
    const selectedGroupId = cleanId(state.selectedGroupChatId);
    return `
      <div class="social-list-head"><div><h3>Group chats</h3><p>${groups.length} active</p></div><input id="social-group-search" type="text" placeholder="Search groups" value="${escapeHtml(groupSearchValue)}" /></div>
      <div id="social-list-scroll" class="social-list-scroll">
        ${groups.length ? groups.map((group) => `
          <button class="social-entry social-entry-buttononly ${group.id === selectedGroupId ? "active" : ""}" type="button" data-action="social-pick-group" data-id="${escapeHtml(group.id)}">
            <span class="social-avatar group">${escapeHtml(group.emoji || "#")}</span>
            <span class="social-entry-copy"><span class="social-entry-topline"><strong>${escapeHtml(group.name || "Group chat")}</strong><small>${escapeHtml(String((group.members || []).length || 0))} members</small></span><span class="social-entry-subline"><span>${escapeHtml(group.lastMessage || "No messages yet")}</span></span></span>
          </button>
        `).join("") : `<div class="social-empty">No group chats yet.</div>`}
        <div class="social-subsection"><h4>Invites</h4>${(state.groupInvites || []).length ? state.groupInvites.map((invite) => `
          <div class="invite-card compact">
            <div><div class="invite-title">${escapeHtml(invite.chatEmoji || "#")} ${escapeHtml(invite.chatName || "Group chat")}</div><div class="invite-sub">${escapeHtml(invite.fromName || invite.fromUid || "Invite")}</div></div>
            <div class="invite-actions"><button type="button" data-action="social-accept-group-invite" data-id="${escapeHtml(invite.id)}">Accept</button><button type="button" data-action="social-decline-group-invite" data-id="${escapeHtml(invite.id)}">Decline</button><button type="button" data-action="social-open-group-invite" data-id="${escapeHtml(invite.chatId)}">Open</button></div>
          </div>
        `).join("") : `<div class="social-empty inline">No pending invites.</div>`}</div>
      </div>
    `;
  }

  if (activeView === "requests") {
    return `
      <div class="social-list-head"><div><h3>Friend requests</h3><p>${(state.incomingRequests || []).length} incoming, ${(state.outgoingRequests || []).length} outgoing</p></div></div>
      <div id="social-list-scroll" class="social-list-scroll">
        <div class="social-subsection"><h4>Incoming</h4>${(state.incomingRequests || []).length ? state.incomingRequests.map((request) => `
          <div class="request-card request-tight">
            <div class="request-card-top"><div><div class="request-card-title">${escapeHtml(request.fromName || request.fromUid || "Friend request")}</div><div class="request-card-meta">${escapeHtml(request.fromUid || "")}</div></div><span class="profile-badge">Pending</span></div>
            <div class="request-card-note">${escapeHtml(request.body || "Friend request")}</div>
            <div class="request-card-actions"><button type="button" data-action="social-view-profile" data-uid="${escapeHtml(request.fromUid || "")}">View</button><button type="button" data-action="social-accept-request" data-id="${escapeHtml(request.id)}" data-uid="${escapeHtml(request.fromUid || "")}">Accept</button><button type="button" data-action="social-ignore-request" data-id="${escapeHtml(request.id)}">Ignore</button><button type="button" data-action="social-decline-request" data-id="${escapeHtml(request.id)}">Decline</button></div>
          </div>
        `).join("") : `<div class="social-empty inline">No incoming requests.</div>`}</div>
        <div class="social-subsection"><h4>Outgoing</h4>${(state.outgoingRequests || []).length ? state.outgoingRequests.map((request) => `
          <div class="request-card request-tight"><div class="request-card-top"><div><div class="request-card-title">${escapeHtml(request.toName || request.toUid || "Pending request")}</div><div class="request-card-meta">${escapeHtml(request.toUid || "")}</div></div><span class="profile-badge">${escapeHtml(request.status || "pending")}</span></div><div class="request-card-note">${escapeHtml(request.body || "Friend request sent.")}</div></div>
        `).join("") : `<div class="social-empty inline">No outgoing requests.</div>`}</div>
      </div>
    `;
  }

  if (activeView === "blocked") {
    const blocked = (state.blocked || []).map((uid) => state.friendProfiles?.[uid] || { uid, username: uid });
    return `
      <div class="social-list-head"><div><h3>Blocked users</h3><p>${blocked.length} blocked</p></div></div>
      <div id="social-list-scroll" class="social-list-scroll">
        ${blocked.length ? blocked.map((profile) => `<button class="social-entry social-entry-buttononly" type="button" data-action="social-view-profile" data-uid="${escapeHtml(profile.uid)}"><span class="social-avatar">${profileAvatarMarkup(profile)}</span><span class="social-entry-copy"><span class="social-entry-topline"><strong>${escapeHtml(profile.username || "Player")}</strong></span><span class="social-entry-subline"><span>${escapeHtml(profile.uid || "")}</span></span></span></button>`).join("") : `<div class="social-empty">No blocked users.</div>`}
      </div>
    `;
  }

  const query = directSearchValue.trim().toLowerCase();
  const entries = conversationEntries(state).filter((entry) => !query || String(entry.profile?.username || "").toLowerCase().includes(query) || entry.uid.toLowerCase().includes(query));
  const selectedUid = cleanId(state.selectedConversationId);
  return `
    <div class="social-list-head"><div><h3>Direct messages</h3><p>${entries.length} friend${entries.length === 1 ? "" : "s"}</p></div><input id="social-direct-search" type="text" placeholder="Search friends" value="${escapeHtml(directSearchValue)}" /></div>
    <div id="social-list-scroll" class="social-list-scroll">
      ${entries.length ? entries.map((entry) => `
        <div class="social-entry ${entry.uid === selectedUid ? "active" : ""}">
          <button class="social-entry-main" type="button" data-action="social-pick-direct" data-uid="${escapeHtml(entry.uid)}">
            <span class="social-avatar">${profileAvatarMarkup(entry.profile)}</span>
            <span class="social-entry-copy"><span class="social-entry-topline"><strong>${escapeHtml(entry.profile?.username || "Player")}</strong><small>${escapeHtml(entry.last ? formatRelativeTime(entry.last.createdAt) : "No messages yet")}</small></span><span class="social-entry-subline"><span>${escapeHtml(entry.last?.body || entry.uid)}</span>${entry.unreadCount ? `<span class="social-counter">${entry.unreadCount}</span>` : ""}</span></span>
          </button>
          <details class="social-entry-menu"><summary aria-label="Friend actions">&#8942;</summary><div class="social-entry-popover"><button type="button" data-action="social-copy-id" data-uid="${escapeHtml(entry.uid)}">Copy ID</button><button type="button" data-action="social-remove-friend" data-uid="${escapeHtml(entry.uid)}">Unfriend</button><button type="button" data-action="social-block-user" data-uid="${escapeHtml(entry.uid)}">Block</button></div></details>
        </div>
      `).join("") : `<div class="social-empty">No friends yet. Send a request from the left panel to start chatting.</div>`}
    </div>
  `;
}

function chatMarkup(state) {
  if (activeView === "groups") {
    const selectedGroupId = cleanId(state.selectedGroupChatId);
    const group = (state.groupChats || []).find((entry) => entry.id === selectedGroupId) || null;
    const messages = selectedGroupId ? sortOldestFirst(getGroupChatMessages(selectedGroupId)) : [];
    return selectedGroupId ? `
      <div class="social-chat-head"><div><h3>${escapeHtml(group?.emoji || "#")} ${escapeHtml(group?.name || "Group chat")}</h3><p>${escapeHtml(String((group?.members || []).length || 0))} members</p></div><button type="button" class="button-ghost small" data-action="social-copy-group-id" data-id="${escapeHtml(selectedGroupId)}">Copy ID</button></div>
      <div id="social-message-stream" class="social-message-stream">${messages.length ? messages.map((message) => messageBubble(message, true)).join("") : `<div class="social-empty">No group messages yet.</div>`}</div>
      <button id="jump-to-latest" type="button" class="jump-to-latest" data-action="social-jump-latest">Jump to newest</button>
      <div class="social-composer"><input id="group-message-input" type="text" placeholder="Message ${escapeHtml(group?.name || "group")}" value="${escapeHtml(groupDrafts[selectedGroupId] || "")}" /><button type="button" data-action="social-send-group" data-id="${escapeHtml(selectedGroupId)}">Send</button></div>
    ` : `<div class="social-chat-empty"><h3>Pick a group</h3><p>Your group chat will appear here.</p></div>`;
  }

  if (activeView !== "direct") {
    return `<div class="social-chat-empty"><h3>${activeView === "requests" ? "Requests live here" : "Social overview"}</h3><p>${activeView === "requests" ? "Accept, ignore, or decline requests from the list on the left." : "Open a direct chat or a group to start messaging."}</p></div>`;
  }

  const selectedUid = cleanId(state.selectedConversationId);
  const messages = selectedUid ? sortOldestFirst(getConversationMessages(selectedUid)) : [];
  return selectedUid ? `
    <div class="social-chat-head"><div><h3>${escapeHtml(friendName(selectedUid))}</h3><p>${escapeHtml(friendProfile(selectedUid)?.currentRank || "Friend")} profile</p></div><button type="button" class="button-ghost small" data-action="social-copy-id" data-uid="${escapeHtml(selectedUid)}">Copy ID</button></div>
    <div id="social-message-stream" class="social-message-stream">${messages.length ? messages.map((message) => messageBubble(message)).join("") : `<div class="social-empty">No messages yet. Say hi.</div>`}</div>
    <button id="jump-to-latest" type="button" class="jump-to-latest" data-action="social-jump-latest">Jump to newest</button>
    <div class="social-composer"><input id="direct-message-input" type="text" placeholder="Message ${escapeHtml(friendName(selectedUid))}" value="${escapeHtml(directDrafts[selectedUid] || "")}" /><button type="button" data-action="social-send-direct" data-uid="${escapeHtml(selectedUid)}">Send</button></div>
  ` : `<div class="social-chat-empty"><h3>Pick a friend</h3><p>Your direct messages will show up here.</p></div>`;
}

function detailsMarkup(state) {
  if (activeView === "groups") {
    const selectedGroupId = cleanId(state.selectedGroupChatId);
    const group = (state.groupChats || []).find((entry) => entry.id === selectedGroupId) || null;
    return `
      <div class="social-detail-card">
        <h3>Group tools</h3>
        <div class="social-form-stack"><input id="group-create-name" type="text" placeholder="New group name" /><input id="group-create-emoji" type="text" maxlength="4" placeholder="Emoji or symbol" /><input id="group-create-members" type="text" placeholder="Invite IDs (comma separated)" /><button type="button" data-action="social-create-group">Create group</button></div>
        <div class="social-form-stack"><input id="group-join-id" type="text" placeholder="Join with group ID" /><button type="button" data-action="social-join-group">Join group</button></div>
        ${group ? `<div class="social-form-stack"><input id="group-rename-input" type="text" placeholder="Rename group" value="${escapeHtml(group.name || "")}" /><input id="group-emoji-input" type="text" maxlength="4" placeholder="Emoji or symbol" value="${escapeHtml(group.emoji || "#")}" /><button type="button" data-action="social-save-group" data-id="${escapeHtml(selectedGroupId)}">Save group info</button></div><div class="social-form-stack"><input id="group-add-member-input" type="text" placeholder="Invite member by ID" /><button type="button" data-action="social-invite-group-member" data-id="${escapeHtml(selectedGroupId)}">Invite member</button></div><div class="button-row split"><button type="button" data-action="social-leave-group" data-id="${escapeHtml(selectedGroupId)}">Leave</button><button type="button" class="danger" data-action="social-delete-group" data-id="${escapeHtml(selectedGroupId)}">Delete</button></div>` : `<div class="social-empty inline">Select a group to edit it.</div>`}
      </div>
    `;
  }

  if (activeView === "requests" || activeView === "blocked") {
    return `<div class="social-detail-card"><h3>Profile details</h3>${profileFacts(state.selectedProfile)}</div>`;
  }

  const selectedUid = cleanId(state.selectedConversationId);
  const profile = selectedUid ? (state.friendProfiles?.[selectedUid] || state.selectedProfile) : null;
  return `<div class="social-detail-card"><h3>Friend profile</h3>${profileFacts(profile)}${selectedUid ? `<div class="button-row split" style="margin-top:14px;"><button type="button" data-action="social-copy-id" data-uid="${escapeHtml(selectedUid)}">Copy ID</button><button type="button" data-action="social-remove-friend" data-uid="${escapeHtml(selectedUid)}">Unfriend</button><button type="button" class="danger" data-action="social-block-user" data-uid="${escapeHtml(selectedUid)}">Block</button></div>` : ""}</div>`;
}

function render(state) {
  const root = $("messages-root");
  if (!root) return;
  const uiState = captureUiState();

  if (!state.user) {
    root.innerHTML = `<div class="msg-empty">Log in to open your friends, direct chats, groups, and requests.</div>`;
    lastThreadKey = "";
    return;
  }

  if (activeView === "direct") {
    const entries = conversationEntries(state);
    const nextUid = entries.some((entry) => entry.uid === cleanId(state.selectedConversationId)) ? cleanId(state.selectedConversationId) : (entries[0]?.uid || null);
    if (nextUid !== cleanId(state.selectedConversationId)) {
      setSelectedConversation(nextUid);
    }
  }

  if (activeView === "groups") {
    const groups = groupEntries(state);
    const nextGroupId = groups.some((entry) => entry.id === cleanId(state.selectedGroupChatId)) ? cleanId(state.selectedGroupChatId) : (groups[0]?.id || null);
    if (nextGroupId !== cleanId(state.selectedGroupChatId)) {
      setSelectedGroupChatId(nextGroupId);
    }
  }

  root.innerHTML = `<div class="social-layout"><aside class="social-rail">${railMarkup(state)}</aside><section class="social-panel social-panel-list">${listMarkup(state)}</section><section class="social-panel social-panel-chat">${chatMarkup(state)}</section><aside class="social-panel social-panel-detail">${detailsMarkup(state)}</aside></div>`;

  const currentThreadKey = activeThreadKey(socialState);
  restoreUiState(uiState, { forceBottom: pendingForceBottomKey === currentThreadKey || currentThreadKey !== lastThreadKey });
  lastThreadKey = currentThreadKey;
  pendingForceBottomKey = "";

  if (activeView === "direct" && cleanId(socialState.selectedConversationId)) {
    markConversationRead(socialState.selectedConversationId);
  }

  $("social-message-stream")?.addEventListener("scroll", updateJumpButton);
  updateJumpButton();
}

function updateJumpButton() {
  const stream = $("social-message-stream");
  const button = $("jump-to-latest");
  if (!stream || !button) return;
  const offsetFromBottom = Math.max(0, stream.scrollHeight - stream.clientHeight - stream.scrollTop);
  button.classList.toggle("visible", offsetFromBottom > 120);
}

function openMessagesView(sub = "direct", targetId = null) {
  const next = String(sub || "direct").trim().toLowerCase();
  activeView = new Set(["direct", "groups", "requests", "blocked", "chat"]).has(next) ? (next === "chat" ? "direct" : next) : "direct";
  if (activeView === "direct" && targetId) {
    setSelectedConversation(targetId);
    viewProfileById(targetId).catch((error) => console.error(error));
    pendingForceBottomKey = `direct:${cleanId(targetId)}`;
  }
  if (activeView === "groups" && targetId) {
    setSelectedGroupChatId(targetId);
    pendingForceBottomKey = `group:${cleanId(targetId)}`;
  }
  if ((activeView === "requests" || activeView === "blocked") && targetId) {
    viewProfileById(targetId).catch((error) => console.error(error));
  }
  render(socialState);
}

function bindRoot(root) {
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".social-entry-menu")) {
      root.querySelectorAll(".social-entry-menu[open]").forEach((menu) => menu.removeAttribute("open"));
    }
  });

  root.addEventListener("input", (event) => {
    if (event.target?.id === "social-direct-search") {
      directSearchValue = event.target.value;
      render(socialState);
    }
    if (event.target?.id === "social-group-search") {
      groupSearchValue = event.target.value;
      render(socialState);
    }
    if (event.target?.id === "direct-message-input") {
      const uid = cleanId(socialState.selectedConversationId);
      if (uid) directDrafts[uid] = event.target.value;
    }
    if (event.target?.id === "group-message-input") {
      const groupId = cleanId(socialState.selectedGroupChatId);
      if (groupId) groupDrafts[groupId] = event.target.value;
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
        pendingForceBottomKey = `direct:${uid}`;
        render(socialState);
      }
      if (event.target?.id === "group-message-input" && event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        const groupId = cleanId(socialState.selectedGroupChatId);
        const body = groupDrafts[groupId] || event.target.value || "";
        if (!groupId || !body.trim()) return;
        await sendGroupMessage(groupId, body);
        groupDrafts[groupId] = "";
        pendingForceBottomKey = `group:${groupId}`;
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
    const uid = button.dataset.uid || "";
    const id = button.dataset.id || "";

    try {
      if (button.dataset.socialView) {
        activeView = button.dataset.socialView;
        render(socialState);
        return;
      }
      if (action === "social-pick-direct") {
        setSelectedConversation(uid);
        viewProfileById(uid).catch((error) => console.error(error));
        pendingForceBottomKey = `direct:${cleanId(uid)}`;
      } else if (action === "social-pick-group") {
        setSelectedGroupChatId(id);
        pendingForceBottomKey = `group:${cleanId(id)}`;
      } else if (action === "social-send-request") {
        await sendFriendRequestById($("quick-friend-id")?.value || "", $("quick-friend-note")?.value || "");
        if ($("quick-friend-id")) $("quick-friend-id").value = "";
        if ($("quick-friend-note")) $("quick-friend-note").value = "";
        activeView = "requests";
      } else if (action === "social-quick-block") {
        await blockUser($("quick-friend-id")?.value || "");
        if ($("quick-friend-id")) $("quick-friend-id").value = "";
        if ($("quick-friend-note")) $("quick-friend-note").value = "";
        activeView = "blocked";
      } else if (action === "social-copy-id") {
        await copyText(uid);
        return;
      } else if (action === "social-remove-friend") {
        await removeFriend(uid);
      } else if (action === "social-block-user") {
        await blockUser(uid);
      } else if (action === "social-view-profile") {
        await viewProfileById(uid);
      } else if (action === "social-accept-request") {
        await respondToFriendRequest(id, "accept");
        if (uid) {
          setSelectedConversation(uid);
          await viewProfileById(uid);
          activeView = "direct";
          pendingForceBottomKey = `direct:${cleanId(uid)}`;
        }
      } else if (action === "social-ignore-request") {
        await respondToFriendRequest(id, "ignore");
      } else if (action === "social-decline-request") {
        await respondToFriendRequest(id, "decline");
      } else if (action === "social-send-direct") {
        await sendChatMessage(uid, directDrafts[uid] || $("direct-message-input")?.value || "");
        directDrafts[uid] = "";
        pendingForceBottomKey = `direct:${cleanId(uid)}`;
      } else if (action === "social-send-group") {
        await sendGroupMessage(id, groupDrafts[id] || $("group-message-input")?.value || "");
        groupDrafts[id] = "";
        pendingForceBottomKey = `group:${cleanId(id)}`;
      } else if (action === "social-create-group") {
        const groupId = await createGroupChat($("group-create-name")?.value || "", $("group-create-emoji")?.value || "#", String($("group-create-members")?.value || "").split(",").map((value) => value.trim()).filter(Boolean));
        activeView = "groups";
        setSelectedGroupChatId(groupId);
        pendingForceBottomKey = `group:${cleanId(groupId)}`;
      } else if (action === "social-join-group") {
        const groupId = $("group-join-id")?.value || "";
        await joinGroupChatById(groupId);
        activeView = "groups";
        setSelectedGroupChatId(groupId);
        pendingForceBottomKey = `group:${cleanId(groupId)}`;
      } else if (action === "social-save-group") {
        await updateGroupChatInfo(id, { name: $("group-rename-input")?.value || "", emoji: $("group-emoji-input")?.value || "" });
      } else if (action === "social-invite-group-member") {
        await addMembersToGroupChat(id, [$("group-add-member-input")?.value || ""]);
        if ($("group-add-member-input")) $("group-add-member-input").value = "";
      } else if (action === "social-copy-group-id") {
        await copyText(id);
        return;
      } else if (action === "social-leave-group") {
        await leaveGroupChat(id);
      } else if (action === "social-delete-group") {
        await deleteGroupChat(id);
      } else if (action === "social-accept-group-invite") {
        await respondToGroupInvite(id, "accept");
        activeView = "groups";
      } else if (action === "social-decline-group-invite") {
        await respondToGroupInvite(id, "decline");
      } else if (action === "social-open-group-invite") {
        activeView = "groups";
        setSelectedGroupChatId(id);
        pendingForceBottomKey = `group:${cleanId(id)}`;
      } else if (action === "social-jump-latest") {
        const stream = $("social-message-stream");
        if (stream) stream.scrollTop = Math.max(0, stream.scrollHeight - stream.clientHeight);
        updateJumpButton();
        return;
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
