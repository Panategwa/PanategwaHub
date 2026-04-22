import { auth, db, googleProvider, microsoftProvider } from "./firebase-config.js";

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
  return [...new Set(arr.map(v => String(v || "").trim()).filter(Boolean))];
}

function defaultUsername(user) {
  return user?.displayName || user?.email?.split("@")?.[0] || "Player";
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

  return svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
      <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#0984e3"/><stop offset="1" stop-color="#74b9ff"/></linearGradient></defs>
      <rect width="128" height="128" rx="64" fill="url(#g)"/>
      <path d="M64 30l10 20 22 3-16 16 4 22-20-10-20 10 4-22-16-16 22-3z" fill="rgba(255,255,255,0.92)"/>
    </svg>
  `);
}

function letterAvatarDataUrl(letter) {
  const char = String(letter || "")
    .trim()
    .slice(0, 1)
    .toUpperCase() || "P";

  return svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
      <rect width="128" height="128" rx="64" fill="#27344f"/>
      <text x="64" y="76" text-anchor="middle" font-size="62" font-family="Arial, sans-serif" fill="#fff">${char}</text>
    </svg>
  `);
}

function syncSidebarAvatar(photoURL) {
  if (typeof window.PanategwaUpdateSidebarAvatar === "function") {
    window.PanategwaUpdateSidebarAvatar(photoURL || "", "👤");
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
    photoURL: user.photoURL || data.photoURL || "",
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

function providerIdsForUser(user) {
  return new Set((user?.providerData || []).map((provider) => provider.providerId));
}

function socialProviderInfo(user) {
  const providers = providerIdsForUser(user);
  if (providers.has("google.com")) return { provider: googleProvider, label: "Google" };
  if (providers.has("microsoft.com")) return { provider: microsoftProvider, label: "Microsoft" };
  return null;
}

async function createAccount(email, password, username) {
  const cleanName = cleanText(username).slice(0, 20);
  const cleanMail = cleanEmail(email);
  const cleanPass = String(password || "");

  if (!cleanName) throw new Error("Username is required.");
  if (cleanName.length > 20) throw new Error("Username must be 20 characters or less.");
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

  await createSystemMessage(
    cred.user,
    "Welcome",
    "Your account was created successfully.",
    "messages",
    "system",
    null
  );

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
  await maybeCreateLoginMessage(cred.user);
  localStorage.setItem("ptg_logged_in", "1");
  return cred.user;
}

async function loginWithGoogle() {
  const cred = await signInWithPopup(auth, googleProvider);
  await ensureUserProfile(cred.user);
  await touchLastLoginOnce(cred.user);
  await maybeCreateLoginMessage(cred.user);
  localStorage.setItem("ptg_logged_in", "1");
  return cred.user;
}

async function loginWithMicrosoft() {
  const cred = await signInWithPopup(auth, microsoftProvider);
  await ensureUserProfile(cred.user);
  await touchLastLoginOnce(cred.user);
  await maybeCreateLoginMessage(cred.user);
  localStorage.setItem("ptg_logged_in", "1");
  return cred.user;
}

async function logout() {
  localStorage.removeItem("ptg_logged_in");
  return signOut(auth);
}

async function saveUsername(username) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const cleanName = cleanText(username).slice(0, 20);
  if (!cleanName) throw new Error("Username cannot be empty.");
  if (cleanName.length > 20) throw new Error("Username must be 20 characters or less.");

  await updateProfile(user, { displayName: cleanName });
  await setDoc(userRef(user.uid), {
    username: cleanName,
    updatedAt: serverTimestamp()
  }, { merge: true });

  return cleanName;
}

async function saveProfilePictureFromFile(file) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");
  if (!file) throw new Error("Choose an image first.");
  if (!String(file.type || "").startsWith("image/")) throw new Error("That file is not an image.");

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the image file."));
    reader.readAsDataURL(file);
  });

  if (dataUrl.length > 250000) {
    throw new Error("Image is too large. Use a smaller image.");
  }

  await updateProfile(user, { photoURL: dataUrl });
  await setDoc(userRef(user.uid), {
    photoURL: dataUrl,
    updatedAt: serverTimestamp()
  }, { merge: true });

  syncSidebarAvatar(dataUrl);
  return dataUrl;
}

async function setAvatarPreset(presetId) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const dataUrl = presetAvatarDataUrl(presetId);
  await updateProfile(user, { photoURL: dataUrl });
  await setDoc(userRef(user.uid), {
    photoURL: dataUrl,
    avatarType: "preset",
    avatarPreset: String(presetId),
    updatedAt: serverTimestamp()
  }, { merge: true });

  syncSidebarAvatar(dataUrl);
  return dataUrl;
}

async function setAvatarLetter(letter) {
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

async function useDefaultProfilePicture() {
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

async function changeEmail(newEmail, currentPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const providers = providerIdsForUser(user);
  if (!providers.has("password")) {
    const providerInfo = socialProviderInfo(user);
    throw new Error(`This account uses ${providerInfo?.label || "social"} sign-in, so email changes are not available here.`);
  }

  const cleanMail = cleanEmail(newEmail);
  if (!cleanMail) throw new Error("New email is required.");
  if (!currentPassword) throw new Error("Current password is required.");

  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updateEmail(user, cleanMail);

  await setDoc(userRef(user.uid), {
    email: cleanMail,
    emailLower: cleanMail,
    updatedAt: serverTimestamp()
  }, { merge: true });

  return cleanMail;
}

async function changePassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const providers = providerIdsForUser(user);
  if (!providers.has("password")) {
    const providerInfo = socialProviderInfo(user);
    throw new Error(`This account uses ${providerInfo?.label || "social"} sign-in, so password changes are not available here.`);
  }

  const nextPass = String(newPassword || "");
  if (!currentPassword) throw new Error("Current password is required.");
  if (!nextPass || nextPass.length < 6) throw new Error("New password must be at least 6 characters.");

  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, nextPass);

  return true;
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

  const providerIds = providerIdsForUser(user);
  const cleanPass = String(password || "");

  if (!providerIds.has("password")) {
    const providerInfo = socialProviderInfo(user);
    if (!providerInfo) throw new Error("This account needs a supported provider reauthentication flow before it can be deleted.");
    await reauthenticateWithPopup(user, providerInfo.provider);
  } else {
    if (!cleanPass) throw new Error("Password is required to delete your account.");
    const credential = EmailAuthProvider.credential(user.email, cleanPass);
    await reauthenticateWithCredential(user, credential);
  }

  await deleteDoc(userRef(user.uid));
  localStorage.removeItem("ptg_logged_in");
  await deleteUser(user);
}

function watchAuth(callback) {
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
  loginWithMicrosoft,
  logout,
  saveUsername,
  saveProfilePictureFromFile,
  setAvatarPreset,
  setAvatarLetter,
  useDefaultProfilePicture,
  changeEmail,
  changePassword,
  resendVerificationEmail,
  requestPasswordReset,
  deleteAccount,
  watchAuth,
  getCurrentUser,
  getProfile,
  ensureUserProfile
};
