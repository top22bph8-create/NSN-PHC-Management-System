// ส่งออก Excel รายงานพึงรับ รพ.สต. ให้เหมือนไฟล์รายงานของ รพ.สต.ดงสง่า (ชีต: สรุป / แดชบอร์ด / รายหมวด / ข้อมูลรายเคส / หมายเหตุ)
// และรายงานภาพรวมอำเภอ เรียงตามรหัส รพ.สต.
import { catRow, filterDocs, sumCatRows, sumRows, summaryRow, yymmOf } from './receivable';

const FONT = { name: 'Tahoma', size: 10 };
const C = { navy: 'FF1F4E79', head: 'FFD9E1F2', total: 'FFFFF2CC', ok: 'FFE2EFDA', note: 'FF595959' };
const thin = { style: 'thin', color: { argb: 'FFBFBFBF' } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const MONEY = '#,##0.00'; const INT = '#,##0'; const PCT = '0.0%';

function put(ws, r, c, v, o = {}) {
  const cell = ws.getCell(r, c); cell.value = v;
  cell.font = { ...FONT, ...(o.font || {}) };
  if (o.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: o.fill } };
  if (o.fmt) cell.numFmt = o.fmt;
  cell.alignment = { vertical: 'middle', horizontal: o.h, wrapText: !!o.wrap };
  if (o.border !== false) cell.border = BORDER;
  return cell;
}
const head = (ws, r, c, v) => put(ws, r, c, v, { fill: C.navy, font: { bold: true, color: { argb: 'FFFFFFFF' } }, h: 'center', wrap: true });
const title = (ws, text, sub, lastCol) => {
  put(ws, 1, 1, text, { font: { bold: true, size: 14, color: { argb: C.navy } }, border: false }); ws.mergeCells(1, 1, 1, lastCol);
  put(ws, 2, 1, sub, { font: { color: { argb: C.note } }, border: false, wrap: true }); ws.mergeCells(2, 1, 2, lastCol);
  ws.getRow(2).height = 30;
};
const dataBar = (ws, ref, argb = 'FF5B9BD5') => ws.addConditionalFormatting({ ref, rules: [{ type: 'dataBar', priority: 1, gradient: false, cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb } }] });

// รวมหลายงวดเป็นแถวเดียว (ใช้กับสรุปรายหน่วยในรายงานอำเภอ)
export function mergeDocs(docs, label) {
  const m = { period: label, normal: {}, appeal: {} };
  docs.forEach((d) => ['normal', 'appeal'].forEach((s) => Object.entries(d[s] || {}).forEach(([k, v]) => { if (typeof v === 'number') m[s][k] = (m[s][k] || 0) + v; })));
  return m;
}

const SUM_COLS = [['cases', INT], ['billed', MONEY], ['nPaid', MONEY], ['nOk', INT], ['nNo', INT], ['aPaid', MONEY], ['aOk', INT], ['aNo', INT], ['herb', MONEY], ['herbC', INT], ['ae', MONEY], ['aeC', INT], ['pp', MONEY], ['ppC', INT], ['fs', MONEY], ['fsC', INT], ['total', MONEY], ['totalC', INT]];

// ชีต "สรุป": rows = [{ label, row(summaryRow) }]  firstHeads = หัวคอลัมน์ 2 ช่องแรก
function summarySheet(ws, ttl, sub, firstHeads, items, totalRow, note) {
  const nFirst = firstHeads.length; const last = nFirst + SUM_COLS.length;
  title(ws, ttl, sub, last);
  const h1 = 4; const h2 = 5;
  firstHeads.forEach((t, i) => { head(ws, h1, i + 1, t); head(ws, h2, i + 1, ''); ws.mergeCells(h1, i + 1, h2, i + 1); });
  const col = (k) => nFirst + 1 + SUM_COLS.findIndex((x) => x[0] === k);
  head(ws, h1, col('cases'), 'จำนวนเคสทั้งหมด'); head(ws, h2, col('cases'), ''); ws.mergeCells(h1, col('cases'), h2, col('cases'));
  head(ws, h1, col('billed'), 'จำนวนเงินที่เรียกเก็บ'); head(ws, h2, col('billed'), ''); ws.mergeCells(h1, col('billed'), h2, col('billed'));
  const groups = [['nPaid', 3, 'กรณีเบิกปกติ', ['จำนวนเงินที่ได้รับ', 'จำนวนเคสที่ได้รับชดเชย', 'จำนวนเคสที่ไม่ได้รับชดเชย']], ['aPaid', 3, 'กรณีอุทธรณ์ข้อมูล', ['จำนวนเงินที่ได้รับ', 'จำนวนเคสที่ได้รับชดเชย', 'จำนวนเคสที่ไม่ได้รับชดเชย']],
    ['herb', 2, 'ยาสมุนไพร 9 รายการ', ['จำนวนเงิน', 'เคส']], ['ae', 2, 'AE', ['จำนวนเงิน', 'เคส']], ['pp', 2, 'PP', ['จำนวนเงิน', 'เคส']], ['fs', 2, 'FS (OP Anywhere)', ['จำนวนเงิน', 'เคส']], ['total', 2, 'รวมที่ได้รับชดเชย', ['จำนวนเงิน', 'เคส']]];
  groups.forEach(([k, n, t, subs]) => { const c0 = col(k); head(ws, h1, c0, t); for (let i = 1; i < n; i++) head(ws, h1, c0 + i, ''); subs.forEach((s, i) => head(ws, h2, c0 + i, s)); ws.mergeCells(h1, c0, h1, c0 + n - 1); });
  ws.getRow(h2).height = 42;
  let r = 6;
  const writeRow = (labels, row, o = {}) => {
    labels.forEach((v, i) => put(ws, r, i + 1, v, { fill: o.fill, font: { bold: !!o.bold }, h: i === 0 ? 'center' : undefined }));
    SUM_COLS.forEach(([k, f], i) => put(ws, r, nFirst + 1 + i, row[k] || 0, { fmt: f, fill: o.fill, font: { bold: !!o.bold } }));
    r += 1;
  };
  items.forEach((it, i) => writeRow([i + 1, ...it.labels], it.row));
  if (totalRow) { writeRow(['รวม', ...Array(nFirst - 1).fill('')], totalRow, { fill: C.total, bold: true }); }
  r += 1; put(ws, r, 1, note, { font: { color: { argb: C.note } }, border: false, wrap: true }); ws.mergeCells(r, 1, r, last); ws.getRow(r).height = 30;
  ws.getColumn(1).width = 8; ws.getColumn(2).width = nFirst === 2 ? 16 : 30; if (nFirst > 2) ws.getColumn(3).width = 16;
  SUM_COLS.forEach(([k], i) => { ws.getColumn(nFirst + 1 + i).width = k.endsWith('C') || ['cases', 'nOk', 'nNo', 'aOk', 'aNo', 'totalC'].includes(k) ? 12 : 15; });
  ws.views = [{ state: 'frozen', xSplit: nFirst, ySplit: 5 }];
}

const CAT_COLS = [['HC', MONEY], ['DRUG', MONEY], ['AE', MONEY], ['DMISHD', MONEY], ['PP', MONEY], ['FS', MONEY], ['OTHER', MONEY], ['total', MONEY], ['ppfs', MONEY], ['check', null], ['billed', MONEY], ['cases', INT], ['ok', INT], ['no', INT], ['pctOk', PCT], ['pctMoney', PCT]];
const CAT_HEAD = { HC: 'HC', DRUG: 'DRUG', AE: 'AE', DMISHD: 'DMISHD', PP: 'PP', FS: 'FS', OTHER: 'อื่นๆ', total: 'รวมยอดชดเชย', ppfs: 'PP&FS', check: 'ตรวจสอบ', billed: 'จำนวนเงินที่เรียกเก็บ', cases: 'เคสทั้งหมด', ok: 'เคสที่ได้รับชดเชย', no: 'เคสที่ไม่ได้รับชดเชย', pctOk: '% เคสที่ได้รับชดเชย', pctMoney: '% ชดเชย/เรียกเก็บ' };
function catSheet(ws, ttl, sub, firstHeads, items, totalRow) {
  const nFirst = firstHeads.length; const last = nFirst + CAT_COLS.length;
  title(ws, ttl, sub, last);
  firstHeads.forEach((t, i) => head(ws, 4, i + 1, t)); CAT_COLS.forEach(([k], i) => head(ws, 4, nFirst + 1 + i, CAT_HEAD[k])); ws.getRow(4).height = 36;
  let r = 5;
  const wr = (labels, row, o = {}) => { labels.forEach((v, i) => put(ws, r, i + 1, v, { fill: o.fill, font: { bold: !!o.bold }, h: i === 0 ? 'center' : undefined })); CAT_COLS.forEach(([k, f], i) => put(ws, r, nFirst + 1 + i, row[k] ?? 0, { fmt: f || undefined, fill: o.fill || (k === 'check' ? (row.check?.startsWith('ตรง') ? C.ok : 'FFF8CBAD') : undefined), font: { bold: !!o.bold }, h: k === 'check' ? 'center' : undefined })); r += 1; };
  items.forEach((it, i) => wr([i + 1, ...it.labels], it.row));
  if (totalRow) wr(['รวม', ...Array(nFirst - 1).fill('')], totalRow, { fill: C.total, bold: true });
  ws.getColumn(1).width = 8; ws.getColumn(2).width = nFirst === 2 ? 16 : 30; if (nFirst > 2) ws.getColumn(3).width = 16;
  CAT_COLS.forEach(([k], i) => { ws.getColumn(nFirst + 1 + i).width = k === 'check' ? 16 : 15; });
  ws.views = [{ state: 'frozen', xSplit: nFirst, ySplit: 4 }];
}

function notesSheet(ws, lines) {
  ws.getColumn(1).width = 34; ws.getColumn(2).width = 120;
  put(ws, 1, 1, 'หมายเหตุและวิธีคำนวณ', { font: { bold: true, size: 14, color: { argb: C.navy } }, border: false });
  lines.forEach(([a, b], i) => { put(ws, i + 3, 1, a, { font: { bold: !!a && !a.startsWith(' ') }, border: false, wrap: true }); put(ws, i + 3, 2, b, { border: false, wrap: true }); });
}
const COMMON_NOTES = [
  ['2. แบ่งข้อมูลปกติ/อุทธรณ์', 'ใช้หัวข้อ "ข้อมูลปกติ" และ "ข้อมูลอุทธรณ์" ในแต่ละไฟล์ (ส่วนหลัง = อุทธรณ์)'],
  ['3. ความหมายของคอลัมน์ในชีตสรุป', ''],
  ['   จำนวนเคสทั้งหมด', 'จำนวนเคสทั้งหมดในไฟล์ (ปกติ + อุทธรณ์)'],
  ['   จำนวนเงินที่เรียกเก็บ', 'ผลรวมคอลัมน์ เรียกเก็บ (R) ของเคสทั้งหมด (ปกติ + อุทธรณ์)'],
  ['   จำนวนเงินที่ได้รับ', 'ผลรวม ยอดชดเชยทั้งสิ้น (AQ) แยกปกติ / อุทธรณ์ (ค่าติดลบจากการปรับยอดถูกรวมแล้ว)'],
  ['   เคสที่ได้รับ / ไม่ได้รับชดเชย', 'ยอดชดเชยทั้งสิ้น > 0 = ได้รับชดเชย ; <= 0 = ไม่ได้รับชดเชย'],
  ['   ยาสมุนไพร 9 รายการ', 'ผลรวมคอลัมน์ HC (AE) ของรายงาน ; เคส = จำนวนเคสที่ยอด > 0'],
  ['   AE', 'ผลรวมคอลัมน์ AE (AG) + AE DRUG (AH) ; เคส = จำนวนเคสที่ AE + AE DRUG > 0'],
  ['   PP / FS (OP Anywhere)', 'ผลรวมคอลัมน์ PP (AO) / FS (AP) ; เคส = จำนวนเคสที่ยอด > 0'],
  ['   อื่นๆ (ชีตรายหมวด)', 'ยอดชดเชยทั้งสิ้น หักด้วย HC + DRUG + AE + DMISHD + PP + FS (รวม Palliative care ถ้ามี)'],
  ['4. งวดรายงาน', 'ถ้าชื่อไฟล์มีงวด (เช่น 6809_OP_02) ใช้ตามชื่อไฟล์ ถ้าเป็นไฟล์ที่โหลดจากระบบโดยตรง (Hsub_Report_...) ระบบอ่านงวดจากเลข REP เช่น 6710_REP00001 = เดือน 6710 รอบที่เริ่มที่ REP 00001'],
  ['5. หมวดที่ไม่มีในรายงานนี้', 'HPV DNA 68 / Tela-med69 / LAB-NCD69 (DM, HT) ไม่มีคอลัมน์ในรายงานพึงรับ รพสต.'],
  ['6. ข้อมูลส่วนบุคคล', 'ชีต "ข้อมูลรายเคส" ไม่รวมชื่อ-สกุลและเลขประจำตัวประชาชน (มีเพียง HN, TRAN_ID, REP) ก่อนส่งต่อโปรดตรวจสอบตามนโยบายของหน่วยงาน'],
];

function dashboardSheet(ws, ttl, sub, kpis, tables) {
  const last = 9; title(ws, ttl, sub, last);
  kpis.forEach(([lab, val, f, note], i) => {
    const c = 1 + (i % 3) * 3; const r = 4 + Math.floor(i / 3) * 4;
    put(ws, r, c, lab, { fill: C.head, font: { bold: true } }); put(ws, r, c + 1, '', { fill: C.head });
    put(ws, r + 1, c, val, { fmt: f, font: { bold: true, size: 16, color: { argb: C.navy } }, h: 'center' }); put(ws, r + 1, c + 1, '');
    put(ws, r + 2, c, note || '', { font: { color: { argb: C.note }, size: 9 } }); put(ws, r + 2, c + 1, '');
    [r, r + 1, r + 2].forEach((rr) => ws.mergeCells(rr, c, rr, c + 1)); ws.getRow(r + 1).height = 28;
  });
  let r = 4 + Math.ceil(kpis.length / 3) * 4 + 1;
  tables.forEach((t) => {
    put(ws, r, 1, t.title, { font: { bold: true, size: 11, color: { argb: C.navy } }, border: false }); ws.mergeCells(r, 1, r, last); r += 1;
    t.heads.forEach((h, i) => head(ws, r, i + 1, h)); r += 1; const r0 = r;
    t.rows.forEach((row) => { row.forEach((v, i) => put(ws, r, i + 1, v, { fmt: t.fmts[i] || undefined })); r += 1; });
    if (t.rows.length) t.bars.forEach((ci) => dataBar(ws, `${String.fromCharCode(64 + ci)}${r0}:${String.fromCharCode(64 + ci)}${r - 1}`, t.colors?.[ci] || 'FF5B9BD5'));
    r += 2;
  });
  ws.getColumn(1).width = 26; for (let c = 2; c <= last; c++) ws.getColumn(c).width = 18;
}


// ชีต "ข้อมูลรายเคส": blocks = [{ label: 'รหัส ชื่อหน่วย', ds: [งวด...], cases: [{period, rows}] }] เรียงตามลำดับที่ส่งมา
function caseSheet(wb, blocks) {
  const ws = wb.addWorksheet('ข้อมูลรายเคส');
  const heads = ['หน่วยบริการ', 'ลำดับงวด', 'รายงานงวด', 'ประเภทข้อมูล', 'REP', 'ลำดับที่', 'TRAN_ID', 'HN', 'วันเข้ารักษา', 'สิทธิ (MAININSCL)', 'PROJCODE', 'เรียกเก็บ', 'HC', 'DRUG', 'AE', 'AE-DRUG', 'DMISHD', 'PP', 'FS', 'อื่นๆ', 'ยอดชดเชยทั้งสิ้น', 'สถานะการชดเชย'];
  // หัวตารางสีเขียวอ่อน ตัวหนาสีดำ เหมือนชีตรายเคสของ รพ.สต.ดงสง่า
  heads.forEach((h, i) => put(ws, 1, i + 1, h, { fill: 'FFCCFFCC', font: { bold: true }, h: 'center', wrap: true })); ws.getRow(1).height = 32;
  let n = 2;
  blocks.forEach(({ label, ds, cases }) => {
    const idx = Object.fromEntries(ds.map((d, i) => [d.period, i + 1]));
    (cases || []).filter((c) => idx[c.period]).sort((a, b) => idx[a.period] - idx[b.period]).forEach((c) => c.rows.forEach((r) => {
      ws.addRow([label, idx[c.period], c.period, r[0] ? 'อุทธรณ์' : 'ปกติ', r[1], r[2], r[3], r[4], r[5] ? new Date(`${r[5]}T00:00:00Z`) : '', r[6], r[7], r[8], r[9], r[10], r[11], r[12], r[13], r[14], r[15], r[16], r[17], r[17] > 0 ? 'ได้รับชดเชย' : 'ไม่ได้รับชดเชย']); n += 1;
    }));
  });
  ws.getColumn(9).numFmt = 'yyyy-mm-dd'; for (let c = 12; c <= 21; c++) ws.getColumn(c).numFmt = '#,##0.00;\\-#,##0.00;"-"'; // ศูนย์แสดงเป็น "-"
  [26, 12, 14, 8, 14, 8, 13, 8, 14, 16, 12, 13, 12, 12, 12, 12, 12, 12, 12, 12, 16, 16].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.views = [{ state: 'frozen', ySplit: 1 }]; ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(n - 1, 1), column: heads.length } };
}

export async function buildUnitWorkbook({ unit, docs, cases, from, to, issued }) {
  const ExcelJS = (await import('exceljs')).default; const wb = new ExcelJS.Workbook(); wb.creator = 'NSN-PHC';
  const ds = filterDocs(docs, from, to);
  const sRows = ds.map((d) => ({ labels: [d.period], row: summaryRow(d) })); const sTot = sumRows(sRows.map((x) => x.row));
  const cRows = ds.map((d) => ({ labels: [d.period], row: catRow(d) })); const cTot = sumCatRows(cRows.map((x) => x.row));
  const first = ds[0]?.period || '-'; const lastP = ds[ds.length - 1]?.period || '-';
  const sub = `${unit.name} (${unit.code}) · ${ds.length} รายงานงวด (${first} ถึง ${lastP}) · ออกรายงาน ${issued}`;
  summarySheet(wb.addWorksheet('สรุป'), 'สรุปรายงานพึงรับ รพ.สต. - จำนวนเคสและจำนวนเงินที่ได้รับชดเชย', sub, ['ลำดับ', 'รายงานงวด'], sRows, sTot,
    'หมายเหตุ: ตัวเลขทุกช่องคำนวณจากชีต "ข้อมูลรายเคส" - รายละเอียดวิธีนับดูที่ชีต "หมายเหตุ"');
  // แดชบอร์ด
  const t = sTot; const rate = t.billed ? t.total / t.billed : 0; const okN = (t.nOk || 0) + (t.aOk || 0); const noN = (t.nNo || 0) + (t.aNo || 0);
  dashboardSheet(wb.addWorksheet('แดชบอร์ด'), 'แดชบอร์ดสรุปรายงานพึงรับ รพ.สต. - ผลการชดเชยรายงวด', sub, [
    ['เคสทั้งหมด', t.cases || 0, INT, `ปกติ ${((t.nOk || 0) + (t.nNo || 0)).toLocaleString('th-TH')} · อุทธรณ์ ${((t.aOk || 0) + (t.aNo || 0)).toLocaleString('th-TH')}`],
    ['จำนวนเงินที่เรียกเก็บ (บาท)', t.billed || 0, MONEY, 'ของเคสทั้งหมด'],
    ['จำนวนเงินที่ได้รับชดเชย (บาท)', t.total || 0, MONEY, `ปกติ ${Math.round(t.nPaid || 0).toLocaleString('th-TH')} · อุทธรณ์ ${Math.round(t.aPaid || 0).toLocaleString('th-TH')}`],
    ['เคสที่ได้รับชดเชย', okN, INT, t.cases ? `${((okN / t.cases) * 100).toFixed(1)}% ของเคสทั้งหมด` : ''],
    ['เคสที่ไม่ได้รับชดเชย', noN, INT, t.cases ? `${((noN / t.cases) * 100).toFixed(1)}% ของเคสทั้งหมด` : ''],
    ['เงินที่ได้รับ ÷ เรียกเก็บ', rate, PCT, okN ? `เฉลี่ย ${(t.total / okN).toFixed(2)} บาท/เคสที่ได้รับ` : ''],
  ], [
    { title: 'เรียกเก็บเทียบกับเงินที่ได้รับชดเชย รายงานงวด (บาท)', heads: ['รายงานงวด', 'เรียกเก็บ', 'ได้รับชดเชย', '% ชดเชย/เรียกเก็บ'], fmts: [null, MONEY, MONEY, PCT], bars: [2, 3], colors: { 2: 'FFA6A6A6', 3: 'FF5B9BD5' }, rows: cRows.map((x) => [x.labels[0], x.row.billed, x.row.total, x.row.pctMoney]) },
    { title: 'องค์ประกอบเงินที่ได้รับชดเชยตามหมวด รายงานงวด (บาท)', heads: ['รายงานงวด', 'HC (ยาสมุนไพร)', 'DRUG', 'AE', 'PP', 'FS', 'รวม'], fmts: [null, MONEY, MONEY, MONEY, MONEY, MONEY, MONEY], bars: [2, 3, 4, 5, 6, 7], rows: cRows.map((x) => [x.labels[0], x.row.HC, x.row.DRUG, x.row.AE, x.row.PP, x.row.FS, x.row.total]) },
    { title: 'เคสที่ได้รับ / ไม่ได้รับชดเชย รายงานงวด (เคส)', heads: ['รายงานงวด', 'ได้รับชดเชย', 'ไม่ได้รับชดเชย', '% ได้รับ'], fmts: [null, INT, INT, PCT], bars: [2, 3], colors: { 2: 'FF70AD47', 3: 'FFED7D31' }, rows: cRows.map((x) => [x.labels[0], x.row.ok, x.row.no, x.row.pctOk]) },
    { title: 'ยอดชดเชยรวมตามหมวด (บาท)', heads: ['หมวด', 'จำนวนเงิน'], fmts: [null, MONEY], bars: [2], rows: [['HC', cTot.HC], ['DRUG', cTot.DRUG], ['AE', cTot.AE], ['DMISHD', cTot.DMISHD], ['PP', cTot.PP], ['FS', cTot.FS], ['อื่นๆ', cTot.OTHER]] },
  ]);
  catSheet(wb.addWorksheet('รายหมวด'), 'ยอดชดเชยตามหมวด รายงานงวด (บาท)', 'รวมยอดชดเชย = HC + DRUG + AE + DMISHD + PP + FS + อื่นๆ ; PP&FS = PP + FS (ไม่นับซ้ำในยอดรวม) ; ช่อง "ตรวจสอบ" เทียบยอดรวมหมวดกับยอดชดเชยทั้งสิ้นในชีตสรุป', ['ลำดับ', 'รายงานงวด'], cRows, cTot);
  caseSheet(wb, [{ label: `${unit.code} ${unit.name}`, ds, cases }]);
  notesSheet(wb.addWorksheet('หมายเหตุ'), [['1. แหล่งข้อมูล', `รายงานพึงรับ รพสต. จำนวน ${ds.length} ไฟล์ (${first} ถึง ${lastP}) รวม ${(t.cases || 0).toLocaleString('th-TH')} เคส · หน่วยบริการ HCODE ${unit.code} (${unit.name})`], ['', 'สรุปเฉพาะไฟล์ที่นำเข้าในระบบ หากมีรายงานงวดเพิ่มต้องนำเข้าใหม่'], ...COMMON_NOTES]);
  return wb.xlsx.writeBuffer();
}

export async function buildDistrictWorkbook({ units, byUnit, from, to, issued, services, casesByUnit }) {
  const ExcelJS = (await import('exceljs')).default; const wb = new ExcelJS.Workbook(); wb.creator = 'NSN-PHC';
  const list = [...units].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const per = list.map(([code, name]) => { const ds = filterDocs(byUnit[code] || [], from, to); const m = mergeDocs(ds, `${code} ${name}`); return { code, name, ds, m }; });
  const withData = per.filter((p) => p.ds.length).length;
  const sub = `รายงานพึงรับ รพ.สต. อำเภอเมืองสกลนคร · เรียงตามรหัส รพ.สต. · นำเข้าแล้ว ${withData}/${per.length} หน่วย · ออกรายงาน ${issued}`;
  const sRows = per.map((p) => ({ labels: [`${p.code}  ${p.name}`, `${p.ds.length} งวด`], row: summaryRow(p.m) })); const sTot = sumRows(sRows.map((x) => x.row));
  // ชีตสรุปอำเภอ: 3 คอลัมน์แรก = ลำดับ, รพ.สต., จำนวนงวด
  summarySheet(wb.addWorksheet('สรุปอำเภอ'), 'สรุปรายงานพึงรับ รพ.สต. อำเภอเมือง - จำนวนเคสและจำนวนเงินที่ได้รับชดเชย (รายหน่วย)', sub, ['ลำดับ', 'รพ.สต.', 'จำนวนงวด'], sRows, sTot,
    'หมายเหตุ: รวมทุกงวดที่นำเข้าของแต่ละหน่วย — วิธีนับดูที่ชีต "หมายเหตุ"');
  const cRows = per.map((p) => ({ labels: [`${p.code}  ${p.name}`, `${p.ds.length} งวด`], row: catRow(p.m) })); const cTot = sumCatRows(cRows.map((x) => x.row));
  catSheet(wb.addWorksheet('รายหมวดอำเภอ'), 'ยอดชดเชยตามหมวด อำเภอเมือง (บาท) - รายหน่วย', 'รวมยอดชดเชย = HC + DRUG + AE + DMISHD + PP + FS + อื่นๆ ; PP&FS = PP + FS (ไม่นับซ้ำในยอดรวม)', ['ลำดับ', 'รพ.สต.', 'จำนวนงวด'], cRows, cTot);
  const t = sTot; const okN = (t.nOk || 0) + (t.aOk || 0); const noN = (t.nNo || 0) + (t.aNo || 0);
  dashboardSheet(wb.addWorksheet('แดชบอร์ดอำเภอ'), 'แดชบอร์ดรายงานพึงรับ รพ.สต. อำเภอเมืองสกลนคร', sub, [
    ['เคสทั้งหมด', t.cases || 0, INT, `${withData} หน่วยที่นำเข้าแล้ว`], ['จำนวนเงินที่เรียกเก็บ (บาท)', t.billed || 0, MONEY, ''], ['จำนวนเงินที่ได้รับชดเชย (บาท)', t.total || 0, MONEY, ''],
    ['เคสที่ได้รับชดเชย', okN, INT, t.cases ? `${((okN / t.cases) * 100).toFixed(1)}%` : ''], ['เคสที่ไม่ได้รับชดเชย', noN, INT, t.cases ? `${((noN / t.cases) * 100).toFixed(1)}%` : ''], ['เงินที่ได้รับ ÷ เรียกเก็บ', t.billed ? t.total / t.billed : 0, PCT, ''],
  ], [
    { title: 'เงินที่ได้รับชดเชย เทียบกับที่เรียกเก็บ รายหน่วย (บาท) — เรียงตามรหัส รพ.สต.', heads: ['รพ.สต.', 'เรียกเก็บ', 'ได้รับชดเชย', '% ชดเชย/เรียกเก็บ'], fmts: [null, MONEY, MONEY, PCT], bars: [2, 3], colors: { 2: 'FFA6A6A6', 3: 'FF5B9BD5' }, rows: cRows.map((x) => [x.labels[0], x.row.billed, x.row.total, x.row.pctMoney]) },
    { title: 'เคสที่ได้รับ / ไม่ได้รับชดเชย รายหน่วย', heads: ['รพ.สต.', 'ได้รับชดเชย', 'ไม่ได้รับชดเชย', '% ได้รับ'], fmts: [null, INT, INT, PCT], bars: [2, 3], colors: { 2: 'FF70AD47', 3: 'FFED7D31' }, rows: cRows.map((x) => [x.labels[0], x.row.ok, x.row.no, x.row.pctOk]) },
  ]);
  wb.getWorksheet('แดชบอร์ดอำเภอ').getColumn(1).width = 44;
  // รายเดือน × หน่วย
  const months = [...new Set(per.flatMap((p) => p.ds.map((d) => yymmOf(d.period))))].sort();
  const ws = wb.addWorksheet('รายเดือนตามหน่วย'); title(ws, 'เงินที่ได้รับชดเชยรายเดือน (บาท) แยกตาม รพ.สต.', sub, months.length + 3);
  ['ลำดับ', 'รพ.สต.', ...months, 'รวม'].forEach((h, i) => head(ws, 4, i + 1, h));
  const colTot = Array(months.length).fill(0);
  per.forEach((p, i) => { const r = 5 + i; put(ws, r, 1, i + 1, { h: 'center' }); put(ws, r, 2, `${p.code}  ${p.name}`);
    let rowTot = 0; months.forEach((m, j) => { const v = Math.round(p.ds.filter((d) => yymmOf(d.period) === m).reduce((s, d) => s + ((d.normal?.paid || 0) + (d.appeal?.paid || 0)), 0) * 100) / 100; rowTot += v; colTot[j] += v; put(ws, r, 3 + j, v, { fmt: MONEY }); });
    put(ws, r, 3 + months.length, rowTot, { fmt: MONEY, font: { bold: true }, fill: C.total }); });
  const rt = 5 + per.length; put(ws, rt, 1, 'รวม', { fill: C.total, font: { bold: true } }); put(ws, rt, 2, '', { fill: C.total });
  colTot.forEach((v, j) => put(ws, rt, 3 + j, v, { fmt: MONEY, fill: C.total, font: { bold: true } })); put(ws, rt, 3 + months.length, colTot.reduce((s, x) => s + x, 0), { fmt: MONEY, fill: C.total, font: { bold: true } });
  ws.getColumn(1).width = 8; ws.getColumn(2).width = 40; for (let c = 3; c <= months.length + 3; c++) ws.getColumn(c).width = 14; ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 4 }];
  // สรุปทุกบริการ (4 บริการที่ รพ.สกลนครจ่ายให้ รพ.สต.)
  if (services?.rows?.length) {
    const sv = wb.addWorksheet('สรุปทุกบริการ'); const keys = Object.keys(services.rows[0]); title(sv, 'สรุปทุกบริการ รพ.สต. อำเภอเมือง (Palliative / ยาสมุนไพร-พอกเข่า / Fit test / ไวรัสตับ บี-ซี)', services.note || '', keys.length);
    keys.forEach((k, i) => head(sv, 4, i + 1, k)); sv.getRow(4).height = 40;
    [...services.rows, services.total].forEach((r, i) => keys.forEach((k, j) => put(sv, 5 + i, j + 1, r[k] ?? '', { fmt: typeof r[k] === 'number' && j > 1 ? MONEY : undefined, fill: r === services.total ? C.total : undefined, font: { bold: r === services.total } })));
    keys.forEach((k, j) => { sv.getColumn(j + 1).width = j === 1 ? 36 : 15; }); sv.views = [{ state: 'frozen', xSplit: 2, ySplit: 4 }];
  }
  if (casesByUnit) caseSheet(wb, per.filter((p) => p.ds.length).map((p) => ({ label: `${p.code} ${p.name}`, ds: p.ds, cases: casesByUnit[p.code] || [] })));
  notesSheet(wb.addWorksheet('หมายเหตุ'), [['1. แหล่งข้อมูล', `รายงานพึงรับ รพสต. ของแต่ละหน่วย (zip/rar ที่ รพ.สต.ส่งมา) นำเข้าแล้ว ${withData} จาก ${per.length} หน่วย · เรียงตามรหัส รพ.สต.`], ['', 'ชีต "สรุปทุกบริการ" ใช้ยาสมุนไพร = ผลรวม HC เฉพาะแถวที่เป็นบวก (วิธีเดียวกับไฟล์อำเภอปี 2568) ส่วน Palliative / Fit test / ไวรัสตับ / พอกเข่า เป็นข้อมูลที่กรอกเอง'], ...COMMON_NOTES]);
  return wb.xlsx.writeBuffer();
}

export function downloadBuffer(buf, fileName) {
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
