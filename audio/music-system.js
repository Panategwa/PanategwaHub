import {
  getToastAudioSettings,
  setToastAudioChannelVolume,
  toggleToastAudioChannelMute
} from "../auth/toast.js";
import { findMusicTrack, getMusicTracks } from "./music-library.js";

const MUSIC_STATE_KEY = "ptg_music_state_v1";
const MUSIC_PREFS_KEY = "ptg_music_prefs_v1";
const MUSIC_UI_KEY = "ptg_music_ui_v1";
const MUSIC_EVENT = "panategwa:music-state-change";
const MUSIC_STORAGE_KEYS = new Set([MUSIC_STATE_KEY, MUSIC_PREFS_KEY, MUSIC_UI_KEY, "ptg_audio_settings"]);

const DEFAULT_PREFS = Object.freeze({
  disabledTrackIds: [],
  trackOrder: []
});

const DEFAULT_UI = Object.freeze({
  expanded: false
});

let musicTracks = [];
let currentPrefs = DEFAULT_PREFS;
let currentState = null;
let currentUi = DEFAULT_UI;
let audioEl = null;
let menuSlot = null;
let brokenTrackIds = new Set();
let lastSyncedSecond = -1;
let boundMenuEvents = false;
let suppressPauseSync = false;
let isSeeking = false;
let draggedTrackId = "";

function clampPercent(value, fallback = 0) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(0, Math.min(100, Math.round(next)));
}

function clampTime(value) {
  const next = Number(value);
  if (!Number.isFinite(next) || next < 0) return 0;
  return next;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function defaultTrackId() {
  const ordered = orderedTracksFromPrefs({
    trackOrder: musicTracks.map((track) => track.id)
  });
  return String(ordered.find((track) => track.enabledByDefault !== false)?.id || ordered[0]?.id || "").trim();
}

function orderedTracksFromPrefs(prefs = currentPrefs) {
  const order = Array.isArray(prefs?.trackOrder) ? prefs.trackOrder : [];
  const byId = new Map(musicTracks.map((track) => [track.id, track]));
  return order.map((id) => byId.get(id)).filter(Boolean);
}

function normalizePrefs(value = {}) {
  const validIds = new Set(musicTracks.map((track) => track.id));
  const defaultDisabledIds = musicTracks
    .filter((track) => track.enabledByDefault === false)
    .map((track) => track.id);
  const requestedOrder = Array.isArray(value?.trackOrder)
    ? value.trackOrder.map((entry) => String(entry || "").trim()).filter((entry) => validIds.has(entry))
    : [];
  const missingIds = musicTracks.map((track) => track.id).filter((id) => !requestedOrder.includes(id));
  const trackOrder = [...new Set([...requestedOrder, ...missingIds])];
  const disabledTrackIds = Array.isArray(value?.disabledTrackIds)
    ? [...new Set([...defaultDisabledIds, ...value.disabledTrackIds.map((entry) => String(entry || "").trim())].filter((entry) => validIds.has(entry)))]
    : [...defaultDisabledIds];

  return { disabledTrackIds, trackOrder };
}

function normalizeUi(value = {}) {
  return {
    expanded: !!value?.expanded
  };
}

function normalizeState(value = {}) {
  const fallbackId = defaultTrackId();
  const requestedTrackId = String(value?.trackId || fallbackId).trim() || fallbackId;
  const validTrackId = findMusicTrack(requestedTrackId)?.id || fallbackId;

  return {
    trackId: validTrackId,
    currentTime: clampTime(value?.currentTime),
    isPlaying: !!value?.isPlaying,
    updatedAt: Number(value?.updatedAt || Date.now()) || Date.now()
  };
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function loadPrefs() {
  return normalizePrefs(loadJson(MUSIC_PREFS_KEY, DEFAULT_PREFS));
}

function loadState() {
  return normalizeState(loadJson(MUSIC_STATE_KEY, {
    trackId: defaultTrackId(),
    currentTime: 0,
    isPlaying: false,
    updatedAt: Date.now()
  }));
}

function loadUi() {
  return normalizeUi(loadJson(MUSIC_UI_KEY, DEFAULT_UI));
}

function savePrefs() {
  localStorage.setItem(MUSIC_PREFS_KEY, JSON.stringify(currentPrefs));
}

function saveState() {
  currentState = normalizeState({
    ...currentState,
    updatedAt: Date.now()
  });
  localStorage.setItem(MUSIC_STATE_KEY, JSON.stringify(currentState));
  emitState();
}

function saveUi() {
  localStorage.setItem(MUSIC_UI_KEY, JSON.stringify(currentUi));
}

function orderedTracks() {
  return orderedTracksFromPrefs(currentPrefs);
}

function enabledTracks() {
  const disabled = new Set(currentPrefs.disabledTrackIds);
  return orderedTracks().filter((track) => !disabled.has(track.id));
}

function activeTrack() {
  return findMusicTrack(currentState?.trackId) || orderedTracks()[0] || musicTracks[0] || null;
}

function trackIsEnabled(trackId) {
  return !currentPrefs.disabledTrackIds.includes(String(trackId || "").trim());
}

function firstEnabledTrackId() {
  return String(enabledTracks()[0]?.id || defaultTrackId()).trim();
}

function pickNextTrackId(fromTrackId = currentState?.trackId) {
  const pool = enabledTracks().filter((track) => !brokenTrackIds.has(track.id));
  const list = pool.length ? pool : enabledTracks();
  if (!list.length) return "";

  const currentId = String(fromTrackId || "").trim();
  const index = list.findIndex((track) => track.id === currentId);
  if (index < 0) return list[0].id;
  return list[(index + 1) % list.length].id;
}

function pickPreviousTrackId(fromTrackId = currentState?.trackId) {
  const pool = enabledTracks().filter((track) => !brokenTrackIds.has(track.id));
  const list = pool.length ? pool : enabledTracks();
  if (!list.length) return "";

  const currentId = String(fromTrackId || "").trim();
  const index = list.findIndex((track) => track.id === currentId);
  if (index < 0) return list[0].id;
  return list[(index - 1 + list.length) % list.length].id;
}

function effectiveMusicVolume() {
  const settings = getToastAudioSettings();
  const masterVolume = clampPercent(settings?.masterVolume, 100);
  const musicVolume = clampPercent(settings?.musicVolume, 70);
  return Math.round((masterVolume * musicVolume) / 100);
}

function setSliderVisual(slider, value) {
  if (!slider) return;
  slider.style.setProperty("--range-fill", `${clampPercent(value, 0)}%`);
}

function formatClock(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds || 0)));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function syncMenuVolumeUi(settings = getToastAudioSettings()) {
  const slider = document.getElementById("menu-music-volume-slider");
  const valueEl = document.getElementById("menu-music-volume-value");
  const musicVolume = clampPercent(settings?.musicVolume, 70);
  const muteButton = document.getElementById("menu-music-quick-mute");

  if (slider && document.activeElement !== slider) {
    slider.value = String(musicVolume);
  }
  if (slider) {
    setSliderVisual(slider, musicVolume);
  }
  if (valueEl) {
    valueEl.textContent = `${musicVolume}%`;
  }
  if (muteButton) {
    muteButton.textContent = musicVolume > 0 ? "Mute" : "Unmute";
  }
}

function syncPlaybackUi(previewTime = null) {
  const el = audioEl;
  if (!el) return;

  const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
  const currentTime = clampTime(previewTime == null ? (el.currentTime || currentState?.currentTime || 0) : previewTime);
  const safeTime = duration > 0 ? Math.min(currentTime, duration) : currentTime;
  const remaining = Math.max(0, duration - safeTime);
  const progressSlider = document.getElementById("menu-music-progress-slider");
  const elapsedEl = document.getElementById("menu-music-time-elapsed");
  const leftEl = document.getElementById("menu-music-time-left");

  if (progressSlider) {
    progressSlider.max = String(duration > 0 ? duration : 1);
    if (!isSeeking && document.activeElement !== progressSlider) {
      progressSlider.value = String(safeTime);
    }
    const percent = duration > 0 ? (safeTime / duration) * 100 : 0;
    setSliderVisual(progressSlider, percent);
  }

  if (elapsedEl) {
    elapsedEl.textContent = formatClock(safeTime);
  }
  if (leftEl) {
    leftEl.textContent = duration > 0 ? `-${formatClock(remaining)}` : "-0:00";
  }
}

function seekBy(deltaSeconds) {
  if (!audioEl) return;
  const duration = Number.isFinite(audioEl.duration) && audioEl.duration > 0 ? audioEl.duration : 0;
  const nextTime = duration > 0
    ? Math.max(0, Math.min(duration, Number(audioEl.currentTime || 0) + Number(deltaSeconds || 0)))
    : Math.max(0, Number(audioEl.currentTime || 0) + Number(deltaSeconds || 0));

  try {
    audioEl.currentTime = nextTime;
  } catch {}

  currentState.currentTime = clampTime(nextTime);
  saveState();
  syncPlaybackUi();
}

function emitState() {
  window.dispatchEvent(new CustomEvent(MUSIC_EVENT, {
    detail: {
      state: { ...currentState },
      prefs: { ...currentPrefs },
      track: activeTrack()
    }
  }));
}

function formatStatusLine() {
  const track = activeTrack();
  if (!track) return "No songs added yet.";
  if (!trackIsEnabled(track.id)) return "Skipped. This song is currently turned off.";
  if (brokenTrackIds.has(track.id)) return "This song source could not be loaded.";
  return currentState.isPlaying ? "Playing now." : "Ready to play.";
}

function ensureAudioElement() {
  if (audioEl) return audioEl;

  audioEl = document.createElement("audio");
  audioEl.id = "ptg-site-music";
  audioEl.preload = "auto";
  audioEl.dataset.trackId = "";
  audioEl.style.display = "none";
  audioEl.setAttribute("aria-hidden", "true");

  audioEl.addEventListener("timeupdate", () => {
    if (!audioEl) return;
    const second = Math.floor(Number(audioEl.currentTime || 0));
    if (second === lastSyncedSecond) return;
    lastSyncedSecond = second;
    currentState.currentTime = clampTime(audioEl.currentTime);
    saveState();
    syncPlaybackUi();
  });

  audioEl.addEventListener("play", () => {
    currentState.isPlaying = true;
    saveState();
    renderMenuMusic();
    syncPlaybackUi();
  });

  audioEl.addEventListener("pause", () => {
    if (suppressPauseSync || audioEl.ended) return;
    currentState.isPlaying = false;
    currentState.currentTime = clampTime(audioEl.currentTime);
    saveState();
    renderMenuMusic();
    syncPlaybackUi();
  });

  audioEl.addEventListener("ended", () => {
    playNextTrack(true);
  });

  audioEl.addEventListener("error", () => {
    const brokenId = String(audioEl?.dataset.trackId || "").trim();
    if (brokenId) {
      brokenTrackIds.add(brokenId);
    }

    if (enabledTracks().some((track) => track.id !== brokenId && !brokenTrackIds.has(track.id))) {
      currentState.trackId = pickNextTrackId(brokenId);
      currentState.currentTime = 0;
      currentState.isPlaying = true;
      saveState();
      syncFromState(true);
      return;
    }

    currentState.isPlaying = false;
    currentState.currentTime = 0;
    saveState();
    renderMenuMusic();
    syncPlaybackUi();
  });

  audioEl.addEventListener("loadedmetadata", () => {
    syncPlaybackUi();
  });

  audioEl.addEventListener("durationchange", () => {
    syncPlaybackUi();
  });

  document.body.appendChild(audioEl);
  return audioEl;
}

function applyAudioVolume() {
  const el = ensureAudioElement();
  const volume = effectiveMusicVolume();
  el.muted = volume <= 0;
  el.volume = Math.max(0, Math.min(1, volume / 100));
}

function syncTrackSource(forceReload = false) {
  const el = ensureAudioElement();
  const track = activeTrack();
  const trackId = String(track?.id || "").trim();
  const src = String(track?.src || "").trim();

  if (!trackId || !src) {
    suppressPauseSync = true;
    el.pause();
    el.removeAttribute("src");
    el.dataset.trackId = "";
    el.load();
    suppressPauseSync = false;
    lastSyncedSecond = -1;
    renderMenuMusic();
    syncPlaybackUi();
    return false;
  }

  if (forceReload || el.dataset.trackId !== trackId || !el.currentSrc) {
    suppressPauseSync = true;
    el.pause();
    el.src = src;
    el.dataset.trackId = trackId;
    el.load();
    suppressPauseSync = false;
    lastSyncedSecond = -1;
    try {
      el.currentTime = clampTime(currentState.currentTime);
    } catch {}
  }

  applyAudioVolume();
  syncPlaybackUi();
  return true;
}

async function syncFromState(tryPlay = false) {
  const hasTrack = syncTrackSource(false);
  if (!hasTrack) return;

  const el = ensureAudioElement();
  if (Math.abs(Number(el.currentTime || 0) - Number(currentState.currentTime || 0)) > 1.25) {
    try {
      el.currentTime = clampTime(currentState.currentTime);
    } catch {}
  }

  applyAudioVolume();

  if (!tryPlay || !currentState.isPlaying) {
    renderMenuMusic();
    return;
  }

  try {
    await el.play();
  } catch {
    currentState.isPlaying = false;
    saveState();
  }

  renderMenuMusic();
}

async function playTrack(trackId, startAt = null) {
  const targetTrack = findMusicTrack(trackId) || findMusicTrack(firstEnabledTrackId());
  if (!targetTrack) return;

  if (!trackIsEnabled(targetTrack.id)) {
    currentPrefs = normalizePrefs({
      ...currentPrefs,
      disabledTrackIds: currentPrefs.disabledTrackIds.filter((id) => id !== targetTrack.id)
    });
    savePrefs();
  }

  brokenTrackIds.delete(targetTrack.id);
  currentState.trackId = targetTrack.id;
  currentState.currentTime = startAt == null ? clampTime(currentState.currentTime) : clampTime(startAt);
  currentState.isPlaying = true;
  saveState();

  const hasTrack = syncTrackSource(true);
  if (!hasTrack) return;

  const el = ensureAudioElement();
  try {
    el.currentTime = clampTime(currentState.currentTime);
  } catch {}

  try {
    await el.play();
  } catch {
    currentState.isPlaying = false;
    saveState();
  }

  renderMenuMusic();
}

function pauseMusic() {
  const el = ensureAudioElement();
  currentState.isPlaying = false;
  currentState.currentTime = clampTime(el.currentTime);
  saveState();
  el.pause();
  renderMenuMusic();
}

async function playNextTrack(autoStarted = false) {
  const nextTrackId = pickNextTrackId(currentState.trackId);
  if (!nextTrackId) {
    pauseMusic();
    return;
  }

  currentState.currentTime = 0;
  currentState.trackId = nextTrackId;
  currentState.isPlaying = true;
  saveState();
  await playTrack(nextTrackId, 0);

  if (autoStarted) {
    renderMenuMusic();
  }
}

async function playPreviousTrack() {
  const previousTrackId = pickPreviousTrackId(currentState.trackId);
  if (!previousTrackId) {
    pauseMusic();
    return;
  }

  currentState.currentTime = 0;
  currentState.trackId = previousTrackId;
  currentState.isPlaying = true;
  saveState();
  await playTrack(previousTrackId, 0);
}

function toggleTrackEnabled(trackId, enabled) {
  const targetId = String(trackId || "").trim();
  if (!targetId) return;

  const disabled = new Set(currentPrefs.disabledTrackIds);
  if (enabled) {
    disabled.delete(targetId);
    brokenTrackIds.delete(targetId);
  } else {
    disabled.add(targetId);
  }

  currentPrefs = normalizePrefs({ ...currentPrefs, disabledTrackIds: [...disabled] });
  savePrefs();

  const anyEnabled = enabledTracks().length > 0;
  if (!anyEnabled) {
    pauseMusic();
    renderMenuMusic();
    return;
  }

  if (!trackIsEnabled(currentState.trackId)) {
    currentState.trackId = firstEnabledTrackId();
    currentState.currentTime = 0;
    saveState();
    if (currentState.isPlaying) {
      syncFromState(true);
    } else {
      renderMenuMusic();
    }
    return;
  }

  renderMenuMusic();
}

function reorderTracks(draggedId, targetId, beforeTarget = true) {
  const sourceId = String(draggedId || "").trim();
  const destinationId = String(targetId || "").trim();
  if (!sourceId || !destinationId || sourceId === destinationId) return;

  const order = [...currentPrefs.trackOrder];
  const sourceIndex = order.indexOf(sourceId);
  const destinationIndex = order.indexOf(destinationId);
  if (sourceIndex < 0 || destinationIndex < 0) return;

  order.splice(sourceIndex, 1);
  const adjustedDestinationIndex = order.indexOf(destinationId);
  order.splice(beforeTarget ? adjustedDestinationIndex : adjustedDestinationIndex + 1, 0, sourceId);

  currentPrefs = normalizePrefs({
    ...currentPrefs,
    trackOrder: order
  });
  savePrefs();
  renderMenuMusic();
}

function clearDropTargets() {
  if (!menuSlot) return;
  menuSlot.querySelectorAll(".menu-music-track-row.is-drop-before, .menu-music-track-row.is-drop-after, .menu-music-track-row.is-dragging")
    .forEach((row) => row.classList.remove("is-drop-before", "is-drop-after", "is-dragging"));
}

function renderTrackRows() {
  return orderedTracks().map((track) => {
    const enabled = trackIsEnabled(track.id);
    const active = currentState.trackId === track.id;
    const broken = brokenTrackIds.has(track.id);
    const toggleLabel = enabled ? "Enabled" : "Disabled";

    return `
      <div class="menu-music-track-row ${active ? "is-current" : ""} ${enabled ? "" : "is-muted"} ${broken ? "is-broken" : ""}" draggable="true" data-track-row-id="${escapeHtml(track.id)}" title="Drag to reorder">
        <button type="button" class="menu-music-track-main" data-music-action="play-track" data-track-id="${escapeHtml(track.id)}">
          <span>${escapeHtml(track.name)}</span>
          <small>${escapeHtml(track.artist)}${broken ? " - needs a real audio file" : ""}</small>
        </button>
        <label class="menu-music-track-toggle">
          <input type="checkbox" data-music-action="toggle-track" data-track-id="${escapeHtml(track.id)}" ${enabled ? "checked" : ""} />
          ${toggleLabel}
        </label>
      </div>
    `;
  }).join("");
}

function renderMenuMusic() {
  if (!menuSlot) return;

  const track = activeTrack();
  const settings = getToastAudioSettings();
  const musicVolume = clampPercent(settings?.musicVolume, 70);
  const panelClass = currentUi.expanded ? "" : "section-hidden";
  const trackName = track ? escapeHtml(track.name) : "No music added yet.";
  const trackArtist = track ? escapeHtml(track.artist) : "";

  menuSlot.innerHTML = `
    <div class="menu-music-card">
      <div class="menu-music-head">
        <button type="button" class="menu-music-toggle" id="menu-music-toggle">
          <span class="menu-music-toggle-copy">
            <strong>Music</strong>
            <small>${trackName}</small>
          </span>
          <span class="menu-music-toggle-state">${currentState.isPlaying ? "Playing" : "Paused"}</span>
        </button>
        <button type="button" class="menu-music-quick-mute" id="menu-music-quick-mute">Mute</button>
      </div>

      <div id="menu-music-panel" class="menu-music-panel ${panelClass}">
        <div class="menu-music-now">
          <strong>${track ? trackName : "No track selected"}</strong>
          <small>${trackArtist ? `By ${trackArtist}` : "No artist listed."}</small>
          <small class="menu-music-status">${formatStatusLine()}</small>
        </div>

        <div class="menu-music-progress-block">
          <div class="menu-music-progress-head">
            <strong>Song position</strong>
            <span class="menu-music-time-copy">
              <span id="menu-music-time-elapsed">0:00</span>
              <span aria-hidden="true"> / </span>
              <span id="menu-music-time-left">-0:00</span>
            </span>
          </div>
          <input
            id="menu-music-progress-slider"
            class="audio-volume-slider menu-music-progress-slider"
            type="range"
            min="0"
            max="1"
            step="0.1"
            value="0"
          />
        </div>

        <div class="menu-music-controls">
          <button type="button" class="menu-music-control-button" data-music-action="previous-track" title="Previous song" aria-label="Previous song">&#x23EE;&#xFE0F;</button>
          <button type="button" class="menu-music-control-button" data-music-action="seek-back" title="Back 10 seconds" aria-label="Back 10 seconds">&#x23EA;</button>
          <button type="button" class="menu-music-control-button is-primary" data-music-action="toggle-play" title="${currentState.isPlaying ? "Pause" : "Play"}" aria-label="${currentState.isPlaying ? "Pause" : "Play"}">${currentState.isPlaying ? "&#x23F8;&#xFE0F;" : "&#x25B6;&#xFE0F;"}</button>
          <button type="button" class="menu-music-control-button" data-music-action="seek-forward" title="Forward 10 seconds" aria-label="Forward 10 seconds">&#x23E9;</button>
          <button type="button" class="menu-music-control-button" data-music-action="next-track" title="Next song" aria-label="Next song">&#x23ED;&#xFE0F;</button>
        </div>

        <div class="menu-music-volume-block">
          <div class="menu-music-volume-head">
            <strong>Music volume</strong>
            <span id="menu-music-volume-value">${musicVolume}%</span>
          </div>
          <input
            id="menu-music-volume-slider"
            class="audio-volume-slider menu-music-volume-slider"
            type="range"
            min="0"
            max="100"
            step="1"
            value="${musicVolume}"
          />
        </div>

        <div class="menu-music-track-list">
          ${renderTrackRows()}
        </div>
      </div>
    </div>
  `;

  syncMenuVolumeUi(settings);
  syncPlaybackUi();
}

function bindMenuSlot() {
  if (!menuSlot || boundMenuEvents) return;
  boundMenuEvents = true;

  menuSlot.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-music-action], #menu-music-toggle");
    if (!target) return;

    if (target.id === "menu-music-toggle") {
      currentUi = normalizeUi({ ...currentUi, expanded: !currentUi.expanded });
      saveUi();
      renderMenuMusic();
      return;
    }

    const action = String(target.dataset.musicAction || "").trim();
    const trackId = String(target.dataset.trackId || "").trim();

    if (action === "toggle-play") {
      if (currentState.isPlaying) {
        pauseMusic();
      } else {
        await playTrack(currentState.trackId || firstEnabledTrackId(), currentState.currentTime);
      }
      return;
    }

    if (action === "previous-track") {
      await playPreviousTrack();
      return;
    }

    if (action === "seek-back") {
      seekBy(-10);
      return;
    }

    if (action === "seek-forward") {
      seekBy(10);
      return;
    }

    if (action === "next-track") {
      await playNextTrack(false);
      return;
    }

    if (action === "play-track" && trackId) {
      await playTrack(trackId, 0);
    }
  });

  menuSlot.addEventListener("click", (event) => {
    const quickMute = event.target.closest("#menu-music-quick-mute");
    if (!quickMute) return;
    const next = toggleToastAudioChannelMute("musicVolume");
    syncMenuVolumeUi(next);
  });

  menuSlot.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    const action = String(target.dataset.musicAction || "").trim();
    const trackId = String(target.dataset.trackId || "").trim();

    if (action === "toggle-track" && trackId) {
      toggleTrackEnabled(trackId, !!target.checked);
      return;
    }

    if (target.id === "menu-music-progress-slider") {
      const nextTime = clampTime(target.value);
      if (audioEl) {
        try {
          audioEl.currentTime = nextTime;
        } catch {}
      }
      currentState.currentTime = nextTime;
      saveState();
      isSeeking = false;
      syncPlaybackUi();
      return;
    }

    if (target.id === "menu-music-volume-slider") {
      setToastAudioChannelVolume("musicVolume", target.value);
      renderMenuMusic();
    }
  });

  menuSlot.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.id === "menu-music-progress-slider") {
      isSeeking = true;
      const duration = Number(target.max || 0);
      const safeValue = Math.min(clampTime(target.value), duration > 0 ? duration : clampTime(target.value));
      const percent = duration > 0 ? (safeValue / duration) * 100 : 0;
      setSliderVisual(target, percent);
      syncPlaybackUi(safeValue);
      return;
    }

    if (target.id !== "menu-music-volume-slider") return;

    setSliderVisual(target, target.value);
    const valueEl = document.getElementById("menu-music-volume-value");
    if (valueEl) {
      valueEl.textContent = `${clampPercent(target.value, 70)}%`;
    }
    setToastAudioChannelVolume("musicVolume", target.value);
  });

  menuSlot.addEventListener("dragstart", (event) => {
    const row = event.target.closest(".menu-music-track-row");
    if (!row) return;
    draggedTrackId = String(row.dataset.trackRowId || "").trim();
    if (!draggedTrackId) return;
    row.classList.add("is-dragging");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggedTrackId);
    }
  });

  menuSlot.addEventListener("dragover", (event) => {
    const row = event.target.closest(".menu-music-track-row");
    if (!row || !draggedTrackId) return;
    const targetId = String(row.dataset.trackRowId || "").trim();
    if (!targetId || targetId === draggedTrackId) return;
    event.preventDefault();
    clearDropTargets();
    const rect = row.getBoundingClientRect();
    const beforeTarget = event.clientY < rect.top + rect.height / 2;
    row.classList.add(beforeTarget ? "is-drop-before" : "is-drop-after");
  });

  menuSlot.addEventListener("drop", (event) => {
    const row = event.target.closest(".menu-music-track-row");
    if (!row || !draggedTrackId) return;
    event.preventDefault();
    const targetId = String(row.dataset.trackRowId || "").trim();
    if (!targetId || targetId === draggedTrackId) {
      clearDropTargets();
      draggedTrackId = "";
      return;
    }

    const beforeTarget = row.classList.contains("is-drop-before");
    reorderTracks(draggedTrackId, targetId, beforeTarget);
    clearDropTargets();
    draggedTrackId = "";
  });

  menuSlot.addEventListener("dragend", () => {
    clearDropTargets();
    draggedTrackId = "";
  });
}

function exposeApi() {
  window.PanategwaMusic = {
    getState: () => ({ ...currentState }),
    getPrefs: () => ({ ...currentPrefs }),
    getTracks: () => getMusicTracks(),
    play: () => playTrack(currentState.trackId || firstEnabledTrackId(), currentState.currentTime),
    pause: pauseMusic,
    next: () => playNextTrack(false),
    previous: playPreviousTrack,
    setTrackEnabled: toggleTrackEnabled,
    setMusicVolume: (value) => setToastAudioChannelVolume("musicVolume", value),
    captureState: () => {
      if (!audioEl) return;
      currentState.currentTime = clampTime(audioEl.currentTime);
      currentState.isPlaying = !audioEl.paused && !audioEl.ended;
      saveState();
    }
  };
}

function bindGlobalEvents() {
  window.addEventListener("panategwa:audio-settings-change", (event) => {
    applyAudioVolume();
    syncMenuVolumeUi(event?.detail?.settings || getToastAudioSettings());
  });

  window.addEventListener("storage", (event) => {
    const key = String(event.key || "").trim();
    if (!MUSIC_STORAGE_KEYS.has(key)) return;

    if (key === "ptg_audio_settings") {
      applyAudioVolume();
      syncMenuVolumeUi(getToastAudioSettings());
      return;
    }

    currentPrefs = loadPrefs();
    currentState = loadState();
    currentUi = loadUi();
    applyAudioVolume();
    renderMenuMusic();
    if (currentState.isPlaying) {
      syncFromState(true);
    } else {
      syncPlaybackUi();
    }
  });

  window.addEventListener("pagehide", () => {
    if (!audioEl) return;
    currentState.currentTime = clampTime(audioEl.currentTime);
    saveState();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden" || !audioEl) return;
    currentState.currentTime = clampTime(audioEl.currentTime);
    saveState();
  });
}

function whenMenuReady(callback) {
  const existing = document.getElementById("menu-music-slot");
  if (existing) {
    callback(existing);
    return;
  }

  const observer = new MutationObserver(() => {
    const slot = document.getElementById("menu-music-slot");
    if (!slot) return;
    observer.disconnect();
    callback(slot);
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function start() {
  musicTracks = getMusicTracks();
  currentPrefs = loadPrefs();
  currentState = loadState();
  currentUi = loadUi();

  ensureAudioElement();
  applyAudioVolume();
  exposeApi();
  bindGlobalEvents();

  whenMenuReady((slot) => {
    menuSlot = slot;
    bindMenuSlot();
    renderMenuMusic();
  });

  if (currentState.isPlaying) {
    syncFromState(true);
  } else {
    syncFromState(false);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
