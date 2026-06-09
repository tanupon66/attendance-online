import { db } from "../core/firebase.js";
import { safeText, todayKey, exportCsv, money, dateRange, parseDateTime } from "../core/utils.js";
import { rebuildDailySummaryForEmployee } from "./summary.js";

const SUMMARY_COLLECTION = "attendanceSummary";
const OT_COLLECTION = "otRequests";
const DEDUCTION_COLLECTION = "payrollDeductions";

export async function renderPayrollModule(container, employee, mode = "admin") {
  container.innerHTML = `
    <div class="module-head">
      <div>
        <h2>Payroll & Slip</h2>
        <p class="muted">คำนวณเงินเดือนจากสรุปรายวัน + OT ที่อนุมัติแล้ว + รายการหักเงิน</p>
      </div>
    </div>

    <section class="card wide payroll-source-card">
      <h3>แหล่งข้อมูล Payroll</h3>
      <p class="muted small">
        ระบบนี้ดึงข้อมูลจาก <b>attendanceSummary</b> สำหรับวันทำงาน/ชั่วโมง/มาสาย, ดึง <b>otRequests</b> เฉพาะสถานะ <b>approved</b> มาคิดค่า OT และดึง <b>payrollDeductions</b> ที่ยัง active มาหักเงินเพิ่มเติม
      </p>
      <div class="filters">
        <input id="payStart" type="date" value="${todayKey()}">
        <input id="payEnd" type="date" value="${todayKey()}">
        <button id="loadPayrollBtn" class="primary compact">คำนวณ</button>
        <button id="syncPayrollSummaryBtn" class="secondary compact">สร้างสรุปรายวันใหม่ก่อนคำนวณ</button>
        <button id="exportPayrollCsvBtn" class="secondary compact">Export Payroll CSV</button>
        <button id="exportSlipCsvBtn" class="secondary compact">Export Slip CSV</button>
      </div>
      <p id="payrollMsg" class="message"></p>
      <div id="payrollList" class="list"></div>
    </section>

    ${mode === "admin" ? adminDeductionPanel() : ""}

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
  document.getElementById("syncPayrollSummaryBtn").onclick = () => syncSummaryThenLoadPayroll(employee, mode);
  document.getElementById("exportPayrollCsvBtn").onclick = () => exportPayroll(employee, mode);
  document.getElementById("exportSlipCsvBtn").onclick = () => exportSlipCsv(employee, mode);
  document.getElementById("closeSlipBtn").onclick = closeSlip;
  document.getElementById("closeSlipBackdrop").onclick = closeSlip;

  if (mode === "admin") {
    document.getElementById("saveDeductionBtn").onclick = () => saveManualDeduction(employee, mode);
    document.getElementById("reloadDeductionBtn").onclick = () => loadDeductionList(employee, mode);
    document.getElementById("payStart").addEventListener("change", () => loadDeductionList(employee, mode));
    document.getElementById("payEnd").addEventListener("change", () => loadDeductionList(employee, mode));
    await loadDeductionEmployees();
    await loadDeductionList(employee, mode);
  }

  await loadPayroll(employee, mode);
}


function adminDeductionPanel() {
  return `
    <section class="card wide payroll-deduction-card">
      <div class="module-head compact-head">
        <div>
          <h3>รายการหักเงิน</h3>
          <p class="muted small">เพิ่มรายการหักเงินรายพนักงาน เช่น ค่าปรับ เบิกเงินล่วงหน้า อุปกรณ์เสียหาย หรือเหตุผลอื่น ๆ ระบบจะนำไปหักใน Payroll ตามวันที่ของรายการ</p>
        </div>
      </div>

      <div class="form-grid">
        <label>พนักงาน
          <select id="deductionEmployee"></select>
        </label>
        <label>วันที่หัก
          <input id="deductionDate" type="date" value="${todayKey()}">
        </label>
        <label>จำนวนเงินที่หัก
          <input id="deductionAmount" type="number" min="0" step="0.01" placeholder="เช่น 500">
        </label>
        <label>เหตุผลที่หัก
          <input id="deductionReason" type="text" maxlength="160" placeholder="เช่น เบิกเงินล่วงหน้า / ค่าปรับมาสาย">
        </label>
      </div>
      <div class="actions-row">
        <button id="saveDeductionBtn" class="primary compact">บันทึกรายการหักเงิน</button>
        <button id="reloadDeductionBtn" class="secondary compact">โหลดรายการหักเงิน</button>
      </div>
      <p id="deductionMsg" class="message"></p>
      <div id="deductionList" class="list"></div>
    </section>
  `;
}

async function loadDeductionEmployees() {
  const select = document.getElementById("deductionEmployee");
  if (!select) return;
  select.innerHTML = `<option value="">กำลังโหลดพนักงาน...</option>`;
  const snap = await db.collection("employees").get();
  const rows = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(e => e.active !== false)
    .sort((a, b) => String(a.employeeCode || a.fullName || "").localeCompare(String(b.employeeCode || b.fullName || "")));
  select.innerHTML = rows.length
    ? rows.map(e => `<option value="${safeText(e.id)}">${safeText(e.employeeCode || "")} ${safeText(e.fullName || e.id)}</option>`).join("")
    : `<option value="">ยังไม่มีพนักงาน</option>`;
}

async function saveManualDeduction(employee, mode) {
  if (mode !== "admin") return;
  const msg = document.getElementById("deductionMsg");
  const btn = document.getElementById("saveDeductionBtn");
  const select = document.getElementById("deductionEmployee");
  const employeeId = select.value;
  const dateKey = document.getElementById("deductionDate").value;
  const amount = Number(document.getElementById("deductionAmount").value || 0);
  const reason = document.getElementById("deductionReason").value.trim();

  if (!employeeId) { msg.textContent = "กรุณาเลือกพนักงาน"; return; }
  if (!dateKey) { msg.textContent = "กรุณาเลือกวันที่หัก"; return; }
  if (!amount || amount <= 0) { msg.textContent = "กรุณากรอกจำนวนเงินที่หักมากกว่า 0"; return; }
  if (!reason) { msg.textContent = "กรุณากรอกเหตุผลที่หักเงิน"; return; }

  btn.disabled = true;
  msg.textContent = "กำลังบันทึกรายการหักเงิน...";
  try {
    const empDoc = await db.collection("employees").doc(employeeId).get();
    const emp = empDoc.exists ? { id: empDoc.id, ...empDoc.data() } : { id: employeeId };
    await db.collection(DEDUCTION_COLLECTION).add({
      employeeId,
      employeeCode: emp.employeeCode || "",
      fullName: emp.fullName || "",
      department: emp.department || "",
      position: emp.position || "",
      dateKey,
      amount,
      reason,
      type: "manual",
      active: true,
      createdAt: new Date().toISOString(),
      createdBy: employee?.id || "admin",
      createdByName: employee?.fullName || employee?.employeeCode || "Admin"
    });

    await addPayrollAuditLog("CREATE_PAYROLL_DEDUCTION", {
      employeeId,
      dateKey,
      amount,
      reason,
      actorId: employee?.id || "admin"
    });

    document.getElementById("deductionAmount").value = "";
    document.getElementById("deductionReason").value = "";
    msg.textContent = "บันทึกรายการหักเงินสำเร็จ และกำลังคำนวณ Payroll ใหม่";
    await loadDeductionList(employee, mode);
    await loadPayroll(employee, mode);
  } catch (err) {
    msg.textContent = "บันทึกไม่สำเร็จ: " + err.message;
  } finally {
    btn.disabled = false;
  }
}

async function loadDeductionList(employee, mode) {
  if (mode !== "admin") return;
  const list = document.getElementById("deductionList");
  const msg = document.getElementById("deductionMsg");
  if (!list) return;
  const start = document.getElementById("payStart").value;
  const end = document.getElementById("payEnd").value;
  if (!start || !end || start > end) {
    list.innerHTML = `<div class="empty-state">เลือกช่วงวันที่ Payroll ให้ถูกต้องเพื่อดูรายการหักเงิน</div>`;
    return;
  }

  list.innerHTML = `<div class="empty-state">กำลังโหลดรายการหักเงิน...</div>`;
  try {
    const snap = await db.collection(DEDUCTION_COLLECTION)
      .where("dateKey", ">=", start)
      .where("dateKey", "<=", end)
      .get()
      .catch(() => ({ docs: [] }));

    const rows = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(r => r.active !== false)
      .sort((a, b) => String(b.dateKey || "").localeCompare(String(a.dateKey || "")));

    const total = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    if (msg) msg.textContent = rows.length ? `รายการหักเงินในงวดนี้ ${rows.length} รายการ รวม ${money(total)} บาท` : "ยังไม่มีรายการหักเงินในงวดนี้";

    list.innerHTML = rows.length ? rows.map(r => `
      <article class="summary-card deduction-item">
        <h3>${safeText(r.employeeCode || "")} ${safeText(r.fullName || r.employeeId || "-")}</h3>
        <p class="muted">วันที่ ${safeText(r.dateKey || "-")} • หัก ${money(r.amount)} บาท</p>
        <p>${safeText(r.reason || "-")}</p>
        <button class="danger compact" data-delete-deduction="${safeText(r.id)}">ลบ/ยกเลิกรายการนี้</button>
      </article>
    `).join("") : `<div class="empty-state">ยังไม่มีรายการหักเงินในงวดนี้</div>`;

    list.querySelectorAll("[data-delete-deduction]").forEach(btn => {
      btn.onclick = () => deleteManualDeduction(btn.dataset.deleteDeduction, employee, mode);
    });
  } catch (err) {
    list.innerHTML = `<div class="empty-state error-text">โหลดรายการหักเงินไม่สำเร็จ: ${safeText(err.message)}</div>`;
  }
}

async function deleteManualDeduction(id, employee, mode) {
  if (mode !== "admin" || !id) return;
  if (!confirm("ต้องการลบ/ยกเลิกรายการหักเงินนี้ใช่หรือไม่?")) return;
  const msg = document.getElementById("deductionMsg");
  try {
    await db.collection(DEDUCTION_COLLECTION).doc(id).update({
      active: false,
      deletedAt: new Date().toISOString(),
      deletedBy: employee?.id || "admin"
    });
    await addPayrollAuditLog("DELETE_PAYROLL_DEDUCTION", { deductionId: id, actorId: employee?.id || "admin" });
    if (msg) msg.textContent = "ยกเลิกรายการหักเงินแล้ว และคำนวณ Payroll ใหม่แล้ว";
    await loadDeductionList(employee, mode);
    await loadPayroll(employee, mode);
  } catch (err) {
    if (msg) msg.textContent = "ลบ/ยกเลิกรายการไม่สำเร็จ: " + err.message;
  }
}

async function addPayrollAuditLog(action, payload = {}) {
  try {
    await db.collection("auditLogs").add({
      action,
      module: "payroll",
      payload,
      createdAt: new Date().toISOString()
    });
  } catch (err) {
    console.warn("audit log skipped", err);
  }
}

async function syncSummaryThenLoadPayroll(employee, mode) {
  const msg = document.getElementById("payrollMsg");
  const btn = document.getElementById("syncPayrollSummaryBtn");
  const start = document.getElementById("payStart").value;
  const end = document.getElementById("payEnd").value;

  if (!start || !end || start > end) {
    msg.textContent = "กรุณาเลือกช่วงวันที่ให้ถูกต้อง";
    return;
  }

  msg.textContent = "กำลังสร้างสรุปรายวันใหม่จากรายการลงเวลา...";
  btn.disabled = true;
  try {
    const empSnap = mode === "admin"
      ? await db.collection("employees").get()
      : { docs: [await db.collection("employees").doc(employee.id).get()] };
    const employees = empSnap.docs
      .filter(d => d.exists !== false)
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(e => e.active !== false && (mode === "admin" || e.id === employee.id));

    let count = 0;
    for (const dk of dateRange(start, end)) {
      for (const emp of employees) {
        await rebuildDailySummaryForEmployee(emp.id, dk);
        count++;
      }
    }
    msg.textContent = `สร้างสรุปรายวันใหม่สำเร็จ ${count} รายการ แล้วกำลังคำนวณ Payroll...`;
    await loadPayroll(employee, mode);
    msg.textContent = `อัปเดตสรุปรายวันและ Payroll สำเร็จ ${count} รายการ`;
  } catch (err) {
    msg.textContent = "สร้างสรุปใหม่ไม่สำเร็จ: " + err.message;
  } finally {
    btn.disabled = false;
  }
}

async function getPayrollRows(employee, mode) {
  const start = document.getElementById("payStart").value;
  const end = document.getElementById("payEnd").value;

  const [sumSnap, empSnap, benefitSnap, otSnap, deductionSnap] = await Promise.all([
    db.collection(SUMMARY_COLLECTION).where("dateKey", ">=", start).where("dateKey", "<=", end).get(),
    db.collection("employees").get(),
    db.collection("benefits").get().catch(() => ({ docs: [] })),
    db.collection(OT_COLLECTION).where("dateKey", ">=", start).where("dateKey", "<=", end).get().catch(() => ({ docs: [] })),
    db.collection(DEDUCTION_COLLECTION).where("dateKey", ">=", start).where("dateKey", "<=", end).get().catch(() => ({ docs: [] }))
  ]);

  const employees = {};
  empSnap.docs.forEach(d => employees[d.id] = { id: d.id, ...d.data() });

  const benefits = benefitSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(b => b.active !== false);

  let summaryRows = sumSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  let otRows = otSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(r => r.status === "approved");
  let deductionRows = deductionSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(r => r.active !== false);

  if (mode !== "admin") {
    summaryRows = summaryRows.filter(r => r.employeeId === employee.id);
    otRows = otRows.filter(r => r.employeeId === employee.id);
    deductionRows = deductionRows.filter(r => r.employeeId === employee.id);
  }

  const by = {};

  function ensureEmployeeRow(employeeId, seed = {}) {
    if (!employeeId) return null;
    const e = employees[employeeId] || {};
    by[employeeId] ||= {
      employeeId,
      employeeCode: seed.employeeCode || e.employeeCode || "",
      fullName: seed.fullName || e.fullName || "",
      department: seed.department || e.department || "",
      position: seed.position || e.position || "",
      payType: e.payType || "daily",
      dailyRate: Number(e.dailyRate || 0),
      hourlyRate: Number(e.hourlyRate || 0),
      monthlySalary: Number(e.monthlySalary || 0),
      otMultiplier: Number(e.otMultiplier || 1.5),
      standardHoursPerDay: Number(e.regularHours || 8),
      workDays: 0,
      paidLeave: 0,
      unpaidLeave: 0,
      holidaysPaid: 0,
      absentDays: 0,
      incompleteDays: 0,
      lateMinutes: 0,
      netHours: 0,
      regularHours: 0,
      approvedOtHours: 0,
      approvedOtCount: 0,
      otDetails: [],
      manualDeduct: 0,
      deductionCount: 0,
      deductionDetails: [],
      rawRows: []
    };
    return by[employeeId];
  }

  summaryRows.forEach(r => {
    const o = ensureEmployeeRow(r.employeeId, r);
    if (!o) return;
    o.rawRows.push(r);

    if (["PRESENT", "LATE"].includes(r.status)) o.workDays++;
    if (r.status === "LEAVE_PAID") o.paidLeave++;
    if (r.status === "LEAVE_UNPAID") o.unpaidLeave++;
    if (r.status === "HOLIDAY_PAID") o.holidaysPaid++;
    if (r.status === "ABSENT") o.absentDays++;
    if (r.status === "INCOMPLETE") o.incompleteDays++;

    o.lateMinutes += Number(r.lateMinutes || 0);
    o.netHours += Number(r.netHours || 0);
    o.regularHours += Number(r.regularHours || 0);
  });

  otRows.forEach(r => {
    const o = ensureEmployeeRow(r.employeeId, r);
    if (!o) return;
    const hours = getOtHours(r);
    o.approvedOtHours += hours;
    o.approvedOtCount += 1;
    o.otDetails.push({
      dateKey: r.dateKey || "",
      startTime: r.startTime || "",
      endTime: r.endTime || "",
      hours,
      reason: r.reason || ""
    });
  });

  deductionRows.forEach(r => {
    const o = ensureEmployeeRow(r.employeeId, r);
    if (!o) return;
    const amount = Number(r.amount || 0);
    if (amount <= 0) return;
    o.manualDeduct += amount;
    o.deductionCount += 1;
    o.deductionDetails.push({
      dateKey: r.dateKey || "",
      amount,
      reason: r.reason || ""
    });
  });

  return Object.values(by)
    .filter(o => o.rawRows.length || o.approvedOtCount || o.deductionCount)
    .map(o => calcPay(o, benefits, start, end));
}

function getOtHours(r) {
  const start = parseDateTime(r.dateKey, r.startTime);
  let end = parseDateTime(r.dateKey, r.endTime);
  if (!start || !end) return Number(r.hours || r.otHours || 0);
  if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  return Math.max(0, (end - start) / 36e5);
}

function calcPay(o, benefits, start, end) {
  const hourly = deriveHourly(o);

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

  const otPay = o.approvedOtHours * hourly * o.otMultiplier;
  const lateDeduct = o.lateMinutes * (hourly / 60);
  const absentDeduct = o.payType === "monthly" ? o.absentDays * (o.monthlySalary / 30) : 0;
  const unpaidLeaveDeduct = o.payType === "monthly" ? o.unpaidLeave * (o.monthlySalary / 30) : 0;

  const grossPay = basePay + benefitPay + otPay;
  const manualDeduct = Number(o.manualDeduct || 0);
  const totalDeduct = lateDeduct + absentDeduct + unpaidLeaveDeduct + manualDeduct;
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
    otPay,
    grossPay,
    lateDeduct,
    absentDeduct,
    unpaidLeaveDeduct,
    manualDeduct,
    totalDeduct,
    netPay
  };
}

function deriveHourly(o) {
  if (Number(o.hourlyRate || 0) > 0) return Number(o.hourlyRate || 0);
  if (Number(o.dailyRate || 0) > 0) return Number(o.dailyRate || 0) / Number(o.standardHoursPerDay || 8);
  if (Number(o.monthlySalary || 0) > 0) return Number(o.monthlySalary || 0) / 30 / Number(o.standardHoursPerDay || 8);
  return 0;
}

async function loadPayroll(employee, mode) {
  const list = document.getElementById("payrollList");
  const msg = document.getElementById("payrollMsg");
  list.innerHTML = `<div class="empty-state">กำลังคำนวณ...</div>`;

  try {
    const rows = await getPayrollRows(employee, mode);
    const totalOtHours = rows.reduce((sum, r) => sum + Number(r.approvedOtHours || 0), 0);
    const totalOtPay = rows.reduce((sum, r) => sum + Number(r.otPay || 0), 0);
    const totalManualDeduct = rows.reduce((sum, r) => sum + Number(r.manualDeduct || 0), 0);
    msg.textContent = rows.length
      ? `พบข้อมูล ${rows.length} คน • OT อนุมัติแล้ว ${totalOtHours.toFixed(2)} ชม. • ค่า OT ${money(totalOtPay)} บาท • หักเงินเพิ่ม ${money(totalManualDeduct)} บาท`
      : "ยังไม่มีข้อมูลในช่วงวันที่นี้";
    list.innerHTML = rows.length
      ? rows.map((r, i) => payrollCard(r, i)).join("")
      : `<div class="empty-state">ยังไม่มีข้อมูล Payroll ถ้าพึ่งแก้เวลา ให้กด “สร้างสรุปรายวันใหม่ก่อนคำนวณ”</div>`;

    rows.forEach((r, i) => {
      const btn = document.getElementById(`slip-${i}`);
      if (btn) btn.onclick = () => openSlip(r);
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
        <span class="badge">ชั่วโมงปกติ ${Number(r.regularHours || 0).toFixed(2)}</span>
        <span class="badge good">OT ${Number(r.approvedOtHours || 0).toFixed(2)} ชม.</span>
        <span class="badge good">ค่า OT ${money(r.otPay)}</span>
        <span class="badge">รายได้ ${money(r.grossPay)}</span>
        <span class="badge bad">หักเงินเพิ่ม ${money(r.manualDeduct || 0)}</span>
        <span class="badge bad">หักรวม ${money(r.totalDeduct)}</span>
        <span class="badge good">สุทธิ ${money(r.netPay)} บาท</span>
      </div>
      <button id="slip-${i}" class="secondary compact">${canPrint ? "ดู/พิมพ์ Slip" : "ดู Slip รายเดือน"}</button>
      ${r.payType === "monthly" ? `<p class="muted small">รายเดือนดูรายละเอียดได้ แต่ระบบปิดการพิมพ์เป็นค่าเริ่มต้น</p>` : ""}
    </article>`;
}

function openSlip(r) {
  const canPrint = r.payType !== "monthly";
  const otDetailHtml = r.otDetails.length
    ? `<div class="slip-ot-details"><b>รายละเอียด OT อนุมัติแล้ว</b><ul>${r.otDetails.map(o => `<li>${safeText(o.dateKey)} ${safeText(o.startTime)}-${safeText(o.endTime)} = ${Number(o.hours || 0).toFixed(2)} ชม. ${o.reason ? `• ${safeText(o.reason)}` : ""}</li>`).join("")}</ul></div>`
    : `<p class="muted">ไม่มี OT ที่อนุมัติในงวดนี้</p>`;

  const deductionDetailHtml = r.deductionDetails.length
    ? `<div class="slip-deduction-details"><b>รายละเอียดรายการหักเงิน</b><ul>${r.deductionDetails.map(d => `<li>${safeText(d.dateKey)} • หัก ${money(d.amount)} บาท • ${safeText(d.reason || "-")}</li>`).join("")}</ul></div>`
    : `<p class="muted">ไม่มีรายการหักเงินเพิ่มเติมในงวดนี้</p>`;

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
        <tr><td>ชั่วโมงสุทธิ</td><td>${Number(r.netHours || 0).toFixed(2)}</td></tr>
        <tr><td>ชั่วโมงปกติที่คิดเงิน</td><td>${Number(r.regularHours || 0).toFixed(2)}</td></tr>
        <tr><td>มาสาย</td><td>${r.lateMinutes} นาที</td></tr>
        <tr><td>OT อนุมัติแล้ว</td><td>${Number(r.approvedOtHours || 0).toFixed(2)} ชม. × ${money(r.hourly)} × ${Number(r.otMultiplier || 1.5)} = ${money(r.otPay)} บาท</td></tr>
        <tr><td>รายได้ฐาน</td><td>${money(r.basePay)} บาท</td></tr>
        <tr><td>สวัสดิการ/เงินเพิ่ม</td><td>${money(r.benefitPay)} บาท</td></tr>
        <tr><td>รายได้รวม</td><td>${money(r.grossPay)} บาท</td></tr>
        <tr><td>หักมาสาย</td><td>${money(r.lateDeduct)} บาท</td></tr>
        <tr><td>หักขาดงาน</td><td>${money(r.absentDeduct)} บาท</td></tr>
        <tr><td>หักลาไม่จ่ายเงิน</td><td>${money(r.unpaidLeaveDeduct)} บาท</td></tr>
        <tr><td>หักเงินเพิ่มเติม</td><td>${money(r.manualDeduct || 0)} บาท</td></tr>
        <tr><td>หักรวม</td><td>${money(r.totalDeduct)} บาท</td></tr>
        <tr><th>สุทธิ</th><th>${money(r.netPay)} บาท</th></tr>
      </table>

      ${otDetailHtml}
      ${deductionDetailHtml}
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
    incompleteDays: r.incompleteDays,
    lateMinutes: r.lateMinutes,
    netHours: r.netHours,
    regularHours: r.regularHours,
    approvedOtCount: r.approvedOtCount,
    approvedOtHours: r.approvedOtHours,
    otMultiplier: r.otMultiplier,
    hourly: r.hourly,
    basePay: r.basePay,
    benefitPay: r.benefitPay,
    otPay: r.otPay,
    grossPay: r.grossPay,
    lateDeduction: r.lateDeduct,
    absentDeduction: r.absentDeduct,
    unpaidLeaveDeduction: r.unpaidLeaveDeduct,
    manualDeductionCount: r.deductionCount,
    manualDeduction: r.manualDeduct,
    totalDeduction: r.totalDeduct,
    netPay: r.netPay
  })));
}

async function exportSlipCsv(employee, mode) {
  const rows = await getPayrollRows(employee, mode);
  exportCsv("payroll-slip-lines.csv", rows.flatMap(r => ([
    { employeeCode: r.employeeCode, fullName: r.fullName, line: "รายได้ฐาน", amount: r.basePay },
    { employeeCode: r.employeeCode, fullName: r.fullName, line: "สวัสดิการ/เงินเพิ่ม", amount: r.benefitPay },
    { employeeCode: r.employeeCode, fullName: r.fullName, line: "OT อนุมัติ", amount: r.otPay, hours: r.approvedOtHours, multiplier: r.otMultiplier },
    { employeeCode: r.employeeCode, fullName: r.fullName, line: "หักมาสาย", amount: -r.lateDeduct },
    { employeeCode: r.employeeCode, fullName: r.fullName, line: "หักขาดงาน", amount: -r.absentDeduct },
    { employeeCode: r.employeeCode, fullName: r.fullName, line: "หักลาไม่จ่ายเงิน", amount: -r.unpaidLeaveDeduct },
    { employeeCode: r.employeeCode, fullName: r.fullName, line: "หักเงินเพิ่มเติม", amount: -r.manualDeduct, detail: (r.deductionDetails || []).map(d => `${d.dateKey}: ${d.reason} ${d.amount}`).join(" | ") },
    { employeeCode: r.employeeCode, fullName: r.fullName, line: "สุทธิ", amount: r.netPay }
  ])));
}
