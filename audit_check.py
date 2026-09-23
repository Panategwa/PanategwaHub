import os, re

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

for f in sorted(os.listdir(BASE_DIR)):
    if not f.endswith('.html'):
        continue
    filepath = os.path.join(BASE_DIR, f)
    with open(filepath, 'r', encoding='utf-8') as fh:
        content = fh.read()
    
    issues = []
    
    # Check for trailing <br> after menu
    if '</div>\n<br>' in content or '</br>' in content:
        issues.append('trailing <br> after menu')
    
    # Check for style blocks in body
    body_start = content.find('<body>')
    body = content[body_start:] if body_start > 0 else content
    if '<style>' in body:
        issues.append('style block in body')
    
    # Check for SPA references
    if 'PanategwaRouter' in content:
        issues.append('PanategwaRouter reference')
    if 'PanategwaNavigate' in content:
        issues.append('PanategwaNavigate reference')
    if 'location.hash' in content:
        issues.append('location.hash reference')
    
    # Check required sidebar elements
    required = [
        'id="menu-container"',
        'id="resize-handle"',
        'id="menu-music-slot"',
        'menu-site-time',
        'menu-account-button',
        'class="menu-inner"'
    ]
    for elem in required:
        if elem not in content:
            issues.append('missing: ' + elem)
    
    # Check for excess whitespace before </head>
    if re.search(r'</script>\n\n\n</head>', content):
        issues.append('excess whitespace before </head>')
    
    # Check for <br> right after menu div
    if re.search(r'</div>\s*<br>', content):
        issues.append('br after menu')
    
    if issues:
        print(f'{f}: {", ".join(issues)}')

print('---')
print('Audit complete.')
