import os
import re
import sys
from collections import defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
SKIP_DIRS = {".git", ".kilo", "__pycache__", "node_modules"}

failures = []
inventory = defaultdict(list)   # target -> [(source, kind, label)]
external = []
anchors_checked = 0


def walk(exts):
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in files:
            if os.path.splitext(name)[1] in exts:
                yield os.path.relpath(os.path.join(base, name), ROOT).replace("\\", "/")


pages = sorted(walk({".html"}))
scripts = sorted(walk({".js"}))

PAGE_SET = {os.path.basename(p): p for p in pages}

# ---------------------------------------------------------------- HTML links
ANCHOR_HREF = re.compile(r'<a\b[^>]*?\shref="([^"]*)"[^>]*>(.*?)</a>', re.DOTALL)
ANY_HREF = re.compile(r'(?:href|src)="([^"]+)"')
BUTTON_ONCLICK = re.compile(r'onclick="([^"]+)"')
WINDOW_OPEN = re.compile(r"window\.open\(\s*'([^']+)'")
# location.href / location.replace / PanategwaGoTo targets written in inline JS
NAV_TARGET = re.compile(
    r"((?:window\.)?location\.(?:href|replace)\s*=\s*|window\.open\(\s*|PanategwaGoTo\(\s*)"
    r"(['\"])([^'\"]+?\.html(?:\?[^'\"]*)?)\2"
)
IDS = re.compile(r'\sid="([^"]+)"')

for page in pages:
    full = os.path.join(ROOT, *page.split("/"))
    with open(full, encoding="utf-8") as fh:
        text = fh.read()

    body_start = text.find("<body")
    body = text[body_start:] if body_start != -1 else text
    page_ids = set(IDS.findall(text))

    # Every anchor, with its visible text, so links can be checked semantically.
    for match in ANCHOR_HREF.finditer(body):
        href = match.group(1).strip()
        label = re.sub(r"<[^>]+>", "", match.group(2))
        label = re.sub(r"\s+", " ", label).strip()[:60]
        kind = "anchor"

        if href.startswith(("http://", "https://")):
            external.append((page, label, href))
            continue
        if href.startswith(("mailto:", "javascript:", "data:")):
            continue

        if href.startswith("#"):
            anchors_checked += 1
            if len(href) > 1 and href[1:] not in page_ids:
                failures.append(f"{page} -> in-page anchor {href} has no matching id")
            continue

        bare = href.split("#")[0].split("?")[0]
        if not bare:
            continue
        target = os.path.normpath(os.path.join(os.path.dirname(page), *bare.split("/"))).replace("\\", "/")
        inventory[target].append((page, kind, label))
        if not os.path.exists(os.path.join(ROOT, *target.split("/"))):
            failures.append(f"{page} -> '{label}' links to missing {href}")

    # Buttons that navigate via inline JS.
    for match in BUTTON_ONCLICK.finditer(body):
        code = match.group(1)
        for url in WINDOW_OPEN.findall(code):
            if url.startswith(("http://", "https://")):
                external.append((page, "(onclick)", url))
                continue
            target = os.path.normpath(os.path.join(os.path.dirname(page), *url.split("/"))).replace("\\", "/")
            inventory[target].append((page, "onclick", code[:50]))
            if not os.path.exists(os.path.join(ROOT, *target.split("/"))):
                failures.append(f"{page} -> button opens missing {url}")

    # Any inline navigation target: location.href / location.replace / open.
    for match in NAV_TARGET.finditer(text):
        target_ref = match.group(3)
        if target_ref.startswith(("http://", "https://", "/")):
            external.append((page, "(inline nav)", target_ref))
            continue
        bare = target_ref.split("#")[0].split("?")[0]
        target = os.path.normpath(os.path.join(os.path.dirname(page), *bare.split("/"))).replace("\\", "/")
        if not os.path.exists(os.path.join(ROOT, *target.split("/"))):
            failures.append(f"{page} -> inline navigation to missing {target_ref}")
        else:
            inventory[target].append((page, "inline-nav", target_ref))

    # src attributes (scripts, styles, images).
    for ref in ANY_HREF.findall(text):
        if ref.startswith(("http://", "https://", "//", "data:", "mailto:", "javascript:", "#")):
            continue
        bare = ref.split("#")[0].split("?")[0]
        if not bare:
            continue
        target = os.path.normpath(os.path.join(os.path.dirname(page), *bare.split("/"))).replace("\\", "/")
        if not os.path.exists(os.path.join(ROOT, *target.split("/"))):
            failures.append(f"{page} -> src missing {ref}")

# ------------------------------------------------------- links built in JS
JS_PAGE_REF = re.compile(r'["\'`]([a-z0-9-]+\.html)["\'`]|["\'`]([a-z0-9-]+-page\.html)["\'`]')
for script in scripts:
    with open(os.path.join(ROOT, *script.split("/")), encoding="utf-8") as fh:
        text = fh.read()
    for match in re.finditer(r'["\'`]([A-Za-z0-9_./-]+\.html)["\'`]', text):
        ref = match.group(1)
        name = os.path.basename(ref)
        if name not in PAGE_SET:
            failures.append(f"{script} -> references unknown page '{ref}'")
        else:
            inventory[PAGE_SET[name]].append((script, "js", ref))

# ------------------------------------------------------------ menu wiring
with open(os.path.join(ROOT, "js", "menu.js"), encoding="utf-8") as fh:
    menu_source = fh.read()
menu_pages = re.findall(r'name:\s*"([^"]+)",\s*url:\s*"([^"]+)"', menu_source)

print("=" * 70)
print("MENU")
print("=" * 70)
for name, url in menu_pages:
    exists = os.path.exists(os.path.join(ROOT, *url.split("/")))
    print(f"  {'OK ' if exists else 'BAD'}  {name:<14} -> {url}")
    if not exists:
        failures.append(f"menu.js: '{name}' points at missing {url}")

for icon, page in [("settings", "settings-page.html"), ("account", "account-page.html"),
                   ("streak", "streak-page.html")]:
    where = PAGE_SET.get(page)
    print(f"  {'OK ' if where else 'BAD'}  icon:{icon:<11} -> {where or page}")
    if not where:
        failures.append(f"menu.js: icon '{icon}' points at missing {page}")

print()
print("=" * 70)
print(f"PAGES ({len(pages)})")
print("=" * 70)
for page in pages:
    incoming = [s for s, _, _ in inventory.get(page, []) if s != page]
    print(f"  {page:<70} links in: {len(incoming)}")

print()
print("=" * 70)
print("ORPHAN PAGES (nothing links to them)")
print("=" * 70)
linked = set(inventory)
orphans = [p for p in pages if p not in linked and p != "index.html"]
for orphan in orphans:
    print(f"  {orphan}")
if not orphans:
    print("  none")

print()
print("=" * 70)
print(f"EXTERNAL LINKS ({len(external)}) — not verifiable offline")
print("=" * 70)
for src, label, url in sorted(set(external)):
    print(f"  {src:<48} {label[:26]:<28} {url[:70]}")

print()
print(f"In-page anchors checked: {anchors_checked}")
print()
if failures:
    print(f"FAILURES ({len(failures)}):")
    for item in failures:
        print("  ", item)
    sys.exit(1)
print("OK: every link and button resolves to an existing page or asset")
