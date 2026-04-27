function ensureSharedAchievements() {
  const alreadyLoaded = [...document.querySelectorAll("script[type='module']")].some((script) => {
    const src = script.getAttribute("src") || "";
    return src === "auth/achievements.js" || src.endsWith("/auth/achievements.js");
  });

  if (alreadyLoaded) return;

  const script = document.createElement("script");
  script.type = "module";
  script.src = "auth/achievements.js";
  script.dataset.panategwaAchievements = "true";
  document.head.appendChild(script);
}

function ensureSharedSocialNotifications() {
  const alreadyLoaded = [...document.querySelectorAll("script[type='module']")].some((script) => {
    const src = script.getAttribute("src") || "";
    return src === "auth/social.js" || src.endsWith("/auth/social.js");
  });

  if (alreadyLoaded) return;

  const script = document.createElement("script");
  script.type = "module";
  script.src = "auth/social.js";
  script.dataset.panategwaSocial = "true";
  document.head.appendChild(script);
}

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
    const raw = JSON.parse(localStorage.getItem(`ptg_notifications_${uid}`) || "[]");
    if (!Array.isArray(raw)) return 0;
    return raw.filter((entry) => !entry?.read).length;
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
  const btn = document.getElementById("menu-account-button");
  if (!btn) return;

  const loggedIn = localStorage.getItem("ptg_logged_in") === "1";
  const url = localStorage.getItem("panategwa_sidebar_avatar_url") || "";
  const uid = currentUid();
  const unread = loggedIn ? (socialUnreadCount(uid) + localUnreadCount(uid)) : 0;
  const content = loggedIn && url
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

document.addEventListener("DOMContentLoaded", function () {
  ensureSharedAchievements();
  ensureSharedSocialNotifications();

  const menuContainer = document.getElementById("menu-container");
  if (!menuContainer) return;

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
  const isAccount = current === "account-page.html";

  let menuHTML = `<div class="menu-inner">`;

  menuHTML += `
    <div class="line">
      <div class="menu-main-title">The Panategwa Hub</div>
      <div class="menu-sub-title">0.0.1 - Alpha, Internal testing</div>
    </div>
  `;

  menuHTML += `
    <div class="line icons">
      <button class="menu-icon-button ${isSettings ? "active-icon" : ""}"
        ${isSettings ? "disabled" : ""}
        onclick="window.location.href='${buildUrl("settings-page.html")}'"
        title="Site settings">
        ${iconMarkup("settings")}
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
        ${iconMarkup("streak")}
      </button>

      <button class="menu-icon-button"
        onclick="window.scrollTo({top:0, behavior:'smooth'})"
        title="Top">
        ${iconMarkup("top")}
      </button>
    </div>
  `;

  pages.forEach((page) => {
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
  window.addEventListener("panategwa:notifications-changed", renderSidebarAvatar);
  window.addEventListener("storage", (event) => {
    if (!event.key) return;
    if (event.key === "ptg_logged_in"
      || event.key === "ptg_current_uid"
      || event.key === "panategwa_sidebar_avatar_url"
      || event.key.startsWith("ptg_social_unread_count_")
      || event.key.startsWith("ptg_notifications_")) {
      renderSidebarAvatar();
    }
  });

  const wrapper = document.createElement("div");
  wrapper.id = "page-content";

  const elements = [...document.body.children];
  elements.forEach((el) => {
    if (el !== menuContainer) wrapper.appendChild(el);
  });

  document.body.appendChild(wrapper);

  const handle = document.getElementById("resize-handle");
  let isResizing = false;

  const MIN_WIDTH = 225;
  const MAX_WIDTH = 500;
  const DEFAULT_WIDTH = 350;

  let savedWidth = localStorage.getItem("menuWidth");

  if (savedWidth) {
    savedWidth = parseInt(savedWidth, 10);
    menuContainer.style.width = `${savedWidth}px`;
    wrapper.style.paddingLeft = `${savedWidth}px`;
  } else {
    wrapper.style.paddingLeft = `${DEFAULT_WIDTH}px`;
  }

  handle.addEventListener("mousedown", () => {
    isResizing = true;
    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", (event) => {
    if (!isResizing) return;

    let newWidth = event.clientX;
    if (newWidth < MIN_WIDTH) newWidth = MIN_WIDTH;
    if (newWidth > MAX_WIDTH) newWidth = MAX_WIDTH;

    menuContainer.style.width = `${newWidth}px`;
    wrapper.style.paddingLeft = `${newWidth}px`;
  });

  document.addEventListener("mouseup", () => {
    if (!isResizing) return;
    isResizing = false;
    document.body.style.userSelect = "auto";
    localStorage.setItem("menuWidth", String(menuContainer.offsetWidth));
  });

  handle.addEventListener("dblclick", () => {
    menuContainer.style.width = `${DEFAULT_WIDTH}px`;
    wrapper.style.paddingLeft = `${DEFAULT_WIDTH}px`;
    localStorage.setItem("menuWidth", String(DEFAULT_WIDTH));
  });
});
