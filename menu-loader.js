(function () {
  "use strict";

  // ============================================================
  // PAGE-SPECIFIC MODULE MAP
  // ============================================================
  // Map page filenames to their required module scripts.
  // The menu-loader handles loading these dynamically on initial
  // page load and on SPA route changes. New pages only need an
  // entry here (and in router.js PAGES array).
  var PAGE_MODULES = {
    "account-page.html": [
      { src: "auth/account.js", type: "module" },
      { src: "auth/settings.js", type: "module" }
    ],
    "settings-page.html": [
      { src: "settings/audio-settings.js", type: "module" }
    ],
    "streak-page.html": [
      { src: "auth/streak.js", type: "module" }
    ]
  };

  // ============================================================
  // SCRIPT LOADING HELPERS
  // ============================================================

  function scriptAlreadyLoaded(src) {
    return Array.prototype.some.call(
      document.querySelectorAll("script"),
      function (script) {
        return script.getAttribute("src") === src;
      }
    );
  }

  function ensureScript(src, type) {
    if (scriptAlreadyLoaded(src)) return;
    var script = document.createElement("script");
    if (type === "module") {
      script.type = "module";
    }
    script.src = src;
    document.head.appendChild(script);
  }

  // === Shared modules (loaded on every page) ===

  function ensureSharedAchievements() {
    if (scriptAlreadyLoaded("auth/achievements.js")) return;
    var script = document.createElement("script");
    script.type = "module";
    script.src = "auth/achievements.js";
    script.dataset.panategwaAchievements = "true";
    document.head.appendChild(script);
  }

  function ensureSharedSocial() {
    if (scriptAlreadyLoaded("auth/social.js")) return;
    var script = document.createElement("script");
    script.type = "module";
    script.src = "auth/social.js";
    script.dataset.panategwaSocial = "true";
    document.head.appendChild(script);
  }

  function ensureSharedMusic() {
    if (scriptAlreadyLoaded("music/system/music-system.js")) return;
    var script = document.createElement("script");
    script.type = "module";
    script.src = "music/system/music-system.js";
    script.dataset.panategwaMusic = "true";
    document.head.appendChild(script);
  }

  // === Settings bootstrap (loaded on every page) ===

  function ensureSettingsBootstrap() {
    if (scriptAlreadyLoaded("settings/settings.js")) return;
    var script = document.createElement("script");
    script.src = "settings/settings.js";
    script.dataset.panategwaSettingsBootstrap = "true";
    document.head.appendChild(script);
  }

  // === Page-specific module loading ===

  function getCurrentPageName() {
    var path = window.location.pathname || "";
    var segments = path.split("/");
    var last = segments[segments.length - 1];
    if (!last || last.indexOf(".") === -1) return "index.html";
    return last;
  }

  function loadPageModules(page) {
    var modules = PAGE_MODULES[page] || [];
    for (var i = 0; i < modules.length; i++) {
      ensureScript(modules[i].src, modules[i].type);
    }
  }

  function initPageModules() {
    loadPageModules(getCurrentPageName());
  }

  // Load page-specific modules when the router navigates (SPA).
  window.addEventListener("panategwa:routechange", function (event) {
    var detail = (event && event.detail) || {};
    var page = String(detail.page || "");
    if (page) {
      loadPageModules(page);
    }
  });

  // ============================================================
  // MENU ICONS & UTILITIES (existing, preserved)
  // ============================================================

  function defaultAvatarIcon() {
    return `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.8"></circle>
        <path fill="currentColor" d="M12 12.2a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5z"/>
      </svg>
    `;
  }

  function currentUid() {
    try {
      return String(localStorage.getItem("ptg_current_uid") || "").trim();
    } catch {
      return "";
    }
  }

  function siteTimeStorageKey(uid) {
    return `ptg_site_time_live_${String(uid || "").trim()}`;
  }

  function normalizeSiteTimeMs(value) {
    var ms = Number(value || 0);
    return Number.isFinite(ms) && ms > 0 ? Math.floor(ms) : 0;
  }

  function formatMenuSiteTime(value) {
    var totalSeconds = Math.floor(normalizeSiteTimeMs(value) / 1000);
    var totalMinutes = Math.floor(totalSeconds / 60);
    var MINUTES_PER_HOUR = 60;
    var MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
    var MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;
    var MINUTES_PER_MONTH = 30 * MINUTES_PER_DAY;
    var MINUTES_PER_YEAR = 365 * MINUTES_PER_DAY;

    var remaining = totalMinutes;
    var years = Math.floor(remaining / MINUTES_PER_YEAR);
    remaining -= years * MINUTES_PER_YEAR;
    var months = Math.floor(remaining / MINUTES_PER_MONTH);
    remaining -= months * MINUTES_PER_MONTH;
    var weeks = Math.floor(remaining / MINUTES_PER_WEEK);
    remaining -= weeks * MINUTES_PER_WEEK;
    var days = Math.floor(remaining / MINUTES_PER_DAY);
    remaining -= days * MINUTES_PER_DAY;
    var hours = Math.floor(remaining / MINUTES_PER_HOUR);
    remaining -= hours * MINUTES_PER_HOUR;
    var minutes = remaining;
    var seconds = Math.max(0, totalSeconds - (totalMinutes * 60));

    var parts = [];
    if (years) parts.push(`${years}y`);
    if (months) parts.push(`${months}mo`);
    if (weeks) parts.push(`${weeks}w`);
    if (days) parts.push(`${days}d`);
    if (hours || parts.length) parts.push(`${hours}h`);
    if (minutes || parts.length) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);
    return parts.join(" ");
  }

  function renderMenuSiteTime() {
    var el = document.getElementById("menu-site-time");
    if (!el) return;

    var uid = currentUid();
    if (!uid) {
      el.textContent = "On the site for: --";
      return;
    }

    var siteTimeMs = 0;
    try {
      siteTimeMs = normalizeSiteTimeMs(localStorage.getItem(siteTimeStorageKey(uid)));
    } catch {}

    el.textContent = `On the site for: ${formatMenuSiteTime(siteTimeMs)}`;
  }

  function socialUnreadCount(uid) {
    if (!uid) return 0;
    try {
      return Math.max(0, parseInt(localStorage.getItem(`ptg_social_unread_count_${uid}`) || "0", 10) || 0);
    } catch {
      return 0;
    }
  }

  function localUnreadCount(uid) {
    if (!uid) return 0;
    try {
      var raw = JSON.parse(localStorage.getItem(`ptg_notifications_${uid}`) || "[]");
      if (!Array.isArray(raw)) return 0;
      return raw.filter(function (entry) { return !entry?.read; }).length;
    } catch {
      return 0;
    }
  }

  function iconMarkup(type) {
    if (type === "settings") {
      return `
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path fill="currentColor" d="m19.14 12.94.04-.94-.04-.94 2.03-1.58a.6.6 0 0 0 .15-.77l-1.92-3.32a.6.6 0 0 0-.73-.27l-2.39.96a7.4 7.4 0 0 0-1.63-.94l-.36-2.53a.6.6 0 0 0-.59-.5h-3.84a.6.6 0 0 0-.59.5l-.36 2.53c-.57.22-1.11.53-1.63.94l-2.39-.96a.6.6 0 0 0-.73.27L2.68 8.71a.6.6 0 0 0 .15.77l2.03 1.58-.04.94.04.94-2.03 1.58a.6.6 0 0 0-.15.77l1.92 3.32a.6.6 0 0 0 .73.27l2.39-.96c.51.41 1.06.72 1.63.94l.36 2.53a.6.6 0 0 0 .59.5h3.84a.6.6 0 0 0 .59-.5l.36-2.53c.57-.22 1.12-.53 1.63-.94l2.39.96a.6.6 0 0 0 .73-.27l1.92-3.32a.6.6 0 0 0-.15-.77zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5"/>
        </svg>
      `;
    }

    if (type === "streak") {
      return `
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path fill="currentColor" d="M12.1 2.5c.26 2.2-.78 3.54-1.7 4.72-.99 1.27-1.85 2.37-1.1 4.21.28.69.75 1.23 1.33 1.67-.14-1.44.47-2.47 1.15-3.62.8-1.36 1.7-2.9 1.34-5.48 2.7 1.9 4.28 4.79 4.28 7.75 0 4.49-3.46 8.25-8.25 8.25-3.77 0-6.65-2.83-6.65-6.39 0-2.96 1.86-5.57 4.54-7.08-.47 2.23.18 3.37.89 4.59.51.88 1.08 1.87 1.02 3.12 1.36-.82 2.41-2.17 2.41-4 0-1.31-.6-2.45-1.08-3.35-.54-1.02-.94-1.78-.18-2.91z"/>
        </svg>
      `;
    }

    if (type === "top") {
      return `
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path fill="currentColor" d="M12 5.5 5.5 12l1.4 1.4 4.1-4.09V20h2V9.31l4.1 4.09 1.4-1.4z"/>
        </svg>
      `;
    }

    return "";
  }

  function renderSidebarAvatar() {
    var btn = document.getElementById("menu-account-button");
    if (!btn) return;

    var loggedIn = localStorage.getItem("ptg_logged_in") === "1";
    var url = localStorage.getItem("panategwa_sidebar_avatar_url") || "";
    var uid = currentUid();
    var unread = loggedIn ? (socialUnreadCount(uid) + localUnreadCount(uid)) : 0;
    var content = loggedIn && url
      ? `<img src="${url}" alt="Account" style="width:22px;height:22px;border-radius:50%;object-fit:cover;display:block;" />`
      : defaultAvatarIcon();

    btn.innerHTML = `
      <span class="menu-account-shell ${unread > 0 ? "has-unread" : ""}">
        ${content}
        ${unread > 0 ? `<span class="menu-account-dot" aria-hidden="true"></span>` : ""}
      </span>
    `;
  }

  window.PanategwaUpdateSidebarAvatar = function (avatarUrl) {
    localStorage.setItem("panategwa_sidebar_avatar_url", avatarUrl || "");
    renderSidebarAvatar();
  };

  window.PanategwaUpdateSidebarUnread = function () {
    renderSidebarAvatar();
  };

  window.PanategwaGoTo = function (href) {
    if (!href) return;
    if (typeof window.PanategwaNavigate === "function" && window.PanategwaRouter && window.PanategwaRouter.isInternalHref) {
      var page = window.PanategwaRouter.isInternalHref(href);
      if (page) {
        var params = {};
        var qIndex = href.indexOf("?");
        if (qIndex !== -1) {
          var qs = href.substring(qIndex + 1);
          var pairs = qs.split("&");
          for (var i = 0; i < pairs.length; i++) {
            var pair = pairs[i].split("=");
            if (pair[0]) params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || "");
          }
        }
        window.PanategwaNavigate(page, params);
        return;
      }
    }
    window.location.href = href;
  };

  // ============================================================
  // MENU BUILDING
  // ============================================================

  function buildMenu() {
    var menuContainer = document.getElementById("menu-container");
    if (!menuContainer) return;

    var pages = [
      { name: "Home", url: "index.html" },
      { name: "Panategwa", url: "panategwa-page.html" },
      { name: "Panategwa b", url: "panategwa-b-page.html" },
      { name: "Panategwa c", url: "panategwa-c-page.html" },
      { name: "Panategwa d", url: "panategwa-d-page.html" },
      { name: "Panategwa e", url: "panategwa-e-page.html" },
      { name: "Panategwa f", url: "panategwa-f-page.html" },
      { name: "Panategwa g", url: "panategwa-g-page.html" }
    ];

    var current = window.location.pathname.split("/").pop() || "index.html";
    var urlParams = (function () {
      if (window.PanategwaRouter && window.PanategwaRouter.getCurrentPage) {
        var hash = window.location.hash;
        if (hash && hash.indexOf("#page=") === 0) {
          var rest = hash.substring(6);
          var amp = rest.indexOf("&");
          var qs = amp !== -1 ? rest.substring(amp + 1) : "";
          return new URLSearchParams(qs);
        }
      }
      return new URLSearchParams(window.location.search);
    })();
    var currentLang = urlParams.get("lang") || "en";

    function buildUrl(page) {
      var url = page;
      if (currentLang !== "en") url += "?lang=" + currentLang;
      return url;
    }

    var isSettings = current === "settings-page.html";
    var isAccount = current === "account-page.html";

    var menuHTML = `<div class="menu-inner">`;

    menuHTML += `
      <div class="line">
        <div class="menu-main-title">The Panategwa Hub</div>
        <div class="menu-sub-title">0.0.3 - Alpha, Internal testing</div>
        <div class="menu-site-time" id="menu-site-time">On the site for: --</div>
      </div>
    `;

    menuHTML += `<div id="menu-music-slot"></div>`;

    menuHTML += `
      <div class="line icons">
        <button class="menu-icon-button ${isSettings ? "active-icon" : ""}"
          ${isSettings ? "disabled" : ""}
          onclick="window.PanategwaGoTo('${buildUrl("settings-page.html")}')"
          title="Site settings">
          ${iconMarkup("settings")}
        </button>

        <button class="menu-icon-button"
          onclick="window.PanategwaGoTo('${buildUrl("account-page.html")}')"
          title="Account">
          <span id="menu-account-button"
            class="${isAccount ? "active-icon" : ""}"
            style="display:inline-flex; align-items:center; justify-content:center;"></span>
        </button>

        <button class="menu-icon-button"
          onclick="window.PanategwaGoTo('${buildUrl("streak-page.html")}')"
          title="Streak">
          ${iconMarkup("streak")}
        </button>

        <button class="menu-icon-button"
          onclick="window.scrollTo({top:0, behavior:'smooth'})"
          title="Top">
          ${iconMarkup("top")}
        </button>
      </div>
    `;

    pages.forEach(function (page) {
      var isActive = page.url === current;
      var url = buildUrl(page.url);

      menuHTML += `
        <button class="menu-button ${isActive ? "active" : ""}"
          ${isActive ? "disabled" : ""}
          onclick="window.PanategwaGoTo('${url}')">
          ${page.name}
        </button>
      `;
    });

    menuHTML += `<div id="resize-handle"></div>`;
    menuHTML += `</div>`;

    menuContainer.innerHTML = menuHTML;
    renderSidebarAvatar();
    renderMenuSiteTime();
    window.addEventListener("panategwa:notifications-changed", renderSidebarAvatar);
    window.addEventListener("panategwa:sitetimechange", function (event) {
      var detail = event?.detail || {};
      var uid = String(detail.uid || "").trim();
      if (!uid) return;

      try {
        localStorage.setItem(siteTimeStorageKey(uid), String(normalizeSiteTimeMs(detail.siteTimeMs)));
      } catch {}

      renderMenuSiteTime();
    });
    window.addEventListener("storage", function (event) {
      if (!event.key) return;
      if (event.key === "ptg_logged_in"
        || event.key === "ptg_current_uid"
        || event.key === "panategwa_sidebar_avatar_url"
        || event.key.startsWith("ptg_social_unread_count_")
        || event.key.startsWith("ptg_notifications_")) {
        renderSidebarAvatar();
      }
      if (event.key === "ptg_current_uid" || event.key.startsWith("ptg_site_time_live_")) {
        renderMenuSiteTime();
      }
    });

    var wrapper = document.createElement("div");
    wrapper.id = "page-content";

    var elements = Array.prototype.slice.call(document.body.children);
    elements.forEach(function (el) {
      if (el !== menuContainer) wrapper.appendChild(el);
    });

    document.body.appendChild(wrapper);

    var handle = document.getElementById("resize-handle");
    var isResizing = false;

    var MIN_WIDTH = 315;
    var MAX_WIDTH = 500;
    var DEFAULT_WIDTH = 350;

    var savedWidth = localStorage.getItem("menuWidth");

    if (savedWidth) {
      savedWidth = parseInt(savedWidth, 10);
      menuContainer.style.width = `${savedWidth}px`;
      wrapper.style.paddingLeft = `${savedWidth}px`;
    } else {
      wrapper.style.paddingLeft = `${DEFAULT_WIDTH}px`;
    }

    handle.addEventListener("mousedown", function () {
      isResizing = true;
      document.body.style.userSelect = "none";
    });

    document.addEventListener("mousemove", function (event) {
      if (!isResizing) return;

      var newWidth = event.clientX;
      if (newWidth < MIN_WIDTH) newWidth = MIN_WIDTH;
      if (newWidth > MAX_WIDTH) newWidth = MAX_WIDTH;

      menuContainer.style.width = `${newWidth}px`;
      wrapper.style.paddingLeft = `${newWidth}px`;
    });

    document.addEventListener("mouseup", function () {
      if (!isResizing) return;
      isResizing = false;
      document.body.style.userSelect = "auto";
      localStorage.setItem("menuWidth", String(menuContainer.offsetWidth));
    });

    handle.addEventListener("dblclick", function () {
      menuContainer.style.width = `${DEFAULT_WIDTH}px`;
      wrapper.style.paddingLeft = `${DEFAULT_WIDTH}px`;
      localStorage.setItem("menuWidth", String(DEFAULT_WIDTH));
    });
  }

  // ============================================================
  // INITIALIZATION
  // ============================================================

  // Load shared modules immediately (on script evaluation).
  ensureSharedAchievements();
  ensureSharedSocial();
  ensureSharedMusic();
  ensureSettingsBootstrap();

  // On DOMContentLoaded: build menu and load page-specific modules.
  document.addEventListener("DOMContentLoaded", function () {
    // Re-ensure shared modules (in case the script loaded before DOM was ready).
    ensureSharedAchievements();
    ensureSharedSocial();
    ensureSharedMusic();
    ensureSettingsBootstrap();

    // Load modules for the current page.
    initPageModules();

    // Build the sidebar menu and wrapper.
    buildMenu();
  });

  // Expose helpers for debugging and external use.
  window.PanategwaMenuLoader = {
    loadPageModules: loadPageModules,
    getCurrentPageName: getCurrentPageName,
    PAGE_MODULES: PAGE_MODULES
  };
})();
