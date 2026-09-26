// ========================================================
// Shared page entry point
// ========================================================
// Every content page loads exactly one script tag and nothing else:
//
//   <script type="module" src="../../js/page-imports.js"></script>
//
// This file is the single place shared code is wired up, so a page cannot
// accidentally load the sidebar without its behaviour code, or get the order
// wrong. Adding a page's own module is an entry in PAGE_MODULES below rather
// than another tag in its <head>.
//
// Order matters, and static imports guarantee it: a module's dependencies are
// evaluated depth-first in the order they are written, before the importing
// module's own body. So these lines run exactly top to bottom.
//
//   1. menu.js      renders the sidebar and publishes window.PanategwaRoot
//   2. site.js      binds sidebar behaviour to the rendered markup, so it must
//                   come after menu.js
//   3. achievements.js / social.js / music-system.js
//                   all consume the sidebar (the site-time display, the music
//                   slot), so they come after both of the above
//   4. settings.js  applies the stored text size / theme / language, which is
//                   why it goes last
//   5. router.js    last of all: it only acts on clicks and popstate, both of
//                   which happen after everything above has finished booting.
import "./menu.js";
import "./site.js";
import "../auth/achievements.js";
import "../auth/social.js";
import "../music/system/music-system.js";
import "../settings/settings.js";
import "./router.js";

// ========================================================
// Page-specific modules
// ========================================================
// Keyed by page FILENAME, because that is the only part of a URL that survives
// moving between depths in the tree, and it is the part the sidebar already
// compares against to mark the current page.
//
// These are deliberately dynamic rather than static imports. A static import
// would evaluate the module on every page, so auth/account.js would try to bind
// to controls that only exist on the account page.
//
// Each one is imported with a cache-busting query, because a plain import() of
// an already-evaluated URL is a no-op and navigating back to a page would leave
// it dead. The fresh instance re-runs its own start(), and the previous
// instance is torn down first -- see disposeRoute() in router.js, which calls
// the dispose function each module registers on window.PanategwaRouteDispose.
//
// To add a module to a page, add a line here. To give a brand new page a
// module of its own, add a new key.
var PAGE_MODULES = {
  "account-page.html": ["../auth/account.js", "../auth/settings.js"],
  "settings-page.html": ["../settings/audio-settings.js"],
  "streak-page.html": ["../auth/streak.js"]
};

var moduleToken = 0;

// The filename of the page currently in the address bar, matching how menu.js
// identifies the active page.
function currentPageFile() {
  var path = window.location.pathname.split("/").pop();
  return path || "index.html";
}

function loadPageModulesFor(pageFile) {
  var modules = PAGE_MODULES[pageFile];
  if (!modules || !modules.length) return;

  modules.forEach(function (path) {
    moduleToken += 1;
    import(path + "?r=" + moduleToken).catch(function (error) {
      // A page-specific module that fails must not take the page with it: the
      // content is already on screen and the shared shell is already running.
      console.error("page-imports: could not load " + path + " for " + pageFile, error);
    });
  });
}

// Published so router.js can ask for the destination page's modules after a
// client-side navigation. router.js is a static import above, so it cannot
// import this file back without a cycle; a hook is the way round that.
window.PanategwaLoadPageModules = loadPageModulesFor;

// First load. The shared modules above are already up by the time this runs,
// which is the ordering those page-specific modules rely on.
loadPageModulesFor(currentPageFile());
