# Attendance Online v3 - Step 7 Full Pack

## แก้หลัก
- ใช้โฟลเดอร์ `src/UI/shell.js` ตัวใหญ่ ตามโครง GitHub ของคุณ
- แยกหน้าที่ชัดเจน ไม่ทับกัน:
  - Dashboard = ภาพรวม
  - Notifications = แจ้งเตือน
  - Profile = ข้อมูลส่วนตัว/เปลี่ยน PIN

## เพิ่ม/ปรับปรุง
- Notification Center
  - Admin ส่งแจ้งเตือนไปยังคนเดียวหรือทุกคน
  - User ดูแจ้งเตือนของตัวเอง
  - Mark as read
  - ลบแจ้งเตือนที่อ่านแล้ว

- Dashboard
  - Admin เห็นพนักงาน, ลงเวลาวันนี้, ลารออนุมัติ, แจ้งเตือน
  - User เห็นสถานะตัวเอง

- Profile
  - แสดงข้อมูลพนักงาน
  - เปลี่ยน PIN ได้

- Payroll Slip + CSV
  - คำนวณจาก attendanceSummary
  - แสดงรายได้ฐาน หักสาย หักขาดงาน สุทธิ
  - ดู/พิมพ์ Slip
  - Export Payroll CSV

## วิธีอัปโหลด
อัปโหลดทุกไฟล์ใน ZIP นี้ทับโฟลเดอร์ `v3/`

เปิด:
https://tanupon66.github.io/attendance-online/v3/?v=7
