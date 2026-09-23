(function () {
  "use strict";

  // ========================================================
  // Navigation helper (replaces router.js SPA navigation)
  // ========================================================
  // With normal multi-page navigation, PanategwaGoTo simply
  // sets window.location.href. This keeps existing onclick
  // handlers in the sidebar working.
  window.PanategwaGoTo = function (href) {
    if (!href) return;
    window.location.href = href;
  };

  // ========================================================
  // Active link highlighting
  // ========================================================
  function highlightActiveLink() {
    var currentPage = window.location.pathname.split("/").pop() || "index.html";
    var buttons = document.querySelectorAll(".menu-button");
    buttons.forEach(function (btn) {
      var target = btn.getAttribute("data-target-page") || "";
      btn.classList.toggle("active", target === currentPage);
    });

    var iconButtons = document.querySelectorAll(".menu-icon-button");
    iconButtons.forEach(function (btn) {
      var target = btn.getAttribute("data-target-page") || "";
      btn.classList.toggle("active-icon", target === currentPage);
    });
  }

  // ========================================================
  // Avatar rendering
  // ========================================================
  function defaultAvatarIcon() {
    return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.8"></circle>' +
      '<path fill="currentColor" d="M12 12.2a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5z"/>' +
      "</svg>";
  }

  function currentUid() {
    try {
      return String(localStorage.getItem("ptg_current_uid") || "").trim();
    } catch (e) {
      return "";
    }
  }

  function socialUnreadCount(uid) {
    if (!uid) return 0;
    try {
      return Math.max(0, parseInt(localStorage.getItem("ptg_social_unread_count_" + uid) || "0", 10) || 0);
    } catch (e) {
      return 0;
    }
  }

  function localUnreadCount(uid) {
    if (!uid) return 0;
    try {
      var raw = JSON.parse(localStorage.getItem("ptg_notifications_" + uid) || "[]");
      if (!Array.isArray(raw)) return 0;
      return raw.filter(function (entry) { return entry && !entry.read; }).length;
    } catch (e) {
      return 0;
    }
  }

  function renderSidebarAvatar() {
    var btn = document.getElementById("menu-account-button");
    if (!btn) return;

    var loggedIn = localStorage.getItem("ptg_logged_in") === "1";
    var url = localStorage.getItem("panategwa_sidebar_avatar_url") || "";
    var uid = currentUid();
    var unread = loggedIn ? (socialUnreadCount(uid) + localUnreadCount(uid)) : 0;
    var content = loggedIn && url
      ? '<img src="' + url + '" alt="Account" style="width:22px;height:22px;border-radius:50%;object-fit:cover;display:block;" />'
      : defaultAvatarIcon();

    var shellClass = unread > 0 ? "menu-account-shell has-unread" : "menu-account-shell";
    var dot = unread > 0 ? '<span class="menu-account-dot" aria-hidden="true"></span>' : "";

    btn.innerHTML = '<span class="' + shellClass + '">' + content + dot + "</span>";
  }

  // ========================================================
  // Site time rendering
  // ========================================================
  function siteTimeStorageKey(uid) {
    return "ptg_site_time_live_" + String(uid || "").trim();
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
    if (years) parts.push(years + "y");
    if (months) parts.push(months + "mo");
    if (weeks) parts.push(weeks + "w");
    if (days) parts.push(days + "d");
    if (hours || parts.length) parts.push(hours + "h");
    if (minutes || parts.length) parts.push(minutes + "m");
    parts.push(seconds + "s");
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
    } catch (e) {}

    el.textContent = "On the site for: " + formatMenuSiteTime(siteTimeMs);
  }

  // ========================================================
  // Sidebar resize handle
  // ========================================================
  function initResizeHandle() {
    var menuContainer = document.getElementById("menu-container");
    if (!menuContainer) return;

    var handle = document.getElementById("resize-handle");
    if (!handle) return;

    var MIN_WIDTH = 315;
    var MAX_WIDTH = 500;
    var DEFAULT_WIDTH = 350;
    var isResizing = false;

    var savedWidth = localStorage.getItem("menuWidth");
    if (savedWidth) {
      savedWidth = parseInt(savedWidth, 10);
      menuContainer.style.width = savedWidth + "px";
      if (menuContainer.style.width == savedWidth + "px") {
        document.body.style.paddingLeft = savedWidth + "px";
      }
    } else {
      document.body.style.paddingLeft = DEFAULT_WIDTH + "px";
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
      menuContainer.style.width = newWidth + "px";
      document.body.style.paddingLeft = newWidth + "px";
    });

    document.addEventListener("mouseup", function () {
      if (!isResizing) return;
      isResizing = false;
      document.body.style.userSelect = "auto";
      localStorage.setItem("menuWidth", String(menuContainer.offsetWidth));
    });

    handle.addEventListener("dblclick", function () {
      menuContainer.style.width = DEFAULT_WIDTH + "px";
      document.body.style.paddingLeft = DEFAULT_WIDTH + "px";
      localStorage.setItem("menuWidth", String(DEFAULT_WIDTH));
    });
  }

  // ========================================================
  // Initialization
  // ========================================================
  function init() {
    highlightActiveLink();
    renderSidebarAvatar();
    renderMenuSiteTime();
    initResizeHandle();

    // Update avatar and site time when storage changes from other tabs.
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

    // Re-render on navigation (for SPA-like modules that dispatch events).
    window.addEventListener("panategwa:avatar-update", renderSidebarAvatar);
    window.addEventListener("panategwa:unread-update", renderSidebarAvatar);
    window.addEventListener("panategwa:sitetimechange", renderMenuSiteTime);
  }

  window.PanategwaUpdateSidebarAvatar = function (avatarUrl) {
    try {
      localStorage.setItem("panategwa_sidebar_avatar_url", avatarUrl || "");
    } catch (e) {}
    renderSidebarAvatar();
  };

  window.PanategwaUpdateSidebarUnread = function () {
    renderSidebarAvatar();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
