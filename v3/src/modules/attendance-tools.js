import { db } from "../core/firebase.js";
import { safeText, todayKey, fmtDateTime } from "../core/utils.js";

const OT_COLLECTION = "otRequests";
const LOG_COLLECTION = "auditLogs";

export async function renderAttendanceToolsModule(container, employee, mode = "employee") {
  container.innerHTML = mode === "admin" ? adminUi() : employeeUi();
  if (mode === "admin") await bindAdmin(container, employee);
  else await bindEmployee(container, employee);
}

function employeeUi() {
  return `
    <div class="module-head"><div><h2>ขออนุญาต OT</h2><p class="muted">ส่งคำขอทำงานล่วงเวลาให้แอดมินอนุมัติ</p></div><button id="reloadToolsBtn" class="secondary compact">โหลดใหม่</button></div>
    <section class="card wide">
      <h3>ฟอร์มขอ OT</h3>
      <div class="form-grid tools-form">
        <label>วันที่</label><input id="otDate" type="date">
        <label>เวลาเริ่ม</label><input id="otStart" type="time" value="17:00">
        <label>เวลาสิ้นสุด</label><input id="otEnd" type="time" value="19:00">
        <label>เหตุผล</label><input id="otReason" placeholder="เช่น ปิดงานด่วน / รองานลูกค้า">
      </div>
      <div class="actions-row"><button id="submitOtBtn" class="primary">ส่งคำขอ OT</button></div>
      <p id="toolsMsg" class="message"></p>
    </section>
    <section class="card wide"><h3>คำขอ OT ของฉัน</h3><div id="myOtList" class="list"></div></section>`;
}

function adminUi() {
  return `
    <div class="module-head"><div><h2>เครื่องมือ Attendance</h2><p class="muted">อนุมัติ OT • เพิ่มเวลาเข้าออกงาน • ตรวจ log • เคลียร์ข้อมูล</p></div><button id="reloadToolsBtn" class="secondary compact">โหลดใหม่</button></div>
    <div class="tools-tabs">
      <button class="tool-tab active" data-tab="otPanel">ขอ OT</button>
      <button class="tool-tab" data-tab="manualPanel">เพิ่มเวลา</button>
      <button class="tool-tab" data-tab="logsPanel">Log</button>
      <button class="tool-tab danger-tab" data-tab="clearPanel">Clear Data</button>
    </div>
    <section id="otPanel" class="tool-panel card wide"><div class="section-title"><div><h3>รายการขอ OT</h3><p class="muted">อนุมัติหรือปฏิเสธคำขอของพนักงาน</p></div><button id="loadOtBtn" class="secondary compact">โหลด</button></div><div id="otAdminList" class="list"></div></section>
    <section id="manualPanel" class="tool-panel card wide hidden">
      <h3>เพิ่มเวลาเข้า/ออกงานโดยแอดมิน</h3>
      <div class="form-grid tools-form">
        <label>พนักงาน</label><select id="manualEmployee"></select>
        <label>ประเภท</label><select id="manualType"><option value="IN">เข้างาน</option><option value="OUT">ออกงาน</option></select>
        <label>วันที่</label><input id="manualDate" type="date">
        <label>เวลา</label><input id="manualTime" type="time">
        <label>หมายเหตุ</label><input id="manualNote" placeholder="เช่น ลืมลงเวลา / เครื่องมีปัญหา">
      </div>
      <div class="actions-row"><button id="saveManualBtn" class="primary">บันทึกเวลา</button></div><p id="manualMsg" class="message"></p>
    </section>
    <section id="logsPanel" class="tool-panel card wide hidden">
      <div class="section-title"><div><h3>Audit Log</h3><p class="muted">ประวัติการทำรายการสำคัญในระบบ</p></div><button id="loadLogsBtn" class="secondary compact">โหลด</button></div>
      <div class="filters"><input id="logStart" type="date"><input id="logEnd" type="date"><select id="logAction"><option value="">ทุก action</option><option value="OT_APPROVE">OT_APPROVE</option><option value="OT_REJECT">OT_REJECT</option><option value="MANUAL_ATTENDANCE_ADD">MANUAL_ATTENDANCE_ADD</option><option value="CLEAR_DATA">CLEAR_DATA</option></select></div>
      <div id="logList" class="list"></div>
    </section>
    <section id="clearPanel" class="tool-panel card wide hidden danger-zone">
      <h3>เคลียร์ข้อมูล</h3><p class="muted">ลบข้อมูลแบบเลือกช่วงวันที่ ใช้เฉพาะตอนทดสอบระบบหรือเริ่มข้อมูลใหม่</p>
      <div class="form-grid tools-form">
        <label>ชุดข้อมูล</label><select id="clearCollection"><option value="attendance">attendance - รายการลงเวลา</option><option value="otRequests">otRequests - คำขอ OT</option><option value="auditLogs">auditLogs - audit log</option></select>
        <label>วันที่เริ่ม</label><input id="clearStart" type="date">
        <label>วันที่สิ้นสุด</label><input id="clearEnd" type="date">
        <label>ยืนยัน</label><input id="clearConfirm" placeholder="พิมพ์ CLEAR เพื่อยืนยัน">
      </div>
      <div class="actions-row"><button id="clearDataBtn" class="danger">ลบข้อมูลตามช่วงวันที่</button></div><p id="clearMsg" class="message"></p>
    </section>`;
}

async function bindEmployee(container, employee) {
  const date = document.getElementById("otDate");
  date.value = todayKey();
  document.getElementById("reloadToolsBtn").onclick = () => renderAttendanceToolsModule(container, employee, "employee");
  document.getElementById("submitOtBtn").onclick = () => submitOt(employee).catch(showEmployeeError);
  await loadMyOt(employee);
}

async function bindAdmin(container, employee) {
  ["manualDate", "logStart", "logEnd", "clearStart", "clearEnd"].forEach(id => { const el = document.getElementById(id); if (el) el.value = todayKey(); });
  document.getElementById("manualTime").value = new Date().toTimeString().slice(0, 5);
  document.getElementById("reloadToolsBtn").onclick = () => renderAttendanceToolsModule(container, employee, "admin");
  document.querySelectorAll(".tool-tab").forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab));
  document.getElementById("loadOtBtn").onclick = loadOtAdmin;
  document.getElementById("loadLogsBtn").onclick = loadLogs;
  document.getElementById("saveManualBtn").onclick = () => saveManualAttendance(employee).catch(err => setMsg("manualMsg", err.message));
  document.getElementById("clearDataBtn").onclick = () => clearData(employee).catch(err => setMsg("clearMsg", err.message));
  await loadEmployeeOptions();
  await loadOtAdmin();
}

function switchTab(tabId) {
  document.querySelectorAll(".tool-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tabId));
  document.querySelectorAll(".tool-panel").forEach(p => p.classList.toggle("hidden", p.id !== tabId));
}

async function submitOt(employee) {
  const dateKey = val("otDate"), startTime = val("otStart"), endTime = val("otEnd"), reason = val("otReason");
  if (!dateKey || !startTime || !endTime || !reason) throw new Error("กรุณากรอกข้อมูลให้ครบ");
  if (endTime <= startTime) throw new Error("เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม");
  await db.collection(OT_COLLECTION).add({
    employeeId: employee.id,
    employeeCode: employee.employeeCode || "",
    fullName: employee.fullName || "",
    department: employee.department || "",
    dateKey, startTime, endTime, reason,
    status: "pending",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    requestedAt: new Date().toISOString()
  });
  await writeLog("OT_REQUEST_CREATE", employee, { dateKey, startTime, endTime });
  setMsg("toolsMsg", "ส่งคำขอ OT สำเร็จ");
  document.getElementById("otReason").value = "";
  await loadMyOt(employee);
}

async function loadMyOt(employee) {
  const list = document.getElementById("myOtList");
  list.innerHTML = `<div class="empty-state"><p>กำลังโหลด...</p></div>`;
  try {
    const snap = await db.collection(OT_COLLECTION).where("employeeId", "==", employee.id).get();
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(sortByCreatedDesc);
    list.innerHTML = rows.length ? rows.map(otCard).join("") : `<div class="empty-state"><p>ยังไม่มีคำขอ OT</p></div>`;
  } catch (err) { list.innerHTML = `<div class="empty-state error-text"><p>${safeText(err.message)}</p></div>`; }
}

async function loadOtAdmin() {
  const list = document.getElementById("otAdminList");
  list.innerHTML = `<div class="empty-state"><p>กำลังโหลด...</p></div>`;
  try {
    const snap = await db.collection(OT_COLLECTION).get();
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(sortByCreatedDesc);
    list.innerHTML = rows.length ? rows.map(otCardAdmin).join("") : `<div class="empty-state"><p>ไม่พบคำขอ OT</p></div>`;
    rows.forEach(r => {
      const approve = document.getElementById(`approve-${r.id}`);
      const reject = document.getElementById(`reject-${r.id}`);
      if (approve) approve.onclick = () => reviewOt(r, "approved");
      if (reject) reject.onclick = () => reviewOt(r, "rejected");
    });
  } catch (err) { list.innerHTML = `<div class="empty-state error-text"><p>${safeText(err.message)}</p></div>`; }
}

async function reviewOt(row, status) {
  const admin = getCurrentAdmin();
  await db.collection(OT_COLLECTION).doc(row.id).update({
    status,
    reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
    reviewedBy: admin.employeeCode || admin.id || "admin",
    reviewedByName: admin.fullName || "ผู้ดูแลระบบ"
  });
  await writeLog(status === "approved" ? "OT_APPROVE" : "OT_REJECT", admin, { otRequestId: row.id, employeeCode: row.employeeCode, dateKey: row.dateKey });
  await loadOtAdmin();
}

let currentAdminCache = null;
function getCurrentAdmin() { return currentAdminCache || JSON.parse(localStorage.getItem("attendance_v3_employee") || "{}"); }

async function loadEmployeeOptions() {
  const select = document.getElementById("manualEmployee");
  select.innerHTML = `<option value="">กำลังโหลด...</option>`;
  const snap = await db.collection("employees").get();
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.active !== false).sort((a,b)=>String(a.employeeCode||"").localeCompare(String(b.employeeCode||"")));
  select.innerHTML = `<option value="">เลือกพนักงาน</option>` + rows.map(e => `<option value="${safeText(e.id)}" data-code="${safeText(e.employeeCode)}" data-name="${safeText(e.fullName)}" data-dept="${safeText(e.department)}" data-pos="${safeText(e.position)}">${safeText(e.employeeCode)} • ${safeText(e.fullName)}</option>`).join("");
}

async function saveManualAttendance(admin) {
  currentAdminCache = admin;
  const select = document.getElementById("manualEmployee"), opt = select.selectedOptions[0];
  const employeeId = select.value, type = val("manualType"), dateKey = val("manualDate"), timeText = val("manualTime"), note = val("manualNote");
  if (!employeeId || !dateKey || !timeText) throw new Error("กรุณาเลือกพนักงาน วันที่ และเวลา");
  const dt = new Date(`${dateKey}T${timeText}:00`);
  await db.collection("attendance").add({
    employeeId,
    employeeCode: opt.dataset.code || "",
    fullName: opt.dataset.name || "",
    department: opt.dataset.dept || "",
    position: opt.dataset.pos || "",
    type,
    source: "ADMIN",
    dateKey,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    clientTime: dt.toISOString(),
    clientTimeText: fmtDateTime(dt),
    photoMode: "none",
    photoURL: "",
    latitude: null,
    longitude: null,
    accuracy: null,
    mapUrl: "",
    distanceMeters: null,
    inGeofence: null,
    geofenceMode: "admin_manual",
    adminNote: note,
    adminBy: admin.employeeCode || admin.id || "admin",
    adminByName: admin.fullName || "ผู้ดูแลระบบ"
  });
  await writeLog("MANUAL_ATTENDANCE_ADD", admin, { employeeCode: opt.dataset.code || "", type, dateKey, timeText, note });
  setMsg("manualMsg", "เพิ่มเวลาเข้า/ออกงานสำเร็จ");
  document.getElementById("manualNote").value = "";
}

async function loadLogs() {
  const list = document.getElementById("logList"), start = val("logStart"), end = val("logEnd"), action = val("logAction");
  list.innerHTML = `<div class="empty-state"><p>กำลังโหลด...</p></div>`;
  try {
    const snap = await db.collection(LOG_COLLECTION).where("dateKey", ">=", start).where("dateKey", "<=", end).get();
    let rows = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(sortByCreatedDesc);
    if (action) rows = rows.filter(r => r.action === action);
    list.innerHTML = rows.length ? rows.map(logCard).join("") : `<div class="empty-state"><p>ไม่พบ log</p></div>`;
  } catch (err) { list.innerHTML = `<div class="empty-state error-text"><p>${safeText(err.message)}</p></div>`; }
}

async function clearData(admin) {
  currentAdminCache = admin;
  const collection = val("clearCollection"), start = val("clearStart"), end = val("clearEnd"), confirm = val("clearConfirm");
  if (confirm !== "CLEAR") throw new Error("กรุณาพิมพ์ CLEAR เพื่อยืนยัน");
  if (!start || !end || end < start) throw new Error("ช่วงวันที่ไม่ถูกต้อง");
  const snap = await db.collection(collection).where("dateKey", ">=", start).where("dateKey", "<=", end).get();
  if (snap.empty) { setMsg("clearMsg", "ไม่พบข้อมูลในช่วงวันที่นี้"); return; }
  let batch = db.batch(), count = 0, batchCount = 0;
  for (const doc of snap.docs) {
    batch.delete(doc.ref); count++; batchCount++;
    if (batchCount >= 450) { await batch.commit(); batch = db.batch(); batchCount = 0; }
  }
  if (batchCount) await batch.commit();
  await writeLog("CLEAR_DATA", admin, { collection, start, end, deleted: count });
  setMsg("clearMsg", `ลบข้อมูล ${collection} สำเร็จ ${count} รายการ`);
  document.getElementById("clearConfirm").value = "";
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

function otCard(r) {
  const status = statusBadge(r.status);
  return `<article class="attendance-card tool-card"><div class="tool-icon">OT</div><div><h3>${safeText(r.dateKey)} • ${safeText(r.startTime)}-${safeText(r.endTime)}</h3><p>${safeText(r.reason)}</p><div class="badges">${status}<span class="badge">${safeText(r.employeeCode || "")}</span></div></div></article>`;
}

function otCardAdmin(r) {
  const disabled = r.status !== "pending";
  return `<article class="attendance-card tool-card"><div class="tool-icon">OT</div><div><h3>${safeText(r.employeeCode)} • ${safeText(r.fullName)}</h3><p>${safeText(r.dateKey)} ${safeText(r.startTime)}-${safeText(r.endTime)} • ${safeText(r.reason)}</p><div class="badges">${statusBadge(r.status)}${r.reviewedBy?`<span class="badge">โดย ${safeText(r.reviewedBy)}</span>`:""}</div><div class="actions-row compact-line"><button id="approve-${r.id}" class="good compact" ${disabled?"disabled":""}>อนุมัติ</button><button id="reject-${r.id}" class="danger compact" ${disabled?"disabled":""}>ปฏิเสธ</button></div></div></article>`;
}

function logCard(r) {
  const time = r.createdAt?.toDate ? fmtDateTime(r.createdAt.toDate()) : (r.clientTimeText || r.clientTime || "-");
  return `<article class="summary-card"><h3>${safeText(r.action)}</h3><p>${safeText(time)} • ${safeText(r.actorCode)} ${safeText(r.actorName)}</p><pre class="log-json">${safeText(JSON.stringify(r.detail || {}, null, 2))}</pre></article>`;
}

function statusBadge(status = "pending") {
  const map = { pending: ["รออนุมัติ", "warn"], approved: ["อนุมัติแล้ว", "good"], rejected: ["ปฏิเสธ", "bad"] };
  const [label, cls] = map[status] || [status, "info"];
  return `<span class="badge ${cls}">${safeText(label)}</span>`;
}

function sortByCreatedDesc(a, b) { return (b.createdAt?.seconds || Date.parse(b.clientTime || b.requestedAt || 0) / 1000 || 0) - (a.createdAt?.seconds || Date.parse(a.clientTime || a.requestedAt || 0) / 1000 || 0); }
function val(id) { return (document.getElementById(id)?.value || "").trim(); }
function setMsg(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
function showEmployeeError(err) { setMsg("toolsMsg", "ผิดพลาด: " + err.message); }
