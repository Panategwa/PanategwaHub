import { setToastAudioChannelVolume } from "../auth/toast.js";

// ========================================================
// Settings page: the five categories
// ========================================================
// The page itself is markup; this module is the behaviour that only the
// settings page needs -- switching category, the animation buttons, the
// sidebar width slider and Reset.
//
// The animation preference itself is applied site-wide by settings/settings.js
// rather than here, because it has to be in force before the first paint on
// every page. This module only writes the choice; that bootstrap reads it.

const $ = (id) => document.getElementById(id);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const ANIM_TIERS = ["normal", "reduced", "none"];

// Every localStorage key the Reset button clears, in one list so the button
// and the explanation above it cannot drift apart. `ptg_audio_settings` is
// deliberately not here: the live audio element holds the current levels, so
// the levels are pushed back through the public setter instead, which updates
// both the storage and what is playing.
const RESETTABLE_KEYS = ["theme", "textsize", "textsize_value", "lang", "anim", "menuWidth"];

const DEFAULT_AUDIO = { masterVolume: 100, popupVolume: 70, musicVolume: 70 };

let tabButtons = [];
let panels = [];
let disposers = [];

function setStatus(id, message = "", kind = "info") {
  const el = $(id);
  if (!el) return;
  el.textContent = String(message || "").trim();
  el.dataset.kind = kind;
  el.classList.toggle("section-hidden", !el.textContent);
}

// ========================================================
// Categories
// ========================================================
function selectTab(name, { focus = false } = {}) {
  const target = tabButtons.find((btn) => btn.dataset.settingsTab === name);
  if (!target) return;

  tabButtons.forEach((btn) => {
    const on = btn === target;
    btn.setAttribute("aria-selected", on ? "true" : "false");
    // Roving tabindex: only the selected tab is in the tab order, and the
    // arrow keys move between them. Five separate tab stops for five views of
    // the same page would be noise in the tab order.
    btn.tabIndex = on ? 0 : -1;
  });

  panels.forEach((panel) => {
    panel.hidden = panel.id !== target.getAttribute("aria-controls");
  });

  if (focus) target.focus();
}

function onTabKeydown(event) {
  const index = tabButtons.indexOf(event.currentTarget);
  if (index < 0) return;

  let next = null;
  if (event.key === "ArrowRight") next = tabButtons[(index + 1) % tabButtons.length];
  else if (event.key === "ArrowLeft") next = tabButtons[(index - 1 + tabButtons.length) % tabButtons.length];
  else if (event.key === "Home") next = tabButtons[0];
  else if (event.key === "End") next = tabButtons[tabButtons.length - 1];
  else return;

  event.preventDefault();
  selectTab(next.dataset.settingsTab, { focus: true });
}

function bindTabs() {
  tabButtons = $$("[data-settings-tab]");
  panels = $$(".settings-panel");

  tabButtons.forEach((btn) => {
    const onClick = () => selectTab(btn.dataset.settingsTab);
    const onKey = onTabKeydown;
    btn.addEventListener("click", onClick);
    btn.addEventListener("keydown", onKey);
    disposers.push(() => {
      btn.removeEventListener("click", onClick);
      btn.removeEventListener("keydown", onKey);
    });
  });

  const selected = tabButtons.find((btn) => btn.getAttribute("aria-selected") === "true");
  selectTab(selected ? selected.dataset.settingsTab : (tabButtons[0] && tabButtons[0].dataset.settingsTab));
}

// ========================================================
// Animations
// ========================================================
// Scoped to `button[data-anim-choice]` on purpose, not a bare
// [data-anim-choice]. <html> carries a data-anim-choice attribute too -- that
// is the "the visitor has made a choice" marker the shared bootstrap checks --
// and an unscoped query handed it the button's `active` class and
// aria-pressed as well.
const ANIM_BUTTONS = "button[data-anim-choice]";

function syncAnimButtons() {
  const tier = typeof window.PanategwaGetAnimTier === "function"
    ? window.PanategwaGetAnimTier()
    : "normal";

  $$(ANIM_BUTTONS).forEach((btn) => {
    const on = btn.dataset.animChoice === tier;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });

  // The note only means anything while the tier is the system default. Once
  // the visitor has picked one, the system preference is no longer consulted
  // and saying so would be misleading.
  const note = $("settings-panel-accessibility")?.querySelector("[data-anim-system-note]");
  if (note) {
    note.classList.toggle("section-hidden", isAnimChosen());
  }
}

function isAnimChosen() {
  try {
    const stored = localStorage.getItem("anim");
    return ANIM_TIERS.includes(stored);
  } catch (e) {
    return false;
  }
}

function bindAnimChoice() {
  const onPick = (event) => {
    const btn = event.currentTarget;
    const tier = btn.dataset.animChoice;
    if (!ANIM_TIERS.includes(tier)) return;
    if (typeof window.PanategwaSetAnimTier !== "function") return;

    window.PanategwaSetAnimTier(tier);
    syncAnimButtons();
  };

  $$(ANIM_BUTTONS).forEach((btn) => {
    btn.addEventListener("click", onPick);
    disposers.push(() => btn.removeEventListener("click", onPick));
  });

  // The setting is applied site-wide, so it can change while the page is
  // already up -- another tab, or the sidebar width code resetting it.
  const onAnimChange = () => syncAnimButtons();
  window.addEventListener("panategwa:animchange", onAnimChange);
  disposers.push(() => window.removeEventListener("panategwa:animchange", onAnimChange));
}

// ========================================================
// Sidebar width
// ========================================================
function syncSidebarWidth(value) {
  const slider = $("sidebar-width-slider");
  const label = $("sidebar-width-value");
  const range = window.PanategwaMenuWidthRange || { min: 220, max: 500, default: 280 };

  if (slider && document.activeElement !== slider) {
    slider.value = String(value);
  }
  if (slider) {
    const span = range.max - range.min;
    slider.style.setProperty("--range-fill", `${((value - range.min) / span) * 100}%`);
  }
  if (label) label.textContent = `${value}px`;
}

function bindSidebarWidth() {
  const slider = $("sidebar-width-slider");
  if (!slider) return;

  const range = window.PanategwaMenuWidthRange || { min: 220, max: 500, default: 280 };
  slider.min = String(range.min);
  slider.max = String(range.max);

  // site.js is imported before this module, so the handle and its readers are
  // already in place. If they are not, the slider is disabled rather than
  // left as a control that silently does nothing.
  if (typeof window.PanategwaSetMenuWidth !== "function") {
    slider.disabled = true;
    syncSidebarWidth(range.default);
    return;
  }

  syncSidebarWidth(window.PanategwaGetMenuWidth());

  const onInput = (event) => {
    syncSidebarWidth(window.PanategwaSetMenuWidth(event.target.value));
  };
  const onChange = () => {
    syncSidebarWidth(window.PanategwaGetMenuWidth());
  };

  slider.addEventListener("input", onInput);
  slider.addEventListener("change", onChange);
  disposers.push(() => {
    slider.removeEventListener("input", onInput);
    slider.removeEventListener("change", onChange);
  });

  $("sidebar-width-reset-btn")?.addEventListener("click", () => {
    syncSidebarWidth(window.PanategwaSetMenuWidth(range.default));
  });
}

// ========================================================
// Reset
// ========================================================
function resetEverything() {
  RESETTABLE_KEYS.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  });

  // Audio is pushed through the setter so what is playing changes with the
  // stored value, instead of the storage resetting and the current track
  // carrying on at the old level until the next page load.
  Object.keys(DEFAULT_AUDIO).forEach((channel) => {
    try {
      setToastAudioChannelVolume(channel, DEFAULT_AUDIO[channel]);
    } catch (e) {}
  });

  if (typeof window.PanategwaSetAnimTier === "function") window.PanategwaSetAnimTier("normal");
  if (typeof window.PanategwaSetMenuWidth === "function") {
    window.PanategwaSetMenuWidth((window.PanategwaMenuWidthRange || {}).default);
  }

  // The other four settings are owned by scripts that read storage on their
  // own terms, and each exposes a setter. They are globals rather than
  // modules, so they are looked up at call time.
  if (typeof window.setTextSize === "function") window.setTextSize("medium");
  if (typeof window.setTheme === "function" && window.PanategwaDefaultThemeName) {
    window.setTheme(window.PanategwaDefaultThemeName);
  }
  if (typeof window.setLang === "function") window.setLang("en");

  syncAnimButtons();
  syncSidebarWidth(typeof window.PanategwaGetMenuWidth === "function"
    ? window.PanategwaGetMenuWidth()
    : (window.PanategwaMenuWidthRange || {}).default);

  setStatus("reset-status", "Everything is back to how the site ships.", "success");
}

function bindReset() {
  const btn = $("reset-all-settings-btn");
  if (!btn) return;

  const onClick = () => {
    // This one is the only control on the page that throws work away, so it
    // asks first. The other settings are one click each and reversible by
    // definition; this is not.
    if (!window.confirm("Reset every setting on this page back to its default?\n\nYour account, progress and achievements are not affected.")) {
      return;
    }
    resetEverything();
  };

  btn.addEventListener("click", onClick);
  disposers.push(() => btn.removeEventListener("click", onClick));
}

// ========================================================
// Lifecycle
// ========================================================
// A fresh instance of this module is evaluated on every visit to the settings
// page, because the router re-imports page modules with a cache-busting query.
// Listeners on elements inside the content die with the content, but these are
// on window and on the sidebar, so they have to be taken down explicitly.
function disposeSettingsPageModule() {
  disposers.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error("Settings page disposal error:", e);
    }
  });
  disposers = [];
  tabButtons = [];
  panels = [];
}

window.PanategwaRouteDispose = window.PanategwaRouteDispose || {};
window.PanategwaRouteDispose.settingsPage = disposeSettingsPageModule;

function start() {
  disposeSettingsPageModule();

  // The language, theme and text size controls are built by the shared
  // settings scripts into this page's markup. Those run once per document
  // load, and a client-side navigation never reloads the document, so without
  // this the lists are empty every time the page is reached by clicking
  // rather than by a fresh load. Idempotent, so it is safe to call on the
  // first load too.
  if (typeof window.PanategwaRefreshSettingsUI === "function") {
    window.PanategwaRefreshSettingsUI();
  }

  bindTabs();
  bindAnimChoice();
  bindSidebarWidth();
  bindReset();
  syncAnimButtons();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
