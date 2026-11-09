// รายจ่ายตามฎีกาแยกหมวด: รายเดือน (ปีงบประมาณที่เลือก) และรายปี — ตารางเท่านั้น ไม่มีแผนภูมิ; รวมย่อยแยกกลุ่ม ไม่รวมข้ามแหล่งงบ
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { FileSpreadsheet, Printer } from 'lucide-react';
import { db } from '../firebase';
import { ALL_CATS, BUDGET_CATS, EXTRA_CATS, catByName } from '../config/budgetCats';
import { FY_MONTHS, deekaAmount, esc, money, openPrint } from '../lib/budget';
import { thMonths } from '../lib/thai';
import { downloadXlsx } from '../modules/survey/surveyExport';

const NONE = { id: 'none', no: '', name: 'ยังไม่ระบุหมวด' };
// สีประจำแหล่งงบ: เขียว=เงินบำรุง 1–10, ฟ้า=11–13, ส้ม=รายจ่ายอื่น, เทา=ยังไม่ระบุ (head=แถบหัวข้อ, sub=แถวรวม, hex=สีในรายงานพิมพ์)
export const SEC_STYLE = {
  main: { head: 'bg-emerald-700 text-white', sub: 'bg-emerald-100 text-emerald-900', hex: '#047857', soft: '#d1fae5' },
  other: { head: 'bg-sky-700 text-white', sub: 'bg-sky-100 text-sky-900', hex: '#0369a1', soft: '#e0f2fe' },
  extra: { head: 'bg-amber-600 text-white', sub: 'bg-amber-100 text-amber-900', hex: '#b45309', soft: '#fef3c7' },
  none: { head: 'bg-slate-500 text-white', sub: 'bg-slate-200 text-slate-800', hex: '#64748b', soft: '#e2e8f0' },
};
const SECTIONS = [
  ['หมวด 1–10 (เงินบำรุง)', BUDGET_CATS.filter((c) => c.g === 'main'), 'main'],
  ['หมวด 11–13 (งบจากแหล่งอื่น)', BUDGET_CATS.filter((c) => c.g === 'other'), 'other'],
  ['รายจ่ายอื่น (ไม่ตั้งยอด)', EXTRA_CATS, 'extra'],
  ['ยังไม่ระบุหมวด', [NONE], 'none'],
];
const QUARTERS = [['ไตรมาส 1 (ต.ค.–ธ.ค.)', [10, 11, 12]], ['ไตรมาส 2 (ม.ค.–มี.ค.)', [1, 2, 3]], ['ไตรมาส 3 (เม.ย.–มิ.ย.)', [4, 5, 6]], ['ไตรมาส 4 (ก.ค.–ก.ย.)', [7, 8, 9]]];

const MODES = [['month', 'รายเดือน'], ['quarter', 'รายไตรมาส'], ['year', 'รายปี']];
const colsFor = (mode, all) => {
  if (mode === 'month') return FY_MONTHS.map((m) => ({ key: m, label: (thMonths[m - 1] || '').slice(0, 3) + '.' }));
  if (mode === 'quarter') return QUARTERS.map(([label], i) => ({ key: i + 1, label }));
  return [...new Set((all || []).map((d) => d.fy).filter(Boolean))].sort((a, b) => a - b).map((y) => ({ key: y, label: String(y) }));
};
const keyOf = (mode, d) => { const m = Number(String(d.deekaDate || '').slice(5, 7)); if (mode === 'month') return m; if (mode === 'quarter') return m ? QUARTERS.findIndex(([, ms]) => ms.includes(m)) + 1 : 0; return d.fy; };
function buildGrid(src, mode) {
  const g = {}; ALL_CATS.concat(NONE).forEach((c) => { g[c.id] = {}; });
  src.forEach((d) => { const c = catByName(d.budgetCat) || NONE; const k = keyOf(mode, d); if (!k) return; g[c.id][k] = (g[c.id][k] || 0) + deekaAmount(d); });
  return g;
}
const titleOf = (mode, fy) => (mode === 'month' ? `รายจ่ายตามฎีกาแยกหมวด รายเดือน ปีงบประมาณ ${fy}` : mode === 'quarter' ? `รายจ่ายตามฎีกาแยกหมวด รายไตรมาส ปีงบประมาณ ${fy}` : 'รายจ่ายตามฎีกาแยกหมวด รายปีงบประมาณ');
const nameOf = (mode) => (mode === 'month' ? 'รายเดือน' : mode === 'quarter' ? 'รายไตรมาส' : 'รายปี');

// ตัวเลขแต่ละแถว/แถวรวมของรายงาน: [{type:'sec'|'row'|'sub', label, sec, vals:[...], total}]
function reportRows(grid, cols) {
  const rt = (id) => cols.reduce((a, c) => a + (grid[id][c.key] || 0), 0); const out = [];
  SECTIONS.forEach(([name, cs, sec]) => {
    out.push({ type: 'sec', label: name, sec });
    cs.forEach((c) => out.push({ type: 'row', sec, label: `${c.no ? c.no + '. ' : ''}${c.name}`, vals: cols.map((x) => grid[c.id][x.key] || 0), total: rt(c.id) }));
    out.push({ type: 'sub', sec, label: `รวม ${name}`, vals: cols.map((x) => cs.reduce((a, c) => a + (grid[c.id][x.key] || 0), 0)), total: cs.reduce((a, c) => a + rt(c.id), 0) });
  });
  return out;
}

export default function BudgetSpendTable({ fy, deekas }) {
  const [mode, setMode] = useState('month'); const [all, setAll] = useState(null);
  useEffect(() => onSnapshot(collection(db, 'reg-deeka'), (s) => setAll(s.docs.map((d) => d.data())), () => setAll([])), []);
  const src = (m) => (m === 'year' ? all || [] : deekas);
  const cols = useMemo(() => colsFor(mode, all), [mode, all]);
  const rows = useMemo(() => reportRows(buildGrid(src(mode), mode), cols), [mode, all, deekas, cols]);
  const title = titleOf(mode, fy); const head = ['หมวด', ...cols.map((c) => c.label), 'รวม'];
  const toMat = (rs) => rs.map((r) => (r.type === 'sec' ? [r.label, ...cols.map(() => ''), ''] : [r.label, ...r.vals, r.total]));
  const excel = () => downloadXlsx([{ name: nameOf(mode), head, rows: toMat(rows) }], `รายจ่ายแยกหมวด_${nameOf(mode)}${mode === 'year' ? '' : '_ปีงบ' + fy}`);
  // รายงานครบชุด: รายเดือน + รายไตรมาส + รายปี ในไฟล์เดียว
  const excelAll = () => downloadXlsx(['month', 'quarter', 'year'].map((m) => { const cs = colsFor(m, all); return { name: nameOf(m), head: ['หมวด', ...cs.map((c) => c.label), 'รวม'], rows: reportRows(buildGrid(src(m), m), cs).map((r) => (r.type === 'sec' ? [r.label, ...cs.map(() => ''), ''] : [r.label, ...r.vals, r.total])) }; }), `รายงานรายจ่ายแยกหมวด_ปีงบ${fy}`);
  const print = () => openPrint(title, `<h1>${esc(title)}</h1><h2>รพ.สต.บ้านหนองสนม · มูลค่าตั้งเบิกตามฎีกา (บาท)</h2><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => { const st = SEC_STYLE[r.sec]; return r.type === 'sec' ? `<tr><td colspan="${cols.length + 2}" style="background:${st.hex};color:#fff;font-weight:bold">${esc(r.label)}</td></tr>` : `<tr style="${r.type === 'sub' ? `background:${st.soft};font-weight:bold` : ''}"><td>${esc(r.label)}</td>${r.vals.map((v) => `<td class="r">${v ? money(v) : '-'}</td>`).join('')}<td class="r"><b>${money(r.total)}</b></td></tr>`; }).join('')}</tbody></table><div class="foot">แต่ละกลุ่มแยกยอดตามแหล่งงบ ไม่รวมข้ามกลุ่ม · ไตรมาส 1 = ต.ค.–ธ.ค.</div>`, true);

  return (
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-lg font-bold text-emerald-900">รายงานรายจ่ายแยกหมวด</h3>
        {MODES.map(([k, t]) => <button key={k} type="button" onClick={() => setMode(k)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${mode === k ? 'bg-emerald-700 text-white' : 'bg-white ring-1 ring-slate-300 hover:bg-emerald-50'}`}>{t}</button>)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-outline" onClick={excel}><FileSpreadsheet className="h-4 w-4" /> Excel ({nameOf(mode)})</button>
        <button className="btn btn-outline" onClick={excelAll}><FileSpreadsheet className="h-4 w-4" /> Excel ครบชุด (เดือน+ไตรมาส+ปี)</button>
        <button className="btn btn-outline" onClick={print}><Printer className="h-4 w-4" /> พิมพ์/PDF</button>
      </div>
      <p className="text-sm text-slate-600">{title} · มูลค่าตั้งเบิกตามฎีกา (บาท) — แยกกลุ่มแหล่งงบด้วยสี ไม่รวมข้ามกลุ่ม</p>
      <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full text-sm" style={{ minWidth: mode === 'month' ? 1100 : mode === 'quarter' ? 760 : 560 }}>
        <thead><tr className="border-b bg-slate-100 text-left"><th className="sticky left-0 bg-slate-100 p-2">หมวด</th>{cols.map((c) => <th key={c.key} className="p-2 text-right">{c.label}</th>)}<th className="p-2 text-right">รวม</th></tr></thead>
        <tbody>{rows.map((r, i) => r.type === 'sec'
          ? <tr key={i} className={SEC_STYLE[r.sec].head}><td colSpan={cols.length + 2} className="p-2 font-bold">{r.label}</td></tr>
          : <tr key={i} className={r.type === 'sub' ? `font-bold ${SEC_STYLE[r.sec].sub}` : 'border-b'}><td className={`sticky left-0 p-2 ${r.type === 'sub' ? SEC_STYLE[r.sec].sub : 'bg-white'}`}>{r.label}</td>{r.vals.map((v, j) => <td key={j} className="p-2 text-right tabular-nums">{v ? money(v) : '-'}</td>)}<td className="p-2 text-right font-semibold tabular-nums">{money(r.total)}</td></tr>)}</tbody></table></div>
    </section>);
}
