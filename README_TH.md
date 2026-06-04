# ระบบลงเวลาออนไลน์ PWA

โปรเจกต์นี้เป็นเว็บแอป PWA สำหรับพนักงานลงเวลาออนไลน์ผ่านมือถือ โดยบังคับถ่ายรูปหน้าตัวเอง, บันทึก GPS, ใช้เวลาเซิร์ฟเวอร์ของ Firebase และมีหน้าแอดมินสำหรับตรวจสอบ/จัดการข้อมูล

## ฟังก์ชันหลัก

### พนักงาน
- เข้าสู่ระบบด้วยรหัสพนักงาน + PIN
- เปิดกล้องหน้า
- ถ่ายรูปเซลฟี่ก่อนลงเวลา
- บันทึก GPS ตอนลงเวลา
- เข้างาน / ออกงาน / ลงเวลาอัตโนมัติ
- ดูประวัติของตัวเอง

### ผู้ดูแล
- สร้าง/แก้ไข/ปิดใช้งานพนักงาน
- ตั้ง PIN พนักงาน
- กำหนดสิทธิ์พนักงานหรือแอดมิน
- ดูภาพรวมวันนี้
- ดูรายการลงเวลาทั้งหมด
- เปิดแผนที่จากพิกัด
- ดูรูปถ่ายที่แนบกับรายการลงเวลา
- เพิ่มรายการแก้ไขเวลาโดยผู้ดูแล พร้อมเหตุผล
- เพิ่มวันหยุด
- ตั้งค่าพิกัดบริษัทและรัศมีอนุญาต
- คำนวณเงินเดือน, OT, มาสาย, หักสาย
- Export CSV
- Audit Log

---

# วิธีติดตั้งและใช้งานจากมือถือ

## ขั้นที่ 1: สร้าง Firebase Project

1. เข้า `console.firebase.google.com`
2. กด Add project / เพิ่มโปรเจกต์
3. ตั้งชื่อ เช่น `attendance-online`
4. สร้างโปรเจกต์ให้เสร็จ

## ขั้นที่ 2: เปิด Authentication

1. ไปที่เมนู Authentication
2. กด Get started
3. ไปที่ Sign-in method
4. เปิด Anonymous
5. กด Save

ระบบนี้ใช้ Anonymous Auth เพื่อให้เว็บแอปเชื่อม Firebase ได้ ส่วนการ login ของพนักงานใช้รหัสพนักงาน + PIN ที่ตรวจใน collection `employees`

## ขั้นที่ 3: เปิด Firestore Database

1. ไปที่ Firestore Database
2. กด Create database
3. เลือก Start in production mode หรือ test mode ก็ได้
4. เลือก region ที่ใกล้ เช่น asia-southeast1 ถ้ามีให้เลือก
5. สร้าง database

## ขั้นที่ 4: เปิด Storage

1. ไปที่ Storage
2. กด Get started
3. สร้าง bucket สำหรับเก็บรูปเซลฟี่

## ขั้นที่ 5: วาง Rules

เปิดไฟล์นี้ในโปรเจกต์:

```text
/docs/FIREBASE_RULES_STARTER.txt
```

แล้วนำ Firestore Rules ไปวางที่:

```text
Firebase Console > Firestore Database > Rules
```

นำ Storage Rules ไปวางที่:

```text
Firebase Console > Storage > Rules
```

จากนั้นกด Publish

## ขั้นที่ 6: เอาค่า Firebase Config มาใส่

1. ไปที่ Project settings
2. เลื่อนลงมาที่ Your apps
3. เพิ่ม Web app ถ้ายังไม่มี
4. คัดลอก Firebase SDK config
5. เปิดไฟล์ `firebase-config.js`
6. แทนค่า `YOUR_...` ด้วยค่าจริง

ตัวอย่าง:

```js
window.firebaseConfig = {
  apiKey: "xxxx",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123:web:abc"
};
```

## ขั้นที่ 7: อัปโหลดขึ้น GitHub

1. สร้าง repository ใหม่ใน GitHub
2. อัปโหลดไฟล์ทั้งหมดในโฟลเดอร์นี้ขึ้นไป
3. กด Commit changes

## ขั้นที่ 8: เปิด GitHub Pages

1. ไปที่ Settings ของ repository
2. ไปที่ Pages
3. Source เลือก Deploy from a branch
4. Branch เลือก `main`
5. Folder เลือก `/root`
6. กด Save
7. รอสักครู่ จะได้ลิงก์เว็บ เช่น

```text
https://ชื่อผู้ใช้.github.io/ชื่อ-repo/
```

## ขั้นที่ 9: ติดตั้งบนมือถือเหมือนแอป

1. เปิดลิงก์เว็บใน Chrome
2. กดเมนูจุดสามจุด
3. กด Add to Home screen / เพิ่มไปยังหน้าจอหลัก
4. จะมีไอคอนแอปบนหน้าจอมือถือ

---

# เริ่มใช้งานครั้งแรก

1. เปิดเว็บแอป
2. กดปุ่ม `สร้างแอดมินเริ่มต้น admin / admin123`
3. Login ด้วย:

```text
รหัส: admin
PIN: admin123
```

4. ไปที่เมนูพนักงาน
5. แก้ PIN แอดมินทันที
6. เพิ่มพนักงานจริง
7. ไปที่ตั้งค่า แล้วตั้งพิกัดบริษัท/รัศมี

---

# การอัปเดตเวอร์ชันใหม่

การอัปเดตง่ายมาก:

1. แก้ไฟล์ใน GitHub เช่น `app.js`, `styles.css`, `index.html`
2. กด Commit changes
3. GitHub Pages จะอัปเดตเว็บให้อัตโนมัติ
4. พนักงานเปิดแอปใหม่ก็จะได้เวอร์ชันล่าสุด

ถ้า service worker ยังจำ cache เก่า ให้เปิดแอปแล้วรีเฟรช หรือปิดเปิดใหม่อีกครั้ง

---

# หมายเหตุเรื่องความปลอดภัย

โปรเจกต์นี้เป็นเวอร์ชันเริ่มต้นที่ใช้งานง่ายจากมือถือ โดยใช้ Firebase Anonymous Auth + PIN hash ฝั่งแอป

สำหรับงานจริงที่มีข้อมูลสำคัญมาก ควรอัปเกรดต่อเป็น:

- Firebase Auth รายพนักงาน หรือ
- Cloud Functions สำหรับตรวจ PIN ฝั่ง server หรือ
- Supabase/Postgres พร้อม RLS ที่เข้มกว่า

ฟังก์ชันถ่ายรูป + GPS + server timestamp ช่วยตรวจสอบได้มาก แต่ไม่สามารถกันการโกงได้ 100% เช่น fake GPS หรือการถ่ายรูปหลอก หากต้องการเข้มขึ้นควรเพิ่ม face recognition/liveness detection
