/* global firebase */

// Make sure firebase scripts are loaded BEFORE this file in HTML

const provider = new firebase.auth.GoogleAuthProvider();

window.loginWithGoogle = async function () {
  const result = await firebase.auth().signInWithPopup(provider);
  console.log("Logged in:", result.user);
};

window.logout = async function () {
  await firebase.auth().signOut();
};

firebase.auth().onAuthStateChanged((user) => {
  const box = document.getElementById("user-info");

  if (!box) return;

  if (!user) {
    box.innerHTML = `<p>Status: Not logged in</p>`;
    return;
  }

  box.innerHTML = `
    <img src="${user.photoURL}" width="60" style="border-radius:50%">
    <p><b>${user.displayName}</b></p>
    <p>${user.email}</p>
  `;
});