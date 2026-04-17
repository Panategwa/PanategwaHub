import {
  loginWithGoogle,
  completeRedirectLogin,
  logout,
  watchAuth,
  getCurrentUser,
  saveUsername,
  deleteAccount
} from "./auth.js";

function $(id) {
  return document.getElementById(id);
}

function safeText(value) {
  return String(value ?? "").replace(/[<>&"]/g, ch => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "\"": "&quot;"
  }[ch]));
}

function setStatus(message, kind = "info") {
  const el = $("auth-status");
  if (!el) return;
  el.textContent = message;
  el.dataset.kind = kind;
}

function providerLabel(user) {
  const provider = user?.providerData?.[0]?.providerId || "unknown";
  if (provider === "google.com") return "Google";
  return provider;
}

function renderUser(user) {
  const info = $("user-info");
  const usernameInput = $("username");
  const loginBtn = $("google-login-btn");
  const logoutBtn = $("logout-btn");
  const saveBtn = $("save-username-btn");
  const deleteBtn = $("delete-account-btn");

  if (!info) return;

  if (!user) {
    info.innerHTML = `
      <p><b>Status:</b> Not logged in</p>
      <p><b>Username:</b> —</p>
      <p><b>Email:</b> —</p>
      <p><b>Verified:</b> —</p>
      <p><b>Provider:</b> —</p>
      <p><b>Account ID:</b> —</p>
      <p><b>Achievements:</b> Coming soon</p>
      <p><b>Rank:</b> Explorer</p>
    `;

    if (usernameInput) usernameInput.value = "";
    if (loginBtn) loginBtn.style.display = "inline-block";
    if (logoutBtn) logoutBtn.style.display = "none";
    if (saveBtn) saveBtn.style.display = "none";
    if (deleteBtn) deleteBtn.style.display = "none";
    return;
  }

  const displayName = user.displayName || "";
  const email = user.email || "—";
  const verified = user.emailVerified ? "Yes" : "No";
  const provider = providerLabel(user);

  info.innerHTML = `
    <div style="display:flex; align-items:center; gap:12px; margin-bottom: 12px;">
      <img
        src="${safeText(user.photoURL || "")}"
        alt="Profile photo"
        style="width:64px; height:64px; border-radius:50%; object-fit:cover; background: rgba(255,255,255,0.12);"
      >
      <div>
        <p style="margin:0;"><b>${safeText(displayName || "No name")}</b></p>
        <p style="margin:0; opacity:0.8;">${safeText(email)}</p>
      </div>
    </div>

    <p><b>Status:</b> Logged in</p>
    <p><b>Username:</b> ${safeText(displayName || "Not set")}</p>
    <p><b>Email:</b> ${safeText(email)}</p>
    <p><b>Verified:</b> ${verified}</p>
    <p><b>Provider:</b> ${safeText(provider)}</p>
    <p><b>Account ID:</b> ${safeText(user.uid)}</p>
    <p><b>Achievements:</b> Coming soon</p>
    <p><b>Rank:</b> Explorer</p>
  `;

  if (usernameInput) usernameInput.value = displayName;
  if (loginBtn) loginBtn.style.display = "none";
  if (logoutBtn) logoutBtn.style.display = "inline-block";
  if (saveBtn) saveBtn.style.display = "inline-block";
  if (deleteBtn) deleteBtn.style.display = "inline-block";
}

async function handleGoogleLogin() {
  try {
    setStatus("Opening Google sign-in...", "info");
    const result = await loginWithGoogle();

    if (result) {
      setStatus("Logged in with Google.", "success");
    } else {
      setStatus("Finishing sign-in...", "info");
    }
  } catch (error) {
    console.error(error);
    setStatus(error?.message || "Google sign-in failed.", "error");
    alert(error?.message || "Google sign-in failed.");
  }
}

async function handleSaveUsername() {
  const username = $("username")?.value || "";

  try {
    setStatus("Saving username...", "info");
    await saveUsername(username);
    setStatus("Username saved.", "success");
    alert("Username saved.");
  } catch (error) {
    console.error(error);
    setStatus(error?.message || "Could not save username.", "error");
    alert(error?.message || "Could not save username.");
  }
}

async function handleLogout() {
  try {
    await logout();
    setStatus("Logged out.", "info");
    alert("Logged out.");
  } catch (error) {
    console.error(error);
    setStatus(error?.message || "Logout failed.", "error");
    alert(error?.message || "Logout failed.");
  }
}

async function handleDeleteAccount() {
  const user = getCurrentUser();

  if (!user) {
    setStatus("Sign in first.", "error");
    alert("Sign in first.");
    return;
  }

  if (!confirm("Delete your account permanently?")) return;

  try {
    setStatus("Deleting account...", "info");
    await deleteAccount();
    setStatus("Account deleted.", "success");
    alert("Account deleted.");
    window.location.href = "index.html";
  } catch (error) {
    console.error(error);
    setStatus(error?.message || "Delete failed.", "error");
    alert(error?.message || "Delete failed.");
  }
}

function bindButtons() {
  $("google-login-btn")?.addEventListener("click", handleGoogleLogin);
  $("save-username-btn")?.addEventListener("click", handleSaveUsername);
  $("logout-btn")?.addEventListener("click", handleLogout);
  $("delete-account-btn")?.addEventListener("click", handleDeleteAccount);
}

window.loginWithGoogle = handleGoogleLogin;
window.saveUsername = handleSaveUsername;
window.logout = handleLogout;
window.deleteAccount = handleDeleteAccount;

document.addEventListener("DOMContentLoaded", async () => {
  bindButtons();

  if (!window.panategwaAuth) {
    setStatus("Firebase did not load correctly.", "error");
    return;
  }

  await completeRedirectLogin();

  watchAuth((user) => {
    renderUser(user);

    if (user) {
      setStatus(user.emailVerified ? "Signed in and verified." : "Signed in.", "success");
    } else {
      setStatus("Not logged in.", "info");
    }
  });
});