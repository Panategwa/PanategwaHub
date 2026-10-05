import {
  auth,
  authReady,
  db,
  googleProvider,
  observeActiveAuth,
  getAccountSlots,
  getActiveAccountSlotId,
  activateAccountSlot,
  activateFirstEmptyAccountSlot,
  removeAccountSlot,
  removeAllAccountSlots,
  subscribeAccountSlots,
  notifyActiveAuthObservers
} from "./firebase-config.js";

import {
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  signInWithEmailAndPassword,
  signInWithPopup,
  sendEmailVerification,
  reload,
  updateProfile,
  deleteUser,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  EmailAuthProvider,
  sendPasswordResetEmail,
  verifyBeforeUpdateEmail,
  updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  addDoc,
  updateDoc,
  collection,
  query,
  where,
  serverTimestamp,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

function userRef(uid) {
  return doc(db, "privateUsers", uid);
}

function directoryRef(uid) {
  return doc(db, "users", uid);
}

function friendProfileRef(uid) {
  return doc(db, "friendProfiles", uid);
}

let accountSetupGate = null;

function beginAccountSetupGate() {
  if (accountSetupGate) throw new Error("Another account setup is already in progress.");
  let releasePromise;
  const promise = new Promise((resolve) => { releasePromise = resolve; });
  const gate = { promise, releasePromise };
  accountSetupGate = gate;
  return () => {
    if (accountSetupGate === gate) accountSetupGate = null;
    releasePromise();
  };
}

async function waitForAccountSetup(gateIsOwner = false) {
  const gate = accountSetupGate;
  if (gate && !gateIsOwner) await gate.promise;
}

function cleanText(text) {
  return String(text || "").trim();
}

function cleanEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function emailVerificationActionSettings(marker) {
  if (typeof window === "undefined" || !["http:", "https:"].includes(window.location.protocol)) return undefined;
  const continueUrl = new URL(window.location.href);
  continueUrl.searchParams.set("tab", "settings");
  continueUrl.searchParams.set("sub", "account");
  continueUrl.searchParams.delete("target");
  continueUrl.searchParams.delete("emailVerificationComplete");
  continueUrl.searchParams.delete("emailChangeComplete");
  continueUrl.searchParams.set(marker, "1");
  return { url: continueUrl.href };
}

async function runEmailActionWithReturn(action, marker) {
  const actionSettings = emailVerificationActionSettings(marker);
  try {
    await action(actionSettings);
    return true;
  } catch (error) {
    const continueUrlError = ["auth/unauthorized-continue-uri", "auth/invalid-continue-uri"].includes(error?.code);
    if (!actionSettings || !continueUrlError) throw error;
    // Keep verification usable if this domain is not authorized yet; the user
    // can return to the site and refresh their account status manually.
    await action(undefined);
    return false;
  }
}

function uniqueStrings(value) {
  const arr = Array.isArray(value) ? value : [];
  return [...new Set(arr.map((item) => String(item || "").trim()).filter(Boolean))];
}

export function normalizePrivacySettings(settings = {}) {
  const preset = ["private", "public", "custom"].includes(String(settings.preset || "").toLowerCase())
    ? String(settings.preset).toLowerCase()
    : "private";
  const fields = ["showAvatar", "showVerified", "showRank", "showJoined", "showStreaks", "showSiteAge"];
  const normalized = { preset };
  for (const field of fields) {
    normalized[field] = preset === "public" || (preset === "custom" && settings[field] === true);
  }
  return normalized;
}

export function normalizeSiteTimeMs(value) {
  const ms = Number(value || 0);
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms) : 0;
}

export function siteTimeLiveStorageKey(uid) {
  return `ptg_site_time_live_${cleanText(uid)}`;
}

export function siteTimePendingStorageKey(uid) {
  return `ptg_site_time_pending_${cleanText(uid)}`;
}

// The same three sources the sidebar clock reads in js/site.js: the value the
// page is tracking in memory (mirrored to localStorage), the last value that
// was flushed, and this tab's unspent time. The largest wins so the number can
// never appear to move backwards. Previously this ignored its uid and returned
// only the fallback, so the Firestore snapshot was used unchanged.
export function getLiveSiteTimeMs(uid, fallback = 0) {
  const cleanUid = cleanText(uid || "");
  const base = normalizeSiteTimeMs(fallback);
  if (!cleanUid) return base;

  let live = 0;
  try {
    live = normalizeSiteTimeMs(localStorage.getItem(siteTimeLiveStorageKey(cleanUid)));
  } catch (e) {}

  let pending = 0;
  try {
    pending = normalizeSiteTimeMs(sessionStorage.getItem(siteTimePendingStorageKey(cleanUid)));
  } catch (e) {}

  return Math.max(base, live, pending);
}
export function getResolvedProfileSiteTime(profile, uid = auth.currentUser?.uid) {
  const cleanUid = cleanText(uid || profile?.uid || "");
  const base = normalizeSiteTimeMs(profile?.siteTimeMs);
  return cleanUid ? getLiveSiteTimeMs(cleanUid, base) : base;
}

export function formatSiteTimeDuration(value, options = {}) {
  const includeSeconds = !!options?.includeSeconds;
  const totalSeconds = Math.floor(normalizeSiteTimeMs(value) / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const MINUTES_PER_HOUR = 60;
  const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
  const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;
  const MINUTES_PER_MONTH = 30 * MINUTES_PER_DAY;
  const MINUTES_PER_YEAR = 365 * MINUTES_PER_DAY;

  let remaining = totalMinutes;
  const years = Math.floor(remaining / MINUTES_PER_YEAR);
  remaining -= years * MINUTES_PER_YEAR;
  const months = Math.floor(remaining / MINUTES_PER_MONTH);
  remaining -= months * MINUTES_PER_MONTH;
  const weeks = Math.floor(remaining / MINUTES_PER_WEEK);
  remaining -= weeks * MINUTES_PER_WEEK;
  const days = Math.floor(remaining / MINUTES_PER_DAY);
  remaining -= days * MINUTES_PER_DAY;
  const hours = Math.floor(remaining / MINUTES_PER_HOUR);
  remaining -= hours * MINUTES_PER_HOUR;
  const minutes = remaining;
  const seconds = Math.max(0, totalSeconds - (totalMinutes * 60));

  const parts = [];
  if (years) parts.push(`${years} year${years === 1 ? "" : "s"}`);
  if (months) parts.push(`${months} month${months === 1 ? "" : "s"}`);
  if (weeks) parts.push(`${weeks} week${weeks === 1 ? "" : "s"}`);
  parts.push(`${days} day${days === 1 ? "" : "s"}`);
  parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  parts.push(`${minutes} min${minutes === 1 ? "" : "s"}`);
  if (includeSeconds) {
    parts.push(`${seconds} sec${seconds === 1 ? "" : "s"}`);
  }
  return parts.join(", ");
}

function currentThemeSetting() {
  try {
    return localStorage.getItem("theme") || "Panategwa Mode (Default)";
  } catch {
    return "Panategwa Mode (Default)";
  }
}

function currentTextSizeSetting() {
  try {
    return localStorage.getItem("textsize") || "medium";
  } catch {
    return "medium";
  }
}

function currentHourBucket() {
  const hour = new Date().getHours();
  if (hour >= 21 || hour < 3) return "nocturnal";
  if (hour >= 3 && hour < 11) return "morning";
  return "day";
}

function normalizeProgressBaseline(value = {}) {
  return {
    resetAt: typeof value.resetAt === "number" ? value.resetAt : 0,
    username: String(value.username || ""),
    verified: !!value.verified,
    theme: String(value.theme || ""),
    textSize: String(value.textSize || ""),
    hourBucket: String(value.hourBucket || ""),
    friends: uniqueStrings(value.friends),
    siteTimeMs: normalizeSiteTimeMs(value.siteTimeMs)
  };
}

function defaultUsername(user) {
  return user?.displayName || user?.email?.split("@")?.[0] || "Player";
}

const RANK_LEVELS = Object.freeze({
  Adventurer: 0,
  Explorer: 1,
  Experienced: 2,
  Veteran: 3
});

const DEFAULT_AVATAR_PRESET = Object.freeze({
  id: "default",
  name: "Default pfp",
  requirementText: "None",
  svg: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
      <defs>
        <linearGradient id="g" x1="0" x2="1">
          <stop stop-color="#38bdf8"/>
          <stop offset="1" stop-color="#2563eb"/>
        </linearGradient>
      </defs>
      <rect width="128" height="128" rx="64" fill="url(#g)"/>
      <circle cx="64" cy="48" r="22" fill="rgba(255,255,255,0.92)"/>
      <path d="M31 104c3-20 17-34 33-34s30 14 33 34" fill="rgba(255,255,255,0.92)"/>
    </svg>
  `
});

// Avatar catalog:
// Edit DEFAULT_AVATAR_PRESET and AVATAR_PRESETS below.
// Each entry keeps the id, name, unlock requirements, and SVG artwork together in one place.
export const AVATAR_PRESETS = Object.freeze([
  // Add more profile pictures by copying one object and changing id, name, requirement, and svg.
  // Keep every requirement object in the same shape:
  // rank, achievementId, achievementName, hiddenAchievement, note
  Object.freeze({
    id: "1",
    name: "Trail Spark",
    requirement: Object.freeze({
      rank: "Adventurer",
      achievementId: "",
      achievementName: "",
      hiddenAchievement: false,
      note: "Adventurer rank"
    }),
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#0ea5e9"/><stop offset="1" stop-color="#2563eb"/></linearGradient></defs>
        <rect width="128" height="128" rx="64" fill="url(#g)"/>
        <circle cx="64" cy="64" r="40" fill="rgba(255,255,255,0.12)"/>
        <path d="M64 24 76 49l28 4-20 19 5 28-25-13-25 13 5-28-20-19 28-4z" fill="rgba(255,255,255,0.96)"/>
      </svg>
    `
  }),
  Object.freeze({
    id: "2",
    name: "Ember Crest",
    requirement: Object.freeze({
      rank: "Adventurer",
      achievementId: "",
      achievementName: "",
      hiddenAchievement: false,
      note: "Adventurer rank"
    }),
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#f97316"/><stop offset="1" stop-color="#ef4444"/></linearGradient></defs>
        <rect width="128" height="128" rx="64" fill="url(#g)"/>
        <path d="M64 18 87 36l23 16-8 29-21 21H47L26 81l-8-29 23-16z" fill="rgba(255,255,255,0.94)"/>
        <path d="M64 38 77 50l12 9-5 18-13 13H57L44 77l-5-18 12-9z" fill="rgba(249,115,22,0.42)"/>
      </svg>
    `
  }),
  Object.freeze({
    id: "3",
    name: "Explorer Beacon",
    requirement: Object.freeze({
      rank: "Explorer",
      achievementId: "",
      achievementName: "",
      hiddenAchievement: false,
      note: "Explorer rank"
    }),
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#0f766e"/><stop offset="1" stop-color="#38bdf8"/></linearGradient></defs>
        <rect width="128" height="128" rx="64" fill="url(#g)"/>
        <circle cx="64" cy="64" r="44" fill="rgba(255,255,255,0.08)"/>
        <path d="M64 22 75 50l30 2-23 18 8 28-26-16-26 16 8-28-23-18 30-2z" fill="rgba(255,255,255,0.96)"/>
        <circle cx="64" cy="60" r="8" fill="rgba(15,118,110,0.4)"/>
      </svg>
    `
  }),
  Object.freeze({
    id: "4",
    name: "Sky Marker",
    requirement: Object.freeze({
      rank: "Explorer",
      achievementId: "",
      achievementName: "",
      hiddenAchievement: false,
      note: "Explorer rank"
    }),
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#2563eb"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs>
        <rect width="128" height="128" rx="64" fill="url(#g)"/>
        <path d="M64 20c18 10 30 26 30 43 0 21-15 34-30 46-15-12-30-25-30-46 0-17 12-33 30-43z" fill="rgba(255,255,255,0.96)"/>
        <circle cx="64" cy="60" r="12" fill="rgba(37,99,235,0.45)"/>
      </svg>
    `
  }),
  Object.freeze({
    id: "5",
    name: "Week Flame",
    requirement: Object.freeze({
      rank: "Explorer",
      achievementId: "week_streak",
      achievementName: "Week Streak",
      hiddenAchievement: false,
      note: "Explorer + Week Streak"
    }),
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#16a34a"/><stop offset="1" stop-color="#22c55e"/></linearGradient></defs>
        <rect width="128" height="128" rx="64" fill="url(#g)"/>
        <rect x="26" y="28" width="76" height="72" rx="18" fill="rgba(255,255,255,0.92)"/>
        <path d="M43 20v20m42-20v20" stroke="rgba(255,255,255,0.92)" stroke-width="8" stroke-linecap="round"/>
        <path d="M44 60h14m12 0h14m-26 18h26" stroke="rgba(22,163,74,0.65)" stroke-width="8" stroke-linecap="round"/>
      </svg>
    `
  }),
  Object.freeze({
    id: "6",
    name: "Settled Signal",
    requirement: Object.freeze({
      rank: "Experienced",
      achievementId: "site_20_minutes",
      achievementName: "Settled In",
      hiddenAchievement: false,
      note: "Experienced + Settled In"
    }),
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#4338ca"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs>
        <rect width="128" height="128" rx="64" fill="url(#g)"/>
        <path d="M64 18 90 44v52l-26 14-26-14V44z" fill="rgba(255,255,255,0.94)"/>
        <path d="M64 38v42" stroke="rgba(67,56,202,0.52)" stroke-width="8" stroke-linecap="round"/>
        <path d="M50 54h28" stroke="rgba(67,56,202,0.52)" stroke-width="8" stroke-linecap="round"/>
      </svg>
    `
  }),
  Object.freeze({
    id: "7",
    name: "Crew Link",
    requirement: Object.freeze({
      rank: "Experienced",
      achievementId: "three_friends",
      achievementName: "Small Crew",
      hiddenAchievement: false,
      note: "Experienced + Small Crew"
    }),
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#1d4ed8"/><stop offset="1" stop-color="#0ea5e9"/></linearGradient></defs>
        <rect width="128" height="128" rx="64" fill="url(#g)"/>
        <circle cx="40" cy="48" r="14" fill="rgba(255,255,255,0.94)"/>
        <circle cx="88" cy="48" r="14" fill="rgba(255,255,255,0.94)"/>
        <circle cx="64" cy="84" r="16" fill="rgba(255,255,255,0.94)"/>
        <path d="M48 56 58 72M80 56 70 72M54 84h20" stroke="rgba(29,78,216,0.48)" stroke-width="8" stroke-linecap="round"/>
      </svg>
    `
  }),
  Object.freeze({
    id: "8",
    name: "Veteran Crest",
    requirement: Object.freeze({
      rank: "Veteran",
      achievementId: "achievement_collector",
      achievementName: "Achievement Collector",
      hiddenAchievement: false,
      note: "Veteran + Achievement Collector"
    }),
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#7c2d12"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs>
        <rect width="128" height="128" rx="64" fill="url(#g)"/>
        <path d="M64 16 92 34l10 28-12 34-26 16-26-16-12-34 10-28z" fill="rgba(255,255,255,0.95)"/>
        <path d="M64 34 74 56h24L79 71l7 23-22-12-22 12 7-23-19-15h24z" fill="rgba(124,45,18,0.5)"/>
      </svg>
    `
  }),
  Object.freeze({
    id: "9",
    name: "Year Crown",
    requirement: Object.freeze({
      rank: "Veteran",
      achievementId: "year_streak",
      achievementName: "Year Streak",
      hiddenAchievement: false,
      note: "Veteran + Year Streak"
    }),
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#64748b"/><stop offset="1" stop-color="#38bdf8"/></linearGradient></defs>
        <rect width="128" height="128" rx="64" fill="url(#g)"/>
        <path d="M38 86c8 0 14-7 14-15-8 0-14 7-14 15zm52-15c0 8 6 15 14 15 0-8-6-15-14-15z" fill="rgba(255,255,255,0.88)"/>
        <path d="M34 58 48 72l16-30 16 30 14-14v18c0 14-12 28-30 28S34 90 34 76z" fill="rgba(255,255,255,0.95)"/>
        <circle cx="64" cy="42" r="10" fill="rgba(100,116,139,0.45)"/>
      </svg>
    `
  }),
  Object.freeze({
    id: "10",
    name: "Midnight Relic",
    requirement: Object.freeze({
      rank: "Veteran",
      achievementId: "nocturnal",
      achievementName: "Secret achievement",
      hiddenAchievement: true,
      note: "Veteran + secret achievement"
    }),
    svg: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#0f172a"/><stop offset="1" stop-color="#4338ca"/></linearGradient></defs>
        <rect width="128" height="128" rx="64" fill="url(#g)"/>
        <circle cx="64" cy="64" r="44" fill="rgba(255,255,255,0.06)"/>
        <path d="M64 18 76 46l30 4-22 18 7 28-27-14-27 14 7-28-22-18 30-4z" fill="rgba(255,255,255,0.95)"/>
        <circle cx="64" cy="62" r="9" fill="rgba(67,56,202,0.6)"/>
      </svg>
    `
  })
]);

export const AVATAR_PRESET_IDS = Object.freeze(AVATAR_PRESETS.map((preset) => preset.id));
const AVATAR_PRESET_MAP = new Map(AVATAR_PRESETS.map((preset) => [preset.id, preset]));

export const AVATAR_PRESET_REQUIREMENTS = Object.freeze(
  Object.fromEntries(AVATAR_PRESETS.map((preset) => [preset.id, preset.requirement]))
);

export function getRankFromXp(xp) {
  if (Number(xp || 0) >= 30) return "Veteran";
  if (Number(xp || 0) >= 20) return "Experienced";
  if (Number(xp || 0) >= 10) return "Explorer";
  return "Adventurer";
}

export function doesRankMeetRequirement(rank, requiredRank) {
  return (RANK_LEVELS[rank] ?? 0) >= (RANK_LEVELS[requiredRank] ?? 0);
}

export function getAvatarPresetName(presetId) {
  return AVATAR_PRESET_MAP.get(String(presetId || "1"))?.name || AVATAR_PRESET_MAP.get("1")?.name || "Trail Spark";
}

export function isKnownAvatarPreset(presetId) {
  return AVATAR_PRESET_MAP.has(String(presetId || "").trim());
}

function getAvatarPresetDefinition(presetId) {
  return AVATAR_PRESET_MAP.get(String(presetId || "").trim()) || AVATAR_PRESET_MAP.get("1") || AVATAR_PRESETS[0] || null;
}

export function getAvatarPresetRequirement(presetId) {
  const raw = AVATAR_PRESET_REQUIREMENTS[String(presetId || "1")] || AVATAR_PRESET_REQUIREMENTS["1"];
  return {
    rank: String(raw.rank || "Adventurer"),
    achievementId: raw.achievementId ? String(raw.achievementId) : "",
    achievementName: raw.hiddenAchievement ? "Secret achievement" : String(raw.achievementName || ""),
    hiddenAchievement: !!raw.hiddenAchievement,
    note: String(raw.note || raw.rank || "Adventurer rank")
  };
}

export function getAvatarPresetRequirementText(presetId, unlocked = false) {
  const requirement = getAvatarPresetRequirement(presetId);
  if (!requirement.achievementId) {
    return unlocked ? `${requirement.rank} rank` : `Unlocks at ${requirement.rank}`;
  }

  if (requirement.hiddenAchievement) {
    return unlocked
      ? `${requirement.rank} + secret`
      : `${requirement.rank} + secret`;
  }

  return unlocked
    ? `${requirement.rank} + ${requirement.achievementName}`
    : `${requirement.rank} + ${requirement.achievementName}`;
}

export function isAvatarPresetUnlocked(profile, presetId) {
  const requirement = getAvatarPresetRequirement(presetId);
  const currentRank = getRankFromXp(profile?.xp || 0);
  const hasRank = doesRankMeetRequirement(currentRank, requirement.rank);
  const achievements = uniqueStrings(profile?.achievements);
  const hasAchievement = !requirement.achievementId || achievements.includes(requirement.achievementId);
  return hasRank && hasAchievement;
}

function lockedAvatarReason(profile, presetId) {
  const requirement = getAvatarPresetRequirement(presetId);
  const currentRank = getRankFromXp(profile?.xp || 0);
  if (!doesRankMeetRequirement(currentRank, requirement.rank)) {
    return `${getAvatarPresetName(presetId)} unlocks at ${requirement.rank} rank.`;
  }
  if (requirement.achievementId) {
    return requirement.hiddenAchievement
      ? `${getAvatarPresetName(presetId)} also needs a secret achievement.`
      : `${getAvatarPresetName(presetId)} also needs the "${requirement.achievementName}" achievement.`;
  }
  return `${getAvatarPresetName(presetId)} is locked.`;
}

function svgDataUrl(svg) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function avatarSvgToDataUrl(svg) {
  return svgDataUrl(String(svg || DEFAULT_AVATAR_PRESET.svg || "").trim() || DEFAULT_AVATAR_PRESET.svg);
}

export function getDefaultAvatarDataUrl() {
  return avatarSvgToDataUrl(DEFAULT_AVATAR_PRESET.svg);
}

export function getAvatarPresetPreviewUrl(presetId) {
  return avatarSvgToDataUrl(getAvatarPresetDefinition(presetId)?.svg);
}

export function getAvatarPickerEntries() {
  return Object.freeze([
    Object.freeze({
      id: DEFAULT_AVATAR_PRESET.id,
      name: DEFAULT_AVATAR_PRESET.name,
      requirementText: DEFAULT_AVATAR_PRESET.requirementText,
      previewUrl: getDefaultAvatarDataUrl(),
      hiddenRequirement: false,
      isDefault: true
    }),
    ...AVATAR_PRESETS.map((preset) => Object.freeze({
      id: preset.id,
      name: preset.name,
      requirementText: getAvatarPresetRequirementText(preset.id, false),
      previewUrl: getAvatarPresetPreviewUrl(preset.id),
      hiddenRequirement: !!preset.requirement?.hiddenAchievement,
      isDefault: false
    }))
  ]);
}

function letterAvatarDataUrl(letter) {
  const char = String(letter || "").trim().slice(0, 1).toUpperCase() || "P";
  return svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
      <rect width="128" height="128" rx="64" fill="#27344f"/>
      <text x="64" y="76" text-anchor="middle" font-size="62" font-family="Arial, sans-serif" fill="#fff">${char}</text>
    </svg>
  `);
}

function resolvedStoredAvatar(data = {}) {
  return normalizeStoredAvatarChoice(data).photoURL;
}

function normalizeStoredAvatarChoice(data = {}) {
  const photoURL = cleanText(data.photoURL);
  const avatarType = String(data.avatarType || "").trim().toLowerCase();
  const avatarPreset = String(data.avatarPreset || "").trim();

  if (avatarType === "custom" && photoURL) {
    return {
      photoURL,
      avatarType: "custom",
      avatarPreset: "default",
      avatarLetter: ""
    };
  }

  if (avatarType === "preset" && isKnownAvatarPreset(avatarPreset)) {
    return {
      photoURL: getAvatarPresetPreviewUrl(avatarPreset),
      avatarType: "preset",
      avatarPreset,
      avatarLetter: ""
    };
  }

  return {
    photoURL: getDefaultAvatarDataUrl(),
    avatarType: "default",
    avatarPreset: "default",
    avatarLetter: ""
  };
}

function syncSidebarAvatar(photoURL) {
  if (typeof window.PanategwaUpdateSidebarAvatar === "function") {
    window.PanategwaUpdateSidebarAvatar(photoURL || "", "Account");
  }
}

function baseProfile(user) {
  return {
    uid: user.uid,
    // Email stays in Firebase Auth. Full profile data is stored in the
    // owner-only privateUsers collection; users/{uid} is overwritten with a
    // small directory entry after the one-time migration.
    username: user.displayName || defaultUsername(user),
    photoURL: getDefaultAvatarDataUrl(),
    avatarType: "default",
    avatarPreset: "default",
    verified: !!user.emailVerified,
    xp: 0,
    achievements: [],
    achievementRewardSnapshot: {},
    siteTimeMs: 0,
    visitedPages: [],
    friends: [],
    blocked: [],
    socialSettings: {
      systemEnabled: true,
      requestsEnabled: true
    },
    socialBackup: {
      friends: [],
      blocked: []
    },
    privacySettings: normalizePrivacySettings(),
    progressBaseline: normalizeProgressBaseline(),
    streak: {
      current: 0,
      longest: 0,
      lastClaimAt: null,
      lastClaimDay: ""
    },
    longestStreak: 0,
    streakHistory: {},
    stats: {
      pagesVisited: 0,
      planetsFound: 0,
      secretsFound: 0
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp()
  };
}

function normalizeSocialSettings(settings = {}) {
  return {
    systemEnabled: settings.systemEnabled !== false,
    requestsEnabled: settings.requestsEnabled !== false
  };
}

function normalizeStreak(value = {}) {
  return {
    current: Number(value.current || 0),
    longest: Number(value.longest || 0),
    lastClaimAt: value.lastClaimAt || null,
    lastClaimDay: String(value.lastClaimDay || "")
  };
}

function normalizeStreakHistory(history = {}) {
  if (!history || typeof history !== "object" || Array.isArray(history)) return {};
  const next = {};
  for (const [key, value] of Object.entries(history)) {
    const cleanKey = String(key || "").trim();
    if (!cleanKey || !value || typeof value !== "object") continue;
    next[cleanKey] = {
      reward: Number(value.reward || 0),
      streakDay: Number(value.streakDay || 0),
      claimedAt: value.claimedAt || null
    };
  }
  return next;
}

function friendlyAuthError(error) {
  const code = String(error?.code || "");

  if (code === "auth/email-already-in-use") return "That email is already being used by another account.";
  if (code === "auth/invalid-email") return "That email address is not valid.";
  if (code === "auth/missing-password") return "Enter your password first.";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "That email or password is incorrect.";
  }
  if (code === "auth/too-many-requests") return "Too many attempts. Please wait a moment and try again.";
  if (code === "auth/operation-not-allowed") {
    return "This sign-in method is not enabled in Firebase Authentication yet.";
  }
  if (code === "auth/popup-closed-by-user") return "The Google popup was closed before it finished.";
  if (code === "auth/popup-blocked") return "Your browser blocked the Google popup.";
  if (code === "auth/user-mismatch") return "Choose the same Google account that is linked to this Panategwa account.";
  if (code === "auth/unauthorized-domain") {
    return "This domain is not authorized in Firebase yet. Add it in Firebase Authentication -> Settings -> Authorized domains.";
  }
  if (code === "auth/network-request-failed") return "The network request failed. Check your internet connection and try again.";
  return error?.message || "Authentication failed.";
}

export async function getProfile(uid = auth.currentUser?.uid) {
  if (!uid) return null;
  const snap = await getDoc(userRef(uid));
  if (snap.exists()) return snap.data();

  // Existing accounts are migrated by ensureUserProfile on their next sign-in.
  // Keep this owner-only fallback for callers during that first bootstrap.
  const legacy = await getDoc(directoryRef(uid));
  return legacy.exists() && uid === auth.currentUser?.uid ? legacy.data() : null;
}

export async function getPublicUser(uid) {
  const id = cleanText(uid);
  if (!id) return null;
  const snap = await getDoc(directoryRef(id));
  return snap.exists() ? snap.data() : null;
}

export async function publishProfileDocuments(profile) {
  const uid = cleanText(profile?.uid);
  if (!uid || uid !== auth.currentUser?.uid) return false;

  const socialSettings = normalizeSocialSettings(profile.socialSettings);
  const directory = {
    uid,
    username: cleanText(profile.username || "Player").slice(0, 32) || "Player",
    socialSettings,
    profileVisibility: normalizePrivacySettings(profile.privacySettings).preset === "private" ? "private" : "public"
  };

  const privacy = normalizePrivacySettings(profile.privacySettings);
  const friendView = {
    uid
  };
  if (privacy.preset === "private") {
    await deleteDoc(friendProfileRef(uid));
    await setDoc(directoryRef(uid), directory);
    return true;
  }
  if (privacy.showAvatar) {
    friendView.photoURL = String(profile.photoURL || getDefaultAvatarDataUrl()).slice(0, 300000);
    friendView.avatarType = String(profile.avatarType || "default").slice(0, 32);
    friendView.avatarPreset = String(profile.avatarPreset || "default").slice(0, 64);
    friendView.avatarLetter = String(profile.avatarLetter || "").slice(0, 8);
  }
  if (privacy.showVerified) friendView.verified = auth.currentUser?.emailVerified === true;
  if (privacy.showRank) {
    friendView.xp = Math.max(0, Number(profile.xp || 0));
  }
  if (privacy.showJoined && profile.createdAt) friendView.createdAt = profile.createdAt;
  if (privacy.showStreaks) {
    friendView.streakCurrent = Math.max(0, Number(profile.streak?.current || 0));
    friendView.streakLongest = Math.max(0, Number(profile.longestStreak || profile.streak?.longest || 0));
  }
  if (privacy.showSiteAge) friendView.siteTimeMs = normalizeSiteTimeMs(profile.siteTimeMs);

  // The directory intentionally contains only identity and request preferences.
  // The friend view is a separate document guarded by friendship and the owner's
  // privacy switches in Firestore Rules.
  await setDoc(directoryRef(uid), directory);
  await setDoc(friendProfileRef(uid), friendView);
  return true;
}

export async function ensureUserProfile(user, options = {}) {
  await waitForAccountSetup(options?.duringAccountSetup === true);
  const ref = userRef(user.uid);
  let snap = await getDoc(ref);
  let data = snap.exists() ? snap.data() || {} : null;
  if (!data) {
    // Read the old document as its owner, move all account data into the
    // owner-only collection, then replace the old document with a safe
    // directory projection. This also removes legacy email fields.
    const legacy = await getDoc(directoryRef(user.uid));
    data = legacy.exists() ? legacy.data() || {} : baseProfile(user);
  }

  const achievements = uniqueStrings(data.achievements);
  const visitedPages = uniqueStrings(data.visitedPages);
  const friends = uniqueStrings(data.friends);
  const blocked = uniqueStrings(data.blocked);
  const socialBackup = {
    friends: uniqueStrings(data.socialBackup?.friends),
    blocked: uniqueStrings(data.socialBackup?.blocked)
  };
  const normalizedAvatar = normalizeStoredAvatarChoice(data);

  const merged = {
    uid: user.uid,
    // Provider display names have no useful length limit. Keep imported and
    // legacy names inside the 32-character Firestore directory/rules limit.
    username: cleanText(data.username || user.displayName || defaultUsername(user)).slice(0, 32) || "Player",
    photoURL: normalizedAvatar.photoURL,
    avatarType: normalizedAvatar.avatarType,
    avatarPreset: normalizedAvatar.avatarPreset,
    avatarLetter: normalizedAvatar.avatarLetter,
    verified: !!user.emailVerified,
    xp: typeof data.xp === "number" ? data.xp : achievements.length,
    achievements,
    achievementRewardSnapshot: (!data.achievementRewardSnapshot || typeof data.achievementRewardSnapshot !== "object" || Array.isArray(data.achievementRewardSnapshot))
      ? {}
      : data.achievementRewardSnapshot,
    siteTimeMs: normalizeSiteTimeMs(data.siteTimeMs),
    visitedPages,
    friends,
    blocked,
    socialSettings: normalizeSocialSettings(data.socialSettings),
    socialBackup,
    privacySettings: normalizePrivacySettings(data.privacySettings),
    progressBaseline: normalizeProgressBaseline(data.progressBaseline),
    streak: normalizeStreak(data.streak),
    longestStreak: Number(data.longestStreak || data.streak?.longest || 0),
    streakHistory: normalizeStreakHistory(data.streakHistory),
    stats: {
      pagesVisited: visitedPages.length,
      planetsFound: data.stats?.planetsFound || 0,
      secretsFound: data.stats?.secretsFound || 0
    },
    createdAt: data.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp()
  };

  await setDoc(ref, merged, { merge: true });
  snap = await getDoc(ref);
  const savedProfile = snap.exists() ? snap.data() : merged;
  await publishProfileDocuments({ ...savedProfile, uid: user.uid });

  if ((user.photoURL || "") !== savedProfile.photoURL) {
    try {
      await updateProfile(user, { photoURL: savedProfile.photoURL });
    } catch (error) {
      console.warn("Could not sync stored avatar to auth profile:", error);
    }
  }
  return savedProfile;
}

export async function updatePrivacySettings(patch = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const current = await getProfile(user.uid);
  const currentPrivacy = normalizePrivacySettings(current?.privacySettings);
  const merged = normalizePrivacySettings({
    ...currentPrivacy,
    ...(patch || {}),
    preset: patch?.preset || "custom"
  });

  await setDoc(userRef(user.uid), {
    privacySettings: merged,
    updatedAt: serverTimestamp()
  }, { merge: true });
  await publishProfileDocuments({ ...current, privacySettings: merged });

  return merged;
}

async function touchLastLoginOnce(user) {
  const key = `ptg_last_login_${user.uid}`;
  const today = new Date().toISOString().slice(0, 10);
  if (sessionStorage.getItem(key) === today) return;
  sessionStorage.setItem(key, today);
  await setDoc(userRef(user.uid), { lastLoginAt: serverTimestamp() }, { merge: true });
}

export async function createAccount(email, password, username, privacySettings) {
  await authReady;
  const cleanName = cleanText(username).slice(0, 20);
  const cleanMail = cleanEmail(email);
  const cleanPass = String(password || "");

  if (!cleanName) throw new Error("Username is required.");
  if (!cleanMail) throw new Error("Email is required.");
  if (!cleanPass || cleanPass.length < 6) throw new Error("Password must be at least 6 characters.");
  if (!["private", "public", "custom"].includes(String(privacySettings?.preset || "").toLowerCase())) {
    throw new Error("Choose a privacy preset before creating your account.");
  }
  const selectedPrivacy = normalizePrivacySettings(privacySettings);
  const releaseSetupGate = beginAccountSetupGate();

  try {
    const cred = await createUserWithEmailAndPassword(auth, cleanMail, cleanPass);
    await updateProfile(cred.user, { displayName: cleanName, photoURL: defaultAvatarDataUrl() });
    await setDoc(userRef(cred.user.uid), {
      ...baseProfile(cred.user),
      username: cleanName,
      privacySettings: selectedPrivacy,
      verified: false
    });
    await publishProfileDocuments({ ...baseProfile(cred.user), uid: cred.user.uid, username: cleanName, privacySettings: selectedPrivacy, verified: false });
    await runEmailActionWithReturn(
      (actionSettings) => sendEmailVerification(cred.user, actionSettings),
      "emailVerificationComplete"
    );

    localStorage.setItem("ptg_logged_in", "1");
    return cred.user;
  } catch (error) {
    throw new Error(friendlyAuthError(error));
  } finally {
    releaseSetupGate();
  }
}

export async function login(email, password) {
  await authReady;
  const cleanMail = cleanEmail(email);
  const cleanPass = String(password || "");

  if (!cleanMail) throw new Error("Email is required.");
  if (!cleanPass) throw new Error("Password is required.");

  try {
    const cred = await signInWithEmailAndPassword(auth, cleanMail, cleanPass);
    await ensureUserProfile(cred.user);
    await touchLastLoginOnce(cred.user);
    localStorage.setItem("ptg_logged_in", "1");
    return cred.user;
  } catch (error) {
    throw new Error(friendlyAuthError(error));
  }
}

export async function loginWithGoogle(privacySettings = null) {
  await authReady;
  if (window.location.protocol === "file:") {
    throw new Error("Google sign-in needs the site to run from localhost or a real domain, not directly as a file.");
  }

  const releaseSetupGate = beginAccountSetupGate();
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    const isNewUser = getAdditionalUserInfo(cred)?.isNewUser === true;
    await ensureUserProfile(cred.user, { duringAccountSetup: true });
    if (isNewUser) {
      const selectedPreset = String(privacySettings?.preset || "").toLowerCase();
      if (!["private", "public", "custom"].includes(selectedPreset)) {
        // A sign-in attempt can turn out to be a first-time Google account.
        // Keep the newly created profile private until the player picks a
        // preset from the account settings screen.
        await updatePrivacySettings({ preset: "private" });
      } else {
        await updatePrivacySettings(privacySettings);
      }
    }
    await touchLastLoginOnce(cred.user);
    localStorage.setItem("ptg_logged_in", "1");
    return {
      user: cred.user,
      needsPrivacySelection: isNewUser && !["private", "public", "custom"].includes(String(privacySettings?.preset || "").toLowerCase())
    };
  } catch (error) {
    throw new Error(friendlyAuthError(error));
  } finally {
    releaseSetupGate();
  }
}

export async function logout() {
  await authReady;
  localStorage.removeItem("ptg_logged_in");
  localStorage.removeItem("ptg_current_uid");
  return removeAccountSlot(getActiveAccountSlotId());
}

export async function saveUsername(username) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const cleanName = cleanText(username).slice(0, 20);
  if (!cleanName) throw new Error("Username cannot be empty.");

  await updateProfile(user, { displayName: cleanName });
  await setDoc(userRef(user.uid), {
    username: cleanName,
    usernameUpdatedAt: Date.now(),
    updatedAt: serverTimestamp()
  }, { merge: true });
  const profile = (await getProfile(user.uid)) || {};
  await publishProfileDocuments({ ...profile, username: cleanName });

  return cleanName;
}

export async function setAvatarPreset(presetId) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const id = String(presetId || "1");
  if (!isKnownAvatarPreset(id)) {
    throw new Error("That profile picture preset does not exist anymore.");
  }
  const profile = await getProfile(user.uid);
  if (!isAvatarPresetUnlocked(profile, id)) {
    throw new Error(lockedAvatarReason(profile, id));
  }

  const dataUrl = getAvatarPresetPreviewUrl(id);
  await updateProfile(user, { photoURL: dataUrl });
  await setDoc(userRef(user.uid), {
    photoURL: dataUrl,
    avatarType: "preset",
    avatarPreset: id,
    avatarLetter: "",
    updatedAt: serverTimestamp()
  }, { merge: true });
  await publishProfileDocuments({ ...profile, photoURL: dataUrl, avatarType: "preset", avatarPreset: id, avatarLetter: "" });

  syncSidebarAvatar(dataUrl);
  return dataUrl;
}

export async function setAvatarLetter(letter) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const dataUrl = letterAvatarDataUrl(letter || user.displayName || user.email || "P");
  await updateProfile(user, { photoURL: dataUrl });
  await setDoc(userRef(user.uid), {
    photoURL: dataUrl,
    avatarType: "letter",
    avatarLetter: String(letter || "").trim().slice(0, 1).toUpperCase() || "P",
    updatedAt: serverTimestamp()
  }, { merge: true });
  const profile = (await getProfile(user.uid)) || {};
  await publishProfileDocuments({ ...profile, photoURL: dataUrl, avatarType: "letter", avatarLetter: String(letter || "").trim().slice(0, 1).toUpperCase() || "P" });

  syncSidebarAvatar(dataUrl);
  return dataUrl;
}

export async function useDefaultProfilePicture() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const dataUrl = getDefaultAvatarDataUrl();
  await updateProfile(user, { photoURL: dataUrl });
  await setDoc(userRef(user.uid), {
    photoURL: dataUrl,
    avatarType: "default",
    avatarPreset: "default",
    avatarLetter: "",
    updatedAt: serverTimestamp()
  }, { merge: true });
  const profile = (await getProfile(user.uid)) || {};
  await publishProfileDocuments({ ...profile, photoURL: dataUrl, avatarType: "default", avatarPreset: "default", avatarLetter: "" });

  syncSidebarAvatar(dataUrl);
  return dataUrl;
}

export async function changeEmail(newEmail, currentPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const providers = new Set((user.providerData || []).map((provider) => provider.providerId));
  const hasPasswordProvider = providers.has("password");
  const hasGoogleProvider = providers.has("google.com");
  if (!hasPasswordProvider && !hasGoogleProvider) {
    throw new Error("This account does not have a supported sign-in method for changing its email.");
  }

  const cleanMail = cleanEmail(newEmail);
  if (!cleanMail) throw new Error("New email is required.");
  if (cleanMail === cleanEmail(user.email)) throw new Error("That is already your current email address.");
  try {
    if (hasPasswordProvider && currentPassword) {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
    } else if (hasGoogleProvider) {
      if (window.location.protocol === "file:") {
        throw new Error("Google accounts must be reauthenticated from localhost or a real domain, not directly as a file.");
      }
      await reauthenticateWithPopup(user, googleProvider);
    } else {
      throw new Error("Current password is required.");
    }
    if (window.location.protocol === "http:" || window.location.protocol === "https:") {
      await runEmailActionWithReturn(
        (actionSettings) => verifyBeforeUpdateEmail(user, cleanMail, actionSettings),
        "emailChangeComplete"
      );
    } else {
      await verifyBeforeUpdateEmail(user, cleanMail);
    }
    // The address changes in Firebase only after the recipient follows its
    // verification link. Profile documents deliberately do not mirror email.
    return cleanMail;
  } catch (error) {
    throw new Error(friendlyAuthError(error));
  }
}

export async function changePassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const providers = new Set((user.providerData || []).map((provider) => provider.providerId));
  if (!providers.has("password")) {
    throw new Error("This account uses Google sign-in, so password changes are not available here.");
  }

  const nextPass = String(newPassword || "");
  if (!currentPassword) throw new Error("Current password is required.");
  if (nextPass.length < 6) throw new Error("New password must be at least 6 characters.");

  try {
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, nextPass);
    return true;
  } catch (error) {
    throw new Error(friendlyAuthError(error));
  }
}

export async function resendVerificationEmail() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");
  if (user.emailVerified) return false;

  await runEmailActionWithReturn(
    (actionSettings) => sendEmailVerification(user, actionSettings),
    "emailVerificationComplete"
  );
  return true;
}

export async function refreshCurrentUserSession() {
  await authReady;
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  await reload(user);
  const refreshedUser = auth.currentUser || user;
  await refreshedUser.getIdToken(true);
  const profile = await ensureUserProfile(refreshedUser);
  notifyActiveAuthObservers();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("panategwa:achievement-sync"));
  }
  return { user: refreshedUser, profile };
}

export async function requestPasswordReset(email) {
  const cleanMail = cleanEmail(email);
  if (!cleanMail) throw new Error("Email is required.");

  try {
    await sendPasswordResetEmail(auth, cleanMail);
  } catch (error) {
    throw new Error(friendlyAuthError(error));
  }
}

async function sendRelationshipResetMessage(user, targetUid, targetProfile, kind, body, targetId = null) {
  const fromName = user.displayName || user.email?.split("@")?.[0] || "Player";
  const toName = targetProfile?.username || "Player";

  await addDoc(collection(db, "messages"), {
    fromUid: user.uid,
    toUid: targetUid,
    participants: [user.uid, targetUid],
    fromName,
    toName,
    kind,
    title: kind === "friend-removed" ? "Friend removed" : "Blocked",
    body,
    targetSection: "messages",
    targetSubSection: "direct",
    targetId,
    readBy: [user.uid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

function otherParticipantFromMessage(data, currentUid) {
  const fromUid = String(data?.fromUid || "").trim();
  const toUid = String(data?.toUid || "").trim();
  if (fromUid && fromUid !== currentUid) return fromUid;
  if (toUid && toUid !== currentUid) return toUid;
  const participants = uniqueStrings(data?.participants);
  return participants.find((uid) => uid !== currentUid) || "";
}

export async function resetAccountData(mode = "progress") {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const nextMode = new Set(["progress", "friends", "all"]).has(String(mode || "").trim().toLowerCase())
    ? String(mode || "").trim().toLowerCase()
    : "progress";

  if ((nextMode === "friends" || nextMode === "all") && user.emailVerified !== true) {
    throw new Error("Verify your email before resetting friends and social data.");
  }

  const profile = (await getProfile(user.uid)) || {};
  const updates = {
    updatedAt: serverTimestamp()
  };

  if (nextMode === "progress" || nextMode === "all") {
    updates.xp = 0;
    updates.achievements = [];
    updates.achievementRewardSnapshot = {};
    updates.visitedPages = [];
    updates.stats = {
      ...(profile.stats || {}),
      pagesVisited: 0,
      planetsFound: 0,
      secretsFound: 0
    };
    updates.progressBaseline = normalizeProgressBaseline({
      resetAt: Date.now(),
      username: profile.username || user.displayName || "",
      verified: !!user.emailVerified,
      theme: currentThemeSetting(),
      textSize: currentTextSizeSetting(),
      hourBucket: currentHourBucket(),
      friends: uniqueStrings(profile.friends),
      siteTimeMs: normalizeSiteTimeMs(profile.siteTimeMs)
    });
    updates.longestStreak = 0;
    updates.streak = {
      current: 0,
      longest: 0,
      lastClaimAt: null,
      lastClaimDay: ""
    };
    updates.streakHistory = {};
  }

  if (nextMode === "friends" || nextMode === "all") {
    const friends = uniqueStrings(profile.friends);
    const blocked = uniqueStrings(profile.blocked);
    const nextBlocked = [];
    const historyIds = new Set([...friends, ...blocked]);

    updates.friends = [];
    updates.blocked = nextBlocked;
    updates.socialBackup = {
      friends: [],
      blocked: nextBlocked
    };
    updates.progressBaseline = {
      ...normalizeProgressBaseline(profile.progressBaseline),
      friends: []
    };

    const messagesSnap = await getDocs(query(collection(db, "messages"), where("participants", "array-contains", user.uid)));
    for (const messageDoc of messagesSnap.docs) {
      const data = messageDoc.data() || {};
      const otherUid = otherParticipantFromMessage(data, user.uid);
      if (data.kind === "friend-request" || historyIds.has(otherUid)) {
        await updateDoc(messageDoc.ref, {
          deletedFor: arrayUnion(user.uid),
          updatedAt: serverTimestamp()
        });
      }
      if (data.kind !== "friend-request" || (data.status || "pending") !== "pending") continue;
      await updateDoc(messageDoc.ref, {
        status: data.toUid === user.uid ? "ignored" : "cancelled",
        updatedAt: serverTimestamp()
      });
    }

    for (const friendUid of friends) {
      const friendProfile = await getPublicUser(friendUid);
      await sendRelationshipResetMessage(
        user,
        friendUid,
        friendProfile,
        "friend-removed",
        `${user.displayName || profile.username || "Player"} reset their friends list.`,
        user.uid
      );
    }

    if (nextMode === "all") {
      for (const blockedUid of blocked) {
        const blockedProfile = await getPublicUser(blockedUid);
        await sendRelationshipResetMessage(
          user,
          blockedUid,
          blockedProfile,
          "friend-blocked",
          `${user.displayName || profile.username || "Player"} reset their social data.`,
          user.uid
        );
      }
    }
  }

  await setDoc(userRef(user.uid), updates, { merge: true });
  await publishProfileDocuments({ ...profile, ...updates });

  if (nextMode === "progress" || nextMode === "all") {
    try {
      localStorage.removeItem(`ptg_notifications_${user.uid}`);
    } catch {}
  }

  localStorage.removeItem(`ptg_streak_${user.uid}`);
  try {
    sessionStorage.removeItem(`ptg_last_login_${user.uid}`);
  } catch {}
  return true;
}

export async function deleteAccount(password) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const providerIds = new Set((user.providerData || []).map((provider) => provider.providerId));

  try {
    if (providerIds.has("google.com") && !providerIds.has("password")) {
      if (window.location.protocol === "file:") {
        throw new Error("Google accounts must be reauthenticated from localhost or a real domain, not directly as a file.");
      }
      await reauthenticateWithPopup(user, googleProvider);
    } else {
      const cleanPass = String(password || "");
      if (!cleanPass) throw new Error("Password is required to delete your account.");
      const credential = EmailAuthProvider.credential(user.email, cleanPass);
      await reauthenticateWithCredential(user, credential);
    }

    await Promise.all([
      deleteDoc(userRef(user.uid)),
      deleteDoc(directoryRef(user.uid)),
      deleteDoc(friendProfileRef(user.uid))
    ]);
    localStorage.removeItem("ptg_logged_in");
    await deleteUser(user);
    const duplicateSessions = (await getAccountSlots()).filter((slot) => slot.signedIn && slot.uid === user.uid);
    await Promise.allSettled(duplicateSessions.map((slot) => removeAccountSlot(slot.id)));
    const remaining = (await getAccountSlots()).find((slot) => slot.signedIn);
    if (remaining) await activateAccountSlot(remaining.id);
  } catch (error) {
    throw new Error(friendlyAuthError(error));
  }
}

export function watchAuth(callback) {
  return observeActiveAuth(async (user) => {
    if (!user) {
      localStorage.removeItem("ptg_logged_in");
      localStorage.removeItem("ptg_current_uid");
      callback(null, null);
      return;
    }

    try {
      localStorage.setItem("ptg_logged_in", "1");
      localStorage.setItem("ptg_current_uid", user.uid);
      const profile = await ensureUserProfile(user);
      await touchLastLoginOnce(user);
      callback(user, profile);
    } catch (error) {
      console.error("Auth watch error:", error);
      callback(user, null);
    }
  });
}

export {
  getAccountSlots,
  getActiveAccountSlotId,
  activateAccountSlot,
  activateFirstEmptyAccountSlot,
  removeAccountSlot,
  removeAllAccountSlots,
  subscribeAccountSlots
};

