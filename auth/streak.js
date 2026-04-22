import { auth, db } from "./firebase-config.js";
import { watchAuth, getProfile } from "./auth.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

let currentUser = null;
let currentProfile = null;
let viewingMonthKey = "";
let midnightTimer = null;

function userRef(uid) {
  return doc(db, "users", uid);
}

function streakKey(uid) {
  return `ptg_streak_${uid}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function dateFromKey(key) {
  const [year, month, day] = String(key || "").split("-").map((value) => Number(value || 0));
  return new Date(year, Math.max(0, month - 1), Math.max(1, day || 1), 0, 0, 0, 0);
}

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function monthDate(monthKey) {
  const [year, month] = String(monthKey || "").split("-").map((value) => Number(value || 0));
  return new Date(year, Math.max(0, month - 1), 1, 0, 0, 0, 0);
}

function shiftMonth(monthKey, delta) {
  const date = monthDate(monthKey);
  date.setMonth(date.getMonth() + delta);
  return localMonthKey(date);
}

function monthLabel(monthKey) {
  return monthDate(monthKey).toLocaleString([], {
    month: "long",
    year: "numeric"
  });
}

function compareMonthKeys(a, b) {
  const left = monthDate(a).getTime();
  const right = monthDate(b).getTime();
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function toMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  return 0;
}

function loadBackup(uid) {
  try {
    const raw = localStorage.getItem(streakKey(uid));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveBackup(uid, data) {
  try {
    localStorage.setItem(streakKey(uid), JSON.stringify(data));
  } catch {}
}

function normalizeHistory(history = {}) {
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

function normalizedState(profile, uid) {
  const backup = loadBackup(uid) || {};
  const history = {
    ...normalizeHistory(backup.history),
    ...normalizeHistory(profile?.streakHistory)
  };

  const lastClaimAt = toMs(profile?.streak?.lastClaimAt) || Number(backup.lastClaimAt || 0);
  const current = Number(profile?.streak?.current || backup.streak || 0);
  const longest = Number(profile?.longestStreak || profile?.streak?.longest || backup.longestStreak || current || 0);

  return {
    current,
    longest,
    lastClaimAt,
    lastClaimDay: String(profile?.streak?.lastClaimDay || backup.lastClaimDay || ""),
    history
  };
}

function rewardForDay(day) {
  return Math.min(5, Math.max(1, Math.ceil(Number(day || 0) / 7)));
}

function daysBetween(fromKey, toKey) {
  if (!fromKey || !toKey) return Infinity;
  const from = dateFromKey(fromKey);
  const to = dateFromKey(toKey);
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

function isMissed(state, todayKey = localDateKey()) {
  return daysBetween(state.lastClaimDay, todayKey) > 1;
}

function effectiveCurrentStreak(state, todayKey = localDateKey()) {
  return isMissed(state, todayKey) ? 0 : Number(state.current || 0);
}

function nextReward(state, todayKey = localDateKey()) {
  const nextDay = effectiveCurrentStreak(state, todayKey) + 1;
  return rewardForDay(nextDay);
}

function createdMonthKey(profile) {
  const createdAt = toMs(profile?.createdAt);
  return createdAt ? localMonthKey(new Date(createdAt)) : localMonthKey(new Date());
}

function relativeAge(value) {
  const ms = toMs(value);
  if (!ms) return "--";

  const diff = Math.max(0, Date.now() - ms);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const month = 30 * day;
  const year = 365 * day;

  if (diff < minute) return "Just now";
  if (diff < hour) {
    const amount = Math.floor(diff / minute);
    return `${amount} min${amount === 1 ? "" : "s"}`;
  }
  if (diff < day) {
    const amount = Math.floor(diff / hour);
    return `${amount} hour${amount === 1 ? "" : "s"}`;
  }
  if (diff < month) {
    const amount = Math.floor(diff / day);
    return `${amount} day${amount === 1 ? "" : "s"}`;
  }
  if (diff < year) {
    const amount = Math.floor(diff / month);
    return `${amount} month${amount === 1 ? "" : "s"}`;
  }

  const amount = Math.floor(diff / year);
  return `${amount} year${amount === 1 ? "" : "s"}`;
}

function prettyDateTime(value) {
  const ms = toMs(value);
  if (!ms) return "--";
  return new Date(ms).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function monthBounds(monthKey) {
  const start = monthDate(monthKey);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 0, 0, 0, 0);
  return { start, end };
}

function firstGridOffset(monthKey) {
  const weekday = monthDate(monthKey).getDay();
  return weekday === 0 ? 6 : weekday - 1;
}

function dayCard(dayDate, state, createdAtMs) {
  const todayKey = localDateKey();
  const key = localDateKey(dayDate);
  const entry = state.history[key];
  const past = dayDate.getTime() < dateFromKey(todayKey).getTime();
  const future = dayDate.getTime() > dateFromKey(todayKey).getTime();
  const beforeJoin = createdAtMs && dayDate.getTime() < new Date(new Date(createdAtMs).getFullYear(), new Date(createdAtMs).getMonth(), new Date(createdAtMs).getDate()).getTime();

  if (beforeJoin || future) {
    return `
      <div class="month-day month-day-muted">
        <div class="month-day-number">${dayDate.getDate()}</div>
        <div class="month-day-state">--</div>
      </div>
    `;
  }

  if (entry) {
    return `
      <div class="month-day claimed" title="${prettyDateTime(entry.claimedAt)}">
        <div class="month-day-number">${dayDate.getDate()}</div>
        <div class="month-day-state">Claimed</div>
        <div class="month-day-reward">+${entry.reward} XP</div>
      </div>
    `;
  }

  if (key === todayKey) {
    return `
      <div class="month-day today">
        <div class="month-day-number">${dayDate.getDate()}</div>
        <div class="month-day-state">Today</div>
        <div class="month-day-reward">Ready</div>
      </div>
    `;
  }

  if (past) {
    return `
      <div class="month-day missed">
        <div class="month-day-number">${dayDate.getDate()}</div>
        <div class="month-day-state">Missed</div>
        <div class="month-day-reward">0 XP</div>
      </div>
    `;
  }

  return `
    <div class="month-day month-day-muted">
      <div class="month-day-number">${dayDate.getDate()}</div>
      <div class="month-day-state">--</div>
    </div>
  `;
}

function renderMonthGrid(profile, state) {
  const { start, end } = monthBounds(viewingMonthKey);
  const createdAtMs = toMs(profile?.createdAt);
  const cells = [];

  for (let i = 0; i < firstGridOffset(viewingMonthKey); i += 1) {
    cells.push(`<div class="month-day month-day-spacer" aria-hidden="true"></div>`);
  }

  for (let day = 1; day <= end.getDate(); day += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), day, 0, 0, 0, 0);
    cells.push(dayCard(date, state, createdAtMs));
  }

  return `
    <div class="month-grid-head">
      ${WEEKDAY_LABELS.map((label) => `<div class="month-grid-label">${label}</div>`).join("")}
    </div>
    <div class="month-grid">
      ${cells.join("")}
    </div>
  `;
}

async function claimStreak() {
  if (!currentUser) return;

  const today = localDateKey();
  const state = normalizedState(currentProfile, currentUser.uid);
  if (state.lastClaimDay === today) {
    if (typeof window.PanategwaToast === "function") {
      window.PanategwaToast({
        title: "Streak",
        body: "You already claimed today.",
        href: "streak-page.html"
      });
    }
    return;
  }

  const nextDay = effectiveCurrentStreak(state, today) + 1;
  const reward = rewardForDay(nextDay);
  const nextHistory = {
    ...state.history,
    [today]: {
      reward,
      streakDay: nextDay,
      claimedAt: Date.now()
    }
  };

  const profileSnap = await getDoc(userRef(currentUser.uid));
  const liveProfile = profileSnap.exists() ? profileSnap.data() : (currentProfile || {});
  const currentXp = Number(liveProfile?.xp || 0);
  const longest = Math.max(Number(liveProfile?.longestStreak || 0), Number(state.longest || 0), nextDay);

  await setDoc(userRef(currentUser.uid), {
    xp: currentXp + reward,
    longestStreak: longest,
    streak: {
      current: nextDay,
      longest,
      lastClaimAt: Date.now(),
      lastClaimDay: today
    },
    streakHistory: nextHistory,
    updatedAt: serverTimestamp()
  }, { merge: true });

  saveBackup(currentUser.uid, {
    streak: nextDay,
    longestStreak: longest,
    lastClaimAt: Date.now(),
    lastClaimDay: today,
    history: nextHistory
  });

  currentProfile = await getProfile(currentUser.uid);
  renderPage();

  if (typeof window.PanategwaToast === "function") {
    window.PanategwaToast({
      title: "Streak claimed",
      body: `You claimed ${reward} XP from your day ${nextDay} streak.`,
      href: "streak-page.html"
    });
  }
}

function scheduleMidnightRefresh() {
  if (midnightTimer) {
    window.clearTimeout(midnightTimer);
    midnightTimer = null;
  }

  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1, 0);
  midnightTimer = window.setTimeout(() => {
    renderPage();
    scheduleMidnightRefresh();
  }, Math.max(1000, next.getTime() - now.getTime()));
}

function renderPage() {
  const root = $("streak-root");
  if (!root) return;

  if (!currentUser) {
    root.innerHTML = `
      <div class="streak-card">
        <h1>Streak</h1>
        <p>Log in first.</p>
      </div>
    `;
    return;
  }

  const profile = currentProfile || {};
  const state = normalizedState(profile, currentUser.uid);
  const today = localDateKey();
  const current = effectiveCurrentStreak(state, today);
  const longest = Math.max(Number(profile?.longestStreak || 0), Number(state.longest || 0), current);
  const reward = nextReward(state, today);
  const joinedMonth = createdMonthKey(profile);
  const latestMonth = localMonthKey(new Date());

  if (!viewingMonthKey) viewingMonthKey = latestMonth;
  if (compareMonthKeys(viewingMonthKey, joinedMonth) < 0) viewingMonthKey = joinedMonth;
  if (compareMonthKeys(viewingMonthKey, latestMonth) > 0) viewingMonthKey = latestMonth;

  const alreadyClaimed = state.lastClaimDay === today;
  const prevDisabled = compareMonthKeys(viewingMonthKey, joinedMonth) <= 0;
  const nextDisabled = compareMonthKeys(viewingMonthKey, latestMonth) >= 0;

  root.innerHTML = `
    <div class="streak-card">
      <div class="streak-head">
        <div>
          <h1>Streak</h1>
          <p>Each local midnight starts a new streak day. Miss a day and your next claim resets to 1 XP.</p>
        </div>
        <button id="claim-streak-btn" type="button" ${alreadyClaimed ? "disabled" : ""}>${alreadyClaimed ? "Claimed today" : `Claim ${reward} XP`}</button>
      </div>

      <div class="streak-summary">
        <div class="setting-card">
          <div class="setting-title">Current streak</div>
          <div class="setting-desc">${current} day${current === 1 ? "" : "s"}</div>
        </div>

        <div class="setting-card">
          <div class="setting-title">Longest streak</div>
          <div class="setting-desc">${longest} day${longest === 1 ? "" : "s"}</div>
        </div>

        <div class="setting-card">
          <div class="setting-title">Next reward</div>
          <div class="setting-desc">${reward} XP</div>
        </div>

        <div class="setting-card">
          <div class="setting-title">On the site for</div>
          <div class="setting-desc">${relativeAge(profile?.createdAt)}</div>
        </div>
      </div>

      <div class="month-panel">
        <div class="month-toolbar">
          <button id="streak-prev-month" type="button" ${prevDisabled ? "disabled" : ""}>Previous month</button>
          <div>
            <div class="setting-title" style="margin-bottom:4px;">${monthLabel(viewingMonthKey)}</div>
            <div class="setting-desc">Viewing history from ${monthLabel(joinedMonth)} onward</div>
          </div>
          <button id="streak-next-month" type="button" ${nextDisabled ? "disabled" : ""}>Next month</button>
        </div>

        ${renderMonthGrid(profile, state)}
      </div>
    </div>
  `;

  $("claim-streak-btn")?.addEventListener("click", claimStreak);
  $("streak-prev-month")?.addEventListener("click", () => {
    viewingMonthKey = shiftMonth(viewingMonthKey, -1);
    renderPage();
  });
  $("streak-next-month")?.addEventListener("click", () => {
    viewingMonthKey = shiftMonth(viewingMonthKey, 1);
    renderPage();
  });
}

function start() {
  const root = $("streak-root");
  if (!root) return;

  watchAuth(async (user, profile) => {
    currentUser = user;
    currentProfile = profile || null;
    viewingMonthKey = localMonthKey(new Date());

    if (user && !currentProfile) {
      currentProfile = await getProfile(user.uid);
    }

    renderPage();
    scheduleMidnightRefresh();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
