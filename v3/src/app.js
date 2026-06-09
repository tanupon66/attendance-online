import { initFirebase, db } from "./core/firebase.js";
import { safeText, todayKey, nowText, sha256, setSession, getSession, clearSession } from "./core/utils.js";
import { t, bindLangSelector } from "./core/i18n.js";
import { initPwa } from "./core/pwa.js";
import { renderLoading, shell } from "./UI/shell.js";
import { renderDashboardModule } from "./modules/dashboard.js";
import { renderEmployeesModule } from "./modules/employees.js";
import { renderAttendanceModule } from "./modules/attendance.js";
import { renderSummaryModule } from "./modules/summary.js";
import { renderCalendarModule } from "./modules/calendar.js";
import { renderLeaveModule } from "./modules/leave.js";
import { renderPayrollModule } from "./modules/payroll.js";
import { renderNotificationsModule } from "./modules/notifications.js";
import { renderProfileModule } from "./modules/profile.js";

const appEl=document.getElementById("app");
let currentRoute = new URLSearchParams(location.search).get("route") || "dashboard";

function renderLogin(message=""){
  appEl.innerHTML=`<main class="screen login-screen"><section class="login-card"><div class="brand-row"><div class="logo">A3</div><div><h1>${t("appName")}</h1><p class="muted">Step 7 Full Pack</p></div></div><label>${t("employeeCode")}</label><input id="loginCode" autocomplete="username" placeholder="admin หรือ 001"><label>${t("pin")}</label><input id="loginPin" type="password" autocomplete="current-password" placeholder="PIN"><button id="loginBtn" class="primary">${t("login")}</button><button id="seedAdminBtn" class="secondary">สร้างแอดมินเริ่มต้น</button><p id="loginMsg" class="message">${safeText(message)}</p></section></main>`;
  document.getElementById("loginBtn").onclick=login;
  document.getElementById("seedAdminBtn").onclick=seedAdmin;
  document.getElementById("loginPin").addEventListener("keydown",e=>{if(e.key==="Enter")login()});
}
async function seedAdmin(){
  const msg=document.getElementById("loginMsg");
  try{const existing=await db.collection("employees").where("role","==","admin").limit(1).get();if(!existing.empty){msg.textContent="มีแอดมินอยู่แล้ว";return}await db.collection("employees").add({employeeCode:"admin",fullName:"ผู้ดูแลระบบ",department:"Admin",position:"Admin",role:"admin",active:true,pinHash:await sha256("admin123"),payType:"monthly",monthlySalary:0,shiftStart:"08:00",shiftEnd:"17:00",breakMinutes:60,createdAt:firebase.firestore.FieldValue.serverTimestamp()});msg.textContent="สร้างแอดมินสำเร็จ: admin / admin123"}catch(err){msg.textContent="สร้างแอดมินไม่สำเร็จ: "+err.message}
}
async function login(){
  const code=document.getElementById("loginCode").value.trim(),pin=document.getElementById("loginPin").value.trim(),msg=document.getElementById("loginMsg");
  if(!code||!pin){msg.textContent="กรุณากรอกข้อมูล";return}
  try{const snap=await db.collection("employees").where("employeeCode","==",code).limit(1).get();if(snap.empty){msg.textContent="ไม่พบรหัสพนักงาน";return}const doc=snap.docs[0],emp={id:doc.id,...doc.data()};if(emp.active===false){msg.textContent="บัญชีนี้ถูกปิดใช้งาน";return}if(emp.pinHash!==await sha256(pin)){msg.textContent="PIN ไม่ถูกต้อง";return}setSession(emp);renderApp(emp,"dashboard")}catch(err){msg.textContent="เข้าสู่ระบบไม่สำเร็จ: "+err.message}
}
function logout(){clearSession();renderLogin("ออกจากระบบแล้ว")}
async function restoreSession(){
  const cached=getSession();if(!cached?.id){renderLogin();return}
  try{const doc=await db.collection("employees").doc(cached.id).get();if(!doc.exists){clearSession();renderLogin();return}const emp={id:doc.id,...doc.data()};if(emp.active===false){clearSession();renderLogin("บัญชีถูกปิด");return}setSession(emp);renderApp(emp,currentRoute||"dashboard")}catch(err){clearSession();renderLogin("โหลดบัญชีไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่")}
}
function bindShell(emp){
  initPwa(emp);
  document.getElementById("logoutBtn").onclick=logout;
  document.querySelectorAll("[data-route]").forEach(btn=>btn.onclick=()=>renderApp(emp,btn.dataset.route));
  bindLangSelector(()=>renderApp(emp,currentRoute));
  const n=document.getElementById("notificationBtn"); if(n)n.onclick=()=>renderApp(emp,"notifications");
}
function renderApp(emp,route){currentRoute=route;emp.role==="admin"?renderAdmin(emp,route):renderEmployee(emp,route)}
function renderAdmin(emp,route){
  const titleMap={dashboard:t("dashboard"),employees:t("employees"),attendance:t("attendance"),summary:t("summary"),leave:t("leave"),calendar:t("calendar"),payroll:t("payroll"),notifications:t("notifications"),profile:t("profile")};
  appEl.innerHTML=shell({employee:emp,active:route,title:titleMap[route]||t("dashboard"),subtitle:`${emp.fullName||"-"} • ${nowText()}`,body:`<div id="moduleRoot"></div>`});bindShell(emp);
  const root=document.getElementById("moduleRoot");
  if(route==="dashboard")renderDashboardModule(root,emp,"admin");
  else if(route==="employees")renderEmployeesModule(root);
  else if(route==="attendance")renderAttendanceModule(root,emp,"admin");
  else if(route==="summary")renderSummaryModule(root,emp,"admin");
  else if(route==="calendar")renderCalendarModule(root,emp,"admin");
  else if(route==="leave")renderLeaveModule(root,emp,"admin");
  else if(route==="payroll")renderPayrollModule(root,emp,"admin");
  else if(route==="notifications")renderNotificationsModule(root,emp,"admin");
  else if(route==="profile")renderProfileModule(root,emp);
  else root.innerHTML=`<div class="card wide"><h2>${safeText(titleMap[route]||route)}</h2><p class="muted">โมดูลนี้จะทำภายหลัง</p></div>`;
}
function renderEmployee(emp,route){
  const titleMap={dashboard:t("dashboard"),clock:t("attendance"),summary:t("summary"),leave:t("leave"),calendar:t("calendar"),payroll:t("payroll"),notifications:t("notifications"),profile:t("profile")};
  appEl.innerHTML=shell({employee:emp,active:route,title:titleMap[route]||t("dashboard"),subtitle:`${emp.fullName||"-"} • ${nowText()}`,body:`<div id="moduleRoot"></div>`});bindShell(emp);
  const root=document.getElementById("moduleRoot");
  if(route==="dashboard")renderDashboardModule(root,emp,"employee");
  else if(route==="clock")renderAttendanceModule(root,emp,"employee");
  else if(route==="summary")renderSummaryModule(root,emp,"employee");
  else if(route==="calendar")renderCalendarModule(root,emp,"employee");
  else if(route==="leave")renderLeaveModule(root,emp,"employee");
  else if(route==="payroll")renderPayrollModule(root,emp,"employee");
  else if(route==="notifications")renderNotificationsModule(root,emp,"employee");
  else if(route==="profile")renderProfileModule(root,emp);
  else root.innerHTML=`<div class="card wide"><h2>${safeText(titleMap[route]||route)}</h2><p class="muted">โมดูลนี้จะทำภายหลัง</p></div>`;
}
async function start(){renderLoading(appEl);try{await initFirebase();await restoreSession()}catch(err){appEl.innerHTML=`<main class="screen center"><div class="card error"><h1>โหลดระบบไม่สำเร็จ</h1><p>${safeText(err.message)}</p></div></main>`}}
start();
