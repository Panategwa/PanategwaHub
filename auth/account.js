import { auth, db } from "./firebase-config.js";
import {
  login,
  loginWithGoogle,
  createAccount,
  logout,
  saveUsername,
  resendVerificationEmail,
  requestPasswordReset,
  deleteAccount,
  watchAuth
} from "./auth.js";

import {
  doc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

let profileUnsub = null;

function setStatus(text, kind = "info") {
  const el = $("auth-status");
  if (!el) return;
  el.textContent = text;
  el.dataset.kind = kind;
}

function getRank(xp) {
  if (xp < 5) return "Explorer";
  if (xp < 20) return "Adventurer";
  return "Veteran";
}

function formatDate(value) {
  if (!value) return "—";
  if (typeof value === "number") return new Date(value).toLocaleString();
  if (typeof value?.toDate === "function") return value.toDate().toLocaleString();
  if (value instanceof Date) return value.toLocaleString();
  return "—";
}

function showMode(mode) {
  const loginPanel = $("login-panel");
  const signupPanel = $("signup-panel");
  const loginTab = $("tab-login");
  const signupTab = $("tab-signup");

  if (loginPanel) loginPanel.style.display = mode === "login" ? "block" : "none";
  if (signupPanel) signupPanel.style.display = mode === "signup" ? "block" : "none";

  if (loginTab) loginTab.classList.toggle("active", mode === "login");
  if (signupTab) signupTab.classList.toggle("active", mode === "signup");
}

function renderUser(user, profile) {
  const info = $("user-info");
  const authCard = $("auth-card");
  const accountCard = $("account-card");
  const logoutBtn = $("logout-btn");
  const deleteBtn = $("delete-account-btn");

  if (!info) return;

  if (!user) {
    if (authCard) authCard.style.display = "block";
    if (accountCard) accountCard.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "none";
    if (deleteBtn) deleteBtn.style.display = "none";

    info.innerHTML = `
      <p><b>Status:</b> Not logged in</p>
      <p><b>Username:</b> —</p>
      <p><b>Email:</b> —</p>
      <p><b>Verified:</b> —</p>
      <p><b>XP:</b> 0</p>
      <p><b>Rank:</b> Explorer</p>
      <p><b>Account ID:</b> —</p>
      <p><b>Created:</b> —</p>
      <p><b>Last login:</b> —</p>
    `;

    return;
  }

  if (authCard) authCard.style.display = "none";
  if (accountCard) accountCard.style.display = "block";
  if (logoutBtn) logoutBtn.style.display = "inline-block";
  if (deleteBtn) deleteBtn.style.display = "inline-block";

  const username = profile?.username || user.displayName || "Player";
  const email = user.email || profile?.email || "—";
  const verified = user.emailVerified ? "Yes" : "No";
  const xp = typeof profile?.xp === "number" ? profile.xp : 0;
  const rank = getRank(xp);

  info.innerHTML = `
    <div class="account-header">
      ${
        user.photoURL
          ? `<img src="${user.photoURL}" alt="Avatar" class="account-avatar">`
          : `<div class="account-avatar-placeholder">👤</div>`
      }
      <div>
        <p style="margin:0;"><b>${username}</b></p>
        <p style="margin:0; opacity:0.8;">${email}</p>
      </div>
    </div>

    <p><b>Status:</b> Logged in</p>
    <p><b>Username:</b> ${username}</p>
    <p><b>Email:</b> ${email}</p>
    <p><b>Verified:</b> ${verified}</p>
    <p><b>XP:</b> ${xp}</p>
    <p><b>Rank:</b> ${rank}</p>
    <p><b>Account ID:</b> ${user.uid}</p>
    <p><b>Created:</b> ${formatDate(profile?.createdAt)}</p>
    <p><b>Last login:</b> ${formatDate(profile?.lastLoginAt)}</p>
  `;

  const usernameInput = $("profile-username");
  if (usernameInput) usernameInput.value = username;
}

function bindButtons() {
  $("tab-login")?.addEventListener("click", () => showMode("login"));
  $("tab-signup")?.addEventListener("click", () => showMode("signup"));

  $("login-btn")?.addEventListener("click", async () => {
    try {
      setStatus("Logging in...", "info");
      await login($("login-email")?.value || "", $("login-password")?.value || "");
      setStatus("Logged in.", "success");
    } catch (error) {
      console.error(error);
      setStatus(error?.message || "Login failed.", "error");
      alert(error?.message || "Login failed.");
    }
  });

  $("google-btn")?.addEventListener("click", async () => {
    try {
      setStatus("Signing in with Google...", "info");
      await loginWithGoogle();
      setStatus("Logged in.", "success");
    } catch (error) {
      console.error(error);
      setStatus(error?.message || "Google login failed.", "error");
      alert(error?.message || "Google login failed.");
    }
  });

  $("signup-btn")?.addEventListener("click", async () => {
    try {
      setStatus("Creating account...", "info");
      await createAccount(
        $("signup-email")?.value || "",
        $("signup-password")?.value || "",
        $("signup-username")?.value || ""
      );
      setStatus("Account created. Check your email for verification.", "success");
      alert("Account created. Check your email for verification.");
      showMode("login");
    } catch (error) {
      console.error(error);
      setStatus(error?.message || "Sign up failed.", "error");
      alert(error?.message || "Sign up failed.");
    }
  });

  $("save-username-btn")?.addEventListener("click", async () => {
    try {
      setStatus("Saving name...", "info");
      await saveUsername($("profile-username")?.value || "");
      setStatus("Name saved.", "success");
      alert("Name saved.");
    } catch (error) {
      console.error(error);
      setStatus(error?.message || "Could not save name.", "error");
      alert(error?.message || "Could not save name.");
    }
  });

  $("reset-password-btn")?.addEventListener("click", async () => {
    try {
      setStatus("Sending reset email...", "info");
      await requestPasswordReset(
        $("login-email")?.value || $("signup-email")?.value || ""
      );
      setStatus("Password reset email sent.", "success");
      alert("Password reset email sent.");
    } catch (error) {
      console.error(error);
      setStatus(error?.message || "Could not send reset email.", "error");
      alert(error?.message || "Could not send reset email.");
    }
  });

  $("resend-verification-btn")?.addEventListener("click", async () => {
    try {
      const sent = await resendVerificationEmail();
      if (sent === false) {
        setStatus("Your email is already verified.", "info");
        alert("Your email is already verified.");
        return;
      }

      setStatus("Verification email sent.", "success");
      alert("Verification email sent.");
    } catch (error) {
      console.error(error);
      setStatus(error?.message || "Could not resend verification email.", "error");
      alert(error?.message || "Could not resend verification email.");
    }
  });

  $("logout-btn")?.addEventListener("click", async () => {
    try {
      await logout();
      setStatus("Logged out.", "info");
    } catch (error) {
      console.error(error);
      setStatus(error?.message || "Logout failed.", "error");
      alert(error?.message || "Logout failed.");
    }
  });

  $("delete-account-btn")?.addEventListener("click", async () => {
    const password = $("delete-password")?.value || "";

    if (!confirm("Delete your account permanently?")) return;

    try {
      setStatus("Deleting account...", "info");
      await deleteAccount(password);
      setStatus("Account deleted.", "success");
      alert("Account deleted.");
      window.location.reload();
    } catch (error) {
      console.error(error);
      setStatus(error?.message || "Delete failed.", "error");
      alert(error?.message || "Delete failed.");
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindButtons();
  showMode("login");
  setStatus("Checking account...", "info");

  setTimeout(() => {
    const status = $("auth-status");
    if (status && String(status.textContent || "").includes("Checking account")) {
      setStatus("Not logged in.", "info");
    }
  }, 5000);

  watchAuth((user, profile) => {
    if (profileUnsub) {
      profileUnsub();
      profileUnsub = null;
    }

    if (!user) {
      renderUser(null, null);
      setStatus("Not logged in.", "info");
      return;
    }

    renderUser(user, profile);
    setStatus(user.emailVerified ? "Logged in and verified." : "Logged in.", "success");

    profileUnsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (!snap.exists()) return;
      renderUser(user, snap.data());
    });
  });
});