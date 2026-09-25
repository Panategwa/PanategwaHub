import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_menu import build_menu_html

root = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
html_files = sorted(f for f in os.listdir(root) if f.endswith(".html"))
failures = []
checked = 0

for name in html_files:
    with open(os.path.join(root, name), encoding="utf-8") as fh:
        text = fh.read()

    for ref in re.findall(r'(?:href|src)="([^"]+)"', text):
        if ref.startswith(("http", "#", "data:", "mailto:", "javascript:")):
            continue
        target = ref.split("#")[0].split("?")[0]
        if not target:
            continue
        checked += 1
        if not os.path.exists(os.path.join(root, target)):
            failures.append(f"{name} -> {ref}")

    if 'href="styles.css"' in text or 'src="site.js"' in text:
        failures.append(f"{name} -> stale asset path")
    if 'id="_menu-' in text:
        failures.append(f"{name} -> stale underscore-prefixed menu id")
    if text.count('id="menu-container"') != 1:
        failures.append(f"{name} -> menu-container count {text.count('id=' + chr(34) + 'menu-container' + chr(34))}")
    if text.count("</head>") != 1:
        failures.append(f"{name} -> </head> count {text.count('</head>')}")
    if "WORLD_MARKER" in text:
        failures.append(f"{name} -> leftover marker")

EXPECTED_MENU_LINKS = [
    "Home",
    "Panategwa",
    "Panategwa b",
    "Panategwa c",
    "Panategwa d",
    "Panategwa e",
    "Panategwa f",
    "Panategwa g",
]

menu = build_menu_html()
if '<div class="menu-divider">' in menu or "WORLD_PAGES" in menu:
    failures.append("menu generator still emits the world group")
if menu.count('class="menu-group"') != 1:
    failures.append("menu should contain exactly one .menu-group block")
if 'class="menu-resize-footer"' in menu:
    failures.append("menu still contains the bottom resize footer")
if 'aria-orientation="vertical"' not in menu:
    failures.append("resize handle is not marked vertical")
for name in EXPECTED_MENU_LINKS:
    if f">{name}</a>" not in menu:
        failures.append(f"menu generator is missing link '{name}'")
for removed in ["D-Map", "D-Life", "D-Ideologies", "Pitons", "Tri-Panats", "Empire of Pitosia"]:
    if f">{removed}</a>" in menu:
        failures.append(f"menu generator still emits '{removed}'")

for name in html_files:
    with open(os.path.join(root, name), encoding="utf-8") as fh:
        text = fh.read()
    for link in EXPECTED_MENU_LINKS:
        if f">{link}</a>" not in text:
            failures.append(f"{name} -> menu link '{link}' missing")
    for removed in ["D-Map", "D-Life", "D-Ideologies", "Pitons", "Tri-Panats", "Empire of Pitosia"]:
        if f">{removed}</a>" in text:
            failures.append(f"{name} -> removed link '{removed}' still present")
    if text.count('id="resize-handle"') != 1:
        failures.append(f"{name} -> resize-handle count {text.count('id=' + chr(34) + 'resize-handle' + chr(34))}")
    if 'class="menu-resize-footer"' in text:
        failures.append(f"{name} -> stale bottom resize footer")

if failures:
    for item in failures:
        print("FAIL", item)
    sys.exit(1)

print(f"OK: {len(html_files)} pages, {checked} local refs, menu structure valid")
