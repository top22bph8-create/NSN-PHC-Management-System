// หน้าแรก: ตัวเลขสรุปฎีกาเบิกจ่าย (ชุดเดียวกับช่องสรุปบนหน้าทะเบียนคุมฎีกาเบิกจ่าย) — เดือนนี้ / ทั้งปีงบประมาณ
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useFiscalYear } from '../context/FiscalYearContext';
import { money } from '../lib/budget';
import useBudgetData from '../lib/useBudgetData';
import { thMonths, todayStr } from '../lib/thai';

const num = (v) => Number(v) || 0;
const sum = (list) => list.reduce((a, it) => { const pay = num(it.payAmount), tax = num(it.taxWithheld), sso = num(it.ssoAmount); return { n: a.n + 1, pay: a.pay + pay, tax: a.tax + tax, sso: a.sso + sso, total: a.total + (String(it.amount ?? '').trim() !== '' ? num(it.amount) : pay + tax + sso) }; }, { n: 0, pay: 0, tax: 0, sso: 0, total: 0 });

export default function DashboardBudget() {
  const { fy } = useFiscalYear(); const { deekas, err } = useBudgetData(fy); const [scope, setScope] = useState('month');
  const ym = todayStr().slice(0, 7); const mon = Number(ym.slice(5, 7));
  const cur = useMemo(() => sum((deekas || []).filter((d) => scope === 'year' || String(d.deekaDate || '').startsWith(ym))), [deekas, scope, ym]);
  if (err || !deekas) return null;
  const cards = [
    { label: 'ยอดจ่ายเช็ค', v: cur.pay, grad: 'from-sky-500 to-blue-600', icon: '💳' },
    { label: 'ภาษีหัก ณ ที่จ่าย', v: cur.tax, grad: 'from-amber-400 to-orange-500', icon: '🧾' },
    { label: 'หักจ่ายประกันสังคม', v: cur.sso, grad: 'from-emerald-500 to-teal-600', icon: '🛡️' },
    { label: 'มูลค่าตั้งเบิกตามฎีกา', v: cur.total, grad: 'from-fuchsia-500 to-purple-700', icon: '💰' },
  ];
  return (
    <section className="mb-5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold">📑 ฎีกาเบิกจ่าย {scope === 'month' ? `เดือน${thMonths[mon - 1]}` : `ทั้งปีงบประมาณ ${fy}`} <span className="ml-1 rounded-full bg-slate-100 px-3 py-0.5 text-sm font-normal">{cur.n} ฎีกา</span></h2>
        {[['month', 'เดือนนี้'], ['year', 'ทั้งปีงบประมาณ']].map(([k, t]) => <button key={k} type="button" onClick={() => setScope(k)} className={`rounded-full px-3 py-1 text-sm font-semibold ${scope === k ? 'bg-emerald-700 text-white' : 'bg-white ring-1 ring-slate-300'}`}>{t}</button>)}
        <Link to="/reg-deeka" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">ทะเบียนฎีกา <ArrowRight className="h-4 w-4" /></Link>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Link to="/reg-deeka" key={c.label} className={`rounded-2xl bg-gradient-to-br ${c.grad} p-4 text-white shadow-md transition hover:shadow-lg`}>
            <div className="flex items-center justify-between text-base font-medium text-white/90"><span>{c.label}</span><span className="text-2xl">{c.icon}</span></div>
            <div className="mt-1 text-3xl font-extrabold tracking-tight tabular-nums">{money(c.v)}</div><div className="text-sm text-white/80">บาท</div>
          </Link>))}
      </div>
    </section>);
}
