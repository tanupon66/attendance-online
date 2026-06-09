Attendance Online v3.2.8 - i18n Full Coverage Update

วิธีติดตั้ง
1) แตก zip นี้
2) วางไฟล์ทับโปรเจกต์เดิมตาม path เดิม
3) Commit/Push ขึ้น GitHub Pages
4) เปิดแอปแล้วกดรีโหลด 1-2 ครั้ง หรือ Clear site data ถ้า service worker ยัง cache ตัวเก่า

ไฟล์ที่อัปเดต
- src/core/i18n.js
- src/core/pwa.js
- src/app.js
- src/UI/shell.js
- service-worker.js

สิ่งที่แก้
- ขยายระบบแปลภาษาให้ครอบคลุมมากขึ้นทั้งเมนู ปุ่ม placeholder badge ตาราง สถานะ และข้อความแจ้งเตือน
- เพิ่มตัวแปลอัตโนมัติหลังโมดูล render เพื่อแก้ปัญหาข้อความที่สร้างทีหลังจาก Firebase/async ไม่ถูกแปล
- เพิ่มการแปลบางส่วนแบบ partial สำหรับข้อความที่มีตัวเลข/วันที่/ชื่อพนักงานผสมอยู่
- อัปเดตเมนูใหม่ที่เพิ่มภายหลัง เช่น เครื่องมือเวลา, ตำแหน่งบริษัท, ขอ OT, วันจ่ายเงินรายเดือน
- อัปเดตข้อความ PWA เช่น install banner, offline bar, update banner, notification permission และ payday notification
- อัปเดต service worker version เป็น 3.2.8-i18n-full-coverage เพื่อบังคับ cache ใหม่

หมายเหตุ
- ระบบนี้แปลเฉพาะข้อความ UI ที่ระบบสร้างเอง ไม่แปลชื่อพนักงาน เหตุผลที่พนักงานกรอก หรือข้อมูลจริงจากฐานข้อมูลโดยตั้งใจ
- ถ้าข้อความบางส่วนยังไม่แปล ให้แจ้งคำ/หน้าที่เจอมาได้ แล้วเพิ่ม dictionary ต่อได้ทันที
