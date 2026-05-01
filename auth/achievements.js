import { auth, db } from "./firebase-config.js";
import { watchAuth, ensureUserProfile, normalizeSiteTimeMs } from "./auth.js";
import { ensurePanategwaToast } from "./toast.js";

import {
  doc,
  onSnapshot,
  runTransaction,
  setDoc,
  serverTimestamp,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

function achievementRequirement(patch = {}) {
  return Object.freeze({
    type: String(patch.type || "manual"),
    note: String(patch.note || ""),
    baselineAware: !!patch.baselineAware,
    page: String(patch.page || ""),
    pages: Object.freeze((Array.isArray(patch.pages) ? patch.pages : []).map((value) => String(value || "").trim()).filter(Boolean)),
    theme: String(patch.theme || ""),
    textSize: String(patch.textSize || ""),
    hourBucket: String(patch.hourBucket || ""),
    minutesOnSite: Number(patch.minutesOnSite || 0),
    friendCount: Number(patch.friendCount || 0),
    streakDays: Number(patch.streakDays || 0),
    xp: Number(patch.xp || 0),
    achievementCount: Number(patch.achievementCount || 0),
    verifiedEmail: !!patch.verifiedEmail,
    usernameSet: !!patch.usernameSet
  });
}

// Achievement catalog:
// Keep each achievement in this one list.
// Every requirement uses the same shape so it's easy to copy an existing one and edit it.
// Requirement types currently used: achievement_count, visit_all_pages, visit_page, theme,
// theme_changed, text_size, hour_bucket, friend_count, username_set, minutes_on_site,
// verified_email, streak_days, xp.
export const ACHIEVEMENTS = Object.freeze([
  Object.freeze({
    id: "achievement_collector",
    name: "Achievement Collector",
    description: "Unlock 10 achievements.",
    secret: false,
    reward: 5,
    requirement: achievementRequirement({
      type: "achievement_count",
      note: "Unlock 10 achievements.",
      baselineAware: false,
      page: "",
      pages: [],
      theme: "",
      textSize: "",
      hourBucket: "",
      minutesOnSite: 0,
      friendCount: 0,
      streakDays: 0,
      xp: 0,
      achievementCount: 10,
      verifiedEmail: false,
      usernameSet: false
    })
  }),
  Object.freeze({
    id: "all_planets",
    name: "Astronaut",
    description: "Visit all celestial bodies of the Panategwa system.",
    secret: false,
    reward: 10,
    requirement: achievementRequirement({
      type: "visit_all_pages",
      note: "Visit all seven Panategwa planet pages.",
      baselineAware: false,
      page: "",
      pages: [
        "panategwa-page.html",
        "panategwa-b-page.html",
        "panategwa-c-page.html",
        "panategwa-d-page.html",
        "panategwa-e-page.html",
        "panategwa-f-page.html",
        "panategwa-g-page.html"
      ],
      theme: "",
      textSize: "",
      hourBucket: "",
      minutesOnSite: 0,
      friendCount: 0,
      streakDays: 0,
      xp: 0,
      achievementCount: 0,
      verifiedEmail: false,
      usernameSet: false
    })
  }),
  Object.freeze({
    id: "big_reader",
    name: "Need some glasses?",
    description: "Set text size to Large.",
    secret: true,
    reward: 2,
    requirement: achievementRequirement({
      type: "text_size",
      note: "Set text size to Large.",
      baselineAware: true,
      page: "",
      pages: [],
      theme: "",
      textSize: "large",
      hourBucket: "",
      minutesOnSite: 0,
      friendCount: 0,
      streakDays: 0,
      xp: 0,
      achievementCount: 0,
      verifiedEmail: false,
      usernameSet: false
    })
  }),
  Object.freeze({
    id: "morning_person",
    name: "Morning Person",
    description: "Visit between 3am and 10am.",
    secret: true,
    reward: 2,
    requirement: achievementRequirement({
      type: "hour_bucket",
      note: "Visit between 3am and 10am.",
      baselineAware: true,
      page: "",
      pages: [],
      theme: "",
      textSize: "",
      hourBucket: "morning",
      minutesOnSite: 0,
      friendCount: 0,
      streakDays: 0,
      xp: 0,
      achievementCount: 0,
      verifiedEmail: false,
      usernameSet: false
    })
  }),
  Object.freeze({
    id: "nocturnal",
    name: "Nocturnal",
    description: "Visit between 9pm and 3am.",
    secret: true,
    reward: 10,
    requirement: achievementRequirement({
      type: "hour_bucket",
      note: "Visit between 9pm and 3am.",
      baselineAware: true,
      page: "",
      pages: [],
      theme: "",
      textSize: "",
      hourBucket: "nocturnal",
      minutesOnSite: 0,
      friendCount: 0,
      streakDays: 0,
      xp: 0,
      achievementCount: 0,
      verifiedEmail: false,
      usernameSet: false
    })
  }),
  Object.freeze({
    id: "ocean_mode",
    name: "Wavefinder",
    description: "Use the Ocean theme.",
    secret: false,
    reward: 2,
    requirement: achievementRequirement({
      type: "theme",
      note: "Use the Ocean theme.",
      baselineAware: true,
      page: "",
      pages: [],
      theme: "Ocean",
      textSize: "",
      hourBucket: "",
      minutesOnSite: 0,
      friendCount: 0,
      streakDays: 0,
      xp: 0,
      achievementCount: 0,
      verifiedEmail: false,
      usernameSet: false
    })
  }),
  Object.freeze({
    id: "three_friends",
    name: "Small Crew",
    description: "Add 3 friends.",
    secret: false,
    reward: 10,
    requirement: achievementRequirement({
      type: "friend_count",
      note: "Add 3 friends.",
      baselineAware: true,
      page: "",
      pages: [],
      theme: "",
      textSize: "",
      hourBucket: "",
      minutesOnSite: 0,
      friendCount: 3,
      streakDays: 0,
      xp: 0,
      achievementCount: 0,
      verifiedEmail: false,
      usernameSet: false
    })
  }),
  Object.freeze({
    id: "site_20_minutes",
    name: "Settled In",
    description: "Spend 20 minutes on the site.",
    secret: false,
    reward: 5,
    requirement: achievementRequirement({
      type: "minutes_on_site",
      note: "Spend 20 minutes on the site.",
      baselineAware: true,
      page: "",
      pages: [],
      theme: "",
      textSize: "",
      hourBucket: "",
      minutesOnSite: 20,
      friendCount: 0,
      streakDays: 0,
      xp: 0,
      achievementCount: 0,
      verifiedEmail: false,
      usernameSet: false
    })
  }),
  Object.freeze({
    id: "site_60_minutes",
    name: "Settled In II",
    description: "Spend 1 hour on the site.",
    secret: false,
    reward: 5,
    requirement: achievementRequirement({
      type: "minutes_on_site",
      note: "Spend 1 hour on the site.",
      baselineAware: true,
      page: "",
      pages: [],
      theme: "",
      textSize: "",
      hourBucket: "",
      minutesOnSite: 60,
      friendCount: 0,
      streakDays: 0,
      xp: 0,
      achievementCount: 0,
      verifiedEmail: false,
      usernameSet: false
    })
  }),
  Object.freeze({
    id: "space_mode",
    name: "Stargazer",
    description: "Use the Space theme.",
    secret: false,
    reward: 1,
    requirement: achievementRequirement({
      type: "theme",
      note: "Use the Space theme.",
      baselineAware: true,
      page: "",
      pages: [],
      theme: "Space",
      textSize: "",
      hourBucket: "",
      minutesOnSite: 0,
      friendCount: 0,
      streakDays: 0,
      xp: 0,
      achievementCount: 0,
      verifiedEmail: false,
      usernameSet: false
    })
  }),
  Object.freeze({
    id: "theme_shifter",
    name: "Aesthetic Control",
    description: "Change your theme.",
    secret: false,
    reward: 1,
    requirement: achievementRequirement({
      type: "theme_changed",
      note: "Change your theme away from the default.",
      baselineAware: true,
      page: "",
      pages: [],
      theme: "Panategwa Mode (Default)",
      textSize: "",
      hourBucket: "",
      minutesOnSite: 0,
      friendCount: 0,
      streakDays: 0,
      xp: 0,
      achievementCount: 0,
      verifiedEmail: false,
      usernameSet: false
    })
  }),
  Object.freeze({
    id: "thrinsachelom_history",
    name: "Historian",
    description: "View the history of the Thrinsacheloms.",
    secret: false,
    reward: 10,
    requirement: achievementRequirement({
      type: "visit_page",
      note: "Open the Thrinsachelom history page.",
      baselineAware: false,
      page: "thrinsachelom-history-page.html",
      pages: [],
      theme: "",
      textSize: "",
      hourBucket: "",
      minutesOnSite: 0,
      friendCount: 0,
      streakDays: 0,
      xp: 0,
      achievementCount: 0,
      verifiedEmail: false,
      usernameSet: false
    })
  }),
  Object.freeze({
    id: "tiny_text",
    name: "Microscopic Text",
    description: "Set text size to Small.",
    secret: true,
    reward: 2,
    requirement: achievementRequirement({
      type: "text_size",
      note: "Set text size to Small.",
      baselineAware: true,
      page: "",
      pages: [],
      theme: "",
      textSize: "small",
      hourBucket: "",
      minutesOnSite: 0,
      friendCount: 0,
      streakDays: 0,
      xp: 0,
      achievementCount: 0,
      verifiedEmail: false,
      usernameSet: false
    })
  }),
  Object.freeze({
    id: "verified_email",
    name: "Verified Signal",
    description: "Verify your email address.",
    secret: false,
    reward: 2,
    requirement: achievementRequirement({
      type: "verified_email",
      note: "Verify your email address.",
      baselineAware: false,
      page: "",
      pages: [],
      theme: "",
      textSize: "",
      hourBucket: "",
      minutesOnSite: 0,
      friendCount: 0,
      streakDays: 0,
      xp: 0,
      achievementCount: 0,
      verifiedEmail: true,
      usernameSet: false
    })
  }),
  Object.freeze({
    id: "week_streak",
    name: "Week Streak",
    description: "Reach a 7 day streak.",
    secret: false,
    reward: 4,
    requirement: achievementRequirement({
      type: "streak_days",
      note: "Reach a 7 day streak.",
      baselineAware: false,
      page: "",
      pages: [],
      theme: "",
      textSize: "",
      hourBucket: "",
      minutesOnSite: 0,
      friendCount: 0,
      streakDays: 7,
      xp: 0,
      achievementCount: 0,
      verifiedEmail: false,
      usernameSet: false
    })
  }),
  Object.freeze({
    id: "year_streak",
    name: "Year Streak",
    description: "Reach a 365 day streak.",
    secret: true,
    reward: 50,
    requirement: achievementRequirement({
      type: "streak_days",
      note: "Reach a 365 day streak.",
      baselineAware: false,
      page: "",
      pages: [],
      theme: "",
      textSize: "",
      hourBucket: "",
      minutesOnSite: 0,
      friendCount: 0,
      streakDays: 365,
      xp: 0,
      achievementCount: 0,
      verifiedEmail: false,
      usernameSet: false
    })
  }),
  Object.freeze({
    id: "veteran",
    name: "Veteran",
    description: "Reach Veteran rank (30 XP).",
    secret: false,
    reward: 5,
    requirement: achievementRequirement({
      type: "xp",
      note: "Reach Veteran rank (30 XP).",
      baselineAware: false,
      page: "",
      pages: [],
      theme: "",
      textSize: "",
      hourBucket: "",
      minutesOnSite: 0,
      friendCount: 0,
      streakDays: 0,
      xp: 30,
      achievementCount: 0,
      verifiedEmail: false,
      usernameSet: false
    })
  })
]);

const ACHIEVEMENT_MAP = new Map(ACHIEVEMENTS.map((achievement) => [achievement.id, achievement]));
const KNOWN_IDS = new Set(ACHIEVEMENTS.map((achievement) => achievement.id));

let started = false;
let profileUnsub = null;
let syncTimer = null;
let syncInFlight = null;
let trackedUser = null;
let trackedProfile = null;
let lastSyncAt = 0;
let interactionSyncTimer = null;
let siteTimeStartedAt = 0;
let siteTimePendingMs = 0;
let siteTimeInterval = null;
let siteTimeFlushInFlight = null;

const SYNC_INTERVAL_MS = 8000;
const MIN_SYNC_GAP_MS = 4000;
const SITE_TIME_FLUSH_MS = 60 * 1000;

function pageId() {
  return (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
}

function currentTheme() {
  return localStorage.getItem("theme") || "Panategwa Mode (Default)";
}

function currentTextSize() {
  return localStorage.getItem("textsize") || "medium";
}

function uniqueKnown(list) {
  const seen = new Set();
  const result = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const id = String(raw || "").trim();
    if (!KNOWN_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

function unlockedSet(profile) {
  return new Set(uniqueKnown(profile?.achievements));
}

function visitedPages(profile) {
  return [...new Set((Array.isArray(profile?.visitedPages) ? profile.visitedPages : []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function rewardForId(id) {
  return ACHIEVEMENT_MAP.get(id)?.reward || 1;
}

function normalizeAchievementRewardSnapshot(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const next = {};

  for (const [rawId, rawReward] of Object.entries(value)) {
    const id = String(rawId || "").trim();
    if (!KNOWN_IDS.has(id)) continue;

    const reward = Number(rawReward);
    if (!Number.isFinite(reward)) continue;
    next[id] = reward;
  }

  return next;
}

function rewardSnapshotFor(ids = []) {
  const next = {};
  for (const id of uniqueKnown(ids).slice().sort((a, b) => a.localeCompare(b))) {
    next[id] = rewardForId(id);
  }
  return next;
}

function totalRewardFor(ids = []) {
  return uniqueKnown(ids).reduce((sum, id) => sum + rewardForId(id), 0);
}

function totalSnapshotReward(snapshot = {}) {
  return Object.values(normalizeAchievementRewardSnapshot(snapshot))
    .reduce((sum, reward) => sum + Number(reward || 0), 0);
}

function totalStreakReward(history = {}) {
  if (!history || typeof history !== "object" || Array.isArray(history)) return 0;
  return Object.values(history).reduce((sum, entry) => {
    const reward = Number(entry?.reward || 0);
    return sum + (Number.isFinite(reward) ? reward : 0);
  }, 0);
}

function sameRewardSnapshot(a = {}, b = {}) {
  const left = normalizeAchievementRewardSnapshot(a);
  const right = normalizeAchievementRewardSnapshot(b);
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();

  if (leftKeys.length !== rightKeys.length) return false;

  for (let index = 0; index < leftKeys.length; index += 1) {
    const key = leftKeys[index];
    if (key !== rightKeys[index]) return false;
    if (Number(left[key] || 0) !== Number(right[key] || 0)) return false;
  }

  return true;
}

function siteTimePendingKey(uid) {
  return `ptg_site_time_pending_${String(uid || "").trim()}`;
}

function loadPendingSiteTime(uid) {
  try {
    return normalizeSiteTimeMs(sessionStorage.getItem(siteTimePendingKey(uid)));
  } catch {
    return 0;
  }
}

function savePendingSiteTime(uid, value) {
  try {
    const next = normalizeSiteTimeMs(value);
    if (next > 0) {
      sessionStorage.setItem(siteTimePendingKey(uid), String(next));
    } else {
      sessionStorage.removeItem(siteTimePendingKey(uid));
    }
  } catch {}
}

function currentSiteTimeUid() {
  return String(trackedUser?.uid || auth.currentUser?.uid || "").trim();
}

function clearSiteTimeInterval() {
  if (!siteTimeInterval) return;
  window.clearInterval(siteTimeInterval);
  siteTimeInterval = null;
}

function captureSiteTimeElapsed() {
  const uid = currentSiteTimeUid();
  if (!uid || !siteTimeStartedAt) return 0;

  const elapsed = Math.max(0, Date.now() - siteTimeStartedAt);
  if (!elapsed) return 0;

  siteTimePendingMs += elapsed;
  siteTimeStartedAt = Date.now();
  savePendingSiteTime(uid, siteTimePendingMs);
  return elapsed;
}

function pauseSiteTimeTracking() {
  captureSiteTimeElapsed();
  siteTimeStartedAt = 0;
  clearSiteTimeInterval();
}

async function flushPendingSiteTime(force = false) {
  const uid = currentSiteTimeUid();
  if (!uid) return;

  const pending = normalizeSiteTimeMs(siteTimePendingMs);
  if (!pending) return;
  if (!force && pending < SITE_TIME_FLUSH_MS) return;

  if (siteTimeFlushInFlight) return siteTimeFlushInFlight;

  const delta = pending;
  siteTimePendingMs = 0;
  savePendingSiteTime(uid, 0);

  siteTimeFlushInFlight = (async () => {
    try {
      await setDoc(doc(db, "users", uid), {
        siteTimeMs: increment(delta),
        updatedAt: serverTimestamp()
      }, { merge: true });

      const nextSiteTime = normalizeSiteTimeMs((trackedProfile?.siteTimeMs || 0) + delta);
      if (trackedProfile && trackedUser?.uid === uid) {
        trackedProfile = {
          ...trackedProfile,
          siteTimeMs: nextSiteTime
        };
      }

      window.dispatchEvent(new CustomEvent("panategwa:sitetimechange", {
        detail: { uid, siteTimeMs: nextSiteTime }
      }));
      scheduleAchievementSync(120, true);
    } catch (error) {
      console.error("Site time sync error:", error);
      siteTimePendingMs += delta;
      savePendingSiteTime(uid, siteTimePendingMs);
    } finally {
      siteTimeFlushInFlight = null;
    }
  })();

  return siteTimeFlushInFlight;
}

function resumeSiteTimeTracking() {
  const uid = currentSiteTimeUid();
  if (!uid || document.hidden) return;

  if (!siteTimePendingMs) {
    siteTimePendingMs = loadPendingSiteTime(uid);
  }

  if (!siteTimeStartedAt) {
    siteTimeStartedAt = Date.now();
  }

  if (!siteTimeInterval) {
    siteTimeInterval = window.setInterval(() => {
      captureSiteTimeElapsed();
      flushPendingSiteTime(false);
    }, SITE_TIME_FLUSH_MS);
  }

  if (siteTimePendingMs >= SITE_TIME_FLUSH_MS) {
    flushPendingSiteTime(true);
  }
}

function createdAtMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  return 0;
}

function normalizeProgressBaseline(value = {}) {
  return {
    resetAt: createdAtMs(value.resetAt),
    username: String(value.username || ""),
    verified: !!value.verified,
    theme: String(value.theme || ""),
    textSize: String(value.textSize || ""),
    hourBucket: String(value.hourBucket || ""),
    friends: [...new Set((Array.isArray(value.friends) ? value.friends : []).map((entry) => String(entry || "").trim()).filter(Boolean))],
    siteTimeMs: normalizeSiteTimeMs(value.siteTimeMs)
  };
}

function hourBucket(hour) {
  if (hour >= 21 || hour < 3) return "nocturnal";
  if (hour >= 3 && hour < 11) return "morning";
  return "day";
}

function buildAchievementContext(user, profile, pages) {
  const unlocked = unlockedSet(profile);
  const page = pageId();
  const baseline = normalizeProgressBaseline(profile?.progressBaseline);
  const hasResetBaseline = baseline.resetAt > 0;
  const currentUsername = String(profile?.username || user.displayName || "").trim();
  const theme = currentTheme();
  const size = currentTextSize();
  const currentBucket = hourBucket(new Date().getHours());
  const baselineFriends = new Set(baseline.friends);
  const currentFriends = [...new Set((Array.isArray(profile?.friends) ? profile.friends : []).map((value) => String(value || "").trim()).filter(Boolean))];
  const newFriendsCount = hasResetBaseline
    ? currentFriends.filter((uid) => !baselineFriends.has(uid)).length
    : currentFriends.length;

  return {
    user,
    profile,
    unlocked,
    pages,
    page,
    baseline,
    hasResetBaseline,
    currentUsername,
    theme,
    size,
    currentBucket,
    currentFriends,
    newFriendsCount,
    currentXp: typeof profile?.xp === "number" ? profile.xp : unlocked.size,
    streakCurrent: Number(profile?.streak?.current || 0),
    siteTimeMs: normalizeSiteTimeMs(profile?.siteTimeMs),
    siteTimeSinceResetMs: hasResetBaseline
      ? Math.max(0, normalizeSiteTimeMs(profile?.siteTimeMs) - normalizeSiteTimeMs(baseline.siteTimeMs))
      : normalizeSiteTimeMs(profile?.siteTimeMs)
  };
}

function requirementSatisfied(achievement, context, pending = new Set()) {
  const requirement = achievement?.requirement || {};

  switch (requirement.type) {
    case "achievement_count":
      return context.unlocked.size + pending.size >= requirement.achievementCount;
    case "visit_all_pages":
      return requirement.pages.every((targetPage) => context.pages.includes(targetPage));
    case "visit_page":
      return context.page === requirement.page;
    case "theme":
      return context.theme === requirement.theme
        && (!requirement.baselineAware || context.baseline.theme !== requirement.theme);
    case "theme_changed":
      return context.theme !== requirement.theme
        && (!requirement.baselineAware || context.baseline.theme !== context.theme);
    case "text_size":
      return context.size === requirement.textSize
        && (!requirement.baselineAware || context.baseline.textSize !== requirement.textSize);
    case "hour_bucket":
      return context.currentBucket === requirement.hourBucket
        && (!requirement.baselineAware || context.baseline.hourBucket !== requirement.hourBucket);
    case "friend_count":
      return (requirement.baselineAware ? context.newFriendsCount : context.currentFriends.length) >= requirement.friendCount;
    case "username_set":
      return !!context.currentUsername
        && (!requirement.baselineAware || context.currentUsername !== context.baseline.username);
    case "minutes_on_site":
      return (requirement.baselineAware ? context.siteTimeSinceResetMs : context.siteTimeMs)
        >= requirement.minutesOnSite * 60 * 1000;
    case "verified_email":
      return !!(context.user?.emailVerified || context.profile?.verified)
        && (!requirement.baselineAware || !context.baseline.verified);
    case "streak_days":
      return context.streakCurrent >= requirement.streakDays;
    case "xp":
      return context.currentXp + totalRewardFor([...pending]) >= requirement.xp;
    default:
      return false;
  }
}

function computeUnlocks(user, profile, pages) {
  const context = buildAchievementContext(user, profile, pages);
  const pending = new Set();
  let changed = true;

  while (changed) {
    changed = false;

    for (const achievement of ACHIEVEMENTS) {
      if (context.unlocked.has(achievement.id) || pending.has(achievement.id)) continue;

      if (!requirementSatisfied(achievement, context, pending)) continue;
      pending.add(achievement.id);
      changed = true;
    }
  }

  return [...pending];
}

export async function syncAchievementProgress(user, profile) {
  const ref = doc(db, "users", user.uid);
  let result = { profile: profile || null, newlyUnlocked: [] };

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists() ? snap.data() : {};

    const currentAchievements = uniqueKnown(data.achievements || profile?.achievements || []);
    const currentVisited = visitedPages(data);
    const nextVisited = [...new Set([...currentVisited, pageId()])];
    // Keep a per-achievement reward snapshot so editing reward values later can
    // raise or lower total XP without touching non-achievement XP like streaks.
    const storedRewardSnapshot = normalizeAchievementRewardSnapshot(
      data.achievementRewardSnapshot || profile?.achievementRewardSnapshot
    );
    const fallbackRewardSnapshot = rewardSnapshotFor(currentAchievements);
    const hasStoredRewardSnapshot = Object.keys(storedRewardSnapshot).length > 0;
    const rewardSnapshotBaseline = hasStoredRewardSnapshot
      ? storedRewardSnapshot
      : fallbackRewardSnapshot;
    const baseXp = typeof data.xp === "number" ? data.xp : currentAchievements.length;
    const nonAchievementXp = hasStoredRewardSnapshot
      ? Math.max(0, baseXp - totalSnapshotReward(rewardSnapshotBaseline))
      : Math.max(0, totalStreakReward(data.streakHistory || profile?.streakHistory));
    const currentAchievementXp = totalRewardFor(currentAchievements);

    const mergedProfile = {
      ...data,
      uid: user.uid,
      email: user.email || data.email || "",
      username: data.username || user.displayName || "",
      verified: !!user.emailVerified,
      achievements: currentAchievements,
      visitedPages: nextVisited,
      achievementRewardSnapshot: rewardSnapshotBaseline,
      xp: Math.max(0, nonAchievementXp + currentAchievementXp)
    };

    const pending = computeUnlocks(user, mergedProfile, nextVisited);
    const mergedAchievements = uniqueKnown([...currentAchievements, ...pending]);
    const nextRewardSnapshot = rewardSnapshotFor(mergedAchievements);
    const xp = Math.max(0, nonAchievementXp + totalSnapshotReward(nextRewardSnapshot));
    const nextUsername = data.username || user.displayName || "";
    const nextEmail = user.email || data.email || "";
    const nextEmailLower = String(nextEmail || "").toLowerCase();
    const nextVerified = !!user.emailVerified;
    const pagesVisited = nextVisited.length;
    const shouldWrite =
      !snap.exists() ||
      !data.createdAt ||
      data.uid !== user.uid ||
      String(data.email || "") !== nextEmail ||
      String(data.emailLower || "") !== nextEmailLower ||
      String(data.username || "") !== nextUsername ||
      !!data.verified !== nextVerified ||
      currentVisited.length !== nextVisited.length ||
      currentAchievements.length !== mergedAchievements.length ||
      !sameRewardSnapshot(storedRewardSnapshot, nextRewardSnapshot) ||
      baseXp !== xp ||
      Number(data?.stats?.pagesVisited || 0) !== pagesVisited;

    const nextDoc = {
      uid: user.uid,
      email: nextEmail,
      emailLower: nextEmailLower,
      username: nextUsername,
      verified: nextVerified,
      achievements: mergedAchievements,
      achievementRewardSnapshot: nextRewardSnapshot,
      visitedPages: nextVisited,
      xp,
      stats: {
        ...(data.stats || {}),
        pagesVisited: nextVisited.length
      },
      createdAt: data.createdAt || serverTimestamp(),
      updatedAt: shouldWrite ? serverTimestamp() : (data.updatedAt || null),
      lastLoginAt: data.lastLoginAt || serverTimestamp()
    };

    if (shouldWrite) {
      tx.set(ref, nextDoc, { merge: true });
    }

    result = { profile: nextDoc, newlyUnlocked: pending };
  });

  return result;
}

export function renderAchievements(profile) {
  if (pageId() === "account-page.html" && document.getElementById("achievements-list")) {
    return;
  }

  const container = document.getElementById("achievements-list");
  const xpEl = document.getElementById("xp-count");
  const totalEl = document.getElementById("xp-total");
  const countEl = document.getElementById("achievement-count");

  const unlocked = unlockedSet(profile);
  const xp = typeof profile?.xp === "number" ? profile.xp : unlocked.size;

  if (xpEl) xpEl.textContent = String(xp);
  if (totalEl) totalEl.textContent = String(xp);
  if (countEl) countEl.textContent = String(unlocked.size);
  if (!container) return;

  const ordered = [
    ...ACHIEVEMENTS.filter((achievement) => unlocked.has(achievement.id)).sort((a, b) => a.name.localeCompare(b.name)),
    ...ACHIEVEMENTS.filter((achievement) => !unlocked.has(achievement.id)).sort((a, b) => a.name.localeCompare(b.name))
  ];

  container.innerHTML = ordered.map((achievement) => {
    const isUnlocked = unlocked.has(achievement.id);
    const title = achievement.secret && !isUnlocked ? "Secret" : achievement.name;
    const desc = achievement.secret && !isUnlocked ? "Hidden achievement" : achievement.description;
    const requirement = achievement.secret && !isUnlocked
      ? "Requirement hidden"
      : (achievement.requirement?.note || achievement.description);

    return `
      <div class="achievement-card ${isUnlocked ? "unlocked" : "locked"}" id="achievement-card-${achievement.id}" data-achievement-id="${achievement.id}">
        <div class="achievement-icon">${isUnlocked ? "Unlocked" : "Locked"}</div>
        <div>
          <div class="achievement-name">${title}</div>
          <div class="achievement-desc">${desc}</div>
          <div class="achievement-desc">Requirement: ${requirement}</div>
          <div class="achievement-desc">+${achievement.reward} XP</div>
        </div>
      </div>
    `;
  }).join("");
}

function emitAchievementToasts(user, newlyUnlocked) {
  if (!newlyUnlocked.length) return;
  ensurePanategwaToast();

  newlyUnlocked.forEach(async (id) => {
    const achievement = ACHIEVEMENT_MAP.get(id);
    if (!achievement) return;

    window.PanategwaToast({
      title: "Achievement unlocked",
      body: `${achievement.name}\n+${achievement.reward} XP`,
      href: `account-page.html?tab=progress&target=${encodeURIComponent(id)}`,
      duration: 5000,
      persist: true,
      kind: "achievement",
      notificationId: `achievement:${id}`
    });
  });
}

function clearSyncTimer() {
  if (!syncTimer) return;
  window.clearTimeout(syncTimer);
  syncTimer = null;
}

async function runAchievementSync(force = false) {
  clearSyncTimer();

  const user = trackedUser || auth.currentUser || null;
  if (!user) {
    trackedUser = null;
    trackedProfile = null;
    renderAchievements(null);
    return;
  }

  const now = Date.now();
  if (!force && now - lastSyncAt < MIN_SYNC_GAP_MS) {
    scheduleAchievementSync(MIN_SYNC_GAP_MS - (now - lastSyncAt));
    return;
  }

  if (syncInFlight) {
    if (force) {
      syncInFlight.finally(() => scheduleAchievementSync(120, true));
    }
    return syncInFlight;
  }

  syncInFlight = (async () => {
    try {
      trackedUser = user;
      trackedProfile = trackedProfile || await ensureUserProfile(user);
      const result = await syncAchievementProgress(user, trackedProfile);
      trackedProfile = result.profile || trackedProfile;
      lastSyncAt = Date.now();
      renderAchievements(trackedProfile);
      emitAchievementToasts(user, result.newlyUnlocked || []);
    } catch (error) {
      console.error("Achievement tracker error:", error);
      renderAchievements(trackedProfile || null);
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

function scheduleAchievementSync(delay = 0, force = false) {
  clearSyncTimer();
  syncTimer = window.setTimeout(() => {
    runAchievementSync(force);
  }, Math.max(0, Number(delay) || 0));
}

function startAccountWatcher() {
  watchAuth((user, profile) => {
    pauseSiteTimeTracking();
    flushPendingSiteTime(true);

    if (!user) {
      trackedUser = null;
      trackedProfile = null;
      siteTimePendingMs = 0;
      clearSyncTimer();
      renderAchievements(null);
      return;
    }

    trackedUser = user;
    trackedProfile = profile || trackedProfile;
    siteTimePendingMs = loadPendingSiteTime(user.uid);
    resumeSiteTimeTracking();
    scheduleAchievementSync(0, true);
  });
}

function startLiveProfileListener() {
  watchAuth((user) => {
    if (profileUnsub) {
      profileUnsub();
      profileUnsub = null;
    }

    if (!user) return;

    profileUnsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      const freshProfile = snap.exists() ? snap.data() : null;
      trackedProfile = freshProfile;
      renderAchievements(freshProfile);

      if (!trackedUser || !freshProfile) return;

      const normalizedProfile = {
        ...freshProfile,
        uid: trackedUser.uid,
        email: trackedUser.email || freshProfile.email || "",
        username: freshProfile.username || trackedUser.displayName || "",
        verified: !!trackedUser.emailVerified,
        achievements: uniqueKnown(freshProfile.achievements || []),
        visitedPages: visitedPages(freshProfile),
        xp: typeof freshProfile.xp === "number" ? freshProfile.xp : uniqueKnown(freshProfile.achievements || []).length
      };

      if (computeUnlocks(trackedUser, normalizedProfile, normalizedProfile.visitedPages).length) {
        scheduleAchievementSync(200, true);
      }
    });
  });
}

function startReactiveSyncTriggers() {
  const scheduleSoon = () => scheduleAchievementSync(250, true);
  const scheduleSoft = () => scheduleAchievementSync(600, false);
  const scheduleAfterInteraction = () => {
    if (interactionSyncTimer) {
      window.clearTimeout(interactionSyncTimer);
    }

    interactionSyncTimer = window.setTimeout(() => {
      interactionSyncTimer = null;
      scheduleAchievementSync(0, false);
    }, 900);
  };

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pauseSiteTimeTracking();
      flushPendingSiteTime(true);
      return;
    }
    resumeSiteTimeTracking();
    scheduleSoon();
  });

  window.addEventListener("focus", () => {
    resumeSiteTimeTracking();
    scheduleSoon();
  });
  window.addEventListener("pageshow", () => {
    resumeSiteTimeTracking();
    scheduleSoon();
  });
  window.addEventListener("pagehide", () => {
    pauseSiteTimeTracking();
    flushPendingSiteTime(true);
  });
  window.addEventListener("panategwa:themechange", scheduleSoft);
  window.addEventListener("panategwa:textsizechange", scheduleSoft);
  window.addEventListener("panategwa:achievement-sync", scheduleSoon);
  document.addEventListener("click", scheduleAfterInteraction, true);
  document.addEventListener("change", scheduleAfterInteraction, true);
  document.addEventListener("keyup", scheduleAfterInteraction, true);

  window.setInterval(() => {
    if (!document.hidden) {
      scheduleAchievementSync(0, false);
    }
  }, SYNC_INTERVAL_MS);
}

function startAchievementSystem() {
  if (started) return;
  started = true;

  ensurePanategwaToast();
  startAccountWatcher();
  startLiveProfileListener();
  startReactiveSyncTriggers();
  [900, 2500, 5000].forEach((delay) => scheduleAchievementSync(delay, true));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startAchievementSystem);
} else {
  startAchievementSystem();
}
