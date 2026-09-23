# AGENTS.md — Panategwa Hub Development Guide

## Project Overview

The Panategwa Hub is a static HTML/CSS/JS website with Firebase Auth + Firestore backend.
Each page is a standalone HTML file with static navigation via normal `<a href>` links.

## Architecture

### Multi-Page Static Navigation

1. **`site.js`** — Handles dynamic sidebar features: active link highlighting,
   avatar rendering, site time display, and sidebar resize handle. Also provides
   `window.PanategwaGoTo(href)` which simply sets `window.location.href`.
2. **`styles.css`** — Contains all site styles, including the fixed sidebar layout
   (`#menu-container` at 220px width, `body` padding-left: 220px).
3. **Static sidebar menu** — Each HTML page contains the full sidebar menu HTML
   inline (same structure on every page). Menu links are normal `<a>` tags.

### Script Includes

Each page includes these scripts in `<head>`:

- **`site.js`** (defer) — Sidebar enhancements (active highlights, avatar, resize)
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

The sidebar (`#menu-container`) is present on every page with the same HTML structure:

- Header: title, subtitle, site time (`#_menu-site-time`)
- Music slot (`#_menu-music-slot`) — populated by music-system.js
- Icon buttons: settings, account (avatar), streak, top (scroll to top)
- Page links: Home, Panategwa, Panategwa b–g (under "Pages" label)
- World pages: D-Map, D-Life, D-Ideologies, Pitons, etc. (under "World Pages" label)
- Resize handle (`#_resize-handle`) — draggable to resize sidebar width

Active link highlighting is handled by `site.js` comparing the current page filename
to each link's `data-target-page` attribute.

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
  <script src="site.js" defer></script>
  <script type="module" src="auth/achievements.js"></script>
  <script type="module" src="auth/social.js"></script>
  <script type="module" src="music/system/music-system.js"></script>
  <script src="settings/settings.js" defer></script>
</head>
<body>
  <div id="menu-container">
    <!-- Sidebar menu HTML (same on every page) -->
    ...sidebar content...
  </div>
  <!-- Page content here -->
</body>
</html>
```

2. **Add to the sidebar menu** — Update `edit_script.py` to include the new page in
   the `MAIN_PAGES` or `WORLD_PAGES` list, then re-run it to regenerate all pages.

3. **Add page-specific modules** — Add a `<script type="module" src="...">` include
   in the `<head>` for any module the page needs (e.g., `auth/account.js`).

## Directory Structure

```
├── *.html                    # Content pages (static multi-page navigation)
├── site.js                   # Sidebar enhancements (active links, avatar, resize)
├── styles.css                # All site styles
├── firestore.rules           # Firebase Firestore security rules
├── firebase-debug.log        # Firebase debug log (gitignored)
├── edit_script.py            # Utility script for bulk HTML generation
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
    │   └── music-system.js   # Music player
    └── library/
        ├── music-library.js  # Music tracks library
        └── *.mp3            # Audio files
```
