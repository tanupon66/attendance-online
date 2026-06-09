import { db } from "../core/firebase.js";
import { safeText, todayKey, fmtDateTime, distanceMeters } from "../core/utils.js";

let mediaStream = null, capturedDataUrl = null, currentPosition = null;
let companySettings = {
  officeName: "สำนักงานใหญ่",
  officeLat: null,
  officeLng: null,
  radiusMeters: 100,
  geofenceMode: "approval",
  defaultRequireGeofence: false,
  allowOutsidePendingApproval: true
};

export async function renderAttendanceModule(container, employee, mode = "employee") {
  if (mode === "employee") employee = await refreshEmployee(employee);
  await loadSettings();
  container.innerHTML = `
    <div class="module-head"><div><h2>${mode === "admin" ? "รายการลงเวลา" : "ลงเวลา"}</h2><p class="muted">Selfie + GPS + Geofence Approval</p></div><button id="reloadAttendanceBtn" class="secondary compact">โหลดใหม่</button></div>
    ${mode === "employee" ? employeeClockUi(employee) : adminAttendanceUi()}
    <div id="attendanceDetailModal" class="modal hidden"><div class="modal-backdrop" id="closeDetailBackdrop"></div><div class="modal-card"><div class="modal-head"><div><h2 id="detailTitle">รายละเอียดการลงเวลา</h2><p id="detailSub" class="muted"></p></div><button id="closeDetailBtn" class="secondary compact">ปิด</button></div><div id="detailBody"></div></div></div>`;
  document.getElementById("reloadAttendanceBtn").onclick = () => renderAttendanceModule(container, employee, mode);
  document.getElementById("closeDetailBtn").onclick = closeDetail;
  document.getElementById("closeDetailBackdrop").onclick = closeDetail;
  if (mode === "employee") {
    document.getElementById("startCameraBtn").onclick = startCamera;
    document.getElementById("captureBtn").onclick = () => captureSelfie(employee).catch(showErr);
    document.getElementById("clockInBtn").onclick = () => clock(employee, "IN").catch(showErr);
    document.getElementById("clockOutBtn").onclick = () => clock(employee, "OUT").catch(showErr);
    document.getElementById("autoClockBtn").onclick = () => autoClock(employee).catch(showErr);
    await loadMyAttendance(employee);
  } else {
    document.getElementById("attStart").value = todayKey();
    document.getElementById("attEnd").value = todayKey();
    document.getElementById("attStatusFilter").onchange = loadAdminAttendance;
    document.getElementById("loadAdminAttendanceBtn").onclick = loadAdminAttendance;
    await loadAdminAttendance();
  }
}

function employeeClockUi(employee) {
  const required = isEmployeeGeofenceRequired(employee);
  const officeReady = hasOfficeLocation();
  return `<div class="clock-layout">
    <section class="card clock-card">
      <div class="geo-rule-box ${required ? "required" : "optional"}">
        <b>${required ? "พนักงานคนนี้ต้องลงเวลาในรัศมี" : "พนักงานคนนี้ไม่ถูกบังคับรัศมี"}</b>
        <span>${officeReady ? `${safeText(companySettings.officeName || "บริษัท")} • รัศมี ${safeText(companySettings.radiusMeters || 100)} เมตร` : "แอดมินยังไม่ได้ตั้งค่าพิกัดบริษัท"}</span>
      </div>
      <video id="camera" autoplay playsinline muted></video><canvas id="snapshot" class="hidden"></canvas><img id="preview" class="preview hidden">
      <p id="gpsStatus" class="muted small"></p><p id="clockMsg" class="message"></p>
      <div class="actions-grid"><button id="startCameraBtn" class="secondary">เปิดกล้อง</button><button id="captureBtn" class="secondary">ถ่ายรูป + GPS</button><button id="clockInBtn" class="good">เข้างาน</button><button id="clockOutBtn" class="danger">ออกงาน</button><button id="autoClockBtn" class="primary">อัตโนมัติ</button></div>
    </section>
    <section class="card wide"><h3>ประวัติวันนี้</h3><div id="myAttendanceList" class="list"></div></section>
  </div>`;
}

function adminAttendanceUi() {
  return `<section class="card wide">
    <div class="filters"><input id="attStart" type="date"><input id="attEnd" type="date"><select id="attStatusFilter"><option value="">ทุกสถานะ</option><option value="pending">รออนุมัตินอกพื้นที่</option><option value="approved">อนุมัติแล้ว</option><option value="rejected">ปฏิเสธ</option></select><button id="loadAdminAttendanceBtn" class="primary compact">โหลด</button></div>
    <div id="adminAttendanceList" class="list"></div>
  </section>`;
}

async function refreshEmployee(employee) {
  try {
    if (!employee?.id) return employee;
    const doc = await db.collection("employees").doc(employee.id).get();
    if (!doc.exists) return employee;
    const fresh = { id: doc.id, ...doc.data() };
    localStorage.setItem("attendance_v3_employee", JSON.stringify(fresh));
    return fresh;
  } catch (e) { return employee; }
}

async function loadSettings() {
  try {
    const doc = await db.collection("settings").doc("company").get();
    if (doc.exists) companySettings = { ...companySettings, ...doc.data() };
  } catch (e) {}
}

function showErr(err) {
  const msg = document.getElementById("clockMsg");
  if (msg) msg.textContent = "ผิดพลาด: " + err.message;
  else alert(err.message);
}

async function startCamera() {
  if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
  mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
  document.getElementById("camera").srcObject = mediaStream;
}

async function getGPS() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("อุปกรณ์นี้ไม่รองรับ GPS"));
    navigator.geolocation.getCurrentPosition(pos => {
      currentPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
      const gps = document.getElementById("gpsStatus");
      const g = geo();
      const distanceText = g.dist !== null ? ` • ห่างบริษัท ${Math.round(g.dist)}m • ${g.inGeo ? "ในพื้นที่" : "นอกพื้นที่"}` : "";
      if (gps) gps.textContent = `GPS: ${currentPosition.lat.toFixed(6)}, ${currentPosition.lng.toFixed(6)} ±${Math.round(currentPosition.accuracy)}m${distanceText}`;
      resolve(currentPosition);
    }, err => reject(new Error(err.message || "ไม่ได้รับอนุญาตตำแหน่ง")), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });
}

async function captureSelfie(employee) {
  const video = document.getElementById("camera");
  if (!mediaStream) throw new Error("กรุณาเปิดกล้องก่อน");
  await getGPS();
  const sourceW = video.videoWidth || 720, sourceH = video.videoHeight || 960, maxW = 320;
  const scale = Math.min(1, maxW / sourceW), w = Math.round(sourceW * scale), h = Math.round(sourceH * scale);
  const canvas = document.getElementById("snapshot");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, w, h);
  const g = geo();
  ctx.fillStyle = "rgba(0,0,0,.68)"; ctx.fillRect(0, h - 100, w, 100);
  ctx.fillStyle = "#fff"; ctx.font = "12px sans-serif";
  [employee.fullName || employee.employeeCode, employee.employeeCode || "", fmtDateTime(new Date()), `GPS: ${currentPosition.lat.toFixed(6)}, ${currentPosition.lng.toFixed(6)}`, g.dist !== null ? `Distance: ${Math.round(g.dist)}m ${g.inGeo ? "IN" : "OUT"}` : "No office geofence"].forEach((s, i) => ctx.fillText(s, 8, h - 82 + i * 18));
  capturedDataUrl = canvas.toDataURL("image/jpeg", 0.28);
  const preview = document.getElementById("preview");
  preview.src = capturedDataUrl;
  preview.classList.remove("hidden");
  document.getElementById("clockMsg").textContent = "ถ่ายรูปและดึงตำแหน่งแล้ว";
}

function hasOfficeLocation() {
  return companySettings.officeLat !== null && companySettings.officeLat !== "" && companySettings.officeLng !== null && companySettings.officeLng !== "";
}

function isEmployeeGeofenceRequired(employee) {
  if (employee.requireGeofence === true) return true;
  if (employee.requireGeofence === false) return false;
  return companySettings.defaultRequireGeofence === true;
}

function geo() {
  let dist = null, inGeo = null;
  if (hasOfficeLocation() && currentPosition) {
    dist = distanceMeters(currentPosition.lat, currentPosition.lng, Number(companySettings.officeLat), Number(companySettings.officeLng));
    inGeo = dist <= Number(companySettings.radiusMeters || 100);
  }
  return { dist, inGeo };
}

async function clock(employee, type) {
  employee = await refreshEmployee(employee);
  if (!capturedDataUrl) throw new Error("ต้องถ่ายรูปก่อนลงเวลา");
  if (!currentPosition) await getGPS();
  const { dist, inGeo } = geo();
  const required = isEmployeeGeofenceRequired(employee);
  const outsideNeedsApproval = required && inGeo === false;
  if (outsideNeedsApproval && companySettings.allowOutsidePendingApproval === false) throw new Error(`คุณอยู่นอกพื้นที่ ${Math.round(dist)} เมตร ไม่สามารถลงเวลาได้`);

  const now = new Date();
  const approvalStatus = outsideNeedsApproval ? "pending" : "not_required";
  const attendanceStatus = outsideNeedsApproval ? "pending_geofence_approval" : "valid";
  await db.collection("attendance").add({
    employeeId: employee.id,
    employeeCode: employee.employeeCode,
    fullName: employee.fullName,
    department: employee.department || "",
    position: employee.position || "",
    type,
    source: "EMPLOYEE",
    dateKey: todayKey(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    clientTime: now.toISOString(),
    clientTimeText: fmtDateTime(now),
    photoMode: "base64",
    photoURL: capturedDataUrl,
    latitude: currentPosition.lat,
    longitude: currentPosition.lng,
    accuracy: currentPosition.accuracy,
    mapUrl: `https://maps.google.com/?q=${currentPosition.lat},${currentPosition.lng}`,
    officeName: companySettings.officeName || "",
    officeLat: hasOfficeLocation() ? Number(companySettings.officeLat) : null,
    officeLng: hasOfficeLocation() ? Number(companySettings.officeLng) : null,
    radiusMeters: Number(companySettings.radiusMeters || 100),
    distanceMeters: dist,
    inGeofence: inGeo,
    geofenceRequired: required,
    geofenceApprovalStatus: approvalStatus,
    attendanceStatus,
    approvedForUse: !outsideNeedsApproval,
    userAgent: navigator.userAgent
  });
  await writeAttendanceLog(outsideNeedsApproval ? "ATTENDANCE_OUTSIDE_RADIUS_PENDING" : "ATTENDANCE_CLOCK", employee, { type, dateKey: todayKey(), distanceMeters: dist, inGeofence: inGeo, geofenceRequired: required });
  capturedDataUrl = null; currentPosition = null;
  document.getElementById("preview").classList.add("hidden");
  document.getElementById("gpsStatus").textContent = "";
  document.getElementById("clockMsg").textContent = outsideNeedsApproval ? "บันทึกแล้ว แต่คุณอยู่นอกรัศมี ต้องรอแอดมินอนุมัติ" : "บันทึกสำเร็จ";
  await loadMyAttendance(employee);
}

async function autoClock(employee) {
  const snap = await db.collection("attendance").where("employeeId", "==", employee.id).where("dateKey", "==", todayKey()).get();
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  const validRows = rows.filter(r => r.geofenceApprovalStatus !== "rejected");
  const last = validRows.at(-1);
  await clock(employee, !last || last.type === "OUT" ? "IN" : "OUT");
}

async function loadMyAttendance(employee) {
  const list = document.getElementById("myAttendanceList");
  list.innerHTML = `<div class="empty-state"><p>กำลังโหลด...</p></div>`;
  try {
    const snap = await db.collection("attendance").where("employeeId", "==", employee.id).where("dateKey", "==", todayKey()).get();
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    list.innerHTML = rows.length ? rows.map(itemCard).join("") : `<div class="empty-state"><p>วันนี้ยังไม่มีรายการ</p></div>`;
    rows.forEach(r => document.getElementById(`att-${r.id}`).onclick = () => openDetail(r));
  } catch (err) { list.innerHTML = `<div class="empty-state error-text"><p>${safeText(err.message)}</p></div>`; }
}

async function loadAdminAttendance() {
  const list = document.getElementById("adminAttendanceList"), start = document.getElementById("attStart").value, end = document.getElementById("attEnd").value, filter = document.getElementById("attStatusFilter").value;
  list.innerHTML = `<div class="empty-state"><p>กำลังโหลด...</p></div>`;
  try {
    const snap = await db.collection("attendance").where("dateKey", ">=", start).where("dateKey", "<=", end).get();
    let rows = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    if (filter === "pending") rows = rows.filter(r => r.geofenceApprovalStatus === "pending");
    if (filter === "approved") rows = rows.filter(r => r.geofenceApprovalStatus === "approved");
    if (filter === "rejected") rows = rows.filter(r => r.geofenceApprovalStatus === "rejected");
    list.innerHTML = rows.length ? rows.map(itemCardAdmin).join("") : `<div class="empty-state"><p>ไม่พบข้อมูล</p></div>`;
    rows.forEach(r => {
      const card = document.getElementById(`att-${r.id}`);
      if (card) card.onclick = () => openDetail(r);
      const approve = document.getElementById(`approve-att-${r.id}`);
      const reject = document.getElementById(`reject-att-${r.id}`);
      if (approve) approve.onclick = (e) => { e.stopPropagation(); reviewOutsideAttendance(r, "approved"); };
      if (reject) reject.onclick = (e) => { e.stopPropagation(); reviewOutsideAttendance(r, "rejected"); };
    });
  } catch (err) { list.innerHTML = `<div class="empty-state error-text"><p>${safeText(err.message)}</p></div>`; }
}

async function reviewOutsideAttendance(row, status) {
  const admin = JSON.parse(localStorage.getItem("attendance_v3_employee") || "{}");
  const ok = status === "approved";
  await db.collection("attendance").doc(row.id).update({
    geofenceApprovalStatus: status,
    attendanceStatus: ok ? "valid" : "rejected_geofence",
    approvedForUse: ok,
    reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
    reviewedBy: admin.employeeCode || admin.id || "admin",
    reviewedByName: admin.fullName || "ผู้ดูแลระบบ"
  });
  await writeAttendanceLog(ok ? "GEOFENCE_ATTENDANCE_APPROVE" : "GEOFENCE_ATTENDANCE_REJECT", admin, { attendanceId: row.id, employeeCode: row.employeeCode, dateKey: row.dateKey, type: row.type, distanceMeters: row.distanceMeters });
  await loadAdminAttendance();
}

function itemCard(r) {
  const label = r.type === "IN" ? "เข้างาน" : "ออกงาน";
  const geoLabel = r.inGeofence === false ? "นอกพื้นที่" : r.inGeofence === true ? "ในพื้นที่" : "ไม่ตรวจ";
  const time = r.createdAt?.toDate ? fmtDateTime(r.createdAt.toDate()) : (r.clientTimeText || r.clientTime || "-");
  const status = approvalBadge(r);
  return `<article id="att-${r.id}" class="attendance-card clickable ${r.geofenceApprovalStatus === "pending" ? "pending-approval-card" : ""}">${r.photoURL ? `<img src="${r.photoURL}" class="att-thumb" loading="lazy">` : `<div class="att-thumb empty-photo">ไม่มีรูป</div>`}<div><h3>${safeText(r.employeeCode)} • ${safeText(r.fullName)}</h3><p>${label} • ${safeText(time)}</p><div class="badges"><span class="badge">${safeText(r.dateKey)}</span><span class="badge ${r.inGeofence === false ? "bad" : "good"}">${geoLabel}</span>${r.distanceMeters !== null && r.distanceMeters !== undefined ? `<span class="badge">${Math.round(r.distanceMeters)}m</span>` : ""}${status}</div></div></article>`;
}

function itemCardAdmin(r) {
  const card = itemCard(r).replace("</article>", `${r.geofenceApprovalStatus === "pending" ? `<div class="card-actions"><button id="approve-att-${r.id}" class="good compact">อนุมัติ</button><button id="reject-att-${r.id}" class="danger compact">ปฏิเสธ</button></div>` : ""}</article>`);
  return card;
}

function approvalBadge(r) {
  if (r.geofenceApprovalStatus === "pending") return `<span class="badge warn">รออนุมัตินอกพื้นที่</span>`;
  if (r.geofenceApprovalStatus === "approved") return `<span class="badge good">อนุมัติแล้ว</span>`;
  if (r.geofenceApprovalStatus === "rejected") return `<span class="badge bad">ปฏิเสธ</span>`;
  if (r.geofenceRequired) return `<span class="badge info">บังคับรัศมี</span>`;
  return "";
}

function openDetail(r) {
  const time = r.createdAt?.toDate ? fmtDateTime(r.createdAt.toDate()) : (r.clientTimeText || r.clientTime || "-"), label = r.type === "IN" ? "เข้างาน" : "ออกงาน";
  document.getElementById("detailTitle").textContent = `${r.employeeCode} • ${r.fullName}`;
  document.getElementById("detailSub").textContent = `${label} • ${time}`;
  document.getElementById("detailBody").innerHTML = `${r.photoURL ? `<img src="${r.photoURL}" class="detail-photo">` : `<p class="muted">ไม่มีรูป</p>`}<div class="detail-grid"><div class="detail-row"><b>สถานะ</b>${approvalBadge(r) || "ปกติ"}<br>นำไปใช้ได้: ${r.approvedForUse === false ? "ไม่" : "ใช่"}</div><div class="detail-row"><b>วันที่/เวลา</b>${safeText(r.dateKey)}<br>${safeText(time)}</div><div class="detail-row"><b>GPS</b>Lat: ${safeText(r.latitude ?? "-")}<br>Lng: ${safeText(r.longitude ?? "-")}<br>Accuracy: ${safeText(r.accuracy ? Math.round(r.accuracy) + "m" : "-")}</div><div class="detail-row"><b>ขอบเขตบริษัท</b>${safeText(r.officeName || companySettings.officeName || "-")}<br>รัศมี: ${safeText(r.radiusMeters || companySettings.radiusMeters || "-")}m<br>ระยะห่าง: ${r.distanceMeters !== null && r.distanceMeters !== undefined ? Math.round(r.distanceMeters) + "m" : "-"}</div><div class="detail-row"><b>แผนที่</b>${r.mapUrl ? `<a href="${r.mapUrl}" target="_blank">เปิด Google Maps</a>` : "-"}</div></div>`;
  document.getElementById("attendanceDetailModal").classList.remove("hidden");
}

function closeDetail() { document.getElementById("attendanceDetailModal").classList.add("hidden"); }

async function writeAttendanceLog(action, actor, detail = {}) {
  const now = new Date();
  try {
    await db.collection("auditLogs").add({
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
  } catch (err) { console.warn("writeAttendanceLog failed", err); }
}
