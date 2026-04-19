import {
  auth,
  db,
  googleProvider,
  githubProvider,
  facebookProvider,
  twitterProvider
} from "./firebase-config.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithCustomToken,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  updateProfile,
  deleteUser,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  EmailAuthProvider,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
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
  return [...new Set(arr.map(v => String(v || "").trim()).filter(Boolean))];
}

function defaultUsername(user) {
  return user?.displayName || user?.email?.split("@")?.[0] || "Player";
}

function baseProfile(user) {
  return {
    uid: user.uid,
    email: user.email || "",
    emailLower: cleanEmail(user.email),
    username: user.displayName || defaultUsername(user),
    avatarEmoji: "👤",
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

async function getProfile(uid = auth.currentUser?.uid) {
  if (!uid) return null;
  const snap = await getDoc(userRef(uid));
  if (!snap.exists()) return null;
  return snap.data();
}

async function ensureUserProfile(user) {
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
    avatarEmoji: data.avatarEmoji || "👤",
    verified: !!user.emailVerified,
    xp: typeof data.xp === "number" ? data.xp : achievements.length,
    achievements,
    visitedPages,
    friends,
    blocked,
    socialSettings: normalizeSocialSettings(data.socialSettings),
    socialBackup,
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

async function touchLastLoginOnce(user) {
  const key = `ptg_last_login_${user.uid}`;
  const today = new Date().toISOString().slice(0, 10);
  if (sessionStorage.getItem(key) === today) return;
  sessionStorage.setItem(key, today);
  await setDoc(userRef(user.uid), { lastLoginAt: serverTimestamp() }, { merge: true });
}

async function createAccount(email, password, username) {
  const cleanName = cleanText(username);
  const cleanMail = cleanEmail(email);
  const cleanPass = String(password || "");

  if (!cleanName) throw new Error("Username is required.");
  if (!cleanMail) throw new Error("Email is required.");
  if (!cleanPass) throw new Error("Password is required.");

  const cred = await createUserWithEmailAndPassword(auth, cleanMail, cleanPass);
  await updateProfile(cred.user, { displayName: cleanName });
  await sendEmailVerification(cred.user);

  await setDoc(userRef(cred.user.uid), {
    ...baseProfile(cred.user),
    username: cleanName,
    verified: false
  });

  return cred.user;
}

async function login(email, password) {
  const cleanMail = cleanEmail(email);
  const cleanPass = String(password || "");

  if (!cleanMail) throw new Error("Email is required.");
  if (!cleanPass) throw new Error("Password is required.");

  const cred = await signInWithEmailAndPassword(auth, cleanMail, cleanPass);
  await ensureUserProfile(cred.user);
  await touchLastLoginOnce(cred.user);
  return cred.user;
}

async function loginWithPopupProvider(provider) {
  const cred = await signInWithPopup(auth, provider);
  await ensureUserProfile(cred.user);
  await touchLastLoginOnce(cred.user);
  return cred.user;
}

async function loginWithGoogle() {
  return loginWithPopupProvider(googleProvider);
}

async function loginWithGitHub() {
  return loginWithPopupProvider(githubProvider);
}

async function loginWithFacebook() {
  return loginWithPopupProvider(facebookProvider);
}

async function loginWithTwitter() {
  return loginWithPopupProvider(twitterProvider);
}

async function loginWithDiscord() {
  const url = window.PANATEGWA_DISCORD_TOKEN_URL || "";
  if (!url) {
    throw new Error("Discord login needs a backend endpoint that returns a Firebase custom token.");
  }

  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error("Discord login endpoint failed.");

  const data = await response.json();
  if (!data?.token) throw new Error("Discord login did not return a Firebase token.");

  const cred = await signInWithCustomToken(auth, data.token);
  await ensureUserProfile(cred.user);
  await touchLastLoginOnce(cred.user);
  return cred.user;
}

async function logout() {
  return signOut(auth);
}

async function saveUsername(username) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const cleanName = cleanText(username);
  if (!cleanName) throw new Error("Username cannot be empty.");

  await updateProfile(user, { displayName: cleanName });
  await setDoc(userRef(user.uid), {
    username: cleanName,
    updatedAt: serverTimestamp()
  }, { merge: true });

  return cleanName;
}

async function saveProfileEmoji(emoji) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const value = String(emoji || "").trim().slice(0, 4) || "👤";
  await setDoc(userRef(user.uid), {
    avatarEmoji: value,
    updatedAt: serverTimestamp()
  }, { merge: true });

  return value;
}

async function resendVerificationEmail() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");
  if (user.emailVerified) return false;

  await sendEmailVerification(user);
  return true;
}

async function requestPasswordReset(email) {
  const cleanMail = cleanEmail(email);
  if (!cleanMail) throw new Error("Email is required.");
  await sendPasswordResetEmail(auth, cleanMail);
}

async function deleteAccount(password) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const providerIds = new Set((user.providerData || []).map(p => p.providerId));
  const cleanPass = String(password || "");

  if (providerIds.has("google.com") && !providerIds.has("password")) {
    await reauthenticateWithPopup(user, googleProvider);
  } else if (providerIds.has("github.com")) {
    await reauthenticateWithPopup(user, githubProvider);
  } else if (providerIds.has("facebook.com")) {
    await reauthenticateWithPopup(user, facebookProvider);
  } else if (providerIds.has("twitter.com")) {
    await reauthenticateWithPopup(user, twitterProvider);
  } else {
    if (!cleanPass) throw new Error("Password is required to delete your account.");
    const credential = EmailAuthProvider.credential(user.email, cleanPass);
    await reauthenticateWithCredential(user, credential);
  }

  await deleteDoc(userRef(user.uid));
  await deleteUser(user);
}

function watchAuth(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback(null, null);
      return;
    }

    try {
      const profile = await ensureUserProfile(user);
      await touchLastLoginOnce(user);
      callback(user, profile);
    } catch (err) {
      console.error("Auth watch error:", err);
      callback(user, null);
    }
  });
}

function getCurrentUser() {
  return auth.currentUser;
}

export {
  createAccount,
  login,
  loginWithGoogle,
  loginWithGitHub,
  loginWithFacebook,
  loginWithTwitter,
  loginWithDiscord,
  logout,
  saveUsername,
  saveProfileEmoji,
  resendVerificationEmail,
  requestPasswordReset,
  deleteAccount,
  watchAuth,
  getCurrentUser,
  getProfile,
  ensureUserProfile
};