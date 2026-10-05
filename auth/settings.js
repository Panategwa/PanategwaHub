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
  requestPasswordReset,
  refreshCurrentUserSession
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
let settingsSyncedUid = "";
let settingsBound = false;
let settingsUnsubs = [];
let settingsWatchUnsub = null;
let emailVerificationReturnReason = (() => {
  try {
    const params = new URL(window.location.href).searchParams;
    if (params.get("emailChangeComplete") === "1") return "email-change";
    if (params.get("emailVerificationComplete") === "1") return "email-verification";
    return "";
  } catch {
    return "";
  }
})();

function clearEmailVerificationReturnMarkers() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("emailChangeComplete") && !url.searchParams.has("emailVerificationComplete")) return;
    url.searchParams.delete("emailChangeComplete");
    url.searchParams.delete("emailVerificationComplete");
    window.history.replaceState({}, "", url.href);
  } catch {}
}
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
  const note = $("settings-provider-note");

  if (usernameInput && document.activeElement !== usernameInput) {
    usernameInput.value = profile?.username || user.displayName || "";
  }

  const privacySelect = $("profile-privacy-preset");
  if (privacySelect && document.activeElement !== privacySelect) {
    const preset = String(profile?.privacySettings?.preset || "private");
    privacySelect.value = ["private", "public", "custom"].includes(preset) ? preset : "private";
  }

  const providerIds = new Set((user.providerData || []).map((provider) => provider.providerId));
  const hasPasswordProvider = providerIds.has("password");
  const hasGoogleProvider = providerIds.has("google.com");
  const emailVerified = user.emailVerified === true;
  const verificationCard = $("settings-email-verification-card");
  const verificationStatus = $("settings-email-verification-status");
  const verificationBadge = $("settings-email-verification-badge");
  const currentEmail = $("settings-email-current");
  const resendButton = $("settings-email-resend-btn");
  const refreshButton = $("settings-email-refresh-btn");
  const changeEmailInput = $("change-email-input");
  const changeEmailPassword = $("change-email-password");
  const changeEmailButton = $("change-email-btn");

  if (verificationCard) verificationCard.dataset.state = emailVerified ? "verified" : "unverified";
  if (verificationStatus) verificationStatus.textContent = emailVerified ? "Email verified" : "Email not verified";
  if (verificationBadge) verificationBadge.textContent = emailVerified ? "Verified" : "Action needed";
  if (currentEmail) currentEmail.textContent = user.email || "No email address is attached to this account.";
  if (resendButton) resendButton.classList.toggle("section-hidden", emailVerified);
  if (refreshButton) refreshButton.classList.toggle("section-hidden", emailVerified);
  if (changeEmailInput) changeEmailInput.disabled = !hasPasswordProvider && !hasGoogleProvider;
  if (changeEmailPassword) changeEmailPassword.disabled = !hasPasswordProvider;
  if (changeEmailPassword?.closest(".input-group")) {
    changeEmailPassword.closest(".input-group").classList.toggle("section-hidden", !hasPasswordProvider);
  }
  if (changeEmailButton) changeEmailButton.disabled = !hasPasswordProvider && !hasGoogleProvider;

  if (note) {
    note.textContent = hasPasswordProvider
      ? "Confirm with your Panategwa password, then follow the verification link sent to your new address."
      : hasGoogleProvider
        ? "You’ll confirm in a Google popup. Choose the Google account linked to this profile, then follow the verification link sent to your new address."
        : "Link an email/password or Google sign-in method before changing this address.";
  }
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

  if (nextEmail && nextEmail.toLowerCase() === String(currentUser?.email || "").toLowerCase()) {
    setScopedStatus("email", "That is already your current email address.", "info");
    return;
  }

  try {
    await changeEmail(nextEmail, currentPassword);
    if ($("change-email-input")) $("change-email-input").value = "";
    if ($("change-email-password")) $("change-email-password").value = "";
    setScopedStatus("email", `A verification link was sent to ${nextEmail}. Open it to confirm the new address; your account email changes only after confirmation.`, "success");
  } catch (error) {
    console.error(error);
    setScopedStatus("email", error.message || "Could not change email.", "error");
  }
}

async function refreshEmailVerificationStatus() {
  try {
    setScopedStatus("email", "Checking your email verification…", "info");
    const refreshed = await refreshCurrentUserSession();
    currentUser = refreshed.user;
    currentProfile = refreshed.profile || currentProfile;
    syncForm(currentProfile, currentUser);
    syncAvatarPresetLocks(currentProfile);
    setScopedStatus("email", currentUser.emailVerified === true
      ? "Your email is verified. Friends, messages, and player profiles are now available."
      : "We haven’t received confirmation yet. Open the verification link in your email, then check again.", currentUser.emailVerified === true ? "success" : "info");
  } catch (error) {
    console.error(error);
    setScopedStatus("email", error.message || "Could not refresh email verification status.", "error");
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
  $("profile-privacy-preset")?.addEventListener("change", async (event) => {
    const preset = String(event.target.value || "private");
    if (!["private", "public", "custom"].includes(preset)) return;
    try {
      await updatePrivacySettings({ preset });
      await refreshSettingsProfileView();
      setScopedStatus("privacy", `Your profile is now set to ${preset}.`, "success");
    } catch (error) {
      console.error(error);
      await refreshSettingsProfileView();
      setScopedStatus("privacy", error.message || "Could not change your privacy preset.", "error");
    }
  });
  $("save-username-btn")?.addEventListener("click", applyUsername);
  for (const presetId of PRESET_IDS) {
    $(`avatar-preset-${presetId}-btn`)?.addEventListener("click", () => applyAvatarPreset(presetId));
  }
  $("avatar-default-btn")?.addEventListener("click", applyDefaultAvatar);

  $("change-email-btn")?.addEventListener("click", applyEmailChange);
  $("settings-email-refresh-btn")?.addEventListener("click", refreshEmailVerificationStatus);
  $("settings-email-resend-btn")?.addEventListener("click", async () => {
    try {
      const sent = await resendVerificationEmail();
      setScopedStatus("email", sent === false
        ? "Your current email is already verified."
        : `A verification link was sent to ${currentUser?.email || "your email address"}.`, sent === false ? "info" : "success");
    } catch (error) {
      console.error(error);
      setScopedStatus("email", error.message || "Could not send a verification email.", "error");
    }
  });
  $("change-password-btn")?.addEventListener("click", applyPasswordChange);
  $("send-reset-email-btn")?.addEventListener("click", async () => {
    const email = String(currentUser?.email || "").trim();
    if (!email) {
      setScopedStatus("password", "There is no email address attached to this account.", "error");
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

  // Named and registered for removal. This one is delegated to document.body
  // rather than to an element inside the page, so removing the content on
  // navigation does not take it with it -- without the unsub below it would
  // still be attached on the next visit to the account page, and the next.
  const onPrivacyToggleClick = (event) => {
    const button = event.target.closest("[data-privacy-toggle-key]");
    if (!button) return;

    const key = String(button.dataset.privacyToggleKey || "").trim();
    const nextValue = String(button.dataset.privacyToggleValue || "").trim().toLowerCase() === "true";
    if (!key) return;

    applyPrivacySetting(key, nextValue);
  };

  document.body.addEventListener("click", onPrivacyToggleClick);
  settingsUnsubs.push(() => document.body.removeEventListener("click", onPrivacyToggleClick));
}

function disposeSettingsModule() {
  for (let i = 0; i < settingsUnsubs.length; i++) {
    try { settingsUnsubs[i](); } catch (e) { console.error("Settings disposal error:", e); }
  }
  settingsUnsubs = [];
  settingsBound = false;
}

// The client-side router navigates without a document load, so nothing else
// would ever call the dispose above. This module also binds a delegated click
// listener to document.body, which would otherwise survive every navigation
// and fire once per visit.
window.PanategwaRouteDispose = window.PanategwaRouteDispose || {};
window.PanategwaRouteDispose.accountSettings = disposeSettingsModule;

function start() {
  if (settingsBound) disposeSettingsModule();
  settingsBound = true;
  settingsUnsubs = [];

  renderAvatarChoices();
  bindButtons();
  syncAvatarPresetLocks({});

  settingsWatchUnsub = watchAuth(async (user, profile) => {
    if (settingsSyncedUid && settingsSyncedUid !== user?.uid) {
      ["change-email-input", "change-email-password", "current-password", "new-password", "confirm-password", "delete-password"].forEach((id) => {
        const input = $(id);
        if (input) input.value = "";
      });
    }
    settingsSyncedUid = user?.uid || "";
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
    setStatus(user.emailVerified === true
      ? "Settings ready. Your email is verified."
      : "Settings ready. Verify your email to unlock friends, messages, and player profiles.", "info");

    if (emailVerificationReturnReason) {
      const returnReason = emailVerificationReturnReason;
      emailVerificationReturnReason = "";
      try {
        const refreshed = await refreshCurrentUserSession();
        currentUser = refreshed.user;
        currentProfile = refreshed.profile;
        syncForm(refreshed.profile, refreshed.user);
        clearEmailVerificationReturnMarkers();
        if (refreshed.user.emailVerified === true) {
          setScopedStatus("email", returnReason === "email-change"
            ? "Your new email address is verified and active."
            : "Your email is verified. Friends, messages, and player profiles are now available.", "success");
        } else {
          setScopedStatus("email", "The site reopened from the email link, but verification is not active yet. Try the link again or check your email status.", "info");
        }
      } catch (error) {
        console.error("Could not refresh the account after email verification:", error);
        emailVerificationReturnReason = returnReason;
        setScopedStatus("email", "The email link opened. Sign in to refresh your email status here.", "info");
      }
    }
  });
  if (typeof settingsWatchUnsub === "function") settingsUnsubs.push(settingsWatchUnsub);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function () {
    start();
  });
} else {
  start();
}
