/* ระบบลงเวลาออนไลน์ PWA + Firebase
   ฟังก์ชันหลัก: login, employee/admin, selfie, GPS, geofence, Firestore, Storage, payroll, export CSV */
'use strict';

const $ = (id) => document.getElementById(id);
const todayKey = () => new Date().toISOString().slice(0, 10);
const pad = (n) => String(n).padStart(2, '0');
const fmtDateTime = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const safeText = (v) => String(v ?? '').replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]));

let app, db, auth, storage;
let currentUser = null;
let currentEmployee = null;
let companySettings = { companyName: 'ระบบลงเวลาออนไลน์', officeLat: null, officeLng: null, radiusMeters: 100 };
let mediaStream = null;
let capturedBlob = null;
let capturedDataUrl = null;
let currentPosition = null;
let lastPayrollRows = [];
let lastAttendanceRows = [];
let deferredPrompt = null;

function toast(msg, ms=2600){ const t=$('toast'); t.textContent=msg; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'), ms); }
function showPanel(id){ ['setupPanel','loginPanel','employeePanel','adminPanel'].forEach(x=>$(x).classList.add('hidden')); $(id).classList.remove('hidden'); }
function setBusy(btn, busy, text){ if(!btn) return; if(busy){ btn.dataset.old=btn.textContent; btn.textContent=text||'กำลังทำงาน...'; btn.disabled=true; } else { btn.textContent=btn.dataset.old||btn.textContent; btn.disabled=false; } }

async function sha256(text){
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

function firebaseReady(){
  return window.firebaseConfig && window.firebaseConfig.apiKey && !String(window.firebaseConfig.apiKey).startsWith('YOUR_');
}

async function initFirebase(){
  if(!firebaseReady()){ showPanel('setupPanel'); return; }
  app = firebase.initializeApp(window.firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
  storage = firebase.storage();
  await auth.signInAnonymously();
  currentUser = auth.currentUser;
  await loadSettings();
  showPanel('loginPanel');
}

async function loadSettings(){
  try{
    const doc = await db.collection('settings').doc('company').get();
    if(doc.exists) companySettings = {...companySettings, ...doc.data()};
    $('companyName').textContent = companySettings.companyName || 'ระบบลงเวลาออนไลน์';
  }catch(e){ console.warn(e); }
}

async function logAudit(action, details={}, employee=null){
  try{
    await db.collection('auditLogs').add({
      action, details, createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      actorCode: employee?.employeeCode || currentEmployee?.employeeCode || 'anonymous',
      actorName: employee?.fullName || currentEmployee?.fullName || '',
      userAgent: navigator.userAgent
    });
  }catch(e){ console.warn('audit failed', e); }
}

async function login(){
  const btn=$('loginBtn'); setBusy(btn,true,'กำลังเข้าสู่ระบบ...');
  try{
    const code=$('loginCode').value.trim(); const pin=$('loginPin').value.trim();
    if(!code || !pin) throw new Error('กรุณากรอกรหัสพนักงานและ PIN');
    const snap=await db.collection('employees').where('employeeCode','==',code).limit(1).get();
    if(snap.empty) throw new Error('ไม่พบรหัสพนักงาน');
    const doc=snap.docs[0]; const emp={id:doc.id,...doc.data()};
    if(!emp.active) throw new Error('บัญชีนี้ถูกปิดใช้งาน');
    const pinHash=await sha256(pin);
    if(emp.pinHash!==pinHash) throw new Error('PIN ไม่ถูกต้อง');
    currentEmployee=emp;
    await logAudit('LOGIN',{},emp);
    if(emp.role==='admin') showAdmin(); else showEmployee();
  }catch(e){ toast(e.message,4000); }
  finally{ setBusy(btn,false); }
}

async function seedAdmin(){
  const btn=$('seedAdminBtn'); setBusy(btn,true,'กำลังสร้าง...');
  try{
    const existing=await db.collection('employees').where('role','==','admin').limit(1).get();
    if(!existing.empty) throw new Error('มีแอดมินอยู่แล้ว ถ้าลืม PIN ให้แก้ใน Firebase Console');
    await db.collection('employees').add({
      employeeCode:'admin', fullName:'ผู้ดูแลระบบ', department:'Admin', position:'Admin', role:'admin', active:true,
      pinHash: await sha256('admin123'), hourlyRate:0, dailyRate:0, otMultiplier:1.5, standardStart:'08:00', standardEnd:'17:00',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await logAudit('SEED_ADMIN',{code:'admin'});
    toast('สร้างแอดมินแล้ว: admin / admin123');
  }catch(e){ toast(e.message,5000); }
  finally{ setBusy(btn,false); }
}

function logout(){ stopCamera(); currentEmployee=null; capturedBlob=null; capturedDataUrl=null; currentPosition=null; $('loginPin').value=''; showPanel('loginPanel'); }

async function showEmployee(){
  showPanel('employeePanel');
  $('empName').textContent=currentEmployee.fullName;
  $('empDetail').textContent=`${currentEmployee.employeeCode} • ${currentEmployee.department||'-'} • ${currentEmployee.position||'-'}`;
  await refreshMyStatus(); await loadMyHistory();
}

async function refreshMyStatus(){
  const snap=await db.collection('attendance').where('employeeId','==',currentEmployee.id).where('dateKey','==',todayKey()).get();
  const rows=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.createdAt?.seconds||0)-(b.createdAt?.seconds||0));
  const last=rows.at(-1);
  const txt=!last?'วันนี้ยังไม่ได้ลงเวลา':`ล่าสุด: ${last.type==='IN'?'เข้างาน':'ออกงาน'} เวลา ${last.createdAt?.toDate ? fmtDateTime(last.createdAt.toDate()) : '-'}`;
  $('todayStatus').textContent=txt;
}

async function loadMyHistory(){
  const snap=await db.collection('attendance').where('employeeId','==',currentEmployee.id).orderBy('createdAt','desc').limit(20).get();
  $('myHistory').innerHTML=snap.docs.map(d=>renderAttendanceItem({id:d.id,...d.data()}, false)).join('') || '<p class="muted">ยังไม่มีประวัติ</p>';
}

async function startCamera(){
  try{
    stopCamera();
    mediaStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'}, audio:false});
    $('camera').srcObject=mediaStream;
  }catch(e){ toast('เปิดกล้องไม่ได้: '+e.message,5000); }
}
function stopCamera(){ if(mediaStream){ mediaStream.getTracks().forEach(t=>t.stop()); mediaStream=null; } }

async function getGPS(){
  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation) return reject(new Error('อุปกรณ์นี้ไม่รองรับ GPS'));
    navigator.geolocation.getCurrentPosition(pos=>{
      currentPosition={lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:pos.coords.accuracy};
      $('gpsStatus').textContent=`GPS: ${currentPosition.lat.toFixed(6)}, ${currentPosition.lng.toFixed(6)} ±${Math.round(currentPosition.accuracy)}m`;
      resolve(currentPosition);
    }, err=>reject(new Error(err.message || 'ไม่ได้รับอนุญาตตำแหน่ง')), {enableHighAccuracy:true, timeout:15000, maximumAge:0});
  });
}

async function captureSelfie(){
  const video=$('camera'); if(!mediaStream) throw new Error('กรุณาเปิดกล้องก่อน');
  await getGPS();
  const canvas=$('snapshot'); const w=video.videoWidth||720; const h=video.videoHeight||960;
  canvas.width=w; canvas.height=h;
  const ctx=canvas.getContext('2d');
  ctx.drawImage(video,0,0,w,h);
  const stamp=[currentEmployee.fullName, currentEmployee.employeeCode, fmtDateTime(new Date()), `GPS: ${currentPosition.lat.toFixed(6)}, ${currentPosition.lng.toFixed(6)}`];
  const boxH=118; ctx.fillStyle='rgba(0,0,0,.62)'; ctx.fillRect(0,h-boxH,w,boxH);
  ctx.fillStyle='#fff'; ctx.font=`${Math.max(22,Math.floor(w/28))}px sans-serif`;
  stamp.forEach((s,i)=>ctx.fillText(s,18,h-boxH+32+i*26));
  capturedDataUrl=canvas.toDataURL('image/jpeg',0.86);
  capturedBlob=await (await fetch(capturedDataUrl)).blob();
  $('preview').src=capturedDataUrl; $('preview').classList.remove('hidden');
  toast('ถ่ายรูปและดึงตำแหน่งแล้ว');
}

function distanceMeters(lat1,lng1,lat2,lng2){
  const R=6371000, toRad=x=>x*Math.PI/180;
  const dLat=toRad(lat2-lat1), dLng=toRad(lng2-lng1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return 2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

async function clock(type){
  const btn= type==='IN' ? $('clockInBtn') : $('clockOutBtn'); setBusy(btn,true,'กำลังบันทึก...');
  try{
    if(!capturedBlob) throw new Error('ต้องถ่ายรูปหน้าตัวเองก่อนลงเวลา');
    if(!currentPosition) await getGPS();
    let dist=null, inGeo=null;
    if(companySettings.officeLat && companySettings.officeLng){
      dist=distanceMeters(currentPosition.lat,currentPosition.lng,Number(companySettings.officeLat),Number(companySettings.officeLng));
      inGeo=dist <= Number(companySettings.radiusMeters||100);
    }
    const id=`${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const path=`attendance/${currentEmployee.employeeCode}/${todayKey()}-${id}.jpg`;
    await storage.ref(path).put(capturedBlob,{contentType:'image/jpeg'});
    const photoURL=await storage.ref(path).getDownloadURL();
    await db.collection('attendance').add({
      employeeId:currentEmployee.id, employeeCode:currentEmployee.employeeCode, fullName:currentEmployee.fullName,
      type, source:'EMPLOYEE', dateKey:todayKey(), createdAt:firebase.firestore.FieldValue.serverTimestamp(), clientTime:new Date().toISOString(),
      photoPath:path, photoURL, latitude:currentPosition.lat, longitude:currentPosition.lng, accuracy:currentPosition.accuracy,
      mapUrl:`https://maps.google.com/?q=${currentPosition.lat},${currentPosition.lng}`,
      distanceMeters:dist, inGeofence:inGeo, userAgent:navigator.userAgent
    });
    await logAudit(type==='IN'?'CLOCK_IN':'CLOCK_OUT',{employeeCode:currentEmployee.employeeCode, inGeofence:inGeo, distanceMeters:dist});
    capturedBlob=null; capturedDataUrl=null; $('preview').classList.add('hidden');
    toast('บันทึกสำเร็จ'); await refreshMyStatus(); await loadMyHistory();
  }catch(e){ toast(e.message,5000); }
  finally{ setBusy(btn,false); }
}

async function autoClock(){
  const snap=await db.collection('attendance').where('employeeId','==',currentEmployee.id).where('dateKey','==',todayKey()).get();
  const rows=snap.docs.map(d=>d.data()).sort((a,b)=>(a.createdAt?.seconds||0)-(b.createdAt?.seconds||0));
  const last=rows.at(-1); await clock(!last || last.type==='OUT' ? 'IN' : 'OUT');
}

function showAdmin(){
  showPanel('adminPanel'); $('adminName').textContent=`${currentEmployee.fullName} (${currentEmployee.employeeCode})`;
  setDefaultDates(); fillSettings(); loadTodayAdmin(); loadEmployees(); loadHolidays();
}
function setDefaultDates(){ const t=todayKey(); ['attStart','attEnd','payStart','payEnd','corrDate','holidayDate'].forEach(id=>$(id).value=t); $('payStart').value=t.slice(0,8)+'01'; $('attStart').value=t.slice(0,8)+'01'; }
function switchTab(tab){ document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab)); document.querySelectorAll('.tab').forEach(el=>el.classList.add('hidden')); $('tab'+tab[0].toUpperCase()+tab.slice(1)).classList.remove('hidden'); }

async function loadTodayAdmin(){
  const snap=await db.collection('attendance').where('dateKey','==',todayKey()).get();
  const rows=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
  $('todayList').innerHTML=rows.map(r=>renderAttendanceItem(r,true)).join('') || '<p class="muted">วันนี้ยังไม่มีข้อมูล</p>';
}

function renderAttendanceItem(r, admin){
  const dt=r.createdAt?.toDate ? fmtDateTime(r.createdAt.toDate()) : (r.overrideTime || r.clientTime || '-');
  const geo=r.inGeofence===null||r.inGeofence===undefined?'':`<span class="badge ${r.inGeofence?'good':'bad'}">${r.inGeofence?'ในพื้นที่':'นอกพื้นที่'} ${r.distanceMeters?Math.round(r.distanceMeters)+'m':''}</span>`;
  const img=r.photoURL?`<img src="${r.photoURL}" class="thumb" loading="lazy" />`:'';
  return `<div class="item"><div class="item-head"><div>${img}<b>${safeText(r.fullName||r.employeeCode)}</b><br><span class="muted">${safeText(r.employeeCode)} • ${r.type==='IN'?'เข้างาน':'ออกงาน'} • ${dt}</span><br>${geo} <span class="badge">${safeText(r.source||'EMPLOYEE')}</span></div></div><div class="row-actions">${r.mapUrl?`<a href="${r.mapUrl}" target="_blank"><button class="ghost">เปิดแผนที่</button></a>`:''}${admin?`<button class="ghost" onclick="copyText('${r.id}')">คัดลอก ID</button>`:''}</div></div>`;
}
window.copyText = async (t)=>{ await navigator.clipboard.writeText(t); toast('คัดลอกแล้ว'); };

async function loadEmployees(){
  const snap=await db.collection('employees').orderBy('employeeCode').get();
  const rows=snap.docs.map(d=>({id:d.id,...d.data()}));
  $('employeeList').innerHTML=rows.map(e=>`<div class="item"><div class="item-head"><div><b>${safeText(e.employeeCode)} - ${safeText(e.fullName)}</b><br><span class="muted">${safeText(e.department)} • ${safeText(e.position)} • ${e.role}</span><br><span class="badge ${e.active?'good':'bad'}">${e.active?'ใช้งาน':'ปิด'}</span></div></div><div class="row-actions"><button onclick="editEmployee('${e.id}')" class="warning">แก้ไข</button><button onclick="toggleEmployee('${e.id}',${e.active?'false':'true'})" class="ghost">${e.active?'ปิดใช้งาน':'เปิดใช้งาน'}</button></div></div>`).join('') || '<p class="muted">ยังไม่มีพนักงาน</p>';
}

function clearEmployeeForm(){ ['empIdEdit','empCode','empFullName','empDept','empPosition','empPin'].forEach(id=>$(id).value=''); $('empRole').value='employee'; $('empHourly').value='0'; $('empDaily').value='0'; $('empOt').value='1.5'; $('empStdStart').value='08:00'; $('empStdEnd').value='17:00'; $('empActive').checked=true; }
window.editEmployee = async (id)=>{
  const doc=await db.collection('employees').doc(id).get(); const e={id:doc.id,...doc.data()};
  $('empIdEdit').value=e.id; $('empCode').value=e.employeeCode||''; $('empFullName').value=e.fullName||''; $('empDept').value=e.department||''; $('empPosition').value=e.position||''; $('empRole').value=e.role||'employee'; $('empHourly').value=e.hourlyRate||0; $('empDaily').value=e.dailyRate||0; $('empOt').value=e.otMultiplier||1.5; $('empStdStart').value=e.standardStart||'08:00'; $('empStdEnd').value=e.standardEnd||'17:00'; $('empActive').checked=!!e.active; $('empPin').value=''; toast('โหลดข้อมูลเข้าฟอร์มแล้ว');
};
window.toggleEmployee = async (id, active)=>{ await db.collection('employees').doc(id).update({active,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}); await logAudit('TOGGLE_EMPLOYEE',{id,active}); loadEmployees(); };

async function saveEmployee(){
  const id=$('empIdEdit').value; const code=$('empCode').value.trim(); const name=$('empFullName').value.trim(); const pin=$('empPin').value.trim();
  if(!code||!name) return toast('กรุณากรอกรหัสและชื่อ'); if(!id && !pin) return toast('พนักงานใหม่ต้องมี PIN');
  const data={employeeCode:code,fullName:name,department:$('empDept').value.trim(),position:$('empPosition').value.trim(),role:$('empRole').value,active:$('empActive').checked,hourlyRate:Number($('empHourly').value||0),dailyRate:Number($('empDaily').value||0),otMultiplier:Number($('empOt').value||1.5),standardStart:$('empStdStart').value||'08:00',standardEnd:$('empStdEnd').value||'17:00',updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
  if(pin) data.pinHash=await sha256(pin);
  if(id) await db.collection('employees').doc(id).update(data); else await db.collection('employees').add({...data,createdAt:firebase.firestore.FieldValue.serverTimestamp()});
  await logAudit(id?'UPDATE_EMPLOYEE':'ADD_EMPLOYEE',{code}); clearEmployeeForm(); loadEmployees(); toast('บันทึกพนักงานแล้ว');
}

async function loadAttendance(){
  const start=$('attStart').value, end=$('attEnd').value;
  const snap=await db.collection('attendance').where('dateKey','>=',start).where('dateKey','<=',end).get();
  lastAttendanceRows=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
  $('attendanceList').innerHTML=lastAttendanceRows.map(r=>renderAttendanceItem(r,true)).join('') || '<p class="muted">ไม่พบข้อมูล</p>';
}

async function saveCorrection(){
  const code=$('corrEmpCode').value.trim(), reason=$('corrReason').value.trim(); if(!code||!reason) return toast('กรอกรหัสพนักงานและเหตุผล');
  const empSnap=await db.collection('employees').where('employeeCode','==',code).limit(1).get(); if(empSnap.empty) return toast('ไม่พบพนักงาน');
  const doc=empSnap.docs[0]; const e={id:doc.id,...doc.data()}; const overrideTime=`${$('corrDate').value} ${$('corrTime').value}:00`;
  await db.collection('attendance').add({employeeId:e.id,employeeCode:e.employeeCode,fullName:e.fullName,type:$('corrType').value,source:'ADMIN_CORRECTION',dateKey:$('corrDate').value,overrideTime,reason,createdAt:firebase.firestore.FieldValue.serverTimestamp(),correctedBy:currentEmployee.employeeCode});
  await logAudit('CORRECT_ATTENDANCE',{employeeCode:code,overrideTime,reason}); toast('บันทึกการแก้ไขแล้ว'); loadAttendance();
}

async function loadHolidays(){
  const snap=await db.collection('holidays').orderBy('dateKey','desc').limit(80).get();
  $('holidayList').innerHTML=snap.docs.map(d=>{const h={id:d.id,...d.data()}; return `<div class="item"><b>${safeText(h.dateKey)}</b> ${safeText(h.description||'')}<div class="row-actions"><button class="danger" onclick="deleteHoliday('${h.id}')">ลบ</button></div></div>`}).join('') || '<p class="muted">ยังไม่มีวันหยุด</p>';
}
async function addHoliday(){ if(!$('holidayDate').value) return toast('เลือกวันที่'); await db.collection('holidays').add({dateKey:$('holidayDate').value,description:$('holidayDesc').value.trim(),isPaid:true,createdAt:firebase.firestore.FieldValue.serverTimestamp()}); await logAudit('ADD_HOLIDAY',{date:$('holidayDate').value}); $('holidayDesc').value=''; loadHolidays(); }
window.deleteHoliday=async(id)=>{ await db.collection('holidays').doc(id).delete(); await logAudit('DELETE_HOLIDAY',{id}); loadHolidays(); };

function fillSettings(){ $('setCompany').value=companySettings.companyName||''; $('setRadius').value=companySettings.radiusMeters||100; $('setLat').value=companySettings.officeLat||''; $('setLng').value=companySettings.officeLng||''; }
async function saveSettings(){ companySettings={companyName:$('setCompany').value.trim()||'ระบบลงเวลาออนไลน์',radiusMeters:Number($('setRadius').value||100),officeLat:$('setLat').value?Number($('setLat').value):null,officeLng:$('setLng').value?Number($('setLng').value):null}; await db.collection('settings').doc('company').set({...companySettings,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}); await logAudit('UPDATE_SETTINGS',companySettings); await loadSettings(); toast('บันทึกตั้งค่าแล้ว'); }
async function useCurrentLocation(){ const p=await getGPS(); $('setLat').value=p.lat.toFixed(6); $('setLng').value=p.lng.toFixed(6); }

async function runPayroll(){
  const start=$('payStart').value, end=$('payEnd').value;
  const [empSnap, attSnap]=await Promise.all([db.collection('employees').get(), db.collection('attendance').where('dateKey','>=',start).where('dateKey','<=',end).get()]);
  const employees=empSnap.docs.map(d=>({id:d.id,...d.data()})).filter(e=>e.role!=='admin');
  const records=attSnap.docs.map(d=>({id:d.id,...d.data()}));
  lastPayrollRows=employees.map(e=>calcPayroll(e, records.filter(r=>r.employeeId===e.id))).filter(r=>r.totalDays>0);
  $('payrollList').innerHTML=lastPayrollRows.map(r=>`<div class="item"><b>${safeText(r.employeeCode)} ${safeText(r.fullName)}</b><br><span class="muted">วันทำงาน ${r.totalDays} • ชม.ปกติ ${r.regularHours.toFixed(2)} • OT ${r.otHours.toFixed(2)} • สาย ${r.lateMinutes} นาที</span><br><b>สุทธิ ${r.netPay.toFixed(2)} บาท</b></div>`).join('') || '<p class="muted">ไม่พบข้อมูลเงินเดือน</p>';
}
function recTime(r){ if(r.overrideTime) return new Date(r.overrideTime.replace(' ','T')); if(r.createdAt?.toDate) return r.createdAt.toDate(); if(r.clientTime) return new Date(r.clientTime); return null; }
function calcPayroll(e, rows){
  const byDate={}; rows.forEach(r=>{ (byDate[r.dateKey] ||= []).push(r); });
  let totalDays=0, regularHours=0, otHours=0, lateMinutes=0;
  Object.entries(byDate).forEach(([date,list])=>{
    list.sort((a,b)=>(recTime(a)||0)-(recTime(b)||0));
    const ins=list.filter(r=>r.type==='IN').map(recTime).filter(Boolean); const outs=list.filter(r=>r.type==='OUT').map(recTime).filter(Boolean);
    if(!ins.length||!outs.length) return;
    const start=ins[0], end=outs[outs.length-1]; if(end<=start) return;
    const hrs=(end-start)/36e5; totalDays++; regularHours+=Math.min(hrs,8); otHours+=Math.max(0,hrs-8);
    if(e.standardStart){ const std=new Date(`${date}T${e.standardStart}:00`); if(start>std) lateMinutes+=Math.round((start-std)/60000); }
  });
  const hourly=Number(e.hourlyRate||0) || (Number(e.dailyRate||0)/8); const otMult=Number(e.otMultiplier||1.5);
  const regularPay=regularHours*hourly, otPay=otHours*hourly*otMult, lateDeduction=lateMinutes*(hourly/60), grossPay=regularPay+otPay, netPay=grossPay-lateDeduction;
  return {employeeCode:e.employeeCode,fullName:e.fullName,department:e.department||'',totalDays,regularHours,otHours,lateMinutes,lateDeduction,grossPay,netPay};
}

async function loadAudit(){
  const snap=await db.collection('auditLogs').orderBy('createdAt','desc').limit(100).get();
  $('auditList').innerHTML=snap.docs.map(d=>{const l=d.data(); const dt=l.createdAt?.toDate?fmtDateTime(l.createdAt.toDate()):'-'; return `<div class="item"><b>${safeText(l.action)}</b><br><span class="muted">${dt} • ${safeText(l.actorCode)} ${safeText(l.actorName)}</span><br><code>${safeText(JSON.stringify(l.details||{}))}</code></div>`}).join('') || '<p class="muted">ยังไม่มี log</p>';
}
function exportCsv(filename, rows){ if(!rows.length) return toast('ไม่มีข้อมูลให้ export'); const headers=Object.keys(rows[0]); const csv=[headers.join(','),...rows.map(r=>headers.map(h=>'"'+String(r[h]??'').replace(/"/g,'""')+'"').join(','))].join('\n'); const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click(); URL.revokeObjectURL(a.href); }
function exportAttendance(){ const rows=lastAttendanceRows.map(r=>({employeeCode:r.employeeCode,fullName:r.fullName,type:r.type,dateKey:r.dateKey,time:r.createdAt?.toDate?fmtDateTime(r.createdAt.toDate()):r.overrideTime,lat:r.latitude,lng:r.longitude,inGeofence:r.inGeofence,distanceMeters:r.distanceMeters,mapUrl:r.mapUrl,photoURL:r.photoURL,source:r.source,reason:r.reason||''})); exportCsv(`attendance-${todayKey()}.csv`,rows); }
function exportPayroll(){ exportCsv(`payroll-${todayKey()}.csv`,lastPayrollRows); }

function bind(){
  $('loginBtn').onclick=login; $('seedAdminBtn').onclick=seedAdmin; $('logoutBtn1').onclick=logout; $('logoutBtn2').onclick=logout;
  $('startCameraBtn').onclick=startCamera; $('captureBtn').onclick=()=>captureSelfie().catch(e=>toast(e.message,5000)); $('clockInBtn').onclick=()=>clock('IN'); $('clockOutBtn').onclick=()=>clock('OUT'); $('autoClockBtn').onclick=autoClock;
  document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
  $('refreshTodayBtn').onclick=loadTodayAdmin; $('saveEmployeeBtn').onclick=saveEmployee; $('clearEmployeeBtn').onclick=clearEmployeeForm;
  $('loadAttendanceBtn').onclick=loadAttendance; $('saveCorrectionBtn').onclick=saveCorrection; $('exportAttendanceBtn').onclick=exportAttendance;
  $('runPayrollBtn').onclick=runPayroll; $('exportPayrollBtn').onclick=exportPayroll; $('addHolidayBtn').onclick=addHoliday;
  $('useCurrentLocationBtn').onclick=()=>useCurrentLocation().catch(e=>toast(e.message,5000)); $('saveSettingsBtn').onclick=saveSettings; $('loadAuditBtn').onclick=loadAudit;
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('installBtn').classList.remove('hidden');}); $('installBtn').onclick=async()=>{ if(deferredPrompt){ deferredPrompt.prompt(); deferredPrompt=null; $('installBtn').classList.add('hidden'); } };
}

if('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(console.warn);
bind(); initFirebase().catch(e=>{console.error(e); toast(e.message,6000); showPanel('setupPanel');});
