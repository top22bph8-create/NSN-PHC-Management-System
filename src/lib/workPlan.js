// แผนปฏิทินงานเก็บรายได้/ตัวชี้วัด ปีงบประมาณ 2570 (1 ต.ค. 2569 – 30 ก.ย. 2570) ของ รพ.สต.
// ที่มาของรายการ: เว็บตัวอย่าง witsanu-system.com/income_2570 (สรุปเป็นรายการติดตามงาน — โปรดตรวจเกณฑ์/อัตราจ่ายกับประกาศ สปสช. ฉบับจริงก่อนใช้ตัดสินใจ)
// ปี ค.ศ. ในข้อมูล: 2026-10-01 = 1 ต.ค. 2569
export const FY = 2570;
export const FY_START = '2026-10-01';
export const FY_END = '2027-09-30';

export const GROUPS = [
  { id: 1, name: 'HDC จัดการข้อมูลพื้นฐาน', tone: 'sky' },
  { id: 2, name: 'งานบริการอื่นๆ (คัดกรอง)', tone: 'emerald' },
  { id: 3, name: 'PP หญิงตั้งครรภ์ เด็ก ผู้สูงอายุ', tone: 'violet' },
  { id: 4, name: 'New E-Claim แม่และเด็ก', tone: 'rose' },
  { id: 5, name: 'Fee Schedule ทุกสิทธิ', tone: 'amber' },
  { id: 6, name: 'แพทย์แผนไทย (สิทธิ UC)', tone: 'teal' },
  { id: 7, name: 'KTB คัดกรอง/วัคซีน', tone: 'indigo' },
  { id: 8, name: 'MOPH Claim วัคซีน/แล็บ', tone: 'orange' },
];

// tr = รอบติดตาม: monthly / quarterly / semester (2 รอบ) / yearly (1 รอบ ครบกำหนดที่วันสิ้นสุด)
// rate = อัตราจ่ายต่อหน่วย { baht | pts, per }; auto = ดึงจำนวนจาก JHCIS อัตโนมัติ (ตอนนี้มีเฉพาะฝากครรภ์)
const I = (n, g, t, tr, o = {}) => ({ n, g, t, tr, s: FY_START, e: FY_END, ...o });
export const ITEMS = [
  I(1, 1, 'จัดการแฟ้ม PERSON ใน HDC', 'monthly', { s: '2026-10-15' }),
  I(2, 1, 'จัดการแฟ้ม DEATH ใน HDC', 'monthly', { s: '2026-10-15' }),
  I(3, 1, 'จัดการแฟ้ม CHRONIC ใน HDC', 'monthly', { s: '2026-10-15' }),
  I(4, 1, 'จัดการข้อมูล PERSON TYPEAREA (ประเภทพื้นที่)', 'monthly'),
  I(5, 2, 'คัดกรอง NCD (สุขภาพกาย/จิต) อายุ 15–59 ปี', 'quarterly'),
  I(6, 2, 'คัดกรองมะเร็งเต้านม หญิง 30–70 ปี (Z12.3 + SPP 1B003-)', 'quarterly'),
  I(7, 2, 'คัดกรองสุขภาพผู้สูงอายุ 9 ด้าน', 'quarterly'),
  I(8, 2, 'คัดกรองสุขภาพนักเรียนทุกระบบ (ตามภาคเรียน)', 'semester', { note: 'แบ่ง 2 รอบ: ต.ค.–มี.ค. / เม.ย.–ก.ย. (ประมาณ — ปรับตามภาคเรียนจริง)' }),
  I(9, 2, 'คัดกรองเกษตรกรหาสารเคมีตกค้าง', 'quarterly'),
  I(10, 2, 'ตรวจพัฒนาการ DSPM อายุ 9, 18, 30, 42, 60 เดือน', 'monthly'),
  I(11, 3, 'เด็ก 0–5 ปีได้รับการตรวจพัฒนาการ', 'quarterly'),
  I(12, 3, 'เด็ก 6–12 ปี ชั่งน้ำหนัก-วัดส่วนสูง', 'yearly', { e: '2027-03-31', s: '2026-04-01' }),
  I(13, 3, 'เคลือบฟลูออไรด์เด็กนักเรียน 4–12 ปี', 'yearly', { e: '2027-03-31', s: '2026-04-01' }),
  I(14, 3, 'เคลือบหลุมร่องฟันเด็กนักเรียน 6–12 ปี', 'yearly', { e: '2027-03-31', s: '2026-04-01' }),
  I(15, 3, 'คัดกรองภาวะซึมเศร้า อายุ 60 ปีขึ้นไป', 'yearly', { e: '2027-03-31', s: '2026-04-01' }),
  I(16, 4, 'ฝากครรภ์ (ANC) ครั้งที่ 1–8', 'monthly', { auto: 'anc' }),
  I(17, 4, 'ขัดทำความสะอาดฟันหญิงตั้งครรภ์ (ANC)', 'monthly', { note: 'ควรทำช่วงไตรมาส 2 ของการตั้งครรภ์' }),
  I(18, 4, 'ตรวจการตั้งครรภ์ (PRT) หญิงวัยเจริญพันธุ์', 'monthly'),
  I(19, 4, 'ตรวจหลังคลอด (PNC) ครั้งที่ 1–3', 'monthly'),
  I(20, 4, 'ยาไตรเฟอร์ดีนหลังคลอด 3 เดือน (90 เม็ด) ไม่เกิน 2 ครั้ง', 'monthly'),
  I(21, 4, 'คัดกรองมะเร็งปากมดลูก/ลำไส้ใหญ่ ด้วย FIT อายุ 50–70 ปี', 'monthly', { note: 'กลุ่มเป้าหมายทุก 2 ปี' }),
  I(22, 4, 'ยาเม็ดเหล็กโฟลิก หญิงไทยอายุ 13–45 ปี', 'monthly'),
  I(23, 4, 'ฟลูออไรด์เข้มข้นสำหรับกลุ่มเสี่ยง อายุ 25–59 ปี (22,600 ppm)', 'monthly'),
  I(24, 4, 'คัดกรองโลหิตจางจากการขาดธาตุเหล็ก (Hct) เด็ก 6–12 เดือน', 'monthly'),
  I(25, 5, 'ยาเม็ดเหล็กโฟลิกเด็ก 6–12 เดือน', 'monthly'),
  I(26, 5, 'ยาเม็ดคุมกำเนิดหญิงให้นมบุตร (1 ปี 6 เดือน)', 'monthly', { rate: { baht: 80, per: 'แผง' } }),
  I(27, 5, 'ยาฉีดคุมกำเนิด (ต่อแผง)', 'monthly', { rate: { baht: 40, per: 'แผง' } }),
  I(28, 5, 'ยาฉีดคุมกำเนิด (ต่อการฉีด)', 'monthly', { rate: { baht: 40, per: 'ครั้ง' } }),
  I(29, 5, 'ยาสมุนไพร 32 รายการ (เฉพาะสิทธิ UC, HERB_FS)', 'monthly'),
  I(30, 5, 'ผู้ป่วยนอกข้ามเขต (OP Anywhere) กรณีมีเหตุผลสมควร (UC)', 'monthly', { rate: { baht: 70, per: 'ครั้ง' } }),
  I(31, 5, 'ดูแลข้าราชการ/พนักงานส่วนท้องถิ่น (อปท.) เบิกตามจริง', 'monthly'),
  I(32, 6, 'นวดไทยแบบราชสำนัก', 'monthly', { rate: { pts: 200, per: 'ครั้ง' } }),
  I(33, 6, 'นวดราชสำนัก + ประคบสมุนไพร (สถานที่เดียวกัน)', 'monthly', { rate: { pts: 250, per: 'ครั้ง' } }),
  I(34, 6, 'ประคบสมุนไพร', 'monthly', { rate: { pts: 150, per: 'ครั้ง' } }),
  I(35, 6, 'ฟื้นฟูสภาพหลังคลอด (แพทย์แผนไทยเท่านั้น ครบ 5 กิจกรรม)', 'monthly', { rate: { pts: 500, per: 'ราย' } }),
  I(36, 6, 'อบไอน้ำสมุนไพร', 'monthly', { rate: { pts: 120, per: 'ครั้ง' } }),
  I(37, 6, 'พอกเข่าด้วยสมุนไพร (ครบ 5 กิจกรรม)', 'monthly', { rate: { pts: 300, per: 'ราย' }, note: '100 + 200 คะแนน' }),
  I(38, 6, 'ยาสมุนไพร HERB_GB นอกเหนือ 32 รายการ', 'monthly'),
  I(39, 7, 'วัคซีนไข้หวัดใหญ่ตามฤดูกาล 7 กลุ่มเสี่ยง', 'monthly', { s: '2027-05-01', e: '2027-08-31', rate: { baht: 20, per: 'โดส' } }),
  I(40, 7, 'คัดกรอง HPV มะเร็งปากมดลูก อายุ 30–59 ปี', 'monthly', { note: 'เป้าหมายทุก 5 ปี (ช่วงเวลาตามเว็บอ้างอิงไม่ชัดเจน ใช้ทั้งปีงบ)' }),
  I(41, 7, 'คัดกรองไวรัสตับอักเสบบี (HBsAg)', 'monthly'),
  I(42, 7, 'คัดกรองไวรัสตับอักเสบซี (HCV-Ab)', 'monthly'),
  I(43, 8, 'วัคซีน EPI ตามช่วงอายุ 0–14 ปี', 'monthly', { rate: { baht: 20, per: 'โดส' }, note: 'จ่ายเฉพาะที่ฉีดจริง' }),
  I(44, 8, 'วัคซีน dT อายุ 25 ปีขึ้นไป', 'monthly', { rate: { baht: 20, per: 'โดส' } }),
  I(45, 8, 'ตรวจ HbA1c ผู้ป่วยเบาหวานชนิดที่ 2', 'monthly'),
  I(46, 8, 'ตรวจ Creatinine/Potassium ผู้ป่วยความดันรายใหม่', 'monthly', { note: 'ต้องมีข้อตกลงกับโรงพยาบาล/แล็บก่อนเบิก' }),
];

const pad = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(y, m, 0).getDate();
const monthEnd = (y, m) => `${y}-${pad(m)}-${pad(lastDay(y, m))}`;

// รอบติดตามของรายการ: [{ key, label, start, end }] (ตัดตามช่วงวันที่ของรายการ)
export function periodsOf(item) {
  const out = [];
  if (item.tr === 'monthly') {
    for (let i = 0; i < 12; i++) {
      const m = ((9 + i) % 12) + 1; const y = m >= 10 ? 2026 : 2027;
      out.push({ key: `${y}-${pad(m)}`, start: `${y}-${pad(m)}-01`, end: monthEnd(y, m) });
    }
  } else if (item.tr === 'quarterly') {
    [['Q1', '2026-10-01', '2026-12-31'], ['Q2', '2027-01-01', '2027-03-31'], ['Q3', '2027-04-01', '2027-06-30'], ['Q4', '2027-07-01', '2027-09-30']].forEach(([key, start, end]) => out.push({ key, start, end }));
  } else if (item.tr === 'semester') {
    out.push({ key: 'H1', start: '2026-10-01', end: '2027-03-31' }, { key: 'H2', start: '2027-04-01', end: '2027-09-30' });
  } else out.push({ key: 'Y', start: item.s, end: item.e });
  return out.filter((p) => p.end >= item.s && p.start <= item.e).map((p) => ({ ...p, start: p.start < item.s ? item.s : p.start, end: p.end > item.e ? item.e : p.end }));
}
export const periodLabel = (item, p) => {
  if (item.tr === 'monthly') return ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][Number(p.key.slice(5))];
  if (item.tr === 'quarterly') return `ไตรมาส ${p.key.slice(1)}`;
  if (item.tr === 'semester') return p.key === 'H1' ? 'รอบ 1 (ต.ค.–มี.ค.)' : 'รอบ 2 (เม.ย.–ก.ย.)';
  return 'ทั้งรอบ';
};

export const ST = {
  done: { label: 'เสร็จแล้ว', cls: 'bg-emerald-100 text-emerald-700', cell: 'bg-emerald-400' },
  overdue: { label: 'เลยกำหนด', cls: 'bg-rose-100 text-rose-700', cell: 'bg-rose-400' },
  soon: { label: 'ใกล้ครบกำหนด', cls: 'bg-amber-100 text-amber-800', cell: 'bg-amber-400' },
  active: { label: 'กำลังดำเนินการ', cls: 'bg-sky-100 text-sky-700', cell: 'bg-sky-300' },
  future: { label: 'ยังไม่ถึงกำหนด', cls: 'bg-slate-100 text-slate-500', cell: 'bg-slate-200' },
};
const dayDiff = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

// รอบถือว่า "เสร็จ" เมื่อติ๊กเสร็จ หรือยอดที่ทำได้ถึงเป้ารายรอบ (เป้าทั้งปี ÷ จำนวนรอบ)
export function periodDone(rec, target, nPeriods) {
  if (rec?.done) return true;
  if (!(target > 0)) return Number(rec?.n || 0) > 0; // ไม่ตั้งเป้า: มีผลงานในรอบแล้วถือว่ารอบนั้นเสร็จ
  const pt = target > 0 ? target / nPeriods : 0;
  return pt > 0 && Number(rec?.n || 0) >= pt;
}
export function periodStatus(p, done, today, soonDays = 14) {
  if (done) return 'done';
  if (today < p.start) return 'future';
  if (today > p.end) return 'overdue';
  return dayDiff(today, p.end) <= soonDays ? 'soon' : 'active';
}

// สรุปผลของรายการ: สถานะรวม, ความก้าวหน้า, ผลงานรวม, ประมาณรายได้
export function summarize(item, doc, today, autoByPeriod = {}) {
  const ps = periodsOf(item);
  const target = Number(doc?.target || 0);
  const rows = ps.map((p) => {
    const rec = doc?.periods?.[p.key] || {};
    const n = rec.n != null && rec.n !== '' ? Number(rec.n) : (autoByPeriod[p.key] != null ? autoByPeriod[p.key] : 0);
    const done = periodDone({ ...rec, n }, target, ps.length);
    return { ...p, rec, n, done, status: periodStatus(p, done, today) };
  });
  const total = rows.reduce((a, r) => a + r.n, 0);
  const doneCnt = rows.filter((r) => r.done).length;
  const pct = target > 0 ? Math.min(100, Math.round((total / target) * 100)) : Math.round((doneCnt / rows.length) * 100);
  // สถานะรวม: เร่งด่วนสุดที่ยังไม่เสร็จ
  const rank = ['overdue', 'soon', 'active', 'future'];
  const open = rows.filter((r) => !r.done);
  const status = open.length === 0 ? 'done' : rank.find((k) => open.some((r) => r.status === k));
  const next = open.filter((r) => r.status !== 'future').sort((a, b) => a.end.localeCompare(b.end))[0] || open[0] || null;
  const r = item.rate;
  return { rows, total, doneCnt, pct, status, next, baht: r?.baht ? total * r.baht : 0, pts: r?.pts ? total * r.pts : 0 };
}
