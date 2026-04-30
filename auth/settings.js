import {
  saveUsername,
  changeEmail,
  changePassword,
  setAvatarPreset,
  AVATAR_PRESET_IDS,
  getAvatarPickerEntries,
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
const PRESET_IDS = [...AVATAR_PRESET_IDS];
const AVATAR_PICKER_ENTRIES = getAvatarPickerEntries();
const DEFAULT_AVATAR_ENTRY = AVATAR_PICKER_ENTRIES.find((entry) => entry.isDefault) || {
  id: "default",
  name: "Default pfp",
  requirementText: "None",
  previewUrl: "",
  hiddenRequirement: false,
  isDefault: true
};
const AVATAR_ENTRY_MAP = new Map(AVATAR_PICKER_ENTRIES.filter((entry) => !entry.isDefault).map((entry) => [entry.id, entry]));
let currentUser = null;
let currentProfile = null;
const SETTING_STATUS_IDS = ["profile", "avatar", "email", "password", "actions", "danger", "privacy"];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatus(message, kind = "info") {
  const el = $("auth-status");
  if (!el) return;
  el.textContent = message;
  el.dataset.kind = kind;
}

function setScopedStatus(scope, message = "", kind = "info") {
  const el = $(`settings-${scope}-status`);
  if (!el) return;

  el.textContent = String(message || "").trim();
  el.dataset.kind = kind;
  el.classList.toggle("section-hidden", !el.textContent);
}

function clearScopedStatuses() {
  for (const scope of SETTING_STATUS_IDS) {
    setScopedStatus(scope, "");
  }
}

function syncForm(profile, user) {
  const usernameInput = $("profile-username");
  const emailInput = $("change-email-input");
  const note = $("settings-provider-note");
  const showRank = $("privacy-show-rank");
  const showJoined = $("privacy-show-joined");
  const showStreaks = $("privacy-show-streaks");
  const showSiteAge = $("privacy-show-site-age");

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
  if (showSiteAge) showSiteAge.checked = profile?.privacySettings?.showSiteAge !== false;
}

function syncAvatarPresetLocks(profile) {
  const currentAvatarType = String(profile?.avatarType || "default");
  const currentAvatarPreset = String(profile?.avatarPreset || "default");
  const hasKnownPreset = currentAvatarType === "preset" && PRESET_IDS.includes(currentAvatarPreset);

  for (const presetId of PRESET_IDS) {
    const button = $(`avatar-preset-${presetId}-btn`);
    if (!button) continue;

    const entry = AVATAR_ENTRY_MAP.get(presetId);
    const unlocked = isAvatarPresetUnlocked(profile, presetId);
    const note = button.querySelector("[data-avatar-rank-note]");
    const name = button.querySelector("[data-avatar-name]");
    const image = button.querySelector("img");
    const selected = hasKnownPreset && currentAvatarPreset === presetId;

    button.disabled = !unlocked;
    button.dataset.locked = unlocked ? "false" : "true";
    button.classList.toggle("current", selected);
    button.setAttribute("aria-pressed", selected ? "true" : "false");
    button.title = unlocked
      ? `Unlocked: ${getAvatarPresetRequirementText(presetId, true)}`
      : `Locked: ${getAvatarPresetRequirementText(presetId, false)}`;

    if (image) {
      image.src = entry?.previewUrl || "";
      image.alt = `${entry?.name || "Avatar"} avatar preset`;
    }

    if (name) {
      name.textContent = entry?.name || `Preset ${presetId}`;
    }

    if (note) {
      note.textContent = getAvatarPresetRequirementText(presetId, unlocked);
    }

    if (entry?.hiddenRequirement) {
      button.dataset.secretRequirement = "true";
    } else {
      delete button.dataset.secretRequirement;
    }
  }

  const defaultButton = $("avatar-default-btn");
  if (defaultButton) {
    const image = defaultButton.querySelector("img");
    const note = defaultButton.querySelector("[data-avatar-rank-note]");
    const name = defaultButton.querySelector("[data-avatar-name]");
    const selected = !hasKnownPreset;
    if (image) {
      image.src = DEFAULT_AVATAR_ENTRY.previewUrl || "";
      image.alt = DEFAULT_AVATAR_ENTRY.name;
    }
    if (name) {
      name.textContent = DEFAULT_AVATAR_ENTRY.name;
    }
    if (note) {
      note.textContent = DEFAULT_AVATAR_ENTRY.requirementText;
    }
    defaultButton.dataset.selected = selected ? "true" : "false";
    defaultButton.classList.toggle("current", selected);
    defaultButton.setAttribute("aria-pressed", selected ? "true" : "false");
  }
}

function renderAvatarChoices() {
  const grid = document.querySelector(".avatar-grid");
  if (!grid) return;

  grid.innerHTML = `
    <button id="avatar-default-btn" type="button" class="avatar-choice avatar-choice-default">
      <img alt="" src="" />
      <span data-avatar-name>${escapeHtml(DEFAULT_AVATAR_ENTRY.name)}</span>
      <small class="avatar-requirements">
        <span class="avatar-requirements-label">Requirements:</span>
        <span class="avatar-requirements-text" data-avatar-rank-note>${escapeHtml(DEFAULT_AVATAR_ENTRY.requirementText)}</span>
      </small>
    </button>
    ${AVATAR_PICKER_ENTRIES.filter((entry) => !entry.isDefault).map((entry) => `
      <button id="avatar-preset-${escapeHtml(entry.id)}-btn" type="button" class="avatar-choice">
        <img alt="" src="" />
        <span data-avatar-name>${escapeHtml(entry.name)}</span>
        <small class="avatar-requirements">
          <span class="avatar-requirements-label">Requirements:</span>
          <span class="avatar-requirements-text" data-avatar-rank-note>${escapeHtml(entry.requirementText)}</span>
        </small>
      </button>
    `).join("")}
  `;
}

async function refreshSettingsProfileView() {
  if (!currentUser) return;
  currentProfile = (await getProfile(currentUser.uid)) || currentProfile || {};
  syncForm(currentProfile, currentUser);
  syncAvatarPresetLocks(currentProfile);
}

async function applyUsername() {
  const value = String($("profile-username")?.value || "").trim().slice(0, 20);
  if (!value) {
    setScopedStatus("profile", "Type a username first.", "error");
    return;
  }

  try {
    await saveUsername(value);
    await refreshSettingsProfileView();
    setScopedStatus("profile", "Username updated.", "success");
  } catch (error) {
    console.error(error);
    setScopedStatus("profile", error.message || "Could not save username.", "error");
  }
}

async function applyAvatarPreset(presetId) {
  try {
    await setAvatarPreset(presetId);
    await refreshSettingsProfileView();
    setScopedStatus("avatar", "Profile picture updated.", "success");
  } catch (error) {
    console.error(error);
    setScopedStatus("avatar", error.message || "Could not update profile picture.", "error");
  }
}

async function applyDefaultAvatar() {
  try {
    await useDefaultProfilePicture();
    await refreshSettingsProfileView();
    setScopedStatus("avatar", "Default pfp restored.", "success");
  } catch (error) {
    console.error(error);
    setScopedStatus("avatar", error.message || "Could not reset profile picture.", "error");
  }
}

async function applyPrivacySetting(key, value) {
  try {
    await updatePrivacySettings({ [key]: !!value });
    await refreshSettingsProfileView();
    setScopedStatus("privacy", "Privacy settings updated.", "success");
  } catch (error) {
    console.error(error);
    setScopedStatus("privacy", error.message || "Could not update privacy settings.", "error");
  }
}

async function applyEmailChange() {
  const nextEmail = String($("change-email-input")?.value || "").trim();
  const currentPassword = String($("change-email-password")?.value || "");

  try {
    await changeEmail(nextEmail, currentPassword);
    await refreshSettingsProfileView();
    setScopedStatus("email", "Email updated. Check the new inbox for verification if needed.", "success");
  } catch (error) {
    console.error(error);
    setScopedStatus("email", error.message || "Could not change email.", "error");
  }
}

async function applyPasswordChange() {
  const currentPassword = String($("current-password")?.value || "");
  const nextPassword = String($("new-password")?.value || "");
  const confirmPassword = String($("confirm-password")?.value || "");

  if (nextPassword !== confirmPassword) {
    setScopedStatus("password", "New passwords do not match.", "error");
    return;
  }

  try {
    await changePassword(currentPassword, nextPassword);
    setScopedStatus("password", "Password updated.", "success");
    if ($("current-password")) $("current-password").value = "";
    if ($("new-password")) $("new-password").value = "";
    if ($("confirm-password")) $("confirm-password").value = "";
  } catch (error) {
    console.error(error);
    setScopedStatus("password", error.message || "Could not change password.", "error");
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
      setScopedStatus("password", "Type an email first.", "error");
      return;
    }

    try {
      await requestPasswordReset(email);
      setScopedStatus("password", "Reset email sent.", "success");
    } catch (error) {
      console.error(error);
      setScopedStatus("password", error.message || "Could not send reset email.", "error");
    }
  });

  $("resend-verification-btn")?.addEventListener("click", async () => {
    try {
      const sent = await resendVerificationEmail();
      setScopedStatus("actions", sent === false ? "Your email is already verified." : "Verification email sent.", sent === false ? "info" : "success");
    } catch (error) {
      console.error(error);
      setScopedStatus("actions", error.message || "Could not resend verification email.", "error");
    }
  });

  $("logout-btn")?.addEventListener("click", async () => {
    await logout();
    window.location.reload();
  });

  $("reset-data-btn")?.addEventListener("click", async () => {
    const mode = String($("reset-data-select")?.value || "progress");
    const label = mode === "all"
      ? "all social and progress data"
      : mode === "friends"
        ? "your friends list, requests, blocked list, and saved friend history"
        : "your XP, achievements, streak, and progress history";
    if (!window.confirm(`Permanently delete ${label}? There is no going back after this.`)) return;

    try {
      await resetAccountData(mode);
      await refreshSettingsProfileView();
      setScopedStatus("danger", "Selected account data deleted.", "success");
    } catch (error) {
      console.error(error);
      setScopedStatus("danger", error.message || "Could not reset account data.", "error");
    }
  });

  $("delete-account-btn")?.addEventListener("click", async () => {
    const password = String($("delete-password")?.value || "");
    if (!window.confirm("Delete your account permanently? There is no going back after this.")) return;

    try {
      await deleteAccount(password);
      window.location.reload();
    } catch (error) {
      console.error(error);
      setScopedStatus("danger", error.message || "Could not delete account.", "error");
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

  $("privacy-show-site-age")?.addEventListener("change", (event) => {
    applyPrivacySetting("showSiteAge", event.target.checked);
  });
}

function start() {
  renderAvatarChoices();
  bindButtons();
  syncAvatarPresetLocks({});

  watchAuth(async (user, profile) => {
    currentUser = user || null;
    clearScopedStatuses();
    if (!user) {
      currentProfile = null;
      setStatus("Not logged in.", "info");
      return;
    }

    const nextProfile = profile || (await getProfile(user.uid)) || {};
    currentProfile = nextProfile;
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
