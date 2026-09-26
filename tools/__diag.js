const PORT = 9222;
const BASE = "http://127.0.0.1:8799";
const LIFE = BASE + "/main-pages/panategwa-d/panategwa-d-life/panategwa-d-life-page.html";
const MAP = BASE + "/main-pages/panategwa-d/panategwa-d-map/panategwa-d-map-page.html";
const IDEO = BASE + "/main-pages/panategwa-d/panategwa-d-ideologies/panategwa-d-ideologies-page.html";
const HOME = BASE + "/main-pages/home/home-page.html";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (m, p) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  const ev = async (x) => {
    const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, userGesture: true });
    if (r.result && r.result.exceptionDetails) return "THREW " + ((r.result.exceptionDetails.exception || {}).description || "").split("\n")[0];
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await send("Runtime.enable"); await send("Page.enable");
  const nav = async (u, ms) => { await send("Page.navigate", { url: u }); await sleep(ms || 2600); };
  const cnav = async (u, ms) => { await ev('window.PanategwaNavigate(' + JSON.stringify(u) + ",'ok')"); await sleep(ms || 2200); };

  console.log("A. what button[onclick] elements does the life page actually have?");
  await nav(LIFE, 3000);
  console.log("   " + JSON.stringify(await ev('[...document.querySelectorAll("button[onclick]")].map(function(b){return b.getAttribute("onclick")})')));
  console.log("   inline-link buttons: " + await ev('document.querySelectorAll(".inline-link").length'));
  console.log("   their onclick:      " + JSON.stringify(await ev('[...document.querySelectorAll(".inline-link")].slice(0,6).map(function(b){return b.getAttribute("onclick")})')));
  console.log("   parent chain of one: " + JSON.stringify(await ev(
    '(function(){var b=document.querySelector(".inline-link");if(!b)return "none";var out=[],n=b;for(var i=0;i<5&&n;i++){out.push(n.tagName+(n.id?"#"+n.id:"")+(n.className?"."+n.className:""));n=n.parentElement;}return out;})()')));

  console.log();
  console.log("B. what does an incoming page see as location when its script runs?");
  await nav(HOME, 2500);
  await ev('window.__seen=[];(function(){var o=window.PanategwaNavigate;})()');
  // instrument: record location.search at the moment the incoming script first runs
  await ev(`(function(){
    var obs=new MutationObserver(function(){
      var s=document.createElement("script"); s.setAttribute("data-probe","1");
    });
    window.__probeSeen = null;
    var origAppend = Node.prototype.appendChild;
    Node.prototype.appendChild = function(child){
      if (child && child.tagName === "SCRIPT" && child.getAttribute && child.getAttribute("data-router-inline") !== null) {
        window.__probeSeen = location.href;
      }
      return origAppend.apply(this, arguments);
    };
  })()`);
  await cnav(IDEO + "?ideology=Pitosialism", 2600);
  console.log("   URL when the incoming inline script was inserted: " + await ev("window.__probeSeen"));
  console.log("   URL now:                                      " + await ev("location.href"));
  console.log("   ideologies rendered: " + JSON.stringify(await ev(
    '(document.getElementById("ideology-display")||{innerHTML:"EMPTY"}).innerHTML.slice(0,60)')));
  console.log("   go-back-btn display: " + JSON.stringify(await ev('(document.getElementById("go-back-btn")||{}).style')));

  console.log();
  console.log("C. the same deep link via a full load, for comparison");
  await nav(IDEO + "?ideology=Pitosialism", 2600);
  console.log("   ideologies rendered: " + JSON.stringify(await ev(
    '(document.getElementById("ideology-display")||{innerHTML:"EMPTY"}).innerHTML.slice(0,60)')));

  console.log();
  console.log("D. history entries around map -> life");
  await nav(MAP, 2800);
  console.log("   length after map load: " + await ev("history.length"));
  await ev('[...document.querySelectorAll("a.ethnotype")].filter(function(x){return /Pitosians/.test(x.dataset.ethnotype||"")})[0].click()');
  await sleep(2500);
  console.log("   after marker click: path=" + await ev("location.pathname") + " search=" + await ev("location.search"));
  console.log("   length=" + await ev("history.length") + " state=" + await ev("JSON.stringify(history.state)"));
  await ev("history.back()"); await sleep(2500);
  console.log("   after back: path=" + await ev("location.pathname"));
  console.log("   length=" + await ev("history.length"));

  ws.close(); process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
