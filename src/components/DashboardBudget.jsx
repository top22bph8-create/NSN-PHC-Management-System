// แดชบอร์ดงบประมาณเงินบำรุงบนหน้าแรก: ยอดตั้งงบต้นปี ยอดกันเงินปีก่อน ยอดจ่ายเช็คในเดือน และยอดคงเหลือหมวด 1–10
import { Fragment, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useFiscalYear } from '../context/FiscalYearContext';
import { BUDGET_CATS } from '../config/budgetCats';
import { computeBudget, money } from '../lib/budget';
import useBudgetData from '../lib/useBudgetData';
import { thMonths, todayStr } from '../lib/thai';

export default function DashboardBudget() {
  const { fy } = useFiscalYear(); const { entries, deekas, err } = useBudgetData(fy);
  const b = useMemo(() => (entries && deekas ? computeBudget(entries, deekas) : null), [entries, deekas]);
  const ym = todayStr().slice(0, 7); const mon = Number(ym.slice(5, 7));
  const chequeMonth = useMemo(() => (deekas || []).filter((d) => String(d.deekaDate || '').startsWith(ym)).reduce((s, d) => s + (Number(d.payAmount) || 0), 0), [deekas, ym]);
  if (err || !b) return null;
  const M = b.sums.main; const carry = b.byCat.c13;
  const cards = [
    ['ตั้งงบต้นปี หมวด 1–10', b.sums.main.initial, 'from-sky-600 to-cyan-500', `งบรวมหลังเพิ่ม/ปรับ/โอน ${money(M.total)}`],
    ['ยอดกันเงินรายจ่ายจากปีก่อน', carry.total, 'from-violet-600 to-fuchsia-500', `เบิกแล้ว ${money(carry.spent)} · คงเหลือ ${money(carry.remain)}`],
    [`ยอดจ่ายเช็คเดือน${thMonths[mon - 1]}`, chequeMonth, 'from-amber-600 to-orange-500', 'ตามฎีกาที่ลงวันที่ในเดือนนี้'],
    ['คงเหลือแผนเงินบำรุง หมวด 1–10', M.remain, M.remain < 0 ? 'from-red-700 to-rose-500' : 'from-emerald-600 to-teal-500', `เบิกแล้ว ${money(M.spent)}${M.pct == null ? '' : ` (${M.pct.toFixed(1)}%)`}`],
  ];
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center justify-between"><h2 className="text-lg font-semibold">💰 งบประมาณเงินบำรุง ปีงบประมาณ {fy}</h2><Link to="/reg-budget" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">ดูรายละเอียดรายหมวด <ArrowRight className="h-4 w-4" /></Link></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(([l, v, t, sub]) => <Link to="/reg-budget" key={l} className={`rounded-2xl bg-gradient-to-br ${t} p-4 text-white shadow transition hover:shadow-lg`}><div className="text-sm opacity-90">{l}</div><div className="text-xl font-extrabold tabular-nums sm:text-2xl">{money(v)}</div><div className="text-xs opacity-90">บาท</div><div className="mt-1 text-xs opacity-90">{sub}</div></Link>)}
      </div>
      {M.total === 0 && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">ยังไม่ได้ตั้งยอดงบประมาณต้นปี — ไปที่ “งบประมาณตามหมวด” เพื่อตั้งยอดแต่ละหมวด</p>}
      <details className="card mt-3" open>
        <summary className="cursor-pointer p-3 font-semibold text-emerald-900">คงเหลือรายหมวด</summary>
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead><tr className="border-y bg-emerald-50 text-left"><th className="p-2">หมวด</th><th className="p-2 text-right">งบรวม</th><th className="p-2 text-right">เบิกจ่ายแล้ว</th><th className="p-2 text-right">คงเหลือ</th></tr></thead>
          <tbody>{BUDGET_CATS.map((c, i) => { const o = b.byCat[c.id]; return (<Fragment key={c.id}>{(i === 0 || i === 10) && <tr key={'h' + i} className="bg-slate-50"><td colSpan={4} className="p-1.5 text-xs font-bold text-slate-500">{i === 0 ? 'หมวด 1–10 (เงินบำรุง)' : 'หมวด 11–13 (งบจากแหล่งอื่น — แยกยอด)'}</td></tr>}
            <tr key={c.id} className="border-b"><td className="p-2"><Link className="text-emerald-800 hover:underline" to={`/reg-budget/${c.id}`}>{c.no}. {c.name}</Link></td><td className="p-2 text-right tabular-nums">{money(o.total)}</td><td className="p-2 text-right tabular-nums">{money(o.spent)}</td><td className={`p-2 text-right font-semibold tabular-nums ${o.remain < 0 ? 'text-red-600' : ''}`}>{money(o.remain)}</td></tr></Fragment>); })}</tbody></table></div>
      </details>
    </section>);
}
