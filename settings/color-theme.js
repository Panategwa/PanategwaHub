// ========================================================
// Theme system
// ========================================================
// A theme only declares FIVE base colours. Everything else
// the UI needs — sidebar fill, button outlines, hover
// states, borders, glows, shadows, scrollbars, focus rings —
// is derived from those five in styles/general.css using
// color-mix(). Adding a theme is five lines, and nothing
// else in the stylesheets has to be touched.
//
//   --c-base    page background
//   --c-panel   sidebar / card surface (usually base, darker or tinted)
//   --c-accent  links, highlights, active states
//   --c-line    borders, dividers, scrollbars
//   --c-text    body text
const THEMES = [
  {
    name: "Panategwa Mode (Default)",
    colors: {
      "--c-base": "#121a2c",
      "--c-panel": "#0b1424",
      "--c-accent": "#60a5fa",
      "--c-line": "#94a3b8",
      "--c-text": "#e7edf7"
    }
  },
  {
    name: "Dark Mode",
    colors: {
      "--c-base": "#090d16",
      "--c-panel": "#060a11",
      "--c-accent": "#60a5fa",
      "--c-line": "#94a3b8",
      "--c-text": "#eef2f8"
    }
  },
  {
    name: "Light Mode",
    colors: {
      "--c-base": "#f6f8fb",
      "--c-panel": "#ffffff",
      "--c-accent": "#2563eb",
      "--c-line": "#64748b",
      "--c-text": "#0f172a"
    }
  },
  {
    name: "Ocean",
    colors: {
      "--c-base": "#0a2233",
      "--c-panel": "#071a28",
      "--c-accent": "#22d3ee",
      "--c-line": "#7dd3fc",
      "--c-text": "#d9efff"
    }
  },
  {
    name: "Neon",
    colors: {
      "--c-base": "#050505",
      "--c-panel": "#0a0a0a",
      "--c-accent": "#00ffff",
      "--c-line": "#ff00ff",
      "--c-text": "#39ff14"
    }
  },
  {
    name: "Space",
    colors: {
      "--c-base": "#0c1222",
      "--c-panel": "#080d1a",
      "--c-accent": "#818cf8",
      "--c-line": "#a5b4fc",
      "--c-text": "#d4ddff"
    }
  },
  {
    name: "Sunset",
    colors: {
      "--c-base": "#1e0a19",
      "--c-panel": "#2a0f1c",
      "--c-accent": "#fb7185",
      "--c-line": "#fdba74",
      "--c-text": "#ffe6d5"
    }
  },
  {
    name: "Forest",
    colors: {
      "--c-base": "#0b1f14",
      "--c-panel": "#07170f",
      "--c-accent": "#34d399",
      "--c-line": "#6ee7b7",
      "--c-text": "#d7f7e3"
    }
  },
  {
    name: "Ice",
    colors: {
      "--c-base": "#0a1a2a",
      "--c-panel": "#07131f",
      "--c-accent": "#38bdf8",
      "--c-line": "#bae6fd",
      "--c-text": "#d9f2ff"
    }
  },
  {
    name: "Midnight Blue",
    colors: {
      "--c-base": "#050816",
      "--c-panel": "#03050f",
      "--c-accent": "#7aa2ff",
      "--c-line": "#93a5fd",
      "--c-text": "#cbd5ff"
    }
  }
];

const DEFAULT_THEME_NAME = THEMES[0].name;

function applyTheme(theme) {
  // Only the five base colours are written; every derived token updates
  // automatically because styles/general.css mixes them from these.
  for (const [key, value] of Object.entries(theme.colors)) {
    document.documentElement.style.setProperty(key, value);
  }

  // The default theme is still written here. It was briefly not stored, on the
  // reasoning that a value the visitor never chose should not be persisted --
  // which also kept ?theme= off every internal link, since syncThemeUrl reads
  // this back. That turned out to change how the router classifies a link to
  // the page you are already on (see the same-page branch in js/router.js), so
  // it is deliberately not done: the URL is kept stamped with the theme.
  localStorage.setItem("theme", theme.name);
  window.dispatchEvent(new CustomEvent("panategwa:themechange", {
    detail: { theme: theme.name }
  }));
}

function syncThemeUrl(name) {
  const url = new URL(window.location.href);

  // A pre-existing ?theme= can still be there from a link, so compare against
  // the default rather than relying on there being no stored value to find.
  if (name && name !== DEFAULT_THEME_NAME) {
    url.searchParams.set("theme", name);
  } else {
    url.searchParams.delete("theme");
  }

  const lang = typeof getCurrentLang === "function"
    ? getCurrentLang()
    : (new URLSearchParams(window.location.search).get("lang") || localStorage.getItem("lang") || "en");

  if (lang && lang !== "en") {
    url.searchParams.set("lang", lang);
  } else {
    url.searchParams.delete("lang");
  }

  const size = typeof getTextSize === "function"
    ? getTextSize()
    : (new URLSearchParams(window.location.search).get("textsize") || localStorage.getItem("textsize") || "medium");

  if (size && size !== "medium" && size !== "custom") {
    url.searchParams.set("textsize", size);
  } else {
    url.searchParams.delete("textsize");
  }

  window.history.replaceState({}, "", url);
}

// Mirror the active class onto the theme picker. Without this the picker never
// shows which theme is selected, and setTheme used to throw here - which also
// skipped syncThemeUrl below, and (because initTheme is called in the same
// callback as initTranslate) left translation uninitialised on every page.
function setActiveThemeButton(name) {
  const container = document.getElementById("theme-buttons");
  if (!container) return;

  container.querySelectorAll(".theme-button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.theme === name);
    btn.setAttribute("aria-pressed", btn.dataset.theme === name ? "true" : "false");
  });
}

function setTheme(name) {
  const theme = THEMES.find(t => t.name === name);
  if (!theme) return;

  applyTheme(theme);
  setActiveThemeButton(name);
  syncThemeUrl(name);
}

function buildThemeButtons() {
  const container = document.getElementById("theme-buttons");
  if (!container) return;

  container.innerHTML = "";

  THEMES.forEach(theme => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-button";
    btn.dataset.theme = theme.name;
    btn.textContent = theme.name;
    btn.style.background = theme.colors["--c-base"];
    btn.style.color = theme.colors["--c-text"];
    btn.onclick = () => setTheme(theme.name);
    container.appendChild(btn);
  });
}

// The settings page's Reset button needs to put the theme back without
// synthesising a click, and this is a classic script rather than a module, so
// the setter is published for it to call.
window.setTheme = setTheme;
window.PanategwaDefaultThemeName = DEFAULT_THEME_NAME;

function initTheme() {
  buildThemeButtons();

  // The URL is consulted before storage, not after. buildSettingsUrl writes
  // ?theme= onto every internal link, so a link is how a theme travels between
  // pages -- and it used to be ignored on arrival, which left a shared link
  // silently showing the reader's own theme instead of the one they were sent.
  const urlTheme = new URLSearchParams(window.location.search).get("theme");
  const saved = localStorage.getItem("theme");
  const initial = THEMES.some(t => t.name === saved) ? saved : DEFAULT_THEME_NAME;

  setTheme(initial);
  if (urlTheme && THEMES.some(t => t.name === urlTheme) && urlTheme !== initial) {
    setTheme(urlTheme);
  }
}
