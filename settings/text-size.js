const FONT_SIZES = {
  small: "14px",
  medium: "16px",
  large: "18px"
};

function getTextSize() {
  const urlValue = new URLSearchParams(window.location.search).get("textsize");
  if (urlValue && FONT_SIZES[urlValue]) return urlValue;

  const saved = localStorage.getItem("textsize");
  if (saved && FONT_SIZES[saved]) return saved;

  return "medium";
}

function syncTextSizeUrl(size) {
  const url = new URL(window.location.href);

  if (size === "medium") {
    url.searchParams.delete("textsize");
  } else {
    url.searchParams.set("textsize", size);
  }

  const lang = typeof getCurrentLang === "function"
    ? getCurrentLang()
    : (new URLSearchParams(window.location.search).get("lang") || localStorage.getItem("lang") || "en");

  if (lang && lang !== "en") {
    url.searchParams.set("lang", lang);
  } else {
    url.searchParams.delete("lang");
  }

  const theme = localStorage.getItem("theme");
  if (theme) {
    url.searchParams.set("theme", theme);
  } else {
    url.searchParams.delete("theme");
  }

  window.history.replaceState({}, "", url);
}

function applyFontSize(size) {
  const valid = FONT_SIZES[size] ? size : "medium";

  document.documentElement.style.setProperty(
    "--global-font-size",
    FONT_SIZES[valid]
  );

  localStorage.setItem("textsize", valid);
}

function setActiveTextSizeButton(size) {
  document.querySelectorAll("#textsize-buttons button").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.size === size);
  });
}

function setTextSize(size) {
  const valid = FONT_SIZES[size] ? size : "medium";
  applyFontSize(valid);
  setActiveTextSizeButton(valid);
  syncTextSizeUrl(valid);
}

function buildTextSizeButtons() {
  const container = document.getElementById("textsize-buttons");
  if (!container) return;

  container.innerHTML = "";

  const buttons = [
    { size: "small", label: "Small (14px)" },
    { size: "medium", label: "Medium (16px)" },
    { size: "large", label: "Large (18px)" }
  ];

  for (const item of buttons) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.size = item.size;
    btn.textContent = item.label;
    btn.onclick = () => setTextSize(item.size);
    container.appendChild(btn);
  }
}

function toggleTextSizes() {
  const container = document.getElementById("textsize-buttons");
  const msg = document.getElementById("textsize-message");

  if (!container || !msg) return;

  const open = container.style.display === "block";
  container.style.display = open ? "none" : "block";
  msg.style.display = open ? "none" : "block";
}

function initTextSize() {
  buildTextSizeButtons();

  const current = getTextSize();
  applyFontSize(current);
  setActiveTextSizeButton(current);
  syncTextSizeUrl(current);
}