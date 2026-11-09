// แดชบอร์ดรายจ่ายตามฎีกา แยกรายเดือน (ปีงบประมาณปัจจุบัน) และรายปี — แยกกลุ่ม หมวด 1-10 / 11-13 / ภาษีหัก ณ ที่จ่าย / ประกันสังคมฝ่ายลูกจ้าง / ค่าใช้จ่ายอื่นๆ ไม่นำมารวมกัน
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { thMonths } from '../lib/thai';
import { GROUP_KEYS, monthlySpend, money, yearlySpend, esc, openPrint } from '../lib/budget';
import { downloadXlsx } from '../modules/survey/surveyExport';
import { FileSpreadsheet, Printer } from 'lucide-react';

const G = {
  main: ['หมวด 1–10 (เงินบำรุง)', '#047857'], other: ['หมวด 11–13', '#0369a1'], x01: ['ภาษีหัก ณ ที่จ่าย', '#b45309'],
  x02: ['ประกันสังคมฝ่ายลูกจ้าง', '#6d28d9'], x03: ['ค่าใช้จ่ายอื่นๆ', '#475569'], none: ['ยังไม่ระบุหมวด', '#9ca3af'],
};
const monthName = (m) => thMonths[m - 1] || '';

export default function BudgetSpendDash({ fy, deekas }) {
  const [mode, setMode] = useState('month'); const [all, setAll] = useState(null);
  useEffect(() => onSnapshot(collection(db, 'reg-deeka'), (s) => setAll(s.docs.map((d) => d.data())), () => setAll([])), []);
  const mo = useMemo(() => monthlySpend(deekas), [deekas]);
  const yr = useMemo(() => (all ? yearlySpend(all) : []), [all]);
  const rows = mode === 'month' ? mo.rows.map((r) => ({ ...r, label: monthName(r.m) })) : yr.map((r) => ({ ...r, label: `ปี ${r.fy}` }));
  const tot = mode === 'month' ? mo.tot : yr.reduce((t, r) => { GROUP_KEYS.concat('total').forEach((k) => { t[k] = (t[k] || 0) + r[k]; }); return t; }, {});
  const max = Math.max(1, ...rows.map((r) => r.total));
  const head = ['', ...GROUP_KEYS.map((k) => G[k][0]), 'รวมทั้งหมด'];
  const title = mode === 'month' ? `สรุปรายจ่ายตามฎีการายเดือน ปีงบประมาณ ${fy}` : 'สรุปรายจ่ายตามฎีการายปีงบประมาณ';
  const mat = () => [...rows.map((r) => [r.label, ...GROUP_KEYS.map((k) => r[k]), r.total]), ['รวม', ...GROUP_KEYS.map((k) => tot[k] || 0), tot.total || 0]];
  const excel = () => downloadXlsx([{ name: mode === 'month' ? 'รายเดือน' : 'รายปี', head: [mode === 'month' ? 'เดือน' : 'ปีงบประมาณ', ...head.slice(1)], rows: mat() }], `รายจ่าย${mode === 'month' ? 'รายเดือน_ปีงบ' + fy : 'รายปี'}`);
  const print = () => openPrint(title, `<h1>${esc(title)}</h1><h2>รพ.สต.บ้านหนองสนม</h2><table><thead><tr><th>${mode === 'month' ? 'เดือน' : 'ปีงบประมาณ'}</th>${head.slice(1).map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${mat().map((r, i, a) => `<tr class="${i === a.length - 1 ? 'tot' : ''}"><td>${esc(r[0])}</td>${r.slice(1).map((v) => `<td class="r">${money(v)}</td>`).join('')}</tr>`).join('')}</tbody></table><div class="foot">แต่ละกลุ่มแยกกัน ไม่รวมระหว่างแหล่งงบ ยกเว้นคอลัมน์ “รวมทั้งหมด” (ยอดตั้งเบิกตามฎีกา)</div>`, true);

  return (
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-lg font-bold text-emerald-900">แดชบอร์ดรายจ่ายตามฎีกา</h3>
        {[['month', 'รายเดือน'], ['year', 'รายปี']].map(([k, t]) => <button key={k} type="button" onClick={() => setMode(k)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${mode === k ? 'bg-emerald-700 text-white' : 'bg-white ring-1 ring-slate-300 hover:bg-emerald-50'}`}>{t}</button>)}
        <button className="btn btn-outline" onClick={excel}><FileSpreadsheet className="h-4 w-4" /> Excel</button><button className="btn btn-outline" onClick={print}><Printer className="h-4 w-4" /> พิมพ์/PDF</button>
      </div>
      <p className="text-sm text-slate-600">{title} — แยกตามแหล่งงบ ภาษีหัก ณ ที่จ่าย ประกันสังคม และค่าใช้จ่ายอื่นๆ ไม่นำไปรวมกับหมวด 1–13</p>
      <div className="flex flex-wrap gap-3 text-xs">{GROUP_KEYS.map((k) => <span key={k} className="inline-flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded-sm" style={{ background: G[k][1] }} />{G[k][0]}</span>)}</div>
      {!rows.length ? <p className="p-4 text-center text-slate-500">ยังไม่มีข้อมูลฎีกา</p> : <>
        <div className="space-y-1.5">{rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[4.5rem_1fr_8rem] items-center gap-2 text-sm">
            <span className="text-slate-600">{r.label}</span>
            <div className="flex h-5 overflow-hidden rounded bg-slate-100" style={{ width: '100%' }} title={`${r.label}: ${money(r.total)}`}>
              <div className="flex h-full" style={{ width: `${(r.total / max) * 100}%`, gap: 2 }}>{GROUP_KEYS.filter((k) => r[k] > 0).map((k) => <div key={k} title={`${G[k][0]}: ${money(r[k])}`} style={{ flex: r[k], background: G[k][1] }} />)}</div>
            </div>
            <span className="text-right tabular-nums">{money(r.total)}</span>
          </div>))}</div>
        <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm">
          <thead><tr className="border-b bg-emerald-50"><th className="p-2 text-left">{mode === 'month' ? 'เดือน' : 'ปีงบประมาณ'}</th>{GROUP_KEYS.map((k) => <th key={k} className="p-2 text-right">{G[k][0]}</th>)}<th className="p-2 text-right">รวมทั้งหมด</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.label} className="border-b"><td className="p-2">{r.label}</td>{GROUP_KEYS.map((k) => <td key={k} className="p-2 text-right tabular-nums">{r[k] ? money(r[k]) : '-'}</td>)}<td className="p-2 text-right font-semibold tabular-nums">{money(r.total)}</td></tr>)}
            <tr className="bg-slate-100 font-bold"><td className="p-2">รวม</td>{GROUP_KEYS.map((k) => <td key={k} className="p-2 text-right tabular-nums">{money(tot[k] || 0)}</td>)}<td className="p-2 text-right tabular-nums">{money(tot.total || 0)}</td></tr></tbody></table></div></>}
    </section>);
}
