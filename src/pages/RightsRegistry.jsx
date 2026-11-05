// ทะเบียนสิทธิ UC/Wel ตรง-ไม่ตรง — แดชบอร์ด + รายชื่อ
// ข้อมูลมาจากสคริปต์ที่เครื่อง JHCIS (node sync.mjs --rights) เก็บใน Firestore rightsRegistry (ชื่อ/อายุ/ที่อยู่/สถานพยาบาล ไม่มีเลขบัตร อ่านได้เฉพาะผู้ล็อกอิน)
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { FileSpreadsheet, Search } from 'lucide-react';
import { db } from '../firebase';
import { exportXlsx } from '../lib/exportFile';
import { fmtDateTime } from '../lib/thai';
import { PageHeader } from '../components/Logo';
import { Modal, Spinner } from '../components/ui';

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
  const sum = docs?.find((d) => d.id === 'summary');
  const rowsOf = (cat) => (docs || []).filter((d) => d.cat === cat).sort((a, b) => a.idx - b.idx).flatMap((d) => d.rows || []);
  const list = useMemo(() => {
    if (!open) return [];
    const k = kw.trim();
    return rowsOf(open).filter((r) => (!k || r.slice(0, 4).join(' ').includes(k)) && (!hos || r[6] === hos));
  }, [docs, open, kw, hos]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!docs) return <Spinner />;
  const c = sum?.counts || {};
  const toXlsx = () => exportXlsx(list.map((r) => Object.fromEntries(COLS.map((h, i) => [h, r[i]]))), 'รายชื่อ', `ทะเบียนสิทธิ_${open}`);
  return (
    <div className="space-y-4">
      <PageHeader title="ทะเบียนสิทธิ UC/Wel ตรง–ไม่ตรง" subtitle={sum ? `ข้อมูล ณ ${sum.asOf || ''} · ส่งล่าสุด ${sum.updatedAt?.toDate ? fmtDateTime(sum.updatedAt.toDate()) : ''}` : 'ยังไม่มีข้อมูล'} />
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
