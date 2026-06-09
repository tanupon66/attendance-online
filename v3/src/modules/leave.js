import { db } from "../core/firebase.js";
import { safeText, todayKey } from "../core/utils.js";

const TYPE_LABEL = {
  personal: "ลากิจ",
  sick: "ลาป่วย",
  vacation: "ลาพักร้อน",
  unpaid: "ลาไม่จ่ายเงิน",
  absent: "ขาดงาน"
};

const UNIT_LABEL = {
  full: "เต็มวัน",
  half: "ครึ่งวัน",
  hourly: "รายชั่วโมง"
};

const PAY_LABEL = {
  paid: "ลาจ่ายเงิน",
  unpaid: "ลาไม่จ่ายเงิน"
};

export async function renderLeaveModule(container, employee, mode = "employee") {
  container.innerHTML = `
    <div class="module-head">
      <div>
        <h2>ระบบวันลา</h2>
        <p class="muted">เช็คสิทธิ์วันลา คงเหลือ อนุมัติ และแจ้งเตือนพนักงาน</p>
      </div>
      <button id="reloadLeaveBtn" class="secondary compact">โหลดใหม่</button>
    </div>

    ${mode === "admin" ? adminEntitlementPanel() : employeeEntitlementPanel()}

    ${mode === "employee" ? requestForm() : adminLeaveTools()}

    <section class="card wide">
      <h3>${mode === "admin" ? "คำขอลาทั้งหมด" : "ประวัติวันลาของฉัน"}</h3>
      <div id="leaveList" class="list"></div>
    </section>
  `;

  document.getElementById("reloadLeaveBtn").onclick = () => renderLeaveModule(container, employee, mode);

  if (mode === "employee") {
    document.getElementById("leaveStart").value = todayKey();
    document.getElementById("leaveEnd").value = todayKey();
    document.getElementById("submitLeaveBtn").onclick = () => submitLeave(employee);
    document.getElementById("leaveType").onchange = () => refreshMyEntitlements(employee);
    document.getElementById("leaveUnit").onchange = updateHoursByUnit;
    await refreshMyEntitlements(employee);
  } else {
    document.getElementById("saveEntitlementBtn").onclick = saveEntitlementByCode;
    document.getElementById("loadEntitlementBtn").onclick = loadEntitlementByCode;
  }

  await loadLeave(employee, mode);
}

function employeeEntitlementPanel() {
  return `
    <section class="card wide">
      <div class="section-title">
        <div>
          <h3>สิทธิ์วันลาของฉัน</h3>
          <p class="muted">แสดงสิทธิ์รายปี ใช้ไป รอดำเนินการ และคงเหลือ</p>
        </div>
      </div>
      <div id="myLeaveEntitlements" class="leave-quota-grid"></div>
    </section>
  `;
}

function adminEntitlementPanel() {
  return `
    <section class="card wide">
      <h3>กำหนดสิทธิ์วันลา</h3>
      <p class="muted">กำหนดเป็นชั่วโมงต่อปี แยกตามพนักงาน เพราะแต่ละคนไม่เท่ากัน</p>
      <div class="form-grid">
        <label>รหัสพนักงาน</label><input id="entEmpCode" placeholder="เช่น 001">
        <label>ปี</label><input id="entYear" type="number" value="${new Date().getFullYear()}">
        <label>ลากิจ/ปี (ชม.)</label><input id="entPersonal" type="number" step="0.25" value="0">
        <label>ลาป่วย/ปี (ชม.)</label><input id="entSick" type="number" step="0.25" value="0">
        <label>ลาพักร้อน/ปี (ชม.)</label><input id="entVacation" type="number" step="0.25" value="0">
        <label>หมายเหตุ</label><input id="entNote" placeholder="เช่น ทดลองงาน / พนักงานประจำ">
      </div>
      <div class="actions-row">
        <button id="loadEntitlementBtn" class="secondary">โหลดสิทธิ์</button>
        <button id="saveEntitlementBtn" class="primary">บันทึกสิทธิ์</button>
      </div>
      <p id="entitlementMsg" class="message"></p>
    </section>
  `;
}

function requestForm() {
  return `
    <section class="card wide">
      <h3>ส่งคำขอลา</h3>
      <div class="form-grid">
        <label>ประเภทลา</label>
        <select id="leaveType">
          <option value="personal">ลากิจ</option>
          <option value="sick">ลาป่วย</option>
          <option value="vacation">ลาพักร้อน</option>
          <option value="unpaid">ลาไม่จ่ายเงิน</option>
        </select>

        <label>รูปแบบ</label>
        <select id="leaveUnit">
          <option value="full">เต็มวัน</option>
          <option value="half">ครึ่งวัน</option>
          <option value="hourly">รายชั่วโมง</option>
        </select>

        <label>จ่ายเงิน</label>
        <select id="leavePayMode">
          <option value="paid">ลาจ่ายเงิน</option>
          <option value="unpaid">ลาไม่จ่ายเงิน</option>
        </select>

        <label>วันที่เริ่ม</label><input id="leaveStart" type="date">
        <label>วันที่สิ้นสุด</label><input id="leaveEnd" type="date">
        <label>จำนวนชั่วโมง</label><input id="leaveHours" type="number" step="0.25" value="8">
        <label>เหตุผล</label><input id="leaveReason">
      </div>
      <button id="submitLeaveBtn" class="primary">ส่งคำขอลา</button>
      <p id="leaveMsg" class="message"></p>
    </section>`;
}

function adminLeaveTools() {
  return `
    <section class="card wide">
      <h3>เครื่องมือผู้ดูแล</h3>
      <p class="muted">อนุมัติหรือไม่อนุมัติคำขอ ระบบจะอัปเดตสิทธิ์และส่งแจ้งเตือนไปยังพนักงาน</p>
    </section>
  `;
}

function updateHoursByUnit() {
  const unit = document.getElementById("leaveUnit").value;
  const hours = document.getElementById("leaveHours");
  if (unit === "full") hours.value = 8;
  if (unit === "half") hours.value = 4;
  if (unit === "hourly" && Number(hours.value || 0) <= 0) hours.value = 1;
}

async function getEmployeeByCode(code) {
  const snap = await db.collection("employees").where("employeeCode", "==", code).limit(1).get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

function entitlementDocId(employeeId, year) {
  return `${year}_${employeeId}`;
}

async function loadEntitlement(employeeId, year) {
  const doc = await db.collection("leaveEntitlements").doc(entitlementDocId(employeeId, year)).get();
  if (doc.exists) return { id: doc.id, ...doc.data() };
  return {
    employeeId,
    year,
    personalHours: 0,
    sickHours: 0,
    vacationHours: 0
  };
}

async function usedLeaveHours(employeeId, year) {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const snap = await db.collection("leaveRequests").get();

  const out = {
    personal: { approved: 0, pending: 0 },
    sick: { approved: 0, pending: 0 },
    vacation: { approved: 0, pending: 0 },
    unpaid: { approved: 0, pending: 0 }
  };

  snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(r => r.employeeId === employeeId)
    .filter(r => (r.startDate || "") <= end && (r.endDate || "") >= start)
    .forEach(r => {
      const type = r.leaveType || "personal";
      if (!out[type]) out[type] = { approved: 0, pending: 0 };
      if (r.status === "approved") out[type].approved += Number(r.hours || 0);
      if (r.status === "pending") out[type].pending += Number(r.hours || 0);
    });

  return out;
}

async function refreshMyEntitlements(employee) {
  const box = document.getElementById("myLeaveEntitlements");
  if (!box) return;
  box.innerHTML = `<div class="empty-state">กำลังโหลดสิทธิ์...</div>`;

  const year = new Date().getFullYear();
  const ent = await loadEntitlement(employee.id, year);
  const used = await usedLeaveHours(employee.id, year);

  const rows = [
    quotaRow("personal", "ลากิจ", Number(ent.personalHours || 0), used.personal),
    quotaRow("sick", "ลาป่วย", Number(ent.sickHours || 0), used.sick),
    quotaRow("vacation", "ลาพักร้อน", Number(ent.vacationHours || 0), used.vacation),
    quotaRow("unpaid", "ลาไม่จ่ายเงิน", 0, used.unpaid, true)
  ];

  box.innerHTML = rows.join("");
}

function quotaRow(type, label, total, used = {}, unlimited = false) {
  const approved = Number(used.approved || 0);
  const pending = Number(used.pending || 0);
  const remain = unlimited ? "ไม่จำกัด" : Math.max(0, total - approved - pending).toFixed(2);
  const percent = unlimited || total <= 0 ? 0 : Math.min(100, Math.round(((approved + pending) / total) * 100));
  return `
    <article class="quota-card">
      <div>
        <b>${label}</b>
        <span>${unlimited ? "ไม่ใช้โควตา" : `ทั้งหมด ${total.toFixed(2)} ชม.`}</span>
      </div>
      <div class="quota-bar"><i style="width:${percent}%"></i></div>
      <div class="quota-meta">
        <span>ใช้แล้ว ${approved.toFixed(2)}</span>
        <span>รอ ${pending.toFixed(2)}</span>
        <span>คงเหลือ ${remain}</span>
      </div>
    </article>
  `;
}

async function loadEntitlementByCode() {
  const msg = document.getElementById("entitlementMsg");
  const code = document.getElementById("entEmpCode").value.trim();
  const year = Number(document.getElementById("entYear").value || new Date().getFullYear());
  if (!code) { msg.textContent = "กรอกรหัสพนักงาน"; return; }

  const emp = await getEmployeeByCode(code);
  if (!emp) { msg.textContent = "ไม่พบพนักงาน"; return; }

  const ent = await loadEntitlement(emp.id, year);
  document.getElementById("entPersonal").value = ent.personalHours || 0;
  document.getElementById("entSick").value = ent.sickHours || 0;
  document.getElementById("entVacation").value = ent.vacationHours || 0;
  document.getElementById("entNote").value = ent.note || "";
  msg.textContent = `โหลดสิทธิ์ของ ${emp.fullName || emp.employeeCode} แล้ว`;
}

async function saveEntitlementByCode() {
  const msg = document.getElementById("entitlementMsg");
  const code = document.getElementById("entEmpCode").value.trim();
  const year = Number(document.getElementById("entYear").value || new Date().getFullYear());
  if (!code) { msg.textContent = "กรอกรหัสพนักงาน"; return; }

  const emp = await getEmployeeByCode(code);
  if (!emp) { msg.textContent = "ไม่พบพนักงาน"; return; }

  const data = {
    employeeId: emp.id,
    employeeCode: emp.employeeCode,
    fullName: emp.fullName || "",
    year,
    personalHours: Number(document.getElementById("entPersonal").value || 0),
    sickHours: Number(document.getElementById("entSick").value || 0),
    vacationHours: Number(document.getElementById("entVacation").value || 0),
    note: document.getElementById("entNote").value.trim(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  await db.collection("leaveEntitlements").doc(entitlementDocId(emp.id, year)).set(data, { merge: true });
  msg.textContent = "บันทึกสิทธิ์วันลาแล้ว";
}

async function submitLeave(employee) {
  const msg = document.getElementById("leaveMsg");
  const leaveType = document.getElementById("leaveType").value;
  const payMode = document.getElementById("leavePayMode").value;
  const hours = Number(document.getElementById("leaveHours").value || 0);
  const year = new Date(document.getElementById("leaveStart").value || todayKey()).getFullYear();

  if (!document.getElementById("leaveStart").value || !document.getElementById("leaveEnd").value) {
    msg.textContent = "เลือกวันที่";
    return;
  }
  if (hours <= 0) {
    msg.textContent = "จำนวนชั่วโมงต้องมากกว่า 0";
    return;
  }

  if (payMode === "paid" && ["personal", "sick", "vacation"].includes(leaveType)) {
    const ent = await loadEntitlement(employee.id, year);
    const used = await usedLeaveHours(employee.id, year);
    const total = Number(ent[`${leaveType}Hours`] || 0);
    const usedTotal = Number(used[leaveType]?.approved || 0) + Number(used[leaveType]?.pending || 0);
    const remain = total - usedTotal;

    if (hours > remain) {
      msg.textContent = `สิทธิ์ไม่พอ เหลือ ${Math.max(0, remain).toFixed(2)} ชม.`;
      return;
    }
  }

  const data = {
    employeeId: employee.id,
    employeeCode: employee.employeeCode,
    fullName: employee.fullName,
    leaveType,
    unit: document.getElementById("leaveUnit").value,
    payMode,
    startDate: document.getElementById("leaveStart").value,
    endDate: document.getElementById("leaveEnd").value,
    hours,
    reason: document.getElementById("leaveReason").value.trim(),
    status: "pending",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  await db.collection("leaveRequests").add(data);
  msg.textContent = "ส่งคำขอลาแล้ว";
  await refreshMyEntitlements(employee);
  await loadLeave(employee, "employee");
}

async function loadLeave(employee, mode) {
  const list = document.getElementById("leaveList");
  list.innerHTML = `<div class="empty-state"><p>กำลังโหลด...</p></div>`;

  try {
    const snap = await db.collection("leaveRequests").get();
    let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (mode !== "admin") rows = rows.filter(r => r.employeeId === employee.id);
    rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

    list.innerHTML = rows.length
      ? rows.map(r => card(r, mode)).join("")
      : `<div class="empty-state"><p>ยังไม่มีข้อมูล</p></div>`;

    if (mode === "admin") {
      rows.forEach(r => {
        if (r.status === "pending") {
          document.getElementById(`approve-${r.id}`).onclick = () => updateStatus(r, "approved");
          document.getElementById(`reject-${r.id}`).onclick = () => updateStatus(r, "rejected");
        }
      });
    }
  } catch (err) {
    list.innerHTML = `<div class="empty-state error-text"><p>${safeText(err.message)}</p></div>`;
  }
}

function card(r, mode) {
  return `
    <article class="summary-card">
      <h3>${safeText(r.employeeCode)} ${safeText(r.fullName)} • ${safeText(TYPE_LABEL[r.leaveType] || r.leaveType)}</h3>
      <p class="muted">
        ${safeText(r.startDate)} ถึง ${safeText(r.endDate)}
        • ${Number(r.hours || 0)} ชม.
        • ${safeText(UNIT_LABEL[r.unit] || r.unit)}
        • ${safeText(PAY_LABEL[r.payMode] || r.payMode)}
      </p>
      <div class="badges">
        <span class="badge ${r.status === "approved" ? "good" : r.status === "rejected" ? "bad" : "warn"}">${safeText(r.status)}</span>
        <span class="badge">${safeText(r.reason || "-")}</span>
      </div>
      ${mode === "admin" && r.status === "pending"
        ? `<div class="actions-row"><button id="approve-${r.id}" class="good compact">อนุมัติ</button><button id="reject-${r.id}" class="danger compact">ไม่อนุมัติ</button></div>`
        : ""}
    </article>`;
}

async function updateStatus(r, status) {
  await db.collection("leaveRequests").doc(r.id).update({
    status,
    reviewedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  await db.collection("notifications").add({
    employeeId: r.employeeId,
    employeeCode: r.employeeCode,
    title: status === "approved" ? "คำขอลาอนุมัติแล้ว" : "คำขอลาถูกปฏิเสธ",
    message: `${TYPE_LABEL[r.leaveType] || r.leaveType} วันที่ ${r.startDate} ถึง ${r.endDate}`,
    type: "leave",
    read: false,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(console.warn);

  await loadLeave({}, "admin");
}
