// รายการตัดยอดงบประมาณรายหมวด: ยอดตั้งต้น เพิ่ม/ปรับปรุง/โอน และฎีกาเบิกจ่ายที่เชื่อมกับหมวดนี้ พร้อมยอดคงเหลือสะสม
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { addDoc, collection, deleteDoc, doc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { ArrowLeft, FileSpreadsheet, Loader2, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useFiscalYear } from '../context/FiscalYearContext';
import { PageHeader } from '../components/Logo';
import { ConfirmDialog, Modal, Spinner } from '../components/ui';
import ThaiDateInput from '../components/ThaiDateInput';
import { BUDGET_CATS, catById } from '../config/budgetCats';
import { ENTRY_TYPES, computeBudget, deekaAmount, entrySign, esc, money, openPrint } from '../lib/budget';
import useBudgetData from '../lib/useBudgetData';
import { fmtDate, todayStr } from '../lib/thai';
import { downloadXlsx } from '../modules/survey/surveyExport';

const ACTIONS = [['add', 'เพิ่มยอด'], ['adjust', 'ปรับปรุงยอด (+/−)'], ['transfer', 'โอนย้ายยอดระหว่างหมวด'], ['initial', 'ตั้ง/แก้ยอดต้นปี']];

export default function BudgetCat() {
  const { cat } = useParams(); const c = catById(cat); const { fy } = useFiscalYear(); const { profile } = useAuth();
  const { entries, deekas, err } = useBudgetData(fy);
  const [form, setForm] = useState(null); const [del, setDel] = useState(null); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const say = (t) => { setMsg(t); setTimeout(() => setMsg(''), 5000); };
  const data = useMemo(() => (entries && deekas ? computeBudget(entries, deekas) : null), [entries, deekas]);
  const ledger = useMemo(() => {
    if (!entries || !deekas || !c) return [];
    const rows = [
      ...entries.filter((e) => e.cat === c.id).map((e) => ({ k: 'e', id: e.id, e, date: e.date || '', ord: e.type === 'initial' ? 0 : 1, label: ENTRY_TYPES[e.type] + (e.otherCat ? ` — ${catById(e.otherCat)?.name || ''}` : ''), note: e.note || '', plus: entrySign(e) > 0 ? entrySign(e) : 0, minus: entrySign(e) < 0 ? -entrySign(e) : 0 })),
      ...deekas.filter((d) => d.budgetCat === c.name).map((d) => ({ k: 'd', id: d.id, date: d.deekaDate || '', ord: 2, label: `ฎีกาเลขที่ ${d.deekaNo || '-'}`, note: d.subject || '', plus: 0, minus: deekaAmount(d), d })),
    ].sort((a, b) => a.date.localeCompare(b.date) || a.ord - b.ord);
    let bal = 0; return rows.map((r) => { bal += r.plus - r.minus; return { ...r, bal }; });
  }, [entries, deekas, c]);
  if (!c) return <p className="p-4">ไม่พบหมวดงบประมาณนี้ · <Link className="text-brand-700 underline" to="/reg-budget">กลับ</Link></p>;
  if (err) return <p className="rounded-xl bg-red-50 p-4 text-red-700">{err}</p>;
  if (!data) return <Spinner />;
  const o = data.byCat[c.id]; const extra = c.g === 'extra';

  const open = (type, e) => setForm({ type, id: e?.id || '', date: e?.date || todayStr(), amount: e ? String(Math.abs(Number(e.amount))) : '', sign: e && Number(e.amount) < 0 ? '-' : '+', note: e?.note || '', dir: 'out', other: '', current: e });
  const save = async () => {
    const amt = Number(String(form.amount).replace(/,/g, '')); if (!isFinite(amt) || amt <= 0) return say('กรุณากรอกจำนวนเงินให้ถูกต้อง (มากกว่า 0)');
    if (!form.date) return say('กรุณาเลือกวันที่');
    setBusy(true);
    try {
      const base = { fy, date: form.date, note: form.note.trim(), updatedAt: serverTimestamp(), createdBy: profile?.email || '' };
      if (form.type === 'initial') await setDoc(doc(db, 'budgetEntries', `${fy}_${c.id}_initial`), { ...base, cat: c.id, type: 'initial', amount: amt, note: form.note.trim() || 'ยอดตั้งต้นปีงบประมาณ' }, { merge: true });
      else if (form.type === 'transfer') {
        if (!form.other) { setBusy(false); return say('กรุณาเลือกหมวดที่จะโอนย้าย'); }
        if (form.dir === 'out' && amt > o.remain && !window.confirm(`ยอดโอนออก (${money(amt)}) มากกว่ายอดคงเหลือของหมวดนี้ (${money(o.remain)}) ต้องการดำเนินการต่อหรือไม่?`)) { setBusy(false); return; }
        const tid = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`; const wb = writeBatch(db);
        wb.set(doc(collection(db, 'budgetEntries')), { ...base, cat: c.id, type: form.dir === 'out' ? 'transferOut' : 'transferIn', amount: amt, otherCat: form.other, transferId: tid, createdAt: serverTimestamp() });
        wb.set(doc(collection(db, 'budgetEntries')), { ...base, cat: form.other, type: form.dir === 'out' ? 'transferIn' : 'transferOut', amount: amt, otherCat: c.id, transferId: tid, createdAt: serverTimestamp() });
        await wb.commit();
      } else {
        const amount = form.type === 'adjust' && form.sign === '-' ? -amt : amt;
        if (form.id) await updateDoc(doc(db, 'budgetEntries', form.id), { ...base, amount }); else await addDoc(collection(db, 'budgetEntries'), { ...base, cat: c.id, type: form.type, amount, createdAt: serverTimestamp() });
      }
      setForm(null); say('บันทึกรายการแล้ว');
    } catch (e) { say('บันทึกไม่สำเร็จ: ' + (e.code || e.message)); } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { const e = del; const wb = writeBatch(db); wb.delete(doc(db, 'budgetEntries', e.id)); if (e.transferId) (entries || []).filter((x) => x.transferId === e.transferId && x.id !== e.id).forEach((x) => wb.delete(doc(db, 'budgetEntries', x.id))); await wb.commit(); setDel(null); say('ลบรายการแล้ว'); }
    catch (e) { say('ลบไม่สำเร็จ: ' + (e.code || e.message)); } finally { setBusy(false); }
  };
  const head = ['วันที่', 'รายการ', 'รายละเอียด', 'เพิ่ม (+)', 'ตัดยอด (−)', 'คงเหลือสะสม'];
  const excel = () => downloadXlsx([{ name: 'สรุป', head: ['รายการ', 'บาท'], rows: [['หมวด', `${c.no}. ${c.name}`], ['ปีงบประมาณ', fy], ['ยอดตั้งต้น', o.initial], ['เพิ่ม/ปรับปรุง', o.add + o.adjust], ['โอนเข้า(+)/ออก(−)', o.tin - o.tout], ['งบรวม', o.total], ['เบิกจ่ายแล้ว (ตามฎีกา)', o.spent], ['คงเหลือ', o.remain]] }, { name: 'รายการตัดยอด', head, rows: ledger.map((r) => [fmtDate(r.date), r.label, r.note, r.plus || '', r.minus || '', r.bal]) }], `งบประมาณหมวด${c.no}_ปีงบ${fy}`);
  const print = () => openPrint(`รายงานหมวด ${c.no}`, `<h1>รายงานการใช้จ่ายงบประมาณเงินบำรุง</h1><h2>หมวด ${c.no}. ${esc(c.name)} · ปีงบประมาณ ${fy} · รพ.สต.บ้านหนองสนม</h2>
    <table><tbody><tr><td>ยอดตั้งต้นปี</td><td class="r">${money(o.initial)}</td><td>เพิ่ม/ปรับปรุง</td><td class="r">${money(o.add + o.adjust)}</td><td>โอนเข้า(+)/ออก(−)</td><td class="r">${money(o.tin - o.tout)}</td></tr><tr class="tot"><td>งบรวม</td><td class="r">${money(o.total)}</td><td>เบิกจ่ายแล้ว</td><td class="r">${money(o.spent)}</td><td>คงเหลือ</td><td class="r ${o.remain < 0 ? 'neg' : ''}">${money(o.remain)}</td></tr></tbody></table>
    <table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${ledger.map((r) => `<tr><td class="c">${esc(fmtDate(r.date))}</td><td>${esc(r.label)}</td><td>${esc(r.note)}</td><td class="r">${r.plus ? money(r.plus) : ''}</td><td class="r">${r.minus ? money(r.minus) : ''}</td><td class="r ${r.bal < 0 ? 'neg' : ''}">${money(r.bal)}</td></tr>`).join('')}</tbody></table><div class="foot">ข้อมูล ณ วันที่ ${fmtDate(todayStr())}</div>`, true);
  const others = BUDGET_CATS.filter((x) => x.id !== c.id);

  return (
    <div className="space-y-4">
      <Link to="/reg-budget" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-50"><ArrowLeft className="h-4 w-4" /> กลับภาพรวมงบประมาณทุกหมวด</Link>
      <PageHeader emoji="💰" title={extra ? c.name : `หมวด ${c.no}. ${c.name}`} tone="from-emerald-700 via-emerald-600 to-teal-500" subtitle={`ปีงบประมาณ ${fy} · รายการตัดยอดงบประมาณ`}
        actions={<div className="flex flex-wrap gap-2"><button className="btn bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25" onClick={excel}><FileSpreadsheet className="h-4 w-4" /> Excel</button><button className="btn bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25" onClick={print}><Printer className="h-4 w-4" /> พิมพ์/PDF</button></div>} />
      {msg && <p className="rounded-lg bg-sky-50 px-3 py-2 text-sky-800 ring-1 ring-sky-200">{msg}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[['งบรวมของหมวด', o.total, 'from-sky-600 to-cyan-500'], ['เบิกจ่ายแล้ว (ตามฎีกา)', o.spent, 'from-amber-600 to-orange-500'], ['คงเหลือ', o.remain, o.remain < 0 ? 'from-red-700 to-rose-500' : 'from-emerald-600 to-teal-500']].filter(([l]) => !extra || l.startsWith('เบิก')).map(([l, v, t]) => <div key={l} className={`rounded-2xl bg-gradient-to-br ${t} p-4 text-white shadow`}><div className="text-sm opacity-90">{l}</div><div className="text-2xl font-extrabold tabular-nums">{money(v)}</div><div className="text-xs opacity-90">บาท</div></div>)}
        {!extra && <div className="rounded-2xl bg-white p-4 text-sm shadow ring-1 ring-slate-200"><div>ตั้งต้นปี <b className="float-right tabular-nums">{money(o.initial)}</b></div><div>เพิ่ม/ปรับปรุง <b className="float-right tabular-nums">{money(o.add + o.adjust)}</b></div><div>โอนเข้า(+)/ออก(−) <b className="float-right tabular-nums">{money(o.tin - o.tout)}</b></div></div>}
      </div>
      {!extra && <section className="card flex flex-wrap items-center gap-2 p-3">
        {ACTIONS.map(([k, t]) => <button key={k} className="btn btn-outline" onClick={() => open(k, k === 'initial' ? entries.find((e) => e.id === `${fy}_${c.id}_initial`) : null)}><Plus className="h-4 w-4" /> {t}</button>)}
        <span className="text-xs text-slate-500">ฎีกาตัดยอดอัตโนมัติเมื่อระบุ “หมวดงบประมาณ” นี้ในทะเบียนฎีกา</span>
      </section>}
      {extra && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">หมวดนี้ไม่ตั้งยอดงบประมาณและไม่รวมกับหมวด 1–13 — แสดงเฉพาะฎีกาที่ระบุหมวดนี้</p>}
      <section className="card overflow-x-auto p-0">
        <table className="w-full min-w-[820px] text-sm">
          <thead><tr className="border-b bg-emerald-50 text-left text-slate-700">{head.map((h, i) => <th key={h} className={`p-2.5 ${i > 2 ? 'text-right' : ''}`}>{h}</th>)}<th className="w-20" /></tr></thead>
          <tbody>{!ledger.length ? <tr><td colSpan={7} className="p-6 text-center text-slate-500">ยังไม่มีรายการ — ตั้งยอดต้นปีที่ปุ่ม “ตั้ง/แก้ยอดต้นปี” หรือระบุหมวดนี้ในฎีกาเบิกจ่าย</td></tr> : ledger.map((r) => (
            <tr key={r.k + r.id} className="border-b align-top last:border-0"><td className="p-2.5 whitespace-nowrap">{fmtDate(r.date)}</td><td className="p-2.5 font-semibold">{r.label}</td><td className="p-2.5">{r.note}</td>
              <td className="p-2.5 text-right tabular-nums text-emerald-700">{r.plus ? money(r.plus) : ''}</td><td className="p-2.5 text-right tabular-nums text-red-600">{r.minus ? money(r.minus) : ''}</td><td className={`p-2.5 text-right font-semibold tabular-nums ${r.bal < 0 ? 'text-red-600' : ''}`}>{extra ? '' : money(r.bal)}</td>
              <td className="p-2.5 whitespace-nowrap text-right">{r.k === 'e' ? <>{!r.e.transferId && r.e.type !== 'initial' && <button className="mr-3 text-brand-700" aria-label="แก้ไข" onClick={() => open(r.e.type, r.e)}><Pencil className="h-4 w-4" /></button>}<button className="text-red-600" aria-label="ลบ" onClick={() => setDel(r.e)}><Trash2 className="h-4 w-4" /></button></> : <Link className="text-xs text-brand-700 underline" to="/reg-deeka">ดูฎีกา</Link>}</td></tr>))}</tbody>
        </table>
      </section>

      {form && (
        <Modal title={form.type === 'transfer' ? 'โอนย้ายยอดระหว่างหมวด' : form.id ? `แก้ไข${ENTRY_TYPES[form.type]}` : ENTRY_TYPES[form.type] === 'ตั้งยอดต้นปีงบประมาณ' ? 'ตั้ง/แก้ยอดต้นปี' : ENTRY_TYPES[form.type]} onClose={() => !busy && setForm(null)}
          footer={<div className="flex justify-end gap-2"><button className="btn btn-outline" onClick={() => setForm(null)} disabled={busy}>ยกเลิก</button><button className="btn btn-primary" onClick={save} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} บันทึก</button></div>}>
          <div className="space-y-3">
            <p className="rounded-lg bg-slate-50 p-2 text-sm text-slate-600">หมวด {c.no}. {c.name} · คงเหลือปัจจุบัน {money(o.remain)} บาท</p>
            {form.type === 'transfer' && <>
              <div className="flex gap-2">{[['out', 'โอนออกจากหมวดนี้ ไปหมวดอื่น'], ['in', 'โอนเข้าหมวดนี้ จากหมวดอื่น']].map(([k, t]) => <button type="button" key={k} onClick={() => setForm((x) => ({ ...x, dir: k }))} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${form.dir === k ? 'bg-brand-700 text-white' : 'bg-white ring-1 ring-slate-300'}`}>{t}</button>)}</div>
              <label className="block"><span className="mb-1 block text-sm text-slate-600">{form.dir === 'out' ? 'โอนไปยังหมวด' : 'โอนมาจากหมวด'}</span><select className="input" value={form.other} onChange={(e) => setForm((x) => ({ ...x, other: e.target.value }))}><option value="">— เลือกหมวด —</option>{others.map((x) => <option key={x.id} value={x.id}>{x.no}. {x.name}</option>)}</select></label></>}
            {form.type === 'adjust' && <div className="flex gap-2">{[['+', 'เพิ่มยอด'], ['-', 'ลดยอด']].map(([k, t]) => <button type="button" key={k} onClick={() => setForm((x) => ({ ...x, sign: k }))} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${form.sign === k ? 'bg-brand-700 text-white' : 'bg-white ring-1 ring-slate-300'}`}>{t}</button>)}</div>}
            <label className="block"><span className="mb-1 block text-sm text-slate-600">จำนวนเงิน (บาท)</span><input className="input text-right text-lg tabular-nums" inputMode="decimal" autoFocus value={form.amount} onChange={(e) => setForm((x) => ({ ...x, amount: e.target.value }))} placeholder="0.00" /></label>
            <label className="block"><span className="mb-1 block text-sm text-slate-600">วันที่</span><ThaiDateInput value={form.date} onChange={(v) => setForm((x) => ({ ...x, date: v }))} yearsBack={2} yearsForward={1} /></label>
            <label className="block"><span className="mb-1 block text-sm text-slate-600">หมายเหตุ / เหตุผล / เลขที่หนังสืออนุมัติ</span><textarea className="input min-h-[64px]" value={form.note} onChange={(e) => setForm((x) => ({ ...x, note: e.target.value }))} /></label>
          </div>
        </Modal>)}
      {del && <ConfirmDialog busy={busy} onCancel={() => setDel(null)} onConfirm={remove} message={`ลบรายการ “${ENTRY_TYPES[del.type]}” ${money(del.amount)} บาท?${del.transferId ? ' (รายการโอนจะลบทั้งสองหมวด)' : ''}`} />}
    </div>);
}
