// รายงานทะเบียนผู้ป่วยจิตเวช — ExcelJS (มีสีตามกลุ่มสี เขียว/เหลือง/แดง)
import { fmtDate, todayStr } from './thai';

const FILL = { 'เขียว': 'FF22C55E', 'เหลือง': 'FFFDE047', 'แดง': 'FFDC2626' };
const FONT = { 'เขียว': 'FFFFFFFF', 'เหลือง': 'FF422006', 'แดง': 'FFFFFFFF' };
const GROUPS = ['จิตเวช', 'จิตเวชที่ใช้สารเสพติด'];
const COLORS = ['เขียว', 'เหลือง', 'แดง'];

const ageOf = (b) => {
  if (!b) return '';
  const d = new Date(b);
  if (isNaN(d)) return '';
  const n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a -= 1;
  return a;
};

function head(ws, text, cols) {
  ws.mergeCells(1, 1, 1, cols);
  ws.getCell(1, 1).value = text;
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  ws.getCell(1, 1).alignment = { horizontal: 'center' };
  ws.getRow(2).values = [];
}
function headerRow(row) {
  row.eachCell((c) => {
    c.font = { bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9C3F0' } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });
}
function box(row) {
  row.eachCell({ includeEmpty: true }, (c) => { c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }; });
}

export async function exportMentalReport(cfg, rows, villageOf = {}) {
  const ExcelJS = (await import('exceljs')).default || (await import('exceljs'));
  const wb = new ExcelJS.Workbook();
  const sorted = [...rows].sort((a, b) => (Number(a.moo) || 999) - (Number(b.moo) || 999) || String(a.name).localeCompare(String(b.name), 'th'));
  const title = 'ทะเบียนผู้ป่วยจิตเวช รพ.สต.บ้านหนองสนม';

  // 1) ทะเบียนรวม
  const ws = wb.addWorksheet('ทะเบียนรวม', { views: [{ state: 'frozen', ySplit: 3 }] });
  const cols = [
    ['ลำดับ', 6], ['เลขบัตรประชาชน', 18], ['ชื่อ-สกุล', 26], ['อายุ', 7], ['บ้านเลขที่', 10], ['หมู่', 6], ['บ้าน', 18],
    ['กลุ่มผู้ป่วย', 22], ['กลุ่มสี', 10], ['การวินิจฉัย', 24], ['สารเสพติด', 18], ['SMI-V', 8], ['สถานพยาบาล', 20],
    ['ยาที่ใช้', 20], ['การกินยา', 14], ['เยี่ยมล่าสุด', 14], ['นัดครั้งถัดไป', 14], ['เบอร์โทร', 14], ['หมายเหตุ', 24],
  ];
  head(ws, `${title} (ข้อมูล ณ ${fmtDate(todayStr())})`, cols.length);
  ws.getRow(3).values = cols.map((c) => c[0]);
  headerRow(ws.getRow(3));
  cols.forEach((c, i) => { ws.getColumn(i + 1).width = c[1]; });
  sorted.forEach((r, i) => {
    const row = ws.addRow([
      i + 1, r.idCard || '', `${r.namePrefix || ''}${r.name || ''}`, ageOf(r.birthday), r.houseNo || '', r.moo || '', r.village || villageOf[String(r.moo)] || '',
      r.psychGroup || '', r.colorGroup || '', r.diagnosis || '', r.substanceType || '', r.smiV || '', r.hospital || '',
      r.medication || '', r.adherence || '', r.lastVisit ? fmtDate(r.lastVisit) : '', r.nextAppt ? fmtDate(r.nextAppt) : '', r.phone || '', r.note || r.remark || '',
    ]);
    box(row);
    row.getCell(2).numFmt = '@';
    const c = r.colorGroup;
    if (FILL[c]) {
      const cell = row.getCell(9);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[c] } };
      cell.font = { bold: true, color: { argb: FONT[c] } };
      cell.alignment = { horizontal: 'center' };
    }
    if (r.psychGroup === GROUPS[1]) row.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE4E6' } };
  });
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: cols.length } };

  // 2) สรุปรายหมู่บ้าน × กลุ่ม × สี
  const ss = wb.addWorksheet('สรุปรายหมู่บ้าน');
  const sh = ['หมู่', 'บ้าน', 'จิตเวช', 'จิตเวช+สารเสพติด', 'รวม', 'เขียว', 'เหลือง', 'แดง', 'ยังไม่ระบุสี'];
  head(ss, `สรุปจำนวนผู้ป่วยจิตเวชรายหมู่บ้าน — ${title}`, sh.length);
  ss.getRow(3).values = sh;
  headerRow(ss.getRow(3));
  [8, 22, 12, 18, 10, 10, 10, 10, 14].forEach((w, i) => { ss.getColumn(i + 1).width = w; });
  const moos = [...new Set(rows.map((r) => String(r.moo || '')))].sort((a, b) => (Number(a) || 999) - (Number(b) || 999));
  const cnt = (list, f) => list.filter(f).length;
  const totalRow = [0, 0, 0, 0, 0, 0, 0];
  moos.forEach((m) => {
    const l = rows.filter((r) => String(r.moo || '') === m);
    const v = [cnt(l, (r) => r.psychGroup !== GROUPS[1]), cnt(l, (r) => r.psychGroup === GROUPS[1]), l.length, ...COLORS.map((c) => cnt(l, (r) => r.colorGroup === c)), cnt(l, (r) => !COLORS.includes(r.colorGroup))];
    v.forEach((x, i) => { totalRow[i] += x; });
    const row = ss.addRow([m || 'ไม่ระบุ', l.find((r) => r.village)?.village || villageOf[m] || '', ...v]);
    box(row);
    COLORS.forEach((c, i) => { if (FILL[c]) row.getCell(6 + i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[c] + '' } }, row.getCell(6 + i).font = { color: { argb: FONT[c] }, bold: true }; });
  });
  const tr = ss.addRow(['รวม', '', ...totalRow]);
  box(tr); tr.font = { bold: true };

  // 3) แยกรายกลุ่ม + รายชื่อกลุ่มสีแดง (เฝ้าระวัง)
  const addList = (name, list, note) => {
    const w = wb.addWorksheet(name);
    const h = ['ลำดับ', 'ชื่อ-สกุล', 'อายุ', 'บ้านเลขที่', 'หมู่', 'บ้าน', 'กลุ่มสี', 'การวินิจฉัย', 'การกินยา', 'เบอร์โทร', 'ติดตาม/หมายเหตุ'];
    head(w, `${note} (${list.length} ราย)`, h.length);
    w.getRow(3).values = h; headerRow(w.getRow(3));
    [6, 26, 7, 10, 6, 18, 10, 24, 14, 14, 30].forEach((x, i) => { w.getColumn(i + 1).width = x; });
    list.forEach((r, i) => {
      const row = w.addRow([i + 1, `${r.namePrefix || ''}${r.name || ''}`, ageOf(r.birthday), r.houseNo || '', r.moo || '', r.village || villageOf[String(r.moo)] || '', r.colorGroup || '', r.diagnosis || '', r.adherence || '', r.phone || '', '']);
      box(row);
      const c = r.colorGroup;
      if (FILL[c]) { row.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[c] } }; row.getCell(7).font = { bold: true, color: { argb: FONT[c] } }; }
    });
  };
  addList('กลุ่มจิตเวช', sorted.filter((r) => r.psychGroup !== GROUPS[1]), 'กลุ่มผู้ป่วยจิตเวช');
  addList('กลุ่มจิตเวช+สารเสพติด', sorted.filter((r) => r.psychGroup === GROUPS[1]), 'กลุ่มผู้ป่วยจิตเวชที่ใช้สารเสพติด');
  addList('เฝ้าระวัง-กลุ่มสีแดง', sorted.filter((r) => r.colorGroup === 'แดง'), 'ผู้ป่วยกลุ่มสีแดง (ก้าวร้าวทางอารมณ์ ความเสี่ยงสูง) — ต้องเฝ้าระวัง');

  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = `รายงานทะเบียนผู้ป่วยจิตเวช_${todayStr()}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}
