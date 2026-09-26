const PRESET_FONT_SIZES = Object.freeze({
  small: 14,
  medium: 16,
  large: 18
});

const DEFAULT_FONT_SIZE = PRESET_FONT_SIZES.medium;
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 20;

function clampFontSize(value, fallback = DEFAULT_FONT_SIZE) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(next)));
}

function readUrlTextSize() {
  const urlValue = new URLSearchParams(window.location.search).get("textsize");
  if (!urlValue) return null;
  if (PRESET_FONT_SIZES[urlValue]) return PRESET_FONT_SIZES[urlValue];
  if (/^\d+$/.test(urlValue)) return clampFontSize(urlValue);
  return null;
}

function getTextSizeValue() {
  const urlValue = readUrlTextSize();
  if (urlValue != null) return urlValue;

  const savedNumeric = localStorage.getItem("textsize_value");
  if (savedNumeric != null && savedNumeric !== "") {
    return clampFontSize(savedNumeric);
  }

  const savedPreset = localStorage.getItem("textsize");
  if (savedPreset && PRESET_FONT_SIZES[savedPreset]) {
    return PRESET_FONT_SIZES[savedPreset];
  }

  return DEFAULT_FONT_SIZE;
}

function getTextSizePresetKey(size) {
  const px = clampFontSize(size);
  return Object.entries(PRESET_FONT_SIZES).find(([, value]) => value === px)?.[0] || "custom";
}

// The current size as a preset key, or "custom" once the user has dragged the
// slider off the presets. color-theme.js and translate.js both call this to
// mirror the size into the URL, and neither defined it, so both fell through
// their typeof guard to localStorage and wrote a "?textsize=custom" parameter
// that readUrlTextSize then discarded on the next load.
function getTextSize() {
  return getTextSizePresetKey(getTextSizeValue());
}

function syncTextSizeUrl(size) {
  const px = clampFontSize(size);
  const url = new URL(window.location.href);
  const presetKey = getTextSizePresetKey(px);

  if (px === DEFAULT_FONT_SIZE) {
    url.searchParams.delete("textsize");
  } else if (presetKey !== "custom") {
    url.searchParams.set("textsize", presetKey);
  } else {
    url.searchParams.set("textsize", String(px));
  }

  const lang = typeof getCurrentLang === "function"
    ? getCurrentLang()
    : (new URLSearchParams(window.location.search).get("lang") || localStorage.getItem("lang") || "en");

  if (lang && lang !== "en") {
    url.searchParams.set("lang", lang);
  } else {
    url.searchParams.delete("lang");
  }

  const theme = localStorage.getItem("theme");
  if (theme) {
    url.searchParams.set("theme", theme);
  } else {
    url.searchParams.delete("theme");
  }

  window.history.replaceState({}, "", url);
}

function syncTextSizeInputs(size) {
  const px = clampFontSize(size);
  const presetKey = getTextSizePresetKey(px);

  document.querySelectorAll("[data-textsize-preset]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.textsizePreset === presetKey);
  });

  const slider = document.getElementById("textsize-custom-slider");
  if (slider && document.activeElement !== slider) {
    slider.value = String(px);
  }
  if (slider) {
     slider.style.setProperty("--range-fill", `${((px - MIN_FONT_SIZE) / (MAX_FONT_SIZE - MIN_FONT_SIZE)) * 100}%`);
  }

  const value = document.getElementById("textsize-custom-value");
  if (value) {
    value.textContent = `${px}px`;
  }
}

function applyFontSize(size) {
  const px = clampFontSize(size);
  const presetKey = getTextSizePresetKey(px);

  document.documentElement.style.setProperty("--global-font-size", `${px}px`);
  localStorage.setItem("textsize_value", String(px));
  localStorage.setItem("textsize", presetKey === "custom" ? "custom" : presetKey);

  window.dispatchEvent(new CustomEvent("panategwa:textsizechange", {
    detail: { size: presetKey, px }
  }));
}

function setTextSize(size) {
  const px = typeof size === "string" && PRESET_FONT_SIZES[size]
    ? PRESET_FONT_SIZES[size]
    : clampFontSize(size);

  applyFontSize(px);
  syncTextSizeInputs(px);
  syncTextSizeUrl(px);
}

function buildTextSizeButtons() {
  const container = document.getElementById("textsize-buttons");
  if (!container) return;

  container.innerHTML = `
    <div class="settings-option-card textsize-settings-card">
      <div class="settings-card-heading">
        <strong>Presets</strong>
        <small>Quickly switch between the common text sizes.</small>
      </div>
      <div class="textsize-preset-grid">
        <button type="button" data-textsize-preset="small">Small (14px)</button>
        <button type="button" data-textsize-preset="medium">Default (16px)</button>
        <button type="button" data-textsize-preset="large">Large (18px)</button>
      </div>

      <div class="audio-control-card textsize-custom-card">
        <div class="audio-slider-row">
          <span class="audio-slider-copy">
            <strong>Manual size</strong>
            <small>Set the site text exactly how you want it, from 12px to 20px.</small>
          </span>
          <span id="textsize-custom-value" class="audio-slider-value">16px</span>
        </div>
        <input
          id="textsize-custom-slider"
          class="audio-volume-slider"
          type="range"
          min="12"
          max="20"
          step="1"
          value="16"
        />
      </div>
    </div>
  `;

  container.style.display = "none";

  container.querySelectorAll("[data-textsize-preset]").forEach((btn) => {
    btn.addEventListener("click", () => setTextSize(btn.dataset.textsizePreset || "medium"));
  });

  container.querySelector("#textsize-custom-slider")?.addEventListener("input", (event) => {
    const value = clampFontSize(event.target.value);
    syncTextSizeInputs(value);
    applyFontSize(value);
  });

  container.querySelector("#textsize-custom-slider")?.addEventListener("change", (event) => {
    setTextSize(event.target.value);
  });
}

function toggleTextSizes() {
  const container = document.getElementById("textsize-buttons");
  const msg = document.getElementById("textsize-message");

  if (!container || !msg) return;

  const open = container.classList.toggle("is-open");
  container.style.display = open ? "block" : "none";
  msg.style.display = open ? "block" : "none";
}

function initTextSize() {
  buildTextSizeButtons();
  const current = getTextSizeValue();
  applyFontSize(current);
  syncTextSizeInputs(current);
  syncTextSizeUrl(current);
}
