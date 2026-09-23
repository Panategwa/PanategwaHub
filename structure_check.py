import os

for f in sorted(os.listdir('.')):
    if not f.endswith('.html'): continue
    with open(f, encoding='utf-8') as fh:
        content = fh.read()
    issues = []
    if '>\n\n</head>' in content:
        issues.append('blank line before </head>')
    if content.count('</head>') > 1:
        issues.append('DUPLICATE </head> (' + str(content.count('</head>')) + ')')
    if issues:
        print(f + ': ' + ', '.join(issues))
    else:
        print(f + ': OK')
