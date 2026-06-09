Attendance v3.2.3 Payroll + Time Fix

ไฟล์อัปเดตนี้แก้ 2 จุดหลัก:
1) รายการลงเวลาโดยแอดมินไม่ถูกนำไปคิดเงิน
- เพิ่มสถานะ approvedForUse=true, attendanceStatus=valid ให้รายการที่แอดมินเพิ่ม
- หลังแอดมินเพิ่มเวลา ระบบจะ rebuild attendanceSummary ของวันนั้นให้อัตโนมัติ
- Payroll จะเห็นรายการนี้ทันทีเมื่อกดคำนวณ ไม่ต้องไปกดสร้างสรุปเองก่อน

2) การคำนวณเวลาทำงาน/มาสายมั่ว
- แก้ recTime ให้ใช้ clientTime เป็นหลัก ไม่ใช้ createdAt ก่อน
  createdAt คือเวลาที่บันทึกลง Firebase แต่ clientTime คือเวลาเข้า/ออกงานจริง
  สำคัญมากสำหรับรายการที่แอดมินเพิ่มย้อนหลัง
- แก้ todayKey/dateRange ให้ใช้วันที่ local ของเครื่อง ไม่ใช้ UTC เพื่อลดปัญหาวันเพี้ยน
- แก้ Summary ให้ไม่นำรายการนอกรัศมีที่ pending/rejected ไปคิดเงิน
- เพิ่ม lateGraceMinutes ใน employee ได้ ถ้าต้องการผ่อนผันสาย เช่น 5 นาที

ไฟล์ที่ต้องอัปเดต:
- src/core/utils.js
- src/modules/summary.js
- src/modules/attendance.js
- src/modules/attendance-tools.js
- service-worker.js

วิธีติดตั้ง:
1) แตก zip นี้
2) วางไฟล์ทับ path เดิมในโปรเจกต์
3) Commit/Push ขึ้น GitHub Pages
4) เปิดเว็บแล้ว Refresh / Clear site data หากมือถือยังโหลดไฟล์เก่าจาก PWA cache

หมายเหตุ:
- รายการที่แอดมินเคยเพิ่มไว้ก่อนแพตช์นี้ ให้ไปหน้า “สรุปสถานะรายวัน” แล้วกด “คำนวณ/สร้างสรุป” ช่วงวันที่ย้อนหลังอีกครั้ง จากนั้น Payroll จะคิดใหม่ถูกต้อง
