# Attendance Online v2.7

เวอร์ชันนี้เพิ่ม:

- โหมดพื้นที่ลงเวลา: อนุญาตทุกที่ / เตือนเมื่อนอกพื้นที่ / บังคับอยู่ในพื้นที่เท่านั้น
- Dashboard วันนี้แบบละเอียดขึ้น: มาทำงาน, มาสาย, ขาดงาน, ข้อมูลไม่ครบ, ลา, นอกพื้นที่, รออนุมัติ
- ระบบแจ้งเตือนจาก Admin ไปยัง User
- User เห็นประวัติแจ้งเตือนและลบแจ้งเตือนออกจากหน้าตัวเองได้
- Admin เห็นประวัติแจ้งเตือนและลบแจ้งเตือนจากระบบได้
- ถ้าลงเวลานอกพื้นที่ในโหมดเตือน ระบบจะบันทึกได้ แต่สร้างแจ้งเตือนให้พนักงานด้วย

## วิธีอัปเดต

อัปโหลดไฟล์ทั้งหมดใน ZIP ทับในโฟลเดอร์ `v2/`

ระวังไฟล์ `firebase-config.js` ถ้าทับแล้วให้ใส่ Firebase config จริงกลับเข้าไป

หลังอัปโหลดเปิด:

https://tanupon66.github.io/attendance-online/v2/?v=27

ถ้ายังเห็นของเก่าให้ใช้ `?v=28` หรือเคลียร์ข้อมูลเว็บใน Chrome

## Collection ใหม่

v2.7 ใช้ collection เพิ่ม:

- notifications

Firestore Rules สำหรับทดสอบ:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }
    match /{document=**} {
      allow read, write, create, update, delete: if signedIn();
    }
  }
}
```
