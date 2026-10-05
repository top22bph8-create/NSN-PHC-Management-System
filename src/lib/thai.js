// ฟังก์ชันวันที่แบบไทย และปีงบประมาณ (1 ต.ค. - 30 ก.ย.)
export const thMonths = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

const pad = (n) => String(n).padStart(2, '0');

// วันที่วันนี้รูปแบบ YYYY-MM-DD (ค.ศ.) ตามเวลาเครื่อง
export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// เวลาปัจจุบันรูปแบบ HH:mm ตามเวลาเครื่อง (ใช้บันทึกเวลารับหนังสือแบบอัตโนมัติ)
export function nowTimeStr() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

// แสดงวันที่เป็น วว/ดด/พ.ศ.
export function fmtDate(s) {
  if (!s) return '-';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${Number(y) + 543}`;
}

export function fmtDateTime(ts) {
  if (!ts) return '-';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear() + 543} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ปีงบประมาณ (พ.ศ.) ของวันที่ YYYY-MM-DD : ต.ค.-ธ.ค. นับเป็นปีถัดไป
export function fiscalYearBE(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return (m >= 10 ? y + 1 : y) + 543;
}

// ปีงบประมาณเริ่มต้นที่ระบบเปิดให้เลือกใช้งานได้ (พ.ศ. 2569 เป็นต้นไป ไม่มีปีงบประมาณก่อนหน้านี้ให้เลือก)
export const START_FISCAL_YEAR = 2569;

export const currentFiscalYear = () => Math.max(fiscalYearBE(todayStr()), START_FISCAL_YEAR);

export function fiscalYearOptions() {
  const cur = currentFiscalYear();
  const list = [];
  for (let y = START_FISCAL_YEAR; y <= cur + 1; y++) list.push(y);
  return list;
}

export const fmtBaht = (n) =>
  Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// แสดงวันที่แบบยาว "18 ตุลาคม 2566" (ใช้ในแบบฟอร์มใบลาที่พิมพ์)
export function fmtDateLong(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  return `${d} ${thMonths[m - 1]} ${y + 543}`;
}

// คำนวณระยะเวลาจากวันที่ที่กำหนด (YYYY-MM-DD) ถึงวันนี้ เป็น "ปี เดือน วัน" — ใช้คำนวณอายุคนจากวันเกิด
// และอายุราชการจากวันบรรจุเป็นข้าราชการ (ทำเนียบบุคลากร) คืนค่า null ถ้าไม่มีวันที่ หรือวันที่อยู่ในอนาคต
export function calcDuration(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  if (start > now) return null;
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  let days = now.getDate() - start.getDate();
  if (days < 0) {
    months -= 1;
    days += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months, days };
}

export const fmtDuration = (dur) => (dur ? `${dur.years} ปี ${dur.months} เดือน ${dur.days} วัน` : '-');
