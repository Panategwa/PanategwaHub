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
  updateGroupChatInfo,
  addMembersToGroupChat,
  deleteGroupChat,
  inviteToGroupChat,
  respondToGroupInvite,
  leaveGroupChat,
  getConversationMessages,
  getGroupChatMessages
} from "./social.js";

const $ = (id) => document.getElementById(id);

let activeTab = "direct";
let directFilter = "all";

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

function resolveMessageTarget(msg) {
  if (!msg) return { section: "messages", sub: "direct", targetId: null };

  if (msg.kind === "achievement") {
    return { section: "progress", sub: "progress", targetId: msg.targetId || msg.achievementId || null };
  }

  if (msg.kind === "friend-request") {
    return { section: "friends", sub: "requests", targetId: msg.fromUid || null };
  }

  if (msg.kind === "friend-accepted" || msg.kind === "friend-declined" || msg.kind === "friend-blocked" || msg.kind === "chat") {
    return { section: "messages", sub: "direct", targetId: msg.conversationUid || msg.fromUid || null };
  }

  if (msg.kind === "group-invite") {
    return { section: "messages", sub: "invites", targetId: msg.groupChatId || msg.targetId || null };
  }

  return {
    section: msg.targetSection || "messages",
    sub: msg.targetSubSection || "direct",
    targetId: msg.targetId || msg.conversationUid || msg.fromUid || null
  };
}

function showTarget(msg) {
  const target = resolveMessageTarget(msg);
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

function messageCard(msg) {
  const unread = msg.toUid === socialState.user?.uid && !(msg.readBy || []).includes(socialState.user?.uid);
  const t = resolveMessageTarget(msg);

  return `
    <div class="msg-card ${unread ? "unread" : "read"}" data-msg-id="${escapeHtml(msg.id)}" data-kind="${escapeHtml(msg.kind || "system")}" data-target-id="${escapeHtml(t.targetId || "")}" data-target-section="${escapeHtml(t.section)}" data-target-sub="${escapeHtml(t.sub)}">
      <div class="msg-avatar">${unread ? "✉️" : (msg.kind === "chat" ? "💬" : "📭")}</div>
      <div class="msg-body">
        <div class="msg-top">
          <div class="msg-title">${escapeHtml(msg.title || msg.kind || "Message")}</div>
          <div class="msg-meta">${escapeHtml(msg.fromName || msg.kind || "")}</div>
        </div>
        <div class="msg-text">${escapeHtml(msg.body || "")}</div>
      </div>
      <div class="msg-actions">
        <button type="button" data-action="open-target">Open</button>
        <button type="button" data-action="show-in-messages">Show in Messages</button>
        <button type="button" data-action="toggle-read">${unread ? "Read" : "Unread"}</button>
      </div>
    </div>
  `;
}

function renderDirect(state) {
  const friends = (state.friends || []).map(uid => ({ uid, name: friendName(uid) }));
  const q = String($("messages-friend-search")?.value || "").trim().toLowerCase();
  const filteredFriends = friends.filter(f => !q || f.name.toLowerCase().includes(q) || f.uid.toLowerCase().includes(q));

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
    conversation.innerHTML = msgs.length ? msgs.map(messageCard).join("") : `<div class="msg-empty">No messages yet.</div>`;
  }

  $("messages-send-btn")?.setAttribute("data-target-uid", selectedUid || "");
}

function renderGroups(state) {
  const chats = state.groupChats || [];
  const q = String($("groups-search")?.value || "").trim().toLowerCase();
  const filteredChats = chats.filter(c => !q || String(c.name || "").toLowerCase().includes(q) || String(c.id || "").toLowerCase().includes(q));

  const selectedId = state.selectedGroupChatId || filteredChats[0]?.id || null;
  if (!state.selectedGroupChatId && selectedId) setSelectedGroupChatId(selectedId);

  const list = $("groups-list");
  const view = $("groups-view");
  const current = filteredChats.find(c => c.id === selectedId) || filteredChats[0] || null;

  if (list) {
    list.innerHTML = filteredChats.length
      ? filteredChats.map(chat => `
        <button class="group-pill ${chat.id === selectedId ? "active" : ""}" type="button" data-action="pick-group" data-id="${escapeHtml(chat.id)}">
          <span>${escapeHtml(chat.emoji || "👥")} ${escapeHtml(chat.name || "Group chat")}</span>
          <small>${escapeHtml((chat.members || []).length)} members</small>
        </button>
      `).join("")
      : `<div class="msg-empty">No group chats yet.</div>`;
  }

  if (view) {
    const messages = selectedId ? getGroupChatMessages(selectedId) : [];
    view.innerHTML = selectedId ? `
      <div class="group-header">
        <div>
          <div class="group-name">${escapeHtml(current?.emoji || "👥")} ${escapeHtml(current?.name || "Group chat")}</div>
          <div class="group-meta">${escapeHtml((current?.members || []).length || 0)} members</div>
        </div>
        <div class="group-actions-inline">
          <button type="button" data-action="copy-group-id" data-id="${escapeHtml(selectedId)}">Copy ID</button>
          <button type="button" data-action="leave-group" data-id="${escapeHtml(selectedId)}">Leave</button>
          <button type="button" data-action="delete-group" data-id="${escapeHtml(selectedId)}">Delete</button>
        </div>
      </div>

      <div class="group-manager">
        <div class="group-edit-grid">
          <input id="group-rename-input" type="text" placeholder="Rename group" value="${escapeHtml(current?.name || "")}" />
          <input id="group-emoji-input" type="text" placeholder="Group emoji" value="${escapeHtml(current?.emoji || "👥")}" />
          <button type="button" id="group-save-btn" data-group-id="${escapeHtml(selectedId)}">Save group info</button>
        </div>

        <div class="group-edit-grid" style="margin-top:12px;">
          <input id="group-add-member-input" type="text" placeholder="Add member by ID" />
          <button type="button" id="group-add-member-btn" data-group-id="${escapeHtml(selectedId)}">Invite member</button>
        </div>
      </div>

      <div class="message-stream" style="margin-top:12px;">
        ${messages.length ? messages.map(messageCard).join("") : `<div class="msg-empty">No messages in this group yet.</div>`}
      </div>

      <div class="composer-row" style="margin-top:12px;">
        <input id="group-message-input" type="text" placeholder="Write a group message..." />
        <button id="send-group-message-btn" type="button" data-group-id="${escapeHtml(selectedId)}">Send</button>
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

  const createEmoji = $("new-group-emoji");
  if (createEmoji && !createEmoji.value) createEmoji.value = "👥";
}

function renderSystem(state) {
  const list = $("system-message-list");
  if (!list) return;

  const messages = (state.messages || []).filter(m => {
    if (directFilter === "system") return ["system", "achievement", "friend-request", "group-invite"].includes(m.kind);
    if (directFilter === "friends") return m.kind === "chat" || m.kind === "friend-accepted" || m.kind === "friend-declined" || m.kind === "friend-blocked";
    return true;
  });

  list.innerHTML = messages.length ? messages.map(messageCard).join("") : `<div class="msg-empty">No messages here.</div>`;
}

function render(state) {
  const root = $("messages-root");
  if (!root) return;

  root.innerHTML = `
    <div class="messages-wrap">
      <div class="messages-head">
        <div>
          <h2>Messages</h2>
          <p>${state.unreadCount || 0} unread</p>
        </div>
        <div class="messages-toolbar">
          <button class="tab-chip ${directFilter === "all" ? "active" : ""}" type="button" data-filter="all">All</button>
          <button class="tab-chip ${directFilter === "system" ? "active" : ""}" type="button" data-filter="system">System</button>
          <button class="tab-chip ${directFilter === "friends" ? "active" : ""}" type="button" data-filter="friends">Friend messages</button>
          <button type="button" id="msg-read-all">Read all</button>
          <button type="button" id="msg-unread-all">Unread all</button>
        </div>
      </div>

      <div class="messages-tabs">
        <button class="tab-chip ${activeTab === "direct" ? "active" : ""}" type="button" data-tab="direct">Direct</button>
        <button class="tab-chip ${activeTab === "groups" ? "active" : ""}" type="button" data-tab="groups">Groups</button>
        <button class="tab-chip ${activeTab === "system" ? "active" : ""}" type="button" data-tab="system">System</button>
      </div>

      <div class="messages-panel ${activeTab === "direct" ? "active" : ""}" data-panel="direct">
        <div class="discord-layout">
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
      </div>

      <div class="messages-panel ${activeTab === "groups" ? "active" : ""}" data-panel="groups">
        <div class="discord-layout">
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
          </aside>

          <main class="discord-main">
            <div id="groups-view" class="message-stream"></div>
          </main>
        </div>
      </div>

      <div class="messages-panel ${activeTab === "system" ? "active" : ""}" data-panel="system">
        <div class="system-panel">
          <div id="system-message-list" class="message-stream"></div>
        </div>
      </div>

      <div class="card">
        <h3>Group invites</h3>
        <div id="groups-invite-list"></div>
      </div>
    </div>
  `;

  renderDirect(state);
  renderGroups(state);
  renderSystem(state);
}

function bind(root) {
  root.addEventListener("click", async (e) => {
    const btn = e.target.closest("button,[data-action]");
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

      if (btn.dataset.filter) {
        directFilter = btn.dataset.filter;
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
        if (typeof window.openAccountArea === "function") {
          window.openAccountArea("messages", activeTab, card.dataset.targetId || uid);
        }
        return;
      }

      if (action === "toggle-read") {
        const card = btn.closest("[data-msg-id]");
        if (!card) return;
        await markMessageRead(card.dataset.msgId, btn.textContent === "Read");
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
        activeTab = "groups";
        setSelectedGroupChatId(id);
        render(socialState);
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

      if (action === "create-group") {
        const name = $("new-group-name")?.value || "";
        const emoji = $("new-group-emoji")?.value || "👥";
        const members = String($("new-group-members")?.value || "").split(",").map(s => s.trim()).filter(Boolean);
        const chatId = await createGroupChat(name, emoji, members);
        setSelectedGroupChatId(chatId);
        activeTab = "groups";
        render(socialState);
        return;
      }

      if (action === "invite-member") {
        const chatId = btn.dataset.groupId || socialState.selectedGroupChatId;
        const target = $("group-add-member-input")?.value || "";
        await addMembersToGroupChat(chatId, [target]);
        $("group-add-member-input").value = "";
        return;
      }

      if (action === "save-group-info") {
        const chatId = btn.dataset.groupId || socialState.selectedGroupChatId;
        const name = $("group-rename-input")?.value || "";
        const emoji = $("group-emoji-input")?.value || "👥";
        await updateGroupChatInfo(chatId, { name, emoji });
        return;
      }
    } catch (err) {
      alert(err.message || "Action failed.");
    }
  });

  root.addEventListener("click", async (e) => {
    const idBtn = e.target.closest("#msg-read-all, #msg-unread-all, #messages-send-btn, #send-group-message-btn, #create-group-btn, #group-save-btn, #group-add-member-btn");
    if (!idBtn) return;

    try {
      if (idBtn.id === "msg-read-all") await markAllMessagesRead();
      if (idBtn.id === "msg-unread-all") await markAllMessagesUnread();

      if (idBtn.id === "messages-send-btn") {
        const target = idBtn.dataset.targetUid || socialState.selectedConversationId;
        const input = $("direct-message-input");
        if (target && input?.value.trim()) {
          await sendChatMessage(target, input.value.trim());
          input.value = "";
        }
      }

      if (idBtn.id === "send-group-message-btn") {
        const chatId = idBtn.dataset.groupId || socialState.selectedGroupChatId;
        const input = $("group-message-input");
        if (chatId && input?.value.trim()) {
          await sendGroupMessage(chatId, input.value.trim());
          input.value = "";
        }
      }

      if (idBtn.id === "create-group-btn") {
        const name = $("new-group-name")?.value || "";
        const emoji = $("new-group-emoji")?.value || "👥";
        const members = String($("new-group-members")?.value || "").split(",").map(s => s.trim()).filter(Boolean);
        const chatId = await createGroupChat(name, emoji, members);
        setSelectedGroupChatId(chatId);
        activeTab = "groups";
        render(socialState);
      }

      if (idBtn.id === "group-save-btn") {
        const chatId = idBtn.dataset.groupId || socialState.selectedGroupChatId;
        await updateGroupChatInfo(chatId, {
          name: $("group-rename-input")?.value || "",
          emoji: $("group-emoji-input")?.value || "👥"
        });
      }

      if (idBtn.id === "group-add-member-btn") {
        const chatId = idBtn.dataset.groupId || socialState.selectedGroupChatId;
        const uid = $("group-add-member-input")?.value || "";
        if (chatId && uid) await addMembersToGroupChat(chatId, [uid]);
        $("group-add-member-input").value = "";
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

    if (e.target?.id === "group-message-input" && e.key === "Enter" && !e.shiftShiftKey) {
      e.preventDefault();
      const chatId = socialState.selectedGroupChatId;
      if (chatId && e.target.value.trim()) {
        await sendGroupMessage(chatId, e.target.value.trim());
        e.target.value = "";
      }
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

export { render, resolveMessageTarget };