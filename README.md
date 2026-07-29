# ระบบประเมินเครื่องมือวิจัย (IOC) — I Care Hub

เว็บแอปสำหรับให้ผู้ทรงคุณวุฒิประเมินความสอดคล้อง (IOC) ของเครื่องมือวิจัย
พร้อมแดชบอร์ดสรุปผลสำหรับผู้ดูแล โดยเก็บข้อมูลทั้งหมดไว้ใน **Google Sheets**

> ⚠️ **สำคัญ:** แอปนี้ทำงานเป็น **Google Apps Script (GAS) Web App** เท่านั้น
> ต้อง deploy คู่กับ Google Sheets จึงจะใช้งานได้จริง
> การเปิดไฟล์ `index.html` ตรง ๆ (หรือผ่าน GitHub Pages) จะขึ้นข้อความ
> *"ไม่พบสภาพแวดล้อม Google Apps Script"* เพราะไม่มีฝั่งเซิร์ฟเวอร์ที่เชื่อมกับชีต

## ไฟล์ในโปรเจกต์

| ไฟล์ | หน้าที่ |
|------|---------|
| `Code.gs` | โค้ดฝั่งเซิร์ฟเวอร์ — `doGet` เสิร์ฟหน้าเว็บ, `getAppData` ดึงข้อมูลจากชีต, `saveEvaluationData` บันทึกผล, `setupDatabase` สร้างชีตที่จำเป็น |
| `index.html` | หน้าจอผู้ใช้ (frontend) เรียก `google.script.run` เพื่อคุยกับ `Code.gs` |
| `appsscript.json` | ไฟล์ตั้งค่าโปรเจกต์ GAS (โซนเวลา, สิทธิ์เข้าถึง web app) |

## โครงสร้างชีตที่ต้องมี (ใน Google Sheets เดียวกับสคริปต์)

- **Experts** — `Expert_ID, Full_Name, Position, Access_Token, Status, Started_At, Submitted_At`
- **IOC_รวมทุกชุด** — `ลำดับ, ชุดที่, เครื่องมือ, ระยะ, วัตถุประสงค์, ตอน/ด้าน, ข้อที่, ข้อคำถาม / รายการประเมิน`
- **Evaluations** — `Expert_ID, ชุดที่, ข้อที่, คะแนน, ข้อเสนอแนะ, Timestamp` *(ฟังก์ชัน `setupDatabase` สร้างให้อัตโนมัติ)*
- **ToolStatus** — `Expert_ID, ชุดที่, Status, Timestamp` *(ฟังก์ชัน `setupDatabase` สร้างให้อัตโนมัติ)*

## วิธี Deploy (ทีละขั้น)

1. เปิด **Google Sheets** ที่จะใช้เก็บข้อมูล (หรือสร้างใหม่) แล้วเตรียมชีต `Experts`
   และ `IOC_รวมทุกชุด` ตามหัวคอลัมน์ด้านบน พร้อมกรอกรายชื่อผู้ทรงฯ และรายการคำถาม
2. ในชีตนั้นเลือกเมนู **ส่วนขยาย (Extensions) → Apps Script**
3. ในหน้า Apps Script:
   - สร้าง/แก้ไฟล์สคริปต์ แล้ววางเนื้อหาจาก `Code.gs` (ไฟล์นี้)
   - กด **+ → HTML** ตั้งชื่อไฟล์ว่า `index` แล้ววางเนื้อหาจาก `index.html`
     (ชื่อต้องเป็น `index` ให้ตรงกับ `createHtmlOutputFromFile('index')`)
4. เลือกฟังก์ชัน **`setupDatabase`** จากเมนูด้านบนแล้วกด **Run** หนึ่งครั้ง
   เพื่อสร้างชีต `Evaluations` และ `ToolStatus` (ครั้งแรกจะขออนุญาตสิทธิ์ — กดอนุญาต)
5. กด **Deploy → New deployment** เลือกชนิด **Web app**
   - *Execute as:* `Me`
   - *Who has access:* `Anyone` (หรือ `Anyone with Google account` ตามต้องการ)
6. กด **Deploy** แล้วคัดลอก **Web app URL** ที่ได้ไปเปิดใช้งาน / ส่งให้ผู้ทรงคุณวุฒิ

## การอัปเดตโค้ดภายหลัง

หลังแก้ `Code.gs` หรือ `index.html` ใน Apps Script แล้ว ให้กด
**Deploy → Manage deployments → (แก้ไข) → New version → Deploy**
เพื่อให้ URL เดิมเสิร์ฟเวอร์ชันล่าสุด

## หมายเหตุเรื่อง GitHub Pages

repository นี้เก็บ *ซอร์สโค้ด* ไว้เป็นต้นฉบับ/สำรองเท่านั้น
ตัวระบบที่ใช้งานจริงต้องรันบน Google Apps Script ตามขั้นตอนด้านบน
