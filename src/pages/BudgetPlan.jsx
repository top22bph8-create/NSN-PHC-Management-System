// งบประมาณตามแผนการใช้จ่ายเงินบำรุง (เชื่อมกับทะเบียนคุมฎีกาเบิกจ่าย): ตั้งยอดต้นปีตามหมวด → ฎีกาที่ระบุหมวดตัดยอดอัตโนมัติ → รายงานคงเหลือ
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { ArrowLeft, FileSpreadsheet, Loader2, Printer, Settings2 } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useFiscalYear } from '../context/FiscalYearContext';
import { PageHeader } from '../components/Logo';
import { Modal, Spinner } from '../components/ui';
import { BUDGET_CATS, CAT_NAMES } from '../config/budgetCats';
import { computeBudget, deekaAmount, esc, money, openPrint } from '../lib/budget';
import useBudgetData from '../lib/useBudgetData';
import { fmtDate, todayStr } from '../lib/thai';
import { downloadXlsx } from '../modules/survey/surveyExport';

export const overviewRows = (b) => BUDGET_CATS.map((c) => { const o = b.byCat[c.id]; return [c.no, c.name, o.initial, o.add + o.adjust, o.tin - o.tout, o.total, o.spent, o.remain, o.pct == null ? '-' : Number(o.pct.toFixed(1))]; });

export default function BudgetPlan() {
  const { fy } = useFiscalYear(); const { profile } = useAuth(); const nav = useNavigate();
  const { entries, deekas, err } = useBudgetData(fy);
  const [setup, setSetup] = useState(null); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const b = useMemo(() => (entries && deekas ? computeBudget(entries, deekas) : null), [entries, deekas]);
  const unassigned = useMemo(() => (deekas || []).filter((d) => !CAT_NAMES.includes(d.budgetCat)).sort((a, c) => String(a.deekaDate).localeCompare(c.deekaDate)), [deekas]);
  const say = (t) => { setMsg(t); setTimeout(() => setMsg(''), 5000); };
  if (err) return <p className="rounded-xl bg-red-50 p-4 text-red-700">{err}</p>;
  if (!b) return <Spinner />;

  const openSetup = () => setSetup(Object.fromEntries(BUDGET_CATS.map((c) => [c.id, b.byCat[c.id].initial ? String(b.byCat[c.id].initial) : ''])));
  const saveSetup = async () => {
    setBusy(true);
    try {
      for (const c of BUDGET_CATS) {
        const raw = String(setup[c.id] ?? '').replace(/,/g, '').trim(); if (raw === '') continue; const amount = Number(raw);
        if (!isFinite(amount) || amount < 0) throw new Error(`ยอดหมวด ${c.no} ไม่ถูกต้อง`);
        await setDoc(doc(db, 'budgetEntries', `${fy}_${c.id}_initial`), { fy, cat: c.id, type: 'initial', amount, date: todayStr(), note: 'ยอดตั้งต้นปีงบประมาณ', createdBy: profile?.email || '', updatedAt: serverTimestamp() }, { merge: true });
      }
      setSetup(null); say('บันทึกยอดตั้งต้นปีงบประมาณแล้ว');
    } catch (e) { say('บันทึกไม่สำเร็จ: ' + (e.code || e.message)); } finally { setBusy(false); }
  };
  const assign = async (d, name) => { try { await updateDoc(doc(db, 'reg-deeka', d.id), { budgetCat: name, updatedAt: serverTimestamp(), updatedBy: profile?.email || '' }); } catch (e) { say('บันทึกหมวดไม่สำเร็จ: ' + (e.code || e.message)); } };

  const head = ['ที่', 'หมวดรายการ', 'ยอดตั้งต้นปี', 'เพิ่ม/ปรับปรุง', 'โอนเข้า(+)/ออก(−)', 'งบรวม', 'เบิกจ่ายแล้ว (ตามฎีกา)', 'คงเหลือ', '% ที่ใช้'];
  const excel = () => {
    const S = b.sum; const rows = overviewRows(b); rows.push(['', 'รวมทุกหมวด', S.initial, S.add + S.adjust, S.tin - S.tout, S.total, S.spent, S.remain, S.pct == null ? '-' : Number(S.pct.toFixed(1))]);
    downloadXlsx([{ name: 'สรุปรายหมวด', head, rows }], `งบประมาณเงินบำรุง_ปีงบ${fy}`);
  };
  const print = () => {
    const S = b.sum; const rows = overviewRows(b);
    const tr = (r, cls = '') => `<tr class="${cls}"><td class="c">${esc(r[0])}</td><td>${esc(r[1])}</td>${r.slice(2, 8).map((v) => `<td class="r${typeof v === 'number' && v < 0 ? ' neg' : ''}">${money(v)}</td>`).join('')}<td class="r">${r[8] === '-' ? '-' : r[8] + '%'}</td></tr>`;
    openPrint('รายงานงบประมาณเงินบำรุง', `<h1>รายงานงบประมาณคงเหลือตามแผนการใช้จ่ายเงินบำรุง</h1><h2>รพ.สต.บ้านหนองสนม · ปีงบประมาณ ${fy}</h2><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => tr(r)).join('')}${tr(['', 'รวมทุกหมวด', S.initial, S.add + S.adjust, S.tin - S.tout, S.total, S.spent, S.remain, S.pct == null ? '-' : S.pct.toFixed(1)], 'tot')}</tbody></table><div class="foot">ข้อมูล ณ วันที่ ${fmtDate(todayStr())} · เบิกจ่ายแล้ว = มูลค่าตั้งเบิกตามฎีกาที่ระบุหมวดนั้น${unassigned.length ? ` · มีฎีกาที่ยังไม่ระบุหมวด ${unassigned.length} ฉบับ (${money(unassigned.reduce((s, d) => s + deekaAmount(d), 0))} บาท) ไม่รวมในยอดเบิกจ่าย` : ''}</div>`, true);
  };

  return (
    <div className="space-y-4">
      <Link to="/reg-deeka" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-50"><ArrowLeft className="h-4 w-4" /> กลับทะเบียนคุมฎีกาเบิกจ่าย</Link>
      <PageHeader emoji="💰" title="งบประมาณตามแผนการใช้จ่ายเงินบำรุง" tone="from-emerald-700 via-emerald-600 to-teal-500" big subtitle={`ปีงบประมาณ ${fy} · เชื่อมกับทะเบียนฎีกา ตัดยอดคงเหลือตามหมวดอัตโนมัติ`}
        actions={<div className="flex flex-wrap gap-2"><button className="btn bg-white text-emerald-800 hover:bg-emerald-50" onClick={openSetup}><Settings2 className="h-4 w-4" /> ตั้งยอดต้นปีงบประมาณ</button>
          <button className="btn bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25" onClick={excel}><FileSpreadsheet className="h-4 w-4" /> Excel</button>
          <button className="btn bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25" onClick={print}><Printer className="h-4 w-4" /> พิมพ์/PDF</button></div>} />
      {msg && <p className="rounded-lg bg-sky-50 px-3 py-2 text-sky-800 ring-1 ring-sky-200">{msg}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[['งบรวมทุกหมวด', b.sum.total, 'from-sky-600 to-cyan-500'], ['เบิกจ่ายแล้ว (ตามฎีกา)', b.sum.spent, 'from-amber-600 to-orange-500'], ['คงเหลือ', b.sum.remain, b.sum.remain < 0 ? 'from-red-700 to-rose-500' : 'from-emerald-600 to-teal-500'], ['ใช้ไปแล้ว', null, 'from-slate-600 to-slate-500']].map(([l, v, t]) => (
          <div key={l} className={`rounded-2xl bg-gradient-to-br ${t} p-4 text-white shadow`}><div className="text-sm opacity-90">{l}</div><div className="text-2xl font-extrabold tabular-nums">{v == null ? (b.sum.pct == null ? '-' : `${b.sum.pct.toFixed(1)}%`) : money(v)}</div>{v != null && <div className="text-xs opacity-90">บาท</div>}</div>))}
      </div>

      {b.sum.total === 0 && <p className="rounded-xl bg-amber-50 p-3 text-amber-900 ring-1 ring-amber-200">ยังไม่ได้ตั้งยอดงบประมาณต้นปีงบประมาณ {fy} — กดปุ่ม “ตั้งยอดต้นปีงบประมาณ” เพื่อกรอกยอดแต่ละหมวด (หมวดที่ไม่มีงบเว้นว่างได้)</p>}

      <section className="card overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-sm">
          <thead><tr className="border-b bg-emerald-50 text-left text-slate-700">{head.map((h, i) => <th key={h} className={`p-2.5 ${i > 1 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
          <tbody>{BUDGET_CATS.map((c) => { const o = b.byCat[c.id]; return (
            <tr key={c.id} className="cursor-pointer border-b hover:bg-emerald-50/60" onClick={() => nav(`/reg-budget/${c.id}`)} title="คลิกเพื่อดูรายการตัดยอดของหมวดนี้">
              <td className="p-2.5 text-center">{c.no}</td><td className="p-2.5 font-semibold text-emerald-900">{c.name}</td>
              <td className="p-2.5 text-right tabular-nums">{money(o.initial)}</td><td className="p-2.5 text-right tabular-nums">{money(o.add + o.adjust)}</td><td className="p-2.5 text-right tabular-nums">{money(o.tin - o.tout)}</td>
              <td className="p-2.5 text-right font-semibold tabular-nums">{money(o.total)}</td><td className="p-2.5 text-right tabular-nums">{money(o.spent)}{o.n ? <span className="ml-1 text-xs text-slate-400">({o.n} ฎีกา)</span> : null}</td>
              <td className={`p-2.5 text-right font-bold tabular-nums ${o.remain < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{money(o.remain)}</td>
              <td className="p-2.5 text-right"><div className="ml-auto h-2 w-20 overflow-hidden rounded-full bg-slate-200"><div className={`h-full ${o.pct > 100 ? 'bg-red-500' : o.pct > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, o.pct || 0)}%` }} /></div><span className="text-xs text-slate-500">{o.pct == null ? '-' : `${o.pct.toFixed(1)}%`}</span></td>
            </tr>); })}
            <tr className="bg-slate-100 font-bold"><td className="p-2.5" /><td className="p-2.5">รวมทุกหมวด</td><td className="p-2.5 text-right tabular-nums">{money(b.sum.initial)}</td><td className="p-2.5 text-right tabular-nums">{money(b.sum.add + b.sum.adjust)}</td><td className="p-2.5 text-right tabular-nums">{money(b.sum.tin - b.sum.tout)}</td><td className="p-2.5 text-right tabular-nums">{money(b.sum.total)}</td><td className="p-2.5 text-right tabular-nums">{money(b.sum.spent)}</td><td className={`p-2.5 text-right tabular-nums ${b.sum.remain < 0 ? 'text-red-600' : ''}`}>{money(b.sum.remain)}</td><td className="p-2.5 text-right">{b.sum.pct == null ? '-' : `${b.sum.pct.toFixed(1)}%`}</td></tr>
          </tbody>
        </table>
      </section>

      {unassigned.length > 0 && (
        <section className="card space-y-2 p-4">
          <h3 className="font-bold text-amber-800">ฎีกาที่ยังไม่ระบุหมวดงบประมาณ ({unassigned.length} ฉบับ · {money(unassigned.reduce((s, d) => s + deekaAmount(d), 0))} บาท) — ยังไม่ถูกตัดยอด</h3>
          <p className="text-xs text-slate-500">เลือกหมวดจากรายการเพื่อตัดยอด (หรือแก้ในฟอร์มฎีกา ช่อง “หมวดงบประมาณ”) · การเลือกจะบันทึกลงฎีกาทันที</p>
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><tbody>{unassigned.map((d) => (
            <tr key={d.id} className="border-b last:border-0"><td className="p-2 whitespace-nowrap">{d.deekaNo}</td><td className="p-2 whitespace-nowrap">{fmtDate(d.deekaDate)}</td><td className="p-2">{d.subject}</td><td className="p-2 text-right tabular-nums">{money(deekaAmount(d))}</td>
              <td className="p-2"><select className="input" value="" onChange={(e) => e.target.value && assign(d, e.target.value)}><option value="">— เลือกหมวด —</option>{BUDGET_CATS.map((c) => <option key={c.id} value={c.name}>{c.no}. {c.name}</option>)}</select></td></tr>))}</tbody></table></div>
        </section>)}

      {setup && (
        <Modal title={`ตั้งยอดงบประมาณต้นปีงบประมาณ ${fy}`} onClose={() => !busy && setSetup(null)} wide
          footer={<div className="flex justify-end gap-2"><button className="btn btn-outline" onClick={() => setSetup(null)} disabled={busy}>ยกเลิก</button><button className="btn btn-primary" onClick={saveSetup} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} บันทึกยอดต้นปี</button></div>}>
          <p className="mb-3 text-sm text-slate-600">กรอกยอดเงินต้นปีของแต่ละหมวด (บาท) — เว้นว่างถ้าไม่มี · แก้ไขซ้ำได้ (จะแทนที่ยอดต้นปีเดิม) · การเพิ่มยอด ปรับปรุง และโอนย้ายระหว่างหมวด ทำได้ในหน้าของแต่ละหมวด</p>
          <div className="grid gap-2">{BUDGET_CATS.map((c) => (
            <label key={c.id} className="grid items-center gap-2 sm:grid-cols-[1fr_200px]"><span className="text-sm">{c.no}. {c.name}</span>
              <input className="input text-right tabular-nums" inputMode="decimal" placeholder="0.00" value={setup[c.id]} onChange={(e) => setSetup((x) => ({ ...x, [c.id]: e.target.value }))} /></label>))}</div>
        </Modal>)}
    </div>);
}
