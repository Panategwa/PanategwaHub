import os, re

for f in sorted(os.listdir('.')):
    if not f.endswith('.html'): continue
    with open(f, encoding='utf-8') as fh:
        content = fh.read()
    
    # Find where menu ends (first occurrence of </div> followed by content div)
    after_menu = content[content.find('</div>\n  <div') + 6:] if content.find('</div>\n  <div') > 0 else content[content.find('</div>\n<div')+6:] if content.find('</div>\n<div') > 0 else ''
    
    if not after_menu:
        # Try alternative patterns
        idx = content.find('</div>\n')
        if idx > 0:
            after_menu = content[idx:idx+500]
    
    wrapper = "???"
    if 'class="content"' in after_menu[:500]:
        wrapper = "class=content"
    elif 'id="page-content"' in after_menu[:500]:
        wrapper = "id=page-content"
    elif 'class="streak-wrap"' in after_menu[:500]:
        wrapper = "class=streak-wrap"
    elif 'class="account-wrap"' in after_menu[:500]:
        wrapper = "class=account-wrap"
    elif 'no wrapper' in after_menu[:500]:
        wrapper = "no wrapper"
    else:
        m = re.search(r'</div>\s*\n\s*(<div[^>]*>)', after_menu[:500])
        if m:
            wrapper = m.group(1)[:60]
        else:
            m2 = re.search(r'</div>\s*\n\s*([<h1<])', after_menu[:500])
            if m2:
                wrapper = "direct content (no div)"
    
    print(f'{f}: {wrapper}')
