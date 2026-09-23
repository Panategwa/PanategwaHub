import os, re

all_pages = set()
for f in os.listdir('.'):
    if f.endswith('.html'):
        all_pages.add(f)

print('=== Broken internal links check ===')
broken = []
for f in sorted(all_pages):
    with open(f, encoding='utf-8') as fh:
        content = fh.read()
    links = re.findall(r'href="([^"]+)"', content)
    for link in links:
        if link.startswith('http') or link.startswith('#') or link.startswith('mailto'):
            continue
        target = link.split('?')[0].split('#')[0]
        if target.endswith('.css'): continue
        if target and target not in all_pages:
            broken.append(f'{f} -> {target}')

if broken:
    for b in broken:
        print(f'  BROKEN: {b}')
else:
    print('  All internal links valid.')

print()
print('=== Image references check ===')
missing_images = []
for f in sorted(all_pages):
    with open(f, encoding='utf-8') as fh:
        content = fh.read()
    imgs = re.findall(r'src="([^"]+)"', content)
    for img in imgs:
        if img.startswith('http'):
            continue
        target = img.split('?')[0].split('#')[0]
        if target and not os.path.exists(target):
            missing_images.append(f'{f} -> {target}')

if missing_images:
    for m in missing_images:
        print(f'  MISSING: {m}')
else:
    print('  All images found.')

print()
print('=== JS file references check ===')
for f in sorted(all_pages):
    with open(f, encoding='utf-8') as fh:
        content = fh.read()
    scripts = re.findall(r'src="([^"]+)"', content)
    for script in scripts:
        if script.startswith('http') or script.endswith('.css') or 'fonts.googleapis.com' in script:
            continue
        target = script.split('?')[0]
        if target and not os.path.exists(target):
            print(f'  MISSING SCRIPT: {f} -> {target}')

print('  JS references check complete.')
