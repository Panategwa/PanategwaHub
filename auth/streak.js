import { auth, db } from "./firebase-config.js";
import { watchAuth, getProfile } from "./auth.js";

import {
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const DAY_MS = 24 * 60 * 60 * 1000;

let currentUser = null;
let currentProfile = null;
let toastQueue = [];
let toastActive = false;
let toastTimer = null;

function userRef(uid) {
  return doc(db, "users", uid);
}

function streakKey(uid) {
  return `ptg_streak_${uid}`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadStreak(uid) {
  const raw = localStorage.getItem(streakKey(uid));
  if (!raw) return { streak: 0, lastClaimAt: 0, lastClaimDay: "", totalClaims: 0 };

  try {
    return JSON.parse(raw);
  } catch {
    return { streak: 0, lastClaimAt: 0, lastClaimDay: "", totalClaims: 0 };
  }
}

function saveStreak(uid, data) {
  localStorage.setItem(streakKey(uid), JSON.stringify(data));
}

function rewardForDay(day) {
  return Math.min(5, Math.max(1, Math.ceil(day / 7)));
}

function ensureToastSystem() {
  if (!document.getElementById("streak-toast-style")) {
    const style = document.createElement("style");
    style.id = "streak-toast-style";
    style.textContent = `
      #streak-toast-stack {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 99999;
        display: grid;
        gap: 10px;
        width: min(360px, calc(100vw - 32px));
        pointer-events: none;
      }

      .streak-toast {
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
        animation: streakFadeIn 180ms ease-out;
        user-select: none;
      }

      .streak-toast-title {
        font-weight: 700;
        font-size: 0.95rem;
      }

      .streak-toast-body {
        font-size: 0.92rem;
        opacity: 0.84;
        line-height: 1.35;
      }

      @keyframes streakFadeIn {
        from { transform: translateY(8px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  let stack = document.getElementById("streak-toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "streak-toast-stack";
    document.body.appendChild(stack);
  }

  return stack;
}

function showToast({ title, body, xp, href }) {
  toastQueue.push({ title, body, xp, href });
  if (!toastActive) showNextToast();
}

function showNextToast() {
  if (toastActive || toastQueue.length === 0) return;
  toastActive = true;

  const stack = ensureToastSystem();
  const item = toastQueue.shift();

  const card = document.createElement("div");
  card.className = "streak-toast";
  card.innerHTML = `
    <div class="streak-toast-title">${item.title}</div>
    <div class="streak-toast-body">${item.body}</div>
    ${item.xp != null ? `<div class="streak-toast-body">+${item.xp} XP</div>` : ""}
  `;

  card.addEventListener("click", () => {
    if (item.href) window.location.href = item.href;
  });

  stack.appendChild(card);

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    card.remove();
    toastActive = false;
    showNextToast();
  }, 5000);
}

async function sendStreakMessage(uid, reward, streakDay) {
  const profileSnap = await getDoc(userRef(uid));
  const profile = profileSnap.exists() ? profileSnap.data() : {};

  await addDoc(collection(db, "messages"), {
    fromUid: uid,
    toUid: uid,
    participants: [uid],
    fromName: profile.username || profile.displayName || "System",
    toName: profile.username || profile.displayName || "System",
    kind: "streak",
    title: "Streak claimed",
    body: `You claimed ${reward} XP from your ${streakDay} day streak.`,
    targetSection: "streak",
    targetSubSection: "overview",
    targetId: null,
    readBy: [uid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

function prettyDate(value) {
  if (!value) return "—";
  if (typeof value?.toDate === "function") return value.toDate().toLocaleDateString();
  if (typeof value === "number") return new Date(value).toLocaleDateString();
  if (value instanceof Date) return value.toLocaleDateString();
  return "—";
}

function weekPreviewHtml(currentStreak) {
  return Array.from({ length: 35 }, (_, i) => {
    const day = i + 1;
    const reward = rewardForDay(day);
    const done = currentStreak >= day;
    return `
      <div class="streak-day ${done ? "done" : ""}">
        <div class="streak-day-label">Day ${day}</div>
        <div class="streak-day-xp">${reward} XP</div>
      </div>
    `;
  }).join("");
}

async function claimStreak() {
  if (!currentUser) return;

  const now = Date.now();
  const local = loadStreak(currentUser.uid);

  if (local.lastClaimAt && now - local.lastClaimAt > DAY_MS) {
    local.streak = 0;
  }

  if (local.lastClaimDay === todayKey()) {
    showToast({
      title: "Streak",
      body: "You already claimed today.",
      href: "streak-page.html"
    });
    return;
  }

  local.streak = (local.streak || 0) + 1;
  local.lastClaimAt = now;
  local.lastClaimDay = todayKey();
  local.totalClaims = (local.totalClaims || 0) + 1;

  const reward = rewardForDay(local.streak);
  saveStreak(currentUser.uid, local);

  const profileSnap = await getDoc(userRef(currentUser.uid));
  const profile = profileSnap.exists() ? profileSnap.data() : currentProfile || {};
  const currentXp = typeof profile.xp === "number" ? profile.xp : 0;

  await setDoc(userRef(currentUser.uid), {
    xp: currentXp + reward,
    streak: {
      current: local.streak,
      lastClaimAt: now,
      lastClaimDay: local.lastClaimDay
    },
    updatedAt: serverTimestamp()
  }, { merge: true });

  await sendStreakMessage(currentUser.uid, reward, local.streak);
  currentProfile = await getProfile(currentUser.uid);

  showToast({
    title: "Streak claimed",
    body: `You claimed ${reward} XP from your ${local.streak} day streak.`,
    xp: reward,
    href: "streak-page.html"
  });
}

function renderPage() {
  if (!currentUser) return;

  const profile = currentProfile || {};
  const local = loadStreak(currentUser.uid);
  const streak = profile?.streak?.current || local.streak || 0;
  const nextReward = rewardForDay(streak + 1);

  const root = $("streak-root");
  if (!root) return;

  root.innerHTML = `
    <div class="streak-card">
      <div class="streak-head">
        <div>
          <h1>🔥 Streak</h1>
          <p>Claim once every 24 hours or the streak resets.</p>
        </div>
        <button id="claim-streak-btn" type="button">Claim ${nextReward} XP</button>
      </div>

      <div class="streak-summary">
        <div class="setting-card">
          <div class="setting-title">Current streak</div>
          <div class="setting-desc">${streak} day${streak === 1 ? "" : "s"}</div>
        </div>

        <div class="setting-card">
          <div class="setting-title">Next reward</div>
          <div class="setting-desc">${nextReward} XP</div>
        </div>

        <div class="setting-card">
          <div class="setting-title">Last claim</div>
          <div class="setting-desc">${prettyDate(profile?.streak?.lastClaimAt || local.lastClaimAt)}</div>
        </div>

        <div class="setting-card">
          <div class="setting-title">Total claims</div>
          <div class="setting-desc">${local.totalClaims || 0}</div>
        </div>
      </div>

      <div class="streak-week">
        ${weekPreviewHtml(Math.min(streak, 35))}
      </div>
    </div>
  `;

  $("claim-streak-btn")?.addEventListener("click", claimStreak);
}

function start() {
  const root = $("streak-root");
  if (!root) return;

  watchAuth(async (user, profile) => {
    currentUser = user;
    currentProfile = profile || null;

    if (!user) {
      root.innerHTML = `
        <div class="streak-card">
          <h1>🔥 Streak</h1>
          <p>Log in first.</p>
        </div>
      `;
      return;
    }

    ensureToastSystem();
    renderPage();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}