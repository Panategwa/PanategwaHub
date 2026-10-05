// Note: Firebase API keys are public by design in client-side apps.
// Keep the project config here. Do NOT put service account keys or secrets in this file.

import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  setPersistence,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCatgiEb0Z-y34QjFi6O2xMJhFnIdfA34E",
  authDomain: "panategwa-hub.firebaseapp.com",
  projectId: "panategwa-hub",
  storageBucket: "panategwa-hub.firebasestorage.app",
  messagingSenderId: "20208045595",
  appId: "1:20208045595:web:9f3718d8df5b7f449d32be",
  measurementId: "G-48SXW4KW45"
};

const ACTIVE_SLOT_KEY = "ptg_active_account_slot";
const SLOT_DEFINITIONS = [
  { id: "account-1", appName: "[DEFAULT]" },
  { id: "account-2", appName: "PanategwaAccount2" },
  { id: "account-3", appName: "PanategwaAccount3" }
];

function appForName(name) {
  return name === "[DEFAULT]"
    ? (getApps().some((entry) => entry.name === name) ? getApp(name) : initializeApp(firebaseConfig))
    : (getApps().some((entry) => entry.name === name) ? getApp(name) : initializeApp(firebaseConfig, name));
}

const accountSlots = SLOT_DEFINITIONS.map((definition) => {
  const app = appForName(definition.appName);
  const auth = getAuth(app);
  const googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: "select_account" });
  return {
    id: definition.id,
    app,
    auth,
    db: getFirestore(app),
    googleProvider,
    ready: null,
    authUnsub: null
  };
});

function prepareSlot(slot) {
  slot.ready = (async () => {
    slot.auth.useDeviceLanguage();
    try {
      await setPersistence(slot.auth, indexedDBLocalPersistence);
    } catch (indexedDbError) {
      console.warn(`IndexedDB auth persistence unavailable for ${slot.id}; trying browser persistence.`, indexedDbError);
      try {
        await setPersistence(slot.auth, browserLocalPersistence);
      } catch (localError) {
        console.error(`Could not enable local auth persistence for ${slot.id}.`, localError);
      }
    }

    try {
      if (typeof slot.auth.authStateReady === "function") await slot.auth.authStateReady();
    } catch (error) {
      console.warn(`Auth state restore check failed for ${slot.id}.`, error);
    }
    return slot.auth;
  })();
  return slot.ready;
}

let activeSlot = accountSlots[0];
export let app = activeSlot.app;
export let auth = activeSlot.auth;
export let db = activeSlot.db;
export let googleProvider = activeSlot.googleProvider;

const activeAuthSubscribers = new Set();
const accountSlotSubscribers = new Set();

function setActiveSlotReferences(slot, { persist = true, notify = true } = {}) {
  activeSlot = slot;
  app = slot.app;
  auth = slot.auth;
  db = slot.db;
  googleProvider = slot.googleProvider;

  if (persist) {
    try { localStorage.setItem(ACTIVE_SLOT_KEY, slot.id); } catch {}
  }
  if (notify) {
    activeAuthSubscribers.forEach((subscriber) => subscriber());
    publishAccountSlots();
  }
}

function describeSlot(slot) {
  const user = slot.auth.currentUser;
  if (!user) return { id: slot.id, signedIn: false, active: slot.id === activeSlot.id };
  return {
    id: slot.id,
    signedIn: true,
    active: slot.id === activeSlot.id,
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || user.email?.split("@")[0] || "Player",
    photoURL: user.photoURL || ""
  };
}

function publishAccountSlots() {
  const slots = accountSlots.map(describeSlot);
  accountSlotSubscribers.forEach((subscriber) => {
    try { subscriber(slots); } catch (error) { console.error("Account switcher update failed:", error); }
  });
}

export const authReady = Promise.all(accountSlots.map(prepareSlot)).then(() => {
  let savedActiveId = "";
  try { savedActiveId = localStorage.getItem(ACTIVE_SLOT_KEY) || ""; } catch {}
  const savedSlot = accountSlots.find((slot) => slot.id === savedActiveId && slot.auth.currentUser);
  const firstSignedIn = accountSlots.find((slot) => slot.auth.currentUser);
  const initialSlot = savedSlot || firstSignedIn || accountSlots.find((slot) => slot.id === savedActiveId) || accountSlots[0];
  setActiveSlotReferences(initialSlot, { persist: true, notify: false });

  accountSlots.forEach((slot) => {
    slot.authUnsub = onAuthStateChanged(slot.auth, () => publishAccountSlots());
  });
  publishAccountSlots();
  return activeSlot.auth;
});

export function getActiveAccountSlotId() {
  return activeSlot.id;
}

export async function getAccountSlots() {
  await authReady;
  return accountSlots.map(describeSlot);
}

export function subscribeAccountSlots(callback) {
  if (typeof callback !== "function") return () => {};
  accountSlotSubscribers.add(callback);
  getAccountSlots().then(callback).catch((error) => console.error("Could not read saved accounts:", error));
  return () => accountSlotSubscribers.delete(callback);
}

export async function activateAccountSlot(slotId, { allowEmpty = false } = {}) {
  await authReady;
  const slot = accountSlots.find((entry) => entry.id === String(slotId || ""));
  if (!slot) throw new Error("That saved account slot could not be found.");
  if (!allowEmpty && !slot.auth.currentUser) throw new Error("That account is no longer signed in on this device.");
  setActiveSlotReferences(slot);
  return slot.auth.currentUser;
}

export async function activateFirstEmptyAccountSlot() {
  const slots = await getAccountSlots();
  const empty = slots.find((slot) => !slot.signedIn);
  if (!empty) throw new Error("You already have three accounts saved. Remove one from this device before adding another.");
  await activateAccountSlot(empty.id, { allowEmpty: true });
  return empty.id;
}

export async function removeAccountSlot(slotId) {
  await authReady;
  const slot = accountSlots.find((entry) => entry.id === String(slotId || ""));
  if (!slot) throw new Error("That saved account slot could not be found.");
  if (!slot.auth.currentUser) return getAccountSlots();

  const wasActive = slot.id === activeSlot.id;
  if (wasActive) {
    const next = accountSlots.find((entry) => entry.id !== slot.id && entry.auth.currentUser);
    if (next) setActiveSlotReferences(next);
  }

  await signOut(slot.auth);
  if (wasActive && activeSlot.id === slot.id) publishAccountSlots();
  return getAccountSlots();
}

export async function removeAllAccountSlots() {
  await authReady;
  await Promise.all(accountSlots.map((slot) => slot.auth.currentUser ? signOut(slot.auth) : Promise.resolve()));
  setActiveSlotReferences(accountSlots[0]);
  return getAccountSlots();
}

export function observeActiveAuth(callback) {
  if (typeof callback !== "function") return () => {};
  let cancelled = false;
  let revision = 0;
  let authUnsub = null;

  const attach = () => {
    revision += 1;
    const myRevision = revision;
    if (authUnsub) {
      authUnsub();
      authUnsub = null;
    }
    authReady.then(() => {
      if (cancelled || myRevision !== revision) return;
      authUnsub = onAuthStateChanged(activeSlot.auth, callback);
    }).catch((error) => console.error("Could not watch active account:", error));
  };

  activeAuthSubscribers.add(attach);
  attach();
  return () => {
    cancelled = true;
    activeAuthSubscribers.delete(attach);
    if (authUnsub) authUnsub();
  };
}

// Ask every active-account observer to reattach and receive the current user
// snapshot after an explicit reload has refreshed mutable Auth properties,
// such as emailVerified.
export function notifyActiveAuthObservers() {
  activeAuthSubscribers.forEach((subscriber) => subscriber());
}

// Account switching is scoped to the current tab. The selected slot is stored
// for a refresh, but changing it in another tab must not interrupt an in-flight
// sign-in or write in this tab.
