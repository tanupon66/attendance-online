import { db } from "../core/firebase.js";
import { safeText, todayKey, money } from "../core/utils.js";

const BENEFIT_COLLECTION = "benefits";

export async function renderBenefitsModule(container, employee) {
  container.innerHTML = `
    <div class="module-head">
      <div>
        <h2>สวัสดิการ / เงินเพิ่ม</h2>
        <p class="muted">กำหนดสวัสดิการรายพนักงาน แล้วให้ Payroll นำไปคิดในสลิปอัตโนมัติ</p>
      </div>
    </div>

    <section class="card wide benefit-form-card">
      <h3>เพิ่มสวัสดิการให้พนักงาน</h3>
      <p class="muted small">
        เลือกได้ 3 แบบ: คิดตามวันทำงาน, เงินบวกรายเดือน, และเงินพิเศษครั้งเดียว ระบบจะนำไปแสดงใน Slip และ Export Payroll CSV
      </p>
      <div class="form-grid benefit-form-grid">
        <label>พนักงาน
          <select id="benefitEmployee"></select>
        </label>
        <label>ชื่อสวัสดิการ / เงินเพิ่ม
          <input id="benefitName" type="text" maxlength="120" placeholder="เช่น ค่าอาหาร / ค่าเดินทาง / โบนัสพิเศษ">
        </label>
        <label>ประเภทการคิดเงิน
          <select id="benefitMode">
            <option value="perWorkday">คิดตามวันทำงาน</option>
            <option value="fixedMonthly">เงินบวกรายเดือน</option>
            <option value="specialOnce">เงินพิเศษครั้งเดียว</option>
          </select>
        </label>
        <label>จำนวนเงิน
          <input id="benefitAmount" type="number" min="0" step="0.01" placeholder="เช่น 50 หรือ 1000">
        </label>
        <label id="benefitStartLabel">วันที่เริ่มใช้
          <input id="benefitStart" type="date" value="${todayKey()}">
        </label>
        <label id="benefitEndLabel">วันที่สิ้นสุด (ไม่บังคับ)
          <input id="benefitEnd" type="date">
        </label>
        <label class="check">
          <input id="benefitActive" type="checkbox" checked>
          เปิดใช้งานรายการนี้
        </label>
      </div>
      <div class="benefit-mode-note" id="benefitModeNote"></div>
      <div class="actions-row">
        <button id="saveBenefitBtn" class="primary compact">บันทึกสวัสดิการ</button>
        <button id="reloadBenefitBtn" class="secondary compact">โหลดรายการใหม่</button>
      </div>
      <p id="benefitMsg" class="message"></p>
    </section>

    <section class="card wide">
      <div class="module-head compact-head">
        <div>
          <h3>รายการสวัสดิการของพนักงาน</h3>
          <p class="muted small">รายการที่เปิดใช้งานและวันที่ตรงกับงวด Payroll จะถูกนำไปคิดในสลิป</p>
        </div>
        <div class="filters compact-filter">
          <input id="benefitSearch" placeholder="ค้นหาชื่อพนักงาน / รหัส / สวัสดิการ">
          <select id="benefitStatusFilter">
            <option value="active">เฉพาะที่เปิดใช้งาน</option>
            <option value="all">ทั้งหมด</option>
            <option value="inactive">เฉพาะที่ปิดใช้งาน</option>
          </select>
        </div>
      </div>
      <div id="benefitList" class="list"></div>
    </section>
  `;

  document.getElementById("benefitMode").onchange = refreshBenefitModeUi;
  document.getElementById("saveBenefitBtn").onclick = () => saveBenefit(employee);
  document.getElementById("reloadBenefitBtn").onclick = loadBenefitList;
  document.getElementById("benefitSearch").oninput = loadBenefitList;
  document.getElementById("benefitStatusFilter").onchange = loadBenefitList;

  await loadBenefitEmployees();
  refreshBenefitModeUi();
  await loadBenefitList();
}

function refreshBenefitModeUi() {
  const mode = document.getElementById("benefitMode")?.value || "perWorkday";
  const startLabel = document.getElementById("benefitStartLabel");
  const endLabel = document.getElementById("benefitEndLabel");
  const note = document.getElementById("benefitModeNote");
  if (!startLabel || !endLabel || !note) return;

  if (mode === "specialOnce") {
    startLabel.childNodes[0].textContent = "วันที่จ่ายเงินพิเศษ ";
    endLabel.classList.add("hidden");
    note.innerHTML = `<span class="badge good">เงินพิเศษครั้งเดียว</span> จะถูกบวกเมื่อวันที่จ่ายอยู่ในช่วงงวด Payroll`;
  } else if (mode === "fixedMonthly") {
    startLabel.childNodes[0].textContent = "วันที่เริ่มใช้ ";
    endLabel.classList.remove("hidden");
    note.innerHTML = `<span class="badge info">เงินบวกรายเดือน</span> จะบวก 1 ครั้งต่อหนึ่งงวด Payroll เมื่อช่วงวันที่ยังมีผลอยู่`;
  } else {
    startLabel.childNodes[0].textContent = "วันที่เริ่มใช้ ";
    endLabel.classList.remove("hidden");
    note.innerHTML = `<span class="badge">คิดตามวันทำงาน</span> = จำนวนเงิน × จำนวนวันทำงานจริงในงวด`;
  }
}

async function loadBenefitEmployees() {
  const select = document.getElementById("benefitEmployee");
  if (!select) return;
  select.innerHTML = `<option value="">กำลังโหลดพนักงาน...</option>`;
  const snap = await db.collection("employees").get();
  const rows = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(e => e.active !== false)
    .sort((a, b) => String(a.employeeCode || a.fullName || "").localeCompare(String(b.employeeCode || b.fullName || "")));

  select.innerHTML = rows.length
    ? rows.map(e => `<option value="${safeText(e.id)}" data-code="${safeText(e.employeeCode || "")}" data-name="${safeText(e.fullName || "")}" data-dept="${safeText(e.department || "")}" data-pos="${safeText(e.position || "")}">${safeText(e.employeeCode || "")} ${safeText(e.fullName || e.id)}</option>`).join("")
    : `<option value="">ยังไม่มีพนักงาน</option>`;
}

async function saveBenefit(employee) {
  const msg = document.getElementById("benefitMsg");
  const btn = document.getElementById("saveBenefitBtn");
  const select = document.getElementById("benefitEmployee");
  const selected = select.options[select.selectedIndex];
  const employeeId = select.value;
  const name = document.getElementById("benefitName").value.trim();
  const mode = document.getElementById("benefitMode").value;
  const amount = Number(document.getElementById("benefitAmount").value || 0);
  const effectiveStart = document.getElementById("benefitStart").value;
  const effectiveEnd = mode === "specialOnce" ? "" : document.getElementById("benefitEnd").value;
  const active = document.getElementById("benefitActive").checked;

  if (!employeeId) { msg.textContent = "กรุณาเลือกพนักงาน"; return; }
  if (!name) { msg.textContent = "กรุณากรอกชื่อสวัสดิการ"; return; }
  if (!amount || amount <= 0) { msg.textContent = "กรุณากรอกจำนวนเงินมากกว่า 0"; return; }
  if (!effectiveStart) { msg.textContent = mode === "specialOnce" ? "กรุณาเลือกวันที่จ่ายเงินพิเศษ" : "กรุณาเลือกวันที่เริ่มใช้"; return; }
  if (effectiveEnd && effectiveEnd < effectiveStart) { msg.textContent = "วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มใช้"; return; }

  btn.disabled = true;
  msg.textContent = "กำลังบันทึกสวัสดิการ...";
  try {
    const payload = {
      employeeId,
      employeeCode: selected?.dataset?.code || "",
      fullName: selected?.dataset?.name || "",
      department: selected?.dataset?.dept || "",
      position: selected?.dataset?.pos || "",
      name,
      mode,
      amount,
      effectiveStart,
      effectiveEnd: effectiveEnd || "",
      dateKey: mode === "specialOnce" ? effectiveStart : "",
      active,
      createdAt: new Date().toISOString(),
      createdBy: employee?.id || "admin",
      createdByName: employee?.fullName || employee?.employeeCode || "Admin"
    };
    await db.collection(BENEFIT_COLLECTION).add(payload);
    await addBenefitAuditLog("CREATE_EMPLOYEE_BENEFIT", payload, employee);

    document.getElementById("benefitName").value = "";
    document.getElementById("benefitAmount").value = "";
    document.getElementById("benefitEnd").value = "";
    msg.textContent = "บันทึกสวัสดิการสำเร็จ Payroll จะนำไปคิดเมื่อคำนวณงวดที่ตรงกับวันที่";
    await loadBenefitList();
  } catch (err) {
    msg.textContent = "บันทึกไม่สำเร็จ: " + err.message;
  } finally {
    btn.disabled = false;
  }
}

async function loadBenefitList() {
  const list = document.getElementById("benefitList");
  if (!list) return;
  const q = (document.getElementById("benefitSearch")?.value || "").trim().toLowerCase();
  const status = document.getElementById("benefitStatusFilter")?.value || "active";
  list.innerHTML = `<div class="empty-state">กำลังโหลดรายการสวัสดิการ...</div>`;

  try {
    const snap = await db.collection(BENEFIT_COLLECTION).get().catch(() => ({ docs: [] }));
    let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (status === "active") rows = rows.filter(r => r.active !== false);
    if (status === "inactive") rows = rows.filter(r => r.active === false);
    if (q) {
      rows = rows.filter(r => [r.employeeCode, r.fullName, r.name, r.department, r.position, r.mode]
        .some(v => String(v || "").toLowerCase().includes(q)));
    }
    rows.sort((a, b) => String(a.employeeCode || a.fullName || "").localeCompare(String(b.employeeCode || b.fullName || "")) || String(a.name || "").localeCompare(String(b.name || "")));

    list.innerHTML = rows.length ? rows.map(benefitCard).join("") : `<div class="empty-state">ยังไม่มีรายการสวัสดิการ</div>`;
    list.querySelectorAll("[data-toggle-benefit]").forEach(btn => {
      btn.onclick = () => toggleBenefit(btn.dataset.toggleBenefit, btn.dataset.active === "true");
    });
    list.querySelectorAll("[data-delete-benefit]").forEach(btn => {
      btn.onclick = () => deleteBenefit(btn.dataset.deleteBenefit);
    });
  } catch (err) {
    list.innerHTML = `<div class="empty-state error-text">โหลดรายการไม่สำเร็จ: ${safeText(err.message)}</div>`;
  }
}

function benefitCard(b) {
  const modeText = benefitModeText(b.mode);
  const dateText = b.mode === "specialOnce"
    ? `วันที่จ่าย ${safeText(b.dateKey || b.effectiveStart || "-")}`
    : `มีผล ${safeText(b.effectiveStart || "-")} ถึง ${safeText(b.effectiveEnd || "ไม่กำหนด")}`;
  const active = b.active !== false;
  return `
    <article class="summary-card benefit-item ${active ? "" : "inactive-item"}">
      <div class="benefit-card-head">
        <div>
          <h3>${safeText(b.employeeCode || "")} ${safeText(b.fullName || b.employeeId || "-")}</h3>
          <p class="muted">${safeText(b.department || "-")} • ${safeText(b.position || "-")}</p>
        </div>
        <span class="badge ${active ? "good" : "bad"}">${active ? "เปิดใช้งาน" : "ปิดใช้งาน"}</span>
      </div>
      <div class="badges">
        <span class="badge info">${safeText(modeText)}</span>
        <span class="badge good">${money(b.amount)} บาท</span>
        <span class="badge">${safeText(dateText)}</span>
      </div>
      <p><b>${safeText(b.name || "สวัสดิการ")}</b></p>
      <div class="actions-row">
        <button class="secondary compact" data-toggle-benefit="${safeText(b.id)}" data-active="${active ? "true" : "false"}">${active ? "ปิดใช้งาน" : "เปิดใช้งาน"}</button>
        <button class="danger compact" data-delete-benefit="${safeText(b.id)}">ลบรายการ</button>
      </div>
    </article>
  `;
}

function benefitModeText(mode) {
  if (mode === "fixedMonthly") return "เงินบวกรายเดือน";
  if (mode === "specialOnce") return "เงินพิเศษครั้งเดียว";
  return "คิดตามวันทำงาน";
}

async function toggleBenefit(id, currentlyActive) {
  const msg = document.getElementById("benefitMsg");
  try {
    await db.collection(BENEFIT_COLLECTION).doc(id).update({
      active: !currentlyActive,
      updatedAt: new Date().toISOString()
    });
    await addBenefitAuditLog(currentlyActive ? "DISABLE_EMPLOYEE_BENEFIT" : "ENABLE_EMPLOYEE_BENEFIT", { benefitId: id, active: !currentlyActive });
    if (msg) msg.textContent = currentlyActive ? "ปิดใช้งานสวัสดิการแล้ว" : "เปิดใช้งานสวัสดิการแล้ว";
    await loadBenefitList();
  } catch (err) {
    if (msg) msg.textContent = "อัปเดตไม่สำเร็จ: " + err.message;
  }
}

async function deleteBenefit(id) {
  if (!confirm("ต้องการลบรายการสวัสดิการนี้ใช่หรือไม่?")) return;
  const msg = document.getElementById("benefitMsg");
  try {
    await db.collection(BENEFIT_COLLECTION).doc(id).delete();
    await addBenefitAuditLog("DELETE_EMPLOYEE_BENEFIT", { benefitId: id });
    if (msg) msg.textContent = "ลบรายการสวัสดิการแล้ว";
    await loadBenefitList();
  } catch (err) {
    if (msg) msg.textContent = "ลบไม่สำเร็จ: " + err.message;
  }
}

async function addBenefitAuditLog(action, payload = {}, employee = null) {
  try {
    await db.collection("auditLogs").add({
      action,
      module: "benefits",
      payload,
      createdAt: new Date().toISOString(),
      actorId: employee?.id || payload?.createdBy || "admin"
    });
  } catch (err) {
    console.warn("benefit audit log skipped", err);
  }
}
