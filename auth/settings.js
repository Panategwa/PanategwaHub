import {
  saveUsername,
  changeEmail,
  changePassword,
  setAvatarPreset,
  AVATAR_PRESET_REQUIREMENTS,
  doesRankMeetRequirement,
  getRankFromXp,
  setAvatarLetter,
  useDefaultProfilePicture,
  resendVerificationEmail,
  deleteAccount,
  watchAuth,
  getProfile,
  logout,
  requestPasswordReset
} from "./auth.js";

const $ = (id) => document.getElementById(id);
const PRESET_IDS = ["1", "2", "3", "4"];

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
  const note = $("settings-provider-note");

  if (usernameInput && document.activeElement !== usernameInput) {
    usernameInput.value = profile?.username || user.displayName || "";
  }

  if (emailInput && document.activeElement !== emailInput) {
    emailInput.value = user.email || "";
  }

  if (letterInput && document.activeElement !== letterInput) {
    letterInput.value = (profile?.username || user.displayName || "P").slice(0, 1).toUpperCase();
  }

  const providerIds = new Set((user.providerData || []).map((provider) => provider.providerId));
  if (note) {
    note.textContent = providerIds.has("password")
      ? "Email and password changes work for email/password accounts."
      : "This account uses Google sign-in, so email/password changes are not available here.";
  }
}

function syncAvatarPresetLocks(profile) {
  const currentRank = getRankFromXp(profile?.xp || 0);

  for (const presetId of PRESET_IDS) {
    const button = $(`avatar-preset-${presetId}-btn`);
    if (!button) continue;

    const requiredRank = AVATAR_PRESET_REQUIREMENTS[presetId] || "Explorer";
    const unlocked = doesRankMeetRequirement(currentRank, requiredRank);
    const note = button.querySelector("[data-avatar-rank-note]");

    button.disabled = !unlocked;
    button.dataset.locked = unlocked ? "false" : "true";
    button.title = unlocked
      ? `Unlocked at ${requiredRank}`
      : `Unlocks at ${requiredRank} rank`;

    if (note) {
      note.textContent = unlocked
        ? `${requiredRank} rank`
        : `Unlocks at ${requiredRank}`;
    }
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
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not save username.", "error");
  }
}

async function applyAvatarPreset(presetId) {
  try {
    await setAvatarPreset(presetId);
    setStatus("Profile picture updated.", "success");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not update profile picture.", "error");
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
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not save letter avatar.", "error");
  }
}

async function applyDefaultAvatar() {
  try {
    await useDefaultProfilePicture();
    setStatus("Default profile picture restored.", "success");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not reset profile picture.", "error");
  }
}

async function applyEmailChange() {
  const nextEmail = String($("change-email-input")?.value || "").trim();
  const currentPassword = String($("change-email-password")?.value || "");

  try {
    await changeEmail(nextEmail, currentPassword);
    setStatus("Email updated. Check the new inbox for verification if needed.", "success");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not change email.", "error");
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
    if ($("current-password")) $("current-password").value = "";
    if ($("new-password")) $("new-password").value = "";
    if ($("confirm-password")) $("confirm-password").value = "";
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not change password.", "error");
  }
}

function bindButtons() {
  $("save-username-btn")?.addEventListener("click", applyUsername);
  $("avatar-preset-1-btn")?.addEventListener("click", () => applyAvatarPreset("1"));
  $("avatar-preset-2-btn")?.addEventListener("click", () => applyAvatarPreset("2"));
  $("avatar-preset-3-btn")?.addEventListener("click", () => applyAvatarPreset("3"));
  $("avatar-preset-4-btn")?.addEventListener("click", () => applyAvatarPreset("4"));
  $("avatar-default-btn")?.addEventListener("click", applyDefaultAvatar);
  $("avatar-letter-btn")?.addEventListener("click", applyAvatarLetter);

  $("change-email-btn")?.addEventListener("click", applyEmailChange);
  $("change-password-btn")?.addEventListener("click", applyPasswordChange);
  $("send-reset-email-btn")?.addEventListener("click", async () => {
    const email = String($("change-email-input")?.value || "").trim();
    if (!email) {
      setStatus("Type an email first.", "error");
      return;
    }

    try {
      await requestPasswordReset(email);
      setStatus("Reset email sent.", "success");
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Could not send reset email.", "error");
    }
  });

  $("resend-verification-btn")?.addEventListener("click", async () => {
    try {
      const sent = await resendVerificationEmail();
      setStatus(sent === false ? "Your email is already verified." : "Verification email sent.", sent === false ? "info" : "success");
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Could not resend verification email.", "error");
    }
  });

  $("logout-btn")?.addEventListener("click", async () => {
    await logout();
    window.location.reload();
  });

  $("delete-account-btn")?.addEventListener("click", async () => {
    const password = String($("delete-password")?.value || "");
    if (!window.confirm("Delete your account permanently?")) return;

    try {
      await deleteAccount(password);
      window.location.reload();
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Could not delete account.", "error");
    }
  });
}

function start() {
  bindButtons();

  watchAuth(async (user, profile) => {
    if (!user) {
      setStatus("Not logged in.", "info");
      return;
    }

    const nextProfile = profile || (await getProfile(user.uid)) || {};
    syncForm(nextProfile, user);
    syncAvatarPresetLocks(nextProfile);
    setStatus("Settings ready.", "info");
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
