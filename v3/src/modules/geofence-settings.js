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
  allowOutsidePendingApproval: true
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
      <div><h2>ตำแหน่งบริษัท / ขอบเขตรัศมี</h2><p class="muted">กำหนดจุดลงเวลาและเลือกพนักงานที่ต้องอยู่ในรัศมี</p></div>
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
  ["officeLat", "officeLng", "radiusMeters", "officeName"].forEach(id => document.getElementById(id).oninput = updatePreview);
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
  updatePreview();
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
