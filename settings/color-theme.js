const THEMES = [
  {
    name: "Panategwa Mode (Default)",
    vars: {
      "--bg-color": "#0f172a",
      "--text-color": "#e5edf8",
      "--menu-bg": "rgba(15, 23, 42, 0.72)",
      "--menu-button": "rgba(148, 163, 184, 0.14)",
      "--link-color": "#b8dcff",
      "--button-text": "#f8fafc",
      "--preview-bg": "#0f172a",
      "--preview-text": "#e5edf8"
    }
  },
  {
    name: "Dark Mode",
    vars: {
      "--bg-color": "#090d16",
      "--text-color": "#eef2f8",
      "--menu-bg": "rgba(9, 13, 22, 0.82)",
      "--menu-button": "rgba(148, 163, 184, 0.12)",
      "--link-color": "#94c9ff",
      "--button-text": "#ffffff",
      "--preview-bg": "#090d16",
      "--preview-text": "#eef2f8"
    }
  },
  {
    name: "Light Mode",
    vars: {
      "--bg-color": "#f6f8fb",
      "--text-color": "#0f172a",
      "--menu-bg": "rgba(255, 255, 255, 0.78)",
      "--menu-button": "rgba(148, 163, 184, 0.16)",
      "--link-color": "#2563eb",
      "--button-text": "#0f172a",
      "--preview-bg": "#f6f8fb",
      "--preview-text": "#0f172a"
    }
  },
  {
    name: "Ocean",
    vars: {
      "--bg-color": "#0a2233",
      "--text-color": "#d9efff",
      "--menu-bg": "rgba(10, 34, 51, 0.72)",
      "--menu-button": "rgba(103, 232, 249, 0.14)",
      "--link-color": "#67e8f9",
      "--button-text": "#eafaff",
      "--preview-bg": "#0a2233",
      "--preview-text": "#d9efff"
    }
  },
  {
    name: "Neon",
    vars: {
      "--bg-color": "#050505",
      "--text-color": "#39ff14",
      "--menu-bg": "rgba(10, 10, 10, 0.9)",
      "--menu-button": "rgba(255, 0, 255, 0.25)",
      "--link-color": "#00ffff",
      "--button-text": "#39ff14",
      "--preview-bg": "#050505",
      "--preview-text": "#39ff14"
    }
  },
  {
    name: "Space",
    vars: {
      "--bg-color": "#0c1222",
      "--text-color": "#d4ddff",
      "--menu-bg": "rgba(12, 18, 34, 0.78)",
      "--menu-button": "rgba(129, 140, 248, 0.14)",
      "--link-color": "#a5b4fc",
      "--button-text": "#ffffff",
      "--preview-bg": "#0c1222",
      "--preview-text": "#d4ddff"
    }
  },
  {
    name: "Sunset",
    vars: {
      "--bg-color": "rgb(30, 10, 25)",
      "--text-color": "#ffe6d5",
      "--menu-bg": "rgba(120, 40, 60, 0.5)",
      "--menu-button": "rgba(255, 120, 80, 0.25)",
      "--link-color": "#ff9a76",
      "--button-text": "#fff0e6",
      "--preview-bg": "rgb(30, 10, 25)",
      "--preview-text": "#ffe6d5"
    }
  },
  {
    name: "Forest",
    vars: {
      "--bg-color": "#0b1f14",
      "--text-color": "#d7f7e3",
      "--menu-bg": "rgba(20, 60, 40, 0.7)",
      "--menu-button": "rgba(60, 140, 90, 0.25)",
      "--link-color": "#7cf2b3",
      "--button-text": "#eafff4",
      "--preview-bg": "#0b1f14",
      "--preview-text": "#d7f7e3"
    }
  },
  {
    name: "Ice",
    vars: {
      "--bg-color": "#0a1a2a",
      "--text-color": "#d9f2ff",
      "--menu-bg": "rgba(180, 220, 255, 0.15)",
      "--menu-button": "rgba(120, 200, 255, 0.25)",
      "--link-color": "#8ad7ff",
      "--button-text": "#e8f7ff",
      "--preview-bg": "#0a1a2a",
      "--preview-text": "#d9f2ff"
    }
  },
  {
    name: "Midnight Blue",
    vars: {
      "--bg-color": "#050816",
      "--text-color": "#cbd5ff",
      "--menu-bg": "rgba(10, 20, 60, 0.85)",
      "--menu-button": "rgba(70, 90, 200, 0.25)",
      "--link-color": "#7aa2ff",
      "--button-text": "#ffffff",
      "--preview-bg": "#050816",
      "--preview-text": "#cbd5ff"
    }
  }
];

function applyTheme(theme) {
  for (const [key, value] of Object.entries(theme.vars)) {
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

function setActiveThemeButton(name) {
  document.querySelectorAll("#theme-buttons button").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.theme === name);
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
    btn.style.background = theme.vars["--preview-bg"];
    btn.style.color = theme.vars["--preview-text"];
    btn.onclick = () => setTheme(theme.name);
    container.appendChild(btn);
  });
}

function toggleThemes() {
  const container = document.getElementById("theme-buttons");
  const msg = document.getElementById("theme-message");

  if (!container || !msg) return;

  const open = container.style.display === "block";
  container.style.display = open ? "none" : "block";
  msg.style.display = open ? "none" : "block";
}

function initTheme() {
  buildThemeButtons();

  const saved = localStorage.getItem("theme");
  const initial = THEMES.some(t => t.name === saved) ? saved : THEMES[0].name;

  setTheme(initial);
}
