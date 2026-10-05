import { auth, db } from "./firebase-config.js";
import { watchAuth, ensureUserProfile, getDefaultAvatarDataUrl, normalizeSiteTimeMs, getResolvedProfileSiteTime, publishProfileDocuments } from "./auth.js";
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
  return user?.emailVerified === true;
}

async function requireSocialUser(feature = "this feature", options = {}) {
  const user = activeUser();
  if (!user) throw new Error("Log in first.");

  const needsVerified = options.requireVerified !== false;
  const cachedProfile = socialState.profile?.uid === user.uid ? socialState.profile : null;
  const profile = cachedProfile || await loadUser(user.uid) || await ensureUserProfile(user);
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
  const root = typeof window !== "undefined" && window.PanategwaRoot ? window.PanategwaRoot : "";
  const page = `${root}main-pages/account/account-page.html`;
  return queryString ? `${page}?${queryString}` : page;
}

function userRef(uid) {
  return doc(db, "privateUsers", uid);
}

function directoryRef(uid) {
  return doc(db, "users", uid);
}

function friendProfileRef(uid) {
  return doc(db, "friendProfiles", uid);
}

function usernameOf(profile) {
  return profile?.username || profile?.displayName || "Player";
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
  const friends = unique(socialState.profile?.friends);
  const blocked = unique(socialState.profile?.blocked);
  const viewerIsFriend = !!viewerUid && friends.includes(profile.uid) && !blocked.includes(profile.uid);
  const canViewProfile = self || viewerIsFriend || ["public", "custom"].includes(profile.profileVisibility);

  if (!canViewProfile) {
    return {
      uid: profile.uid,
      username: profile.username || "Player",
      photoURL: getDefaultAvatarDataUrl(),
      xp: null,
      verified: null,
      createdAt: null,
      friends: [],
      blocked: [],
      socialSettings: { ...(profile.socialSettings || DEFAULT_SETTINGS) },
      privacySettings: normalizePrivacySettings(),
      stats: {},
      canViewProfile: false,
      friendsOnly: true,
      currentRank: null,
      streakCurrent: null,
      streakLongest: null,
      siteTimeMs: null,
      profileVisibility: profile.profileVisibility || "private",
      canMessage: false
    };
  }

  return {
    uid: profile.uid,
    username: profile.username || "Player",
    photoURL: profile.photoURL || getDefaultAvatarDataUrl(),
    xp: profile.xp == null ? null : Number(profile.xp || 0),
    verified: typeof profile.verified === "boolean" ? profile.verified : null,
    createdAt: profile.createdAt || null,
    friends: self ? friends : [],
    blocked: self ? blocked : [],
    socialSettings: { ...(profile.socialSettings || DEFAULT_SETTINGS) },
    privacySettings: normalizePrivacySettings(),
    stats: self ? (profile.stats || {}) : {},
    canViewProfile: true,
    friendsOnly: false,
    currentRank: profile.xp == null ? null : rankFromXp(profile.xp || 0),
    streakCurrent: profile.streakCurrent == null ? null : Number(profile.streakCurrent),
    streakLongest: profile.streakLongest == null ? null : Number(profile.streakLongest),
    siteTimeMs: profile.siteTimeMs == null ? null : normalizeSiteTimeMs(profile.siteTimeMs),
    profileVisibility: profile.profileVisibility || "private",
    canMessage: viewerIsFriend
  };
}

function withResolvedOwnSiteTime(profile, uid) {
  if (!profile || !uid) return profile;
  return {
    ...profile,
    siteTimeMs: getResolvedProfileSiteTime(profile, uid)
  };
}

async function loadUser(uid) {
  const id = cleanUid(uid);
  if (!id) return null;
  const currentUid = cleanUid(activeUser()?.uid);
  const ref = id === currentUid ? userRef(id) : directoryRef(id);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

async function loadFriendProfiles(ids) {
  const idsUnique = unique(ids);
  const pairs = await Promise.all(idsUnique.map(async (uid) => {
    let data = null;
    try {
      data = await loadUser(uid);
    } catch (error) {
      if (error?.code !== "permission-denied") throw error;
      // Old accounts publish their small directory entry the next time they
      // sign in after the rules update. Preserve the friends list while that
      // account completes its one-time migration.
      data = { uid, username: uid, socialSettings: { ...DEFAULT_SETTINGS } };
    }
    const isFriend = unique(socialState.profile?.friends).includes(uid);
    if (!data || !isFriend) return [uid, data];
    try {
      const sharedSnap = await getDoc(friendProfileRef(uid));
      return [uid, sharedSnap.exists() ? { ...data, ...sharedSnap.data() } : data];
    } catch (error) {
      // A friendship can be one-sided briefly while the other account applies
      // the acceptance signal. Keep the account list usable and retry when the
      // next relationship event arrives.
      if (error?.code !== "permission-denied") throw error;
      return [uid, data];
    }
  }));

  const map = {};
  for (const [uid, data] of pairs) {
    if (data) map[uid] = publicProfile(data, socialState.user?.uid);
  }

  socialState.friendProfiles = map;
  emit();
}

export async function loadAccountProfile(uid) {
  const id = cleanUid(uid);
  const viewer = activeUser();
  const viewerUid = cleanUid(viewer?.uid);
  if (!id || !viewerUid) return null;
  if (id !== viewerUid && viewer?.emailVerified !== true) {
    throw new Error("Verify your email before viewing other player profiles.");
  }
  let data = await loadUser(id);
  if (!data) return null;

  const viewerProfile = socialState.profile?.uid === viewerUid ? socialState.profile : null;
  const isFriend = unique(viewerProfile?.friends).includes(id)
    && !unique(viewerProfile?.blocked).includes(id);
  if (id === viewerUid) return data;
  if (isFriend || ["public", "custom"].includes(data.profileVisibility)) {
    try {
      const sharedSnap = await getDoc(friendProfileRef(id));
      if (sharedSnap.exists()) data = { ...data, ...sharedSnap.data() };
    } catch (error) {
      if (error?.code !== "permission-denied") throw error;
    }
  }
  return publicProfile(data, viewerUid);
}

function applyLocalConnections(nextFriendsInput = [], nextBlockedInput = []) {
  const nextFriends = unique(nextFriendsInput);
  const nextBlocked = unique(nextBlockedInput);
  const keepIds = new Set([...nextFriends, ...nextBlocked]);
  const nextProfiles = {};

  for (const [uid, profile] of Object.entries(socialState.friendProfiles || {})) {
    const clean = cleanUid(uid);
    if (!clean || !keepIds.has(clean)) continue;
    nextProfiles[clean] = profile;
  }

  if (socialState.profile) {
    socialState.profile = {
      ...socialState.profile,
      friends: nextFriends,
      blocked: nextBlocked
    };
  }

  socialState.friends = nextFriends;
  socialState.blocked = nextBlocked;
  socialState.friendProfiles = nextProfiles;
  emit();

  const needsRefresh = [...keepIds].some((uid) => !nextProfiles[uid]);
  if (needsRefresh) {
    loadFriendProfiles([...nextFriends, ...nextBlocked]).catch((error) => {
      console.warn("Could not refresh friend profiles:", error);
    });
  }
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
  return "Firestore is blocking part of the account system. Apply the current firestore.rules file in the Firebase Console, then sign in again to finish moving private profile data into its protected location.";
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
  // Notifications can be hidden for one participant without resolving the
  // underlying request. Read the source messages here so a hidden pending
  // request still prevents a duplicate request from being sent.
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

  if (message.kind === "direct-message") {
    return {
      title: message.fromName || "New message",
      body: shortenToastBody(message.body || "Sent you a message."),
      href: buildAccountHref("messages", "chat", cleanUid(message.fromUid))
    };
  }

  if (message.kind === "friend-request") {
    return {
      title: message.title || "Friend request",
      body: message.body || `${message.fromName || "Someone"} sent you a friend request.`,
      href: buildAccountHref("friends", "requests")
    };
  }

  if (message.kind === "friend-accepted") {
    return {
      title: message.title || "Friend request accepted",
      body: message.body || `${message.fromName || "Someone"} accepted your friend request.`,
      href: buildAccountHref("info", null, cleanUid(message.fromUid || message.targetId || ""))
    };
  }

  if (message.kind === "friend-declined") {
    return {
      title: message.title || "Friend request declined",
      body: message.body || `${message.fromName || "Someone"} declined your friend request.`,
      href: buildAccountHref("friends", "requests")
    };
  }

  if (message.kind === "friend-removed") {
    return {
      title: message.title || "Friend removed",
      body: message.body || `${message.fromName || "Someone"} removed you from their friends list.`,
      href: buildAccountHref("friends", "friends")
    };
  }

  if (message.kind === "friend-blocked") {
    return {
      title: message.title || "Blocked",
      body: message.body || `${message.fromName || "Someone"} blocked you.`,
      href: buildAccountHref("friends", "blocked")
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

function relationshipSignalTime(message) {
  return Math.max(toMs(message?.updatedAt), toMs(message?.createdAt), 0);
}

async function syncRelationshipSignals(messages) {
  const user = auth.currentUser;
  if (!user) return;

  const currentFriends = new Set(unique(socialState.profile?.friends));
  const currentBlocked = new Set(unique(socialState.profile?.blocked));
  const latestSignals = new Map();
  const toAdd = new Set();
  const toRemove = new Set();

  for (const message of messages || []) {
    const otherUid = relationshipTargetUid(message, user.uid);
    if (!otherUid) continue;
    const kind = String(message?.kind || "");
    if (kind !== "friend-accepted" && kind !== "friend-removed" && kind !== "friend-blocked") continue;

    const signal = {
      kind,
      time: relationshipSignalTime(message)
    };
    const previous = latestSignals.get(otherUid);
    if (!previous || signal.time >= previous.time) {
      latestSignals.set(otherUid, signal);
    }
  }

  for (const [otherUid, signal] of latestSignals.entries()) {
    if (signal.kind === "friend-accepted" && !currentBlocked.has(otherUid)) {
      toAdd.add(otherUid);
      continue;
    }

    if (signal.kind === "friend-removed" || signal.kind === "friend-blocked") {
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
    let target;
    try {
      target = await loadUser(id);
    } catch (error) {
      if (error?.code === "permission-denied") {
        throw new Error("That account needs to sign in once after the privacy update before it can receive a friend request.");
      }
      throw error;
    }
    if (!target) throw new Error("That user was not found.");

    const meSettings = { ...DEFAULT_SETTINGS, ...(me?.socialSettings || {}) };
    const targetSettings = { ...DEFAULT_SETTINGS, ...(target?.socialSettings || {}) };

    if (!meSettings.systemEnabled || !meSettings.requestsEnabled) throw new Error("Friend requests are turned off.");
    if (!targetSettings.systemEnabled || !targetSettings.requestsEnabled) throw new Error("That user is not accepting friend requests.");
    if (unique(me?.friends).includes(id)) throw new Error("You are already friends with that user.");
    if (unique(me?.blocked).includes(id)) {
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

export async function sendDirectMessage(targetUid, body) {
  try {
    const { user } = await requireSocialUser("direct messages");
    const id = cleanUid(targetUid);
    const text = String(body || "").trim();
    if (!id || id === user.uid) throw new Error("Choose a friend to message.");
    if (!text) throw new Error("Write a message first.");
    if (text.length > 2000) throw new Error("Messages can be up to 2,000 characters.");
    if (!unique(socialState.profile?.friends).includes(id)) throw new Error("You can message friends only.");
    if (unique(socialState.profile?.blocked).includes(id)) throw new Error("Unblock this player before messaging them.");

    const [sender, recipient] = await Promise.all([loadUser(user.uid), loadUser(id)]);
    if (!recipient) throw new Error("That player could not be found.");
    return (await createMessage({
      fromUid: user.uid,
      toUid: id,
      participants: [user.uid, id],
      fromName: usernameOf(sender),
      toName: usernameOf(recipient),
      kind: "direct-message",
      status: "sent",
      title: "Message",
      body: text,
      readBy: [user.uid]
    })).id;
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
      applyLocalConnections(
        [...unique(socialState.profile?.friends || socialState.friends), request.fromUid],
        unique(socialState.profile?.blocked || socialState.blocked).filter((entry) => entry !== request.fromUid)
      );
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
        requestId,
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
        requestId,
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
      applyLocalConnections(
        unique(socialState.profile?.friends || socialState.friends).filter((entry) => entry !== request.fromUid),
        [...unique(socialState.profile?.blocked || socialState.blocked), request.fromUid]
      );
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
        requestId,
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
    applyLocalConnections(
      unique(socialState.profile?.friends || socialState.friends).filter((entry) => entry !== id),
      socialState.profile?.blocked || socialState.blocked
    );

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
    applyLocalConnections(
      unique(socialState.profile?.friends || socialState.friends).filter((entry) => entry !== id),
      [...unique(socialState.profile?.blocked || socialState.blocked), id]
    );

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
    applyLocalConnections(
      socialState.profile?.friends || socialState.friends,
      unique(socialState.profile?.blocked || socialState.blocked).filter((entry) => entry !== id)
    );
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
  hydratedMessagesUserId = "";
  socialState.ready = true;
  socialState.user = null;
  socialState.profile = null;
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

  window.addEventListener("panategwa:sitetimechange", (event) => {
    const uid = cleanUid(event?.detail?.uid);
    if (!uid || socialState.user?.uid !== uid || !socialState.profile) return;

    const nextSiteTimeMs = normalizeSiteTimeMs(event?.detail?.siteTimeMs);
    if (normalizeSiteTimeMs(socialState.profile.siteTimeMs) === nextSiteTimeMs) return;

    socialState.profile = {
      ...socialState.profile,
      siteTimeMs: nextSiteTimeMs
    };
    emit();
  });

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

    if (user.emailVerified !== true) {
      listenerErrors.clear();
      hydratedMessagesUserId = "";
      socialState.ready = true;
      socialState.user = user;
      socialState.profile = null;
      socialState.socialError = null;
      socialState.friends = [];
      socialState.blocked = [];
      socialState.incomingRequests = [];
      socialState.outgoingRequests = [];
      socialState.messages = [];
      socialState.unreadCount = 0;
      socialState.friendProfiles = {};
      emit();
      return;
    }

    listenerErrors.clear();
    hydratedMessagesUserId = "";
    socialState.ready = false;
    socialState.user = user;
    socialState.socialError = null;
    emit();

    try {
      socialState.profile = withResolvedOwnSiteTime(await ensureUserProfile(user), user.uid);
      socialState.friends = unique(socialState.profile?.friends);
      socialState.blocked = unique(socialState.profile?.blocked);
      await loadFriendProfiles([...socialState.friends, ...socialState.blocked]);
      socialState.ready = true;
      emit();

      unsubProfile = onSnapshot(userRef(user.uid), async (snap) => {
        clearListenerError("profile");
        // Firestore does not await the callback we hand onSnapshot, so anything
        // thrown here escapes as an unhandled rejection. Letting one through
        // would also skip the ready flag below and leave the account page
        // spinning forever with nothing on screen explaining why.
        try {
          const fresh = snap.exists() ? withResolvedOwnSiteTime(snap.data(), user.uid) : null;
          socialState.profile = fresh;
          socialState.friends = unique(fresh?.friends);
          socialState.blocked = unique(fresh?.blocked);
          if (fresh) await publishProfileDocuments(fresh);
          await loadFriendProfiles([...socialState.friends, ...socialState.blocked]);
        } catch (error) {
          console.error("Profile snapshot error:", error);
        } finally {
          socialState.ready = true;
          emit();
        }
      }, (error) => {
        socialState.ready = true;
        setListenerError("profile", "profile", error);
      });

      unsubMessages = onSnapshot(
        query(collection(db, "messages"), where("participants", "array-contains", user.uid)),
        async (snap) => {
          clearListenerError("messages");
          try {
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
            // Hiding a notification should hide it from Activity only. Keep
            // pending requests in the Requests panel so they can still be
            // accepted, ignored, declined, or cancelled after a reload.
            socialState.incomingRequests = sortNewestFirst(
              sorted.filter((message) => message.kind === "friend-request" && cleanUid(message.toUid) === user.uid && (message.status || "pending") === "pending")
            );
            socialState.outgoingRequests = sortNewestFirst(
              sorted.filter((message) => message.kind === "friend-request" && cleanUid(message.fromUid) === user.uid && (message.status || "pending") === "pending")
            );
            syncUnreadCount();
            await syncRelationshipSignals(sorted);
            await loadFriendProfiles([...socialState.friends, ...socialState.blocked]);
          } catch (error) {
            // See the note on the profile listener: an escaping error here
            // would skip the ready flag and strand the UI on its spinner.
            console.error("Messages snapshot error:", error);
          } finally {
            socialState.ready = true;
            emit();
          }
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
