import { auth, db } from "./firebase-config.js";
import { watchAuth, ensureUserProfile, getDefaultAvatarDataUrl } from "./auth.js";
import { ensurePanategwaToast } from "./toast.js";

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

function normalizePrivacySettings(settings = {}) {
  return {
    showRank: settings.showRank !== false,
    showJoined: settings.showJoined !== false,
    showStreaks: settings.showStreaks !== false
  };
}

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
const listenerErrors = new Map();
const TOAST_STORAGE_LIMIT = 160;

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

function activeUser() {
  return auth.currentUser || socialState.user || null;
}

function isVerifiedUser(user = null, profile = null) {
  return !!(user?.emailVerified || profile?.verified);
}

async function requireSocialUser(feature = "this feature", options = {}) {
  const user = activeUser();
  if (!user) throw new Error("Log in first.");

  const needsVerified = options.requireVerified !== false;
  const profile = socialState.profile || await loadUser(user.uid) || await ensureUserProfile(user);
  if (needsVerified && !isVerifiedUser(user, profile)) {
    throw new Error(`Verify your email before you use ${feature}.`);
  }

  return { user, profile };
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

function toastStorageKey(uid, channel = "messages") {
  return `ptg_social_toasts_${channel}_${uid}`;
}

function loadSeenToastIds(uid, channel = "messages") {
  try {
    const raw = sessionStorage.getItem(toastStorageKey(uid, channel));
    const arr = JSON.parse(raw || "[]");
    return new Set(Array.isArray(arr) ? arr.map((value) => String(value || "").trim()).filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

function saveSeenToastIds(uid, ids, channel = "messages") {
  try {
    const next = [...ids].slice(-TOAST_STORAGE_LIMIT);
    sessionStorage.setItem(toastStorageKey(uid, channel), JSON.stringify(next));
  } catch {}
}

function normalizeAccountSection(section) {
  return String(section || "info").trim().toLowerCase() === "friends" ? "messages" : String(section || "info").trim().toLowerCase();
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

function rankFromXp(xp) {
  if (Number(xp || 0) >= 30) return "Veteran";
  if (Number(xp || 0) >= 20) return "Experienced";
  if (Number(xp || 0) >= 10) return "Explorer";
  return "Adventurer";
}

function syncUnreadCount() {
  const uid = socialState.user?.uid;
  if (!uid) {
    socialState.unreadCount = 0;
    return;
  }

  const unreadDirect = (socialState.messages || []).filter((message) => message.kind === "chat" && isUnreadForUser(message, uid)).length;
  socialState.unreadCount = unreadDirect + Number(socialState.incomingRequests?.length || 0);
}

function currentStreakOf(profile) {
  return Number(profile?.streak?.current || 0);
}

function longestStreakOf(profile) {
  return Number(profile?.longestStreak || profile?.streak?.longest || currentStreakOf(profile) || 0);
}

function publicProfile(profile, viewerUid) {
  if (!profile) return null;
  const self = profile.uid === viewerUid;
  const friends = unique(profile.friends);
  const blocked = unique(profile.blocked);
  const privacy = normalizePrivacySettings(profile.privacySettings);
  const viewerIsFriend = !!viewerUid && friends.includes(viewerUid);
  const canViewProfile = self || viewerIsFriend;

  if (!canViewProfile) {
    return {
      uid: profile.uid,
      username: profile.username || "Player",
      photoURL: getDefaultAvatarDataUrl(),
      email: "",
      xp: null,
      verified: null,
      createdAt: null,
      friends: [],
      blocked: [],
      socialSettings: { ...(profile.socialSettings || DEFAULT_SETTINGS), profileHidden: true },
      privacySettings: privacy,
      stats: {},
      canViewProfile: false,
      friendsOnly: true,
      currentRank: null,
      streakCurrent: null,
      streakLongest: null
    };
  }

  const canShowRank = self || privacy.showRank;
  const canShowJoined = self || privacy.showJoined;
  const canShowStreaks = self || privacy.showStreaks;

  return {
    uid: profile.uid,
    username: profile.username || "Player",
    photoURL: profile.photoURL || getDefaultAvatarDataUrl(),
    email: self ? (profile.email || "") : "",
    xp: canShowRank ? Number(profile.xp || 0) : null,
    verified: !!profile.verified,
    createdAt: canShowJoined ? (profile.createdAt || null) : null,
    friends,
    blocked,
    socialSettings: { ...(profile.socialSettings || DEFAULT_SETTINGS) },
    privacySettings: privacy,
    stats: profile.stats || {},
    canViewProfile: true,
    friendsOnly: true,
    currentRank: canShowRank ? rankFromXp(profile.xp || 0) : null,
    streakCurrent: canShowStreaks ? currentStreakOf(profile) : null,
    streakLongest: canShowStreaks ? longestStreakOf(profile) : null
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
  const currentUid = cleanUid(activeUser()?.uid);
  if (!currentUid) return [];

  if (socialState.user?.uid === currentUid && Array.isArray(socialState.messages) && socialState.messages.length) {
    return [...socialState.messages];
  }

  const qs = await getDocs(query(collection(db, "messages"), where("participants", "array-contains", currentUid)));
  return qs.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
}

async function findPendingFriendRequestsWithUser(otherUid) {
  const currentUid = cleanUid(activeUser()?.uid);
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

function isUnreadForUser(message, uid) {
  const currentUid = cleanUid(uid);
  if (!currentUid || !message || cleanUid(message.toUid) !== currentUid) return false;
  return !unique(message.readBy).includes(currentUid);
}

function shortenToastBody(value, max = 120) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function toastConfigForMessage(message) {
  if (!message) return null;

  if (message.kind === "friend-request") {
    return {
      title: message.title || "Friend request",
      body: message.body || `${message.fromName || "Someone"} sent you a friend request.`,
      href: buildAccountHref("messages", "requests", message.fromUid || message.targetId || null)
    };
  }

  if (message.kind === "friend-accepted") {
    return {
      title: message.title || "Friend request accepted",
      body: message.body || `${message.fromName || "Someone"} accepted your friend request.`,
      href: buildAccountHref("messages", "direct", message.fromUid || message.targetId || null)
    };
  }

  if (message.kind === "friend-declined") {
    return {
      title: message.title || "Friend request declined",
      body: message.body || `${message.fromName || "Someone"} declined your friend request.`,
      href: buildAccountHref("messages", "requests")
    };
  }

  if (message.kind === "friend-removed") {
    return {
      title: message.title || "Friend removed",
      body: message.body || `${message.fromName || "Someone"} removed you from their friends list.`,
      href: buildAccountHref("messages", "direct", message.fromUid || message.targetId || null)
    };
  }

  if (message.kind === "friend-blocked") {
    return {
      title: message.title || "Blocked",
      body: message.body || `${message.fromName || "Someone"} blocked you.`,
      href: buildAccountHref("messages", "direct", message.fromUid || message.targetId || null)
    };
  }

  if (message.kind === "group-invite") {
    return {
      title: message.title || "Group invite",
      body: message.body || `${message.fromName || "Someone"} invited you to a group chat.`,
      href: buildAccountHref("messages", "groups", message.groupChatId || message.targetId || null)
    };
  }

  if (message.kind === "chat") {
    const targetUid = cleanUid(message.fromUid || message.targetId || message.conversationUid);
    return {
      title: message.title || `Message from ${message.fromName || "Someone"}`,
      body: shortenToastBody(message.body || ""),
      href: buildAccountHref("messages", "direct", targetUid || null)
    };
  }

  return {
    title: message.title || "New message",
    body: shortenToastBody(message.body || ""),
    href: buildAccountHref(message.targetSection || "messages", message.targetSubSection || "direct", message.targetId || null)
  };
}

function maybeToastNewMessages(messages) {
  const currentUid = socialState.user?.uid;

  if (!currentUid) {
    return;
  }

  ensurePanategwaToast();

  const seenIds = loadSeenToastIds(currentUid, "messages");
  const freshIncoming = (messages || []).filter(message =>
    message.toUid === currentUid &&
    !seenIds.has(message.id) &&
    !unique(message.readBy).includes(currentUid)
  );

  if (typeof window.PanategwaToast !== "function") return;

  const toastable = freshIncoming.filter((message) => {
    return ["chat", "friend-request", "friend-accepted", "friend-declined", "friend-removed", "friend-blocked"].includes(message.kind)
      && !!toastConfigForMessage(message);
  });
  if (!toastable.length) return;

  toastable
    .slice()
    .reverse()
    .forEach(message => {
      const config = toastConfigForMessage(message);
      if (config) window.PanategwaToast(config);
    });

  toastable.forEach(message => seenIds.add(message.id));
  saveSeenToastIds(currentUid, seenIds, "messages");
}

function maybeToastPendingGroupInvites(invites) {
  const currentUid = socialState.user?.uid;
  ensurePanategwaToast();
  if (!currentUid || typeof window.PanategwaToast !== "function") return;

  const seenIds = loadSeenToastIds(currentUid, "group-invites");
  const fresh = (invites || []).filter((invite) => invite.status === "pending" && !seenIds.has(invite.id));
  if (!fresh.length) return;

  fresh
    .slice()
    .reverse()
    .forEach((invite) => {
      window.PanategwaToast({
        title: "Group invite",
        body: `${invite.fromName || invite.fromUid || "Someone"} invited you to "${invite.chatName || "Group chat"}".`,
        href: buildAccountHref("messages", "groups", invite.chatId || null)
      });
      seenIds.add(invite.id);
    });

  saveSeenToastIds(currentUid, seenIds, "group-invites");
}

function maybeToastNewGroupMessages(chat, messages) {
  const currentUid = socialState.user?.uid;
  ensurePanategwaToast();
  if (!currentUid || typeof window.PanategwaToast !== "function" || !chat?.id) return;

  const seenIds = loadSeenToastIds(currentUid, "group-messages");
  const fresh = (messages || []).filter((message) => {
    const toastId = `${chat.id}:${message.id}`;
    return cleanUid(message.fromUid) !== currentUid && !seenIds.has(toastId);
  });

  if (!fresh.length) return;

  fresh
    .slice()
    .reverse()
    .forEach((message) => {
      const toastId = `${chat.id}:${message.id}`;
      window.PanategwaToast({
        title: `${message.fromName || "Someone"} in ${chat.name || "Group chat"}`,
        body: shortenToastBody(message.body || ""),
        href: buildAccountHref("messages", "groups", chat.id)
      });
      seenIds.add(toastId);
    });

  saveSeenToastIds(currentUid, seenIds, "group-messages");
}

function relationshipTargetUid(message, currentUid) {
  const target = cleanUid(message?.targetId);
  const from = cleanUid(message?.fromUid);
  const to = cleanUid(message?.toUid);

  if (target && target !== currentUid) return target;
  if (from && from !== currentUid) return from;
  if (to && to !== currentUid) return to;
  return "";
}

async function syncRelationshipSignals(messages) {
  const user = auth.currentUser;
  if (!user) return;

  const currentFriends = new Set(unique(socialState.profile?.friends));
  const currentBlocked = new Set(unique(socialState.profile?.blocked));
  const toAdd = new Set();
  const toRemove = new Set();

  for (const message of messages || []) {
    if (message.toUid !== user.uid) continue;

    const otherUid = relationshipTargetUid(message, user.uid);
    if (!otherUid) continue;

    if (message.kind === "friend-accepted" && !currentBlocked.has(otherUid)) {
      toAdd.add(otherUid);
    }

    if (message.kind === "friend-removed" || message.kind === "friend-blocked") {
      toRemove.add(otherUid);
    }
  }

  for (const uid of toRemove) {
    toAdd.delete(uid);
  }

  const addIds = [...toAdd].filter((uid) => !currentFriends.has(uid));
  const removeIds = [...toRemove].filter((uid) => currentFriends.has(uid));
  if (!addIds.length && !removeIds.length) return;

  const ref = userRef(user.uid);

  if (addIds.length) {
    await setDoc(ref, {
      friends: arrayUnion(...addIds),
      blocked: arrayRemove(...addIds),
      updatedAt: serverTimestamp()
    }, { merge: true });
  }

  if (removeIds.length) {
    await setDoc(ref, {
      friends: arrayRemove(...removeIds),
      updatedAt: serverTimestamp()
    }, { merge: true });
  }
}

async function sendFriendRequestById(targetUid, note = "") {
  try {
    const { user } = await requireSocialUser("friend requests");
    const id = cleanUid(targetUid);
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
      targetSection: "messages",
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
  try {
    const { user } = await requireSocialUser("friend requests");

    const ref = doc(db, "messages", requestId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Request not found.");

    const req = snap.data();
    if (req.kind !== "friend-request") throw new Error("That is not a friend request.");
    if (req.toUid !== user.uid) throw new Error("You cannot edit this request.");
    if ((req.status || "pending") !== "pending") throw new Error("That request is no longer pending.");

    const receiverRef = userRef(req.toUid);
    const me = await loadUser(user.uid);
    const sender = await loadUser(req.fromUid);
    const currentName = usernameOf(me);
    const senderName = usernameOf(sender);

    if (action === "accept") {
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
        targetSection: "messages",
        targetSubSection: "direct",
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
        targetSubSection: "requests",
        targetId: null,
        readBy: [user.uid]
      });
      return;
    }

    if (action === "block") {
      await setDoc(receiverRef, { blocked: arrayUnion(req.fromUid), friends: arrayRemove(req.fromUid), updatedAt: serverTimestamp() }, { merge: true });
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
        targetSubSection: "direct",
        targetId: user.uid,
        readBy: [user.uid]
      });
    }
  } catch (error) {
    throw new Error(friendlyActionError(error));
  }
}

async function sendChatMessage(friendUid, text) {
  const { user } = await requireSocialUser("direct messages");
  const id = cleanUid(friendUid);
  const body = String(text || "").trim();

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
    targetSubSection: "direct",
    conversationUid: id,
    readBy: [user.uid]
  });
}

async function removeFriend(friendUid) {
  try {
    const { user } = await requireSocialUser("friend actions");
    const id = cleanUid(friendUid);
    if (!id) throw new Error("Enter a friend ID.");

    const me = await loadUser(user.uid);
    const target = await loadUser(id);

    await setDoc(userRef(user.uid), { friends: arrayRemove(id), updatedAt: serverTimestamp() }, { merge: true });

    if (target) {
      await createMessage({
        fromUid: user.uid,
        toUid: id,
        participants: [user.uid, id],
        fromName: usernameOf(me),
        toName: usernameOf(target),
        kind: "friend-removed",
        title: "Friend removed",
        body: `${usernameOf(me)} removed you from their friends list.`,
        targetSection: "messages",
        targetSubSection: "direct",
        targetId: user.uid,
        readBy: [user.uid]
      });
    }
  } catch (error) {
    throw new Error(friendlyActionError(error));
  }
}

async function blockUser(targetUid) {
  try {
    const { user } = await requireSocialUser("friend actions");
    const id = cleanUid(targetUid);
    if (!id) throw new Error("Enter a user ID.");

    const me = await loadUser(user.uid);
    const target = await loadUser(id);

    await setDoc(userRef(user.uid), { blocked: arrayUnion(id), friends: arrayRemove(id), updatedAt: serverTimestamp() }, { merge: true });

    if (target) {
      await createMessage({
        fromUid: user.uid,
        toUid: id,
        participants: [user.uid, id],
        fromName: usernameOf(me),
        toName: usernameOf(target),
        kind: "friend-blocked",
        title: "Blocked",
        body: `${usernameOf(me)} blocked you.`,
        targetSection: "messages",
        targetSubSection: "direct",
        targetId: user.uid,
        readBy: [user.uid]
      });
    }
  } catch (error) {
    throw new Error(friendlyActionError(error));
  }
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
  const fromName = usernameOf(await loadUser(user.uid));

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
      fromName,
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
  const fromName = usernameOf(await loadUser(user.uid));
  for (const uid of members) {
    await addDoc(collection(db, "groupChatInvites"), {
      chatId,
      chatName: chat.name || "Group chat",
      chatEmoji: chat.emoji || "👥",
      fromUid: user.uid,
      fromName,
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
    fromName: usernameOf(await loadUser(user.uid)),
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
    targetSubSection: "groups",
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
  const { user } = await requireSocialUser("direct messages");
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

async function setMessagesReadState(messageIds = [], read = true) {
  const { user } = await requireSocialUser("direct messages");

  const uniqueIds = [...new Set((Array.isArray(messageIds) ? messageIds : []).map((value) => cleanUid(value)).filter(Boolean))];
  if (!uniqueIds.length) return;

  const messageMap = new Map((socialState.messages || []).map((message) => [message.id, message]));

  for (const messageId of uniqueIds) {
    const data = messageMap.get(messageId);
    if (!data || cleanUid(data.toUid) !== user.uid) continue;

    const alreadyRead = unique(data.readBy).includes(user.uid);
    if (read && alreadyRead) continue;
    if (!read && !alreadyRead) continue;

    await updateDoc(doc(db, "messages", messageId), read
      ? { readBy: arrayUnion(user.uid), readAt: serverTimestamp() }
      : { readBy: arrayRemove(user.uid), readAt: null });
  }
}

async function markAllMessagesRead() {
  const { user } = await requireSocialUser("direct messages");
  const ids = (socialState.messages || [])
    .filter((message) => cleanUid(message.toUid) === user.uid && isUnreadForUser(message, user.uid))
    .map((message) => message.id);
  await setMessagesReadState(ids, true);
}

async function markAllMessagesUnread() {
  const { user } = await requireSocialUser("direct messages");
  const ids = (socialState.messages || [])
    .filter((message) => cleanUid(message.toUid) === user.uid && !isUnreadForUser(message, user.uid))
    .map((message) => message.id);
  await setMessagesReadState(ids, false);
}

async function deleteMessageForCurrentUser(messageId) {
  const { user } = await requireSocialUser("direct messages");

  const id = cleanUid(messageId);
  if (!id) throw new Error("Message not found.");

  const ref = doc(db, "messages", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data();
  const participants = unique(data.participants);
  if (!participants.includes(user.uid) && cleanUid(data.toUid) !== user.uid && cleanUid(data.fromUid) !== user.uid) {
    throw new Error("You cannot delete that message.");
  }

  await updateDoc(ref, {
    deletedFor: arrayUnion(user.uid),
    updatedAt: serverTimestamp()
  });
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
  return socialState.unreadCount || 0;
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
  ensurePanategwaToast();
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
      syncUnreadCount();
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

    unsubMessages = onSnapshot(query(collection(db, "messages"), where("participants", "array-contains", user.uid)), async (snap) => {
      clearListenerError("messages");
      const all = [];
      snap.forEach(d => all.push({ id: d.id, ...d.data() }));
      const sorted = sortNewestFirst(all);
      maybeToastNewMessages(sorted);
      const visible = sorted.filter((message) => !unique(message.deletedFor).includes(user.uid));
      socialState.messages = visible;
      socialState.incomingRequests = sortNewestFirst(visible.filter(m => m.kind === "friend-request" && m.toUid === user.uid && (m.status || "pending") === "pending"));
      socialState.outgoingRequests = sortNewestFirst(visible.filter(m => m.kind === "friend-request" && m.fromUid === user.uid && (m.status || "pending") === "pending"));
      syncUnreadCount();
      await syncRelationshipSignals(sorted);
      emit();
    }, (error) => {
      setListenerError("messages", "messages", error, () => {
        socialState.messages = [];
        socialState.incomingRequests = [];
        socialState.outgoingRequests = [];
        syncUnreadCount();
      });
    });

    socialState.groupChats = [];
    socialState.groupMessagesByChat = {};
    socialState.groupInvites = [];
    socialState.selectedGroupChatId = null;
    syncUnreadCount();
    emit();
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
  setMessagesReadState,
  markAllMessagesRead,
  markAllMessagesUnread,
  deleteMessageForCurrentUser,
  viewProfileById,
  setSelectedConversation,
  setSelectedGroupChatId,
  getConversationMessages,
  getGroupChatMessages,
  getUnreadIncomingCount,
  socialState
};
