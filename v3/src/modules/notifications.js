import { db } from "../core/firebase.js";
import { safeText } from "../core/utils.js";

export async function renderNotificationsModule(container, employee, mode="employee"){
  container.innerHTML = `
    <div class="module-head">
      <div><h2>Notification Center</h2><p class="muted">ศูนย์แจ้งเตือนเดียว ไม่ซ้ำซ้อนกับหน้าอื่น</p></div>
      ${mode==="admin" ? `<button id="newNotiBtn" class="primary compact">+ ส่งแจ้งเตือน</button>` : ""}
    </div>
    <section id="notiForm" class="card wide hidden">
      <h3>ส่งข้อความถึงพนักงาน</h3>
      <div class="form-grid">
        <label>รหัสพนักงาน</label><input id="notiEmpCode" placeholder="เว้นว่าง = ทุกคน">
        <label>หัวข้อ</label><input id="notiTitle">
        <label>ข้อความ</label><input id="notiMessage">
      </div>
      <button id="sendNotiBtn" class="primary">ส่งแจ้งเตือน</button>
      <p id="notiMsg" class="message"></p>
    </section>
    <section class="card wide">
      <div class="actions-row">
        <button id="markAllReadBtn" class="secondary compact">อ่านทั้งหมด</button>
        <button id="deleteReadBtn" class="danger compact">ลบที่อ่านแล้ว</button>
        <button id="reloadNotiBtn" class="secondary compact">โหลดใหม่</button>
      </div>
      <div id="notiList" class="list"></div>
    </section>
  `;
  if(mode==="admin"){
    document.getElementById("newNotiBtn").onclick=()=>document.getElementById("notiForm").classList.toggle("hidden");
    document.getElementById("sendNotiBtn").onclick=sendNotification;
  }
  document.getElementById("markAllReadBtn").onclick=()=>markAllRead(employee,mode);
  document.getElementById("deleteReadBtn").onclick=()=>deleteRead(employee,mode);
  document.getElementById("reloadNotiBtn").onclick=()=>loadNotifications(employee,mode);
  await loadNotifications(employee,mode);
}

async function sendNotification(){
  const code=document.getElementById("notiEmpCode").value.trim();
  const title=document.getElementById("notiTitle").value.trim();
  const message=document.getElementById("notiMessage").value.trim();
  const msg=document.getElementById("notiMsg");
  if(!title||!message){msg.textContent="กรอกหัวข้อและข้อความ";return}
  if(code){
    const snap=await db.collection("employees").where("employeeCode","==",code).limit(1).get();
    if(snap.empty){msg.textContent="ไม่พบพนักงาน";return}
    const e={id:snap.docs[0].id,...snap.docs[0].data()};
    await db.collection("notifications").add({employeeId:e.id,employeeCode:e.employeeCode,title,message,type:"admin_message",read:false,createdAt:firebase.firestore.FieldValue.serverTimestamp()});
  }else{
    const snap=await db.collection("employees").where("role","==","employee").get();
    for(const d of snap.docs){
      const e={id:d.id,...d.data()};
      await db.collection("notifications").add({employeeId:e.id,employeeCode:e.employeeCode,title,message,type:"admin_message",read:false,createdAt:firebase.firestore.FieldValue.serverTimestamp()});
    }
  }
  msg.textContent="ส่งแจ้งเตือนแล้ว";
}

async function getNotiRows(employee,mode){
  const snap=await db.collection("notifications").get();
  let rows=snap.docs.map(d=>({id:d.id,...d.data()}));
  if(mode!=="admin") rows=rows.filter(r=>r.employeeId===employee.id);
  rows.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
  return rows;
}
async function loadNotifications(employee,mode){
  const list=document.getElementById("notiList");
  list.innerHTML=`<div class="empty-state">กำลังโหลด...</div>`;
  try{
    const rows=await getNotiRows(employee,mode);
    list.innerHTML=rows.length?rows.map(card).join(""):`<div class="empty-state">ยังไม่มีแจ้งเตือน</div>`;
    rows.forEach(r=>{
      document.getElementById(`read-${r.id}`).onclick=()=>db.collection("notifications").doc(r.id).update({read:true,readAt:firebase.firestore.FieldValue.serverTimestamp()}).then(()=>loadNotifications(employee,mode));
      document.getElementById(`del-${r.id}`).onclick=()=>db.collection("notifications").doc(r.id).delete().then(()=>loadNotifications(employee,mode));
    });
  }catch(err){list.innerHTML=`<div class="empty-state error-text">${safeText(err.message)}</div>`}
}
function card(r){
  return `<article class="summary-card ${r.read?"is-read":""}"><h3>${safeText(r.title||"-")}</h3><p>${safeText(r.message||"")}</p><div class="badges"><span class="badge ${r.read?"good":"warn"}">${r.read?"อ่านแล้ว":"ใหม่"}</span><span class="badge">${safeText(r.employeeCode||"-")}</span><span class="badge">${safeText(r.type||"-")}</span></div><div class="actions-row"><button id="read-${r.id}" class="secondary compact">อ่านแล้ว</button><button id="del-${r.id}" class="danger compact">ลบ</button></div></article>`;
}
async function markAllRead(employee,mode){
  const rows=await getNotiRows(employee,mode);
  for(const r of rows.filter(x=>!x.read)) await db.collection("notifications").doc(r.id).update({read:true,readAt:firebase.firestore.FieldValue.serverTimestamp()});
  await loadNotifications(employee,mode);
}
async function deleteRead(employee,mode){
  const rows=await getNotiRows(employee,mode);
  for(const r of rows.filter(x=>x.read)) await db.collection("notifications").doc(r.id).delete();
  await loadNotifications(employee,mode);
}
