(function () {
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
    if (provider === "password") return "Email / Password";
    return provider;
  }

  function renderUser(user) {
    const info = $("user-info");
    const usernameInput = $("username");
    const emailInput = $("account-email");

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
      return;
    }

    const displayName = user.displayName || "";
    const email = user.email || "—";
    const verified = user.emailVerified ? "Yes" : "No";
    const provider = providerLabel(user);

    info.innerHTML = `
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
    if (emailInput && !emailInput.value) emailInput.value = user.email || "";
  }

  async function handleGoogleLogin() {
    try {
      setStatus("Opening Google sign-in...", "info");
      await window.panategwaAuthActions.loginWithGoogle();
      setStatus("Logged in with Google.", "success");
    } catch (err) {
      console.error(err);
      setStatus(err.message || "Google sign-in failed.", "error");
      alert(err.message || "Google sign-in failed.");
    }
  }

  async function handleCreateAccount() {
    const email = $("account-email")?.value || "";
    const password = $("account-password")?.value || "";
    const username = $("username")?.value || "";

    try {
      setStatus("Creating account...", "info");
      await window.panategwaAuthActions.createEmailAccount(email, password, username);
      setStatus("Account created. Check your email and tap the verification link.", "success");
      alert("Account created. Check your email for the verification link.");
    } catch (err) {
      console.error(err);
      setStatus(err.message || "Account creation failed.", "error");
      alert(err.message || "Account creation failed.");
    }
  }

  async function handleEmailLogin() {
    const email = $("account-email")?.value || "";
    const password = $("account-password")?.value || "";

    try {
      setStatus("Signing in...", "info");
      await window.panategwaAuthActions.loginWithEmail(email, password);
      setStatus("Signed in.", "success");
    } catch (err) {
      console.error(err);
      setStatus(err.message || "Email sign-in failed.", "error");
      alert(err.message || "Email sign-in failed.");
    }
  }

  async function handleSaveUsername() {
    const username = $("username")?.value || "";

    try {
      setStatus("Saving username...", "info");
      await window.panategwaAuthActions.saveUsername(username);
      setStatus("Username saved.", "success");
      alert("Username saved.");
    } catch (err) {
      console.error(err);
      setStatus(err.message || "Could not save username.", "error");
      alert(err.message || "Could not save username.");
    }
  }

  async function handleResendVerification() {
    try {
      const result = await window.panategwaAuthActions.resendVerificationEmail();
      if (result === false) {
        setStatus("Your email is already verified.", "info");
        alert("Your email is already verified.");
        return;
      }
      setStatus("Verification email sent.", "success");
      alert("Verification email sent.");
    } catch (err) {
      console.error(err);
      setStatus(err.message || "Could not resend verification email.", "error");
      alert(err.message || "Could not resend verification email.");
    }
  }

  async function handleLogout() {
    try {
      await window.panategwaAuthActions.logout();
      setStatus("Logged out.", "info");
      alert("Logged out.");
    } catch (err) {
      console.error(err);
      setStatus(err.message || "Logout failed.", "error");
      alert(err.message || "Logout failed.");
    }
  }

  async function tryReauthThenDelete(user) {
    const provider = user?.providerData?.[0]?.providerId || "unknown";

    if (provider === "google.com") {
      await window.panategwaAuthActions.reauthWithGoogle();
      await window.panategwaAuthActions.deleteAccount();
      return;
    }

    const email = $("account-email")?.value || user.email || "";
    const password = $("account-password")?.value || "";

    if (!email || !password) {
      throw new Error("reauth-needed");
    }

    await window.panategwaAuthActions.reauthWithEmail(email, password);
    await window.panategwaAuthActions.deleteAccount();
  }

  async function handleDeleteAccount() {
    const user = window.panategwaAuth?.currentUser;

    if (!user) {
      setStatus("Sign in first.", "error");
      alert("Sign in first.");
      return;
    }

    if (!confirm("Delete your account permanently?")) return;

    try {
      setStatus("Deleting account...", "info");
      await window.panategwaAuthActions.deleteAccount();
      setStatus("Account deleted.", "success");
      alert("Account deleted.");
      window.location.href = "index.html";
    } catch (err) {
      if (err && err.code === "reauth-required") {
        try {
          setStatus("Firebase wants you to sign in again. Reauthenticating...", "info");
          await tryReauthThenDelete(user);
          setStatus("Account deleted.", "success");
          alert("Account deleted.");
          window.location.href = "index.html";
          return;
        } catch (reauthErr) {
          console.error(reauthErr);
          setStatus("Reauthentication failed. Sign in again and try deleting once more.", "error");
          alert("Reauthentication failed. Sign in again and try deleting once more.");
          return;
        }
      }

      console.error(err);
      setStatus(err.message || "Delete failed.", "error");
      alert(err.message || "Delete failed.");
    }
  }

  async function handleAuthState(user) {
    renderUser(user);

    const emailInput = $("account-email");
    const verifyBtn = $("resend-verification-btn");

    if (user) {
      if (emailInput && !emailInput.value) emailInput.value = user.email || "";
      if (verifyBtn) verifyBtn.disabled = !!user.emailVerified;
      setStatus(user.emailVerified ? "Signed in and verified." : "Signed in, but email is not verified yet.", "info");
    } else {
      if (verifyBtn) verifyBtn.disabled = true;
      setStatus("Not logged in.", "info");
    }
  }

  function bindButtons() {
    $("google-login-btn")?.addEventListener("click", handleGoogleLogin);
    $("create-account-btn")?.addEventListener("click", handleCreateAccount);
    $("email-login-btn")?.addEventListener("click", handleEmailLogin);
    $("save-username-btn")?.addEventListener("click", handleSaveUsername);
    $("resend-verification-btn")?.addEventListener("click", handleResendVerification);
    $("logout-btn")?.addEventListener("click", handleLogout);
    $("delete-account-btn")?.addEventListener("click", handleDeleteAccount);
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindButtons();

    if (!window.panategwaAuthActions || !window.panategwaAuth) {
      setStatus("Firebase did not load correctly.", "error");
      return;
    }

    window.panategwaAuthActions.onAuthStateChanged(handleAuthState);
  });
})();