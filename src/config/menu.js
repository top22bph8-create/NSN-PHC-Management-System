import {
  Home, Search, Inbox, Send, ScrollText, Wallet, Armchair, Package, Car, Building2,
  Activity, HeartPulse, Users, Settings, History, CalendarDays, DatabaseBackup,
} from 'lucide-react';

// ready = พร้อมใช้งานแล้ว, module = ชื่อสิทธิ์ใน src/lib/roles.js (ไม่ใส่ = ทุกบทบาทเห็น)
export const MENU = [
  {
    title: 'ภาพรวม',
    items: [
      { key: 'dash', label: 'Dashboard', path: '/', icon: Home, ready: true },
      { key: 'search', label: 'ค้นหาแบบรวม', path: '/search', icon: Search, ready: true },
    ],
  },
  {
    title: 'งานบุคคล',
    items: [
      { key: 'leave', label: 'ระบบควบคุมวันลา', path: '/leave', icon: CalendarDays, ready: true, module: 'leave' },
      { key: 'personnel', label: 'ทำเนียบบุคลากร', path: '/personnel', icon: Users, ready: true, module: 'personnel' },
    ],
  },
  {
    title: 'กลุ่มงานบริหาร',
    items: [
      { key: 'incoming', label: 'หนังสือรับ', path: '/incoming', icon: Inbox, ready: true, module: 'incoming' },
      { key: 'outgoing', label: 'หนังสือส่ง', path: '/outgoing', icon: Send, ready: true, module: 'outgoing' },
      { key: 'orders', label: 'คำสั่งและประกาศ', path: '/soon/orders', icon: ScrollText },
      { key: 'finance', label: 'การเงินและบัญชี', path: '/soon/finance', icon: Wallet },
      { key: 'equipment', label: 'ครุภัณฑ์', path: '/soon/equipment', icon: Armchair },
      { key: 'supplies', label: 'พัสดุ', path: '/soon/supplies', icon: Package },
      { key: 'vehicle', label: 'ยานพาหนะ', path: '/soon/vehicle', icon: Car },
      { key: 'land', label: 'ที่ดินและสิ่งก่อสร้าง', path: '/soon/land', icon: Building2 },
    ],
  },
  {
    title: 'งานบริการสุขภาพ',
    items: [
      { key: 'disease', label: 'ส่งเสริมป้องกันควบคุมโรค', path: '/soon/disease', icon: Activity },
      { key: 'family', label: 'เวชปฏิบัติครอบครัว', path: '/soon/family', icon: HeartPulse },
    ],
  },
  {
    title: 'ผู้ดูแลระบบ',
    items: [
      { key: 'settings', label: 'ตั้งค่าระบบ', path: '/settings', icon: Settings, ready: true, module: 'settings' },
      { key: 'backup', label: 'สำรอง/กู้คืนข้อมูล', path: '/backup', icon: DatabaseBackup, ready: true, module: 'backup' },
      { key: 'audit', label: 'Audit Log', path: '/audit', icon: History, ready: true, module: 'audit' },
    ],
  },
];

// รายละเอียดโมดูลที่กำลังพัฒนา (แสดงในหน้า "เร็วๆ นี้")
export const SOON = {
  orders: { label: 'งานคำสั่งและประกาศ', features: ['ทะเบียนคำสั่ง', 'ทะเบียนประกาศ', 'ค้นหาคำสั่ง/ประกาศ', 'แนบไฟล์ PDF'] },
  finance: { label: 'งานการเงินและบัญชี', features: ['ทะเบียนยืมเงิน (แจ้งเตือนใกล้ครบกำหนด/เกินกำหนด)', 'ทะเบียนสั่งซื้อ/สั่งจ้าง', 'ทะเบียนคุมเลขที่สัญญา (แจ้งเตือนก่อนสัญญาหมดอายุ)', 'ทะเบียนเอกสารทางการเงิน'] },
  equipment: { label: 'งานครุภัณฑ์', features: ['ทะเบียนครุภัณฑ์ (เลขครุภัณฑ์เป็นรหัสหลัก)', 'โอนย้าย / จำหน่าย / ซ่อมบำรุง', 'ตรวจสอบครุภัณฑ์ประจำปี', 'รองรับ QR Code/Barcode ในอนาคต'] },
  supplies: { label: 'งานพัสดุ', features: ['ทะเบียนพัสดุ', 'รับพัสดุ / เบิกจ่าย', 'คงเหลือและจุดสั่งซื้อ', 'แจ้งเตือนพัสดุใกล้หมด'] },
  vehicle: { label: 'งานยานพาหนะ', features: ['ทะเบียนรถและพนักงานขับรถ', 'ประวัติการใช้รถ น้ำมัน ซ่อมบำรุง', 'แจ้งเตือนภาษี พ.ร.บ. ประกันใกล้หมดอายุ'] },
  land: { label: 'งานที่ดินและสิ่งก่อสร้าง', features: ['ทะเบียนที่ดิน อาคาร สิ่งก่อสร้าง', 'ประวัติการซ่อมและปรับปรุง', 'เอกสารสิทธิ์ แบบแปลน รูปภาพ'] },
  disease: { label: 'งานส่งเสริมป้องกันควบคุมโรค', features: ['บันทึกกิจกรรม/โครงการ ตามหมู่บ้านและกลุ่มเป้าหมาย', 'รายงานตามเดือน ไตรมาส ปีงบประมาณ', 'งานเฝ้าระวังโรค วัคซีน คัดกรอง ไข้เลือดออก ฯลฯ'] },
  family: { label: 'งานเวชปฏิบัติครอบครัว', features: ['NCD / LTC / ผู้ป่วยติดบ้านติดเตียง / เยี่ยมบ้าน', 'ต้องออกแบบสิทธิ์เข้มงวดและ PDPA ก่อน (เฟสหลัง)'] },
};
