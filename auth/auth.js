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

function baseProfile(user) {
  return {
    uid: user.uid,
    email: user.email || "",
    emailLower: cleanEmail(user.email),
    username: user.displayName || "",
    verified: !!user.emailVerified,
    xp: 0,
    achievements: [],
    visitedPages: [],
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
  const xp = typeof data.xp === "number" ? data.xp : achievements.length;

  const merged = {
    uid: user.uid,
    email: user.email || data.email || "",
    emailLower: cleanEmail(user.email || data.email || ""),
    username: data.username || user.displayName || "",
    verified: !!user.emailVerified,
    xp,
    achievements,
    visitedPages,
    stats: {
      pagesVisited: visitedPages.length,
      planetsFound: data.stats?.planetsFound || 0,
      secretsFound: data.stats?.secretsFound || 0
    },
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp()
  };

  await setDoc(ref, merged, { merge: true });
  return { ...data, ...merged };
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
  return cred.user;
}

async function loginWithGoogle() {
  const cred = await signInWithPopup(auth, googleProvider);
  await ensureUserProfile(cred.user);
  return cred.user;
}

async function logout() {
  return await signOut(auth);
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
  } else {
    if (!cleanPass) {
      throw new Error("Password is required to delete your account.");
    }

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
  logout,
  saveUsername,
  resendVerificationEmail,
  requestPasswordReset,
  deleteAccount,
  watchAuth,
  getCurrentUser,
  getProfile,
  ensureUserProfile
};