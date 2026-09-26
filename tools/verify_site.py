import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
failures = []


def html_files():
    found = []
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in {".git", ".kilo", "__pycache__", "node_modules"}]
        for name in files:
            if name.endswith(".html"):
                found.append(os.path.relpath(os.path.join(base, name), ROOT).replace("\\", "/"))
    return sorted(found)


PAGES = sorted(html_files())
LOCAL_REF = re.compile(r'(?:href|src)="([^"]+)"')
MENU_URL = re.compile(r'url:\s*"([^"]+)"', re.MULTILINE)

# The one stylesheet a page owns on top of the three shared files.
PAGE_ONLY_SHEET = {
    "account-page.html": "account.css",
    "settings-page.html": "settings.css",
}

with open(os.path.join(ROOT, "js", "menu.js"), encoding="utf-8") as fh:
    menu_source = fh.read()

declared = [url for url in MENU_URL.findall(menu_source) if url.startswith("main-pages/")]
if len(declared) != 8:
    failures.append(f"js/menu.js should declare 8 menu pages, found {len(declared)}")

for url in declared:
    if not os.path.exists(os.path.join(ROOT, *url.split("/"))):
        failures.append(f"js/menu.js points at a missing page: {url}")

if "main-pages/" not in [p.split("/")[0] for p in PAGES if "/" in p]:
    pass

root_pages = [p for p in PAGES if "/" not in p]
if root_pages != ["index.html"]:
    failures.append(f"root should hold only the index.html entry stub, found: {root_pages}")

# The entry stub must point at the real home page, or the site root 404s.
HOME = "main-pages/home/home-page.html"

with open(os.path.join(ROOT, "index.html"), encoding="utf-8") as fh:
    stub = fh.read()
if f"url={HOME}" not in stub:
    failures.append(f"index.html entry stub does not point at {HOME}")
if f'location.replace("{HOME}")' not in stub:
    failures.append("index.html entry stub does not forward via location.replace")
if HOME not in PAGES:
    failures.append(f"the home page the stub points at is missing: {HOME}")

checked = 0
for rel_path in PAGES:
    full = os.path.join(ROOT, *rel_path.split("/"))
    with open(full, encoding="utf-8") as fh:
        text = fh.read()

    for ref in LOCAL_REF.findall(text):
        if ref.startswith(("http://", "https://", "//", "data:", "mailto:", "javascript:")):
            continue
        bare = ref.split("#")[0].split("?")[0]
        if not bare:
            continue
        checked += 1
        if not os.path.exists(os.path.normpath(os.path.join(os.path.dirname(full), *bare.split("/")))):
            failures.append(f"{rel_path} -> broken reference {ref}")

    if text.count("</head>") != 1:
        failures.append(f"{rel_path} -> </head> count {text.count('</head>')}")

    # The root index.html is a redirect stub, not a full page, so the shared
    # sidebar and depth-prefix rules do not apply to it.
    if rel_path == "index.html":
        continue

    if '<div id="menu-container"></div>' not in text:
        failures.append(f"{rel_path} -> sidebar markup is inlined instead of shared")
    if 'class="menu-button"' in text:
        failures.append(f"{rel_path} -> inlined menu buttons left behind")

    depth = rel_path.count("/")
    expected_prefix = "../" * depth

    # Stylesheets: the three shared files, in cascade order, plus the one this
    # page owns. Order is part of the contract, so the list is compared exactly.
    expected_sheets = ["general.css", "menu.css", "secondary.css"]
    extra = PAGE_ONLY_SHEET.get(os.path.basename(rel_path))
    if extra:
        expected_sheets.append(extra)
    found_sheets = re.findall(
        r'<link rel="stylesheet" href="(?:\.\./)+styles/([\w.-]+)"', text
    )
    if found_sheets != expected_sheets:
        failures.append(
            f"{rel_path} -> stylesheets are {found_sheets}, expected {expected_sheets}"
        )
    if "css/styles.css" in text:
        failures.append(f"{rel_path} -> still references the removed css/styles.css")

    # One entry point pulls in the sidebar, the router and every shared module.
    # A page's own modules live in the PAGE_MODULES registry inside that single
    # file, so a page must not carry a second <script type="module"> tag -- that
    # is what keeps page-imports.js the only file anyone has to edit.
    init = f'src="{expected_prefix}js/page-imports.js"'
    if init not in text:
        failures.append(f"{rel_path} -> page-imports.js path is wrong for depth {depth}")
    if text.count(init) > 1:
        failures.append(f"{rel_path} -> loads js/page-imports.js more than once")

    module_tags = re.findall(r'<script\s+type="module"', text)
    if len(module_tags) != 1:
        failures.append(
            f"{rel_path} -> has {len(module_tags)} module script tags, expected exactly 1"
        )

    for legacy in ("js/menu.js", "js/site.js", "js/router.js",
                   "auth/achievements.js", "auth/social.js",
                   "music/system/music-system.js", "settings/settings.js",
                   "auth/account.js", "auth/settings.js", "auth/streak.js",
                   "settings/audio-settings.js"):
        if legacy in text:
            failures.append(
                f"{rel_path} -> loads {legacy} directly instead of via js/page-imports.js"
            )

if failures:
    for item in failures:
        print("FAIL", item)
    sys.exit(1)

print(f"OK: {len(PAGES)} pages, {len(declared)} menu links, {checked} local refs resolve")
