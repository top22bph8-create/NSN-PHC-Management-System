// โมดูลประเมินความพึงพอใจผู้รับบริการ — ค่าคงที่ สูตรคำนวณ และตัวช่วยจัดกลุ่ม (คำนวณจากข้อมูลจริงเท่านั้น)
// คอลเลกชัน Firestore: satisfactionResponses (คำตอบ, ประชาชนสร้างได้โดยไม่ล็อกอิน) · satisfactionConfig/main (รายชื่อหมู่บ้าน/ประเภทบริการ)
import { fiscalYearBE } from '../../lib/thai';

export const QUESTIONS = [
  { k: 'q1', t: 'ความสะดวกในการเข้ารับบริการและระยะเวลารอคอย', s: 'ความสะดวก/ระยะเวลารอคอย', hint: 'เช่น ขั้นตอนไม่ยุ่งยาก รอไม่นานเกินไป' },
  { k: 'q2', t: 'ความสุภาพ เป็นมิตร และเอาใจใส่ของเจ้าหน้าที่', s: 'ความสุภาพ เป็นมิตร เอาใจใส่', hint: 'การพูดจา กิริยา และการดูแล' },
  { k: 'q3', t: 'การให้ข้อมูล คำแนะนำ และการอธิบายที่เข้าใจง่าย', s: 'การให้ข้อมูล/คำแนะนำ', hint: 'เจ้าหน้าที่อธิบายให้เข้าใจชัดเจน' },
  { k: 'q4', t: 'ความมั่นใจในคุณภาพและความปลอดภัยของบริการ', s: 'ความมั่นใจ คุณภาพ ความปลอดภัย', hint: 'รู้สึกมั่นใจและปลอดภัย' },
  { k: 'q5', t: 'ความสะอาด ความเป็นระเบียบ และสภาพแวดล้อมของสถานบริการ', s: 'ความสะอาด สภาพแวดล้อม', hint: 'อาคาร สถานที่ ห้องน้ำ ที่นั่งรอ' },
  { k: 'q6', t: 'ความพึงพอใจโดยรวมต่อการรับบริการที่ รพ.สต.บ้านหนองสนม', s: 'ความพึงพอใจโดยรวม', hint: 'ภาพรวมการมารับบริการครั้งนี้' },
];
export const SCALE = [
  { v: 5, t: 'มากที่สุด', e: '😍', c: '#15803d' },
  { v: 4, t: 'มาก', e: '🙂', c: '#4d9a3a' },
  { v: 3, t: 'ปานกลาง', e: '😐', c: '#ca8a04' },
  { v: 2, t: 'น้อย', e: '🙁', c: '#ea580c' },
  { v: 1, t: 'น้อยที่สุด', e: '😞', c: '#dc2626' },
];
export const DEFAULT_SERVICES = ['ผู้ป่วยทั่วไป', 'ผู้ป่วยโรคเรื้อรัง', 'บริการแพทย์แผนไทย', 'ส่งเสริมสุขภาพและป้องกันโรค', 'บริการอื่น ๆ'];
export const OTHER_VILLAGE = 'นอกเขตตำบล/ไม่ระบุ';
export const COMMENTS = [['good', 'สิ่งที่ท่านประทับใจในการรับบริการ'], ['improve', 'สิ่งที่ควรปรับปรุง'], ['other', 'ข้อเสนอแนะเพิ่มเติม']];
export const QK = QUESTIONS.map((q) => q.k);

// ระดับความพึงพอใจตามช่วงคะแนนเฉลี่ยมาตรฐาน 5 ระดับ
export const levelOf = (avg) => { if (avg == null) return '-'; const r = Number(avg.toFixed(2)); return r > 4.5 ? 'มากที่สุด' : r > 3.5 ? 'มาก' : r > 2.5 ? 'ปานกลาง' : r > 1.5 ? 'น้อย' : 'น้อยที่สุด'; };

// วันที่ตามเวลาไทย (UTC+7) จากเวลาเซิร์ฟเวอร์ของ Firestore
export const bkkParts = (ts) => {
  const ms = ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : Date.parse(ts);
  if (!isFinite(ms)) return null;
  const iso = new Date(ms + 7 * 3600 * 1000).toISOString();
  return { day: iso.slice(0, 10), time: iso.slice(11, 16) };
};
export const withDay = (rows) => rows.map((r) => { const p = bkkParts(r.createdAt); return p ? { ...r, day: p.day, time: p.time } : null; }).filter(Boolean);
const THM = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const monthLabel = (ym) => { const [y, m] = ym.split('-').map(Number); return `${THM[m - 1]} ${String(y + 543).slice(2)}`; };
export const quarterKey = (day) => { const [y, m] = day.split('-').map(Number); const fy = fiscalYearBE(day); const q = m >= 10 ? 1 : m <= 3 ? 2 : m <= 6 ? 3 : 4; return `${fy}-Q${q}`; };
export const quarterLabel = (k) => { const [fy, q] = k.split('-Q'); return `ปีงบ ${fy} ไตรมาส ${q}`; };
export const keyFns = { day: (r) => r.day, month: (r) => r.day.slice(0, 7), quarter: (r) => quarterKey(r.day), year: (r) => String(fiscalYearBE(r.day)), service: (r) => r.service || 'ไม่ระบุ', village: (r) => r.village || 'ไม่ระบุ' };

// สูตรตามที่กำหนด: ค่าเฉลี่ยรายด้าน = ผลรวมคะแนนด้านนั้น / จำนวนผู้ตอบด้านนั้น; ค่าเฉลี่ยรวม = ผลรวมคะแนนทุกข้อ / จำนวนคำตอบคะแนนทั้งหมด;
// ร้อยละพึงพอใจ = (จำนวนคะแนน 4 และ 5) / จำนวนคะแนนทั้งหมด × 100; ไม่มีข้อมูล -> ค่าว่าง (แสดง "ยังไม่มีข้อมูล") ไม่ใช้ตัวเลขจำลอง
export function summarize(rows) {
  const per = {}; let sum = 0; let cnt = 0; let hi = 0;
  QK.forEach((k) => { per[k] = { sum: 0, n: 0, hi: 0 }; });
  rows.forEach((r) => QK.forEach((k) => { const v = Number(r[k]); if (v >= 1 && v <= 5) { per[k].sum += v; per[k].n += 1; if (v >= 4) per[k].hi += 1; sum += v; cnt += 1; if (v >= 4) hi += 1; } }));
  const avgOf = (o) => (o.n ? o.sum / o.n : null);
  return {
    n: rows.length, scoreN: cnt, overall: cnt ? sum / cnt : null, pct: cnt ? (hi / cnt) * 100 : null,
    aspects: QK.map((k) => ({ k, n: per[k].n, avg: avgOf(per[k]), pct: per[k].n ? (per[k].hi / per[k].n) * 100 : null })),
    comments: rows.filter((r) => COMMENTS.some(([k]) => String(r[k] || '').trim())).length,
  };
}
export function groupBy(rows, keyFn, sortKeys = true) {
  const m = new Map(); rows.forEach((r) => { const k = keyFn(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
  const keys = [...m.keys()]; if (sortKeys) keys.sort();
  return keys.map((k) => ({ key: k, ...summarize(m.get(k)) }));
}
export const f2 = (x) => (x == null ? '-' : x.toFixed(2));
export const f1 = (x) => (x == null ? '-' : x.toFixed(1));
export const NO_DATA = 'ยังไม่มีข้อมูล';
