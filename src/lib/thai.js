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

export const currentFiscalYear = () => fiscalYearBE(todayStr());

export function fiscalYearOptions() {
  const cur = currentFiscalYear();
  const list = [];
  for (let y = cur - 2; y <= cur + 2; y++) list.push(y);
  return list;
}

export const fmtBaht = (n) =>
  Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
