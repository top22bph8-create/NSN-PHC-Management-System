// งบประมาณตามแผนการใช้จ่ายเงินบำรุง (เชื่อมกับทะเบียนคุมฎีกาเบิกจ่าย): ตั้งยอดต้นปีตามหมวด → ฎีกาที่ระบุหมวดตัดยอดอัตโนมัติ → รายงานคงเหลือ
import { Fragment, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, doc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { ArrowLeft, ChevronDown, ChevronRight, FileSpreadsheet, Loader2, Printer, Settings2 } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useFiscalYear } from '../context/FiscalYearContext';
import { PageHeader } from '../components/Logo';
import { ConfirmDialog, Modal, Spinner } from '../components/ui';
import { ALL_CATS, BUDGET_CATS, CAT_NAMES, GROUPS, catByName, catsOf } from '../config/budgetCats';
import { computeBudget, deekaAmount, esc, money, openPrint } from '../lib/budget';
import BudgetSpendTable from './BudgetSpendTable';
import BudgetPicker, { budgetErrors } from '../components/BudgetPicker';
import { hasSubs, subByName, subsOf } from '../config/budgetSubs';
import useBudgetData from '../lib/useBudgetData';
import { fmtDate, todayStr } from '../lib/thai';
import { downloadXlsx } from '../modules/survey/surveyExport';

export const overviewRows = (b, cats = BUDGET_CATS) => cats.map((c) => { const o = b.byCat[c.id]; return [c.no, c.name, o.initial, o.add + o.adjust, o.tin - o.tout, o.total, o.spent, o.remain, o.pct == null ? '-' : Number(o.pct.toFixed(1))]; });

export default function BudgetPlan() {
  const { fy } = useFiscalYear(); const { profile } = useAuth(); const nav = useNavigate();
  const { entries, deekas, err } = useBudgetData(fy);
  const [view, setView] = useState('main'); const [openCats, setOpenCats] = useState({}); const [pick, setPick] = useState({}); const [confirmClear, setConfirmClear] = useState(false); const [setup, setSetup] = useState(null); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const b = useMemo(() => (entries && deekas ? computeBudget(entries, deekas) : null), [entries, deekas]);
  const unassigned = useMemo(() => (deekas || []).filter((d) => { const c = catByName(d.budgetCat); return !c || (hasSubs(c.id) && !subByName(c.id, d.budgetSub)); }).sort((a, c) => String(a.deekaDate).localeCompare(c.deekaDate)), [deekas]);
  const say = (t) => { setMsg(t); setTimeout(() => setMsg(''), 5000); };
  if (err) return <p className="rounded-xl bg-red-50 p-4 text-red-700">{err}</p>;
  if (!b) return <Spinner />;

  const cats = catsOf(view); const S = b.sums[view]; const gl = GROUPS.find((g) => g.id === view);
  // จุดตั้งยอด: หมวด 1–10 ตั้งที่หมวดย่อย; หมวด 11–13 ตั้งที่หมวด
  const nodes = BUDGET_CATS.flatMap((c) => (hasSubs(c.id) ? subsOf(c.id).map((x) => ({ id: x.id, cat: c.id, sub: x.id, label: x.name, group: c.no + '. ' + c.name, st: b.bySub[x.id] })) : [{ id: c.id, cat: c.id, label: c.no + '. ' + c.name, group: '', st: b.byCat[c.id] }]));
  const openSetup = () => setSetup(Object.fromEntries(nodes.map((n) => [n.id, n.st.initial ? String(n.st.initial) : ''])));
  const saveSetup = async () => {
    setBusy(true);
    try {
      for (const n of nodes) {
        const raw = String(setup[n.id] ?? '').replace(/,/g, '').trim(); if (raw === '') continue; const amount = Number(raw);
        if (!isFinite(amount) || amount < 0) throw new Error(`ยอด “${n.label}” ไม่ถูกต้อง`);
        await setDoc(doc(db, 'budgetEntries', `${fy}_${n.id}_initial`), { fy, cat: n.cat, ...(n.sub ? { sub: n.sub } : {}), type: 'initial', amount, date: todayStr(), note: 'ยอดตั้งต้นปีงบประมาณ', createdBy: profile?.email || '', updatedAt: serverTimestamp() }, { merge: true });
      }
      setSetup(null); say('บันทึกยอดตั้งต้นปีงบประมาณแล้ว');
    } catch (e) { say('บันทึกไม่สำเร็จ: ' + (e.code || e.message)); } finally { setBusy(false); }
  };
  const assign = async (d) => {
    const v = pick[d.id] || {}; if (!v.budgetCat) return say('กรุณาเลือกหมวดงบประมาณ'); const er = budgetErrors(v); if (er) return say(er);
    try { await updateDoc(doc(db, 'reg-deeka', d.id), { budgetCat: v.budgetCat, budgetSub: v.budgetSub || '', budgetPeriodMonth: v.budgetPeriodMonth || '', budgetPeriodYear: v.budgetPeriodYear || '', updatedAt: serverTimestamp(), updatedBy: profile?.email || '' }); setPick((x) => { const y = { ...x }; delete y[d.id]; return y; }); say('ตัดยอดตามหมวดแล้ว'); } catch (e) { say('บันทึกหมวดไม่สำเร็จ: ' + (e.code || e.message)); }
  };
  const clearLegacy = async () => {
    setBusy(true);
    try { const old = (entries || []).filter((e) => !e.sub && hasSubs(e.cat)); for (let i = 0; i < old.length; i += 400) { const wb = writeBatch(db); old.slice(i, i + 400).forEach((e) => wb.delete(doc(db, 'budgetEntries', e.id))); await wb.commit(); } setConfirmClear(false); say(`ล้างยอดเดิมระดับหมวดใหญ่แล้ว ${old.length} รายการ`); }
    catch (e) { say('ล้างไม่สำเร็จ: ' + (e.code || e.message)); } finally { setBusy(false); }
  };

  const head = ['ที่', 'หมวดรายการ', 'ยอดตั้งต้นปี', 'เพิ่ม/ปรับปรุง', 'โอนเข้า(+)/ออก(−)', 'งบรวม', 'เบิกจ่ายแล้ว (ตามฎีกา)', 'คงเหลือ', '% ที่ใช้'];
  const excel = () => {
    const rows = overviewRows(b, cats); rows.push(['', 'รวม' + gl.short, S.initial, S.add + S.adjust, S.tin - S.tout, S.total, S.spent, S.remain, S.pct == null ? '-' : Number(S.pct.toFixed(1))]);
    downloadXlsx([{ name: 'สรุปรายหมวด', head, rows }], `งบประมาณ_${gl.short}_ปีงบ${fy}`);
  };
  const print = () => {
    const rows = overviewRows(b, cats);
    const tr = (r, cls = '') => `<tr class="${cls}"><td class="c">${esc(r[0])}</td><td>${esc(r[1])}</td>${r.slice(2, 8).map((v) => `<td class="r${typeof v === 'number' && v < 0 ? ' neg' : ''}">${money(v)}</td>`).join('')}<td class="r">${r[8] === '-' ? '-' : r[8] + '%'}</td></tr>`;
    openPrint('รายงานงบประมาณเงินบำรุง', `<h1>รายงานงบประมาณคงเหลือตามแผนการใช้จ่ายเงินบำรุง</h1><h2>รพ.สต.บ้านหนองสนม · ปีงบประมาณ ${fy} · ${esc(gl.label)}</h2><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => tr(r)).join('')}${tr(['', 'รวม' + gl.short, S.initial, S.add + S.adjust, S.tin - S.tout, S.total, S.spent, S.remain, S.pct == null ? '-' : S.pct.toFixed(1)], 'tot')}</tbody></table><div class="foot">ข้อมูล ณ วันที่ ${fmtDate(todayStr())} · เบิกจ่ายแล้ว = มูลค่าตั้งเบิกตามฎีกาที่ระบุหมวดนั้น${unassigned.length ? ` · มีฎีกาที่ยังไม่ระบุหมวด ${unassigned.length} ฉบับ (${money(unassigned.reduce((s, d) => s + deekaAmount(d), 0))} บาท) ไม่รวมในยอดเบิกจ่าย` : ''}</div>`, true);
  };

  return (
    <div className="space-y-4">
      <Link to="/reg-deeka" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-50"><ArrowLeft className="h-4 w-4" /> กลับทะเบียนคุมฎีกาเบิกจ่าย</Link>
      <PageHeader emoji="💰" title="งบประมาณตามแผนการใช้จ่ายเงินบำรุง" tone="from-emerald-700 via-emerald-600 to-teal-500" big subtitle={`ปีงบประมาณ ${fy} · เชื่อมกับทะเบียนฎีกา ตัดยอดคงเหลือตามหมวดอัตโนมัติ`}
        actions={<div className="flex flex-wrap gap-2"><button className="btn bg-white text-emerald-800 hover:bg-emerald-50" onClick={openSetup}><Settings2 className="h-4 w-4" /> ตั้งยอดต้นปีงบประมาณ</button>
          <button className="btn bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25" onClick={excel}><FileSpreadsheet className="h-4 w-4" /> Excel</button>
          <button className="btn bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25" onClick={print}><Printer className="h-4 w-4" /> พิมพ์/PDF</button></div>} />
      {msg && <p className="rounded-lg bg-sky-50 px-3 py-2 text-sky-800 ring-1 ring-sky-200">{msg}</p>}

      <div className="flex flex-wrap items-center gap-2">{GROUPS.map((g) => <button key={g.id} type="button" onClick={() => setView(g.id)} className={`rounded-full px-4 py-2 text-sm font-semibold ${view === g.id ? 'bg-emerald-700 text-white shadow' : 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-emerald-50'}`}>{g.label}</button>)}
        <span className="text-xs text-slate-500">{view === 'all' ? 'แสดงยอดรวมทุกแหล่งงบ (ไม่แนะนำให้ใช้เป็นยอดเงินบำรุง)' : 'ยอดรวมแยกตามแหล่งงบประมาณ — หมวด 11–13 ไม่รวมกับหมวด 1–10'}</span></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(view === 'extra' ? [['เบิกจ่ายแล้ว ' + gl.short, S.spent, 'from-amber-600 to-orange-500']] : [['งบรวม ' + gl.short, S.total, 'from-sky-600 to-cyan-500'], ['เบิกจ่ายแล้ว (ตามฎีกา)', S.spent, 'from-amber-600 to-orange-500'], ['คงเหลือ', S.remain, S.remain < 0 ? 'from-red-700 to-rose-500' : 'from-emerald-600 to-teal-500'], ['ใช้ไปแล้ว', null, 'from-slate-600 to-slate-500']]).map(([l, v, t]) => (
          <div key={l} className={`rounded-2xl bg-gradient-to-br ${t} p-4 text-white shadow`}><div className="text-sm opacity-90">{l}</div><div className="text-2xl font-extrabold tabular-nums">{v == null ? (S.pct == null ? '-' : `${S.pct.toFixed(1)}%`) : money(v)}</div>{v != null && <div className="text-xs opacity-90">บาท</div>}</div>))}
      </div>

      {view !== 'extra' && S.total === 0 && <p className="rounded-xl bg-amber-50 p-3 text-amber-900 ring-1 ring-amber-200">ยังไม่ได้ตั้งยอดงบประมาณต้นปีงบประมาณ {fy} — กดปุ่ม “ตั้งยอดต้นปีงบประมาณ” เพื่อกรอกยอดแต่ละหมวด (หมวดที่ไม่มีงบเว้นว่างได้)</p>}

      {view === 'extra' ? (
        <section className="card overflow-x-auto p-0">
          <p className="border-b bg-amber-50 p-3 text-sm text-amber-900">รายจ่ายกลุ่มนี้ไม่ตั้งยอดงบประมาณ และไม่รวมในหมวด 1–13 — แสดงเฉพาะยอดเบิกจ่ายตามฎีกาที่ระบุหมวด (คลิกแถวเพื่อดูรายการ)</p>
          <table className="w-full min-w-[520px] text-sm"><thead><tr className="border-b bg-emerald-50 text-left"><th className="p-2.5">รายการ</th><th className="p-2.5 text-right">จำนวนฎีกา</th><th className="p-2.5 text-right">เบิกจ่ายแล้ว (บาท)</th></tr></thead>
            <tbody>{cats.map((c) => { const o = b.byCat[c.id]; return <tr key={c.id} className="cursor-pointer border-b hover:bg-emerald-50/60" onClick={() => nav(`/reg-budget/${c.id}`)}><td className="p-2.5 font-semibold text-emerald-900">{c.name}</td><td className="p-2.5 text-right tabular-nums">{o.n}</td><td className="p-2.5 text-right font-semibold tabular-nums">{money(o.spent)}</td></tr>; })}
              <tr className="bg-slate-100 font-bold"><td className="p-2.5">รวมรายจ่ายอื่น</td><td className="p-2.5 text-right tabular-nums">{S.n}</td><td className="p-2.5 text-right tabular-nums">{money(S.spent)}</td></tr></tbody></table>
        </section>
      ) : (
      <section className="card overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-sm">
          <thead><tr className="border-b bg-emerald-50 text-left text-slate-700">{head.map((h, i) => <th key={h} className={`p-2.5 ${i > 1 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
          <tbody>{cats.map((c) => { const o = b.byCat[c.id]; const subs = subsOf(c.id); const isOpen = !!openCats[c.id]; return (<Fragment key={c.id}>
            <tr className="cursor-pointer border-b hover:bg-emerald-50/60" onClick={() => nav(`/reg-budget/${c.id}`)} title="คลิกเพื่อดูรายการตัดยอดของหมวดนี้">
              <td className="p-2.5 text-center">{c.no}</td><td className="p-2.5 font-semibold text-emerald-900">{subs.length > 0 && <button type="button" aria-label="แสดง/ซ่อนหมวดย่อย" className="mr-1 inline-flex align-middle text-slate-500" onClick={(e) => { e.stopPropagation(); setOpenCats((x) => ({ ...x, [c.id]: !x[c.id] })); }}>{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>}{c.name}{subs.length > 0 && <span className="ml-2 text-xs font-normal text-slate-400">{subs.length} หมวดย่อย</span>}</td>
              <td className="p-2.5 text-right tabular-nums">{money(o.initial)}</td><td className="p-2.5 text-right tabular-nums">{money(o.add + o.adjust)}</td><td className="p-2.5 text-right tabular-nums">{money(o.tin - o.tout)}</td>
              <td className="p-2.5 text-right font-semibold tabular-nums">{money(o.total)}</td><td className="p-2.5 text-right tabular-nums">{money(o.spent)}{o.n ? <span className="ml-1 text-xs text-slate-400">({o.n} ฎีกา)</span> : null}</td>
              <td className={`p-2.5 text-right font-bold tabular-nums ${o.remain < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{money(o.remain)}</td>
              <td className="p-2.5 text-right"><div className="ml-auto h-2 w-20 overflow-hidden rounded-full bg-slate-200"><div className={`h-full ${o.pct > 100 ? 'bg-red-500' : o.pct > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, o.pct || 0)}%` }} /></div><span className="text-xs text-slate-500">{o.pct == null ? '-' : `${o.pct.toFixed(1)}%`}</span></td>
            </tr>
            {isOpen && subs.map((x) => { const t = b.bySub[x.id]; return (
              <tr key={x.id} className="cursor-pointer border-b bg-emerald-50/40 text-slate-700 hover:bg-emerald-50" onClick={() => nav(`/reg-budget/${c.id}?sub=${x.id}`)}>
                <td className="p-2" /><td className="p-2 pl-10">↳ {x.name}{x.period && <span className="ml-1 text-xs text-slate-400">(ระบุเดือน/ปี)</span>}</td>
                <td className="p-2 text-right tabular-nums">{money(t.initial)}</td><td className="p-2 text-right tabular-nums">{money(t.add + t.adjust)}</td><td className="p-2 text-right tabular-nums">{money(t.tin - t.tout)}</td>
                <td className="p-2 text-right tabular-nums">{money(t.total)}</td><td className="p-2 text-right tabular-nums">{money(t.spent)}</td>
                <td className={`p-2 text-right font-semibold tabular-nums ${t.remain < 0 ? 'text-red-600' : ''}`}>{money(t.remain)}</td><td className="p-2 text-right text-xs text-slate-500">{t.pct == null ? '-' : `${t.pct.toFixed(1)}%`}</td></tr>); })}
          </Fragment>); })}
            <tr className="bg-slate-100 font-bold"><td className="p-2.5" /><td className="p-2.5">รวม{gl.short}</td><td className="p-2.5 text-right tabular-nums">{money(S.initial)}</td><td className="p-2.5 text-right tabular-nums">{money(S.add + S.adjust)}</td><td className="p-2.5 text-right tabular-nums">{money(S.tin - S.tout)}</td><td className="p-2.5 text-right tabular-nums">{money(S.total)}</td><td className="p-2.5 text-right tabular-nums">{money(S.spent)}</td><td className={`p-2.5 text-right tabular-nums ${S.remain < 0 ? 'text-red-600' : ''}`}>{money(S.remain)}</td><td className="p-2.5 text-right">{S.pct == null ? '-' : `${S.pct.toFixed(1)}%`}</td></tr>
          </tbody>
        </table>
      </section>
      )}

      <BudgetSpendTable fy={fy} deekas={deekas} />

      {b.legacy > 0 && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">มียอดเดิมระดับหมวดใหญ่ 1–10 ค้างอยู่ {b.legacy} รายการ — ระบบไม่นำมาคำนวณแล้ว (ใช้ยอดที่ตั้งตามหมวดย่อยแทน)
          <button className="btn btn-outline !py-1 text-sm" onClick={() => setConfirmClear(true)}>ล้างยอดเดิมทิ้ง</button></p>)}
      {unassigned.length > 0 && (
        <section className="card space-y-2 p-4">
          <h3 className="font-bold text-amber-800">ฎีกาที่ยังไม่ระบุหมวด/หมวดย่อย ({unassigned.length} ฉบับ · {money(unassigned.reduce((s, d) => s + deekaAmount(d), 0))} บาท) — ยังตัดยอดไม่ครบ</h3>
          <p className="text-xs text-slate-500">เลือกหมวด → หมวดย่อย (และเดือน/ปีสำหรับค่าตอบแทน/สาธารณูปโภค) แล้วกด “ตัดยอด” — บันทึกลงฎีกาทันที</p>
          <div className="space-y-2">{unassigned.map((d) => (
            <div key={d.id} className="grid gap-2 rounded-lg border p-2 lg:grid-cols-[1fr_360px_auto]">
              <div className="text-sm"><b>{d.deekaNo}</b> · {fmtDate(d.deekaDate)} · <b className="tabular-nums">{money(deekaAmount(d))}</b> บาท<div className="text-slate-600">{d.subject}</div>{d.budgetCat && <div className="text-xs text-amber-700">เลือกหมวดไว้แล้ว: {d.budgetCat} — ยังขาดหมวดย่อย</div>}</div>
              <BudgetPicker compact fy={fy} value={pick[d.id] || { budgetCat: d.budgetCat || '' }} onChange={(patch) => setPick((x) => ({ ...x, [d.id]: { budgetCat: d.budgetCat || '', ...(x[d.id] || {}), ...patch } }))} />
              <button className="btn btn-primary self-start" onClick={() => assign(d)}>ตัดยอด</button></div>))}</div>
        </section>)}

      {setup && (
        <Modal title={`ตั้งยอดงบประมาณต้นปีงบประมาณ ${fy}`} onClose={() => !busy && setSetup(null)} wide
          footer={<div className="flex justify-end gap-2"><button className="btn btn-outline" onClick={() => setSetup(null)} disabled={busy}>ยกเลิก</button><button className="btn btn-primary" onClick={saveSetup} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} บันทึกยอดต้นปี</button></div>}>
          <p className="mb-3 text-sm text-slate-600">กรอกยอดเงินตามแผนต้นปีของแต่ละหมวดย่อย (บาท) — ยอดหมวดใหญ่ 1–10 คำนวณรวมจากหมวดย่อยอัตโนมัติ — เว้นว่างถ้าไม่มี · แก้ไขซ้ำได้ (จะแทนที่ยอดต้นปีเดิม) · การเพิ่มยอด ปรับปรุง และโอนย้ายระหว่างหมวด ทำได้ในหน้าของแต่ละหมวด</p>
          <div className="grid gap-2">{nodes.map((n, i) => (<Fragment key={n.id}>
            {n.group && (i === 0 || nodes[i - 1].group !== n.group) && <div className="mt-2 rounded bg-emerald-100 px-2 py-1 text-sm font-bold text-emerald-900">{n.group}</div>}
            {!n.group && (i === 0 || nodes[i - 1].group) && <div className="mt-2 rounded bg-sky-100 px-2 py-1 text-sm font-bold text-sky-900">หมวด 11–13 (งบจากแหล่งอื่น)</div>}
            <label className="grid items-center gap-2 sm:grid-cols-[1fr_200px]"><span className={`text-sm ${n.group ? 'pl-3' : ''}`}>{n.label}</span>
              <input className="input text-right tabular-nums" inputMode="decimal" placeholder="0.00" value={setup[n.id]} onChange={(e) => setSetup((x) => ({ ...x, [n.id]: e.target.value }))} /></label></Fragment>))}</div>
        </Modal>)}
      {confirmClear && <ConfirmDialog busy={busy} onCancel={() => setConfirmClear(false)} onConfirm={clearLegacy} message={`ลบยอดเดิมระดับหมวดใหญ่ 1–10 (ตั้งต้น/เพิ่ม/ปรับ/โอน) จำนวน ${b.legacy} รายการ ของปีงบประมาณ ${fy} ถาวร? (ไม่กระทบฎีกา)`} />}
    </div>);
}
