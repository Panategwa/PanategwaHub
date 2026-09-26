# AGENTS.md — Panategwa Hub Development Guide

## Project Overview

The Panategwa Hub is a static HTML/CSS/JS website with Firebase Auth + Firestore backend.
Each page is a standalone HTML file with static navigation via normal `<a href>` links.

Content pages live under `main-pages/<body>/`, so the repo root only holds the
shared asset folders plus a small `index.html` entry stub. That stub is what makes
`https://panategwa.github.io/PanategwaHub/` land on the home page: GitHub Pages
serves static files only and has no redirect rule, so the stub meta-refreshes to
`main-pages/home/home-page.html`. If the home page ever moves, update the stub's
`url=` and `location.replace` targets, or the site root will 404.

```
main-pages/
  home/home-page.html
  account/account-page.html
  settings/settings-page.html
  streak/streak-page.html
  panategwa/panategwa-page/panategwa-page.html
  panategwa-b/panategwa-b-page/panategwa-b-page.html
  panategwa-c/panategwa-c-page/panategwa-c-page.html
  panategwa-d/
    panategwa-d-page/panategwa-d-page.html
    panategwa-d-map/panategwa-d-map-page.html
    panategwa-d-life/panategwa-d-life-page.html
    panategwa-d-ideologies/panategwa-d-ideologies-page.html
    pitons/pitons-page.html
    empire-of-pitosia/empire-of-pitosia-page.html
    thrinsachelom-history/thrinsachelom-history-page.html
    bathythalassas-gigaperipatitis/bathythalassas-gigaperipatitis-page.html
    tri-panategwaoi-anthropoi-civilis/tri-panategwaoi-anthropoi-civilis-page.html
  panategwa-e/
    panategwa-e-page/panategwa-e-page.html
    dendrospheres/dendrospheres-page.html
  panategwa-f/panategwa-f-page/panategwa-f-page.html
  panategwa-g/panategwa-g-page/panategwa-g-page.html
```

### Page Depth

Depth is **not** uniform, and the majority of pages are the deeper case. The four
non-planet pages — `home`, `account`, `settings`, `streak` — sit directly at
`main-pages/<body>/<page>.html`, two levels deep, so their asset references in
`<head>` are prefixed with `../../`. Every planet page lives in its own folder,
`main-pages/<body>/<page>/<page>.html`, three levels deep, so those use `../../../`,
and a link to a sibling page goes through `../<page>/<page>.html`.
`tools/verify_site.py` derives the expected prefix from `rel_path.count("/")`, so
it enforces whichever depth a page actually sits at; moving a page between the two
layouts needs no tool change, only the page's own relative paths updated.

Those relative paths are fine on their own: the browser resolves them against the
current page's URL, which already includes the mount point.

What is *not* fine is rebuilding the site root by counting `../` segments, because
the site is published under a subpath
(`https://panategwa.github.io/PanategwaHub/`). Climbing out of
`/PanategwaHub/main-pages/panategwa-b/` yields `/`, not `/PanategwaHub/`, so links
would land on `https://panategwa.github.io/main-pages/...`. `js/menu.js` therefore
derives the root from `document.currentScript.src` — its own URL always ends in
`/js/menu.js`, so trimming those two segments gives the real root on any mount path
or page depth — and publishes it as an absolute URL on `window.PanategwaRoot`.
Any module that builds a URL to another page or asset
(`settings/settings.js`, `auth/account.js`, `auth/social.js`, `auth/streak.js`,
`auth/achievements.js`) must prefix it with `window.PanategwaRoot`. Because that
value is absolute rather than `"../../"`-style, the module may be included from
anywhere in the tree.

Account, settings, and streak live under `main-pages/`, not at the repo root, so
build their URLs as `PanategwaRoot + "main-pages/<name>/<name>-page.html"`.

Navigation targets appear in three forms, and all three break independently if their
paths go stale:
1. `href` / `src` attributes in HTML,
2. inline `location.href` / `location.replace` / `window.open` targets in `onclick`,
3. page URLs built inside JS modules.

### Verification

Run all three before committing; they catch different classes of breakage:

- `python tools/verify_site.py` — structure, depth prefixes, the entry stub
- `node tools/check_menu.js` — renders the sidebar headlessly at several page paths
  and asserts every link is absolute and keeps the `/PanategwaHub/` mount prefix
- `python tools/audit_links.py` — every link, button and menu entry; also reports
  orphan pages that nothing links to
- `python tools/check_http.py` — same, but over HTTP (needs `python -m http.server`)

## Firestore Rules

`firestore.rules` is the record of what the live rules should be. It is kept in the
repo so the rules can be copied into the Firebase console, and the console copy is
kept in sync with it by hand.

Agents must not publish rules. If you edit `firestore.rules`, say so and spell out
what needs to change in the console — the maintainer applies it manually. Deploying
is never part of a code change here.

## Architecture

### Client-Side Routing

`js/router.js` turns an internal link click into a `fetch` plus a content swap, so
the document is never reloaded and the sidebar is never rebuilt. It is imported
last by `js/page-imports.js`, and it is the only reason music survives navigation: the
`<audio>` element in `music-system.js` is a JS variable rather than part of the
markup, so a real page load used to throw it away mid-track.

The swap keeps the three nodes that belong to the shell and replaces everything
else in `<body>`:

| Node | Owner | Why it must survive |
| --- | --- | --- |
| `#menu-container` | `js/menu.js` | the sidebar itself |
| `#ptg-site-music` | `music/system/music-system.js` | the audio element, appended to `<body>` |
| `#achievement-toast-stack` | `auth/toast.js` | the toast host, also appended to `<body>` |

They are listed in `SHELL_NODE_IDS` in `js/router.js`. **If a new module appends a
node straight to `document.body` and expects it to outlive navigation, add its id
there**, or it will be destroyed on the first navigation.

Stylesheets are added and removed to match the incoming page, and inline scripts
are re-executed, both read from the fetched page's own `<head>`. **A new page
needs no router wiring** — the existing workflow still holds: write the HTML, add
it to the `PAGES` list in `menu.js`.

#### Inline scripts and re-execution

A re-executed classic script runs in the *same* document, and a top-level
`const`/`let`/`class` is declared in the shared global lexical environment,
which cannot be emptied. Re-inserting a page's own script therefore threw
`SyntaxError: Identifier 'x' has already been declared` the second time the page
was reached, and the whole script died before it attached anything. That is what
made the taxonomy explorer's search bar appear dead: the page rendered once, then
went blank on the next visit.

So the router wraps every re-inserted script's source in a block, which gives
those declarations block scope and makes each run independent. Two consequences
for anyone writing a page with an inline script:

- **A function the markup calls from an inline `onclick` is no longer a global.**
  Publish it: `window.showMap = showMap;`. The three pages that need this are the
  D map page (`showMap`), the D life page (`goToEthnotype`) and the ideologies
  page (`goBack`).
- **Wrapping the page's own script in an IIFE is still worth doing**, so the page
  does not depend on the router being there. The account page and the taxonomy
  page both do this.

`var` and function declarations are unaffected by the collision, but prefer the
IIFE for consistency.

A `popstate` that only changes the query string is treated as the page restoring
its own state, not as a navigation: the router leaves it alone instead of
refetching and re-swapping the same page. That is what lets a page keep its own
history entries — see the taxonomy page's `?path=` — without every Back press
rebuilding the document. A page listening for `popstate` must therefore not write
the URL back out, or it will trap the user in entries they cannot leave.

Page-specific modules come from the `PAGE_MODULES` registry inside
`js/page-imports.js`, keyed by page filename, so no page carries a second
`<script type="module">` tag and `page-imports.js` is the only file anyone has
to edit. They are imported with a cache-busting query, because a plain
`import()` of an already-evaluated URL is a no-op and the destination page would
come up dead. Because those fresh instances re-attach `document`- and
`window`-level listeners and Firestore subscriptions, each page-specific module
registers its existing dispose function:

```js
window.PanategwaRouteDispose = window.PanategwaRouteDispose || {};
window.PanategwaRouteDispose.account = disposeAccountModule;
```

which the router calls on route leave. **A new page-specific module must do the
same**, and any listener it adds to `document` or `window` must be pushed onto its
own unsub list — a listener on an element inside the page is removed with the
content, but one on `document.body` is not.

The router falls back to a real `location.href` navigation if the fetch fails,
so a broken or redirected response lands the user on a working page rather than a
half-swapped document.

Not all navigation is a link. Most of it in the pages is
`<button onclick="window.location.href='...'">`, which a link-based handler never
sees, so `onScriptedClick` listens in the **capture** phase and matches a narrow
pattern: a location assignment to a quoted literal ending in `.html`. Capture is
required because by the time a bubble-phase listener runs, the inline handler has
already assigned to `location.href` and the document is already unloading. It
deliberately ignores anchors, leaving those to the bubble-phase path, because
document-level capture also runs before `menu.js`'s own capture listener on
`#menu-container` and would otherwise steal clicks on the current page's inert
menu button. **A new scripted navigation that computes its URL will not be
matched** and will do a full page load, so write the literal path instead.

Pages remain complete standalone documents. Direct links, no-JS, GitHub Pages and
`tools/audit_links.py` all behave exactly as before, because each page still works
when loaded directly — the router is an enhancement layered on top.

### Multi-Page Static Navigation

1. **`js/menu.js`** — Owns the entire sidebar: the `PAGES` list, the icons, the
   rendered markup, and active link highlighting. Every page includes it and holds
   only an empty `<div id="menu-container"></div>`, so the menu is edited in one place.
2. **`js/site.js`** — Handles dynamic sidebar behavior: avatar rendering, site time
   display, and the sidebar resize handle. Also provides `window.PanategwaGoTo(href)`
   which simply sets `window.location.href`.
3. **`styles/`** — Site styles, split into five files (see Stylesheet Layout).
   `styles/menu.css` carries the fixed sidebar layout (`#menu-container` at 280px
   default width, `body` padding-left: 280px).
4. **Shared sidebar** — Rendered at runtime by `js/menu.js`; no page inlines menu markup.

### Script Includes

Every content page loads exactly one shared script:

```html
<script type="module" src="../../js/page-imports.js"></script>
```

`js/page-imports.js` statically imports the shared modules, in this order, and static
imports evaluate depth-first in source order, so the order below is guaranteed
rather than dependent on `<head>` layout:

1. **`js/menu.js`** — Renders the sidebar, highlights the active link, publishes
   `window.PanategwaRoot`
2. **`js/site.js`** — Sidebar behavior (avatar, site time, resize handle). Must come
   after `menu.js` so the markup exists before behavior attaches to it
3. **`auth/achievements.js`** — Achievement system (self-initializing on DOMContentLoaded)
4. **`auth/social.js`** — Friends/messages system (self-initializing on import)
5. **`music/system/music-system.js`** — Music player (self-initializing on DOMContentLoaded)
6. **`settings/settings.js`** — Settings bootstrap; loads translate.js, text-size.js,
   color-theme.js as classic scripts, because those declare global init functions
   (`initTranslate`, `initTextSize`, `initTheme`) that inline `onclick` handlers call

7. **`js/router.js`** — Client-side routing (see Client-Side Routing). Last, because
   it only acts on clicks and `popstate`, both of which happen after everything
   above has booted.

`menu.js`, `site.js`, `router.js` and `settings/settings.js` are all ES modules.
`menu.js` and `router.js` have no imports at all, so both keep working even if the
Firebase CDN is unreachable. `menu.js` reads its
own location from `import.meta.url`, not `document.currentScript` (which is `null` in a
module). `settings.js` still resolves its dynamic script paths through
`window.PanategwaRoot`, which is why it must come after `menu.js`.

### Page-Specific Modules

Page-specific modules live in the `PAGE_MODULES` registry in
`js/page-imports.js`, keyed by page filename, and are loaded dynamically so they
evaluate only on the page that needs them — after everything the shared imports
above have already booted:

- **`account-page.html`** → `auth/account.js`, `auth/settings.js`
- **`settings-page.html`** → `settings/audio-settings.js`
- **`streak-page.html`** → `auth/streak.js`

**A page carries exactly one `<script type="module">` tag**, the one pointing at
`page-imports.js`. `tools/verify_site.py` fails the build if a page has a second
module tag or references a shared module directly, so the entry file stays the
only place shared code is wired up.

### Sidebar Menu

The sidebar (`#menu-container`) is present on every page, rendered at runtime by
`js/menu.js`, with this structure:

- Header: title, subtitle, site time (`#menu-site-time`)
- Music slot (`#menu-music-slot`) — populated by music-system.js
- Icon buttons: settings, account (avatar), streak, top (scroll to top)
- Page links in a single column: Home, Panategwa (the G5V star), then the planets
  Panategwa b–g. These are the only menu destinations; the D-Map, D-Life,
  D-Ideologies, Pitons, Tri-Panats, Empire of Pitosia, Dendrospheres, Bathythalassas
  and Thrinsachelom pages stay reachable only via direct links and in-page buttons.
- Right-edge resize handle (`#resize-handle`, `aria-orientation="vertical"`) —
  drag or arrow keys

Active link highlighting is handled by `js/menu.js` comparing the current page filename
to each link's `data-target-page` attribute. The button for the page you are already on
gets `aria-current="page"` and `aria-disabled="true"`, which makes it inert: no clicks,
no hover styling, but still keyboard-focusable.

### Stylesheet Layout

Site styles live in `styles/`, split so a page only downloads what it renders.
They stay plain `<link>` elements rather than being injected by JavaScript, so
the page is styled on first paint:

| File | Contents | Loaded by |
| --- | --- | --- |
| `general.css` | the five theme tokens, body/typography/links/forms, and the few page-furniture classes used by more than one page (`.button-container`, `.map-button`, `.inline-link`, `.button-row`, `.section-hidden`) | every content page |
| `menu.css` | the whole sidebar, plus the music player it hosts | every content page |
| `secondary.css` | catch-all: map/lore furniture, the search bar, the taxonomy explorer, the `.streak-*` rules | every content page |
| `account.css` | the account page in full, including the ten account-only custom properties in its own `:root` | account page only |
| `settings.css` | the standalone settings page: theme picker, text size, audio controls | settings page only |

**Link order is the cascade order and is part of the contract** — `general.css`,
`menu.css`, `secondary.css`, then the page's own file. `tools/verify_site.py`
asserts the exact set and order per page.

Two rules were deliberately moved out of `account.css` into `general.css`:
`.section-hidden` and `.button-row` are also used by the settings page, so they
had to stop being account-only. The reverse also holds: `account.css` keeps a
second `:root` block, but nothing outside that file references those ten
properties, so they no longer leak onto pages that never load it.

### Theme System

A theme declares only **five** base colours in `settings/color-theme.js`:

| Variable | Role |
| --- | --- |
| `--c-base` | page background |
| `--c-panel` | sidebar / card surface |
| `--c-accent` | links, highlights, active states |
| `--c-line` | borders, dividers, scrollbars |
| `--c-text` | body text |

Everything else in `styles/` is derived from those five with `color-mix()`,
so adding or retuning a theme never requires editing the stylesheets. When styling new
components, use the derived tokens (`--surface-border`, `--menu-button-outline`,
`--focus-ring`, `--scrollbar-thumb`, `--handle-grip-color`, …) rather than literal
colours, or they will not respond to themes.

Never reuse one custom-property name for two different types. A `:root` colour named
`--handle-bar` and a `#menu-container` length named `--handle-bar` are distinct
declarations, and the inner one shadows the outer — so `background: var(--handle-bar)`
resolves to a length, which is invalid at computed-value time and silently paints
nothing. Geometry is `-width` / `-height` suffixed and declared on the component
(`--handle-bar-width`); colours are `-color` suffixed and declared in `:root`.

### Site Time Display

`auth/achievements.js` owns time tracking: it accumulates `siteTimePendingMs`, writes
it to `sessionStorage["ptg_site_time_pending_<uid>"]`, and dispatches
`panategwa:sitetimechange` with `{ uid, siteTimeMs }` every second.

`js/site.js` renders the sidebar clock from three sources, taking the largest value so
the display never moves backwards:
1. the in-memory `liveSiteTimeMs` cache fed by the `panategwa:sitetimechange` payload,
2. `localStorage["ptg_site_time_live_<uid>"]` (the persisted last-known value),
3. `sessionStorage["ptg_site_time_pending_<uid>"]` (this tab's unspent elapsed time).

Keep these storage keys in sync when changing the tracking code.

## How to Add a New Page

1. **Create the file** at `main-pages/<body>/<page>/<page>.html` (or, for one of the
   four non-planet pages, directly at `main-pages/<body>/<page>.html`), using this head:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Page Title</title>
  <link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../../styles/general.css" />
  <link rel="stylesheet" href="../../styles/menu.css" />
  <link rel="stylesheet" href="../../styles/secondary.css" />
  <script type="module" src="../../js/page-imports.js"></script>
</head>
<body>
  <div id="menu-container"></div>
  <!-- Page content here -->
</body>
</html>
```

The `../../` prefixes assume a page at `main-pages/<body>/<page>.html`. A page in
its own folder (`main-pages/panategwa-d/<page>/<page>.html`, as every planet page
does) needs `../../../` instead.

2. **Add to the sidebar menu** — Add an entry to the `PAGES` array in `js/menu.js`.
   Every page picks it up automatically; no page needs editing. The `url` is
   site-root-relative and includes any per-page folder, e.g.
   `main-pages/panategwa-d/panategwa-d-page/panategwa-d-page.html`.
   Afterwards run `python tools/verify_site.py` to confirm every page's links and
   menu markup are intact.

3. **Add page-specific modules** — Add an entry to `PAGE_MODULES` in
   `js/page-imports.js` if the page needs a module of its own (e.g.
   `auth/account.js`). Do not add a second `<script type="module">` tag to the
   page; `tools/verify_site.py` will fail the build if you do.

## Directory Structure

```
├── index.html                 # Entry stub — forwards the site root to the home page
├── main-pages/                # All content pages, grouped by body
│   └── <body>/<page>/<page>.html   (or <body>/<page>.html for the 4 non-planet pages)
├── AGENTS.md                 # This guide
├── firestore.rules           # Firebase Firestore security rules
├── .gitignore                # Ignores firebase-debug.log, __pycache__, node_modules
├── auth/
│   ├── firebase-config.js    # Firebase initialization
│   ├── auth.js               # Core auth + profile logic
│   ├── settings.js           # Account settings page module
│   ├── account.js            # Account page module (profile/friends/progress/notifications)
│   ├── social.js             # Friends/messages system
│   ├── streak.js             # Streak page module
│   ├── achievements.js       # Achievement system
│   └── toast.js              # Toast notifications + audio
├── css/                        # (removed — styles now live in styles/)
├── styles/                     # All site styles, split by role
│   ├── general.css             # Theme tokens, base typography, shared page furniture
│   ├── menu.css                # The shared sidebar and the music player it hosts
│   ├── secondary.css           # Map/lore furniture, search bar, taxonomy explorer, .streak-*
│   ├── account.css             # The account page and its ten account-only tokens
│   └── settings.css            # The standalone settings page
├── docs/
│   ├── years.txt             # Lore note: world year length
│   └── music-library.md      # How to add tracks to the music library
├── images/                   # Site images
├── js/
│   ├── page-imports.js             # The one shared entry point every page loads
│   ├── menu.js                 # Sidebar markup, page list, active link highlighting
│   └── site.js                 # Sidebar behavior (avatar, site time, resize)
├── settings/
│   ├── settings.js           # Bootstrap loader for settings scripts
│   ├── text-size.js          # Text size customization
│   ├── color-theme.js        # Theme list — 5 base colors per theme
│   ├── translate.js          # Language translation
│   └── audio-settings.js     # Audio settings page module
├── music/
│   ├── system/
│   │   └── music-system.js   # Music player
│   └── library/
│       ├── music-library.js  # Music tracks library
│       └── *.mp3             # Audio files
└── tools/
    ├── audit_links.py         # Inventory of every link/button, plus orphan pages
    ├── check_http.py          # Same checks over HTTP
    ├── check_menu.js          # Headless sidebar render check
    └── verify_site.py         # Structure, depth prefixes, entry stub
```

### Site Time Display

`auth/achievements.js` owns time tracking: it accumulates `siteTimePendingMs`, writes
it to `sessionStorage["ptg_site_time_pending_<uid>"]`, and dispatches
`panategwa:sitetimechange` with `{ uid, siteTimeMs }` every second.

`js/site.js` renders the sidebar clock from three sources, taking the largest value so
the display never moves backwards:
1. the in-memory `liveSiteTimeMs` cache fed by the `panategwa:sitetimechange` payload,
2. `localStorage["ptg_site_time_live_<uid>"]` (the persisted last-known value),
3. `sessionStorage["ptg_site_time_pending_<uid>"]` (this tab's unspent elapsed time).

Keep these storage keys in sync when changing the tracking code.
