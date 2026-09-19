with open(r"C:\Users\user\Documents\GitHub\PanategwaHub\music\system\music-system.js", "r", encoding="utf-8") as f:
    content = f.read()
old = """    currentState.currentTime = clampTime(audioEl.currentTime);
    saveState();
    syncPlaybackUi();"""
new = """    currentState.currentTime = clampTime(audioEl.currentTime);
    // Throttle saveState to every 5 seconds to reduce localStorage writes
    const now = Date.now();
    if (!lastSaveTime || now - lastSaveTime > 5000) {
      lastSaveTime = now;
      saveState();
    }
    syncPlaybackUi();"""
content = content.replace(old, new)
with open(r"C:\Users\user\Documents\GitHub\PanategwaHub\music\system\music-system.js", "w", encoding="utf-8") as f:
    f.write(content)
print("Done")