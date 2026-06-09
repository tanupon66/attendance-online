import { initFirebase, db } from "./core/firebase.js";

const appEl = document.getElementById("app");

function renderLoading() {
  appEl.innerHTML = `
    <main class="screen center">
      <div class="card">
        <h1>Attendance Online v3</h1>
        <p>กำลังโหลดระบบ...</p>
      </div>
    </main>
  `;
}

function renderLogin() {
  appEl.innerHTML = `
    <main class="screen">
      <section class="login-card">
        <h1>Attendance Online v3</h1>
        <p class="muted">ระบบลงเวลาออนไลน์เวอร์ชันใหม่</p>

        <label>รหัสพนักงาน</label>
        <input id="loginCode" placeholder="เช่น admin หรือ 001" />

        <label>PIN</label>
        <input id="loginPin" type="password" placeholder="PIN" />

        <button id="loginBtn" class="primary">เข้าสู่ระบบ</button>
        <button id="seedAdminBtn" class="secondary">สร้างแอดมินเริ่มต้น</button>

        <p id="loginMsg" class="message"></p>
      </section>
    </main>
  `;

  document.getElementById("seedAdminBtn").onclick = seedAdmin;
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function seedAdmin() {
  const msg = document.getElementById("loginMsg");
  msg.textContent = "กำลังสร้างแอดมิน...";

  try {
    const snap = await db.collection("employees")
      .where("role", "==", "admin")
      .limit(1)
      .get();

    if (!snap.empty) {
      msg.textContent = "มีแอดมินอยู่แล้ว";
      return;
    }

    await db.collection("employees").add({
      employeeCode: "admin",
      fullName: "ผู้ดูแลระบบ",
      role: "admin",
      active: true,
      pinHash: await sha256("admin123"),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    msg.textContent = "สร้างแอดมินสำเร็จ: admin / admin123";
  } catch (err) {
    console.error(err);
    msg.textContent = "ผิดพลาด: " + err.message;
  }
}

async function start() {
  renderLoading();

  try {
    await initFirebase();
    renderLogin();
  } catch (err) {
    appEl.innerHTML = `
      <main class="screen center">
        <div class="card error">
          <h1>โหลดระบบไม่สำเร็จ</h1>
          <p>${err.message}</p>
        </div>
      </main>
    `;
  }
}

start();
