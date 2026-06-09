import { db } from "../core/firebase.js";
import { safeText, monthKey } from "../core/utils.js";

const TYPE_LABEL = {
  workday: "วันทำงาน",
  holiday_paid: "วันหยุดจ่ายเงิน",
  holiday_unpaid: "วันหยุดไม่จ่ายเงิน",
  ot_open: "วันหยุดเปิด OT",
  event: "กิจกรรม",
  payday: "วันจ่ายเงิน"
};

const DEFAULT_COMPANY_SETTINGS = {
  monthlyPaydayEnabled: false,
  monthlyPaydayDay: 30,
  monthlyPaydayTitle: "วันจ่ายเงินพนักงานรายเดือน",
  monthlyPaydayNotifyDaysBefore: 1
};

export async function renderCalendarModule(container, employee, mode = "admin") {
  container.innerHTML = `
    <div class="module-head">
      <div>
        <h2>ปฏิทินบริษัท</h2>
        <p class="muted">กำหนดวันทำงาน วันหยุด และแสดงวันจ่ายเงินรายเดือนจากการตั้งค่าบริษัท</p>
      </div>
      <div class="filters compact-line">
        <input id="calMonth" type="month" value="${monthKey()}">
        <button id="loadCalendarBtn" class="secondary compact">โหลด</button>
      </div>
    </div>
    <section class="card wide ${mode === "admin" ? "" : "hidden"}">
      <h3>แก้ไขวันที่</h3>
      <p class="muted small">หมายเหตุ: วันจ่ายเงินรายเดือนให้ตั้งที่เมนู “ตำแหน่งบริษัท” ระบบจะแสดงในปฏิทินอัตโนมัติ โดยไม่เปลี่ยนวันทำงานเป็นวันหยุด</p>
      <div class="form-grid">
        <label>วันที่</label><input id="calDate" type="date">
        <label>ชื่อรายการ</label><input id="calTitle">
        <label>ประเภท</label>
        <select id="calType">
          <option value="workday">วันทำงาน</option>
          <option value="holiday_paid">วันหยุดจ่ายเงิน</option>
          <option value="holiday_unpaid">วันหยุดไม่จ่ายเงิน</option>
          <option value="ot_open">วันหยุดแต่เปิด OT</option>
          <option value="event">กิจกรรม</option>
          <option value="payday">วันจ่ายเงินแบบกำหนดเอง</option>
        </select>
        <label>มีค่าจ้าง</label><label class="check"><input id="calPaid" type="checkbox" checked> ใช่</label>
      </div>
      <div class="actions-row"><button id="saveCalendarBtn" class="primary">บันทึก</button><button id="deleteCalendarBtn" class="danger">ลบรายการวันนี้</button></div>
      <p id="calendarMsg" class="message"></p>
    </section>
    <section class="card wide">
      <div id="calendarLegend" class="badges calendar-legend"></div>
      <div id="calendarGrid" class="calendar-grid"></div>
    </section>`;
  document.getElementById("loadCalendarBtn").onclick = () => loadCalendar(mode);
  if (mode === "admin") {
    document.getElementById("saveCalendarBtn").onclick = saveCalendar;
    document.getElementById("deleteCalendarBtn").onclick = deleteCalendar;
  }
  await loadCalendar(mode);
}

async function loadCalendar(mode) {
  const grid = document.getElementById("calendarGrid");
  const legend = document.getElementById("calendarLegend");
  const m = document.getElementById("calMonth").value;
  const [y, mo] = m.split("-").map(Number);
  const first = new Date(y, mo - 1, 1);
  const last = new Date(y, mo, 0);
  const start = `${m}-01`;
  const end = `${m}-${String(last.getDate()).padStart(2, "0")}`;
  grid.innerHTML = `<div class="empty-state">กำลังโหลด...</div>`;

  const [snap, companySettings] = await Promise.all([
    db.collection("calendarEvents").where("dateKey", ">=", start).where("dateKey", "<=", end).get().catch(() => ({ docs: [] })),
    loadCompanySettings()
  ]);
  const map = {};
  snap.docs.forEach(d => map[d.id] = { id: d.id, ...d.data() });
  const payday = getMonthlyPaydayForMonth(y, mo, companySettings);

  if (legend) {
    legend.innerHTML = payday
      ? `<span class="badge good">วันทำงาน = คิดงานปกติ</span><span class="badge warn">วันจ่ายเงินรายเดือน: ${safeText(payday.dateKey)} ${safeText(payday.title)}</span>`
      : `<span class="badge good">วันทำงาน</span><span class="badge info">ยังไม่เปิดวันจ่ายเงินรายเดือน</span>`;
  }

  let html = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map(d => `<div class="cal-head">${d}</div>`).join("");
  for (let i = 0; i < first.getDay(); i++) html += `<div class="cal-cell muted-cell"></div>`;
  for (let day = 1; day <= last.getDate(); day++) {
    const dateKey = `${m}-${String(day).padStart(2, "0")}`;
    const ev = map[dateKey] || defaultDay(dateKey);
    const isAutoPayday = payday?.dateKey === dateKey;
    const title = isAutoPayday ? payday.title : ev.title;
    const paydayBadge = isAutoPayday ? `<small class="payday-badge">💰 ${safeText(payday.title)}</small>` : "";
    html += `<button class="cal-cell ${ev.type || "workday"} ${isAutoPayday ? "auto-payday" : ""}" data-date="${dateKey}"><b>${day}</b><span>${safeText(TYPE_LABEL[ev.type] || ev.type || "วันทำงาน")}</span>${title && !isAutoPayday ? `<small>${safeText(title)}</small>` : ""}${paydayBadge}</button>`;
  }
  grid.innerHTML = html;
  document.querySelectorAll("[data-date]").forEach(btn => {
    const dateKey = btn.dataset.date;
    const ev = map[dateKey] || defaultDay(dateKey);
    btn.onclick = () => selectDate(dateKey, ev, mode);
  });
}

async function loadCompanySettings() {
  const doc = await db.collection("settings").doc("company").get().catch(() => null);
  return doc?.exists ? { ...DEFAULT_COMPANY_SETTINGS, ...doc.data() } : { ...DEFAULT_COMPANY_SETTINGS };
}

function getMonthlyPaydayForMonth(year, monthNumber, settings) {
  if (settings.monthlyPaydayEnabled !== true) return null;
  const lastDay = new Date(year, monthNumber, 0).getDate();
  const day = Math.min(Math.max(1, Number(settings.monthlyPaydayDay || 30)), lastDay);
  const dateKey = `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { dateKey, title: settings.monthlyPaydayTitle || "วันจ่ายเงินพนักงานรายเดือน" };
}

function defaultDay(dateKey) {
  const d = new Date(`${dateKey}T00:00:00`);
  return d.getDay() === 0
    ? { dateKey, type: "holiday_unpaid", title: "วันอาทิตย์", isPaid: false }
    : { dateKey, type: "workday", title: "วันทำงาน", isPaid: true };
}

function selectDate(dateKey, ev, mode) {
  if (mode !== "admin") return;
  document.getElementById("calDate").value = dateKey;
  document.getElementById("calTitle").value = ev.title || "";
  document.getElementById("calType").value = ev.type || "workday";
  document.getElementById("calPaid").checked = ev.type === "workday" ? true : Boolean(ev.isPaid);
}

async function saveCalendar() {
  const dateKey = document.getElementById("calDate").value;
  if (!dateKey) return alert("เลือกวันที่ก่อน");
  const type = document.getElementById("calType").value;
  const isPaid = type === "workday" ? true : document.getElementById("calPaid").checked;
  await db.collection("calendarEvents").doc(dateKey).set({
    dateKey,
    title: document.getElementById("calTitle").value.trim(),
    type,
    isPaid,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  document.getElementById("calendarMsg").textContent = "บันทึกปฏิทินแล้ว";
  await loadCalendar("admin");
}

async function deleteCalendar() {
  const dateKey = document.getElementById("calDate").value;
  if (!dateKey) return alert("เลือกวันที่ก่อน");
  if (!confirm("ลบรายการปฏิทินวันนี้?")) return;
  await db.collection("calendarEvents").doc(dateKey).delete();
  document.getElementById("calendarMsg").textContent = "ลบแล้ว";
  await loadCalendar("admin");
}
