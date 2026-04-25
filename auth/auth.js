import { auth, authReady, db, googleProvider } from "./firebase-config.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  reload,
  updateProfile,
  deleteUser,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  EmailAuthProvider,
  sendPasswordResetEmail,
  updateEmail,
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
  return doc(db, "users", uid);
}

function cleanEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function cleanText(text) {
  return String(text || "").trim();
}

function uniqueStrings(value) {
  const arr = Array.isArray(value) ? value : [];
  return [...new Set(arr.map((item) => String(item || "").trim()).filter(Boolean))];
}

function normalizePrivacySettings(settings = {}) {
  return {
    showRank: settings.showRank !== false,
    showJoined: settings.showJoined !== false,
    showStreaks: settings.showStreaks !== false
  };
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
    friends: uniqueStrings(value.friends)
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

export const AVATAR_PRESETS = Object.freeze([
  Object.freeze({
    id: "1",
    name: "Trail Spark",
    requirement: Object.freeze({ rank: "Adventurer", note: "Adventurer rank" })
  }),
  Object.freeze({
    id: "2",
    name: "Ember Crest",
    requirement: Object.freeze({ rank: "Adventurer", note: "Adventurer rank" })
  }),
  Object.freeze({
    id: "3",
    name: "Explorer Beacon",
    requirement: Object.freeze({ rank: "Explorer", note: "Explorer rank" })
  }),
  Object.freeze({
    id: "4",
    name: "Sky Marker",
    requirement: Object.freeze({ rank: "Explorer", note: "Explorer rank" })
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
    })
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
    })
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
    })
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
    })
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
    })
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
    })
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

function defaultAvatarDataUrl() {
  return svgDataUrl(`
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
  `);
}

export function getDefaultAvatarDataUrl() {
  return defaultAvatarDataUrl();
}

function presetAvatarDataUrl(presetId) {
  const id = String(presetId || "1");

  if (id === "1") {
    return svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#0ea5e9"/><stop offset="1" stop-color="#2563eb"/></linearGradient></defs>
        <rect width="128" height="128" rx="64" fill="url(#g)"/>
        <circle cx="64" cy="64" r="40" fill="rgba(255,255,255,0.12)"/>
        <path d="M64 24 76 49l28 4-20 19 5 28-25-13-25 13 5-28-20-19 28-4z" fill="rgba(255,255,255,0.96)"/>
      </svg>
    `);
  }

  if (id === "2") {
    return svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#f97316"/><stop offset="1" stop-color="#ef4444"/></linearGradient></defs>
        <rect width="128" height="128" rx="64" fill="url(#g)"/>
        <path d="M64 18 87 36l23 16-8 29-21 21H47L26 81l-8-29 23-16z" fill="rgba(255,255,255,0.94)"/>
        <path d="M64 38 77 50l12 9-5 18-13 13H57L44 77l-5-18 12-9z" fill="rgba(249,115,22,0.42)"/>
      </svg>
    `);
  }

  if (id === "3") {
    return svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#0f766e"/><stop offset="1" stop-color="#38bdf8"/></linearGradient></defs>
        <rect width="128" height="128" rx="64" fill="url(#g)"/>
        <circle cx="64" cy="64" r="44" fill="rgba(255,255,255,0.08)"/>
        <path d="M64 22 75 50l30 2-23 18 8 28-26-16-26 16 8-28-23-18 30-2z" fill="rgba(255,255,255,0.96)"/>
        <circle cx="64" cy="60" r="8" fill="rgba(15,118,110,0.4)"/>
      </svg>
    `);
  }

  if (id === "4") {
    return svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#2563eb"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs>
        <rect width="128" height="128" rx="64" fill="url(#g)"/>
        <path d="M64 20c18 10 30 26 30 43 0 21-15 34-30 46-15-12-30-25-30-46 0-17 12-33 30-43z" fill="rgba(255,255,255,0.96)"/>
        <circle cx="64" cy="60" r="12" fill="rgba(37,99,235,0.45)"/>
      </svg>
    `);
  }

  if (id === "5") {
    return svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#16a34a"/><stop offset="1" stop-color="#22c55e"/></linearGradient></defs>
        <rect width="128" height="128" rx="64" fill="url(#g)"/>
        <rect x="26" y="28" width="76" height="72" rx="18" fill="rgba(255,255,255,0.92)"/>
        <path d="M43 20v20m42-20v20" stroke="rgba(255,255,255,0.92)" stroke-width="8" stroke-linecap="round"/>
        <path d="M44 60h14m12 0h14m-26 18h26" stroke="rgba(22,163,74,0.65)" stroke-width="8" stroke-linecap="round"/>
      </svg>
    `);
  }

  if (id === "6") {
    return svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#4338ca"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs>
        <rect width="128" height="128" rx="64" fill="url(#g)"/>
        <path d="M64 18 90 44v52l-26 14-26-14V44z" fill="rgba(255,255,255,0.94)"/>
        <path d="M64 38v42" stroke="rgba(67,56,202,0.52)" stroke-width="8" stroke-linecap="round"/>
        <path d="M50 54h28" stroke="rgba(67,56,202,0.52)" stroke-width="8" stroke-linecap="round"/>
      </svg>
    `);
  }

  if (id === "7") {
    return svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#1d4ed8"/><stop offset="1" stop-color="#0ea5e9"/></linearGradient></defs>
        <rect width="128" height="128" rx="64" fill="url(#g)"/>
        <circle cx="40" cy="48" r="14" fill="rgba(255,255,255,0.94)"/>
        <circle cx="88" cy="48" r="14" fill="rgba(255,255,255,0.94)"/>
        <circle cx="64" cy="84" r="16" fill="rgba(255,255,255,0.94)"/>
        <path d="M48 56 58 72M80 56 70 72M54 84h20" stroke="rgba(29,78,216,0.48)" stroke-width="8" stroke-linecap="round"/>
      </svg>
    `);
  }

  if (id === "8") {
    return svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#7c2d12"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs>
        <rect width="128" height="128" rx="64" fill="url(#g)"/>
        <path d="M64 16 92 34l10 28-12 34-26 16-26-16-12-34 10-28z" fill="rgba(255,255,255,0.95)"/>
        <path d="M64 34 74 56h24L79 71l7 23-22-12-22 12 7-23-19-15h24z" fill="rgba(124,45,18,0.5)"/>
      </svg>
    `);
  }

  if (id === "9") {
    return svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#64748b"/><stop offset="1" stop-color="#38bdf8"/></linearGradient></defs>
        <rect width="128" height="128" rx="64" fill="url(#g)"/>
        <path d="M38 86c8 0 14-7 14-15-8 0-14 7-14 15zm52-15c0 8 6 15 14 15 0-8-6-15-14-15z" fill="rgba(255,255,255,0.88)"/>
        <path d="M34 58 48 72l16-30 16 30 14-14v18c0 14-12 28-30 28S34 90 34 76z" fill="rgba(255,255,255,0.95)"/>
        <circle cx="64" cy="42" r="10" fill="rgba(100,116,139,0.45)"/>
      </svg>
    `);
  }

  if (id === "10") {
    return svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#0f172a"/><stop offset="1" stop-color="#4338ca"/></linearGradient></defs>
        <rect width="128" height="128" rx="64" fill="url(#g)"/>
        <circle cx="64" cy="64" r="44" fill="rgba(255,255,255,0.06)"/>
        <path d="M64 18 76 46l30 4-22 18 7 28-27-14-27 14 7-28-22-18 30-4z" fill="rgba(255,255,255,0.95)"/>
        <circle cx="64" cy="62" r="9" fill="rgba(67,56,202,0.6)"/>
      </svg>
    `);
  }

  return presetAvatarDataUrl("1");
}

export function getAvatarPresetPreviewUrl(presetId) {
  return presetAvatarDataUrl(presetId);
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
  const photoURL = cleanText(data.photoURL);
  const avatarType = String(data.avatarType || "").trim().toLowerCase();
  const avatarPreset = String(data.avatarPreset || "").trim().toLowerCase();
  if (avatarType === "custom" && photoURL) return photoURL;
  if (avatarType === "default") return defaultAvatarDataUrl();
  if (avatarType === "preset" && avatarPreset && avatarPreset !== "default") {
    return presetAvatarDataUrl(avatarPreset);
  }
  if (avatarType === "letter") {
    return letterAvatarDataUrl(data.avatarLetter || data.username || "P");
  }

  return defaultAvatarDataUrl();
}

function syncSidebarAvatar(photoURL) {
  if (typeof window.PanategwaUpdateSidebarAvatar === "function") {
    window.PanategwaUpdateSidebarAvatar(photoURL || "", "Account");
  }
}

function baseProfile(user) {
  return {
    uid: user.uid,
    email: user.email || "",
    emailLower: cleanEmail(user.email),
    username: user.displayName || defaultUsername(user),
    photoURL: defaultAvatarDataUrl(),
    avatarType: "default",
    avatarPreset: "default",
    verified: !!user.emailVerified,
    xp: 0,
    achievements: [],
    visitedPages: [],
    friends: [],
    blocked: [],
    socialSettings: {
      systemEnabled: true,
      requestsEnabled: true,
      chatEnabled: true,
      groupChatsEnabled: true,
      showNonFriendGroupMessages: true,
      profileHidden: false
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
    requestsEnabled: settings.requestsEnabled !== false,
    chatEnabled: settings.chatEnabled !== false,
    groupChatsEnabled: settings.groupChatsEnabled !== false,
    showNonFriendGroupMessages: settings.showNonFriendGroupMessages !== false,
    profileHidden: !!settings.profileHidden
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
  if (code === "auth/popup-closed-by-user") return "The Google sign-in popup was closed before the login finished.";
  if (code === "auth/popup-blocked") return "Your browser blocked the Google sign-in popup.";
  if (code === "auth/unauthorized-domain") {
    return "This domain is not authorized in Firebase yet. Add it in Firebase Authentication -> Settings -> Authorized domains.";
  }
  if (code === "auth/network-request-failed") return "The network request failed. Check your internet connection and try again.";
  return error?.message || "Authentication failed.";
}

export async function getProfile(uid = auth.currentUser?.uid) {
  if (!uid) return null;
  const snap = await getDoc(userRef(uid));
  return snap.exists() ? snap.data() : null;
}

export async function ensureUserProfile(user) {
  const ref = userRef(user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const data = baseProfile(user);
    await setDoc(ref, data, { merge: true });
    if ((user.photoURL || "") !== data.photoURL) {
      try {
        await updateProfile(user, { photoURL: data.photoURL });
      } catch (error) {
        console.warn("Could not sync default avatar to auth profile:", error);
      }
    }
    return data;
  }

  const data = snap.data() || {};
  const achievements = uniqueStrings(data.achievements);
  const visitedPages = uniqueStrings(data.visitedPages);
  const friends = uniqueStrings(data.friends);
  const blocked = uniqueStrings(data.blocked);
  const socialBackup = {
    friends: uniqueStrings(data.socialBackup?.friends),
    blocked: uniqueStrings(data.socialBackup?.blocked)
  };

  const merged = {
    uid: user.uid,
    email: user.email || data.email || "",
    emailLower: cleanEmail(user.email || data.email || ""),
    username: data.username || user.displayName || defaultUsername(user),
    photoURL: resolvedStoredAvatar(data),
    avatarType: data.avatarType || "default",
    avatarPreset: data.avatarPreset || "default",
    verified: !!user.emailVerified,
    xp: typeof data.xp === "number" ? data.xp : achievements.length,
    achievements,
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
  if ((user.photoURL || "") !== merged.photoURL) {
    try {
      await updateProfile(user, { photoURL: merged.photoURL });
    } catch (error) {
      console.warn("Could not sync stored avatar to auth profile:", error);
    }
  }
  return merged;
}

export async function updatePrivacySettings(patch = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const current = await getProfile(user.uid);
  const merged = normalizePrivacySettings({
    ...(current?.privacySettings || {}),
    ...(patch || {})
  });

  await setDoc(userRef(user.uid), {
    privacySettings: merged,
    updatedAt: serverTimestamp()
  }, { merge: true });

  return merged;
}

async function touchLastLoginOnce(user) {
  const key = `ptg_last_login_${user.uid}`;
  const today = new Date().toISOString().slice(0, 10);
  if (sessionStorage.getItem(key) === today) return;
  sessionStorage.setItem(key, today);
  await setDoc(userRef(user.uid), { lastLoginAt: serverTimestamp() }, { merge: true });
}

export async function createAccount(email, password, username) {
  await authReady;
  const cleanName = cleanText(username).slice(0, 20);
  const cleanMail = cleanEmail(email);
  const cleanPass = String(password || "");

  if (!cleanName) throw new Error("Username is required.");
  if (!cleanMail) throw new Error("Email is required.");
  if (!cleanPass || cleanPass.length < 6) throw new Error("Password must be at least 6 characters.");

  try {
    const cred = await createUserWithEmailAndPassword(auth, cleanMail, cleanPass);
    await updateProfile(cred.user, { displayName: cleanName, photoURL: defaultAvatarDataUrl() });
    await sendEmailVerification(cred.user);

    await setDoc(userRef(cred.user.uid), {
      ...baseProfile(cred.user),
      username: cleanName,
      verified: false
    });

    localStorage.setItem("ptg_logged_in", "1");
    return cred.user;
  } catch (error) {
    throw new Error(friendlyAuthError(error));
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

export async function loginWithGoogle() {
  await authReady;
  if (window.location.protocol === "file:") {
    throw new Error("Google sign-in needs the site to run from localhost or a real domain, not directly as a file.");
  }

  try {
    const cred = await signInWithPopup(auth, googleProvider);
    await ensureUserProfile(cred.user);
    await touchLastLoginOnce(cred.user);
    localStorage.setItem("ptg_logged_in", "1");
    return cred.user;
  } catch (error) {
    throw new Error(friendlyAuthError(error));
  }
}

export async function logout() {
  await authReady;
  localStorage.removeItem("ptg_logged_in");
  return signOut(auth);
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

  return cleanName;
}

export async function setAvatarPreset(presetId) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const id = String(presetId || "1");
  const profile = await getProfile(user.uid);
  if (!isAvatarPresetUnlocked(profile, id)) {
    throw new Error(lockedAvatarReason(profile, id));
  }

  const dataUrl = presetAvatarDataUrl(id);
  await updateProfile(user, { photoURL: dataUrl });
  await setDoc(userRef(user.uid), {
    photoURL: dataUrl,
    avatarType: "preset",
    avatarPreset: id,
    avatarLetter: "",
    updatedAt: serverTimestamp()
  }, { merge: true });

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

  syncSidebarAvatar(dataUrl);
  return dataUrl;
}

export async function useDefaultProfilePicture() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const dataUrl = defaultAvatarDataUrl();
  await updateProfile(user, { photoURL: dataUrl });
  await setDoc(userRef(user.uid), {
    photoURL: dataUrl,
    avatarType: "default",
    avatarPreset: "default",
    avatarLetter: "",
    updatedAt: serverTimestamp()
  }, { merge: true });

  syncSidebarAvatar(dataUrl);
  return dataUrl;
}

export async function changeEmail(newEmail, currentPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  const providers = new Set((user.providerData || []).map((provider) => provider.providerId));
  if (!providers.has("password")) {
    throw new Error("This account uses Google sign-in, so email changes are not available here.");
  }

  const cleanMail = cleanEmail(newEmail);
  if (!cleanMail) throw new Error("New email is required.");
  if (!currentPassword) throw new Error("Current password is required.");

  try {
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updateEmail(user, cleanMail);
    await setDoc(userRef(user.uid), {
      email: cleanMail,
      emailLower: cleanMail,
      updatedAt: serverTimestamp()
    }, { merge: true });
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

  await sendEmailVerification(user);
  return true;
}

export async function refreshCurrentUserSession() {
  await authReady;
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in.");

  await reload(user);
  const refreshedUser = auth.currentUser || user;
  const profile = await ensureUserProfile(refreshedUser);
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
  const toName = targetProfile?.username || targetProfile?.email?.split("@")?.[0] || "Player";

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

async function removeUserFromGroups(uid) {
  const chatsSnap = await getDocs(query(collection(db, "groupChats"), where("members", "array-contains", uid)));
  for (const chatDoc of chatsSnap.docs) {
    const chat = chatDoc.data() || {};
    const members = uniqueStrings(chat.members).filter((memberUid) => memberUid !== uid);
    const payload = {
      members,
      updatedAt: serverTimestamp()
    };

    if (!members.length) {
      payload.deleted = true;
    } else if (chat.ownerUid === uid) {
      payload.ownerUid = members[0];
    }

    await updateDoc(chatDoc.ref, payload);
  }

  const inviteQueries = await Promise.all([
    getDocs(query(collection(db, "groupChatInvites"), where("toUid", "==", uid))),
    getDocs(query(collection(db, "groupChatInvites"), where("fromUid", "==", uid)))
  ]);

  for (const inviteSnap of inviteQueries) {
    for (const invite of inviteSnap.docs) {
      const data = invite.data() || {};
      if ((data.status || "pending") !== "pending") continue;
      await updateDoc(invite.ref, {
        status: "cancelled",
        updatedAt: serverTimestamp()
      });
    }
  }
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

  const profile = (await getProfile(user.uid)) || {};
  const updates = {
    updatedAt: serverTimestamp()
  };

  if (nextMode === "progress" || nextMode === "all") {
    updates.xp = 0;
    updates.achievements = [];
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
      friends: uniqueStrings(profile.friends)
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
    const nextBlocked = nextMode === "all" ? [] : blocked;
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
      const friendProfile = await getProfile(friendUid);
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
        const blockedProfile = await getProfile(blockedUid);
        await sendRelationshipResetMessage(
          user,
          blockedUid,
          blockedProfile,
          "friend-blocked",
          `${user.displayName || profile.username || "Player"} reset their social data.`,
          user.uid
        );
      }
      await removeUserFromGroups(user.uid);
    }
  }

  await setDoc(userRef(user.uid), updates, { merge: true });
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

    await deleteDoc(userRef(user.uid));
    localStorage.removeItem("ptg_logged_in");
    await deleteUser(user);
  } catch (error) {
    throw new Error(friendlyAuthError(error));
  }
}

export function watchAuth(callback) {
  let unsub = null;
  let cancelled = false;

  authReady.then(() => {
    if (cancelled) return;

    unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        localStorage.removeItem("ptg_logged_in");
        callback(null, null);
        return;
      }

      try {
        localStorage.setItem("ptg_logged_in", "1");
        const profile = await ensureUserProfile(user);
        await touchLastLoginOnce(user);
        callback(user, profile);
      } catch (error) {
        console.error("Auth watch error:", error);
        callback(user, null);
      }
    });
  }).catch((error) => {
    console.error("Auth bootstrap error:", error);
    callback(null, null);
  });

  return () => {
    cancelled = true;
    if (typeof unsub === "function") unsub();
  };
}
