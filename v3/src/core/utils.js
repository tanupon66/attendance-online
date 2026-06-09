export const SESSION_KEY = "attendance_v3_employee";

export function safeText(value) {
  return String(value ?? "").replace(/[&<>"]/g, s => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;"
  }[s]));
}

export function todayKey() { return new Date().toISOString().slice(0, 10); }
export function monthKey() { return new Date().toISOString().slice(0, 7); }
export function pad(n) { return String(n).padStart(2, "0"); }

export function fmtDateTime(d) {
  if (!d) return "-";
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
export function nowText() { return new Date().toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }); }

export async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export function setSession(employee) { localStorage.setItem(SESSION_KEY, JSON.stringify(employee)); }
export function getSession() { try { const raw = localStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } }
export function clearSession() { localStorage.removeItem(SESSION_KEY); }

export function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000, toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
export function parseDateTime(dateKey, hhmm) { return (!dateKey || !hhmm) ? null : new Date(`${dateKey}T${hhmm}:00`); }
export function hoursBetween(a, b) { return (!a || !b || b <= a) ? 0 : (b - a) / 36e5; }
export function minutesBetween(a, b) { return (!a || !b || b <= a) ? 0 : Math.round((b - a) / 60000); }
export function recTime(r) {
  if (r.createdAt?.toDate) return r.createdAt.toDate();
  if (r.clientTime) return new Date(r.clientTime);
  if (r.clientTimeText) return new Date(String(r.clientTimeText).replace(" ", "T"));
  return null;
}
export function dateRange(start, end) {
  const out = [];
  let d = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  while (d <= e) { out.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate()+1); }
  return out;
}
export function money(n) { return Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
export function exportCsv(filename, rows) {
  if (!rows.length) return alert("ไม่มีข้อมูลให้ export");
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map(r => headers.map(h => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}
