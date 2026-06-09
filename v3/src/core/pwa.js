
import { db } from "./firebase.js";

let deferredPrompt = null;

export function initPwa(currentEmployee = null) {
  registerServiceWorker();
  setupInstallPrompt();
  setupNetworkStatus();
  setupAutoUpdateNotice();
  setupBackgroundSync();
  exposePushPermission(currentEmployee);
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
    navigator.serviceWorker.addEventListener("message", event => {
      if (event.data?.type === "APP_UPDATED") showUpdateBanner(event.data.version);
      if (event.data?.type === "BACKGROUND_SYNC_REQUEST") flushLocalQueue();
    });
    setInterval(() => reg.update(), 60 * 60 * 1000);
  } catch (err) {
    console.warn("Service worker register failed", err);
  }
}

function setupInstallPrompt() {
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredPrompt = event;
    showInstallBanner();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    localStorage.setItem("attendance_pwa_installed", "1");
    const box = document.getElementById("pwaInstallBox");
    if (box) box.remove();
  });
}

function showInstallBanner() {
  if (localStorage.getItem("attendance_pwa_install_dismissed") === "1") return;
  if (document.getElementById("pwaInstallBox")) return;

  const box = document.createElement("div");
  box.id = "pwaInstallBox";
  box.className = "pwa-install-box";
  box.innerHTML = `
    <div>
      <b>ติดตั้ง Attendance เป็นแอป</b>
      <span>เปิดได้จากหน้าจอมือถือ ใช้งานเร็วขึ้น และรองรับ Offline</span>
    </div>
    <div class="pwa-actions">
      <button id="pwaInstallBtn" class="primary compact">ติดตั้ง</button>
      <button id="pwaDismissBtn" class="secondary compact">ปิด</button>
    </div>
  `;
  document.body.appendChild(box);

  document.getElementById("pwaInstallBtn").onclick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => null);
    deferredPrompt = null;
    box.remove();
  };

  document.getElementById("pwaDismissBtn").onclick = () => {
    localStorage.setItem("attendance_pwa_install_dismissed", "1");
    box.remove();
  };
}

function setupNetworkStatus() {
  const update = () => {
    document.body.classList.toggle("is-offline", !navigator.onLine);
    let bar = document.getElementById("offlineBar");
    if (!navigator.onLine) {
      if (!bar) {
        bar = document.createElement("div");
        bar.id = "offlineBar";
        bar.className = "offline-bar";
        bar.textContent = "ออฟไลน์: ข้อมูลใหม่จะบันทึกไม่ได้จนกว่าจะมีอินเทอร์เน็ต";
        document.body.appendChild(bar);
      }
    } else if (bar) {
      bar.remove();
      flushLocalQueue();
    }
  };
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
}

function setupAutoUpdateNotice() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    showUpdateBanner("new");
  });
}

function showUpdateBanner(version) {
  if (document.getElementById("updateBanner")) return;
  const box = document.createElement("div");
  box.id = "updateBanner";
  box.className = "update-banner";
  box.innerHTML = `
    <span>มีเวอร์ชันใหม่พร้อมใช้งาน ${version ? `(${version})` : ""}</span>
    <button id="reloadUpdateBtn" class="primary compact">รีโหลด</button>
  `;
  document.body.appendChild(box);
  document.getElementById("reloadUpdateBtn").onclick = () => location.reload();
}

function setupBackgroundSync() {
  window.queueAttendanceTask = async function(task) {
    const queue = JSON.parse(localStorage.getItem("attendance_sync_queue") || "[]");
    queue.push({ ...task, queuedAt: new Date().toISOString() });
    localStorage.setItem("attendance_sync_queue", JSON.stringify(queue));
    const reg = await navigator.serviceWorker?.ready.catch(() => null);
    if (reg?.sync) await reg.sync.register("attendance-background-sync").catch(console.warn);
  };
}

async function flushLocalQueue() {
  const queue = JSON.parse(localStorage.getItem("attendance_sync_queue") || "[]");
  if (!queue.length || !navigator.onLine) return;
  const remain = [];
  for (const item of queue) {
    try {
      await db.collection(item.collection || "syncQueue").add({
        ...item.data,
        syncedFromQueue: true,
        syncedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (err) {
      remain.push(item);
    }
  }
  localStorage.setItem("attendance_sync_queue", JSON.stringify(remain));
}

function exposePushPermission(currentEmployee) {
  window.requestAttendancePush = async function() {
    if (!("Notification" in window)) return alert("เครื่องนี้ไม่รองรับ Notification");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return alert("ยังไม่ได้อนุญาตแจ้งเตือน");

    new Notification("Attendance Online", {
      body: "เปิดแจ้งเตือนบนเครื่องนี้แล้ว",
      icon: "./icons/icon-192.png"
    });

    if (currentEmployee?.id) {
      await db.collection("notificationDevices").add({
        employeeId: currentEmployee.id,
        employeeCode: currentEmployee.employeeCode || "",
        permission,
        userAgent: navigator.userAgent,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch(console.warn);
    }
  };
}
