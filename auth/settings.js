import { auth, db } from "./firebase-config.js";
import {
  saveUsername,
  saveProfilePictureFromFile,
  useDefaultProfilePicture,
  resendVerificationEmail,
  requestPasswordReset,
  deleteAccount,
  watchAuth,
  getProfile,
  logout
} from "./auth.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const $ = (id) => document.getElementById(id);

let activeUid = null;
let activeProfile = null;
let copyCooldownUntil = 0;
let observer = null;

function userRef(uid) {
  return doc(db, "users", uid);
}

function clampName(value) {
  return String(value || "").trim().slice(0, 20);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function styleCopyButton(btn) {
  if (!btn) return;

  btn.classList.add("copy-icon-btn");
  btn.setAttribute("type", "button");
  btn.setAttribute("aria-label", "Copy account ID");
  btn.title = "Copy account ID";

  const copied = Date.now() < copyCooldownUntil;

  btn.innerHTML = copied
    ? `
      <span class="mini-icon">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path fill="currentColor" d="M9 12.75 5.75 9.5 4.5 10.75 9 15.25 19.5 4.75 18.25 3.5z"/>
          <path fill="currentColor" d="M19 20H8a2 2 0 0 1-2-2V7h2v11h11z"/>
        </svg>
      </span>
    `
    : `
      <span class="mini-icon">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path fill="currentColor" d="M16 1H6a2 2 0 0 0-2 2v12h2V3h10z"/>
          <path fill="currentColor" d="M18 5H10a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16h-8V7h8z"/>
        </svg>
      </span>
    `;
}

async function copyUserId() {
  if (!activeUid) return;

  try {
    await navigator.clipboard.writeText(activeUid);
    copyCooldownUntil = Date.now() + 5000;
    styleCopyButton($("copy-user-id-btn"));

    setTimeout(() => {
      if (Date.now() >= copyCooldownUntil) {
        styleCopyButton($("copy-user-id-btn"));
      }
    }, 5050);
  } catch {
    prompt("Copy this ID:", activeUid);
  }
}

function uidCanChange(profile) {
  const changedAt = profile?.displayIdLastChangedAt;
  const ts = typeof changedAt?.toDate === "function"
    ? changedAt.toDate().getTime()
    : (typeof changedAt === "number" ? changedAt : 0);

  if (!ts) return true;
  return Date.now() - ts >= WEEK_MS;
}

function daysUntilDisplayIdChange(profile) {
  const changedAt = profile?.displayIdLastChangedAt;
  const ts = typeof changedAt?.toDate === "function"
    ? changedAt.toDate().getTime()
    : (typeof changedAt === "number" ? changedAt : 0);

  if (!ts) return 0;
  const remaining = Math.max(0, WEEK_MS - (Date.now() - ts));
  return Math.ceil(remaining / (24 * 60 * 60 * 1000));
}

function formatDateOnly(value) {
  if (!value) return "—";
  if (typeof value?.toDate === "function") return value.toDate().toLocaleDateString();
  if (typeof value === "number") return new Date(value).toLocaleDateString();
  if (value instanceof Date) return value.toLocaleDateString();
  return "—";
}

async function saveDisplayId() {
  if (!activeUid) return;

  const input = $("display-id-input");
  const next = clampName(input?.value || "");
  if (!next) {
    alert("Type a display ID first.");
    return;
  }

  const snap = await getDoc(userRef(activeUid));
  const profile = snap.exists() ? snap.data() : {};

  if (!uidCanChange(profile)) {
    const left = daysUntilDisplayIdChange(profile);
    alert(`You can change your display ID again in ${left} day${left === 1 ? "" : "s"}.`);
    return;
  }

  await setDoc(userRef(activeUid), {
    displayId: next,
    displayIdLastChangedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });

  await renderSettingsOnly();
  alert("Display ID saved.");
}

async function renderInfo(profile, user) {
  const box = $("user-info");
  if (!box) return;

  const streak = profile?.streak?.current || 0;
  const displayId = profile?.displayId || "Not set";

  box.innerHTML = `
    <div class="account-header">
      ${
        user.photoURL || profile?.photoURL
          ? `<img src="${escapeHtml(user.photoURL || profile.photoURL)}" alt="Avatar" class="account-avatar">`
          : `<div class="account-avatar-placeholder">${escapeHtml((profile?.username || user.displayName || user.email || "P").slice(0, 1).toUpperCase())}</div>`
      }
      <div>
        <p style="margin:0;"><b>${escapeHtml(profile?.username || user.displayName || "Player")}</b></p>
        <p style="margin:0; opacity:0.8;">${escapeHtml(user.email || profile?.email || "—")}</p>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-row"><span>Status</span><strong>Logged in</strong></div>
      <div class="info-row"><span>Username</span><strong>${escapeHtml(profile?.username || user.displayName || "Player")}</strong></div>
      <div class="info-row"><span>Email</span><strong>${escapeHtml(user.email || profile?.email || "—")}</strong></div>
      <div class="info-row"><span>Verified</span><strong>${user.emailVerified ? "Yes" : "No"}</strong></div>
      <div class="info-row">
        <span>Account ID</span>
        <strong style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; word-break:break-all;">
          <span>${escapeHtml(user.uid)}</span>
          <button id="copy-user-id-btn" type="button" class="copy-icon-btn" aria-label="Copy account ID" title="Copy account ID"></button>
        </strong>
      </div>
      <div class="info-row"><span>Display ID</span><strong>${escapeHtml(displayId)}</strong></div>
      <div class="info-row"><span>Created</span><strong>${escapeHtml(formatDateOnly(profile?.createdAt))}</strong></div>
      <div class="info-row"><span>XP</span><strong>${Number(profile?.xp || 0)}</strong></div>
      <div class="info-row"><span>Rank</span><strong>${Number(profile?.xp || 0) < 5 ? "Explorer" : Number(profile?.xp || 0) < 20 ? "Adventurer" : "Veteran"}</strong></div>
      <div class="info-row"><span>Streak</span><strong>${streak} day${streak === 1 ? "" : "s"}</strong></div>
    </div>
  `;

  styleCopyButton($("copy-user-id-btn"));
  $("copy-user-id-btn")?.addEventListener("click", copyUserId);
}

async function renderSettingsOnly() {
  if (!activeUid) return;

  const user = auth.currentUser;
  if (!user) return;

  const profile = await getProfile(activeUid);
  activeProfile = profile || {};

  const nameInput = $("profile-username");
  const displayIdInput = $("display-id-input");

  if (nameInput && document.activeElement !== nameInput) {
    nameInput.value = activeProfile.username || user.displayName || "";
  }

  if (displayIdInput && document.activeElement !== displayIdInput) {
    displayIdInput.value = activeProfile.displayId || "";
  }

  await renderInfo(activeProfile, user);
}

function bindSettings() {
  $("save-username-btn")?.addEventListener("click", async () => {
    const value = clampName($("profile-username")?.value || "");
    if (!value) return;
    await saveUsername(value);
    await renderSettingsOnly();
  });

  $("save-avatar-btn")?.addEventListener("click", async () => {
    const file = $("profile-picture-file")?.files?.[0];
    if (!file) {
      alert("Choose an image first.");
      return;
    }
    await saveProfilePictureFromFile(file);
    await renderSettingsOnly();
  });

  $("use-default-avatar-btn")?.addEventListener("click", async () => {
    await useDefaultProfilePicture();
    await renderSettingsOnly();
  });

  $("save-display-id-btn")?.addEventListener("click", saveDisplayId);

  $("resend-verification-btn")?.addEventListener("click", async () => {
    try {
      const sent = await resendVerificationEmail();
      if (sent === false) {
        alert("Your email is already verified.");
      } else {
        alert("Verification email sent.");
      }
    } catch (err) {
      alert(err.message || "Could not resend verification email.");
    }
  });

  $("logout-btn")?.addEventListener("click", async () => {
    await logout();
    window.location.reload();
  });

  $("delete-account-btn")?.addEventListener("click", async () => {
    if (!confirm("Delete your account permanently?")) return;
    try {
      await deleteAccount($("delete-password")?.value || "");
      window.location.reload();
    } catch (err) {
      alert(err.message || "Delete failed.");
    }
  });

  $("profile-username")?.addEventListener("input", () => {
    const el = $("profile-username");
    if (el && el.value.length > 20) el.value = el.value.slice(0, 20);
  });
}

function bindTabs() {
  $("tab-info")?.addEventListener("click", () => window.openAccountArea("info"));
  $("tab-settings")?.addEventListener("click", () => window.openAccountArea("settings"));
  $("tab-progress")?.addEventListener("click", () => window.openAccountArea("progress"));
  $("tab-friends")?.addEventListener("click", () => window.openAccountArea("friends"));
  $("tab-messages")?.addEventListener("click", () => window.openAccountArea("messages"));
}

function showSection(sectionName) {
  document.querySelectorAll(".account-section").forEach(section => {
    section.classList.toggle("active", section.dataset.section === sectionName);
  });

  document.querySelectorAll(".tab-button").forEach(button => {
    button.classList.toggle("active", button.dataset.target === sectionName);
  });
}

function start() {
  bindTabs();
  bindSettings();

  watchAuth(async (user, profile) => {
    activeUid = user?.uid || null;
    activeProfile = profile || null;

    if (!user) {
      showSection("info");
      return;
    }

    const search = new URLSearchParams(window.location.search);
    const tab = (search.get("tab") || window.location.hash.replace("#", "") || "info").toLowerCase();
    showSection(tab === "settings" ? "settings" : tab === "progress" ? "progress" : tab === "friends" ? "friends" : tab === "messages" ? "messages" : "info");

    await renderSettingsOnly();
    if (typeof window.PanategwaMessagesRender === "function") {
      window.PanategwaMessagesRender();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}