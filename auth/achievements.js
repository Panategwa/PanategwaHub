import { auth, db } from "./firebase-config.js";
import { watchAuth, ensureUserProfile, getProfile } from "./auth.js";

import {
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export const ACHIEVEMENTS = [
  { id: "first_login", name: "Login", description: "Log in for the first time.", secret: false },
  { id: "profile_name", name: "True Name", description: "Set your username.", secret: false },
  { id: "verified_email", name: "Verified", description: "Verify your email address.", secret: false },

  { id: "panategwa_b", name: "Panategwa B", description: "Visit Panategwa B.", secret: false },
  { id: "panategwa_c", name: "Panategwa C", description: "Visit Panategwa C.", secret: false },
  { id: "panategwa_d", name: "Panategwa D", description: "Visit Panategwa D.", secret: false },
  { id: "panategwa_e", name: "Panategwa E", description: "Visit Panategwa E.", secret: false },
  { id: "panategwa_f", name: "Panategwa F", description: "Visit Panategwa F.", secret: false },
  { id: "panategwa_g", name: "Panategwa G", description: "Visit Panategwa G.", secret: false },

  { id: "thrinsachelom_history", name: "Historian", description: "View the history of the Thrinsacheloms.", secret: false },
  { id: "all_planets", name: "Astronaught", description: "Visit all celestial bodies of the Panategwa System.", secret: false },

  { id: "theme_shifter", name: "Aesthetic Control", description: "Change your theme.", secret: false },
  { id: "dark_mode", name: "Dark Night", description: "Use Dark Mode.", secret: false },
  { id: "light_mode", name: "Lights On", description: "Use Light Mode.", secret: false },
  { id: "ocean_mode", name: "Wavefinder", description: "Use the Ocean theme.", secret: false },
  { id: "space_mode", name: "Stargazer", description: "Use the Space theme.", secret: false },

  { id: "achievement_collector", name: "Achievement Collector", description: "Unlock 10 achievements.", secret: false },
  { id: "veteran", name: "Veteran", description: "Unlock 20 achievements.", secret: false },

  { id: "big_reader", name: "Need some glasses?", description: "Set text size to Large.", secret: true },
  { id: "tiny_text", name: "Microscopic Text", description: "Set text size to Small.", secret: true },
  { id: "nocturnal", name: "Nocturnal", description: "Visit the site late at night.", secret: true },
  { id: "morning_person", name: "Morning Person", description: "Visit the site early in the morning.", secret: true }
];

const ACHIEVEMENT_MAP = new Map(ACHIEVEMENTS.map(a => [a.id, a]));
const KNOWN_IDS = new Set(ACHIEVEMENTS.map(a => a.id));

let started = false;
let profileUnsub = null;
let toastQueue = [];
let toastActive = false;
let toastTimer = null;
let pollTimer = null;
let lastProfileState = null;
let activeFilter = localStorage.getItem("achievementFilter") || "both";

function pageId() {
  return (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
}

function isAccountPage() {
  return pageId() === "account-page.html";
}

function currentTheme() {
  return localStorage.getItem("theme") || "Panategwa Mode (Default)";
}

function currentTextSize() {
  return localStorage.getItem("textsize") || "medium";
}

function uniqueKnown(list) {
  const seen = new Set();
  const out = [];

  for (const raw of Array.isArray(list) ? list : []) {
    const id = String(raw || "").trim();
    if (!KNOWN_IDS.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }

  return out;
}

function unlockedSet(profile) {
  return new Set(uniqueKnown(profile?.achievements));
}

function achievementById(id) {
  return ACHIEVEMENT_MAP.get(id) || null;
}

function visitedPages(profile) {
  return [...new Set(
    (Array.isArray(profile?.visitedPages) ? profile.visitedPages : [])
      .map(v => String(v || "").trim())
      .filter(Boolean)
  )];
}

function getRankInfo(xp) {
  if (xp < 5) {
    return {
      rank: "Explorer",
      nextRank: "Adventurer",
      nextXP: 5,
      progress: xp / 5,
      remaining: 5 - xp
    };
  }

  if (xp < 20) {
    return {
      rank: "Adventurer",
      nextRank: "Veteran",
      nextXP: 20,
      progress: (xp - 5) / 15,
      remaining: 20 - xp
    };
  }

  return {
    rank: "Veteran",
    nextRank: null,
    nextXP: null,
    progress: 1,
    remaining: 0
  };
}

function computeUnlocks(user, profile, pages) {
  const unlocked = unlockedSet(profile);
  const pending = [];

  const add = (id, condition) => {
    if (condition && !unlocked.has(id) && !pending.includes(id)) {
      pending.push(id);
    }
  };

  const page = pageId();
  const xpAfterPending = () => new Set([...Array.from(unlocked), ...pending]).size;

  add("first_login", true);
  add("profile_name", !!(profile?.username || user.displayName));
  add("verified_email", !!user.emailVerified);
  add("panategwa_b", page === "panategwa-b-page.html");
  add("panategwa_c", page === "panategwa-c-page.html");
  add("panategwa_d", page === "panategwa-d-page.html");
  add("panategwa_e", page === "panategwa-e-page.html");
  add("panategwa_f", page === "panategwa-f-page.html");
  add("panategwa_g", page === "panategwa-g-page.html");
  add("thrinsachelom_history", page === "panategwa-d-thrinsachelom-history.html");

  add(
    "all_planets",
    [
      "panategwa-page.html",
      "panategwa-b-page.html",
      "panategwa-c-page.html",
      "panategwa-d-page.html",
      "panategwa-e-page.html",
      "panategwa-f-page.html",
      "panategwa-g-page.html"
    ].every(p => pages.includes(p))
  );

  const theme = currentTheme();
  add("theme_shifter", theme !== "Panategwa Mode (Default)");
  add("dark_mode", theme === "Dark Mode");
  add("light_mode", theme === "Light Mode");
  add("ocean_mode", theme === "Ocean");
  add("space_mode", theme === "Space");

  const size = currentTextSize();
  add("big_reader", size === "large");
  add("tiny_text", size === "small");

  const hour = new Date().getHours();
  add("nocturnal", hour >= 21 || hour < 3);
  add("morning_person", hour >= 3 && hour < 10);

  add("achievement_collector", xpAfterPending() >= 10);
  add("veteran", xpAfterPending() >= 20);

  return pending;
}

async function syncAchievementProgress(user, profile) {
  const ref = doc(db, "users", user.uid);
  let result = { profile: profile || null, newlyUnlocked: [] };

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists() ? snap.data() : {};

    const currentAchievements = uniqueKnown(data.achievements || profile?.achievements || []);
    const currentVisited = visitedPages(data);

    const page = pageId();
    const nextVisited = [...new Set([...currentVisited, page])];

    const mergedProfile = {
      ...data,
      uid: user.uid,
      email: user.email || data.email || "",
      username: data.username || user.displayName || "",
      verified: !!user.emailVerified,
      achievements: currentAchievements,
      visitedPages: nextVisited,
      xp: typeof data.xp === "number" ? data.xp : currentAchievements.length,
      stats: data.stats || {
        pagesVisited: 0,
        planetsFound: 0,
        secretsFound: 0
      }
    };

    const pending = computeUnlocks(user, mergedProfile, nextVisited);
    const mergedAchievements = uniqueKnown([...currentAchievements, ...pending]);
    const xp = mergedAchievements.length;

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

    result = {
      profile: nextDoc,
      newlyUnlocked: pending
    };
  });

  return result;
}

function ensureToastStyle() {
  if (document.getElementById("achievement-toast-style")) return;

  const style = document.createElement("style");
  style.id = "achievement-toast-style";
  style.textContent = `
    #achievement-toast-stack {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 99999;
      display: grid;
      gap: 10px;
      width: min(360px, calc(100vw - 32px));
      pointer-events: none;
    }

    .achievement-toast {
      pointer-events: auto;
      cursor: pointer;
      border-radius: 14px;
      padding: 14px 16px;
      background: rgba(20, 20, 30, 0.94);
      color: #fff;
      border: 1px solid rgba(255,255,255,0.14);
      box-shadow: 0 12px 30px rgba(0,0,0,0.35);
      backdrop-filter: blur(8px);
      display: grid;
      gap: 6px;
      animation: achFadeIn 180ms ease-out;
      user-select: none;
    }

    .achievement-toast:hover {
      filter: brightness(1.08);
    }

    .achievement-toast-title {
      font-weight: 700;
      font-size: 0.95rem;
      opacity: 0.95;
    }

    .achievement-toast-name {
      font-weight: 700;
      font-size: 1rem;
    }

    .achievement-toast-desc {
      font-size: 0.92rem;
      opacity: 0.84;
      line-height: 1.35;
    }

    .achievement-filters {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }

    .achievement-filter-btn {
      margin: 0;
      padding: 8px 12px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.16);
      background: rgba(255,255,255,0.08);
      color: inherit;
      cursor: pointer;
      font: inherit;
      font-weight: 700;
    }

    .achievement-filter-btn.active {
      filter: brightness(0.85);
      background: rgba(175, 200, 75, 0.28);
    }

    .xp-panel {
      display: grid;
      gap: 10px;
      padding: 14px;
      border-radius: 14px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      margin-bottom: 14px;
    }

    .xp-panel-topline {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      font-weight: 700;
    }

    .xp-track {
      width: 100%;
      height: 18px;
      border-radius: 999px;
      overflow: hidden;
      background: rgba(255,255,255,0.12);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
    }

    .xp-fill {
      width: 0%;
      height: 100%;
      border-radius: 999px;
      background: linear-gradient(90deg, rgba(175,200,75,0.95), rgba(80,180,255,0.95));
      transition: width 1.1s cubic-bezier(.22,1,.36,1);
      will-change: width;
    }

    .xp-foot {
      font-size: 0.92rem;
      opacity: 0.82;
    }

    .achievement-list-inner {
      display: grid;
      gap: 10px;
    }

    .achievement-empty {
      padding: 14px;
      border-radius: 12px;
      background: rgba(255,255,255,0.05);
      border: 1px dashed rgba(255,255,255,0.16);
      opacity: 0.85;
    }

    @keyframes achFadeIn {
      from { transform: translateY(8px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

function ensureToastStack() {
  let stack = document.getElementById("achievement-toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "achievement-toast-stack";
    document.body.appendChild(stack);
  }
  return stack;
}

function showAchievementToast(achievementOrId) {
  const achievement =
    typeof achievementOrId === "string"
      ? achievementById(achievementOrId)
      : achievementOrId;

  if (!achievement) return;

  toastQueue.push(achievement);
  showNextToast();
}

function showNextToast() {
  if (toastActive || toastQueue.length === 0) return;

  toastActive = true;
  ensureToastStyle();
  const stack = ensureToastStack();

  const achievement = toastQueue.shift();
  const card = document.createElement("div");
  card.className = "achievement-toast";
  card.innerHTML = `
    <div class="achievement-toast-title">Achievement unlocked</div>
    <div class="achievement-toast-name">${achievement.name}</div>
    <div class="achievement-toast-desc">${achievement.description}</div>
  `;

  card.addEventListener("click", () => {
    window.location.href = "account-page.html";
  });

  stack.appendChild(card);

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    card.remove();
    toastActive = false;
    showNextToast();
  }, 5000);
}

function setAchievementFilter(mode) {
  if (!["both", "unlocked", "locked"].includes(mode)) return;
  activeFilter = mode;
  localStorage.setItem("achievementFilter", mode);
  renderAchievements(lastProfileState);
}

window.setAchievementFilter = setAchievementFilter;

function animateBar(targetPercent) {
  const fill = document.getElementById("xp-bar-fill");
  if (!fill) return;

  fill.style.width = "0%";
  fill.getBoundingClientRect();

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fill.style.width = `${targetPercent}%`;
    });
  });
}

function renderProgress(profile) {
  const unlocked = unlockedSet(profile);
  const xp = typeof profile?.xp === "number" ? profile.xp : unlocked.size;
  const rankInfo = getRankInfo(xp);

  const rankEl = document.getElementById("xp-rank");
  const needEl = document.getElementById("xp-need");
  const totalEl = document.getElementById("xp-total");
  const labelEl = document.getElementById("xp-label");

  if (rankEl) rankEl.textContent = rankInfo.rank;
  if (needEl) needEl.textContent = rankInfo.nextRank ? `${rankInfo.remaining} XP to ${rankInfo.nextRank}` : "Max rank reached";
  if (totalEl) totalEl.textContent = String(xp);
  if (labelEl) labelEl.textContent = rankInfo.nextRank ? `Next rank at ${rankInfo.nextXP} XP` : "You have reached the maximum rank";

  animateBar(Math.max(0, Math.min(100, rankInfo.progress * 100)));
}

function renderAchievements(profile) {
  lastProfileState = profile || null;
  renderProgress(profile);

  const container = document.getElementById("achievements-list");
  const countEl = document.getElementById("achievement-count");

  const unlocked = unlockedSet(profile);
  if (countEl) countEl.textContent = String(unlocked.size);
  if (!container) return;

  const allSorted = [...ACHIEVEMENTS].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );

  const unlockedItems = allSorted.filter(a => unlocked.has(a.id));
  const lockedItems = allSorted.filter(a => !unlocked.has(a.id));

  let items = [];
  if (activeFilter === "unlocked") items = unlockedItems;
  else if (activeFilter === "locked") items = lockedItems;
  else items = [...unlockedItems, ...lockedItems];

  container.innerHTML = `
    <div class="achievement-filters">
      <button type="button" class="achievement-filter-btn ${activeFilter === "both" ? "active" : ""}" onclick="window.setAchievementFilter('both')">Both</button>
      <button type="button" class="achievement-filter-btn ${activeFilter === "unlocked" ? "active" : ""}" onclick="window.setAchievementFilter('unlocked')">Unlocked</button>
      <button type="button" class="achievement-filter-btn ${activeFilter === "locked" ? "active" : ""}" onclick="window.setAchievementFilter('locked')">Locked</button>
    </div>

    <div class="achievement-list-inner">
      ${
        items.length
          ? items.map(achievement => {
              const isUnlocked = unlocked.has(achievement.id);
              const title = achievement.secret && !isUnlocked ? "Secret" : achievement.name;
              const desc = achievement.secret && !isUnlocked ? "Hidden achievement" : achievement.description;
              const icon = isUnlocked ? "🏆" : "🔒";

              return `
                <div class="achievement-card ${isUnlocked ? "unlocked" : "locked"} ${achievement.secret ? "secret" : ""}">
                  <div class="achievement-icon">${icon}</div>
                  <div class="achievement-body">
                    <div class="achievement-name">${title}</div>
                    <div class="achievement-desc">${desc}</div>
                  </div>
                </div>
              `;
            }).join("")
          : `<div class="achievement-empty">No achievements to show.</div>`
      }
    </div>
  `;

  renderProgress(profile);
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

      for (const id of result.newlyUnlocked) {
        showAchievementToast(id);
      }
    } catch (err) {
      console.error("Achievement tracker error:", err);
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
      const liveProfile = snap.exists() ? snap.data() : null;
      renderAchievements(liveProfile);
    });
  });
}

function startPoller() {
  if (pollTimer) return;

  pollTimer = setInterval(async () => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      const profile = await getProfile(user.uid);
      const result = await syncAchievementProgress(user, profile);

      renderAchievements(result.profile || profile);

      for (const id of result.newlyUnlocked) {
        showAchievementToast(id);
      }
    } catch (err) {
      console.error("Achievement poll error:", err);
    }
  }, 3000);
}

function startAchievementSystem() {
  if (started) return;
  started = true;

  startAccountWatcher();
  startLiveProfileListener();
  startPoller();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startAchievementSystem);
} else {
  startAchievementSystem();
}

export {
  syncAchievementProgress,
  renderAchievements,
  showAchievementToast
};