import { auth, db } from "./firebase-config.js";
import { watchAuth, ensureUserProfile, getProfile } from "./auth.js";

import {
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  addDoc,
  collection
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export const ACHIEVEMENTS = [
  { id: "achievement_collector", name: "Achievement Collector", description: "Unlock 10 achievements.", secret: false, reward: 5 },
  { id: "all_planets", name: "Astronaut", description: "Visit all celestial bodies of the Panategwa system.", secret: false, reward: 5 },
  { id: "account_viewed", name: "Account Viewer", description: "Open the account page.", secret: false, reward: 1 },
  { id: "big_reader", name: "Need some glasses?", description: "Set text size to Large.", secret: true, reward: 2 },
  { id: "dark_mode", name: "Dark Night", description: "Use Dark Mode.", secret: false, reward: 1 },
  { id: "first_login", name: "First Contact", description: "Log in for the first time.", secret: false, reward: 1 },
  { id: "light_mode", name: "Sunshine", description: "Use Light Mode.", secret: false, reward: 1 },
  { id: "morning_person", name: "Morning Person", description: "Visit between 3am and 10am.", secret: true, reward: 2 },
  { id: "nocturnal", name: "Nocturnal", description: "Visit between 9pm and 3am.", secret: true, reward: 2 },
  { id: "ocean_mode", name: "Wavefinder", description: "Use the Ocean theme.", secret: false, reward: 1 },
  { id: "panategwa_b", name: "Panategwa B", description: "Visit Panategwa B.", secret: false, reward: 1 },
  { id: "panategwa_c", name: "Panategwa C", description: "Visit Panategwa C.", secret: false, reward: 1 },
  { id: "panategwa_d", name: "Panategwa D", description: "Visit Panategwa D.", secret: false, reward: 1 },
  { id: "panategwa_e", name: "Panategwa E", description: "Visit Panategwa E.", secret: false, reward: 1 },
  { id: "panategwa_f", name: "Panategwa F", description: "Visit Panategwa F.", secret: false, reward: 1 },
  { id: "panategwa_g", name: "Panategwa G", description: "Visit Panategwa G.", secret: false, reward: 1 },
  { id: "profile_name", name: "True Name", description: "Set your username.", secret: false, reward: 1 },
  { id: "space_mode", name: "Stargazer", description: "Use the Space theme.", secret: false, reward: 1 },
  { id: "theme_shifter", name: "Aesthetic Control", description: "Change your theme.", secret: false, reward: 1 },
  { id: "thrinsachelom_history", name: "Historian", description: "View the history of the Thrinsacheloms.", secret: false, reward: 2 },
  { id: "tiny_text", name: "Microscopic Text", description: "Set text size to Small.", secret: true, reward: 2 },
  { id: "verified_email", name: "Verified Signal", description: "Verify your email address.", secret: false, reward: 2 },
  { id: "veteran", name: "Veteran", description: "Reach 20 XP.", secret: false, reward: 5 }
];

const ACHIEVEMENT_MAP = new Map(ACHIEVEMENTS.map((achievement) => [achievement.id, achievement]));
const KNOWN_IDS = new Set(ACHIEVEMENTS.map((achievement) => achievement.id));

let started = false;
let profileUnsub = null;
let pollTimer = null;
let toastQueue = [];
let toastActive = false;

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

function computeUnlocks(user, profile, pages) {
  const unlocked = unlockedSet(profile);
  const pending = [];
  const add = (id, condition) => {
    if (condition && !unlocked.has(id) && !pending.includes(id)) pending.push(id);
  };

  const page = pageId();

  add("first_login", true);
  add("profile_name", !!(profile?.username || user.displayName));
  add("verified_email", !!user.emailVerified);
  add("account_viewed", page === "account-page.html");
  add("panategwa_b", page === "panategwa-b-page.html");
  add("panategwa_c", page === "panategwa-c-page.html");
  add("panategwa_d", page === "panategwa-d-page.html");
  add("panategwa_e", page === "panategwa-e-page.html");
  add("panategwa_f", page === "panategwa-f-page.html");
  add("panategwa_g", page === "panategwa-g-page.html");
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
  add("morning_person", hour >= 3 && hour < 11);

  const projectedAchievementCount = unlocked.size + pending.length;
  const currentXp = typeof profile?.xp === "number" ? profile.xp : unlocked.size;
  const projectedXp = currentXp + pending.reduce((sum, id) => sum + rewardForId(id), 0);

  add("achievement_collector", projectedAchievementCount >= 10);
  add("veteran", projectedXp >= 20);

  return pending;
}

function ensureToastSystem() {
  if (window.PanategwaToast) return;

  const styleId = "achievement-toast-style";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      #achievement-toast-stack {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 99999;
        display: grid;
        gap: 10px;
        width: min(360px, calc(100vw - 32px));
      }

      .achievement-toast {
        cursor: pointer;
        border-radius: 14px;
        padding: 14px 16px;
        background: rgba(20, 20, 30, 0.94);
        color: #fff;
        border: 1px solid rgba(255,255,255,0.14);
        box-shadow: 0 12px 30px rgba(0,0,0,0.35);
        display: grid;
        gap: 6px;
      }

      .achievement-toast-title {
        font-weight: 700;
      }

      .achievement-toast-desc {
        font-size: 0.92rem;
        opacity: 0.84;
        line-height: 1.35;
      }
    `;
    document.head.appendChild(style);
  }

  function getStack() {
    let stack = document.getElementById("achievement-toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.id = "achievement-toast-stack";
      document.body.appendChild(stack);
    }
    return stack;
  }

  window.PanategwaToast = ({ title = "Message", body = "", href = "" } = {}) => {
    toastQueue.push({ title, body, href });
    if (toastActive) return;
    toastActive = true;

    const next = () => {
      const item = toastQueue.shift();
      if (!item) {
        toastActive = false;
        return;
      }

      const toast = document.createElement("div");
      toast.className = "achievement-toast";
      toast.innerHTML = `
        <div class="achievement-toast-title">${item.title}</div>
        <div class="achievement-toast-desc">${item.body}</div>
      `;
      toast.addEventListener("click", () => {
        if (item.href) window.location.href = item.href;
      });

      getStack().appendChild(toast);

      setTimeout(() => {
        toast.remove();
        next();
      }, 4200);
    };

    next();
  };
}

async function sendAchievementMessage(user, achievement) {
  await addDoc(collection(db, "messages"), {
    fromUid: user.uid,
    toUid: user.uid,
    participants: [user.uid],
    fromName: user.displayName || user.email?.split("@")?.[0] || "System",
    toName: user.displayName || user.email?.split("@")?.[0] || "System",
    kind: "achievement",
    title: `Achievement unlocked: ${achievement.name}`,
    body: `You unlocked ${achievement.name} and earned +${achievement.reward} XP.`,
    targetSection: "progress",
    targetSubSection: "progress",
    targetId: achievement.id,
    readBy: [user.uid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
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
  ensureToastSystem();

  newlyUnlocked.forEach(async (id) => {
    const achievement = ACHIEVEMENT_MAP.get(id);
    if (!achievement) return;

    window.PanategwaToast({
      title: "Achievement unlocked",
      body: `${achievement.name} - +${achievement.reward} XP`,
      href: "account-page.html?tab=progress"
    });
    await sendAchievementMessage(user, achievement);
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

function startPoller() {
  if (pollTimer) return;

  pollTimer = setInterval(async () => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      const profile = await getProfile(user.uid);
      const result = await syncAchievementProgress(user, profile);
      renderAchievements(result.profile || profile);
      emitAchievementToasts(user, result.newlyUnlocked);
    } catch (error) {
      console.error("Achievement poll error:", error);
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
