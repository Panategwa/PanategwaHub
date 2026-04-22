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
  setDoc,
  deleteDoc,
  addDoc,
  collection,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

function userRef(uid) {
  return doc(db, "users", uid);
}

function messagesRef() {
  return collection(db, "messages");
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
  Explorer: 0,
  Adventurer: 1,
  Veteran: 2
});

export const AVATAR_PRESET_REQUIREMENTS = Object.freeze({
  "1": "Explorer",
  "2": "Explorer",
  "3": "Adventurer",
  "4": "Veteran"
});

export function getRankFromXp(xp) {
  if (Number(xp || 0) < 5) return "Explorer";
  if (Number(xp || 0) < 20) return "Adventurer";
  return "Veteran";
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
        <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#6c5ce7"/><stop offset="1" stop-color="#a29bfe"/></linearGradient></defs>
        <rect width="128" height="128" rx="64" fill="url(#g)"/>
        <circle cx="64" cy="66" r="26" fill="rgba(255,255,255,0.15)"/>
        <path d="M64 38a28 28 0 1 0 28 28A28 28 0 0 0 64 38z" fill="none" stroke="white" stroke-width="6"/>
        <circle cx="50" cy="58" r="5" fill="white"/><circle cx="78" cy="58" r="5" fill="white"/>
      </svg>
    `);
  }

  if (id === "3") {
    return svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#00b894"/><stop offset="1" stop-color="#55efc4"/></linearGradient></defs>
        <rect width="128" height="128" rx="64" fill="url(#g)"/>
        <circle cx="64" cy="64" r="34" fill="rgba(255,255,255,0.15)"/>
        <circle cx="64" cy="64" r="22" fill="none" stroke="white" stroke-width="6"/>
        <circle cx="64" cy="64" r="8" fill="white"/>
      </svg>
    `);
  }

  if (id === "4") {
    return svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#d35400"/><stop offset="1" stop-color="#f1c40f"/></linearGradient></defs>
        <rect width="128" height="128" rx="64" fill="url(#g)"/>
        <path d="M64 22l13 26 29 4-21 20 5 29-26-13-26 13 5-29-21-20 29-4z" fill="rgba(255,255,255,0.95)"/>
        <circle cx="64" cy="61" r="12" fill="rgba(211,84,0,0.72)"/>
      </svg>
    `);
  }

  return svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
      <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#0984e3"/><stop offset="1" stop-color="#74b9ff"/></linearGradient></defs>
      <rect width="128" height="128" rx="64" fill="url(#g)"/>
      <path d="M64 30l10 20 22 3-16 16 4 22-20-10-20 10 4-22-16-16 22-3z" fill="rgba(255,255,255,0.92)"/>
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

async function createSystemMessage(user, title, body, targetSection = "messages", targetSubSection = "system", targetId = null) {
  if (!user) return;

  await addDoc(messagesRef(), {
    fromUid: user.uid,
    toUid: user.uid,
    participants: [user.uid],
    fromName: user.displayName || user.email?.split("@")?.[0] || "System",
    toName: user.displayName || user.email?.split("@")?.[0] || "System",
    kind: "system",
    title,
    body,
    targetSection,
    targetSubSection,
    targetId,
    readBy: [user.uid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
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

async function maybeCreateLoginMessage(user) {
  const today = new Date().toISOString().slice(0, 10);
  const key = `ptg_login_msg_${user.uid}_${today}`;
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, "1");

  await createSystemMessage(
    user,
    "Logged in",
    `You signed in as ${user.displayName || user.email?.split("@")?.[0] || "Player"}.`,
    "messages",
    "system",
    null
  );
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

    await createSystemMessage(
      cred.user,
      "Welcome",
      "Your account was created successfully.",
      "messages",
      "system",
      null
    );

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
    await maybeCreateLoginMessage(cred.user);
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
    await maybeCreateLoginMessage(cred.user);
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
      await maybeCreateLoginMessage(user);
      callback(user, profile);
    } catch (error) {
      console.error("Auth watch error:", error);
      callback(user, null);
    }
  });
}
