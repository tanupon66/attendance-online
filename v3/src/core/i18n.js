const LANG_KEY = "attendance_v3_lang";

const DICT = {
  th: {
    appName: "Attendance Online v3",
    dashboard: "ภาพรวม",
    employees: "พนักงาน",
    attendance: "ลงเวลา",
    summary: "สรุปรายวัน",
    leave: "วันลา",
    calendar: "ปฏิทิน",
    payroll: "Payroll",
    settings: "ตั้งค่า",
    logout: "ออก",
    notifications: "แจ้งเตือน",
    login: "เข้าสู่ระบบ",
    employeeCode: "รหัสพนักงาน",
    pin: "PIN"
  },
  my: {
    appName: "Attendance Online v3",
    dashboard: "ခြုံငုံကြည့်ရန်",
    employees: "ဝန်ထမ်းများ",
    attendance: "အချိန်မှတ်တမ်း",
    summary: "နေ့စဉ် အကျဉ်းချုပ်",
    leave: "ခွင့်",
    calendar: "ပြက္ခဒိန်",
    payroll: "လစာ",
    settings: "ဆက်တင်",
    logout: "ထွက်မည်",
    notifications: "အသိပေးချက်",
    login: "ဝင်ရောက်ရန်",
    employeeCode: "ဝန်ထမ်းကုဒ်",
    pin: "PIN"
  },
  en: {
    appName: "Attendance Online v3",
    dashboard: "Dashboard",
    employees: "Employees",
    attendance: "Attendance",
    summary: "Daily Summary",
    leave: "Leave",
    calendar: "Calendar",
    payroll: "Payroll",
    settings: "Settings",
    logout: "Logout",
    notifications: "Notifications",
    login: "Login",
    employeeCode: "Employee Code",
    pin: "PIN"
  }
};

export function getLang() {
  return localStorage.getItem(LANG_KEY) || "th";
}

export function setLang(lang) {
  localStorage.setItem(LANG_KEY, lang);
}

export function t(key) {
  const lang = getLang();
  return DICT[lang]?.[key] || DICT.th[key] || key;
}

export function langSelector() {
  const lang = getLang();
  return `
    <select id="langSelect" class="lang-select">
      <option value="th" ${lang === "th" ? "selected" : ""}>ไทย</option>
      <option value="my" ${lang === "my" ? "selected" : ""}>မြန်မာ</option>
      <option value="en" ${lang === "en" ? "selected" : ""}>English</option>
    </select>
  `;
}

export function bindLangSelector(onChange) {
  const el = document.getElementById("langSelect");
  if (!el) return;
  el.onchange = () => {
    setLang(el.value);
    if (onChange) onChange(el.value);
  };
}
