import os, re

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

MAIN_PAGES = [
    ("Home", "index.html"),
    ("Panategwa", "panategwa-page.html"),
    ("Panategwa b", "panategwa-b-page.html"),
    ("Panategwa c", "panategwa-c-page.html"),
    ("Panategwa d", "panategwa-d-page.html"),
    ("Panategwa e", "panategwa-e-page.html"),
    ("Panategwa f", "panategwa-f-page.html"),
    ("Panategwa g", "panategwa-g-page.html"),
]

SETTINGS_ICON = (
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">'
    '<path fill="currentColor" d="m19.14 12.94.04-.94-.04-.94 2.03-1.58a.6.6 0 0 0 .15-.77l-1.92-3.32a.6.6 0 0 0-.73-.27l-2.39.96a7.4 7.4 0 0 0-1.63-.94l-.36-2.53a.6.6 0 0 0-.59-.5h-3.84a.6.6 0 0 0-.59.5l-.36 2.53c-.57.22-1.11.53-1.63.94l-2.39-.96a.6.6 0 0 0-.73.27L2.68 8.71a.6.6 0 0 0 .15.77l2.03 1.58-.04.94.04.94-2.03 1.58a.6.6 0 0 0-.15.77l1.92 3.32a.6.6 0 0 0 .73.27l2.39-.96c.51.41 1.06.72 1.63.94l.36 2.53a.6.6 0 0 0 .59.5h3.84a.6.6 0 0 0 .59-.5l.36-2.53c.57-.22 1.12-.53 1.63-.94l2.39.96a.6.6 0 0 0 .73-.27l1.92-3.32a.6.6 0 0 0-.15-.77zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5"/>'
    '</svg>'
)

STREAK_ICON = (
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">'
    '<path fill="currentColor" d="M12.1 2.5c.26 2.2-.78 3.54-1.7 4.72-.99 1.27-1.85 2.37-1.1 4.21.28.69.75 1.23 1.33 1.67-.14-1.44.47-2.47 1.15-3.62.8-1.36 1.7-2.9 1.34-5.48 2.7 1.9 4.28 4.79 4.28 7.75 0 4.49-3.46 8.25-8.25 8.25-3.77 0-6.65-2.83-6.65-6.39 0-2.96 1.86-5.57 4.54-7.08-.47 2.23.18 3.37.89 4.59.51.88 1.08 1.87 1.02 3.12 1.36-.82 2.41-2.17 2.41-4 0-1.31-.6-2.45-1.08-3.35-.54-1.02-.94-1.78-.18-2.91z"/>'
    '</svg>'
)

TOP_ICON = (
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">'
    '<path fill="currentColor" d="M12 5.5 5.5 12l1.4 1.4 4.1-4.09V20h2V9.31l4.1 4.09 1.4-1.4z"/>'
    '</svg>'
)

def build_menu_html():
    links = []
    for name, url in MAIN_PAGES:
        links.append(
            '      <a href="{url}" class="menu-button" data-target-page="{url}">{name}</a>'.format(url=url, name=name)
        )

    main_block = "\n".join(links)

    return """<div id="menu-container">
  <div class="menu-scroll">
    <div class="line">
      <div class="menu-main-title">The Panategwa Hub</div>
      <div class="menu-sub-title">0.0.3 - Alpha, Internal testing</div>
      <div class="menu-site-time" id="menu-site-time">On the site for: --</div>
    </div>

    <div id="menu-music-slot"></div>

    <div class="line icons">
      <a href="settings-page.html" class="menu-icon-button" data-target-page="settings-page.html" title="Site settings">
        """ + SETTINGS_ICON + """
      </a>

      <a href="account-page.html" class="menu-icon-button" data-target-page="account-page.html" title="Account">
        <span id="menu-account-button" style="display:inline-flex; align-items:center; justify-content:center;"></span>
      </a>

      <a href="streak-page.html" class="menu-icon-button" data-target-page="streak-page.html" title="Streak">
        """ + STREAK_ICON + """
      </a>

      <button class="menu-icon-button"
        onclick="window.scrollTo({top:0, behavior:'smooth'})"
        title="Top">
        """ + TOP_ICON + """
      </button>
    </div>

    <div class="menu-group">
""" + main_block + """
    </div>
  </div>

  <div
    id="resize-handle"
    role="separator"
    tabindex="0"
    aria-label="Resize sidebar. Drag, scroll, or use the left and right arrow keys."
    aria-orientation="vertical"
    title="Drag or scroll to resize"
  ><span></span></div>
</div>"""


MENU_OPEN = '<div id="menu-container">'
DIV_TOKEN = re.compile(r"<div\b|</div>")


def find_menu_span(content):
    """Return (start, end) of the #menu-container element, or None.

    Counts nested <div>/</div> pairs so the match always ends at the sidebar's
    own closing tag and never swallows the page content that follows it.
    """
    start = content.find(MENU_OPEN)
    if start == -1:
        return None

    depth = 0
    for match in DIV_TOKEN.finditer(content, start):
        depth += 1 if match.group(0) != "</div>" else -1
        if depth == 0:
            return start, match.end()
    return None


def regenerate_menu(filepath, filename):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    original = content
    menu_html = build_menu_html()

    span = find_menu_span(content)
    if span is None:
        print(f"SKIP: {filename} - #menu-container not found")
        return False

    start, end = span
    content = content[:start] + menu_html + content[end:]

    if content == original:
        print(f"SKIP: {filename} - menu unchanged")
        return False

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"OK: {filename}")
    return True


def main():
    html_files = [f for f in os.listdir(BASE_DIR) if f.endswith(".html")]
    html_files.sort()

    regenerated = 0
    for filename in html_files:
        filepath = os.path.join(BASE_DIR, filename)
        if regenerate_menu(filepath, filename):
            regenerated += 1

    print(f"\nRegenerated {regenerated} menus.")


if __name__ == "__main__":
    main()
