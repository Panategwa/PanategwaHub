import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

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

auth.useDeviceLanguage();
setPersistence(auth, browserLocalPersistence).catch(console.error);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account"
});

export { auth, googleProvider };