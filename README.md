# ระบบบริหารงาน รพ.สต.บ้านหนองสนม

เว็บแอปบริหารงานภายใน (React + Vite + Tailwind + Firebase) เผยแพร่ผ่าน GitHub Pages

## ฟีเจอร์รอบที่ 1
- ล็อกอิน + สิทธิ์ตามบทบาท (Super Admin, ผอ., ธุรการ, การเงิน, พัสดุ, ควบคุมโรค, เวชปฏิบัติฯ, ผู้ดูรายงาน)
- Dashboard, ค้นหาแบบรวม, เลือกปีงบประมาณจากส่วนกลาง
- ทะเบียนหนังสือรับ/ส่ง: เพิ่ม แก้ไข ค้นหา กรอง ดูรายละเอียด แนบไฟล์ (PDF/Word/Excel/รูป) ลบพร้อมยืนยัน ส่งออก Excel/CSV
- เลขทะเบียนอัตโนมัติ (เช่น 001/2569) ตั้งรูปแบบได้ ขึ้นปีใหม่เริ่มใหม่
- Audit Log (ใคร ทำอะไร เมื่อไร ข้อมูลเดิม/ใหม่)
- โมดูลอื่นในเมนูแสดงเป็น "เร็วๆ นี้"

## ตั้งค่าครั้งแรก
1. อัปโหลดไฟล์ทั้งหมดขึ้น GitHub (ไม่รวม node_modules)
2. GitHub → Settings → Pages → Source เลือก **GitHub Actions**
3. Firebase Console → Firestore → Rules วางเนื้อหาไฟล์ `firestore.rules` → Publish
4. Firebase Console → Storage → Get started → Rules วางเนื้อหาไฟล์ `storage.rules` → Publish
5. Firebase Console → Authentication → Settings → User actions → **ปิด** "Enable create (sign-up)"
6. เข้าเว็บด้วยอีเมลเจ้าของระบบ ครั้งแรกระบบสร้างสิทธิ์ Super Admin ให้อัตโนมัติ

## เพิ่มผู้ใช้
สร้างบัญชีที่ Firebase Authentication → Add user แล้วเพิ่มสิทธิ์ในเมนู "ผู้ใช้งานและสิทธิ์"

## พัฒนาต่อในเครื่อง
```
npm install
npm run dev
npm run build
```

## ความปลอดภัย
- ห้ามใส่ข้อมูลผู้ป่วยหรือข้อมูลสุขภาพในที่เก็บโค้ดนี้ (เป็น Public) ข้อมูลทั้งหมดอยู่ใน Firebase
- ค่า `firebaseConfig` ใน `src/firebase.js` เปิดเผยได้ ความปลอดภัยอยู่ที่ Rules
- ข้อมูลผู้รับบริการ (เวชปฏิบัติครอบครัว) ยังไม่เปิดใช้ ต้องออกแบบสิทธิ์และ PDPA ก่อน
