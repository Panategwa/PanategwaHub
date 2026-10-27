"""Fetches every page and every navigation target over HTTP and reports 404s."""
import os
import re
import sys
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8767/"
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
SKIP_DIRS = {".git", ".kilo", "__pycache__", "node_modules"}

NAV = re.compile(
    r"((?:window\.)?location\.(?:href|replace)\s*=\s*|window\.open\(\s*|PanategwaGoTo\(\s*)"
    r"(['\"])([^'\"]+?\.html(?:\?[^'\"]*)?)\2"
)
ANY = re.compile(r'(?:href|src)="([^"#]+)"')
MENU_URL = re.compile(r'url:\s*"([^"]+)"')
MENU_ICON_URL = re.compile(r'renderIconLink\(\s*"([^"]+)"')


def get(path):
    url = BASE + path.lstrip("/").replace("\\", "/")
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception:
        return 0, ""


pages = []
for base, dirs, files in os.walk(ROOT):
    dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
    for name in files:
        if name.endswith(".html"):
            pages.append(os.path.relpath(os.path.join(base, name), ROOT).replace("\\", "/"))
pages.sort()

failures = []
checked = 0
page_assets = 0

for page in pages:
    code, text = get(page)
    if code != 200:
        failures.append(f"PAGE {page} -> HTTP {code}")
        continue

    # Static assets this page pulls in.
    for ref in ANY.findall(text):
        if ref.startswith(("http://", "https://", "//", "data:", "mailto:", "javascript:")):
            continue
        bare = ref.split("#")[0].split("?")[0]
        if not bare:
            continue
        target = os.path.normpath(os.path.join(os.path.dirname(page), *bare.split("/"))).replace("\\", "/")
        page_assets += 1
        asset_code, _ = get(target)
        if asset_code != 200:
            failures.append(f"{page} -> asset {ref} -> HTTP {asset_code}")

    # Buttons that navigate.
    for match in NAV.finditer(text):
        ref = match.group(3)
        if ref.startswith(("http://", "https://", "/")):
            continue
        bare = ref.split("#")[0].split("?")[0]
        target = os.path.normpath(os.path.join(os.path.dirname(page), *bare.split("/"))).replace("\\", "/")
        checked += 1
        nav_code, _ = get(target)
        if nav_code != 200:
            failures.append(f"{page} -> button to {ref} -> HTTP {nav_code}")

# Menu links, resolved the way menu.js does at runtime.
with open(os.path.join(ROOT, "js", "menu.js"), encoding="utf-8") as fh:
    menu_source = fh.read()
for url in MENU_URL.findall(menu_source) + MENU_ICON_URL.findall(menu_source):
    checked += 1
    code, _ = get(url)
    if code != 200:
        failures.append(f"menu.js -> {url} -> HTTP {code}")

if failures:
    for item in failures:
        print("FAIL", item)
    sys.exit(1)

print(f"OK over HTTP: {len(pages)} pages, {checked} navigation targets, {page_assets} asset references")
