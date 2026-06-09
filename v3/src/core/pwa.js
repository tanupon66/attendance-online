
import { db } from "./firebase.js";
import { translateText } from "./i18n.js";

let deferredPrompt = null;

export function initPwa(currentEmployee = null) {
  registerServiceWorker();
  setupInstallPrompt();
  setupNetworkStatus();
  setupAutoUpdateNotice();
  setupBackgroundSync();
  exposePushPermission(currentEmployee);
  setupPaydayReminder(currentEmployee);
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
      <b>${translateText("ติดตั้ง Attendance เป็นแอป")}</b>
      <span>${translateText("เปิดได้จากหน้าจอมือถือ ใช้งานเร็วขึ้น และรองรับ Offline")}</span>
    </div>
    <div class="pwa-actions">
      <button id="pwaInstallBtn" class="primary compact">${translateText("ติดตั้ง")}</button>
      <button id="pwaDismissBtn" class="secondary compact">${translateText("ปิด")}</button>
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
        bar.textContent = translateText("ออฟไลน์: ข้อมูลใหม่จะบันทึกไม่ได้จนกว่าจะมีอินเทอร์เน็ต");
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
    <span>${translateText("มีเวอร์ชันใหม่พร้อมใช้งาน")} ${version ? `(${version})` : ""}</span>
    <button id="reloadUpdateBtn" class="primary compact">${translateText("รีโหลด")}</button>
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
    if (!("Notification" in window)) return alert(translateText("เครื่องนี้ไม่รองรับ Notification"));
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return alert(translateText("ยังไม่ได้อนุญาตแจ้งเตือนบนเครื่องนี้"));

    new Notification("Attendance Online", {
      body: translateText("เปิดแจ้งเตือนบนเครื่องนี้แล้ว"),
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


async function setupPaydayReminder(currentEmployee) {
  if (!currentEmployee?.id) return;
  // แจ้งเฉพาะพนักงานรายเดือนและแอดมินที่เปิดระบบไว้ เพื่อไม่ให้รบกวนพนักงานรายวัน/รายชั่วโมง
  const payType = currentEmployee.payType || "";
  if (currentEmployee.role !== "admin" && payType !== "monthly") return;

  try {
    const doc = await db.collection("settings").doc("company").get();
    if (!doc.exists) return;
    const settings = doc.data() || {};
    if (settings.monthlyPaydayEnabled !== true) return;

    const now = new Date();
    const payday = computePaydayDate(now.getFullYear(), now.getMonth(), Number(settings.monthlyPaydayDay || 30));
    const daysBefore = Math.min(Math.max(Number(settings.monthlyPaydayNotifyDaysBefore ?? 1), 0), 7);
    const start = new Date(payday);
    start.setDate(start.getDate() - daysBefore);
    start.setHours(0, 0, 0, 0);
    const end = new Date(payday);
    end.setHours(23, 59, 59, 999);
    if (now < start || now > end) return;

    const dateKey = toDateKey(payday);
    const today = toDateKey(now);
    const storageKey = `attendance_payday_noti_${currentEmployee.id}_${dateKey}_${today}`;
    if (localStorage.getItem(storageKey) === "1") return;

    const title = translateText(settings.monthlyPaydayTitle || "วันจ่ายเงินพนักงานรายเดือน");
    const body = today === dateKey
      ? `${translateText("วันนี้เป็น")}${title}`
      : `${title} วันที่ ${dateKey}`;

    await db.collection("notifications").add({
      employeeId: currentEmployee.id,
      employeeCode: currentEmployee.employeeCode || "",
      title,
      message: body,
      type: "monthly_payday",
      read: false,
      dateKey: today,
      paydayDateKey: dateKey,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(console.warn);

    if ("Notification" in window && Notification.permission === "granted") {
      const reg = await navigator.serviceWorker?.ready.catch(() => null);
      if (reg?.showNotification) {
        await reg.showNotification(title, {
          body,
          icon: "./icons/icon-192.png",
          badge: "./icons/icon-72.png",
          vibrate: [100, 50, 100],
          data: { url: "./?route=notifications" }
        });
      } else {
        new Notification(title, { body, icon: "./icons/icon-192.png" });
      }
    }
    localStorage.setItem(storageKey, "1");
  } catch (err) {
    console.warn("payday reminder skipped", err);
  }
}

function computePaydayDate(year, monthIndex, paydayDay) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(Math.max(1, Number(paydayDay || 30)), lastDay));
}

function toDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
