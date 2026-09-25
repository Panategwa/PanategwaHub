// Headless sanity check for js/menu.js: renders the sidebar for pages at
// different depths and confirms links, active state, and the inert button.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "menu.js"), "utf8");

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

  const window = { location: { pathname: pagePath, href: "http://x" + pagePath } };
  vm.runInContext(source, vm.createContext({ window, document, console, Array, Math, Object, String }));

  pageAnchors = pageAnchors || parseAnchors("menu-button");
  iconAnchors = iconAnchors || parseAnchors("menu-icon-button");

  return { window, html: container.innerHTML, pageAnchors, iconAnchors };
}

const cases = [
  { path: "/main-pages/home/home-page/index.html", depth: 3, active: "index.html" },
  { path: "/main-pages/panategwa-d/panategwa-d-page/panategwa-d-page.html", depth: 3, active: "panategwa-d-page.html" },
  { path: "/main-pages/panategwa-d/panategwa-d-map/panategwa-d-map-page.html", depth: 3, active: null },
  { path: "/main-pages/account/account-page.html", depth: 2, active: "account-page.html" },
  { path: "/main-pages/settings/settings-page.html", depth: 2, active: "settings-page.html" },
  { path: "/streak-page.html", depth: 0, active: "streak-page.html" }
];

let failures = 0;
for (const test of cases) {
  const prefix = "../".repeat(test.depth);
  const { window, html, pageAnchors, iconAnchors } = run(test.path);

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
    if (!target.startsWith(prefix) || !target.includes("main-pages/")) {
      console.log("FAIL link not correctly rooted:", target, "at", test.path);
      failures++;
      break;
    }
  }

  for (const need of ["settings-page.html", "account-page.html", "streak-page.html"]) {
    if (!html.includes(prefix + need)) {
      console.log("FAIL icon link missing or mis-rooted:", prefix + need, "at", test.path);
      failures++;
    }
  }

  if (window.PanategwaRoot !== prefix) {
    console.log("FAIL PanategwaRoot =", JSON.stringify(window.PanategwaRoot), "expected", JSON.stringify(prefix));
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
console.log("OK: menu renders with correct depth prefixes, active state, and inert current-page button");
