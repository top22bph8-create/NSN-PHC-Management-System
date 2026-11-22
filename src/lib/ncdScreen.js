// เกณฑ์คัดกรองเบาหวาน/ความดันโลหิตสูง (เฟส 1: ใช้แปลผลเบื้องต้นในแอปเท่านั้น ยังไม่เขียนกลับ JHCIS)
// อ้างอิงแนวทางกรมควบคุมโรค (เอกสารปี 2557) — ควรยืนยันกับแนวทาง/KPI ฉบับล่าสุดและแบบฟอร์มของ รพ.สต. ก่อนใช้จริง
export const AGE_GROUPS = [
  { key: '15-34', label: '15–34 ปี', min: 15, max: 34 },
  { key: '35-59', label: '35–59 ปี', min: 35, max: 59 },
  { key: '60+', label: '60 ปีขึ้นไป', min: 60, max: 130 },
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

// ปัจจัยเสี่ยงทางร่างกาย/ประวัติ (ใช้ตัดสินว่าต้องเจาะน้ำตาลในกลุ่ม 15–34 ปี) และพฤติกรรมเสี่ยง (แสดงประกอบ/ให้คำแนะนำ)
export const metabolicRisks = (r) => {
  const out = [];
  const bmi = calcBmi(r.weight, r.height);
  if (bmi != null && bmi >= 23) out.push(`BMI ${bmi}`);
  if (waistOver(r.sex, r.waist)) out.push('รอบเอวเกินเกณฑ์');
  if (r.familyDM) out.push('ญาติสายตรงเป็นเบาหวาน');
  if (r.familyHT) out.push('ญาติสายตรงเป็นความดันสูง');
  if (r.hxHT) out.push('เคยมีความดันสูง');
  return out;
};
export const lifestyleRisks = (r) => {
  const out = [];
  if (r.smokeStatus === 'current' || r.smoke) out.push('สูบบุหรี่');
  if ((r.alcoholFreq && r.alcoholFreq !== 'none' && r.alcoholFreq !== 'former') || r.alcohol) out.push(r.alcoholFreq === 'regular' ? 'ดื่มสุราเป็นประจำ' : 'ดื่มสุรา');
  if (r.exercise === 'low') out.push('ออกกำลังกายไม่พอ');
  if (r.sweet === 'often') out.push('หวานจัด/ดื่มน้ำหวานบ่อย');
  if (r.salty === 'often') out.push('เค็มจัด');
  if (r.veg === 'low') out.push('กินผักผลไม้น้อย');
  return out;
};
// สุขภาพจิต/สารเสพติด (ตามรายการคัดกรองของ สปสช. ข้อ 20: ความเครียดและซึมเศร้า บุหรี่ สารเสพติด)
// 2Q: ตอบ "มี" ข้อใดข้อหนึ่ง = ผิดปกติ (ควรประเมินต่อด้วย 9Q) · ST-5 รวม 0–15
export function classify2Q(a, b) {
  if (a === '' || a == null || b === '' || b == null) return null;
  return a || b ? { key: 'positive', label: '2Q ผิดปกติ (ควรประเมิน 9Q)', tone: 'bg-orange-100 text-orange-800', pp: '1B0211' } : { key: 'normal', label: '2Q ปกติ', tone: 'bg-emerald-100 text-emerald-800', pp: '1B0210' };
}
export function classifySt5(v) {
  if (v === '' || v == null || Number.isNaN(Number(v))) return null;
  const n = Number(v);
  if (n <= 4) return { key: 'low', label: 'เครียดน้อย', tone: 'bg-emerald-100 text-emerald-800' };
  if (n <= 7) return { key: 'mid', label: 'เครียดปานกลาง', tone: 'bg-yellow-100 text-yellow-800' };
  if (n <= 9) return { key: 'high', label: 'เครียดมาก', tone: 'bg-orange-100 text-orange-800' };
  return { key: 'severe', label: 'เครียดมากที่สุด', tone: 'bg-red-100 text-red-800' };
}
// ความเสี่ยงโรคหัวใจและหลอดเลือด (% จากโปรแกรม Thai CV risk — กรอกค่าที่คำนวณได้)
export function classifyCvd(v) {
  if (v === '' || v == null || Number.isNaN(Number(v))) return null;
  const n = Number(v);
  if (n < 10) return { key: 'low', label: 'เสี่ยงต่ำ', tone: 'bg-emerald-100 text-emerald-800' };
  if (n < 20) return { key: 'mid', label: 'เสี่ยงปานกลาง', tone: 'bg-yellow-100 text-yellow-800' };
  if (n < 30) return { key: 'high', label: 'เสี่ยงสูง', tone: 'bg-orange-100 text-orange-800' };
  return { key: 'vhigh', label: 'เสี่ยงสูงมาก', tone: 'bg-red-100 text-red-800' };
}
export const needCvd = (age) => age != null && age >= 35 && age <= 59;
export const needLipid = (age) => age != null && age >= 45 && age <= 70;
export const COUNSEL = [['food', 'อาหาร (ลดหวาน มัน เค็ม)'], ['exercise', 'ออกกำลังกาย'], ['smoke', 'เลิกบุหรี่'], ['alcohol', 'ลดเครื่องดื่มแอลกอฮอล์'], ['stress', 'จัดการความเครียด']];
// รหัส Specialpp ที่ควรบันทึกใน JHCIS (ผู้ที่สูบ/ดื่มอยู่ รพ.สต. ไม่บันทึกรหัส 1B5x/1B6x ในวิสิตคัดกรอง ตามข้อมูลจริงที่ตรวจพบ — จึงไม่สร้างรหัสให้) (ใช้เป็นรายการช่วยจำ/เตรียมเขียนกลับ — ยังไม่ได้เขียนอัตโนมัติ)
export function ppCodes(r) {
  const out = [];
  const q = classify2Q(r.q2a, r.q2b); if (q) out.push(q.pp);
  if (r.smokeStatus === 'never') out.push('1B52'); else if (r.smokeStatus === 'former') out.push('1B51'); 
  if (r.alcoholFreq === 'none') out.push('1B600'); else if (r.alcoholFreq === 'former') out.push('1B601');;
  if ((r.counsel || []).length) out.push('1F38');
  return out;
}
// ครบรายการตามเงื่อนไข สปสช. ข้อ 20 (อายุ 15–59 ปี) → ควรคีย์ค่าบริการ 12001 (100 บาท) ใน JHCIS ด้วยมือ
export function feeStatus(r) {
  const age = r.age ?? ageFromBirth(r.birthDate);
  if (age == null || age < 15 || age > 59) return { eligible: false, missing: [], note: 'อายุนอกช่วงเบิก 15–59 ปี' };
  const missing = [];
  if (!(Number(r.sbp1) > 0 && Number(r.dbp1) > 0)) missing.push('BP');
  if (!(Number(r.weight) > 0 && Number(r.height) > 0)) missing.push('BMI');
  if (classify2Q(r.q2a, r.q2b) == null) missing.push('2Q');
  if (classifySt5(r.st5) == null) missing.push('ST-5');
  if (!r.smokeStatus) missing.push('บุหรี่');
  if (!r.alcoholFreq) missing.push('สุรา');
  if (!r.drug) missing.push('สารเสพติด');
  if (age >= 35 && r.glucose === '' ) missing.push('น้ำตาล');
  return { eligible: !missing.length, missing, code: age <= 34 ? '12001' : '12001' };
}
export const mentalRisks = (r) => {
  const out = []; const q = classify2Q(r.q2a, r.q2b); const t = classifySt5(r.st5);
  if (q?.key === 'positive') out.push('2Q ผิดปกติ');
  if (t && (t.key === 'high' || t.key === 'severe')) out.push(`ST-5 ${r.st5} (${t.label})`);
  if (r.drug === 'yes') out.push('ใช้สารเสพติด');
  return out;
};
export const riskFactors = (r) => [...metabolicRisks(r), ...lifestyleRisks(r), ...mentalRisks(r)];
// เจาะน้ำตาลหรือไม่: 35–59 ปีเจาะทุกคน, 15–34 ปีเจาะเมื่อมีปัจจัยเสี่ยงทางร่างกาย/ประวัติ
export function needGlucose(age, r) {
  const g = ageGroupOf(age);
  if (g === '35-59') return { need: true, why: 'อายุ 35–59 ปี เจาะน้ำตาลทุกคน' };
  if (g === '60+') return { need: true, why: 'อายุ 60 ปีขึ้นไป เจาะน้ำตาลทุกคน (ใช้เกณฑ์เดียวกับ 35+)' };
  if (g === '15-34') {
    const f = metabolicRisks(r);
    return f.length ? { need: true, why: `มีปัจจัยเสี่ยง: ${f.join(', ')}` } : { need: false, why: 'อายุ 15–34 ปี ไม่มีปัจจัยเสี่ยง ไม่ต้องเจาะน้ำตาล' };
  }
  return { need: false, why: 'อายุต่ำกว่า 15 ปี ไม่อยู่ในกลุ่มคัดกรอง' };
}
// อาการเบาหวาน 8 ข้อ ตามแบบฟอร์มการตรวจสุขภาพประชาชน (15 ปีขึ้นไป) ข้อ 1) — คงรายการ SYMPTOMS เดิมไว้ ไม่แทนที่
export const DM_SYM = [['foot', 'แผลที่เท้า/ตัดขา (จากเบาหวาน)'], ['thirst', 'ดื่มน้ำบ่อยมาก'], ['nocturia', 'ปัสสาวะตอนกลางคืน 3 ครั้งขึ้นไป'], ['eatthin', 'กินจุแต่ผอมลง'], ['lip', 'เป็นแผลที่ริมฝีปากบ่อย หายยาก'], ['numb', 'ชาตามปลายมือปลายเท้า'], ['knee', 'ปวดหรือรู้สึกขัดข้อเข่า'], ['wtloss', 'น้ำหนักลด อ่อนเพลีย']];
export const SYMPTOMS = [['polyuria', 'ปัสสาวะบ่อย/กลางคืน'], ['polydipsia', 'กระหายน้ำมาก'], ['weightloss', 'น้ำหนักลดโดยไม่ทราบสาเหตุ'], ['headache', 'ปวดศีรษะ/เวียนศีรษะบ่อย'], ['blurred', 'ตามัว'], ['numb', 'ชาปลายมือปลายเท้า']];
// คำแนะนำตามผลสรุป (เบื้องต้น — ใช้ดุลยพินิจเจ้าหน้าที่ประกอบ)
export function adviceFor(ov, r) {
  const base = ['ออกกำลังกายสม่ำเสมอ อย่างน้อย 150 นาที/สัปดาห์', 'ลดหวาน มัน เค็ม กินผักผลไม้ให้มาก', 'งดสูบบุหรี่ ลดเครื่องดื่มแอลกอฮอล์'];
  const mental = mentalRisks(r || {}).length ? ['พบความเสี่ยงสุขภาพจิต/สารเสพติด: ให้คำปรึกษา ประเมิน 9Q หรือส่งต่อตามแนวทาง'] : [];
  if (ov?.key === 'suspect') return [...mental, 'นัดตรวจยืนยัน/ส่งพบแพทย์ภายใน 1–2 สัปดาห์ (ตามดุลยพินิจเจ้าหน้าที่)', 'งดอาหารมื้อเย็นก่อนวันตรวจยืนยันหากต้องเจาะเลือดอดอาหาร', ...base.slice(0, 2)];
  if (ov?.key === 'risk') return [...mental, 'ปรับพฤติกรรมตามหลัก 3อ. 2ส. และติดตามน้ำหนัก/รอบเอว', 'วัดความดัน/ตรวจน้ำตาลซ้ำภายใน 3–6 เดือน', ...base];
  return [...mental, 'ผลปกติ คัดกรองซ้ำทุกปี', ...base];
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

// คำนวณค่าที่แปลผลจากข้อมูลดิบ (ใช้กับรายการที่ อสม. ส่งมา ซึ่งเก็บเฉพาะค่าดิบ และกับรายการเก่าที่ไม่มีค่าที่คำนวณ)
export function deriveRow(r) {
  if (r.overall && r.ageGroup) return r;
  const age = r.age ?? ageFromBirth(r.birthDate);
  const bp = classifyBp(r.sbp1, r.dbp1, r.sbp2, r.dbp2); const gl = classifyGlucose(r.glucose, r.fasting !== false);
  return { ...r, age, ageGroup: ageGroupOf(age), bmi: calcBmi(r.weight, r.height), bpSys: bp?.sys, bpDia: bp?.dia, bpLevel: bp?.key, gluLevel: gl?.key || '', overall: bp || gl ? overall(bp, gl).key : 'normal', risks: riskFactors(r) };
}
