(function () {
  if (window.__PANATEGWA_SETTINGS_BOOTSTRAPPED) return;
  window.__PANATEGWA_SETTINGS_BOOTSTRAPPED = true;

  const BASE_URL = new URL(
    ".",
    document.currentScript?.src || window.location.href
  );

  const MODULES = [
    "translate.js",
    "text-size.js",
    "color-theme.js"
  ].map(file => new URL(file, BASE_URL).href);

  const ACHIEVEMENTS_MODULE = new URL("../auth/achievements.js", BASE_URL).href;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  }

  function ensureModule(src, marker) {
    const existing = [...document.querySelectorAll("script[type='module']")].some((script) => {
      const current = script.getAttribute("src") || "";
      return current === src || current.endsWith("/auth/achievements.js") || script.dataset[marker] === "true";
    });

    if (existing) return;

    const script = document.createElement("script");
    script.type = "module";
    script.src = src;
    script.dataset[marker] = "true";
    document.head.appendChild(script);
  }

  function whenReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  async function boot() {
    for (const src of MODULES) {
      await loadScript(src);
    }

    ensureModule(ACHIEVEMENTS_MODULE, "panategwaAchievements");

    whenReady(() => {
      if (typeof initTextSize === "function") initTextSize();
      if (typeof initTheme === "function") initTheme();
      if (typeof initTranslate === "function") initTranslate();
    });
  }

  boot().catch(err => console.error("[Panategwa settings]", err));
})();
