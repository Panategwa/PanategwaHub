# AGENTS.md — Panategwa Hub Development Guide

## Project Overview

The Panategwa Hub is a static HTML/CSS/JS website with Firebase Auth + Firestore backend.
Each page is a standalone HTML file with static navigation via normal `<a href>` links.

Content pages live under `main-pages/<body>/<page>/`, so the repo root only holds the
shared asset folders. Every page in the site is inside `main-pages/`; there is no
`index.html` at the root, so `/` is not a valid page.

```
main-pages/
  home/home-page/index.html
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

Content pages sit three levels deep, so every asset reference is prefixed with
`../../../`. `js/menu.js` computes that prefix at runtime from
`window.location.pathname` and exposes it as `window.PanategwaRoot`. Any module
that builds a URL to a root-level page (account, settings, streak) must prefix it
with `window.PanategwaRoot`, otherwise it breaks on nested pages.
`settings/settings.js` does this for the scripts it injects.

## Architecture

### Multi-Page Static Navigation

1. **`js/menu.js`** — Owns the entire sidebar: the `PAGES` list, the icons, the
   rendered markup, and active link highlighting. Every page includes it and holds
   only an empty `<div id="menu-container"></div>`, so the menu is edited in one place.
2. **`js/site.js`** — Handles dynamic sidebar behavior: avatar rendering, site time
   display, and the sidebar resize handle. Also provides `window.PanategwaGoTo(href)`
   which simply sets `window.location.href`.
3. **`css/styles.css`** — Contains all site styles, including the fixed sidebar layout
   (`#menu-container` at 280px default width, `body` padding-left: 280px).
4. **Shared sidebar** — Rendered at runtime by `js/menu.js`; no page inlines menu markup.

### Script Includes

Each page includes these scripts in `<head>`. Order matters: `js/menu.js` must come
before `js/site.js` so the sidebar exists before the behavior code attaches to it.

- **`js/menu.js`** (defer) — Renders the sidebar and highlights the active link
- **`js/site.js`** (defer) — Sidebar behavior (avatar, site time, resize)
- **`auth/achievements.js`** (type=module) — Achievement system (self-initializing on DOMContentLoaded)
- **`auth/social.js`** (type=module) — Friends/messages system (self-initializing on import)
- **`music/system/music-system.js`** (type=module) — Music player (self-initializing on DOMContentLoaded)
- **`settings/settings.js`** (defer) — Settings bootstrap; loads translate.js, text-size.js, color-theme.js

### Page-Specific Modules

Pages that need extra functionality include additional module scripts:

- **`account-page.html`** → `auth/account.js`, `auth/settings.js`
- **`settings-page.html`** → `settings/audio-settings.js`
- **`streak-page.html`** → `auth/streak.js`

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
  drag, mouse-wheel, or arrow keys

Active link highlighting is handled by `js/menu.js` comparing the current page filename
to each link's `data-target-page` attribute. The button for the page you are already on
gets `aria-current="page"` and `aria-disabled="true"`, which makes it inert: no clicks,
no hover styling, but still keyboard-focusable.

### Theme System

A theme declares only **five** base colours in `settings/color-theme.js`:

| Variable | Role |
| --- | --- |
| `--c-base` | page background |
| `--c-panel` | sidebar / card surface |
| `--c-accent` | links, highlights, active states |
| `--c-line` | borders, dividers, scrollbars |
| `--c-text` | body text |

Everything else in `css/styles.css` is derived from those five with `color-mix()`,
so adding or retuning a theme never requires editing the stylesheet. When styling new
components, use the derived tokens (`--surface-border`, `--menu-button-outline`,
`--focus-ring`, `--scrollbar-thumb`, …) rather than literal colours, or they will not
respond to themes.

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

1. **Create the file** at `main-pages/<body>/<page>/<page>-page.html` (or, for a page
   belonging to an existing body, a new folder beside its siblings), using this head:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Page Title</title>
  <link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../../../css/styles.css" />
  <script src="../../../js/menu.js" defer></script>
  <script src="../../../js/site.js" defer></script>
  <script type="module" src="../../../auth/achievements.js"></script>
  <script type="module" src="../../../auth/social.js"></script>
  <script type="module" src="../../../music/system/music-system.js"></script>
  <script src="../../../settings/settings.js" defer></script>
</head>
<body>
  <div id="menu-container"></div>
  <!-- Page content here -->
</body>
</html>
```

2. **Add to the sidebar menu** — Add an entry to the `PAGES` array in `js/menu.js`.
   Every page picks it up automatically; no page needs editing.
   Afterwards run `python tools/verify_site.py` to confirm every page's links and
   menu markup are intact.

3. **Add page-specific modules** — Add a `<script type="module" src="...">` include
   in the `<head>` for any module the page needs (e.g., `auth/account.js`).

## Directory Structure

```
├── account-page.html          # (pages now live under main-pages/)
├── settings-page.html
├── streak-page.html
├── main-pages/                # All content pages, grouped by body
│   └── <body>/<page>/<page>.html
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
├── css/
│   └── styles.css            # All site styles
├── docs/
│   ├── years.txt             # Lore note: world year length
│   └── music-library.md      # How to add tracks to the music library
├── images/                   # Site images
├── js/
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
    └── verify_site.py        # Checks links, asset paths, and shared menu wiring
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
