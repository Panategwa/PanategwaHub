/* global firebase */
(function () {
  const auth = window.panategwaAuth;

  function ensureAuth() {
    if (!auth || !window.panategwaFirebase) {
      throw new Error("Firebase Auth is not initialized.");
    }
  }

  function getCurrentUser() {
    ensureAuth();
    return auth.currentUser;
  }

  async function loginWithGoogle() {
    ensureAuth();

    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    const result = await auth.signInWithPopup(provider);
    return result.user;
  }

  async function createEmailAccount(email, password, username) {
    ensureAuth();

    const cleanEmail = String(email || "").trim();
    const cleanPassword = String(password || "");
    const cleanUsername = String(username || "").trim();

    if (!cleanEmail || !cleanPassword) {
      throw new Error("Email and password are required.");
    }

    const cred = await auth.createUserWithEmailAndPassword(cleanEmail, cleanPassword);

    if (cleanUsername) {
      await cred.user.updateProfile({ displayName: cleanUsername });
    }

    await cred.user.sendEmailVerification();
    await cred.user.reload();

    return cred.user;
  }

  async function loginWithEmail(email, password) {
    ensureAuth();

    const cleanEmail = String(email || "").trim();
    const cleanPassword = String(password || "");

    if (!cleanEmail || !cleanPassword) {
      throw new Error("Email and password are required.");
    }

    const cred = await auth.signInWithEmailAndPassword(cleanEmail, cleanPassword);
    return cred.user;
  }

  async function resendVerificationEmail() {
    ensureAuth();

    const user = getCurrentUser();
    if (!user) {
      throw new Error("No user is signed in.");
    }

    if (user.emailVerified) {
      return false;
    }

    await user.sendEmailVerification();
    return true;
  }

  async function saveUsername(username) {
    ensureAuth();

    const user = getCurrentUser();
    if (!user) {
      throw new Error("No user is signed in.");
    }

    const cleanUsername = String(username || "").trim();
    if (!cleanUsername) {
      throw new Error("Username cannot be empty.");
    }

    await user.updateProfile({ displayName: cleanUsername });
    await user.reload();

    return user;
  }

  async function logout() {
    ensureAuth();
    await auth.signOut();
  }

  async function deleteAccount() {
    ensureAuth();

    const user = getCurrentUser();
    if (!user) {
      throw new Error("No user is signed in.");
    }

    try {
      await user.delete();
      return true;
    } catch (err) {
      if (err && err.code === "auth/requires-recent-login") {
        const wrapped = new Error("reauth-required");
        wrapped.code = "reauth-required";
        throw wrapped;
      }
      throw err;
    }
  }

  async function reauthWithGoogle() {
    ensureAuth();

    const user = getCurrentUser();
    if (!user) {
      throw new Error("No user is signed in.");
    }

    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    await user.reauthenticateWithPopup(provider);
    return true;
  }

  async function reauthWithEmail(email, password) {
    ensureAuth();

    const user = getCurrentUser();
    if (!user) {
      throw new Error("No user is signed in.");
    }

    const cleanEmail = String(email || "").trim();
    const cleanPassword = String(password || "");

    if (!cleanEmail || !cleanPassword) {
      throw new Error("Email and password are required for reauthentication.");
    }

    const credential = firebase.auth.EmailAuthProvider.credential(cleanEmail, cleanPassword);
    await user.reauthenticateWithCredential(credential);
    return true;
  }

  function onAuthStateChanged(callback) {
    ensureAuth();
    return auth.onAuthStateChanged(callback);
  }

  window.panategwaAuthActions = {
    loginWithGoogle,
    createEmailAccount,
    loginWithEmail,
    resendVerificationEmail,
    saveUsername,
    logout,
    deleteAccount,
    reauthWithGoogle,
    reauthWithEmail,
    onAuthStateChanged
  };
})();