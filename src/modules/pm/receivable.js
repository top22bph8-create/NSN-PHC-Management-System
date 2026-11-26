// อ่านไฟล์ "รายงานพึงรับ รพสต." (xls จาก สปสช./รพ.) ที่ รพ.สต. ส่งมาเป็น zip → สรุปรายงวด/รายหมวด
// ไม่เก็บ ชื่อ-นามสกุล/เลขบัตรประชาชน — เก็บยอดรวมรายงวด และรายเคสแบบไม่ระบุตัวตน (REP, TRAN_ID, HN, ยอดเงิน) เหมือนไฟล์รายงานดงสง่า
export const CATS = ['HC', 'DRUG', 'AE', 'DMISHD', 'PP', 'FS', 'PALL', 'OTHER'];
export const CAT_LABEL = { HC: 'HC', DRUG: 'DRUG (ยาสมุนไพร)', AE: 'AE', DMISHD: 'DMISHD', PP: 'PP', FS: 'FS', PALL: 'Palliative', OTHER: 'อื่นๆ' };
// คอลัมน์ (เริ่มนับ 0) ตามไฟล์พึงรับ: เรียกเก็บ=R(17) HC=AE(30) DRUG=AF(31) AE=AG(32)+AH(33) Palliative=AM(38) DMISHD=AN(39) PP=AO(40) FS=AP(41) รวม=AQ(42)
const COL = { HCODE: 13, BILL: 17, HC: 30, DRUG: 31, AE: 32, AEDRUG: 33, PALL: 38, DMISHD: 39, PP: 40, FS: 41, TOTAL: 42 };

const num = (v) => { const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };
const r2 = (n) => Math.round(n * 100) / 100;
const blank = () => ({ cases: 0, billed: 0, paid: 0, paidCases: 0, herbCases: 0, HCpos: 0, DRUGpos: 0, HC: 0, HCc: 0, DRUG: 0, AE: 0, AEc: 0, DMISHD: 0, PP: 0, PPc: 0, FS: 0, FSc: 0, PALL: 0, OTHER: 0 });
// รูปแบบแถวรายเคส (เก็บใน Firestore): [ปกติ0/อุทธรณ์1, REP, ลำดับ, TRAN_ID, HN, วันเข้ารักษา, สิทธิ, PROJCODE, เรียกเก็บ, HC, DRUG, AE, AE-DRUG, DMISHD, PP, FS, อื่นๆ, รวม]
const isoDate = (v) => (typeof v === 'string' ? v.slice(0, 10) : '');

export function periodOf(name) {
  const m = String(name).match(/(\d{4})[\s_-]*op[\s_-]*(\d{1,2})/i);
  return m ? `${m[1]}_OP_${m[2].padStart(2, '0')}` : null;
}

export function parseReceivable(XLSX, buf, fileName) {
  const wb = XLSX.read(buf, { type: 'array' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: true });
  const agg = { normal: blank(), appeal: blank() };
  const hc = {}; const reps = []; const caseRows = []; let sect = 'normal';
  for (const r of rows) {
    const a = String(r[0] ?? '').trim();
    if (a.includes('ข้อมูลอุทธรณ์')) { sect = 'appeal'; continue; }
    if (a.includes('ข้อมูลปกติ')) { sect = 'normal'; continue; }
    if (!/^\d{6,}$/.test(a) || r[1] === '' || !Number.isFinite(Number(r[1]))) continue;
    const t = agg[sect]; const total = num(r[COL.TOTAL]);
    t.cases += 1; t.billed += num(r[COL.BILL]); t.paid += total;
    if (total > 0) t.paidCases += 1;
    const drug = num(r[COL.DRUG]); if (drug > 0) t.herbCases += 1;
    // ต้นแบบ 2568: ยาสมุนไพร = ผลรวมเฉพาะแถวที่ HC > 0 (ไม่หักรายการติดลบ) ; ชีตสรุปดงสง่าใช้ผลรวม HC ทุกแถว
    if (num(r[COL.HC]) > 0) t.HCpos += num(r[COL.HC]);
    if (drug > 0) t.DRUGpos += drug;
    if (sect === 'normal') reps.push(a);
    const hcv = num(r[COL.HC]), ae = num(r[COL.AE]), aed = num(r[COL.AEDRUG]), dm = num(r[COL.DMISHD]), pp = num(r[COL.PP]), fs = num(r[COL.FS]);
    const v = { HC: hcv, DRUG: drug, AE: ae + aed, DMISHD: dm, PP: pp, FS: fs, PALL: num(r[COL.PALL]) };
    for (const k of Object.keys(v)) t[k] += v[k];
    if (hcv > 0) t.HCc += 1; if (ae + aed > 0) t.AEc += 1; if (pp > 0) t.PPc += 1; if (fs > 0) t.FSc += 1;
    const other = total - (hcv + drug + ae + aed + dm + pp + fs); // Palliative และอื่นๆ อยู่ในช่อง "อื่นๆ" ตามชีตรายหมวดของดงสง่า
    t.OTHER += other;
    caseRows.push([sect === 'appeal' ? 1 : 0, a, num(r[1]), String(r[2] ?? '').split('.')[0], String(r[3] ?? ''), isoDate(r[7]), String(r[9] ?? ''), String(r[10] ?? ''), r2(num(r[COL.BILL])), r2(hcv), r2(drug), r2(ae), r2(aed), r2(dm), r2(pp), r2(fs), r2(other), r2(total)]);
    const h = String(r[COL.HCODE] ?? '').trim(); if (h) hc[h.padStart(5, '0')] = (hc[h.padStart(5, '0')] || 0) + 1;
  }
  for (const t of Object.values(agg)) for (const k of Object.keys(t)) t[k] = r2(t[k]);
  const code = Object.entries(hc).sort((x, y) => y[1] - x[1])[0]?.[0] || '';
  // ชื่อไฟล์จากระบบเป็น Hsub_Report_<วันเวลาโหลด> ไม่มีงวด → ใช้เลข REP: 4 หลักแรก = ปี-เดือน (เช่น 6710), REP ต่ำสุด = รอบของงวด
  const pre = {}; reps.forEach((x) => { pre[x.slice(0, 4)] = (pre[x.slice(0, 4)] || 0) + 1; });
  const yymm = Object.entries(pre).sort((x, y) => y[1] - x[1])[0]?.[0] || '';
  const minRep = reps.filter((x) => x.startsWith(yymm)).sort()[0] || '';
  const period = periodOf(fileName) || (yymm ? `${yymm}_REP${minRep.slice(4)}` : null);
  const sum = (k) => r2(agg.normal[k] + agg.appeal[k]);
  return { fileName, period, code, ...agg, cases: sum('cases'), billed: sum('billed'), paid: sum('paid'), paidCases: sum('paidCases'), caseRows };
}

// แตก zip ในเบราว์เซอร์ (ไม่ต้องใช้ไลบรารีเพิ่ม) — รองรับ store/deflate
export async function unzip(buf) {
  const u8 = new Uint8Array(buf); const dv = new DataView(buf);
  let e = u8.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('ไม่ใช่ไฟล์ zip');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const out = [];
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/') || (flags & 1)) continue;
    const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    const data = u8.subarray(start, start + csize);
    let bytes;
    if (method === 0) bytes = data.slice().buffer;
    else if (method === 8) bytes = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
    else continue;
    out.push({ name, buf: bytes });
  }
  return out;
}

// ---- ตารางสรุปอำเภอ (รูปแบบเดียวกับ "สรุปทุกบริการ" ของ รพ.สกลนคร) ----
export const RATE = { palliative: 500, fit: 60, fitShare: 0.5, hep: 50, knee: 100, herbUnitShare: 0.3 };
export function districtRow(unitDocs, manual = {}, herbBasis = 'HC') {
  const sum = (k) => unitDocs.reduce((s, d) => s + (d.normal?.[k] || 0) + (d.appeal?.[k] || 0), 0);
  const m = { palVisit: 0, palDead: 0, fitAmount: null, fitUnit: 0, fitHosp: 0, dm: 0, fluoride: 0, tele: 0, hep: 0, kneeVisit: 0, kneeAmount: null, ...manual };
  const pal = (num(m.palVisit) + num(m.palDead)) * RATE.palliative;
  const herb = r2(sum(herbBasis === 'DRUG' ? 'DRUGpos' : 'HCpos')), herbUnit = r2(herb * RATE.herbUnitShare), herbHosp = r2(herb - herbUnit);
  const kneeAmt = m.kneeAmount === null || m.kneeAmount === '' ? num(m.kneeVisit) * RATE.knee : num(m.kneeAmount);
  // Fit test: กรอกเป็นยอดเงิน (บาท) ตามไฟล์ CUP; ถ้าไม่กรอกแต่มีข้อมูลเดิม (จำนวนครั้ง) ใช้สูตรเดิม 60 บาท แบ่ง 50:50
  const fitAmt = r2(m.fitAmount === null || m.fitAmount === '' ? (num(m.fitUnit) + num(m.fitHosp)) * RATE.fit * RATE.fitShare : num(m.fitAmount));
  const dmAmt = r2(num(m.dm)), fluorideAmt = r2(num(m.fluoride)), teleAmt = r2(num(m.tele));
  const hepAmt = num(m.hep) * RATE.hep;
  return {
    pal, herbCases: sum('HCc'), herb, herbHosp, herbUnit, kneeVisit: num(m.kneeVisit), kneeAmt: r2(kneeAmt), fitAmt, dmAmt, fluorideAmt, teleAmt, hepN: num(m.hep), hepAmt,
    total: r2(pal + herbUnit + kneeAmt + fitAmt + hepAmt + dmAmt + fluorideAmt + teleAmt),
    cases: sum('cases'), billed: r2(sum('billed')), paid: r2(sum('paid')), paidCases: sum('paidCases'), periods: unitDocs.length,
  };
}

// แตก rar (RAR4/RAR5) ในเบราว์เซอร์ด้วย WebAssembly — โหลดเฉพาะตอนเลือกไฟล์ .rar
export async function unrar(buf) {
  const [{ createExtractorFromData }, wasm] = await Promise.all([import('node-unrar-js'), import('node-unrar-js/esm/js/unrar.wasm?url')]);
  const wasmBinary = await (await fetch(wasm.default)).arrayBuffer();
  const ex = await createExtractorFromData({ wasmBinary, data: new Uint8Array(buf) });
  const names = [...ex.getFileList().fileHeaders].filter((h) => !h.flags.directory).map((h) => h.name);
  const out = [];
  for (const f of ex.extract({ files: names }).files) {
    const d = f.extraction;
    const bytes = d && d.data ? d.data : d; // เวอร์ชันต่างกันคืน {data} หรือ Uint8Array
    if (bytes && bytes.length) out.push({ name: f.fileHeader.name, buf: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
  }
  return out;
}

// ---------- ตัวช่วยสร้างรายงาน (ใช้ทั้งหน้าเว็บและ Excel) ----------
export const yymmOf = (p) => String(p || '').slice(0, 4);
export function filterDocs(docs, from, to) {
  return (docs || []).filter((d) => (!from || yymmOf(d.period) >= from) && (!to || yymmOf(d.period) <= to)).sort((a, b) => String(a.period).localeCompare(String(b.period)));
}
const S = (d, k) => (d.normal?.[k] || 0) + (d.appeal?.[k] || 0);
// หนึ่งแถวของชีต "สรุป"
export function summaryRow(d) {
  const n = d.normal || {}; const a = d.appeal || {};
  return {
    period: d.period, cases: S(d, 'cases'), billed: r2(S(d, 'billed')),
    nPaid: r2(n.paid || 0), nOk: n.paidCases || 0, nNo: (n.cases || 0) - (n.paidCases || 0),
    aPaid: r2(a.paid || 0), aOk: a.paidCases || 0, aNo: (a.cases || 0) - (a.paidCases || 0),
    herb: r2(S(d, 'HC')), herbC: S(d, 'HCc'), ae: r2(S(d, 'AE')), aeC: S(d, 'AEc'), pp: r2(S(d, 'PP')), ppC: S(d, 'PPc'), fs: r2(S(d, 'FS')), fsC: S(d, 'FSc'),
    total: r2((n.paid || 0) + (a.paid || 0)), totalC: (n.paidCases || 0) + (a.paidCases || 0),
  };
}
export function sumRows(rows) {
  const t = {}; rows.forEach((r) => Object.keys(r).forEach((k) => { if (typeof r[k] === 'number') t[k] = r2((t[k] || 0) + r[k]); }));
  return t;
}
// หนึ่งแถวของชีต "รายหมวด"
export function catRow(d) {
  const g = (k) => r2(S(d, k)); const total = r2((d.normal?.paid || 0) + (d.appeal?.paid || 0)); const ok = (d.normal?.paidCases || 0) + (d.appeal?.paidCases || 0); const cases = S(d, 'cases'); const billed = r2(S(d, 'billed'));
  const sumCat = r2(g('HC') + g('DRUG') + g('AE') + g('DMISHD') + g('PP') + g('FS') + g('OTHER'));
  return { period: d.period, HC: g('HC'), DRUG: g('DRUG'), AE: g('AE'), DMISHD: g('DMISHD'), PP: g('PP'), FS: g('FS'), OTHER: g('OTHER'), total, ppfs: r2(g('PP') + g('FS')), check: Math.abs(sumCat - total) < 0.01 ? 'ตรงกัน' : 'ไม่ตรงกัน', billed, cases, ok, no: cases - ok, pctOk: cases ? ok / cases : 0, pctMoney: billed ? total / billed : 0 };
}
export function sumCatRows(rows) {
  const t = sumRows(rows.map((r) => { const { check, period, pctOk, pctMoney, ...n } = r; return n; }));
  return { ...t, check: rows.every((r) => r.check === 'ตรงกัน') ? 'ตรงกันทุกงวด' : 'มีงวดที่ไม่ตรงกัน', pctOk: t.cases ? t.ok / t.cases : 0, pctMoney: t.billed ? t.total / t.billed : 0 };
}
// เก็บรายเคสลง Firestore เป็นชิ้นละไม่เกิน ~700,000 ตัวอักษร (เอกสาร Firestore จำกัด 1 MB)
export function chunkRows(rows, limit = 700000) {
  const out = []; let cur = []; let size = 2;
  for (const r of rows) { const l = JSON.stringify(r).length + 1; if (size + l > limit && cur.length) { out.push(cur); cur = []; size = 2; } cur.push(r); size += l; }
  if (cur.length) out.push(cur);
  return out;
}
