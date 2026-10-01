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

// The site's other proper nouns. The translation service is left to guess at
// these, which is how "Pitons" comes back as a common word and
// "Tri-Panategwaoi Anthropoi Civilis" comes back mangled.
//
// Each is deliberately left mapping to itself. Most of these are coined names
// with no settled translation, and a plausible-looking invention would be
// worse than the original -- it would read as authoritative and be wrong. To
// give one a real translation, put it in the language's object below; anything
// you do not fill in keeps the English name, which is the correct rendering
// for a proper noun in most languages anyway.
const PROPER_NOUNS = {
  "Tri-Panategwaoi Anthropoi Civilis": {},
  "Bathythalassas Gigaperipatitis": {},
  "Empire of Pitosia": {},
  "Panategwa Hub": {},
  "Thrinsachelom": {},
  "Dendrospheres": {},
  "Pitons": {},
  // Singular forms. The Pitons page's headings use them, and the plural entry
  // above only protected the plural -- so "The Piton Race" came back as
  // "La carrera del Pitón", the service having treated the coined word as the
  // ordinary Spanish noun for a mountain peak.
  "Piton": {},
  "Piton Race": {}
};

function buildManualTranslations() {
  const keys = [
    "Panategwa",
    "Panategwa b",
    "Panategwa c",
    "Panategwa d",
    "Panategwa e",
    "Panategwa f",
    "Panategwa g",
    ...Object.keys(PROPER_NOUNS)
  ];

  const out = {};

  for (const [lang, cfg] of Object.entries(PANTEGWA_RULES)) {
    out[lang] = {};

    keys.forEach((key, i) => {
      // The Panategwa family is generated from the suffix table above; the
      // rest come from PROPER_NOUNS, falling back to the English name.
      const generated = i < 7 ? `${cfg.base}${cfg.suffixes[i]}` : null;
      let value = generated || PROPER_NOUNS[key]?.[lang] || key;
      value = value.replace(/:\s*/g, ":" + SAFE_SPACE);
      out[lang][key] = value;
    });
  }

  return out;
}

const MANUAL_TRANSLATIONS = buildManualTranslations();

// Every proper noun that gets protected, longest first. Order matters: the
// walk replaces "Panategwa b" before "Panategwa", or the bare name would
// swallow the planet letter and leave a stray "b" behind. Sorting by length
// handles that for anything added to PROPER_NOUNS later, which is the whole
// point of deriving the list rather than keeping it by hand.
const MANUAL_PHRASES = Object.keys(MANUAL_TRANSLATIONS.en || {}).sort(
  (a, b) => b.length - a.length
);

let isTranslating = false;
// The language a run is currently working towards, and the one asked for while
// it was running. The old `if (isTranslating) return;` guard threw the second
// request away rather than queueing it, so picking a language and then picking
// another before the first finished left the page showing the first language
// while the settings said otherwise.
let activeLang = null;
let pendingLang = null;
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

  if (size && size !== "medium" && size !== "custom") {
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

  for (const phrase of MANUAL_PHRASES) {
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

// The number of strings to put in one request. The service caps a request at
// roughly 5000 characters, so this is a character budget rather than a fixed
// count -- a page of short labels gets many more per request than a page of
// long paragraphs does, and the limit is what actually matters.
const MAX_BATCH_CHARS = 1400;
const BATCH_SEP = "\n";

function translateEndpoint(lang) {
  return `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${lang}&dt=t&q=`;
}

function joinBatchResponse(data) {
  if (!Array.isArray(data?.[0])) return "";
  let text = "";
  for (const part of data[0]) {
    if (part?.[0]) text += part[0];
  }
  return text;
}

async function requestTranslation(payload, lang) {
  const res = await fetch(translateEndpoint(lang) + encodeURIComponent(payload));
  return joinBatchResponse(await res.json());
}

// Translates a list of strings in as few requests as possible.
//
// This exists because the previous version sent one request per text node. The
// account page has 279 text nodes, so picking a language fired 279 requests ten
// at a time and took about five seconds -- nearly all of it waiting on the
// network round trip rather than doing any work. Joining the strings with a
// newline and sending them together is about eleven times faster in practice.
//
// The newline is what makes it work, and the caveat is that it only works
// because every string is normalized first. A string that already contains a
// newline would come back as two lines and shift every string after it, so
// normalize() (which collapses all whitespace runs to single spaces) has to run
// before anything is joined. The line count is checked on the way back: if it
// does not match, the batch is discarded and retried one string at a time, so a
// surprise from the service costs a slow page rather than scrambled text.
async function translateMany(texts, lang) {
  if (!texts.length) return [];

  const unique = [];
  const seen = new Set();
  for (const text of texts) {
    const key = normalize(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(key);
  }

  const results = new Map();
  const pending = [];

  let batch = [];
  let batchChars = 0;
  const flush = () => {
    if (!batch.length) return;
    const group = batch;
    const chars = batchChars;
    batch = [];
    batchChars = 0;
    pending.push(
      requestTranslation(group.join(BATCH_SEP), lang)
        .then((out) => {
          const lines = out.split(BATCH_SEP);
          if (lines.length !== group.length) {
            // The service did not preserve the line structure. Fall back to one
            // request per string rather than writing the wrong text into the
            // wrong nodes.
            return Promise.all(group.map((t) => requestTranslation(t, lang)));
          }
          return lines.map((line) => line.trim());
        })
        .then((lines) => {
          group.forEach((key, i) => results.set(key, lines[i] || key));
        })
        .catch((err) => {
          console.log("Translation failed:", err);
          group.forEach((key) => results.set(key, key));
        })
    );
    return chars;
  };

  for (const text of unique) {
    const cost = text.length + 1;
    if (batch.length && batchChars + cost > MAX_BATCH_CHARS) flush();
    batch.push(text);
    batchChars += cost;
  }
  flush();

  // A handful at a time, not all at once: the service rate-limits bursts, and
  // a wide fan-out is what made this fragile rather than fast.
  const CONCURRENCY = 4;
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    await Promise.all(pending.slice(i, i + CONCURRENCY));
  }

  return texts.map((text) => {
    const key = normalize(text);
    const hit = results.get(key);
    return hit || key || text;
  });
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

async function runTranslate(target) {
  markOriginals();

  const nodes = getTextNodes(document.body);

  for (const node of nodes) {
    const original = ORIGINAL_TEXT.get(node);
    if (original && original.trim()) {
      applyText(node, original);
    }
  }

  if (target === "en") {
    syncNavigationForLanguage();
    return;
  }

  // Collect the strings that actually need the service. The manual table is
  // consulted first, so the seven hand-written proper nouns never cost a
  // request, and duplicates are collapsed before anything is sent -- the
  // sidebar alone repeats the same handful of labels on every page.
  const manual = new Map();
  const toTranslate = [];

  for (const node of nodes) {
    const original = ORIGINAL_TEXT.get(node);
    if (!original || !original.trim()) continue;

    const key = normalize(original);
    const fixed = MANUAL_TRANSLATIONS[target]?.[key];
    if (fixed) {
      manual.set(key, fixed);
      continue;
    }
    if (!manual.has(key)) toTranslate.push(original);
  }

  // Protected proper nouns are substituted out before the join, so the
  // placeholder tokens themselves are never inside a batched payload where a
  // translator could reorder them.
  const protectedByKey = new Map();
  const sendable = toTranslate.map((text) => {
    const info = protectPhrases(text, target);
    protectedByKey.set(normalize(text), info.replacements);
    return info.output;
  });

  const translated = await translateMany(sendable, target);

  const finished = new Map(manual);
  toTranslate.forEach((original, i) => {
    let value = translated[i];
    const replacements = protectedByKey.get(normalize(original)) || [];
    value = restorePhrases(value, replacements);
    value = value.replace(/:\s*/g, ": ").replace(/,\s*/g, ", ").replace(/;\s*/g, "; ");
    value = value.replace(/:([^\s])/g, ": $1");
    finished.set(normalize(original), value);
  });

  // A newer pick landed while this run was in flight. Its results are the
  // wrong language, so stop rather than writing them; the caller restarts
  // against the newer one, which re-reads the originals and starts clean.
  if (pendingLang && pendingLang !== target) return;

  for (const node of nodes) {
    const original = ORIGINAL_TEXT.get(node);
    if (!original || !original.trim()) continue;
    const hit = finished.get(normalize(original));
    if (hit) applyText(node, hit);
  }

  syncNavigationForLanguage();
}

async function translatePage(lang) {
  // Default to the stored/current language so a caller that forgets the
  // argument degrades to the right behaviour instead of requesting
  // "tl=undefined" and silently restoring the original English.
  const target = lang || getCurrentLang();

  if (isTranslating) {
    pendingLang = target;
    return;
  }

  isTranslating = true;
  activeLang = target;

  try {
    do {
      const run = activeLang;
      pendingLang = null;
      await runTranslate(run);
      // Adopt the newer request only if it is genuinely a different language.
      // Clearing it when it matches is what stops the loop: an identical
      // request would otherwise restart a full page translation for nothing.
      if (pendingLang && pendingLang !== run) {
        activeLang = pendingLang;
      } else {
        pendingLang = null;
      }
    } while (pendingLang);
  } finally {
    isTranslating = false;
    activeLang = null;
    pendingLang = null;
  }
}

function setLang(lang) {
  localStorage.setItem("lang", lang);
  syncLanguageButtons();

  const size = getCurrentTextSize();
  const theme = getCurrentThemeName();

  const url = new URL(window.location.href);
  if (lang && lang !== "en") {
    url.searchParams.set("lang", lang);
  } else {
    url.searchParams.delete("lang");
  }
  if (size && size !== "medium" && size !== "custom") {
    url.searchParams.set("textsize", size);
  } else {
    url.searchParams.delete("textsize");
  }
  if (theme) {
    url.searchParams.set("theme", theme);
  } else {
    url.searchParams.delete("theme");
  }
  window.history.replaceState({}, "", url);

  // translatePage() takes the language to translate into. Called with no
  // argument it built its requests as "tl=undefined", every call to the
  // translation service failed, and the catch below quietly restored the
  // original English - so picking a language looked like it did nothing.
  translatePage(lang);

  // Confirm the pick on the settings page. This deliberately says only that
  // the choice was made, not that the text has already been translated: the
  // request happens after this, and with no network it never will, so a
  // "translated" message here would be a lie.
  const status = document.getElementById("lang-status");
  if (status) {
    const name = LANGS.find((l) => l.code === lang)?.name;
    status.textContent = name
      ? `Language set to ${name}. Text is translated once the page has loaded.`
      : "Language set.";
    status.dataset.kind = "success";
    status.classList.remove("section-hidden");
  }
}

// The language list is a grid inside the Language category now, not a panel
// with its own open/closed state, so nothing here hides itself. It used to set
// display:none on the container, which fought the category panel and left the
// buttons unclickable whenever the two disagreed.
function buildLanguageButtons() {
  const container = document.getElementById("lang-buttons");
  if (!container) return;

  container.innerHTML = "";

  LANGS.forEach(lang => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = lang.name;
    btn.dataset.lang = lang.code;
    btn.title = lang.code;
    btn.onclick = () => setLang(lang.code);
    container.appendChild(btn);
  });

  syncLanguageButtons();
}

// setLang writes the choice and re-renders, but nothing used to repaint the
// selected button afterwards, so the language you had just picked kept looking
// unselected until the page was reloaded.
function syncLanguageButtons() {
  const container = document.getElementById("lang-buttons");
  if (!container) return;

  const currentLang = getCurrentLang();

  container.querySelectorAll("button[data-lang]").forEach((btn) => {
    const on = btn.dataset.lang === currentLang;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

let navigationSyncFrame = 0;
// The live observer. initTranslate() runs on every visit to the settings page,
// not just on a document load, because the router swaps content without one.
// Without disconnecting the previous one, each visit left another observer
// watching the whole body, so the third visit to the page was walking every
// link and button in the document three times per mutation burst.
let navigationObserver = null;

function startNavigationObserver() {
  if (!document.body) return null;

  if (navigationObserver) {
    navigationObserver.disconnect();
    navigationObserver = null;
  }
  if (navigationSyncFrame) {
    cancelAnimationFrame(navigationSyncFrame);
    navigationSyncFrame = 0;
  }

  const observer = new MutationObserver(() => {
    // Dynamic content -- friend lists, notifications, the music player -- mutates
    // the body in bursts, and each pass walks every a[href] and button[onclick]
    // in the document. Coalesce a burst into one pass on the next frame instead
    // of re-walking the whole document per mutation.
    if (navigationSyncFrame) return;
    navigationSyncFrame = requestAnimationFrame(() => {
      navigationSyncFrame = 0;
      syncNavigationForLanguage();
    });
  });

  // childList only, on purpose. syncNavigationForLanguage() writes href and
  // onclick attributes, so adding attributes: true here would make the observer
  // retrigger on its own output forever.
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  navigationObserver = observer;
  return observer;
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
  if (size && size !== "medium" && size !== "custom") {
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
