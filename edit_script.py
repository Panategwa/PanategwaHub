with open('C:/Users/user/Documents/GitHub/PanategwaHub/settings-page.html', 'r') as f:
    content = f.read()

old = '    <div class="settings-group">\n      <button class="settings-main" data-panel="language" onclick="openSettingsPanel(\'language\')">\n        Language\n      </button>\n\n      <div id="settings-language-panel" class="settings-panel" style="display:none;">'

new = '    <div class="settings-group">\n      <div id="settings-language-panel" class="settings-panel" style="display:none;">'

if old in content:
    content = content.replace(old, new)
    with open('C:/Users/user/Documents/GitHub/PanategwaHub/settings-page.html', 'w') as f:
        f.write(content)
    print('Replacement done')
else:
    print('Pattern not found')
    idx = content.find('settings-language-panel')
    if idx >= 0:
        print('Context:', repr(content[idx-200:idx+200]))
