import {
  createAccount,
  login,
  loginWithGoogle,
  requestPasswordReset,
  resendVerificationEmail,
  refreshCurrentUserSession,
  normalizePrivacySettings,
  isOnlineAccountVerified
} from "./auth.js";
import { bindPhoneSignInPanel } from "./phone-auth.js";

const byId = (id) => document.getElementById(id);

function setAuthStatus(message, kind = "info") {
  const status = byId("auth-status");
  if (!status) return;
  status.textContent = message;
  status.dataset.kind = kind;
}

function selectedPrivacySettings() {
  const preset = document.querySelector('input[name="signup-privacy-preset"]:checked')?.value;
  if (!preset) return null;

  const custom = {};
  for (const key of ["showAvatar", "showVerified", "showRank", "showJoined", "showStreaks", "showSiteAge"]) {
    custom[key] = byId(`signup-${key}`)?.checked === true;
  }
  return normalizePrivacySettings({ preset, ...custom });
}

function setAuthMode(mode = "login") {
  const next = mode === "signup" ? "signup" : "login";
  const loginActive = next === "login";
  document.body.dataset.authMode = next;

  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.authMode === next);
    button.setAttribute("aria-pressed", String(button.dataset.authMode === next));
  });
  document.querySelectorAll("[data-auth-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.authPanel === next);
    panel.hidden = panel.dataset.authPanel !== next;
  });

  const heading = byId("auth-mode-heading");
  const copy = byId("auth-mode-copy");
  const switchCopy = byId("auth-switch-copy");
  const switchButton = byId("auth-switch-btn");
  if (heading) heading.textContent = loginActive ? "Welcome back" : "Create your account";
  if (copy) copy.textContent = loginActive
    ? "Sign in to continue exploring Panategwa."
    : "Choose how your profile appears, then join the Panategwa community.";
  if (switchCopy) switchCopy.textContent = loginActive ? "New to Panategwa Hub?" : "Already have an account?";
  if (switchButton) switchButton.textContent = loginActive ? "Create account" : "Log in";
}

export function initializeLoginUI() {
  const removers = [];
  const bind = (element, eventName, handler) => {
    if (!element) return;
    element.addEventListener(eventName, handler);
    removers.push(() => element.removeEventListener(eventName, handler));
  };
  const setMode = (mode) => setAuthMode(mode);
  const toggleMode = () => setMode(document.body.dataset.authMode === "signup" ? "login" : "signup");

  window.PanategwaSetAuthMode = setMode;
  window.PanategwaToggleAuthMode = toggleMode;
  setMode(document.body.dataset.authMode || "login");

  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    bind(button, "click", () => setMode(button.dataset.authMode));
  });
  bind(byId("auth-switch-btn"), "click", toggleMode);

  const syncCustomPrivacy = () => {
    const isCustom = document.querySelector('input[name="signup-privacy-preset"]:checked')?.value === "custom";
    const panel = byId("signup-custom-privacy");
    if (panel) panel.hidden = !isCustom;
    document.querySelectorAll("[data-privacy-preset-card]").forEach((card) => {
      const selected = card.dataset.privacyPresetCard === document.querySelector('input[name="signup-privacy-preset"]:checked')?.value;
      card.classList.toggle("selected", selected);
    });
  };
  document.querySelectorAll('input[name="signup-privacy-preset"]').forEach((input) => bind(input, "change", syncCustomPrivacy));
  document.querySelectorAll("[data-privacy-preset-card]").forEach((card) => bind(card, "click", syncCustomPrivacy));
  syncCustomPrivacy();

  bind(byId("login-form"), "submit", async (event) => {
    event.preventDefault();
    const button = byId("login-btn");
    if (button) button.disabled = true;
    try {
      setAuthStatus("Signing you in…", "info");
      await login(byId("login-email")?.value || "", byId("login-password")?.value || "");
      setAuthStatus("Signed in. Loading your account…", "success");
    } catch (error) {
      setAuthStatus(error?.message || "We couldn't sign you in. Check your details and try again.", "error");
    } finally {
      if (button) button.disabled = false;
    }
  });

  bind(byId("signup-form"), "submit", async (event) => {
    event.preventDefault();
    const button = byId("signup-btn");
    const privacy = selectedPrivacySettings();
    const password = byId("signup-password")?.value || "";
    const confirmation = byId("signup-password-confirm")?.value || "";
    if (!privacy) {
      setAuthStatus("Choose a privacy preset before creating your account.", "error");
      byId("signup-privacy-choices")?.focus();
      return;
    }
    if (password !== confirmation) {
      setAuthStatus("Those passwords don't match yet.", "error");
      byId("signup-password-confirm")?.focus();
      return;
    }

    if (button) button.disabled = true;
    try {
      setAuthStatus("Creating your account…", "info");
      await createAccount(
        byId("signup-email")?.value || "",
        password,
        byId("signup-username")?.value || "",
        privacy
      );
      setAuthStatus("Account created. Check your inbox to verify your email.", "success");
      setMode("login");
      if (byId("login-email")) byId("login-email").value = byId("signup-email")?.value || "";
      if (byId("login-password")) byId("login-password").value = "";
      byId("signup-form")?.reset();
      syncCustomPrivacy();
    } catch (error) {
      setAuthStatus(error?.message || "We couldn't create your account. Please try again.", "error");
    } finally {
      if (button) button.disabled = false;
    }
  });

  bind(byId("google-btn"), "click", async () => {
    const privacy = selectedPrivacySettings();
    const isSignup = document.body.dataset.authMode === "signup";
    if (isSignup && !privacy) {
      setAuthStatus("Choose a privacy preset before continuing with Google.", "error");
      return;
    }
    const button = byId("google-btn");
    if (button) button.disabled = true;
    try {
      setAuthStatus("Connecting to Google…", "info");
      const result = await loginWithGoogle(isSignup ? privacy : null);
      if (result?.needsPrivacySelection) {
        setAuthStatus("Your new Google profile starts private. Choose what to share in account settings.", "info");
        window.openAccountArea?.("settings", "privacy");
      } else {
        setAuthStatus("Signed in with Google.", "success");
      }
    } catch (error) {
      setAuthStatus(error?.message || "Google sign-in couldn't be completed.", "error");
    } finally {
      if (button) button.disabled = false;
    }
  });

  bind(byId("reset-password-btn"), "click", async () => {
    const email = byId("login-email")?.value || byId("signup-email")?.value || "";
    if (!email.trim()) {
      setAuthStatus("Enter your email address first, and we'll send you a reset link.", "error");
      byId("login-email")?.focus();
      return;
    }
    try {
      setAuthStatus("Sending your password reset link…", "info");
      await requestPasswordReset(email);
      setAuthStatus("If that email has a Panategwa password, a reset link is on its way. Google passwords are managed by Google.", "success");
    } catch (error) {
      setAuthStatus(error?.message || "We couldn't send a reset link.", "error");
    }
  });

  const verifyButtons = ["settings-locked-refresh-btn", "friends-locked-refresh-btn", "messages-locked-refresh-btn"];
  for (const id of verifyButtons) {
    bind(byId(id), "click", async () => {
      try {
        setAuthStatus("Checking your verification…", "info");
        const result = await refreshCurrentUserSession();
        const verified = isOnlineAccountVerified(result.user);
        setAuthStatus(verified
          ? (result.user?.emailVerified ? "Email verified. Friends, messages, and player profiles are available." : "Your phone is verified. Friends, messages, and player profiles are available.")
          : "We haven't seen verification yet. Check your inbox or link a phone number, then try again.", verified ? "success" : "info");
      } catch (error) {
        setAuthStatus(error?.message || "We couldn't refresh your account.", "error");
      }
    });
  }
  for (const id of ["settings-locked-resend-btn", "friends-locked-resend-btn", "messages-locked-resend-btn"]) {
    bind(byId(id), "click", async () => {
      try {
        const sent = await resendVerificationEmail();
        setAuthStatus(sent ? "Verification email sent." : "Your email is already verified.", sent ? "success" : "info");
      } catch (error) {
        setAuthStatus(error?.message || "We couldn't send a verification email.", "error");
      }
    });
  }

  removers.push(bindPhoneSignInPanel({
    phoneInputId: "phone-signin-number",
    codeInputId: "phone-signin-code",
    codeGroupId: "phone-signin-code-group",
    sendButtonId: "phone-signin-send",
    confirmButtonId: "phone-signin-confirm",
    recaptchaContainerId: "phone-signin-recaptcha",
    consentCheckboxId: "phone-signin-consent",
    statusId: "phone-signin-status",
    onSuccess: () => setAuthStatus("Signed in with your verified phone number.", "success")
  }));

  return () => {
    removers.forEach((remove) => remove());
    if (window.PanategwaSetAuthMode === setMode) delete window.PanategwaSetAuthMode;
    if (window.PanategwaToggleAuthMode === toggleMode) delete window.PanategwaToggleAuthMode;
  };
}
