export let app = null;
export let auth = null;
export let db = null;
export let currentFirebaseUser = null;

export async function initFirebase() {
  if (!window.firebaseConfig || !window.firebaseConfig.apiKey) {
    throw new Error("ยังไม่ได้ตั้งค่า firebase-config.js");
  }

  app = firebase.initializeApp(window.firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();

  await auth.signInAnonymously();
  currentFirebaseUser = auth.currentUser;

  return { app, auth, db, currentFirebaseUser };
}
