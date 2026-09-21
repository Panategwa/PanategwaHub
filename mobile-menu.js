(function(){
  "use strict";

  // Navigation mode is shared with other Panategwa scripts through this key.
  var STORAGE_KEY = "panategwa_navigation_mode";
  var VALID_MODES = ["auto", "mobile", "desktop"];
  var MOBILE_BAR_ID = "panategwa-mobile-bar";
  var MOBILE_PANEL_ID = "panategwa-mobile-panel";
  var MOBILE_STYLE_ID = "panategwa-mobile-menu-styles";

  var topBar = null;
  var panel = null;
  var panelContent = null;
  var panelBody = null;
  var savedPadding = null;
  var resizeTimer = null;
  var initialized = false;

  // Detect both narrow viewports and touch-capable devices.
  function isMobileDevice() {
    var viewportMatches = typeof window.matchMedia === "function"
      && window.matchMedia("(max-width: 900px)").matches;
    return viewportMatches || (window.navigator.maxTouchPoints || 0) > 0;
  }

  // Invalid or unavailable preferences fall back to automatic detection.
  function effectiveMode() {
    var mode = null;
    try {
      mode = window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      mode = null;
    }
    return VALID_MODES.indexOf(mode) !== -1 ? mode : "auto";
  }

  function isMobileActive() {
    var mode = effectiveMode();
    return mode === "mobile" || (mode === "auto" && isMobileDevice());
  }

  function rememberPadding() {
    var pageContent = document.getElementById("page-content");
    if (!pageContent || savedPadding) return;

    savedPadding = {
      paddingLeft: pageContent.style.paddingLeft,
      paddingTop: pageContent.style.paddingTop
    };
  }

  function removePagePadding() {
    var pageContent = document.getElementById("page-content");
    if (!pageContent) return;

    // Keep the original inline values so desktop mode can restore them exactly.
    rememberPadding();
    pageContent.style.paddingLeft = "";
    pageContent.style.paddingTop = "";
  }

  function restorePagePadding() {
    var pageContent = document.getElementById("page-content");
    if (!pageContent || !savedPadding) return;

    pageContent.style.paddingLeft = savedPadding.paddingLeft;
    pageContent.style.paddingTop = savedPadding.paddingTop;
    savedPadding = null;
  }

  function ensureMobileStyles() {
    if (document.getElementById(MOBILE_STYLE_ID)) return;

    var style = document.createElement("style");
    style.id = MOBILE_STYLE_ID;
    style.textContent = [
      "#" + MOBILE_BAR_ID + " {",
      "  position: fixed;",
      "  top: 0;",
      "  left: 0;",
      "  right: 0;",
      "  z-index: 1500;",
      "  display: flex;",
      "  align-items: center;",
      "  gap: 8px;",
      "  box-sizing: border-box;",
      "  width: 100%;",
      "  min-height: 56px;",
      "  padding: 8px 12px;",
      "  background: color-mix(in srgb, var(--menu-bg, #111827) 94%, black 6%);",
      "  border-bottom: 1px solid rgba(148, 163, 184, 0.25);",
      "  backdrop-filter: blur(18px);",
      "  box-shadow: 0 8px 24px rgba(2, 6, 23, 0.18);",
      "}",
      ".panategwa-mobile-bar-button {",
      "  flex: 1 1 0;",
      "  min-width: 0;",
      "  min-height: 40px;",
      "  box-sizing: border-box;",
      "  border: 1px solid rgba(148, 163, 184, 0.3);",
      "  border-radius: 10px;",
      "  background: rgba(148, 163, 184, 0.1);",
      "  color: #f8fafc;",
      "  font: inherit;",
      "  font-weight: 700;",
      "  cursor: pointer;",
      "}",
      ".panategwa-mobile-bar-button:hover,",
      ".panategwa-mobile-bar-button:focus-visible {",
      "  background: rgba(148, 163, 184, 0.22);",
      "  outline: none;",
      "}",
      "#" + MOBILE_PANEL_ID + " {",
      "  position: fixed;",
      "  inset: 0;",
      "  z-index: 2000;",
      "  visibility: hidden;",
      "  pointer-events: none;",
      "}",
      ".panategwa-mobile-backdrop {",
      "  position: absolute;",
      "  inset: 0;",
      "  background: rgba(2, 6, 23, 0.58);",
      "  opacity: 0;",
      "  transition: opacity 180ms ease;",
      "}",
      ".panategwa-mobile-panel-content {",
      "  position: absolute;",
      "  top: 0;",
      "  left: 0;",
      "  width: 100%;",
      "  max-height: 100vh;",
      "  box-sizing: border-box;",
      "  overflow-y: auto;",
      "  padding: 64px 16px 24px;",
      "  background: var(--menu-bg, #111827);",
      "  color: #f8fafc;",
      "  box-shadow: 0 18px 36px rgba(2, 6, 23, 0.3);",
      "  transform: translateY(-100%);",
      "  transition: transform 220ms ease;",
      "}",
      "#" + MOBILE_PANEL_ID + ".is-open {",
      "  visibility: visible;",
      "  pointer-events: auto;",
      "}",
      "#" + MOBILE_PANEL_ID + ".is-open .panategwa-mobile-backdrop {",
      "  opacity: 1;",
      "}",
      "#" + MOBILE_PANEL_ID + ".is-open .panategwa-mobile-panel-content {",
      "  transform: translateY(0);",
      "}",
      ".panategwa-mobile-panel-header {",
      "  position: relative;",
      "  margin-bottom: 16px;",
      "}",
      ".panategwa-mobile-panel-title {",
      "  margin: 0;",
      "  font-size: 1.15rem;",
      "  font-weight: 700;",
      "}",
      ".panategwa-mobile-close {",
      "  position: absolute;",
      "  top: 8px;",
      "  right: 8px;",
      "  width: 40px;",
      "  height: 40px;",
      "  border: 1px solid rgba(148, 163, 184, 0.3);",
      "  border-radius: 10px;",
      "  background: rgba(148, 163, 184, 0.12);",
      "  color: #f8fafc;",
      "  font-size: 1.5rem;",
      "  line-height: 1;",
      "  cursor: pointer;",
      "}",
      ".panategwa-mobile-close:hover,",
      ".panategwa-mobile-close:focus-visible {",
      "  background: rgba(148, 163, 184, 0.25);",
      "  outline: none;",
      "}",
      ".panategwa-mobile-panel-section {",
      "  margin: 0 0 18px;",
      "}",
      ".panategwa-mobile-panel-heading {",
      "  margin: 0 0 8px;",
      "  color: rgba(226, 232, 240, 0.72);",
      "  font-size: 0.82rem;",
      "  font-weight: 700;",
      "  letter-spacing: 0.04em;",
      "  text-transform: uppercase;",
      "}",
      ".panategwa-mobile-page-list {",
      "  display: grid;",
      "  gap: 8px;",
      "  margin: 0;",
      "  padding: 0;",
      "  list-style: none;",
      "}",
      ".panategwa-mobile-page-button {",
      "  width: 100%;",
      "  min-height: 44px;",
      "  box-sizing: border-box;",
      "  border: 1px solid rgba(148, 163, 184, 0.25);",
      "  border-radius: 10px;",
      "  background: rgba(148, 163, 184, 0.09);",
      "  color: #f8fafc;",
      "  font: inherit;",
      "  text-align: left;",
      "  cursor: pointer;",
      "}",
      ".panategwa-mobile-page-button:hover,",
      ".panategwa-mobile-page-button:focus-visible {",
      "  background: rgba(148, 163, 184, 0.2);",
      "  outline: none;",
      "}"
    ].join("\n");

    var head = document.head || document.getElementsByTagName("head")[0];
    if (head) head.appendChild(style);
  }

  function ensureTopBar() {
    if (topBar && topBar.parentNode) return topBar;

    topBar = document.getElementById(MOBILE_BAR_ID);
    if (!topBar) {
      ensureMobileStyles();
      topBar = document.createElement("div");
      topBar.id = MOBILE_BAR_ID;
      topBar.setAttribute("role", "navigation");
      topBar.setAttribute("aria-label", "Mobile navigation");

      var musicButton = document.createElement("button");
      musicButton.type = "button";
      musicButton.className = "panategwa-mobile-bar-button";
      musicButton.textContent = "🎵 Music";
      musicButton.addEventListener("click", function () {
        openPanel("music");
      });

      var pagesButton = document.createElement("button");
      pagesButton.type = "button";
      pagesButton.className = "panategwa-mobile-bar-button";
      pagesButton.textContent = "📄 Pages";
      pagesButton.addEventListener("click", function () {
        openPanel("pages");
      });

      topBar.appendChild(musicButton);
      topBar.appendChild(pagesButton);
      document.body.appendChild(topBar);
    }

    topBar.style.display = "flex";
    return topBar;
  }

  function removeTopBar() {
    if (!topBar) return;
    if (topBar.parentNode) topBar.parentNode.removeChild(topBar);
    topBar = null;
  }

  function ensurePanel() {
    if (panel && panel.parentNode) return panel;

    panel = document.getElementById(MOBILE_PANEL_ID);
    if (!panel) {
      ensureMobileStyles();
      panel = document.createElement("div");
      panel.id = MOBILE_PANEL_ID;
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-modal", "true");
      panel.setAttribute("aria-hidden", "true");

      var backdrop = document.createElement("div");
      backdrop.className = "panategwa-mobile-backdrop";
      backdrop.addEventListener("click", closePanel);

      panelContent = document.createElement("div");
      panelContent.className = "panategwa-mobile-panel-content";
      panelContent.addEventListener("click", function (event) {
        event.stopPropagation();
      });

      var header = document.createElement("div");
      header.className = "panategwa-mobile-panel-header";

      var title = document.createElement("h2");
      title.className = "panategwa-mobile-panel-title";
      title.textContent = "Navigation";

      var closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "panategwa-mobile-close";
      closeButton.textContent = "×";
      closeButton.setAttribute("aria-label", "Close navigation panel");
      closeButton.addEventListener("click", closePanel);

      panelBody = document.createElement("div");
      panelBody.className = "panategwa-mobile-panel-body";

      header.appendChild(title);
      header.appendChild(closeButton);
      panelContent.appendChild(header);
      panelContent.appendChild(panelBody);
      panel.appendChild(backdrop);
      panel.appendChild(panelContent);
      document.body.appendChild(panel);
    } else {
      panelContent = panel.querySelector(".panategwa-mobile-panel-content");
      panelBody = panel.querySelector(".panategwa-mobile-panel-body");
    }

    return panel;
  }

  function clearPanelBody() {
    if (!panelBody) return;
    while (panelBody.firstChild) {
      panelBody.removeChild(panelBody.firstChild);
    }
  }

  function currentLanguage() {
    var hash = window.location.hash || "";
    if (hash.indexOf("#page=") === 0) {
      var hashQuery = hash.substring(6);
      var separatorIndex = hashQuery.indexOf("&");
      if (separatorIndex !== -1) {
        hashQuery = hashQuery.substring(separatorIndex + 1);
      } else {
        hashQuery = "";
      }
      var hashParams = new URLSearchParams(hashQuery);
      if (hashParams.get("lang")) return hashParams.get("lang");
    }

    return new URLSearchParams(window.location.search).get("lang") || "en";
  }

  function localizedUrl(url) {
    var language = currentLanguage();
    if (!language || language === "en") return url;
    return url + (url.indexOf("?") === -1 ? "?" : "&") + "lang=" + encodeURIComponent(language);
  }

  function addPanelSection(parent, heading, links) {
    var section = document.createElement("section");
    section.className = "panategwa-mobile-panel-section";

    var headingElement = document.createElement("h3");
    headingElement.className = "panategwa-mobile-panel-heading";
    headingElement.textContent = heading;
    section.appendChild(headingElement);

    var list = document.createElement("ul");
    list.className = "panategwa-mobile-page-list";

    links.forEach(function (link) {
      var item = document.createElement("li");
      var button = document.createElement("button");
      button.type = "button";
      button.className = "panategwa-mobile-page-button";
      button.textContent = link.label;
      button.addEventListener("click", function () {
        try {
          if (typeof window.PanategwaGoTo === "function") {
            window.PanategwaGoTo(link.url);
          } else {
            window.location.href = link.url;
          }
        } finally {
          closePanel();
        }
      });
      item.appendChild(button);
      list.appendChild(item);
    });

    section.appendChild(list);
    parent.appendChild(section);
  }

  function buildPagesPanel() {
    var mainPages = [
      { label: "Home", url: "index.html" },
      { label: "Panategwa", url: "panategwa-page.html" },
      { label: "Panategwa b", url: "panategwa-b-page.html" },
      { label: "Panategwa c", url: "panategwa-c-page.html" },
      { label: "Panategwa d", url: "panategwa-d-page.html" },
      { label: "Panategwa e", url: "panategwa-e-page.html" },
      { label: "Panategwa f", url: "panategwa-f-page.html" },
      { label: "Panategwa g", url: "panategwa-g-page.html" }
    ];
    var quickLinks = [
      { label: "Settings", url: "settings-page.html" },
      { label: "Account", url: "account-page.html" },
      { label: "Streak", url: "streak-page.html" }
    ];
    var worldPages = [
      { label: "D-Map", url: "panategwa-d-map-page.html" },
      { label: "D-Life", url: "panategwa-d-life-page.html" },
      { label: "D-Ideologies", url: "panategwa-d-ideologies-page.html" },
      { label: "Pitons", url: "pitons-page.html" },
      { label: "Tri-Panats", url: "tri-panategwaoi-anthropoi-civilis-page.html" },
      { label: "Empire of Pitosia", url: "empire-of-pitosia-page.html" },
      { label: "Thrinsachelom", url: "thrinsachelom-history-page.html" },
      { label: "Dendrospheres", url: "dendrospheres-page.html" },
      { label: "Bathythalassas", url: "bathythalassas-gigaperipatitis-page.html" }
    ];

    addPanelSection(panelBody, "Pages", mainPages.map(function (link) {
      return { label: link.label, url: localizedUrl(link.url) };
    }));
    addPanelSection(panelBody, "Quick links", quickLinks.map(function (link) {
      return { label: link.label, url: localizedUrl(link.url) };
    }));
    addPanelSection(panelBody, "World pages", worldPages.map(function (link) {
      return { label: link.label, url: localizedUrl(link.url) };
    }));
  }

  function openPanel(kind) {
    if (!isMobileActive()) return;
    if (!ensurePanel()) return;

    clearPanelBody();
    var title = panelContent.querySelector(".panategwa-mobile-panel-title");
    if (kind === "music") {
      title.textContent = "Music";
      var musicSlot = document.getElementById("menu-music-slot");
      if (musicSlot) panelBody.innerHTML = musicSlot.innerHTML;
    } else {
      title.textContent = "Pages";
      buildPagesPanel();
    }

    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    panelContent.scrollTop = 0;
  }

  function closePanel() {
    if (!panel) return;
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
  }

  function applyMode() {
    var mobileActive = isMobileActive();
    var sidebar = document.getElementById("menu-container");

    if (mobileActive) {
      // Mobile mode replaces the sidebar offset with the compact top bar.
      if (sidebar) sidebar.style.display = "none";
      removePagePadding();
      if (document.body) ensureTopBar();
      closePanel();
      return;
    }

    // Desktop mode restores the normal sidebar layout and removes mobile UI.
    if (sidebar) sidebar.style.display = "";
    restorePagePadding();
    removeTopBar();
    closePanel();
  }

  function onStorage(event) {
    if (event.key !== STORAGE_KEY) return;
    applyMode();
  }

  function onResize() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      resizeTimer = null;
      applyMode();
    }, 150);
  }

  function init() {
    if (initialized) return;
    initialized = true;

    window.addEventListener("panategwa:routechange", closePanel);
    window.addEventListener("storage", onStorage);
    window.addEventListener("resize", onResize);

    applyMode();

    // Let other deferred DOMContentLoaded handlers finish before measuring
    // and positioning the mobile UI for the first time.
    window.setTimeout(applyMode, 0);
  }

  window.PanategwaSetNavigationMode = function (mode) {
    if (VALID_MODES.indexOf(mode) === -1) return;

    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch (error) {
      // The in-memory mode still applies when storage is unavailable.
    }
    applyMode();
  };

  window.PanategwaGetNavigationMode = function () {
    return effectiveMode();
  };

  window.PanategwaIsMobileActive = function () {
    return isMobileActive();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
