import { db } from "../core/firebase.js";
import { safeText, todayKey, exportCsv, money } from "../core/utils.js";

export async function renderPayrollModule(container, employee, mode = "admin") {
  container.innerHTML = `
    <div class="module-head">
      <div>
        <h2>Payroll & Slip</h2>
        <p class="muted">คำนวณเงินเดือน พิมพ์ Slip และ Export CSV แบบละเอียด</p>
      </div>
    </div>

    <section class="card wide">
      <div class="filters">
        <input id="payStart" type="date" value="${todayKey()}">
        <input id="payEnd" type="date" value="${todayKey()}">
        <button id="loadPayrollBtn" class="primary compact">คำนวณ</button>
        <button id="exportPayrollCsvBtn" class="secondary compact">Export Payroll CSV</button>
        <button id="exportSlipCsvBtn" class="secondary compact">Export Slip CSV</button>
      </div>
      <div id="payrollList" class="list"></div>
    </section>

    <div id="slipModal" class="modal hidden">
      <div class="modal-backdrop" id="closeSlipBackdrop"></div>
      <div class="modal-card slip-card">
        <div class="modal-head no-print">
          <h2>Payroll Slip</h2>
          <button id="closeSlipBtn" class="secondary compact">ปิด</button>
        </div>
        <div id="slipBody"></div>
      </div>
    </div>
  `;

  document.getElementById("loadPayrollBtn").onclick = () => loadPayroll(employee, mode);
  document.getElementById("exportPayrollCsvBtn").onclick = () => exportPayroll(employee, mode);
  document.getElementById("exportSlipCsvBtn").onclick = () => exportSlipCsv(employee, mode);
  document.getElementById("closeSlipBtn").onclick = closeSlip;
  document.getElementById("closeSlipBackdrop").onclick = closeSlip;

  await loadPayroll(employee, mode);
}

async function getPayrollRows(employee, mode) {
  const start = document.getElementById("payStart").value;
  const end = document.getElementById("payEnd").value;

  const [sumSnap, empSnap, benefitSnap] = await Promise.all([
    db.collection("attendanceSummary").where("dateKey", ">=", start).where("dateKey", "<=", end).get(),
    db.collection("employees").get(),
    db.collection("benefits").get().catch(() => ({ docs: [] }))
  ]);

  const employees = {};
  empSnap.docs.forEach(d => employees[d.id] = { id: d.id, ...d.data() });

  const benefits = benefitSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(b => b.active !== false);

  let rows = sumSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (mode !== "admin") rows = rows.filter(r => r.employeeId === employee.id);

  const by = {};

  rows.forEach(r => {
    const e = employees[r.employeeId] || {};
    const k = r.employeeId;

    by[k] ||= {
      employeeId: k,
      employeeCode: r.employeeCode,
      fullName: r.fullName,
      department: r.department,
      position: r.position,
      payType: e.payType || "daily",
      dailyRate: Number(e.dailyRate || 0),
      hourlyRate: Number(e.hourlyRate || 0),
      monthlySalary: Number(e.monthlySalary || 0),
      otMultiplier: Number(e.otMultiplier || 1.5),
      workDays: 0,
      paidLeave: 0,
      unpaidLeave: 0,
      holidaysPaid: 0,
      absentDays: 0,
      lateMinutes: 0,
      netHours: 0,
      regularHours: 0,
      rawRows: []
    };

    const o = by[k];
    o.rawRows.push(r);

    if (["PRESENT", "LATE"].includes(r.status)) o.workDays++;
    if (r.status === "LEAVE_PAID") o.paidLeave++;
    if (r.status === "LEAVE_UNPAID") o.unpaidLeave++;
    if (r.status === "HOLIDAY_PAID") o.holidaysPaid++;
    if (r.status === "ABSENT") o.absentDays++;

    o.lateMinutes += Number(r.lateMinutes || 0);
    o.netHours += Number(r.netHours || 0);
    o.regularHours += Number(r.regularHours || 0);
  });

  return Object.values(by).map(o => calcPay(o, benefits, start, end));
}

function calcPay(o, benefits, start, end) {
  const hourly = o.hourlyRate || (o.dailyRate ? o.dailyRate / 8 : 0);

  let basePay = 0;
  let payNote = "";

  if (o.payType === "monthly") {
    basePay = o.monthlySalary;
    payNote = "รายเดือน";
  } else if (o.payType === "hourly") {
    basePay = o.regularHours * hourly;
    payNote = "รายชั่วโมง";
  } else {
    basePay = (o.workDays + o.paidLeave + o.holidaysPaid) * o.dailyRate;
    payNote = "รายวัน";
  }

  let benefitPay = 0;
  const benefitDetails = [];

  benefits.forEach(b => {
    let amount = 0;
    if (b.mode === "perWorkday") amount = Number(b.amount || 0) * o.workDays;
    if (b.mode === "fixedMonthly") amount = Number(b.amount || 0);
    if (amount) {
      benefitPay += amount;
      benefitDetails.push(`${b.name || "Benefit"}: ${money(amount)}`);
    }
  });

  const lateDeduct = o.lateMinutes * (hourly / 60);
  const absentDeduct = o.payType === "monthly" ? o.absentDays * (o.monthlySalary / 30) : 0;
  const unpaidLeaveDeduct = o.payType === "monthly" ? o.unpaidLeave * (o.monthlySalary / 30) : 0;

  const grossPay = basePay + benefitPay;
  const totalDeduct = lateDeduct + absentDeduct + unpaidLeaveDeduct;
  const netPay = Math.max(0, grossPay - totalDeduct);

  return {
    ...o,
    periodStart: start,
    periodEnd: end,
    hourly,
    payNote,
    basePay,
    benefitPay,
    benefitDetails,
    grossPay,
    lateDeduct,
    absentDeduct,
    unpaidLeaveDeduct,
    totalDeduct,
    netPay
  };
}

async function loadPayroll(employee, mode) {
  const list = document.getElementById("payrollList");
  list.innerHTML = `<div class="empty-state">กำลังคำนวณ...</div>`;

  try {
    const rows = await getPayrollRows(employee, mode);
    list.innerHTML = rows.length
      ? rows.map((r, i) => payrollCard(r, i)).join("")
      : `<div class="empty-state">ยังไม่มีข้อมูล summary</div>`;

    rows.forEach((r, i) => {
      document.getElementById(`slip-${i}`).onclick = () => openSlip(r);
    });
  } catch (err) {
    list.innerHTML = `<div class="empty-state error-text">${safeText(err.message)}</div>`;
  }
}

function payrollCard(r, i) {
  const canPrint = r.payType !== "monthly";
  return `
    <article class="summary-card">
      <h3>${safeText(r.employeeCode)} ${safeText(r.fullName)}</h3>
      <p class="muted">${safeText(r.department || "-")} • ${safeText(r.position || "-")} • ${safeText(r.payNote)}</p>
      <div class="badges">
        <span class="badge">ทำงาน ${r.workDays}</span>
        <span class="badge info">ลาจ่าย ${r.paidLeave}</span>
        <span class="badge bad">ขาด ${r.absentDays}</span>
        <span class="badge warn">สาย ${r.lateMinutes} นาที</span>
        <span class="badge">รายได้ ${money(r.grossPay)}</span>
        <span class="badge bad">หัก ${money(r.totalDeduct)}</span>
        <span class="badge good">สุทธิ ${money(r.netPay)} บาท</span>
      </div>
      <button id="slip-${i}" class="secondary compact">${canPrint ? "ดู/พิมพ์ Slip" : "ดู Slip รายเดือน"}</button>
      ${r.payType === "monthly" ? `<p class="muted small">รายเดือนดูรายละเอียดได้ แต่ระบบปิดการพิมพ์เป็นค่าเริ่มต้น</p>` : ""}
    </article>`;
}

function openSlip(r) {
  const canPrint = r.payType !== "monthly";
  document.getElementById("slipBody").innerHTML = `
    <div class="print-slip">
      <div class="slip-title">
        <h2>Payroll Slip</h2>
        <p>งวด ${safeText(r.periodStart)} ถึง ${safeText(r.periodEnd)}</p>
      </div>

      <div class="slip-employee">
        <b>${safeText(r.employeeCode)} • ${safeText(r.fullName)}</b>
        <span>${safeText(r.department || "-")} • ${safeText(r.position || "-")} • ${safeText(r.payNote)}</span>
      </div>

      <table>
        <tr><td>วันทำงาน</td><td>${r.workDays}</td></tr>
        <tr><td>ลาจ่ายเงิน</td><td>${r.paidLeave}</td></tr>
        <tr><td>ลาไม่จ่ายเงิน</td><td>${r.unpaidLeave}</td></tr>
        <tr><td>วันหยุดจ่ายเงิน</td><td>${r.holidaysPaid}</td></tr>
        <tr><td>ขาดงาน</td><td>${r.absentDays}</td></tr>
        <tr><td>ชั่วโมงสุทธิ</td><td>${r.netHours.toFixed(2)}</td></tr>
        <tr><td>มาสาย</td><td>${r.lateMinutes} นาที</td></tr>
        <tr><td>รายได้ฐาน</td><td>${money(r.basePay)} บาท</td></tr>
        <tr><td>สวัสดิการ/เงินเพิ่ม</td><td>${money(r.benefitPay)} บาท</td></tr>
        <tr><td>รายได้รวม</td><td>${money(r.grossPay)} บาท</td></tr>
        <tr><td>หักมาสาย</td><td>${money(r.lateDeduct)} บาท</td></tr>
        <tr><td>หักขาดงาน</td><td>${money(r.absentDeduct)} บาท</td></tr>
        <tr><td>หักลาไม่จ่ายเงิน</td><td>${money(r.unpaidLeaveDeduct)} บาท</td></tr>
        <tr><th>สุทธิ</th><th>${money(r.netPay)} บาท</th></tr>
      </table>

      ${r.benefitDetails.length ? `<p class="muted">รายละเอียดเงินเพิ่ม: ${safeText(r.benefitDetails.join(", "))}</p>` : ""}

      <div class="signature-row">
        <div>ผู้รับเงิน<br><br>________________</div>
        <div>ผู้จ่ายเงิน<br><br>________________</div>
      </div>

      ${canPrint
        ? `<button onclick="window.print()" class="primary no-print">พิมพ์ Slip</button>`
        : `<p class="badge warn no-print">พนักงานรายเดือน: ดูรายละเอียดได้ แต่ปิดพิมพ์ตามระบบ</p>`}
    </div>
  `;
  document.getElementById("slipModal").classList.remove("hidden");
}

function closeSlip() {
  document.getElementById("slipModal").classList.add("hidden");
}

async function exportPayroll(employee, mode) {
  const rows = await getPayrollRows(employee, mode);
  exportCsv("payroll-detail.csv", rows.map(r => ({
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    employeeCode: r.employeeCode,
    fullName: r.fullName,
    department: r.department,
    position: r.position,
    payType: r.payType,
    workDays: r.workDays,
    paidLeave: r.paidLeave,
    unpaidLeave: r.unpaidLeave,
    holidaysPaid: r.holidaysPaid,
    absentDays: r.absentDays,
    lateMinutes: r.lateMinutes,
    netHours: r.netHours,
    regularHours: r.regularHours,
    basePay: r.basePay,
    benefitPay: r.benefitPay,
    grossPay: r.grossPay,
    lateDeduction: r.lateDeduct,
    absentDeduction: r.absentDeduct,
    unpaidLeaveDeduction: r.unpaidLeaveDeduct,
    totalDeduction: r.totalDeduct,
    netPay: r.netPay
  })));
}

async function exportSlipCsv(employee, mode) {
  const rows = await getPayrollRows(employee, mode);
  exportCsv("payroll-slip-lines.csv", rows.flatMap(r => ([
    { employeeCode: r.employeeCode, fullName: r.fullName, line: "รายได้ฐาน", amount: r.basePay },
    { employeeCode: r.employeeCode, fullName: r.fullName, line: "สวัสดิการ/เงินเพิ่ม", amount: r.benefitPay },
    { employeeCode: r.employeeCode, fullName: r.fullName, line: "หักมาสาย", amount: -r.lateDeduct },
    { employeeCode: r.employeeCode, fullName: r.fullName, line: "หักขาดงาน", amount: -r.absentDeduct },
    { employeeCode: r.employeeCode, fullName: r.fullName, line: "หักลาไม่จ่ายเงิน", amount: -r.unpaidLeaveDeduct },
    { employeeCode: r.employeeCode, fullName: r.fullName, line: "สุทธิ", amount: r.netPay }
  ])));
}
