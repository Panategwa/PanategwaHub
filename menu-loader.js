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

  let menuHTML = "";

  // PAGES
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

  // BACK TO TOP
  menuHTML += `
    <button class="menu-button"
      onclick="window.scrollTo({top:0, behavior:'smooth'})">
      Back to Top
    </button>
  `;

  // SETTINGS BUTTON (NEW)
  menuHTML += `
    <button class="menu-button"
      onclick="window.location.href='settings-page.html${currentLang !== "en" ? "?lang=" + currentLang : ""}'">
      ⚙️ Settings
    </button>
  `;

  menuContainer.innerHTML = menuHTML;
});