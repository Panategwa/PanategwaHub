import { auth, db } from "./firebase-config.js";
import { watchAuth, ensureUserProfile, getDefaultAvatarDataUrl, normalizeSiteTimeMs } from "./auth.js";
import { ensurePanategwaToast } from "./toast.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  arrayUnion,
  arrayRemove
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const DEFAULT_SETTINGS = {
  systemEnabled: true,
  requestsEnabled: true
};

function normalizePrivacySettings(settings = {}) {
  return {
    showRank: settings.showRank !== false,
    showJoined: settings.showJoined !== false,
    showStreaks: settings.showStreaks !== false,
    showSiteAge: settings.showSiteAge !== false
  };
}

const listeners = new Set();

const socialState = {
  ready: false,
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
  friendProfiles: {}
};

let unsubProfile = null;
let unsubMessages = null;
const listenerErrors = new Map();
const TOAST_STORAGE_LIMIT = 160;
let unreadSummaryToastUserId = "";
let hydratedMessagesUserId = "";

function cloneState() {
  return {
    ...socialState,
    friends: [...socialState.friends],
    blocked: [...socialState.blocked],
    incomingRequests: [...socialState.incomingRequests],
    outgoingRequests: [...socialState.outgoingRequests],
    messages: [...socialState.messages],
    friendProfiles: { ...socialState.friendProfiles }
  };
}

function emit() {
  listeners.forEach((fn) => fn(cloneState()));
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

function unreadSummaryStorageKey(uid) {
  return `ptg_social_unread_summary_${uid}`;
}

function loadUnreadSummarySignature(uid) {
  try {
    return String(localStorage.getItem(unreadSummaryStorageKey(uid)) || "");
  } catch {
    return "";
  }
}

function saveUnreadSummarySignature(uid, signature = "") {
  try {
    localStorage.setItem(unreadSummaryStorageKey(uid), String(signature || ""));
  } catch {}
}

function unreadSummarySignature(messages) {
  return [...new Set((Array.isArray(messages) ? messages : [])
    .map((message) => String(message?.id || "").trim())
    .filter(Boolean))]
    .sort()
    .join("|");
}

function socialUnreadStorageKey(uid) {
  return `ptg_social_unread_count_${uid}`;
}

function currentStoredUid() {
  try {
    return cleanUid(localStorage.getItem("ptg_current_uid"));
  } catch {
    return "";
  }
}

function syncSidebarUnreadIndicator() {
  const uid = cleanUid(socialState.user?.uid) || currentStoredUid();
  const count = Math.max(0, Number(socialState.unreadCount || 0));

  if (uid) {
    try {
      localStorage.setItem(socialUnreadStorageKey(uid), String(count));
    } catch {}
  }

  if (typeof window.PanategwaUpdateSidebarUnread === "function") {
    window.PanategwaUpdateSidebarUnread(count);
  }
}

function normalizeAccountSection(section) {
  return String(section || "info").trim().toLowerCase();
}

function buildAccountHref(section, sub = null, targetId = null) {
  const params = new URLSearchParams();
  if (section) params.set("tab", normalizeAccountSection(section));
  if (sub) params.set("sub", sub);
  if (targetId) params.set("target", targetId);
  const queryString = params.toString();
  return queryString ? `account-page.html?${queryString}` : "account-page.html";
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
    syncSidebarUnreadIndicator();
    return;
  }

  socialState.unreadCount = (socialState.messages || []).filter((message) => {
    return cleanUid(message.toUid) === uid && isUnreadForUser(message, uid);
  }).length;
  syncSidebarUnreadIndicator();
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
      socialSettings: { ...(profile.socialSettings || DEFAULT_SETTINGS) },
      privacySettings: privacy,
      stats: {},
      canViewProfile: false,
      friendsOnly: true,
      currentRank: null,
      streakCurrent: null,
      streakLongest: null,
      siteTimeMs: null
    };
  }

  const canShowRank = self || privacy.showRank;
  const canShowJoined = self || privacy.showJoined;
  const canShowStreaks = self || privacy.showStreaks;
  const canShowSiteAge = self || privacy.showSiteAge;

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
    friendsOnly: false,
    currentRank: canShowRank ? rankFromXp(profile.xp || 0) : null,
    streakCurrent: canShowStreaks ? currentStreakOf(profile) : null,
    streakLongest: canShowStreaks ? longestStreakOf(profile) : null,
    siteTimeMs: canShowSiteAge ? normalizeSiteTimeMs(profile.siteTimeMs) : null
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
  return "Firestore rules are blocking part of the friends system. Allow signed-in users to access their own user document plus notification docs where their UID is in participants.";
}

function friendlyBootstrapError(error) {
  const code = String(error?.code || "");
  if (code === "permission-denied") {
    return permissionSetupMessage();
  }

  return error?.message || "Could not load your friends right now.";
}

function friendlyRealtimeError(scope, error) {
  const code = String(error?.code || "");
  if (code === "permission-denied") {
    return permissionSetupMessage();
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

  return error?.message || "Friend action failed.";
}

function isUnreadForUser(message, uid) {
  const currentUid = cleanUid(uid);
  if (!currentUid || !message || cleanUid(message.toUid) !== currentUid) return false;
  return !unique(message.readBy).includes(currentUid);
}

function shortenToastBody(value, max = 120) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function toastConfigForMessage(message) {
  if (!message) return null;

  if (message.kind === "friend-request") {
    return {
      title: message.title || "Friend request",
      body: message.body || `${message.fromName || "Someone"} sent you a friend request.`,
      href: buildAccountHref("messages")
    };
  }

  if (message.kind === "friend-accepted") {
    return {
      title: message.title || "Friend request accepted",
      body: message.body || `${message.fromName || "Someone"} accepted your friend request.`,
      href: buildAccountHref("messages")
    };
  }

  if (message.kind === "friend-declined") {
    return {
      title: message.title || "Friend request declined",
      body: message.body || `${message.fromName || "Someone"} declined your friend request.`,
      href: buildAccountHref("messages")
    };
  }

  if (message.kind === "friend-removed") {
    return {
      title: message.title || "Friend removed",
      body: message.body || `${message.fromName || "Someone"} removed you from their friends list.`,
      href: buildAccountHref("messages")
    };
  }

  if (message.kind === "friend-blocked") {
    return {
      title: message.title || "Blocked",
      body: message.body || `${message.fromName || "Someone"} blocked you.`,
      href: buildAccountHref("messages")
    };
  }

  return {
    title: message.title || "Notification",
    body: shortenToastBody(message.body || ""),
    href: buildAccountHref("messages")
  };
}

function maybeToastNewMessages(messages) {
  const currentUid = socialState.user?.uid;
  if (!currentUid) return;

  ensurePanategwaToast();
  const toastFn = window.PanategwaToast;
  if (typeof toastFn !== "function") return;

  const seenIds = loadSeenToastIds(currentUid, "messages");
  const freshIncoming = (messages || []).filter((message) => {
    return cleanUid(message.toUid) === currentUid
      && !seenIds.has(message.id)
      && !unique(message.deletedFor).includes(currentUid)
      && isUnreadForUser(message, currentUid);
  });

  if (!freshIncoming.length) return;

  freshIncoming
    .slice()
    .reverse()
    .forEach((message) => {
      const config = toastConfigForMessage(message);
      if (config) toastFn(config);
    });

  freshIncoming.forEach((message) => seenIds.add(message.id));
  saveSeenToastIds(currentUid, seenIds, "messages");
}

function markIncomingMessagesAsSeen(messages, uid) {
  const currentUid = cleanUid(uid);
  if (!currentUid) return;

  const seenIds = loadSeenToastIds(currentUid, "messages");
  for (const message of messages || []) {
    if (message?.id) seenIds.add(message.id);
  }
  saveSeenToastIds(currentUid, seenIds, "messages");
}

function maybeToastUnreadSummary(messages, uid) {
  const currentUid = cleanUid(uid);
  if (!currentUid) return;

  ensurePanategwaToast();
  const toastFn = window.PanategwaToast;
  if (typeof toastFn !== "function") return;

  const unreadCount = Number(Array.isArray(messages) ? messages.length : 0);
  const signature = unreadSummarySignature(messages);
  if (unreadCount < 1 || !signature) {
    saveUnreadSummarySignature(currentUid, "");
    return;
  }

  if (loadUnreadSummarySignature(currentUid) === signature) return;

  unreadSummaryToastUserId = currentUid;
  saveUnreadSummarySignature(currentUid, signature);
  const label = unreadCount > 10 ? "10+" : String(unreadCount);
  const suffix = unreadCount === 1 ? "message" : "messages";

  toastFn({
    title: "Notifications",
    body: `You have ${label} new ${suffix}.`,
    href: buildAccountHref("messages")
  });
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
    if (cleanUid(message.toUid) !== user.uid) continue;

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
    if (unique(me?.blocked).includes(id) || unique(target?.blocked).includes(user.uid)) {
      throw new Error("You cannot send a request to this user.");
    }

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

    const request = snap.data();
    if (request.kind !== "friend-request") throw new Error("That is not a friend request.");
    if (cleanUid(request.toUid) !== user.uid) throw new Error("You cannot edit this request.");
    if ((request.status || "pending") !== "pending") throw new Error("That request is no longer pending.");

    const receiverRef = userRef(request.toUid);
    const me = await loadUser(user.uid);
    const sender = await loadUser(request.fromUid);
    const currentName = usernameOf(me);
    const senderName = usernameOf(sender);

    if (action === "accept") {
      await setDoc(receiverRef, {
        friends: arrayUnion(request.fromUid),
        blocked: arrayRemove(request.fromUid),
        updatedAt: serverTimestamp()
      }, { merge: true });
      await updateDoc(ref, { status: "accepted", readBy: arrayUnion(user.uid), updatedAt: serverTimestamp() });

      await createMessage({
        fromUid: user.uid,
        toUid: request.fromUid,
        participants: [user.uid, request.fromUid],
        fromName: currentName,
        toName: senderName,
        kind: "friend-accepted",
        title: "Friend request accepted",
        body: `${currentName} accepted your friend request.`,
        targetSection: "messages",
        targetSubSection: "requests",
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
        toUid: request.fromUid,
        participants: [user.uid, request.fromUid],
        fromName: currentName,
        toName: senderName,
        kind: "friend-declined",
        title: "Friend request declined",
        body: `${currentName} declined your friend request.`,
        targetSection: "messages",
        targetSubSection: "requests",
        targetId: user.uid,
        readBy: [user.uid]
      });
      return;
    }

    if (action === "block") {
      await setDoc(receiverRef, {
        blocked: arrayUnion(request.fromUid),
        friends: arrayRemove(request.fromUid),
        updatedAt: serverTimestamp()
      }, { merge: true });
      await updateDoc(ref, { status: "blocked", readBy: arrayUnion(user.uid), updatedAt: serverTimestamp() });
      await createMessage({
        fromUid: user.uid,
        toUid: request.fromUid,
        participants: [user.uid, request.fromUid],
        fromName: currentName,
        toName: senderName,
        kind: "friend-blocked",
        title: "Blocked",
        body: `${currentName} blocked you.`,
        targetSection: "messages",
        targetSubSection: "requests",
        targetId: user.uid,
        readBy: [user.uid]
      });
      return;
    }

    throw new Error("Unknown friend request action.");
  } catch (error) {
    throw new Error(friendlyActionError(error));
  }
}

async function removeFriend(friendUid) {
  try {
    const { user } = await requireSocialUser("friend actions");
    const id = cleanUid(friendUid);
    if (!id) throw new Error("Enter a friend ID.");

    const me = await loadUser(user.uid);
    const target = await loadUser(id);

    await setDoc(userRef(user.uid), {
      friends: arrayRemove(id),
      updatedAt: serverTimestamp()
    }, { merge: true });

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
        targetSubSection: "friends",
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

    await setDoc(userRef(user.uid), {
      blocked: arrayUnion(id),
      friends: arrayRemove(id),
      updatedAt: serverTimestamp()
    }, { merge: true });

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
        targetSubSection: "blocked",
        targetId: user.uid,
        readBy: [user.uid]
      });
    }
  } catch (error) {
    throw new Error(friendlyActionError(error));
  }
}

async function unblockUser(targetUid) {
  try {
    const { user } = await requireSocialUser("friend actions");
    const id = cleanUid(targetUid);
    if (!id) throw new Error("Enter a user ID.");

    await setDoc(userRef(user.uid), {
      blocked: arrayRemove(id),
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    throw new Error(friendlyActionError(error));
  }
}

async function markMessageRead(messageId, read = true) {
  const { user } = await requireSocialUser("notifications");
  const ref = doc(db, "messages", messageId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data();
  if (cleanUid(data.toUid) !== user.uid) return;

  if (read) {
    await updateDoc(ref, { readBy: arrayUnion(user.uid), readAt: serverTimestamp() });
    return;
  }

  await updateDoc(ref, { readBy: arrayRemove(user.uid), readAt: null });
}

async function setMessageDeletedForCurrentUser(messageId, deleted = true) {
  const { user } = await requireSocialUser("notifications");

  const id = cleanUid(messageId);
  if (!id) throw new Error("Notification not found.");

  const ref = doc(db, "messages", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data();
  const participants = unique(data.participants);
  if (!participants.includes(user.uid) && cleanUid(data.toUid) !== user.uid && cleanUid(data.fromUid) !== user.uid) {
    throw new Error("You cannot change that notification.");
  }

  await updateDoc(ref, deleted
    ? { deletedFor: arrayUnion(user.uid), updatedAt: serverTimestamp() }
    : { deletedFor: arrayRemove(user.uid), updatedAt: serverTimestamp() });
}

function resetSocialState() {
  listenerErrors.clear();
  unreadSummaryToastUserId = "";
  hydratedMessagesUserId = "";
  socialState.ready = true;
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
  emit();
}

function startRealtime() {
  ensurePanategwaToast();

  watchAuth(async (user) => {
    if (unsubProfile) {
      try { unsubProfile(); } catch {}
      unsubProfile = null;
    }
    if (unsubMessages) {
      try { unsubMessages(); } catch {}
      unsubMessages = null;
    }

    if (!user) {
      resetSocialState();
      return;
    }

    listenerErrors.clear();
    unreadSummaryToastUserId = "";
    hydratedMessagesUserId = "";
    socialState.ready = false;
    socialState.user = user;
    socialState.socialError = null;
    emit();

    try {
      socialState.profile = await ensureUserProfile(user);
      socialState.settings = { ...DEFAULT_SETTINGS, ...(socialState.profile?.socialSettings || {}) };
      socialState.friends = unique(socialState.profile?.friends);
      socialState.blocked = unique(socialState.profile?.blocked);
      await loadFriendProfiles([...socialState.friends, ...socialState.blocked]);
      socialState.ready = true;
      emit();

      unsubProfile = onSnapshot(userRef(user.uid), async (snap) => {
        clearListenerError("profile");
        const fresh = snap.exists() ? snap.data() : null;
        socialState.profile = fresh;
        socialState.settings = { ...DEFAULT_SETTINGS, ...(fresh?.socialSettings || {}) };
        socialState.friends = unique(fresh?.friends);
        socialState.blocked = unique(fresh?.blocked);
        await loadFriendProfiles([...socialState.friends, ...socialState.blocked]);
        socialState.ready = true;
        emit();
      }, (error) => {
        socialState.ready = true;
        setListenerError("profile", "profile", error);
      });

      unsubMessages = onSnapshot(
        query(collection(db, "messages"), where("participants", "array-contains", user.uid)),
        async (snap) => {
          clearListenerError("messages");
          const all = [];
          snap.forEach((docSnap) => all.push({ id: docSnap.id, ...docSnap.data() }));

          const sorted = sortNewestFirst(all);
          const visible = sorted.filter((message) => !unique(message.deletedFor).includes(user.uid));
          const unreadIncoming = visible.filter((message) => cleanUid(message.toUid) === user.uid && isUnreadForUser(message, user.uid));
          const initialSnapshot = hydratedMessagesUserId !== user.uid;
          if (initialSnapshot) {
            markIncomingMessagesAsSeen(unreadIncoming, user.uid);
            maybeToastUnreadSummary(unreadIncoming, user.uid);
            hydratedMessagesUserId = user.uid;
          } else {
            maybeToastNewMessages(sorted);
          }

          socialState.messages = visible;
          socialState.incomingRequests = sortNewestFirst(
            visible.filter((message) => message.kind === "friend-request" && cleanUid(message.toUid) === user.uid && (message.status || "pending") === "pending")
          );
          socialState.outgoingRequests = sortNewestFirst(
            visible.filter((message) => message.kind === "friend-request" && cleanUid(message.fromUid) === user.uid && (message.status || "pending") === "pending")
          );
          syncUnreadCount();
          await syncRelationshipSignals(sorted);
          socialState.ready = true;
          emit();
        },
        (error) => {
          socialState.ready = true;
          setListenerError("messages", "messages", error, () => {
            socialState.messages = [];
            socialState.incomingRequests = [];
            socialState.outgoingRequests = [];
            syncUnreadCount();
          });
        }
      );
    } catch (error) {
      console.error("Social bootstrap error:", error);
      socialState.ready = true;
      socialState.socialError = friendlyBootstrapError(error);
      emit();
    }
  });
}

startRealtime();

export {
  subscribeSocial,
  sendFriendRequestById,
  respondToFriendRequest,
  removeFriend,
  blockUser,
  unblockUser,
  markMessageRead,
  setMessageDeletedForCurrentUser,
  socialState
};
