// Full-site sweep: loads every page fresh, then reaches it again through the
// router, and reports any page error. The block-wrap change to the router
// affects every page with an inline script, so nothing here is assumed.
const fs = require("fs");
const path = require("path");
const PORT = 9222;
const BASE = "http://127.0.0.1:8799";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}
const ROOT = path.join(__dirname, "..");
const PAGES = walk(path.join(ROOT, "main-pages"), []).map((p) => "/" + path.relative(ROOT, p).replace(/\\/g, "/"));

let pass = 0, fail = 0;
const check = (n, c, d) => {
  if (c) { pass++; console.log("  PASS  " + n); }
  else { fail++; console.log("  FAIL  " + n + (d !== undefined ? "   <- " + JSON.stringify(d) : "")); }
};

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const l = await (await fetch("http://127.0.0.1:" + PORT + "/json/list")).json();
      const p = l.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (p) return p;
    } catch (e) {}
    await sleep(500);
  }
  throw new Error("no target");
}

(async () => {
  const t = await target();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  let errors = [];
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
    if (m.method === "Runtime.exceptionThrown") {
      const d = m.params.exceptionDetails;
      errors.push(String((d.exception && (d.exception.description || d.exception.value)) || d.text).split("\n")[0]);
    }
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
      errors.push("console.error: " + m.params.args.map((a) => a.description || a.value).join(" ").split("\n")[0]);
    }
  };
  const send = (m, p) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  const ev = async (x) => {
    const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, userGesture: true });
    if (r.result && r.result.exceptionDetails) return "THREW " + ((r.result.exceptionDetails.exception || {}).description || "").split("\n")[0];
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await send("Runtime.enable");
  await send("Page.enable");

  const HOME = BASE + "/main-pages/home/home-page.html";
  const health = `(function(){
    var m=document.getElementById("menu-container");
    return {
      menu: !!m && m.querySelectorAll("a").length,
      title: document.title,
      bodyLen: document.body.innerHTML.length,
      styles: [...document.querySelectorAll('link[rel=stylesheet]')].map(function(l){return l.getAttribute("href")})
    };
  })()`;

  console.log("=== every page, fresh load ===");
  const fresh = {};
  for (const p of PAGES) {
    errors = [];
    await send("Page.navigate", { url: BASE + p });
    await sleep(1600);
    const h = await ev(health);
    fresh[p] = h;
    const bad = errors.filter((e) => !/Failed to load resource|favicon|net::ERR/i.test(e));
    check(p.replace("/main-pages/", "") + " loads with a sidebar and no errors",
      h && h.menu > 0 && h.bodyLen > 200 && bad.length === 0, { menu: h && h.menu, err: bad });
  }

  console.log();
  console.log("=== every page, reached again through the router (twice) ===");
  for (const p of PAGES) {
    errors = [];
    await send("Page.navigate", { url: HOME });
    await sleep(1500);
    await ev('window.PanategwaNavigate(' + JSON.stringify(BASE + p) + ")");
    await sleep(1700);
    await ev('window.PanategwaNavigate("' + HOME + '")');
    await sleep(1200);
    await ev('window.PanategwaNavigate(' + JSON.stringify(BASE + p) + ")");
    await sleep(1700);
    const h = await ev(health);
    const redecl = errors.filter((e) => /already been declared/.test(e));
    const other = errors.filter((e) => !/Failed to load resource|favicon|net::ERR/i.test(e));
    check(p.replace("/main-pages/", "") + " survives two client-side visits",
      h && h.menu > 0 && redecl.length === 0 && other.length === 0, { err: other.slice(0, 2) });
  }

  console.log();
  console.log("=== stylesheets follow the route ===");
  await send("Page.navigate", { url: HOME }); await sleep(1500);
  const before = (await ev(health)).styles;
  await ev('window.PanategwaNavigate("' + BASE + "/main-pages/account/account-page.html" + '")');
  await sleep(1800);
  const onAccount = (await ev(health)).styles;
  check("account.css is added on the account page",
    onAccount.some((s) => s && s.indexOf("account.css") !== -1) && !before.some((s) => s && s.indexOf("account.css") !== -1),
    { before, onAccount });
  await ev('window.PanategwaNavigate("' + HOME + '")');
  await sleep(1800);
  const backHome = (await ev(health)).styles;
  check("and removed again on the way back", !backHome.some((s) => s && s.indexOf("account.css") !== -1), backHome);

  console.log();
  console.log(fail === 0 ? "OK: " + pass + " checks passed" : "FAILED: " + fail + " of " + (pass + fail));
  ws.close(); process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("harness: " + e.message); process.exit(1); });
