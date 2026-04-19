import { auth, db } from "./firebase-config.js";
import { watchAuth, ensureUserProfile, getProfile } from "./auth.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  arrayUnion,
  arrayRemove
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const DEFAULT_SETTINGS = {
  systemEnabled: true,
  requestsEnabled: true,
  chatEnabled: true,
  groupChatsEnabled: true,
  showNonFriendGroupMessages: true,
  profileHidden: false
};

const listeners = new Set();

const state = {
  user: null,
  profile: null,
  settings: { ...DEFAULT_SETTINGS },
  friends: [],
  blocked: [],
  incomingRequests: [],
  outgoingRequests: [],
  messages: [],
  unreadCount: 0,
  friendProfiles: {},
  selectedProfile: null,
  selectedProfileId: null,
  selectedConversationId: null,
  selectedGroupChatId: null,
  groupChats: [],
  groupMessagesByChat: {},
  groupInvites: []
};

let unsubProfile = null;
let unsubIncoming = null;
let unsubOutgoing = null;
let unsubMessages = null;
let unsubGroupChats = null;
let unsubGroupInvites = null;
const groupMessageUnsubs = new Map();

function cloneState() {
  return {
    ...state,
    friends: [...state.friends],
    blocked: [...state.blocked],
    incomingRequests: [...state.incomingRequests],
    outgoingRequests: [...state.outgoingRequests],
    messages: [...state.messages],
    groupChats: [...state.groupChats],
    groupInvites: [...state.groupInvites],
    groupMessagesByChat: Object.fromEntries(
      Object.entries(state.groupMessagesByChat).map(([k, v]) => [k, [...v]])
    ),
    friendProfiles: { ...state.friendProfiles }
  };
}

function emit() {
  listeners.forEach(fn => fn(cloneState()));
}

function subscribeSocial(callback) {
  listeners.add(callback);
  callback(cloneState());
  return () => listeners.delete(callback);
}

function cleanUid(value) {
  return String(value || "").trim();
}

function unique(list) {
  return [...new Set((Array.isArray(list) ? list : []).map(cleanUid).filter(Boolean))];
}

function toMs(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return 0;
}

function sortNewestFirst(list) {
  return [...list].sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
}

function userRef(uid) {
  return doc(db, "users", uid);
}

function requestRef(fromUid, toUid) {
  return doc(db, "friendRequests", `request_${fromUid}_${toUid}`);
}

function usernameOf(profile) {
  return profile?.username || profile?.displayName || profile?.email?.split("@")?.[0] || "Player";
}

function publicProfile(profile, viewerUid) {
  if (!profile) return null;
  const hidden = !!profile.socialSettings?.profileHidden;
  const self = profile.uid === viewerUid;

  if (self || !hidden) {
    return {
      uid: profile.uid,
      username: profile.username || "Player",
      avatarEmoji: profile.avatarEmoji || "👤",
      photoURL: profile.photoURL || "",
      email: profile.email || "",
      xp: profile.xp || 0,
      verified: !!profile.verified,
      createdAt: profile.createdAt || null,
      lastLoginAt: profile.lastLoginAt || null,
      friends: unique(profile.friends),
      blocked: unique(profile.blocked),
      socialSettings: { ...(profile.socialSettings || DEFAULT_SETTINGS) },
      stats: profile.stats || {}
    };
  }

  return {
    uid: profile.uid,
    username: profile.username || "Player",
    avatarEmoji: profile.avatarEmoji || "👤",
    photoURL: "",
    email: "",
    xp: 0,
    verified: !!profile.verified,
    createdAt: profile.createdAt || null,
    lastLoginAt: profile.lastLoginAt || null,
    friends: [],
    blocked: [],
    socialSettings: { ...DEFAULT_SETTINGS, profileHidden: true },
    stats: {}
  };
}

async function loadUser(uid) {
  const id = cleanUid(uid);
  if (!id) return null;
  const snap = await getDoc(userRef(id));
  return snap.exists() ? snap.data() : null;
}

async function loadFriendProfiles(ids) {
  const idsUnique = unique(ids);
  const pairs = await Promise.all(idsUnique.map(async (uid) => {
    const data = await loadUser(uid);
    return [uid, data];
  }));

  const map = {};
  for (const [uid, data] of pairs) {
    if (data) map[uid] = publicProfile(data, state.user?.uid);
  }
  state.friendProfiles = map;
  emit();
}

async function createMessage({
  fromUid,
  toUid,
  kind,
  title,
  body,
  targetSection = "messages",
  targetSubSection = "direct",
  targetId = null,
  conversationUid = null,
  requestId = null,
  groupChatId = null
}) {
  const from = await loadUser(fromUid);
  const to = await loadUser(toUid);

  await addDoc(collection(db, "messages"), {
    fromUid,
    toUid,
    fromName: usernameOf(from),
    toName: usernameOf(to),
    kind,
    title,
    body,
    targetSection,
    targetSubSection,
    targetId,
    conversationUid,
    requestId,
    groupChatId,
    readBy: [fromUid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

function openAccountArea(section = "messages", sub = "direct", targetId = null) {
  if (typeof window.openAccountArea === "function") {
    window.openAccountArea(section, sub, targetId);
  }
}

async function sendFriendRequestById(targetUid, note = "") {
  const user = auth.currentUser;
  const id = cleanUid(targetUid);
  if (!user) throw new Error("Not logged in.");
  if (!id) throw new Error("Enter a valid user ID.");
  if (id === user.uid) throw new Error("You cannot send a request to yourself.");

  const me = await loadUser(user.uid);
  const target = await loadUser(id);
  if (!target) throw new Error("That user was not found.");

  const meSettings = { ...DEFAULT_SETTINGS, ...(me?.socialSettings || {}) };
  const targetSettings = { ...DEFAULT_SETTINGS, ...(target?.socialSettings || {}) };

  if (!meSettings.systemEnabled || !meSettings.requestsEnabled) throw new Error("Friend requests are turned off.");
  if (!targetSettings.systemEnabled || !targetSettings.requestsEnabled) throw new Error("That user is not accepting friend requests.");
  if (unique(me?.blocked).includes(id) || unique(target?.blocked).includes(user.uid)) throw new Error("You cannot send a request to this user.");

  const ref = requestRef(user.uid, id);
  await setDoc(ref, {
    id: ref.id,
    fromUid: user.uid,
    toUid: id,
    status: "pending",
    note: String(note || "").trim(),
    fromName: usernameOf(me),
    toName: usernameOf(target),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });

  await createMessage({
    fromUid: user.uid,
    toUid: id,
    kind: "friend-request",
    title: "Friend request",
    body: note ? `${usernameOf(me)}: ${note}` : `${usernameOf(me)} sent you a friend request.`,
    targetSection: "friends",
    targetSubSection: "requests",
    requestId: ref.id
  });
}

async function respondToFriendRequest(requestId, action) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const ref = doc(db, "friendRequests", requestId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Request not found.");

  const req = snap.data();
  if (req.toUid !== user.uid) throw new Error("You cannot edit this request.");

  const senderRef = userRef(req.fromUid);
  const receiverRef = userRef(req.toUid);

  if (action === "accept") {
    await setDoc(senderRef, { friends: arrayUnion(user.uid), blocked: arrayRemove(user.uid), updatedAt: serverTimestamp() }, { merge: true });
    await setDoc(receiverRef, { friends: arrayUnion(req.fromUid), updatedAt: serverTimestamp() }, { merge: true });
    await updateDoc(ref, { status: "accepted", updatedAt: serverTimestamp() });

    await createMessage({
      fromUid: user.uid,
      toUid: req.fromUid,
      kind: "friend-accepted",
      title: "Friend accepted",
      body: `${usernameOf(await loadUser(user.uid))} accepted your friend request.`,
      targetSection: "messages",
      targetSubSection: "direct",
      conversationUid: req.fromUid
    });
    return;
  }

  if (action === "decline") {
    await updateDoc(ref, { status: "declined", updatedAt: serverTimestamp() });
    await createMessage({
      fromUid: user.uid,
      toUid: req.fromUid,
      kind: "friend-declined",
      title: "Friend declined",
      body: `${usernameOf(await loadUser(user.uid))} declined your friend request.`,
      targetSection: "messages",
      targetSubSection: "direct",
      conversationUid: req.fromUid
    });
    return;
  }

  if (action === "block") {
    await setDoc(receiverRef, { blocked: arrayUnion(req.fromUid), friends: arrayRemove(req.fromUid), updatedAt: serverTimestamp() }, { merge: true });
    await setDoc(senderRef, { friends: arrayRemove(user.uid), updatedAt: serverTimestamp() }, { merge: true });
    await updateDoc(ref, { status: "blocked", updatedAt: serverTimestamp() });
    await createMessage({
      fromUid: user.uid,
      toUid: req.fromUid,
      kind: "friend-blocked",
      title: "Blocked",
      body: `${usernameOf(await loadUser(user.uid))} blocked you.`,
      targetSection: "messages",
      targetSubSection: "direct",
      conversationUid: req.fromUid
    });
  }
}

async function sendChatMessage(friendUid, text) {
  const user = auth.currentUser;
  const id = cleanUid(friendUid);
  const body = String(text || "").trim();

  if (!user) throw new Error("Not logged in.");
  if (!id) throw new Error("Pick a friend first.");
  if (!body) throw new Error("Type a message first.");

  const me = await loadUser(user.uid);
  const target = await loadUser(id);
  if (!target) throw new Error("That user was not found.");
  if (!unique(me?.friends).includes(id)) throw new Error("That user is not in your friends list.");

  const meSettings = { ...DEFAULT_SETTINGS, ...(me?.socialSettings || {}) };
  const targetSettings = { ...DEFAULT_SETTINGS, ...(target?.socialSettings || {}) };
  if (!meSettings.systemEnabled || !meSettings.chatEnabled) throw new Error("Chat is turned off.");
  if (!targetSettings.systemEnabled || !targetSettings.chatEnabled) throw new Error("That user is not accepting chats.");

  await createMessage({
    fromUid: user.uid,
    toUid: id,
    kind: "chat",
    title: `Message from ${usernameOf(me)}`,
    body,
    targetSection: "messages",
    targetSubSection: "direct",
    conversationUid: id
  });
}

async function removeFriend(friendUid) {
  const user = auth.currentUser;
  const id = cleanUid(friendUid);
  if (!user) throw new Error("Not logged in.");
  if (!id) throw new Error("Enter a friend ID.");

  await setDoc(userRef(user.uid), { friends: arrayRemove(id), updatedAt: serverTimestamp() }, { merge: true });
  await setDoc(userRef(id), { friends: arrayRemove(user.uid), updatedAt: serverTimestamp() }, { merge: true });
}

async function blockUser(targetUid) {
  const user = auth.currentUser;
  const id = cleanUid(targetUid);
  if (!user) throw new Error("Not logged in.");
  if (!id) throw new Error("Enter a user ID.");

  await setDoc(userRef(user.uid), { blocked: arrayUnion(id), friends: arrayRemove(id), updatedAt: serverTimestamp() }, { merge: true });
  await setDoc(userRef(id), { friends: arrayRemove(user.uid), updatedAt: serverTimestamp() }, { merge: true });
}

async function toggleRequestsEnabled(enabled) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");
  await updateDoc(userRef(user.uid), {
    "socialSettings.requestsEnabled": !!enabled,
    updatedAt: serverTimestamp()
  });
}

async function toggleChatEnabled(enabled) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");
  await updateDoc(userRef(user.uid), {
    "socialSettings.chatEnabled": !!enabled,
    updatedAt: serverTimestamp()
  });
}

async function toggleGroupChatsEnabled(enabled) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");
  await updateDoc(userRef(user.uid), {
    "socialSettings.groupChatsEnabled": !!enabled,
    updatedAt: serverTimestamp()
  });
}

async function toggleShowNonFriendGroupMessages(enabled) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");
  await updateDoc(userRef(user.uid), {
    "socialSettings.showNonFriendGroupMessages": !!enabled,
    updatedAt: serverTimestamp()
  });
}

async function toggleProfileHidden(hidden) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");
  await updateDoc(userRef(user.uid), {
    "socialSettings.profileHidden": !!hidden,
    updatedAt: serverTimestamp()
  });
}

async function disableSocialSystem(mode = "keep") {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const snap = await getDoc(userRef(user.uid));
  const data = snap.data() || {};

  const backup = {
    friends: unique(data.friends),
    blocked: unique(data.blocked),
    timestamp: Date.now()
  };

  const payload = {
    socialBackup: backup,
    socialSettings: {
      ...(data.socialSettings || DEFAULT_SETTINGS),
      systemEnabled: false,
      requestsEnabled: false,
      chatEnabled: false,
      groupChatsEnabled: false
    },
    updatedAt: serverTimestamp()
  };

  if (mode === "clear") {
    payload.friends = [];
    payload.blocked = [];
  }

  await setDoc(userRef(user.uid), payload, { merge: true });
}

async function enableSocialSystem(mode = "restore") {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");
  const snap = await getDoc(userRef(user.uid));
  const data = snap.data() || {};
  const backup = data.socialBackup || { friends: [], blocked: [] };

  let friends = unique(data.friends);
  let blocked = unique(data.blocked);

  if (mode === "restore") {
    friends = unique([...backup.friends, ...friends]);
    blocked = unique([...backup.blocked, ...blocked]);
  }

  if (mode === "fresh") {
    friends = [];
    blocked = [];
  }

  await setDoc(userRef(user.uid), {
    friends,
    blocked,
    socialSettings: {
      ...(data.socialSettings || DEFAULT_SETTINGS),
      systemEnabled: true,
      requestsEnabled: true,
      chatEnabled: true,
      groupChatsEnabled: true
    },
    updatedAt: serverTimestamp()
  }, { merge: true });
}

async function createGroupChat(name, emoji = "👥", memberIds = []) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const cleanName = String(name || "").trim();
  if (!cleanName) throw new Error("Group chat name is required.");

  const members = unique([user.uid, ...memberIds.map(cleanUid)]);
  if (members.length < 2) throw new Error("Add at least one other person.");

  const ref = await addDoc(collection(db, "groupChats"), {
    name: cleanName,
    emoji: String(emoji || "👥").trim().slice(0, 4) || "👥",
    ownerUid: user.uid,
    members,
    deleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastMessage: ""
  });

  for (const uid of members) {
    if (uid === user.uid) continue;
    await addDoc(collection(db, "groupChatInvites"), {
      chatId: ref.id,
      chatName: cleanName,
      chatEmoji: String(emoji || "👥").trim().slice(0, 4) || "👥",
      fromUid: user.uid,
      toUid: uid,
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  return ref.id;
}

async function updateGroupChatInfo(chatId, updates = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");
  const ref = doc(db, "groupChats", chatId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Group chat not found.");

  const chat = snap.data();
  if (!unique(chat.members).includes(user.uid)) throw new Error("You are not in that group.");

  const payload = { updatedAt: serverTimestamp() };
  if (typeof updates.name === "string") payload.name = updates.name.trim() || chat.name || "Group chat";
  if (typeof updates.emoji === "string") payload.emoji = updates.emoji.trim().slice(0, 4) || chat.emoji || "👥";

  await updateDoc(ref, payload);
}

async function addMembersToGroupChat(chatId, memberIds = []) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const ref = doc(db, "groupChats", chatId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Group chat not found.");

  const chat = snap.data();
  if (!unique(chat.members).includes(user.uid)) throw new Error("You are not in that group.");

  const members = unique(memberIds.map(cleanUid)).filter(uid => uid && uid !== user.uid && !unique(chat.members).includes(uid));
  for (const uid of members) {
    await addDoc(collection(db, "groupChatInvites"), {
      chatId,
      chatName: chat.name || "Group chat",
      chatEmoji: chat.emoji || "👥",
      fromUid: user.uid,
      toUid: uid,
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }
}

async function deleteGroupChat(chatId) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const ref = doc(db, "groupChats", chatId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Group chat not found.");

  const chat = snap.data();
  if (chat.ownerUid !== user.uid) throw new Error("Only the owner can delete the group chat.");

  await updateDoc(ref, {
    deleted: true,
    members: [],
    updatedAt: serverTimestamp()
  });
}

async function inviteToGroupChat(chatId, targetUid) {
  const user = auth.currentUser;
  const id = cleanUid(targetUid);
  if (!user) throw new Error("Not logged in.");
  if (!id) throw new Error("Enter a user ID.");

  const ref = doc(db, "groupChats", chatId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Group chat not found.");

  const chat = snap.data();
  if (!unique(chat.members).includes(user.uid)) throw new Error("You are not in that group.");
  if (unique(chat.members).includes(id)) throw new Error("That user is already in the group.");

  await addDoc(collection(db, "groupChatInvites"), {
    chatId,
    chatName: chat.name || "Group chat",
    chatEmoji: chat.emoji || "👥",
    fromUid: user.uid,
    toUid: id,
    status: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  await createMessage({
    fromUid: user.uid,
    toUid: id,
    kind: "group-invite",
    title: "Group invite",
    body: `${usernameOf(await loadUser(user.uid))} invited you to "${chat.name || "Group chat"}".`,
    targetSection: "messages",
    targetSubSection: "invites",
    targetId: chatId,
    groupChatId: chatId
  });
}

async function respondToGroupInvite(inviteId, action) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const ref = doc(db, "groupChatInvites", inviteId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Invite not found.");

  const invite = snap.data();
  if (invite.toUid !== user.uid) throw new Error("You cannot edit this invite.");

  const chatRef = doc(db, "groupChats", invite.chatId);

  if (action === "accept") {
    await updateDoc(ref, { status: "accepted", updatedAt: serverTimestamp() });
    await updateDoc(chatRef, { members: arrayUnion(user.uid), updatedAt: serverTimestamp() });
  }

  if (action === "decline") {
    await updateDoc(ref, { status: "declined", updatedAt: serverTimestamp() });
  }
}

async function sendGroupMessage(chatId, text) {
  const user = auth.currentUser;
  const body = String(text || "").trim();

  if (!user) throw new Error("Not logged in.");
  if (!body) throw new Error("Type a message first.");

  const ref = doc(db, "groupChats", chatId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Group chat not found.");

  const chat = snap.data();
  if (chat.deleted) throw new Error("This group chat was deleted.");
  if (!unique(chat.members).includes(user.uid)) throw new Error("You are not in that group.");

  await addDoc(collection(db, "groupChats", chatId, "messages"), {
    chatId,
    fromUid: user.uid,
    fromName: usernameOf(await loadUser(user.uid)),
    body,
    createdAt: serverTimestamp(),
    readBy: [user.uid]
  });

  await updateDoc(ref, {
    lastMessage: body,
    updatedAt: serverTimestamp()
  });
}

async function leaveGroupChat(chatId) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");
  await updateDoc(doc(db, "groupChats", chatId), {
    members: arrayRemove(user.uid),
    updatedAt: serverTimestamp()
  });
}

async function markMessageRead(messageId, read = true) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");
  const ref = doc(db, "messages", messageId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  if (data.toUid !== user.uid) return;

  if (read) {
    await updateDoc(ref, { readBy: arrayUnion(user.uid), readAt: serverTimestamp() });
  } else {
    await updateDoc(ref, { readBy: arrayRemove(user.uid), readAt: null });
  }
}

async function markAllMessagesRead() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");
  const qs = await getDocs(query(collection(db, "messages"), where("toUid", "==", user.uid)));
  for (const snap of qs.docs) {
    const data = snap.data();
    if (!unique(data.readBy).includes(user.uid)) {
      await updateDoc(snap.ref, { readBy: arrayUnion(user.uid), readAt: serverTimestamp() });
    }
  }
}

async function markAllMessagesUnread() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");
  const qs = await getDocs(query(collection(db, "messages"), where("toUid", "==", user.uid)));
  for (const snap of qs.docs) {
    const data = snap.data();
    if (unique(data.readBy).includes(user.uid)) {
      await updateDoc(snap.ref, { readBy: arrayRemove(user.uid), readAt: null });
    }
  }
}

async function viewProfileById(uid) {
  const data = await loadUser(uid);
  state.selectedProfileId = cleanUid(uid) || null;
  state.selectedProfile = publicProfile(data, state.user?.uid);
  emit();
  return state.selectedProfile;
}

function setSelectedConversation(uid) {
  state.selectedConversationId = cleanUid(uid) || null;
  emit();
}

function setSelectedGroupChatId(chatId) {
  state.selectedGroupChatId = cleanUid(chatId) || null;
  emit();
}

function getConversationMessages(uid) {
  const id = cleanUid(uid);
  if (!id) return [];
  return (state.messages || []).filter(m =>
    m.kind === "chat" &&
    ((m.fromUid === state.user?.uid && m.toUid === id) || (m.fromUid === id && m.toUid === state.user?.uid))
  );
}

function getGroupChatMessages(chatId) {
  return state.groupMessagesByChat?.[cleanUid(chatId)] || [];
}

function getUnreadIncomingCount() {
  const uid = state.user?.uid;
  if (!uid) return 0;
  return (state.messages || []).filter(m => m.toUid === uid && !unique(m.readBy).includes(uid)).length;
}

function teardownGroupListeners() {
  for (const unsub of groupMessageUnsubs.values()) {
    try { unsub(); } catch {}
  }
  groupMessageUnsubs.clear();

  if (unsubGroupChats) {
    try { unsubGroupChats(); } catch {}
    unsubGroupChats = null;
  }

  if (unsubGroupInvites) {
    try { unsubGroupInvites(); } catch {}
    unsubGroupInvites = null;
  }
}

function startRealtime() {
  watchAuth(async (user) => {
    if (unsubProfile) { try { unsubProfile(); } catch {} unsubProfile = null; }
    if (unsubIncoming) { try { unsubIncoming(); } catch {} unsubIncoming = null; }
    if (unsubOutgoing) { try { unsubOutgoing(); } catch {} unsubOutgoing = null; }
    if (unsubMessages) { try { unsubMessages(); } catch {} unsubMessages = null; }
    teardownGroupListeners();

    if (!user) {
      state.user = null;
      state.profile = null;
      state.settings = { ...DEFAULT_SETTINGS };
      state.friends = [];
      state.blocked = [];
      state.incomingRequests = [];
      state.outgoingRequests = [];
      state.messages = [];
      state.unreadCount = 0;
      state.friendProfiles = {};
      state.selectedProfile = null;
      state.selectedProfileId = null;
      state.selectedConversationId = null;
      state.selectedGroupChatId = null;
      state.groupChats = [];
      state.groupMessagesByChat = {};
      state.groupInvites = [];
      emit();
      return;
    }

    state.user = user;
    state.profile = await ensureUserProfile(user);
    state.settings = { ...DEFAULT_SETTINGS, ...(state.profile?.socialSettings || {}) };
    state.friends = unique(state.profile?.friends);
    state.blocked = unique(state.profile?.blocked);
    state.selectedProfile = publicProfile(state.profile, user.uid);
    state.selectedProfileId = user.uid;
    await loadFriendProfiles(state.friends);
    emit();

    unsubProfile = onSnapshot(userRef(user.uid), async (snap) => {
      const fresh = snap.exists() ? snap.data() : null;
      state.profile = fresh;
      state.settings = { ...DEFAULT_SETTINGS, ...(fresh?.socialSettings || {}) };
      state.friends = unique(fresh?.friends);
      state.blocked = unique(fresh?.blocked);
      state.selectedProfile = state.selectedProfileId
        ? (state.selectedProfileId === user.uid ? publicProfile(fresh, user.uid) : state.friendProfiles[state.selectedProfileId] || state.selectedProfile)
        : publicProfile(fresh, user.uid);
      await loadFriendProfiles(state.friends);
      emit();
    });

    unsubIncoming = onSnapshot(query(collection(db, "friendRequests"), where("toUid", "==", user.uid)), (snap) => {
      const all = [];
      snap.forEach(d => all.push({ id: d.id, ...d.data() }));
      state.incomingRequests = sortNewestFirst(all.filter(r => r.status === "pending"));
      emit();
    });

    unsubOutgoing = onSnapshot(query(collection(db, "friendRequests"), where("fromUid", "==", user.uid)), (snap) => {
      const all = [];
      snap.forEach(d => all.push({ id: d.id, ...d.data() }));
      state.outgoingRequests = sortNewestFirst(all.filter(r => r.status === "pending"));
      emit();
    });

    unsubMessages = onSnapshot(query(collection(db, "messages"), where("participants", "array-contains", user.uid)), (snap) => {
      const all = [];
      snap.forEach(d => all.push({ id: d.id, ...d.data() }));
      const sorted = sortNewestFirst(all);
      state.messages = sorted;
      state.unreadCount = sorted.filter(m => m.toUid === user.uid && !unique(m.readBy).includes(user.uid)).length;
      emit();
    });

    unsubGroupChats = onSnapshot(query(collection(db, "groupChats"), where("members", "array-contains", user.uid)), (snap) => {
      const chats = [];
      snap.forEach(d => chats.push({ id: d.id, ...d.data() }));
      state.groupChats = sortNewestFirst(chats.filter(c => !c.deleted));

      if (!state.selectedGroupChatId && state.groupChats[0]) state.selectedGroupChatId = state.groupChats[0].id;
      if (state.selectedGroupChatId && !state.groupChats.some(c => c.id === state.selectedGroupChatId)) {
        state.selectedGroupChatId = state.groupChats[0]?.id || null;
      }

      const activeIds = new Set(state.groupChats.map(c => c.id));
      for (const [chatId, unsub] of groupMessageUnsubs.entries()) {
        if (!activeIds.has(chatId)) {
          try { unsub(); } catch {}
          groupMessageUnsubs.delete(chatId);
          delete state.groupMessagesByChat[chatId];
        }
      }

      for (const chat of state.groupChats) {
        if (groupMessageUnsubs.has(chat.id)) continue;
        const unsub = onSnapshot(collection(db, "groupChats", chat.id, "messages"), (msgSnap) => {
          const arr = [];
          msgSnap.forEach(m => arr.push({ id: m.id, ...m.data() }));
          state.groupMessagesByChat[chat.id] = sortNewestFirst(arr);
          emit();
        });
        groupMessageUnsubs.set(chat.id, unsub);
      }

      emit();
    });

    unsubGroupInvites = onSnapshot(query(collection(db, "groupChatInvites"), where("toUid", "==", user.uid)), (snap) => {
      const invites = [];
      snap.forEach(d => invites.push({ id: d.id, ...d.data() }));
      state.groupInvites = sortNewestFirst(invites.filter(i => i.status === "pending"));
      emit();
    });
  });
}

watchAuth(async () => {});
startRealtime();

export {
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
  createGroupChat,
  updateGroupChatInfo,
  addMembersToGroupChat,
  deleteGroupChat,
  inviteToGroupChat,
  respondToGroupInvite,
  sendGroupMessage,
  leaveGroupChat,
  markMessageRead,
  markAllMessagesRead,
  markAllMessagesUnread,
  viewProfileById,
  setSelectedConversation,
  setSelectedGroupChatId,
  getConversationMessages,
  getGroupChatMessages,
  getUnreadIncomingCount,
  openAccountArea,
  state as socialState
};