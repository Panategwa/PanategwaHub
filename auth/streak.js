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
const WEEK_MS = 7 * DAY_MS;

let currentUser = null;
let currentProfile = null;

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
  if (!raw) {
    return { streak: 0, lastClaimAt: 0, lastClaimDay: "", totalClaims: 0 };
  }

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
  const week = Math.min(5, Math.max(1, Math.ceil(day / 7)));
  return week;
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

async function claimStreak() {
  if (!currentUser) return;

  const now = Date.now();
  const local = loadStreak(currentUser.uid);

  if (local.lastClaimAt && now - local.lastClaimAt > DAY_MS) {
    local.streak = 0;
  }

  if (local.lastClaimDay === todayKey()) {
    alert("You already claimed today.");
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
  renderPage();
  alert(`Streak claimed: +${reward} XP`);
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

    renderPage();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}