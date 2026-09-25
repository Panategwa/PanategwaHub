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
expected_root = {"account-page.html", "settings-page.html", "streak-page.html"}
if set(root_pages) != expected_root:
    failures.append(f"unexpected root-level pages: {root_pages}")

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
    if '<div id="menu-container"></div>' not in text:
        failures.append(f"{rel_path} -> sidebar markup is inlined instead of shared")
    if 'class="menu-button"' in text:
        failures.append(f"{rel_path} -> inlined menu buttons left behind")

    depth = rel_path.count("/")
    expected_prefix = "../" * depth
    if f'href="{expected_prefix}css/styles.css"' not in text:
        failures.append(f"{rel_path} -> stylesheet path is wrong for depth {depth}")
    if f'src="{expected_prefix}js/menu.js"' not in text:
        failures.append(f"{rel_path} -> menu.js path is wrong for depth {depth}")
    if text.count(f'src="{expected_prefix}js/menu.js"') > 1:
        failures.append(f"{rel_path} -> loads js/menu.js more than once")

if failures:
    for item in failures:
        print("FAIL", item)
    sys.exit(1)

print(f"OK: {len(PAGES)} pages, {len(declared)} menu links, {checked} local refs resolve")
