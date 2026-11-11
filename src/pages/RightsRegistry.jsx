import SyncNowButton from '../components/SyncNowButton';
// ทะเบียนสิทธิ UC/Wel ตรง-ไม่ตรง — แดชบอร์ด + รายชื่อ
// ข้อมูลมาจากสคริปต์ที่เครื่อง JHCIS (node sync.mjs --rights) เก็บใน Firestore rightsRegistry (ชื่อ/อายุ/ที่อยู่/สถานพยาบาล ไม่มีเลขบัตร อ่านได้เฉพาะผู้ล็อกอิน)
import { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { FileSpreadsheet, Search } from 'lucide-react';
import { db } from '../firebase';
import { exportXlsx } from '../lib/exportFile';
import { fmtDateTime } from '../lib/thai';
import { PageHeader } from '../components/Logo';
import { Modal, Spinner } from '../components/ui';
import { VILLAGES, VILLAGES_ASOF } from '../config/villages';

const nf = (n) => Number(n || 0).toLocaleString('th-TH');
const TL = { 1: '1 อยู่จริงและมีชื่อในทะเบียนบ้าน', 2: '2 อยู่จริงแต่ไม่มีชื่อในทะเบียนบ้าน', 3: '3 มีชื่อในทะเบียนบ้านแต่ไม่ได้อยู่', 4: '4 ไม่มีชื่อในทะเบียนบ้านและไม่ได้อยู่' };
const CATS = {
  A: { title: 'ตรง: อยู่ในเขต (ประเภท 1–4) และขึ้นทะเบียนที่ รพ.สต.เรา', tone: 'from-emerald-600 to-emerald-400', hint: 'ประชากรในเขตที่ใช้สิทธิ UC/Wel ตรงกับหน่วยบริการประจำ' },
  C: { title: 'ไม่ตรง: อยู่ในเขต (ประเภท 1–4) แต่ขึ้นทะเบียนที่อื่น', tone: 'from-rose-600 to-rose-400', hint: 'ควรตรวจสอบ/ชี้แจงเพื่อย้ายสิทธิมาที่หน่วยบริการประจำ' },
  B: { title: 'ประชากรที่อื่น ขึ้นทะเบียนที่ รพ.สต.เรา', tone: 'from-sky-600 to-sky-400', hint: 'อยู่นอกเขตรับผิดชอบแต่เลือก รพ.สต.บ้านหนองสนมเป็นหน่วยบริการประจำ' },
};
const REG = [['RUC', 'ประชากรสิทธิ UC (UCS+WEL)'], ['ROFC', 'ประชากรสิทธิ ข้าราชการ (OFC)'], ['RSSS', 'ประชากรสิทธิ ประกันสังคม (SSS)'], ['RLGO', 'ประชากรสิทธิพนักงานท้องถิ่น (LGO)'], ['RNON', 'ประชากรไร้สิทธิ'], ['RNRD', 'ประชากรแรงงานต่างด้าว (NRD)'], ['ROTH', 'ประชากรสิทธิอื่นๆ']];
REG.forEach(([k, t]) => { CATS[k] = { title: t }; });
const COLS = ['เลข PID', 'ชื่อ-สกุล', 'อายุ', 'ที่อยู่', 'ประเภทอาศัย', 'สิทธิ', 'หน่วยบริการประจำ'];

export default function RightsRegistry() {
  const [docs, setDocs] = useState(null);
  const [open, setOpen] = useState(null);
  const [kw, setKw] = useState('');
  const [hos, setHos] = useState('');
  useEffect(() => onSnapshot(collection(db, 'rightsRegistry'), (s) => setDocs(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setDocs([])), []);
  const [ov, setOv] = useState({}); // กำหนดหมู่บ้านเอง: pid -> หมู่ที่ (เก็บแยกใน rightsVillageOverrides เพราะข้อมูลหลักถูกซิงก์ทับจาก JHCIS)
  const [deadOpen, setDeadOpen] = useState(false);
  const [fix, setFix] = useState(null); // {kw, tab, busy}
  useEffect(() => onSnapshot(collection(db, 'rightsVillageOverrides'), (s) => setOv(Object.fromEntries(s.docs.map((d) => [d.id, Number(d.data().no)]))), () => setOv({})), []);
  const sum = docs?.find((d) => d.id === 'summary');
  const rowsOf = (cat) => (docs || []).filter((d) => d.cat === cat).sort((a, b) => a.idx - b.idx).flatMap((d) => d.rows || []);
  const list = useMemo(() => {
    if (!open) return [];
    const k = kw.trim();
    return rowsOf(open).filter((r) => (!k || r.slice(0, 4).join(' ').includes(k)) && (!hos || r[6] === hos));
  }, [docs, open, kw, hos]); // eslint-disable-line react-hooks/exhaustive-deps
  const vnoOf = (r) => { const g = /ม\.(\d+)\s*$/.exec(String(r[3] || '')); return g ? Number(g[1]) : (ov[r[0]] ?? -1); };
  // คนที่ที่อยู่ไม่มีหมู่ (หรือที่เรากำหนดหมู่ให้เอง) รวมทุกประเภท ไม่ซ้ำ PID
  const fixList = useMemo(() => {
    const seen = new Map();
    for (const k of ['A', 'C', ...REG.map((x) => x[0])]) for (const r of rowsOf(k)) { if (!/ม\.\d+\s*$/.test(String(r[3] || '')) && !seen.has(r[0])) seen.set(r[0], r); }
    return [...seen.values()];
  }, [docs]); // eslint-disable-line react-hooks/exhaustive-deps
  const vilRows = useMemo(() => {
    const keys = ['A', 'C', ...REG.map((x) => x[0])];
    const m = {};
    for (const k of keys) for (const r of rowsOf(k)) { const no = vnoOf(r); ((m[no] ||= {})[k] = (m[no][k] || 0) + 1); }
    const reg = (v) => REG.reduce((a, x) => a + (v?.[x[0]] || 0), 0);
    // ชื่อหมู่บ้าน/หลังคาเรือนมาจาก JHCIS ที่ซิงก์ล่าสุด (sum.villages); ถ้ายังไม่มีใช้ค่าสำรองใน config
    const live = (sum?.villages || []).map((v) => ({ ...v, households: VILLAGES.find((x) => x.no === v.no)?.households ?? 0 }));
    const base = live.length ? live : VILLAGES;
    const list = base.map((v) => ({ ...v, name: v.no === 0 ? 'นอกเขต (ใช้บันทึกคนนอกเขตฯ)' : v.name, ...(m[v.no] || {}), pop: reg(m[v.no]) }));
    list.push({ no: -1, name: 'ไม่ระบุหมู่/ไม่มีที่อยู่', houses: 0, households: 0, ...(m[-1] || {}), pop: reg(m[-1]) });
    return list;
  }, [docs]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!docs) return <Spinner />;
  const c = sum?.counts || {};
  const VCOLS = [['pop', 'ประชากร (ทะเบียนราษฎร์)'], ['RUC', 'UC/Wel'], ['ROFC', 'ข้าราชการ'], ['RSSS', 'ประกันสังคม'], ['RLGO', 'อปท.'], ['RNRD', 'ต่างด้าว'], ['ROTH', 'อื่นๆ'], ['RNON', 'ไม่มีสิทธิ'], ['A', 'UC/Wel ตรง'], ['C', 'UC/Wel ไม่ตรง']];
  const vilXlsx = () => exportXlsx(vilRows.map((v) => ({ 'หมู่ที่': v.no > 0 ? v.no : '-', 'รหัสหมู่บ้าน': v.code || '', 'ชื่อหมู่บ้าน': v.name, 'บ้าน(หลัง)': v.houses, 'ครอบครัว': v.households, ...Object.fromEntries(VCOLS.map(([k, t]) => [t, v[k] || 0])) })), 'หมู่บ้าน', 'รายงานหมู่บ้านและสิทธิ์การรักษา');
  const toXlsx = () => exportXlsx(list.map((r) => Object.fromEntries(COLS.map((h, i) => [h, r[i]]))), 'รายชื่อ', `ทะเบียนสิทธิ_${open}`);
  return (
    <div className="space-y-4">
      <PageHeader title="รายงานหมู่บ้านและสิทธิ์การรักษา (UC/Wel ตรง–ไม่ตรง)" subtitle={sum ? `ข้อมูล ณ ${sum.asOf || ''} · ส่งล่าสุด ${sum.updatedAt?.toDate ? fmtDateTime(sum.updatedAt.toDate()) : ''}` : 'ยังไม่มีข้อมูล'} />
      <SyncNowButton kinds={['rights']} className="print:hidden" />
      {sum?.reg && (
        <section className="card p-5 print:shadow-none">
          <div className="mb-3 text-center font-bold leading-relaxed">
            <div>โรงพยาบาลส่งเสริมสุขภาพตำบลบ้านหนองสนม</div><div>ตำบลเชียงเครือ อำเภอเมืองสกลนคร จังหวัดสกลนคร</div><div>รหัสสถานบริการ {sum.pcu || '05449'}</div>
          </div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-slate-700">ประชากร (ให้ใช้สิทธิ์ประชากรตามทะเบียนราษฎร์)</p>
            <button className="btn-outline print:hidden" onClick={() => window.print()}>พิมพ์รายงาน</button>
          </div>
          <ul className="space-y-1">
            {REG.map(([k, t]) => (
              <li key={k}><button onClick={() => { setOpen(k); setKw(''); setHos(''); }} className="flex w-full items-baseline gap-2 rounded px-1 py-1 text-left hover:bg-sky-50">
                <span>- {t}</span><span className="flex-1 border-b border-dotted border-slate-400" /><b className="tabular-nums">{nf(sum.reg[k] || 0)}</b><span className="text-sm text-slate-500">คน</span></button></li>))}
          </ul>
          <p className="mt-2 text-sm text-slate-600">รวม {nf(Object.values(sum.reg).reduce((a, b) => a + b, 0))} คน · UC = {nf(sum.regUcWel?.[0])} + WEL = {nf(sum.regUcWel?.[1])} · <span className="print:hidden">กดที่รายการเพื่อดูรายชื่อตามประเภทสิทธิ</span></p>
          <p className="text-xs text-slate-400">ประชากรตามทะเบียนราษฎร์ = ประเภทการอยู่อาศัย 1 และ 3 · ตัดผู้เสียชีวิต · สิทธิที่หมดอายุนับเป็นไร้สิทธิ</p>
        </section>
      )}
      {sum && (
        <section className="card overflow-x-auto p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold text-slate-700">หมู่บ้านในเขตรับผิดชอบ และสิทธิ์การรักษาแยกหมู่บ้าน</h3>
            <button className="btn-outline print:hidden" onClick={vilXlsx}><FileSpreadsheet className="h-4 w-4" /> ส่งออก Excel</button>
          </div>
          <table className="w-full whitespace-nowrap text-sm">
            <thead><tr className="border-b bg-slate-50 text-slate-500"><th className="px-2 py-1 text-left">หมู่</th><th className="px-2 py-1 text-left">หมู่บ้าน</th><th className="px-2 py-1 text-right">บ้าน(หลัง)</th><th className="px-2 py-1 text-right">ครอบครัว</th>{VCOLS.map(([k, t]) => <th key={k} className={`px-2 py-1 text-right ${k === 'A' ? 'text-emerald-700' : k === 'C' ? 'text-rose-700' : ''}`}>{t}</th>)}</tr></thead>
            <tbody>{vilRows.map((v) => (
              <tr key={v.no} className="border-b last:border-0 hover:bg-slate-50"><td className="px-2 py-1">{v.no > 0 ? v.no : '-'}</td><td className="px-2 py-1 font-medium">{v.no === -1 ? <button className="text-left font-medium text-sky-700 underline decoration-dotted hover:text-sky-900 print:no-underline" onClick={() => setFix({ kw: '', tab: 'todo' })}>{v.name} ✎ กำหนดหมู่บ้าน</button> : v.name}</td><td className="px-2 py-1 text-right tabular-nums">{nf(v.houses)}</td><td className="px-2 py-1 text-right tabular-nums">{nf(v.households)}</td>{VCOLS.map(([k]) => <td key={k} className={`px-2 py-1 text-right tabular-nums ${k === 'A' ? 'text-emerald-700' : k === 'C' ? 'text-rose-700' : ''}`}>{nf(v[k])}</td>)}</tr>))}
              <tr className="border-t-2 bg-slate-50 font-bold"><td className="px-2 py-1" colSpan={2}>รวม</td><td className="px-2 py-1 text-right tabular-nums">{nf(vilRows.reduce((a, v) => a + v.houses, 0))}</td><td className="px-2 py-1 text-right tabular-nums">{nf(vilRows.reduce((a, v) => a + v.households, 0))}</td>{VCOLS.map(([k]) => <td key={k} className="px-2 py-1 text-right tabular-nums">{nf(vilRows.reduce((a, v) => a + (v[k] || 0), 0))}</td>)}</tr>
            </tbody>
          </table>
          <p className="mt-1 text-xs text-slate-400">ชื่อหมู่บ้านและจำนวนบ้านดึงจาก JHCIS ทุกครั้งที่ซิงก์ (ครอบครัวเป็นค่าที่บันทึกไว้ ณ {VILLAGES_ASOF}) · ประชากรและสิทธิ์นับจากทะเบียนราษฎร์ (ประเภทอาศัย 1,3) แยกตามหมู่ในที่อยู่ · “UC/Wel ตรง/ไม่ตรง” ใช้เกณฑ์เดียวกับด้านบน</p>
        </section>
      )}
      {sum?.deadReport && (
        <section className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h3 className="font-bold text-slate-700">⚠️ ตายตามไฟล์ตรวจสอบสิทธิ์ แต่ JHCIS ยังไม่ตัดตาย</h3>
            <p className="text-xs text-slate-500">จากไฟล์ {sum.deadReport.fileName} (นำเข้า {sum.deadReport.asOf}) · คนที่บันทึกตายใน JHCIS แล้วจะหายจากรายการเองในรอบซิงก์ถัดไป</p>
          </div>
          <button className={`btn ${(sum.deadReport.list || []).length ? 'bg-rose-600 text-white hover:bg-rose-700' : 'btn-outline'}`} onClick={() => setDeadOpen(true)}>{nf((sum.deadReport.list || []).length)} คน — ดูรายชื่อ</button>
        </section>
      )}
      {!sum ? <p className="card p-6 text-slate-500">ยังไม่มีข้อมูล — ให้รันสคริปต์ที่เครื่อง JHCIS: <code>node sync.mjs --rights</code></p> : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            {['A', 'C', 'B'].map((k) => (
              <button key={k} onClick={() => { setOpen(k); setKw(''); setHos(''); }} className="card p-4 text-left transition hover:shadow-md">
                <div className={`mb-2 h-1.5 w-16 rounded-full bg-gradient-to-r ${CATS[k].tone}`} />
                <div className="text-3xl font-bold tabular-nums">{nf(c[k])} <span className="text-base font-normal text-slate-500">คน</span></div>
                <div className="mt-1 text-sm font-semibold text-slate-700">{CATS[k].title}</div>
                <div className="mt-1 text-xs text-slate-500">{CATS[k].hint}</div>
                <div className="mt-2 text-xs font-medium text-sky-700">กดดูรายชื่อ →</div>
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">UC/Wel = สิทธิบัตรทอง (กลุ่มสิทธิ UC และ สปร./ท.) · ตัดผู้เสียชีวิตและสิทธิที่หมดอายุแล้ว (หมดอายุ {nf(sum.expired)} คน) · ประชากรในเขตประเภท 1–4 ที่ไม่มีสิทธิ UC/Wel อีก {nf(sum.inAreaNoUcWel)} คน (ใช้สิทธิอื่น เช่น ข้าราชการ ประกันสังคม)</p>
          <section className="card overflow-x-auto p-4">
            <h3 className="mb-2 font-bold text-slate-700">แยกตามประเภทการอยู่อาศัย</h3>
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-slate-500"><th className="py-1">ประเภทอาศัย</th><th className="text-right">ตรง UC</th><th className="text-right">ตรง Wel</th><th className="text-right">ไม่ตรง UC</th><th className="text-right">ไม่ตรง Wel</th></tr></thead>
              <tbody>{[1, 2, 3, 4].map((t) => { const x = sum.byType?.[t] || { A: [0, 0], C: [0, 0] }; return (
                <tr key={t} className="border-b last:border-0"><td className="py-1">{TL[t]}</td><td className="text-right tabular-nums">{nf(x.A[0])}</td><td className="text-right tabular-nums">{nf(x.A[1])}</td><td className="text-right tabular-nums text-rose-700">{nf(x.C[0])}</td><td className="text-right tabular-nums text-rose-700">{nf(x.C[1])}</td></tr>); })}</tbody>
            </table>
            <p className="mt-1 text-xs text-slate-400">UC = กลุ่มสิทธิ 3 (บัตรทอง ไม่มี ท.) · Wel = กลุ่มสิทธิ 4 (สปร. มี ท.)</p>
          </section>
          <section className="card p-4">
            <h3 className="mb-2 font-bold text-slate-700">กลุ่มไม่ตรง — ขึ้นทะเบียนที่หน่วยบริการใดบ้าง</h3>
            <ul className="space-y-1 text-sm">{Object.entries(sum.hosC || {}).map(([h, n]) => (
              <li key={h}><button className="flex w-full justify-between gap-2 rounded px-1 py-0.5 text-left hover:bg-slate-50" onClick={() => { setOpen('C'); setKw(''); setHos(h); }}><span className="truncate">{h}</span><b className="tabular-nums">{nf(n)}</b></button></li>))}</ul>
          </section>
        </>
      )}
      {fix && (() => {
        const vOpts = vilRows.filter((v) => v.no >= 0);
        const k = fix.kw.trim();
        const rows = fixList.filter((r) => (fix.tab === 'done' ? ov[r[0]] != null : ov[r[0]] == null) && (!k || r.slice(0, 4).join(' ').includes(k)));
        return (
          <Modal title="กำหนดหมู่บ้านให้ผู้ที่ไม่ระบุหมู่/ไม่มีที่อยู่" onClose={() => setFix(null)} wide>
            <p className="mb-2 text-xs text-slate-500">เลือกหมู่บ้านให้แต่ละคน ระบบจะนับเข้าหมู่นั้นในตารางทันที (เก็บแยกไว้ในเว็บ ไม่ได้แก้ในโปรแกรม JHCIS จึงไม่ถูกซิงก์ทับ — ถ้าแก้ที่อยู่ใน JHCIS ภายหลัง ระบบจะใช้ที่อยู่จาก JHCIS แทน)</p>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button className={fix.tab === 'todo' ? 'btn btn-primary' : 'btn-outline'} onClick={() => setFix({ ...fix, tab: 'todo' })}>ยังไม่กำหนด ({nf(fixList.filter((r) => ov[r[0]] == null).length)})</button>
              <button className={fix.tab === 'done' ? 'btn btn-primary' : 'btn-outline'} onClick={() => setFix({ ...fix, tab: 'done' })}>กำหนดแล้ว ({nf(fixList.filter((r) => ov[r[0]] != null).length)})</button>
              <div className="relative min-w-48 flex-1"><Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" /><input className="input pl-8" placeholder="ค้นหาชื่อ / PID" value={fix.kw} onChange={(e) => setFix({ ...fix, kw: e.target.value })} /></div>
            </div>
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50"><tr><th className="px-2 py-1 text-left">เลข PID</th><th className="px-2 py-1 text-left">ชื่อ-สกุล</th><th className="px-2 py-1 text-left">อายุ</th><th className="px-2 py-1 text-left">ที่อยู่เดิม</th><th className="px-2 py-1 text-left">หมู่บ้านที่กำหนด</th></tr></thead>
                <tbody>{rows.slice(0, 300).map((r) => (
                  <tr key={r[0]} className="border-b"><td className="px-2 py-1">{r[0]}</td><td className="px-2 py-1">{r[1]}</td><td className="px-2 py-1">{r[2]}</td><td className="px-2 py-1 text-slate-500">{r[3] || '-'}</td>
                    <td className="px-2 py-1"><select className="input !py-1" value={ov[r[0]] ?? ''} onChange={(e) => setVil(r[0], e.target.value)}><option value="">— เลือกหมู่บ้าน —</option>{vOpts.map((v) => <option key={v.no} value={v.no}>{v.no > 0 ? `หมู่ ${v.no} ` : ''}{v.name}</option>)}</select></td></tr>))}
                  {!rows.length && <tr><td colSpan={5} className="p-4 text-center text-slate-500">{fix.tab === 'todo' ? 'ไม่มีรายการที่ต้องกำหนด 🎉' : 'ยังไม่มีรายการที่กำหนด'}</td></tr>}</tbody>
              </table>
              {rows.length > 300 && <p className="p-2 text-xs text-slate-500">แสดง 300 รายการแรก — ใช้ช่องค้นหาเพื่อกรอง</p>}
            </div>
            <p className="mt-2 text-xs text-slate-400">ในช่อง “กำหนดแล้ว” เลือก “— เลือกหมู่บ้าน —” เพื่อยกเลิกการกำหนด</p>
          </Modal>);
      })()}
      {deadOpen && sum?.deadReport && (
        <Modal title="ตายตามไฟล์ตรวจสอบสิทธิ์ แต่ JHCIS ยังไม่ตัดตาย" onClose={() => setDeadOpen(false)} wide>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs text-slate-500">กรุณาตรวจสอบแล้วบันทึกการตายในโปรแกรม JHCIS (ระบบนี้ไม่ได้ตัดตายให้เอง)</p>
            <button className="btn-outline" onClick={() => exportXlsx((sum.deadReport.list || []).map((d) => ({ 'เลข PID': d.pid, 'ชื่อ-สกุล': d.name, 'อายุ': d.age, 'ที่อยู่': d.addr, 'รหัสสิทธิใน JHCIS': d.right, 'สิทธิตามไฟล์': d.newRight })), 'ยังไม่ตัดตาย', 'ตายตามไฟล์สิทธิ_JHCISยังไม่ตัดตาย')}><FileSpreadsheet className="h-4 w-4" /> ส่งออก Excel</button>
          </div>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50"><tr>{['เลข PID', 'ชื่อ-สกุล', 'อายุ', 'ที่อยู่', 'สิทธิใน JHCIS'].map((h) => <th key={h} className="px-2 py-1 text-left">{h}</th>)}</tr></thead>
              <tbody>{(sum.deadReport.list || []).map((d) => <tr key={d.pid} className="border-b"><td className="px-2 py-1">{d.pid}</td><td className="px-2 py-1">{d.name}</td><td className="px-2 py-1">{d.age}</td><td className="px-2 py-1">{d.addr || '-'}</td><td className="px-2 py-1">{d.right || '-'}</td></tr>)}
                {!(sum.deadReport.list || []).length && <tr><td colSpan={5} className="p-4 text-center text-slate-500">ไม่มีรายการค้างแล้ว 🎉</td></tr>}</tbody>
            </table>
          </div>
        </Modal>
      )}
      {open && (
        <Modal title={`${CATS[open].title}${hos ? ` — ${hos}` : ''}`} onClose={() => setOpen(null)} wide>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-48"><Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" /><input className="input pl-8" placeholder="ค้นหาชื่อ / PID / ที่อยู่" value={kw} onChange={(e) => setKw(e.target.value)} /></div>
            {hos && <button className="btn-outline" onClick={() => setHos('')}>ล้างตัวกรองหน่วยบริการ</button>}
            <button className="btn-outline" onClick={toXlsx}><FileSpreadsheet className="h-4 w-4" /> ส่งออก Excel</button>
            <span className="text-sm text-slate-500">{nf(list.length)} คน</span>
          </div>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50"><tr>{COLS.map((h) => <th key={h} className="whitespace-nowrap px-2 py-1 text-left">{h}</th>)}</tr></thead>
              <tbody>{list.slice(0, 500).map((r, i) => <tr key={i} className="border-b"><td className="px-2 py-1">{r[0]}</td><td className="px-2 py-1">{r[1]}</td><td className="px-2 py-1">{r[2]}</td><td className="px-2 py-1">{r[3]}</td><td className="px-2 py-1">{r[4]}</td><td className="px-2 py-1">{r[5]}</td><td className="px-2 py-1">{r[6]}</td></tr>)}</tbody>
            </table>
            {list.length > 500 && <p className="p-2 text-xs text-slate-500">แสดง 500 รายการแรก — ค้นหาเพื่อกรอง หรือส่งออก Excel เพื่อดูทั้งหมด</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}
