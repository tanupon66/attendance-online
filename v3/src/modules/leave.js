import { db } from "../core/firebase.js";
import { safeText, todayKey } from "../core/utils.js";

const TYPE_LABEL = {
  personal: "ลากิจ",
  sick: "ลาป่วย",
  vacation: "ลาพักร้อน",
  unpaid: "ลาไม่จ่ายเงิน",
  absent: "ขาดงาน"
};

export async function renderLeaveModule(container, employee, mode="employee") {
  container.innerHTML = `
    <div class="module-head">
      <div><h2>ระบบวันลา</h2><p class="muted">รองรับลาจ่ายเงิน ลาไม่จ่ายเงิน ลาครึ่งวัน และลารายชั่วโมง</p></div>
      <button id="reloadLeaveBtn" class="secondary compact">โหลดใหม่</button>
    </div>

    ${mode === "employee" ? requestForm() : ""}

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
  }
  await loadLeave(employee, mode);
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

async function submitLeave(employee) {
  const msg = document.getElementById("leaveMsg");
  const data = {
    employeeId: employee.id,
    employeeCode: employee.employeeCode,
    fullName: employee.fullName,
    leaveType: document.getElementById("leaveType").value,
    unit: document.getElementById("leaveUnit").value,
    payMode: document.getElementById("leavePayMode").value,
    startDate: document.getElementById("leaveStart").value,
    endDate: document.getElementById("leaveEnd").value,
    hours: Number(document.getElementById("leaveHours").value || 0),
    reason: document.getElementById("leaveReason").value.trim(),
    status: "pending",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  if (!data.startDate || !data.endDate) { msg.textContent = "เลือกวันที่"; return; }
  await db.collection("leaveRequests").add(data);
  msg.textContent = "ส่งคำขอลาแล้ว";
  await loadLeave(employee, "employee");
}

async function loadLeave(employee, mode) {
  const list = document.getElementById("leaveList");
  list.innerHTML = `<div class="empty-state"><p>กำลังโหลด...</p></div>`;
  try {
    const snap = await db.collection("leaveRequests").get();
    let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (mode !== "admin") rows = rows.filter(r => r.employeeId === employee.id);
    rows.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    list.innerHTML = rows.length ? rows.map(r => card(r, mode)).join("") : `<div class="empty-state"><p>ยังไม่มีข้อมูล</p></div>`;
    if (mode === "admin") {
      rows.forEach(r => {
        document.getElementById(`approve-${r.id}`).onclick = () => updateStatus(r, "approved");
        document.getElementById(`reject-${r.id}`).onclick = () => updateStatus(r, "rejected");
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
      <p class="muted">${safeText(r.startDate)} ถึง ${safeText(r.endDate)} • ${Number(r.hours || 0)} ชม. • ${safeText(r.payMode)}</p>
      <div class="badges">
        <span class="badge ${r.status === "approved" ? "good" : r.status === "rejected" ? "bad" : "warn"}">${safeText(r.status)}</span>
        <span class="badge">${safeText(r.unit)}</span>
      </div>
      ${r.reason ? `<p>${safeText(r.reason)}</p>` : ""}
      ${mode === "admin" && r.status === "pending" ? `<div class="actions-row"><button id="approve-${r.id}" class="good compact">อนุมัติ</button><button id="reject-${r.id}" class="danger compact">ไม่อนุมัติ</button></div>` : ""}
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
