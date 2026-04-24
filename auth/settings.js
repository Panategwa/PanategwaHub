import {
  saveUsername,
  changeEmail,
  changePassword,
  setAvatarPreset,
  AVATAR_PRESET_REQUIREMENTS,
  getAvatarPresetRequirementText,
  isAvatarPresetUnlocked,
  useDefaultProfilePicture,
  updatePrivacySettings,
  resendVerificationEmail,
  resetAccountData,
  deleteAccount,
  watchAuth,
  getProfile,
  logout,
  requestPasswordReset
} from "./auth.js";

const $ = (id) => document.getElementById(id);
const PRESET_IDS = ["1", "2", "3", "4", "5", "6", "7", "8"];

function setStatus(message, kind = "info") {
  const el = $("auth-status");
  if (!el) return;
  el.textContent = message;
  el.dataset.kind = kind;
}

function syncForm(profile, user) {
  const usernameInput = $("profile-username");
  const emailInput = $("change-email-input");
  const note = $("settings-provider-note");
  const showRank = $("privacy-show-rank");
  const showJoined = $("privacy-show-joined");
  const showStreaks = $("privacy-show-streaks");

  if (usernameInput && document.activeElement !== usernameInput) {
    usernameInput.value = profile?.username || user.displayName || "";
  }

  if (emailInput && document.activeElement !== emailInput) {
    emailInput.value = user.email || "";
  }

  const providerIds = new Set((user.providerData || []).map((provider) => provider.providerId));
  if (note) {
    note.textContent = providerIds.has("password")
      ? "Email and password changes work for email/password accounts."
      : "This account uses Google sign-in, so email/password changes are not available here.";
  }

  if (showRank) showRank.checked = profile?.privacySettings?.showRank !== false;
  if (showJoined) showJoined.checked = profile?.privacySettings?.showJoined !== false;
  if (showStreaks) showStreaks.checked = profile?.privacySettings?.showStreaks !== false;
}

function syncAvatarPresetLocks(profile) {
  for (const presetId of PRESET_IDS) {
    const button = $(`avatar-preset-${presetId}-btn`);
    if (!button) continue;

    const requirement = AVATAR_PRESET_REQUIREMENTS[presetId] || AVATAR_PRESET_REQUIREMENTS["1"];
    const unlocked = isAvatarPresetUnlocked(profile, presetId);
    const note = button.querySelector("[data-avatar-rank-note]");

    button.disabled = !unlocked;
    button.dataset.locked = unlocked ? "false" : "true";
    button.title = unlocked
      ? `Unlocked: ${getAvatarPresetRequirementText(presetId, true)}`
      : `Locked: ${getAvatarPresetRequirementText(presetId, false)}`;

    if (note) {
      note.textContent = getAvatarPresetRequirementText(presetId, unlocked);
    }

    if (requirement.hiddenAchievement) {
      button.dataset.secretRequirement = "true";
    } else {
      delete button.dataset.secretRequirement;
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

async function applyDefaultAvatar() {
  try {
    await useDefaultProfilePicture();
    setStatus("Default pfp restored.", "success");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not reset profile picture.", "error");
  }
}

async function applyPrivacySetting(key, value) {
  try {
    await updatePrivacySettings({ [key]: !!value });
    setStatus("Privacy settings updated.", "success");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not update privacy settings.", "error");
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
  for (const presetId of PRESET_IDS) {
    $(`avatar-preset-${presetId}-btn`)?.addEventListener("click", () => applyAvatarPreset(presetId));
  }
  $("avatar-default-btn")?.addEventListener("click", applyDefaultAvatar);

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

  $("reset-data-btn")?.addEventListener("click", async () => {
    const mode = String($("reset-data-select")?.value || "progress");
    const label = mode === "all" ? "all social and progress data" : mode;
    if (!window.confirm(`Delete ${label} from this account?`)) return;

    try {
      await resetAccountData(mode);
      setStatus("Selected account data deleted.", "success");
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Could not reset account data.", "error");
    }
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

  $("privacy-show-rank")?.addEventListener("change", (event) => {
    applyPrivacySetting("showRank", event.target.checked);
  });

  $("privacy-show-joined")?.addEventListener("change", (event) => {
    applyPrivacySetting("showJoined", event.target.checked);
  });

  $("privacy-show-streaks")?.addEventListener("change", (event) => {
    applyPrivacySetting("showStreaks", event.target.checked);
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
    setStatus(user.emailVerified ? "Settings ready." : "Verify your email to unlock settings.", "info");
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
