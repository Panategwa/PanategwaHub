const LANGS = [
  { code: "en", name: "🇬🇧 English" },
  { code: "el", name: "🇬🇷 Ελληνικά" },
  { code: "ru", name: "🇷🇺 Русский" },
  { code: "es", name: "🇪🇸 Español" },
  { code: "fr", name: "🇫🇷 Français" },
  { code: "de", name: "🇩🇪 Deutsch" },
  { code: "it", name: "🇮🇹 Italiano" },
  { code: "pt", name: "🇵🇹 Português" },
  { code: "pl", name: "🇵🇱 Polski" },
  { code: "uk", name: "🇺🇦 Українська" },
  { code: "tr", name: "🇹🇷 Türkçe" },
  { code: "ar", name: "🇸🇦 العربية" },
  { code: "hi", name: "🇮🇳 हिन्दी" },
  { code: "bn", name: "🇧🇩 বাংলা" },
  { code: "ur", name: "🇵🇰 اردو" },
  { code: "zh", name: "🇨🇳 中文" },
  { code: "ja", name: "🇯🇵 日本語" },
  { code: "ko", name: "🇰🇷 한국어" },
  { code: "id", name: "🇮🇩 Bahasa Indonesia" },
  { code: "vi", name: "🇻🇳 Tiếng Việt" },
  { code: "bg", name: "🇧🇬 Български" },
  { code: "ro", name: "🇷🇴 Română" },
  { code: "he", name: "🇮🇱 עברית" },
  { code: "fa", name: "🇮🇷 فارسی" }
];

const SAFE_SPACE = "\u00A0";

const PANTEGWA_RULES = {
  en: { base: "Panategwa", suffixes: ["", " b", " c", " d", " e", " f", " g"] },
  el: { base: "Πανατίγκουα", suffixes: ["", " β", " γ", " δ", " ε", " ζ", " η"] },
  ru: { base: "Панатегва", suffixes: ["", " б", " в", " г", " д", " е", " ж"] },
  es: { base: "Panategua", suffixes: ["", " b", " c", " d", " e", " f", " g"] },
  fr: { base: "Panatégua", suffixes: ["", " b", " c", " d", " e", " f", " g"] },
  de: { base: "Panategwa", suffixes: ["", " b", " c", " d", " e", " f", " g"] },
  it: { base: "Panategua", suffixes: ["", " b", " c", " d", " e", " f", " g"] },
  pt: { base: "Panategua", suffixes: ["", " b", " c", " d", " e", " f", " g"] },
  pl: { base: "Panategwa", suffixes: ["", " b", " c", " d", " e", " f", " g"] },
  uk: { base: "Панатегва", suffixes: ["", " б", " в", " г", " д", " е", " ж"] },
  tr: { base: "Panategva", suffixes: ["", " b", " c", " d", " e", " f", " g"] },
  ar: { base: "باناتيغوا", suffixes: ["", " ب", " ج", " د", " هـ", " و", " ز"] },
  hi: { base: "पानातिग्वा", suffixes: ["", " ब", " स", " द", " ए", " फ", " ग"] },
  bn: { base: "পানাতিগওয়া", suffixes: ["", " ব", " স", " দ", " এ", " ফ", " ग"] },
  ur: { base: "پاناتگوا", suffixes: ["", " ب", " ج", " د", " ہ", " و", " ز"] },
  zh: { base: "帕纳提格瓦", suffixes: ["", " 二", " 三", " 四", " 五", " 六", " 七"] },
  ja: { base: "パナティグワ", suffixes: ["", " 二", " 三", " 四", " 五", " 六", " 七"] },
  ko: { base: "파나티그와", suffixes: ["", " 이", " 삼", " 사", " 오", " 육", " 칠"] },
  id: { base: "Panategwa", suffixes: ["", " b", " c", " d", " e", " f", " g"] },
  vi: { base: "Panategwa", suffixes: ["", " b", " c", " d", " e", " f", " g"] },
  bg: { base: "Панатегва", suffixes: ["", " б", " в", " г", " д", " е", " ж"] },
  ro: { base: "Panategua", suffixes: ["", " b", " c", " d", " e", " f", " g"] },
  he: { base: "פנאטגווה", suffixes: ["", " ב", " ג", " ד", " ה", " ו", " ז"] },
  fa: { base: "پاناتگوا", suffixes: ["", " ب", " ج", " د", " هـ", " و", " ز"] }
};

function buildManualTranslations() {
  const keys = [
    "Panategwa",
    "Panategwa b",
    "Panategwa c",
    "Panategwa d",
    "Panategwa e",
    "Panategwa f",
    "Panategwa g"
  ];

  const out = {};

  for (const [lang, cfg] of Object.entries(PANTEGWA_RULES)) {
    out[lang] = {};

    keys.forEach((key, i) => {
      let value = `${cfg.base}${cfg.suffixes[i]}`;
      value = value.replace(/:\s*/g, ":" + SAFE_SPACE);
      out[lang][key] = value;
    });
  }

  return out;
}

const MANUAL_TRANSLATIONS = buildManualTranslations();
const PANTEGWA_KEYS = [
  "Panategwa g",
  "Panategwa f",
  "Panategwa e",
  "Panategwa d",
  "Panategwa c",
  "Panategwa b",
  "Panategwa"
];

let isTranslating = false;
const ORIGINAL_TEXT = new WeakMap();

function getCurrentLang() {
  const urlLang = new URLSearchParams(window.location.search).get("lang");
  if (urlLang) return urlLang;

  return localStorage.getItem("lang") || "en";
}

function normalize(text) {
  return text.replace(/\s+/g, " ").trim();
}

function getCurrentTextSize() {
  if (typeof getTextSize === "function") {
    return getTextSize();
  }

  const urlSize = new URLSearchParams(window.location.search).get("textsize");
  if (urlSize) return urlSize;

  return localStorage.getItem("textsize") || "medium";
}

function getCurrentThemeName() {
  return localStorage.getItem("theme") || "";
}

function buildSettingsUrl(urlString, overrides = {}) {
  if (!urlString) return urlString;

  const trimmed = urlString.trim();

  if (
    trimmed.startsWith("#") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("tel:") ||
    trimmed.startsWith("javascript:")
  ) {
    return urlString;
  }

  const url = new URL(trimmed, window.location.href);

  if (url.origin !== window.location.origin) {
    return urlString;
  }

  const lang = overrides.lang ?? getCurrentLang();
  const size = overrides.textsize ?? getCurrentTextSize();
  const theme = overrides.theme ?? getCurrentThemeName();

  if (lang && lang !== "en") {
    url.searchParams.set("lang", lang);
  } else {
    url.searchParams.delete("lang");
  }

  if (size && size !== "medium") {
    url.searchParams.set("textsize", size);
  } else {
    url.searchParams.delete("textsize");
  }

  if (theme) {
    url.searchParams.set("theme", theme);
  } else {
    url.searchParams.delete("theme");
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

function shouldIgnoreTextNode(node) {
  if (!node || !node.nodeValue || !node.nodeValue.trim()) return true;

  const parent = node.parentElement;
  if (!parent) return true;

  if (parent.closest("#lang-buttons")) return true;
  if (parent.closest("#theme-buttons")) return true;
  if (parent.closest(".no-translate")) return true;

  const tag = parent.tagName;
  if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return true;

  return false;
}

function getTextNodes(root = document.body) {
  const nodes = [];
  if (!root) return nodes;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return shouldIgnoreTextNode(node)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    }
  });

  let node;
  while ((node = walker.nextNode())) {
    nodes.push(node);
  }

  return nodes;
}

function protectPhrases(text, lang) {
  let output = text;
  const replacements = [];

  for (const phrase of PANTEGWA_KEYS) {
    if (!output.includes(phrase)) continue;

    const token = `__PTG_${replacements.length}__`;
    output = output.split(phrase).join(token);

    replacements.push({
      token,
      value: MANUAL_TRANSLATIONS[lang]?.[phrase] || phrase
    });
  }

  return { output, replacements };
}

function restorePhrases(text, replacements) {
  let output = text;

  for (const item of replacements) {
    output = output.split(item.token).join(item.value);
  }

  return output;
}

function applyText(node, text) {
  node.nodeValue = text;
}

function markOriginals() {
  const nodes = getTextNodes(document.body);

  for (const node of nodes) {
    if (!ORIGINAL_TEXT.has(node)) {
      ORIGINAL_TEXT.set(node, node.nodeValue);
    }
  }
}

async function googleTranslate(text, lang) {
  if (lang === "en") return text;

  try {
    const res = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`
    );

    const data = await res.json();

    let translated = "";
    if (data?.[0]) {
      for (const part of data[0]) {
        if (part?.[0]) translated += part[0];
      }
    }

    return translated || text;
  } catch (err) {
    console.log("Translation failed:", err);
    return text;
  }
}

function syncNavigationForLanguage() {
  document.querySelectorAll("a[href]").forEach(a => {
    if (a.closest("#lang-buttons")) return;

    if (!a.dataset.originalHref) {
      a.dataset.originalHref = a.getAttribute("href") || "";
    }

    a.setAttribute("href", buildSettingsUrl(a.dataset.originalHref));
  });

  document.querySelectorAll("button[onclick]").forEach(btn => {
    if (btn.closest("#lang-buttons")) return;

    if (!btn.dataset.originalOnclick) {
      btn.dataset.originalOnclick = btn.getAttribute("onclick") || "";
    }

    btn.setAttribute("onclick", patchOnclick(btn.dataset.originalOnclick));
  });
}

function patchOnclick(code) {
  let out = code;

  out = out.replace(
    /(window\.location\.href\s*=\s*['"])([^'"]+)(['"])/g,
    (_, pre, url, post) => `${pre}${buildSettingsUrl(url)}${post}`
  );

  out = out.replace(
    /(location\.href\s*=\s*['"])([^'"]+)(['"])/g,
    (_, pre, url, post) => `${pre}${buildSettingsUrl(url)}${post}`
  );

  out = out.replace(
    /(window\.open\s*\(\s*['"])([^'"]+)(['"])/g,
    (_, pre, url, post) => `${pre}${buildSettingsUrl(url)}${post}`
  );

  return out;
}

async function translatePage(lang) {
  if (isTranslating) return;
  isTranslating = true;

  markOriginals();

  const nodes = getTextNodes(document.body);

  for (const node of nodes) {
    const original = ORIGINAL_TEXT.get(node);
    if (!original || !original.trim()) continue;

    applyText(node, original);

    if (lang === "en") continue;

    if (MANUAL_TRANSLATIONS[lang]?.[normalize(original)]) {
      applyText(node, MANUAL_TRANSLATIONS[lang][normalize(original)]);
      continue;
    }

    const protectedInfo = protectPhrases(original, lang);
    const translated = await googleTranslate(protectedInfo.output, lang);

    let restored = restorePhrases(translated, protectedInfo.replacements);

    restored = restored
      .replace(/:\s*/g, ": ")
      .replace(/,\s*/g, ", ")
      .replace(/;\s*/g, "; ");

    restored = restored.replace(/:([^\s])/g, ": $1");

    applyText(node, restored);
  }

  syncNavigationForLanguage();
  isTranslating = false;
}

function setLang(lang) {
  localStorage.setItem("lang", lang);

  const url = new URL(window.location.href);

  if (lang === "en") {
    url.searchParams.delete("lang");
  } else {
    url.searchParams.set("lang", lang);
  }

  const size = getCurrentTextSize();
  if (size && size !== "medium") {
    url.searchParams.set("textsize", size);
  } else {
    url.searchParams.delete("textsize");
  }

  const theme = getCurrentThemeName();
  if (theme) {
    url.searchParams.set("theme", theme);
  } else {
    url.searchParams.delete("theme");
  }

  window.location.href = url.toString();
}

function toggleLanguages() {
  const container = document.getElementById("lang-buttons");
  const msg = document.getElementById("lang-message");

  if (!container || !msg) return;

  const open = container.style.display === "block";
  container.style.display = open ? "none" : "block";
  msg.style.display = open ? "none" : "block";
}

function buildLanguageButtons() {
  const container = document.getElementById("lang-buttons");
  if (!container) return;

  container.innerHTML = "";
  container.style.display = "none";

  const currentLang = getCurrentLang();

  LANGS.forEach(lang => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = lang.name;
    btn.dataset.lang = lang.code;
    btn.classList.toggle("active", lang.code === currentLang);
    btn.onclick = () => setLang(lang.code);
    container.appendChild(btn);
  });
}

function startNavigationObserver() {
  if (!document.body) return;

  const observer = new MutationObserver(() => {
    syncNavigationForLanguage();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function initTranslate() {
  buildLanguageButtons();

  const currentLang = getCurrentLang();

  const url = new URL(window.location.href);
  if (currentLang && currentLang !== "en") {
    url.searchParams.set("lang", currentLang);
  } else {
    url.searchParams.delete("lang");
  }

  const size = getCurrentTextSize();
  if (size && size !== "medium") {
    url.searchParams.set("textsize", size);
  } else {
    url.searchParams.delete("textsize");
  }

  const theme = getCurrentThemeName();
  if (theme) {
    url.searchParams.set("theme", theme);
  } else {
    url.searchParams.delete("theme");
  }

  window.history.replaceState({}, "", url);

  syncNavigationForLanguage();
  startNavigationObserver();

  if (currentLang !== "en") {
    setTimeout(() => translatePage(currentLang), 50);
  }
}