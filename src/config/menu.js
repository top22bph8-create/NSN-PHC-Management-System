import {
  Home, Search, Inbox, Send, ScrollText, Wallet, Armchair, Package, Car, Building2,
  Activity, HeartPulse, Users, Settings, History, CalendarDays, DatabaseBackup,
  ClipboardList, MapPinned, BarChart3, CalendarClock,
  BookOpenCheck, Megaphone, Hash, ShoppingCart, FileSignature, HandCoins, Landmark, Receipt, FileStack,
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
    // กลุ่มใหม่ตามคำขอ: รวมทะเบียนประกอบฎีกาและทะเบียนควบคุมต่างๆ ของงานธุรการ/การเงินไว้ในที่เดียว
    // (ยังเป็นหน้า "เร็วๆ นี้" รอไฟล์ทะเบียนตัวอย่างจากผู้อำนวยการเพื่อออกแบบฟอร์มจริงในรอบถัดไป)
    title: 'ทะเบียนประกอบฎีกาและทะเบียนต่างๆ',
    icon: BookOpenCheck,
    main: true,
    items: [
      { key: 'reg-orders', label: 'ทะเบียนคำสั่ง', emoji: '📜', path: '/soon/reg-orders', icon: ScrollText },
      { key: 'reg-announce', label: 'ทะเบียนประกาศ', emoji: '📢', path: '/soon/reg-announce', icon: Megaphone },
      { key: 'reg-order-no', label: 'ทะเบียนคุมเลขที่คำสั่ง', emoji: '🔢', path: '/soon/reg-order-no', icon: Hash },
      { key: 'reg-procurement', label: 'ทะเบียนคุมการสั่งซื้อสั่งจ้าง', emoji: '🛒', path: '/soon/reg-procurement', icon: ShoppingCart },
      { key: 'reg-contract-no', label: 'ทะเบียนคุมเลขหนังสือสัญญา', emoji: '📝', path: '/soon/reg-contract-no', icon: FileSignature },
      { key: 'reg-loan', label: 'ทะเบียนคุมสัญญายืมเงิน', emoji: '💵', path: '/soon/reg-loan', icon: HandCoins },
      { key: 'reg-cheque', label: 'ทะเบียนคุมการใช้เช็ค', emoji: '🏦', path: '/soon/reg-cheque', icon: Landmark },
      { key: 'reg-receipt', label: 'ทะเบียนใบเสร็จรับเงิน', emoji: '🧾', path: '/soon/reg-receipt', icon: Receipt },
      { key: 'reg-deeka', label: 'ทะเบียนคุมฎีกาเบิกจ่าย', emoji: '📑', path: '/soon/reg-deeka', icon: FileStack },
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
  // กลุ่ม "ทะเบียนประกอบฎีกาและทะเบียนต่างๆ" — รอไฟล์ทะเบียนตัวอย่างจากผู้อำนวยการเพื่อออกแบบฟอร์ม/คอลัมน์จริงในรอบถัดไป
  'reg-orders': { label: 'ทะเบียนคำสั่ง', features: ['บันทึกเลขที่คำสั่ง เรื่อง วันที่ลงนาม ผู้ลงนาม', 'แนบไฟล์คำสั่ง PDF', 'ค้นหา/พิมพ์รายงานย้อนหลัง'] },
  'reg-announce': { label: 'ทะเบียนประกาศ', features: ['บันทึกเลขที่ประกาศ เรื่อง วันที่ประกาศ', 'แนบไฟล์ประกาศ PDF', 'ค้นหา/พิมพ์รายงานย้อนหลัง'] },
  'reg-order-no': { label: 'ทะเบียนคุมเลขที่คำสั่ง', features: ['ออกเลขที่คำสั่งอัตโนมัติ ไม่ซ้ำ', 'ตรวจสอบเลขที่ที่ใช้ไปแล้วในแต่ละปี'] },
  'reg-procurement': { label: 'ทะเบียนคุมการสั่งซื้อสั่งจ้าง', features: ['บันทึกรายการจัดซื้อจัดจ้าง งบประมาณ คู่สัญญา', 'ติดตามสถานะดำเนินการ'] },
  'reg-contract-no': { label: 'ทะเบียนคุมเลขหนังสือสัญญา', features: ['ออกเลขที่สัญญาอัตโนมัติ ไม่ซ้ำ', 'แจ้งเตือนก่อนสัญญาหมดอายุ'] },
  'reg-loan': { label: 'ทะเบียนคุมสัญญายืมเงิน', features: ['บันทึกผู้ยืม วันที่ยืม กำหนดส่งคืน', 'แจ้งเตือนใกล้ครบกำหนด/เกินกำหนด'] },
  'reg-cheque': { label: 'ทะเบียนคุมการใช้เช็ค', features: ['บันทึกเลขที่เช็ค วันที่สั่งจ่าย ผู้รับเงิน จำนวนเงิน', 'ตรวจสอบเช็คคงเหลือ/ใช้ไปแล้ว'] },
  'reg-receipt': { label: 'ทะเบียนใบเสร็จรับเงิน', features: ['บันทึกเลขที่ใบเสร็จ วันที่ ผู้ชำระ จำนวนเงิน', 'สรุปยอดรับเงินรายเดือน'] },
  'reg-deeka': { label: 'ทะเบียนคุมฎีกาเบิกจ่าย', features: ['บันทึกเลขที่ฎีกา เรื่อง จำนวนเงิน วันที่เบิกจ่าย', 'ติดตามสถานะอนุมัติเบิกจ่าย'] },
};
