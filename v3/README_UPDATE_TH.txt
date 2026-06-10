# Attendance v3.2.9 Benefits / Payroll Update

แพตช์นี้เพิ่มระบบสวัสดิการ/เงินเพิ่มรายพนักงาน และอัปเดต Payroll/Slip ให้คำนวณรวมอัตโนมัติ

## ไฟล์ที่เพิ่ม
- src/modules/benefits.js

## ไฟล์ที่อัปเดต
- src/app.js
- src/UI/shell.js
- src/modules/payroll.js
- src/core/i18n.js
- styles/main.css
- service-worker.js

## วิธีติดตั้ง
1. แตกไฟล์ zip นี้
2. คัดลอกไฟล์ทั้งหมดไปวางทับในโปรเจกต์เดิมตาม path เดิม
3. Commit / Push ขึ้น GitHub Pages
4. เปิดเว็บ แล้วกด Refresh หรือปิดเปิดแอป PWA ใหม่ เพื่อให้ service worker โหลดเวอร์ชันใหม่

## ฟีเจอร์ใหม่
### เมนูใหม่: สวัสดิการ
แอดมินสามารถเพิ่มสวัสดิการให้พนักงานเป็นรายคนได้ 3 แบบ:

1. คิดตามวันทำงาน
   - ตัวอย่าง: ค่าอาหาร 50 บาท/วัน
   - สูตร: จำนวนเงิน × จำนวนวันทำงานจริงในงวด Payroll
   - ใช้จำนวนวันจากสรุปรายวัน status PRESENT หรือ LATE

2. เงินบวกรายเดือน
   - ตัวอย่าง: ค่าเดินทาง 1,000 บาท/เดือน
   - บวก 1 ครั้งในงวด Payroll ถ้าช่วงวันที่ Payroll ยังอยู่ในช่วงวันที่มีผล

3. เงินพิเศษครั้งเดียว
   - ตัวอย่าง: โบนัสพิเศษ 2,000 บาท
   - บวกเฉพาะเมื่อวันที่เงินพิเศษอยู่ในช่วงงวด Payroll

## Payroll / Slip
- Payroll จะดึง collection benefits เฉพาะ employeeId ของแต่ละคนเท่านั้น
- แก้ไม่ให้สวัสดิการของคนอื่นถูกนำไปคิดรวมผิดคน
- Slip แสดงรายละเอียดสวัสดิการ เช่น ชื่อ, ประเภท, วิธีคำนวณ, จำนวนเงิน
- Export Payroll CSV เพิ่ม benefitCount, benefitPay, benefitDetails
- Export Slip CSV แยกรายการสวัสดิการเป็นบรรทัด

## Audit Log
ระบบบันทึก log:
- CREATE_EMPLOYEE_BENEFIT
- ENABLE_EMPLOYEE_BENEFIT
- DISABLE_EMPLOYEE_BENEFIT
- DELETE_EMPLOYEE_BENEFIT

## หมายเหตุ
หลังเพิ่ม/แก้สวัสดิการ ให้กลับไปหน้า Payroll แล้วกดคำนวณใหม่ สลิปจะอัปเดตตามรายการสวัสดิการที่อยู่ในงวดนั้น
