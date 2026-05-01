import {
  clearPanategwaToasts,
  ensurePanategwaToast,
  getToastAudioSettings,
  setToastAudioChannelVolume,
  toggleToastAudioChannelMute
} from "../auth/toast.js";

const $ = (id) => document.getElementById(id);

function clampPercent(value, fallback = 0) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(0, Math.min(100, Math.round(next)));
}

function setScopedStatus(id, message = "", kind = "info") {
  const el = $(id);
  if (!el) return;
  el.textContent = String(message || "").trim();
  el.dataset.kind = kind;
  el.classList.toggle("section-hidden", !el.textContent);
}

function syncSliderVisual(slider, value) {
  if (!slider) return;
  slider.style.setProperty("--range-fill", `${clampPercent(value, 0)}%`);
}

function syncAudioControls(settings = getToastAudioSettings()) {
  const masterVolume = clampPercent(settings?.masterVolume, 100);
  const popupVolume = clampPercent(settings?.popupVolume, 70);
  const musicVolume = clampPercent(settings?.musicVolume, 70);
  const masterSlider = $("master-volume-slider");
  const popupSlider = $("popup-volume-slider");
  const musicSlider = $("music-volume-slider");

  if (masterSlider && document.activeElement !== masterSlider) {
    masterSlider.value = String(masterVolume);
  }
  if (popupSlider && document.activeElement !== popupSlider) {
    popupSlider.value = String(popupVolume);
  }
  if (musicSlider && document.activeElement !== musicSlider) {
    musicSlider.value = String(musicVolume);
  }

  syncSliderVisual(masterSlider, masterVolume);
  syncSliderVisual(popupSlider, popupVolume);
  syncSliderVisual(musicSlider, musicVolume);

  if ($("master-volume-value")) $("master-volume-value").textContent = `${masterVolume}%`;
  if ($("popup-volume-value")) $("popup-volume-value").textContent = `${popupVolume}%`;
  if ($("music-volume-value")) $("music-volume-value").textContent = `${musicVolume}%`;

  if ($("mute-master-volume-btn")) $("mute-master-volume-btn").textContent = masterVolume > 0 ? "Mute" : "Unmute";
  if ($("mute-popup-volume-btn")) $("mute-popup-volume-btn").textContent = popupVolume > 0 ? "Mute" : "Unmute";
  if ($("mute-music-volume-btn")) $("mute-music-volume-btn").textContent = musicVolume > 0 ? "Mute" : "Unmute";
}

function togglePanel(messageId, optionsId) {
  const message = $(messageId);
  const options = $(optionsId);
  if (!message || !options) return;

  const open = options.style.display === "block";
  options.style.display = open ? "none" : "block";
  message.style.display = open ? "none" : "block";
}

function sendTestPopup() {
  ensurePanategwaToast();
  const title = String($("testing-toast-title")?.value || "").trim() || "Message title";
  const body = String($("testing-toast-body")?.value || "").trim() || "This is a test popup for your current audio settings.";

  if (typeof window.PanategwaToast === "function") {
    window.PanategwaToast({
      title,
      body,
      duration: 5000,
      persist: false,
      kind: "general",
      clearExisting: true
    });
  }

  setScopedStatus("testing-status", "Test popup sent.", "success");
}

function bindAudioControls() {
  $("mute-master-volume-btn")?.addEventListener("click", () => {
    const next = toggleToastAudioChannelMute("masterVolume");
    syncAudioControls(next);
    setScopedStatus("audio-status", next.masterVolume > 0 ? "Master volume restored." : "Master volume muted.", "success");
  });

  $("mute-music-volume-btn")?.addEventListener("click", () => {
    const next = toggleToastAudioChannelMute("musicVolume");
    syncAudioControls(next);
    setScopedStatus("audio-status", next.musicVolume > 0 ? "Music volume restored." : "Music muted.", "success");
  });

  $("mute-popup-volume-btn")?.addEventListener("click", () => {
    const next = toggleToastAudioChannelMute("popupVolume");
    syncAudioControls(next);
    setScopedStatus("audio-status", next.popupVolume > 0 ? "Pop-up volume restored." : "Pop-up volume muted.", "success");
  });

  $("master-volume-slider")?.addEventListener("input", (event) => {
    const next = setToastAudioChannelVolume("masterVolume", event.target.value);
    syncAudioControls(next);
  });
  $("master-volume-slider")?.addEventListener("change", (event) => {
    setToastAudioChannelVolume("masterVolume", event.target.value);
    syncAudioControls();
    setScopedStatus("audio-status", "Master volume updated.", "success");
  });

  $("popup-volume-slider")?.addEventListener("input", (event) => {
    const next = setToastAudioChannelVolume("popupVolume", event.target.value);
    syncAudioControls(next);
  });
  $("popup-volume-slider")?.addEventListener("change", (event) => {
    setToastAudioChannelVolume("popupVolume", event.target.value);
    syncAudioControls();
    setScopedStatus("audio-status", "Popup sound volume updated.", "success");
  });

  $("music-volume-slider")?.addEventListener("input", (event) => {
    const next = setToastAudioChannelVolume("musicVolume", event.target.value);
    syncAudioControls(next);
  });
  $("music-volume-slider")?.addEventListener("change", (event) => {
    setToastAudioChannelVolume("musicVolume", event.target.value);
    syncAudioControls();
    setScopedStatus("audio-status", "Music volume updated.", "success");
  });

  $("clear-all-popups-btn")?.addEventListener("click", () => {
    clearPanategwaToasts();
    setScopedStatus("other-status", "All visible and queued popups were removed.", "success");
  });

  $("send-test-popup-btn")?.addEventListener("click", sendTestPopup);

  window.addEventListener("panategwa:audio-settings-change", (event) => {
    syncAudioControls(event?.detail?.settings || getToastAudioSettings());
  });

  window.addEventListener("storage", () => {
    syncAudioControls(getToastAudioSettings());
  });
}

function start() {
  syncAudioControls();
  bindAudioControls();
}

window.toggleAudioSettings = () => togglePanel("audio-message", "audio-options");
window.toggleOtherSettings = () => togglePanel("other-message", "other-options");

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
