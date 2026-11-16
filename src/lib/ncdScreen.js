// เกณฑ์คัดกรองเบาหวาน/ความดันโลหิตสูง (เฟส 1: ใช้แปลผลเบื้องต้นในแอปเท่านั้น ยังไม่เขียนกลับ JHCIS)
// อ้างอิงแนวทางกรมควบคุมโรค (เอกสารปี 2557) — ควรยืนยันกับแนวทาง/KPI ฉบับล่าสุดและแบบฟอร์มของ รพ.สต. ก่อนใช้จริง
export const AGE_GROUPS = [
  { key: '15-34', label: '15–34 ปี', min: 15, max: 34 },
  { key: '35-59', label: '35–59 ปี', min: 35, max: 59 },
];

export const ageFromBirth = (birth, on = new Date()) => {
  if (!birth) return null;
  const [y, m, d] = String(birth).split('-').map(Number);
  if (!y || !m || !d) return null;
  let a = on.getFullYear() - y;
  if (on.getMonth() + 1 < m || (on.getMonth() + 1 === m && on.getDate() < d)) a -= 1;
  return a >= 0 && a < 130 ? a : null;
};
export const ageGroupOf = (age) => AGE_GROUPS.find((g) => age >= g.min && age <= g.max)?.key || null;

export const calcBmi = (kg, cm) => {
  const w = Number(kg); const h = Number(cm) / 100;
  return w > 0 && h > 0 ? Math.round((w / (h * h)) * 10) / 10 : null;
};
// รอบเอวเกินเกณฑ์: ชาย ≥ 90 ซม. หญิง ≥ 80 ซม.
export const waistOver = (sex, waist) => { const w = Number(waist); return w > 0 && (sex === 'M' ? w >= 90 : w >= 80); };

const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));
const avg = (a, b) => (a != null && b != null ? (a + b) / 2 : a ?? b);

// ระดับความดัน: ใช้ค่าเฉลี่ยของการวัด 1–2 ครั้ง (ระดับรุนแรงกว่าของซิสโตลิก/ไดแอสโตลิกเป็นตัวตัดสิน)
export const BP_LEVELS = [
  { key: 'normal', label: 'ปกติ', tone: 'bg-emerald-100 text-emerald-800', action: 'ให้คำแนะนำทั่วไป' },
  { key: 'highnormal', label: 'ค่อนข้างสูง', tone: 'bg-yellow-100 text-yellow-800', action: 'เฝ้าระวัง ปรับพฤติกรรม' },
  { key: 'g1', label: 'สูงระดับ 1', tone: 'bg-orange-100 text-orange-800', action: 'กลุ่มสงสัย ส่งวัดซ้ำ/พบแพทย์' },
  { key: 'g2', label: 'สูงระดับ 2 ขึ้นไป', tone: 'bg-red-100 text-red-800', action: 'ส่งต่อพบแพทย์' },
];
export function classifyBp(s1, d1, s2, d2) {
  const sys = avg(num(s1), num(s2)); const dia = avg(num(d1), num(d2));
  if (sys == null || dia == null) return null;
  const lvl = (v, cuts) => cuts.filter((c) => v >= c).length; // จำนวนเกณฑ์ที่ผ่าน
  const i = Math.max(lvl(sys, [130, 140, 160]), lvl(dia, [85, 90, 100]));
  return { ...BP_LEVELS[i], sys: Math.round(sys), dia: Math.round(dia), index: i };
}

// ระดับน้ำตาล: อดอาหาร (FPG) หรือไม่อดอาหาร (ปลายนิ้ว)
export const GLU_LEVELS = [
  { key: 'normal', label: 'ปกติ', tone: 'bg-emerald-100 text-emerald-800', action: 'ให้คำแนะนำทั่วไป' },
  { key: 'risk', label: 'กลุ่มเสี่ยง', tone: 'bg-yellow-100 text-yellow-800', action: 'ปรับพฤติกรรม ตรวจซ้ำ' },
  { key: 'suspect', label: 'สงสัยเบาหวาน', tone: 'bg-red-100 text-red-800', action: 'ส่งตรวจยืนยัน/พบแพทย์' },
];
export function classifyGlucose(value, fasting) {
  const v = num(value);
  if (v == null) return null;
  const cuts = fasting ? [100, 126] : [140, 200];
  const i = cuts.filter((c) => v >= c).length;
  return { ...GLU_LEVELS[i], index: i };
}

// ข้อมูลที่ต้องเจาะน้ำตาลหรือไม่: 35–59 ปีเจาะทุกคน, 15–34 ปีเจาะเมื่อมีปัจจัยเสี่ยง
export const riskFactors = (r) => {
  const out = [];
  const bmi = calcBmi(r.weight, r.height);
  if (bmi != null && bmi >= 23) out.push(`BMI ${bmi}`);
  if (waistOver(r.sex, r.waist)) out.push('รอบเอวเกินเกณฑ์');
  if (r.familyDM) out.push('ญาติสายตรงเป็นเบาหวาน');
  if (r.familyHT) out.push('ญาติสายตรงเป็นความดันสูง');
  if (r.hxHT) out.push('เคยมีความดันสูง');
  if (r.smoke) out.push('สูบบุหรี่');
  if (r.alcohol) out.push('ดื่มสุรา');
  return out;
};
export function needGlucose(age, r) {
  const g = ageGroupOf(age);
  if (g === '35-59') return { need: true, why: 'อายุ 35–59 ปี เจาะน้ำตาลทุกคน' };
  if (g === '15-34') {
    const f = riskFactors(r).filter((x) => !/สูบ|ดื่ม/.test(x));
    return f.length ? { need: true, why: `มีปัจจัยเสี่ยง: ${f.join(', ')}` } : { need: false, why: 'อายุ 15–34 ปี ไม่มีปัจจัยเสี่ยง ไม่ต้องเจาะน้ำตาล' };
  }
  return { need: false, why: 'อายุนอกช่วงคัดกรอง (15–59 ปี)' };
}

// สรุปผลรวมของคนหนึ่ง: 0 ปกติ · 1 เสี่ยง · 2 สงสัย (ส่งต่อ)
export function overall(bp, glu) {
  const i = Math.max(bp ? (bp.index >= 2 ? 2 : bp.index) : 0, glu ? glu.index : 0);
  return [
    { key: 'normal', label: 'ปกติ', tone: 'bg-emerald-100 text-emerald-800' },
    { key: 'risk', label: 'กลุ่มเสี่ยง', tone: 'bg-yellow-100 text-yellow-800' },
    { key: 'suspect', label: 'กลุ่มสงสัย/ส่งต่อ', tone: 'bg-red-100 text-red-800' },
  ][i];
}
export const validCid = (s) => {
  const t = String(s || '').replace(/\D/g, '');
  if (t.length !== 13) return false;
  let sum = 0; for (let i = 0; i < 12; i++) sum += Number(t[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(t[12]);
};
