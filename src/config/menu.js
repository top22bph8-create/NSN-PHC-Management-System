import {
  Home, Search, Inbox, Send, ScrollText, Wallet, Armchair, Package, Car, Activity, Users, Settings, CalendarDays, DatabaseBackup,
  ClipboardList, MapPinned, CalendarClock, Megaphone, ShoppingCart, FileSignature, HandCoins, Landmark, Receipt, FileStack,
  Award, KeyRound, Building2, Stethoscope, GraduationCap, HeartHandshake, Globe, Database, ClipboardCheck, Pill, ShieldPlus, IdCard, BadgeCheck, Store, Banknote, Calculator, ShieldCheck, FileBarChart,
} from 'lucide-react';

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

// ===== กลุ่มงานหลัก 11 กลุ่ม (ใช้ทั้งแดชบอร์ดกลางหน้า, หน้ากลุ่ม /group/:key และแถบเมนูซ้าย) =====
// ready=false → ยังไม่เปิดใช้ แสดงเป็น "เร็วๆ นี้" ; module = สิทธิ์ใน src/lib/roles.js (ไม่ใส่ = ทุกบทบาทเห็น)
const R = (key, desc) => { const r = REGISTRY_LINKS.find((x) => x.key === key); return { ...r, desc, ready: true, module: key }; };
export const GROUPS = [
  {
    key: 'admin', title: 'งานธุรการ', emoji: '📋', icon: ClipboardList, tone: 'from-sky-500 to-blue-600', soft: 'bg-sky-50 text-sky-700',
    items: [
      { key: 'incoming', label: 'ทะเบียนหนังสือรับ', path: '/incoming', icon: Inbox, ready: true, module: 'incoming', desc: 'ลงรับหนังสือ ติดตามกำหนดดำเนินการ' },
      { key: 'outgoing', label: 'ทะเบียนหนังสือส่ง', path: '/outgoing', icon: Send, ready: true, module: 'outgoing', desc: 'ออกเลขที่หนังสือส่ง ติดตามสถานะ' },
      R('reg-orders', 'ออกเลขคำสั่ง'),
      R('reg-announce', 'ออกเลขประกาศ'),
      R('reg-contract-no', 'ออกเลขหนังสือสัญญา'),
      R('reg-certificate', 'ออกเลขเกียรติบัตร'),
      { key: 'leave', label: 'ทะเบียนควบคุมวันลา', path: '/leave', icon: CalendarDays, ready: true, module: 'leave', desc: 'ยื่นใบลา อนุมัติ วันลาคงเหลือ' },
      { key: 'vehicle', label: 'ทะเบียนควบคุมยานพาหนะ', path: '/vehicle', icon: Car, ready: true, module: 'vehicle', desc: 'ขอใช้รถ อนุมัติ เลขไมล์' },
    ],
  },
  {
    key: 'finance', title: 'งานการเงินและบัญชี', emoji: '💰', icon: Wallet, tone: 'from-emerald-500 to-teal-600', soft: 'bg-emerald-50 text-emerald-700',
    items: [
      R('reg-deeka', 'ฎีกาเบิกจ่าย ภาษี ประกันสังคม เช็ค'),
      R('reg-loan', 'สัญญายืมเงิน ติดตามการส่งใช้'),
      R('reg-cheque', 'ควบคุมการเบิกจ่ายเล่มเช็ค'),
      R('reg-receipt', 'ควบคุมใบเสร็จรับเงิน'),
      { key: 'elaas', label: 'ระบบการเงินและบัญชี (New e-LAAS)', path: '/group/finance', href: 'https://laas.dla.go.th', icon: Calculator, tone: 'from-blue-500 to-indigo-600', ready: true, desc: 'ระบบบัญชีคอมพิวเตอร์ อปท. (กรมส่งเสริมการปกครองท้องถิ่น)' },
      { key: 'sso-pay', label: 'ระบบจ่ายเงินประกันสังคมออนไลน์', path: '/group/finance', href: 'https://www.sso.go.th/eservices/esv/login.do', icon: ShieldCheck, tone: 'from-emerald-500 to-green-600', ready: true, desc: 'e-Service สำนักงานประกันสังคม' },
      { key: 'baac', label: 'ระบบ ธกส. (คอร์ปอเรท) BAAC Corporate Banking', path: '/group/finance', href: 'https://corp.inbaac.com/corp-webe/auth/login', icon: Landmark, tone: 'from-green-600 to-lime-600', ready: true, desc: 'โอนจ่ายผ่าน BAAC Corporate' },
      { key: 'ktb', label: 'ระบบ กรุงไทย (คอร์ปอเรท) Krungthai Corporate Online', path: '/group/finance', href: 'https://www.bizgrowing.krungthai.com/corporate/', icon: Building2, tone: 'from-sky-500 to-blue-600', ready: true, desc: 'โอนจ่ายผ่าน Krungthai Corporate' },
    ],
  },
  {
    key: 'info', title: 'งานข้อมูลข่าวสารและสารสนเทศ', emoji: '🌐', icon: Globe, tone: 'from-violet-500 to-purple-600', soft: 'bg-violet-50 text-violet-700',
    items: [
      { key: 'search', label: 'ค้นหาแบบรวม', path: '/search', icon: Search, ready: true, desc: 'ค้นหาข้อมูลทุกทะเบียนในครั้งเดียว' },
      { key: 'jhcis', label: 'โปรแกรม JHCIS', path: '/group/info', protocol: 'jhcis://open', copyText: 'C:\\Program Files\\jhcis\\JHCIS_Launcher.bat', icon: Database, tone: 'from-blue-500 to-indigo-600', ready: true, desc: 'ฐานข้อมูลสุขภาพ รพ.สต. (โปรแกรมในเครื่อง — กดเพื่อเปิด)' },
      { key: 'oppp', label: 'โปรแกรม OP/PP', path: '/group/info', href: 'https://op.nhso.go.th/op/main/MainWebAction.do', icon: ClipboardCheck, tone: 'from-sky-500 to-cyan-600', ready: true, desc: 'สปสช. บันทึก/ส่งข้อมูลบริการ OP/PP' },
      { key: 'drugcat', label: 'โปรแกรม Drugcatalogue', path: '/group/info', href: 'https://drug.nhso.go.th/drugcatalogue/', icon: Pill, tone: 'from-rose-500 to-pink-600', ready: true, desc: 'บัญชียาและรหัสยา สปสช.' },
      { key: 'sso', label: 'โปรแกรมเบิกประกันสังคม', path: '/group/info', href: 'https://cs10.chi.or.th/ssopupload', icon: ShieldPlus, tone: 'from-emerald-500 to-green-600', ready: true, desc: 'อัปโหลดข้อมูลเบิกประกันสังคม' },
      { key: 'eportal', label: 'ระบบศูนย์กลางบริการระบบงานขึ้นทะเบียน (e-Portal)', path: '/group/info', href: 'https://ossregister.nhso.go.th/#/public-portal', icon: IdCard, tone: 'from-violet-500 to-purple-600', ready: true, desc: 'e-Portal ขึ้นทะเบียน สปสช.' },
      { key: 'eclaim', label: 'โปรแกรมระบบรายงานชดเชยค่าบริการ - กองทุน e-claim', path: '/group/info', href: 'https://monitor.humsolution.com/dashboard', icon: FileBarChart, tone: 'from-fuchsia-500 to-pink-600', ready: true, desc: 'รายงานการชดเชยค่าบริการ e-claim' },
      { key: 'smt', label: 'ระบบบริหารการเบิกจ่ายกองทุนหลักประกันสุขภาพแห่งชาติ (Smart Money Transfer)', path: '/group/info', href: 'https://smt.nhso.go.th/smtf/#/home/budget/summary', icon: Banknote, tone: 'from-lime-500 to-emerald-600', ready: true, desc: 'SMT สปสช. สรุปงบเบิกจ่ายกองทุน' },
      { key: 'qmsmart', label: 'โปรแกรม QM smart', path: '/group/info', href: 'https://qm-smart.online/qm-smart-uat/login', icon: BadgeCheck, tone: 'from-amber-500 to-orange-600', ready: true, desc: 'ระบบ QM smart' },
      { key: 'onestop', label: 'โปรแกรม One Stop Service', path: '/group/info', href: 'https://iam.nhso.go.th/realms/nhso/protocol/openid-connect/auth?response_type=code&client_id=nhso-digital-platform&redirect_uri=https%3A%2F%2Fserviceunit-nhsodp.nhso.go.th%2Flogin&scope=openid+mobile+email+profile', icon: Store, tone: 'from-teal-500 to-cyan-600', ready: true, desc: 'One Stop Service สปสช. (เข้าสู่ระบบ)' },
    ],
  },
  {
    key: 'manage', title: 'งานบริหาร', emoji: '🏛️', icon: Building2, tone: 'from-indigo-500 to-blue-700', soft: 'bg-indigo-50 text-indigo-700',
    items: [
      { key: 'personnel', label: 'ทำเนียบบุคลากร', path: '/personnel', icon: Users, ready: true, module: 'personnel', desc: 'ข้อมูลบุคลากรและประวัติ' },
      { key: 'duty', label: 'แผนเวรนอกเวลาประจำเดือน', path: '/duty', icon: ClipboardList, ready: true, module: 'duty', desc: 'จัดเวรนอกเวลาราชการ' },
    ],
  },
  {
    key: 'assign', title: 'ปฏิทินมอบหมายงาน', emoji: '🗂️', icon: CalendarClock, tone: 'from-amber-500 to-orange-600', soft: 'bg-amber-50 text-amber-700',
    items: [
      { key: 'assignments', label: 'ปฏิทินมอบหมายงาน', path: '/assignments', icon: CalendarClock, ready: true, module: 'assignments', desc: 'มอบหมายงาน ประชุม อบรม หน่วยปฐมพยาบาล' },
    ],
  },
  {
    key: 'supply', title: 'งานครุภัณฑ์-พัสดุ', emoji: '📦', icon: Package, tone: 'from-orange-500 to-red-500', soft: 'bg-orange-50 text-orange-700',
    items: [
      R('reg-procurement', 'ควบคุมการสั่งซื้อสั่งจ้าง'),
      { key: 'equipment', label: 'ครุภัณฑ์', path: '/soon/equipment', icon: Armchair, ready: false },
      { key: 'supplies', label: 'พัสดุ', path: '/soon/supplies', icon: Package, ready: false },
    ],
  },
  {
    key: 'nursing', title: 'งานการพยาบาล', emoji: '🩺', icon: Stethoscope, tone: 'from-rose-500 to-pink-600', soft: 'bg-rose-50 text-rose-700',
    items: [{ key: 'nursing', label: 'งานการพยาบาล', path: '/soon/nursing', icon: Stethoscope, ready: false }],
  },
  {
    key: 'academic', title: 'งานวิชาการ', emoji: '🎓', icon: GraduationCap, tone: 'from-cyan-500 to-sky-600', soft: 'bg-cyan-50 text-cyan-700',
    items: [{ key: 'academic', label: 'งานวิชาการ', path: '/soon/academic', icon: GraduationCap, ready: false }],
  },
  {
    key: 'disease', title: 'งานส่งเสริมป้องกันโรค', emoji: '🦠', icon: Activity, tone: 'from-teal-500 to-green-600', soft: 'bg-teal-50 text-teal-700',
    items: [{ key: 'disease', label: 'ส่งเสริมป้องกันควบคุมโรค', path: '/soon/disease', icon: Activity, ready: false }],
  },
  {
    key: 'ltc', title: 'งานดูแลผู้มีภาวะพึ่งพิง LTC', emoji: '🧓', icon: HeartHandshake, tone: 'from-fuchsia-500 to-purple-600', soft: 'bg-fuchsia-50 text-fuchsia-700',
    items: [{ key: 'ltc', label: 'ระบบงานดูแลผู้มีภาวะพึ่งพิง LTC', href: 'https://top22bph8-create.github.io/Nongsanom-LTC/', path: '/group/ltc', icon: HeartHandshake, ready: true, desc: 'เปิดระบบ LTC (เว็บแยก) ในแท็บใหม่' }],
  },
  {
    key: 'visit', title: 'งานเยี่ยมบ้านและงานดูแลผู้ป่วยเชิงรุก', emoji: '🏠', icon: MapPinned, tone: 'from-lime-500 to-green-600', soft: 'bg-lime-50 text-lime-700',
    items: [
      { key: 'homevisit', label: 'แผน/รายงานเยี่ยมบ้านเชิงรุกประจำเดือน', path: '/homevisit', icon: MapPinned, ready: true, module: 'homevisit', desc: 'วางแผนและรายงานการเยี่ยมบ้าน' },
    ],
  },
];

// เมนูผู้ดูแลระบบ (แสดงเฉพาะที่มีสิทธิ์) — ตัด Audit Log ออกแล้ว
export const ADMIN_ITEMS = [
  { key: 'settings', label: 'ตั้งค่าระบบ', path: '/settings', icon: Settings, module: 'settings' },
  { key: 'backup', label: 'สำรอง/กู้คืนข้อมูล', path: '/backup', icon: DatabaseBackup, module: 'backup' },
  { key: 'personnel-users', label: 'ผู้ใช้งาน/อนุมัติสมัครสมาชิก', path: '/users', icon: KeyRound, module: 'users' },
];

// หาว่า path ปัจจุบันอยู่ในกลุ่มงานไหน (ใช้ไฮไลต์เมนูซ้าย)
export const groupOfPath = (pathname) => {
  const g = GROUPS.find((x) => pathname === `/group/${x.key}`);
  if (g) return g.key;
  return GROUPS.find((x) => x.items.some((i) => i.path !== '/' && (pathname === i.path || pathname.startsWith(i.path + '/'))))?.key || null;
};

// รายละเอียดโมดูลที่กำลังพัฒนา (แสดงในหน้า "เร็วๆ นี้")
export const SOON = {
  equipment: { label: 'งานครุภัณฑ์', features: ['ทะเบียนครุภัณฑ์ (เลขครุภัณฑ์เป็นรหัสหลัก)', 'โอนย้าย / จำหน่าย / ซ่อมบำรุง', 'ตรวจสอบครุภัณฑ์ประจำปี', 'รองรับ QR Code/Barcode ในอนาคต'] },
  supplies: { label: 'งานพัสดุ', features: ['ทะเบียนพัสดุ', 'รับพัสดุ / เบิกจ่าย', 'คงเหลือและจุดสั่งซื้อ', 'แจ้งเตือนพัสดุใกล้หมด'] },
  disease: { label: 'งานส่งเสริมป้องกันควบคุมโรค', features: ['บันทึกกิจกรรม/โครงการ ตามหมู่บ้านและกลุ่มเป้าหมาย', 'รายงานตามเดือน ไตรมาส ปีงบประมาณ', 'งานเฝ้าระวังโรค วัคซีน คัดกรอง ไข้เลือดออก ฯลฯ'] },
  nursing: { label: 'งานการพยาบาล', features: ['กำหนดรายละเอียดงานร่วมกับ ผอ. ในรอบถัดไป'] },
  academic: { label: 'งานวิชาการ', features: ['กำหนดรายละเอียดงานร่วมกับ ผอ. ในรอบถัดไป'] },
};
