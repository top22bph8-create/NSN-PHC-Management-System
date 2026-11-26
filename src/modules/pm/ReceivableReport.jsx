// รายงานพึงรับ รพ.สต. อำเภอเมืองสกลนคร ปีงบ 2569 — นำเข้า zip/xls จากแต่ละ รพ.สต. แล้วออกรายงานสรุปอำเภอ + รายหน่วย
// Firestore: pmReceivable/{รหัส}_{งวด} (ยอดรวม) · pmReceivableCases/{รหัส}_{งวด}_{n} (รายเคสไม่มีชื่อ/เลขบัตร) · pmDistrictInputs/{ปี}_{รหัส} (ข้อมูลกรอกเอง)
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore';
import { ArrowLeft, FileSpreadsheet, Download, Loader2, Upload } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { canWrite } from '../../lib/roles';
import { writeAudit } from '../../lib/audit';
import { exportXlsx } from '../../lib/exportFile';
import { PageHeader } from '../../components/Logo';
import { Spinner, Toast } from '../../components/ui';
import { PM_UNITS } from './pmUnits';
import { chunkRows, districtRow, filterDocs, parseReceivable, sumRows, summaryRow, unrar, unzip, yymmOf } from './receivable';
import { buildDistrictWorkbook, buildUnitWorkbook, downloadBuffer, mergeDocs } from './reportExcel';

const FY = 2569;
const money = (n) => (n || n === 0 ? Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
const int = (n) => Number(n || 0).toLocaleString('th-TH');
const UNIT_NAME = Object.fromEntries(PM_UNITS);
const MANUAL = [
  ['palVisit', 'Palliative เยี่ยม(ครั้ง)'], ['palDead', 'Palliative เสียชีวิต'], ['fitAmount', 'Fit test (บาท)'], ['dm', 'คัดกรองเบาหวาน/ไขมันในเลือด (บาท)'], ['fluoride', 'เคลือบฟลูออไรด์ (บาท)'], ['tele', 'Telemedicine (บาท)'], ['hep', 'ไวรัสตับ บี/ซี (ครั้ง)'], ['kneeVisit', 'พอกเข่า(ครั้ง)'], ['kneeAmount', 'พอกเข่า(บาท) ถ้าไม่กรอก=ครั้ง×100'],
];

function ManualCell({ value, canEdit, onSave }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => setV(value ?? ''), [value]);
  return <input type="number" min="0" className="input !w-20 !px-1.5 !py-1 text-right text-sm" value={v} disabled={!canEdit} onChange={(e) => setV(e.target.value)} onBlur={() => String(v) !== String(value ?? '') && onSave(v === '' ? null : Number(v))} />;
}

const MONEY_HEADS = ['เรียกเก็บ', 'HC', 'DRUG', 'AE', 'AE-DRUG', 'DMISHD', 'PP', 'FS', 'อื่นๆ', 'ยอดชดเชยทั้งสิ้น'];
const CASE_HEADS = ['หน่วยบริการ', 'ลำดับงวด', 'รายงานงวด', 'ประเภทข้อมูล', 'REP', 'ลำดับที่', 'TRAN_ID', 'HN', 'วันเข้ารักษา', 'สิทธิ (MAININSCL)', 'PROJCODE', ...MONEY_HEADS, 'สถานะการชดเชย'];
const fmtM = (v) => (!v ? '-' : Number(v).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const PAGE = 200;

// ชีต "ข้อมูลรายเคส" ดูบนหน้าเว็บ (เหมือนชีตใน Excel): กรองตามงวด/ประเภท/สถานะ ค้นหา HN-TRAN_ID-REP แบ่งหน้า
function CaseSheet({ list, periods, nameOf, multi }) {
  const [uf, setUf] = useState(''); const [per, setPer] = useState(''); const [typ, setTyp] = useState(''); const [st, setSt] = useState(''); const [q, setQ] = useState(''); const [page, setPage] = useState(0);
  const idx = useMemo(() => Object.fromEntries(periods.map((p, i) => [p, i + 1])), [periods]);
  const all = useMemo(() => (list || []).filter((c) => idx[c.period]).sort((a, b) => String(a.code).localeCompare(String(b.code)) || idx[a.period] - idx[b.period]).flatMap((c) => c.rows.map((r) => ({ p: c.period, r, u: c.code }))), [list, idx]);
  const shown = useMemo(() => { const t = q.trim(); return all.filter(({ p, r, u }) => (!uf || u === uf) && (!per || p === per) && (!typ || String(r[0]) === typ) && (!st || (st === 'ok') === (r[17] > 0)) && (!t || r[1].includes(t) || r[3].includes(t) || r[4].includes(t))); }, [all, uf, per, typ, st, q]);
  const sums = useMemo(() => { const t = Array(10).fill(0); shown.forEach(({ r }) => { for (let i = 0; i < 10; i += 1) t[i] += r[8 + i]; }); return t; }, [shown]);
  useEffect(() => setPage(0), [uf, per, typ, st, q]);
  if (list === null) return <div className="py-10 text-center text-slate-500"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> กำลังโหลดรายเคส…</div>;
  if (!all.length) return <p className="py-8 text-center text-slate-400">ยังไม่มีข้อมูลรายเคสของหน่วยนี้ในช่วงที่เลือก — งวดที่นำเข้าก่อนหน้านี้ ให้นำเข้าไฟล์ซ้ำอีกครั้ง</p>;
  const pages = Math.max(1, Math.ceil(shown.length / PAGE)); const cur = Math.min(page, pages - 1); const slice = shown.slice(cur * PAGE, cur * PAGE + PAGE);
  const cell = 'whitespace-nowrap border border-slate-200 px-2 py-1 text-sm';
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        {multi && <select className="input !w-auto !py-1" value={uf} onChange={(e) => setUf(e.target.value)}><option value="">ทุกหน่วย (ทั้งอำเภอ)</option>{PM_UNITS.map(([c, n]) => <option key={c} value={c}>{c} {n}</option>)}</select>}
        <select className="input !w-auto !py-1" value={per} onChange={(e) => setPer(e.target.value)}><option value="">ทุกงวด</option>{periods.map((p) => <option key={p} value={p}>{p}</option>)}</select>
        <select className="input !w-auto !py-1" value={typ} onChange={(e) => setTyp(e.target.value)}><option value="">ปกติ + อุทธรณ์</option><option value="0">ปกติ</option><option value="1">อุทธรณ์</option></select>
        <select className="input !w-auto !py-1" value={st} onChange={(e) => setSt(e.target.value)}><option value="">ทุกสถานะ</option><option value="ok">ได้รับชดเชย</option><option value="no">ไม่ได้รับชดเชย</option></select>
        <input className="input !w-56 !py-1" placeholder="ค้นหา HN / TRAN_ID / REP" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-slate-500">{int(shown.length)} จาก {int(all.length)} เคส</span>
        <span className="ml-auto flex items-center gap-1">
          <button type="button" className="btn btn-outline !px-2 !py-1 text-xs" disabled={cur === 0} onClick={() => setPage(cur - 1)}>ก่อนหน้า</button>
          <span className="text-xs">หน้า {cur + 1}/{pages}</span>
          <button type="button" className="btn btn-outline !px-2 !py-1 text-xs" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>ถัดไป</button>
        </span>
      </div>
      <div className="max-h-[68vh] overflow-auto rounded-lg border border-slate-300">
        <table className="border-collapse text-sm">
          <thead className="sticky top-0 z-10"><tr>{CASE_HEADS.map((h) => <th key={h} className="whitespace-nowrap border border-slate-300 bg-[#ccffcc] px-2 py-2 text-center text-xs font-bold text-slate-900">{h}</th>)}</tr></thead>
          <tbody>
            {slice.map(({ p, r, u }, i) => (
              <tr key={`${p}-${cur}-${i}`} className={r[17] > 0 ? '' : 'bg-rose-50/60'}>
                <td className={cell}>{nameOf(u)}</td><td className={`${cell} text-right`}>{idx[p]}</td><td className={cell}>{p}</td><td className={cell}>{r[0] ? 'อุทธรณ์' : 'ปกติ'}</td><td className={cell}>{r[1]}</td><td className={`${cell} text-right`}>{r[2]}</td><td className={cell}>{r[3]}</td><td className={cell}>{r[4]}</td><td className={cell}>{r[5]}</td><td className={cell}>{r[6]}</td><td className={cell}>{r[7]}</td>
                {[8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map((k) => <td key={k} className={`${cell} text-right tabular-nums ${r[k] < 0 ? 'text-rose-600' : ''}`}>{fmtM(r[k])}</td>)}
                <td className={`${cell} ${r[17] > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{r[17] > 0 ? 'ได้รับชดเชย' : 'ไม่ได้รับชดเชย'}</td>
              </tr>))}
          </tbody>
          <tfoot className="sticky bottom-0"><tr className="bg-amber-100 font-bold"><td className={cell} colSpan={11}>รวมตามที่กรอง ({int(shown.length)} เคส)</td>{sums.map((v, i) => <td key={i} className={`${cell} text-right tabular-nums`}>{fmtM(Math.round(v * 100) / 100)}</td>)}<td className={cell} /></tr></tfoot>
        </table>
      </div>
    </div>
  );
}

export default function ReceivableReport() {
  const { profile, user } = useAuth();
  const canEdit = canWrite(profile?.role, 'pm-info');
  const [recv, setRecv] = useState(null);
  const [inputs, setInputs] = useState({});
  const [tab, setTab] = useState('overview');
  const [unit, setUnit] = useState(PM_UNITS[6][0]);
  const [toast, setToast] = useState(null);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const basis = 'HC'; // ยืนยันจากผู้ใช้: นับเฉพาะ HC
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [dl, setDl] = useState('');
  const [unitView, setUnitView] = useState('summary');
  const [caseScope, setCaseScope] = useState('unit');
  const [caseData, setCaseData] = useState({ unit: '', list: [] });
  const fileRef = useRef(null);

  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }, [toast]);
  useEffect(() => onSnapshot(collection(db, 'pmReceivable'), (s) => setRecv(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRecv([])), []);
  useEffect(() => onSnapshot(collection(db, 'pmDistrictInputs'), (s) => setInputs(Object.fromEntries(s.docs.map((d) => [d.id, d.data()]))), () => {}), []);

  const byUnit = useMemo(() => { const m = {}; (recv || []).forEach((d) => { (m[d.code] ||= []).push(d); }); return m; }, [recv]);
  const saveInput = async (code, key, val) => {
    try { await setDoc(doc(db, 'pmDistrictInputs', `${FY}_${code}`), { code, fy: FY, [key]: val, updatedAt: serverTimestamp(), updatedBy: user.email.toLowerCase() }, { merge: true }); }
    catch (e) { setToast({ type: 'error', text: 'บันทึกไม่สำเร็จ: ' + (e.code || e.message) }); }
  };
  // นำเข้ายอดเงินจากไฟล์ CUP (ชีต "บันทึกข้อมูล": เบาหวาน/ไขมัน, ฟลูออไรด์, Fit test, Telemedicine ต่อ รพ.สต.)
  const cupRef = useRef(null);
  const importCup = async (f) => {
    setBusy(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets['บันทึกข้อมูล'] || wb.Sheets[wb.SheetNames.find((n) => /บันทึก/.test(n))];
      if (!ws) throw new Error('ไม่พบชีต "บันทึกข้อมูล"');
      const num = (v) => { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };
      const b = writeBatch(db); let n = 0;
      XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }).forEach((r) => {
        const code = String(r[1] || '').trim().slice(0, 5);
        if (!UNIT_NAME[code]) return;
        b.set(doc(db, 'pmDistrictInputs', `${FY}_${code}`), { code, fy: FY, dm: num(r[2]), fluoride: num(r[3]), fitAmount: num(r[4]), tele: num(r[5]), updatedAt: serverTimestamp(), updatedBy: user.email.toLowerCase() }, { merge: true }); n += 1;
      });
      if (!n) throw new Error('ไม่พบรหัสหน่วยในไฟล์');
      await b.commit(); setToast({ type: 'ok', text: `นำเข้ายอดจากไฟล์ CUP ${n} หน่วยแล้ว` });
    } catch (e) { setToast({ type: 'error', text: 'นำเข้าไฟล์ CUP ไม่สำเร็จ: ' + (e.code || e.message) }); } finally { setBusy(false); }
  };
  const rows = useMemo(() => PM_UNITS.map(([code, name]) => ({ code, name, ...districtRow(byUnit[code] || [], inputs[`${FY}_${code}`] || {}, basis) })), [byUnit, inputs, basis]);
  const tot = useMemo(() => rows.reduce((t, r) => { Object.keys(r).forEach((k) => { if (typeof r[k] === 'number') t[k] = (t[k] || 0) + r[k]; }); return t; }, {}), [rows]);

  const readFiles = async (list) => {
    setBusy(true); const out = [];
    try {
      const XLSX = await import('xlsx');
      const entries = [];
      for (const f of list) {
        const buf = await f.arrayBuffer();
        if (/\.(zip|rar)$/i.test(f.name)) (await (/\.rar$/i.test(f.name) ? unrar(buf) : unzip(buf))).forEach((e) => { const base = e.name.split(/[\\/]/).pop(); if (/\.xlsx?$/i.test(base) && !/__MACOSX|^~\$/.test(e.name)) entries.push({ name: base, buf: e.buf }); });
        else if (/\.xlsx?$/i.test(f.name)) entries.push({ name: f.name, buf });
      }
      for (const e of entries) {
        try { out.push(parseReceivable(XLSX, e.buf, e.name)); } catch (err) { out.push({ fileName: e.name, error: err.message }); }
      }
      setItems(out);
      if (!out.length) setToast({ type: 'error', text: 'ไม่พบไฟล์ .xls/.xlsx ใน zip/rar' });
    } catch (err) { setToast({ type: 'error', text: 'อ่านไฟล์ไม่สำเร็จ: ' + err.message }); } finally { setBusy(false); }
  };
  const problem = (it) => it.error || (!it.period && 'อ่านงวดจากชื่อไฟล์ไม่ได้') || (!UNIT_NAME[it.code] && `ไม่พบรหัสหน่วย ${it.code || '-'} ในรายชื่อ 24 แห่ง`) || (!it.cases && 'ไม่พบรายการข้อมูล') || '';
  // ลบข้อมูลที่นำเข้า: เลือกหน่วยเดียว หรือ ALL (ทั้งอำเภอ) — ลบทั้งยอดรวมและรายเคส ไม่ลบข้อมูลกรอกเอง (pmDistrictInputs)
  const [delUnit, setDelUnit] = useState('');
  const wipe = async () => {
    if (!delUnit) return;
    const label = delUnit === 'ALL' ? 'ทุกหน่วย (ทั้งอำเภอ)' : (PM_UNITS.find(([c]) => c === delUnit) || []).join(' ');
    if (!window.confirm(`ลบข้อมูลรายงานพึงรับที่นำเข้าของ ${label} ทั้งหมด?\nลบแล้วกู้คืนไม่ได้ ต้องนำเข้าไฟล์ใหม่`)) return;
    setBusy(true);
    try {
      let n = 0;
      for (const col of ['pmReceivable', 'pmReceivableCases']) {
        const snap = await getDocs(delUnit === 'ALL' ? collection(db, col) : query(collection(db, col), where('code', '==', delUnit)));
        for (let i = 0; i < snap.docs.length; i += 400) {
          const b = writeBatch(db); snap.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref)); await b.commit();
        }
        n += snap.docs.length;
      }
      await writeAudit({ action: 'delete', module: 'pm-info', docId: delUnit, label: 'ลบข้อมูลรายงานพึงรับที่นำเข้า', before: { หน่วย: label, จำนวนเอกสาร: n } });
      setCaseData({ unit: '', list: [] }); setDelUnit('');
      setToast({ type: 'ok', text: `ลบแล้ว ${n} เอกสาร` });
    } catch (err) { setToast({ type: 'error', text: 'ลบไม่สำเร็จ: ' + (err.code || err.message) }); } finally { setBusy(false); }
  };
  const saveAll = async () => {
    const ok = items.filter((i) => !problem(i)); if (!ok.length) return;
    setBusy(true);
    try {
      for (const i of ok) {
        const chunks = chunkRows(i.caseRows || []);
        const b = writeBatch(db);
        b.set(doc(db, 'pmReceivable', `${i.code}_${i.period}`), { code: i.code, period: i.period, fileName: i.fileName, normal: i.normal, appeal: i.appeal, cases: i.cases, billed: i.billed, paid: i.paid, paidCases: i.paidCases, chunks: chunks.length, importedBy: user.email.toLowerCase(), importedAt: serverTimestamp() });
        chunks.forEach((rows, k) => b.set(doc(db, 'pmReceivableCases', `${i.code}_${i.period}_${k}`), { code: i.code, period: i.period, k, rows: JSON.stringify(rows) }));
        await b.commit();
      }
      await writeAudit({ action: 'create', module: 'pm-info', docId: ok[0].code, label: 'นำเข้ารายงานพึงรับ', after: { จำนวนไฟล์: ok.length, หน่วย: [...new Set(ok.map((i) => i.code))].join(',') } });
      setToast({ type: 'ok', text: `นำเข้า ${ok.length} งวดแล้ว` }); setItems([]);
    } catch (err) { setToast({ type: 'error', text: 'บันทึกไม่สำเร็จ: ' + (err.code || err.message) }); } finally { setBusy(false); }
  };

  const exportDistrict = () => exportXlsx([...rows.map((r, i) => ({
    ลำดับ: i + 1, 'รพ.สต.': `${r.code} - ${r.name}`, 'Palliative ชดเชย(บาท)': r.pal, 'ยาสมุนไพร เคส': r.herbCases, 'ยาสมุนไพร ยอดรวม': r.herb, 'สัดส่วน 70': r.herbHosp, 'สัดส่วน 30': r.herbUnit,
    'พอกเข่า ครั้ง': r.kneeVisit, 'พอกเข่า ชดเชย': r.kneeAmt, 'Fit test (บาท)': r.fitAmt, 'คัดกรองเบาหวาน/ไขมัน (บาท)': r.dmAmt, 'เคลือบฟลูออไรด์ (บาท)': r.fluorideAmt, 'Telemedicine (บาท)': r.teleAmt, 'ไวรัสตับ ครั้ง': r.hepN, 'ไวรัสตับ ชดเชย': r.hepAmt, 'รวมจ่าย(บาท)': r.total,
    'พึงรับ: เรียกเก็บ': r.billed, 'พึงรับ: ชดเชยรวม': r.paid, 'พึงรับ: จำนวนงวด': r.periods,
  })), { ลำดับ: 'รวม', 'Palliative ชดเชย(บาท)': tot.pal, 'ยาสมุนไพร เคส': tot.herbCases, 'ยาสมุนไพร ยอดรวม': tot.herb, 'สัดส่วน 70': tot.herbHosp, 'สัดส่วน 30': tot.herbUnit, 'พอกเข่า ครั้ง': tot.kneeVisit, 'พอกเข่า ชดเชย': tot.kneeAmt, 'Fit test (บาท)': tot.fitAmt, 'คัดกรองเบาหวาน/ไขมัน (บาท)': tot.dmAmt, 'เคลือบฟลูออไรด์ (บาท)': tot.fluorideAmt, 'Telemedicine (บาท)': tot.teleAmt, 'ไวรัสตับ ครั้ง': tot.hepN, 'ไวรัสตับ ชดเชย': tot.hepAmt, 'รวมจ่าย(บาท)': tot.total, 'พึงรับ: เรียกเก็บ': tot.billed, 'พึงรับ: ชดเชยรวม': tot.paid }], 'สรุปทุกบริการ', `สรุปทุกบริการ_อำเภอเมือง_${FY}`);

  const months = useMemo(() => [...new Set((recv || []).map((d) => yymmOf(d.period)))].sort(), [recv]);
  const issued = new Date().toLocaleDateString('th-TH');
  const unitDocs = useMemo(() => filterDocs(byUnit[unit] || [], from, to), [byUnit, unit, from, to]);
  const months2 = useMemo(() => [...new Set(filterDocs(recv || [], from, to).map((d) => d.period))].sort(), [recv, from, to]);
  const unitSum = useMemo(() => unitDocs.map(summaryRow), [unitDocs]);
  const unitTot = useMemo(() => sumRows(unitSum), [unitSum]);
  const overview = useMemo(() => PM_UNITS.map(([code, name]) => { const ds = filterDocs(byUnit[code] || [], from, to); return { code, name, n: ds.length, row: summaryRow(mergeDocs(ds, code)) }; }), [byUnit, from, to]);
  const overTot = useMemo(() => sumRows(overview.map((o) => o.row)), [overview]);
  const servicesPayload = () => ({
    note: `ปีงบ ${FY} · ยาสมุนไพร = ผลรวม HC เฉพาะแถวที่เป็นบวก · รพ.สต.ได้ 30%`,
    rows: rows.map((r, i) => ({ ลำดับ: i + 1, 'รพ.สต.': `${r.code} - ${r.name}`, 'Palliative ชดเชย': r.pal, 'ยาสมุนไพร ยอดรวม': r.herb, 'สัดส่วน 70': r.herbHosp, 'สัดส่วน 30 (รพ.สต.)': r.herbUnit, 'พอกเข่า ชดเชย': r.kneeAmt, 'Fit test': r.fitAmt, 'คัดกรองเบาหวาน/ไขมัน': r.dmAmt, 'เคลือบฟลูออไรด์': r.fluorideAmt, 'Telemedicine': r.teleAmt, 'ไวรัสตับ ชดเชย': r.hepAmt, 'รวมจ่าย': r.total })),
    total: { ลำดับ: 'รวม', 'รพ.สต.': '', 'Palliative ชดเชย': tot.pal, 'ยาสมุนไพร ยอดรวม': tot.herb, 'สัดส่วน 70': tot.herbHosp, 'สัดส่วน 30 (รพ.สต.)': tot.herbUnit, 'พอกเข่า ชดเชย': tot.kneeAmt, 'Fit test': tot.fitAmt, 'คัดกรองเบาหวาน/ไขมัน': tot.dmAmt, 'เคลือบฟลูออไรด์': tot.fluorideAmt, 'Telemedicine': tot.teleAmt, 'ไวรัสตับ ชดเชย': tot.hepAmt, 'รวมจ่าย': tot.total },
  });
  const loadCases = async (code) => {
    const snap = await getDocs(query(collection(db, 'pmReceivableCases'), where('code', '==', code)));
    const cm = {};
    snap.docs.forEach((d) => { const x = d.data(); (cm[x.period] ||= []).push({ k: x.k, rows: JSON.parse(x.rows) }); });
    return Object.entries(cm).map(([period, parts]) => ({ period, rows: parts.sort((a, b) => a.k - b.k).flatMap((p) => p.rows) }));
  };
  const loadAllCases = async () => {
    const snap = await getDocs(collection(db, 'pmReceivableCases'));
    const m = {};
    snap.docs.forEach((d) => { const x = d.data(); ((m[x.code] ||= {})[x.period] ||= []).push({ k: x.k, rows: JSON.parse(x.rows) }); });
    return Object.fromEntries(Object.entries(m).map(([code, per]) => [code, Object.entries(per).map(([period, parts]) => ({ period, rows: parts.sort((a, b) => a.k - b.k).flatMap((p) => p.rows) }))]));
  };
  const nameOf = (c) => `${c} ${UNIT_NAME[c] || ''}`;
  const showCases = async (scope = caseScope) => {
    setUnitView('cases'); setCaseScope(scope);
    const key = scope === 'all' ? 'ALL' : unit;
    if (caseData.unit === key) return;
    setCaseData({ unit: key, list: null });
    try {
      if (scope === 'all') { const m = await loadAllCases(); setCaseData({ unit: key, list: Object.entries(m).flatMap(([code, l]) => l.map((x) => ({ ...x, code }))) }); }
      else setCaseData({ unit: key, list: (await loadCases(unit)).map((x) => ({ ...x, code: unit })) });
    } catch (e) { setCaseData({ unit, list: [] }); setToast({ type: 'error', text: 'โหลดรายเคสไม่สำเร็จ: ' + (e.code || e.message) }); }
  };
  const downloadUnit = async () => {
    setDl('unit');
    try {
      const cases = caseData.unit === unit && caseData.list ? caseData.list : await loadCases(unit);
      const buf = await buildUnitWorkbook({ unit: { code: unit, name: UNIT_NAME[unit] }, docs: byUnit[unit] || [], cases, from, to, issued });
      downloadBuffer(buf, `รายงานพึงรับ_${unit}_${UNIT_NAME[unit]}`);
      if (!cases.length) setToast({ type: 'error', text: 'ชีต "ข้อมูลรายเคส" ว่าง — งวดเหล่านี้นำเข้าก่อนมีระบบเก็บรายเคส ให้นำเข้าไฟล์ซ้ำอีกครั้ง' });
    } catch (e) { setToast({ type: 'error', text: 'สร้างไฟล์ไม่สำเร็จ: ' + (e.code || e.message) }); } finally { setDl(''); }
  };
  const downloadDistrict = async () => {
    setDl('district');
    try {
      const casesByUnit = await loadAllCases();
      const buf = await buildDistrictWorkbook({ units: PM_UNITS, byUnit, from, to, issued, services: servicesPayload(), casesByUnit });
      downloadBuffer(buf, `รายงานพึงรับ_อำเภอเมือง_${FY}`);
    } catch (e) { setToast({ type: 'error', text: 'สร้างไฟล์ไม่สำเร็จ: ' + (e.code || e.message) }); } finally { setDl(''); }
  };
  const rangeBox = (
    <div className="flex flex-wrap items-center gap-1.5 text-sm text-slate-600">ช่วงเดือน
      <select className="input !w-auto !py-1" value={from} onChange={(e) => setFrom(e.target.value)}><option value="">ตั้งแต่ต้น</option>{months.map((m) => <option key={m} value={m}>{m}</option>)}</select>
      ถึง
      <select className="input !w-auto !py-1" value={to} onChange={(e) => setTo(e.target.value)}><option value="">ล่าสุด</option>{months.map((m) => <option key={m} value={m}>{m}</option>)}</select>
    </div>
  );
  const SumTable = ({ items, tot, firstHead, firstCell }) => (
    <div className="overflow-x-auto"><table className="w-full text-sm">
      <thead className="bg-slate-50 align-bottom"><tr>
        <th className="px-2 py-2 text-left text-xs">{firstHead}</th><th className={th}>เคส</th><th className={th}>เรียกเก็บ</th>
        <th className={th}>ปกติ ได้รับ</th><th className={th}>เคสได้</th><th className={th}>เคสไม่ได้</th>
        <th className={th}>อุทธรณ์ ได้รับ</th><th className={th}>เคสได้</th><th className={th}>เคสไม่ได้</th>
        <th className={th}>ยาสมุนไพร (HC)</th><th className={th}>เคส</th><th className={th}>AE</th><th className={th}>เคส</th><th className={th}>PP</th><th className={th}>เคส</th><th className={th}>FS</th><th className={th}>เคส</th>
        <th className={`${th} bg-emerald-100`}>รวมได้รับ</th><th className={`${th} bg-emerald-100`}>เคส</th></tr></thead>
      <tbody className="divide-y divide-slate-100">
        {items.map((it, i) => { const r = it.row; return (
          <tr key={i}><td className="whitespace-nowrap px-2 py-1.5">{firstCell(it, i)}</td><td className={td}>{int(r.cases)}</td><td className={td}>{money(r.billed)}</td>
            <td className={td}>{money(r.nPaid)}</td><td className={td}>{int(r.nOk)}</td><td className={td}>{int(r.nNo)}</td>
            <td className={td}>{money(r.aPaid)}</td><td className={td}>{int(r.aOk)}</td><td className={td}>{int(r.aNo)}</td>
            <td className={td}>{money(r.herb)}</td><td className={td}>{int(r.herbC)}</td><td className={td}>{money(r.ae)}</td><td className={td}>{int(r.aeC)}</td><td className={td}>{money(r.pp)}</td><td className={td}>{int(r.ppC)}</td><td className={td}>{money(r.fs)}</td><td className={td}>{int(r.fsC)}</td>
            <td className={`${td} bg-emerald-50 font-semibold`}>{money(r.total)}</td><td className={`${td} bg-emerald-50`}>{int(r.totalC)}</td></tr>); })}
        <tr className="bg-amber-50 font-bold"><td className="px-2 py-1.5">รวม</td><td className={td}>{int(tot.cases)}</td><td className={td}>{money(tot.billed)}</td>
          <td className={td}>{money(tot.nPaid)}</td><td className={td}>{int(tot.nOk)}</td><td className={td}>{int(tot.nNo)}</td><td className={td}>{money(tot.aPaid)}</td><td className={td}>{int(tot.aOk)}</td><td className={td}>{int(tot.aNo)}</td>
          <td className={td}>{money(tot.herb)}</td><td className={td}>{int(tot.herbC)}</td><td className={td}>{money(tot.ae)}</td><td className={td}>{int(tot.aeC)}</td><td className={td}>{money(tot.pp)}</td><td className={td}>{int(tot.ppC)}</td><td className={td}>{money(tot.fs)}</td><td className={td}>{int(tot.fsC)}</td>
          <td className={td}>{money(tot.total)}</td><td className={td}>{int(tot.totalC)}</td></tr>
      </tbody></table></div>
  );
  const Kpi = ({ t }) => {
    const ok = (t.nOk || 0) + (t.aOk || 0); const no = (t.nNo || 0) + (t.aNo || 0);
    const cards = [['เคสทั้งหมด', int(t.cases)], ['เรียกเก็บ (บาท)', money(t.billed)], ['ได้รับชดเชย (บาท)', money(t.total)], ['เคสที่ได้รับ', `${int(ok)}${t.cases ? ` (${((ok / t.cases) * 100).toFixed(1)}%)` : ''}`], ['เคสที่ไม่ได้รับ', `${int(no)}${t.cases ? ` (${((no / t.cases) * 100).toFixed(1)}%)` : ''}`], ['ได้รับ ÷ เรียกเก็บ', t.billed ? `${((t.total / t.billed) * 100).toFixed(1)}%` : '-']];
    return <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">{cards.map(([l, v]) => <div key={l} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200"><div className="text-xs text-slate-500">{l}</div><div className="mt-1 text-lg font-bold tabular-nums text-emerald-800">{v}</div></div>)}</div>;
  };
  const Bars = ({ items, label }) => { const max = Math.max(1, ...items.map((i) => Math.max(i.billed, i.total))); return (
    <div className="mt-4 space-y-1"><div className="text-xs font-semibold text-slate-600">เรียกเก็บ (เทา) เทียบเงินที่ได้รับ (เขียว) — {label}</div>
      {items.map((i) => (<div key={i.k} className="flex items-center gap-2 text-xs"><div className="w-44 shrink-0 truncate text-slate-600">{i.k}</div>
        <div className="flex-1"><div className="h-2 rounded bg-slate-300" style={{ width: `${(i.billed / max) * 100}%` }} /><div className="mt-0.5 h-2 rounded bg-emerald-500" style={{ width: `${(Math.max(i.total, 0) / max) * 100}%` }} /></div>
        <div className="w-24 shrink-0 text-right tabular-nums">{money(i.total)}</div></div>))}</div>); };

  const th = 'whitespace-nowrap px-2 py-2 text-right text-xs font-semibold';
  const td = 'whitespace-nowrap px-2 py-1.5 text-right tabular-nums';
  return (
    <div className="mx-auto max-w-[1400px] p-4 lg:p-6">
      <PageHeader icon={FileSpreadsheet} emoji="📊" tone="from-emerald-700 via-emerald-600 to-teal-500" title={`รายงานพึงรับ รพ.สต. อำเภอเมือง ปีงบ ${FY}`} subtitle="นำเข้า zip/rar/xls ของแต่ละ รพ.สต. แล้วออกรายงานสรุปอำเภอและรายหน่วย" />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link to="/pm-info/hospital-debt" className="btn btn-outline !px-3 !py-1.5 text-sm"><ArrowLeft className="h-4 w-4" /> กลับ</Link>
        {[['overview', 'ภาพรวมอำเภอ'], ['unit', 'รายงานรายหน่วย'], ['district', 'สรุปทุกบริการ'], ['import', 'นำเข้าไฟล์']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`btn !px-3 !py-1.5 text-sm ${tab === k ? 'btn-primary' : 'btn-outline'}`}>{l}</button>
        ))}
        <span className="text-sm text-slate-500">นำเข้าแล้ว {Object.keys(byUnit).length}/{PM_UNITS.length} หน่วย · {(recv || []).length} งวด</span>
      </div>
      {recv === null ? <Spinner /> : tab === 'import' ? (
        <div className="card p-4">
          <p className="mb-3 text-sm text-slate-600">เลือกไฟล์ zip หรือ rar ที่ รพ.สต. ส่งมา (หรือไฟล์ .xls รายงานพึงรับทีละไฟล์) ระบบอ่านรหัสหน่วยจากในไฟล์ และงวดจากเลข REP (หรือจากชื่อไฟล์ถ้ามี เช่น 6809_OP_02) ถ้านำเข้างวดเดิมซ้ำจะเขียนทับ · ระบบเก็บยอดรวมและรายเคสแบบไม่ระบุตัวตน (มีเฉพาะ REP, TRAN_ID, HN, ยอดเงิน — ไม่เก็บชื่อและเลขบัตรประชาชน)</p>
          <input ref={fileRef} type="file" multiple accept=".zip,.rar,.xls,.xlsx" className="hidden" onChange={(e) => { const l = [...e.target.files]; e.target.value = ''; if (l.length) readFiles(l); }} />
          <button type="button" className="btn btn-primary" disabled={busy || !canEdit} onClick={() => fileRef.current?.click()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} เลือกไฟล์ zip / rar / xls</button>
          <div className="mb-4 overflow-x-auto rounded-lg border border-slate-200">
            <div className="flex flex-wrap items-center gap-3 bg-slate-50 px-3 py-2 text-sm">
              <span className="font-medium">เช็กลิสต์การนำเข้า</span>
              <span className="text-emerald-700">นำเข้าแล้ว {PM_UNITS.filter(([c]) => (byUnit[c] || []).length).length} หน่วย</span>
              <span className="text-rose-700">ยังไม่นำเข้า {PM_UNITS.filter(([c]) => !(byUnit[c] || []).length).length} หน่วย: {PM_UNITS.filter(([c]) => !(byUnit[c] || []).length).map(([, n]) => n.replace('รพ.สต.', '')).join(', ') || '— ครบแล้ว'}</span>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-100 text-left text-xs text-slate-600"><th className="px-2 py-1.5">✔</th><th className="px-2 py-1.5">รหัส</th><th className="px-2 py-1.5">รพ.สต.</th><th className="px-2 py-1.5 text-right">งวด</th><th className="px-2 py-1.5">งวดล่าสุด</th><th className="px-2 py-1.5">นำเข้าโดย</th><th className="px-2 py-1.5">นำเข้าเมื่อ</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {PM_UNITS.map(([c, n]) => {
                  const ds = byUnit[c] || [];
                  const last = ds.reduce((a, d) => (!a || (d.importedAt?.seconds || 0) > (a.importedAt?.seconds || 0) ? d : a), null);
                  const who = [...new Set(ds.map((d) => d.importedBy).filter(Boolean))].join(', ');
                  return (
                    <tr key={c} className={ds.length ? '' : 'bg-rose-50/60'}>
                      <td className="px-2 py-1">{ds.length ? '✅' : '⬜'}</td><td className="px-2 py-1 font-mono text-xs">{c}</td><td className="px-2 py-1">{n}</td>
                      <td className="px-2 py-1 text-right">{ds.length || '-'}</td>
                      <td className="px-2 py-1">{ds.length ? [...ds].map((d) => d.period).sort().pop() : <span className="text-rose-700">ยังไม่นำเข้า</span>}</td>
                      <td className="px-2 py-1 text-xs">{who || '-'}</td>
                      <td className="px-2 py-1 text-xs">{last?.importedAt?.seconds ? new Date(last.importedAt.seconds * 1000).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-'}</td>
                    </tr>);
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm">
            <span className="font-medium text-rose-800">ลบข้อมูลที่นำเข้า</span>
            <select className="input !w-auto !py-1.5" value={delUnit} onChange={(e) => setDelUnit(e.target.value)}>
              <option value="">— เลือกหน่วยที่จะลบ —</option><option value="ALL">ทุกหน่วย (ล้างทั้งอำเภอ)</option>
              {PM_UNITS.map(([c, n]) => <option key={c} value={c}>{c} {n}</option>)}
            </select>
            <button type="button" className="btn btn-outline !py-1.5 text-rose-700" disabled={busy || !canEdit || !delUnit} onClick={wipe}>ลบ</button>
            <span className="text-xs text-rose-700">ลบทั้งยอดรวมและรายเคส (ไม่ลบข้อมูลที่กรอกเอง) · กู้คืนไม่ได้</span>
          </div>
          {items.length > 0 && (
            <>
              <div className="mt-4 overflow-x-auto"><table className="w-full text-sm">
                <thead className="bg-slate-50"><tr><th className="px-2 py-2 text-left text-xs">ไฟล์</th><th className="px-2 text-left text-xs">หน่วย</th><th className="px-2 text-left text-xs">งวด</th><th className={th}>เคส</th><th className={th}>เรียกเก็บ</th><th className={th}>ชดเชยรวม</th><th className={th}>DRUG</th><th className="px-2 text-left text-xs">สถานะ</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{items.map((i, k) => { const p = problem(i); return (
                  <tr key={k} className={p ? 'bg-rose-50' : ''}><td className="max-w-[12rem] truncate px-2 py-1.5">{i.fileName}</td><td className="px-2">{i.code} {UNIT_NAME[i.code] || ''}</td><td className="px-2">{i.period}</td>
                    <td className={td}>{int(i.cases)}</td><td className={td}>{money(i.billed)}</td><td className={td}>{money(i.paid)}</td><td className={td}>{money((i.normal?.DRUG || 0) + (i.appeal?.DRUG || 0))}</td>
                    <td className={`px-2 ${p ? 'text-rose-700' : 'text-emerald-700'}`}>{p || 'พร้อมบันทึก'}</td></tr>); })}</tbody>
              </table></div>
              <button type="button" className="btn btn-primary mt-3" disabled={busy || !items.some((i) => !problem(i))} onClick={saveAll}>บันทึก {items.filter((i) => !problem(i)).length} งวด</button>
            </>
          )}
        </div>
      ) : tab === 'overview' ? (
        <div className="card p-3">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            {rangeBox}
            <button type="button" className="btn btn-primary !py-1.5 text-sm" disabled={dl === 'district'} onClick={downloadDistrict}>{dl === 'district' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} ดาวน์โหลด Excel ภาพรวมอำเภอ</button>
            <span className="text-xs text-slate-500">เรียงตามรหัส รพ.สต. · ไฟล์ Excel มีชีต สรุปอำเภอ / รายหมวด / แดชบอร์ด / รายเดือนตามหน่วย / สรุปทุกบริการ / หมายเหตุ</span>
          </div>
          <Kpi t={overTot} />
          <SumTable items={overview} tot={overTot} firstHead="รพ.สต. (เรียงตามรหัส)" firstCell={(o) => <><span className="font-mono text-xs text-emerald-700">{o.code}</span> {o.name} <span className="text-xs text-slate-400">{o.n ? `(${o.n} งวด)` : '(ยังไม่นำเข้า)'}</span></>} />
          <Bars items={overview.filter((o) => o.n).map((o) => ({ k: `${o.code} ${o.name}`, billed: o.row.billed, total: o.row.total }))} label="รายหน่วย" />
        </div>
      ) : tab === 'unit' ? (
        <div className="card p-3">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <select className="input !w-auto !py-1.5" value={unit} onChange={(e) => { setUnit(e.target.value); setUnitView('summary'); setCaseScope('unit'); }}>{PM_UNITS.map(([c, n]) => <option key={c} value={c}>{c} {n}</option>)}</select>
            {rangeBox}
            <div className="flex overflow-hidden rounded-lg ring-1 ring-slate-300">
              <button type="button" className={`px-3 py-1.5 text-sm ${unitView === 'summary' ? 'bg-emerald-600 text-white' : 'bg-white'}`} onClick={() => setUnitView('summary')}>สรุปรายงวด</button>
              <button type="button" className={`px-3 py-1.5 text-sm ${unitView === 'cases' ? 'bg-emerald-600 text-white' : 'bg-white'}`} onClick={() => showCases('unit')}>ข้อมูลรายเคส (ชีต)</button>
              <button type="button" className={`px-3 py-1.5 text-sm ${unitView === 'cases' && caseScope === 'all' ? 'bg-emerald-600 text-white' : 'bg-white'}`} onClick={() => showCases('all')}>รายเคสทั้งอำเภอ</button>
            </div>
            <button type="button" className="btn btn-primary !py-1.5 text-sm" disabled={!unitSum.length || dl === 'unit'} onClick={downloadUnit}>{dl === 'unit' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} ดาวน์โหลด Excel (สรุป / แดชบอร์ด / รายหมวด / ข้อมูลรายเคส / หมายเหตุ)</button>
          </div>
          {!unitSum.length ? <p className="py-8 text-center text-slate-400">ยังไม่มีข้อมูลของหน่วยนี้ — ไปที่แท็บ "นำเข้าไฟล์"</p> : (
            unitView === 'cases' ? <CaseSheet key={caseScope} list={caseData.unit === (caseScope === 'all' ? 'ALL' : unit) ? caseData.list : null} periods={caseScope === 'all' ? months2 : unitSum.map((r) => r.period)} nameOf={nameOf} multi={caseScope === 'all'} /> : <>
              <Kpi t={unitTot} />
              <SumTable items={unitSum.map((r) => ({ row: r }))} tot={unitTot} firstHead="รายงานงวด" firstCell={(it) => it.row.period} />
              <Bars items={unitSum.map((r) => ({ k: r.period, billed: r.billed, total: r.total }))} label="รายงวด" />
            </>
          )}
        </div>
      ) : (
        <div className="card p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-outline !py-1.5 text-sm" onClick={exportDistrict}><Download className="h-4 w-4" /> ส่งออก Excel</button>
            <input ref={cupRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importCup(f); }} />
            <button type="button" className="btn btn-outline !py-1.5 text-sm" disabled={busy || !canEdit} onClick={() => cupRef.current?.click()}><Upload className="h-4 w-4" /> นำเข้ายอดจากไฟล์ CUP</button>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800 ring-1 ring-emerald-200">ยาสมุนไพร = ผลรวมคอลัมน์ HC เฉพาะแถวที่เป็นบวก</span>
            <span className="text-xs text-slate-500">ช่องกรอกเอง (ขอบสีขาว) = Palliative, ยอดเงิน Fit test / เบาหวาน-ไขมัน / ฟลูออไรด์ / Telemedicine (ตามไฟล์ CUP), ไวรัสตับ, พอกเข่า · รพ.สต.ได้ 30% · ไวรัสตับ 50 บาท/ครั้ง</span>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-slate-50 align-bottom"><tr><th className="px-2 py-2 text-left text-xs">รพ.สต.</th>{MANUAL.map(([k, l]) => <th key={k} className="px-1 py-2 text-xs font-semibold">{l}</th>)}<th className={th}>Palliative ชดเชย</th><th className={th}>ยาสมุนไพร ยอดรวม</th><th className={th}>70%</th><th className={th}>30% (รพ.สต.)</th><th className={th}>พอกเข่า ชดเชย</th><th className={th}>Fit test</th><th className={th}>เบาหวาน/ไขมัน</th><th className={th}>ฟลูออไรด์</th><th className={th}>Telemedicine</th><th className={th}>ไวรัสตับ ชดเชย</th><th className={`${th} bg-emerald-100`}>รวมจ่าย</th><th className={th}>พึงรับ ชดเชยรวม</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{rows.map((r) => { const m = inputs[`${FY}_${r.code}`] || {}; return (
              <tr key={r.code}><td className="whitespace-nowrap px-2 py-1.5"><span className="font-mono text-xs text-emerald-700">{r.code}</span> {r.name}</td>
                {MANUAL.map(([k]) => <td key={k} className="px-1 py-1"><ManualCell value={m[k]} canEdit={canEdit} onSave={(v) => saveInput(r.code, k, v)} /></td>)}
                <td className={td}>{money(r.pal)}</td><td className={td}>{money(r.herb)}</td><td className={td}>{money(r.herbHosp)}</td><td className={td}>{money(r.herbUnit)}</td><td className={td}>{money(r.kneeAmt)}</td><td className={td}>{money(r.fitAmt)}</td><td className={td}>{money(r.dmAmt)}</td><td className={td}>{money(r.fluorideAmt)}</td><td className={td}>{money(r.teleAmt)}</td><td className={td}>{money(r.hepAmt)}</td><td className={`${td} bg-emerald-50 font-bold`}>{money(r.total)}</td><td className={td}>{money(r.paid)}</td></tr>); })}
              <tr className="bg-emerald-50 font-bold"><td className="px-2 py-1.5">รวม</td><td colSpan={MANUAL.length} /><td className={td}>{money(tot.pal)}</td><td className={td}>{money(tot.herb)}</td><td className={td}>{money(tot.herbHosp)}</td><td className={td}>{money(tot.herbUnit)}</td><td className={td}>{money(tot.kneeAmt)}</td><td className={td}>{money(tot.fitAmt)}</td><td className={td}>{money(tot.dmAmt)}</td><td className={td}>{money(tot.fluorideAmt)}</td><td className={td}>{money(tot.teleAmt)}</td><td className={td}>{money(tot.hepAmt)}</td><td className={td}>{money(tot.total)}</td><td className={td}>{money(tot.paid)}</td></tr></tbody>
          </table></div>
        </div>
      )}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
