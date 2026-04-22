import {
  socialState,
  subscribeSocial,
  setSelectedConversation,
  setSelectedGroupChatId,
  markMessageRead,
  setMessagesReadState,
  deleteMessageForCurrentUser,
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
  getGroupChatMessages
} from "./social.js";

const $ = (id) => document.getElementById(id);

let activeReadFilter = "unread";
let activeTypeFilter = "system";
let chatMode = "direct";

let directSearchValue = "";
let groupSearchValue = "";

const directDrafts = {};
const groupDrafts = {};

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
  return 0;
}

function formatTimestamp(value) {
  const ms = toMs(value);
  if (!ms) return "";

  try {
    return new Date(ms).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}

function isIncoming(msg) {
  const currentUid = socialState.user?.uid;
  return !!currentUid && cleanId(msg?.toUid) === currentUid;
}

function isUnread(msg) {
  const currentUid = socialState.user?.uid;
  if (!currentUid || !isIncoming(msg)) return false;
  return !unique(msg.readBy).includes(currentUid);
}

function isPendingFriendRequest(msg) {
  return msg?.kind === "friend-request" && (msg.status || "pending") === "pending";
}

function friendName(uid) {
  return socialState.friendProfiles?.[uid]?.username || uid || "Player";
}

function groupName(chatId) {
  const chat = (socialState.groupChats || []).find((item) => item.id === chatId);
  return chat?.name || "Group chat";
}

function directConversationTarget(msg) {
  const currentUid = socialState.user?.uid;
  if (!msg || !currentUid) return msg?.targetId || msg?.conversationUid || msg?.fromUid || null;
  if (msg.fromUid === currentUid) return msg.toUid || msg.targetId || msg.conversationUid || null;
  return msg.fromUid || msg.targetId || msg.conversationUid || null;
}

function resolveMessageTarget(msg) {
  if (!msg) return { section: "messages", sub: "system", targetId: null };

  if (msg.kind === "achievement") {
    return { section: "progress", sub: "progress", targetId: msg.targetId || msg.achievementId || null };
  }

  if (msg.kind === "streak") {
    return { section: "streak", sub: "overview", targetId: null };
  }

  if (msg.kind === "friend-request") {
    return { section: "info", sub: "requests", targetId: msg.fromUid || msg.targetId || null };
  }

  if (msg.kind === "chat") {
    return { section: "messages", sub: "chat", targetId: directConversationTarget(msg) };
  }

  if (msg.kind === "group-invite") {
    return { section: "messages", sub: "groups", targetId: msg.groupChatId || msg.targetId || null };
  }

  return {
    section: msg.targetSection || "messages",
    sub: msg.targetSubSection || "system",
    targetId: msg.targetId || directConversationTarget(msg) || null
  };
}

async function showTarget(msg) {
  const target = resolveMessageTarget(msg);

  if (msg?.id && isIncoming(msg) && isUnread(msg)) {
    try {
      await markMessageRead(msg.id, true);
    } catch (error) {
      console.error(error);
    }
  }

  if (target.section === "streak") {
    window.location.href = "streak-page.html";
    return;
  }

  if (typeof window.openAccountArea === "function") {
    window.openAccountArea(target.section, target.sub, target.targetId);
  }

  if (target.section === "progress" && target.targetId) {
    setTimeout(() => {
      document.getElementById(`achievement-card-${target.targetId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }, 180);
  }
}

function matchesReadFilter(msg) {
  if (activeReadFilter === "unread") {
    return isUnread(msg);
  }

  if (isIncoming(msg)) {
    return !isUnread(msg);
  }

  return true;
}

function systemMessages(state) {
  return (state.messages || []).filter((message) => message.kind !== "chat");
}

function directChatMessages(state) {
  return (state.messages || []).filter((message) => message.kind === "chat");
}

function visibleInboxMessages(state) {
  const source = activeTypeFilter === "chat" ? directChatMessages(state) : systemMessages(state);
  return source.filter(matchesReadFilter);
}

function hasUnreadChatFrom(uid) {
  const targetUid = cleanId(uid);
  if (!targetUid) return false;
  return getConversationMessages(targetUid).some((message) => isUnread(message));
}

function openMessagesView(sub = "system", targetId = null) {
  if (!socialState.user) {
    activeReadFilter = "unread";
    activeTypeFilter = "system";
    render(socialState);
    return;
  }

  if (sub === "chat") {
    activeTypeFilter = "chat";
    chatMode = "direct";
    if (targetId) {
      setSelectedConversation(targetId);
      activeReadFilter = hasUnreadChatFrom(targetId) ? "unread" : "read";
    }
  } else if (sub === "groups") {
    activeTypeFilter = "chat";
    chatMode = "groups";
    if (targetId) setSelectedGroupChatId(targetId);
  } else {
    activeTypeFilter = "system";
    activeReadFilter = "unread";
  }

  render(socialState);
}

function messageIcon(msg) {
  if (msg.kind === "chat") return "DM";
  if (msg.kind === "group-invite") return "GR";
  if (isUnread(msg)) return "NEW";
  return "SYS";
}

function messageKindLabel(msg) {
  return msg.kind === "chat" ? "Chat" : "System";
}

function messageMeta(msg) {
  const pieces = [];
  const sender = msg.kind === "chat"
    ? (msg.fromUid === socialState.user?.uid ? `You to ${friendName(msg.toUid)}` : friendName(msg.fromUid))
    : (msg.fromName || msg.kind || "");
  const time = formatTimestamp(msg.createdAt);

  if (sender) pieces.push(sender);
  if (time) pieces.push(time);
  return pieces.join(" - ");
}

function requestButtons(msg) {
  if (!(msg.kind === "friend-request" && isIncoming(msg) && isPendingFriendRequest(msg))) {
    return "";
  }

  return `
    <button type="button" data-action="accept-friend-request" data-id="${escapeHtml(msg.id)}" data-uid="${escapeHtml(msg.fromUid || "")}">Accept</button>
    <button type="button" data-action="ignore-friend-request" data-id="${escapeHtml(msg.id)}" data-uid="${escapeHtml(msg.fromUid || "")}">Ignore</button>
    <button type="button" data-action="decline-friend-request" data-id="${escapeHtml(msg.id)}" data-uid="${escapeHtml(msg.fromUid || "")}">Decline</button>
  `;
}

function messageMenu(msg) {
  const canToggleRead = isIncoming(msg);
  const showDelete = !isPendingFriendRequest(msg);

  if (!canToggleRead && !showDelete) return "";

  return `
    <details class="message-entry-menu">
      <summary aria-label="Message actions">&#8942;</summary>
      <div class="friend-entry-popover message-entry-popover">
        ${canToggleRead ? `<button type="button" data-action="${isUnread(msg) ? "mark-read" : "mark-unread"}" data-id="${escapeHtml(msg.id)}">${isUnread(msg) ? "Mark read" : "Mark unread"}</button>` : ""}
        ${showDelete ? `<button type="button" data-action="delete-message" data-id="${escapeHtml(msg.id)}">Delete</button>` : ""}
      </div>
    </details>
  `;
}

function messageCard(msg, { showOpen = true } = {}) {
  const unread = isUnread(msg);
  const target = resolveMessageTarget(msg);

  return `
    <div class="msg-card ${unread ? "unread" : "read"}" data-msg-id="${escapeHtml(msg.id)}" data-kind="${escapeHtml(msg.kind || "system")}" data-target-id="${escapeHtml(target.targetId || "")}" data-target-section="${escapeHtml(target.section)}" data-target-sub="${escapeHtml(target.sub)}">
      <div class="msg-avatar">${escapeHtml(messageIcon(msg))}</div>
      <div class="msg-body">
        <div class="msg-top">
          <div class="msg-title-row">
            <div class="msg-title">${escapeHtml(msg.title || msg.kind || "Message")}</div>
            <span class="msg-state-pill ${unread ? "unread" : "read"}">${unread ? "Unread" : "Read"}</span>
          </div>
          <div class="msg-meta">${escapeHtml(messageMeta(msg))}</div>
        </div>
        <div class="msg-text">${escapeHtml(msg.body || "")}</div>
        <div class="msg-kind-line">${escapeHtml(messageKindLabel(msg))}</div>
      </div>
      <div class="msg-actions">
        ${showOpen ? `<button type="button" data-action="open-target" data-id="${escapeHtml(msg.id)}">Open</button>` : ""}
        ${requestButtons(msg)}
        ${messageMenu(msg)}
      </div>
    </div>
  `;
}

function groupMessageCard(msg) {
  return `
    <div class="msg-card read group-msg-card">
      <div class="msg-avatar">GR</div>
      <div class="msg-body">
        <div class="msg-top">
          <div class="msg-title-row">
            <div class="msg-title">${escapeHtml(msg.fromName || "Group member")}</div>
          </div>
          <div class="msg-meta">${escapeHtml(formatTimestamp(msg.createdAt))}</div>
        </div>
        <div class="msg-text">${escapeHtml(msg.body || "")}</div>
        <div class="msg-kind-line">Group</div>
      </div>
    </div>
  `;
}

function summaryCopy(messages) {
  const typeLabel = activeTypeFilter === "chat" ? "chat" : "system";
  const readLabel = activeReadFilter === "unread" ? "unread" : "read";
  return `${messages.length} ${readLabel} ${typeLabel} message${messages.length === 1 ? "" : "s"}`;
}

function renderSystem(state) {
  const list = $("system-message-list");
  const summary = $("messages-view-summary");
  if (!list) return;

  const messages = visibleInboxMessages(state);

  if (summary) summary.textContent = summaryCopy(messages);

  list.innerHTML = messages.length
    ? messages.map((message) => messageCard(message, { showOpen: true })).join("")
    : `<div class="msg-empty">No ${activeReadFilter} system messages right now.</div>`;
}

function directFriendEntries(state) {
  return (state.friends || [])
    .map((uid) => {
      const allMessages = getConversationMessages(uid);
      return {
        uid,
        name: friendName(uid),
        allMessages,
        visibleMessages: allMessages.filter(matchesReadFilter),
        unreadCount: allMessages.filter((message) => isUnread(message)).length,
        lastMessageAt: Math.max(0, ...allMessages.map((message) => toMs(message.createdAt)))
      };
    })
    .sort((a, b) => {
      if (b.lastMessageAt !== a.lastMessageAt) return b.lastMessageAt - a.lastMessageAt;
      return a.name.localeCompare(b.name);
    });
}

function renderChat(state) {
  const summary = $("messages-view-summary");
  const friendList = $("messages-friend-list");
  const conversation = $("messages-conversation");
  const targetLabel = $("direct-composer-target");
  const directInput = $("direct-message-input");

  const filteredFriends = directFriendEntries(state).filter((friend) => {
    if (!directSearchValue) return true;
    const query = directSearchValue.toLowerCase();
    return friend.name.toLowerCase().includes(query) || friend.uid.toLowerCase().includes(query);
  });

  let selectedUid = cleanId(state.selectedConversationId);
  if (!filteredFriends.some((friend) => friend.uid === selectedUid)) {
    selectedUid = filteredFriends.find((friend) => friend.visibleMessages.length)?.uid || filteredFriends[0]?.uid || null;
    if (selectedUid && selectedUid !== state.selectedConversationId) {
      setSelectedConversation(selectedUid);
    }
  }

  const selectedFriend = filteredFriends.find((friend) => friend.uid === selectedUid) || null;
  const visibleConversation = selectedFriend?.visibleMessages || [];

  if (summary) {
    const totalVisibleChats = visibleInboxMessages(state);
    summary.textContent = summaryCopy(totalVisibleChats);
  }

  if (friendList) {
    friendList.innerHTML = filteredFriends.length
      ? filteredFriends.map((friend) => `
        <button class="friend-pill ${friend.uid === selectedUid ? "active" : ""}" type="button" data-action="pick-friend" data-uid="${escapeHtml(friend.uid)}">
          <span>${escapeHtml(friend.name)}</span>
          <small>
            ${escapeHtml(friend.uid)}
            ${friend.unreadCount ? `<span class="pill-counter">${escapeHtml(String(friend.unreadCount))}</span>` : ""}
          </small>
        </button>
      `).join("")
      : `<div class="msg-empty">No matching friends.</div>`;
  }

  if (targetLabel) {
    targetLabel.textContent = selectedUid
      ? `${activeReadFilter === "unread" ? "Unread" : "Read"} chat with ${friendName(selectedUid)}`
      : "Pick a friend to start chatting";
  }

  if (conversation) {
    conversation.innerHTML = selectedUid
      ? (visibleConversation.length
        ? visibleConversation.map((message) => messageCard(message, { showOpen: false })).join("")
        : `<div class="msg-empty">No ${activeReadFilter} chat messages with ${escapeHtml(friendName(selectedUid))}.</div>`)
      : `<div class="msg-empty">Pick a friend to open your chat.</div>`;
  }

  $("messages-send-btn")?.setAttribute("data-target-uid", selectedUid || "");
  if (directInput) {
    directInput.value = selectedUid ? (directDrafts[selectedUid] || "") : "";
  }

  const chats = (state.groupChats || []).filter((chat) => {
    if (!groupSearchValue) return true;
    const query = groupSearchValue.toLowerCase();
    return String(chat.name || "").toLowerCase().includes(query) || String(chat.id || "").toLowerCase().includes(query);
  });

  let selectedGroup = cleanId(state.selectedGroupChatId);
  if (!chats.some((chat) => chat.id === selectedGroup)) {
    selectedGroup = chats[0]?.id || null;
    if (selectedGroup && selectedGroup !== state.selectedGroupChatId) {
      setSelectedGroupChatId(selectedGroup);
    }
  }

  const list = $("groups-list");
  const view = $("groups-view");

  if (list) {
    list.innerHTML = chats.length
      ? chats.map((chat) => `
        <button class="group-pill ${chat.id === selectedGroup ? "active" : ""}" type="button" data-action="pick-group" data-id="${escapeHtml(chat.id)}">
          <span>${escapeHtml(chat.emoji || "#")} ${escapeHtml(chat.name || "Group chat")}</span>
          <small>${escapeHtml(String((chat.members || []).length))} members</small>
        </button>
      `).join("")
      : `<div class="msg-empty">No group chats yet.</div>`;
  }

  if (view) {
    const messages = selectedGroup ? getGroupChatMessages(selectedGroup) : [];
    const current = chats.find((chat) => chat.id === selectedGroup) || null;

    view.innerHTML = selectedGroup ? `
      <div class="group-header">
        <div>
          <div class="group-name">${escapeHtml(current?.emoji || "#")} ${escapeHtml(current?.name || "Group chat")}</div>
          <div class="group-meta">${escapeHtml(String((current?.members || []).length || 0))} members</div>
        </div>
        <div class="group-actions-inline">
          <button type="button" data-action="copy-group-id" data-id="${escapeHtml(selectedGroup)}">Copy ID</button>
          <button type="button" data-action="leave-group" data-id="${escapeHtml(selectedGroup)}">Leave</button>
          <button type="button" data-action="delete-group" data-id="${escapeHtml(selectedGroup)}">Delete</button>
        </div>
      </div>

      <div class="group-manager">
        <div class="group-edit-grid">
          <input id="group-rename-input" type="text" placeholder="Rename group" value="${escapeHtml(current?.name || "")}" />
          <input id="group-emoji-input" type="text" placeholder="Group emoji" value="${escapeHtml(current?.emoji || "#")}" />
          <button type="button" id="group-save-btn" data-group-id="${escapeHtml(selectedGroup)}">Save group info</button>
        </div>

        <div class="group-edit-grid" style="margin-top:12px;">
          <input id="group-add-member-input" type="text" placeholder="Add member by ID" />
          <button type="button" id="group-add-member-btn" data-group-id="${escapeHtml(selectedGroup)}">Invite member</button>
        </div>
      </div>

      <div class="message-stream" style="margin-top:12px;">
        ${messages.length ? messages.map(groupMessageCard).join("") : `<div class="msg-empty">No messages in this group yet.</div>`}
      </div>

      <div class="composer-row" style="margin-top:12px;">
        <input id="group-message-input" type="text" placeholder="Write a group message..." />
        <button id="send-group-message-btn" type="button" data-group-id="${escapeHtml(selectedGroup)}">Send</button>
      </div>
    ` : `<div class="msg-empty">Pick a group chat.</div>`;

    const groupInput = $("group-message-input");
    if (groupInput) {
      groupInput.value = selectedGroup ? (groupDrafts[selectedGroup] || "") : "";
    }
  }

  const invites = $("groups-invite-list");
  if (invites) {
    invites.innerHTML = (state.groupInvites || []).length
      ? state.groupInvites.map((invite) => `
        <div class="invite-card">
          <div>
            <div class="invite-title">${escapeHtml(invite.chatEmoji || "#")} ${escapeHtml(invite.chatName || "Group invite")}</div>
            <div class="invite-sub">${escapeHtml(invite.fromName || invite.fromUid || "")}</div>
          </div>
          <div class="invite-actions">
            <button type="button" data-action="accept-group-invite" data-id="${escapeHtml(invite.id)}">Accept</button>
            <button type="button" data-action="decline-group-invite" data-id="${escapeHtml(invite.id)}">Decline</button>
            <button type="button" data-action="open-group-invite" data-id="${escapeHtml(invite.chatId)}">Open group</button>
          </div>
        </div>
      `).join("")
      : `<div class="msg-empty">No group invites.</div>`;
  }
}

function render(state) {
  const root = $("messages-root");
  if (!root) return;

  if (!state.user) {
    root.innerHTML = `
      <div class="msg-empty">
        Log in to open your inbox, direct chats, and group messages.
      </div>
    `;
    return;
  }

  root.innerHTML = `
    <div class="messages-wrap">
      <div class="messages-head">
        <div>
          <h2>Messages</h2>
          <p>${state.unreadCount || 0} unread across your inbox</p>
        </div>
        <div class="messages-toolbar">
          <div class="filter-group" aria-label="Read filter">
            <button class="tab-chip ${activeReadFilter === "unread" ? "active" : ""}" type="button" data-filter-read="unread">Unread</button>
            <button class="tab-chip ${activeReadFilter === "read" ? "active" : ""}" type="button" data-filter-read="read">Read</button>
          </div>
          <div class="filter-group" aria-label="Type filter">
            <button class="tab-chip ${activeTypeFilter === "system" ? "active" : ""}" type="button" data-filter-type="system">System</button>
            <button class="tab-chip ${activeTypeFilter === "chat" ? "active" : ""}" type="button" data-filter-type="chat">Chat</button>
          </div>
          <button type="button" id="msg-read-all">Read all</button>
          <button type="button" id="msg-unread-all">Unread all</button>
        </div>
      </div>

      <div class="messages-summary" id="messages-view-summary"></div>

      <div class="messages-panel ${activeTypeFilter === "system" ? "active" : ""}" data-panel="system">
        <div class="system-panel">
          <div id="system-message-list" class="message-stream"></div>
        </div>
      </div>

      <div class="messages-panel ${activeTypeFilter === "chat" ? "active" : ""}" data-panel="chat">
        <div class="messages-tabs">
          <button class="tab-chip ${chatMode === "direct" ? "active" : ""}" type="button" data-chatmode="direct">Direct</button>
          <button class="tab-chip ${chatMode === "groups" ? "active" : ""}" type="button" data-chatmode="groups">Groups</button>
        </div>

        <div class="discord-layout" style="${chatMode === "direct" ? "" : "display:none;"}">
          <aside class="discord-side">
            <input id="messages-friend-search" type="text" placeholder="Search friends" value="${escapeHtml(directSearchValue)}" />
            <div id="messages-friend-list" class="stack"></div>
          </aside>

          <main class="discord-main">
            <div class="channel-bar">
              <div id="direct-composer-target">Pick a friend to start chatting</div>
            </div>
            <div id="messages-conversation" class="message-stream"></div>
            <div class="composer-row">
              <input id="direct-message-input" type="text" placeholder="Message your friend..." />
              <button id="messages-send-btn" type="button">Send</button>
            </div>
          </main>
        </div>

        <div class="discord-layout" style="${chatMode === "groups" ? "margin-top:14px;" : "display:none; margin-top:14px;"}">
          <aside class="discord-side">
            <div class="side-block">
              <div class="side-title">Your groups</div>
              <input id="groups-search" type="text" placeholder="Search groups" value="${escapeHtml(groupSearchValue)}" />
              <div id="groups-list" class="stack"></div>
            </div>

            <div class="side-block">
              <div class="side-title">Create group</div>
              <input id="new-group-name" type="text" placeholder="Group name" />
              <input id="new-group-emoji" type="text" placeholder="Emoji" value="#" />
              <input id="new-group-members" type="text" placeholder="Member IDs, comma separated" />
              <button id="create-group-btn" type="button">Create</button>
            </div>

            <div class="side-block">
              <div class="side-title">Join existing chat</div>
              <input id="join-group-input" type="text" placeholder="Chat ID" />
              <button id="join-group-btn" type="button">Join chat</button>
            </div>
          </aside>

          <main class="discord-main">
            <div id="groups-view" class="message-stream"></div>
          </main>
        </div>

        <div class="card" style="margin-top:14px;">
          <h3>Group invites</h3>
          <div id="groups-invite-list"></div>
        </div>
      </div>
    </div>
  `;

  renderSystem(state);
  renderChat(state);
}

async function sendDirectMessageFromComposer(input) {
  const target = cleanId(socialState.selectedConversationId);
  const body = String(input?.value || "").trim();
  if (!target || !body) return;

  await sendChatMessage(target, body);
  directDrafts[target] = "";
  if (input) input.value = "";
}

async function sendGroupMessageFromComposer(input, chatId = socialState.selectedGroupChatId) {
  const targetChatId = cleanId(chatId);
  const body = String(input?.value || "").trim();
  if (!targetChatId || !body) return;

  await sendGroupMessage(targetChatId, body);
  groupDrafts[targetChatId] = "";
  if (input) input.value = "";
}

function bind(root) {
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".message-entry-menu")) {
      root.querySelectorAll(".message-entry-menu[open]").forEach((menu) => menu.removeAttribute("open"));
    }
  });

  root.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action], [data-chatmode], [data-filter-read], [data-filter-type]");
    if (!button) return;

    const action = button.dataset.action;
    const uid = button.dataset.uid || "";
    const id = button.dataset.id || "";

    try {
      if (button.dataset.filterRead) {
        activeReadFilter = button.dataset.filterRead === "read" ? "read" : "unread";
        render(socialState);
        return;
      }

      if (button.dataset.filterType) {
        activeTypeFilter = button.dataset.filterType === "chat" ? "chat" : "system";
        render(socialState);
        return;
      }

      if (button.dataset.chatmode) {
        chatMode = button.dataset.chatmode === "groups" ? "groups" : "direct";
        render(socialState);
        return;
      }

      if (action === "pick-friend") {
        setSelectedConversation(uid);
        render(socialState);
        return;
      }

      if (action === "pick-group") {
        setSelectedGroupChatId(id);
        render(socialState);
        return;
      }

      if (action === "copy-group-id") {
        await navigator.clipboard.writeText(id || "");
        button.textContent = "Copied";
        setTimeout(() => {
          if (button.isConnected) button.textContent = "Copy ID";
        }, 900);
        return;
      }

      if (action === "open-target") {
        const message = (socialState.messages || []).find((item) => item.id === id);
        if (message) {
          await showTarget(message);
        }
        return;
      }

      if (action === "mark-read") {
        await markMessageRead(id, true);
        return;
      }

      if (action === "mark-unread") {
        await markMessageRead(id, false);
        return;
      }

      if (action === "delete-message") {
        await deleteMessageForCurrentUser(id);
        return;
      }

      if (action === "accept-friend-request") {
        await respondToFriendRequest(id, "accept");
        if (typeof window.openAccountArea === "function") {
          window.openAccountArea("info", "friends", uid);
        }
        return;
      }

      if (action === "ignore-friend-request") {
        await respondToFriendRequest(id, "ignore");
        return;
      }

      if (action === "decline-friend-request") {
        await respondToFriendRequest(id, "decline");
        return;
      }

      if (action === "accept-group-invite") {
        await respondToGroupInvite(id, "accept");
        return;
      }

      if (action === "decline-group-invite") {
        await respondToGroupInvite(id, "decline");
        return;
      }

      if (action === "open-group-invite") {
        openMessagesView("groups", id);
        return;
      }

      if (action === "leave-group") {
        await leaveGroupChat(id);
        return;
      }

      if (action === "delete-group") {
        await deleteGroupChat(id);
        return;
      }
    } catch (error) {
      alert(error.message || "Action failed.");
    }
  });

  root.addEventListener("click", async (event) => {
    const button = event.target.closest("#msg-read-all, #msg-unread-all, #messages-send-btn, #send-group-message-btn, #create-group-btn, #group-save-btn, #group-add-member-btn, #join-group-btn");
    if (!button) return;

    try {
      if (button.id === "msg-read-all" || button.id === "msg-unread-all") {
        const targetIds = visibleInboxMessages(socialState)
          .filter((message) => isIncoming(message))
          .map((message) => message.id);
        await setMessagesReadState(targetIds, button.id === "msg-read-all");
      }

      if (button.id === "messages-send-btn") {
        await sendDirectMessageFromComposer($("direct-message-input"));
      }

      if (button.id === "send-group-message-btn") {
        await sendGroupMessageFromComposer($("group-message-input"), button.dataset.groupId || socialState.selectedGroupChatId);
      }

      if (button.id === "create-group-btn") {
        const name = $("new-group-name")?.value || "";
        const emoji = $("new-group-emoji")?.value || "#";
        const members = String($("new-group-members")?.value || "").split(",").map((value) => value.trim()).filter(Boolean);
        const chatId = await createGroupChat(name, emoji, members);
        setSelectedGroupChatId(chatId);
        activeTypeFilter = "chat";
        chatMode = "groups";
        render(socialState);
      }

      if (button.id === "group-save-btn") {
        const chatId = button.dataset.groupId || socialState.selectedGroupChatId;
        await updateGroupChatInfo(chatId, {
          name: $("group-rename-input")?.value || "",
          emoji: $("group-emoji-input")?.value || "#"
        });
      }

      if (button.id === "group-add-member-btn") {
        const chatId = button.dataset.groupId || socialState.selectedGroupChatId;
        const uid = $("group-add-member-input")?.value || "";
        if (chatId && uid) await addMembersToGroupChat(chatId, [uid]);
        if ($("group-add-member-input")) $("group-add-member-input").value = "";
      }

      if (button.id === "join-group-btn") {
        const chatId = $("join-group-input")?.value || "";
        await joinGroupChatById(chatId);
        if ($("join-group-input")) $("join-group-input").value = "";
      }
    } catch (error) {
      alert(error.message || "Action failed.");
    }
  });

  root.addEventListener("keydown", async (event) => {
    if (event.target?.id === "direct-message-input" && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      try {
        await sendDirectMessageFromComposer(event.target);
      } catch (error) {
        alert(error.message || "Could not send message.");
      }
    }

    if (event.target?.id === "group-message-input" && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      try {
        await sendGroupMessageFromComposer(event.target, socialState.selectedGroupChatId);
      } catch (error) {
        alert(error.message || "Could not send message.");
      }
    }
  });

  root.addEventListener("input", (event) => {
    if (event.target?.id === "messages-friend-search") {
      directSearchValue = event.target.value;
      render(socialState);
      return;
    }

    if (event.target?.id === "groups-search") {
      groupSearchValue = event.target.value;
      render(socialState);
      return;
    }

    if (event.target?.id === "direct-message-input") {
      const target = cleanId(socialState.selectedConversationId);
      if (target) directDrafts[target] = event.target.value;
      return;
    }

    if (event.target?.id === "group-message-input") {
      const chatId = cleanId(socialState.selectedGroupChatId);
      if (chatId) groupDrafts[chatId] = event.target.value;
    }
  });
}

function start() {
  const root = $("messages-root");
  if (!root) return;
  render(socialState);
  bind(root);
  subscribeSocial(render);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}

window.PanategwaMessagesRender = () => render(socialState);
window.PanategwaMessagesOpen = openMessagesView;

export { render, resolveMessageTarget, openMessagesView };
