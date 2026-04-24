import { db } from "./firebase-config.js";
import { watchAuth, ensureUserProfile } from "./auth.js";
import { ensurePanategwaToast } from "./toast.js";

import {
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export const ACHIEVEMENTS = [
  { id: "achievement_collector", name: "Achievement Collector", description: "Unlock 10 achievements.", secret: false, reward: 5 },
  { id: "all_planets", name: "Astronaut", description: "Visit all celestial bodies of the Panategwa system.", secret: false, reward: 5 },
  { id: "big_reader", name: "Need some glasses?", description: "Set text size to Large.", secret: true, reward: 2 },
  { id: "morning_person", name: "Morning Person", description: "Visit between 3am and 10am.", secret: true, reward: 2 },
  { id: "nocturnal", name: "Nocturnal", description: "Visit between 9pm and 3am.", secret: true, reward: 2 },
  { id: "ocean_mode", name: "Wavefinder", description: "Use the Ocean theme.", secret: false, reward: 1 },
  { id: "three_friends", name: "Small Crew", description: "Add 3 friends.", secret: false, reward: 3 },
  { id: "profile_name", name: "True Name", description: "Set your username.", secret: false, reward: 1 },
  { id: "site_20_minutes", name: "Settled In", description: "Be part of the site for over 20 minutes.", secret: false, reward: 2 },
  { id: "space_mode", name: "Stargazer", description: "Use the Space theme.", secret: false, reward: 1 },
  { id: "theme_shifter", name: "Aesthetic Control", description: "Change your theme.", secret: false, reward: 1 },
  { id: "thrinsachelom_history", name: "Historian", description: "View the history of the Thrinsacheloms.", secret: false, reward: 5 },
  { id: "tiny_text", name: "Microscopic Text", description: "Set text size to Small.", secret: true, reward: 2 },
  { id: "verified_email", name: "Verified Signal", description: "Verify your email address.", secret: false, reward: 2 },
  { id: "week_streak", name: "Week Streak", description: "Reach a 7 day streak.", secret: false, reward: 4 },
  { id: "year_streak", name: "Year Streak", description: "Reach a 365 day streak.", secret: true, reward: 50 },
  { id: "veteran", name: "Veteran", description: "Reach Veteran rank (30 XP).", secret: false, reward: 5 }
];

const ACHIEVEMENT_MAP = new Map(ACHIEVEMENTS.map((achievement) => [achievement.id, achievement]));
const KNOWN_IDS = new Set(ACHIEVEMENTS.map((achievement) => achievement.id));

let started = false;
let profileUnsub = null;

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
    friends: [...new Set((Array.isArray(value.friends) ? value.friends : []).map((entry) => String(entry || "").trim()).filter(Boolean))]
  };
}

function hourBucket(hour) {
  if (hour >= 21 || hour < 3) return "nocturnal";
  if (hour >= 3 && hour < 11) return "morning";
  return "day";
}

function computeUnlocks(user, profile, pages) {
  const unlocked = unlockedSet(profile);
  const pending = [];
  const add = (id, condition) => {
    if (condition && !unlocked.has(id) && !pending.includes(id)) pending.push(id);
  };

  const page = pageId();
  const baseline = normalizeProgressBaseline(profile?.progressBaseline);
  const hasResetBaseline = baseline.resetAt > 0;
  const currentUsername = String(profile?.username || user.displayName || "").trim();
  const theme = currentTheme();
  const size = currentTextSize();
  const hour = new Date().getHours();
  const currentBucket = hourBucket(hour);
  const baselineFriends = new Set(baseline.friends);
  const currentFriends = [...new Set((Array.isArray(profile?.friends) ? profile.friends : []).map((value) => String(value || "").trim()).filter(Boolean))];
  const newFriendsCount = hasResetBaseline
    ? currentFriends.filter((uid) => !baselineFriends.has(uid)).length
    : currentFriends.length;

  add("profile_name", hasResetBaseline ? (!!currentUsername && currentUsername !== baseline.username) : !!currentUsername);
  add("verified_email", hasResetBaseline ? (!!user.emailVerified && !baseline.verified) : !!user.emailVerified);
  add("thrinsachelom_history", page === "panategwa-d-thrinsachelom-history.html");

  add("all_planets", [
    "panategwa-page.html",
    "panategwa-b-page.html",
    "panategwa-c-page.html",
    "panategwa-d-page.html",
    "panategwa-e-page.html",
    "panategwa-f-page.html",
    "panategwa-g-page.html"
  ].every((targetPage) => pages.includes(targetPage)));

  add("theme_shifter", hasResetBaseline ? (theme !== "Panategwa Mode (Default)" && theme !== baseline.theme) : theme !== "Panategwa Mode (Default)");
  add("ocean_mode", theme === "Ocean" && (!hasResetBaseline || baseline.theme !== "Ocean"));
  add("space_mode", theme === "Space" && (!hasResetBaseline || baseline.theme !== "Space"));

  add("big_reader", size === "large" && (!hasResetBaseline || baseline.textSize !== "large"));
  add("tiny_text", size === "small" && (!hasResetBaseline || baseline.textSize !== "small"));
  add("nocturnal", currentBucket === "nocturnal" && (!hasResetBaseline || baseline.hourBucket !== "nocturnal"));
  add("morning_person", currentBucket === "morning" && (!hasResetBaseline || baseline.hourBucket !== "morning"));

  const currentXp = typeof profile?.xp === "number" ? profile.xp : unlocked.size;
  const streakCurrent = Number(profile?.streak?.current || 0);
  const joinedMs = createdAtMs(profile?.createdAt);
  const progressAgeStart = hasResetBaseline ? baseline.resetAt : joinedMs;

  add("three_friends", newFriendsCount >= 3);
  add("site_20_minutes", progressAgeStart > 0 && (Date.now() - progressAgeStart) >= 20 * 60 * 1000);
  add("week_streak", streakCurrent >= 7);
  add("year_streak", streakCurrent >= 365);
  add("veteran", currentXp >= 30);

  const projectedAchievementCount = unlocked.size + pending.length;
  add("achievement_collector", projectedAchievementCount >= 10);

  return pending;
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

    const mergedProfile = {
      ...data,
      uid: user.uid,
      email: user.email || data.email || "",
      username: data.username || user.displayName || "",
      verified: !!user.emailVerified,
      achievements: currentAchievements,
      visitedPages: nextVisited,
      xp: typeof data.xp === "number" ? data.xp : currentAchievements.length
    };

    const pending = computeUnlocks(user, mergedProfile, nextVisited);
    const mergedAchievements = uniqueKnown([...currentAchievements, ...pending]);
    const addedReward = pending.reduce((sum, id) => sum + rewardForId(id), 0);
    const xp = (typeof data.xp === "number" ? data.xp : currentAchievements.length) + addedReward;

    const nextDoc = {
      uid: user.uid,
      email: user.email || data.email || "",
      emailLower: String(user.email || data.email || "").toLowerCase(),
      username: data.username || user.displayName || "",
      verified: !!user.emailVerified,
      achievements: mergedAchievements,
      visitedPages: nextVisited,
      xp,
      stats: {
        ...(data.stats || {}),
        pagesVisited: nextVisited.length
      },
      createdAt: data.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastLoginAt: serverTimestamp()
    };

    tx.set(ref, nextDoc, { merge: true });
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

    return `
      <div class="achievement-card ${isUnlocked ? "unlocked" : "locked"}" id="achievement-card-${achievement.id}" data-achievement-id="${achievement.id}">
        <div class="achievement-icon">${isUnlocked ? "Unlocked" : "Locked"}</div>
        <div>
          <div class="achievement-name">${title}</div>
          <div class="achievement-desc">${desc}</div>
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
      body: `${achievement.name} - +${achievement.reward} XP`,
      href: "account-page.html?tab=progress"
    });
  });
}

function startAccountWatcher() {
  watchAuth(async (user, profile) => {
    if (!user) {
      renderAchievements(null);
      return;
    }

    try {
      await ensureUserProfile(user);
      const result = await syncAchievementProgress(user, profile);
      renderAchievements(result.profile || profile);
      emitAchievementToasts(user, result.newlyUnlocked);
    } catch (error) {
      console.error("Achievement tracker error:", error);
      renderAchievements(profile || null);
    }
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
      renderAchievements(snap.exists() ? snap.data() : null);
    });
  });
}

function startAchievementSystem() {
  if (started) return;
  started = true;

  ensurePanategwaToast();
  startAccountWatcher();
  startLiveProfileListener();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startAchievementSystem);
} else {
  startAchievementSystem();
}
