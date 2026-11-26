// รายงานพึงรับ รพ.สต. อำเภอเมืองสกลนคร ปีงบ 2569 — นำเข้า zip/xls จากแต่ละ รพ.สต. แล้วออกรายงานสรุปอำเภอ + รายหน่วย
// Firestore: pmReceivable/{รหัส}_{งวด} (ยอดรวมเท่านั้น ไม่มีข้อมูลบุคคล) · pmDistrictInputs/{ปี}_{รหัส} (ข้อมูลกรอกเอง)
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, onSnapshot, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { ArrowLeft, FileSpreadsheet, Download, Loader2, Upload } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { canWrite } from '../../lib/roles';
import { writeAudit } from '../../lib/audit';
import { exportXlsx } from '../../lib/exportFile';
import { PageHeader } from '../../components/Logo';
import { Spinner, Toast } from '../../components/ui';
import { PM_UNITS } from './pmUnits';
import { CATS, CAT_LABEL, districtRow, parseReceivable, unzip } from './receivable';

const FY = 2569;
const money = (n) => (n || n === 0 ? Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
const int = (n) => Number(n || 0).toLocaleString('th-TH');
const UNIT_NAME = Object.fromEntries(PM_UNITS);
const MANUAL = [
  ['palVisit', 'Palliative เยี่ยม(ครั้ง)'], ['palDead', 'Palliative เสียชีวิต'], ['fitUnit', 'Fit test รพ.สต.ส่ง'], ['fitHosp', 'Fit test รพ.ส่ง'], ['hep', 'ไวรัสตับ บี/ซี (ครั้ง)'], ['kneeVisit', 'พอกเข่า(ครั้ง)'], ['kneeAmount', 'พอกเข่า(บาท) ถ้าไม่กรอก=ครั้ง×100'],
];

function ManualCell({ value, canEdit, onSave }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => setV(value ?? ''), [value]);
  return <input type="number" min="0" className="input !w-20 !px-1.5 !py-1 text-right text-sm" value={v} disabled={!canEdit} onChange={(e) => setV(e.target.value)} onBlur={() => String(v) !== String(value ?? '') && onSave(v === '' ? null : Number(v))} />;
}

export default function ReceivableReport() {
  const { profile, user } = useAuth();
  const canEdit = canWrite(profile?.role, 'pm-info');
  const [recv, setRecv] = useState(null);
  const [inputs, setInputs] = useState({});
  const [tab, setTab] = useState('district');
  const [unit, setUnit] = useState(PM_UNITS[6][0]);
  const [toast, setToast] = useState(null);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const basis = 'HC'; // ยืนยันจากผู้ใช้: นับเฉพาะ HC
  const fileRef = useRef(null);

  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }, [toast]);
  useEffect(() => onSnapshot(collection(db, 'pmReceivable'), (s) => setRecv(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRecv([])), []);
  useEffect(() => onSnapshot(collection(db, 'pmDistrictInputs'), (s) => setInputs(Object.fromEntries(s.docs.map((d) => [d.id, d.data()]))), () => {}), []);

  const byUnit = useMemo(() => { const m = {}; (recv || []).forEach((d) => { (m[d.code] ||= []).push(d); }); return m; }, [recv]);
  const saveInput = async (code, key, val) => {
    try { await setDoc(doc(db, 'pmDistrictInputs', `${FY}_${code}`), { code, fy: FY, [key]: val, updatedAt: serverTimestamp(), updatedBy: user.email.toLowerCase() }, { merge: true }); }
    catch (e) { setToast({ type: 'error', text: 'บันทึกไม่สำเร็จ: ' + (e.code || e.message) }); }
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
        if (/\.zip$/i.test(f.name)) (await unzip(buf)).forEach((e) => { if (/\.xlsx?$/i.test(e.name) && !/__MACOSX|\/~\$|^~\$/.test(e.name)) entries.push({ name: e.name.split('/').pop(), buf: e.buf }); });
        else if (/\.xlsx?$/i.test(f.name)) entries.push({ name: f.name, buf });
      }
      for (const e of entries) {
        try { out.push(parseReceivable(XLSX, e.buf, e.name)); } catch (err) { out.push({ fileName: e.name, error: err.message }); }
      }
      setItems(out);
      if (!out.length) setToast({ type: 'error', text: 'ไม่พบไฟล์ .xls/.xlsx ใน zip' });
    } catch (err) { setToast({ type: 'error', text: 'อ่านไฟล์ไม่สำเร็จ: ' + err.message }); } finally { setBusy(false); }
  };
  const problem = (it) => it.error || (!it.period && 'อ่านงวดจากชื่อไฟล์ไม่ได้') || (!UNIT_NAME[it.code] && `ไม่พบรหัสหน่วย ${it.code || '-'} ในรายชื่อ 24 แห่ง`) || (!it.cases && 'ไม่พบรายการข้อมูล') || '';
  const saveAll = async () => {
    const ok = items.filter((i) => !problem(i)); if (!ok.length) return;
    setBusy(true);
    try {
      const b = writeBatch(db);
      ok.forEach((i) => b.set(doc(db, 'pmReceivable', `${i.code}_${i.period}`), { code: i.code, period: i.period, fileName: i.fileName, normal: i.normal, appeal: i.appeal, cases: i.cases, billed: i.billed, paid: i.paid, paidCases: i.paidCases, importedBy: user.email.toLowerCase(), importedAt: serverTimestamp() }));
      await b.commit();
      await writeAudit({ action: 'create', module: 'pm-info', docId: ok[0].code, label: 'นำเข้ารายงานพึงรับ', after: { จำนวนไฟล์: ok.length, หน่วย: [...new Set(ok.map((i) => i.code))].join(',') } });
      setToast({ type: 'ok', text: `นำเข้า ${ok.length} งวดแล้ว` }); setItems([]);
    } catch (err) { setToast({ type: 'error', text: 'บันทึกไม่สำเร็จ: ' + (err.code || err.message) }); } finally { setBusy(false); }
  };

  const exportDistrict = () => exportXlsx([...rows.map((r, i) => ({
    ลำดับ: i + 1, 'รพ.สต.': `${r.code} - ${r.name}`, 'Palliative ชดเชย(บาท)': r.pal, 'ยาสมุนไพร เคส': r.herbCases, 'ยาสมุนไพร ยอดรวม': r.herb, 'สัดส่วน 70': r.herbHosp, 'สัดส่วน 30': r.herbUnit,
    'พอกเข่า ครั้ง': r.kneeVisit, 'พอกเข่า ชดเชย': r.kneeAmt, 'Fit test ครั้ง': r.fitN, 'Fit test ชดเชย(50:50)': r.fitAmt, 'ไวรัสตับ ครั้ง': r.hepN, 'ไวรัสตับ ชดเชย': r.hepAmt, 'รวมจ่าย(บาท)': r.total,
    'พึงรับ: เรียกเก็บ': r.billed, 'พึงรับ: ชดเชยรวม': r.paid, 'พึงรับ: จำนวนงวด': r.periods,
  })), { ลำดับ: 'รวม', 'Palliative ชดเชย(บาท)': tot.pal, 'ยาสมุนไพร เคส': tot.herbCases, 'ยาสมุนไพร ยอดรวม': tot.herb, 'สัดส่วน 70': tot.herbHosp, 'สัดส่วน 30': tot.herbUnit, 'พอกเข่า ครั้ง': tot.kneeVisit, 'พอกเข่า ชดเชย': tot.kneeAmt, 'Fit test ครั้ง': tot.fitN, 'Fit test ชดเชย(50:50)': tot.fitAmt, 'ไวรัสตับ ครั้ง': tot.hepN, 'ไวรัสตับ ชดเชย': tot.hepAmt, 'รวมจ่าย(บาท)': tot.total, 'พึงรับ: เรียกเก็บ': tot.billed, 'พึงรับ: ชดเชยรวม': tot.paid }], 'สรุปทุกบริการ', `สรุปทุกบริการ_อำเภอเมือง_${FY}`);

  const unitDocs = useMemo(() => [...(byUnit[unit] || [])].sort((a, b) => a.period.localeCompare(b.period)), [byUnit, unit]);
  const unitRows = unitDocs.map((d, i) => {
    const g = (k) => (d.normal?.[k] || 0) + (d.appeal?.[k] || 0);
    return { ลำดับ: i + 1, รายงานงวด: d.period, เคสทั้งหมด: d.cases, เรียกเก็บ: d.billed, 'เคสได้รับ': d.paidCases, 'เคสไม่ได้รับ': d.cases - d.paidCases, ...Object.fromEntries(CATS.map((c) => [c, Math.round(g(c) * 100) / 100])), ยอดชดเชยรวม: d.paid };
  });
  const unitTot = unitRows.reduce((t, r) => { Object.entries(r).forEach(([k, v]) => { if (typeof v === 'number' && k !== 'ลำดับ') t[k] = (t[k] || 0) + v; }); return t; }, {});

  const th = 'whitespace-nowrap px-2 py-2 text-right text-xs font-semibold';
  const td = 'whitespace-nowrap px-2 py-1.5 text-right tabular-nums';
  return (
    <div className="mx-auto max-w-[1400px] p-4 lg:p-6">
      <PageHeader icon={FileSpreadsheet} emoji="📊" tone="from-emerald-700 via-emerald-600 to-teal-500" title={`รายงานพึงรับ รพ.สต. อำเภอเมือง ปีงบ ${FY}`} subtitle="นำเข้า zip/xls ของแต่ละ รพ.สต. แล้วออกรายงานสรุปอำเภอและรายหน่วย" />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link to="/pm-info/hospital-debt" className="btn btn-outline !px-3 !py-1.5 text-sm"><ArrowLeft className="h-4 w-4" /> กลับ</Link>
        {[['district', 'สรุปอำเภอ'], ['unit', 'รายหน่วย'], ['import', 'นำเข้าไฟล์']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`btn !px-3 !py-1.5 text-sm ${tab === k ? 'btn-primary' : 'btn-outline'}`}>{l}</button>
        ))}
        <span className="text-sm text-slate-500">นำเข้าแล้ว {Object.keys(byUnit).length}/{PM_UNITS.length} หน่วย · {(recv || []).length} งวด</span>
      </div>
      {recv === null ? <Spinner /> : tab === 'import' ? (
        <div className="card p-4">
          <p className="mb-3 text-sm text-slate-600">เลือกไฟล์ zip ที่ รพ.สต. ส่งมา (หรือไฟล์ .xls รายงานพึงรับทีละไฟล์) ระบบอ่านรหัสหน่วยจากไฟล์และงวดจากชื่อไฟล์ (เช่น 6809_OP_02) ถ้านำเข้างวดเดิมซ้ำจะเขียนทับ · ระบบเก็บเฉพาะยอดรวม ไม่เก็บชื่อ-เลขบัตรผู้ป่วย</p>
          <input ref={fileRef} type="file" multiple accept=".zip,.xls,.xlsx" className="hidden" onChange={(e) => { const l = [...e.target.files]; e.target.value = ''; if (l.length) readFiles(l); }} />
          <button type="button" className="btn btn-primary" disabled={busy || !canEdit} onClick={() => fileRef.current?.click()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} เลือกไฟล์ zip / xls</button>
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
      ) : tab === 'unit' ? (
        <div className="card p-3">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select className="input !w-auto !py-1.5" value={unit} onChange={(e) => setUnit(e.target.value)}>{PM_UNITS.map(([c, n]) => <option key={c} value={c}>{c} {n}</option>)}</select>
            <button type="button" className="btn btn-outline !py-1.5 text-sm" disabled={!unitRows.length} onClick={() => exportXlsx([...unitRows, { ลำดับ: 'รวม', ...unitTot, รายงานงวด: '' }], 'รายหมวด', `รายงานพึงรับ_${unit}_${FY}`)}><Download className="h-4 w-4" /> Excel</button>
          </div>
          {!unitRows.length ? <p className="py-8 text-center text-slate-400">ยังไม่มีข้อมูลของหน่วยนี้ — ไปที่แท็บ "นำเข้าไฟล์"</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="bg-slate-50"><tr><th className="px-2 py-2 text-left text-xs">งวด</th><th className={th}>เคส</th><th className={th}>เรียกเก็บ</th><th className={th}>ได้รับ</th><th className={th}>ไม่ได้รับ</th>{CATS.map((c) => <th key={c} className={th}>{CAT_LABEL[c]}</th>)}<th className={th}>ชดเชยรวม</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{unitRows.map((r) => (<tr key={r.รายงานงวด}><td className="px-2 py-1.5">{r.รายงานงวด}</td><td className={td}>{int(r.เคสทั้งหมด)}</td><td className={td}>{money(r.เรียกเก็บ)}</td><td className={td}>{int(r.เคสได้รับ)}</td><td className={td}>{int(r.เคสไม่ได้รับ)}</td>{CATS.map((c) => <td key={c} className={td}>{money(r[c])}</td>)}<td className={`${td} font-semibold`}>{money(r.ยอดชดเชยรวม)}</td></tr>))}
                <tr className="bg-emerald-50 font-bold"><td className="px-2 py-1.5">รวม</td><td className={td}>{int(unitTot.เคสทั้งหมด)}</td><td className={td}>{money(unitTot.เรียกเก็บ)}</td><td className={td}>{int(unitTot.เคสได้รับ)}</td><td className={td}>{int(unitTot.เคสไม่ได้รับ)}</td>{CATS.map((c) => <td key={c} className={td}>{money(unitTot[c])}</td>)}<td className={td}>{money(unitTot.ยอดชดเชยรวม)}</td></tr></tbody>
            </table></div>
          )}
        </div>
      ) : (
        <div className="card p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-outline !py-1.5 text-sm" onClick={exportDistrict}><Download className="h-4 w-4" /> ส่งออก Excel</button>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800 ring-1 ring-emerald-200">ยาสมุนไพร = ผลรวมคอลัมน์ HC เฉพาะแถวที่เป็นบวก</span>
            <span className="text-xs text-slate-500">ช่องกรอกเอง (ขอบสีขาว) = Palliative, Fit test, ไวรัสตับ, พอกเข่า · รพ.สต.ได้ 30% · Fit test 60 บาท แบ่ง 50:50 · ไวรัสตับ 50 บาท/ครั้ง</span>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-slate-50 align-bottom"><tr><th className="px-2 py-2 text-left text-xs">รพ.สต.</th>{MANUAL.map(([k, l]) => <th key={k} className="px-1 py-2 text-xs font-semibold">{l}</th>)}<th className={th}>Palliative ชดเชย</th><th className={th}>ยาสมุนไพร ยอดรวม</th><th className={th}>70%</th><th className={th}>30% (รพ.สต.)</th><th className={th}>พอกเข่า ชดเชย</th><th className={th}>Fit test ชดเชย</th><th className={th}>ไวรัสตับ ชดเชย</th><th className={`${th} bg-emerald-100`}>รวมจ่าย</th><th className={th}>พึงรับ ชดเชยรวม</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{rows.map((r) => { const m = inputs[`${FY}_${r.code}`] || {}; return (
              <tr key={r.code}><td className="whitespace-nowrap px-2 py-1.5"><span className="font-mono text-xs text-emerald-700">{r.code}</span> {r.name}</td>
                {MANUAL.map(([k]) => <td key={k} className="px-1 py-1"><ManualCell value={m[k]} canEdit={canEdit} onSave={(v) => saveInput(r.code, k, v)} /></td>)}
                <td className={td}>{money(r.pal)}</td><td className={td}>{money(r.herb)}</td><td className={td}>{money(r.herbHosp)}</td><td className={td}>{money(r.herbUnit)}</td><td className={td}>{money(r.kneeAmt)}</td><td className={td}>{money(r.fitAmt)}</td><td className={td}>{money(r.hepAmt)}</td><td className={`${td} bg-emerald-50 font-bold`}>{money(r.total)}</td><td className={td}>{money(r.paid)}</td></tr>); })}
              <tr className="bg-emerald-50 font-bold"><td className="px-2 py-1.5">รวม</td><td colSpan={MANUAL.length} /><td className={td}>{money(tot.pal)}</td><td className={td}>{money(tot.herb)}</td><td className={td}>{money(tot.herbHosp)}</td><td className={td}>{money(tot.herbUnit)}</td><td className={td}>{money(tot.kneeAmt)}</td><td className={td}>{money(tot.fitAmt)}</td><td className={td}>{money(tot.hepAmt)}</td><td className={td}>{money(tot.total)}</td><td className={td}>{money(tot.paid)}</td></tr></tbody>
          </table></div>
        </div>
      )}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
