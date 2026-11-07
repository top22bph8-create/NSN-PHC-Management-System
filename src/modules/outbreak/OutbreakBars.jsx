// แผนภูมิแท่งแนวนอนและแท่งเส้นโค้งการระบาด ใช้ในโมดูลสอบสวนโรค
import { nf } from './outbreakLib';

export function HBars({ title, data, order, color = 'from-rose-600 to-orange-400', limit = 10 }) {
  const keys = (order || Object.keys(data).sort((a, b) => data[b] - data[a])).filter((k) => data[k] != null).slice(0, limit);
  const max = Math.max(1, ...keys.map((k) => data[k])); const total = keys.reduce((s, k) => s + data[k], 0);
  return (
    <section className="card p-4">
      <h3 className="mb-2 font-bold text-slate-700">{title}</h3>
      {!keys.length ? <p className="text-sm text-slate-400">ไม่มีข้อมูล</p> : (
        <ul className="space-y-1.5">{keys.map((k) => (
          <li key={k} className="text-sm">
            <div className="flex justify-between gap-2"><span className="truncate">{k}</span><b className="tabular-nums">{nf(data[k])} <span className="font-normal text-slate-400">({total ? Math.round((data[k] / total) * 100) : 0}%)</span></b></div>
            <div className="h-2 rounded-full bg-slate-100"><div className={`h-2 rounded-full bg-gradient-to-r ${color}`} style={{ width: `${(data[k] / max) * 100}%` }} /></div>
          </li>))}</ul>
      )}
    </section>
  );
}

export function Curve({ title, rows, fmtLabel }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <section className="card p-4">
      <h3 className="mb-2 font-bold text-slate-700">{title}</h3>
      {!rows.length ? <p className="text-sm text-slate-400">ยังไม่มีข้อมูลวันเริ่มป่วย</p> : (
        <div className="flex items-end gap-0.5 overflow-x-auto pb-1">
          {rows.map((r) => (
            <div key={r.d} className="flex min-w-[16px] flex-1 flex-col items-center justify-end" title={`${fmtLabel ? fmtLabel(r.d) : r.d}: ${r.n} ราย`}>
              <span className="text-[10px] tabular-nums text-slate-500">{r.n || ''}</span>
              <div className="w-full rounded-t bg-gradient-to-t from-rose-700 to-orange-400" style={{ height: `${r.n ? Math.max(4, Math.round((r.n / max) * 120)) : 0}px` }} />
              <span className="text-[9px] text-slate-400">{r.d.slice(8)}/{r.d.slice(5, 7)}</span>
            </div>))}
        </div>
      )}
    </section>
  );
}
