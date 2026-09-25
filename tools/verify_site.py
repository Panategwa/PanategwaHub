import os
import re
import sys

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

for name in ["D-Map", "D-Life", "D-Ideologies", "Pitons", "Tri-Panats", "Empire of Pitosia"]:
    missing = [f for f in html_files if f'menu-button" data-target-page=' in open(os.path.join(root, f), encoding="utf-8").read() and name not in open(os.path.join(root, f), encoding="utf-8").read()]
    if missing:
        failures.append(f"menu link '{name}' missing from: {missing}")

if failures:
    for item in failures:
        print("FAIL", item)
    sys.exit(1)

print(f"OK: {len(html_files)} pages, {checked} local refs, menu structure valid")
