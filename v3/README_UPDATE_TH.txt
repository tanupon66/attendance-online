Attendance v3.2.2 Geofence Update

ไฟล์นี้เป็นแพตช์เฉพาะไฟล์ที่ต้องเพิ่ม/อัปเดต ไม่ใช่โปรเจกต์ใหม่ทั้งชุด

วิธีติดตั้ง:
1) แตกไฟล์ zip นี้
2) คัดลอกทุกไฟล์ไปวางทับโปรเจกต์ attendance เดิม โดยคง path เดิมไว้
   - src/app.js
   - src/UI/shell.js
   - src/modules/attendance.js
   - src/modules/attendance-tools.js
   - src/modules/geofence-settings.js  (ไฟล์ใหม่)
   - styles/main.css
   - service-worker.js
3) Commit และ push ขึ้น GitHub Pages
4) เปิดเว็บแล้วกด Refresh/Reload ถ้าใช้เป็น PWA ให้ปิดเปิดแอปใหม่ หรือเคลียร์ cache หากเมนูยังไม่ขึ้น

ฟีเจอร์ที่เพิ่ม:
- แอดมินมีเมนูใหม่ “ตำแหน่งบริษัท”
  - ตั้งชื่อสถานที่บริษัท
  - ตั้ง Latitude / Longitude
  - ตั้งรัศมีที่อนุญาตเป็นเมตร
  - ใช้ตำแหน่งปัจจุบันเพื่อดึงพิกัดอัตโนมัติ
  - เปิด/ปิดค่าเริ่มต้นว่าพนักงานต้องอยู่ในรัศมีหรือไม่
- กำหนดรายพนักงานได้ว่า “ต้องลงเวลาในรัศมี” หรือ “ไม่บังคับรัศมี”
- พนักงานที่ถูกบังคับรัศมี ถ้า clock in / clock out นอกพื้นที่:
  - ระบบยังบันทึกรายการไว้
  - สถานะจะเป็น “รออนุมัตินอกพื้นที่”
  - รายการจะยังไม่ถูกนับเป็นรายการใช้งานจริงจนกว่าแอดมินอนุมัติ
- แอดมินอนุมัติ/ปฏิเสธรายการนอกพื้นที่ได้จากหน้า “รายการลงเวลา”
- ระบบบันทึก auditLogs เพิ่มสำหรับ:
  - ATTENDANCE_OUTSIDE_RADIUS_PENDING
  - GEOFENCE_ATTENDANCE_APPROVE
  - GEOFENCE_ATTENDANCE_REJECT
  - GEOFENCE_SETTINGS_UPDATE

ข้อมูลที่เพิ่มใน Firestore:
1) settings/company
   - officeName
   - officeLat
   - officeLng
   - radiusMeters
   - defaultRequireGeofence
   - allowOutsidePendingApproval
   - geofenceMode = approval

2) employees/{employeeId}
   - requireGeofence: true/false

3) attendance/{attendanceId}
   - officeName / officeLat / officeLng / radiusMeters
   - distanceMeters
   - inGeofence
   - geofenceRequired
   - geofenceApprovalStatus: not_required / pending / approved / rejected
   - attendanceStatus: valid / pending_geofence_approval / rejected_geofence
   - approvedForUse: true/false
   - reviewedAt / reviewedBy / reviewedByName เมื่อแอดมินตรวจแล้ว

หมายเหตุสำคัญ:
- พนักงานที่ไม่ได้เปิด requireGeofence จะลงเวลาได้ทั้งในและนอกรัศมี โดยระบบยังบันทึกระยะห่างไว้ให้ตรวจสอบ
- ถ้าพนักงานถูกบังคับรัศมีและอยู่นอกพื้นที่ ระบบจะให้ลงเวลาได้ก่อน แต่ต้องรอแอดมินอนุมัติ
- หลังอัปเดตไฟล์ service-worker.js แล้ว ถ้าเว็บยังโหลดไฟล์เก่า ให้กด hard refresh หรือเคลียร์ cache ของ PWA
