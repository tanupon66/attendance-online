
importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js");
importScripts("./firebase-config.js");

try {
  firebase.initializeApp(self.firebaseConfig || firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage(payload => {
    const title = payload.notification?.title || "SHA Attendance";
    const options = {
      body: payload.notification?.body || "มีแจ้งเตือนใหม่",
      icon: "./icons/icon-192.png",
      badge: "./icons/icon-72.png",
      data: payload.data || {}
    };
    self.registration.showNotification(title, options);
  });
} catch (err) {
  console.warn("Firebase Messaging SW inactive:", err);
}
