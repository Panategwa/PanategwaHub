import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TARGET_FILE = os.path.join(BASE_DIR, "settings-page.html")

with open(TARGET_FILE, "r") as f:
    content = f.read()

old = '    <div class="settings-group">\n      <button class="settings-main" data-panel="language" onclick="openSettingsPanel(\'language\')">\n        Language\n      </button>\n\n      <div id="settings-language-panel" class="settings-panel" style="display:none;">'

new = '    <div class="settings-group">\n      <div id="settings-language-panel" class="settings-panel" style="display:none;">'

if old in content:
    content = content.replace(old, new)
    with open(TARGET_FILE, "w") as f:
        f.write(content)
    print('Replacement done')
else:
    print('Pattern not found')
    idx = content.find('settings-language-panel')
    if idx >= 0:
        print('Context:', repr(content[idx-200:idx+200]))
