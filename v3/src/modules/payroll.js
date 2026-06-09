import { db } from "../core/firebase.js";
import { safeText, todayKey, exportCsv } from "../core/utils.js";

export async function renderPayrollModule(container) {
  container.innerHTML = `
    <div class="module-head">
      <div>
        <h2>Payroll</h2>
        <p class="muted">Step 6 วางโครง Payroll Slip + CSV ก่อน Step 7 จะทำ Payroll Engine เต็ม</p>
      </div>
    </div>

    <section class="card wide">
      <div class="filters">
        <input id="payStart" type="date" value="${todayKey()}">
        <input id="payEnd" type="date" value="${todayKey()}">
        <button id="loadPayrollBaseBtn" class="primary compact">โหลดข้อมูลสรุป</button>
        <button id="exportPayrollBaseCsvBtn" class="secondary compact">Export Payroll CSV</button>
      </div>
      <p class="muted">ตอนนี้ดึงจาก attendanceSummary เพื่อเตรียมเป็นฐานคำนวณเงินเดือนและ Slip</p>
      <div id="payrollBaseList" class="list"></div>
    </section>
  `;
  document.getElementById("loadPayrollBaseBtn").onclick = loadBase;
  document.getElementById("exportPayrollBaseCsvBtn").onclick = exportBase;
  await loadBase();
}

async function getRows() {
  const start = document.getElementById("payStart").value;
  const end = document.getElementById("payEnd").value;
  const snap = await db.collection("attendanceSummary").where("dateKey", ">=", start).where("dateKey", "<=", end).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function loadBase() {
  const list = document.getElementById("payrollBaseList");
  list.innerHTML = `<div class="empty-state">กำลังโหลด...</div>`;
  try {
    const rows = await getRows();
    const byEmp = {};
    rows.forEach(r => {
      const k = r.employeeId;
      byEmp[k] ||= { employeeCode: r.employeeCode, fullName: r.fullName, workDays: 0, absentDays: 0, lateMinutes: 0, netHours: 0 };
      if (["PRESENT","LATE"].includes(r.status)) byEmp[k].workDays++;
      if (r.status === "ABSENT") byEmp[k].absentDays++;
      byEmp[k].lateMinutes += Number(r.lateMinutes || 0);
      byEmp[k].netHours += Number(r.netHours || 0);
    });
    const out = Object.values(byEmp);
    list.innerHTML = out.length ? out.map(r => `<article class="summary-card"><h3>${safeText(r.employeeCode)} ${safeText(r.fullName)}</h3><div class="badges"><span class="badge">วันทำงาน ${r.workDays}</span><span class="badge bad">ขาด ${r.absentDays}</span><span class="badge warn">สาย ${r.lateMinutes} นาที</span><span class="badge">ชม. ${r.netHours.toFixed(2)}</span></div><button class="secondary compact" onclick="window.print()">พิมพ์ Slip ตัวอย่าง</button></article>`).join("") : `<div class="empty-state">ยังไม่มีข้อมูล summary</div>`;
  } catch (err) {
    list.innerHTML = `<div class="empty-state error-text">${safeText(err.message)}</div>`;
  }
}

async function exportBase() {
  const rows = await getRows();
  exportCsv("payroll-base.csv", rows.map(r => ({
    dateKey: r.dateKey,
    employeeCode: r.employeeCode,
    fullName: r.fullName,
    status: r.status,
    statusLabel: r.statusLabel,
    netHours: r.netHours,
    regularHours: r.regularHours,
    lateMinutes: r.lateMinutes,
    calendarType: r.calendarType,
    leaveType: r.leaveType
  })));
}
