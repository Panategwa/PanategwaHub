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

  function defaultAvatarIcon() {
    return `
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="none" stroke="#000" stroke-width="1.8"></circle>
        <path fill="currentColor" d="M12 12.2a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5z"/>
      </svg>
    `;
  }

  function renderSidebarAvatar() {
    const btn = document.getElementById("menu-account-button");
    if (!btn) return;

    const loggedIn = localStorage.getItem("ptg_logged_in") === "1";
    const url = localStorage.getItem("panategwa_sidebar_avatar_url") || "";

    if (loggedIn && url) {
      btn.innerHTML = `<img src="${url}" alt="Account" style="width:22px;height:22px;border-radius:50%;object-fit:cover;display:block;" />`;
    } else {
      btn.innerHTML = defaultAvatarIcon();
    }
  }

  window.PanategwaUpdateSidebarAvatar = function (avatarUrl) {
    localStorage.setItem("panategwa_sidebar_avatar_url", avatarUrl || "");
    renderSidebarAvatar();
  };

  const isSettings = current === "settings-page.html";
  const isAccount = current === "account-page.html";

  let menuHTML = `<div class="menu-inner">`;

  menuHTML += `
    <div class="line">
      <div class="menu-main-title">The Panategwa Hub</div>
      <div class="menu-sub-title">0.0.1 - Alpha Testing</div>
    </div>
  `;

  menuHTML += `
    <div class="line icons">
      <button class="menu-icon-button ${isSettings ? "active-icon" : ""}"
        ${isSettings ? "disabled" : ""}
        onclick="window.location.href='${buildUrl("settings-page.html")}'"
        title="Site settings">
        ⚙️
      </button>

      <button class="menu-icon-button"
        onclick="window.location.href='${buildUrl("account-page.html")}'"
        title="Account">
        <span id="menu-account-button"
          class="${isAccount ? "active-icon" : ""}"
          style="display:inline-flex; align-items:center; justify-content:center;"></span>
      </button>

      <button class="menu-icon-button"
        onclick="window.location.href='${buildUrl("streak-page.html")}'"
        title="Streak">
        🔥
      </button>

      <button class="menu-icon-button"
        onclick="window.scrollTo({top:0, behavior:'smooth'})"
        title="Top">
        ⬆️
      </button>
    </div>
  `;

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
  renderSidebarAvatar();

  const wrapper = document.createElement("div");
  wrapper.id = "page-content";

  const elements = [...document.body.children];
  elements.forEach(el => {
    if (el !== menuContainer) wrapper.appendChild(el);
  });

  document.body.appendChild(wrapper);

  const handle = document.getElementById("resize-handle");
  let isResizing = false;

  const MIN_WIDTH = 160;
  const MAX_WIDTH = 500;
  const DEFAULT_WIDTH = 220;

  let savedWidth = localStorage.getItem("menuWidth");

  if (savedWidth) {
    savedWidth = parseInt(savedWidth, 10);
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
    localStorage.setItem("menuWidth", String(menuContainer.offsetWidth));
  });

  handle.addEventListener("dblclick", () => {
    menuContainer.style.width = DEFAULT_WIDTH + "px";
    wrapper.style.paddingLeft = DEFAULT_WIDTH + "px";
    localStorage.setItem("menuWidth", String(DEFAULT_WIDTH));
  });
});