const LANG_KEY = "attendance_v3_lang";

const DICT = {
  th: {
    appName:"SHA Attendance", dashboard:"ภาพรวม", employees:"พนักงาน", attendance:"ลงเวลา", summary:"สรุปรายวัน", leave:"วันลา", calendar:"ปฏิทิน", payroll:"Payroll", profile:"โปรไฟล์", settings:"ตั้งค่า", logout:"ออก", notifications:"แจ้งเตือน", login:"เข้าสู่ระบบ", employeeCode:"รหัสพนักงาน", pin:"PIN",
    attendanceTools:"เครื่องมือเวลา", geofenceSettings:"ตำแหน่งบริษัท", requestOT:"ขอ OT", monthlyPayday:"วันจ่ายเงินพนักงานรายเดือน", benefits:"สวัสดิการ"
  },
  my: {
    appName:"SHA Attendance", dashboard:"ခြုံငုံကြည့်ရန်", employees:"ဝန်ထမ်းများ", attendance:"အချိန်မှတ်တမ်း", summary:"နေ့စဉ် အကျဉ်းချုပ်", leave:"ခွင့်", calendar:"ပြက္ခဒိန်", payroll:"လစာ", profile:"ပရိုဖိုင်", settings:"ဆက်တင်", logout:"ထွက်မည်", notifications:"အသိပေးချက်", login:"ဝင်ရောက်ရန်", employeeCode:"ဝန်ထမ်းကုဒ်", pin:"PIN",
    attendanceTools:"အချိန်ကိရိယာများ", geofenceSettings:"ကုမ္ပဏီတည်နေရာ", requestOT:"OT တောင်းဆိုရန်", monthlyPayday:"လစဉ်ဝန်ထမ်း လစာပေးရက်", benefits:"ခံစားခွင့်များ"
  },
  en: {
    appName:"SHA Attendance", dashboard:"Dashboard", employees:"Employees", attendance:"Attendance", summary:"Daily Summary", leave:"Leave", calendar:"Calendar", payroll:"Payroll", profile:"Profile", settings:"Settings", logout:"Logout", notifications:"Notifications", login:"Login", employeeCode:"Employee Code", pin:"PIN",
    attendanceTools:"Attendance Tools", geofenceSettings:"Company Location", requestOT:"Request OT", monthlyPayday:"Monthly payday", benefits:"Benefits"
  }
};

const STATIC_TRANSLATIONS = {
  en: {
    "กำลังโหลดระบบ...":"Loading system...", "Step 7 Full Pack":"Step 7 Full Pack", "Enterprise v3":"Enterprise v3",
    "สร้างแอดมินเริ่มต้น":"Create initial admin", "admin หรือ 001":"admin or 001", "กรุณากรอกข้อมูล":"Please fill in all fields", "ไม่พบรหัสพนักงาน":"Employee code not found", "บัญชีนี้ถูกปิดใช้งาน":"This account is disabled", "PIN ไม่ถูกต้อง":"Incorrect PIN", "เข้าสู่ระบบไม่สำเร็จ":"Login failed", "ออกจากระบบแล้ว":"Logged out", "โหลดบัญชีไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่":"Could not load account. Please log in again", "บัญชีถูกปิด":"Account disabled", "มีแอดมินอยู่แล้ว":"Admin already exists", "สร้างแอดมินสำเร็จ":"Admin created successfully",
    "เครื่องมือเวลา":"Attendance Tools", "ตำแหน่งบริษัท":"Company Location", "ชื่อบริษัท":"Company Name", "พนักงานใช้งาน":"Active employees", "คนลงเวลาวันนี้":"People clocked today", "ขาดงานวันนี้":"Absent today", "ลาวันนี้":"On leave today", "ข้อมูลไม่ครบ":"Incomplete", "ขอ OT":"Request OT", "ขออนุญาต OT":"Request OT Approval", "ส่งคำขอทำงานล่วงเวลาให้แอดมินอนุมัติ":"Send an overtime request for admin approval", "คำขอ OT ของฉัน":"My OT Requests", "รายการขอ OT":"OT Requests", "อนุมัติหรือปฏิเสธคำขอของพนักงาน":"Approve or reject employee requests", "อนุมัติ OT • เพิ่มเวลาเข้าออกงาน • ตรวจ log • เคลียร์ข้อมูล":"Approve OT • Add attendance time • Check logs • Clear data",
    "โหลด":"Load", "โหลดใหม่":"Reload", "กำลังโหลด...":"Loading...", "ยังไม่มีคำขอ OT":"No OT requests yet", "ไม่พบคำขอ OT":"No OT requests found", "ส่งคำขอ OT สำเร็จ":"OT request sent", "เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม":"End time must be after start time", "เช่น ปิดงานด่วน / รองานลูกค้า":"e.g. urgent task / waiting for customer", "รออนุมัติ":"Pending", "อนุมัติแล้ว":"Approved", "ปฏิเสธ":"Rejected", "อนุมัติ":"Approve", "ไม่อนุมัติ":"Reject", "โดย":"By",
    "ลงเวลา":"Attendance", "รายการลงเวลา":"Attendance Records", "รายละเอียดการลงเวลา":"Attendance Details", "เปิดกล้อง":"Open Camera", "ถ่ายรูป + GPS":"Take Photo + GPS", "เข้างาน":"Clock In", "ออกงาน":"Clock Out", "ประวัติวันนี้":"Today History", "ทุกสถานะ":"All Statuses", "รออนุมัตินอกพื้นที่":"Pending out-of-area approval", "พนักงานคนนี้ต้องลงเวลาในรัศมี":"This employee must clock within the radius", "พนักงานคนนี้ไม่ถูกบังคับรัศมี":"This employee is not restricted by radius", "แอดมินยังไม่ได้ตั้งค่าพิกัดบริษัท":"Admin has not set company coordinates", "อุปกรณ์นี้ไม่รองรับ GPS":"This device does not support GPS", "ไม่ได้รับอนุญาตตำแหน่ง":"Location permission denied", "กรุณาเปิดกล้องก่อน":"Please open the camera first", "ถ่ายรูปและดึงตำแหน่งแล้ว":"Photo and location captured", "ต้องถ่ายรูปก่อนลงเวลา":"Please take a photo before clocking", "บันทึกแล้ว แต่คุณอยู่นอกรัศมี ต้องรอแอดมินอนุมัติ":"Saved, but you are outside the allowed radius. Admin approval is required", "บันทึกสำเร็จ":"Saved successfully", "วันนี้ยังไม่มีรายการ":"No records today", "ไม่พบข้อมูล":"No data found", "นอกพื้นที่":"Outside area", "ในพื้นที่":"Inside area", "ไม่ตรวจ":"Not checked", "ไม่มีรูป":"No photo", "นำไปใช้ได้":"Usable", "ใช่":"Yes", "ไม่ใช่":"No", "วันที่/เวลา":"Date/Time", "ขอบเขตบริษัท":"Company Boundary", "แผนที่":"Map", "เปิด Google Maps":"Open Google Maps", "สถานะ":"Status", "บังคับรัศมี":"Radius required",
    "พนักงาน":"Employees", "ค้นหารหัส ชื่อ แผนก...":"Search code, name, department...", "ใส่เมื่อต้องการเปลี่ยน PIN":"Fill only to change PIN", "รายเดือน":"Monthly", "รายวัน":"Daily", "รายชั่วโมง":"Hourly", "ใช้งาน":"Active", "เปิด":"On", "ปิด":"Off", "ไม่มีข้อมูล":"No data", "กรอกข้อมูล":"Please fill in data", "พนักงานใหม่ต้องมี PIN":"New employee must have a PIN", "เลือกพนักงาน":"Select employee", "กำลังโหลดพนักงาน...":"Loading employees...", "ยังไม่มีพนักงาน":"No employees yet", "กรุณาเลือกพนักงาน":"Please select an employee",
    "สรุปรายวัน":"Daily Summary", "ปกติ":"Present", "มาสาย":"Late", "ขาดงาน":"Absent", "ข้อมูลไม่ครบ":"Incomplete", "ลาจ่ายเงิน":"Paid Leave", "ลาไม่จ่ายเงิน":"Unpaid Leave", "วันหยุดจ่ายเงิน":"Paid Holiday", "วันหยุดไม่จ่ายเงิน":"Unpaid Holiday", "วันหยุดเปิด OT":"OT Holiday", "ไม่มีตารางทำงาน":"No Work Schedule", "พิมพ์ CLEAR เพื่อยืนยัน":"Type CLEAR to confirm", "กรุณาเลือกวันที่เริ่มต้นและวันที่สิ้นสุด":"Please select start and end dates", "วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด":"Start date must not be after end date", "กรุณาพิมพ์ CLEAR เพื่อยืนยันการลบ":"Please type CLEAR to confirm deletion", "กำลังเคลียร์ข้อมูลสรุปรายวัน...":"Clearing daily summary data...", "เคลียร์ข้อมูลไม่สำเร็จ":"Failed to clear data", "กำลังคำนวณ...":"Calculating...", "คำนวณไม่สำเร็จ":"Calculation failed", "คำนวณสำเร็จ":"Calculated successfully", "ยังไม่มีสรุป":"No summary yet", "กด “คำนวณ/สร้างสรุป” ก่อน":"Click “Calculate/Create Summary” first", "ทั้งหมด":"Total", "ลา":"Leave", "เข้า":"In", "ออก":"Out", "สุทธิ":"Net", "สาย":"Late", "นาที":"min", "ชม.":"hrs", "ไม่นับ":"Ignored",

    "สวัสดิการ":"Benefits", "สวัสดิการ / เงินเพิ่ม":"Benefits / Allowances", "เพิ่มสวัสดิการให้พนักงาน":"Add employee benefit", "รายการสวัสดิการของพนักงาน":"Employee benefit list", "คิดตามวันทำงาน":"Per workday", "เงินบวกรายเดือน":"Fixed monthly allowance", "เงินพิเศษครั้งเดียว":"One-time bonus", "เงินพิเศษ":"Bonus", "ชื่อสวัสดิการ / เงินเพิ่ม":"Benefit / allowance name", "ประเภทการคิดเงิน":"Calculation type", "จำนวนเงิน":"Amount", "วันที่เริ่มใช้":"Effective start date", "วันที่สิ้นสุด (ไม่บังคับ)":"End date (optional)", "วันที่จ่ายเงินพิเศษ":"Bonus payment date", "เปิดใช้งานรายการนี้":"Enable this item", "บันทึกสวัสดิการ":"Save benefit", "โหลดรายการใหม่":"Reload list", "ค้นหาชื่อพนักงาน / รหัส / สวัสดิการ":"Search employee, code, or benefit", "เฉพาะที่เปิดใช้งาน":"Active only", "ทั้งหมด":"All", "เฉพาะที่ปิดใช้งาน":"Inactive only", "เปิดใช้งาน":"Active", "ปิดใช้งาน":"Inactive", "ลบรายการ":"Delete item", "กรุณากรอกชื่อสวัสดิการ":"Please enter benefit name", "กรุณากรอกจำนวนเงินมากกว่า 0":"Please enter an amount greater than 0", "กรุณาเลือกวันที่จ่ายเงินพิเศษ":"Please select bonus payment date", "กรุณาเลือกวันที่เริ่มใช้":"Please select effective start date", "วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มใช้":"End date must not be before start date", "กำลังบันทึกสวัสดิการ...":"Saving benefit...", "บันทึกสวัสดิการสำเร็จ Payroll จะนำไปคิดเมื่อคำนวณงวดที่ตรงกับวันที่":"Benefit saved. Payroll will include it when calculating the matching period", "ยังไม่มีรายการสวัสดิการ":"No benefits yet", "ต้องการลบรายการสวัสดิการนี้ใช่หรือไม่?":"Delete this benefit item?", "ลบรายการสวัสดิการแล้ว":"Benefit deleted", "ปิดใช้งานสวัสดิการแล้ว":"Benefit disabled", "เปิดใช้งานสวัสดิการแล้ว":"Benefit enabled", "รายละเอียดสวัสดิการ/เงินเพิ่ม":"Benefit/allowance details", "ไม่มีสวัสดิการ/เงินเพิ่มในงวดนี้":"No benefits/allowances in this period",
    "Payroll":"Payroll", "ดู/พิมพ์ Slip":"View/Print Slip", "ดู Slip รายเดือน":"View Monthly Slip", "รายเดือนดูรายละเอียดได้ แต่ระบบปิดการพิมพ์เป็นค่าเริ่มต้น":"Monthly employees can view details, but printing is disabled by default", "พนักงานรายเดือน: ดูรายละเอียดได้ แต่ปิดพิมพ์ตามระบบ":"Monthly employee: details available, printing disabled by system", "พิมพ์ Slip":"Print Slip", "รายได้ฐาน":"Base Pay", "สวัสดิการ/เงินเพิ่ม":"Benefits/Allowances", "OT อนุมัติ":"Approved OT", "หักมาสาย":"Late Deduction", "หักขาดงาน":"Absent Deduction", "หักลาไม่จ่ายเงิน":"Unpaid Leave Deduction", "หักเงินเพิ่มเติม":"Additional Deductions", "สุทธิ":"Net Pay", "รายละเอียด OT อนุมัติแล้ว":"Approved OT Details", "ไม่มี OT ที่อนุมัติในงวดนี้":"No approved OT in this period", "รายละเอียดรายการหักเงิน":"Deduction Details", "ไม่มีรายการหักเงินเพิ่มเติมในงวดนี้":"No additional deductions in this period", "เช่น 500":"e.g. 500", "เช่น เบิกเงินล่วงหน้า / ค่าปรับมาสาย":"e.g. cash advance / late penalty", "กรุณาเลือกวันที่หัก":"Please select deduction date", "กรุณากรอกจำนวนเงินที่หักมากกว่า 0":"Please enter a deduction amount greater than 0", "กรุณากรอกเหตุผลที่หักเงิน":"Please enter the reason for deduction", "กำลังบันทึกรายการหักเงิน...":"Saving deduction...", "บันทึกรายการหักเงินสำเร็จ และกำลังคำนวณ Payroll ใหม่":"Deduction saved. Recalculating payroll...", "บันทึกไม่สำเร็จ":"Save failed", "ยังไม่มีรายการหักเงินในงวดนี้":"No deductions in this period", "ต้องการลบ/ยกเลิกรายการหักเงินนี้ใช่หรือไม่?":"Delete/cancel this deduction?", "ยกเลิกรายการหักเงินแล้ว และคำนวณ Payroll ใหม่แล้ว":"Deduction canceled and payroll recalculated", "ลบ/ยกเลิกรายการไม่สำเร็จ":"Delete/cancel failed", "กรุณาเลือกช่วงวันที่ให้ถูกต้อง":"Please select a valid date range", "กำลังสร้างสรุปรายวันใหม่จากรายการลงเวลา...":"Rebuilding daily summary from attendance records...", "สร้างสรุปใหม่ไม่สำเร็จ":"Failed to rebuild summary", "ยังไม่มีข้อมูลในช่วงวันที่นี้":"No data in this date range", "ยังไม่มีข้อมูล Payroll ถ้าพึ่งแก้เวลา ให้กด “สร้างสรุปรายวันใหม่ก่อนคำนวณ”":"No payroll data yet. If time was just edited, click “Rebuild Daily Summary before Calculate”",
    "วันลา":"Leave", "คำขอลาทั้งหมด":"All Leave Requests", "ประวัติวันลาของฉัน":"My Leave History", "ลากิจ":"Personal Leave", "ลาป่วย":"Sick Leave", "ลาพักร้อน":"Vacation Leave", "ลาไม่จ่ายเงิน":"Unpaid Leave", "เต็มวัน":"Full Day", "ครึ่งวัน":"Half Day", "ไม่จำกัด":"Unlimited", "ไม่ใช้โควตา":"No quota used", "กรอกรหัสพนักงาน":"Enter employee code", "ไม่พบพนักงาน":"Employee not found", "บันทึกสิทธิ์วันลาแล้ว":"Leave quota saved", "เลือกวันที่":"Select date", "จำนวนชั่วโมงต้องมากกว่า 0":"Hours must be greater than 0", "ส่งคำขอลาแล้ว":"Leave request sent", "ยังไม่มีข้อมูล":"No data yet", "คำขอลาอนุมัติแล้ว":"Leave approved", "คำขอลาถูกปฏิเสธ":"Leave rejected",
    "ปฏิทิน":"Calendar", "วันทำงาน":"Workday", "กิจกรรม":"Event", "วันจ่ายเงิน":"Payday", "วันจ่ายเงินพนักงานรายเดือน":"Monthly payday", "บันทึก":"Save", "วันทำงาน = คิดงานปกติ":"Workday = normal working day", "ยังไม่เปิดวันจ่ายเงินรายเดือน":"Monthly payday not enabled", "วันอาทิตย์":"Sunday", "เลือกวันที่ก่อน":"Select a date first", "บันทึกปฏิทินแล้ว":"Calendar saved", "ลบรายการปฏิทินวันนี้?":"Delete today’s calendar item?", "ลบแล้ว":"Deleted", "อา":"Sun", "จ":"Mon", "อ":"Tue", "พ":"Wed", "พฤ":"Thu", "ศ":"Fri", "ส":"Sat",
    "ชื่อบริษัท":"Company Name", "บริษัท ABC จำกัด":"ABC Co., Ltd.", "สำนักงานใหญ่":"Head Office", "เช่น สำนักงานใหญ่ / โกดังบางนา":"e.g. Head Office / Bangna Warehouse", "รัศมีต้องมากกว่า 10 เมตร":"Radius must be more than 10 meters", "บันทึกตำแหน่งบริษัทสำเร็จ":"Company location saved", "กำลังดึงตำแหน่งปัจจุบัน...":"Getting current location...", "วันที่จ่ายเงินต้องอยู่ระหว่าง 1-31":"Payday must be between 1 and 31", "แจ้งเตือนล่วงหน้าได้ 0-7 วัน":"Reminder can be 0–7 days before", "บันทึกวันจ่ายเงินแล้ว ปฏิทินจะอัปเดตตามเดือนที่เลือก":"Payday saved. Calendar will update by selected month", "ยังไม่เปิดใช้วันจ่ายเงิน":"Payday is not enabled yet", "เดือนนี้จะแสดงในปฏิทินวันที่":"This month will show on calendar date", "แจ้งเตือนล่วงหน้า":"Notify before", "วัน":"day(s)", "หมายเหตุ: ถ้าตรงกับวันทำงาน ระบบจะยังนับเป็นวันทำงานปกติ แต่เพิ่มป้าย/แจ้งเตือนวันจ่ายเงินเท่านั้น":"Note: If it falls on a workday, it remains a normal workday; only a payday badge/notification is added", "เครื่องนี้ไม่รองรับ Notification":"This device does not support notifications", "ยังไม่ได้อนุญาตแจ้งเตือนบนเครื่องนี้":"Notifications are not allowed on this device", "ทดสอบแจ้งเตือนวันจ่ายเงินจาก Attendance Online":"Test payday notification from Attendance Online", "ส่งแจ้งเตือนทดสอบแล้ว ถ้าไม่เห็นให้ตรวจสิทธิ์แจ้งเตือนของเบราว์เซอร์/แอป":"Test notification sent. If it does not appear, check browser/app notification permission", "บังคับในรัศมี":"Require radius", "ไม่บังคับรัศมี":"No radius requirement", "ยังไม่ได้ตั้งค่าพิกัดบริษัท":"Company coordinates not set yet", "รัศมีที่อนุญาต":"Allowed radius", "เมตร":"meters",
    "แจ้งเตือน":"Notifications", "+ ส่งแจ้งเตือน":"+ Send Notification", "เว้นว่าง = ทุกคน":"Leave blank = everyone", "กรอกหัวข้อและข้อความ":"Enter title and message", "ส่งแจ้งเตือนแล้ว":"Notification sent", "ยังไม่มีแจ้งเตือน":"No notifications yet", "อ่านแล้ว":"Read", "ใหม่":"New", "ลบ":"Delete",
    "โปรไฟล์":"Profile", "สิทธิ์":"Role", "วิธีจ่าย":"Pay Type", "กะงาน":"Shift", "PIN ใหม่":"New PIN", "ยืนยัน PIN":"Confirm PIN", "PIN ต้องมีอย่างน้อย 4 ตัว":"PIN must be at least 4 digits", "PIN ไม่ตรงกัน":"PINs do not match", "เปลี่ยน PIN สำเร็จ":"PIN changed successfully",
    "ติดตั้ง SHA Attendance เป็นแอป":"Install SHA Attendance as an app", "เปิดได้จากหน้าจอมือถือ ใช้งานเร็วขึ้น และรองรับ Offline":"Open from your home screen, faster and supports offline", "ติดตั้ง":"Install", "ออฟไลน์: ข้อมูลใหม่จะบันทึกไม่ได้จนกว่าจะมีอินเทอร์เน็ต":"Offline: new data cannot be saved until internet is available", "มีเวอร์ชันใหม่พร้อมใช้งาน":"A new version is ready", "รีโหลด":"Reload", "เปิดแจ้งเตือนบนเครื่องนี้แล้ว":"Notifications enabled on this device", "มีแจ้งเตือนใหม่":"New notification", "วันนี้เป็น":"Today is "
  },
  my: {
    "กำลังโหลดระบบ...":"စနစ်ကို ဖွင့်နေသည်...", "สร้างแอดมินเริ่มต้น":"အစပြု Admin ဖန်တီးရန်", "admin หรือ 001":"admin သို့မဟုတ် 001", "กรุณากรอกข้อมูล":"အချက်အလက်ဖြည့်ပါ", "ไม่พบรหัสพนักงาน":"ဝန်ထမ်းကုဒ် မတွေ့ပါ", "บัญชีนี้ถูกปิดใช้งาน":"ဤအကောင့်ကို ပိတ်ထားသည်", "PIN ไม่ถูกต้อง":"PIN မမှန်ပါ", "ออกจากระบบแล้ว":"ထွက်ပြီးပါပြီ",
    "เครื่องมือเวลา":"အချိန်ကိရိယာများ", "ตำแหน่งบริษัท":"ကုမ္ပဏီတည်နေရာ", "ชื่อบริษัท":"ကုမ္ပဏီအမည်", "พนักงานใช้งาน":"အသုံးပြုနေသော ဝန်ထမ်း", "คนลงเวลาวันนี้":"ယနေ့ အချိန်မှတ်တမ်းရှိသူ", "ขาดงานวันนี้":"ယနေ့ ပျက်ကွက်", "ลาวันนี้":"ယနေ့ ခွင့်", "ขอ OT":"OT တောင်းဆိုရန်", "ขออนุญาต OT":"OT ခွင့်ပြုချက်တောင်းရန်", "ส่งคำขอทำงานล่วงเวลาให้แอดมินอนุมัติ":"အချိန်ပိုတောင်းဆိုချက်ကို Admin အတည်ပြုရန် ပို့ပါ", "คำขอ OT ของฉัน":"ကျွန်ုပ်၏ OT တောင်းဆိုချက်များ", "รายการขอ OT":"OT တောင်းဆိုချက်များ", "อนุมัติ":"အတည်ပြု", "ไม่อนุมัติ":"ငြင်းပယ်", "ปฏิเสธ":"ငြင်းပယ်", "รออนุมัติ":"စောင့်ဆိုင်း", "อนุมัติแล้ว":"အတည်ပြုပြီး", "โหลด":"တင်ရန်", "โหลดใหม่":"ပြန်တင်ရန်", "กำลังโหลด...":"တင်နေသည်...", "ไม่มีข้อมูล":"အချက်အလက်မရှိပါ", "ไม่พบข้อมูล":"အချက်အလက်မတွေ့ပါ", "บันทึก":"သိမ်းရန်", "บันทึกสำเร็จ":"သိမ်းပြီးပါပြီ", "ปิด":"ပိတ်", "เปิด":"ဖွင့်",
    "ลงเวลา":"အချိန်မှတ်တမ်း", "รายการลงเวลา":"အချိန်မှတ်တမ်းများ", "รายละเอียดการลงเวลา":"အချိန်မှတ်တမ်းအသေးစိတ်", "เปิดกล้อง":"ကင်မရာဖွင့်", "ถ่ายรูป + GPS":"ဓာတ်ပုံ + GPS", "เข้างาน":"အလုပ်ဝင်", "ออกงาน":"အလုပ်ဆင်း", "ประวัติวันนี้":"ယနေ့မှတ်တမ်း", "ทุกสถานะ":"အခြေအနေအားလုံး", "รออนุมัตินอกพื้นที่":"နယ်ပယ်ပြင်ပ အတည်ပြုရန်စောင့်နေသည်", "ในพื้นที่":"နယ်ပယ်အတွင်း", "นอกพื้นที่":"နယ်ပယ်ပြင်ပ", "ไม่มีรูป":"ဓာတ်ပုံမရှိ", "ใช่":"ဟုတ်", "ไม่ใช่":"မဟုတ်", "สถานะ":"အခြေအနေ", "แผนที่":"မြေပုံ", "เปิด Google Maps":"Google Maps ဖွင့်ရန်",
    "พนักงาน":"ဝန်ထမ်းများ", "เลือกพนักงาน":"ဝန်ထမ်းရွေးပါ", "ไม่พบพนักงาน":"ဝန်ထမ်းမတွေ့ပါ", "รายเดือน":"လစဉ်", "รายวัน":"နေ့စား", "รายชั่วโมง":"နာရီစား", "ใช้งาน":"အသုံးပြုနေသည်", "ค้นหารหัส ชื่อ แผนก...":"ကုဒ်၊ နာမည်၊ ဌာန ရှာရန်...",
    "สรุปรายวัน":"နေ့စဉ်အကျဉ်းချုပ်", "ปกติ":"ပုံမှန်", "มาสาย":"နောက်ကျ", "ขาดงาน":"ပျက်ကွက်", "ข้อมูลไม่ครบ":"မပြည့်စုံ", "ลาจ่ายเงิน":"လစာပါခွင့်", "ลาไม่จ่ายเงิน":"လစာမပါခွင့်", "วันหยุดจ่ายเงิน":"လစာပါပိတ်ရက်", "วันหยุดไม่จ่ายเงิน":"လစာမပါပိတ်ရက်", "วันหยุดเปิด OT":"OT ဖွင့်သောပိတ်ရက်", "ทั้งหมด":"စုစုပေါင်း", "ลา":"ခွင့်", "เข้า":"ဝင်", "ออก":"ဆင်း", "สุทธิ":"အသားတင်", "สาย":"နောက်ကျ", "นาที":"မိနစ်", "ชม.":"နာရီ",
    "Payroll":"လစာ", "ดู/พิมพ์ Slip":"Slip ကြည့်/ပုံနှိပ်", "ดู Slip รายเดือน":"လစဉ် Slip ကြည့်", "พิมพ์ Slip":"Slip ပုံနှိပ်", "รายได้ฐาน":"အခြေခံလစာ", "สวัสดิการ/เงินเพิ่ม":"ထောက်ပံ့ငွေ/ထပ်တိုး", "OT อนุมัติ":"အတည်ပြုပြီး OT", "หักมาสาย":"နောက်ကျဖြတ်ငွေ", "หักขาดงาน":"ပျက်ကွက်ဖြတ်ငွေ", "หักลาไม่จ่ายเงิน":"လစာမပါခွင့်ဖြတ်ငွေ", "หักเงินเพิ่มเติม":"ထပ်ဆောင်းဖြတ်ငွေ", "รายละเอียด OT อนุมัติแล้ว":"အတည်ပြုပြီး OT အသေးစိတ်", "รายละเอียดรายการหักเงิน":"ဖြတ်ငွေစာရင်းအသေးစိတ်",
    "วันลา":"ခွင့်", "คำขอลาทั้งหมด":"ခွင့်တောင်းဆိုချက်အားလုံး", "ประวัติวันลาของฉัน":"ကျွန်ုပ်၏ ခွင့်မှတ်တမ်း", "ลากิจ":"ကိုယ်ရေးခွင့်", "ลาป่วย":"ဖျားနာခွင့်", "ลาพักร้อน":"အနားယူခွင့်", "เต็มวัน":"တစ်နေ့လုံး", "ครึ่งวัน":"နေ့တစ်ဝက်", "รายชั่วโมง":"နာရီအလိုက်", "ส่งคำขอลาแล้ว":"ခွင့်တောင်းဆိုချက် ပို့ပြီးပါပြီ",
    "ปฏิทิน":"ပြက္ခဒိန်", "วันทำงาน":"အလုပ်နေ့", "กิจกรรม":"အစီအစဉ်", "วันจ่ายเงิน":"လစာပေးရက်", "วันจ่ายเงินพนักงานรายเดือน":"လစဉ်ဝန်ထမ်း လစာပေးရက်", "วันทำงาน = คิดงานปกติ":"အလုပ်နေ့ = ပုံမှန်အလုပ်နေ့", "ยังไม่เปิดวันจ่ายเงินรายเดือน":"လစဉ်လစာပေးရက် မဖွင့်ရသေး", "เลือกวันที่ก่อน":"နေ့စွဲရွေးပါ", "บันทึกปฏิทินแล้ว":"ပြက္ခဒိန် သိမ်းပြီးပါပြီ", "วันอาทิตย์":"တနင်္ဂနွေ", "อา":"နွေ", "จ":"လာ", "อ":"ဂါ", "พ":"ဟူး", "พฤ":"ကြာ", "ศ":"သော", "ส":"နေ",
    "สำนักงานใหญ่":"ရုံးချုပ်", "วันจ่ายเงินพนักงานรายเดือน":"လစဉ်ဝန်ထမ်း လစာပေးရက်", "บันทึกตำแหน่งบริษัทสำเร็จ":"ကုမ္ပဏီတည်နေရာ သိမ်းပြီးပါပြီ", "กำลังดึงตำแหน่งปัจจุบัน...":"လက်ရှိတည်နေရာ ရယူနေသည်...", "บังคับในรัศมี":"အချင်းဝက်အတွင်းသာ", "ไม่บังคับรัศมี":"အချင်းဝက် မကန့်သတ်", "เมตร":"မီတာ", "แจ้งเตือนล่วงหน้า":"ကြိုတင်အသိပေး", "วัน":"ရက်",
    "แจ้งเตือน":"အသိပေးချက်", "+ ส่งแจ้งเตือน":"+ အသိပေးချက်ပို့ရန်", "เว้นว่าง = ทุกคน":"လွတ်ထားပါ = အားလုံး", "ยังไม่มีแจ้งเตือน":"အသိပေးချက်မရှိသေး", "อ่านแล้ว":"ဖတ်ပြီး", "ใหม่":"အသစ်", "ลบ":"ဖျက်",
    "โปรไฟล์":"ပရိုဖိုင်", "สิทธิ์":"Role", "วิธีจ่าย":"လစာအမျိုးအစား", "กะงาน":"Shift", "PIN ใหม่":"PIN အသစ်", "ยืนยัน PIN":"PIN အတည်ပြု", "เปลี่ยน PIN สำเร็จ":"PIN ပြောင်းပြီးပါပြီ",
    "ติดตั้ง SHA Attendance เป็นแอป":"SHA Attendance ကို App အဖြစ် ထည့်သွင်းရန်", "ติดตั้ง":"ထည့်သွင်း", "ออฟไลน์: ข้อมูลใหม่จะบันทึกไม่ได้จนกว่าจะมีอินเทอร์เน็ต":"Offline: အင်တာနက်ရှိမှ အချက်အလက်အသစ် သိမ်းနိုင်ပါမည်", "มีเวอร์ชันใหม่พร้อมใช้งาน":"ဗားရှင်းအသစ် ရရှိပါပြီ", "รีโหลด":"ပြန်ဖွင့်", "วันนี้เป็น":"ယနေ့သည် "
  }
};

const PARTIAL_TRANSLATIONS = {
  en: [
    ["ผิดพลาด:", "Error:"], ["บันทึกไม่สำเร็จ:", "Save failed:"], ["ดึงตำแหน่งไม่ได้:", "Could not get location:"], ["โหลดรายการหักเงินไม่สำเร็จ:", "Could not load deductions:"],
    ["รายการหักเงินในงวดนี้", "Deductions in this period"], ["รายการ", "items"], ["รวม", "total"], ["บาท", "THB"], ["วันที่", "Date"], ["เหตุผล", "Reason"], ["จำนวน", "Amount"],
    ["เดือนนี้จะแสดงในปฏิทินวันที่:", "This month will show on calendar date:"], ["แจ้งเตือนล่วงหน้า:", "Notify before:"], ["รัศมีที่อนุญาต:", "Allowed radius:"], ["ระยะห่าง:", "Distance:"], ["รัศมี:", "Radius:"], ["ห่างบริษัท", "from company"], ["ในพื้นที่", "inside area"], ["นอกพื้นที่", "outside area"], ["นำไปใช้ได้:", "Usable:"],
    ["สร้างสรุปรายวันใหม่สำเร็จ", "Daily summary rebuilt"], ["อัปเดตสรุปรายวันและ Payroll สำเร็จ", "Daily summary and payroll updated"], ["พบข้อมูล", "Found"], ["คน", "people"], ["OT อนุมัติแล้ว", "approved OT"], ["ค่า OT", "OT pay"], ["หักเงินเพิ่ม", "additional deduction"],
    ["สิทธิ์ไม่พอ เหลือ", "Insufficient quota. Remaining"], ["ทั้งหมด", "Total"], ["โหลดสิทธิ์ของ", "Loaded quota for"], ["วันที่", "Date"], ["ถึง", "to"], ["วันนี้เป็น", "Today is "]
  ],
  my: [
    ["ผิดพลาด:", "အမှား:"], ["บันทึกไม่สำเร็จ:", "သိမ်းမရပါ:"], ["ดึงตำแหน่งไม่ได้:", "တည်နေရာမရပါ:"], ["บาท", "ဘတ်"], ["วันที่", "နေ့စွဲ"], ["เหตุผล", "အကြောင်းရင်း"], ["จำนวน", "ပမာဏ"], ["เมตร", "မီတာ"], ["ในพื้นที่", "နယ်ပယ်အတွင်း"], ["นอกพื้นที่", "နယ်ပယ်ပြင်ပ"], ["วันนี้เป็น", "ယနေ့သည် "]
  ]
};

export function getLang(){ return localStorage.getItem(LANG_KEY) || "th"; }
export function setLang(lang){ localStorage.setItem(LANG_KEY, lang); }
export function t(key){ const lang=getLang(); return DICT[lang]?.[key] || DICT.th[key] || key; }

export function translateText(input){
  const lang = getLang();
  if (lang === "th" || input === null || input === undefined) return input;
  let text = String(input);
  const trimmed = text.trim();
  if (!trimmed) return input;
  const table = STATIC_TRANSLATIONS[lang] || {};
  if (table[trimmed]) return text.replace(trimmed, table[trimmed]);
  const pairs = PARTIAL_TRANSLATIONS[lang] || [];
  for (const [from, to] of pairs) text = text.split(from).join(to);
  return text;
}

export function langSelector(){ const lang=getLang(); return `<select id="langSelect" class="lang-select"><option value="th" ${lang==="th"?"selected":""}>ไทย</option><option value="my" ${lang==="my"?"selected":""}>မြန်မာ</option><option value="en" ${lang==="en"?"selected":""}>English</option></select>`; }
export function bindLangSelector(onChange){ const el=document.getElementById("langSelect"); if(!el)return; el.onchange=()=>{setLang(el.value); onChange?.(el.value);}; }

function shouldSkipNode(node){
  const p = node.parentElement;
  if (!p) return true;
  if (p.closest("script,style,textarea,code,pre,[data-no-translate]")) return true;
  return false;
}

export function translatePage(root=document){
  const lang = getLang();
  if (lang === "th") return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node){
      if (shouldSkipNode(node)) return NodeFilter.FILTER_REJECT;
      if (!node.nodeValue || !/[ก-๙]/.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes=[]; while(walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node => { node.nodeValue = translateText(node.nodeValue); });
  root.querySelectorAll?.("input[placeholder],textarea[placeholder],button[title],select[title],a[title],option").forEach(el=>{
    if (el.placeholder && /[ก-๙]/.test(el.placeholder)) el.placeholder = translateText(el.placeholder);
    if (el.title && /[ก-๙]/.test(el.title)) el.title = translateText(el.title);
  });
}

let observerStarted = false;
export function initI18nAutoTranslate(root=document.body){
  if (observerStarted || !root) return;
  observerStarted = true;
  translatePage(root);
  const obs = new MutationObserver(muts => {
    if (getLang() === "th") return;
    for (const m of muts) {
      m.addedNodes.forEach(n => {
        if (n.nodeType === Node.TEXT_NODE && /[ก-๙]/.test(n.nodeValue || "") && !shouldSkipNode(n)) n.nodeValue = translateText(n.nodeValue);
        if (n.nodeType === Node.ELEMENT_NODE) translatePage(n);
      });
    }
  });
  obs.observe(root, { childList:true, subtree:true });
}
