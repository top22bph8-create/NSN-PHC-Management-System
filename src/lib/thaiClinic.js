// คลินิกแพทย์แผนไทย — ระบบนัดจองคิวออนไลน์
// ฝั่งประชาชน (หน้า #/book-thai ไม่ต้องล็อกอิน) เรียก Cloud Functions: thaiPublicInfo / thaiBook / thaiLookup / thaiCancel
// ฝั่งเจ้าหน้าที่ อ่าน/เขียน Firestore: thaiBookings (รายการจอง) และ settings/thaiClinic (ตั้งค่าคลินิก)
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, functions } from '../firebase';

export const THAI_CLINIC = {
  providerName: 'พท.อาระยา ใจอุ่น', providerTitle: 'แพทย์แผนไทย', phone: '042-704651', bookingPhone: '080-481-0290',
};
export const THAI_STATUSES = ['รอยืนยัน', 'ยืนยันแล้ว', 'มารับบริการแล้ว', 'ไม่มาตามนัด', 'ยกเลิก'];
export const THAI_STATUS_COLOR = {
  'รอยืนยัน': 'bg-amber-100 text-amber-800',
  'ยืนยันแล้ว': 'bg-sky-100 text-sky-800',
  'มารับบริการแล้ว': 'bg-emerald-100 text-emerald-800',
  'ไม่มาตามนัด': 'bg-rose-100 text-rose-700',
  'ยกเลิก': 'bg-slate-200 text-slate-600',
};
export const THAI_ACTIVE = ['รอยืนยัน', 'ยืนยันแล้ว'];

// ต้องตรงกับ THAI_DEFAULT ใน functions/index.js
export const THAI_DEFAULT_CONFIG = {
  enabled: true,
  openDays: [1, 2, 3, 4, 5],
  // เช้า 2 คิว (09:00-10:00, 10:30-11:30) บ่าย 2 คิว (13:00-14:00, 14:30-15:30)
  slots: [{ start: '09:00', end: '10:00' }, { start: '10:30', end: '11:30' }, { start: '13:00', end: '14:00' }, { start: '14:30', end: '15:30' }],
  start: '08:30', end: '15:30', slotMinutes: 30, capacity: 1,
  lunchStart: '12:00', lunchEnd: '13:00',
  maxAdvanceDays: 30, minLeadMinutes: 60, maxActivePerPhone: 2,
  closedDates: [], outDates: [], closeOnHolidays: true,
  services: ['นวดไทยเพื่อการรักษา', 'ประคบสมุนไพร', 'อบไอน้ำสมุนไพร', 'ทับหม้อเกลือ', 'ตรวจรักษา/ให้คำปรึกษาแพทย์แผนไทย', 'อื่นๆ'],
  notice: '', dailySummary: false, lineOaId: '',
  ...THAI_CLINIC,
};

export async function getThaiConfig() {
  const s = await getDoc(doc(db, 'settings', 'thaiClinic'));
  return { ...THAI_DEFAULT_CONFIG, ...(s.exists() ? s.data() : {}) };
}
export const saveThaiConfig = (cfg) => setDoc(doc(db, 'settings', 'thaiClinic'), cfg, { merge: true });

const call = (name) => async (data) => {
  try { return (await httpsCallable(functions, name)(data || {})).data; } catch (err) {
    // functions/not-found = ยังไม่ได้ deploy ฟังก์ชันนี้ (ต่างจาก HttpsError('not-found') ที่เราโยนเองซึ่งมีข้อความภาษาไทย)
    const notDeployed = err.code === 'functions/not-found' && !/[ก-๙]/.test(err.message || '');
    const e = new Error(notDeployed ? `ระบบจองยังไม่พร้อมใช้งาน กรุณาโทรจองที่ ${THAI_CLINIC.phone}` : (err.message || 'เกิดข้อผิดพลาด'));
    e.code = err.code; throw e;
  }
};
export const thaiPublicInfo = call('thaiPublicInfo');
export const thaiBook = call('thaiBook');
export const thaiLookup = call('thaiLookup');
export const thaiCancel = call('thaiCancel');
export const thaiNextCode = call('thaiNextCode');

// ลิงก์หน้าจองสำหรับประชาชน (ใช้สร้าง QR Code)
export const thaiPublicUrl = () => `${window.location.origin}${window.location.pathname}#/book-thai`;

// ช่วงเวลาให้จองในแต่ละวัน -> [{ time: 'เริ่ม', end: 'สิ้นสุด' }] (ตรงกับ thaiSlotTimes ใน functions/index.js)
const toMin = (hhmm) => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const fmtHM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export function thaiSlotTimes(cfg) {
  const valid = Array.isArray(cfg.slots) ? cfg.slots.filter((x) => x && /^\d{2}:\d{2}$/.test(x.start) && /^\d{2}:\d{2}$/.test(x.end) && x.start < x.end) : [];
  if (valid.length) return valid.map((x) => ({ time: x.start, end: x.end })).sort((a, b) => a.time.localeCompare(b.time));
  const out = [];
  const step = Math.max(10, Number(cfg.slotMinutes) || 30);
  const ls = cfg.lunchStart ? toMin(cfg.lunchStart) : null;
  const le = cfg.lunchEnd ? toMin(cfg.lunchEnd) : null;
  for (let t = toMin(cfg.start); t + step <= toMin(cfg.end); t += step) {
    if (ls !== null && le !== null && t < le && t + step > ls) continue;
    out.push({ time: fmtHM(t), end: fmtHM(t + step) });
  }
  return out;
}
// "09:00 - 10:00" (ถ้ามีเวลาสิ้นสุด)
export const thaiTimeRange = (time, end) => (end ? `${time} - ${end}` : time);
// เบอร์โทรที่แสดง: [ป้ายกำกับ, เบอร์] (โทรจองคิว + โทรสอบถาม)
export const thaiPhones = (c) => [['โทรจองคิว', c?.bookingPhone || THAI_CLINIC.bookingPhone], ['โทรสอบถาม', c?.phone || THAI_CLINIC.phone]].filter((x) => x[1]);

// สีตามจำนวนคิวต่อวัน: 1 เขียว · 2 เหลือง · 3 ชมพู · 4 ขึ้นไป น้ำเงิน (0 = ไม่มีสี)
export const THAI_LOAD = [
  { n: 1, label: '1 คิว', cls: 'bg-green-500 text-white ring-green-600' },
  { n: 2, label: '2 คิว', cls: 'bg-yellow-300 text-yellow-950 ring-yellow-500' },
  { n: 3, label: '3 คิว', cls: 'bg-pink-400 text-white ring-pink-500' },
  { n: 4, label: '4 คิวขึ้นไป', cls: 'bg-blue-600 text-white ring-blue-700' },
];
export const thaiLoadClass = (n) => (n > 0 ? THAI_LOAD[Math.min(n, 4) - 1].cls : '');
// ลิงก์เปิดแชทไลน์ OA พร้อมข้อความรหัสจอง (ผู้จองกดส่งเพื่อรับข้อความยืนยันอัตโนมัติ)
export const thaiLineLink = (oaId, code) => (oaId ? `https://line.me/R/oaMessage/${encodeURIComponent(oaId.startsWith('@') ? oaId : `@${oaId}`)}/?${encodeURIComponent(code)}` : '');
