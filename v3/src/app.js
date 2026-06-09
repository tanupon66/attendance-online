import { initFirebase, db } from "./core/firebase.js";
import { safeText, todayKey, nowText, sha256, setSession, getSession, clearSession } from "./core/utils.js";
import { t, bindLangSelector } from "./core/i18n.js";
import { renderLoading, shell } from "./ui/shell.js";
import { renderEmployeesModule } from "./modules/employees.js";
import { renderAttendanceModule } from "./modules/attendance.js";
import { renderSummaryModule } from "./modules/summary.js";
import { renderCalendarModule } from "./modules/calendar.js";
import { renderLeaveModule } from "./modules/leave.js";
import { renderPayrollModule } from "./modules/payroll.js";

const appEl = document.getElementById("app");
let currentRoute = "dashboard";

function renderLogin(message = "") {
  appEl.innerHTML = `
    <main class="screen login-screen">
      <section class="login-card">
        <div class="brand-row"><div class="logo">A3</div><div><h1>${t("appName")}</h1><p class="muted">ระบบลงเวลาออนไลน์เวอร์ชันใหม่</p></div></div>
        <label>${t("employeeCode")}</label><input id="loginCode" autocomplete="username" placeholder="admin หรือ 001" />
        <label>${t("pin")}</label><input id="loginPin" type="password" autocomplete="current-password" placeholder="PIN" />
        <button id="loginBtn" class="primary">${t("login")}</button>
        <button id="seedAdminBtn" class="secondary">สร้างแอดมินเริ่มต้น</button>
        <p id="loginMsg" class="message">${safeText(message)}</p>
      </section>
    </main>`;
  document.getElementById("loginBtn").onclick = login;
  document.getElementById("seedAdminBtn").onclick = seedAdmin;
  document.getElementById("loginPin").addEventListener("keydown", e => { if (e.key === "Enter") login(); });
}

async function seedAdmin() {
  const msg = document.getElementById("loginMsg");
  const existing = await db.collection("employees").where("role","==","admin").limit(1).get();
  if (!existing.empty) { msg.textContent = "มีแอดมินอยู่แล้ว"; return; }
  await db.collection("employees").add({ employeeCode:"admin", fullName:"ผู้ดูแลระบบ", department:"Admin", position:"Admin", role:"admin", active:true, pinHash:await sha256("admin123"), payType:"monthly", shiftStart:"08:00", shiftEnd:"17:00", breakMinutes:60, createdAt:firebase.firestore.FieldValue.serverTimestamp() });
  msg.textContent = "สร้างแอดมินสำเร็จ: admin / admin123";
}

async function login() {
  const code = document.getElementById("loginCode").value.trim(), pin = document.getElementById("loginPin").value.trim(), msg = document.getElementById("loginMsg");
  if (!code || !pin) { msg.textContent = "กรุณากรอกข้อมูล"; return; }
  const snap = await db.collection("employees").where("employeeCode","==",code).limit(1).get();
  if (snap.empty) { msg.textContent = "ไม่พบรหัสพนักงาน"; return; }
  const doc = snap.docs[0], emp = { id:doc.id, ...doc.data() };
  if (emp.active === false) { msg.textContent = "บัญชีนี้ถูกปิดใช้งาน"; return; }
  if (emp.pinHash !== await sha256(pin)) { msg.textContent = "PIN ไม่ถูกต้อง"; return; }
  setSession(emp);
  renderApp(emp, "dashboard");
}

function logout(){ clearSession(); renderLogin("ออกจากระบบแล้ว"); }

async function restoreSession(){
  const cached = getSession();
  if(!cached?.id){ renderLogin(); return; }
  const doc = await db.collection("employees").doc(cached.id).get();
  if(!doc.exists){ clearSession(); renderLogin(); return; }
  const emp = { id:doc.id, ...doc.data() };
  if(emp.active === false){ clearSession(); renderLogin("บัญชีถูกปิด"); return; }
  setSession(emp); renderApp(emp, currentRoute || "dashboard");
}

function bindShell(emp){
  document.getElementById("logoutBtn").onclick = logout;
  document.querySelectorAll("[data-route]").forEach(btn => btn.onclick = () => renderApp(emp, btn.dataset.route));
  bindLangSelector(() => renderApp(emp, currentRoute));
  const n = document.getElementById("notificationBtn");
  if(n) n.onclick = () => alert("Notification Center จะทำใน Step ถัดไป");
}

function renderApp(emp, route){
  currentRoute = route;
  emp.role === "admin" ? renderAdmin(emp, route) : renderEmployee(emp, route);
}

function renderAdmin(emp, route){
  const titleMap = { dashboard:t("dashboard"), employees:t("employees"), attendance:t("attendance"), summary:t("summary"), leave:t("leave"), calendar:t("calendar"), payroll:t("payroll"), settings:t("settings") };
  appEl.innerHTML = shell({ employee:emp, active:route, title:titleMap[route]||t("dashboard"), subtitle:`${emp.fullName||"-"} • ${nowText()}`, body:`<div id="moduleRoot"></div>` });
  bindShell(emp);
  const root = document.getElementById("moduleRoot");
  if(route==="employees") renderEmployeesModule(root);
  else if(route==="attendance") renderAttendanceModule(root, emp, "admin");
  else if(route==="summary") renderSummaryModule(root, emp, "admin");
  else if(route==="calendar") renderCalendarModule(root, emp, "admin");
  else if(route==="leave") renderLeaveModule(root, emp, "admin");
  else if(route==="payroll") renderPayrollModule(root);
  else if(route==="dashboard") renderAdminDashboardModule();
  else root.innerHTML = `<div class="card wide"><h2>${safeText(titleMap[route]||route)}</h2><p class="muted">โมดูลนี้จะทำใน Step ถัดไป</p></div>`;
}

async function renderAdminDashboardModule(){
  const root = document.getElementById("moduleRoot");
  root.innerHTML = `<div class="dashboard-hero"><div><p class="eyebrow">ภาพรวมระบบ</p><h2>Attendance v3 Step 6</h2><p class="muted">Calendar + Leave + Language + Payroll CSV Base</p></div></div><div class="stats-grid"><div class="stat-card"><b id="statEmployees">-</b><span>พนักงาน</span></div><div class="stat-card"><b id="statToday">-</b><span>ลงเวลาวันนี้</span></div><div class="stat-card"><b id="statLeave">-</b><span>ลารออนุมัติ</span></div></div>`;
  const empSnap = await db.collection("employees").get(); document.getElementById("statEmployees").textContent = empSnap.size;
  const attSnap = await db.collection("attendance").where("dateKey","==",todayKey()).get().catch(()=>({size:0})); document.getElementById("statToday").textContent = attSnap.size ?? 0;
  const leaveSnap = await db.collection("leaveRequests").where("status","==","pending").get().catch(()=>({size:0})); document.getElementById("statLeave").textContent = leaveSnap.size ?? 0;
}

function renderEmployee(emp, route){
  const titleMap = { dashboard:t("dashboard"), clock:t("attendance"), summary:t("summary"), leave:t("leave"), calendar:t("calendar"), profile:"โปรไฟล์" };
  appEl.innerHTML = shell({ employee:emp, active:route, title:titleMap[route]||t("dashboard"), subtitle:`${emp.fullName||"-"} • ${nowText()}`, body:`<div id="moduleRoot"></div>` });
  bindShell(emp);
  const root = document.getElementById("moduleRoot");
  if(route==="clock") renderAttendanceModule(root, emp, "employee");
  else if(route==="summary") renderSummaryModule(root, emp, "employee");
  else if(route==="leave") renderLeaveModule(root, emp, "employee");
  else if(route==="calendar") renderCalendarModule(root, emp, "employee");
  else root.innerHTML = `<div class="hero-card"><p class="muted">สวัสดี</p><h2>${safeText(emp.fullName||emp.employeeCode)}</h2><p>${safeText(emp.department||"-")} • ${safeText(emp.position||"-")}</p></div><div class="card wide"><h2>Step 6 พร้อมแล้ว</h2><p class="muted">เพิ่มปฏิทิน วันลา และสลับภาษาแล้ว</p></div>`;
}

async function start(){
  renderLoading(appEl);
  try{ await initFirebase(); await restoreSession(); }
  catch(err){ appEl.innerHTML = `<main class="screen center"><div class="card error"><h1>โหลดระบบไม่สำเร็จ</h1><p>${safeText(err.message)}</p></div></main>`; }
}
start();
