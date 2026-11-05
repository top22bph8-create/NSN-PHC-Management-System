// รายงานสถานะการให้บริการของ รพ.สต. — แดชบอร์ดรายวัน/รายเดือน/รายปี
// ข้อมูลมาจากสคริปต์บนเครื่องที่ติดตั้ง JHCIS (tools/jhcis-sync) ส่งเฉพาะ "ตัวเลขสรุปรายวัน" เข้า Firestore คอลเล็กชัน serviceStats (ไม่มีชื่อ/เลขบัตรผู้ป่วย)
import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, setDoc, where, serverTimestamp } from 'firebase/firestore';
import { Activity, BarChart3, Copy, FileSpreadsheet, KeyRound, Loader2, Users } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { writeAudit } from '../lib/audit';
import { exportXlsx } from '../lib/exportFile';
import { fmtDate, fmtDateTime, thMonths, todayStr } from '../lib/thai';
import { PageHeader } from '../components/Logo';
import ThaiDateInput from '../components/ThaiDateInput';
import { Spinner, Toast } from '../components/ui';

const pad = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(y, m, 0).getDate();
const sumMap = (list, k) => { const o = {}; list.forEach((d) => Object.entries(d[k] || {}).forEach(([a, b]) => { o[a] = (o[a] || 0) + b; })); return o; };
const AGE_ORDER = ['0-4', '5-14', '15-24', '25-59', '60+'];
const FLAG = { '03': 'ให้บริการแล้ว', '99': 'คิวค้าง/ยกเลิก (ไม่นับ)' };
const SEX = { 1: 'ชาย', 2: 'หญิง' };
const nf = (n) => Number(n || 0).toLocaleString('th-TH');

function Bars({ title, data, order, color = 'from-sky-600 to-sky-400', labelOf = (k) => k, limit = 10 }) {
  const rows = (order || Object.keys(data).sort((a, b) => data[b] - data[a])).filter((k) => data[k] != null).slice(0, limit);
  const max = Math.max(1, ...rows.map((k) => data[k]));
  const total = rows.reduce((n, k) => n + data[k], 0);
  return (
    <section className="card p-4">
      <h3 className="mb-2 font-bold text-slate-700">{title}</h3>
      {rows.length === 0 ? <p className="text-sm text-slate-400">ไม่มีข้อมูล</p> : (
        <ul className="space-y-1.5">
          {rows.map((k) => (
            <li key={k} className="text-sm">
              <div className="flex justify-between gap-2"><span className="truncate" title={labelOf(k)}>{labelOf(k)}</span><b className="tabular-nums">{nf(data[k])} <span className="font-normal text-slate-400">({total ? Math.round((data[k] / total) * 100) : 0}%)</span></b></div>
              <div className="h-2 rounded-full bg-slate-100"><div className={`h-2 rounded-full bg-gradient-to-r ${color}`} style={{ width: `${(data[k] / max) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Kpi({ label, value, sub, tone }) {
  return <div className={`rounded-2xl bg-gradient-to-br ${tone} p-4 text-white shadow`}><div className="text-sm opacity-90">{label}</div><div className="text-3xl font-extrabold tabular-nums">{value}</div>{sub && <div className="text-xs opacity-80">{sub}</div>}</div>;
}

function ConnectPanel({ say }) {
  const [meta, setMeta] = useState(null);
  const [newKey, setNewKey] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => onSnapshot(doc(db, 'settings', 'statsMeta'), (s) => setMeta(s.exists() ? s.data() : {}), () => setMeta({})), []);
  const gen = async () => {
    if (!window.confirm('สร้างคีย์ใหม่? คีย์เก่าจะใช้ไม่ได้ทันที (ต้องนำคีย์ใหม่ไปใส่ในสคริปต์บนเครื่อง JHCIS)')) return;
    setBusy(true);
    try {
      const a = crypto.getRandomValues(new Uint8Array(24));
      const key = 'nsn_' + Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))), (b) => b.toString(16).padStart(2, '0')).join('');
      await setDoc(doc(db, 'settings', 'statsIngest'), { keyHash: hash, createdAt: serverTimestamp() });
      await writeAudit({ action: 'settings', module: 'service-stats', label: 'สร้างคีย์เชื่อมข้อมูล JHCIS' });
      setNewKey(key);
      try { await navigator.clipboard.writeText(key); say({ type: 'ok', text: 'สร้างคีย์แล้ว และคัดลอกไว้ในคลิปบอร์ดแล้ว (วางในไฟล์ตั้งค่าของสคริปต์ได้เลย)' }); } catch { say({ type: 'ok', text: 'สร้างคีย์แล้ว กดปุ่มคัดลอก' }); }
    } catch (e) { say({ type: 'error', text: 'ไม่สำเร็จ: ' + (e.code || e.message) }); } finally { setBusy(false); }
  };
  return (
    <section className="card mb-4 space-y-2 p-4 text-sm">
      <p className="flex items-center gap-2 font-semibold text-slate-700"><KeyRound className="h-4 w-4" /> การเชื่อมข้อมูลจาก JHCIS (เฉพาะ Super Admin)</p>
      <p className="text-slate-600">ซิงก์ล่าสุด: {meta?.lastSyncAt ? `${fmtDateTime(meta.lastSyncAt)} · ${meta.lastSyncDays} วัน${meta.lastSyncNote ? ` · ${meta.lastSyncNote}` : ''}` : 'ยังไม่เคยซิงก์'}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-outline" onClick={gen} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} สร้างคีย์เชื่อมข้อมูลใหม่</button>
        {newKey && <button className="btn btn-outline" onClick={() => navigator.clipboard.writeText(newKey)}><Copy className="h-4 w-4" /> คัดลอกคีย์อีกครั้ง</button>}
      </div>
      {newKey && <p className="text-xs text-amber-700">คีย์แสดงครั้งเดียวในหน้านี้ — ห้ามส่งในแชต/ไลน์ ใส่เฉพาะในไฟล์ตั้งค่าบนเครื่อง JHCIS</p>}
    </section>
  );
}

export default function ServiceStats() {
  const { profile } = useAuth();
  const isAdmin = profile.role === 'super_admin';
  const t = todayStr(); const [ty, tm] = t.split('-').map(Number);
  const [mode, setMode] = useState('month');
  const [day, setDay] = useState(t);
  const [mon, setMon] = useState(tm); const [yr, setYr] = useState(ty + 543);
  const [fiscal, setFiscal] = useState(false);
  const [docs, setDocs] = useState(null);
  const [toast, setToast] = useState(null);
  const say = (x) => { setToast(x); setTimeout(() => setToast(null), 5000); };

  const range = useMemo(() => {
    const y = yr - 543;
    if (mode === 'day') return [day, day];
    if (mode === 'month') return [`${y}-${pad(mon)}-01`, `${y}-${pad(mon)}-${lastDay(y, mon)}`];
    return fiscal ? [`${y - 1}-10-01`, `${y}-09-30`] : [`${y}-01-01`, `${y}-12-31`];
  }, [mode, day, mon, yr, fiscal]);
  useEffect(() => {
    setDocs(null);
    return onSnapshot(query(collection(db, 'serviceStats'), where('date', '>=', range[0]), where('date', '<=', range[1])),
      (s) => setDocs(s.docs.map((d) => d.data()).sort((a, b) => a.date.localeCompare(b.date))), (e) => { setDocs([]); say({ type: 'error', text: e.code === 'permission-denied' ? 'ไม่มีสิทธิ์อ่านข้อมูล (ต้องเผยแพร่ Firestore Rules ล่าสุดก่อน)' : e.message }); });
  }, [range]);

  const agg = useMemo(() => {
    const l = docs || [];
    const visits = l.reduce((n, d) => n + (d.visits || 0), 0);
    const persons = l.reduce((n, d) => n + (d.persons || 0), 0);
    const dx = {}; l.forEach((d) => (d.topDx || []).forEach((x) => { const k = x.code; dx[k] = dx[k] || { name: x.name, n: 0 }; dx[k].n += x.n; }));
    const topDx = Object.fromEntries(Object.entries(dx).sort((a, b) => b[1].n - a[1].n).slice(0, 10).map(([k, v]) => [k, v.n]));
    const dxName = Object.fromEntries(Object.entries(dx).map(([k, v]) => [k, `${k} ${v.name}`]));
    return {
      visits, persons, days: l.filter((d) => d.visits > 0).length, anc: l.reduce((n, d) => n + (d.anc || 0), 0), deaths: l.reduce((n, d) => n + (d.deaths || 0), 0),
      byRight: sumMap(l, 'byRight'), bySex: sumMap(l, 'bySex'), byAge: sumMap(l, 'byAge'), byFlag: sumMap(l, 'byFlag'), vaccines: sumMap(l, 'vaccines'), byVillage: sumMap(l, 'byVillage'), topDx, dxName,
    };
  }, [docs]);

  // แท่งแนวโน้ม: เดือน = รายวัน, ปี = รายเดือน
  const trend = useMemo(() => {
    if (!docs || mode === 'day') return [];
    if (mode === 'month') return docs.map((d) => ({ k: d.date.slice(8), v: d.visits }));
    const m = {}; docs.forEach((d) => { const k = d.date.slice(0, 7); m[k] = (m[k] || 0) + d.visits; });
    return Object.entries(m).map(([k, v]) => ({ k: thMonths[Number(k.slice(5)) - 1].slice(0, 3), v }));
  }, [docs, mode]);
  const tmax = Math.max(1, ...trend.map((x) => x.v));

  const doExport = () => {
    if (!docs?.length) return say({ type: 'error', text: 'ไม่มีข้อมูลให้ออกรายงาน' });
    exportXlsx(docs.map((d) => ({ 'วันที่': fmtDate(d.date), 'ครั้งที่รับบริการ': d.visits, 'จำนวนคน': d.persons, 'ฝากครรภ์': d.anc || 0, 'วัคซีน (เข็ม)': Object.values(d.vaccines || {}).reduce((a, b) => a + b, 0), 'เสียชีวิต': d.deaths || 0 })), 'สถานะการให้บริการ', `สถานะการให้บริการ_${range[0]}_${range[1]}`);
  };
  const lbl = { day: fmtDate(day), month: `${thMonths[mon - 1]} ${yr}`, year: fiscal ? `ปีงบประมาณ ${yr}` : `ปี ${yr}` }[mode];
  const years = Array.from({ length: 6 }, (_, i) => ty + 543 - i);

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-6">
      <PageHeader icon={Activity} emoji="📈" title="รายงานสถานะการให้บริการของ รพ.สต." subtitle="สรุปจำนวนผู้รับบริการจากโปรแกรม JHCIS — รายวัน รายเดือน รายปี (ตัวเลขสรุป ไม่แสดงข้อมูลผู้ป่วยรายบุคคล)"
        actions={<button className="btn bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25" onClick={doExport}><FileSpreadsheet className="h-4 w-4" /> Excel</button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[['day', 'รายวัน'], ['month', 'รายเดือน'], ['year', 'รายปี']].map(([k, l]) => (
          <button key={k} onClick={() => setMode(k)} className={`rounded-full px-4 py-2 text-sm font-semibold ${mode === k ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-brand-50'}`}>{l}</button>
        ))}
        {mode === 'day' && <div className="w-44"><ThaiDateInput value={day} onChange={(v) => v && setDay(v)} yearsBack={3} yearsForward={0} /></div>}
        {mode === 'month' && <select className="input !w-auto" value={mon} onChange={(e) => setMon(Number(e.target.value))} aria-label="เดือน">{thMonths.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>}
        {mode !== 'day' && <select className="input !w-auto" value={yr} onChange={(e) => setYr(Number(e.target.value))} aria-label="ปี พ.ศ.">{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>}
        {mode === 'year' && <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={fiscal} onChange={(e) => setFiscal(e.target.checked)} /> ปีงบประมาณ (ต.ค.–ก.ย.)</label>}
        <span className="ml-auto text-sm font-semibold text-brand-800">{lbl}</span>
      </div>

      {docs === null ? <Spinner /> : docs.length === 0 ? (
        <div className="card p-6 text-center text-slate-500"><BarChart3 className="mx-auto mb-2 h-8 w-8 text-slate-300" />ยังไม่มีข้อมูลในช่วงนี้ — ตรวจสอบว่าสคริปต์ซิงก์จาก JHCIS ทำงานแล้ว (ดูสถานะซิงก์ด้านล่าง)</div>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="ครั้งที่รับบริการ" value={nf(agg.visits)} sub={agg.days ? `เฉลี่ย ${nf(Math.round(agg.visits / agg.days))} ครั้ง/วันทำการ (${agg.days} วัน)` : ''} tone="from-sky-600 to-cyan-500" />
            <Kpi label="ผู้รับบริการ (คน, นับรายวันรวม)" value={nf(agg.persons)} tone="from-emerald-600 to-teal-500" />
            <Kpi label="ฝากครรภ์ (ครั้ง)" value={nf(agg.anc)} tone="from-fuchsia-600 to-pink-500" />
            <Kpi label="วัคซีน (เข็ม)" value={nf(Object.values(agg.vaccines).reduce((a, b) => a + b, 0))} sub={agg.deaths ? `เสียชีวิตในพื้นที่ ${agg.deaths} ราย` : ''} tone="from-amber-500 to-orange-500" />
          </div>
          {trend.length > 0 && (
            <section className="card mb-4 p-4">
              <h3 className="mb-2 font-bold text-slate-700">{mode === 'month' ? 'จำนวนครั้งที่รับบริการรายวัน' : 'จำนวนครั้งที่รับบริการรายเดือน'}</h3>
              <div className="flex items-end gap-1 overflow-x-auto pb-1">
                {trend.map((x) => (
                  <div key={x.k} className="flex min-w-[18px] flex-1 flex-col items-center justify-end" title={`${x.k}: ${nf(x.v)} ครั้ง`}>
                    <span className="text-[10px] tabular-nums text-slate-500">{x.v}</span>
                    <div className="w-full rounded-t bg-gradient-to-t from-sky-700 to-sky-400" style={{ height: `${x.v ? Math.max(3, Math.round((x.v / tmax) * 130)) : 0}px` }} />
                    <span className="text-[10px] text-slate-400">{x.k}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <Bars title="ตามสิทธิการรักษา" data={agg.byRight} color="from-emerald-600 to-emerald-400" />
            <Bars title="10 อันดับโรค/การวินิจฉัย" data={agg.topDx} labelOf={(k) => agg.dxName[k]} color="from-rose-600 to-rose-400" />
            <Bars title="ตามเพศ" data={agg.bySex} labelOf={(k) => SEX[k] || k} color="from-violet-600 to-violet-400" />
            <Bars title="ตามกลุ่มอายุ" data={agg.byAge} order={AGE_ORDER} color="from-amber-500 to-amber-300" />
            <Bars title="ตามหมู่บ้าน" data={agg.byVillage} color="from-teal-600 to-teal-400" />
            <Bars title="วัคซีนที่ให้ (รหัส)" data={agg.vaccines} color="from-fuchsia-600 to-pink-400" />
            <Bars title="ตามประเภทบริการ (ในแดชบอร์ดนับเฉพาะที่ให้บริการแล้ว)" data={agg.byFlag} labelOf={(k) => FLAG[k] || `รหัส ${k}`} color="from-slate-600 to-slate-400" />
          </div>
        </>
      )}
      {isAdmin && <div className="mt-4"><ConnectPanel say={say} /></div>}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
