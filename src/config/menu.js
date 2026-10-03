import {
  Home, Search, Inbox, Send, ScrollText, Wallet, Armchair, Package, Car, Building2,
  Activity, HeartPulse, Users, Settings, History, CalendarDays, DatabaseBackup,
  ClipboardList, MapPinned, BarChart3, CalendarClock,
  Megaphone, ShoppingCart, FileSignature, HandCoins, Landmark, Receipt, FileStack,
  Award,
} from 'lucide-react';

// รายการทะเบียนในกลุ่ม "ทะเบียนประกอบฎีกาและทะเบียนต่างๆ" — ย้ายมาแสดงเป็นลิงก์ตรงในกลุ่ม "ทะเบียนหลัก" ของเมนูซ้ายแล้วตามคำขอ
// (กดแล้วเข้าทะเบียนนั้นได้ทันที ไม่ต้องผ่านหน้ารวมอีกต่อไป) ยังใช้ array นี้สำหรับหน้ารวมไอคอน/การ์ด (RegistriesHub.jsx) ที่กดเข้าได้จากแดชบอร์ดเช่นเดิม
// เรียงฎีกาเบิกจ่ายไว้อันดับแรกตามคำขอ และตัด "ทะเบียนคืนเงินยืม" ออกแล้ว (ย้ายไปรวมอยู่ในทะเบียนสัญญายืมเงินแทน)
export const REGISTRY_LINKS = [
  { key: 'reg-deeka', label: 'ทะเบียนคุมฎีกาเบิกจ่าย', path: '/reg-deeka', icon: FileStack },
  { key: 'reg-orders', label: 'ทะเบียนคำสั่ง', path: '/reg-orders', icon: ScrollText },
  { key: 'reg-announce', label: 'ทะเบียนประกาศ', path: '/reg-announce', icon: Megaphone },
  { key: 'reg-procurement', label: 'ทะเบียนคุมการสั่งซื้อสั่งจ้าง', path: '/reg-procurement', icon: ShoppingCart },
  { key: 'reg-contract-no', label: 'ทะเบียนคุมเลขหนังสือสัญญา', path: '/reg-contract-no', icon: FileSignature },
  { key: 'reg-loan', label: 'ทะเบียนคุมสัญญายืมเงิน', path: '/reg-loan', icon: HandCoins },
  { key: 'reg-cheque', label: 'ทะเบียนคุมการเบิกจ่ายเล่มเช็ค', path: '/reg-cheque', icon: Landmark },
  { key: 'reg-receipt', label: 'ทะเบียนคุมใบเสร็จรับเงิน', path: '/reg-receipt', icon: Receipt },
  { key: 'reg-certificate', label: 'ทะเบียนคุมเลขที่เกียรติบัตร', path: '/reg-certificate', icon: Award },
];

// ready = พร้อมใช้งานแล้ว, module = ชื่อสิทธิ์ใน src/lib/roles.js (ไม่ใส่ = ทุกบทบาทเห็น)
// icon ของหมวดหมู่ใช้แสดงหัวกลุ่มเมนูในแถบเมนูด้านซ้าย
export const MENU = [
  {
    title: 'ภาพรวม',
    icon: Home,
    main: true,
    items: [
      { key: 'dash', label: 'Dashboard', path: '/', icon: Home, ready: true },
      { key: 'search', label: 'ค้นหาแบบรวม', path: '/search', icon: Search, ready: true },
    ],
  },
  {
    // รวมทะเบียนประกอบฎีกาและทะเบียนควบคุมต่างๆ (REGISTRY_LINKS) ไว้ในกลุ่มเดียวกับทะเบียนหลักตามคำขอ — กดแล้วเข้าทะเบียนนั้นได้ทันที
    title: 'ทะเบียนหลัก',
    icon: ClipboardList,
    main: true,
    items: [
      { key: 'incoming', label: 'ทะเบียนหนังสือรับ', emoji: '📥', path: '/incoming', icon: Inbox, ready: true, module: 'incoming' },
      { key: 'outgoing', label: 'ทะเบียนหนังสือส่ง', emoji: '📤', path: '/outgoing', icon: Send, ready: true, module: 'outgoing' },
      { key: 'leave', label: 'ทะเบียนควบคุมวันลา', emoji: '🗓️', path: '/leave', icon: CalendarDays, ready: true, module: 'leave' },
      { key: 'vehicle', label: 'ทะเบียนควบคุมยานพาหนะ', emoji: '🚗', path: '/vehicle', icon: Car, ready: true, module: 'vehicle' },
      ...REGISTRY_LINKS.map((r) => ({ key: r.key, label: r.label, path: r.path, icon: r.icon, ready: true, module: r.key })),
    ],
  },
  {
    title: 'แผนงานและรายงาน',
    icon: MapPinned,
    main: true,
    items: [
      { key: 'duty', label: 'แผนเวรนอกเวลาประจำเดือน', emoji: '🌙', path: '/duty', icon: ClipboardList, ready: true, module: 'duty' },
      { key: 'homevisit', label: 'แผน/รายงานเยี่ยมบ้านเชิงรุกประจำเดือน', emoji: '🏠', path: '/homevisit', icon: MapPinned, ready: true, module: 'homevisit' },
      { key: 'assignments', label: 'ปฏิทินมอบหมายงาน', emoji: '🗂️', path: '/assignments', icon: CalendarClock, ready: true, module: 'assignments' },
      { key: 'leave-reports', label: 'รายงาน/สถิติการลา', emoji: '📊', path: '/leave-reports', icon: BarChart3, ready: true, module: 'leave' },
    ],
  },
  {
    title: 'งานบุคคล',
    icon: Users,
    main: true,
    items: [
      { key: 'personnel', label: 'ทำเนียบบุคลากร', emoji: '👥', path: '/personnel', icon: Users, ready: true, module: 'personnel' },
    ],
  },
  {
    title: 'กลุ่มงานบริหาร',
    icon: Building2,
    main: true,
    items: [
      { key: 'finance', label: 'การเงินและบัญชี', emoji: '💰', path: '/soon/finance', icon: Wallet },
      { key: 'equipment', label: 'ครุภัณฑ์', emoji: '🪑', path: '/soon/equipment', icon: Armchair },
      { key: 'supplies', label: 'พัสดุ', emoji: '📦', path: '/soon/supplies', icon: Package },
      { key: 'land', label: 'ที่ดินและสิ่งก่อสร้าง', emoji: '🏢', path: '/soon/land', icon: Building2 },
    ],
  },
  {
    title: 'งานบริการสุขภาพ',
    icon: HeartPulse,
    main: true,
    items: [
      { key: 'disease', label: 'ส่งเสริมป้องกันควบคุมโรค', emoji: '🦠', path: '/soon/disease', icon: Activity },
      { key: 'family', label: 'เวชปฏิบัติครอบครัว', emoji: '❤️‍🩹', path: '/soon/family', icon: HeartPulse },
    ],
  },
  {
    title: 'ผู้ดูแลระบบ',
    icon: Settings,
    main: true,
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
  finance: { label: 'งานการเงินและบัญชี', features: ['ทะเบียนยืมเงิน (แจ้งเตือนใกล้ครบกำหนด/เกินกำหนด)', 'ทะเบียนสั่งซื้อ/สั่งจ้าง', 'ทะเบียนคุมเลขที่สัญญา (แจ้งเตือนก่อนสัญญาหมดอายุ)', 'ทะเบียนเอกสารทางการเงิน'] },
  equipment: { label: 'งานครุภัณฑ์', features: ['ทะเบียนครุภัณฑ์ (เลขครุภัณฑ์เป็นรหัสหลัก)', 'โอนย้าย / จำหน่าย / ซ่อมบำรุง', 'ตรวจสอบครุภัณฑ์ประจำปี', 'รองรับ QR Code/Barcode ในอนาคต'] },
  supplies: { label: 'งานพัสดุ', features: ['ทะเบียนพัสดุ', 'รับพัสดุ / เบิกจ่าย', 'คงเหลือและจุดสั่งซื้อ', 'แจ้งเตือนพัสดุใกล้หมด'] },
  land: { label: 'งานที่ดินและสิ่งก่อสร้าง', features: ['ทะเบียนที่ดิน อาคาร สิ่งก่อสร้าง', 'ประวัติการซ่อมและปรับปรุง', 'เอกสารสิทธิ์ แบบแปลน รูปภาพ'] },
  disease: { label: 'งานส่งเสริมป้องกันควบคุมโรค', features: ['บันทึกกิจกรรม/โครงการ ตามหมู่บ้านและกลุ่มเป้าหมาย', 'รายงานตามเดือน ไตรมาส ปีงบประมาณ', 'งานเฝ้าระวังโรค วัคซีน คัดกรอง ไข้เลือดออก ฯลฯ'] },
  family: { label: 'งานเวชปฏิบัติครอบครัว', features: ['NCD / LTC / ผู้ป่วยติดบ้านติดเตียง / เยี่ยมบ้าน', 'ต้องออกแบบสิทธิ์เข้มงวดและ PDPA ก่อน (เฟสหลัง)'] },
};
