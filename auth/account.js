import { auth, googleProvider } from "./firebase-config.js";

import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  deleteUser,
  updateProfile,
  sendEmailVerification,
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

function $(id) {
  return document.getElementById(id);
}

function safeText(v) {
  return String(v ?? "").replace(/[<>&"]/g, c => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "\"": "&quot;"
  }[c]));
}

function setStatus(msg, type = "info") {
  const el = $("auth-status");
  if (!el) return;
  el.textContent = msg;
  el.dataset.kind = type;
}

/* ---------------- LOGIN ---------------- */

async function loginWithGoogle() {
  return await signInWithPopup(auth, googleProvider);
}

async function logout() {
  return await signOut(auth);
}

/* ---------------- USER UI ---------------- */

function renderUser(user) {
  const box = $("user-info");
  if (!box) return;

  if (!user) {
    box.innerHTML = `
      <p><b>Status:</b> Not logged in</p>
      <p><b>Username:</b> —</p>
      <p><b>Email:</b> —</p>
      <p><b>Verified:</b> —</p>
      <p><b>Account ID:</b> —</p>
      <p><b>Achievements:</b> Coming soon</p>
    `;
    return;
  }

  box.innerHTML = `
    <div style="display:flex; gap:12px; align-items:center;">
      <img src="${user.photoURL || ""}" width="60" style="border-radius:50%">
      <div>
        <b>${safeText(user.displayName || "No name")}</b><br>
        <small>${safeText(user.email)}</small>
      </div>
    </div>

    <p><b>Status:</b> Logged in</p>
    <p><b>Verified:</b> ${user.emailVerified ? "Yes" : "No"}</p>
    <p><b>Account ID:</b> ${user.uid}</p>
    <p><b>Achievements:</b> Coming soon</p>
  `;
}

/* ---------------- ACTIONS ---------------- */

window.loginWithGoogle = async () => {
  try {
    setStatus("Signing in...");
    await loginWithGoogle();
  } catch (e) {
    console.error(e);
    setStatus("Login failed", "error");
  }
};

window.logout = async () => {
  await logout();
};

window.saveUsername = async () => {
  const user = auth.currentUser;
  const username = $("username")?.value;

  if (!user) return alert("Not logged in");

  await updateProfile(user, {
    displayName: username
  });

  alert("Username saved!");
};

window.deleteAccount = async () => {
  const user = auth.currentUser;
  if (!user) return;

  if (!confirm("Delete account?")) return;

  try {
    await deleteUser(user);
    alert("Account deleted");
  } catch (e) {
    alert("You need to log in again to delete account");
  }
};

/* ---------------- AUTH STATE ---------------- */

onAuthStateChanged(auth, (user) => {
  renderUser(user);

  if (!user) {
    setStatus("Not logged in");
  } else {
    setStatus("Logged in", "success");
  }
});

/* ---------------- INIT BUTTONS ---------------- */

document.addEventListener("DOMContentLoaded", () => {
  $("google-login-btn")?.addEventListener("click", window.loginWithGoogle);
  $("logout-btn")?.addEventListener("click", window.logout);
  $("delete-account-btn")?.addEventListener("click", window.deleteAccount);
});