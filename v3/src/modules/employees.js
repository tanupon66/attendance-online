import { db } from "../core/firebase.js";
import { safeText, sha256 } from "../core/utils.js";

export async function renderEmployeesModule(container) {
  container.innerHTML = `
    <div class="module-head">
      <div><h2>จัดการพนักงาน</h2><p class="muted">เพิ่ม แก้ไข ปิดใช้งาน และกำหนดข้อมูลค่าแรง</p></div>
      <button id="newEmployeeBtn" class="primary compact">+ เพิ่มพนักงาน</button>
    </div>

    <div id="employeeFormCard" class="card form-card hidden">
      <input id="empId" type="hidden">
      <div class="form-grid">
        <label>รหัส *</label><input id="empCode">
        <label>ชื่อ *</label><input id="empName">
        <label>PIN</label><input id="empPin" placeholder="ใส่เมื่อต้องการเปลี่ยน PIN">
        <label>แผนก</label><input id="empDept">
        <label>ตำแหน่ง</label><input id="empPosition">
        <label>สิทธิ์</label><select id="empRole"><option value="employee">พนักงาน</option><option value="admin">ผู้ดูแลระบบ</option></select>
        <label>วิธีจ่าย</label><select id="empPayType"><option value="daily">รายวัน</option><option value="hourly">รายชั่วโมง</option><option value="monthly">รายเดือน</option></select>
        <label>ค่าแรง/ชม.</label><input id="empHourly" type="number" step="0.01" value="0">
        <label>ค่าแรง/วัน</label><input id="empDaily" type="number" step="0.01" value="0">
        <label>เงินเดือน</label><input id="empMonthly" type="number" step="0.01" value="0">
        <label>OT x</label><input id="empOt" type="number" step="0.01" value="1.5">
        <label>เริ่มงาน</label><input id="empShiftStart" type="time" value="08:00">
        <label>เลิกงาน</label><input id="empShiftEnd" type="time" value="17:00">
        <label>พักนาที</label><input id="empBreak" type="number" value="60">
        <label>ใช้งาน</label><label class="check"><input id="empActive" type="checkbox" checked> ใช้งาน</label>
      </div>
      <div class="actions-row">
        <button id="saveEmployeeBtn" class="primary">บันทึก</button>
        <button id="cancelEmployeeBtn" class="secondary">ยกเลิก</button>
      </div>
      <p id="employeeFormMsg" class="message"></p>
    </div>

    <div class="toolbar">
      <input id="employeeSearch" placeholder="ค้นหารหัส ชื่อ แผนก...">
      <button id="reloadEmployeesBtn" class="secondary compact">โหลดใหม่</button>
    </div>
    <div id="employeeList" class="employee-grid"></div>
  `;
  document.getElementById("newEmployeeBtn").onclick = () => openForm();
  document.getElementById("cancelEmployeeBtn").onclick = () => document.getElementById("employeeFormCard").classList.add("hidden");
  document.getElementById("saveEmployeeBtn").onclick = saveEmployee;
  document.getElementById("reloadEmployeesBtn").onclick = loadEmployees;
  document.getElementById("employeeSearch").oninput = loadEmployees;
  await loadEmployees();
}

function set(id, v) { document.getElementById(id).value = v ?? ""; }

function openForm(e = null) {
  document.getElementById("employeeFormCard").classList.remove("hidden");
  set("empId", e?.id || "");
  set("empCode", e?.employeeCode || "");
  set("empName", e?.fullName || "");
  set("empPin", "");
  set("empDept", e?.department || "");
  set("empPosition", e?.position || "");
  set("empRole", e?.role || "employee");
  set("empPayType", e?.payType || "daily");
  set("empHourly", e?.hourlyRate || 0);
  set("empDaily", e?.dailyRate || 0);
  set("empMonthly", e?.monthlySalary || 0);
  set("empOt", e?.otMultiplier || 1.5);
  set("empShiftStart", e?.shiftStart || "08:00");
  set("empShiftEnd", e?.shiftEnd || "17:00");
  set("empBreak", e?.breakMinutes ?? 60);
  document.getElementById("empActive").checked = e?.active !== false;
}

async function loadEmployees() {
  const list = document.getElementById("employeeList");
  const kw = (document.getElementById("employeeSearch")?.value || "").toLowerCase();
  list.innerHTML = `<div class="empty-state">โหลด...</div>`;
  try {
    const snap = await db.collection("employees").get();
    let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    rows.sort((a,b)=>String(a.employeeCode||"").localeCompare(String(b.employeeCode||"")));
    if (kw) rows = rows.filter(e => [e.employeeCode,e.fullName,e.department,e.position].some(v => String(v||"").toLowerCase().includes(kw)));
    list.innerHTML = rows.map(e => `
      <article class="employee-card">
        <div class="avatar">${safeText(String(e.fullName||e.employeeCode||"?").slice(0,1))}</div>
        <div class="employee-info">
          <h3>${safeText(e.employeeCode)} • ${safeText(e.fullName)}</h3>
          <p>${safeText(e.department||"-")} • ${safeText(e.position||"-")}</p>
          <div class="badges">
            <span class="badge">${safeText(e.role||"employee")}</span>
            <span class="badge">${safeText(e.payType||"daily")}</span>
            <span class="badge ${e.active===false?"bad":"good"}">${e.active===false?"ปิด":"ใช้งาน"}</span>
          </div>
        </div>
        <div class="card-actions">
          <button id="edit-${e.id}" class="secondary compact">แก้ไข</button>
          <button id="toggle-${e.id}" class="danger compact">${e.active===false?"เปิด":"ปิด"}</button>
        </div>
      </article>
    `).join("") || `<div class="empty-state">ไม่มีข้อมูล</div>`;
    rows.forEach(e => {
      document.getElementById(`edit-${e.id}`).onclick = () => openForm(e);
      document.getElementById(`toggle-${e.id}`).onclick = () => toggleEmployee(e);
    });
  } catch (err) {
    list.innerHTML = `<div class="empty-state error-text">${safeText(err.message)}</div>`;
  }
}

async function toggleEmployee(e) {
  await db.collection("employees").doc(e.id).update({ active: e.active === false, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  await loadEmployees();
}

async function saveEmployee() {
  const id = document.getElementById("empId").value;
  const code = document.getElementById("empCode").value.trim();
  const name = document.getElementById("empName").value.trim();
  const pin = document.getElementById("empPin").value.trim();
  const msg = document.getElementById("employeeFormMsg");

  if (!code || !name) { msg.textContent = "กรอกข้อมูล"; return; }
  if (!id && !pin) { msg.textContent = "พนักงานใหม่ต้องมี PIN"; return; }

  const data = {
    employeeCode: code,
    fullName: name,
    department: document.getElementById("empDept").value.trim(),
    position: document.getElementById("empPosition").value.trim(),
    role: document.getElementById("empRole").value,
    payType: document.getElementById("empPayType").value,
    hourlyRate: Number(document.getElementById("empHourly").value || 0),
    dailyRate: Number(document.getElementById("empDaily").value || 0),
    monthlySalary: Number(document.getElementById("empMonthly").value || 0),
    otMultiplier: Number(document.getElementById("empOt").value || 1.5),
    shiftStart: document.getElementById("empShiftStart").value || "08:00",
    shiftEnd: document.getElementById("empShiftEnd").value || "17:00",
    breakMinutes: Number(document.getElementById("empBreak").value || 60),
    active: document.getElementById("empActive").checked,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  if (pin) data.pinHash = await sha256(pin);
  if (id) await db.collection("employees").doc(id).update(data);
  else await db.collection("employees").add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });

  document.getElementById("employeeFormCard").classList.add("hidden");
  await loadEmployees();
}
