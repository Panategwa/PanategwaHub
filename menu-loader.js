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
    { name: "Panategwa g", url: "panategwa-g-page.html" },
    { name: "⚙️ Settings", url: "settings-page.html" }
  ];

  const current = window.location.pathname.split("/").pop() || "index.html";
  const urlParams = new URLSearchParams(window.location.search);
  const currentLang = urlParams.get("lang") || "en";

  function buildUrl(page) {
    let url = page;
    if (currentLang !== "en") url += `?lang=${currentLang}`;
    return url;
  }

  let menuHTML = `<div class="menu-inner">`;

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

  // =========================
  // BACK TO TOP
  // =========================
  menuHTML += `
    <button class="menu-button"
      onclick="window.scrollTo({top:0, behavior:'smooth'})">
      Back to Top
    </button>
  `;

  // =========================
  // RESIZE HANDLE
  // =========================
  menuHTML += `<div id="resize-handle"></div>`;

  menuHTML += `</div>`;

  menuContainer.innerHTML = menuHTML;

  // =========================
  // RESIZE LOGIC
  // =========================

  const handle = document.getElementById("resize-handle");

  let isResizing = false;

  const MIN_WIDTH = 160;
  const MAX_WIDTH = 500;
  const DEFAULT_WIDTH = 220;

  // load saved width
  let savedWidth = localStorage.getItem("menuWidth");

  if (savedWidth) {
    savedWidth = parseInt(savedWidth);
    menuContainer.style.width = savedWidth + "px";
    document.body.style.paddingLeft = savedWidth + "px";
  } else {
    document.body.style.paddingLeft = DEFAULT_WIDTH + "px";
  }

  handle.addEventListener("mousedown", () => {
    isResizing = true;
    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", (e) => {
    if (!isResizing) return;

    let newWidth = e.clientX;

    // clamp width
    if (newWidth < MIN_WIDTH) newWidth = MIN_WIDTH;
    if (newWidth > MAX_WIDTH) newWidth = MAX_WIDTH;

    menuContainer.style.width = newWidth + "px";
    document.body.style.paddingLeft = newWidth + "px";
  });

  document.addEventListener("mouseup", () => {
    if (!isResizing) return;

    isResizing = false;
    document.body.style.userSelect = "auto";

    const finalWidth = menuContainer.offsetWidth;
    localStorage.setItem("menuWidth", finalWidth);
  });

  // =========================
  // DOUBLE CLICK RESET
  // =========================
  handle.addEventListener("dblclick", () => {
    menuContainer.style.width = DEFAULT_WIDTH + "px";
    document.body.style.paddingLeft = DEFAULT_WIDTH + "px";

    localStorage.setItem("menuWidth", DEFAULT_WIDTH);
  });
});