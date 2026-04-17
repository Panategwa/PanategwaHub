document.addEventListener("DOMContentLoaded", function () {
  const menuContainer = document.getElementById("menu-container");

  const pages = [
    { name: "Home", url: "index.html" },
    { name: "Panategwa", url: "panategwa-page.html" },
    { name: "Panategwa b", url: "panategwa-b-page.html" },
    { name: "Panategwa c", url: "panategwa-c-page.html" },
    { name: "Panategwa d", url: "panategwa-d-page.html" },
    { name: "Panategwa e", url: "panategwa-e-page.html" },
    { name: "Panategwa f", url: "panategwa-f-page.html" },
    { name: "Panategwa g", url: "panategwa-g-page.html" }
  ];

  const current = window.location.pathname.split("/").pop() || "index.html";
  const urlParams = new URLSearchParams(window.location.search);
  const currentLang = urlParams.get("lang") || "en";

  function buildUrl(page) {
    let url = page;
    if (currentLang !== "en") url += `?lang=${currentLang}`;
    return url;
  }

  const isSettings = current === "settings-page.html";

  let menuHTML = `<div class="menu-inner">`;

  // =========================
  // TITLE
  // =========================
  menuHTML += `
    <div class="line">
      <div class="menu-main-title">The Panategwa Hub</div>
      <div class="menu-sub-title">Alpha</div>
    </div>
  `;

// =========================
// ICON ROW
// =========================
menuHTML += `
  <div class="line icons">

    <!-- SETTINGS -->
    <button class="menu-icon-button ${isSettings ? "active-icon" : ""}"
      ${isSettings ? "disabled" : ""}
      onclick="window.location.href='${buildUrl("settings-page.html")}'">
      ⚙️
    </button>

<!-- ACCOUNT -->
<button class="menu-icon-button"
  onclick="window.location.href='account-page.html'">
  👤
</button>

<!-- SCROLL TO TOP -->
<button class="menu-icon-button"
  onclick="window.scrollTo({top:0, behavior:'smooth'})">
  ⬆️
    </button>

  </div>
`;

  // =========================
  // PAGE BUTTONS
  // =========================
  pages.forEach(page => {
    const isActive = page.url === current;
    const url = buildUrl(page.url);

    menuHTML += `
      <button class="menu-button ${isActive ? "active" : ""}"
        ${isActive ? "disabled" : ""}
        onclick="window.location.href='${url}'">
        ${page.name}
      </button>
    `;
  });

  menuHTML += `<div id="resize-handle"></div>`;
  menuHTML += `</div>`;

  menuContainer.innerHTML = menuHTML;

  // =========================
  // WRAP PAGE CONTENT
  // =========================
  const wrapper = document.createElement("div");
  wrapper.id = "page-content";

  const elements = [...document.body.children];
  elements.forEach(el => {
    if (el !== menuContainer) wrapper.appendChild(el);
  });

  document.body.appendChild(wrapper);

  // =========================
  // RESIZE LOGIC
  // =========================
  const handle = document.getElementById("resize-handle");

  let isResizing = false;

  const MIN_WIDTH = 160;
  const MAX_WIDTH = 500;
  const DEFAULT_WIDTH = 220;

  let savedWidth = localStorage.getItem("menuWidth");

  if (savedWidth) {
    savedWidth = parseInt(savedWidth);
    menuContainer.style.width = savedWidth + "px";
    wrapper.style.paddingLeft = savedWidth + "px";
  } else {
    wrapper.style.paddingLeft = DEFAULT_WIDTH + "px";
  }

  handle.addEventListener("mousedown", () => {
    isResizing = true;
    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", (e) => {
    if (!isResizing) return;

    let newWidth = e.clientX;

    if (newWidth < MIN_WIDTH) newWidth = MIN_WIDTH;
    if (newWidth > MAX_WIDTH) newWidth = MAX_WIDTH;

    menuContainer.style.width = newWidth + "px";
    wrapper.style.paddingLeft = newWidth + "px";
  });

  document.addEventListener("mouseup", () => {
    if (!isResizing) return;

    isResizing = false;
    document.body.style.userSelect = "auto";

    const finalWidth = menuContainer.offsetWidth;
    localStorage.setItem("menuWidth", finalWidth);
  });

  handle.addEventListener("dblclick", () => {
    menuContainer.style.width = DEFAULT_WIDTH + "px";
    wrapper.style.paddingLeft = DEFAULT_WIDTH + "px";

    localStorage.setItem("menuWidth", DEFAULT_WIDTH);
  });
});