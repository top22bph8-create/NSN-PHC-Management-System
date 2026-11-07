// รายงานผลงาน P&P Fee Schedule ปีงบประมาณ 2570 + ประมาณการเงินที่พึงได้รับจาก สปสช. + กลุ่มเป้าหมาย (ทำแล้ว/ยังไม่ทำ แยกหมู่บ้าน)
// ตัวเลขรายเดือนมาจากสคริปต์ node sync.mjs --pp (ppFee/fy{ปี}); รายชื่อกลุ่มเป้าหมายมาจาก node sync.mjs --targets (ppTargets/*)
// เงิน = จำนวนครั้งที่เบิกได้ (หลังจำกัดครั้งต่อคนต่อปี) × อัตราจ่ายในตาราง — เป็นการประมาณการ ไม่ใช่ยอดเบิกจ่ายจริง
import { Fragment, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { ChevronDown, ChevronRight, FileSpreadsheet, Search, Users } from 'lucide-react';
import { db } from '../firebase';
import { exportXlsx } from '../lib/exportFile';
import { FEE_ACTS, QUARTERS, fyMonths, money } from '../lib/ppFee';
import { fmtDateTime, thMonths } from '../lib/thai';
import { PageHeader } from '../components/Logo';
import { Modal, Spinner } from '../components/ui';

const nf = (n) => Number(n || 0).toLocaleString('th-TH');
const mLabel = (ym) => thMonths[Number(ym.slice(5)) - 1];
// กลุ่มกิจกรรม + สี (เขียนคลาสเต็มเพื่อให้ Tailwind สร้างให้)
const CATS = [
  { k: 'mch', t: 'ฝากครรภ์และหลังคลอด', ids: ['1', '2', '3', '4', '5'], head: 'bg-rose-50 text-rose-800 border-rose-300', chip: 'bg-rose-100 text-rose-700', bar: 'from-rose-500 to-rose-300' },
  { k: 'iron', t: 'ธาตุเหล็กและโลหิตจาง', ids: ['7', '8', '9'], head: 'bg-amber-50 text-amber-800 border-amber-300', chip: 'bg-amber-100 text-amber-800', bar: 'from-amber-500 to-amber-300' },
  { k: 'fp', t: 'วางแผนครอบครัว', ids: ['11', '12', '13'], head: 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-300', chip: 'bg-fuchsia-100 text-fuchsia-700', bar: 'from-fuchsia-500 to-fuchsia-300' },
  { k: 'vac', t: 'วัคซีน', ids: ['14', '18', '19'], head: 'bg-sky-50 text-sky-800 border-sky-300', chip: 'bg-sky-100 text-sky-700', bar: 'from-sky-500 to-sky-300' },
  { k: 'scr', t: 'คัดกรองและโรคเรื้อรัง', ids: ['6', '15', '16', '17', '20', '21'], head: 'bg-emerald-50 text-emerald-800 border-emerald-300', chip: 'bg-emerald-100 text-emerald-700', bar: 'from-emerald-500 to-emerald-300' },
  { k: 'den', t: 'ทันตกรรม', ids: ['10'], head: 'bg-teal-50 text-teal-800 border-teal-300', chip: 'bg-teal-100 text-teal-700', bar: 'from-teal-500 to-teal-300' },
];
const TARGET_CAT = { 1: 'TANC', 6: 'TFIT', 9: 'TCH', 14: 'TFLU' }; // กิจกรรมที่มีรายชื่อกลุ่มเป้าหมาย
const STT = { done: ['ทำแล้ว', 'bg-emerald-100 text-emerald-700'], partial: ['ทำบางส่วน', 'bg-amber-100 text-amber-800'], todo: ['ยังไม่ทำ', 'bg-rose-100 text-rose-700'] };

function TargetModal({ id, act, tdocs, onClose }) {
  const sum = tdocs.find((d) => d.id === 'summary');
  const info = sum?.acts?.[id];
  const [moo, setMoo] = useState('');
  const [st, setSt] = useState('todo');
  const [kw, setKw] = useState('');
  const all = useMemo(() => tdocs.filter((d) => d.cat === TARGET_CAT[id]).sort((a, b) => a.idx - b.idx).flatMap((d) => d.rows || []), [tdocs, id]);
  const list = useMemo(() => all.filter((r) => (!moo || r[4] === moo) && (st === 'all' || r[5] === st) && (!kw.trim() || r.slice(0, 4).join(' ').includes(kw.trim()))), [all, moo, st, kw]);
  const vname = (m) => sum?.villages?.[m] || '';
  const toXlsx = () => exportXlsx(list.map((r) => ({ 'เลข PID': r[0], 'ชื่อ-สกุล': r[1], 'อายุ': r[2], 'บ้านเลขที่': r[3], 'หมู่': r[4], 'หมู่บ้าน': vname(r[4]), 'สถานะ': STT[r[5]]?.[0] || r[5], 'รายละเอียด': r[6] })), 'กลุ่มเป้าหมาย', `กลุ่มเป้าหมาย_${act.name}_${st === 'all' ? 'ทั้งหมด' : STT[st][0]}${moo ? `_หมู่${moo}` : ''}`);
  const moos = Object.keys(info?.byMoo || {}).sort((a, b) => a - b);
  return (
    <Modal title={`กลุ่มเป้าหมาย: ${act.name}`} onClose={onClose} wide>
      {!info ? <p className="text-slate-500">ยังไม่มีข้อมูลกลุ่มเป้าหมาย — รันสคริปต์ <code>node sync.mjs --targets</code></p> : (
        <div className="space-y-3 text-sm">
          <p className="text-slate-500">{info.rule} · ข้อมูล ณ {sum.asOf}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[['all', 'เป้าหมายทั้งหมด', info.total, 'bg-slate-50 text-slate-700'], ['done', 'ทำแล้ว', info.done, 'bg-emerald-50 text-emerald-700'], ['partial', 'ทำบางส่วน', info.partial, 'bg-amber-50 text-amber-800'], ['todo', 'ยังไม่ทำ', info.todo, 'bg-rose-50 text-rose-700']].map(([k, t, v, c]) => (
              <button key={k} onClick={() => setSt(k)} className={`rounded-xl border p-2 text-left ${c} ${st === k ? 'ring-2 ring-sky-400' : ''}`}><div className="text-xs">{t}</div><div className="text-2xl font-bold tabular-nums">{nf(v)}</div>{info.total > 0 && k !== 'all' && <div className="text-xs opacity-70">{Math.round((v / info.total) * 100)}%</div>}</button>))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setMoo('')} className={`rounded-full border px-3 py-1 ${!moo ? 'border-sky-500 bg-sky-50 text-sky-700' : 'bg-white text-slate-600'}`}>ทุกหมู่</button>
            {moos.map((m) => { const o = info.byMoo[m]; const todo = o.t - o.d - o.p; return (
              <button key={m} onClick={() => setMoo(m)} title={vname(m)} className={`rounded-full border px-3 py-1 ${moo === m ? 'border-sky-500 bg-sky-50 text-sky-700' : 'bg-white text-slate-600'}`}>หมู่ {m} <span className="text-xs text-slate-400">{vname(m)}</span> <b className="ml-1 text-rose-600">{todo}</b><span className="text-xs text-slate-400">/{o.t}</span></button>); })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-48 flex-1"><Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" /><input className="input pl-8" placeholder="ค้นหาชื่อ / PID / บ้านเลขที่" value={kw} onChange={(e) => setKw(e.target.value)} /></div>
            <button className="btn-outline" onClick={toXlsx}><FileSpreadsheet className="h-4 w-4" /> ส่งออก Excel</button>
            <span className="text-slate-500">{nf(list.length)} คน</span>
          </div>
          <div className="max-h-[50vh] overflow-auto rounded-lg border">
            <table className="w-full">
              <thead className="sticky top-0 bg-slate-50 text-left text-slate-500"><tr><th className="px-2 py-1.5">ชื่อ-สกุล</th><th className="px-2">อายุ</th><th className="px-2">บ้านเลขที่</th><th className="px-2">หมู่</th><th className="px-2">สถานะ</th><th className="px-2">รายละเอียด</th></tr></thead>
              <tbody>{list.slice(0, 500).map((r, i) => (
                <tr key={i} className="border-t hover:bg-sky-50/50"><td className="px-2 py-1">{r[1]}</td><td className="px-2">{r[2]}</td><td className="px-2">{r[3]}</td><td className="px-2">{r[4]}</td><td className="px-2"><span className={`rounded-full px-2 py-0.5 text-xs ${STT[r[5]]?.[1]}`}>{STT[r[5]]?.[0]}</span></td><td className="px-2 text-xs text-slate-500">{r[6]}</td></tr>))}</tbody>
            </table>
            {list.length > 500 && <p className="p-2 text-xs text-slate-500">แสดง 500 รายการแรก — เลือกหมู่/ค้นหาเพื่อกรอง หรือส่งออก Excel เพื่อดูทั้งหมด</p>}
          </div>
        </div>)}
    </Modal>
  );
}

export default function PPFee() {
  const [docs, setDocs] = useState(null);
  const [tdocs, setTdocs] = useState([]);
  const [fy, setFy] = useState(null);
  const [mode, setMode] = useState('year');
  const [q, setQ] = useState(0);
  const [mon, setMon] = useState('');
  const [open, setOpen] = useState(() => new Set());
  const [tgt, setTgt] = useState(null);
  useEffect(() => onSnapshot(collection(db, 'ppFee'), (s) => setDocs(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.fy - a.fy)), () => setDocs([])), []);
  useEffect(() => onSnapshot(collection(db, 'ppTargets'), (s) => setTdocs(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setTdocs([])), []);
  const cur = docs?.find((d) => d.fy === fy) || docs?.[0];
  const months = useMemo(() => (cur ? fyMonths(cur.fy) : []), [cur]);
  const pick = useMemo(() => (mode === 'year' ? months : mode === 'quarter' ? months.filter((m) => QUARTERS[q][1].includes(Number(m.slice(5)))) : [mon || months[0]]), [mode, q, mon, months]);
  const byId = useMemo(() => Object.fromEntries(FEE_ACTS.map((a) => {
    const auto = !!a.auto && (cur?.mapped || []).includes(a.id);
    let n = 0; let e = 0; pick.forEach((m) => { const x = cur?.months?.[m]?.[a.id]; if (x) { n += x.n || 0; e += x.e || 0; } });
    return [a.id, { a, auto, n, e, baht: auto ? money(a, e) : 0 }];
  })), [cur, pick]);
  const trend = useMemo(() => months.map((m) => ({ m, v: FEE_ACTS.reduce((s, a) => s + (cur?.mapped?.includes(a.id) ? money(a, cur?.months?.[m]?.[a.id]?.e || 0) : 0), 0) })), [cur, months]);
  const tsum = tdocs.find((d) => d.id === 'summary');
  if (!docs) return <Spinner />;
  const all = Object.values(byId); const total = all.reduce((s, r) => s + r.baht, 0); const mappedN = all.filter((r) => r.auto).length;
  const maxB = Math.max(1, ...all.map((r) => r.baht)); const maxT = Math.max(1, ...trend.map((t) => t.v));
  const label = mode === 'year' ? `ปีงบประมาณ ${cur?.fy}` : mode === 'quarter' ? QUARTERS[q][0] : `${mLabel(pick[0] || '2026-10')} ${Number(pick[0]?.slice(0, 4)) + 543}`;
  const toggle = (id) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toXlsx = () => exportXlsx(all.map(({ a, auto, n, e, baht }) => ({ 'กิจกรรม': a.name, 'อัตราจ่าย (บาท)': a.rate * (a.mult || 1), 'สิทธิ': a.right, 'รหัส NDP': a.ndp, 'ICD-10': a.icd, 'จำนวนครั้งสูงสุด/คน': a.cap, 'บันทึกใน JHCIS (ครั้ง)': auto ? n : '', 'เบิกได้หลังจำกัดครั้ง': auto ? e : '', 'ประมาณการเงิน (บาท)': auto ? baht : 'ยังไม่ผูกรหัส' })), 'PP Fee Schedule', `PPFeeSchedule_${label}`);
  return (
    <div className="space-y-4">
      <PageHeader title="รายงานผลงาน P&P Fee Schedule" subtitle={cur ? `ปีงบประมาณ ${cur.fy} · ข้อมูล ณ ${cur.asOf || ''}${cur.updatedAt?.toDate ? ` · ส่งล่าสุด ${fmtDateTime(cur.updatedAt.toDate())}` : ''}` : 'ยังไม่มีข้อมูล'} actions={<button className="btn-outline" onClick={toXlsx}><FileSpreadsheet className="h-4 w-4" /> ส่งออก Excel</button>} />
      {!cur ? <p className="card p-6 text-slate-500">ยังไม่มีข้อมูล — ให้รันสคริปต์ที่เครื่อง JHCIS: <code>node sync.mjs --pp</code></p> : (<>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border bg-white">{[['year', 'รายปีงบ'], ['quarter', 'รายไตรมาส'], ['month', 'รายเดือน']].map(([k, t]) => <button key={k} className={`px-3 py-1.5 text-sm ${mode === k ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`} onClick={() => setMode(k)}>{t}</button>)}</div>
          {docs.length > 1 && <select className="input !w-auto" value={cur.fy} onChange={(e) => setFy(Number(e.target.value))}>{docs.map((d) => <option key={d.fy} value={d.fy}>ปีงบ {d.fy}</option>)}</select>}
          {mode === 'quarter' && <select className="input !w-auto" value={q} onChange={(e) => setQ(Number(e.target.value))}>{QUARTERS.map((x, i) => <option key={i} value={i}>{x[0]}</option>)}</select>}
          {mode === 'month' && <select className="input !w-auto" value={mon || months[0]} onChange={(e) => setMon(e.target.value)}>{months.map((m) => <option key={m} value={m}>{mLabel(m)} {Number(m.slice(0, 4)) + 543}</option>)}</select>}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-500 p-4 text-white shadow"><div className="text-xs opacity-80">ประมาณการเงินที่พึงได้รับ ({label})</div><div className="text-3xl font-bold tabular-nums">{nf(total)} <span className="text-base font-normal opacity-80">บาท</span></div></div>
          <div className="rounded-2xl bg-gradient-to-br from-sky-600 to-indigo-500 p-4 text-white shadow"><div className="text-xs opacity-80">กิจกรรมที่ผูกกับ JHCIS แล้ว</div><div className="text-3xl font-bold tabular-nums">{mappedN}<span className="text-base font-normal opacity-80"> / {FEE_ACTS.length}</span></div></div>
          <div className="card p-4"><div className="text-xs text-slate-500">เงินรายเดือนทั้งปีงบ</div>
            <div className="mt-1 flex h-14 items-end gap-1">{trend.map((t) => <div key={t.m} className="flex-1" title={`${mLabel(t.m)}: ${nf(t.v)} บาท`}><div className="rounded-t bg-gradient-to-t from-emerald-600 to-emerald-300" style={{ height: `${Math.max(2, Math.round((t.v / maxT) * 54))}px` }} /></div>)}</div>
            <div className="flex gap-1 text-[10px] text-slate-400">{trend.map((t) => <span key={t.m} className="flex-1 text-center">{mLabel(t.m).slice(0, 3)}</span>)}</div></div>
        </div>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead><tr className="bg-slate-50 text-left text-xs text-slate-500"><th className="w-8 px-2 py-2" /><th className="px-2">กิจกรรม</th><th className="px-2 text-right">อัตราจ่าย</th><th className="px-2 text-right">เบิกได้ (ครั้ง)</th><th className="w-52 px-2">ประมาณการเงิน (บาท)</th><th className="w-44 px-2">กลุ่มเป้าหมาย</th></tr></thead>
            <tbody>{CATS.map((c) => {
              const rs = c.ids.map((id) => byId[id]).filter(Boolean); const sub = rs.reduce((s, r) => s + r.baht, 0);
              return (<Fragment key={c.k}>
                <tr><td colSpan={6} className={`border-l-4 px-3 py-1.5 font-bold ${c.head}`}><div className="flex justify-between"><span>{c.t}</span><span className="tabular-nums">{nf(sub)} บาท</span></div></td></tr>
                {rs.map(({ a, auto, n, e, baht }) => {
                  const ti = TARGET_CAT[a.id] ? tsum?.acts?.[a.id] : null; const isOpen = open.has(a.id);
                  return (<Fragment key={a.id}>
                    <tr className={`border-b hover:bg-slate-50 ${auto ? '' : 'text-slate-400'}`}>
                      <td className="px-2"><button onClick={() => toggle(a.id)} className="rounded p-1 hover:bg-slate-200" aria-label="รายละเอียด">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button></td>
                      <td className="px-2 py-2"><span className={`mr-2 inline-block rounded-md px-1.5 text-xs font-bold ${c.chip}`}>{a.id}</span>{a.name}{!auto && <span className="ml-2 rounded bg-slate-100 px-1.5 text-xs">รอผูกรหัส</span>}</td>
                      <td className="px-2 text-right tabular-nums">{nf(a.rate)}{a.mult ? <span className="text-xs text-slate-400"> ×{a.mult}</span> : null}</td>
                      <td className="px-2 text-right font-medium tabular-nums">{auto ? nf(e) : '–'}</td>
                      <td className="px-2">{auto ? <div className="flex items-center gap-2"><div className="h-2 flex-1 rounded-full bg-slate-100"><div className={`h-2 rounded-full bg-gradient-to-r ${c.bar}`} style={{ width: `${(baht / maxB) * 100}%` }} /></div><b className="w-20 text-right tabular-nums">{nf(baht)}</b></div> : <span className="text-xs">ไม่รวมในยอดเงิน</span>}</td>
                      <td className="px-2">{TARGET_CAT[a.id] ? (ti ? (
                        <button onClick={() => setTgt(a.id)} className="w-full text-left"><div className="flex justify-between text-xs"><span className="text-emerald-700">ทำแล้ว {nf(ti.done)}</span><span className="text-rose-600">ยังไม่ทำ {nf(ti.todo)}</span></div>
                          <div className="my-0.5 flex h-2 overflow-hidden rounded-full bg-rose-100"><div className="bg-emerald-500" style={{ width: `${ti.total ? (ti.done / ti.total) * 100 : 0}%` }} /><div className="bg-amber-400" style={{ width: `${ti.total ? (ti.partial / ti.total) * 100 : 0}%` }} /></div>
                          <div className="flex items-center gap-1 text-xs text-sky-700"><Users className="h-3 w-3" /> ดูรายชื่อ ({nf(ti.total)})</div></button>) : <span className="text-xs text-slate-300">รอข้อมูล</span>) : <span className="text-xs text-slate-300">–</span>}</td>
                    </tr>
                    {isOpen && <tr className="border-b bg-slate-50/70"><td /><td colSpan={5} className="px-2 py-2"><div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
                      <span><b className="text-slate-500">สิทธิ:</b> {a.right}</span><span><b className="text-slate-500">รหัส NDP:</b> {a.ndp}</span><span><b className="text-slate-500">ICD-10:</b> {a.icd}</span><span><b className="text-slate-500">สูงสุด/คน:</b> {a.cap}</span>
                      {auto && <><span><b className="text-slate-500">บันทึกใน JHCIS:</b> {nf(n)} ครั้ง</span><span><b className="text-slate-500">นับจาก:</b> {a.src}</span></>}{a.unit && <span><b className="text-slate-500">หน่วย:</b> {a.unit}</span>}</div></td></tr>}
                  </Fragment>);
                })}
              </Fragment>);
            })}
              <tr className="bg-emerald-50 font-bold"><td colSpan={4} className="px-3 py-2 text-right">รวมประมาณการ ({label})</td><td className="px-2 text-right tabular-nums text-emerald-800">{nf(total)}</td><td /></tr>
            </tbody>
          </table>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500">
          <li>กดลูกศรหน้าแต่ละแถวเพื่อดูสิทธิ รหัส NDP รหัส ICD-10 และจำนวนครั้งสูงสุดต่อคน · กด "ดูรายชื่อ" ในคอลัมน์กลุ่มเป้าหมายเพื่อดูรายชื่อ แยกหมู่บ้านและสถานะ</li>
          <li>นับจากการให้บริการที่ รพ.สต.เรา ตามรหัส ICD-10 ในตาราง ตัดคนต่างด้าว และจำกัดจำนวนครั้งต่อคนต่อปีงบ · ยาเม็ดคุมกำเนิดคิดครั้งละ 3 แผง · ข้อ 15–17 ใช้รหัส Z11.5 เดียวกัน จึงนับรวม</li>
          <li>ข้อที่ขึ้น "รอผูกรหัส" ต้องใช้รหัสหัตถการ/ผลแล็บ ยังไม่รวมในยอดเงิน · ยอดนี้เป็นการประมาณการ ไม่ใช่ยอดจ่ายจริงจาก สปสช.</li>
        </ul>
      </>)}
      {tgt && <TargetModal id={tgt} act={FEE_ACTS.find((a) => a.id === tgt)} tdocs={tdocs} onClose={() => setTgt(null)} />}
    </div>
  );
}
