(function () {
  "use strict";

  // ========================================================
  // Sidebar menu — single source of truth
  // ========================================================
  // Every page includes this file with <script src="js/menu.js" defer></script>
  // and nothing more than an empty <div id="menu-container"></div>. The markup
  // below is rendered into that container, so adding or removing a page only
  // ever means editing PAGES here.
  //
  // URLs are repo-relative. They are resolved against the current page's depth
  // at runtime, so the same menu works from the root and from the
  // main-pages/<body>/ folders.
  var PAGES = [
    { name: "Home", url: "main-pages/home/home-page.html" },
    { name: "Panategwa", url: "main-pages/panategwa/panategwa-page.html" },
    { name: "Panategwa b", url: "main-pages/panategwa-b/panategwa-b-page.html" },
    { name: "Panategwa c", url: "main-pages/panategwa-c/panategwa-c-page.html" },
    { name: "Panategwa d", url: "main-pages/panategwa-d/panategwa-d-page.html" },
    { name: "Panategwa e", url: "main-pages/panategwa-e/panategwa-e-page.html" },
    { name: "Panategwa f", url: "main-pages/panategwa-f/panategwa-f-page.html" },
    { name: "Panategwa g", url: "main-pages/panategwa-g/panategwa-g-page.html" }
  ];

  var SETTINGS_ICON =
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
    '<path fill="currentColor" d="m19.14 12.94.04-.94-.04-.94 2.03-1.58a.6.6 0 0 0 .15-.77l-1.92-3.32a.6.6 0 0 0-.73-.27l-2.39.96a7.4 7.4 0 0 0-1.63-.94l-.36-2.53a.6.6 0 0 0-.59-.5h-3.84a.6.6 0 0 0-.59.5l-.36 2.53c-.57.22-1.11.53-1.63.94l-2.39-.96a.6.6 0 0 0-.73.27L2.68 8.71a.6.6 0 0 0 .15.77l2.03 1.58-.04.94.04.94-2.03 1.58a.6.6 0 0 0-.15.77l1.92 3.32a.6.6 0 0 0 .73.27l2.39-.96c.51.41 1.06.72 1.63.94l.36 2.53a.6.6 0 0 0 .59.5h3.84a.6.6 0 0 0 .59-.5l.36-2.53c.57-.22 1.12-.53 1.63-.94l2.39.96a.6.6 0 0 0 .73-.27l1.92-3.32a.6.6 0 0 0-.15-.77zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5"/>' +
    "</svg>";

  var STREAK_ICON =
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
    '<path fill="currentColor" d="M12.1 2.5c.26 2.2-.78 3.54-1.7 4.72-.99 1.27-1.85 2.37-1.1 4.21.28.69.75 1.23 1.33 1.67-.14-1.44.47-2.47 1.15-3.62.8-1.36 1.7-2.9 1.34-5.48 2.7 1.9 4.28 4.79 4.28 7.75 0 4.49-3.46 8.25-8.25 8.25-3.77 0-6.65-2.83-6.65-6.39 0-2.96 1.86-5.57 4.54-7.08-.47 2.23.18 3.37.89 4.59.51.88 1.08 1.87 1.02 3.12 1.36-.82 2.41-2.17 2.41-4 0-1.31-.6-2.45-1.08-3.35-.54-1.02-.94-1.78-.18-2.91z"/>' +
    "</svg>";

  var TOP_ICON =
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
    '<path fill="currentColor" d="M12 5.5 5.5 12l1.4 1.4 4.1-4.09V20h2V9.31l4.1 4.09 1.4-1.4z"/>' +
    "</svg>";

  function escapeAttr(value) {
    return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  }

  // Absolute URL of the site root, ending in "/".
  //
  // The site is published under a subpath
  // (https://panategwa.github.io/PanategwaHub/), so walking up from the current
  // page's pathname would climb past the repo root and drop the
  // "/PanategwaHub/" segment, sending links to
  // https://panategwa.github.io/main-pages/... This script's own URL always
  // ends in "/js/menu.js", so trimming those two segments off it yields the
  // real root regardless of the current page's depth or where the site is
  // mounted.
  function computeRoot() {
    var script = document.currentScript;
    var src = script && script.src;
    if (src) {
      try {
        var url = new URL(src, window.location.href);
        var trimmed = url.pathname.replace(/\/js\/menu\.js$/, "/");
        if (trimmed !== url.pathname) {
          url.pathname = trimmed;
          url.search = "";
          url.hash = "";
          return url.href;
        }
      } catch (err) {
        // Fall through to the relative prefix below.
      }
    }

    // Fallback for when the script URL is unavailable: "../../"-style prefix
    // relative to the current page. "" at the repo root, "../../" for
    // main-pages/<body>/file.html.
    var segments = window.location.pathname.split("/").filter(Boolean);
    var depth = Math.max(0, segments.length - 1);
    return depth > 0 ? new Array(depth + 1).join("../") : "";
  }

  // Resolved eagerly, while this classic script is still executing:
  // document.currentScript is only set for the duration of a script's own run,
  // and render() happens later on DOMContentLoaded.
  var ROOT = computeRoot();

  function rootPrefix() {
    return ROOT;
  }

  function pageUrl(url) {
    return ROOT + url;
  }

  function renderPageLinks() {
    var prefix = rootPrefix();
    return PAGES.map(function (page) {
      var href = escapeAttr(prefix + page.url);
      return '    <a href="' + href + '" class="menu-button" data-target-page="' + href + '">'
        + escapeAttr(page.name) + "</a>";
    }).join("\n");
  }

  function renderIconLink(href, title, icon, inner) {
    var target = pageUrl(href);
    return '      <a href="' + target + '" class="menu-icon-button" data-target-page="' + target + '" title="'
      + title + '">\n        ' + (inner || icon) + "\n      </a>";
  }

  function buildMenuHtml() {
    return [
      '<div class="menu-scroll">',
      '    <div class="line">',
      '      <div class="menu-main-title">The Panategwa Hub</div>',
      '      <div class="menu-sub-title">0.0.3 - Alpha, Internal testing</div>',
      '      <div class="menu-site-time" id="menu-site-time">On the site for: --</div>',
      "    </div>",
      "",
      '    <div id="menu-music-slot"></div>',
      "",
      '    <div class="line icons">',
      renderIconLink("main-pages/settings/settings-page.html", "Site settings", SETTINGS_ICON),
      "",
      renderIconLink("main-pages/account/account-page.html", "Account", "", '        <span id="menu-account-button" style="display:inline-flex; align-items:center; justify-content:center;"></span>'),
      "",
      renderIconLink("main-pages/streak/streak-page.html", "Streak", STREAK_ICON),
      "",
      '      <button class="menu-icon-button"',
      '        onclick="window.scrollTo({top:0, behavior:\'smooth\'})"',
      '        title="Top">',
      "        " + TOP_ICON,
      "      </button>",
      "    </div>",
      "",
      renderPageLinks(),
      "  </div>",
      "",
      '  <div id="resize-handle" role="separator" tabindex="0"',
      '    aria-label="Resize sidebar. Drag, scroll, or use the left and right arrow keys."',
      '    aria-orientation="vertical" title="Drag or scroll to resize"><span></span></div>'
    ].join("\n");
  }

  // ========================================================
  // Active link highlighting
  // ========================================================
  function currentPageName() {
    var path = window.location.pathname.split("/").pop();
    return path || "index.html";
  }

  // data-target-page holds a repo-relative path, so compare on the filename.
  function pageName(url) {
    return String(url || "").split("?")[0].split("#")[0].split("/").pop() || "";
  }

  function highlightActiveLink() {
    var currentPage = currentPageName();

    document.querySelectorAll(".menu-button").forEach(function (btn) {
      var isActive = pageName(btn.getAttribute("data-target-page")) === currentPage;
      btn.classList.toggle("active", isActive);
      // The page you are already on is inert: no click, no hover styling,
      // but still focusable so keyboard users keep their place in the menu.
      if (isActive) {
        btn.setAttribute("aria-current", "page");
        btn.setAttribute("aria-disabled", "true");
      } else {
        btn.removeAttribute("aria-current");
        btn.removeAttribute("aria-disabled");
      }
    });

    document.querySelectorAll(".menu-icon-button").forEach(function (btn) {
      var isActive = pageName(btn.getAttribute("data-target-page")) === currentPage;
      btn.classList.toggle("active-icon", isActive);
      if (isActive) {
        btn.setAttribute("aria-current", "page");
        btn.setAttribute("aria-disabled", "true");
      } else {
        btn.removeAttribute("aria-current");
        btn.removeAttribute("aria-disabled");
      }
    });
  }

  function blockDisabledClicks(event) {
    var target = event.target.closest ? event.target.closest('[aria-disabled="true"]') : null;
    if (target) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function render() {
    var container = document.getElementById("menu-container");
    if (!container) return;
    container.innerHTML = buildMenuHtml();
    highlightActiveLink();
    container.addEventListener("click", blockDisabledClicks, true);
  }

  // Exposed so other modules can reach root-level pages (account, settings,
  // streak) from anywhere in the tree, and read the canonical page list.
  window.PanategwaRoot = rootPrefix();
  window.PanategwaMenuPages = PAGES;
  window.PanategwaPageUrl = pageUrl;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
