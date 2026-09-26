(function () {
  if (window.__PANATEGWA_SETTINGS_BOOTSTRAPPED) return;
  window.__PANATEGWA_SETTINGS_BOOTSTRAPPED = true;

  // Loaded as a module by js/page-init.js, last in the list, so the sidebar
  // exists and window.PanategwaRoot is published before siteRoot() is used.
  //
  // Use direct paths relative to the site root.
  // These scripts are loaded as classic scripts (not modules) because
  // they declare global init functions (initTextSize, initTheme, initTranslate).
  const MODULES = [
    "settings/translate.js",
    "settings/text-size.js",
    "settings/color-theme.js"
  ];

  function siteRoot() {
    return (typeof window !== "undefined" && window.PanategwaRoot) || "";
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = siteRoot() + src;
      script.async = false;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
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

    whenReady(() => {
      if (typeof initTextSize === "function") initTextSize();
      if (typeof initTheme === "function") initTheme();
      if (typeof initTranslate === "function") initTranslate();
    });
  }

  boot().catch(err => console.error("[Panategwa settings]", err));
})();
