(function () {
  const $ = (id) => document.getElementById(id);

  function setStatus(msg) {
    const el = $("auth-status");
    if (el) el.textContent = msg;
  }

  function renderUser(user) {
    const box = $("user-info");
    if (!box) return;

    if (!user) {
      box.innerHTML = `<p>Status: Not logged in</p>`;
      return;
    }

    box.innerHTML = `
      <p>Status: Logged in</p>
      <p>Username: ${user.displayName || "Not set"}</p>
      <p>Email: ${user.email}</p>
      <p>Verified: ${user.emailVerified}</p>
      <p>ID: ${user.uid}</p>
      <p>Achievements: Coming soon</p>
    `;

    if ($("username")) {
      $("username").value = user.displayName || "";
    }
  }

  async function loginWithGoogle() {
    try {
      setStatus("Logging in...");
      await window.panategwaAuthActions.loginWithGoogle();
      setStatus("Logged in!");
    } catch (e) {
      console.error(e);
      setStatus("Login failed: " + e.message);
    }
  }

  async function logout() {
    await window.panategwaAuthActions.logout();
  }

  async function saveUsername() {
    const name = $("username")?.value;
    await window.panategwaAuthActions.saveUsername(name);
  }

  async function deleteAccount() {
    if (!confirm("Delete account?")) return;
    await window.panategwaAuthActions.deleteAccount();
    location.reload();
  }

  function bind() {
    $("google-login-btn")?.addEventListener("click", loginWithGoogle);
    $("logout-btn")?.addEventListener("click", logout);
    $("save-username-btn")?.addEventListener("click", saveUsername);
    $("delete-account-btn")?.addEventListener("click", deleteAccount);
  }

  document.addEventListener("DOMContentLoaded", () => {
    bind();

    if (!window.panategwaAuthActions) {
      setStatus("Firebase not loaded");
      return;
    }

    window.panategwaAuthActions.onAuthStateChanged(renderUser);
  });
})();