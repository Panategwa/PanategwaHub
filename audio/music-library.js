// Edit this one list to add, remove, rename, or replace songs.
export const MUSIC_LIBRARY = Object.freeze([
  {
    id: "space-ambient-131412",
    name: "The Space Ambient",
    artist: "The_Mountain",
    src: "music/tracks/the-space-ambient-131412.mp3",
    sourcePage: "https://pixabay.com/music/beats-the-space-ambient-131412/",
    enabledByDefault: true
  },
  {
    id: "space-1990",
    name: "Space 1990",
    artist: "Kevin MacLeod",
    src: "music/tracks/space-1990.mp3",
    sourcePage: "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Space%201990.mp3",
    enabledByDefault: true
  },
  {
    id: "cinematic-space-510707",
    name: "Cinematic Space",
    artist: "leberch",
    src: "music/tracks/cinematic-space-510707.mp3",
    sourcePage: "https://pixabay.com/music/meditationspiritual-cinematic-space-510707/",
    enabledByDefault: true
  }
]);

export function getMusicTracks() {
  return MUSIC_LIBRARY.map((track) => ({
    id: String(track.id || "").trim(),
    name: String(track.name || "Untitled track").trim(),
    artist: String(track.artist || "Unknown artist").trim(),
    src: String(track.src || "").trim(),
    sourcePage: String(track.sourcePage || "").trim(),
    enabledByDefault: track.enabledByDefault !== false
  })).filter((track) => track.id);
}

export function findMusicTrack(trackId) {
  const targetId = String(trackId || "").trim();
  return getMusicTracks().find((track) => track.id === targetId) || null;
}
