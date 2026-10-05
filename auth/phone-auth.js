import { auth, authReady } from "./firebase-config.js";
import {
  beginPhoneNumberLink,
  completePhoneNumberLink,
  completePhoneSignIn
} from "./auth.js";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

function cleanPhoneNumber(value) {
  const phone = String(value || "").trim().replace(/[\s().-]/g, "");
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
    throw new Error("Enter a phone number in international format, including its +country code.");
  }
  return phone;
}

export function bindPhoneSignInPanel(options = {}) {
  return bindPhonePanel({ ...options, mode: "sign-in" });
}

export function bindPhoneLinkPanel(options = {}) {
  return bindPhonePanel({ ...options, mode: "link" });
}

function bindPhonePanel(options) {
  const $ = (id) => document.getElementById(id);
  const phoneInput = $(options.phoneInputId);
  const codeInput = $(options.codeInputId);
  const sendButton = $(options.sendButtonId);
  const confirmButton = $(options.confirmButtonId);
  const codeGroup = $(options.codeGroupId);
  const recaptchaContainer = $(options.recaptchaContainerId);
  const consentCheckbox = options.consentCheckboxId ? $(options.consentCheckboxId) : null;
  const status = $(options.statusId);
  if (!phoneInput || !codeInput || !sendButton || !confirmButton || !codeGroup || !recaptchaContainer) return () => {};

  let verifier = null;
  let confirmationResult = null;
  let linkedOwnerUid = "";
  let busy = false;
  const removers = [];
  const bind = (element, eventName, handler) => {
    element.addEventListener(eventName, handler);
    removers.push(() => element.removeEventListener(eventName, handler));
  };
  const setStatus = (message, kind = "info") => {
    if (!status) return;
    status.textContent = String(message || "");
    status.dataset.kind = kind;
    status.classList.toggle("section-hidden", !status.textContent);
  };
  const setBusy = (value) => {
    busy = value;
    sendButton.disabled = value;
    confirmButton.disabled = value || !confirmationResult;
    if (typeof options.onBusyChange === "function") options.onBusyChange(value);
  };
  const clearVerifier = () => {
    if (verifier) {
      try { verifier.clear(); } catch (error) { console.warn("Could not clear the phone security check:", error); }
      verifier = null;
    }
    recaptchaContainer.replaceChildren();
  };
  const makeVerifier = async () => {
    await authReady;
    clearVerifier();
    verifier = new RecaptchaVerifier(auth, recaptchaContainer, {
      size: "normal",
      "expired-callback": () => setStatus("The security check expired. Complete it again before requesting a code.", "info")
    });
    await verifier.render();
    return verifier;
  };

  bind(sendButton, "click", async () => {
    if (busy) return;
    setBusy(true);
    confirmationResult = null;
    codeGroup.hidden = true;
    codeInput.value = "";
    setStatus("Preparing a secure SMS request…", "info");
    try {
      if (consentCheckbox && !consentCheckbox.checked) {
        throw new Error("Confirm the phone sign-in consent notice before requesting an SMS code.");
      }
      const phone = cleanPhoneNumber(phoneInput.value);
      if (typeof options.beforeSend === "function") await options.beforeSend();
      if (options.mode === "link") linkedOwnerUid = auth.currentUser?.uid || "";
      const appVerifier = await makeVerifier();
      confirmationResult = options.mode === "link"
        ? await beginPhoneNumberLink(phone, appVerifier)
        : await signInWithPhoneNumber(auth, phone, appVerifier);
      codeGroup.hidden = false;
      confirmButton.disabled = false;
      setStatus(`A verification code was sent to ${phone}.`, "success");
      codeInput.focus();
    } catch (error) {
      confirmationResult = null;
      clearVerifier();
      setStatus(error?.message || "Could not send the SMS verification code.", "error");
    } finally {
      setBusy(false);
    }
  });

  bind(confirmButton, "click", async () => {
    if (busy || !confirmationResult) return;
    setBusy(true);
    setStatus("Checking the code…", "info");
    try {
      if (options.mode === "link" && (!linkedOwnerUid || auth.currentUser?.uid !== linkedOwnerUid)) {
        throw new Error("The active account changed. Request a new code for the account you want to link.");
      }
      const code = String(codeInput.value || "").trim();
      const result = options.mode === "link"
        ? await completePhoneNumberLink(confirmationResult, code)
        : await completePhoneSignIn(confirmationResult, code);
      confirmationResult = null;
      clearVerifier();
      codeGroup.hidden = true;
      codeInput.value = "";
      setStatus(options.mode === "link" ? "Phone number linked and verified." : "Signed in with your phone number.", "success");
      if (typeof options.onSuccess === "function") await options.onSuccess(result);
    } catch (error) {
      if (error?.code === "auth/panategwa-account-not-linked") {
        confirmationResult = null;
        clearVerifier();
        codeGroup.hidden = true;
        codeInput.value = "";
      }
      setStatus(error?.message || "That code could not be confirmed. Try again or request a new one.", "error");
    } finally {
      setBusy(false);
    }
  });

  bind(codeInput, "keydown", (event) => {
    if (event.key === "Enter" && confirmationResult && !busy) {
      event.preventDefault();
      confirmButton.click();
    }
  });
  bind(phoneInput, "keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendButton.click();
    }
  });

  const dispose = () => {
    removers.forEach((remove) => remove());
    confirmationResult = null;
    clearVerifier();
  };
  dispose.reset = () => {
    confirmationResult = null;
    linkedOwnerUid = "";
    codeGroup.hidden = true;
    codeInput.value = "";
    confirmButton.disabled = true;
    clearVerifier();
  };
  return dispose;
}
