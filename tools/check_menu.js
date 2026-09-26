// Headless sanity check for js/menu.js: renders the sidebar for pages at
// different depths and confirms links, active state, and the inert button.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// The site is served from https://panategwa.github.io/PanategwaHub/, so the real
// module tag resolves menu.js to an absolute URL. That is what the module reads
// as import.meta.url, and what a browser would hand document.currentScript.src
// back when this file was a classic script.
const SCRIPT_URL = "https://panategwa.github.io/PanategwaHub/js/menu.js";
const ROOT_URL = "https://panategwa.github.io/PanategwaHub/";

// menu.js is an ES module, so it reads its own location from import.meta.url.
// vm.runInContext parses as a classic script, where import.meta is a syntax
// error, so substitute the URL literal before running. The assertion below keeps
// that substitution honest: if menu.js ever stops using import.meta.url, the
// substitution would silently stop matching and this test would pass for the
// wrong reason.
const raw = fs.readFileSync(path.join(__dirname, "..", "js", "menu.js"), "utf8");
const source = raw.replace(/import\.meta\.url/g, JSON.stringify(SCRIPT_URL));
if (!/import\.meta\.url/.test(raw)) {
  console.error("FAIL js/menu.js no longer reads import.meta.url - update this harness");
  process.exit(1);
}

function makeElement() {
  const el = {
    className: "",
    innerHTML: "",
    attrs: {},
    classes: new Set(),
    setAttribute(k, v) { el.attrs[k] = v; },
    removeAttribute(k) { delete el.attrs[k]; },
    getAttribute(k) { return k in el.attrs ? el.attrs[k] : null; },
    addEventListener() {},
    querySelectorAll: () => []
  };
  el.classList = {
    add: (c) => el.classes.add(c),
    remove: (c) => el.classes.delete(c),
    toggle: (c, on) => (on ? el.classes.add(c) : el.classes.delete(c)),
    contains: (c) => el.classes.has(c)
  };
  return el;
}

function run(pagePath) {
  const container = makeElement();
  container.attrs.id = "menu-container";

  // The real script tag resolves menu.js to an absolute URL, which is what the
  // browser hands to document.currentScript.src.
  const root = ROOT_URL;

  let pageAnchors = null;
  let iconAnchors = null;

  function parseAnchors(filter) {
    const found = [];
    const re = /<a href="([^"]+)" class="([^"]*)" data-target-page="([^"]+)"/g;
    let m;
    while ((m = re.exec(container.innerHTML)) !== null) {
      if (filter && m[2].indexOf(filter) === -1) continue;
      const el = makeElement();
      el.setAttribute("data-target-page", m[3]);
      found.push(el);
    }
    return found;
  }

  const document = {
    readyState: "complete",
    documentElement: { style: { setProperty() {} } },
    getElementById: (id) => (id === "menu-container" ? container : null),
    querySelectorAll: (sel) => {
      if (sel === ".menu-button") {
        if (!pageAnchors) pageAnchors = parseAnchors("menu-button");
        return pageAnchors;
      }
      if (sel === ".menu-icon-button") {
        if (!iconAnchors) iconAnchors = parseAnchors("menu-icon-button");
        return iconAnchors;
      }
      return [];
    },
    addEventListener() {},
    createElement: makeElement
  };

  const window = { location: { pathname: pagePath, href: "https://panategwa.github.io/PanategwaHub" + pagePath } };
  vm.runInContext(source, vm.createContext({ window, document, console, Array, Math, Object, String, URL }));

  pageAnchors = pageAnchors || parseAnchors("menu-button");
  iconAnchors = iconAnchors || parseAnchors("menu-icon-button");

  return { window, html: container.innerHTML, pageAnchors, iconAnchors, root };
}

const cases = [
  { path: "/main-pages/home/home-page.html", active: "home-page.html" },
  { path: "/main-pages/panategwa-d/panategwa-d-page.html", active: "panategwa-d-page.html" },
  { path: "/main-pages/panategwa-d/panategwa-d-map-page.html", active: null },
  { path: "/main-pages/account/account-page.html", active: "account-page.html" },
  { path: "/main-pages/settings/settings-page.html", active: "settings-page.html" }
];

let failures = 0;
for (const test of cases) {
  const { window, html, pageAnchors, iconAnchors, root } = run(test.path);

  if (!html.includes('id="menu-container"') && !html.includes("menu-scroll")) {
    console.log("FAIL sidebar not rendered at", test.path);
    failures++;
  }

  if (pageAnchors.length !== 8) {
    console.log("FAIL expected 8 menu links, got", pageAnchors.length, "at", test.path);
    failures++;
  }

  for (const el of pageAnchors) {
    const target = el.getAttribute("data-target-page");
    // The site is served from https://panategwa.github.io/PanategwaHub/, so
    // every link must be absolute and keep the /PanategwaHub/ prefix. A
    // "../../"-style relative link would climb out of the repo.
    if (!target.startsWith(root) || !target.includes("main-pages/")) {
      console.log("FAIL link not rooted at the site root:", target, "at", test.path);
      failures++;
      break;
    }
  }

  for (const need of ["main-pages/settings/settings-page.html", "main-pages/account/account-page.html", "main-pages/streak/streak-page.html"]) {
    if (!html.includes(root + need)) {
      console.log("FAIL icon link missing or mis-rooted:", root + need, "at", test.path);
      failures++;
    }
  }

  if (window.PanategwaRoot !== root) {
    console.log("FAIL PanategwaRoot =", JSON.stringify(window.PanategwaRoot), "expected", JSON.stringify(root));
    failures++;
  }

  if (test.active) {
    const all = pageAnchors.concat(iconAnchors);
    const active = all.filter((a) => a.getAttribute("aria-current") === "page");
    const current = all.filter((a) => {
      const t = a.getAttribute("data-target-page") || "";
      return t.split("/").pop() === test.active;
    });
    if (active.length !== 1) {
      console.log("FAIL expected 1 aria-current, got", active.length, "at", test.path);
      failures++;
    } else if (current.length === 0) {
      console.log("FAIL current page not represented in the menu at", test.path);
      failures++;
    } else if (current[0].getAttribute("aria-disabled") !== "true") {
      console.log("FAIL current page control is not aria-disabled at", test.path);
      failures++;
    }
  }
}

if (failures) {
  console.log(failures + " failure(s)");
  process.exit(1);
}
console.log("OK: menu links are absolute and keep the /PanategwaHub/ mount, with correct active state and an inert current-page button");
