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
  onSnapshot,
  query,
  where,
  runTransaction,
  writeBatch,
  serverTimestamp,
  arrayUnion,
  arrayRemove
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const DEFAULT_SETTINGS = {
  systemEnabled: true,
  requestsEnabled: true,
  chatEnabled: true,
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
  canUndo: false,
  canRedo: false
};

let unsubProfile = null;
let unsubIncoming = null;
let unsubOutgoing = null;
let unsubMessages = null;

let seenIncomingRequestIds = new Set();
let seenMessageIds = new Set();
let firstIncomingLoaded = false;
let firstMessagesLoaded = false;

const history = [];
const redoStack = [];

function cloneState() {
  return {
    ...state,
    friends: [...state.friends],
    blocked: [...state.blocked],
    incomingRequests: [...state.incomingRequests],
    outgoingRequests: [...state.outgoingRequests],
    messages: [...state.messages],
    friendProfiles: { ...state.friendProfiles }
  };
}

function emit() {
  state.canUndo = history.length > 0;
  state.canRedo = redoStack.length > 0;
  listeners.forEach(fn => fn(cloneState()));
}

function subscribeSocial(callback) {
  listeners.add(callback);
  callback(cloneState());
  return () => listeners.delete(callback);
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

function cleanUid(value) {
  return String(value || "").trim();
}

function unique(list) {
  return [...new Set((Array.isArray(list) ? list : []).map(cleanUid).filter(Boolean))];
}

function userRef(uid) {
  return doc(db, "users", uid);
}

function requestDocId(fromUid, toUid) {
  return `request_${fromUid}_${toUid}`;
}

function isFriend(uid) {
  return state.friends.includes(uid);
}

function isBlocked(uid) {
  return state.blocked.includes(uid);
}

function systemEnabled() {
  return state.settings.systemEnabled !== false;
}

function requestsEnabled() {
  return state.settings.requestsEnabled !== false;
}

function chatEnabled() {
  return state.settings.chatEnabled !== false;
}

function getCurrentUsername(profile) {
  return profile?.username || state.user?.displayName || state.user?.email?.split("@")?.[0] || "Player";
}

function publicProfileForViewer(profile, viewerUid) {
  if (!profile) return null;

  const isSelf = profile.uid === viewerUid;
  const hidden = !!profile.socialSettings?.profileHidden;

  if (isSelf || !hidden) {
    return {
      uid: profile.uid,
      username: profile.username || "Player",
      email: profile.email || "",
      xp: profile.xp || 0,
      friends: unique(profile.friends),
      blocked: unique(profile.blocked),
      socialSettings: {
        ...(profile.socialSettings || DEFAULT_SETTINGS)
      },
      stats: profile.stats || {},
      createdAt: profile.createdAt || null,
      lastLoginAt: profile.lastLoginAt || null,
      verified: !!profile.verified
    };
  }

  return {
    uid: profile.uid,
    username: profile.username || "Player",
    email: "",
    xp: 0,
    friends: [],
    blocked: [],
    socialSettings: {
      ...DEFAULT_SETTINGS,
      profileHidden: true
    },
    stats: {}
  };
}

async function loadUserProfileById(uid) {
  const id = cleanUid(uid);
  if (!id) return null;
  const snap = await getDoc(userRef(id));
  if (!snap.exists()) return null;
  return snap.data();
}

async function hydrateFriendProfiles(ids) {
  const friendIds = unique(ids);

  const results = await Promise.all(friendIds.map(async (uid) => {
    const snap = await getDoc(userRef(uid));
    return [uid, snap.exists() ? snap.data() : null];
  }));

  const map = {};
  for (const [uid, data] of results) {
    if (data) map[uid] = publicProfileForViewer(data, state.user?.uid);
  }

  state.friendProfiles = map;
  emit();
}

function updateDerivedState(profile) {
  state.profile = profile || null;
  state.settings = {
    ...DEFAULT_SETTINGS,
    ...(profile?.socialSettings || {})
  };
  state.friends = unique(profile?.friends);
  state.blocked = unique(profile?.blocked);
  state.selectedProfile = state.selectedProfileId
    ? (state.selectedProfileId === state.user?.uid
        ? publicProfileForViewer(profile, state.user?.uid)
        : state.friendProfiles[state.selectedProfileId] || state.selectedProfile || null)
    : publicProfileForViewer(profile, state.user?.uid);

  emit();
}

async function createSocialMessage({
  fromUid,
  toUid,
  kind,
  title,
  body,
  targetSection = "friends",
  targetSubSection = "messages",
  requestId = null,
  conversationUid = null
}) {
  if (!fromUid || !toUid) return;

  const fromProfile = await loadUserProfileById(fromUid);
  const toProfile = await loadUserProfileById(toUid);

  await addDoc(collection(db, "messages"), {
    fromUid,
    toUid,
    participants: [fromUid, toUid],
    fromName: getCurrentUsername(fromProfile),
    toName: getCurrentUsername(toProfile),
    kind,
    title,
    body,
    targetSection,
    targetSubSection,
    requestId,
    conversationUid,
    readBy: [fromUid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

function pushHistory(entry) {
  history.push(entry);
  redoStack.length = 0;
  state.canUndo = history.length > 0;
  state.canRedo = false;
  emit();
}

async function applyMessageReadState(id, read, silentHistory = false) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const ref = doc(db, "messages", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data();
  if (data.toUid !== user.uid) return;

  const readBy = unique(data.readBy || []);

  if (read) {
    if (readBy.includes(user.uid)) return;
    await updateDoc(ref, {
      readBy: arrayUnion(user.uid),
      readAt: serverTimestamp()
    });
  } else {
    if (!readBy.includes(user.uid)) return;
    await updateDoc(ref, {
      readBy: arrayRemove(user.uid),
      readAt: null
    });
  }

  if (!silentHistory) {
    pushHistory({
      type: "message-read-state",
      ids: [id],
      next: read
    });
  }
}

async function applyBulkMessageReadState(read, silentHistory = false) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const qs = await getDocs(query(collection(db, "messages"), where("participants", "array-contains", user.uid)));
  const targets = [];
  const previous = [];

  qs.forEach(docSnap => {
    const data = docSnap.data();
    const readBy = unique(data.readBy || []);
    if (data.toUid !== user.uid) return;
    if (read && readBy.includes(user.uid)) return;
    if (!read && !readBy.includes(user.uid)) return;

    targets.push(docSnap.ref);
    previous.push({
      id: docSnap.id,
      readBy: [...readBy]
    });
  });

  if (!targets.length) return;

  const batch = writeBatch(db);

  targets.forEach(ref => {
    batch.update(ref, read
      ? { readBy: arrayUnion(user.uid), readAt: serverTimestamp() }
      : { readBy: arrayRemove(user.uid), readAt: null }
    );
  });

  await batch.commit();

  if (!silentHistory) {
    pushHistory({
      type: "bulk-message-read-state",
      ids: previous.map(x => x.id),
      next: read,
      previous
    });
  }
}

async function undoLastAction() {
  const action = history.pop();
  if (!action) return;

  redoStack.push(action);

  if (action.type === "message-read-state") {
    await applyMessageReadState(action.ids[0], !action.next, true);
  }

  if (action.type === "bulk-message-read-state") {
    const batch = writeBatch(db);

    for (const item of action.previous || []) {
      const ref = doc(db, "messages", item.id);
      batch.update(ref, {
        readBy: item.readBy,
        readAt: item.readBy.includes(auth.currentUser.uid) ? serverTimestamp() : null
      });
    }

    await batch.commit();
  }

  emit();
}

async function redoLastAction() {
  const action = redoStack.pop();
  if (!action) return;

  history.push(action);

  if (action.type === "message-read-state") {
    await applyMessageReadState(action.ids[0], action.next, true);
  }

  if (action.type === "bulk-message-read-state") {
    await applyBulkMessageReadState(action.next, true);
  }

  emit();
}

function notifyCard({ title, body, buttons = [], onOpen = null }) {
  let stack = document.getElementById("social-toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "social-toast-stack";
    stack.style.position = "fixed";
    stack.style.right = "16px";
    stack.style.bottom = "16px";
    stack.style.zIndex = "99998";
    stack.style.display = "grid";
    stack.style.gap = "10px";
    stack.style.width = "min(380px, calc(100vw - 32px))";
    stack.style.pointerEvents = "none";
    document.body.appendChild(stack);
  }

  const card = document.createElement("div");
  card.style.pointerEvents = "auto";
  card.style.borderRadius = "14px";
  card.style.padding = "14px 16px";
  card.style.background = "rgba(20, 20, 30, 0.94)";
  card.style.color = "#fff";
  card.style.border = "1px solid rgba(255,255,255,0.14)";
  card.style.boxShadow = "0 12px 30px rgba(0,0,0,0.35)";
  card.style.backdropFilter = "blur(8px)";
  card.style.display = "grid";
  card.style.gap = "8px";
  card.style.userSelect = "none";

  const titleEl = document.createElement("div");
  titleEl.style.fontWeight = "700";
  titleEl.textContent = title || "Notification";

  const bodyEl = document.createElement("div");
  bodyEl.style.opacity = "0.88";
  bodyEl.style.lineHeight = "1.35";
  bodyEl.textContent = body || "";

  const btnRow = document.createElement("div");
  btnRow.style.display = "flex";
  btnRow.style.flexWrap = "wrap";
  btnRow.style.gap = "8px";

  for (const btn of buttons) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = btn.label;
    button.style.border = "none";
    button.style.borderRadius = "999px";
    button.style.padding = "8px 12px";
    button.style.cursor = "pointer";
    button.style.font = "inherit";
    button.style.fontWeight = "700";
    button.style.background = btn.variant === "primary" ? "rgba(175, 200, 75, 0.32)" : "rgba(255,255,255,0.12)";
    button.style.color = "#fff";

    button.addEventListener("click", async (e) => {
      e.stopPropagation();
      await btn.onClick?.();
      card.remove();
    });

    btnRow.appendChild(button);
  }

  card.appendChild(titleEl);
  card.appendChild(bodyEl);
  if (buttons.length) card.appendChild(btnRow);

  if (onOpen) {
    card.addEventListener("click", async () => {
      await onOpen();
      card.remove();
    });
  }

  stack.appendChild(card);

  setTimeout(() => {
    if (card.isConnected) card.remove();
  }, 5000);
}

function openAccountArea(section = "friends", sub = "friends", targetUid = null) {
  if (typeof window.openAccountArea === "function") {
    window.openAccountArea(section, sub, targetUid);
  }
}

function notifyRequest(request) {
  notifyCard({
    title: "Friend request",
    body: `${request.fromName || request.fromUid} sent you a friend request.`,
    onOpen: () => openAccountArea("friends", "requests", request.fromUid),
    buttons: [
      {
        label: "Accept",
        variant: "primary",
        onClick: async () => respondToFriendRequest(request.id, "accept")
      },
      {
        label: "Ignore",
        onClick: async () => {}
      },
      {
        label: "Decline",
        onClick: async () => respondToFriendRequest(request.id, "decline")
      },
      {
        label: "Block",
        onClick: async () => respondToFriendRequest(request.id, "block")
      },
      {
        label: "View in messages",
        onClick: async () => openAccountArea("messages", "messages", request.fromUid)
      }
    ]
  });
}

function notifyMessage(message) {
  notifyCard({
    title: message.title || "New message",
    body: message.body || "You have a new message.",
    onOpen: () => openAccountArea(message.targetSection || "messages", message.targetSubSection || "messages", message.conversationUid || message.fromUid || null),
    buttons: [
      {
        label: "Open",
        variant: "primary",
        onClick: async () => openAccountArea(message.targetSection || "messages", message.targetSubSection || "messages", message.conversationUid || message.fromUid || null)
      },
      {
        label: "View in messages",
        onClick: async () => openAccountArea("messages", "messages", message.conversationUid || message.fromUid || null)
      }
    ]
  });
}

function notifySummary(text, section = "messages", sub = "messages") {
  notifyCard({
    title: "New messages",
    body: text,
    onOpen: () => openAccountArea(section, sub),
    buttons: [
      {
        label: "Open",
        variant: "primary",
        onClick: async () => openAccountArea(section, sub)
      },
      {
        label: "View in messages",
        onClick: async () => openAccountArea("messages", "messages")
      }
    ]
  });
}

async function sendFriendRequestById(targetUid, note = "") {
  const user = auth.currentUser;
  const id = cleanUid(targetUid);

  if (!user) throw new Error("Not logged in.");
  if (!id) throw new Error("Enter a valid user ID.");
  if (id === user.uid) throw new Error("You cannot send a request to yourself.");
  if (!systemEnabled() || !requestsEnabled()) throw new Error("Friend requests are turned off.");

  const target = await loadUserProfileById(id);
  if (!target) throw new Error("That user was not found.");

  const targetSettings = {
    ...DEFAULT_SETTINGS,
    ...(target.socialSettings || {})
  };

  if (!targetSettings.systemEnabled || !targetSettings.requestsEnabled) {
    throw new Error("That user is not accepting friend requests.");
  }

  if (isBlocked(id) || unique(target.blocked).includes(user.uid)) {
    throw new Error("You cannot send a request to this user.");
  }

  if (isFriend(id)) {
    throw new Error("You are already friends.");
  }

  const requestId = requestDocId(user.uid, id);
  const ref = doc(db, "friendRequests", requestId);

  await setDoc(ref, {
    id: requestId,
    fromUid: user.uid,
    toUid: id,
    status: "pending",
    note: cleanUid(note) || "",
    fromName: getCurrentUsername(state.profile),
    toName: getCurrentUsername(target),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });

  await createSocialMessage({
    fromUid: user.uid,
    toUid: id,
    kind: "friend-request",
    title: "Friend request received",
    body: note ? `${getCurrentUsername(state.profile)}: ${note}` : `${getCurrentUsername(state.profile)} sent you a friend request.`,
    targetSection: "friends",
    targetSubSection: "requests",
    requestId
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

  await runTransaction(db, async (tx) => {
    const requestSnap = await tx.get(ref);
    if (!requestSnap.exists()) throw new Error("Request not found.");

    if (action === "accept") {
      tx.update(ref, {
        status: "accepted",
        updatedAt: serverTimestamp()
      });

      tx.set(senderRef, {
        friends: arrayUnion(user.uid),
        blocked: arrayRemove(user.uid),
        updatedAt: serverTimestamp()
      }, { merge: true });

      tx.set(receiverRef, {
        friends: arrayUnion(req.fromUid),
        updatedAt: serverTimestamp()
      }, { merge: true });

      return;
    }

    if (action === "decline") {
      tx.update(ref, {
        status: "declined",
        updatedAt: serverTimestamp()
      });
      return;
    }

    if (action === "block") {
      tx.update(ref, {
        status: "blocked",
        updatedAt: serverTimestamp()
      });

      tx.set(receiverRef, {
        blocked: arrayUnion(req.fromUid),
        friends: arrayRemove(req.fromUid),
        updatedAt: serverTimestamp()
      }, { merge: true });

      tx.set(senderRef, {
        friends: arrayRemove(user.uid),
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
  });

  const myName = getCurrentUsername(state.profile);

  if (action === "accept") {
    await createSocialMessage({
      fromUid: user.uid,
      toUid: req.fromUid,
      kind: "friend-accepted",
      title: "Friend request accepted",
      body: `${myName} accepted your friend request.`,
      targetSection: "friends",
      targetSubSection: "friends"
    });
  }

  if (action === "decline") {
    await createSocialMessage({
      fromUid: user.uid,
      toUid: req.fromUid,
      kind: "friend-declined",
      title: "Friend request declined",
      body: `${myName} declined your friend request.`,
      targetSection: "friends",
      targetSubSection: "requests"
    });
  }

  if (action === "block") {
    await createSocialMessage({
      fromUid: user.uid,
      toUid: req.fromUid,
      kind: "friend-blocked",
      title: "You were blocked",
      body: `${myName} blocked you.`,
      targetSection: "friends",
      targetSubSection: "messages"
    });
  }
}

async function sendChatMessage(friendUid, text) {
  const user = auth.currentUser;
  const id = cleanUid(friendUid);
  const body = String(text || "").trim();

  if (!user) throw new Error("Not logged in.");
  if (!id) throw new Error("Enter a friend ID.");
  if (!body) throw new Error("Type a message first.");
  if (!systemEnabled() || !chatEnabled()) throw new Error("Chat is turned off.");
  if (!isFriend(id)) throw new Error("That user is not in your friends list.");
  if (isBlocked(id)) throw new Error("You blocked this user.");

  const target = await loadUserProfileById(id);
  if (!target) throw new Error("That user was not found.");

  const targetSettings = {
    ...DEFAULT_SETTINGS,
    ...(target.socialSettings || {})
  };

  if (!targetSettings.systemEnabled || !targetSettings.chatEnabled) {
    throw new Error("That user is not accepting chats.");
  }

  await createSocialMessage({
    fromUid: user.uid,
    toUid: id,
    kind: "chat",
    title: `Message from ${getCurrentUsername(state.profile)}`,
    body,
    targetSection: "messages",
    targetSubSection: "messages",
    conversationUid: id
  });
}

async function removeFriend(friendUid) {
  const user = auth.currentUser;
  const id = cleanUid(friendUid);
  if (!user) throw new Error("Not logged in.");
  if (!id) throw new Error("Enter a friend ID.");

  const myRef = userRef(user.uid);
  const otherRef = userRef(id);

  await runTransaction(db, async (tx) => {
    const mySnap = await tx.get(myRef);
    const otherSnap = await tx.get(otherRef);

    if (!mySnap.exists() || !otherSnap.exists()) throw new Error("User not found.");

    tx.set(myRef, {
      friends: arrayRemove(id),
      updatedAt: serverTimestamp()
    }, { merge: true });

    tx.set(otherRef, {
      friends: arrayRemove(user.uid),
      updatedAt: serverTimestamp()
    }, { merge: true });
  });

  await createSocialMessage({
    fromUid: user.uid,
    toUid: id,
    kind: "system",
    title: "Friend removed",
    body: `${getCurrentUsername(state.profile)} removed you from friends.`,
    targetSection: "friends",
    targetSubSection: "friends"
  });
}

async function blockUser(targetUid) {
  const user = auth.currentUser;
  const id = cleanUid(targetUid);
  if (!user) throw new Error("Not logged in.");
  if (!id) throw new Error("Enter a user ID.");
  if (id === user.uid) throw new Error("You cannot block yourself.");

  const myRef = userRef(user.uid);
  const otherRef = userRef(id);

  await runTransaction(db, async (tx) => {
    const mySnap = await tx.get(myRef);
    const otherSnap = await tx.get(otherRef);
    if (!mySnap.exists() || !otherSnap.exists()) throw new Error("User not found.");

    tx.set(myRef, {
      blocked: arrayUnion(id),
      friends: arrayRemove(id),
      updatedAt: serverTimestamp()
    }, { merge: true });

    tx.set(otherRef, {
      friends: arrayRemove(user.uid),
      updatedAt: serverTimestamp()
    }, { merge: true });
  });

  await createSocialMessage({
    fromUid: user.uid,
    toUid: id,
    kind: "friend-blocked",
    title: "Blocked",
    body: `${getCurrentUsername(state.profile)} blocked you.`,
    targetSection: "friends",
    targetSubSection: "messages"
  });
}

async function toggleRequestsEnabled(enabled) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  await setDoc(userRef(user.uid), {
    socialSettings: {
      ...(state.settings || DEFAULT_SETTINGS),
      requestsEnabled: !!enabled
    },
    updatedAt: serverTimestamp()
  }, { merge: true });
}

async function toggleChatEnabled(enabled) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  await setDoc(userRef(user.uid), {
    socialSettings: {
      ...(state.settings || DEFAULT_SETTINGS),
      chatEnabled: !!enabled
    },
    updatedAt: serverTimestamp()
  }, { merge: true });
}

async function toggleProfileHidden(hidden) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  await setDoc(userRef(user.uid), {
    socialSettings: {
      ...(state.settings || DEFAULT_SETTINGS),
      profileHidden: !!hidden
    },
    updatedAt: serverTimestamp()
  }, { merge: true });
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

  const updates = {
    socialBackup: backup,
    socialSettings: {
      ...(data.socialSettings || DEFAULT_SETTINGS),
      systemEnabled: false,
      requestsEnabled: false,
      chatEnabled: false
    },
    updatedAt: serverTimestamp()
  };

  if (mode === "clear") {
    updates.friends = [];
    updates.blocked = [];
  }

  await setDoc(userRef(user.uid), updates, { merge: true });
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
      chatEnabled: true
    },
    updatedAt: serverTimestamp()
  }, { merge: true });
}

async function markMessageRead(messageId, read = true) {
  await applyMessageReadState(messageId, read);
}

async function markAllMessagesRead() {
  await applyBulkMessageReadState(true);
}

async function markAllMessagesUnread() {
  await applyBulkMessageReadState(false);
}

async function viewProfileById(uid) {
  const id = cleanUid(uid);
  if (!id) return null;

  const profile = await loadUserProfileById(id);
  const viewerUid = auth.currentUser?.uid || null;
  const visible = publicProfileForViewer(profile, viewerUid);

  state.selectedProfileId = id;
  state.selectedProfile = visible;
  emit();
  return visible;
}

function setSelectedConversation(uid) {
  state.selectedConversationId = cleanUid(uid) || null;
  emit();
}

function setSelectedProfile(uid) {
  state.selectedProfileId = cleanUid(uid) || null;
  emit();
}

function getConversationMessages(uid) {
  const id = cleanUid(uid);
  if (!id) return state.messages;

  return state.messages.filter(m => (
    m.kind === "chat" &&
    (
      (m.fromUid === state.user?.uid && m.toUid === id) ||
      (m.fromUid === id && m.toUid === state.user?.uid)
    )
  ));
}

function getUnreadIncomingCount() {
  const uid = state.user?.uid;
  if (!uid) return 0;
  return state.messages.filter(m => m.toUid === uid && !unique(m.readBy).includes(uid)).length;
}

function resetHistoryStacks() {
  history.length = 0;
  redoStack.length = 0;
  state.canUndo = false;
  state.canRedo = false;
  emit();
}

function startSnapshots() {
  watchAuth(async (user, profile) => {
    if (unsubProfile) { unsubProfile(); unsubProfile = null; }
    if (unsubIncoming) { unsubIncoming(); unsubIncoming = null; }
    if (unsubOutgoing) { unsubOutgoing(); unsubOutgoing = null; }
    if (unsubMessages) { unsubMessages(); unsubMessages = null; }

    firstIncomingLoaded = false;
    firstMessagesLoaded = false;
    seenIncomingRequestIds = new Set();
    seenMessageIds = new Set();
    resetHistoryStacks();

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
      emit();
      return;
    }

    state.user = user;
    await ensureUserProfile(user);

    unsubProfile = onSnapshot(userRef(user.uid), async (snap) => {
      const fresh = snap.exists() ? snap.data() : null;
      updateDerivedState(fresh);
      await hydrateFriendProfiles(fresh?.friends || []);
    });

    unsubIncoming = onSnapshot(
      query(collection(db, "friendRequests"), where("toUid", "==", user.uid)),
      (snap) => {
        const all = [];
        snap.forEach(d => all.push({ id: d.id, ...d.data() }));

        const incoming = all.filter(r => r.status === "pending");
        const currentIds = new Set(incoming.map(r => r.id));

        if (firstIncomingLoaded) {
          const newOnes = incoming.filter(r => !seenIncomingRequestIds.has(r.id));
          if (newOnes.length > 1) {
            notifySummary(`You have ${newOnes.length} new friend requests.`, "friends", "requests");
          } else if (newOnes.length === 1) {
            notifyRequest(newOnes[0]);
          }
        } else {
          firstIncomingLoaded = true;
        }

        seenIncomingRequestIds = currentIds;
        state.incomingRequests = sortNewestFirst(incoming);
        emit();
      }
    );

    unsubOutgoing = onSnapshot(
      query(collection(db, "friendRequests"), where("fromUid", "==", user.uid)),
      (snap) => {
        const all = [];
        snap.forEach(d => all.push({ id: d.id, ...d.data() }));
        state.outgoingRequests = sortNewestFirst(all.filter(r => r.status === "pending"));
        emit();
      }
    );

    unsubMessages = onSnapshot(
      query(collection(db, "messages"), where("participants", "array-contains", user.uid)),
      (snap) => {
        const all = [];
        snap.forEach(d => all.push({ id: d.id, ...d.data() }));
        const sorted = sortNewestFirst(all);

        state.unreadCount = sorted.filter(m => m.toUid === user.uid && !unique(m.readBy).includes(user.uid)).length;
        state.messages = sorted;

        if (firstMessagesLoaded) {
          const newOnes = sorted.filter(m => !seenMessageIds.has(m.id) && m.toUid === user.uid);
          if (newOnes.length > 1) {
            notifySummary(`You have ${newOnes.length} new messages.`, "messages", "messages");
          } else if (newOnes.length === 1) {
            notifyMessage(newOnes[0]);
          }
        } else {
          firstMessagesLoaded = true;
        }

        seenMessageIds = new Set(sorted.map(m => m.id));
        emit();
      }
    );
  });
}

async function loadAllData() {
  startSnapshots();
}

watchAuth(async (user, profile) => {
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
    resetHistoryStacks();
    emit();
    return;
  }

  state.user = user;
  state.profile = profile || await getProfile(user.uid);
  state.settings = {
    ...DEFAULT_SETTINGS,
    ...(state.profile?.socialSettings || {})
  };
  state.friends = unique(state.profile?.friends);
  state.blocked = unique(state.profile?.blocked);
  state.selectedProfile = publicProfileForViewer(state.profile, user.uid);
  state.selectedProfileId = user.uid;
  await hydrateFriendProfiles(state.friends);
  emit();
  loadAllData();
});

export {
  subscribeSocial,
  sendFriendRequestById,
  respondToFriendRequest,
  sendChatMessage,
  removeFriend,
  blockUser,
  toggleRequestsEnabled,
  toggleChatEnabled,
  toggleProfileHidden,
  disableSocialSystem,
  enableSocialSystem,
  markMessageRead,
  markAllMessagesRead,
  markAllMessagesUnread,
  undoLastAction,
  redoLastAction,
  viewProfileById,
  setSelectedConversation,
  setSelectedProfile,
  getConversationMessages,
  getUnreadIncomingCount,
  openAccountArea,
  state as socialState
};