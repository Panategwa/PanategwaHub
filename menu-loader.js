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

  let menuHTML = "";

  pages.forEach(page => {
    const isActive = page.url === current;
    menuHTML += `<button class="menu-button${isActive ? " active" : ""}"${isActive ? " disabled" : ` onclick="window.location.href='${page.url}'"`}>${page.name}</button>`;
  });

  menuContainer.innerHTML = menuHTML;
});
