// รายงานผลงาน P&P Fee Schedule ปีงบประมาณ 2570 + ประมาณการเงินที่พึงได้รับจาก สปสช.
// ตัวเลขมาจากสคริปต์บนเครื่อง JHCIS (tools/jhcis-sync: node sync.mjs --pp) เก็บรายเดือนต่อกิจกรรมที่ Firestore ppFee/fy{ปี} (ไม่มีชื่อผู้ป่วย)
// เงิน = จำนวนครั้งที่เบิกได้ (หลังจำกัดครั้งต่อคนต่อปี) × อัตราจ่ายในตาราง — เป็นการประมาณการ ไม่ใช่ยอดเบิกจ่ายจริง
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { FileSpreadsheet } from 'lucide-react';
import { db } from '../firebase';
import { exportXlsx } from '../lib/exportFile';
import { FEE_ACTS, QUARTERS, fyMonths, money } from '../lib/ppFee';
import { fmtDateTime, thMonths } from '../lib/thai';
import { PageHeader } from '../components/Logo';
import { Spinner } from '../components/ui';

const nf = (n) => Number(n || 0).toLocaleString('th-TH');
const mLabel = (ym) => thMonths[Number(ym.slice(5)) - 1];

export default function PPFee() {
  const [docs, setDocs] = useState(null);
  const [fy, setFy] = useState(null);
  const [mode, setMode] = useState('year');
  const [q, setQ] = useState(0);
  const [mon, setMon] = useState('');
  useEffect(() => onSnapshot(collection(db, 'ppFee'), (s) => setDocs(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.fy - a.fy)), () => setDocs([])), []);
  const cur = docs?.find((d) => d.fy === fy) || docs?.[0];
  const months = useMemo(() => (cur ? fyMonths(cur.fy) : []), [cur]);
  const pick = useMemo(() => (mode === 'year' ? months : mode === 'quarter' ? months.filter((m) => QUARTERS[q][1].includes(Number(m.slice(5)))) : [mon || months[0]]), [mode, q, mon, months]);
  const rows = useMemo(() => FEE_ACTS.map((a) => {
    const auto = !!a.auto && (cur?.mapped || []).includes(a.id);
    let n = 0; let e = 0; pick.forEach((m) => { const x = cur?.months?.[m]?.[a.id]; if (x) { n += x.n || 0; e += x.e || 0; } });
    return { a, auto, n, e, baht: auto ? money(a, e) : 0 };
  }), [cur, pick]);
  const trend = useMemo(() => months.map((m) => ({ m, v: FEE_ACTS.reduce((s, a) => s + (cur?.mapped?.includes(a.id) ? money(a, cur?.months?.[m]?.[a.id]?.e || 0) : 0), 0) })), [cur, months]);
  if (!docs) return <Spinner />;
  const total = rows.reduce((s, r) => s + r.baht, 0); const mappedN = rows.filter((r) => r.auto).length;
  const maxB = Math.max(1, ...rows.map((r) => r.baht)); const maxT = Math.max(1, ...trend.map((t) => t.v));
  const label = mode === 'year' ? `ปีงบประมาณ ${cur?.fy}` : mode === 'quarter' ? QUARTERS[q][0] : `${mLabel(pick[0] || '2026-10')} ${Number(pick[0]?.slice(0, 4)) + 543}`;
  const toXlsx = () => exportXlsx(rows.map(({ a, auto, n, e, baht }) => ({ 'กิจกรรม': a.name, 'อัตราจ่าย (บาท)': a.rate * (a.mult || 1), 'สิทธิ': a.right, 'รหัส NDP': a.ndp, 'ICD-10': a.icd, 'จำนวนครั้งสูงสุด/คน': a.cap, 'บันทึกใน JHCIS (ครั้ง)': auto ? n : '', 'เบิกได้หลังจำกัดครั้ง': auto ? e : '', 'ประมาณการเงิน (บาท)': auto ? baht : 'ยังไม่ผูกรหัส' })), 'PP Fee Schedule', `PPFeeSchedule_${label}`);
  return (
    <div className="space-y-4">
      <PageHeader title="รายงานผลงาน P&P Fee Schedule" subtitle={cur ? `ปีงบประมาณ ${cur.fy} · ข้อมูล ณ ${cur.asOf || ''}${cur.updatedAt?.toDate ? ` · ส่งล่าสุด ${fmtDateTime(cur.updatedAt.toDate())}` : ''}` : 'ยังไม่มีข้อมูล'} actions={<button className="btn-outline" onClick={toXlsx}><FileSpreadsheet className="h-4 w-4" /> ส่งออก Excel</button>} />
      {!cur ? <p className="card p-6 text-slate-500">ยังไม่มีข้อมูล — ให้รันสคริปต์ที่เครื่อง JHCIS: <code>node sync.mjs --pp</code></p> : (<>
        <div className="flex flex-wrap items-center gap-2">
          {[['year', 'รายปีงบ'], ['quarter', 'รายไตรมาส'], ['month', 'รายเดือน']].map(([k, t]) => <button key={k} className={mode === k ? 'btn-primary' : 'btn-outline'} onClick={() => setMode(k)}>{t}</button>)}
          {docs.length > 1 && <select className="input !w-auto" value={cur.fy} onChange={(e) => setFy(Number(e.target.value))}>{docs.map((d) => <option key={d.fy} value={d.fy}>ปีงบ {d.fy}</option>)}</select>}
          {mode === 'quarter' && <select className="input !w-auto" value={q} onChange={(e) => setQ(Number(e.target.value))}>{QUARTERS.map((x, i) => <option key={i} value={i}>{x[0]}</option>)}</select>}
          {mode === 'month' && <select className="input !w-auto" value={mon || months[0]} onChange={(e) => setMon(e.target.value)}>{months.map((m) => <option key={m} value={m}>{mLabel(m)} {Number(m.slice(0, 4)) + 543}</option>)}</select>}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <div className="card p-4 md:col-span-1"><div className="text-xs text-slate-500">ประมาณการเงินที่พึงได้รับ ({label})</div><div className="text-3xl font-bold tabular-nums text-emerald-700">{nf(total)} <span className="text-base font-normal text-slate-500">บาท</span></div></div>
          <div className="card p-4"><div className="text-xs text-slate-500">กิจกรรมที่ผูกกับ JHCIS แล้ว</div><div className="text-3xl font-bold tabular-nums">{mappedN}<span className="text-base font-normal text-slate-500"> / {FEE_ACTS.length}</span></div></div>
          <div className="card col-span-2 p-4 md:col-span-1"><div className="text-xs text-slate-500">เงินรายเดือนทั้งปีงบ (บาท)</div>
            <div className="mt-1 flex h-16 items-end gap-1">{trend.map((t) => <div key={t.m} className="flex-1" title={`${mLabel(t.m)}: ${nf(t.v)} บาท`}><div className="rounded-t bg-gradient-to-t from-emerald-600 to-emerald-300" style={{ height: `${Math.max(2, Math.round((t.v / maxT) * 60))}px` }} /></div>)}</div>
            <div className="flex gap-1 text-[10px] text-slate-400">{trend.map((t) => <span key={t.m} className="flex-1 text-center">{mLabel(t.m).slice(0, 3)}</span>)}</div></div>
        </div>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead><tr className="bg-slate-50 text-left text-slate-500"><th className="px-2 py-2">ที่</th><th className="px-2">กิจกรรม</th><th className="px-2 text-right">อัตราจ่าย</th><th className="px-2">สิทธิ</th><th className="px-2">รหัส NDP</th><th className="px-2">ICD-10</th><th className="px-2 text-right">สูงสุด/คน</th><th className="px-2 text-right">ผลงานใน JHCIS</th><th className="px-2 text-right">เบิกได้</th><th className="w-48 px-2">ประมาณการเงิน (บาท)</th></tr></thead>
            <tbody>{rows.map(({ a, auto, n, e, baht }, i) => (
              <tr key={a.id} className={`border-b ${auto ? '' : 'bg-slate-50/60 text-slate-400'}`}>
                <td className="px-2 py-1.5">{a.id === 'g1517' ? '15–17' : a.id}</td>
                <td className="px-2">{a.name}{auto && a.src && <div className="text-xs text-slate-400">นับจาก: {a.src}</div>}</td>
                <td className="px-2 text-right tabular-nums">{nf(a.rate)}{a.unit ? <span className="text-xs">{a.mult ? ` ×${a.mult}` : ''} /แผง</span> : ''}</td>
                <td className="px-2">{a.right}</td><td className="px-2">{a.ndp}</td><td className="px-2">{a.icd}</td><td className="px-2 text-right">{a.cap}</td>
                {auto ? (<><td className="px-2 text-right tabular-nums">{nf(n)}</td><td className="px-2 text-right font-medium tabular-nums">{nf(e)}</td>
                  <td className="px-2"><div className="flex items-center gap-2"><div className="h-2 flex-1 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-300" style={{ width: `${(baht / maxB) * 100}%` }} /></div><b className="w-20 text-right tabular-nums">{nf(baht)}</b></div></td></>)
                  : <td colSpan={3} className="px-2 text-center text-xs">รอผูกรหัสกับ JHCIS (ไม่รวมในยอดเงิน)</td>}
              </tr>))}
              <tr className="bg-emerald-50 font-bold"><td colSpan={9} className="px-2 py-2 text-right">รวมประมาณการ ({label})</td><td className="px-2 text-right tabular-nums text-emerald-800">{nf(total)}</td></tr>
            </tbody>
          </table>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500">
          <li>นับจากการให้บริการที่ รพ.สต.เรา (flagservice ให้บริการแล้ว) ตามรหัส ICD-10 ในตาราง ตัดคนต่างด้าว (สิทธิกลุ่ม 5) และจำกัดจำนวนครั้งต่อคนต่อปีงบตามคอลัมน์ "สูงสุด/คน"</li>
          <li>ยาเม็ดคุมกำเนิดคิดครั้งละ 3 แผง (อัตรา ×3) · วัคซีน EPI นับทุกเข็มอายุ 0–14 ปี · ข้อ 15–17 ใช้รหัส Z11.5 เดียวกัน แยกรายการไม่ได้ จึงนับรวม</li>
          <li>ข้อที่ขึ้น "รอผูกรหัส" ต้องใช้รหัสหัตถการ/ผลแล็บ ยังไม่รวมในยอดเงิน · ยอดนี้เป็นการประมาณการ ไม่ใช่ยอดจ่ายจริงจาก สปสช. (ขึ้นกับการส่งข้อมูลเบิกและเงื่อนไขของประกาศ)</li>
        </ul>
      </>)}
    </div>
  );
}
