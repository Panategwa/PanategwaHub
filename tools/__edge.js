// Edge cases beyond the happy path.
const PORT = 9222;
const BASE = "http://127.0.0.1:8799";
const LIFE = BASE + "/main-pages/panategwa-d/panategwa-d-life/panategwa-d-life-page.html";
const MAP = BASE + "/main-pages/panategwa-d/panategwa-d-map/panategwa-d-map-page.html";
const IDEO = BASE + "/main-pages/panategwa-d/panategwa-d-ideologies/panategwa-d-ideologies-page.html";
const HOME = BASE + "/main-pages/home/home-page.html";
const D = BASE + "/main-pages/panategwa-d/panategwa-d-page/panategwa-d-page.html";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  let id = 0; const pend = new Map(); let errors = [];
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
    if (m.method === "Runtime.exceptionThrown") {
      const d = m.params.exceptionDetails;
      errors.push(String((d.exception && (d.exception.description || d.exception.value)) || d.text).split("\n")[0]);
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
  const nav = async (u, ms) => { await send("Page.navigate", { url: u }); await sleep(ms || 2500); };
  const cnav = async (u, ms) => { await ev('window.PanategwaNavigate(' + JSON.stringify(u) + ",\"'ok'\")"); await sleep(ms || 2000); };
  const mark = () => ev('(window.__k = "K" + Math.random(), window.__k)');

  // ---------------------------------------------------------------- 1
  console.log("== 1. a real click on an inline onclick that calls the published global ==");
  await nav(LIFE, 3000);
  const clicked = await ev(`(function(){
    var b=[...document.querySelectorAll('button[onclick]')].filter(function(x){return /goToEthnotype/.test(x.getAttribute("onclick"))})[0];
    if(!b) return "no such button";
    var label=b.textContent.trim();
    b.click();
    return label;
  })()`);
  await sleep(600);
  const afterEth = await ev('({t:document.getElementById("current-title").innerHTML.replace(/<[^>]+>/g,""),s:location.search})');
  check("clicking an ethnotype button navigated", /Rashooties/.test(afterEth.t), { clicked, ...afterEth });
  check("and set ?path=", /path=/.test(afterEth.s), afterEth.s);

  console.log();
  console.log("== 2. the map page's ethnotype links, as a user would ==");
  await nav(MAP, 2800);
  const mapLink = await ev(`(function(){
    var a=[...document.querySelectorAll("a.ethnotype")].filter(function(x){return /Pitosians/.test(x.dataset.ethnotype||"")})[0];
    if(!a) return "no link";
    a.click();
    return a.dataset.ethnotype;
  })()`);
  await sleep(2200);
  const afterMap = await ev('({p:location.pathname,s:location.search,t:(document.getElementById("current-title")||{innerHTML:""}).innerHTML.replace(/<[^>]+>/g,"")})');
  check("clicking a map marker routes to the life page", /panategwa-d-life/.test(afterMap.p), afterMap.p);
  check("and resolved the ethnotype", /Pitosians/.test(afterMap.t), { mapLink, ...afterMap });
  check("and normalised the URL to ?path=", /path=/.test(afterMap.s) && !/ethnotype=/.test(afterMap.s), afterMap.s);
  const backToMap = await ev("history.length");
  await ev("history.back()"); await sleep(2000);
  check("Back from there returns to the map", /panategwa-d-map/.test(await ev("location.pathname")), await ev("location.pathname"));

  console.log();
  console.log("== 3. the ideologies page through the router ==");
  await nav(D, 2500);
  await cnav(IDEO + "?ideology=Pitosialism", 2500);
  const ideo = await ev('({s:location.search,t:(document.getElementById("ideology-display")||{innerHTML:""}).innerHTML,back:(document.getElementById("go-back-btn")||{}).style})');
  check("?ideology= renders an ideology", /Pitosialism/.test(ideo.t), ideo.t.slice(0, 80));
  check("its Go Back button is shown", ideo.back && ideo.back.display === "block", ideo.back);
  const goBack = await ev('(function(){var b=document.getElementById("go-back-btn");b.click();return "clicked";})()');
  await sleep(2000);
  check("Go Back works", /panategwa-d-ideologies/.test(await ev("location.pathname")), await ev("location.pathname"));

  console.log();
  console.log("== 4. Back across different pages still routes ==");
  await nav(HOME, 2500);
  await cnav(D, 2200);
  const k4 = await mark();
  check("we are on the D page", /panategwa-d-page/.test(await ev("location.pathname")));
  await ev("history.back()"); await sleep(2200);
  check("Back returned to Home", /home-page/.test(await ev("location.pathname")), await ev("location.pathname"));
  check("and the sidebar is intact", (await ev('document.querySelectorAll("#menu-container a").length')) > 5);
  await ev("history.forward()"); await sleep(2200);
  check("Forward returns to the D page", /panategwa-d-page/.test(await ev("location.pathname")), await ev("location.pathname"));

  console.log();
  console.log("== 5. the advanced search panel ==");
  await nav(LIFE, 3000);
  const adv = await ev(`(function(){
    var t=document.getElementById("advanced-toggle"), p=document.getElementById("advanced-panel");
    var before=p.style.display; t.click();
    var after=p.style.display;
    var boxes=document.querySelectorAll("#exclude-options input").length;
    return {before:before, after:after, boxes:boxes};
  })()`);
  check("Advanced opens the panel", adv.before === "none" && adv.after === "block", adv);
  check("it lists one checkbox per rank", adv.boxes === 11, adv.boxes);

  // Excluding a rank must actually filter the search.
  const filtered = await ev(`(function(){
    var e=document.getElementById("search-bar");
    var before=0;
    e.value="a"; e.dispatchEvent(new Event("input",{bubbles:true}));
    before=document.getElementById("search-results").children.length;
    // uncheck the first rank (Domain)
    var cb=document.querySelectorAll("#exclude-options input")[0];
    cb.checked=false; cb.dispatchEvent(new Event("change",{bubbles:true}));
    var after=document.getElementById("search-results").children.length;
    var includeAll=document.getElementById("include-all");
    return {before:before, after:after, includeAllUnchecked: includeAll.checked===false};
  })()`);
  check("unchecking a rank re-filters the results", filtered.after < filtered.before, filtered);

  console.log();
  console.log("== 6. does changing the theme break in-page history? ==");
  await nav(LIFE, 3000);
  const themeProbe = await ev(`(function(){
    // emulate what color-theme.js does: replaceState with a bare {} state
    var u=new URL(location.href);
    window.history.replaceState({}, "", u.href);
    return {state:JSON.stringify(history.state), search:location.search};
  })()`);
  check("a bare replaceState does drop the ptg flag", themeProbe.state === "{}", themeProbe);
  // now: does Back still work after that?
  await ev('document.querySelectorAll("#taxonomy-container button")[0].click()'); await sleep(400);
  const beforeThemeBack = await ev("location.search");
  const reloaded = await ev('(window.__rel = "no-reload", "set")');
  await ev("history.back()"); await sleep(2000);
  const afterThemeBack = await ev('({s:location.search, kept: window.__rel === "no-reload"})');
  check("Back still moves to the previous rank", /path=/.test(beforeThemeBack) && !/path=/.test(afterThemeBack.s), { beforeThemeBack, ...afterThemeBack });
  check("but it did reload the document (the ptg flag was lost)", afterThemeBack.kept === false, afterThemeBack);

  console.log();
  console.log("== page errors ==");
  console.log("  " + (errors.length ? errors.join("\n  ") : "none"));
  console.log();
  console.log(fail === 0 ? "OK: " + pass + " checks passed" : "FAILED: " + fail + " of " + (pass + fail));
  ws.close(); process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("harness: " + e.message); process.exit(1); });
