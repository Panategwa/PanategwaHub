// Add local songs here. Every file should live in music/library.
// Keep it simple: file + name + artist.
export const MUSIC_LIBRARY = Object.freeze([
  { file: "the-space-ambient-131412.mp3", name: "The Space Ambient", artist: "The_Mountain" },
  { file: "space-1990.mp3", name: "Space 1990", artist: "Kevin MacLeod" },
  { file: "cinematic-space-510707.mp3", name: "Cinematic Space", artist: "leberch" },
  { file: "stasemusic-alien-techno-249819.mp3", name: "Alien Techno", artist: "StasEMusic" },
  { file: "the_mountain-sci-fi-512284.mp3", name: "Sci-Fi", artist: "The_Mountain" }
]);

function trackIdFromFile(fileName) {
  return String(fileName || "")
    .trim()
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function trackSrc(fileName) {
  return new URL(String(fileName || "").trim(), import.meta.url).href;
}

export function getMusicTracks() {
  return MUSIC_LIBRARY.map((track) => {
    const file = String(track.file || "").trim();
    const id = String(track.id || trackIdFromFile(file)).trim();
    if (!file || !id) return null;

    return {
      id,
      file,
      name: String(track.name || id).trim(),
      artist: String(track.artist || "Unknown artist").trim(),
      src: trackSrc(file),
      enabledByDefault: track.enabledByDefault !== false
    };
  }).filter(Boolean);
}

export function findMusicTrack(trackId) {
  const targetId = String(trackId || "").trim();
  return getMusicTracks().find((track) => track.id === targetId) || null;
}
