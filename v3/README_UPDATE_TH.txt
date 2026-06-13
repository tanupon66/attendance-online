# Attendance v3.2.12 Brand Logo Update

แพตช์นี้อัปเดตโลโก้และภาพลักษณ์แบรนด์ของระบบ Attendance ให้เป็น **SHA Attendance**

## สิ่งที่อัปเดต
- เปลี่ยนชื่อแอปหลักเป็น SHA Attendance
- เปลี่ยนโลโก้บนหน้า Login / Loading / Sidebar / หน้า Offline
- อัปเดตไอคอน PWA สำหรับติดตั้งบนมือถือ
- อัปเดตชื่อใน Manifest และ Title ของเว็บ
- อัปเดต Service Worker เป็นเวอร์ชัน 3.2.12
- อัปเดต fallback title ของ Notification

## ไฟล์ที่แก้ไข
- index.html
- manifest.webmanifest
- service-worker.js
- firebase-messaging-sw.js
- src/app.js
- src/UI/shell.js
- src/core/i18n.js
- styles/main.css
- offline/index.html
- icons/icon-72.png
- icons/icon-96.png
- icons/icon-128.png
- icons/icon-144.png
- icons/icon-152.png
- icons/icon-180.png
- icons/icon-192.png
- icons/icon-384.png
- icons/icon-512.png
- icons/maskable-192.png
- icons/maskable-512.png

## วิธีติดตั้ง
1. แตกไฟล์ zip นี้
2. นำไฟล์ทั้งหมดไปวางทับในโปรเจกต์ Attendance เดิม
3. Commit และ Push ขึ้น GitHub Pages
4. บนมือถือ/เบราว์เซอร์ ให้รีเฟรช 1-2 ครั้ง หรือปิดแล้วเปิดแอปใหม่เพื่อให้ Service Worker โหลดเวอร์ชันใหม่
5. ถ้ายังเห็นโลโก้เก่า ให้ลบ cache/PWA เดิมแล้วติดตั้งใหม่อีกครั้ง
