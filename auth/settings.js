import {
  saveUsername,
  changeEmail,
  changePassword,
  setAvatarPreset,
  setAvatarLetter,
  useDefaultProfilePicture,
  resendVerificationEmail,
  deleteAccount,
  watchAuth,
  getProfile,
  logout
} from "./auth.js";

const $ = (id) => document.getElementById(id);

let activeUid = null;

function setStatus(message, kind = "info") {
  const el = $("auth-status");
  if (!el) return;
  el.textContent = message;
  el.dataset.kind = kind;
}

function syncForm(profile, user) {
  const usernameInput = $("profile-username");
  const emailInput = $("change-email-input");
  const letterInput = $("avatar-letter-input");
  const avatarNote = $("security-note");

  if (usernameInput && document.activeElement !== usernameInput) {
    usernameInput.value = profile?.username || user.displayName || "";
  }

  if (emailInput && document.activeElement !== emailInput) {
    emailInput.value = user.email || "";
  }

  if (letterInput && document.activeElement !== letterInput) {
    letterInput.value = (profile?.username || user.displayName || "P").slice(0, 1).toUpperCase();
  }

  const providerIds = new Set((user.providerData || []).map(p => p.providerId));
  if (avatarNote) {
    avatarNote.textContent = providerIds.has("password")
      ? "Email and password changes work for email/password accounts."
      : "This account uses Google sign-in, so email/password changes are not available here.";
  }
}

async function applyUsername() {
  const value = String($("profile-username")?.value || "").trim().slice(0, 20);
  if (!value) {
    setStatus("Type a username first.", "error");
    return;
  }

  try {
    await saveUsername(value);
    setStatus("Username updated.", "success");
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Could not save username.", "error");
  }
}

async function applyAvatarPreset(presetId) {
  try {
    await setAvatarPreset(presetId);
    setStatus("Profile picture updated.", "success");
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Could not update profile picture.", "error");
  }
}

async function applyAvatarLetter() {
  const letter = String($("avatar-letter-input")?.value || "").trim().slice(0, 1);
  if (!letter) {
    setStatus("Type a letter first.", "error");
    return;
  }

  try {
    await setAvatarLetter(letter);
    setStatus("Letter avatar saved.", "success");
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Could not save letter avatar.", "error");
  }
}

async function applyDefaultAvatar() {
  try {
    await useDefaultProfilePicture();
    setStatus("Default profile picture restored.", "success");
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Could not reset profile picture.", "error");
  }
}

async function applyEmailChange() {
  const nextEmail = String($("change-email-input")?.value || "").trim();
  const currentPassword = String($("change-email-password")?.value || "");

  try {
    await changeEmail(nextEmail, currentPassword);
    setStatus("Email updated. Check the new inbox for verification if needed.", "success");
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Could not change email.", "error");
  }
}

async function applyPasswordChange() {
  const currentPassword = String($("current-password")?.value || "");
  const nextPassword = String($("new-password")?.value || "");
  const confirmPassword = String($("confirm-password")?.value || "");

  if (nextPassword !== confirmPassword) {
    setStatus("New passwords do not match.", "error");
    return;
  }

  try {
    await changePassword(currentPassword, nextPassword);
    setStatus("Password updated.", "success");
    $("current-password").value = "";
    $("new-password").value = "";
    $("confirm-password").value = "";
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Could not change password.", "error");
  }
}

function bindButtons() {
  $("save-username-btn")?.addEventListener("click", applyUsername);
  $("avatar-preset-1-btn")?.addEventListener("click", () => applyAvatarPreset("1"));
  $("avatar-preset-2-btn")?.addEventListener("click", () => applyAvatarPreset("2"));
  $("avatar-preset-3-btn")?.addEventListener("click", () => applyAvatarPreset("3"));
  $("avatar-letter-btn")?.addEventListener("click", applyAvatarLetter);
  $("avatar-default-btn")?.addEventListener("click", applyDefaultAvatar);

  $("change-email-btn")?.addEventListener("click", applyEmailChange);
  $("change-password-btn")?.addEventListener("click", applyPasswordChange);

  $("resend-verification-btn")?.addEventListener("click", async () => {
    try {
      const sent = await resendVerificationEmail();
      if (sent === false) {
        setStatus("Your email is already verified.", "info");
      } else {
        setStatus("Verification email sent.", "success");
      }
    } catch (err) {
      console.error(err);
      setStatus(err.message || "Could not resend verification email.", "error");
    }
  });

  $("logout-btn")?.addEventListener("click", async () => {
    await logout();
    window.location.reload();
  });

  $("delete-account-btn")?.addEventListener("click", async () => {
    const password = String($("delete-password")?.value || "");
    if (!confirm("Delete your account permanently?")) return;

    try {
      await deleteAccount(password);
      window.location.reload();
    } catch (err) {
      console.error(err);
      setStatus(err.message || "Could not delete account.", "error");
    }
  });

  $("profile-username")?.addEventListener("input", () => {
    const el = $("profile-username");
    if (el && el.value.length > 20) el.value = el.value.slice(0, 20);
  });
}

function start() {
  bindButtons();

  watchAuth(async (user, profile) => {
    activeUid = user?.uid || null;
    if (!user) {
      setStatus("Not logged in.", "info");
      return;
    }

    syncForm(profile || (await getProfile(user.uid)) || {}, user);
    setStatus("Settings ready.", "info");
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}