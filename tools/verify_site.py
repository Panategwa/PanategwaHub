import os
import re
import sys

root = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
menu_js = os.path.join(root, "js", "menu.js")
failures = []
html_files = sorted(f for f in os.listdir(root) if f.endswith(".html"))
checked = 0

if not os.path.exists(menu_js):
    failures.append("js/menu.js is missing")
    menu_source = ""
else:
    with open(menu_js, encoding="utf-8") as fh:
        menu_source = fh.read()

declared_links = re.findall(r'name:\s*"([^"]+)",\s*url:\s*"([^"]+)"', menu_source)
declared_urls = [url for _, url in declared_links]

if not declared_urls:
    failures.append("js/menu.js declares no pages")

for url in declared_urls:
    if not os.path.exists(os.path.join(root, url)):
        failures.append(f"js/menu.js links to a missing page: {url}")

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
            failures.append(f"{name} -> missing asset {ref}")

    if 'href="styles.css"' in text or 'src="site.js"' in text:
        failures.append(f"{name} -> stale asset path")

    if '<script src="js/menu.js" defer></script>' not in text:
        failures.append(f"{name} -> does not load js/menu.js")
    if text.count('<script src="js/menu.js" defer></script>') > 1:
        failures.append(f"{name} -> loads js/menu.js more than once")

    if '<div id="menu-container"></div>' not in text:
        failures.append(f"{name} -> sidebar markup is inlined instead of shared")
    if text.count('id="menu-container"') != 1:
        failures.append(f"{name} -> menu-container count {text.count('id=' + chr(34) + 'menu-container' + chr(34))}")
    if 'class="menu-button"' in text:
        failures.append(f"{name} -> inlined menu buttons left behind")

    if text.count("</head>") != 1:
        failures.append(f"{name} -> </head> count {text.count('</head>')}")

if failures:
    for item in failures:
        print("FAIL", item)
    sys.exit(1)

print(f"OK: {len(html_files)} pages share js/menu.js ({len(declared_urls)} menu links), {checked} local refs resolve")
