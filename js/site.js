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
  // These two key names are duplicated in auth.js (siteTimeLiveStorageKey /
  // siteTimePendingStorageKey), which is what auth/achievements.js reads and
  // writes. The copy here is deliberate: the sidebar is loaded on every page
  // and must stay free of imports, so if you change a key, change it there too.
  function siteTimeStorageKey(uid) {
    return "ptg_site_time_live_" + String(uid || "").trim();
  }

  function siteTimePendingStorageKey(uid) {
    return "ptg_site_time_pending_" + String(uid || "").trim();
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

  var liveSiteTimeMs = 0;
  var liveSiteTimeUid = "";

  function setLiveSiteTime(value) {
    var next = normalizeSiteTimeMs(value);
    if (next >= liveSiteTimeMs) liveSiteTimeMs = next;
    return liveSiteTimeMs;
  }

  function readStoredSiteTimeMs(uid) {
    var stored = 0;
    try {
      stored = normalizeSiteTimeMs(localStorage.getItem(siteTimeStorageKey(uid)));
    } catch (e) {}

    var pending = 0;
    try {
      pending = normalizeSiteTimeMs(sessionStorage.getItem(siteTimePendingStorageKey(uid)));
    } catch (e) {}

    return Math.max(stored, pending);
  }

  function renderMenuSiteTime() {
    var el = document.getElementById("menu-site-time");
    if (!el) return;

    var uid = currentUid();
    if (!uid) {
      liveSiteTimeUid = "";
      liveSiteTimeMs = 0;
      el.textContent = "On the site for: --";
      return;
    }

    // The cached value only ever climbs, so it has to be dropped when the
    // signed-in account changes. Otherwise signing out of one account and into
    // another without a reload keeps showing the first account's total until
    // the new one happens to exceed it.
    if (uid !== liveSiteTimeUid) {
      liveSiteTimeUid = uid;
      liveSiteTimeMs = 0;
    }

    var siteTimeMs = setLiveSiteTime(readStoredSiteTimeMs(uid));
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

    var MIN_WIDTH = 220;
    var MAX_WIDTH = 500;
    var DEFAULT_WIDTH = 280;
    var isResizing = false;
    var dragStartX = 0;
    var dragStartWidth = 0;
    var frameId = 0;
    var pendingWidth = 0;

    function clampWidth(value) {
      return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(value)));
    }

    function paintWidth(value) {
      pendingWidth = clampWidth(value);
      if (frameId) return;
      frameId = window.requestAnimationFrame(function () {
        frameId = 0;
        menuContainer.style.width = pendingWidth + "px";
        document.body.style.paddingLeft = pendingWidth + "px";
        handle.setAttribute("aria-valuenow", String(pendingWidth));
      });
    }

    function saveWidth(value) {
      try {
        localStorage.setItem("menuWidth", String(clampWidth(
          Number.isFinite(value) ? value : menuContainer.offsetWidth
        )));
      } catch (e) {}
    }

    // Guarded like every other storage access in this file. When site data is
    // blocked, a SecurityError here used to propagate out of init() before the
    // four listeners below were attached, leaving the sidebar with no resize
    // handle, no site-time clock and no avatar updates at all.
    var savedWidth = null;
    try {
      savedWidth = localStorage.getItem("menuWidth");
    } catch (e) {}
    var initialWidth = DEFAULT_WIDTH;
    if (savedWidth) {
      savedWidth = parseInt(savedWidth, 10);
      if (Number.isFinite(savedWidth) && savedWidth >= MIN_WIDTH && savedWidth <= MAX_WIDTH) {
        initialWidth = savedWidth;
      }
    }
    // menu.css declares #menu-container at width: 280px with a
    // `transition: width`, so applying the saved width here used to animate
    // 280px -> saved width on every single page load. The transition is muted
    // for this one write and restored on the next frame, so the sidebar simply
    // appears at the right size. Dragging still animates as before, because
    // that is a real width change rather than a first paint.
    menuContainer.style.transition = "none";
    menuContainer.style.width = initialWidth + "px";
    document.body.style.paddingLeft = initialWidth + "px";
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        menuContainer.style.transition = "";
      });
    });
    handle.setAttribute("aria-valuemin", String(MIN_WIDTH));
    handle.setAttribute("aria-valuemax", String(MAX_WIDTH));
    handle.setAttribute("aria-valuenow", String(initialWidth));

    handle.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) return;
      isResizing = true;
      dragStartX = event.clientX;
      dragStartWidth = menuContainer.offsetWidth;
      handle.classList.add("is-active");
      // Suppress CSS transitions while dragging so the sidebar tracks the
      // pointer exactly instead of easing behind it.
      menuContainer.classList.add("is-resizing");
      document.body.classList.add("is-resizing");
      document.body.style.userSelect = "none";
      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    handle.addEventListener("pointermove", function (event) {
      if (!isResizing) return;
      paintWidth(dragStartWidth + event.clientX - dragStartX);
    });

    function finishResize(event) {
      if (!isResizing) return;
      isResizing = false;
      handle.classList.remove("is-active");
      menuContainer.classList.remove("is-resizing");
      document.body.classList.remove("is-resizing");
      document.body.style.userSelect = "";
      if (event.pointerId != null && handle.hasPointerCapture(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }
      saveWidth(pendingWidth || menuContainer.offsetWidth);
    }

    handle.addEventListener("pointerup", finishResize);
    handle.addEventListener("pointercancel", finishResize);

    // No wheel handler: scrolling over the handle used to change the width,
    // which made the sidebar jump whenever the cursor happened to cross it
    // during ordinary page scrolling. Drag, arrow keys, or double-click.

    handle.addEventListener("keydown", function (event) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      var direction = event.key === "ArrowRight" ? 1 : -1;
      paintWidth(menuContainer.offsetWidth + direction * 12);
      saveWidth(pendingWidth);
      event.preventDefault();
    });

    handle.addEventListener("dblclick", function () {
      paintWidth(DEFAULT_WIDTH);
      saveWidth(pendingWidth);
    });
  }

  // ========================================================
  // Initialization
  // ========================================================
  function init() {
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
      if (event.key === "ptg_current_uid"
        || event.key.startsWith("ptg_site_time_live_")
        || event.key.startsWith("ptg_site_time_pending_")) {
        renderMenuSiteTime();
      }
    });

    window.addEventListener("panategwa:sitetimechange", function (event) {
      var uid = currentUid();
      if (!uid) {
        renderMenuSiteTime();
        return;
      }

      var detail = event && event.detail ? event.detail : {};
      if (detail.uid && detail.uid === uid && Number(detail.siteTimeMs) > 0) {
        setLiveSiteTime(detail.siteTimeMs);
        try {
          localStorage.setItem(siteTimeStorageKey(uid), String(detail.siteTimeMs));
        } catch (e) {}
      }

      renderMenuSiteTime();
    });

    window.addEventListener("panategwa:avatar-update", renderSidebarAvatar);
    window.addEventListener("panategwa:unread-update", renderSidebarAvatar);
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
