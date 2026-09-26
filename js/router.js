// ========================================================
// Client-side router
// ========================================================
// The sidebar used to be re-rendered on every page load, which meant two visible
// problems:
//
//   1. Music stopped. The <audio> element is a JS variable in music-system.js,
//      never part of the document, so a real navigation threw it away and the
//      player had to start over on the next page.
//   2. The sidebar slid sideways on arrival. #menu-container is width: 280px in
//      menu.css with `transition: width`, and site.js applies your saved
//      menuWidth afterwards, so every load animated 280px -> saved width.
//
// Both are symptoms of the same cause: a full document load. This router turns
// an internal link click into a fetch plus a content swap, so #menu-container
// and every piece of JS state behind it -- the audio element, the site-time
// clock, the resize handle, the active-link state -- survive the navigation.
//
// Design notes worth knowing before editing this file:
//
//   * The 21 page files are untouched. A page is still a complete, standalone
//     document that works on its own, so direct links, no-JS, GitHub Pages and
//     tools/audit_links.py all keep behaving exactly as before.
//
//   * A new page needs no router wiring. The router applies whatever the
//     incoming page's own <head> declares, and page-specific modules come from
//     the PAGE_MODULES registry in page-imports.js, so the existing workflow
//     still holds: write the HTML, add it to the PAGES list in menu.js.
//
//   * Only the shell nodes are preserved. Every other child of <body> is the
//     page's own content and is replaced wholesale.
//
//   * Stylesheets are added and removed to match the incoming page, so
//     account.css follows you to the account page and leaves again.
//
//   * Both link clicks and the onclick="window.location.href='...'" buttons the
//     pages use are intercepted. A button that is left to the browser is a full
//     document load, which is the entire problem this file exists to avoid.

// Nodes that belong to the shell rather than to the page. The sidebar is the
// obvious one, but two modules append their own element straight to <body>:
// music-system.js puts the <audio> there, and toast.js puts the toast stack
// there. Both outlive a navigation by design -- the audio is the whole point of
// this file, and a toast that vanishes mid-click looks like a dropped message.
// Naming them here keeps the owning modules untouched.
var SHELL_NODE_IDS = ["menu-container", "ptg-site-music", "achievement-toast-stack"];

var managedStyles = [];
var navigations = 0;
var restoreFocus = true;

function isShellNode(node) {
  return !!node && !!node.id && SHELL_NODE_IDS.indexOf(node.id) !== -1;
}

function absolute(href, base) {
  try {
    return new URL(href, base || document.baseURI);
  } catch (e) {
    return null;
  }
}

function isSameSite(url) {
  return url.origin === window.location.origin;
}

// Only claims clicks that genuinely mean "go to that page". Anything the
// browser already handles in a special way is left alone.
function shouldHandleLink(anchor, event) {
  if (!anchor) return false;
  if (event.defaultPrevented) return false;
  if (event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;

  var rel = (anchor.getAttribute("rel") || "").toLowerCase();
  if (rel.indexOf("external") !== -1) return false;

  var target = (anchor.getAttribute("target") || "").trim().toLowerCase();
  if (target && target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;

  // menu.js marks the current page's own button aria-disabled. Let it block the
  // click rather than racing it, so the menu keeps full control of that case.
  if (anchor.closest('[aria-disabled="true"]')) return false;

  return true;
}

// ========================================================
// Navigation that is not a link
// ========================================================
// Most in-page navigation is `<button onclick="window.location.href='...'">`,
// not an <a href>. A button is invisible to a link-based click handler, so
// every one of them was still doing a full document load -- the sidebar rebuilt
// itself and the music restarted, which is exactly the bug this file removes.
// The Panategwa letter pages looked fine only because they are reached from the
// sidebar, which is made of links.
//
// The pattern is deliberately narrow: a location assignment to a quoted literal
// ending in .html. Anything computed, or a non-page URL, is left to run
// normally rather than guessed at. This also covers window.location.assign and
// .replace, and PanategwaGoTo(), which sets location.href internally.
var SCRIPTED_NAV = /(?:window\.)?location(?:\.href\s*=|\.assign\s*\(|\.replace\s*\()\s*['"]([^'"]+\.html(?:\?[^'"]*)?)['"]/i;

function scriptedNavigationTarget(element) {
  var node = element;

  // The handler may sit on the element or on an ancestor it is nested in.
  while (node && node !== document.body) {
    if (node.getAttribute) {
      var source = node.getAttribute("onclick");
      if (source) {
        var match = source.match(SCRIPTED_NAV);
        if (match) return match[1];
      }
    }
    node = node.parentNode;
  }

  return null;
}

// ========================================================
// Content swap
// ========================================================

// Everything in <body> that is not part of the shell. This is the page's own
// content and is replaced wholesale on every navigation.
function contentChildren(doc) {
  var out = [];
  for (var i = 0; i < doc.body.children.length; i++) {
    var node = doc.body.children[i];
    if (isShellNode(node)) continue;
    out.push(node);
  }
  return out;
}

function clearContent() {
  var nodes = contentChildren(document);
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i].parentNode) nodes[i].parentNode.removeChild(nodes[i]);
  }
}

function insertContent(doc) {
  var nodes = contentChildren(doc);
  for (var i = 0; i < nodes.length; i++) {
    document.body.appendChild(document.importNode(nodes[i], true));
  }
}

// ========================================================
// Per-route head
// ========================================================

// Swap stylesheets to match the incoming page. The three shared files are in
// every page, so they stay resident; page-only ones come and go. Without this,
// account.css would keep applying to the settings page.
function applyStyles(doc, pageUrl) {
  var wanted = [];
  var links = doc.querySelectorAll('link[rel="stylesheet"][href]');

  for (var i = 0; i < links.length; i++) {
    var url = absolute(links[i].getAttribute("href"), pageUrl);
    if (url) wanted.push(url.href);
  }

  for (var j = managedStyles.length - 1; j >= 0; j--) {
    var stale = managedStyles[j];
    if (wanted.indexOf(stale) === -1) {
      var el = document.querySelector('link[data-router-managed][href="' + stale + '"]');
      if (el && el.parentNode) el.parentNode.removeChild(el);
      managedStyles.splice(j, 1);
    }
  }

  for (var k = 0; k < wanted.length; k++) {
    if (document.querySelector('link[rel="stylesheet"][href="' + wanted[k] + '"]')) continue;
    if (!isSameSite(absolute(wanted[k]))) continue;

    var add = document.createElement("link");
    add.rel = "stylesheet";
    add.href = wanted[k];
    // Marks this link as ours, so the cleanup above never removes a
    // stylesheet the document itself put there.
    add.setAttribute("data-router-managed", "");
    document.head.appendChild(add);
    managedStyles.push(wanted[k]);
  }
}

// Inline scripts are not modules, so they re-run every time the element is
// inserted. That is what a page expects, and it is how the taxonomy page's
// data and the account page's deep-link handling come alive. They are inserted
// after the content so they can query it.
function runInlineScripts(doc, pageUrl) {
  var scripts = doc.querySelectorAll("script:not([src])");
  for (var i = 0; i < scripts.length; i++) {
    var text = scripts[i].textContent;
    if (!text || !text.trim()) continue;

    var el = document.createElement("script");
    el.textContent = text;
    // Marks it as ours so a later swap removes it with the content instead of
    // leaving a stale copy in the document.
    el.setAttribute("data-router-inline", "");
    document.body.appendChild(el);
  }
}

// The incoming page's own modules come from the PAGE_MODULES registry in
// page-imports.js rather than from its <head>, so every page can carry the
// single shared entry script and nothing else. page-imports.js cannot be
// imported back from here without a cycle, hence the hook.
function applyModules() {
  if (typeof window.PanategwaLoadPageModules !== "function") return;
  try {
    var path = window.location.pathname.split("/").pop();
    window.PanategwaLoadPageModules(path || "index.html");
  } catch (error) {
    console.error("Router: could not resolve modules for this page", error);
  }
}

function applyDocumentMeta(doc) {
  var title = doc.querySelector("title");
  if (title && title.textContent.trim()) {
    document.title = title.textContent.trim();
  }
}

// ========================================================
// Route teardown
// ========================================================

// Page-specific modules hold Firestore subscriptions and bind some listeners to
// document or body, so leaving one live across a navigation would double its
// handlers on the way back. They each register their existing dispose function
// under window.PanategwaRouteDispose, and this is where it gets called.
//
// Failures are isolated: one bad dispose must not block the navigation.
function disposeRoute() {
  var registry = window.PanategwaRouteDispose;
  if (!registry) return;

  Object.keys(registry).forEach(function (key) {
    var fn = registry[key];
    if (typeof fn !== "function") return;
    try {
      fn();
    } catch (error) {
      console.error("Router: dispose failed for " + key, error);
    }
  });

  window.PanategwaRouteDispose = {};
}

// ========================================================
// Navigation
// ========================================================

function moveFocus() {
  if (!restoreFocus) return;

  // The old document scrolled away with the old content, so the viewport is
  // already at the top. Focusing with preventScroll keeps it there and stops
  // the browser jumping to whatever happens to be first in the new page.
  var target = document.querySelector("#page-content h1")
    || document.querySelector("h1")
    || document.body;

  if (!target) return;
  if (!target.hasAttribute("tabindex")) {
    target.setAttribute("tabindex", "-1");
  }
  try {
    target.focus({ preventScroll: true });
  } catch (e) {
    target.focus();
  }
}

function updateActiveLink() {
  // menu.js owns which menu entry is current; it only ever ran on first load,
  // so ask it to re-evaluate now that location has changed.
  if (typeof window.PanategwaHighlightActive === "function") {
    try {
      window.PanategwaHighlightActive();
    } catch (error) {
      console.error("Router: active link update failed", error);
    }
  }
}

function onRouteReady(push) {
  updateActiveLink();
  moveFocus();
  if (push) {
    window.scrollTo(0, 0);
  }
}

function navigate(url, options) {
  var opts = options || {};
  if (navigations > 0) return;

  navigations += 1;
  disposeRoute();

  fetch(url.href, { credentials: "same-origin", headers: { Accept: "text/html" } })
    .then(function (response) {
      // A redirect or an error page would leave the document describing a
      // different site than the address bar, so fall back to a real load.
      if (!response.ok) throw new Error("HTTP " + response.status);
      if (response.redirected) throw new Error("redirected");
      return response.text();
    })
    .then(function (html) {
      var doc = new DOMParser().parseFromString(html, "text/html");

      clearContent();
      applyStyles(doc, url.href);
      insertContent(doc);
      applyDocumentMeta(doc);
      runInlineScripts(doc, url.href);

      restoreFocus = opts.restoreFocus !== false;
      if (!opts.silent) {
        if (opts.history === "push") {
          window.history.pushState({ ptg: true, y: 0 }, "", url.href);
        }
        window.scrollTo(0, 0);
      }

      // After the URL has moved, so relative paths in the new page resolve
      // against the new location.
      applyModules();
      onRouteReady(false);
    })
    .catch(function (error) {
      // Anything unexpected here is safer as a real navigation: the user ends
      // up on a page that definitely works rather than a half-swapped document.
      console.error("Router: falling back to a full load for " + url.href, error);
      window.location.href = url.href;
    })
    .then(function () {
      navigations -= 1;
    });
}

// Resolves a candidate destination and either navigates or decides it is not a
// route after all. Shared by the link path and the scripted path.
function handleRoute(url, event) {
  // A bare #fragment is a jump within this page, not a route. Let it through
  // unless the target is missing, in which case the top of the page is the
  // most useful interpretation.
  if (url.pathname === window.location.pathname && url.search === window.location.search) {
    if (url.hash && document.getElementById(decodeURIComponent(url.hash.slice(1)))) {
      return;
    }
    if (url.hash) {
      event.preventDefault();
      window.scrollTo(0, 0);
      window.history.replaceState({ ptg: true, y: 0 }, "", url.href);
    }
    return;
  }

  // index.html is the site-root stub that forwards to the home page. Route
  // around it so entering the site root does not cost a full load.
  if (/\/index\.html$/.test(url.pathname)) {
    url = new URL("main-pages/home/home-page.html", window.PanategwaRoot || url.origin);
  }

  // Same page, different fragment: nothing to fetch.
  if (url.pathname === window.location.pathname && url.search === window.location.search) return;

  event.preventDefault();
  navigate(url, { history: "push" });
}

function onDocumentClick(event) {
  var anchor = event.target.closest ? event.target.closest("a[href]") : null;
  if (!anchor || !shouldHandleLink(anchor, event)) return;

  var url = absolute(anchor.getAttribute("href"));
  if (!url || !isSameSite(url)) return;

  handleRoute(url, event);
}

// Runs in the capture phase, which is the only way to stop an inline onclick:
// by the time a bubble-phase listener sees the click, the element's own handler
// has already assigned to location.href and the document is already unloading.
//
// Capture on document also runs before menu.js's own capture listener on
// #menu-container, so it deliberately ignores links entirely and leaves the
// anchor path to onDocumentClick above. That ordering is what stops this from
// stealing clicks on the current page's inert menu button.
function onScriptedClick(event) {
  if (event.defaultPrevented) return;
  if (event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  var scripted = scriptedNavigationTarget(event.target);
  if (!scripted) return;

  var url = absolute(scripted);
  if (!url || !isSameSite(url)) return;

  // Claim it before the handler can run, then route it.
  event.preventDefault();
  event.stopPropagation();
  handleRoute(url, event);
}

function onPopState(event) {
  var state = event.state || {};
  if (!state.ptg) {
    // A real history entry from before the router existed, or a back out of
    // the site entirely. Let the browser handle it.
    window.location.href = window.location.href;
    return;
  }
  var url = absolute(window.location.href);
  if (url) navigate(url, { history: "none" });
}

window.PanategwaNavigate = function (href) {
  var url = absolute(href);
  if (url && isSameSite(url)) {
    navigate(url, { history: "push" });
  } else if (url) {
    window.location.href = url.href;
  }
};

document.addEventListener("click", onDocumentClick);
document.addEventListener("click", onScriptedClick, true);
window.addEventListener("popstate", onPopState);

// A page reached by a real load leaves a history entry the router did not
// create. Mark it so a later Back knows to defer to the browser.
window.history.replaceState({ ptg: true, y: window.scrollY }, "", window.location.href);
