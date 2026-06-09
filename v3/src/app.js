import { initFirebase, db } from "./core/firebase.js";

const appEl = document.getElementById("app");
const SESSION_KEY = "attendance_v3_employee";

function safeText(value) {
  return String(value ?? "").replace(/[&<>"]/g, s => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;"
  }[s]));
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function nowText() {
  return new Date().toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function setSession(employee) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(employee));
}

function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function renderLoading(text = "กำลังโหลดระบบ...") {
  appEl.innerHTML = `
    <main class="screen center">
      <div class="card splash">
        <div class="logo">A3</div>
        <h1>Attendance Online v3</h1>
        <p>${safeText(text)}</p>
      </div>
    </main>
  `;
}

function renderLogin(message = "") {
  appEl.innerHTML = `
    <main class="screen login-screen">
      <section class="login-card">
        <div class="brand-row">
          <div class="logo">A3</div>
          <div>
            <h1>Attendance Online v3</h1>
            <p class="muted">ระบบลงเวลาออนไลน์เวอร์ชันใหม่</p>
          </div>
        </div>

        <label for="loginCode">รหัสพนักงาน</label>
        <input id="loginCode" autocomplete="username" placeholder="เช่น admin หรือ 001" />

        <label for="loginPin">PIN</label>
        <input id="loginPin" type="password" autocomplete="current-password" placeholder="PIN" />

        <button id="loginBtn" class="primary">เข้าสู่ระบบ</button>
        <button id="seedAdminBtn" class="secondary">สร้างแอดมินเริ่มต้น</button>

        <p id="loginMsg" class="message">${safeText(message)}</p>
      </section>
    </main>
  `;

  document.getElementById("loginBtn").onclick = login;
  document.getElementById("seedAdminBtn").onclick = seedAdmin;

  document.getElementById("loginPin").addEventListener("keydown", e => {
    if (e.key === "Enter") login();
  });
}

async function seedAdmin() {
  const btn = document.getElementById("seedAdminBtn");
  const msg = document.getElementById("loginMsg");

  btn.disabled = true;
  btn.textContent = "กำลังสร้าง...";
  msg.textContent = "";

  try {
    const existing = await db.collection("employees")
      .where("role", "==", "admin")
      .limit(1)
      .get();

    if (!existing.empty) {
      msg.textContent = "มีแอดมินอยู่แล้ว";
      return;
    }

    await db.collection("employees").add({
      employeeCode: "admin",
      fullName: "ผู้ดูแลระบบ",
      department: "Admin",
      position: "Admin",
      role: "admin",
      active: true,
      pinHash: await sha256("admin123"),
      payType: "monthly",
      payCycle: "monthly",
      monthlySalary: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    msg.textContent = "สร้างแอดมินสำเร็จ: admin / admin123";
  } catch (err) {
    console.error(err);
    msg.textContent = "สร้างแอดมินไม่สำเร็จ: " + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "สร้างแอดมินเริ่มต้น";
  }
}

async function login() {
  const code = document.getElementById("loginCode").value.trim();
  const pin = document.getElementById("loginPin").value.trim();
  const btn = document.getElementById("loginBtn");
  const msg = document.getElementById("loginMsg");

  if (!code || !pin) {
    msg.textContent = "กรุณากรอกรหัสพนักงานและ PIN";
    return;
  }

  btn.disabled = true;
  btn.textContent = "กำลังเข้าสู่ระบบ...";
  msg.textContent = "";

  try {
    const snap = await db.collection("employees")
      .where("employeeCode", "==", code)
      .limit(1)
      .get();

    if (snap.empty) {
      msg.textContent = "ไม่พบรหัสพนักงาน";
      return;
    }

    const doc = snap.docs[0];
    const emp = { id: doc.id, ...doc.data() };

    if (emp.active === false) {
      msg.textContent = "บัญชีนี้ถูกปิดใช้งาน";
      return;
    }

    const pinHash = await sha256(pin);
    if (emp.pinHash !== pinHash) {
      msg.textContent = "PIN ไม่ถูกต้อง";
      return;
    }

    setSession(emp);

    await db.collection("auditLogs").add({
      action: "V3_LOGIN",
      actorCode: emp.employeeCode,
      actorName: emp.fullName,
      role: emp.role || "employee",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      userAgent: navigator.userAgent
    }).catch(console.warn);

    if (emp.role === "admin") {
      renderAdminDashboard(emp);
    } else {
      renderEmployeeDashboard(emp);
    }

  } catch (err) {
    console.error(err);
    msg.textContent = "เข้าสู่ระบบไม่สำเร็จ: " + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "เข้าสู่ระบบ";
  }
}

function logout() {
  clearSession();
  renderLogin("ออกจากระบบแล้ว");
}

async function restoreSession() {
  const cached = getSession();

  if (!cached || !cached.id) {
    renderLogin();
    return;
  }

  try {
    const doc = await db.collection("employees").doc(cached.id).get();

    if (!doc.exists) {
      clearSession();
      renderLogin("ไม่พบบัญชีเดิม กรุณาเข้าสู่ระบบใหม่");
      return;
    }

    const emp = { id: doc.id, ...doc.data() };

    if (emp.active === false) {
      clearSession();
      renderLogin("บัญชีนี้ถูกปิดใช้งาน");
      return;
    }

    setSession(emp);

    if (emp.role === "admin") {
      renderAdminDashboard(emp);
    } else {
      renderEmployeeDashboard(emp);
    }
  } catch (err) {
    console.error(err);
    renderLogin("โหลด session ไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่");
  }
}

function layoutShell({ title, subtitle, employee, body, nav = "" }) {
  return `
    <main class="app-shell">
      <header class="topbar">
        <div>
          <h1>${safeText(title)}</h1>
          <p class="muted">${safeText(subtitle)}</p>
        </div>
        <div class="top-actions">
          <span class="pill">${safeText(employee.employeeCode || "-")}</span>
          <button id="logoutBtn" class="danger small-btn">ออก</button>
        </div>
      </header>

      ${nav}

      <section class="content">
        ${body}
      </section>
    </main>
  `;
}

function renderAdminDashboard(emp) {
  appEl.innerHTML = layoutShell({
    title: "Admin Dashboard",
    subtitle: `${emp.fullName || "-"} • ${nowText()}`,
    employee: emp,
    nav: `
      <nav class="quick-nav">
        <button class="active">Dashboard</button>
        <button disabled>พนักงาน</button>
        <button disabled>ลงเวลา</button>
        <button disabled>Payroll</button>
      </nav>
    `,
    body: `
      <div class="stats-grid">
        <div class="stat-card"><b id="statEmployees">-</b><span>พนักงานทั้งหมด</span></div>
        <div class="stat-card"><b id="statToday">-</b><span>รายการวันนี้</span></div>
        <div class="stat-card"><b>Step 2</b><span>Login + Session</span></div>
      </div>

      <div class="card wide">
        <h2>สถานะระบบ v3</h2>
        <p class="muted">Step 2 ทำงานแล้ว: Login จริง, แยก role admin/employee, จำ login หลัง refresh</p>
        <div class="actions-row">
          <button id="reloadDashboardBtn" class="secondary">โหลดข้อมูลใหม่</button>
        </div>
      </div>

      <div class="card wide">
        <h2>ขั้นต่อไป</h2>
        <p>Step 3 จะเพิ่มโมดูลพนักงาน + รายชื่อพนักงาน + เพิ่ม/แก้ไขพนักงานแบบแยกไฟล์</p>
      </div>
    `
  });

  document.getElementById("logoutBtn").onclick = logout;
  document.getElementById("reloadDashboardBtn").onclick = () => loadAdminStats();

  loadAdminStats();
}

async function loadAdminStats() {
  const statEmployees = document.getElementById("statEmployees");
  const statToday = document.getElementById("statToday");

  try {
    const empSnap = await db.collection("employees").get();
    statEmployees.textContent = empSnap.size;

    const attSnap = await db.collection("attendance")
      .where("dateKey", "==", todayKey())
      .get()
      .catch(() => ({ size: 0 }));

    statToday.textContent = attSnap.size ?? 0;
  } catch (err) {
    console.error(err);
    statEmployees.textContent = "!";
    statToday.textContent = "!";
  }
}

function renderEmployeeDashboard(emp) {
  appEl.innerHTML = layoutShell({
    title: "Employee Dashboard",
    subtitle: `${emp.fullName || "-"} • ${nowText()}`,
    employee: emp,
    nav: `
      <nav class="bottom-nav">
        <button class="active">หน้าแรก</button>
        <button disabled>ลงเวลา</button>
        <button disabled>ปฏิทิน</button>
        <button disabled>โปรไฟล์</button>
      </nav>
    `,
    body: `
      <div class="hero-card">
        <p class="muted">สวัสดี</p>
        <h2>${safeText(emp.fullName || emp.employeeCode)}</h2>
        <p>${safeText(emp.department || "-")} • ${safeText(emp.position || "-")}</p>
      </div>

      <div class="stats-grid">
        <div class="stat-card"><b id="myTodayStatus">-</b><span>สถานะวันนี้</span></div>
        <div class="stat-card"><b>Step 2</b><span>Dashboard พร้อม</span></div>
      </div>

      <div class="card wide">
        <h2>ระบบ v3 กำลังสร้างทีละ Step</h2>
        <p class="muted">Step 3 จะเพิ่มเมนูลงเวลาแบบใหม่ Selfie + GPS + Geofence</p>
      </div>
    `
  });

  document.getElementById("logoutBtn").onclick = logout;
  loadEmployeeToday(emp);
}

async function loadEmployeeToday(emp) {
  const el = document.getElementById("myTodayStatus");
  if (!el) return;

  try {
    const snap = await db.collection("attendance")
      .where("employeeId", "==", emp.id)
      .where("dateKey", "==", todayKey())
      .get();

    el.textContent = snap.empty ? "ยังไม่ลงเวลา" : `${snap.size} รายการ`;
  } catch {
    el.textContent = "-";
  }
}

async function start() {
  renderLoading();

  try {
    await initFirebase();
    await restoreSession();
  } catch (err) {
    console.error(err);
    appEl.innerHTML = `
      <main class="screen center">
        <div class="card error">
          <h1>โหลดระบบไม่สำเร็จ</h1>
          <p>${safeText(err.message)}</p>
        </div>
      </main>
    `;
  }
}

start();
