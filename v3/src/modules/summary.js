import { db } from "../core/firebase.js";
import { safeText, todayKey, parseDateTime, recTime, hoursBetween, minutesBetween, fmtDateTime, dateRange, exportCsv } from "../core/utils.js";

const STATUS_LABEL = {
  PRESENT: "ปกติ",
  LATE: "มาสาย",
  ABSENT: "ขาดงาน",
  INCOMPLETE: "ข้อมูลไม่ครบ",
  LEAVE_PAID: "ลาจ่ายเงิน",
  LEAVE_UNPAID: "ลาไม่จ่ายเงิน",
  HOLIDAY_PAID: "วันหยุดจ่ายเงิน",
  HOLIDAY_UNPAID: "วันหยุดไม่จ่ายเงิน",
  OT_OPEN: "วันหยุดเปิด OT",
  NO_SCHEDULE: "ไม่มีตารางทำงาน"
};

export async function renderSummaryModule(container, currentEmployee, mode = "admin") {
  container.innerHTML = `
    <div class="module-head">
      <div><h2>สรุปสถานะรายวัน</h2><p class="muted">ตรวจขาดงาน มาสาย ข้อมูลไม่ครบ และเตรียมข้อมูลให้ Payroll</p></div>
      <button id="rebuildSummaryBtn" class="primary compact">คำนวณ/สร้างสรุป</button>
    </div>
    <section class="card wide">
      <div class="filters">
        <input id="summaryStart" type="date"><input id="summaryEnd" type="date">
        <button id="loadSummaryBtn" class="secondary compact">โหลดสรุป</button>
        <button id="exportSummaryCsvBtn" class="secondary compact">Export CSV</button>
      </div>
      <p id="summaryMsg" class="message"></p>
      <div id="summaryStats" class="stats-grid"></div>
      <div id="summaryList" class="list"></div>
    </section>
    ${mode === "admin" ? `
    <section class="card wide danger-zone">
      <h3>เคลียร์ข้อมูลสรุปรายวัน</h3>
      <p class="muted">ลบเฉพาะข้อมูลใน attendanceSummary ตามช่วงวันที่ ไม่ลบรายการลงเวลา attendance จริง เหมาะสำหรับล้างสรุปที่คำนวณผิดแล้วกดคำนวณใหม่</p>
      <div class="filters">
        <input id="clearSummaryStart" type="date">
        <input id="clearSummaryEnd" type="date">
        <input id="clearSummaryConfirm" placeholder="พิมพ์ CLEAR เพื่อยืนยัน">
        <button id="clearSummaryBtn" class="danger compact">เคลียร์สรุปรายวัน</button>
      </div>
      <p id="clearSummaryMsg" class="message"></p>
    </section>` : ""}`;
  document.getElementById("summaryStart").value = todayKey();
  document.getElementById("summaryEnd").value = todayKey();
  if (mode === "admin") {
    document.getElementById("clearSummaryStart").value = todayKey();
    document.getElementById("clearSummaryEnd").value = todayKey();
    document.getElementById("clearSummaryBtn").onclick = () => clearDailySummary(currentEmployee);
  }
  document.getElementById("rebuildSummaryBtn").onclick = () => rebuildSummary(currentEmployee, mode);
  document.getElementById("loadSummaryBtn").onclick = () => loadSummary(currentEmployee, mode);
  document.getElementById("exportSummaryCsvBtn").onclick = () => exportSummaryCsv(currentEmployee, mode);
  await loadSummary(currentEmployee, mode);
}

async function clearDailySummary(currentEmployee) {
  const msg = document.getElementById("clearSummaryMsg");
  const btn = document.getElementById("clearSummaryBtn");
  const start = document.getElementById("clearSummaryStart").value;
  const end = document.getElementById("clearSummaryEnd").value;
  const confirmText = document.getElementById("clearSummaryConfirm").value.trim();

  if (!start || !end) {
    msg.textContent = "กรุณาเลือกวันที่เริ่มต้นและวันที่สิ้นสุด";
    return;
  }
  if (start > end) {
    msg.textContent = "วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด";
    return;
  }
  if (confirmText !== "CLEAR") {
    msg.textContent = "กรุณาพิมพ์ CLEAR เพื่อยืนยันการลบ";
    return;
  }
  if (!window.confirm(`ยืนยันลบข้อมูลสรุปรายวันตั้งแต่ ${start} ถึง ${end}?\nรายการลงเวลา attendance จริงจะไม่ถูกลบ`)) return;

  msg.textContent = "กำลังเคลียร์ข้อมูลสรุปรายวัน...";
  btn.disabled = true;
  try {
    let deleted = 0;
    while (true) {
      const snap = await db.collection("attendanceSummary")
        .where("dateKey", ">=", start)
        .where("dateKey", "<=", end)
        .limit(400)
        .get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      deleted += snap.size;
      if (snap.size < 400) break;
    }

    await db.collection("auditLogs").add({
      action: "CLEAR_DAILY_SUMMARY",
      actorId: currentEmployee?.id || "",
      actorCode: currentEmployee?.employeeCode || "",
      actorName: currentEmployee?.fullName || "",
      dateKey: todayKey(),
      clientTime: new Date().toISOString(),
      detail: { collection: "attendanceSummary", start, end, deleted },
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(() => null);

    document.getElementById("clearSummaryConfirm").value = "";
    msg.textContent = `เคลียร์สรุปรายวันสำเร็จ ${deleted} รายการ`;
    await loadSummary(currentEmployee, "admin");
  } catch (err) {
    msg.textContent = "เคลียร์ข้อมูลไม่สำเร็จ: " + err.message;
  } finally {
    btn.disabled = false;
  }
}

async function rebuildSummary(currentEmployee, mode) {
  const msg = document.getElementById("summaryMsg"), btn = document.getElementById("rebuildSummaryBtn");
  msg.textContent = "กำลังคำนวณ...";
  btn.disabled = true;
  try {
    const start = document.getElementById("summaryStart").value;
    const end = document.getElementById("summaryEnd").value;
    const empSnap = mode === "admin"
      ? await db.collection("employees").get()
      : { docs: [await db.collection("employees").doc(currentEmployee.id).get()] };
    const employees = empSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.active !== false && (mode === "admin" || e.id === currentEmployee.id));
    let count = 0;
    for (const dk of dateRange(start, end)) {
      for (const emp of employees) {
        await rebuildDailySummary(emp, dk);
        count++;
      }
    }
    msg.textContent = `คำนวณสำเร็จ ${count} รายการ`;
    await loadSummary(currentEmployee, mode);
  } catch (err) {
    msg.textContent = "คำนวณไม่สำเร็จ: " + err.message;
  } finally {
    btn.disabled = false;
  }
}

export async function rebuildDailySummaryForEmployee(employeeId, dateKey) {
  if (!employeeId || !dateKey) return null;
  const doc = await db.collection("employees").doc(employeeId).get();
  if (!doc.exists) return null;
  return rebuildDailySummary({ id: doc.id, ...doc.data() }, dateKey);
}

async function rebuildDailySummary(emp, dateKey) {
  const summary = await computeDailySummary(emp, dateKey);
  await db.collection("attendanceSummary").doc(`${dateKey}_${emp.id}`).set(summary, { merge: true });
  return summary;
}

async function computeDailySummary(emp, dateKey) {
  const [attSnap, calDoc, leaveSnap] = await Promise.all([
    db.collection("attendance").where("employeeId", "==", emp.id).where("dateKey", "==", dateKey).get(),
    db.collection("calendarEvents").doc(dateKey).get().catch(() => null),
    db.collection("leaveRequests").where("employeeId", "==", emp.id).where("status", "==", "approved").get().catch(() => ({ docs: [] }))
  ]);

  const calendar = calDoc?.exists ? calDoc.data() : defaultCalendar(dateKey);
  const leave = findLeaveForDate(leaveSnap.docs.map(d => ({ id: d.id, ...d.data() })), dateKey);

  const allRows = attSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const raw = allRows
    .filter(isUsableAttendance)
    .sort((a, b) => (recTime(a)?.getTime() || 0) - (recTime(b)?.getTime() || 0));

  const firstIn = raw.filter(r => r.type === "IN")[0] || null;
  const lastOut = raw.filter(r => r.type === "OUT").at(-1) || null;
  const startTime = firstIn ? recTime(firstIn) : null;
  const endTime = lastOut ? recTime(lastOut) : null;

  const shiftStart = emp.shiftStart || "08:00";
  const shiftEnd = emp.shiftEnd || "17:00";
  const breakMinutes = Number(emp.breakMinutes ?? 60);
  const regular = Number(emp.regularHours || 8);
  const lateGraceMinutes = Number(emp.lateGraceMinutes || 0);
  const scheduledStart = parseDateTime(dateKey, shiftStart);
  const grossHours = startTime && endTime ? hoursBetween(startTime, endTime) : 0;
  const netHours = Math.max(0, grossHours - (grossHours >= 5 ? breakMinutes / 60 : 0));
  const lateMinutesRaw = startTime && scheduledStart && startTime > scheduledStart ? minutesBetween(scheduledStart, startTime) : 0;
  const lateMinutes = Math.max(0, lateMinutesRaw - lateGraceMinutes);

  const isWorkday = calendar.type === "workday" || calendar.type === "payday" || !calendar.type;
  let status = "PRESENT";
  if (leave) status = leave.payMode === "unpaid" || leave.leaveType === "unpaid" ? "LEAVE_UNPAID" : "LEAVE_PAID";
  else if (calendar.type === "holiday_paid") status = "HOLIDAY_PAID";
  else if (calendar.type === "holiday_unpaid") status = "HOLIDAY_UNPAID";
  else if (calendar.type === "ot_open") status = raw.length ? "PRESENT" : "OT_OPEN";
  else if (isWorkday) {
    if (!raw.length) status = "ABSENT";
    else if (!firstIn || !lastOut) status = "INCOMPLETE";
    else if (lateMinutes > 0) status = "LATE";
    else status = "PRESENT";
  } else status = raw.length ? "PRESENT" : "NO_SCHEDULE";

  return {
    employeeId: emp.id,
    employeeCode: emp.employeeCode || "",
    fullName: emp.fullName || "",
    department: emp.department || "",
    position: emp.position || "",
    dateKey,
    calendarType: calendar.type || "workday",
    calendarTitle: calendar.title || "",
    isPaidDay: calendar.type === "workday" ? true : Boolean(calendar.isPaid),
    shiftStart,
    shiftEnd,
    breakMinutes,
    lateGraceMinutes,
    firstInId: firstIn?.id || "",
    lastOutId: lastOut?.id || "",
    clockInText: startTime ? fmtDateTime(startTime) : "",
    clockOutText: endTime ? fmtDateTime(endTime) : "",
    rawCount: raw.length,
    ignoredCount: allRows.length - raw.length,
    grossHours,
    netHours,
    regularHours: Math.min(netHours, regular),
    lateMinutes,
    status,
    statusLabel: STATUS_LABEL[status] || status,
    leaveRequestId: leave?.id || "",
    leaveType: leave?.leaveType || "",
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
}

function isUsableAttendance(r) {
  if (!r || !["IN", "OUT"].includes(r.type)) return false;
  if (r.approvedForUse === false) return false;
  if (["pending", "rejected"].includes(r.geofenceApprovalStatus)) return false;
  if (["pending_geofence_approval", "rejected_geofence"].includes(r.attendanceStatus)) return false;
  return true;
}

function defaultCalendar(dateKey) {
  const d = new Date(`${dateKey}T00:00:00`);
  return d.getDay() === 0 ? { type: "holiday_unpaid", title: "วันอาทิตย์", isPaid: false } : { type: "workday", title: "วันทำงาน", isPaid: true };
}

function findLeaveForDate(rows, dateKey) {
  return rows.find(r => {
    const start = r.startDate || r.leaveStart || r.dateKey;
    const end = r.endDate || r.leaveEnd || start;
    return start <= dateKey && dateKey <= end;
  }) || null;
}

async function loadSummary(currentEmployee, mode) {
  const list = document.getElementById("summaryList");
  const stats = document.getElementById("summaryStats");
  const start = document.getElementById("summaryStart").value;
  const end = document.getElementById("summaryEnd").value;
  list.innerHTML = `<div class="empty-state"><p>กำลังโหลด...</p></div>`;
  stats.innerHTML = "";
  try {
    const snap = await db.collection("attendanceSummary").where("dateKey", ">=", start).where("dateKey", "<=", end).get();
    let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (mode !== "admin") rows = rows.filter(r => r.employeeId === currentEmployee.id);
    rows.sort((a, b) => String(b.dateKey).localeCompare(String(a.dateKey)) || String(a.employeeCode).localeCompare(String(b.employeeCode)));
    renderStats(stats, rows);
    list.innerHTML = rows.length ? rows.map(summaryCard).join("") : `<div class="empty-state"><h3>ยังไม่มีสรุป</h3><p>กด “คำนวณ/สร้างสรุป” ก่อน</p></div>`;
  } catch (err) {
    list.innerHTML = `<div class="empty-state error-text"><p>${safeText(err.message)}</p></div>`;
  }
}

function renderStats(stats, rows) {
  const count = key => rows.filter(r => r.status === key).length;
  stats.innerHTML = `<div class="stat-card"><b>${rows.length}</b><span>ทั้งหมด</span></div><div class="stat-card"><b>${count("PRESENT")}</b><span>ปกติ</span></div><div class="stat-card"><b>${count("LATE")}</b><span>มาสาย</span></div><div class="stat-card"><b>${count("ABSENT")}</b><span>ขาดงาน</span></div><div class="stat-card"><b>${count("INCOMPLETE")}</b><span>ข้อมูลไม่ครบ</span></div><div class="stat-card"><b>${count("LEAVE_PAID") + count("LEAVE_UNPAID")}</b><span>ลา</span></div>`;
}

function summaryCard(r) {
  const cls = { PRESENT: "good", LATE: "warn", ABSENT: "bad", INCOMPLETE: "warn", LEAVE_PAID: "info", LEAVE_UNPAID: "info" }[r.status] || "";
  return `<article class="summary-card"><h3>${safeText(r.dateKey)} • ${safeText(r.employeeCode)} ${safeText(r.fullName)}</h3><p class="muted">${safeText(r.department || "-")} • ${safeText(r.position || "-")}</p><div class="badges"><span class="badge ${cls}">${safeText(r.statusLabel || r.status)}</span><span class="badge">เข้า: ${safeText(r.clockInText || "-")}</span><span class="badge">ออก: ${safeText(r.clockOutText || "-")}</span><span class="badge">สุทธิ: ${Number(r.netHours || 0).toFixed(2)} ชม.</span><span class="badge">สาย: ${Number(r.lateMinutes || 0)} นาที</span>${Number(r.ignoredCount || 0) ? `<span class="badge warn">ไม่นับ ${Number(r.ignoredCount || 0)}</span>` : ""}</div></article>`;
}

async function exportSummaryCsv(currentEmployee, mode) {
  const start = document.getElementById("summaryStart").value;
  const end = document.getElementById("summaryEnd").value;
  const snap = await db.collection("attendanceSummary").where("dateKey", ">=", start).where("dateKey", "<=", end).get();
  let rows = snap.docs.map(d => d.data());
  if (mode !== "admin") rows = rows.filter(r => r.employeeId === currentEmployee.id);
  exportCsv(`attendance-summary-${start}-${end}.csv`, rows.map(r => ({
    dateKey: r.dateKey,
    employeeCode: r.employeeCode,
    fullName: r.fullName,
    department: r.department,
    position: r.position,
    status: r.status,
    statusLabel: r.statusLabel,
    calendarType: r.calendarType,
    clockInText: r.clockInText,
    clockOutText: r.clockOutText,
    netHours: r.netHours,
    regularHours: r.regularHours,
    lateMinutes: r.lateMinutes,
    rawCount: r.rawCount,
    ignoredCount: r.ignoredCount
  })));
}
