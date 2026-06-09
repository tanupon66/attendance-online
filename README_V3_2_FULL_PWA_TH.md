# Attendance Online v3.2 Full PWA

อัปเกรดจากไฟล์ต้นแบบที่อัปโหลด พร้อมเพิ่มระบบ PWA เต็มชุด

## เพิ่มใน v3.2
- Splash Screen
- Logo / App Icons Android + iPhone
- `manifest.webmanifest`
- Install App Popup อัตโนมัติ
- Offline Mode + Offline Page
- Auto Update Version Notice
- Push Notification พื้นฐาน
- Firebase Messaging Service Worker
- Background Sync Queue พื้นฐาน
- PWA CSS Banner
- เปิด route จาก shortcut ได้ เช่น `?route=clock`

## ไฟล์สำคัญที่เพิ่ม
- `manifest.webmanifest`
- `service-worker.js`
- `firebase-messaging-sw.js`
- `src/core/pwa.js`
- `icons/`
- `offline/index.html`

## วิธีอัปโหลด
อัปโหลดไฟล์ทั้งหมดใน ZIP นี้ทับโฟลเดอร์:

`v3/`

## เปิดทดสอบ
https://tanupon66.github.io/attendance-online/v3/?v=3.2full

## วิธีติดตั้งบนมือถือ
Android Chrome:
1. เปิดเว็บ
2. รอ Popup ติดตั้ง หรือกดเมนู ⋮
3. เลือก Install App / Add to Home Screen

iPhone Safari:
1. เปิดเว็บด้วย Safari
2. กด Share
3. Add to Home Screen

## หมายเหตุ Push Notification
ระบบนี้เพิ่ม permission และ service worker ให้แล้ว
ถ้าต้องการส่ง Push จริงจาก Server ต้องตั้งค่า Firebase Cloud Messaging เพิ่ม เช่น VAPID key และ Cloud Functions/Server sender
