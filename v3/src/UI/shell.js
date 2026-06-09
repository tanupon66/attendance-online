import { safeText, nowText } from "../core/utils.js";
import { t, langSelector } from "../core/i18n.js";

export function renderLoading(appEl, text = "กำลังโหลดระบบ...") {
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

export function shell({ employee, title, subtitle, active = "dashboard", body = "" }) {
  const role = employee.role || "employee";
  const adminItems = [
    ["dashboard", t("dashboard"), "🏠"],
    ["employees", t("employees"), "👥"],
    ["attendance", t("attendance"), "🕒"],
    ["summary", t("summary"), "📊"],
    ["leave", t("leave"), "🌴"],
    ["calendar", t("calendar"), "📅"],
    ["payroll", t("payroll"), "💰"],
    ["settings", t("settings"), "⚙️"]
  ];
  const userItems = [
    ["dashboard", t("dashboard"), "🏠"],
    ["clock", t("attendance"), "📷"],
    ["summary", t("summary"), "📊"],
    ["leave", t("leave"), "🌴"],
    ["calendar", t("calendar"), "📅"],
    ["profile", "โปรไฟล์", "👤"]
  ];
  const items = role === "admin" ? adminItems : userItems;

  return `
    <main class="app-shell">
      <aside class="side-nav">
        <div class="side-brand">
          <div class="logo small-logo">A3</div>
          <div><b>Attendance</b><span>Enterprise v3</span></div>
        </div>
        <nav>
          ${items.map(([key, label, icon]) => `
            <button class="nav-btn ${active === key ? "active" : ""}" data-route="${key}">
              <span>${icon}</span><b>${label}</b>
            </button>
          `).join("")}
        </nav>
      </aside>

      <section class="main-area">
        <header class="topbar">
          <div>
            <p class="eyebrow">${safeText(nowText())}</p>
            <h1>${safeText(title)}</h1>
            <p class="muted">${safeText(subtitle || "")}</p>
          </div>
          <div class="top-actions">
            ${langSelector()}
            <button id="notificationBtn" class="icon-btn" title="${t("notifications")}">🔔</button>
            <span class="pill">${safeText(employee.employeeCode || "-")}</span>
            <button id="logoutBtn" class="danger small-btn">${t("logout")}</button>
          </div>
        </header>

        <div class="mobile-nav">
          ${items.map(([key, label, icon]) => `
            <button class="nav-btn ${active === key ? "active" : ""}" data-route="${key}">
              <span>${icon}</span><small>${label}</small>
            </button>
          `).join("")}
        </div>

        <section class="content">${body}</section>
      </section>
    </main>
  `;
}
