import { auth, db } from "./firebase-config.js";
import { watchAuth, ensureUserProfile } from "./auth.js";

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

const socialState = {
  user: null,
  profile: null,
  settings: { ...DEFAULT_SETTINGS },
  socialError: null,
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
let unsubMessages = null;
let unsubGroupChats = null;
let unsubGroupInvites = null;
const groupMessageUnsubs = new Map();
let knownMessageIds = new Set();
let messageToastReady = false;
const listenerErrors = new Map();

function cloneState() {
  return {
    ...socialState,
    friends: [...socialState.friends],
    blocked: [...socialState.blocked],
    incomingRequests: [...socialState.incomingRequests],
    outgoingRequests: [...socialState.outgoingRequests],
    messages: [...socialState.messages],
    groupChats: [...socialState.groupChats],
    groupInvites: [...socialState.groupInvites],
    groupMessagesByChat: Object.fromEntries(
      Object.entries(socialState.groupMessagesByChat).map(([k, v]) => [k, [...v]])
    ),
    friendProfiles: { ...socialState.friendProfiles }
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

function normalizeAccountSection(section) {
  return String(section || "info").trim().toLowerCase() === "friends" ? "info" : String(section || "info").trim().toLowerCase();
}

function buildAccountHref(section, sub = null, targetId = null) {
  const params = new URLSearchParams();
  if (section) params.set("tab", normalizeAccountSection(section));
  if (sub) params.set("sub", sub);
  if (targetId) params.set("target", targetId);
  const query = params.toString();
  return query ? `account-page.html?${query}` : "account-page.html";
}

function userRef(uid) {
  return doc(db, "users", uid);
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
      photoURL: profile.photoURL || "",
      email: profile.email || "",
      xp: profile.xp || 0,
      verified: !!profile.verified,
      createdAt: profile.createdAt || null,
      friends: unique(profile.friends),
      blocked: unique(profile.blocked),
      socialSettings: { ...(profile.socialSettings || DEFAULT_SETTINGS) },
      stats: profile.stats || {}
    };
  }

  return {
    uid: profile.uid,
    username: profile.username || "Player",
    photoURL: "",
    email: "",
    xp: 0,
    verified: !!profile.verified,
    createdAt: profile.createdAt || null,
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
    if (data) map[uid] = publicProfile(data, socialState.user?.uid);
  }
  socialState.friendProfiles = map;
  emit();
}

async function createMessage(payload) {
  return addDoc(collection(db, "messages"), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

function firstListenerError() {
  return [...listenerErrors.values()][0] || null;
}

function permissionSetupMessage() {
  return "Firestore rules are blocking part of the social system. Allow signed-in users to access their own user document plus message docs where their UID is in participants.";
}

function friendlyRealtimeError(scope, error) {
  const code = String(error?.code || "");
  if (code === "permission-denied") {
    return scope.startsWith("group")
      ? "Firestore rules are blocking group chat data. Friends can still work, but group chats and invites need matching Firestore permissions."
      : permissionSetupMessage();
  }

  return `Could not load ${scope}.`;
}

function clearListenerError(key, shouldEmit = false) {
  if (!listenerErrors.delete(key)) return;
  socialState.socialError = firstListenerError();
  if (shouldEmit) emit();
}

function setListenerError(key, scope, error, reset = null) {
  console.error(`${scope} listener error:`, error);
  listenerErrors.set(key, friendlyRealtimeError(scope, error));
  socialState.socialError = firstListenerError();
  if (typeof reset === "function") reset();
  emit();
}

async function getCurrentUserMessages() {
  const currentUid = cleanUid(auth.currentUser?.uid);
  if (!currentUid) return [];

  if (socialState.user?.uid === currentUid && Array.isArray(socialState.messages) && socialState.messages.length) {
    return [...socialState.messages];
  }

  const qs = await getDocs(query(collection(db, "messages"), where("participants", "array-contains", currentUid)));
  return qs.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
}

async function findPendingFriendRequestsWithUser(otherUid) {
  const currentUid = cleanUid(auth.currentUser?.uid);
  const other = cleanUid(otherUid);
  if (!currentUid || !other) return [];

  const messages = await getCurrentUserMessages();
  return messages.filter((data) => {
    if (data.kind !== "friend-request") return false;
    if ((data.status || "pending") !== "pending") return false;
    const participants = unique(data.participants);
    return participants.includes(currentUid) && participants.includes(other);
  });
}

function friendlyActionError(error) {
  const code = String(error?.code || "");
  if (code === "permission-denied") {
    return permissionSetupMessage();
  }

  return error?.message || "Social action failed.";
}

function toastConfigForMessage(message) {
  if (!message) return null;

  if (message.kind === "friend-request") {
    return {
      title: message.title || "Friend request",
      body: message.body || `${message.fromName || "Someone"} sent you a friend request.`,
      href: buildAccountHref("friends", "requests", message.fromUid || message.targetId || null)
    };
  }

  if (message.kind === "friend-accepted") {
    return {
      title: message.title || "Friend request accepted",
      body: message.body || `${message.fromName || "Someone"} accepted your friend request.`,
      href: buildAccountHref("friends", "friends", message.targetId || message.fromUid || null)
    };
  }

  if (message.kind === "friend-declined") {
    return {
      title: message.title || "Friend request declined",
      body: message.body || `${message.fromName || "Someone"} declined your friend request.`,
      href: buildAccountHref("messages", "system")
    };
  }

  return null;
}

function maybeToastNewMessages(messages) {
  const currentUid = socialState.user?.uid;
  const ids = new Set((messages || []).map(message => message.id));

  if (!currentUid) {
    knownMessageIds = ids;
    messageToastReady = false;
    return;
  }

  if (!messageToastReady) {
    knownMessageIds = ids;
    messageToastReady = true;
    return;
  }

  const freshIncoming = (messages || []).filter(message =>
    message.toUid === currentUid &&
    !knownMessageIds.has(message.id) &&
    !unique(message.readBy).includes(currentUid)
  );

  knownMessageIds = ids;

  if (typeof window.PanategwaToast !== "function") return;

  freshIncoming
    .slice()
    .reverse()
    .forEach(message => {
      const config = toastConfigForMessage(message);
      if (config) window.PanategwaToast(config);
    });
}

async function sendFriendRequestById(targetUid, note = "") {
  try {
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
    if (unique(me?.friends).includes(id)) throw new Error("You are already friends with that user.");
    if (unique(me?.blocked).includes(id) || unique(target?.blocked).includes(user.uid)) throw new Error("You cannot send a request to this user.");

    const pendingBetween = await findPendingFriendRequestsWithUser(id);
    const outgoingPending = pendingBetween.find((request) => request.fromUid === user.uid && request.toUid === id);
    if (outgoingPending) throw new Error("You already have a pending friend request to that user.");

    const incomingPending = pendingBetween.find((request) => request.fromUid === id && request.toUid === user.uid);
    if (incomingPending) throw new Error("That user already sent you a request. Open your requests to accept it.");

    const ref = await createMessage({
      fromUid: user.uid,
      toUid: id,
      participants: [user.uid, id],
      fromName: usernameOf(me),
      toName: usernameOf(target),
      kind: "friend-request",
      status: "pending",
      title: "Friend request",
      body: note ? `${usernameOf(me)}: ${note}` : `${usernameOf(me)} sent you a friend request.`,
      targetSection: "info",
      targetSubSection: "requests",
      requestId: null,
      readBy: [user.uid]
    });

    return ref.id;
  } catch (error) {
    throw new Error(friendlyActionError(error));
  }
}

async function respondToFriendRequest(requestId, action) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const ref = doc(db, "messages", requestId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Request not found.");

  const req = snap.data();
  if (req.kind !== "friend-request") throw new Error("That is not a friend request.");
  if (req.toUid !== user.uid) throw new Error("You cannot edit this request.");
  if ((req.status || "pending") !== "pending") throw new Error("That request is no longer pending.");

  const senderRef = userRef(req.fromUid);
  const receiverRef = userRef(req.toUid);
  const me = await loadUser(user.uid);
  const sender = await loadUser(req.fromUid);
  const currentName = usernameOf(me);
  const senderName = usernameOf(sender);

  if (action === "accept") {
    await setDoc(senderRef, { friends: arrayUnion(user.uid), blocked: arrayRemove(user.uid), updatedAt: serverTimestamp() }, { merge: true });
    await setDoc(receiverRef, { friends: arrayUnion(req.fromUid), blocked: arrayRemove(req.fromUid), updatedAt: serverTimestamp() }, { merge: true });
    await updateDoc(ref, { status: "accepted", readBy: arrayUnion(user.uid), updatedAt: serverTimestamp() });

    await createMessage({
      fromUid: user.uid,
      toUid: req.fromUid,
      participants: [user.uid, req.fromUid],
      fromName: currentName,
      toName: senderName,
      kind: "friend-accepted",
      title: "Friend request accepted",
      body: `${currentName} accepted your friend request.`,
      targetSection: "info",
      targetSubSection: "friends",
      targetId: user.uid,
      readBy: [user.uid]
    });
    return;
  }

  if (action === "ignore") {
    await updateDoc(ref, { status: "ignored", readBy: arrayUnion(user.uid), updatedAt: serverTimestamp() });
    return;
  }

  if (action === "decline") {
    await updateDoc(ref, { status: "declined", readBy: arrayUnion(user.uid), updatedAt: serverTimestamp() });
    await createMessage({
      fromUid: user.uid,
      toUid: req.fromUid,
      participants: [user.uid, req.fromUid],
      fromName: currentName,
      toName: senderName,
      kind: "friend-declined",
      title: "Friend request declined",
      body: `${currentName} declined your friend request.`,
      targetSection: "messages",
      targetSubSection: "system",
      targetId: null,
      readBy: [user.uid]
    });
    return;
  }

  if (action === "block") {
    await setDoc(receiverRef, { blocked: arrayUnion(req.fromUid), friends: arrayRemove(req.fromUid), updatedAt: serverTimestamp() }, { merge: true });
    await setDoc(senderRef, { friends: arrayRemove(user.uid), updatedAt: serverTimestamp() }, { merge: true });
    await updateDoc(ref, { status: "blocked", readBy: arrayUnion(user.uid), updatedAt: serverTimestamp() });
    await createMessage({
      fromUid: user.uid,
      toUid: req.fromUid,
      participants: [user.uid, req.fromUid],
      fromName: currentName,
      toName: senderName,
      kind: "friend-blocked",
      title: "Blocked",
      body: `${currentName} blocked you.`,
      targetSection: "messages",
      targetSubSection: "system",
      targetId: null,
      readBy: [user.uid]
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
    participants: [user.uid, id],
    fromName: usernameOf(me),
    toName: usernameOf(target),
    kind: "chat",
    title: `Message from ${usernameOf(me)}`,
    body,
    targetSection: "messages",
    targetSubSection: "chat",
    conversationUid: id,
    readBy: [user.uid]
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

  const members = unique([user.uid, ...memberIds.map(v => String(v || "").trim())]);
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

async function joinGroupChatById(chatId) {
  const user = auth.currentUser;
  const id = cleanUid(chatId);
  if (!user) throw new Error("Not logged in.");
  if (!id) throw new Error("Enter a group chat ID.");

  const ref = doc(db, "groupChats", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Group chat not found.");

  const chat = snap.data();
  if (chat.deleted) throw new Error("That chat was deleted.");

  await updateDoc(ref, {
    members: arrayUnion(user.uid),
    updatedAt: serverTimestamp()
  });
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

  const members = unique(memberIds.map(v => String(v || "").trim())).filter(uid => uid && uid !== user.uid && !unique(chat.members).includes(uid));
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
    participants: [user.uid, id],
    fromName: usernameOf(await loadUser(user.uid)),
    toName: usernameOf(await loadUser(id)),
    kind: "group-invite",
    title: "Group invite",
    body: `${usernameOf(await loadUser(user.uid))} invited you to "${chat.name || "Group chat"}".`,
    targetSection: "messages",
    targetSubSection: "chat",
    targetId: chatId,
    groupChatId: chatId,
    readBy: [user.uid]
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
  socialState.selectedProfileId = cleanUid(uid) || null;
  socialState.selectedProfile = publicProfile(data, socialState.user?.uid);
  emit();
  return socialState.selectedProfile;
}

function setSelectedConversation(uid) {
  socialState.selectedConversationId = cleanUid(uid) || null;
  emit();
}

function setSelectedGroupChatId(chatId) {
  socialState.selectedGroupChatId = cleanUid(chatId) || null;
  emit();
}

function getConversationMessages(uid) {
  const id = cleanUid(uid);
  if (!id) return [];
  return (socialState.messages || []).filter(m =>
    m.kind === "chat" &&
    ((m.fromUid === socialState.user?.uid && m.toUid === id) || (m.fromUid === id && m.toUid === socialState.user?.uid))
  );
}

function getGroupChatMessages(chatId) {
  return socialState.groupMessagesByChat?.[cleanUid(chatId)] || [];
}

function getUnreadIncomingCount() {
  const uid = socialState.user?.uid;
  if (!uid) return 0;
  return (socialState.messages || []).filter(m => m.toUid === uid && !unique(m.readBy).includes(uid)).length;
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
    if (unsubMessages) { try { unsubMessages(); } catch {} unsubMessages = null; }
    teardownGroupListeners();

    if (!user) {
      listenerErrors.clear();
      socialState.user = null;
      socialState.profile = null;
      socialState.settings = { ...DEFAULT_SETTINGS };
      socialState.socialError = null;
      socialState.friends = [];
      socialState.blocked = [];
      socialState.incomingRequests = [];
      socialState.outgoingRequests = [];
      socialState.messages = [];
      socialState.unreadCount = 0;
      socialState.friendProfiles = {};
      socialState.selectedProfile = null;
      socialState.selectedProfileId = null;
      socialState.selectedConversationId = null;
      socialState.selectedGroupChatId = null;
      socialState.groupChats = [];
      socialState.groupMessagesByChat = {};
      socialState.groupInvites = [];
      knownMessageIds = new Set();
      messageToastReady = false;
      emit();
      return;
    }

    listenerErrors.clear();
    socialState.user = user;
    socialState.profile = await ensureUserProfile(user);
    socialState.settings = { ...DEFAULT_SETTINGS, ...(socialState.profile?.socialSettings || {}) };
    socialState.socialError = null;
    socialState.friends = unique(socialState.profile?.friends);
    socialState.blocked = unique(socialState.profile?.blocked);
    socialState.selectedProfile = publicProfile(socialState.profile, user.uid);
    socialState.selectedProfileId = user.uid;
    await loadFriendProfiles([...socialState.friends, ...socialState.blocked]);
    emit();

    unsubProfile = onSnapshot(userRef(user.uid), async (snap) => {
      clearListenerError("profile");
      const fresh = snap.exists() ? snap.data() : null;
      socialState.profile = fresh;
      socialState.settings = { ...DEFAULT_SETTINGS, ...(fresh?.socialSettings || {}) };
      socialState.friends = unique(fresh?.friends);
      socialState.blocked = unique(fresh?.blocked);
      socialState.selectedProfile = socialState.selectedProfileId
        ? (socialState.selectedProfileId === user.uid ? publicProfile(fresh, user.uid) : socialState.friendProfiles[socialState.selectedProfileId] || socialState.selectedProfile)
        : publicProfile(fresh, user.uid);
      await loadFriendProfiles([...socialState.friends, ...socialState.blocked]);
      emit();
    }, (error) => {
      setListenerError("profile", "profile", error);
    });

    unsubMessages = onSnapshot(query(collection(db, "messages"), where("participants", "array-contains", user.uid)), (snap) => {
      clearListenerError("messages");
      const all = [];
      snap.forEach(d => all.push({ id: d.id, ...d.data() }));
      const sorted = sortNewestFirst(all);
      maybeToastNewMessages(sorted);
      socialState.messages = sorted;
      socialState.incomingRequests = sortNewestFirst(sorted.filter(m => m.kind === "friend-request" && m.toUid === user.uid && (m.status || "pending") === "pending"));
      socialState.outgoingRequests = sortNewestFirst(sorted.filter(m => m.kind === "friend-request" && m.fromUid === user.uid && (m.status || "pending") === "pending"));
      socialState.unreadCount = sorted.filter(m => m.toUid === user.uid && !unique(m.readBy).includes(user.uid)).length;
      emit();
    }, (error) => {
      setListenerError("messages", "messages", error, () => {
        socialState.messages = [];
        socialState.incomingRequests = [];
        socialState.outgoingRequests = [];
        socialState.unreadCount = 0;
      });
    });

    unsubGroupChats = onSnapshot(query(collection(db, "groupChats"), where("members", "array-contains", user.uid)), (snap) => {
      clearListenerError("groupChats");
      const chats = [];
      snap.forEach(d => chats.push({ id: d.id, ...d.data() }));
      socialState.groupChats = sortNewestFirst(chats.filter(c => !c.deleted));

      if (!socialState.selectedGroupChatId && socialState.groupChats[0]) socialState.selectedGroupChatId = socialState.groupChats[0].id;
      if (socialState.selectedGroupChatId && !socialState.groupChats.some(c => c.id === socialState.selectedGroupChatId)) {
        socialState.selectedGroupChatId = socialState.groupChats[0]?.id || null;
      }

      const activeIds = new Set(socialState.groupChats.map(c => c.id));
      for (const [chatId, unsub] of groupMessageUnsubs.entries()) {
        if (!activeIds.has(chatId)) {
          try { unsub(); } catch {}
          groupMessageUnsubs.delete(chatId);
          delete socialState.groupMessagesByChat[chatId];
        }
      }

      for (const chat of socialState.groupChats) {
        if (groupMessageUnsubs.has(chat.id)) continue;
        const unsub = onSnapshot(collection(db, "groupChats", chat.id, "messages"), (msgSnap) => {
          clearListenerError(`groupMessage:${chat.id}`);
          const arr = [];
          msgSnap.forEach(m => arr.push({ id: m.id, ...m.data() }));
          socialState.groupMessagesByChat[chat.id] = sortNewestFirst(arr);
          emit();
        }, (error) => {
          setListenerError(`groupMessage:${chat.id}`, "group messages", error, () => {
            delete socialState.groupMessagesByChat[chat.id];
          });
        });
        groupMessageUnsubs.set(chat.id, unsub);
      }

      emit();
    }, (error) => {
      setListenerError("groupChats", "group chats", error, () => {
        socialState.groupChats = [];
        socialState.groupMessagesByChat = {};
        socialState.selectedGroupChatId = null;
      });
    });

    unsubGroupInvites = onSnapshot(query(collection(db, "groupChatInvites"), where("toUid", "==", user.uid)), (snap) => {
      clearListenerError("groupInvites");
      const invites = [];
      snap.forEach(d => invites.push({ id: d.id, ...d.data() }));
      socialState.groupInvites = sortNewestFirst(invites.filter(i => i.status === "pending"));
      emit();
    }, (error) => {
      setListenerError("groupInvites", "group invites", error, () => {
        socialState.groupInvites = [];
      });
    });
  });
}

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
  joinGroupChatById,
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
  socialState
};
