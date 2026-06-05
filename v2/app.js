'use strict';
// v2.5.0: แก้โหลดรายชื่อพนักงาน, ลบพนักงาน, ลบข้อมูลเก่า/เคลียร์ log และอ่าน attendance เก่าได้ดีขึ้น
const $=id=>document.getElementById(id);
const pad=n=>String(n).padStart(2,'0');
const todayKey=()=>new Date().toISOString().slice(0,10);
const fmtDateTime=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const safeText=v=>String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
const money=n=>Number(n||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2});
let app,auth,db,currentUser,currentEmployee=null,mediaStream=null,capturedDataUrl=null,currentPosition=null,deferredPrompt=null;
let companySettings={companyName:'ระบบลงเวลาออนไลน์',officeLat:null,officeLng:null,radiusMeters:100};
let lastAttendanceRows=[],lastPayrollRows=[],shiftCache=[],benefitCache=[];
let attendanceDetailMap={};

function toast(msg,ms=3200){const t=$('toast'); if(!t) return alert(msg); t.textContent=msg; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'),ms)}
function showPanel(id){['setupPanel','loginPanel','employeePanel','adminPanel'].forEach(x=>$(x)?.classList.add('hidden')); $(id)?.classList.remove('hidden')}
function setBusy(btn,busy,text){if(!btn)return; if(busy){btn.dataset.old=btn.textContent; btn.textContent=text||'กำลังทำงาน...'; btn.disabled=true}else{btn.textContent=btn.dataset.old||btn.textContent; btn.disabled=false}}
async function sha256(text){const data=new TextEncoder().encode(text); const hash=await crypto.subtle.digest('SHA-256',data); return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')}
function cfg(){return window.firebaseConfig||window.FIREBASE_CONFIG||null}
function firebaseReady(){const c=cfg(); return c&&c.apiKey&&!String(c.apiKey).startsWith('YOUR_')}
async function initFirebase(){if(!firebaseReady()){showPanel('setupPanel');return} app=firebase.initializeApp(cfg()); auth=firebase.auth(); db=firebase.firestore(); await auth.signInAnonymously(); currentUser=auth.currentUser; await loadSettings(); await restoreSession(); if(!currentEmployee) showPanel('loginPanel')}
async function logAudit(action,details={},employee=null){try{await db.collection('auditLogs').add({action,details,createdAt:firebase.firestore.FieldValue.serverTimestamp(),actorCode:employee?.employeeCode||currentEmployee?.employeeCode||'anonymous',actorName:employee?.fullName||currentEmployee?.fullName||'',userAgent:navigator.userAgent})}catch(e){console.warn('audit failed',e)}}
async function loadSettings(){try{const d=await db.collection('settings').doc('company').get(); if(d.exists) companySettings={...companySettings,...d.data()}; if($('companyName')) $('companyName').textContent=companySettings.companyName||'ระบบลงเวลาออนไลน์'}catch(e){console.warn(e)}}
async function restoreSession(){const id=localStorage.getItem('attendance.currentEmployeeId'); if(!id)return; try{const d=await db.collection('employees').doc(id).get(); if(d.exists&&d.data().active){currentEmployee={id:d.id,...d.data()}; currentEmployee.role==='admin'?showAdmin():showEmployee()}else localStorage.removeItem('attendance.currentEmployeeId')}catch(e){console.warn(e)}}
async function login(){const btn=$('loginBtn'); setBusy(btn,true,'กำลังเข้าสู่ระบบ...'); try{const code=$('loginCode').value.trim(), pin=$('loginPin').value.trim(); if(!code||!pin) throw new Error('กรุณากรอกรหัสพนักงานและ PIN'); const snap=await db.collection('employees').where('employeeCode','==',code).limit(1).get(); if(snap.empty) throw new Error('ไม่พบรหัสพนักงาน'); const doc=snap.docs[0], emp={id:doc.id,...doc.data()}; if(!emp.active) throw new Error('บัญชีนี้ถูกปิดใช้งาน'); if(emp.pinHash!==await sha256(pin)) throw new Error('PIN ไม่ถูกต้อง'); currentEmployee=emp; localStorage.setItem('attendance.currentEmployeeId',emp.id); await logAudit('LOGIN',{},emp); emp.role==='admin'?showAdmin():showEmployee()}catch(e){toast(e.message,5000)}finally{setBusy(btn,false)}}
async function seedAdmin(){const btn=$('seedAdminBtn'); setBusy(btn,true,'กำลังสร้าง...'); try{const existing=await db.collection('employees').where('role','==','admin').limit(1).get(); if(!existing.empty) throw new Error('มีแอดมินอยู่แล้ว'); const shift=await ensureDefaultShift(); await db.collection('employees').add({employeeCode:'admin',fullName:'ผู้ดูแลระบบ',department:'Admin',position:'Admin',role:'admin',active:true,pinHash:await sha256('admin123'),payType:'monthly',payCycle:'monthly',hourlyRate:0,dailyRate:0,monthlySalary:0,otMultiplier:1.5,shiftId:shift.id,createdAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()}); toast('สร้างแอดมินแล้ว: admin / admin123')}catch(e){toast(e.message,5000)}finally{setBusy(btn,false)}}
function logout(){stopCamera(); localStorage.removeItem('attendance.currentEmployeeId'); currentEmployee=null; capturedDataUrl=null; currentPosition=null; if($('loginPin')) $('loginPin').value=''; showPanel('loginPanel')}

async function ensureDefaultShift(){let s=await db.collection('shifts').limit(1).get(); if(!s.empty) return {id:s.docs[0].id,...s.docs[0].data()}; const ref=await db.collection('shifts').add({name:'กะปกติ 08:00-17:00',start:'08:00',end:'17:00',breakMinutes:60,regularHours:8,active:true,createdAt:firebase.firestore.FieldValue.serverTimestamp()}); return {id:ref.id,name:'กะปกติ 08:00-17:00',start:'08:00',end:'17:00',breakMinutes:60,regularHours:8,active:true}}
async function getShifts(){const snap=await db.collection('shifts').orderBy('name').get(); shiftCache=snap.docs.map(d=>({id:d.id,...d.data()})); return shiftCache}
async function getBenefits(){const snap=await db.collection('benefits').where('active','==',true).get(); benefitCache=snap.docs.map(d=>({id:d.id,...d.data()})); return benefitCache}
function getShift(id){return shiftCache.find(s=>s.id===id)||shiftCache[0]||{start:'08:00',end:'17:00',breakMinutes:60,regularHours:8,name:'กะปกติ'}}

async function showEmployee(){showPanel('employeePanel'); $('empName').textContent=currentEmployee.fullName; $('empDetail').textContent=`${currentEmployee.employeeCode} • ${currentEmployee.department||'-'} • ${currentEmployee.position||'-'}`; setUserDefaultDates(); await refreshMyStatus(); await loadMyHistory()}
function setUserDefaultDates(){const t=todayKey(); ['userOtDate','leaveStart','leaveEnd'].forEach(id=>{if($(id)) $(id).value=t})}
async function refreshMyStatus(){const rows=await getAttendanceRows(currentEmployee.id,todayKey(),todayKey()); const last=rows.sort((a,b)=>recMillis(a)-recMillis(b)).at(-1); $('todayStatus').textContent=!last?'วันนี้ยังไม่ได้ลงเวลา':`ล่าสุด: ${last.type==='IN'?'เข้างาน':'ออกงาน'} เวลา ${displayTime(last)}`}
async function loadMyHistory(){try{const rows=await getAttendanceRows(currentEmployee.id,null,null); const daily=pairAttendance(rows).slice(0,30); $('myHistory').innerHTML=daily.map(r=>renderDailyItem(r,false)).join('')||'<p class="muted">ยังไม่มีประวัติ</p>'}catch(e){console.error(e); $('myHistory').innerHTML=`<p class="muted">โหลดประวัติไม่สำเร็จ: ${safeText(e.message)}</p>`}}
async function startCamera(){try{stopCamera(); mediaStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false}); $('camera').srcObject=mediaStream}catch(e){toast('เปิดกล้องไม่ได้: '+e.message,5000)}}
function stopCamera(){if(mediaStream){mediaStream.getTracks().forEach(t=>t.stop());mediaStream=null}}
async function getGPS(){return new Promise((resolve,reject)=>{if(!navigator.geolocation) return reject(new Error('อุปกรณ์นี้ไม่รองรับ GPS')); navigator.geolocation.getCurrentPosition(pos=>{currentPosition={lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:pos.coords.accuracy}; if($('gpsStatus')) $('gpsStatus').textContent=`GPS: ${currentPosition.lat.toFixed(6)}, ${currentPosition.lng.toFixed(6)} ±${Math.round(currentPosition.accuracy)}m`; resolve(currentPosition)},err=>reject(new Error(err.message||'ไม่ได้รับอนุญาตตำแหน่ง')),{enableHighAccuracy:true,timeout:15000,maximumAge:0})})}
async function captureSelfie(){const video=$('camera'); if(!mediaStream) throw new Error('กรุณาเปิดกล้องก่อน'); if(!currentEmployee) throw new Error('กรุณาเข้าสู่ระบบก่อน'); await getGPS(); const sw=video.videoWidth||720, sh=video.videoHeight||960, maxW=260, scale=Math.min(1,maxW/sw), w=Math.round(sw*scale), h=Math.round(sh*scale); const canvas=$('snapshot'); canvas.width=w; canvas.height=h; const ctx=canvas.getContext('2d'); ctx.drawImage(video,0,0,w,h); const stamp=[currentEmployee.fullName,currentEmployee.employeeCode,fmtDateTime(new Date()),`GPS: ${currentPosition.lat.toFixed(6)}, ${currentPosition.lng.toFixed(6)}`]; const boxH=74; ctx.fillStyle='rgba(0,0,0,.68)'; ctx.fillRect(0,h-boxH,w,boxH); ctx.fillStyle='#fff'; ctx.font='11px sans-serif'; stamp.forEach((s,i)=>ctx.fillText(s,8,h-boxH+15+i*16)); capturedDataUrl=canvas.toDataURL('image/jpeg',0.22); const bytes=Math.round(capturedDataUrl.length*3/4); if(bytes>650000){capturedDataUrl=null; throw new Error('รูปยังใหญ่เกินไป กรุณาถ่ายใหม่')} $('preview').src=capturedDataUrl; $('preview').classList.remove('hidden'); toast('ถ่ายรูปและดึงตำแหน่งแล้ว')}
function distanceMeters(lat1,lng1,lat2,lng2){const R=6371000,toRad=x=>x*Math.PI/180,dLat=toRad(lat2-lat1),dLng=toRad(lng2-lng1); const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2; return 2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))}
async function clock(type){const btn=type==='IN'?$('clockInBtn'):$('clockOutBtn'); setBusy(btn,true,'กำลังบันทึก...'); try{if(!capturedDataUrl) throw new Error('ต้องถ่ายรูปหน้าตัวเองก่อนลงเวลา'); if(!currentPosition) await getGPS(); let dist=null,inGeo=null; if(companySettings.officeLat&&companySettings.officeLng){dist=distanceMeters(currentPosition.lat,currentPosition.lng,Number(companySettings.officeLat),Number(companySettings.officeLng)); inGeo=dist<=Number(companySettings.radiusMeters||100)} const now=new Date(); const data={employeeId:currentEmployee.id,employeeCode:currentEmployee.employeeCode,fullName:currentEmployee.fullName,type,source:'EMPLOYEE',dateKey:todayKey(),createdAt:firebase.firestore.FieldValue.serverTimestamp(),clientTime:now.toISOString(),clientTimeText:fmtDateTime(now),photoPath:'firestore-base64',photoURL:capturedDataUrl,photoMode:'base64',latitude:currentPosition.lat,longitude:currentPosition.lng,accuracy:currentPosition.accuracy,mapUrl:`https://maps.google.com/?q=${currentPosition.lat},${currentPosition.lng}`,distanceMeters:dist,inGeofence:inGeo,userAgent:navigator.userAgent}; await Promise.race([db.collection('attendance').add(data),new Promise((_,rej)=>setTimeout(()=>rej(new Error('บันทึกช้าเกินไป กรุณาเช็กอินเทอร์เน็ตแล้วลองใหม่')),20000))]); await logAudit(type==='IN'?'CLOCK_IN':'CLOCK_OUT',{employeeCode:currentEmployee.employeeCode,inGeofence:inGeo,distanceMeters:dist}); capturedDataUrl=null; currentPosition=null; $('preview').removeAttribute('src'); $('preview').classList.add('hidden'); if($('gpsStatus')) $('gpsStatus').textContent=''; toast('บันทึกสำเร็จ'); await refreshMyStatus(); await loadMyHistory()}catch(e){console.error(e); toast('บันทึกไม่สำเร็จ: '+e.message,6000)}finally{setBusy(btn,false)}}
async function autoClock(){const rows=await getAttendanceRows(currentEmployee.id,todayKey(),todayKey()); const last=rows.sort((a,b)=>recMillis(a)-recMillis(b)).at(-1); await clock(!last||last.type==='OUT'?'IN':'OUT')}
async function submitOt(){const btn=$('submitOtBtn'); setBusy(btn,true,'กำลังส่ง...'); try{const dateKey=$('userOtDate').value, hours=Number($('userOtHours').value||0), reason=$('userOtReason').value.trim(); if(!dateKey||hours<=0||!reason) throw new Error('กรุณากรอกวันที่ ชั่วโมง และเหตุผล OT'); await db.collection('otRequests').add({employeeId:currentEmployee.id,employeeCode:currentEmployee.employeeCode,fullName:currentEmployee.fullName,dateKey,hours,reason,status:'pending',createdAt:firebase.firestore.FieldValue.serverTimestamp()}); await logAudit('SUBMIT_OT',{dateKey,hours}); toast('ส่งคำขอ OT แล้ว')}catch(e){toast(e.message,5000)}finally{setBusy(btn,false)}}
async function submitLeave(){const btn=$('submitLeaveBtn'); setBusy(btn,true,'กำลังส่ง...'); try{const type=$('leaveType').value,start=$('leaveStart').value,end=$('leaveEnd').value,reason=$('leaveReason').value.trim(); if(!start||!end||!reason) throw new Error('กรุณากรอกข้อมูลวันลา'); await db.collection('leaveRequests').add({employeeId:currentEmployee.id,employeeCode:currentEmployee.employeeCode,fullName:currentEmployee.fullName,type,startDate:start,endDate:end,reason,status:'pending',createdAt:firebase.firestore.FieldValue.serverTimestamp()}); await logAudit('SUBMIT_LEAVE',{type,start,end}); toast('ส่งคำขอลาแล้ว')}catch(e){toast(e.message,5000)}finally{setBusy(btn,false)}}

async function safeRun(name,fn){try{return await fn()}catch(e){console.error(name,e); toast(`${name}: ${e.message}`,6000)}}
async function showAdmin(){showPanel('adminPanel'); $('adminName').textContent=`${currentEmployee.fullName} (${currentEmployee.employeeCode})`; setDefaultDates(); await safeRun('โหลดตั้งค่าหลัก',async()=>{await Promise.all([getShifts(),getBenefits(),loadSettings()]); fillShiftSelect(); fillSettings()}); await Promise.all([safeRun('โหลดภาพรวมวันนี้',loadTodayAdmin),safeRun('โหลดรายชื่อพนักงาน',loadEmployees),safeRun('โหลดปฏิทิน',loadCalendar),safeRun('โหลด OT',loadOt),safeRun('โหลดวันลา',loadLeave),safeRun('โหลดกะงาน',loadShifts),safeRun('โหลดสวัสดิการ',loadBenefits)])}
function setDefaultDates(){const t=todayKey(); ['attStart','attEnd','payStart','payEnd','corrDate','calDate'].forEach(id=>{if($(id)) $(id).value=t}); if($('payStart')) $('payStart').value=t.slice(0,8)+'01'; if($('attStart')) $('attStart').value=t.slice(0,8)+'01'; if($('corrTime')) $('corrTime').value='08:00'}
function switchTab(tab){document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab)); document.querySelectorAll('.tab').forEach(el=>el.classList.add('hidden')); $('tab'+tab[0].toUpperCase()+tab.slice(1))?.classList.remove('hidden')}
function normalizeAttendance(id,r){const t=recTime(r); const dk=r.dateKey||(t?new Date(t.getTime()-t.getTimezoneOffset()*60000).toISOString().slice(0,10):todayKey()); return {id,...r,dateKey:dk,employeeId:r.employeeId||r.empId||r.employeeCode||'unknown',employeeCode:r.employeeCode||r.code||'',fullName:r.fullName||r.employeeName||r.name||''}}
async function getAttendanceRows(employeeId=null,start=null,end=null){let snap=await db.collection('attendance').get(); let rows=snap.docs.map(d=>normalizeAttendance(d.id,d.data())); if(employeeId){const empCode=currentEmployee?.id===employeeId?currentEmployee.employeeCode:null; rows=rows.filter(r=>r.employeeId===employeeId||r.employeeCode===empCode)} if(start) rows=rows.filter(r=>(r.dateKey||'')>=start); if(end) rows=rows.filter(r=>(r.dateKey||'')<=end); return rows}
function recTime(r){if(r.overrideTime) return new Date(r.overrideTime.replace(' ','T')); if(r.createdAt?.toDate) return r.createdAt.toDate(); if(r.clientTime) return new Date(r.clientTime); return null}
function recMillis(r){return recTime(r)?.getTime?.()||0}
function displayTime(r){const d=recTime(r); return d?fmtDateTime(d):'-'}
function pairAttendance(rows){const map={}; rows.forEach(r=>{const empKey=r.employeeId||r.employeeCode||'unknown'; const key=`${empKey}_${r.dateKey||todayKey()}`; (map[key]||={employeeId:r.employeeId||empKey,employeeCode:r.employeeCode||'',fullName:r.fullName||'',dateKey:r.dateKey||todayKey(),records:[]}).records.push(r)}); return Object.values(map).map(g=>{g.records.sort((a,b)=>recMillis(a)-recMillis(b)); const ins=g.records.filter(r=>r.type==='IN'), outs=g.records.filter(r=>r.type==='OUT'); g.firstIn=ins[0]||null; g.lastOut=outs.at(-1)||null; g.photoURL=g.firstIn?.photoURL||g.lastOut?.photoURL||''; g.mapUrl=g.firstIn?.mapUrl||g.lastOut?.mapUrl||''; g.inGeofence=g.firstIn?.inGeofence; g.distanceMeters=g.firstIn?.distanceMeters; g.workHours=(g.firstIn&&g.lastOut)?Math.max(0,(recMillis(g.lastOut)-recMillis(g.firstIn))/36e5):0; return g}).sort((a,b)=>String(b.dateKey+b.employeeCode).localeCompare(String(a.dateKey+a.employeeCode)))}
function renderDailyItem(r,admin){const img=r.photoURL?`<img src="${r.photoURL}" class="thumb" loading="lazy">`:''; const geo=r.inGeofence===null||r.inGeofence===undefined?'':`<span class="badge ${r.inGeofence?'good':'bad'}">${r.inGeofence?'ในพื้นที่':'นอกพื้นที่'} ${r.distanceMeters?Math.round(r.distanceMeters)+'m':''}</span>`; return `<div class="item"><div>${img}<b>${safeText(r.employeeCode)} - ${safeText(r.fullName)}</b><br><span class="muted">${r.dateKey} • เข้า ${r.firstIn?displayTime(r.firstIn).slice(11):'-'} • ออก ${r.lastOut?displayTime(r.lastOut).slice(11):'-'} • ${r.workHours.toFixed(2)} ชม.</span><br>${geo} <span class="badge">${r.records.length} รายการ</span></div><div class="row-actions">${r.mapUrl?`<a href="${r.mapUrl}" target="_blank"><button class="ghost">แผนที่</button></a>`:''}${admin?`<button class="ghost" onclick="copyText('${r.employeeId}')">คัดลอก ID</button>`:''}</div></div>`}
window.copyText=async t=>{await navigator.clipboard.writeText(t); toast('คัดลอกแล้ว')};
async function loadTodayAdmin(){const rows=await getAttendanceRows(null,todayKey(),todayKey()); const daily=pairAttendance(rows); $('todaySummary').innerHTML=`<div class="stat"><b>${daily.length}</b><span>คนลงเวลา</span></div><div class="stat"><b>${daily.filter(x=>x.firstIn).length}</b><span>เข้างาน</span></div><div class="stat"><b>${daily.filter(x=>x.lastOut).length}</b><span>ออกงาน</span></div><div class="stat"><b>${daily.filter(x=>x.inGeofence===false).length}</b><span>นอกพื้นที่</span></div>`; $('todayList').innerHTML=daily.map(r=>renderDailyItem(r,true)).join('')||'<p class="muted">วันนี้ยังไม่มีข้อมูล</p>'}

function fillShiftSelect(){const sel=$('empShiftId'); if(!sel)return; sel.innerHTML=shiftCache.map(s=>`<option value="${s.id}">${safeText(s.name)}</option>`).join('')}
async function loadEmployees(){try{await getShifts(); fillShiftSelect(); const snap=await db.collection('employees').get(); const rows=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(a.employeeCode||'').localeCompare(String(b.employeeCode||''))); $('employeeList').innerHTML=rows.map(e=>`<div class="item"><b>${safeText(e.employeeCode)} - ${safeText(e.fullName)}</b><br><span class="muted">${safeText(e.department)} • ${safeText(e.position)} • ${e.role||'employee'} • ${payTypeText(e.payType)} • ${e.payCycle==='biweekly'?'ราย 14 วัน':'รายเดือน'} • ${safeText(getShift(e.shiftId)?.name||'-')}</span><br><span class="badge ${e.active!==false?'good':'bad'}">${e.active!==false?'ใช้งาน':'ปิด'}</span><div class="row-actions"><button onclick="editEmployee('${e.id}')" class="warning">แก้ไข</button><button onclick="toggleEmployee('${e.id}',${e.active!==false?'false':'true'})" class="ghost">${e.active!==false?'ปิดใช้งาน':'เปิดใช้งาน'}</button><button onclick="deleteEmployee('${e.id}','${safeText(e.employeeCode)}')" class="danger">ลบ</button></div></div>`).join('')||'<p class="muted">ยังไม่มีพนักงาน</p>'}catch(e){console.error(e); $('employeeList').innerHTML=`<p class="muted">โหลดรายชื่อพนักงานไม่สำเร็จ: ${safeText(e.message)}</p>`}}
function payTypeText(v){return v==='monthly'?'เงินเดือน':v==='daily'?'รายวัน':'รายชั่วโมง'}
function clearEmployeeForm(){['empIdEdit','empCode','empFullName','empDept','empPosition','empPin'].forEach(id=>{if($(id))$(id).value=''}); $('empRole').value='employee'; $('empPayType').value='hourly'; $('empPayCycle').value='monthly'; $('empHourly').value='0'; $('empDaily').value='0'; $('empMonthly').value='0'; $('empOt').value='1.5'; if($('empShiftId')&&shiftCache[0]) $('empShiftId').value=shiftCache[0].id; $('empActive').checked=true}
window.editEmployee=async id=>{const d=await db.collection('employees').doc(id).get(), e={id:d.id,...d.data()}; $('empIdEdit').value=e.id; $('empCode').value=e.employeeCode||''; $('empFullName').value=e.fullName||''; $('empDept').value=e.department||''; $('empPosition').value=e.position||''; $('empRole').value=e.role||'employee'; $('empPayType').value=e.payType||'hourly'; $('empPayCycle').value=e.payCycle||'monthly'; $('empHourly').value=e.hourlyRate||0; $('empDaily').value=e.dailyRate||0; $('empMonthly').value=e.monthlySalary||0; $('empOt').value=e.otMultiplier||1.5; if(e.shiftId) $('empShiftId').value=e.shiftId; $('empActive').checked=!!e.active; $('empPin').value=''; toast('โหลดข้อมูลเข้าฟอร์มแล้ว')};
window.toggleEmployee=async(id,active)=>{await db.collection('employees').doc(id).update({active,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}); await logAudit('TOGGLE_EMPLOYEE',{id,active}); loadEmployees()};
window.deleteEmployee=async(id,code)=>{if(!confirm(`ยืนยันลบพนักงาน ${code||id}?
ข้อมูลเวลาเข้าออกเดิมจะไม่ถูกลบ`))return; try{await db.collection('employees').doc(id).delete(); await logAudit('DELETE_EMPLOYEE',{id,code}); toast('ลบพนักงานแล้ว'); await loadEmployees()}catch(e){console.error(e); toast('ลบพนักงานไม่สำเร็จ: '+e.message,6000)}};
async function saveEmployee(){const id=$('empIdEdit').value, code=$('empCode').value.trim(), name=$('empFullName').value.trim(), pin=$('empPin').value.trim(); if(!code||!name)return toast('กรุณากรอกรหัสและชื่อ'); if(!id&&!pin)return toast('พนักงานใหม่ต้องมี PIN'); const data={employeeCode:code,fullName:name,department:$('empDept').value.trim(),position:$('empPosition').value.trim(),role:$('empRole').value,active:$('empActive').checked,payType:$('empPayType').value,payCycle:$('empPayCycle').value,hourlyRate:Number($('empHourly').value||0),dailyRate:Number($('empDaily').value||0),monthlySalary:Number($('empMonthly').value||0),otMultiplier:Number($('empOt').value||1.5),shiftId:$('empShiftId').value||null,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}; if(pin)data.pinHash=await sha256(pin); if(id) await db.collection('employees').doc(id).update(data); else await db.collection('employees').add({...data,createdAt:firebase.firestore.FieldValue.serverTimestamp()}); await logAudit(id?'UPDATE_EMPLOYEE':'ADD_EMPLOYEE',{code}); clearEmployeeForm(); loadEmployees(); toast('บันทึกพนักงานแล้ว')}

async function loadAttendance(){const rows=await getAttendanceRows(null,$('attStart').value,$('attEnd').value); lastAttendanceRows=pairAttendance(rows); $('attendanceList').innerHTML=lastAttendanceRows.map(r=>renderDailyItem(r,true)).join('')||'<p class="muted">ไม่พบข้อมูล</p>'}
async function saveCorrection(){const code=$('corrEmpCode').value.trim(), reason=$('corrReason').value.trim(); if(!code||!reason)return toast('กรอกรหัสพนักงานและเหตุผล'); const empSnap=await db.collection('employees').where('employeeCode','==',code).limit(1).get(); if(empSnap.empty)return toast('ไม่พบพนักงาน'); const doc=empSnap.docs[0], e={id:doc.id,...doc.data()}; const overrideTime=`${$('corrDate').value} ${$('corrTime').value}:00`; await db.collection('attendance').add({employeeId:e.id,employeeCode:e.employeeCode,fullName:e.fullName,type:$('corrType').value,source:'ADMIN_CORRECTION',dateKey:$('corrDate').value,overrideTime,reason,createdAt:firebase.firestore.FieldValue.serverTimestamp(),correctedBy:currentEmployee.employeeCode}); await logAudit('CORRECT_ATTENDANCE',{employeeCode:code,overrideTime,reason}); toast('บันทึกการแก้ไขแล้ว'); loadAttendance()}

async function loadShifts(){const shifts=await getShifts(); fillShiftSelect(); $('shiftList').innerHTML=shifts.map(s=>`<div class="item"><b>${safeText(s.name)}</b><br><span class="muted">${s.start} - ${s.end} • พัก ${s.breakMinutes||0} นาที • ปกติ ${s.regularHours||8} ชม.</span><div class="row-actions"><button class="warning" onclick="editShift('${s.id}')">แก้ไข</button></div></div>`).join('')||'<p class="muted">ยังไม่มีกะ</p>'}
window.editShift=id=>{const s=shiftCache.find(x=>x.id===id); if(!s)return; $('shiftIdEdit').value=s.id; $('shiftName').value=s.name; $('shiftStart').value=s.start; $('shiftEnd').value=s.end; $('shiftBreak').value=s.breakMinutes||0; $('shiftRegular').value=s.regularHours||8};
function clearShift(){['shiftIdEdit','shiftName'].forEach(id=>$(id).value=''); $('shiftStart').value='08:00'; $('shiftEnd').value='17:00'; $('shiftBreak').value=60; $('shiftRegular').value=8}
async function saveShift(){const id=$('shiftIdEdit').value; const data={name:$('shiftName').value.trim(),start:$('shiftStart').value,end:$('shiftEnd').value,breakMinutes:Number($('shiftBreak').value||0),regularHours:Number($('shiftRegular').value||8),active:true,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}; if(!data.name||!data.start||!data.end)return toast('กรอกชื่อกะและเวลา'); if(id) await db.collection('shifts').doc(id).update(data); else await db.collection('shifts').add({...data,createdAt:firebase.firestore.FieldValue.serverTimestamp()}); await logAudit('SAVE_SHIFT',data); clearShift(); loadShifts(); toast('บันทึกกะแล้ว')}

async function loadOt(){const snap=await db.collection('otRequests').orderBy('dateKey','desc').limit(120).get(); const rows=snap.docs.map(d=>({id:d.id,...d.data()})); $('otList').innerHTML=rows.map(o=>`<div class="item"><b>${safeText(o.employeeCode)} ${safeText(o.fullName)}</b><br><span class="muted">${o.dateKey} • ขอ ${o.hours} ชม. • ${safeText(o.reason)}</span><br><span class="badge ${o.status==='approved'?'good':o.status==='rejected'?'bad':''}">${safeText(o.status)}</span><div class="row-actions"><button class="good" onclick="approveOt('${o.id}',true)">อนุมัติ</button><button class="danger" onclick="approveOt('${o.id}',false)">ไม่อนุมัติ</button></div></div>`).join('')||'<p class="muted">ไม่มีคำขอ OT</p>'}
window.approveOt=async(id,ok)=>{await db.collection('otRequests').doc(id).update({status:ok?'approved':'rejected',approvedBy:currentEmployee.employeeCode,approvedAt:firebase.firestore.FieldValue.serverTimestamp()}); await logAudit(ok?'APPROVE_OT':'REJECT_OT',{id}); loadOt()};
async function loadLeave(){const snap=await db.collection('leaveRequests').orderBy('createdAt','desc').limit(120).get(); const rows=snap.docs.map(d=>({id:d.id,...d.data()})); $('leaveList').innerHTML=rows.map(l=>`<div class="item"><b>${safeText(l.employeeCode)} ${safeText(l.fullName)}</b><br><span class="muted">${leaveText(l.type)} • ${l.startDate} ถึง ${l.endDate} • ${safeText(l.reason)}</span><br><span class="badge ${l.status==='approved'?'good':l.status==='rejected'?'bad':''}">${safeText(l.status)}</span><div class="row-actions"><button class="good" onclick="approveLeave('${l.id}',true)">อนุมัติ</button><button class="danger" onclick="approveLeave('${l.id}',false)">ไม่อนุมัติ</button></div></div>`).join('')||'<p class="muted">ไม่มีคำขอลา</p>'}
function leaveText(t){return t==='sick'?'ลาป่วย':t==='vacation'?'ลาพักร้อน':'ลากิจ'}
window.approveLeave=async(id,ok)=>{await db.collection('leaveRequests').doc(id).update({status:ok?'approved':'rejected',approvedBy:currentEmployee.employeeCode,approvedAt:firebase.firestore.FieldValue.serverTimestamp()}); await logAudit(ok?'APPROVE_LEAVE':'REJECT_LEAVE',{id}); loadLeave()};

async function loadCalendar(){const snap=await db.collection('companyCalendar').orderBy('dateKey','desc').limit(120).get(); const rows=snap.docs.map(d=>({id:d.id,...d.data()})); $('calendarList').innerHTML=rows.map(c=>`<div class="item"><b>${safeText(c.dateKey)} - ${safeText(c.title)}</b><br><span class="muted">${safeText(c.type)} • ${c.isPaid?'มีค่าจ้าง':'ไม่มีค่าจ้าง'}</span><div class="row-actions"><button class="danger" onclick="deleteCalendar('${c.id}')">ลบ</button></div></div>`).join('')||'<p class="muted">ยังไม่มีรายการปฏิทิน</p>'}
async function saveCalendar(){const data={dateKey:$('calDate').value,title:$('calTitle').value.trim(),type:$('calType').value,isPaid:$('calPaid').checked,createdAt:firebase.firestore.FieldValue.serverTimestamp()}; if(!data.dateKey||!data.title)return toast('กรอกวันที่และชื่อรายการ'); await db.collection('companyCalendar').add(data); await logAudit('SAVE_CALENDAR',data); $('calTitle').value=''; loadCalendar()}
window.deleteCalendar=async id=>{await db.collection('companyCalendar').doc(id).delete(); await logAudit('DELETE_CALENDAR',{id}); loadCalendar()};
async function loadBenefits(){const snap=await db.collection('benefits').orderBy('name').get(); benefitCache=snap.docs.map(d=>({id:d.id,...d.data()})); $('benefitList').innerHTML=benefitCache.map(b=>`<div class="item"><b>${safeText(b.name)}</b><br><span class="muted">${money(b.amount)} บาท • ${b.mode==='perWorkday'?'ตามวันทำงาน':'Fix รายเดือน'}</span><br><span class="badge ${b.active?'good':'bad'}">${b.active?'ใช้งาน':'ปิด'}</span></div>`).join('')||'<p class="muted">ยังไม่มีสวัสดิการ</p>'}
async function saveBenefit(){const data={name:$('benefitName').value.trim(),amount:Number($('benefitAmount').value||0),mode:$('benefitMode').value,active:$('benefitActive').checked,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}; if(!data.name||data.amount<=0)return toast('กรอกชื่อและจำนวนเงิน'); const id=$('benefitIdEdit').value; if(id) await db.collection('benefits').doc(id).update(data); else await db.collection('benefits').add({...data,createdAt:firebase.firestore.FieldValue.serverTimestamp()}); await logAudit('SAVE_BENEFIT',data); $('benefitName').value=''; $('benefitAmount').value=''; loadBenefits(); toast('บันทึกสวัสดิการแล้ว')}

function fillSettings(){$('setCompany').value=companySettings.companyName||''; $('setRadius').value=companySettings.radiusMeters||100; $('setLat').value=companySettings.officeLat||''; $('setLng').value=companySettings.officeLng||''}
async function saveSettings(){companySettings={companyName:$('setCompany').value.trim()||'ระบบลงเวลาออนไลน์',radiusMeters:Number($('setRadius').value||100),officeLat:$('setLat').value?Number($('setLat').value):null,officeLng:$('setLng').value?Number($('setLng').value):null}; await db.collection('settings').doc('company').set({...companySettings,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}); await logAudit('UPDATE_SETTINGS',companySettings); await loadSettings(); toast('บันทึกตั้งค่าแล้ว')}
async function useCurrentLocation(){const p=await getGPS(); $('setLat').value=p.lat.toFixed(6); $('setLng').value=p.lng.toFixed(6)}
async function deleteCollection(name,limit=450){if(!confirm(`ยืนยันลบข้อมูล ${name} ทั้งหมด?`))return; let total=0; try{while(true){const snap=await db.collection(name).limit(limit).get(); if(snap.empty)break; const batch=db.batch(); snap.docs.forEach(d=>batch.delete(d.ref)); await batch.commit(); total+=snap.size; if(snap.size<limit)break} if(name!=='auditLogs') await logAudit('CLEAR_COLLECTION',{name,count:total}); toast(`ลบ ${name} แล้ว ${total} รายการ`); if(name==='attendance'){await loadTodayAdmin(); await loadAttendance()} if(name==='auditLogs'&&$('auditList')) $('auditList').innerHTML='<p class="muted">เคลียร์ log แล้ว</p>'}catch(e){console.error(e); toast(`ลบ ${name} ไม่สำเร็จ: ${e.message}`,7000)}}

async function runPayroll(){const start=$('payStart').value,end=$('payEnd').value; const [empSnap,attSnap,otSnap,benefitsSnap]=await Promise.all([db.collection('employees').get(),db.collection('attendance').where('dateKey','>=',start).where('dateKey','<=',end).get(),db.collection('otRequests').where('dateKey','>=',start).where('dateKey','<=',end).where('status','==','approved').get(),db.collection('benefits').where('active','==',true).get()]); const employees=empSnap.docs.map(d=>({id:d.id,...d.data()})).filter(e=>e.role!=='admin'&&e.active!==false); const records=attSnap.docs.map(d=>({id:d.id,...d.data()})); const ots=otSnap.docs.map(d=>({id:d.id,...d.data()})); const benefits=benefitsSnap.docs.map(d=>({id:d.id,...d.data()})); await getShifts(); lastPayrollRows=employees.map(e=>calcPayroll(e,records.filter(r=>r.employeeId===e.id),ots.filter(o=>o.employeeId===e.id),benefits,start,end)).filter(r=>r.workDays>0||r.basePay>0); $('payrollList').innerHTML=lastPayrollRows.map(r=>`<div class="item"><b>${safeText(r.employeeCode)} ${safeText(r.fullName)}</b><br><span class="muted">${payTypeText(r.payType)} • ${r.payCycle==='biweekly'?'ราย 14 วัน':'รายเดือน'} • วันทำงาน ${r.workDays} • ปกติ ${r.regularHours.toFixed(2)} ชม. • OT อนุมัติ ${r.approvedOtHours.toFixed(2)} ชม.</span><br>ฐาน ${money(r.basePay)} + OT ${money(r.otPay)} + สวัสดิการ ${money(r.benefitsPay)} - หักสาย ${money(r.lateDeduction)} = <b>${money(r.netPay)} บาท</b><div class="row-actions"><button class="secondary" onclick="printSlip('${r.employeeId}')">พิมพ์ Slip</button></div></div>`).join('')||'<p class="muted">ไม่พบข้อมูลเงินเดือน</p>'}
function calcPayroll(e,rows,ots,benefits,start,end){const daily=pairAttendance(rows); const shift=getShift(e.shiftId); let workDays=0,regularHours=0,lateMinutes=0; daily.forEach(d=>{if(!d.firstIn||!d.lastOut)return; workDays++; const hrs=d.workHours; regularHours+=Math.min(hrs,Number(shift.regularHours||8)); if(shift.start){const std=new Date(`${d.dateKey}T${shift.start}:00`); const actual=recTime(d.firstIn); if(actual>std) lateMinutes+=Math.round((actual-std)/60000)}}); const approvedOtHours=ots.reduce((s,o)=>s+Number(o.hours||0),0); const hourly=Number(e.hourlyRate||0)||Number(e.dailyRate||0)/8||Number(e.monthlySalary||0)/30/8; let basePay=0; if(e.payType==='monthly') basePay=Number(e.monthlySalary||0); else if(e.payType==='daily') basePay=workDays*Number(e.dailyRate||0); else basePay=regularHours*Number(e.hourlyRate||0); if(e.payCycle==='biweekly'&&e.payType==='monthly') basePay=Number(e.monthlySalary||0)/2; const otPay=approvedOtHours*hourly*Number(e.otMultiplier||1.5); const benefitsPay=benefits.reduce((s,b)=>s+(b.mode==='perWorkday'?Number(b.amount||0)*workDays:Number(b.amount||0)),0); const lateDeduction=lateMinutes*(hourly/60); const grossPay=basePay+otPay+benefitsPay; const netPay=grossPay-lateDeduction; return {employeeId:e.id,employeeCode:e.employeeCode,fullName:e.fullName,department:e.department||'',payType:e.payType||'hourly',payCycle:e.payCycle||'monthly',periodStart:start,periodEnd:end,workDays,regularHours,approvedOtHours,lateMinutes,basePay,otPay,benefitsPay,lateDeduction,grossPay,netPay}}
window.printSlip=employeeId=>{const r=lastPayrollRows.find(x=>x.employeeId===employeeId); if(!r)return; const w=window.open('','_blank'); w.document.write(`<html><head><title>Payroll Slip</title><style>body{font-family:Arial,sans-serif;padding:24px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ddd;padding:8px;text-align:left}.right{text-align:right}</style></head><body><h2>Payroll Slip</h2><p>${companySettings.companyName||''}</p><table><tr><th>พนักงาน</th><td>${safeText(r.employeeCode)} ${safeText(r.fullName)}</td></tr><tr><th>งวด</th><td>${r.periodStart} ถึง ${r.periodEnd}</td></tr><tr><th>วิธีจ่าย</th><td>${payTypeText(r.payType)} / ${r.payCycle==='biweekly'?'ราย 14 วัน':'รายเดือน'}</td></tr><tr><th>วันทำงาน</th><td>${r.workDays}</td></tr><tr><th>ชั่วโมงปกติ</th><td>${r.regularHours.toFixed(2)}</td></tr><tr><th>OT อนุมัติ</th><td>${r.approvedOtHours.toFixed(2)}</td></tr><tr><th>ฐานเงิน</th><td class="right">${money(r.basePay)}</td></tr><tr><th>OT</th><td class="right">${money(r.otPay)}</td></tr><tr><th>สวัสดิการ</th><td class="right">${money(r.benefitsPay)}</td></tr><tr><th>หักสาย</th><td class="right">${money(r.lateDeduction)}</td></tr><tr><th>สุทธิ</th><td class="right"><b>${money(r.netPay)}</b></td></tr></table><script>window.print()<\/script></body></html>`); w.document.close()};
function exportCsv(filename,rows){if(!rows.length)return toast('ไม่มีข้อมูลให้ export'); const headers=Object.keys(rows[0]); const csv=[headers.join(','),...rows.map(r=>headers.map(h=>'"'+String(r[h]??'').replace(/"/g,'""')+'"').join(','))].join('\n'); const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click(); URL.revokeObjectURL(a.href)}
function exportAttendance(){exportCsv(`attendance-detail-${todayKey()}.csv`,lastAttendanceRows.map(r=>({date:r.dateKey,employeeCode:r.employeeCode,fullName:r.fullName,clockIn:r.firstIn?displayTime(r.firstIn):'',clockOut:r.lastOut?displayTime(r.lastOut):'',workHours:r.workHours.toFixed(2),inGeofence:r.inGeofence,distanceMeters:r.distanceMeters||'',mapUrl:r.mapUrl||'',records:r.records.length})))}
function exportPayroll(){exportCsv(`payroll-detail-${todayKey()}.csv`,lastPayrollRows)}
async function loadAudit(){const snap=await db.collection('auditLogs').orderBy('createdAt','desc').limit(100).get(); $('auditList').innerHTML=snap.docs.map(d=>{const l=d.data(),dt=l.createdAt?.toDate?fmtDateTime(l.createdAt.toDate()):'-'; return `<div class="item"><b>${safeText(l.action)}</b><br><span class="muted">${dt} • ${safeText(l.actorCode)} ${safeText(l.actorName)}</span><br><code>${safeText(JSON.stringify(l.details||{}))}</code></div>`}).join('')||'<p class="muted">ยังไม่มี log</p>'}

function bind(){$('loginBtn').onclick=login; $('seedAdminBtn').onclick=seedAdmin; $('logoutBtn1').onclick=logout; $('logoutBtn2').onclick=logout; $('startCameraBtn').onclick=startCamera; $('captureBtn').onclick=()=>captureSelfie().catch(e=>toast(e.message,5000)); $('clockInBtn').onclick=()=>clock('IN'); $('clockOutBtn').onclick=()=>clock('OUT'); $('autoClockBtn').onclick=autoClock; $('refreshMyHistoryBtn').onclick=loadMyHistory; $('submitOtBtn').onclick=submitOt; $('submitLeaveBtn').onclick=submitLeave; document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab)); $('refreshTodayBtn').onclick=loadTodayAdmin; $('saveEmployeeBtn').onclick=saveEmployee; $('clearEmployeeBtn').onclick=clearEmployeeForm; $('loadAttendanceBtn').onclick=loadAttendance; $('saveCorrectionBtn').onclick=saveCorrection; $('exportAttendanceBtn').onclick=exportAttendance; $('saveShiftBtn').onclick=saveShift; $('clearShiftBtn').onclick=clearShift; $('loadOtBtn').onclick=loadOt; $('loadLeaveBtn').onclick=loadLeave; $('saveCalendarBtn').onclick=saveCalendar; $('saveBenefitBtn').onclick=saveBenefit; $('runPayrollBtn').onclick=runPayroll; $('exportPayrollBtn').onclick=exportPayroll; $('useCurrentLocationBtn').onclick=()=>useCurrentLocation().catch(e=>toast(e.message,5000)); $('saveSettingsBtn').onclick=saveSettings; $('clearAttendanceBtn').onclick=()=>deleteCollection('attendance'); $('clearAuditBtn').onclick=()=>deleteCollection('auditLogs'); $('loadAuditBtn').onclick=loadAudit; window.addEventListener('beforeinstallprompt',e=>{e.preventDefault(); deferredPrompt=e; $('installBtn').classList.remove('hidden')}); $('installBtn').onclick=async()=>{if(deferredPrompt){deferredPrompt.prompt(); deferredPrompt=null; $('installBtn').classList.add('hidden')}}}
if('serviceWorker'in navigator) navigator.serviceWorker.register('./service-worker.js').catch(console.warn);
bind(); initFirebase().catch(e=>{console.error(e); toast(e.message,6000); showPanel('setupPanel')});

/* =========================
   v2.2.0 overrides
   Payroll slip rules, payday settings, real calendar view, detailed CSV
   ========================= */
function addDays(d,n){const x=new Date(d); x.setDate(x.getDate()+n); return x}
function dateKeyOf(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function daysInMonth(y,m){return new Date(y,m+1,0).getDate()}
function parseDateKey(s){return new Date(`${s}T00:00:00`)}
function clampPayDay(y,m,day){return `${y}-${pad(m+1)}-${pad(Math.min(Number(day||30),daysInMonth(y,m)))}`}
function computeMonthlyPayDate(start,end){const ed=parseDateKey(end); return clampPayDay(ed.getFullYear(),ed.getMonth(),companySettings.monthlyPayDay||30)}
function computeBiweeklyPayDate(start,end){return end}
function computeCurrentPayPeriod(cycle='monthly'){
  const now=new Date();
  if(cycle==='biweekly'){
    const anchor=companySettings.biweeklyStartDate?parseDateKey(companySettings.biweeklyStartDate):new Date(now.getFullYear(),0,1);
    const diff=Math.floor((new Date(now.getFullYear(),now.getMonth(),now.getDate())-anchor)/86400000);
    const block=Math.floor(diff/14);
    const s=addDays(anchor,block*14);
    const e=addDays(s,13);
    return {start:dateKeyOf(s),end:dateKeyOf(e),payDate:dateKeyOf(e)};
  }
  const y=now.getFullYear(), m=now.getMonth();
  return {start:`${y}-${pad(m+1)}-01`,end:`${y}-${pad(m+1)}-${pad(daysInMonth(y,m))}`,payDate:clampPayDay(y,m,companySettings.monthlyPayDay||30)};
}
function getPayDateForRow(row){return row.payCycle==='biweekly'?computeBiweeklyPayDate(row.periodStart,row.periodEnd):computeMonthlyPayDate(row.periodStart,row.periodEnd)}
function canPrintSlip(row){
  // ตาม requirement: รายวัน/รายชั่วโมงพิมพ์ได้หลังมีเวลาออกงาน, รายเดือนแสดงรายละเอียดแต่ปิดพิมพ์
  return row.payType!=='monthly' && row.hasClosedWork!==false;
}
function slipDisabledReason(row){
  if(row.payType==='monthly') return 'รายเดือน: แสดงรายละเอียดได้ แต่ปิดการพิมพ์ตามนโยบาย';
  if(row.hasClosedWork===false) return 'ยังไม่มีเวลาออกงาน จึงยังพิมพ์ไม่ได้';
  return '';
}
async function fetchCalendarEvents(start,end){
  const snap=await db.collection('companyCalendar').get();
  return snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>(x.dateKey||'')>=start&&(x.dateKey||'')<=end);
}
function buildPaydayEvents(year,month){
  const events=[];
  const monthly=clampPayDay(year,month,companySettings.monthlyPayDay||30);
  events.push({dateKey:monthly,title:'วันเงินออกรายเดือน',type:'payday',isPaid:true,system:true});
  if(companySettings.biweeklyStartDate){
    let d=parseDateKey(companySettings.biweeklyStartDate);
    const first=new Date(year,month,1), last=new Date(year,month,daysInMonth(year,month));
    while(d<first) d=addDays(d,14);
    while(d<=last){events.push({dateKey:dateKeyOf(d),title:'วันเงินออกราย 14 วัน',type:'payday',isPaid:true,system:true}); d=addDays(d,14)}
  }
  return events;
}
function renderMonthGrid(targetId,events=[],employee=null,monthValue=null){
  const target=$(targetId); if(!target) return;
  const base=monthValue?new Date(`${monthValue}-01T00:00:00`):new Date();
  const y=base.getFullYear(), m=base.getMonth(), first=new Date(y,m,1), total=daysInMonth(y,m), startDow=first.getDay();
  const names=['อา','จ','อ','พ','พฤ','ศ','ส'];
  const byDate={}; [...events,...buildPaydayEvents(y,m)].forEach(e=>{(byDate[e.dateKey]||=[]).push(e)});
  let html=names.map(n=>`<div class="cal-head">${n}</div>`).join('');
  for(let i=0;i<startDow;i++) html+=`<div class="cal-day off"></div>`;
  for(let day=1;day<=total;day++){
    const key=`${y}-${pad(m+1)}-${pad(day)}`;
    const dow=new Date(y,m,day).getDay();
    const today=key===todayKey();
    const evs=byDate[key]||[];
    const isHoliday=evs.some(e=>e.type==='holiday');
    const workLabel=(!isHoliday && dow!==0) ? (employee?.shiftName||'วันทำงาน') : '';
    html+=`<div class="cal-day ${today?'today':''} ${dow===0?'off':''}"><div class="cal-num">${day}</div>${workLabel?`<span class="cal-event event">${safeText(workLabel)}</span>`:''}${evs.map(e=>`<span class="cal-event ${safeText(e.type||'event')}">${safeText(e.title||e.type)}</span>`).join('')}</div>`;
  }
  target.innerHTML=html;
}
async function loadUserCalendar(){
  try{
    const now=new Date(); const start=`${now.getFullYear()}-${pad(now.getMonth()+1)}-01`; const end=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(daysInMonth(now.getFullYear(),now.getMonth()))}`;
    const events=await fetchCalendarEvents(start,end);
    await getShifts(); const sh=getShift(currentEmployee?.shiftId); renderMonthGrid('userCalendarGrid',events,{...currentEmployee,shiftName:sh.name});
  }catch(e){console.error(e); if($('userCalendarGrid')) $('userCalendarGrid').innerHTML=`<p class="muted">โหลดปฏิทินไม่สำเร็จ: ${safeText(e.message)}</p>`}
}
async function loadCalendar(){
  const mv=$('calMonth')?.value || todayKey().slice(0,7);
  const [y,m]=mv.split('-').map(Number); const start=`${y}-${pad(m)}-01`, end=`${y}-${pad(m)}-${pad(daysInMonth(y,m-1))}`;
  const events=await fetchCalendarEvents(start,end);
  renderMonthGrid('calendarGrid',events,null,mv);
  $('calendarList').innerHTML=events.sort((a,b)=>String(a.dateKey).localeCompare(String(b.dateKey))).map(c=>`<div class="item"><b>${safeText(c.dateKey)} - ${safeText(c.title)}</b><br><span class="muted">${safeText(c.type)} • ${c.isPaid?'มีค่าจ้าง':'ไม่มีค่าจ้าง'}</span><div class="row-actions"><button class="danger" onclick="deleteCalendar('${c.id}')">ลบ</button></div></div>`).join('')||'<p class="muted">ยังไม่มีรายการปฏิทิน</p>';
}
async function showEmployee(){
  showPanel('employeePanel');
  $('empName').textContent=currentEmployee.fullName;
  $('empDetail').textContent=`${currentEmployee.employeeCode} • ${currentEmployee.department||'-'} • ${currentEmployee.position||'-'} • ${payTypeText(currentEmployee.payType)} / ${currentEmployee.payCycle==='biweekly'?'ราย 14 วัน':'รายเดือน'}`;
  setUserDefaultDates();
  await refreshMyStatus();
  await loadMyHistory();
  await loadUserCalendar();
  await loadUserSlipPreview();
}
function renderDailyItem(r,admin){
  const detailId = dailyDetailKey(r);
  attendanceDetailMap[detailId]=r;
  const img=r.photoURL?`<img src="${r.photoURL}" class="thumb" loading="lazy" alt="attendance photo">`:'';
  const geo=r.inGeofence===null||r.inGeofence===undefined?'':`<span class="badge ${r.inGeofence?'good':'bad'}">${r.inGeofence?'ในพื้นที่':'นอกพื้นที่'} ${r.distanceMeters?Math.round(r.distanceMeters)+'m':''}</span>`;
  const userPrint=(!admin && currentEmployee && (currentEmployee.payType==='daily'||currentEmployee.payType==='hourly') && r.lastOut) ? `<button class="secondary" onclick="event.stopPropagation();printDailySlip('${r.dateKey}')">พิมพ์ Slip รายวัน</button>` : '';
  const userMonthly=(!admin && currentEmployee?.payType==='monthly') ? `<span class="disabled-note">รายเดือนดูรายละเอียดได้ แต่ปิดพิมพ์</span>` : '';
  return `<div class="item clickable attendance-clickable" onclick="openAttendanceDetail('${detailId}')">
    <div>${img}<b>${safeText(r.employeeCode)} - ${safeText(r.fullName)}</b><br>
      <span class="muted">${r.dateKey} • เข้า ${r.firstIn?displayTime(r.firstIn).slice(11):'-'} • ออก ${r.lastOut?displayTime(r.lastOut).slice(11):'-'} • ${Number(r.workHours||0).toFixed(2)} ชม.</span><br>
      ${geo} <span class="badge">${r.records?.length||0} รายการ</span>
    </div>
    <div class="row-actions" onclick="event.stopPropagation()">
      ${r.mapUrl?`<a href="${r.mapUrl}" target="_blank"><button class="ghost">แผนที่</button></a>`:''}
      <button class="ghost" onclick="openAttendanceDetail('${detailId}')">รายละเอียด</button>
      ${userPrint}${userMonthly}
      ${admin?`<button class="ghost" onclick="copyText('${r.employeeId||''}')">คัดลอก ID</button>`:''}
    </div>
  </div>`;
}
function dailyDetailKey(r){return `daily_${String(r.employeeId||r.employeeCode||'unknown').replace(/[^a-zA-Z0-9_-]/g,'_')}_${String(r.dateKey||todayKey()).replace(/[^a-zA-Z0-9_-]/g,'_')}`}
window.openAttendanceDetail=async function(detailId){
  try{
    let r=attendanceDetailMap[detailId];
    if(!r) throw new Error('ไม่พบข้อมูลรายการนี้ กรุณาโหลดหน้านี้ใหม่');
    const records=(r.records||[]).slice().sort((a,b)=>recMillis(a)-recMillis(b));
    const firstPhoto = r.photoURL || records.find(x=>x.photoURL)?.photoURL || '';
    const firstMap = r.mapUrl || records.find(x=>x.mapUrl)?.mapUrl || '';
    const inTime = r.firstIn ? displayTime(r.firstIn) : '-';
    const outTime = r.lastOut ? displayTime(r.lastOut) : '-';
    const rawHtml = records.length ? records.map(x=>{
      const type=x.type==='IN'?'เข้างาน':x.type==='OUT'?'ออกงาน':safeText(x.type||'-');
      const dt=displayTime(x);
      const photo=x.photoURL?`<img class="raw-photo" src="${x.photoURL}" loading="lazy" alt="raw photo">`:'';
      const geo=x.inGeofence===null||x.inGeofence===undefined?'ไม่ได้ตรวจ':(x.inGeofence?'ในพื้นที่':'นอกพื้นที่');
      return `<div class="raw-card">
        ${photo}
        <b>${type}</b>
        <div class="muted">${dt}</div>
        <div>แหล่งที่มา: ${safeText(x.source||'-')}</div>
        <div>GPS: ${safeText(x.latitude??'-')}, ${safeText(x.longitude??'-')} ${x.accuracy?`±${Math.round(x.accuracy)}m`:''}</div>
        <div>พื้นที่: ${safeText(geo)} ${x.distanceMeters?`• ${Math.round(x.distanceMeters)}m`:''}</div>
        ${x.reason?`<div>เหตุผล: ${safeText(x.reason)}</div>`:''}
        ${x.mapUrl?`<div><a href="${x.mapUrl}" target="_blank">เปิดแผนที่รายการนี้</a></div>`:''}
        <div class="muted small">ID: ${safeText(x.id||'')}</div>
      </div>`;
    }).join('') : '<p class="muted">ไม่มีรายการดิบ</p>';
    $('detailTitle').textContent=`${r.employeeCode||'-'} - ${r.fullName||'-'}`;
    $('detailSub').textContent=`${r.dateKey||'-'} • ${records.length} รายการ`;
    $('detailBody').innerHTML=`
      ${firstPhoto?`<img class="detail-photo" src="${firstPhoto}" loading="lazy" alt="attendance photo">`:'<p class="muted">ไม่มีรูปถ่าย</p>'}
      <div class="detail-grid">
        <div class="detail-row"><b>พนักงาน</b>${safeText(r.employeeCode||'-')} - ${safeText(r.fullName||'-')}</div>
        <div class="detail-row"><b>วันที่</b>${safeText(r.dateKey||'-')}</div>
        <div class="detail-row"><b>เวลาเข้า / ออก</b>เข้า: ${safeText(inTime)}<br>ออก: ${safeText(outTime)}<br>รวม: ${Number(r.workHours||0).toFixed(2)} ชม.</div>
        <div class="detail-row"><b>พื้นที่</b>${r.inGeofence===null||r.inGeofence===undefined?'ไม่ได้ตรวจ':(r.inGeofence?'อยู่ในพื้นที่':'อยู่นอกพื้นที่')} ${r.distanceMeters?`<br>ระยะห่าง: ${Math.round(r.distanceMeters)} เมตร`:''}</div>
        <div class="detail-row"><b>แผนที่</b>${firstMap?`<a href="${firstMap}" target="_blank">เปิด Google Maps</a>`:'-'}</div>
        <div class="detail-row"><b>Employee ID</b><code>${safeText(r.employeeId||'-')}</code></div>
      </div>
      <h3 class="detail-section-title">รายการเข้า/ออกทั้งหมดของวันนี้</h3>
      <div class="raw-list">${rawHtml}</div>`;
    $('attendanceDetailModal')?.classList.remove('hidden');
  }catch(e){console.error(e); toast('เปิดรายละเอียดไม่สำเร็จ: '+e.message,6000)}
};
window.closeAttendanceDetail=function(){ $('attendanceDetailModal')?.classList.add('hidden') };

async function loadMyHistory(){
  try{const rows=await getAttendanceRows(currentEmployee.id,null,null); const daily=pairAttendance(rows).slice(0,30); $('myHistory').innerHTML=daily.map(r=>renderDailyItem(r,false)).join('')||'<p class="muted">ยังไม่มีประวัติ</p>'}
  catch(e){console.error(e); $('myHistory').innerHTML=`<p class="muted">โหลดประวัติไม่สำเร็จ: ${safeText(e.message)}</p>`}
}
async function loadUserSlipPreview(){
  const box=$('userSlipList'); if(!box||!currentEmployee) return;
  try{
    const rows=await getAttendanceRows(currentEmployee.id,null,null); await getShifts(); const daily=pairAttendance(rows).slice(0,14);
    if(!daily.length){box.innerHTML='<p class="muted">ยังไม่มีข้อมูลสำหรับ slip</p>'; return}
    box.innerHTML=daily.map(d=>{
      const tmp=calcPayroll(currentEmployee,d.records,[],[],d.dateKey,d.dateKey);
      tmp.hasClosedWork=!!d.lastOut; tmp.dailyDate=d.dateKey;
      const print=canPrintSlip(tmp)?`<button class="secondary" onclick="printDailySlip('${d.dateKey}')">พิมพ์ Slip</button>`:`<span class="disabled-note">${slipDisabledReason(tmp)}</span>`;
      return `<div class="item"><b>${d.dateKey}</b><br><span class="muted">เข้า ${d.firstIn?displayTime(d.firstIn).slice(11):'-'} • ออก ${d.lastOut?displayTime(d.lastOut).slice(11):'-'} • ชั่วโมง ${d.workHours.toFixed(2)}</span><br>ยอดประมาณการ: <b>${money(tmp.netPay)} บาท</b><div class="row-actions">${print}</div></div>`;
    }).join('');
  }catch(e){box.innerHTML=`<p class="muted">โหลด slip ไม่สำเร็จ: ${safeText(e.message)}</p>`}
}
window.printDailySlip=async function(dateKey){
  const rows=await getAttendanceRows(currentEmployee.id,dateKey,dateKey); await getShifts(); const d=pairAttendance(rows)[0]; if(!d||!d.lastOut){toast('ยังไม่มีเวลาออกงาน จึงพิมพ์ไม่ได้'); return}
  const r=calcPayroll(currentEmployee,d.records,[],await getBenefits(),dateKey,dateKey); r.hasClosedWork=true; r.dailyDate=dateKey; printSlipHtml(r,true);
}
function fillSettings(){
  $('setCompany').value=companySettings.companyName||''; $('setRadius').value=companySettings.radiusMeters||100; $('setLat').value=companySettings.officeLat||''; $('setLng').value=companySettings.officeLng||'';
  if($('setMonthlyPayDay')) $('setMonthlyPayDay').value=companySettings.monthlyPayDay||30;
  if($('setBiweeklyStart')) $('setBiweeklyStart').value=companySettings.biweeklyStartDate||todayKey();
}
async function saveSettings(){
  companySettings={companyName:$('setCompany').value.trim()||'ระบบลงเวลาออนไลน์',radiusMeters:Number($('setRadius').value||100),officeLat:$('setLat').value?Number($('setLat').value):null,officeLng:$('setLng').value?Number($('setLng').value):null,monthlyPayDay:Number($('setMonthlyPayDay')?.value||30),biweeklyStartDate:$('setBiweeklyStart')?.value||todayKey()};
  await db.collection('settings').doc('company').set({...companySettings,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}); await logAudit('UPDATE_SETTINGS',companySettings); await loadSettings(); toast('บันทึกตั้งค่าแล้ว'); loadCalendar().catch(()=>{});
}
function setDefaultDates(){
  const t=todayKey(); ['attStart','attEnd','payStart','payEnd','corrDate','calDate'].forEach(id=>{if($(id)) $(id).value=t}); if($('payStart')) $('payStart').value=t.slice(0,8)+'01'; if($('attStart')) $('attStart').value=t.slice(0,8)+'01'; if($('calMonth')) $('calMonth').value=t.slice(0,7); if($('setBiweeklyStart')&&!$('setBiweeklyStart').value) $('setBiweeklyStart').value=t;
}
function setCurrentPayPeriod(){const p=computeCurrentPayPeriod('monthly'); $('payStart').value=p.start; $('payEnd').value=p.end; toast(`ตั้งงวด ${p.start} ถึง ${p.end} / วันเงินออก ${p.payDate}`)}
async function runPayroll(){
  const start=$('payStart').value,end=$('payEnd').value; const [empSnap,attSnap,otSnap,benefitsSnap]=await Promise.all([db.collection('employees').get(),db.collection('attendance').where('dateKey','>=',start).where('dateKey','<=',end).get(),db.collection('otRequests').where('dateKey','>=',start).where('dateKey','<=',end).where('status','==','approved').get(),db.collection('benefits').where('active','==',true).get()]);
  const employees=empSnap.docs.map(d=>({id:d.id,...d.data()})).filter(e=>e.role!=='admin'&&e.active!==false); const records=attSnap.docs.map(d=>normalizeAttendance(d.id,d.data())); const ots=otSnap.docs.map(d=>({id:d.id,...d.data()})); const benefits=benefitsSnap.docs.map(d=>({id:d.id,...d.data()})); await getShifts();
  lastPayrollRows=employees.map(e=>calcPayroll(e,records.filter(r=>r.employeeId===e.id||r.employeeCode===e.employeeCode),ots.filter(o=>o.employeeId===e.id||o.employeeCode===e.employeeCode),benefits,start,end)).filter(r=>r.workDays>0||r.basePay>0);
  $('payrollList').innerHTML=lastPayrollRows.map(r=>{const dis=slipDisabledReason(r); const print=canPrintSlip(r)?`<button class="secondary" onclick="printSlip('${r.employeeId}')">พิมพ์ Slip</button>`:`<span class="disabled-note">${dis}</span>`; return `<div class="item"><b>${safeText(r.employeeCode)} ${safeText(r.fullName)}</b><br><span class="muted">${payTypeText(r.payType)} • ${r.payCycle==='biweekly'?'ราย 14 วัน':'รายเดือน'} • งวด ${r.periodStart} ถึง ${r.periodEnd} • วันเงินออก ${r.payDate}</span><br><span class="muted">วันทำงาน ${r.workDays} • ปกติ ${r.regularHours.toFixed(2)} ชม. • OT อนุมัติ ${r.approvedOtHours.toFixed(2)} ชม. • สาย ${r.lateMinutes} นาที</span><br>ฐาน ${money(r.basePay)} + OT ${money(r.otPay)} + สวัสดิการ ${money(r.benefitsPay)} - หักสาย ${money(r.lateDeduction)} = <b>${money(r.netPay)} บาท</b><div class="row-actions">${print}</div></div>`}).join('')||'<p class="muted">ไม่พบข้อมูลเงินเดือน</p>';
}
function calcPayroll(e,rows,ots,benefits,start,end){
  const daily=pairAttendance(rows); const shift=getShift(e.shiftId); let workDays=0,regularHours=0,lateMinutes=0; const dailyDetails=[];
  daily.forEach(d=>{if(!d.firstIn||!d.lastOut){dailyDetails.push({dateKey:d.dateKey,clockIn:d.firstIn?displayTime(d.firstIn):'',clockOut:d.lastOut?displayTime(d.lastOut):'',workHours:d.workHours,closed:false}); return} workDays++; const hrs=d.workHours; const regular=Math.min(hrs,Number(shift.regularHours||8)); regularHours+=regular; let late=0; if(shift.start){const std=new Date(`${d.dateKey}T${shift.start}:00`); const actual=recTime(d.firstIn); if(actual>std) late=Math.round((actual-std)/60000)} lateMinutes+=late; dailyDetails.push({dateKey:d.dateKey,clockIn:displayTime(d.firstIn),clockOut:displayTime(d.lastOut),workHours:hrs,regularHours:regular,lateMinutes:late,closed:true})});
  const approvedOtHours=ots.reduce((s,o)=>s+Number(o.hours||0),0); const hourly=Number(e.hourlyRate||0)||Number(e.dailyRate||0)/8||Number(e.monthlySalary||0)/30/8; let basePay=0; if(e.payType==='monthly') basePay=Number(e.monthlySalary||0); else if(e.payType==='daily') basePay=workDays*Number(e.dailyRate||0); else basePay=regularHours*Number(e.hourlyRate||0); if(e.payCycle==='biweekly'&&e.payType==='monthly') basePay=Number(e.monthlySalary||0)/2;
  const otPay=approvedOtHours*hourly*Number(e.otMultiplier||1.5); const benefitLines=benefits.map(b=>({name:b.name||'',mode:b.mode,amount:Number(b.amount||0),total:b.mode==='perWorkday'?Number(b.amount||0)*workDays:Number(b.amount||0)})); const benefitsPay=benefitLines.reduce((s,b)=>s+b.total,0); const lateDeduction=lateMinutes*(hourly/60); const grossPay=basePay+otPay+benefitsPay; const netPay=grossPay-lateDeduction; const payCycle=e.payCycle||'monthly'; const payDate=payCycle==='biweekly'?computeBiweeklyPayDate(start,end):computeMonthlyPayDate(start,end); const hasClosedWork=daily.some(x=>x.lastOut);
  return {employeeId:e.id,employeeCode:e.employeeCode,fullName:e.fullName,department:e.department||'',payType:e.payType||'hourly',payCycle,periodStart:start,periodEnd:end,payDate,workDays,regularHours,approvedOtHours,lateMinutes,hourlyRate:hourly,dailyRate:Number(e.dailyRate||0),monthlySalary:Number(e.monthlySalary||0),basePay,otPay,benefitsPay,benefitLines,lateDeduction,grossPay,netPay,dailyDetails,hasClosedWork};
}
function printSlipHtml(r,isUser=false){
  const dailyRows=(r.dailyDetails||[]).map(d=>`<tr><td>${safeText(d.dateKey)}</td><td>${safeText(d.clockIn||'')}</td><td>${safeText(d.clockOut||'')}</td><td class="right">${Number(d.workHours||0).toFixed(2)}</td><td class="right">${Number(d.lateMinutes||0)}</td></tr>`).join('');
  const benefitRows=(r.benefitLines||[]).map(b=>`<tr><td>${safeText(b.name)}</td><td>${b.mode==='perWorkday'?'ตามวันทำงาน':'Fix รายเดือน'}</td><td class="right">${money(b.total)}</td></tr>`).join('')||'<tr><td colspan="3">-</td></tr>';
  const w=window.open('','_blank'); w.document.write(`<html><head><title>Payroll Slip</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial,sans-serif;padding:24px;color:#111827}h2,h3,p{margin:0 0 10px}table{width:100%;border-collapse:collapse;margin:10px 0}td,th{border:1px solid #ddd;padding:8px;text-align:left}.right{text-align:right}.muted{color:#64748b}@media print{button{display:none}}</style></head><body><h2>Payroll Slip</h2><p>${safeText(companySettings.companyName||'')}</p><p class="muted">${isUser?'พนักงานพิมพ์เอง':'ออกโดยผู้ดูแลระบบ'}</p><table><tr><th>พนักงาน</th><td>${safeText(r.employeeCode)} ${safeText(r.fullName)}</td></tr><tr><th>งวด</th><td>${r.periodStart} ถึง ${r.periodEnd}</td></tr><tr><th>วันเงินออก</th><td>${r.payDate}</td></tr><tr><th>วิธีจ่าย</th><td>${payTypeText(r.payType)} / ${r.payCycle==='biweekly'?'ราย 14 วัน':'รายเดือน'}</td></tr></table><h3>รายละเอียดเวลา</h3><table><tr><th>วันที่</th><th>เข้า</th><th>ออก</th><th>ชม.</th><th>สาย(นาที)</th></tr>${dailyRows}</table><h3>สรุปรายได้</h3><table><tr><th>ฐานเงิน</th><td class="right">${money(r.basePay)}</td></tr><tr><th>OT อนุมัติ ${r.approvedOtHours.toFixed(2)} ชม.</th><td class="right">${money(r.otPay)}</td></tr><tr><th>สวัสดิการ</th><td class="right">${money(r.benefitsPay)}</td></tr><tr><th>หักสาย</th><td class="right">${money(r.lateDeduction)}</td></tr><tr><th>สุทธิ</th><td class="right"><b>${money(r.netPay)}</b></td></tr></table><h3>สวัสดิการ</h3><table><tr><th>ชื่อ</th><th>วิธีคิด</th><th>ยอด</th></tr>${benefitRows}</table><button onclick="window.print()">พิมพ์</button><script>setTimeout(()=>window.print(),500)<\/script></body></html>`); w.document.close();
}
window.printSlip=function(employeeId){const r=lastPayrollRows.find(x=>x.employeeId===employeeId); if(!r)return; if(!canPrintSlip(r)){toast(slipDisabledReason(r),5000); return} printSlipHtml(r,false)}
function exportAttendance(){
  const rows=[]; lastAttendanceRows.forEach(r=>{rows.push({recordType:'DAILY_SUMMARY',date:r.dateKey,employeeCode:r.employeeCode,fullName:r.fullName,clockIn:r.firstIn?displayTime(r.firstIn):'',clockOut:r.lastOut?displayTime(r.lastOut):'',workHours:r.workHours.toFixed(2),inGeofence:r.inGeofence,distanceMeters:r.distanceMeters||'',mapUrl:r.mapUrl||'',photoMode:r.photoURL?'base64/firestore':'',recordCount:r.records.length}); r.records.forEach(x=>rows.push({recordType:'RAW',date:x.dateKey,employeeCode:x.employeeCode,fullName:x.fullName,type:x.type,time:displayTime(x),source:x.source||'',lat:x.latitude||'',lng:x.longitude||'',accuracy:x.accuracy||'',mapUrl:x.mapUrl||'',inGeofence:x.inGeofence,distanceMeters:x.distanceMeters||'',reason:x.reason||''}))}); exportCsv(`attendance-detailed-${todayKey()}.csv`,rows)
}
function exportPayroll(){exportCsv(`payroll-detailed-${todayKey()}.csv`,lastPayrollRows.map(r=>({employeeCode:r.employeeCode,fullName:r.fullName,department:r.department,payType:payTypeText(r.payType),payCycle:r.payCycle==='biweekly'?'ราย 14 วัน':'รายเดือน',periodStart:r.periodStart,periodEnd:r.periodEnd,payDate:r.payDate,workDays:r.workDays,regularHours:r.regularHours.toFixed(2),approvedOtHours:r.approvedOtHours.toFixed(2),lateMinutes:r.lateMinutes,hourlyRate:r.hourlyRate,dailyRate:r.dailyRate,monthlySalary:r.monthlySalary,basePay:r.basePay,otPay:r.otPay,benefitsPay:r.benefitsPay,lateDeduction:r.lateDeduction,grossPay:r.grossPay,netPay:r.netPay,printAllowed:canPrintSlip(r),printNote:slipDisabledReason(r)})))}
function exportPayrollSlipCsv(){
  const rows=[]; lastPayrollRows.forEach(r=>{rows.push({lineType:'SUMMARY',employeeCode:r.employeeCode,fullName:r.fullName,periodStart:r.periodStart,periodEnd:r.periodEnd,payDate:r.payDate,payType:payTypeText(r.payType),payCycle:r.payCycle,description:'NET_PAY',amount:r.netPay}); (r.dailyDetails||[]).forEach(d=>rows.push({lineType:'DAY',employeeCode:r.employeeCode,fullName:r.fullName,date:d.dateKey,clockIn:d.clockIn,clockOut:d.clockOut,workHours:d.workHours,lateMinutes:d.lateMinutes})); (r.benefitLines||[]).forEach(b=>rows.push({lineType:'BENEFIT',employeeCode:r.employeeCode,fullName:r.fullName,description:b.name,mode:b.mode,amount:b.total}))}); exportCsv(`payroll-slip-lines-${todayKey()}.csv`,rows)
}
function bind(){
  const on=(id,fn)=>{if($(id)) $(id).onclick=fn};
  on('loginBtn',login); on('seedAdminBtn',seedAdmin); on('logoutBtn1',logout); on('logoutBtn2',logout); on('startCameraBtn',startCamera); on('captureBtn',()=>captureSelfie().catch(e=>toast(e.message,5000))); on('clockInBtn',()=>clock('IN')); on('clockOutBtn',()=>clock('OUT')); on('autoClockBtn',autoClock); on('refreshMyHistoryBtn',loadMyHistory); on('refreshUserCalendarBtn',loadUserCalendar); on('refreshUserSlipBtn',loadUserSlipPreview); on('submitOtBtn',submitOt); on('submitLeaveBtn',submitLeave);
  document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
  on('refreshTodayBtn',loadTodayAdmin); on('saveEmployeeBtn',saveEmployee); on('clearEmployeeBtn',clearEmployeeForm); on('loadAttendanceBtn',loadAttendance); on('saveCorrectionBtn',saveCorrection); on('exportAttendanceBtn',exportAttendance); on('saveShiftBtn',saveShift); on('clearShiftBtn',clearShift); on('loadOtBtn',loadOt); on('loadLeaveBtn',loadLeave); on('saveCalendarBtn',saveCalendar); on('loadCalendarBtn',loadCalendar); on('saveBenefitBtn',saveBenefit); on('runPayrollBtn',runPayroll); on('exportPayrollBtn',exportPayroll); on('exportPayrollSlipCsvBtn',exportPayrollSlipCsv); on('setCurrentPayPeriodBtn',setCurrentPayPeriod); on('useCurrentLocationBtn',()=>useCurrentLocation().catch(e=>toast(e.message,5000))); on('saveSettingsBtn',saveSettings); on('clearAttendanceBtn',()=>deleteCollection('attendance')); on('clearAuditBtn',()=>deleteCollection('auditLogs')); on('loadAuditBtn',loadAudit);
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('installBtn')?.classList.remove('hidden')}); on('installBtn',async()=>{if(deferredPrompt){deferredPrompt.prompt(); deferredPrompt=null; $('installBtn')?.classList.add('hidden')}})
}

/* =========================
   v2.3.0 payroll fixes
   - show all active employees in payroll, even when pay is 0
   - deduct break minutes before calculating normal hours/OT base
   - monthly employees show details but print disabled
   - daily/hourly print slip only after closed work day
   - detailed payroll summary + clearer CSV
   ========================= */
function payrollWorkingHours(rawHours, shift){
  const breakHours = Number(shift?.breakMinutes || 0) / 60;
  return Math.max(0, Number(rawHours || 0) - breakHours);
}
function payrollRowStatus(r){
  if(r.payType === 'monthly') return 'รายเดือน: แสดงรายละเอียดเงินเดือน แต่ปิดการพิมพ์ Slip';
  if(r.workDays <= 0) return 'ยังไม่มีวันทำงานในงวดนี้';
  if(!r.hasClosedWork) return 'มีเวลาเข้าแต่ยังไม่มีเวลาออก';
  return 'พร้อมจ่าย';
}
function canPrintSlip(row){
  return row.payType !== 'monthly' && row.hasClosedWork === true && row.workDays > 0;
}
function slipDisabledReason(row){
  if(row.payType === 'monthly') return 'รายเดือน: แสดงรายละเอียดได้ แต่ปิดการพิมพ์ตามนโยบาย';
  if(row.workDays <= 0) return 'ยังไม่มีข้อมูลเข้างานในงวดนี้';
  if(row.hasClosedWork === false) return 'ยังไม่มีเวลาออกงาน จึงยังพิมพ์ไม่ได้';
  return '';
}
function calcPayroll(e, rows, ots, benefits, start, end){
  const daily = pairAttendance(rows);
  const shift = getShift(e.shiftId);
  let workDays = 0;
  let regularHours = 0;
  let rawHours = 0;
  let breakHoursTotal = 0;
  let lateMinutes = 0;
  const dailyDetails = [];

  daily.forEach(d => {
    if(!d.firstIn || !d.lastOut){
      dailyDetails.push({
        dateKey: d.dateKey,
        clockIn: d.firstIn ? displayTime(d.firstIn) : '',
        clockOut: d.lastOut ? displayTime(d.lastOut) : '',
        rawHours: Number(d.workHours || 0),
        breakHours: 0,
        workHours: 0,
        regularHours: 0,
        lateMinutes: 0,
        closed: false
      });
      return;
    }

    workDays++;
    const raw = Number(d.workHours || 0);
    const breakH = Math.min(raw, Number(shift?.breakMinutes || 0) / 60);
    const hrs = payrollWorkingHours(raw, shift);
    const regular = Math.min(hrs, Number(shift?.regularHours || 8));

    rawHours += raw;
    breakHoursTotal += breakH;
    regularHours += regular;

    let late = 0;
    if(shift?.start){
      const std = new Date(`${d.dateKey}T${shift.start}:00`);
      const actual = recTime(d.firstIn);
      if(actual && actual > std) late = Math.round((actual - std) / 60000);
    }
    lateMinutes += late;

    dailyDetails.push({
      dateKey: d.dateKey,
      clockIn: displayTime(d.firstIn),
      clockOut: displayTime(d.lastOut),
      rawHours: raw,
      breakHours: breakH,
      workHours: hrs,
      regularHours: regular,
      lateMinutes: late,
      closed: true
    });
  });

  const payType = e.payType || 'hourly';
  const payCycle = e.payCycle || 'monthly';
  const monthlySalary = Number(e.monthlySalary || 0);
  const dailyRate = Number(e.dailyRate || 0);
  const hourlyRate = Number(e.hourlyRate || 0) || (dailyRate / 8) || (monthlySalary / 30 / 8) || 0;

  const approvedOtHours = ots.reduce((s,o)=>s + Number(o.hours || 0), 0);
  let basePay = 0;
  if(payType === 'monthly') basePay = payCycle === 'biweekly' ? monthlySalary / 2 : monthlySalary;
  else if(payType === 'daily') basePay = workDays * dailyRate;
  else basePay = regularHours * hourlyRate;

  const otPay = approvedOtHours * hourlyRate * Number(e.otMultiplier || 1.5);
  const benefitLines = benefits.map(b => ({
    name: b.name || '',
    mode: b.mode,
    amount: Number(b.amount || 0),
    total: b.mode === 'perWorkday' ? Number(b.amount || 0) * workDays : Number(b.amount || 0)
  }));
  const benefitsPay = benefitLines.reduce((s,b)=>s+b.total,0);
  const lateDeduction = lateMinutes * (hourlyRate / 60);
  const grossPay = basePay + otPay + benefitsPay;
  const netPay = grossPay - lateDeduction;
  const payDate = payCycle === 'biweekly' ? computeBiweeklyPayDate(start,end) : computeMonthlyPayDate(start,end);
  const hasClosedWork = daily.some(x => x.lastOut);

  const row = {
    employeeId:e.id,
    employeeCode:e.employeeCode || '',
    fullName:e.fullName || '',
    department:e.department || '',
    payType,
    payCycle,
    periodStart:start,
    periodEnd:end,
    payDate,
    shiftName: shift?.name || '',
    shiftStart: shift?.start || '',
    shiftEnd: shift?.end || '',
    shiftBreakMinutes: Number(shift?.breakMinutes || 0),
    workDays,
    rawHours,
    breakHours: breakHoursTotal,
    regularHours,
    approvedOtHours,
    lateMinutes,
    hourlyRate,
    dailyRate,
    monthlySalary,
    basePay,
    otPay,
    benefitsPay,
    benefitLines,
    lateDeduction,
    grossPay,
    netPay,
    dailyDetails,
    hasClosedWork
  };
  row.statusText = payrollRowStatus(row);
  return row;
}
async function runPayroll(){
  const start = $('payStart').value;
  const end = $('payEnd').value;
  const box = $('payrollList');
  if(!start || !end){ toast('กรุณาเลือกวันเริ่มต้นและวันสิ้นสุด'); return; }
  box.innerHTML = '<p class="muted">กำลังคำนวณ payroll...</p>';
  try{
    const [empSnap,attSnap,otSnap,benefitsSnap] = await Promise.all([
      db.collection('employees').get(),
      db.collection('attendance').where('dateKey','>=',start).where('dateKey','<=',end).get(),
      db.collection('otRequests').where('dateKey','>=',start).where('dateKey','<=',end).where('status','==','approved').get(),
      db.collection('benefits').where('active','==',true).get()
    ]);
    const employees = empSnap.docs.map(d=>({id:d.id,...d.data()})).filter(e=>e.role !== 'admin' && e.active !== false);
    const records = attSnap.docs.map(d=>normalizeAttendance(d.id,d.data()));
    const ots = otSnap.docs.map(d=>({id:d.id,...d.data()}));
    const benefits = benefitsSnap.docs.map(d=>({id:d.id,...d.data()}));
    await getShifts();

    lastPayrollRows = employees.map(e => calcPayroll(
      e,
      records.filter(r => r.employeeId === e.id || r.employeeCode === e.employeeCode),
      ots.filter(o => o.employeeId === e.id || o.employeeCode === e.employeeCode),
      benefits,
      start,
      end
    ));

    const totalBase = lastPayrollRows.reduce((s,r)=>s+r.basePay,0);
    const totalOt = lastPayrollRows.reduce((s,r)=>s+r.otPay,0);
    const totalBenefits = lastPayrollRows.reduce((s,r)=>s+r.benefitsPay,0);
    const totalDeduct = lastPayrollRows.reduce((s,r)=>s+r.lateDeduction,0);
    const totalNet = lastPayrollRows.reduce((s,r)=>s+r.netPay,0);

    const summary = `<div class="payroll-summary">
      <div class="stat"><b>${lastPayrollRows.length}</b><span>พนักงาน</span></div>
      <div class="stat"><b>${money(totalBase)}</b><span>ฐานเงิน</span></div>
      <div class="stat"><b>${money(totalOt)}</b><span>OT อนุมัติ</span></div>
      <div class="stat"><b>${money(totalBenefits)}</b><span>สวัสดิการ</span></div>
      <div class="stat"><b>${money(totalDeduct)}</b><span>หักสาย</span></div>
      <div class="stat strong"><b>${money(totalNet)}</b><span>ยอดสุทธิต้องจ่าย</span></div>
    </div>`;

    const info = `<p class="muted">งวด ${start} ถึง ${end} • พบพนักงาน ${employees.length} คน • พบเวลาเข้าออก ${records.length} รายการ • OT อนุมัติ ${ots.length} รายการ</p>`;

    const rowsHtml = lastPayrollRows.map(r=>{
      const print = canPrintSlip(r)
        ? `<button class="secondary" onclick="printSlip('${r.employeeId}')">พิมพ์ Slip</button>`
        : `<span class="disabled-note">${safeText(slipDisabledReason(r) || r.statusText)}</span>`;
      const detail = (r.dailyDetails || []).map(d=>`<div class="mini-row">${safeText(d.dateKey)} • เข้า ${safeText((d.clockIn||'').slice(11)||'-')} • ออก ${safeText((d.clockOut||'').slice(11)||'-')} • ทำงานสุทธิ ${Number(d.workHours||0).toFixed(2)} ชม. • พัก ${Number(d.breakHours||0).toFixed(2)} ชม.</div>`).join('') || '<div class="mini-row muted">ไม่มีรายการเข้าออกในงวดนี้</div>';
      return `<div class="item payroll-item">
        <b>${safeText(r.employeeCode)} ${safeText(r.fullName)}</b>
        <span class="badge">${safeText(payTypeText(r.payType))}</span>
        <span class="badge">${r.payCycle==='biweekly'?'ราย 14 วัน':'รายเดือน'}</span><br>
        <span class="muted">งวด ${r.periodStart} ถึง ${r.periodEnd} • วันเงินออก ${r.payDate} • กะ ${safeText(r.shiftName||'-')} • พัก ${r.shiftBreakMinutes} นาที</span><br>
        <div class="pay-line">วันทำงาน <b>${r.workDays}</b> • ชั่วโมงรวม ${r.rawHours.toFixed(2)} • หักพัก ${r.breakHours.toFixed(2)} • ปกติ ${r.regularHours.toFixed(2)} • OT อนุมัติ ${r.approvedOtHours.toFixed(2)} • สาย ${r.lateMinutes} นาที</div>
        <div class="pay-total">ฐาน ${money(r.basePay)} + OT ${money(r.otPay)} + สวัสดิการ ${money(r.benefitsPay)} - หักสาย ${money(r.lateDeduction)} = <b>${money(r.netPay)} บาท</b></div>
        <details><summary>รายละเอียดรายวัน</summary>${detail}</details>
        <div class="row-actions">${print}</div>
      </div>`;
    }).join('');

    box.innerHTML = summary + info + (rowsHtml || '<p class="muted">ไม่พบพนักงานที่เปิดใช้งาน</p>');
    await logAudit('RUN_PAYROLL',{start,end,employees:employees.length,attendance:records.length,totalNet});
  }catch(e){
    console.error(e);
    box.innerHTML = `<p class="muted">คำนวณ payroll ไม่สำเร็จ: ${safeText(e.message)}</p>`;
    toast('คำนวณ payroll ไม่สำเร็จ: ' + e.message, 7000);
  }
}
function exportPayroll(){
  exportCsv(`payroll-detailed-${todayKey()}.csv`, lastPayrollRows.map(r=>({
    employeeCode:r.employeeCode,
    fullName:r.fullName,
    department:r.department,
    payType:payTypeText(r.payType),
    payCycle:r.payCycle==='biweekly'?'ราย 14 วัน':'รายเดือน',
    periodStart:r.periodStart,
    periodEnd:r.periodEnd,
    payDate:r.payDate,
    shiftName:r.shiftName,
    shiftStart:r.shiftStart,
    shiftEnd:r.shiftEnd,
    shiftBreakMinutes:r.shiftBreakMinutes,
    workDays:r.workDays,
    rawHours:r.rawHours.toFixed(2),
    breakHours:r.breakHours.toFixed(2),
    regularHours:r.regularHours.toFixed(2),
    approvedOtHours:r.approvedOtHours.toFixed(2),
    lateMinutes:r.lateMinutes,
    hourlyRate:r.hourlyRate,
    dailyRate:r.dailyRate,
    monthlySalary:r.monthlySalary,
    basePay:r.basePay,
    otPay:r.otPay,
    benefitsPay:r.benefitsPay,
    lateDeduction:r.lateDeduction,
    grossPay:r.grossPay,
    netPay:r.netPay,
    status:r.statusText,
    printAllowed:canPrintSlip(r),
    printNote:slipDisabledReason(r)
  })));
}
function exportPayrollSlipCsv(){
  const rows=[];
  lastPayrollRows.forEach(r=>{
    rows.push({lineType:'SUMMARY',employeeCode:r.employeeCode,fullName:r.fullName,periodStart:r.periodStart,periodEnd:r.periodEnd,payDate:r.payDate,payType:payTypeText(r.payType),payCycle:r.payCycle,basePay:r.basePay,otPay:r.otPay,benefitsPay:r.benefitsPay,lateDeduction:r.lateDeduction,netPay:r.netPay,status:r.statusText});
    (r.dailyDetails||[]).forEach(d=>rows.push({lineType:'DAY',employeeCode:r.employeeCode,fullName:r.fullName,date:d.dateKey,clockIn:d.clockIn,clockOut:d.clockOut,rawHours:d.rawHours,breakHours:d.breakHours,workHours:d.workHours,regularHours:d.regularHours,lateMinutes:d.lateMinutes,closed:d.closed}));
    (r.benefitLines||[]).forEach(b=>rows.push({lineType:'BENEFIT',employeeCode:r.employeeCode,fullName:r.fullName,description:b.name,mode:b.mode,rate:b.amount,amount:b.total}));
  });
  exportCsv(`payroll-slip-lines-${todayKey()}.csv`,rows);
}
function printSlipHtml(r,isUser=false){
  const dailyRows=(r.dailyDetails||[]).map(d=>`<tr><td>${safeText(d.dateKey)}</td><td>${safeText(d.clockIn||'')}</td><td>${safeText(d.clockOut||'')}</td><td class="right">${Number(d.rawHours||0).toFixed(2)}</td><td class="right">${Number(d.breakHours||0).toFixed(2)}</td><td class="right">${Number(d.workHours||0).toFixed(2)}</td><td class="right">${Number(d.lateMinutes||0)}</td></tr>`).join('') || '<tr><td colspan="7">ไม่มีรายการรายวัน</td></tr>';
  const benefitRows=(r.benefitLines||[]).map(b=>`<tr><td>${safeText(b.name)}</td><td>${b.mode==='perWorkday'?'ตามวันทำงาน':'Fix รายเดือน'}</td><td class="right">${money(b.total)}</td></tr>`).join('')||'<tr><td colspan="3">-</td></tr>';
  const w=window.open('','_blank');
  w.document.write(`<html><head><title>Payroll Slip</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial,sans-serif;padding:24px;color:#111827}h2,h3,p{margin:0 0 10px}table{width:100%;border-collapse:collapse;margin:10px 0}td,th{border:1px solid #ddd;padding:8px;text-align:left}.right{text-align:right}.muted{color:#64748b}.net{font-size:20px}@media print{button{display:none}}</style></head><body><h2>Payroll Slip</h2><p>${safeText(companySettings.companyName||'')}</p><p class="muted">${isUser?'พนักงานพิมพ์เอง':'ออกโดยผู้ดูแลระบบ'} • ${safeText(r.statusText||'')}</p><table><tr><th>พนักงาน</th><td>${safeText(r.employeeCode)} ${safeText(r.fullName)}</td></tr><tr><th>งวด</th><td>${r.periodStart} ถึง ${r.periodEnd}</td></tr><tr><th>วันเงินออก</th><td>${r.payDate}</td></tr><tr><th>วิธีจ่าย</th><td>${payTypeText(r.payType)} / ${r.payCycle==='biweekly'?'ราย 14 วัน':'รายเดือน'}</td></tr><tr><th>กะ</th><td>${safeText(r.shiftName||'-')} / พัก ${r.shiftBreakMinutes||0} นาที</td></tr></table><h3>รายละเอียดเวลา</h3><table><tr><th>วันที่</th><th>เข้า</th><th>ออก</th><th>ชม.รวม</th><th>พัก</th><th>ชม.สุทธิ</th><th>สาย</th></tr>${dailyRows}</table><h3>สรุปรายได้</h3><table><tr><th>ฐานเงิน</th><td class="right">${money(r.basePay)}</td></tr><tr><th>OT อนุมัติ ${r.approvedOtHours.toFixed(2)} ชม.</th><td class="right">${money(r.otPay)}</td></tr><tr><th>สวัสดิการ</th><td class="right">${money(r.benefitsPay)}</td></tr><tr><th>หักสาย</th><td class="right">${money(r.lateDeduction)}</td></tr><tr><th>สุทธิ</th><td class="right net"><b>${money(r.netPay)}</b></td></tr></table><h3>สวัสดิการ</h3><table><tr><th>ชื่อ</th><th>วิธีคิด</th><th>ยอด</th></tr>${benefitRows}</table><button onclick="window.print()">พิมพ์</button><script>setTimeout(()=>window.print(),500)<\/script></body></html>`);
  w.document.close();
}
function rebindPayrollV23(){
  if($('runPayrollBtn')) $('runPayrollBtn').onclick = runPayroll;
  if($('exportPayrollBtn')) $('exportPayrollBtn').onclick = exportPayroll;
  if($('exportPayrollSlipCsvBtn')) $('exportPayrollSlipCsvBtn').onclick = exportPayrollSlipCsv;
  if($('setCurrentPayPeriodBtn')) $('setCurrentPayPeriodBtn').onclick = setCurrentPayPeriod;
}
rebindPayrollV23();

/* =========================
   v2.4 Leave Entitlement + Leave Approval + Payroll Leave Integration
   - โควต้าลารายคนต่อปีเป็นชั่วโมง
   - ลากิจ/ลาป่วย/พักร้อน/ลาไม่จ่าย/ขาดงาน
   - ลาครึ่งวัน/รายชั่วโมง/เต็มวัน
   - แจ้งเตือน user เมื่ออนุมัติ/ไม่อนุมัติ
   - payroll รวมวันลาจ่ายเงิน และหักลาไม่จ่าย/ขาดงานสำหรับรายเดือน
   - query แบบไม่ต้องสร้าง composite index เพิ่ม
   ========================= */

const LEAVE_TYPES_V24 = {
  personal: 'ลากิจ',
  sick: 'ลาป่วย',
  vacation: 'ลาพักร้อน',
  unpaid: 'ลาไม่จ่ายเงิน',
  absent: 'ขาดงาน'
};
const LEAVE_QUOTA_TYPES_V24 = ['personal','sick','vacation'];
const LEAVE_DEFAULT_HOURS_PER_DAY_V24 = 8;

function leaveTextV24(type){ return LEAVE_TYPES_V24[type] || type || '-'; }
function leaveUnitTextV24(unit){ return unit==='hourly'?'รายชั่วโมง':unit==='halfDay'?'ครึ่งวัน':'เต็มวัน'; }
function leavePayTextV24(payMode){ return payMode==='unpaid'?'ไม่จ่ายเงิน':payMode==='absence'?'ขาดงาน':'จ่ายเงิน'; }
function yearOfDateV24(dateKey){ return String(dateKey || todayKey()).slice(0,4); }
function numV24(v, fallback=0){ const n=Number(v); return Number.isFinite(n)?n:fallback; }
function dateDiffDaysInclusiveV24(start,end){
  const a=new Date(start+'T00:00:00'), b=new Date(end+'T00:00:00');
  if(!start||!end||isNaN(a)||isNaN(b)) return 0;
  return Math.max(1, Math.round((b-a)/86400000)+1);
}
function calcLeaveHoursV24(start,end,unit,hours){
  if(unit==='hourly') return Math.max(0, numV24(hours,0));
  const days=dateDiffDaysInclusiveV24(start,end);
  if(unit==='halfDay') return days*4;
  return days*LEAVE_DEFAULT_HOURS_PER_DAY_V24;
}
function leaveQuotaOfV24(emp,type){
  return numV24(emp?.leaveQuotas?.[type] ?? emp?.[`leave${type[0].toUpperCase()+type.slice(1)}Hours`] ?? 0,0);
}

function enhanceLeaveUiV24(){
  // Employee form: add per-employee yearly leave entitlement
  if($('empShiftId') && !$('empLeaveSick')){
    const grid=$('empShiftId').closest('.form-grid');
    if(grid){
      const insert=document.createElement('div');
      insert.style.display='contents';
      insert.innerHTML=`
        <label>ลาป่วย/ปี (ชม.)</label><input id="empLeaveSick" type="number" step="0.25" min="0" value="0" />
        <label>ลากิจ/ปี (ชม.)</label><input id="empLeavePersonal" type="number" step="0.25" min="0" value="0" />
        <label>พักร้อน/ปี (ชม.)</label><input id="empLeaveVacation" type="number" step="0.25" min="0" value="0" />
      `;
      const activeLabel=$('empActive')?.closest('label')?.previousElementSibling;
      if(activeLabel) grid.insertBefore(insert, activeLabel);
      else grid.appendChild(insert);
    }
  }

  // Employee leave request form: detailed leave type/pay/unit/hours
  if($('leaveType') && !$('leavePayMode')){
    $('leaveType').innerHTML=`
      <option value="personal">ลากิจ</option>
      <option value="sick">ลาป่วย</option>
      <option value="vacation">ลาพักร้อน</option>
      <option value="unpaid">ลาไม่จ่ายเงิน</option>
      <option value="absent">ขาดงาน</option>
    `;
    const form=$('leaveType').closest('.form-grid');
    if(form){
      const extra=document.createElement('div');
      extra.style.display='contents';
      extra.innerHTML=`
        <label>สถานะเงิน</label>
        <select id="leavePayMode"><option value="paid">ลาจ่ายเงิน</option><option value="unpaid">ลาไม่จ่ายเงิน</option><option value="absence">ขาดงาน</option></select>
        <label>รูปแบบลา</label>
        <select id="leaveUnit"><option value="fullDay">เต็มวัน</option><option value="halfDay">ครึ่งวัน</option><option value="hourly">รายชั่วโมง</option></select>
        <label>จำนวนชั่วโมง<br><span class="muted small">ใส่เมื่อเลือกรายชั่วโมง</span></label>
        <input id="leaveHours" type="number" step="0.25" min="0" placeholder="เช่น 2" />
      `;
      form.insertBefore(extra, $('leaveReason')?.previousElementSibling || null);
    }
  }

  // Employee leave balance + notifications card
  const empPanel=$('employeePanel');
  if(empPanel && !$('leaveBalanceList')){
    const card=document.createElement('div');
    card.className='grid two';
    card.innerHTML=`
      <div class="card">
        <div class="section-title"><h3>สิทธิ์วันลาของฉัน</h3><button id="refreshLeaveBalanceBtn" class="secondary">รีเฟรช</button></div>
        <div id="leaveBalanceList" class="list"></div>
      </div>
      <div class="card">
        <div class="section-title"><h3>แจ้งเตือน</h3><button id="refreshNotificationsBtn" class="secondary">รีเฟรช</button></div>
        <div id="notificationList" class="list"></div>
      </div>`;
    const history=$('myHistory')?.closest('.card');
    if(history) history.parentNode.insertBefore(card, history.nextSibling);
    else empPanel.appendChild(card);
  }

  // Admin leave tab helper text
  if($('leaveList') && !$('leavePolicyHint')){
    const hint=document.createElement('p');
    hint.id='leavePolicyHint';
    hint.className='muted small';
    hint.textContent='ระบบคิดสิทธิ์ลาเป็นชั่วโมงต่อปี รายคนไม่จำเป็นต้องเท่ากัน: ลากิจ/ลาป่วย/พักร้อนใช้โควต้า, ลาไม่จ่ายเงิน/ขาดงานไม่ใช้โควต้าแต่ส่งผลต่อ Payroll';
    $('leaveList').parentNode.insertBefore(hint,$('leaveList'));
  }
}

enhanceLeaveUiV24();

// Override employee form functions to include leave quotas
const clearEmployeeFormBaseV24 = window.clearEmployeeForm || clearEmployeeForm;
clearEmployeeForm = function(){
  clearEmployeeFormBaseV24();
  if($('empLeaveSick')) $('empLeaveSick').value='0';
  if($('empLeavePersonal')) $('empLeavePersonal').value='0';
  if($('empLeaveVacation')) $('empLeaveVacation').value='0';
};

window.editEmployee = async function(id){
  const d=await db.collection('employees').doc(id).get();
  const e={id:d.id,...d.data()};
  $('empIdEdit').value=e.id;
  $('empCode').value=e.employeeCode||'';
  $('empFullName').value=e.fullName||'';
  $('empDept').value=e.department||'';
  $('empPosition').value=e.position||'';
  $('empRole').value=e.role||'employee';
  $('empPayType').value=e.payType||'hourly';
  $('empPayCycle').value=e.payCycle||'monthly';
  $('empHourly').value=e.hourlyRate||0;
  $('empDaily').value=e.dailyRate||0;
  $('empMonthly').value=e.monthlySalary||0;
  $('empOt').value=e.otMultiplier||1.5;
  if(e.shiftId && $('empShiftId')) $('empShiftId').value=e.shiftId;
  $('empActive').checked=e.active!==false;
  $('empPin').value='';
  if($('empLeaveSick')) $('empLeaveSick').value=leaveQuotaOfV24(e,'sick');
  if($('empLeavePersonal')) $('empLeavePersonal').value=leaveQuotaOfV24(e,'personal');
  if($('empLeaveVacation')) $('empLeaveVacation').value=leaveQuotaOfV24(e,'vacation');
  toast('โหลดข้อมูลเข้าฟอร์มแล้ว');
};

saveEmployee = async function(){
  const id=$('empIdEdit').value;
  const code=$('empCode').value.trim();
  const name=$('empFullName').value.trim();
  const pin=$('empPin').value.trim();
  if(!code||!name) return toast('กรุณากรอกรหัสและชื่อ');
  if(!id&&!pin) return toast('พนักงานใหม่ต้องมี PIN');
  const data={
    employeeCode:code,
    fullName:name,
    department:$('empDept').value.trim(),
    position:$('empPosition').value.trim(),
    role:$('empRole').value,
    active:$('empActive').checked,
    payType:$('empPayType').value,
    payCycle:$('empPayCycle').value,
    hourlyRate:numV24($('empHourly').value,0),
    dailyRate:numV24($('empDaily').value,0),
    monthlySalary:numV24($('empMonthly').value,0),
    otMultiplier:numV24($('empOt').value,1.5),
    shiftId:$('empShiftId')?.value||null,
    leaveQuotas:{
      sick:numV24($('empLeaveSick')?.value,0),
      personal:numV24($('empLeavePersonal')?.value,0),
      vacation:numV24($('empLeaveVacation')?.value,0)
    },
    updatedAt:firebase.firestore.FieldValue.serverTimestamp()
  };
  if(pin) data.pinHash=await sha256(pin);
  if(id) await db.collection('employees').doc(id).update(data);
  else await db.collection('employees').add({...data,createdAt:firebase.firestore.FieldValue.serverTimestamp()});
  await logAudit(id?'UPDATE_EMPLOYEE':'ADD_EMPLOYEE',{code,leaveQuotas:data.leaveQuotas});
  clearEmployeeForm();
  loadEmployees();
  toast('บันทึกพนักงานแล้ว');
};

loadEmployees = async function(){
  try{
    await getShifts(); fillShiftSelect();
    const snap=await db.collection('employees').get();
    const rows=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(a.employeeCode||'').localeCompare(String(b.employeeCode||'')));
    $('employeeList').innerHTML=rows.map(e=>{
      const q=e.leaveQuotas||{};
      return `<div class="item"><b>${safeText(e.employeeCode)} - ${safeText(e.fullName)}</b><br>
      <span class="muted">${safeText(e.department)} • ${safeText(e.position)} • ${e.role||'employee'} • ${payTypeText(e.payType)} • ${e.payCycle==='biweekly'?'ราย 14 วัน':'รายเดือน'} • ${safeText(getShift(e.shiftId)?.name||'-')}</span><br>
      <span class="muted small">สิทธิ์ลา/ปี: ป่วย ${numV24(q.sick,0)} ชม. • กิจ ${numV24(q.personal,0)} ชม. • พักร้อน ${numV24(q.vacation,0)} ชม.</span><br>
      <span class="badge ${e.active!==false?'good':'bad'}">${e.active!==false?'ใช้งาน':'ปิด'}</span>
      <div class="row-actions"><button onclick="editEmployee('${e.id}')" class="warning">แก้ไข</button><button onclick="toggleEmployee('${e.id}',${e.active!==false?'false':'true'})" class="ghost">${e.active!==false?'ปิดใช้งาน':'เปิดใช้งาน'}</button><button onclick="deleteEmployee('${e.id}','${safeText(e.employeeCode)}')" class="danger">ลบ</button></div></div>`;
    }).join('')||'<p class="muted">ยังไม่มีพนักงาน</p>';
  }catch(e){console.error(e); $('employeeList').innerHTML=`<p class="muted">โหลดรายชื่อพนักงานไม่สำเร็จ: ${safeText(e.message)}</p>`;}
};

async function getApprovedLeavesForEmployeeYearV24(employeeId, year){
  const snap=await db.collection('leaveRequests').where('employeeId','==',employeeId).get();
  return snap.docs.map(d=>({id:d.id,...d.data()})).filter(l=>l.status==='approved' && yearOfDateV24(l.startDate)===String(year));
}
async function computeLeaveBalanceV24(emp, year=(new Date()).getFullYear()){
  const leaves=await getApprovedLeavesForEmployeeYearV24(emp.id,year);
  const used={sick:0,personal:0,vacation:0,unpaid:0,absent:0};
  leaves.forEach(l=>{used[l.type]=(used[l.type]||0)+numV24(l.hours,0)});
  return LEAVE_QUOTA_TYPES_V24.map(type=>({type,label:leaveTextV24(type),quota:leaveQuotaOfV24(emp,type),used:used[type]||0,remain:Math.max(0,leaveQuotaOfV24(emp,type)-(used[type]||0))})).concat([
    {type:'unpaid',label:'ลาไม่จ่ายเงิน',quota:null,used:used.unpaid||0,remain:null},
    {type:'absent',label:'ขาดงาน',quota:null,used:used.absent||0,remain:null}
  ]);
}
async function loadLeaveBalanceV24(){
  if(!$('leaveBalanceList') || !currentEmployee) return;
  try{
    const rows=await computeLeaveBalanceV24(currentEmployee);
    $('leaveBalanceList').innerHTML=rows.map(r=>`<div class="mini-row"><b>${r.label}</b> ใช้ ${r.used.toFixed(2)} ชม. ${r.quota===null?'':`/ สิทธิ์ ${r.quota.toFixed(2)} ชม. / คงเหลือ ${r.remain.toFixed(2)} ชม.`}</div>`).join('');
  }catch(e){$('leaveBalanceList').innerHTML=`<p class="muted">โหลดสิทธิ์ลาไม่สำเร็จ: ${safeText(e.message)}</p>`;}
}
async function loadNotificationsV24(){
  if(!$('notificationList') || !currentEmployee) return;
  try{
    const snap=await db.collection('notifications').where('employeeId','==',currentEmployee.id).get();
    const rows=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)).slice(0,30);
    $('notificationList').innerHTML=rows.map(n=>`<div class="item"><b>${safeText(n.title||'แจ้งเตือน')}</b><br><span class="muted">${safeText(n.message||'')}</span>${n.read?'<br><span class="badge">อ่านแล้ว</span>':'<br><span class="badge bad">ใหม่</span>'}<div class="row-actions"><button class="ghost" onclick="markNotificationReadV24('${n.id}')">อ่านแล้ว</button></div></div>`).join('')||'<p class="muted">ยังไม่มีแจ้งเตือน</p>';
  }catch(e){$('notificationList').innerHTML=`<p class="muted">โหลดแจ้งเตือนไม่สำเร็จ: ${safeText(e.message)}</p>`;}
}
window.markNotificationReadV24=async function(id){await db.collection('notifications').doc(id).update({read:true,readAt:firebase.firestore.FieldValue.serverTimestamp()}); loadNotificationsV24();};

const showEmployeeBaseV24=showEmployee;
showEmployee=async function(){ await showEmployeeBaseV24(); enhanceLeaveUiV24(); await loadLeaveBalanceV24(); await loadNotificationsV24(); };

submitLeave = async function(){
  const btn=$('submitLeaveBtn'); setBusy(btn,true,'กำลังส่ง...');
  try{
    const type=$('leaveType').value;
    const start=$('leaveStart').value;
    const end=$('leaveEnd').value;
    const unit=$('leaveUnit')?.value || 'fullDay';
    let payMode=$('leavePayMode')?.value || 'paid';
    const reason=$('leaveReason').value.trim();
    const hours=calcLeaveHoursV24(start,end,unit,$('leaveHours')?.value);
    if(type==='unpaid') payMode='unpaid';
    if(type==='absent') payMode='absence';
    if(!start||!end||!reason) throw new Error('กรุณากรอกข้อมูลวันลา');
    if(hours<=0) throw new Error('จำนวนชั่วโมงลาต้องมากกว่า 0');

    // Quota validation for paid quota leave; use only approved so pending can still be reviewed by admin.
    if(LEAVE_QUOTA_TYPES_V24.includes(type) && payMode==='paid'){
      const balance=await computeLeaveBalanceV24(currentEmployee);
      const row=balance.find(x=>x.type===type);
      if(row && hours>row.remain){
        throw new Error(`${leaveTextV24(type)} คงเหลือ ${row.remain.toFixed(2)} ชม. แต่ขอ ${hours.toFixed(2)} ชม.`);
      }
    }
    await db.collection('leaveRequests').add({
      employeeId:currentEmployee.id,employeeCode:currentEmployee.employeeCode,fullName:currentEmployee.fullName,
      type,payMode,unit,hours,startDate:start,endDate:end,reason,status:'pending',
      createdAt:firebase.firestore.FieldValue.serverTimestamp()
    });
    await logAudit('SUBMIT_LEAVE',{type,payMode,unit,hours,start,end});
    toast('ส่งคำขอลาแล้ว');
    await loadLeaveBalanceV24();
  }catch(e){toast(e.message,6000)}finally{setBusy(btn,false)}
};

loadLeave = async function(){
  try{
    const snap=await db.collection('leaveRequests').get();
    const rows=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    $('leaveList').innerHTML=rows.map(l=>`<div class="item"><b>${safeText(l.employeeCode)} ${safeText(l.fullName)}</b><br>
      <span class="muted">${leaveTextV24(l.type)} • ${leavePayTextV24(l.payMode)} • ${leaveUnitTextV24(l.unit)} • ${numV24(l.hours,0).toFixed(2)} ชม. • ${safeText(l.startDate)} ถึง ${safeText(l.endDate)} • ${safeText(l.reason)}</span><br>
      <span class="badge ${l.status==='approved'?'good':l.status==='rejected'?'bad':''}">${safeText(l.status)}</span>
      <div class="row-actions"><button class="good" onclick="approveLeave('${l.id}',true)">อนุมัติ</button><button class="danger" onclick="approveLeave('${l.id}',false)">ไม่อนุมัติ</button></div></div>`).join('')||'<p class="muted">ไม่มีคำขอลา</p>';
  }catch(e){$('leaveList').innerHTML=`<p class="muted">โหลดวันลาไม่สำเร็จ: ${safeText(e.message)}</p>`;}
};

window.approveLeave=async function(id,ok){
  const ref=db.collection('leaveRequests').doc(id);
  const d=await ref.get(); if(!d.exists) return toast('ไม่พบคำขอลา');
  const l={id:d.id,...d.data()};
  await ref.update({status:ok?'approved':'rejected',approvedBy:currentEmployee.employeeCode,approvedAt:firebase.firestore.FieldValue.serverTimestamp()});
  await db.collection('notifications').add({
    employeeId:l.employeeId,
    employeeCode:l.employeeCode,
    title: ok?'คำขอลาได้รับอนุมัติ':'คำขอลาไม่ผ่านอนุมัติ',
    message:`${leaveTextV24(l.type)} ${numV24(l.hours,0).toFixed(2)} ชม. (${safeText(l.startDate)} ถึง ${safeText(l.endDate)}) ${ok?'อนุมัติแล้ว':'ไม่ผ่านอนุมัติ'}`,
    read:false,
    relatedType:'leave',
    relatedId:id,
    createdAt:firebase.firestore.FieldValue.serverTimestamp()
  });
  await logAudit(ok?'APPROVE_LEAVE':'REJECT_LEAVE',{id,employeeCode:l.employeeCode,type:l.type,hours:l.hours});
  toast(ok?'อนุมัติวันลาแล้ว':'ไม่อนุมัติวันลาแล้ว');
  loadLeave();
};

// Payroll override: include approved paid/unpaid/absent leave and avoid extra composite indexes by filtering in memory.
function approvedLeaveHoursInRangeV24(leaves,start,end){
  return leaves.filter(l=>l.status==='approved' && String(l.startDate||'')<=end && String(l.endDate||'')>=start);
}
function calcPayrollV24(e, rows, ots, benefits, leaves, start, end){
  const base=calcPayroll(e,rows,ots,benefits,start,end);
  const hourly=base.hourlyRate || 0;
  const approved=approvedLeaveHoursInRangeV24(leaves,start,end);
  let paidLeaveHours=0, unpaidLeaveHours=0, absentHours=0;
  approved.forEach(l=>{
    const h=numV24(l.hours,0);
    if(l.payMode==='paid' && LEAVE_QUOTA_TYPES_V24.includes(l.type)) paidLeaveHours+=h;
    else if(l.payMode==='absence' || l.type==='absent') absentHours+=h;
    else unpaidLeaveHours+=h;
  });
  let paidLeavePay=0, leaveDeduction=0;
  if(base.payType==='monthly'){
    leaveDeduction=(unpaidLeaveHours+absentHours)*hourly;
  }else if(base.payType==='daily'){
    paidLeavePay=(paidLeaveHours/8)*base.dailyRate;
  }else{
    paidLeavePay=paidLeaveHours*hourly;
  }
  base.paidLeaveHours=paidLeaveHours;
  base.unpaidLeaveHours=unpaidLeaveHours;
  base.absentHours=absentHours;
  base.paidLeavePay=paidLeavePay;
  base.leaveDeduction=leaveDeduction;
  base.grossPay=(base.grossPay||0)+paidLeavePay;
  base.netPay=(base.netPay||0)+paidLeavePay-leaveDeduction;
  base.leaveLines=approved.map(l=>({type:l.type,payMode:l.payMode,unit:l.unit,hours:numV24(l.hours,0),startDate:l.startDate,endDate:l.endDate,reason:l.reason||''}));
  base.statusText = `${base.statusText || ''}${approved.length?` • วันลาอนุมัติ ${approved.length} รายการ`:''}`;
  return base;
}

runPayroll = async function(){
  const start=$('payStart').value, end=$('payEnd').value, box=$('payrollList');
  if(!start||!end){toast('กรุณาเลือกวันเริ่มต้นและวันสิ้นสุด'); return;}
  box.innerHTML='<p class="muted">กำลังคำนวณ payroll...</p>';
  try{
    const [empSnap,attSnap,otSnap,benefitsSnap,leaveSnap]=await Promise.all([
      db.collection('employees').get(),
      db.collection('attendance').where('dateKey','>=',start).where('dateKey','<=',end).get(),
      db.collection('otRequests').get(),
      db.collection('benefits').where('active','==',true).get(),
      db.collection('leaveRequests').get()
    ]);
    const employees=empSnap.docs.map(d=>({id:d.id,...d.data()})).filter(e=>e.role!=='admin'&&e.active!==false);
    const records=attSnap.docs.map(d=>normalizeAttendance(d.id,d.data()));
    const ots=otSnap.docs.map(d=>({id:d.id,...d.data()})).filter(o=>o.status==='approved' && String(o.dateKey||'')>=start && String(o.dateKey||'')<=end);
    const benefits=benefitsSnap.docs.map(d=>({id:d.id,...d.data()}));
    const leaves=leaveSnap.docs.map(d=>({id:d.id,...d.data()}));
    await getShifts();
    lastPayrollRows=employees.map(e=>calcPayrollV24(
      e,
      records.filter(r=>r.employeeId===e.id||r.employeeCode===e.employeeCode),
      ots.filter(o=>o.employeeId===e.id||o.employeeCode===e.employeeCode),
      benefits,
      leaves.filter(l=>l.employeeId===e.id||l.employeeCode===e.employeeCode),
      start,end
    ));
    const totalBase=lastPayrollRows.reduce((s,r)=>s+r.basePay,0);
    const totalOt=lastPayrollRows.reduce((s,r)=>s+r.otPay,0);
    const totalBenefits=lastPayrollRows.reduce((s,r)=>s+r.benefitsPay,0);
    const totalPaidLeave=lastPayrollRows.reduce((s,r)=>s+(r.paidLeavePay||0),0);
    const totalLeaveDeduct=lastPayrollRows.reduce((s,r)=>s+(r.leaveDeduction||0),0);
    const totalDeduct=lastPayrollRows.reduce((s,r)=>s+r.lateDeduction,0);
    const totalNet=lastPayrollRows.reduce((s,r)=>s+r.netPay,0);
    const summary=`<div class="payroll-summary"><div class="stat"><b>${lastPayrollRows.length}</b><span>พนักงาน</span></div><div class="stat"><b>${money(totalBase)}</b><span>ฐานเงิน</span></div><div class="stat"><b>${money(totalOt)}</b><span>OT</span></div><div class="stat"><b>${money(totalBenefits)}</b><span>สวัสดิการ</span></div><div class="stat"><b>${money(totalPaidLeave)}</b><span>ลาจ่ายเงิน</span></div><div class="stat"><b>${money(totalLeaveDeduct+totalDeduct)}</b><span>หักลา/สาย</span></div><div class="stat strong"><b>${money(totalNet)}</b><span>สุทธิต้องจ่าย</span></div></div>`;
    const rowsHtml=lastPayrollRows.map(r=>{
      const print=canPrintSlip(r)?`<button class="secondary" onclick="printSlip('${r.employeeId}')">พิมพ์ Slip</button>`:`<span class="disabled-note">${safeText(slipDisabledReason(r)||r.statusText)}</span>`;
      const leavesHtml=(r.leaveLines||[]).map(l=>`<div class="mini-row">${leaveTextV24(l.type)} • ${leavePayTextV24(l.payMode)} • ${numV24(l.hours,0).toFixed(2)} ชม. • ${safeText(l.startDate)} ถึง ${safeText(l.endDate)}</div>`).join('')||'<div class="mini-row muted">ไม่มีวันลาอนุมัติในงวดนี้</div>';
      return `<div class="item payroll-item"><b>${safeText(r.employeeCode)} ${safeText(r.fullName)}</b> <span class="badge">${safeText(payTypeText(r.payType))}</span><br><span class="muted">งวด ${r.periodStart} ถึง ${r.periodEnd} • วันเงินออก ${r.payDate} • กะ ${safeText(r.shiftName||'-')} • พัก ${r.shiftBreakMinutes} นาที</span><br><div class="pay-line">วันทำงาน <b>${r.workDays}</b> • ปกติ ${r.regularHours.toFixed(2)} ชม. • OT ${r.approvedOtHours.toFixed(2)} ชม. • ลาจ่ายเงิน ${numV24(r.paidLeaveHours,0).toFixed(2)} ชม. • ไม่จ่าย/ขาด ${numV24(r.unpaidLeaveHours+r.absentHours,0).toFixed(2)} ชม.</div><div class="pay-total">ฐาน ${money(r.basePay)} + OT ${money(r.otPay)} + สวัสดิการ ${money(r.benefitsPay)} + ลาจ่ายเงิน ${money(r.paidLeavePay)} - หักลา ${money(r.leaveDeduction)} - หักสาย ${money(r.lateDeduction)} = <b>${money(r.netPay)} บาท</b></div><details><summary>รายละเอียดวันลา</summary>${leavesHtml}</details><div class="row-actions">${print}</div></div>`;
    }).join('');
    box.innerHTML=summary+`<p class="muted">งวด ${start} ถึง ${end} • พนักงาน ${employees.length} คน • เวลาเข้าออก ${records.length} รายการ • OT อนุมัติ ${ots.length} รายการ • วันลาอนุมัติ ${leaves.filter(l=>l.status==='approved').length} รายการ</p>`+(rowsHtml||'<p class="muted">ไม่พบพนักงานที่เปิดใช้งาน</p>');
    await logAudit('RUN_PAYROLL_V24',{start,end,employees:employees.length,totalNet});
  }catch(e){console.error(e); box.innerHTML=`<p class="muted">คำนวณ payroll ไม่สำเร็จ: ${safeText(e.message)}</p>`; toast('คำนวณ payroll ไม่สำเร็จ: '+e.message,7000);}
};

const exportPayrollBaseV24=exportPayroll;
exportPayroll=function(){
  exportCsv(`payroll-detailed-v24-${todayKey()}.csv`, lastPayrollRows.map(r=>({
    employeeCode:r.employeeCode, fullName:r.fullName, department:r.department, payType:payTypeText(r.payType), payCycle:r.payCycle==='biweekly'?'ราย 14 วัน':'รายเดือน',
    periodStart:r.periodStart, periodEnd:r.periodEnd, payDate:r.payDate, workDays:r.workDays, regularHours:r.regularHours?.toFixed?.(2)||0, approvedOtHours:r.approvedOtHours?.toFixed?.(2)||0,
    paidLeaveHours:numV24(r.paidLeaveHours,0).toFixed(2), unpaidLeaveHours:numV24(r.unpaidLeaveHours,0).toFixed(2), absentHours:numV24(r.absentHours,0).toFixed(2),
    basePay:r.basePay, otPay:r.otPay, benefitsPay:r.benefitsPay, paidLeavePay:r.paidLeavePay||0, leaveDeduction:r.leaveDeduction||0, lateDeduction:r.lateDeduction, netPay:r.netPay, status:r.statusText
  })));
};

function rebindV24(){
  enhanceLeaveUiV24();
  if($('submitLeaveBtn')) $('submitLeaveBtn').onclick=submitLeave;
  if($('loadLeaveBtn')) $('loadLeaveBtn').onclick=loadLeave;
  if($('saveEmployeeBtn')) $('saveEmployeeBtn').onclick=saveEmployee;
  if($('clearEmployeeBtn')) $('clearEmployeeBtn').onclick=clearEmployeeForm;
  if($('runPayrollBtn')) $('runPayrollBtn').onclick=runPayroll;
  if($('exportPayrollBtn')) $('exportPayrollBtn').onclick=exportPayroll;
  if($('refreshLeaveBalanceBtn')) $('refreshLeaveBalanceBtn').onclick=loadLeaveBalanceV24;
  if($('refreshNotificationsBtn')) $('refreshNotificationsBtn').onclick=loadNotificationsV24;
}
setTimeout(rebindV24,0);

/* =========================================================
   v2.6 Workday Summary + Editable Company Calendar
   - กำหนดแต่ละวันเป็น วันทำงาน/วันหยุดจ่าย/วันหยุดไม่จ่าย/วันหยุดเปิด OT
   - สรุป ขาดงาน/มาสาย/ไม่สมบูรณ์ จากปฏิทิน+กะ+ลา+เวลา
   - Payroll ใช้ summary เพื่อหักขาดงานรายเดือน และแสดงสถานะรายวัน
   ========================================================= */
const CAL_TYPES_V26 = {
  workday: 'วันทำงาน',
  holiday_paid: 'วันหยุดแบบจ่ายเงิน',
  holiday_unpaid: 'วันหยุดไม่จ่ายเงิน',
  ot_open: 'วันหยุดแต่เปิด OT',
  event: 'กิจกรรม',
  payday: 'วันจ่ายเงิน',
  holiday: 'วันหยุด'
};
const DAY_STATUS_V26 = {
  PRESENT: 'ปกติ',
  LATE: 'มาสาย',
  ABSENT: 'ขาดงาน',
  INCOMPLETE: 'ข้อมูลไม่ครบ',
  LEAVE_PAID: 'ลาจ่ายเงิน',
  LEAVE_UNPAID: 'ลาไม่จ่ายเงิน',
  HOLIDAY_PAID: 'วันหยุดจ่ายเงิน',
  HOLIDAY_UNPAID: 'วันหยุด',
  HOLIDAY_OT: 'วันหยุดเปิด OT',
  NON_WORKDAY: 'ไม่ใช่วันทำงาน'
};
function dateRangeV26(start,end){
  const out=[]; let d=parseDateKey(start), last=parseDateKey(end);
  if(!d||!last) return out;
  while(d<=last){ out.push(dateKeyOf(d)); d=addDays(d,1); }
  return out;
}
function minutesFromTimeV26(t){ if(!t) return 0; const [h,m]=String(t).split(':').map(Number); return (h||0)*60+(m||0); }
function calendarTypeTextV26(t){ return CAL_TYPES_V26[t] || t || '-'; }
function dayStatusTextV26(s){ return DAY_STATUS_V26[s] || s || '-'; }
function isPaidCalTypeV26(type){ return type==='holiday_paid' || type==='payday' || type==='holiday'; }
function defaultCalendarForDateV26(dateKey){
  const d=parseDateKey(dateKey); const dow=d?d.getDay():0;
  if(dow===0) return {dateKey,type:'holiday_unpaid',title:'วันหยุดประจำสัปดาห์',isPaid:false,allowOt:false,isDefault:true};
  return {dateKey,type:'workday',title:'วันทำงาน',isPaid:false,allowOt:false,isDefault:true};
}
function normalizeCalEventV26(e){
  let type=e.type||'event';
  if(type==='holiday') type=e.isPaid?'holiday_paid':'holiday_unpaid';
  return {...e,type,isPaid: e.isPaid ?? isPaidCalTypeV26(type), allowOt: !!(e.allowOt || type==='ot_open'), isWorkday: e.isWorkday ?? type==='workday'};
}
async function getCalendarMapV26(start,end){
  const snap=await db.collection('companyCalendar').get();
  const map={};
  snap.docs.forEach(d=>{
    const x=normalizeCalEventV26({id:d.id,...d.data()});
    if(!x.dateKey) return;
    if(start && x.dateKey<start) return;
    if(end && x.dateKey>end) return;
    map[x.dateKey]=x;
  });
  return map;
}
function getDayCalendarV26(dateKey,calMap){ return calMap[dateKey] || defaultCalendarForDateV26(dateKey); }
function leaveHoursOnDateV26(l,dateKey){
  if(l.status!=='approved') return 0;
  if(String(l.startDate||'')>dateKey || String(l.endDate||'')<dateKey) return 0;
  return Number(l.hoursPerDay || l.hours || 8);
}
function approvedLeaveForDayV26(leaves,dateKey){
  const rows=leaves.filter(l=>l.status==='approved' && String(l.startDate||'')<=dateKey && String(l.endDate||'')>=dateKey);
  if(!rows.length) return null;
  const paid=rows.find(l=>l.payMode==='paid');
  const absent=rows.find(l=>l.payMode==='absence'||l.type==='absent');
  const unpaid=rows.find(l=>l.payMode==='unpaid'||l.type==='unpaid');
  return paid || absent || unpaid || rows[0];
}
function buildDailySummaryV26(employee, rawRows, leaves, calMap, start, end){
  const shift=getShift(employee.shiftId);
  const days=dateRangeV26(start,end);
  const rawByDate={};
  rawRows.forEach(r=>{ (rawByDate[r.dateKey] ||= []).push(r); });
  return days.map(dateKey=>{
    const cal=getDayCalendarV26(dateKey,calMap);
    const records=(rawByDate[dateKey]||[]).sort((a,b)=>recMillis(a)-recMillis(b));
    const ins=records.filter(r=>r.type==='IN');
    const outs=records.filter(r=>r.type==='OUT');
    const firstIn=ins[0]||null, lastOut=outs.at(-1)||null;
    const leave=approvedLeaveForDayV26(leaves,dateKey);
    const regularHours=Number(shift.regularHours||8);
    const breakMinutes=Number(shift.breakMinutes||0);
    let grossHours=(firstIn&&lastOut)?Math.max(0,(recMillis(lastOut)-recMillis(firstIn))/36e5):0;
    let workHours=Math.max(0,grossHours-(grossHours>0?breakMinutes/60:0));
    let lateMinutes=0;
    if(firstIn && shift.start){
      const std=new Date(`${dateKey}T${shift.start}:00`);
      const actual=recTime(firstIn);
      if(actual && actual>std) lateMinutes=Math.round((actual-std)/60000);
    }
    let status='NON_WORKDAY';
    const isWorkday=cal.type==='workday';
    if(leave){
      if(leave.payMode==='paid') status='LEAVE_PAID';
      else if(leave.payMode==='absence'||leave.type==='absent') status='ABSENT';
      else status='LEAVE_UNPAID';
    }else if(isWorkday){
      if(!firstIn && !lastOut) status='ABSENT';
      else if(firstIn && !lastOut) status='INCOMPLETE';
      else if(lateMinutes>0) status='LATE';
      else status='PRESENT';
    }else if(cal.type==='holiday_paid') status='HOLIDAY_PAID';
    else if(cal.type==='ot_open') status=records.length?'HOLIDAY_OT':'HOLIDAY_UNPAID';
    else status='HOLIDAY_UNPAID';
    return {employeeId:employee.id,employeeCode:employee.employeeCode,fullName:employee.fullName,dateKey,calendarType:cal.type,calendarTitle:cal.title,isWorkday,allowOt:!!cal.allowOt,firstIn,lastOut,records,grossHours,breakMinutes,workHours,regularHours,lateMinutes,status,leave,shiftName:shift.name||'-'};
  });
}
function renderSummaryBadgeV26(s){
  const good=['PRESENT','HOLIDAY_PAID','LEAVE_PAID'];
  const bad=['ABSENT','INCOMPLETE'];
  const warn=['LATE','LEAVE_UNPAID','HOLIDAY_OT'];
  const cls=good.includes(s)?'good':bad.includes(s)?'bad':warn.includes(s)?'warning':'';
  return `<span class="badge ${cls}">${dayStatusTextV26(s)}</span>`;
}
async function getAllEmployeesV26(){
  const snap=await db.collection('employees').get();
  return snap.docs.map(d=>({id:d.id,...d.data()})).filter(e=>e.role!=='admin'&&e.active!==false);
}
async function getLeavesAllV26(){ const snap=await db.collection('leaveRequests').get(); return snap.docs.map(d=>({id:d.id,...d.data()})); }
async function computeSummariesV26(start,end){
  await getShifts();
  const [employees, attendanceRows, leaves, calMap]=await Promise.all([
    getAllEmployeesV26(), getAttendanceRows(null,start,end), getLeavesAllV26(), getCalendarMapV26(start,end)
  ]);
  const summaries=[];
  employees.forEach(e=>{
    summaries.push(...buildDailySummaryV26(
      e,
      attendanceRows.filter(r=>r.employeeId===e.id||r.employeeCode===e.employeeCode),
      leaves.filter(l=>l.employeeId===e.id||l.employeeCode===e.employeeCode),
      calMap,start,end
    ));
  });
  return summaries;
}
function summaryToDailyItemV26(s){
  const r={employeeId:s.employeeId,employeeCode:s.employeeCode,fullName:s.fullName,dateKey:s.dateKey,records:s.records,firstIn:s.firstIn,lastOut:s.lastOut,photoURL:s.firstIn?.photoURL||s.lastOut?.photoURL||'',mapUrl:s.firstIn?.mapUrl||s.lastOut?.mapUrl||'',inGeofence:s.firstIn?.inGeofence,distanceMeters:s.firstIn?.distanceMeters,workHours:s.workHours};
  const base=renderDailyItem(r,true);
  return base.replace('</div></div>',`${renderSummaryBadgeV26(s.status)} <span class="badge">${calendarTypeTextV26(s.calendarType)}</span>${s.lateMinutes?` <span class="badge warning">สาย ${s.lateMinutes} นาที</span>`:''}</div></div>`);
}
loadTodayAdmin = async function(){
  const summaries=await computeSummariesV26(todayKey(),todayKey());
  const present=summaries.filter(s=>['PRESENT','LATE'].includes(s.status)).length;
  const late=summaries.filter(s=>s.status==='LATE').length;
  const absent=summaries.filter(s=>s.status==='ABSENT').length;
  const leave=summaries.filter(s=>s.status.startsWith('LEAVE')).length;
  $('todaySummary').innerHTML=`<div class="stat"><b>${summaries.length}</b><span>พนักงาน</span></div><div class="stat"><b>${present}</b><span>มาทำงาน</span></div><div class="stat"><b>${late}</b><span>มาสาย</span></div><div class="stat"><b>${absent}</b><span>ขาดงาน</span></div><div class="stat"><b>${leave}</b><span>ลา</span></div>`;
  $('todayList').innerHTML=summaries.map(summaryToDailyItemV26).join('')||'<p class="muted">วันนี้ยังไม่มีข้อมูล</p>';
};
loadAttendance = async function(){
  const start=$('attStart').value, end=$('attEnd').value;
  const summaries=await computeSummariesV26(start,end);
  lastAttendanceRows=summaries;
  $('attendanceList').innerHTML=summaries.map(summaryToDailyItemV26).join('')||'<p class="muted">ไม่พบข้อมูล</p>';
};
function enhanceCalendarUiV26(){
  const sel=$('calType'); if(sel){
    sel.innerHTML=`<option value="workday">วันทำงาน</option><option value="holiday_paid">วันหยุดแบบจ่ายเงิน</option><option value="holiday_unpaid">วันหยุดไม่จ่ายเงิน</option><option value="ot_open">วันหยุดแต่เปิด OT</option><option value="event">กิจกรรม</option><option value="payday">วันจ่ายเงิน</option>`;
  }
  if($('calPaid') && !$('calAllowOt')){
    const fg=$('calPaid').closest('.form-grid');
    const label=document.createElement('label'); label.textContent='เปิด OT';
    const wrap=document.createElement('label'); wrap.className='check'; wrap.innerHTML='<input id="calAllowOt" type="checkbox" /> อนุญาตขอ OT วันนี้';
    fg.appendChild(label); fg.appendChild(wrap);
    const note=document.createElement('p'); note.className='muted small'; note.textContent='กดวันที่ในปฏิทินเพื่อแก้ไขสถานะวันนั้นได้ทุกวัน'; fg.parentNode.insertBefore(note,fg.nextSibling);
  }
}
function calendarClassV26(t){return t==='workday'?'workday':t==='holiday_paid'?'holiday-paid':t==='holiday_unpaid'?'holiday-unpaid':t==='ot_open'?'ot-open':t==='payday'?'payday':'event';}
renderMonthGrid = function(targetId,events=[],employee=null,monthValue=null){
  const target=$(targetId); if(!target) return;
  const base=monthValue?new Date(`${monthValue}-01T00:00:00`):new Date();
  const y=base.getFullYear(), m=base.getMonth(), first=new Date(y,m,1), total=daysInMonth(y,m), startDow=first.getDay();
  const names=['อา','จ','อ','พ','พฤ','ศ','ส'];
  const byDate={}; [...events,...buildPaydayEvents(y,m)].forEach(e=>{const x=normalizeCalEventV26(e); (byDate[x.dateKey]||=[]).push(x)});
  let html=names.map(n=>`<div class="cal-head">${n}</div>`).join('');
  for(let i=0;i<startDow;i++) html+='<div class="cal-day off"></div>';
  for(let day=1;day<=total;day++){
    const key=`${y}-${pad(m+1)}-${pad(day)}`; const today=key===todayKey();
    const cal=byDate[key]?.[0] || defaultCalendarForDateV26(key);
    const cls=calendarClassV26(cal.type);
    const editable=targetId==='calendarGrid';
    html+=`<div class="cal-day ${today?'today':''} ${cls} ${editable?'editable':''}" ${editable?`onclick="openCalendarDayV26('${key}')"`:''}><div class="cal-num">${day}</div><span class="cal-event ${cls}">${safeText(calendarTypeTextV26(cal.type))}</span>${cal.title?`<span class="cal-event event">${safeText(cal.title)}</span>`:''}${cal.allowOt?'<span class="cal-event ot-open">เปิด OT</span>':''}</div>`;
  }
  target.innerHTML=html;
};
window.openCalendarDayV26 = async function(dateKey){
  const doc=await db.collection('companyCalendar').doc(dateKey).get();
  const c=doc.exists?normalizeCalEventV26({id:doc.id,...doc.data()}):defaultCalendarForDateV26(dateKey);
  $('calIdEdit').value=dateKey; $('calDate').value=dateKey; $('calType').value=c.type||'workday'; $('calTitle').value=c.title||calendarTypeTextV26(c.type); $('calPaid').checked=!!c.isPaid; if($('calAllowOt')) $('calAllowOt').checked=!!c.allowOt;
  toast('โหลดวันที่ '+dateKey+' เข้าแบบฟอร์มแล้ว');
};
saveCalendar = async function(){
  enhanceCalendarUiV26();
  const dateKey=$('calDate').value; if(!dateKey) return toast('กรุณาเลือกวันที่');
  const type=$('calType').value||'workday';
  const data={dateKey,title:$('calTitle').value.trim()||calendarTypeTextV26(type),type,isPaid:$('calPaid').checked||isPaidCalTypeV26(type),allowOt:!!($('calAllowOt')?.checked)||type==='ot_open',isWorkday:type==='workday',updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:currentEmployee?.employeeCode||''};
  await db.collection('companyCalendar').doc(dateKey).set(data,{merge:true});
  await logAudit('SAVE_CALENDAR_DAY_V26',data);
  toast('บันทึกปฏิทิน '+dateKey+' แล้ว');
  await loadCalendar();
};
loadCalendar = async function(){
  enhanceCalendarUiV26();
  const mv=$('calMonth')?.value || todayKey().slice(0,7); const [y,m]=mv.split('-').map(Number); const start=`${y}-${pad(m)}-01`, end=`${y}-${pad(m)}-${pad(daysInMonth(y,m-1))}`;
  const calMap=await getCalendarMapV26(start,end); const events=Object.values(calMap);
  renderMonthGrid('calendarGrid',events,null,mv);
  $('calendarList').innerHTML=dateRangeV26(start,end).map(d=>{const c=getDayCalendarV26(d,calMap);return `<div class="item"><b>${d} - ${safeText(c.title)}</b><br><span class="muted">${calendarTypeTextV26(c.type)} • ${c.isPaid?'มีค่าจ้าง':'ไม่มีค่าจ้าง'} • ${c.allowOt?'เปิด OT':'ไม่เปิด OT'}</span><div class="row-actions"><button class="warning" onclick="openCalendarDayV26('${d}')">แก้ไข</button>${!c.isDefault?`<button class="danger" onclick="deleteCalendar('${d}')">ลบค่าเฉพาะวัน</button>`:''}</div></div>`}).join('');
};
window.deleteCalendar=async function(id){ if(!confirm('ลบค่าเฉพาะวันนี้? ระบบจะกลับไปใช้ค่าเริ่มต้น')) return; await db.collection('companyCalendar').doc(id).delete(); await logAudit('DELETE_CALENDAR_DAY_V26',{id}); await loadCalendar(); };
loadUserCalendar = async function(){
  const now=new Date(); const start=`${now.getFullYear()}-${pad(now.getMonth()+1)}-01`; const end=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(daysInMonth(now.getFullYear(),now.getMonth()))}`;
  const calMap=await getCalendarMapV26(start,end); await getShifts(); const sh=getShift(currentEmployee?.shiftId); renderMonthGrid('userCalendarGrid',Object.values(calMap),{...currentEmployee,shiftName:sh.name});
};
function calcPayrollV26(e, rows, ots, benefits, leaves, calMap, start, end){
  const base=calcPayrollV24(e,rows,ots,benefits,leaves,start,end);
  const summaries=buildDailySummaryV26(e,rows,leaves,calMap,start,end);
  const absentDays=summaries.filter(s=>s.status==='ABSENT');
  const incompleteDays=summaries.filter(s=>s.status==='INCOMPLETE');
  const lateDays=summaries.filter(s=>s.status==='LATE');
  const hourly=base.hourlyRate||0; const shift=getShift(e.shiftId); const regular=Number(shift.regularHours||8);
  const absentHours=absentDays.length*regular;
  const absentDeduction=(base.payType==='monthly')?absentHours*hourly:0;
  base.absentAutoDays=absentDays.length; base.absentAutoHours=absentHours; base.incompleteDays=incompleteDays.length; base.lateDays=lateDays.length; base.attendanceStatusLines=summaries;
  base.leaveDeduction=(base.leaveDeduction||0)+absentDeduction;
  base.netPay=(base.netPay||0)-absentDeduction;
  base.statusText=`ขาดงาน ${absentDays.length} วัน • มาสาย ${lateDays.length} วัน • ไม่ครบ ${incompleteDays.length} วัน`;
  return base;
}
runPayroll = async function(){
  const start=$('payStart').value, end=$('payEnd').value, box=$('payrollList'); if(!start||!end)return toast('กรุณาเลือกวันเริ่มต้นและวันสิ้นสุด'); box.innerHTML='<p class="muted">กำลังคำนวณ payroll + ขาดงาน/มาสาย...</p>';
  try{
    const [empSnap,attSnap,otSnap,benefitsSnap,leaveSnap,calMap]=await Promise.all([db.collection('employees').get(),db.collection('attendance').where('dateKey','>=',start).where('dateKey','<=',end).get(),db.collection('otRequests').get(),db.collection('benefits').where('active','==',true).get(),db.collection('leaveRequests').get(),getCalendarMapV26(start,end)]);
    const employees=empSnap.docs.map(d=>({id:d.id,...d.data()})).filter(e=>e.role!=='admin'&&e.active!==false);
    const records=attSnap.docs.map(d=>normalizeAttendance(d.id,d.data())); const ots=otSnap.docs.map(d=>({id:d.id,...d.data()})).filter(o=>o.status==='approved'&&String(o.dateKey||'')>=start&&String(o.dateKey||'')<=end); const benefits=benefitsSnap.docs.map(d=>({id:d.id,...d.data()})); const leaves=leaveSnap.docs.map(d=>({id:d.id,...d.data()})); await getShifts();
    lastPayrollRows=employees.map(e=>calcPayrollV26(e,records.filter(r=>r.employeeId===e.id||r.employeeCode===e.employeeCode),ots.filter(o=>o.employeeId===e.id||o.employeeCode===e.employeeCode),benefits,leaves.filter(l=>l.employeeId===e.id||l.employeeCode===e.employeeCode),calMap,start,end));
    const totalNet=lastPayrollRows.reduce((s,r)=>s+r.netPay,0), totalAbsent=lastPayrollRows.reduce((s,r)=>s+(r.absentAutoDays||0),0), totalLate=lastPayrollRows.reduce((s,r)=>s+(r.lateDays||0),0);
    const totalBase=lastPayrollRows.reduce((s,r)=>s+r.basePay,0), totalOt=lastPayrollRows.reduce((s,r)=>s+r.otPay,0), totalBenefits=lastPayrollRows.reduce((s,r)=>s+r.benefitsPay,0), totalDeduct=lastPayrollRows.reduce((s,r)=>s+(r.lateDeduction||0)+(r.leaveDeduction||0),0);
    const summary=`<div class="payroll-summary"><div class="stat"><b>${lastPayrollRows.length}</b><span>พนักงาน</span></div><div class="stat"><b>${money(totalBase)}</b><span>ฐานเงิน</span></div><div class="stat"><b>${money(totalOt)}</b><span>OT</span></div><div class="stat"><b>${money(totalBenefits)}</b><span>สวัสดิการ</span></div><div class="stat"><b>${totalAbsent}</b><span>ขาดงาน</span></div><div class="stat"><b>${totalLate}</b><span>มาสาย</span></div><div class="stat"><b>${money(totalDeduct)}</b><span>หักรวม</span></div><div class="stat strong"><b>${money(totalNet)}</b><span>สุทธิต้องจ่าย</span></div></div>`;
    const rowsHtml=lastPayrollRows.map(r=>{const dayDetails=(r.attendanceStatusLines||[]).map(s=>`<div class="mini-row">${s.dateKey} • ${renderSummaryBadgeV26(s.status)} • ${calendarTypeTextV26(s.calendarType)} • เข้า ${s.firstIn?displayTime(s.firstIn).slice(11):'-'} ออก ${s.lastOut?displayTime(s.lastOut).slice(11):'-'} • สาย ${s.lateMinutes} นาที</div>`).join(''); const print=canPrintSlip(r)?`<button class="secondary" onclick="printSlip('${r.employeeId}')">พิมพ์ Slip</button>`:`<span class="disabled-note">${safeText(slipDisabledReason(r)||r.statusText)}</span>`; return `<div class="item payroll-item"><b>${safeText(r.employeeCode)} ${safeText(r.fullName)}</b> <span class="badge">${payTypeText(r.payType)}</span><br><span class="muted">งวด ${r.periodStart} ถึง ${r.periodEnd} • วันเงินออก ${r.payDate} • ${safeText(r.statusText)}</span><br><div class="pay-total">ฐาน ${money(r.basePay)} + OT ${money(r.otPay)} + สวัสดิการ ${money(r.benefitsPay)} + ลาจ่าย ${money(r.paidLeavePay||0)} - หักลา/ขาด ${money(r.leaveDeduction||0)} - หักสาย ${money(r.lateDeduction||0)} = <b>${money(r.netPay)} บาท</b></div><details><summary>รายละเอียดสถานะรายวัน</summary>${dayDetails}</details><div class="row-actions">${print}</div></div>`}).join('');
    box.innerHTML=summary+`<p class="muted">งวด ${start} ถึง ${end} • ใช้ปฏิทินบริษัทเพื่อสรุปขาดงาน/มาสายอัตโนมัติ</p>`+rowsHtml; await logAudit('RUN_PAYROLL_V26',{start,end,totalNet,totalAbsent,totalLate});
  }catch(e){console.error(e); box.innerHTML=`<p class="muted">คำนวณ payroll ไม่สำเร็จ: ${safeText(e.message)}</p>`; toast('คำนวณ payroll ไม่สำเร็จ: '+e.message,7000)}
};
exportAttendance = function(){
  exportCsv(`attendance-summary-v26-${todayKey()}.csv`, (lastAttendanceRows||[]).map(s=>({dateKey:s.dateKey,employeeCode:s.employeeCode,fullName:s.fullName,status:dayStatusTextV26(s.status),calendarType:calendarTypeTextV26(s.calendarType),clockIn:s.firstIn?displayTime(s.firstIn):'',clockOut:s.lastOut?displayTime(s.lastOut):'',workHours:Number(s.workHours||0).toFixed(2),lateMinutes:s.lateMinutes||0,rawRecords:s.records?.length||0,mapUrl:s.firstIn?.mapUrl||s.lastOut?.mapUrl||''})));
};
exportPayroll = function(){
  exportCsv(`payroll-v26-${todayKey()}.csv`, lastPayrollRows.map(r=>({employeeCode:r.employeeCode,fullName:r.fullName,payType:payTypeText(r.payType),periodStart:r.periodStart,periodEnd:r.periodEnd,payDate:r.payDate,workDays:r.workDays,absentDays:r.absentAutoDays||0,lateDays:r.lateDays||0,incompleteDays:r.incompleteDays||0,regularHours:r.regularHours,approvedOtHours:r.approvedOtHours,paidLeaveHours:r.paidLeaveHours||0,unpaidLeaveHours:r.unpaidLeaveHours||0,absentLeaveHours:r.absentHours||0,basePay:r.basePay,otPay:r.otPay,benefitsPay:r.benefitsPay,paidLeavePay:r.paidLeavePay||0,leaveAndAbsentDeduction:r.leaveDeduction||0,lateDeduction:r.lateDeduction||0,netPay:r.netPay,status:r.statusText})));
};
function rebindV26(){
  enhanceCalendarUiV26();
  if($('saveCalendarBtn')) $('saveCalendarBtn').onclick=saveCalendar;
  if($('loadCalendarBtn')) $('loadCalendarBtn').onclick=loadCalendar;
  if($('refreshTodayBtn')) $('refreshTodayBtn').onclick=loadTodayAdmin;
  if($('loadAttendanceBtn')) $('loadAttendanceBtn').onclick=loadAttendance;
  if($('runPayrollBtn')) $('runPayrollBtn').onclick=runPayroll;
  if($('exportAttendanceBtn')) $('exportAttendanceBtn').onclick=exportAttendance;
  if($('exportPayrollBtn')) $('exportPayrollBtn').onclick=exportPayroll;
}
setTimeout(rebindV26,50);


/* ============================================================
   v2.7 STABLE REBASE
   Base: v2.6 stable
   Added carefully: geofence mode + admin/user notifications
   ============================================================ */
(function(){
  const V27='v2.7-stable-rebase';
  window.APP_VERSION=V27;

  function moneySafe(v){ return Number(v||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2}); }

  function notifyTargetMatches(n, emp){
    if(!emp) return false;
    const targets=[
      n.employeeId, n.targetEmployeeId, n.toEmployeeId, n.targetId,
      n.employeeCode, n.targetEmployeeCode, n.toEmployeeCode
    ].filter(v=>v!==undefined && v!==null).map(String);
    if(n.target==='all' || n.to==='all' || n.broadcast===true) return true;
    return targets.includes(String(emp.id)) || targets.includes(String(emp.employeeCode));
  }

  function normalizeNotify(n){
    return {
      id:n.id,
      title:n.title || n.subject || 'แจ้งเตือน',
      message:n.message || n.body || n.text || '',
      read: Boolean(n.read),
      createdAt:n.createdAt,
      createdAtText:n.createdAt?.toDate ? fmtDateTime(n.createdAt.toDate()) : (n.createdAtText || n.clientTimeText || ''),
      source:n.source || 'SYSTEM',
      raw:n
    };
  }

  function ensureUserNotificationUiV27(){
    const empPanel=$('employeePanel');
    if(!empPanel) return;

    // Hide/remove duplicate notification cards created by old patches, then create a single top card.
    const oldList=$('notificationList');
    if(oldList){
      const oldCard=oldList.closest('.card');
      if(oldCard && oldCard.id!=='userNotificationTopCard') oldCard.remove();
    }

    let card=$('userNotificationTopCard');
    if(!card){
      card=document.createElement('div');
      card.id='userNotificationTopCard';
      card.className='card notification-top-card';
      card.innerHTML=`
        <div class="section-title">
          <div>
            <h3>แจ้งเตือน</h3>
            <p class="muted small">ข้อความจากผู้ดูแลระบบ สถานะใบลา OT และรายการผิดปกติ</p>
          </div>
          <button id="refreshNotificationsBtn" class="secondary">โหลดใหม่</button>
        </div>
        <div id="notificationList" class="list"></div>`;
    }
    const topbar=empPanel.querySelector('.topbar-card');
    if(topbar && card.parentNode!==empPanel) empPanel.insertBefore(card, topbar.nextSibling);
    else if(topbar && topbar.nextSibling!==card) empPanel.insertBefore(card, topbar.nextSibling);
    $('refreshNotificationsBtn').onclick=()=>loadNotificationsV27(false);
  }

  async function fetchMyNotificationsV27(){
    if(!currentEmployee) return [];
    const snap=await db.collection('notifications').get();
    const rows=snap.docs.map(d=>({id:d.id,...d.data()}))
      .filter(n=>notifyTargetMatches(n,currentEmployee))
      .filter(n=>!(Array.isArray(n.deletedFor) && n.deletedFor.map(String).includes(String(currentEmployee.id))))
      .sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))
      .slice(0,50)
      .map(normalizeNotify);
    return rows;
  }

  window.loadNotificationsV27 = async function(showPopup=true){
    ensureUserNotificationUiV27();
    const box=$('notificationList');
    if(!box || !currentEmployee) return;
    try{
      const rows=await fetchMyNotificationsV27();
      box.innerHTML=rows.map(n=>`
        <div class="item notification-item ${n.read?'':'unread'}">
          <b>${safeText(n.title)}</b>
          <p class="muted">${safeText(n.message)}</p>
          <span class="badge ${n.read?'':'bad'}">${n.read?'อ่านแล้ว':'ใหม่'}</span>
          ${n.createdAtText?`<span class="badge">${safeText(n.createdAtText)}</span>`:''}
          <span class="badge">${safeText(n.source)}</span>
          <div class="row-actions">
            ${n.read?'':`<button class="ghost" onclick="markNotificationReadV27('${n.id}')">อ่านแล้ว</button>`}
            <button class="danger" onclick="deleteMyNotificationV27('${n.id}')">ลบจากหน้าฉัน</button>
          </div>
        </div>`).join('') || '<p class="muted">ยังไม่มีแจ้งเตือน</p>';
      const firstUnread=rows.find(n=>!n.read);
      if(showPopup && firstUnread) showNotificationPopupV27(firstUnread);
    }catch(e){
      console.error(e);
      box.innerHTML=`<p class="muted">โหลดแจ้งเตือนไม่สำเร็จ: ${safeText(e.message)}</p>`;
    }
  };

  window.markNotificationReadV27 = async function(id){
    await db.collection('notifications').doc(id).set({read:true,readAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    await loadNotificationsV27(false);
  };

  window.deleteMyNotificationV27 = async function(id){
    if(!currentEmployee) return;
    await db.collection('notifications').doc(id).set({
      deletedFor: firebase.firestore.FieldValue.arrayUnion(currentEmployee.id),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    },{merge:true});
    await loadNotificationsV27(false);
  };

  function showNotificationPopupV27(n){
    let pop=$('notificationPopupV27');
    if(pop) pop.remove();
    pop=document.createElement('div');
    pop.id='notificationPopupV27';
    pop.className='notification-popup';
    pop.innerHTML=`
      <b>${safeText(n.title)}</b>
      <div class="muted">${safeText(n.message)}</div>
      <div class="row-actions">
        <button class="secondary" onclick="markNotificationReadV27('${n.id}'); document.getElementById('notificationPopupV27')?.remove();">อ่านแล้ว</button>
        <button class="ghost" onclick="document.getElementById('notificationPopupV27')?.remove();">ปิด</button>
      </div>`;
    document.body.appendChild(pop);
    setTimeout(()=>{ if(document.body.contains(pop)) pop.remove(); }, 9000);
  }

  async function createNotificationV27(payload){
    const data={
      title:payload.title || 'แจ้งเตือน',
      message:payload.message || '',
      employeeId:payload.employeeId || null,
      employeeCode:payload.employeeCode || null,
      target:payload.target || null,
      source:payload.source || 'SYSTEM',
      read:false,
      createdAt:firebase.firestore.FieldValue.serverTimestamp(),
      createdBy:currentEmployee?.employeeCode || 'system'
    };
    await db.collection('notifications').add(data);
  }
  window.createNotificationV27=createNotificationV27;

  function ensureGeofenceSettingsUiV27(){
    if($('setGeofenceMode')) return;
    const radius=$('setRadius');
    const grid=radius?.closest('.form-grid');
    if(!grid) return;
    const label=document.createElement('label');
    label.textContent='โหมดพื้นที่ลงเวลา';
    const select=document.createElement('select');
    select.id='setGeofenceMode';
    select.innerHTML=`
      <option value="allow">อนุญาตทุกที่</option>
      <option value="warn">เตือนเมื่อนอกพื้นที่</option>
      <option value="block">บังคับอยู่ในพื้นที่เท่านั้น</option>`;
    const note=document.createElement('p');
    note.className='geo-note';
    note.textContent='แนะนำใช้ “เตือนเมื่อนอกพื้นที่” ก่อน เพราะ GPS อาจคลาดเคลื่อนได้';
    radius.insertAdjacentElement('afterend', select);
    radius.insertAdjacentElement('afterend', label);
    select.insertAdjacentElement('afterend', note);
  }

  const fillSettingsBaseV27=fillSettings;
  fillSettings=function(){
    fillSettingsBaseV27();
    ensureGeofenceSettingsUiV27();
    if($('setGeofenceMode')) $('setGeofenceMode').value=companySettings.geofenceMode || 'warn';
  };

  const saveSettingsBaseV27=saveSettings;
  saveSettings=async function(){
    ensureGeofenceSettingsUiV27();
    companySettings={
      companyName:$('setCompany').value.trim()||'ระบบลงเวลาออนไลน์',
      radiusMeters:Number($('setRadius').value||100),
      officeLat:$('setLat').value?Number($('setLat').value):null,
      officeLng:$('setLng').value?Number($('setLng').value):null,
      monthlyPayDay:Number($('setMonthlyPayDay')?.value||30),
      biweeklyStartDate:$('setBiweeklyStart')?.value||todayKey(),
      geofenceMode:$('setGeofenceMode')?.value || 'warn'
    };
    await db.collection('settings').doc('company').set({...companySettings,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    await logAudit('UPDATE_SETTINGS_V27',companySettings);
    await loadSettings();
    fillSettings();
    toast('บันทึกตั้งค่าแล้ว');
    loadCalendar().catch(()=>{});
  };

  // Rebind direct onclick set before this patch was loaded.
  setTimeout(()=>{ if($('saveSettingsBtn')) $('saveSettingsBtn').onclick=saveSettings; },100);

  const clockBaseV27=clock;
  clock=async function(type){
    const btn=type==='IN'?$('clockInBtn'):$('clockOutBtn');
    setBusy(btn,true,'กำลังบันทึก...');
    try{
      if(!capturedDataUrl) throw new Error('ต้องถ่ายรูปหน้าตัวเองก่อนลงเวลา');
      if(!currentPosition) await getGPS();
      let dist=null,inGeo=null;
      if(companySettings.officeLat&&companySettings.officeLng){
        dist=distanceMeters(currentPosition.lat,currentPosition.lng,Number(companySettings.officeLat),Number(companySettings.officeLng));
        inGeo=dist<=Number(companySettings.radiusMeters||100);
      }
      const mode=companySettings.geofenceMode||'warn';
      if(inGeo===false && mode==='block'){
        throw new Error(`คุณอยู่นอกพื้นที่ทำงาน ${Math.round(dist||0)} เมตร ไม่สามารถลงเวลาได้`);
      }
      const now=new Date();
      const data={employeeId:currentEmployee.id,employeeCode:currentEmployee.employeeCode,fullName:currentEmployee.fullName,type,source:'EMPLOYEE',dateKey:todayKey(),createdAt:firebase.firestore.FieldValue.serverTimestamp(),clientTime:now.toISOString(),clientTimeText:fmtDateTime(now),photoPath:'firestore-base64',photoURL:capturedDataUrl,photoMode:'base64',latitude:currentPosition.lat,longitude:currentPosition.lng,accuracy:currentPosition.accuracy,mapUrl:`https://maps.google.com/?q=${currentPosition.lat},${currentPosition.lng}`,distanceMeters:dist,inGeofence:inGeo,geofenceMode:mode,userAgent:navigator.userAgent};
      await Promise.race([db.collection('attendance').add(data),new Promise((_,rej)=>setTimeout(()=>rej(new Error('บันทึกช้าเกินไป กรุณาเช็กอินเทอร์เน็ตแล้วลองใหม่')),20000))]);
      await logAudit(type==='IN'?'CLOCK_IN':'CLOCK_OUT',{employeeCode:currentEmployee.employeeCode,inGeofence:inGeo,distanceMeters:dist,geofenceMode:mode});
      if(inGeo===false && mode==='warn'){
        await createNotificationV27({employeeId:currentEmployee.id,employeeCode:currentEmployee.employeeCode,source:'GEOFENCE',title:'ลงเวลานอกพื้นที่',message:`ระบบบันทึกเวลาสำเร็จ แต่คุณอยู่นอกพื้นที่ประมาณ ${Math.round(dist||0)} เมตร`}).catch(console.warn);
      }
      capturedDataUrl=null; currentPosition=null;
      if($('preview')){$('preview').removeAttribute('src'); $('preview').classList.add('hidden');}
      if($('gpsStatus')) $('gpsStatus').textContent='';
      toast('บันทึกสำเร็จ');
      await refreshMyStatus(); await loadMyHistory(); await loadNotificationsV27(false);
    }catch(e){console.error(e); toast('บันทึกไม่สำเร็จ: '+e.message,6000)}
    finally{setBusy(btn,false)}
  };

  function ensureAdminNotifyUiV27(){
    const tab=$('tabSettings');
    if(!tab || $('adminNotifyBoxV27')) return;
    const box=document.createElement('div');
    box.id='adminNotifyBoxV27';
    box.className='admin-notify-box';
    box.innerHTML=`
      <hr>
      <h4>ส่งแจ้งเตือนถึงพนักงาน</h4>
      <p class="muted small">ส่งข้อความไปแสดงในหน้าแจ้งเตือนของพนักงาน</p>
      <div class="form-grid big">
        <label>ส่งถึง</label>
        <select id="notifyTargetV27"><option value="all">ทุกคน</option><option value="one">พนักงานคนเดียว</option></select>
        <label>รหัสพนักงาน</label><input id="notifyEmployeeCodeV27" placeholder="ใช้เมื่อเลือกพนักงานคนเดียว" />
        <label>หัวข้อ</label><input id="notifyTitleV27" placeholder="เช่น แจ้งเตือนเรื่องเข้างาน" />
        <label>ข้อความ</label><textarea id="notifyMessageV27" placeholder="พิมพ์ข้อความแจ้งเตือน"></textarea>
      </div>
      <div class="actions wrap"><button id="sendNotificationBtnV27" class="primary">ส่งแจ้งเตือน</button><button id="loadAdminNotificationsBtnV27" class="secondary">โหลดประวัติแจ้งเตือน</button></div>
      <div id="adminNotificationListV27" class="list"></div>`;
    tab.appendChild(box);
    $('sendNotificationBtnV27').onclick=sendAdminNotificationV27;
    $('loadAdminNotificationsBtnV27').onclick=loadAdminNotificationsV27;
  }

  async function sendAdminNotificationV27(){
    const target=$('notifyTargetV27').value;
    const code=$('notifyEmployeeCodeV27').value.trim();
    const title=$('notifyTitleV27').value.trim() || 'แจ้งเตือนจากผู้ดูแลระบบ';
    const message=$('notifyMessageV27').value.trim();
    if(!message) return toast('กรุณาพิมพ์ข้อความ');
    if(target==='one' && !code) return toast('กรุณากรอกรหัสพนักงาน');
    try{
      if(target==='all'){
        const snap=await db.collection('employees').get();
        const emps=snap.docs.map(d=>({id:d.id,...d.data()})).filter(e=>e.role!=='admin' && e.active!==false);
        await Promise.all(emps.map(e=>createNotificationV27({employeeId:e.id,employeeCode:e.employeeCode,source:'ADMIN_MESSAGE',title,message})));
        toast(`ส่งแจ้งเตือนแล้ว ${emps.length} คน`);
      }else{
        const snap=await db.collection('employees').where('employeeCode','==',code).limit(1).get();
        if(snap.empty) throw new Error('ไม่พบรหัสพนักงาน');
        const d=snap.docs[0], e={id:d.id,...d.data()};
        await createNotificationV27({employeeId:e.id,employeeCode:e.employeeCode,source:'ADMIN_MESSAGE',title,message});
        toast('ส่งแจ้งเตือนแล้ว');
      }
      $('notifyMessageV27').value='';
      await loadAdminNotificationsV27();
    }catch(e){console.error(e); toast('ส่งแจ้งเตือนไม่สำเร็จ: '+e.message,6000)}
  }
  window.sendAdminNotificationV27=sendAdminNotificationV27;

  async function loadAdminNotificationsV27(){
    const box=$('adminNotificationListV27'); if(!box) return;
    try{
      const snap=await db.collection('notifications').get();
      const rows=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)).slice(0,80);
      box.innerHTML=rows.map(n=>`<div class="item"><b>${safeText(n.title||'แจ้งเตือน')}</b><br><span class="muted">ถึง: ${safeText(n.employeeCode||n.targetEmployeeCode||n.target||'-')} • ${n.createdAt?.toDate?fmtDateTime(n.createdAt.toDate()):''}</span><p>${safeText(n.message||'')}</p><div class="row-actions"><button class="danger" onclick="deleteNotificationV27('${n.id}')">ลบออกจากระบบ</button></div></div>`).join('')||'<p class="muted">ยังไม่มีประวัติแจ้งเตือน</p>';
    }catch(e){box.innerHTML=`<p class="muted">โหลดประวัติแจ้งเตือนไม่สำเร็จ: ${safeText(e.message)}</p>`}
  }
  window.loadAdminNotificationsV27=loadAdminNotificationsV27;
  window.deleteNotificationV27=async function(id){
    if(!confirm('ลบแจ้งเตือนนี้ออกจากระบบ?')) return;
    await db.collection('notifications').doc(id).delete();
    await loadAdminNotificationsV27();
  };

  const showEmployeeBaseV27=showEmployee;
  showEmployee=async function(){
    await showEmployeeBaseV27();
    ensureUserNotificationUiV27();
    await loadNotificationsV27(true);
  };

  const showAdminBaseV27=showAdmin;
  showAdmin=async function(){
    await showAdminBaseV27();
    ensureGeofenceSettingsUiV27();
    fillSettings();
    ensureAdminNotifyUiV27();
    await loadAdminNotificationsV27();
  };

})();
