import { db } from "../core/firebase.js";
import { todayKey, safeText } from "../core/utils.js";

export async function renderDashboardModule(container, employee, mode="employee"){
  container.innerHTML = `<div class="dashboard-hero"><div><p class="eyebrow">Step 7 Full Pack</p><h2>${mode==="admin"?"ศูนย์ควบคุมผู้ดูแล":"หน้าหลักของฉัน"}</h2><p class="muted">แยก Dashboard, Profile, Notifications แล้ว ไม่ทับกัน</p></div></div><div id="dashStats" class="stats-grid"></div><div id="dashBody" class="grid two"></div>`;
  const stats = document.getElementById("dashStats");
  const body = document.getElementById("dashBody");
  if (mode === "admin") {
    const [emp, att, leave, noti] = await Promise.all([
      db.collection("employees").get().catch(()=>({size:0})),
      db.collection("attendance").where("dateKey","==",todayKey()).get().catch(()=>({size:0})),
      db.collection("leaveRequests").where("status","==","pending").get().catch(()=>({size:0})),
      db.collection("notifications").where("read","==",false).get().catch(()=>({size:0}))
    ]);
    stats.innerHTML = `<div class="stat-card"><b>${emp.size||0}</b><span>พนักงาน</span></div><div class="stat-card"><b>${att.size||0}</b><span>ลงเวลาวันนี้</span></div><div class="stat-card"><b>${leave.size||0}</b><span>ลารออนุมัติ</span></div><div class="stat-card"><b>${noti.size||0}</b><span>แจ้งเตือนยังไม่อ่าน</span></div>`;
    body.innerHTML = `<section class="card wide"><h3>คำแนะนำ</h3><p class="muted">ใช้งานตามลำดับ: พนักงาน → ปฏิทิน → ลงเวลา → สรุปรายวัน → Payroll</p></section><section class="card wide"><h3>สถานะระบบ</h3><p>Notifications, Dashboard และ Profile แยกโมดูลแล้ว</p></section>`;
  } else {
    const [att, sum, noti] = await Promise.all([
      db.collection("attendance").where("employeeId","==",employee.id).where("dateKey","==",todayKey()).get().catch(()=>({size:0})),
      db.collection("attendanceSummary").where("employeeId","==",employee.id).where("dateKey","==",todayKey()).get().catch(()=>({docs:[]})),
      db.collection("notifications").where("employeeId","==",employee.id).where("read","==",false).get().catch(()=>({size:0}))
    ]);
    const status = sum.docs?.[0]?.data()?.statusLabel || "-";
    stats.innerHTML = `<div class="stat-card"><b>${att.size||0}</b><span>รายการลงเวลาวันนี้</span></div><div class="stat-card"><b>${safeText(status)}</b><span>สถานะวันนี้</span></div><div class="stat-card"><b>${noti.size||0}</b><span>แจ้งเตือนใหม่</span></div>`;
    body.innerHTML = `<section class="card wide"><h3>สวัสดี ${safeText(employee.fullName||employee.employeeCode)}</h3><p class="muted">กดเมนูลงเวลาเพื่อเข้างาน/ออกงาน กดสรุปเพื่อดูสถานะรายวัน</p></section><section class="card wide"><h3>ข้อมูลของฉัน</h3><p>${safeText(employee.department||"-")} • ${safeText(employee.position||"-")}</p></section>`;
  }
}
