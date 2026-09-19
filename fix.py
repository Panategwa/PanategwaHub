with open(r"C:\Users\user\Documents\GitHub\PanategwaHub\music\system\music-system.js", "r", encoding="utf-8") as f:
    content = f.read()
content = content.replace('let draggedTrackId = "";', 'let draggedTrackId = "";\nlet lastSaveTime = 0;')
with open(r"C:\Users\user\Documents\GitHub\PanategwaHub\music\system\music-system.js", "w", encoding="utf-8") as f:
    f.write(content)
print("Done")