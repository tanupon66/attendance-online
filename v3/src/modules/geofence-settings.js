import { db } from "../core/firebase.js";
import { safeText, fmtDateTime, todayKey } from "../core/utils.js";

const SETTINGS_COLLECTION = "settings";
const COMPANY_DOC = "company";
const LOG_COLLECTION = "auditLogs";

const defaultSettings = {
  officeName: "สำนักงานใหญ่",
  officeLat: "",
  officeLng: "",
  radiusMeters: 100,
  defaultRequireGeofence: false,
  allowOutsidePendingApproval: true,
  monthlyPaydayEnabled: false,
  monthlyPaydayDay: 30,
  monthlyPaydayNotifyDaysBefore: 1,
  monthlyPaydayTitle: "วันจ่ายเงินพนักงานรายเดือน"
};

let currentSettings = { ...defaultSettings };

export async function renderGeofenceSettingsModule(container, admin) {
  container.innerHTML = ui();
  await loadSettings();
  fillSettingsForm();
  bind(admin);
  await loadEmployeeGeofenceList();
}

function ui() {
  return `
    <div class="module-head">
      <div><h2>ตำแหน่งบริษัท / ขอบเขตรัศมี / วันจ่ายเงิน</h2><p class="muted">กำหนดจุดลงเวลา เลือกพนักงานที่ต้องอยู่ในรัศมี และตั้งวันจ่ายเงินพนักงานรายเดือน</p></div>
      <button id="reloadGeoBtn" class="secondary compact">โหลดใหม่</button>
    </div>

    <section class="card wide">
      <div class="section-title">
        <div><h3>ตั้งค่าพิกัดบริษัท</h3><p class="muted">ใส่ Latitude/Longitude และรัศมีเป็นเมตร</p></div>
        <button id="useCurrentLocationBtn" class="secondary compact">ใช้ตำแหน่งปัจจุบัน</button>
      </div>
      <div class="form-grid tools-form">
        <label>ชื่อสถานที่</label><input id="officeName" placeholder="เช่น สำนักงานใหญ่ / โกดังบางนา">
        <label>Latitude</label><input id="officeLat" type="number" step="0.000001" placeholder="13.756331">
        <label>Longitude</label><input id="officeLng" type="number" step="0.000001" placeholder="100.501762">
        <label>รัศมี (เมตร)</label><input id="radiusMeters" type="number" min="10" step="1" value="100">
        <label>ค่าเริ่มต้นพนักงานใหม่</label><label class="check"><input id="defaultRequireGeofence" type="checkbox"> บังคับให้อยู่ในรัศมี</label>
        <label>นอกพื้นที่</label><label class="check"><input id="allowOutsidePendingApproval" type="checkbox" checked> ให้ลงเวลาได้ แต่ต้องรอแอดมินอนุมัติ</label>
      </div>
      <div class="actions-row">
        <button id="saveGeoSettingsBtn" class="primary">บันทึกตำแหน่งบริษัท</button>
        <a id="officeMapLink" class="secondary compact map-button" target="_blank" rel="noopener">เปิดแผนที่</a>
      </div>
      <p id="geoSettingsMsg" class="message"></p>
      <div id="geoPreview" class="geo-preview"></div>
    </section>

    <section class="card wide payday-settings-card">
      <div class="section-title">
        <div>
          <h3>วันจ่ายเงินพนักงานรายเดือน</h3>
          <p class="muted">ใช้สำหรับแสดงในปฏิทินและแจ้งเตือนบนโทรศัพท์ ถ้าวันจ่ายเงินตรงกับวันทำงาน วันนั้นยังเป็นวันทำงานปกติ</p>
        </div>
      </div>
      <div class="form-grid tools-form">
        <label>เปิดใช้วันจ่ายเงิน</label><label class="check"><input id="monthlyPaydayEnabled" type="checkbox"> เปิดแจ้งเตือนวันจ่ายเงินรายเดือน</label>
        <label>จ่ายทุกวันที่</label><input id="monthlyPaydayDay" type="number" min="1" max="31" step="1" placeholder="เช่น 30">
        <label>หัวข้อในปฏิทิน</label><input id="monthlyPaydayTitle" maxlength="80" placeholder="วันจ่ายเงินพนักงานรายเดือน">
        <label>แจ้งเตือนล่วงหน้า</label><input id="monthlyPaydayNotifyDaysBefore" type="number" min="0" max="7" step="1" placeholder="เช่น 1">
      </div>
      <div class="actions-row">
        <button id="savePaydaySettingsBtn" class="primary">บันทึกวันจ่ายเงิน</button>
        <button id="testPaydayNotiBtn" class="secondary compact">ทดสอบแจ้งเตือนบนเครื่องนี้</button>
      </div>
      <p id="paydaySettingsMsg" class="message"></p>
      <div id="paydayPreview" class="geo-preview"></div>
    </section>

    <section class="card wide">
      <div class="section-title">
        <div><h3>กำหนดรายพนักงาน</h3><p class="muted">เปิด/ปิดว่าพนักงานแต่ละคนต้อง clock in/out ในรัศมีหรือไม่</p></div>
        <button id="reloadGeoEmployeesBtn" class="secondary compact">โหลดพนักงาน</button>
      </div>
      <div class="toolbar"><input id="geoEmployeeSearch" placeholder="ค้นหารหัส ชื่อ แผนก..."></div>
      <div id="geoEmployeeList" class="list"></div>
    </section>`;
}

function bind(admin) {
  document.getElementById("reloadGeoBtn").onclick = () => renderGeofenceSettingsModule(document.getElementById("moduleRoot"), admin);
  document.getElementById("reloadGeoEmployeesBtn").onclick = loadEmployeeGeofenceList;
  document.getElementById("geoEmployeeSearch").oninput = loadEmployeeGeofenceList;
  document.getElementById("saveGeoSettingsBtn").onclick = () => saveSettings(admin).catch(err => setMsg("geoSettingsMsg", "ผิดพลาด: " + err.message));
  document.getElementById("useCurrentLocationBtn").onclick = () => useCurrentLocation().catch(err => setMsg("geoSettingsMsg", "ดึงตำแหน่งไม่ได้: " + err.message));
  document.getElementById("savePaydaySettingsBtn").onclick = () => savePaydaySettings(admin).catch(err => setMsg("paydaySettingsMsg", "ผิดพลาด: " + err.message));
  document.getElementById("testPaydayNotiBtn").onclick = testPaydayNotification;
  ["officeLat", "officeLng", "radiusMeters", "officeName"].forEach(id => document.getElementById(id).oninput = updatePreview);
  ["monthlyPaydayEnabled", "monthlyPaydayDay", "monthlyPaydayTitle", "monthlyPaydayNotifyDaysBefore"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.oninput = updatePaydayPreview;
    if (el) el.onchange = updatePaydayPreview;
  });
}

async function loadSettings() {
  const doc = await db.collection(SETTINGS_COLLECTION).doc(COMPANY_DOC).get();
  currentSettings = doc.exists ? { ...defaultSettings, ...doc.data() } : { ...defaultSettings };
}

function fillSettingsForm() {
  setVal("officeName", currentSettings.officeName || "");
  setVal("officeLat", currentSettings.officeLat ?? "");
  setVal("officeLng", currentSettings.officeLng ?? "");
  setVal("radiusMeters", Number(currentSettings.radiusMeters || 100));
  document.getElementById("defaultRequireGeofence").checked = currentSettings.defaultRequireGeofence === true;
  document.getElementById("allowOutsidePendingApproval").checked = currentSettings.allowOutsidePendingApproval !== false;
  document.getElementById("monthlyPaydayEnabled").checked = currentSettings.monthlyPaydayEnabled === true;
  setVal("monthlyPaydayDay", Number(currentSettings.monthlyPaydayDay || 30));
  setVal("monthlyPaydayTitle", currentSettings.monthlyPaydayTitle || "วันจ่ายเงินพนักงานรายเดือน");
  setVal("monthlyPaydayNotifyDaysBefore", Number(currentSettings.monthlyPaydayNotifyDaysBefore ?? 1));
  updatePreview();
  updatePaydayPreview();
}

async function saveSettings(admin) {
  const officeLat = Number(val("officeLat"));
  const officeLng = Number(val("officeLng"));
  const radiusMeters = Number(val("radiusMeters"));
  if (!Number.isFinite(officeLat) || officeLat < -90 || officeLat > 90) throw new Error("Latitude ไม่ถูกต้อง");
  if (!Number.isFinite(officeLng) || officeLng < -180 || officeLng > 180) throw new Error("Longitude ไม่ถูกต้อง");
  if (!Number.isFinite(radiusMeters) || radiusMeters < 10) throw new Error("รัศมีต้องมากกว่า 10 เมตร");

  const data = {
    ...currentSettings,
    officeName: val("officeName") || "สำนักงานใหญ่",
    officeLat,
    officeLng,
    radiusMeters,
    defaultRequireGeofence: document.getElementById("defaultRequireGeofence").checked,
    allowOutsidePendingApproval: document.getElementById("allowOutsidePendingApproval").checked,
    geofenceMode: "approval",
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: admin.employeeCode || admin.id || "admin"
  };
  await db.collection(SETTINGS_COLLECTION).doc(COMPANY_DOC).set(data, { merge: true });
  currentSettings = { ...data };
  await writeLog("GEOFENCE_SETTINGS_UPDATE", admin, {
    officeName: data.officeName,
    officeLat: data.officeLat,
    officeLng: data.officeLng,
    radiusMeters: data.radiusMeters,
    defaultRequireGeofence: data.defaultRequireGeofence
  });
  setMsg("geoSettingsMsg", "บันทึกตำแหน่งบริษัทสำเร็จ");
  updatePreview();
}

async function useCurrentLocation() {
  if (!navigator.geolocation) throw new Error("อุปกรณ์นี้ไม่รองรับ GPS");
  setMsg("geoSettingsMsg", "กำลังดึงตำแหน่งปัจจุบัน...");
  const pos = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }));
  setVal("officeLat", pos.coords.latitude.toFixed(6));
  setVal("officeLng", pos.coords.longitude.toFixed(6));
  setMsg("geoSettingsMsg", `ดึงตำแหน่งแล้ว ±${Math.round(pos.coords.accuracy)}m กรุณากดบันทึก`);
  updatePreview();
}


async function savePaydaySettings(admin) {
  const day = Number(val("monthlyPaydayDay"));
  const notifyDays = Number(val("monthlyPaydayNotifyDaysBefore"));
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new Error("วันที่จ่ายเงินต้องอยู่ระหว่าง 1-31");
  if (!Number.isInteger(notifyDays) || notifyDays < 0 || notifyDays > 7) throw new Error("แจ้งเตือนล่วงหน้าได้ 0-7 วัน");
  const data = {
    monthlyPaydayEnabled: document.getElementById("monthlyPaydayEnabled").checked,
    monthlyPaydayDay: day,
    monthlyPaydayTitle: val("monthlyPaydayTitle") || "วันจ่ายเงินพนักงานรายเดือน",
    monthlyPaydayNotifyDaysBefore: notifyDays,
    paydayUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    paydayUpdatedBy: admin.employeeCode || admin.id || "admin"
  };
  await db.collection(SETTINGS_COLLECTION).doc(COMPANY_DOC).set(data, { merge: true });
  currentSettings = { ...currentSettings, ...data };
  await writeLog("MONTHLY_PAYDAY_SETTINGS_UPDATE", admin, data);
  setMsg("paydaySettingsMsg", "บันทึกวันจ่ายเงินแล้ว ปฏิทินจะอัปเดตตามเดือนที่เลือก");
  updatePaydayPreview();
}

function updatePaydayPreview() {
  const preview = document.getElementById("paydayPreview");
  if (!preview) return;
  const enabled = document.getElementById("monthlyPaydayEnabled")?.checked;
  const day = Number(val("monthlyPaydayDay") || 30);
  const title = val("monthlyPaydayTitle") || "วันจ่ายเงินพนักงานรายเดือน";
  const notifyDays = Number(val("monthlyPaydayNotifyDaysBefore") || 0);
  const now = new Date();
  const payDate = computePaydayDate(now.getFullYear(), now.getMonth(), day);
  const dateText = `${payDate.getFullYear()}-${String(payDate.getMonth()+1).padStart(2,"0")}-${String(payDate.getDate()).padStart(2,"0")}`;
  preview.innerHTML = `<div class="detail-row payday-preview-box"><b>${safeText(enabled ? title : "ยังไม่เปิดใช้วันจ่ายเงิน")}</b><br>เดือนนี้จะแสดงในปฏิทินวันที่: ${safeText(dateText)}<br>แจ้งเตือนล่วงหน้า: ${safeText(notifyDays)} วัน<br><span class="muted">หมายเหตุ: ถ้าตรงกับวันทำงาน ระบบจะยังนับเป็นวันทำงานปกติ แต่เพิ่มป้าย/แจ้งเตือนวันจ่ายเงินเท่านั้น</span></div>`;
}

function computePaydayDate(year, monthIndex, paydayDay) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(Math.max(1, Number(paydayDay || 30)), lastDay));
}

async function testPaydayNotification() {
  if (!("Notification" in window)) return setMsg("paydaySettingsMsg", "เครื่องนี้ไม่รองรับ Notification");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return setMsg("paydaySettingsMsg", "ยังไม่ได้อนุญาตแจ้งเตือนบนเครื่องนี้");
  const title = val("monthlyPaydayTitle") || "วันจ่ายเงินพนักงานรายเดือน";
  new Notification(title, { body: "ทดสอบแจ้งเตือนวันจ่ายเงินจาก Attendance Online", icon: "./icons/icon-192.png" });
  setMsg("paydaySettingsMsg", "ส่งแจ้งเตือนทดสอบแล้ว ถ้าไม่เห็นให้ตรวจสิทธิ์แจ้งเตือนของเบราว์เซอร์/แอป");
}

async function loadEmployeeGeofenceList() {
  const list = document.getElementById("geoEmployeeList");
  const kw = (document.getElementById("geoEmployeeSearch")?.value || "").toLowerCase();
  list.innerHTML = `<div class="empty-state"><p>กำลังโหลด...</p></div>`;
  try {
    const snap = await db.collection("employees").get();
    let rows = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.employeeCode || "").localeCompare(String(b.employeeCode || "")));
    if (kw) rows = rows.filter(e => [e.employeeCode, e.fullName, e.department, e.position].some(v => String(v || "").toLowerCase().includes(kw)));
    list.innerHTML = rows.length ? rows.map(employeeGeoCard).join("") : `<div class="empty-state"><p>ไม่พบพนักงาน</p></div>`;
    rows.forEach(e => {
      const toggle = document.getElementById(`geo-toggle-${e.id}`);
      if (toggle) toggle.onchange = () => updateEmployeeGeofence(e, toggle.checked);
    });
  } catch (err) {
    list.innerHTML = `<div class="empty-state error-text"><p>${safeText(err.message)}</p></div>`;
  }
}

function employeeGeoCard(e) {
  const required = e.requireGeofence === true;
  return `<article class="attendance-card tool-card geo-employee-card">
    <div class="tool-icon">GPS</div>
    <div>
      <h3>${safeText(e.employeeCode)} • ${safeText(e.fullName)}</h3>
      <p>${safeText(e.department || "-")} • ${safeText(e.position || "-")}</p>
      <div class="geo-toggle-row">
        <span class="badge ${required ? "good" : "info"}">${required ? "บังคับในรัศมี" : "ไม่บังคับรัศมี"}</span>
        <label class="switch-label"><input id="geo-toggle-${e.id}" type="checkbox" ${required ? "checked" : ""}> ต้องลงเวลาในรัศมี</label>
      </div>
    </div>
  </article>`;
}

async function updateEmployeeGeofence(employee, required) {
  await db.collection("employees").doc(employee.id).update({
    requireGeofence: required,
    geofenceUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  await loadEmployeeGeofenceList();
}

function updatePreview() {
  const lat = val("officeLat"), lng = val("officeLng"), radius = val("radiusMeters") || "100", name = val("officeName") || "สำนักงานใหญ่";
  const link = document.getElementById("officeMapLink");
  const preview = document.getElementById("geoPreview");
  if (lat && lng) {
    link.href = `https://maps.google.com/?q=${encodeURIComponent(lat)},${encodeURIComponent(lng)}`;
    link.classList.remove("hidden");
    preview.innerHTML = `<div class="detail-row"><b>${safeText(name)}</b><br>Lat: ${safeText(lat)} / Lng: ${safeText(lng)}<br>รัศมีที่อนุญาต: ${safeText(radius)} เมตร</div>`;
  } else {
    link.href = "#";
    link.classList.add("hidden");
    preview.innerHTML = `<div class="empty-state"><p>ยังไม่ได้ตั้งค่าพิกัดบริษัท</p></div>`;
  }
}

async function writeLog(action, actor, detail = {}) {
  const now = new Date();
  await db.collection(LOG_COLLECTION).add({
    action,
    actorId: actor.id || "",
    actorCode: actor.employeeCode || "",
    actorName: actor.fullName || "",
    detail,
    dateKey: todayKey(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    clientTime: now.toISOString(),
    clientTimeText: fmtDateTime(now),
    userAgent: navigator.userAgent
  });
}

function val(id) { return (document.getElementById(id)?.value || "").trim(); }
function setVal(id, value) { const el = document.getElementById(id); if (el) el.value = value ?? ""; }
function setMsg(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
