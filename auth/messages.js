import {
  socialState,
  subscribeSocial,
  setSelectedConversation,
  setSelectedGroupChatId,
  markMessageRead,
  markAllMessagesRead,
  markAllMessagesUnread,
  sendChatMessage,
  sendGroupMessage,
  createGroupChat,
  joinGroupChatById,
  updateGroupChatInfo,
  addMembersToGroupChat,
  deleteGroupChat,
  inviteToGroupChat,
  respondToGroupInvite,
  respondToFriendRequest,
  leaveGroupChat,
  getConversationMessages,
  getGroupChatMessages
} from "./social.js";

const $ = (id) => document.getElementById(id);

let activeTab = "system";
let chatMode = "direct";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function friendName(uid) {
  return socialState.friendProfiles?.[uid]?.username || uid || "Player";
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
    return { section: "friends", sub: "requests", targetId: msg.fromUid || msg.targetId || null };
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

function showTarget(msg) {
  const target = resolveMessageTarget(msg);

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

function openMessagesView(sub = "system", targetId = null) {
  if (!socialState.user) {
    activeTab = "system";
    render(socialState);
    return;
  }

  if (sub === "chat") {
    activeTab = "chat";
    chatMode = "direct";
    if (targetId) setSelectedConversation(targetId);
  } else if (sub === "groups") {
    activeTab = "chat";
    chatMode = "groups";
    if (targetId) setSelectedGroupChatId(targetId);
  } else {
    activeTab = "system";
  }

  render(socialState);
}

function messageCard(msg) {
  const unread = msg.toUid === socialState.user?.uid && !(msg.readBy || []).includes(socialState.user?.uid);
  const target = resolveMessageTarget(msg);
  const requestButtons = msg.kind === "friend-request" && msg.toUid === socialState.user?.uid && (msg.status || "pending") === "pending"
    ? `
      <button type="button" data-action="accept-friend-request" data-id="${escapeHtml(msg.id)}" data-uid="${escapeHtml(msg.fromUid || "")}">Accept</button>
      <button type="button" data-action="ignore-friend-request" data-id="${escapeHtml(msg.id)}" data-uid="${escapeHtml(msg.fromUid || "")}">Ignore</button>
      <button type="button" data-action="decline-friend-request" data-id="${escapeHtml(msg.id)}" data-uid="${escapeHtml(msg.fromUid || "")}">Decline</button>
    `
    : "";

  return `
    <div class="msg-card ${unread ? "unread" : "read"}" data-msg-id="${escapeHtml(msg.id)}" data-kind="${escapeHtml(msg.kind || "system")}" data-target-id="${escapeHtml(target.targetId || "")}" data-target-section="${escapeHtml(target.section)}" data-target-sub="${escapeHtml(target.sub)}">
      <div class="msg-avatar">${unread ? "🔔" : (msg.kind === "chat" ? "💬" : "📭")}</div>
      <div class="msg-body">
        <div class="msg-top">
          <div class="msg-title">${escapeHtml(msg.title || msg.kind || "Message")}</div>
          <div class="msg-meta">${escapeHtml(msg.fromName || msg.kind || "")}</div>
        </div>
        <div class="msg-text">${escapeHtml(msg.body || "")}</div>
      </div>
      <div class="msg-actions">
        <button type="button" data-action="open-target">Open</button>
        ${requestButtons}
        <button type="button" data-action="show-in-messages">Show in Messages</button>
        <button type="button" data-action="toggle-read">${unread ? "Read" : "Unread"}</button>
      </div>
    </div>
  `;
}

function renderSystem(state) {
  const list = $("system-message-list");
  if (!list) return;

  const messages = (state.messages || []).filter(m => m.kind !== "chat");

  list.innerHTML = messages.length
    ? messages.map(messageCard).join("")
    : `<div class="msg-empty">No system messages yet.</div>`;
}

function renderChat(state) {
  const friends = (state.friends || []).map(uid => ({ uid, name: friendName(uid) }));
  const search = String($("messages-friend-search")?.value || "").trim().toLowerCase();
  const filteredFriends = friends.filter(f => !search || f.name.toLowerCase().includes(search) || f.uid.toLowerCase().includes(search));

  const selectedUid = state.selectedConversationId || filteredFriends[0]?.uid || null;
  if (!state.selectedConversationId && selectedUid) setSelectedConversation(selectedUid);

  const conversation = $("messages-conversation");
  const friendList = $("messages-friend-list");
  const targetLabel = $("direct-composer-target");

  if (friendList) {
    friendList.innerHTML = filteredFriends.length
      ? filteredFriends.map(friend => `
        <button class="friend-pill ${friend.uid === selectedUid ? "active" : ""}" type="button" data-action="pick-friend" data-uid="${escapeHtml(friend.uid)}">
          <span>${escapeHtml(friend.name)}</span>
          <small>${escapeHtml(friend.uid)}</small>
        </button>
      `).join("")
      : `<div class="msg-empty">No matching friends.</div>`;
  }

  if (targetLabel) targetLabel.textContent = selectedUid ? `Chatting with ${friendName(selectedUid)}` : "Pick a friend to start chatting";

  if (conversation) {
    const msgs = selectedUid ? getConversationMessages(selectedUid) : [];
    conversation.innerHTML = msgs.length
      ? msgs.map(messageCard).join("")
      : `<div class="msg-empty">No messages yet.</div>`;
  }

  $("messages-send-btn")?.setAttribute("data-target-uid", selectedUid || "");

  const chats = state.groupChats || [];
  const groupSearch = String($("groups-search")?.value || "").trim().toLowerCase();
  const filteredChats = chats.filter(c => !groupSearch || String(c.name || "").toLowerCase().includes(groupSearch) || String(c.id || "").toLowerCase().includes(groupSearch));
  const selectedGroup = state.selectedGroupChatId || filteredChats[0]?.id || null;
  if (!state.selectedGroupChatId && selectedGroup) setSelectedGroupChatId(selectedGroup);

  const list = $("groups-list");
  const view = $("groups-view");

  if (list) {
    list.innerHTML = filteredChats.length
      ? filteredChats.map(chat => `
        <button class="group-pill ${chat.id === selectedGroup ? "active" : ""}" type="button" data-action="pick-group" data-id="${escapeHtml(chat.id)}">
          <span>${escapeHtml(chat.emoji || "👥")} ${escapeHtml(chat.name || "Group chat")}</span>
          <small>${escapeHtml((chat.members || []).length)} members</small>
        </button>
      `).join("")
      : `<div class="msg-empty">No group chats yet.</div>`;
  }

  if (view) {
    const messages = selectedGroup ? getGroupChatMessages(selectedGroup) : [];
    const current = filteredChats.find(c => c.id === selectedGroup) || null;

    view.innerHTML = selectedGroup ? `
      <div class="group-header">
        <div>
          <div class="group-name">${escapeHtml(current?.emoji || "👥")} ${escapeHtml(current?.name || "Group chat")}</div>
          <div class="group-meta">${escapeHtml((current?.members || []).length || 0)} members</div>
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
          <input id="group-emoji-input" type="text" placeholder="Group emoji" value="${escapeHtml(current?.emoji || "👥")}" />
          <button type="button" id="group-save-btn" data-group-id="${escapeHtml(selectedGroup)}">Save group info</button>
        </div>

        <div class="group-edit-grid" style="margin-top:12px;">
          <input id="group-add-member-input" type="text" placeholder="Add member by ID" />
          <button type="button" id="group-add-member-btn" data-group-id="${escapeHtml(selectedGroup)}">Invite member</button>
        </div>

        <div class="group-edit-grid" style="margin-top:12px;">
          <input id="join-group-input" type="text" placeholder="Join group by chat ID" />
          <button type="button" id="join-group-btn">Join chat</button>
        </div>
      </div>

      <div class="message-stream" style="margin-top:12px;">
        ${messages.length ? messages.map(messageCard).join("") : `<div class="msg-empty">No messages in this group yet.</div>`}
      </div>

      <div class="composer-row" style="margin-top:12px;">
        <input id="group-message-input" type="text" placeholder="Write a group message..." />
        <button id="send-group-message-btn" type="button" data-group-id="${escapeHtml(selectedGroup)}">Send</button>
      </div>
    ` : `<div class="msg-empty">Pick a group chat.</div>`;
  }

  const invites = $("groups-invite-list");
  if (invites) {
    invites.innerHTML = (state.groupInvites || []).length
      ? state.groupInvites.map(invite => `
        <div class="invite-card">
          <div>
            <div class="invite-title">${escapeHtml(invite.chatEmoji || "👥")} ${escapeHtml(invite.chatName || "Group invite")}</div>
            <div class="invite-sub">${escapeHtml(invite.fromName || invite.fromUid || "")}</div>
          </div>
          <div class="invite-actions">
            <button type="button" data-action="accept-group-invite" data-id="${escapeHtml(invite.id)}">Accept</button>
            <button type="button" data-action="decline-group-invite" data-id="${escapeHtml(invite.id)}">Decline</button>
            <button type="button" data-action="view-group-invite" data-id="${escapeHtml(invite.chatId)}">Show in Messages</button>
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
          <p>${state.unreadCount || 0} unread</p>
        </div>
        <div class="messages-toolbar">
          <button class="tab-chip ${activeTab === "system" ? "active" : ""}" type="button" data-tab="system">System</button>
          <button class="tab-chip ${activeTab === "chat" ? "active" : ""}" type="button" data-tab="chat">Chat</button>
          <button type="button" id="msg-read-all">Read all</button>
          <button type="button" id="msg-unread-all">Unread all</button>
        </div>
      </div>

      <div class="messages-panel ${activeTab === "system" ? "active" : ""}" data-panel="system">
        <div class="system-panel">
          <div id="system-message-list" class="message-stream"></div>
        </div>
      </div>

      <div class="messages-panel ${activeTab === "chat" ? "active" : ""}" data-panel="chat">
        <div class="messages-tabs">
          <button class="tab-chip ${chatMode === "direct" ? "active" : ""}" type="button" data-chatmode="direct">Direct</button>
          <button class="tab-chip ${chatMode === "groups" ? "active" : ""}" type="button" data-chatmode="groups">Groups</button>
        </div>

        <div class="discord-layout" style="${chatMode === "direct" ? "" : "display:none;"}">
          <aside class="discord-side">
            <input id="messages-friend-search" type="text" placeholder="Search friends" />
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
              <input id="groups-search" type="text" placeholder="Search groups" />
              <div id="groups-list" class="stack"></div>
            </div>

            <div class="side-block">
              <div class="side-title">Create group</div>
              <input id="new-group-name" type="text" placeholder="Group name" />
              <input id="new-group-emoji" type="text" placeholder="Emoji" value="👥" />
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

function bind(root) {
  root.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action], [data-tab], [data-chatmode]");
    if (!btn) return;

    const action = btn.dataset.action;
    const uid = btn.dataset.uid || null;
    const id = btn.dataset.id || null;

    try {
      if (btn.dataset.tab) {
        activeTab = btn.dataset.tab;
        render(socialState);
        return;
      }

      if (btn.dataset.chatmode) {
        chatMode = btn.dataset.chatmode;
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
        btn.textContent = "Copied";
        setTimeout(() => (btn.textContent = "Copy ID"), 900);
        return;
      }

      if (action === "open-target") {
        const card = btn.closest("[data-msg-id]");
        if (!card) return;
        showTarget({
          kind: card.dataset.kind,
          targetSection: card.dataset.targetSection,
          targetSubSection: card.dataset.targetSub,
          targetId: card.dataset.targetId,
          conversationUid: uid
        });
        return;
      }

      if (action === "show-in-messages") {
        const card = btn.closest("[data-msg-id]");
        if (!card) return;
        openMessagesView(card.dataset.targetSub || "system", card.dataset.targetId || uid || null);
        return;
      }

      if (action === "toggle-read") {
        const card = btn.closest("[data-msg-id]");
        if (!card) return;
        await markMessageRead(card.dataset.msgId, btn.textContent === "Read");
        return;
      }

      if (action === "accept-friend-request") {
        await respondToFriendRequest(id, "accept");
        if (typeof window.openAccountArea === "function") {
          window.openAccountArea("friends", "friends", uid);
        }
        return;
      }

      if (action === "ignore-friend-request") {
        await respondToFriendRequest(id, "ignore");
        render(socialState);
        return;
      }

      if (action === "decline-friend-request") {
        await respondToFriendRequest(id, "decline");
        render(socialState);
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

      if (action === "view-group-invite") {
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
    } catch (err) {
      alert(err.message || "Action failed.");
    }
  });

  root.addEventListener("click", async (e) => {
    const button = e.target.closest("#msg-read-all, #msg-unread-all, #messages-send-btn, #send-group-message-btn, #create-group-btn, #group-save-btn, #group-add-member-btn, #join-group-btn");
    if (!button) return;

    try {
      if (button.id === "msg-read-all") await markAllMessagesRead();
      if (button.id === "msg-unread-all") await markAllMessagesUnread();

      if (button.id === "messages-send-btn") {
        const target = button.dataset.targetUid || socialState.selectedConversationId;
        const input = $("direct-message-input");
        if (target && input?.value.trim()) {
          await sendChatMessage(target, input.value.trim());
          input.value = "";
        }
      }

      if (button.id === "send-group-message-btn") {
        const chatId = button.dataset.groupId || socialState.selectedGroupChatId;
        const input = $("group-message-input");
        if (chatId && input?.value.trim()) {
          await sendGroupMessage(chatId, input.value.trim());
          input.value = "";
        }
      }

      if (button.id === "create-group-btn") {
        const name = $("new-group-name")?.value || "";
        const emoji = $("new-group-emoji")?.value || "👥";
        const members = String($("new-group-members")?.value || "").split(",").map(s => s.trim()).filter(Boolean);
        const chatId = await createGroupChat(name, emoji, members);
        setSelectedGroupChatId(chatId);
        activeTab = "chat";
        render(socialState);
      }

      if (button.id === "group-save-btn") {
        const chatId = button.dataset.groupId || socialState.selectedGroupChatId;
        await updateGroupChatInfo(chatId, {
          name: $("group-rename-input")?.value || "",
          emoji: $("group-emoji-input")?.value || "👥"
        });
      }

      if (button.id === "group-add-member-btn") {
        const chatId = button.dataset.groupId || socialState.selectedGroupChatId;
        const uid = $("group-add-member-input")?.value || "";
        if (chatId && uid) await addMembersToGroupChat(chatId, [uid]);
        $("group-add-member-input").value = "";
      }

      if (button.id === "join-group-btn") {
        const chatId = $("join-group-input")?.value || "";
        await joinGroupChatById(chatId);
        $("join-group-input").value = "";
      }
    } catch (err) {
      alert(err.message || "Action failed.");
    }
  });

  root.addEventListener("keydown", async (e) => {
    if (e.target?.id === "direct-message-input" && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const target = socialState.selectedConversationId;
      if (target && e.target.value.trim()) {
        await sendChatMessage(target, e.target.value.trim());
        e.target.value = "";
      }
    }

    if (e.target?.id === "group-message-input" && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const chatId = socialState.selectedGroupChatId;
      if (chatId && e.target.value.trim()) {
        await sendGroupMessage(chatId, e.target.value.trim());
        e.target.value = "";
      }
    }
  });

  root.addEventListener("input", (e) => {
    if (e.target?.id === "messages-friend-search" || e.target?.id === "groups-search") {
      render(socialState);
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
