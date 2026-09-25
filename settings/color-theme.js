// ========================================================
// Theme system
// ========================================================
// A theme only declares FIVE base colours. Everything else
// the UI needs — sidebar fill, button outlines, hover
// states, borders, glows, shadows, scrollbars, focus rings —
// is derived from those five in css/styles.css using
// color-mix(). Adding a theme is five lines, and nothing
// else in the stylesheet has to be touched.
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

function applyTheme(theme) {
  // Only the five base colours are written; every derived token updates
  // automatically because css/styles.css mixes them from these.
  for (const [key, value] of Object.entries(theme.colors)) {
    document.documentElement.style.setProperty(key, value);
  }

  localStorage.setItem("theme", theme.name);
  window.dispatchEvent(new CustomEvent("panategwa:themechange", {
    detail: { theme: theme.name }
  }));
}

function syncThemeUrl(name) {
  const url = new URL(window.location.href);

  if (name) {
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

  if (size && size !== "medium") {
    url.searchParams.set("textsize", size);
  } else {
    url.searchParams.delete("textsize");
  }

  window.history.replaceState({}, "", url);
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
  container.style.display = "none";

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

function toggleThemes() {
  const container = document.getElementById("theme-buttons");
  const msg = document.getElementById("theme-message");

  if (!container || !msg) return;

  const open = container.classList.toggle("is-open");
  container.style.display = open ? "block" : "none";
  msg.style.display = open ? "block" : "none";
}

function initTheme() {
  buildThemeButtons();

  const saved = localStorage.getItem("theme");
  const initial = THEMES.some(t => t.name === saved) ? saved : THEMES[0].name;

  setTheme(initial);
}
