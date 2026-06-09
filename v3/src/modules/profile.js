import { db } from "../core/firebase.js";
import { safeText, sha256, setSession } from "../core/utils.js";

export async function renderProfileModule(container, employee){
  container.innerHTML = `
    <div class="module-head"><div><h2>โปรไฟล์</h2><p class="muted">ข้อมูลส่วนตัว แยกจาก Dashboard และ Notifications</p></div></div>
    <section class="card wide">
      <div class="profile-head">
        <div class="avatar big-avatar">${safeText(String(employee.fullName||employee.employeeCode||"?").slice(0,1))}</div>
        <div><h2>${safeText(employee.fullName||"-")}</h2><p class="muted">${safeText(employee.employeeCode||"-")} • ${safeText(employee.department||"-")} • ${safeText(employee.position||"-")}</p></div>
      </div>
      <div class="detail-grid">
        <div class="detail-row"><b>สิทธิ์</b>${safeText(employee.role||"employee")}</div>
        <div class="detail-row"><b>วิธีจ่าย</b>${safeText(employee.payType||"-")}</div>
        <div class="detail-row"><b>กะงาน</b>${safeText(employee.shiftStart||"08:00")} - ${safeText(employee.shiftEnd||"17:00")} / พัก ${safeText(employee.breakMinutes??60)} นาที</div>
      </div>
    </section>
    <section class="card wide">
      <h3>เปลี่ยน PIN</h3>
      <div class="form-grid"><label>PIN ใหม่</label><input id="newPin" type="password"><label>ยืนยัน PIN</label><input id="newPin2" type="password"></div>
      <button id="changePinBtn" class="primary">เปลี่ยน PIN</button>
      <p id="profileMsg" class="message"></p>
    </section>
  `;
  document.getElementById("changePinBtn").onclick=()=>changePin(employee);
}
async function changePin(employee){
  const p1=document.getElementById("newPin").value.trim(), p2=document.getElementById("newPin2").value.trim(), msg=document.getElementById("profileMsg");
  if(!p1 || p1.length<4){msg.textContent="PIN ต้องมีอย่างน้อย 4 ตัว";return}
  if(p1!==p2){msg.textContent="PIN ไม่ตรงกัน";return}
  const pinHash=await sha256(p1);
  await db.collection("employees").doc(employee.id).update({pinHash,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
  const updated={...employee,pinHash};
  setSession(updated);
  msg.textContent="เปลี่ยน PIN สำเร็จ";
}
