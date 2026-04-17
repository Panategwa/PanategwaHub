import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
  deleteUser,
  reauthenticateWithPopup,
  reauthenticateWithCredential,
  EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCatgiEb0Z-y34QjFi6O2xMJhFnIdfA34E",
  authDomain: "panategwa-hub.firebaseapp.com",
  projectId: "panategwa-hub",
    storageBucket: "panategwa-hub.appspot.com",
  messagingSenderId: "20208045595",
  appId: "1:20208045595:web:9f3718d8df5b7f449d32be",
  measurementId: "G-48SXW4KW45"
};

// INIT APP
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

/* =========================
   EXPORTED GLOBAL API
========================= */

window.panategwaAuth = auth;

window.panategwaAuthActions = {
  onAuthStateChanged: (cb) => onAuthStateChanged(auth, cb),

  async loginWithGoogle() {
    return signInWithPopup(auth, provider);
  },

  async logout() {
    return signOut(auth);
  },

  async createEmailAccount(email, password, username) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);

    if (username) {
      await updateProfile(cred.user, {
        displayName: username
      });
    }

    await sendEmailVerification(cred.user);
    return cred.user;
  },

  async loginWithEmail(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  },

  async saveUsername(username) {
    if (!auth.currentUser) throw new Error("Not logged in");

    return updateProfile(auth.currentUser, {
      displayName: username
    });
  },

  async resendVerificationEmail() {
    if (!auth.currentUser) throw new Error("Not logged in");
    if (auth.currentUser.emailVerified) return false;

    return sendEmailVerification(auth.currentUser);
  },

  async deleteAccount() {
    if (!auth.currentUser) throw new Error("Not logged in");
    return deleteUser(auth.currentUser);
  },

  async reauthWithGoogle() {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  },

  async reauthWithEmail(email, password) {
    const credential = EmailAuthProvider.credential(email, password);
    return reauthenticateWithCredential(auth.currentUser, credential);
  }
};