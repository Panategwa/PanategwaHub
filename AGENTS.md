# AGENTS.md — Panategwa Hub Development Guide

## Project Overview

The Panategwa Hub is a static HTML/CSS/JS website with Firebase Auth + Firestore backend.
It uses SPA (Single-Page Application) routing for seamless navigation.

## Architecture

### SPA Navigation Flow

1. **`router.js`** — Intercepts internal link clicks, fetches page HTML via `fetch()`,
   replaces `#page-content`, and dispatches `panategwa:routechange` with `detail.page`.
2. **`mobile-menu.js`** — Creates mobile top-bar navigation ("Music" / "Pages" buttons).
3. **`menu-loader.js`** — Builds the sidebar menu, loads shared modules, and loads
   page-specific modules based on the current page or `panategwa:routechange` events.

### Module Loading

All script loading is centralized in `menu-loader.js`:

- **Shared modules** (loaded on every page):
  - `auth/achievements.js` — Achievement system (self-initializing)
  - `auth/social.js` — Friends/messages system (self-initializing)
  - `music/system/music-system.js` — Music player (self-initializing)

- **Settings bootstrap** (loaded on every page):
  - `settings/settings.js` — Dynamically loads `translate.js`, `text-size.js`,
    `color-theme.js` and calls their `init*` functions.

- **Page-specific modules** (loaded via `PAGE_MODULES` map in `menu-loader.js`):
  - `account-page.html` → `auth/account.js`, `auth/settings.js`
  - `settings-page.html` → `settings/audio-settings.js`
  - `streak-page.html` → `auth/streak.js`

All page-specific modules use the same pattern:
```javascript
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function () {
    start();
    window.addEventListener("panategwa:routechange", __onRouteChange);
  });
} else {
  start();
  window.addEventListener("panategwa:routechange", __onRouteChange);
}
```

### Script Loading Order

1. Inline scripts in `<head>` execute first (e.g., account-page.html sets up `window.openAccountArea`)
2. Deferred scripts (`router.js`, `mobile-menu.js`, `menu-loader.js`) execute after DOM parsing
3. `menu-loader.js` DOMContentLoaded handler: builds menu, loads shared modules, loads page modules
4. Page modules self-initialize and register `panategwa:routechange` handlers

## How to Add a New Page

1. **Create the HTML file** with this minimal head:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Page Title</title>
  <link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="styles.css" />
  <script src="router.js" defer></script>
  <script src="mobile-menu.js" defer></script>
  <script src="menu-loader.js" defer</script>
</head>
<body>
  <div id="menu-container"></div>
  <div id="page-content">
    <!-- page content here -->
  </div>
</body>
</html>
```

2. **Register the page** in `router.js` PAGES array (for link interception + SPA navigation).

3. **Add to sidebar menu** in `menu-loader.js` `pages` array (if it should appear in the sidebar).

4. **Add page-specific modules** to `PAGE_MODULES` in `menu-loader.js` — only if the page
   needs auth/streak/audio modules:
```javascript
"your-page.html": [
  { src: "auth/account.js", type: "module" },
  { src: "auth/streak.js", type: "module" }
]
```

5. **If the module has page-specific initialization**, it should follow the standard pattern:
   - Call `start()` on init
   - Listen for `panategwa:routechange` to initialize on route change
   - Use `detail.page === "your-page.html"` to check if the module should be active

## Directory Structure

```
├── *.html                    # Content pages (all use the same minimal head)
├── router.js                 # SPA navigation (hash-based routing)
├── mobile-menu.js            # Mobile navigation bar
├── menu-loader.js            # Sidebar menu + dynamic module loading
├── styles.css                # All site styles
├── firestore.rules           # Firebase Firestore security rules
├── firebase-debug.log        # Firebase debug log (gitignored)
├── edit_script.py            # Development utility script
├── auth/
│   ├── firebase-config.js    # Firebase initialization
│   ├── auth.js               # Core auth + profile logic
│   ├── settings.js           # Account settings page module
│   ├── account.js            # Account page module (profile/friends/progress/notifications)
│   ├── social.js             # Friends/messages system
│   ├── streak.js             # Streak page module
│   ├── achievements.js       # Achievement system
│   └── toast.js              # Toast notifications + audio
├── settings/
│   ├── settings.js           # Bootstrap loader for settings scripts
│   ├── text-size.js          # Text size customization
│   ├── color-theme.js        # Color theme selection
│   ├── translate.js          # Language translation
│   └── audio-settings.js     # Audio settings page module
└── music/
    ├── system/
    │   ├── music-system.js   # Music player
    │   └── music-library.js  # Music tracks library
    └── library/
        └── *.mp3            # Audio files
```
