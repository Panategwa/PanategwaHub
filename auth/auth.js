import { auth, db, googleProvider } from "./firebase-config.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  updateProfile,
  deleteUser,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  EmailAuthProvider,
  sendPasswordResetEmail,
  updateEmail,
  updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  addDoc,
  updateDoc,
  collection,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

function userRef(uid) {
  return doc(db, "users", uid);
}

function cleanEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function cleanText(text) {
  return String(text || "").trim();
}

function uniqueStrings(value) {
  const arr = Array.isArray(value) ? value : [];
  return [...new Set(arr.map((item) => String(item || "").trim()).filter(Boolean))];
}

function normalizePrivacySettings(settings = {}) {
  return {
    showRank: settings.showRank !== false,
    showJoined: settings.showJoined !== false,
    showStreaks: settings.showStreaks !== false
  };
}

function defaultUsername(user) {
  return user?.displayName || user?.email?.split("@")?.[0] || "Player";
}

const RANK_LEVELS = Object.freeze({
  Adventurer: 0,
  Explorer: 1,
  Expert: 2,
  Veteran: 3
});

export const AVATAR_PRESET_REQUIREMENTS = Object.freeze({
  "1": "Adventurer",
  "2": "Adventurer",
  "3": "Explorer",
  "4": "Explorer",
  "5": "Expert",
  "6": "Expert",
  "7": "Veteran",
  "8": "Veteran"
});

export function getRankFromXp(xp) {
  if (Number(xp || 0) >= 30) return "Veteran";
  if (Number(xp || 0) >= 20) return "Expert";
  if (Number(xp || 0) >= 10) return "Explorer";
  return "Adventurer";
}

export function doesRankMeetRequirement(rank, requiredRank) {
  return (RANK_LEVELS[rank] ?? 0) >= (RANK_LEVELS[requiredRank] ?? 0);
}

function svgDataUrl(svg) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function presetAvatarDataUrl(presetId) {
  const id = String(presetId || "1");

  if (id === "2") {
    return svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#ef4444"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs>
        <rect width="128" height="128" rx="64" fill="url(#g)"/>
        <path d="M64 18 84 42l26 6-17 22 1 28-30-11-30 11 1-28-17-22 26-6z" fill="rgba(255,255,255,0.92)"/>
        <path d="M64 38 76 54l18 4-12 16 1 18-19-7-19 7 1-18-12-16 18-4z" fill="rgba(239,68,68,0.55)"/>
      </svg>
    `);
  }

  if (id === "3") {
    return svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#0f766e"/><stop offset="1" stop-color="#38bdf8"/></linearGradient></defs>
        <rect width="128" height="128" rx="64" fill="url(#g)"/>
        <circle cx="64" cy="64" r="36" fill="rgba(255,255,255,0.12)"/>
        <path d="M64 28 76 53h28L81 72l9 28-26-17-26 17 9-28-23-19h28z" fill="rgba(255,255,255,0.94)"/>
      </svg>
    `);
  }

  if (id === "4") {
    return svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#2563eb"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs>
        <rect width="128" height="128" rx="64" fill="url(#g)"/>
        <circle cx="64" cy="64" r="40" fill="rgba(255,255,255,0.12)"/>
        <path d="M64 24c15 10 26 24 26 39 0 19-14 31-26 41-12-10-26-22-26-41 0-15 11-29 26-39z" fill="rgba(255,255,255,0.94)"/>
        <path d="M64 40c8 6 13 13 13 22 0 11-7 18-13 24-6-6-13-13-13-24 0-9 5-16 13-22z" fill="rgba(37,99,235,0.55)"/>
      </svg>
    `);
  }

  if (id === "5") {
    return svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#0f172a"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs>
        <rect width="128" height="128" rx="64" fill="url(#g)"/>
        <circle cx="64" cy="64" r="42" fill="rgba(255,255,255,0.09)"/>
        <path d="M64 20 84 36l24 2-15 19 5 23-22-8-12 20-12-20-22 8 5-23-15-19 24-2z" fill="rgba(255,255,255,0.94)"/>
      </svg>
    `);
  }

  if (id === "6") {
    return svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#1d4ed8"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs>
        <rect width="128" height="128" rx="64" fill="url(#g)"/>
        <path d="M64 18 86 34l24 6-14 23 2 26-24-11-10 22-10-22-24 11 2-26-14-23 24-6z" fill="rgba(255,255,255,0.94)"/>
        <circle cx="64" cy="58" r="12" fill="rgba(29,78,216,0.48)"/>
        <path d="M64 40v36" stroke="#fff" stroke-width="6" stroke-linecap="round"/>
      </svg>
    `);
  }

  if (id === "7") {
    return svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#7c2d12"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs>
        <rect width="128" height="128" rx="64" fill="url(#g)"/>
        <path d="M64 16 88 32l24 16-8 31-24 17H48L24 79l-8-31 24-16z" fill="rgba(255,255,255,0.94)"/>
        <path d="M40 52h48v10H40zm8 18h32v10H48z" fill="rgba(124,45,18,0.42)"/>
      </svg>
    `);
  }

  if (id === "8") {
    return svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#431407"/><stop offset="1" stop-color="#facc15"/></linearGradient></defs>
        <rect width="128" height="128" rx="64" fill="url(#g)"/>
        <path d="M64 18 86 44l28 4-20 21 5 29-35-16-35 16 5-29-20-21 28-4z" fill="rgba(255,255,255,0.95)"/>
        <circle cx="64" cy="58" r="11" fill="rgba(250,204,21,0.68)"/>
      </svg>
    `);
  }

  return svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
      <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#f97316"/><stop offset="1" stop-color="#facc15"/></linearGradient></defs>
      <rect width="128" height="128" rx="64" fill="url(#g)"/>
      <path d="M64 24 78 52h28L83 70l8 26-27-13-27 13 8-26-23-18h28z" fill="rgba(255,255,255,0.94)"/>
      <circle cx="64" cy="60" r="10" fill="rgba(249,115,22,0.48)"/>
    </svg>
  `);
}

function letterAvatarDataUrl(letter) {
  const char = String(letter || "").trim().slice(0, 1).toUpperCase() || "P";
  return svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
      <rect width="128" height="128" rx="64" fill="#27344f"/>
      <text x="64" y="76" text-anchor="middle" font-size="62" font-family="Arial, sans-serif" fill="#fff">${char}</text>
    </svg>
  `);
}

function syncSidebarAvatar(photoURL) {
  if (typeof window.PanategwaUpdateSidebarAvatar === "function") {
    window.PanategwaUpdateSidebarAvatar(photoURL || "", "Account");
  }
}

function baseProfile(user) {
  return {
    uid: user.uid,
    email: user.email || "",
    emailLower: cleanEmail(user.email),
    username: user.displayName || defaultUsername(user),
    photoURL: user.photoURL || "",
    verified: !!user.emailVerified,
    xp: 0,
    achievements: [],
    visitedPages: [],
    friends: [],
    blocked: [],
    socialSettings: {
      systemEnabled: true,
      requestsEnabled: true,
      chatEnabled: true,
      groupChatsEnabled: true,
      showNonFriendGroupMessages: true,
      profileHidden: false
    },
    socialBackup: {
      friends: [],
      blocked: []
    },
    privacySettings: normalizePrivacySettings(),
    streak: {
      current: 0,
      longest: 0,
      lastClaimAt: null,
      lastClaimDay: ""
    },
    longestStreak: 0,
    streakHistory: {},
    stats: {
      pagesVisited: 0,
      planetsFound: 0,
      secretsFound: 0
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp()
  };
}

function normalizeSocialSettings(settings = {}) {
  return {
    systemEnabled: settings.systemEnabled !== false,
    requestsEnabled: settings.requestsEnabled !== false,
    chatEnabled: settings.chatEnabled !== false,
    groupChatsEnabled: settings.groupChatsEnabled !== false,
    showNonFriendGroupMessages: settings.showNonFriendGroupMessages !== false,
    profileHidden: !!settings.profileHidden
  };
}

function normalizeStreak(value = {}) {
  return {
    current: Number(value.current || 0),
    longest: Number(value.longest || 0),
    lastClaimAt: value.lastClaimAt || null,
    lastClaimDay: String(value.lastClaimDay || "")
  };
}

function normalizeStreakHistory(history = {}) {
  if (!history || typeof history !== "object" || Array.isArray(history)) return {};
  const next = {};
  for (const [key, value] of Object.entries(history)) {
    const cleanKey = String(key || "").trim();
    if (!cleanKey || !value || typeof value !== "object") continue;
    next[cleanKey] = {
      reward: Number(value.reward || 0),
      streakDay: Number(value.streakDay || 0),
      claimedAt: value.claimedAt || null
    };
  }
  return next;
}

function friendlyAuthError(error) {
  const code = String(error?.code || "");

  if (code === "auth/email-already-in-use") return "That email is already being used by another account.";
  if (code === "auth/invalid-email") return "That email address is not valid.";
  if (code === "auth/missing-password") return "Enter your password first.";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "That email or password is incorrect.";
  }
  if (code === "auth/too-many-requests") return "Too many attempts. Please wait a moment and try again.";
  if (code === "auth/operation-not-allowed") {
    return "This sign-in method is not enabled in Firebase Authentication yet.";
  }
  if (code === "auth/popup-closed-by-user") return "The Google sign-in popup was closed before the login finished.";
  if (code === "auth/popup-blocked") return "Your browser blocked the Google sign-in popup.";
  if (code === "auth/unauthorized-domain") {
    return "This domain is not authorized in Firebase yet. Add it in Firebase Authentication -> Settings -> Authorized domains.";
  }
  if (code === "auth/network-request-failed") return "The network request failed. Check your internet connection and try again.";
  return error?.message || "Authentication failed.";
}

export async function getProfile(uid = auth.currentUser?.uid) {
  if (!uid) return null;
  const snap = await getDoc(userRef(uid));
  return snap.exists() ? snap.data() : null;
}

export async function ensureUserProfile(user) {
  const ref = userRef(user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const data = baseProfile(user);
    await setDoc(ref, data, { merge: true });
    return data;
  }

  const data = snap.data() || {};
  const achievements = uniqueStrings(data.achievements);
  const visitedPages = uniqueStrings(data.visitedPages);
  const friends = uniqueStrings(data.friends);
  const blocked = uniqueStrings(data.blocked);
  const socialBackup = {
    friends: uniqueStrings(data.socialBackup?.friends),
    blocked: uniqueStrings(data.socialBackup?.blocked)
  };

  const merged = {
    uid: user.uid,
    email: user.email || data.email || "",
    emailLower: cleanEmail(user.email || data.email || ""),
    username: data.username || user.displayName || defaultUsername(user),
    photoURL: user.photoURL || data.photoURL || "",
    verified: !!user.emailVerified,
    xp: typeof data.xp === "number" ? data.xp : achievements.length,
    achievements,
    visitedPages,
    friends,
    blocked,
    socialSettings: normalizeSocialSettings(data.socialSettings),
    socialBackup,
    privacySettings: normalizePrivacySettings(data.privacySettings),
    streak: normalizeStreak(data.streak),
    longestStreak: Number(data.longestStreak || data.streak?.longest || 0),
    streakHistory: normalizeStreakHistory(data.streakHistory),
    stats: {
      pagesVisited: visitedPages.length,
      planetsFound: data.stats?.planetsFound || 0,
      secretsFound: data.stats?.secretsFound || 0
    },
    createdAt: data.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp()
  };

  await setDoc(ref, merged, { merge: true });
  return merged;
}

export async function updatePrivacySettings(patch = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const current = await getProfile(user.uid);
  const merged = normalizePrivacySettings({
    ...(current?.privacySettings || {}),
    ...(patch || {})
  });

  await setDoc(userRef(user.uid), {
    privacySettings: merged,
    updatedAt: serverTimestamp()
  }, { merge: true });

  return merged;
}

async function touchLastLoginOnce(user) {
  const key = `ptg_last_login_${user.uid}`;
  const today = new Date().toISOString().slice(0, 10);
  if (sessionStorage.getItem(key) === today) return;
  sessionStorage.setItem(key, today);
  await setDoc(userRef(user.uid), { lastLoginAt: serverTimestamp() }, { merge: true });
}

export async function createAccount(email, password, username) {
  const cleanName = cleanText(username).slice(0, 20);
  const cleanMail = cleanEmail(email);
  const cleanPass = String(password || "");

  if (!cleanName) throw new Error("Username is required.");
  if (!cleanMail) throw new Error("Email is required.");
  if (!cleanPass || cleanPass.length < 6) throw new Error("Password must be at least 6 characters.");

  try {
    const cred = await createUserWithEmailAndPassword(auth, cleanMail, cleanPass);
    await updateProfile(cred.user, { displayName: cleanName });
    await sendEmailVerification(cred.user);

    await setDoc(userRef(cred.user.uid), {
      ...baseProfile(cred.user),
      username: cleanName,
      verified: false
    });

    localStorage.setItem("ptg_logged_in", "1");
    return cred.user;
  } catch (error) {
    throw new Error(friendlyAuthError(error));
  }
}

export async function login(email, password) {
  const cleanMail = cleanEmail(email);
  const cleanPass = String(password || "");

  if (!cleanMail) throw new Error("Email is required.");
  if (!cleanPass) throw new Error("Password is required.");

  try {
    const cred = await signInWithEmailAndPassword(auth, cleanMail, cleanPass);
    await ensureUserProfile(cred.user);
    await touchLastLoginOnce(cred.user);
    localStorage.setItem("ptg_logged_in", "1");
    return cred.user;
  } catch (error) {
    throw new Error(friendlyAuthError(error));
  }
}

export async function loginWithGoogle() {
  if (window.location.protocol === "file:") {
    throw new Error("Google sign-in needs the site to run from localhost or a real domain, not directly as a file.");
  }

  try {
    const cred = await signInWithPopup(auth, googleProvider);
    await ensureUserProfile(cred.user);
    await touchLastLoginOnce(cred.user);
    localStorage.setItem("ptg_logged_in", "1");
    return cred.user;
  } catch (error) {
    throw new Error(friendlyAuthError(error));
  }
}

export async function logout() {
  localStorage.removeItem("ptg_logged_in");
  return signOut(auth);
}

export async function saveUsername(username) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const cleanName = cleanText(username).slice(0, 20);
  if (!cleanName) throw new Error("Username cannot be empty.");

  await updateProfile(user, { displayName: cleanName });
  await setDoc(userRef(user.uid), {
    username: cleanName,
    updatedAt: serverTimestamp()
  }, { merge: true });

  return cleanName;
}

export async function setAvatarPreset(presetId) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const id = String(presetId || "1");
  const profile = await getProfile(user.uid);
  const requiredRank = AVATAR_PRESET_REQUIREMENTS[id] || "Explorer";
  const currentRank = getRankFromXp(profile?.xp || 0);

  if (!doesRankMeetRequirement(currentRank, requiredRank)) {
    throw new Error(`Preset ${id} unlocks at ${requiredRank} rank.`);
  }

  const dataUrl = presetAvatarDataUrl(id);
  await updateProfile(user, { photoURL: dataUrl });
  await setDoc(userRef(user.uid), {
    photoURL: dataUrl,
    avatarType: "preset",
    avatarPreset: id,
    updatedAt: serverTimestamp()
  }, { merge: true });

  syncSidebarAvatar(dataUrl);
  return dataUrl;
}

export async function setAvatarLetter(letter) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const dataUrl = letterAvatarDataUrl(letter || user.displayName || user.email || "P");
  await updateProfile(user, { photoURL: dataUrl });
  await setDoc(userRef(user.uid), {
    photoURL: dataUrl,
    avatarType: "letter",
    avatarLetter: String(letter || "").trim().slice(0, 1).toUpperCase() || "P",
    updatedAt: serverTimestamp()
  }, { merge: true });

  syncSidebarAvatar(dataUrl);
  return dataUrl;
}

export async function useDefaultProfilePicture() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  await updateProfile(user, { photoURL: "" });
  await setDoc(userRef(user.uid), {
    photoURL: "",
    avatarType: "default",
    updatedAt: serverTimestamp()
  }, { merge: true });

  syncSidebarAvatar("");
  return true;
}

export async function changeEmail(newEmail, currentPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const providers = new Set((user.providerData || []).map((provider) => provider.providerId));
  if (!providers.has("password")) {
    throw new Error("This account uses Google sign-in, so email changes are not available here.");
  }

  const cleanMail = cleanEmail(newEmail);
  if (!cleanMail) throw new Error("New email is required.");
  if (!currentPassword) throw new Error("Current password is required.");

  try {
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updateEmail(user, cleanMail);
    await setDoc(userRef(user.uid), {
      email: cleanMail,
      emailLower: cleanMail,
      updatedAt: serverTimestamp()
    }, { merge: true });
    return cleanMail;
  } catch (error) {
    throw new Error(friendlyAuthError(error));
  }
}

export async function changePassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const providers = new Set((user.providerData || []).map((provider) => provider.providerId));
  if (!providers.has("password")) {
    throw new Error("This account uses Google sign-in, so password changes are not available here.");
  }

  const nextPass = String(newPassword || "");
  if (!currentPassword) throw new Error("Current password is required.");
  if (nextPass.length < 6) throw new Error("New password must be at least 6 characters.");

  try {
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, nextPass);
    return true;
  } catch (error) {
    throw new Error(friendlyAuthError(error));
  }
}

export async function resendVerificationEmail() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");
  if (user.emailVerified) return false;

  await sendEmailVerification(user);
  return true;
}

export async function requestPasswordReset(email) {
  const cleanMail = cleanEmail(email);
  if (!cleanMail) throw new Error("Email is required.");

  try {
    await sendPasswordResetEmail(auth, cleanMail);
  } catch (error) {
    throw new Error(friendlyAuthError(error));
  }
}

async function sendRelationshipResetMessage(user, targetUid, targetProfile, kind, body, targetId = null) {
  const fromName = user.displayName || user.email?.split("@")?.[0] || "Player";
  const toName = targetProfile?.username || targetProfile?.email?.split("@")?.[0] || "Player";

  await addDoc(collection(db, "messages"), {
    fromUid: user.uid,
    toUid: targetUid,
    participants: [user.uid, targetUid],
    fromName,
    toName,
    kind,
    title: kind === "friend-removed" ? "Friend removed" : "Blocked",
    body,
    targetSection: "messages",
    targetSubSection: "direct",
    targetId,
    readBy: [user.uid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

async function removeUserFromGroups(uid) {
  const chatsSnap = await getDocs(query(collection(db, "groupChats"), where("members", "array-contains", uid)));
  for (const chatDoc of chatsSnap.docs) {
    const chat = chatDoc.data() || {};
    const members = uniqueStrings(chat.members).filter((memberUid) => memberUid !== uid);
    const payload = {
      members,
      updatedAt: serverTimestamp()
    };

    if (!members.length) {
      payload.deleted = true;
    } else if (chat.ownerUid === uid) {
      payload.ownerUid = members[0];
    }

    await updateDoc(chatDoc.ref, payload);
  }

  const inviteQueries = await Promise.all([
    getDocs(query(collection(db, "groupChatInvites"), where("toUid", "==", uid))),
    getDocs(query(collection(db, "groupChatInvites"), where("fromUid", "==", uid)))
  ]);

  for (const inviteSnap of inviteQueries) {
    for (const invite of inviteSnap.docs) {
      const data = invite.data() || {};
      if ((data.status || "pending") !== "pending") continue;
      await updateDoc(invite.ref, {
        status: "cancelled",
        updatedAt: serverTimestamp()
      });
    }
  }
}

export async function resetAccountData(mode = "progress") {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const nextMode = new Set(["progress", "friends", "all"]).has(String(mode || "").trim().toLowerCase())
    ? String(mode || "").trim().toLowerCase()
    : "progress";

  const profile = (await getProfile(user.uid)) || {};
  const updates = {
    updatedAt: serverTimestamp()
  };

  if (nextMode === "progress" || nextMode === "all") {
    updates.xp = 0;
    updates.achievements = [];
    updates.visitedPages = [];
    updates.stats = {
      ...(profile.stats || {}),
      pagesVisited: 0,
      planetsFound: 0,
      secretsFound: 0
    };
    updates.longestStreak = 0;
    updates.streak = {
      current: 0,
      longest: 0,
      lastClaimAt: null,
      lastClaimDay: ""
    };
    updates.streakHistory = {};
  }

  if (nextMode === "friends" || nextMode === "all") {
    const friends = uniqueStrings(profile.friends);
    const blocked = uniqueStrings(profile.blocked);
    const nextBlocked = nextMode === "all" ? [] : blocked;

    updates.friends = [];
    updates.blocked = nextBlocked;
    updates.socialBackup = {
      friends: [],
      blocked: nextBlocked
    };

    const messagesSnap = await getDocs(query(collection(db, "messages"), where("participants", "array-contains", user.uid)));
    for (const messageDoc of messagesSnap.docs) {
      const data = messageDoc.data() || {};
      if (data.kind !== "friend-request" || (data.status || "pending") !== "pending") continue;
      await updateDoc(messageDoc.ref, {
        status: data.toUid === user.uid ? "ignored" : "cancelled",
        updatedAt: serverTimestamp()
      });
    }

    for (const friendUid of friends) {
      const friendProfile = await getProfile(friendUid);
      await sendRelationshipResetMessage(
        user,
        friendUid,
        friendProfile,
        "friend-removed",
        `${user.displayName || profile.username || "Player"} reset their friends list.`,
        user.uid
      );
    }

    if (nextMode === "all") {
      for (const blockedUid of blocked) {
        const blockedProfile = await getProfile(blockedUid);
        await sendRelationshipResetMessage(
          user,
          blockedUid,
          blockedProfile,
          "friend-blocked",
          `${user.displayName || profile.username || "Player"} reset their social data.`,
          user.uid
        );
      }
      await removeUserFromGroups(user.uid);
    }
  }

  await setDoc(userRef(user.uid), updates, { merge: true });
  localStorage.removeItem(`ptg_streak_${user.uid}`);
  return true;
}

export async function deleteAccount(password) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const providerIds = new Set((user.providerData || []).map((provider) => provider.providerId));

  try {
    if (providerIds.has("google.com") && !providerIds.has("password")) {
      if (window.location.protocol === "file:") {
        throw new Error("Google accounts must be reauthenticated from localhost or a real domain, not directly as a file.");
      }
      await reauthenticateWithPopup(user, googleProvider);
    } else {
      const cleanPass = String(password || "");
      if (!cleanPass) throw new Error("Password is required to delete your account.");
      const credential = EmailAuthProvider.credential(user.email, cleanPass);
      await reauthenticateWithCredential(user, credential);
    }

    await deleteDoc(userRef(user.uid));
    localStorage.removeItem("ptg_logged_in");
    await deleteUser(user);
  } catch (error) {
    throw new Error(friendlyAuthError(error));
  }
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      localStorage.removeItem("ptg_logged_in");
      callback(null, null);
      return;
    }

    try {
      localStorage.setItem("ptg_logged_in", "1");
      const profile = await ensureUserProfile(user);
      await touchLastLoginOnce(user);
      callback(user, profile);
    } catch (error) {
      console.error("Auth watch error:", error);
      callback(user, null);
    }
  });
}
