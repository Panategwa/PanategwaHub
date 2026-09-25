(function () {
  "use strict";

  // ========================================================
  // Sidebar menu — single source of truth
  // ========================================================
  // Every page includes this file with <script src="js/menu.js" defer></script>
  // and nothing more than an empty <div id="menu-container"></div>. The markup
  // below is rendered into that container, so adding or removing a page only
  // ever means editing PAGES here.
  var PAGES = [
    { name: "Home", url: "index.html" },
    { name: "Panategwa", url: "panategwa-page.html" },
    { name: "Panategwa b", url: "panategwa-b-page.html" },
    { name: "Panategwa c", url: "panategwa-c-page.html" },
    { name: "Panategwa d", url: "panategwa-d-page.html" },
    { name: "Panategwa e", url: "panategwa-e-page.html" },
    { name: "Panategwa f", url: "panategwa-f-page.html" },
    { name: "Panategwa g", url: "panategwa-g-page.html" }
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

  function renderPageLinks() {
    return PAGES.map(function (page) {
      var url = escapeAttr(page.url);
      return '    <a href="' + url + '" class="menu-button" data-target-page="' + url + '">'
        + escapeAttr(page.name) + "</a>";
    }).join("\n");
  }

  function renderIconLink(href, title, icon, inner) {
    return '      <a href="' + href + '" class="menu-icon-button" data-target-page="' + href + '" title="'
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
      renderIconLink("settings-page.html", "Site settings", SETTINGS_ICON),
      "",
      renderIconLink("account-page.html", "Account", "", '        <span id="menu-account-button" style="display:inline-flex; align-items:center; justify-content:center;"></span>'),
      "",
      renderIconLink("streak-page.html", "Streak", STREAK_ICON),
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

  function highlightActiveLink() {
    var currentPage = currentPageName();

    document.querySelectorAll(".menu-button").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-target-page") === currentPage);
    });

    document.querySelectorAll(".menu-icon-button").forEach(function (btn) {
      btn.classList.toggle("active-icon", btn.getAttribute("data-target-page") === currentPage);
    });
  }

  function render() {
    var container = document.getElementById("menu-container");
    if (!container) return;
    container.innerHTML = buildMenuHtml();
    highlightActiveLink();
  }

  // Exposed so other modules can read the canonical page list.
  window.PanategwaMenuPages = PAGES;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
