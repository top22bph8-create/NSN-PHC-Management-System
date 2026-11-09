// รายจ่ายตามฎีกาแยกหมวด: รายเดือน (ปีงบประมาณที่เลือก) และรายปี — ตารางเท่านั้น ไม่มีแผนภูมิ; รวมย่อยแยกกลุ่ม ไม่รวมข้ามแหล่งงบ
import { Fragment, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { FileSpreadsheet, Printer } from 'lucide-react';
import { db } from '../firebase';
import { ALL_CATS, BUDGET_CATS, EXTRA_CATS, catByName } from '../config/budgetCats';
import { FY_MONTHS, deekaAmount, esc, money, openPrint } from '../lib/budget';
import { thMonths } from '../lib/thai';
import { downloadXlsx } from '../modules/survey/surveyExport';

const NONE = { id: 'none', no: '', name: 'ยังไม่ระบุหมวด' };
const SECTIONS = [
  ['หมวด 1–10 (เงินบำรุง)', BUDGET_CATS.filter((c) => c.g === 'main')],
  ['หมวด 11–13 (งบจากแหล่งอื่น)', BUDGET_CATS.filter((c) => c.g === 'other')],
  ['รายจ่ายอื่น (ไม่ตั้งยอด)', EXTRA_CATS],
  ['ยังไม่ระบุหมวด', [NONE]],
];

export default function BudgetSpendTable({ fy, deekas }) {
  const [mode, setMode] = useState('month'); const [all, setAll] = useState(null);
  useEffect(() => onSnapshot(collection(db, 'reg-deeka'), (s) => setAll(s.docs.map((d) => d.data())), () => setAll([])), []);
  const cols = useMemo(() => {
    if (mode === 'month') return FY_MONTHS.map((m) => ({ key: m, label: (thMonths[m - 1] || '').slice(0, 3) + '.' }));
    const ys = [...new Set((all || []).map((d) => d.fy).filter(Boolean))].sort((a, b) => a - b); return ys.map((y) => ({ key: y, label: String(y) }));
  }, [mode, all]);
  const src = mode === 'month' ? deekas : all || [];
  const grid = useMemo(() => {
    const g = {}; ALL_CATS.concat(NONE).forEach((c) => { g[c.id] = {}; });
    src.forEach((d) => { const c = catByName(d.budgetCat) || NONE; const k = mode === 'month' ? Number(String(d.deekaDate || '').slice(5, 7)) : d.fy; if (!k) return; g[c.id][k] = (g[c.id][k] || 0) + deekaAmount(d); });
    return g;
  }, [src, mode]);
  const rowTotal = (id) => cols.reduce((s, c) => s + (grid[id][c.key] || 0), 0);
  const secTotal = (cs, k) => cs.reduce((s, c) => s + (k == null ? rowTotal(c.id) : grid[c.id][k] || 0), 0);
  const title = mode === 'month' ? `รายจ่ายตามฎีกาแยกหมวด รายเดือน ปีงบประมาณ ${fy}` : 'รายจ่ายตามฎีกาแยกหมวด รายปีงบประมาณ';
  const mat = () => { const out = []; SECTIONS.forEach(([name, cs]) => { out.push([name, ...cols.map(() => ''), '']); cs.forEach((c) => out.push([`${c.no ? c.no + '. ' : ''}${c.name}`, ...cols.map((x) => grid[c.id][x.key] || 0), rowTotal(c.id)])); out.push([`รวม ${name}`, ...cols.map((x) => secTotal(cs, x.key)), secTotal(cs)]); }); return out; };
  const head = [mode === 'month' ? 'หมวด' : 'หมวด / ปีงบประมาณ', ...cols.map((c) => c.label), 'รวม'];
  const excel = () => downloadXlsx([{ name: mode === 'month' ? 'รายเดือน' : 'รายปี', head, rows: mat() }], `รายจ่ายแยกหมวด_${mode === 'month' ? 'รายเดือน_ปีงบ' + fy : 'รายปี'}`);
  const print = () => openPrint(title, `<h1>${esc(title)}</h1><h2>รพ.สต.บ้านหนองสนม · มูลค่าตั้งเบิกตามฎีกา (บาท)</h2><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${mat().map((r) => { const sec = r.slice(1).every((v) => v === ''); const tot = String(r[0]).startsWith('รวม '); return `<tr class="${tot ? 'tot' : ''}"><td${sec ? ` colspan="${r.length}"><b>${esc(r[0])}</b>` : `>${esc(r[0])}`}</td>${sec ? '' : r.slice(1).map((v) => `<td class="r">${v ? money(v) : '-'}</td>`).join('')}</tr>`; }).join('')}</tbody></table><div class="foot">แต่ละกลุ่มแยกยอดตามแหล่งงบ ไม่รวมข้ามกลุ่ม</div>`, true);

  return (
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-lg font-bold text-emerald-900">รายจ่ายแยกหมวด รายเดือน / รายปี</h3>
        {[['month', 'รายเดือน'], ['year', 'รายปี']].map(([k, t]) => <button key={k} type="button" onClick={() => setMode(k)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${mode === k ? 'bg-emerald-700 text-white' : 'bg-white ring-1 ring-slate-300 hover:bg-emerald-50'}`}>{t}</button>)}
        <button className="btn btn-outline" onClick={excel}><FileSpreadsheet className="h-4 w-4" /> Excel</button><button className="btn btn-outline" onClick={print}><Printer className="h-4 w-4" /> พิมพ์/PDF</button>
      </div>
      <p className="text-sm text-slate-600">{title} · มูลค่าตั้งเบิกตามฎีกา (บาท) — แยกกลุ่มแหล่งงบ ไม่รวมข้ามกลุ่ม</p>
      <div className="overflow-x-auto"><table className="w-full text-sm" style={{ minWidth: mode === 'month' ? 1100 : 560 }}>
        <thead><tr className="border-b bg-emerald-50 text-left"><th className="sticky left-0 bg-emerald-50 p-2">{head[0]}</th>{cols.map((c) => <th key={c.key} className="p-2 text-right">{c.label}</th>)}<th className="p-2 text-right">รวม</th></tr></thead>
        <tbody>{SECTIONS.map(([name, cs]) => (<Fragment key={name}>
          <tr className="bg-slate-50"><td colSpan={cols.length + 2} className="p-1.5 text-xs font-bold text-slate-500">{name}</td></tr>
          {cs.map((c) => <tr key={c.id} className="border-b"><td className="sticky left-0 bg-white p-2">{c.no ? `${c.no}. ` : ''}{c.name}</td>{cols.map((x) => <td key={x.key} className="p-2 text-right tabular-nums">{grid[c.id][x.key] ? money(grid[c.id][x.key]) : '-'}</td>)}<td className="p-2 text-right font-semibold tabular-nums">{money(rowTotal(c.id))}</td></tr>)}
          <tr key={name + 't'} className="border-b bg-slate-100 font-bold"><td className="sticky left-0 bg-slate-100 p-2">รวม {name}</td>{cols.map((x) => <td key={x.key} className="p-2 text-right tabular-nums">{money(secTotal(cs, x.key))}</td>)}<td className="p-2 text-right tabular-nums">{money(secTotal(cs))}</td></tr></Fragment>))}</tbody></table></div>
    </section>);
}
