import { auth, googleProvider } from "./firebase-config.js";
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  deleteUser,
  reauthenticateWithPopup,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    const code = error?.code || "";

    if (
      code === "auth/popup-blocked" ||
      code === "auth/operation-not-supported-in-this-environment" ||
      code === "auth/cancelled-popup-request" ||
      code === "auth/popup-closed-by-user"
    ) {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }

    throw error;
  }
}

async function completeRedirectLogin() {
  try {
    const result = await getRedirectResult(auth);
    return result?.user || null;
  } catch (error) {
    console.error("Redirect result error:", error);
    return null;
  }
}

async function logout() {
  await signOut(auth);
}

function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

function getCurrentUser() {
  return auth.currentUser;
}

async function saveUsername(displayName) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Not logged in.");
  }

  const cleanName = String(displayName || "").trim();
  if (!cleanName) {
    throw new Error("Username cannot be empty.");
  }

  await updateProfile(user, { displayName: cleanName });
  await user.reload();

  return user;
}

async function deleteAccount() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Not logged in.");
  }

  try {
    await deleteUser(user);
    return true;
  } catch (error) {
    if (error?.code === "auth/requires-recent-login") {
      await reauthenticateWithPopup(user, googleProvider);
      await deleteUser(user);
      return true;
    }

    throw error;
  }
}

export {
  loginWithGoogle,
  completeRedirectLogin,
  logout,
  watchAuth,
  getCurrentUser,
  saveUsername,
  deleteAccount
};