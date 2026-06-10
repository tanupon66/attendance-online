import { db } from "../core/firebase.js";
import { todayKey, safeText } from "../core/utils.js";

const SETTINGS_COLLECTION = "settings";
const COMPANY_DOC = "company";

export async function renderDashboardModule(container, employee, mode="employee"){
  const settings = await loadCompanySettings();
  const companyName = getCompanyName(settings);
  updateDashboardTitle(companyName);

  container.innerHTML = `<div class="dashboard-hero"><div><p class="eyebrow">${mode==="admin"?"COMPANY DASHBOARD":"MY DASHBOARD"}</p><h2>${safeText(mode==="admin"?companyName:"หน้าหลักของฉัน")}</h2><p class="muted">${mode==="admin"?"ภาพรวมวันนี้ของบริษัทจากจำนวนพนักงานจริง ไม่ซ้ำตามจำนวนครั้งที่ลงเวลา":"ข้อมูลลงเวลา สรุปสถานะ และแจ้งเตือนของฉัน"}</p></div></div><div id="dashStats" class="stats-grid"></div><div id="dashBody" class="grid two"></div>`;
  const stats = document.getElementById("dashStats");
  const body = document.getElementById("dashBody");
  if (mode === "admin") {
    const today = todayKey();
    const [empSnap, attSnap, summarySnap, pendingLeaveSnap, notiSnap] = await Promise.all([
      db.collection("employees").get().catch(()=>({docs:[],size:0})),
      db.collection("attendance").where("dateKey","==",today).get().catch(()=>({docs:[],size:0})),
      db.collection("attendanceSummary").where("dateKey","==",today).get().catch(()=>({docs:[],size:0})),
      db.collection("leaveRequests").where("status","==","pending").get().catch(()=>({docs:[],size:0})),
      db.collection("notifications").where("read","==",false).get().catch(()=>({docs:[],size:0}))
    ]);

    const employees = (empSnap.docs || []).map(d => ({ id:d.id, ...d.data() }));
    const activeEmployees = employees.filter(e => e.active !== false);
    const attendanceRows = (attSnap.docs || []).map(d => ({ id:d.id, ...d.data() }));
    const summaryRows = (summarySnap.docs || []).map(d => ({ id:d.id, ...d.data() }));

    const clockedEmployeeCount = uniqueCount(attendanceRows.filter(isClockRecord), "employeeId");
    const absentCount = uniqueCount(summaryRows.filter(r => r.status === "ABSENT"), "employeeId");
    const leaveCount = uniqueCount(summaryRows.filter(r => ["LEAVE_PAID", "LEAVE_UNPAID"].includes(r.status)), "employeeId");
    const incompleteCount = uniqueCount(summaryRows.filter(r => r.status === "INCOMPLETE"), "employeeId");

    stats.innerHTML = `
      <div class="stat-card"><b>${activeEmployees.length || 0}</b><span>พนักงานใช้งาน</span></div>
      <div class="stat-card"><b>${clockedEmployeeCount}</b><span>คนลงเวลาวันนี้</span></div>
      <div class="stat-card"><b>${absentCount}</b><span>ขาดงานวันนี้</span></div>
      <div class="stat-card"><b>${leaveCount}</b><span>ลาวันนี้</span></div>
      <div class="stat-card"><b>${incompleteCount}</b><span>ข้อมูลไม่ครบ</span></div>
      <div class="stat-card"><b>${pendingLeaveSnap.size||0}</b><span>ลารออนุมัติ</span></div>`;

    body.innerHTML = `
      <section class="card wide"><h3>คำแนะนำ</h3><p class="muted">ตัวเลข “คนลงเวลาวันนี้” นับจากพนักงานไม่ซ้ำ แม้พนักงานคนเดียวลงเวลาเข้า/ออกหลายครั้งก็แสดงเป็น 1 คน</p></section>
      <section class="card wide"><h3>สถานะสรุปรายวัน</h3><p>ขาดงาน/ลา/ข้อมูลไม่ครบ อ้างอิงจาก attendanceSummary ของวันที่ ${safeText(today)} หากเพิ่งแก้ข้อมูล ให้ไปหน้า “สรุปรายวัน” แล้วกด “คำนวณ/สร้างสรุป” ใหม่</p></section>
      <section class="card wide"><h3>การแจ้งเตือน</h3><p>ยังไม่อ่าน ${safeText(notiSnap.size || 0)} รายการ</p></section>`;
  } else {
    const today = todayKey();
    const [att, sum, noti] = await Promise.all([
      db.collection("attendance").where("employeeId","==",employee.id).where("dateKey","==",today).get().catch(()=>({docs:[],size:0})),
      db.collection("attendanceSummary").where("employeeId","==",employee.id).where("dateKey","==",today).get().catch(()=>({docs:[]})),
      db.collection("notifications").where("employeeId","==",employee.id).where("read","==",false).get().catch(()=>({size:0}))
    ]);
    const status = sum.docs?.[0]?.data()?.statusLabel || "-";
    const clockCount = uniqueCount((att.docs || []).map(d => ({ id:d.id, ...d.data() })).filter(isClockRecord), "employeeId") || 0;
    stats.innerHTML = `<div class="stat-card"><b>${clockCount}</b><span>ลงเวลาแล้ววันนี้</span></div><div class="stat-card"><b>${safeText(status)}</b><span>สถานะวันนี้</span></div><div class="stat-card"><b>${noti.size||0}</b><span>แจ้งเตือนใหม่</span></div>`;
    body.innerHTML = `<section class="card wide"><h3>สวัสดี ${safeText(employee.fullName||employee.employeeCode)}</h3><p class="muted">กดเมนูลงเวลาเพื่อเข้างาน/ออกงาน กดสรุปเพื่อดูสถานะรายวัน</p></section><section class="card wide"><h3>ข้อมูลของฉัน</h3><p>${safeText(employee.department||"-")} • ${safeText(employee.position||"-")}</p></section>`;
  }
}

async function loadCompanySettings() {
  try {
    const doc = await db.collection(SETTINGS_COLLECTION).doc(COMPANY_DOC).get();
    return doc.exists ? doc.data() : {};
  } catch {
    return {};
  }
}

function getCompanyName(settings = {}) {
  return String(settings.companyName || settings.officeName || "ชื่อบริษัท").trim() || "ชื่อบริษัท";
}

function updateDashboardTitle(companyName) {
  const title = document.querySelector(".topbar h1");
  if (title) title.textContent = companyName;
  document.title = `${companyName} • Attendance`;
}

function isClockRecord(row) {
  if (!row || !row.employeeId) return false;
  if (!["IN", "OUT"].includes(row.type)) return false;
  if (row.approvedForUse === false) return false;
  if (["rejected"].includes(row.geofenceApprovalStatus)) return false;
  if (["rejected_geofence"].includes(row.attendanceStatus)) return false;
  return true;
}

function uniqueCount(rows, key) {
  return new Set((rows || []).map(r => r?.[key]).filter(Boolean)).size;
}
