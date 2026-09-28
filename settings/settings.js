(function () {
  if (window.__PANATEGWA_SETTINGS_BOOTSTRAPPED) return;
  window.__PANATEGWA_SETTINGS_BOOTSTRAPPED = true;

  // Loaded as a module by js/page-imports.js, last in the list, so the sidebar
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

  // ========================================================
  // Animation tier
  // ========================================================
  // The Animation setting is the one preference that has to be in force before
  // the first paint, on every page, or the site would visibly animate itself
  // in and then settle -- which is exactly what someone who needs reduced
  // motion is trying to avoid. So it lives here, in the shared bootstrap,
  // rather than in the settings page's own module.
  //
  // Two attributes end up on <html>:
  //   data-anim         normal | reduced | none  -- the resolved tier, and what
  //                    the CSS in general.css keys off
  //   data-anim-choice  normal | reduced | none  -- only present once the user
  //                    has actually chosen, so the OS preference below stops
  //                    overriding them
  const ANIM_TIERS = ["normal", "reduced", "none"];
  const ANIM_STORAGE_KEY = "anim";
  const ANIM_SYSTEM_PREFERS_REDUCED =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function readStoredAnimTier() {
    try {
      const stored = localStorage.getItem(ANIM_STORAGE_KEY);
      return ANIM_TIERS.includes(stored) ? stored : null;
    } catch (e) {
      return null;
    }
  }

  // The tier in force right now, for the rare case a script needs it --
  // window.PanategwaScrollBehavior() below is the only current caller.
  function getAnimTier() {
    return document.documentElement.getAttribute("data-anim") || "normal";
  }

  function applyAnimTier(tier) {
    const next = ANIM_TIERS.includes(tier) ? tier : "normal";
    const root = document.documentElement;

    root.setAttribute("data-anim", next);
    if (readStoredAnimTier()) {
      root.setAttribute("data-anim-choice", next);
    } else {
      root.removeAttribute("data-anim-choice");
    }

    window.dispatchEvent(new CustomEvent("panategwa:animchange", { detail: { tier: next } }));
    return next;
  }

  function setAnimTier(tier) {
    const next = ANIM_TIERS.includes(tier) ? tier : "normal";
    try {
      localStorage.setItem(ANIM_STORAGE_KEY, next);
    } catch (e) {}
    return applyAnimTier(next);
  }

  // The OS preference is the default for a visitor who has never chosen.
  // Once they have, this is not consulted again, so a deliberate pick is
  // never quietly overridden by a system-wide toggle.
  function initAnimTier() {
    applyAnimTier(readStoredAnimTier() || (ANIM_SYSTEM_PREFERS_REDUCED ? "reduced" : "normal"));
  }

  // scrollIntoView({behavior:"smooth"}) is a script request, so no stylesheet
  // can talk it out of animating. Anything that scrolls on the user's behalf
  // should ask here instead of hardcoding it.
  window.PanategwaScrollBehavior = function () {
    return getAnimTier() === "none" ? "auto" : "smooth";
  };

  window.PanategwaGetAnimTier = getAnimTier;
  window.PanategwaSetAnimTier = setAnimTier;

  function runInit(name, fn) {
    try {
      fn();
    } catch (error) {
      // Each settings script is independent. Isolating them means a fault in
      // one - a theme lookup that throws, say - cannot stop the others from
      // applying, which is exactly what happened when setActiveThemeButton
      // went missing and silently disabled translation on every page.
      console.warn(`[Panategwa settings] ${name} failed to initialise:`, error);
    }
  }

  // The three builders below fill containers that live in the settings page's
  // markup, so they have to run again whenever that markup is new. The client-
  // side router swaps content without a document load, which means boot()'s
  // whenReady() never fires a second time -- so reaching the settings page by
  // clicking rather than by a fresh load used to leave the language, theme and
  // text size lists permanently empty. The page's own module calls this on
  // every entry, routed or not.
  window.PanategwaRefreshSettingsUI = function () {
    if (typeof initTextSize === "function") runInit("text size", initTextSize);
    if (typeof initTheme === "function") runInit("color theme", initTheme);
    if (typeof initTranslate === "function") runInit("translation", initTranslate);
  };

  async function boot() {
    for (const src of MODULES) {
      await loadScript(src);
    }

    whenReady(() => {
      runInit("animation tier", initAnimTier);
      window.PanategwaRefreshSettingsUI();
    });
  }

  boot().catch(err => console.error("[Panategwa settings]", err));
})();
