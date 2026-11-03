// คลินิกแพทย์แผนไทย — ระบบนัดจองคิวออนไลน์
// ฝั่งประชาชน (หน้า #/book-thai ไม่ต้องล็อกอิน) เรียก Cloud Functions: thaiPublicInfo / thaiBook / thaiLookup / thaiCancel
// ฝั่งเจ้าหน้าที่ อ่าน/เขียน Firestore: thaiBookings (รายการจอง) และ settings/thaiClinic (ตั้งค่าคลินิก)
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, functions } from '../firebase';

export const THAI_CLINIC = {
  providerName: 'พท.อาระยา ใจอุ่น', providerTitle: 'แพทย์แผนไทย', phone: '042-704651',
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
  start: '08:30', end: '15:30', slotMinutes: 30, capacity: 1,
  lunchStart: '12:00', lunchEnd: '13:00',
  maxAdvanceDays: 30, minLeadMinutes: 60, maxActivePerPhone: 2,
  closedDates: [], closeOnHolidays: true,
  services: ['นวดไทยเพื่อการรักษา', 'ประคบสมุนไพร', 'อบไอน้ำสมุนไพร', 'ทับหม้อเกลือ', 'ตรวจรักษา/ให้คำปรึกษาแพทย์แผนไทย', 'อื่นๆ'],
  notice: '', dailySummary: false,
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

// ลิงก์หน้าจองสำหรับประชาชน (ใช้สร้าง QR Code)
export const thaiPublicUrl = () => `${window.location.origin}${window.location.pathname}#/book-thai`;

// ช่วงเวลาให้จองในแต่ละวัน (ตรงกับ thaiSlotTimes ใน functions/index.js) ข้ามช่วงพักเที่ยง
const toMin = (hhmm) => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const fmtHM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export function thaiSlotTimes(cfg) {
  const out = [];
  const step = Math.max(10, Number(cfg.slotMinutes) || 30);
  const ls = cfg.lunchStart ? toMin(cfg.lunchStart) : null;
  const le = cfg.lunchEnd ? toMin(cfg.lunchEnd) : null;
  for (let t = toMin(cfg.start); t + step <= toMin(cfg.end); t += step) {
    if (ls !== null && le !== null && t < le && t + step > ls) continue;
    out.push(fmtHM(t));
  }
  return out;
}
