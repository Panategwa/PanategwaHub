import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  setPersistence,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  GoogleAuthProvider
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({ prompt: "select_account" });

auth.useDeviceLanguage();

const authReady = (async () => {
  try {
    await setPersistence(auth, indexedDBLocalPersistence);
  } catch (indexedDbError) {
    console.warn("IndexedDB auth persistence unavailable, falling back to browserLocalPersistence.", indexedDbError);
    try {
      await setPersistence(auth, browserLocalPersistence);
    } catch (localError) {
      console.error("Could not enable local auth persistence.", localError);
    }
  }

  try {
    if (typeof auth.authStateReady === "function") {
      await auth.authStateReady();
    }
  } catch (error) {
    console.warn("Auth state restore check failed.", error);
  }

  return auth;
})();

export { app, auth, authReady, db, googleProvider };
