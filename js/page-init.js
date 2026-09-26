// ========================================================
// Shared page entry point
// ========================================================
// Every content page loads exactly one script tag:
//
//   <script type="module" src="../../js/page-init.js"></script>
//
// and that pulls in everything the page needs in a fixed order. Keeping the list
// here rather than in each <head> means a page cannot accidentally load the
// sidebar without its behaviour code, or get the order wrong.
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
//
// Page-specific modules are deliberately NOT imported here. A page that needs
// one (account, settings, streak) keeps its own <script type="module"> tag after
// this one, so it still evaluates after everything above.
import "./menu.js";
import "./site.js";
import "../auth/achievements.js";
import "../auth/social.js";
import "../music/system/music-system.js";
import "../settings/settings.js";
import "./router.js";
