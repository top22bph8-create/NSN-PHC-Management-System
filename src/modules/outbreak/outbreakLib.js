// โมดูลสอบสวนโรคและเฝ้าระวังทางระบาดวิทยา — ค่าคงที่และฟังก์ชันวิเคราะห์ (แยกจากระบบเดิม)
// ข้อมูลเก็บใน Firestore: outbreakCases (เหตุการณ์) และ outbreakPeople (ผู้ป่วย/ผู้สัมผัส; kind = patient | contact)
import { DISEASE_LIST } from './diseaseTemplates';
export const DISEASES = DISEASE_LIST;
export const STATUS = { investigating: 'กำลังสอบสวน', controlled: 'ควบคุมโรคแล้ว', closed: 'ปิดเหตุการณ์' };
export const STATUS_TONE = { investigating: 'bg-amber-100 text-amber-800', controlled: 'bg-emerald-100 text-emerald-800', closed: 'bg-slate-200 text-slate-700' };
export const PERSON_STATUS = ['ป่วย (รักษาอยู่)', 'หายแล้ว', 'เสียชีวิต', 'ติดตามอยู่ (ผู้สัมผัส)', 'ไม่ป่วย'];
export const SEX = { 1: 'ชาย', 2: 'หญิง', '': 'ไม่ระบุ' };
export const AGE_BANDS = [['0-4', 0, 4], ['5-14', 5, 14], ['15-24', 15, 24], ['25-59', 25, 59], ['60+', 60, 200]];
export const AGE_ORDER = [...AGE_BANDS.map((b) => b[0]), 'ไม่ทราบอายุ'];

export const nf = (n) => Number(n || 0).toLocaleString('th-TH');
export const vilLabel = (v) => (v ? `ม.${String(v).replace(/[^0-9A-Za-zก-๙/]/g, '')}` : 'ไม่ระบุหมู่บ้าน');
export const ageBand = (a) => (a === '' || a == null || isNaN(Number(a)) ? 'ไม่ทราบอายุ' : (AGE_BANDS.find(([, lo, hi]) => Number(a) >= lo && Number(a) <= hi) || ['ไม่ทราบอายุ'])[0]);
export const isDead = (p) => p.status === 'เสียชีวิต';
export const countBy = (list, f) => { const o = {}; list.forEach((x) => { const k = f(x); o[k] = (o[k] || 0) + 1; }); return o; };

const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + n); const p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
// เส้นโค้งการระบาด: จำนวนผู้ป่วยตามวันเริ่มป่วย เติมวันที่ไม่มีผู้ป่วยเป็น 0 (ช่วงจำกัดไม่เกิน 120 วัน)
export function epiCurve(patients, { from, to } = {}) {
  const dates = patients.map((p) => p.onsetDate).filter(Boolean).sort();
  if (!dates.length && !from) return [];
  let a = from || dates[0]; let b = to || dates[dates.length - 1];
  if (a > b) [a, b] = [b, a];
  const m = countBy(patients.filter((p) => p.onsetDate), (p) => p.onsetDate); const out = [];
  let d = a; for (let i = 0; i < 120 && d <= b; i++) { out.push({ d, n: m[d] || 0 }); d = addDays(d, 1); }
  return out;
}

// สรุป Person / Time / Place ของผู้ป่วยในเคส
export function analyze(cs, patients, contacts) {
  const dead = patients.filter(isDead).length; const n = patients.length;
  const onsets = patients.map((p) => p.onsetDate).filter(Boolean).sort();
  const risk = Number(cs?.popAtRisk) || 0;
  const days = onsets.length ? Math.round((new Date(onsets[onsets.length - 1]) - new Date(onsets[0])) / 86400000) + 1 : 0;
  const missing = [];
  const miss = (label, f) => { const c = patients.filter(f).length; if (c) missing.push(`${label} ${c} ราย`); };
  miss('ยังไม่ระบุวันเริ่มป่วย', (p) => !p.onsetDate); miss('ยังไม่ระบุอายุ', (p) => p.age === '' || p.age == null); miss('ยังไม่ระบุเพศ', (p) => !p.sex); miss('ยังไม่ระบุหมู่บ้าน', (p) => !p.villageNo);
  if (!patients.length) missing.push('ยังไม่มีผู้ป่วยในเคส');
  if (!cs?.labs?.length) missing.push('ยังไม่มีผลตรวจทางห้องปฏิบัติการ');
  if (!cs?.measures?.length) missing.push('ยังไม่มีมาตรการควบคุมโรค');
  if (!contacts.length) missing.push('ยังไม่มีข้อมูลผู้สัมผัส');
  if (!risk) missing.push('ยังไม่ระบุประชากรเสี่ยง (คำนวณ Attack rate ไม่ได้)');
  return {
    n, dead, cfr: n ? (dead / n) * 100 : null, attack: risk && n ? (n / risk) * 100 : null, risk,
    first: onsets[0] || '', last: onsets[onsets.length - 1] || '', days,
    bySex: countBy(patients, (p) => SEX[p.sex] || 'ไม่ระบุ'), byAge: countBy(patients, (p) => ageBand(p.age)), byVillage: countBy(patients, (p) => vilLabel(p.villageNo)),
    curve: epiCurve(patients), missing,
  };
}

// ทะเบียนไฟล์สอบสวนโรค E0/E1/E2 — ชื่อเรียกอ้างอิงตามระยะของรายงานสอบสวน (ปรับข้อความได้ที่นี่ที่เดียว)
export const LEVELS = {
  E0: { t: 'E0 — รับแจ้ง/ตรวจสอบข่าวเหตุการณ์', tone: 'bg-sky-100 text-sky-800' },
  E1: { t: 'E1 — รายงานสอบสวนเบื้องต้น', tone: 'bg-amber-100 text-amber-800' },
  E2: { t: 'E2 — รายงานสอบสวนฉบับสมบูรณ์', tone: 'bg-emerald-100 text-emerald-800' },
};
export const FILE_SOURCES = ['โรงพยาบาล', 'สำนักงานสาธารณสุขอำเภอ', 'สำนักงานสาธารณสุขจังหวัด', 'ทีม SRRT/หน่วยงานอื่น', 'รพ.สต.เอง'];
export const fullName = (p) => (p.firstName || p.lastName ? `${p.firstName || ''} ${p.lastName || ''}`.trim() : p.name || '');
export const maskId = (s) => { const d = String(s || '').replace(/\D/g, ''); return d.length === 13 ? `•••••••••${d.slice(-4)}` : d ? '•••••' : '-'; };
// ตรวจเลขหลักตรวจสอบของเลขบัตรประชาชน 13 หลัก
export const validThaiId = (s) => { const d = String(s || '').replace(/\D/g, ''); if (d.length !== 13) return false; let sum = 0; for (let i = 0; i < 12; i++) sum += Number(d[i]) * (13 - i); return (11 - (sum % 11)) % 10 === Number(d[12]); };
export const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.ceil((b || 0) / 1024)} KB`);
