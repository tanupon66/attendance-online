Attendance v3.2.1 Update

ไฟล์ใน zip นี้เป็นเฉพาะไฟล์ที่ต้องอัปเดต/เพิ่ม ไม่ใช่โปรเจกต์ใหม่ทั้งชุด

วิธีติดตั้ง:
1) แตกไฟล์ zip นี้
2) คัดลอกทุกไฟล์ไปวางทับในโปรเจกต์ attendance เดิม โดยคง path เดิมไว้
   - src/app.js
   - src/UI/shell.js
   - src/modules/attendance-tools.js  (ไฟล์ใหม่)
   - styles/main.css
   - service-worker.js
3) Commit และ push ขึ้น GitHub Pages
4) เปิดเว็บแล้วกด Refresh/Reload ถ้าเคยติดตั้งเป็น PWA ให้ปิดเปิดแอปใหม่ หรือเคลียร์ cache หากเมนูยังไม่ขึ้น

ฟีเจอร์ที่เพิ่ม:
- พนักงาน: เมนู ขอ OT สำหรับส่งคำขอทำ OT และดูสถานะ
- แอดมิน: เมนู เครื่องมือเวลา
  - อนุมัติ/ปฏิเสธ OT
  - เพิ่มเวลาเข้า/ออกงานแทนพนักงาน
  - ตรวจ Audit Log
  - Clear Data ตาม collection และช่วงวันที่ โดยต้องพิมพ์ CLEAR ก่อนลบ

Collection ที่ใช้เพิ่มใน Firestore:
- otRequests
- auditLogs

หมายเหตุ:
- ระบบ Clear Data ลบตาม field dateKey เท่านั้น
- แนะนำให้ตั้ง Firestore rules ให้เฉพาะ admin เข้าถึงเมนูเครื่องมือเวลาและการลบข้อมูล
