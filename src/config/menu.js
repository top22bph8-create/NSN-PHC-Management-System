import {
  Home, Search, Inbox, Send, ScrollText, Wallet, Armchair, Package, Car, Building2,
  Activity, HeartPulse, Users, Settings, History, CalendarDays, DatabaseBackup,
  ClipboardList, MapPinned,
} from 'lucide-react';

// ready = พร้อมใช้งานแล้ว, module = ชื่อสิทธิ์ใน src/lib/roles.js (ไม่ใส่ = ทุกบทบาทเห็น)
// icon ของหมวดหมู่ใช้แสดงหัวกลุ่มเมนูในแถบเมนูด้านซ้าย
export const MENU = [
  {
    title: 'ภาพรวม',
    icon: Home,
    items: [
      { key: 'dash', label: 'Dashboard', path: '/', icon: Home, ready: true },
      { key: 'search', label: 'ค้นหาแบบรวม', path: '/search', icon: Search, ready: true },
    ],
  },
  {
    title: 'ทะเบียนหลัก',
    icon: ClipboardList,
    main: true,
    items: [
      { key: 'incoming', label: 'ทะเบียนหนังสือรับ', emoji: '📥', path: '/incoming', icon: Inbox, ready: true, module: 'incoming' },
      { key: 'outgoing', label: 'ทะเบียนหนังสือส่ง', emoji: '📤', path: '/outgoing', icon: Send, ready: true, module: 'outgoing' },
      { key: 'leave', label: 'ทะเบียนควบคุมวันลา', emoji: '🗓️', path: '/leave', icon: CalendarDays, ready: true, module: 'leave' },
      { key: 'vehicle', label: 'ทะเบียนควบคุมยานพาหนะ', emoji: '🚗', path: '/vehicle', icon: Car, ready: true, module: 'vehicle' },
    ],
  },
  {
    title: 'แผนงานและรายงาน',
    icon: MapPinned,
    main: true,
    items: [
      { key: 'duty', label: 'แผนเวรนอกเวลาประจำเดือน', emoji: '🌙', path: '/duty', icon: ClipboardList, ready: true, module: 'duty' },
      { key: 'homevisit', label: 'แผน/รายงานเยี่ยมบ้านเชิงรุกประจำเดือน', emoji: '🏠', path: '/homevisit', icon: MapPinned, ready: true, module: 'homevisit' },
    ],
  },
  {
    title: 'งานบุคคล',
    icon: Users,
    items: [
      { key: 'personnel', label: 'ทำเนียบบุคลากร', emoji: '👥', path: '/personnel', icon: Users, ready: true, module: 'personnel' },
    ],
  },
  {
    title: 'กลุ่มงานบริหาร',
    icon: Building2,
    items: [
      { key: 'orders', label: 'คำสั่งและประกาศ', emoji: '📋', path: '/soon/orders', icon: ScrollText },
      { key: 'finance', label: 'การเงินและบัญชี', emoji: '💰', path: '/soon/finance', icon: Wallet },
      { key: 'equipment', label: 'ครุภัณฑ์', emoji: '🪑', path: '/soon/equipment', icon: Armchair },
      { key: 'supplies', label: 'พัสดุ', emoji: '📦', path: '/soon/supplies', icon: Package },
      { key: 'land', label: 'ที่ดินและสิ่งก่อสร้าง', emoji: '🏢', path: '/soon/land', icon: Building2 },
    ],
  },
  {
    title: 'งานบริการสุขภาพ',
    icon: HeartPulse,
    items: [
      { key: 'disease', label: 'ส่งเสริมป้องกันควบคุมโรค', emoji: '🦠', path: '/soon/disease', icon: Activity },
      { key: 'family', label: 'เวชปฏิบัติครอบครัว', emoji: '❤️‍🩹', path: '/soon/family', icon: HeartPulse },
    ],
  },
  {
    title: 'ผู้ดูแลระบบ',
    icon: Settings,
    items: [
      { key: 'settings', label: 'ตั้งค่าระบบ', emoji: '⚙️', path: '/settings', icon: Settings, ready: true, module: 'settings' },
      { key: 'backup', label: 'สำรอง/กู้คืนข้อมูล', emoji: '💾', path: '/backup', icon: DatabaseBackup, ready: true, module: 'backup' },
      { key: 'audit', label: 'Audit Log', emoji: '🕵️', path: '/audit', icon: History, ready: true, module: 'audit' },
      { key: 'personnel-users', label: 'กำหนดผู้ใช้งาน/อนุมัติสมัครสมาชิก', emoji: '🔑', path: '/personnel', icon: Users, ready: true, module: 'personnel' },
    ],
  },
];

// รายละเอียดโมดูลที่กำลังพัฒนา (แสดงในหน้า "เร็วๆ นี้")
export const SOON = {
  orders: { label: 'งานคำสั่งและประกาศ', features: ['ทะเบียนคำสั่ง', 'ทะเบียนประกาศ', 'ค้นหาคำสั่ง/ประกาศ', 'แนบไฟล์ PDF'] },
  finance: { label: 'งานการเงินและบัญชี', features: ['ทะเบียนยืมเงิน (แจ้งเตือนใกล้ครบกำหนด/เกินกำหนด)', 'ทะเบียนสั่งซื้อ/สั่งจ้าง', 'ทะเบียนคุมเลขที่สัญญา (แจ้งเตือนก่อนสัญญาหมดอายุ)', 'ทะเบียนเอกสารทางการเงิน'] },
  equipment: { label: 'งานครุภัณฑ์', features: ['ทะเบียนครุภัณฑ์ (เลขครุภัณฑ์เป็นรหัสหลัก)', 'โอนย้าย / จำหน่าย / ซ่อมบำรุง', 'ตรวจสอบครุภัณฑ์ประจำปี', 'รองรับ QR Code/Barcode ในอนาคต'] },
  supplies: { label: 'งานพัสดุ', features: ['ทะเบียนพัสดุ', 'รับพัสดุ / เบิกจ่าย', 'คงเหลือและจุดสั่งซื้อ', 'แจ้งเตือนพัสดุใกล้หมด'] },
  land: { label: 'งานที่ดินและสิ่งก่อสร้าง', features: ['ทะเบียนที่ดิน อาคาร สิ่งก่อสร้าง', 'ประวัติการซ่อมและปรับปรุง', 'เอกสารสิทธิ์ แบบแปลน รูปภาพ'] },
  disease: { label: 'งานส่งเสริมป้องกันควบคุมโรค', features: ['บันทึกกิจกรรม/โครงการ ตามหมู่บ้านและกลุ่มเป้าหมาย', 'รายงานตามเดือน ไตรมาส ปีงบประมาณ', 'งานเฝ้าระวังโรค วัคซีน คัดกรอง ไข้เลือดออก ฯลฯ'] },
  family: { label: 'งานเวชปฏิบัติครอบครัว', features: ['NCD / LTC / ผู้ป่วยติดบ้านติดเตียง / เยี่ยมบ้าน', 'ต้องออกแบบสิทธิ์เข้มงวดและ PDPA ก่อน (เฟสหลัง)'] },
};
