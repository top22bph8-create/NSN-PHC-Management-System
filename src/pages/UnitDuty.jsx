// เวรออกหน่วยปฐมพยาบาล / เวรออกรับบริจาคโลหิต — รันคิวอัตโนมัติ + แจ้งไลน์กลุ่ม (Cloud Functions: onUnitDutyCreated / dailyUnitDutyReminder)
import { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { CalendarPlus, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { writeAudit } from '../lib/audit';
import { exportXlsx } from '../lib/exportFile';
import { fmtDate, todayStr } from '../lib/thai';
import { UNIT_KINDS, UNIT_STATUS, UNIT_STATUS_TONE, createUnitEvent, loadRoster, releaseQueue, saveRoster, unitColor } from '../lib/unitDuty';
import { PageHeader } from '../components/Logo';
import ThaiDateInput from '../components/ThaiDateInput';
import { Badge, ConfirmDialog, Modal, Spinner, Toast } from '../components/ui';

const memberLine = (m) => `${m.name}${m.position ? ` · ${m.position}` : ''}`;

function EventForm({ kind, roster, onClose, onSaved, say, user }) {
  const K = UNIT_KINDS[kind];
  const [f, setF] = useState({ date: todayStr(), time: '', place: '', orderNo: '', note: '', override: '' });
  const [busy, setBusy] = useState(false);
  const nextI = roster.nextIdx % roster.units.length;
  const pick = f.override === '' ? nextI : Number(f.override);
  const c = unitColor(pick);
  const submit = async (e) => {
    e.preventDefault();
    if (!f.date || !f.place.trim()) return say({ type: 'error', text: 'กรุณากรอกวันที่และสถานที่/กิจกรรม' });
    setBusy(true);
    try {
      const { override, ...data } = f;
      const r = await createUnitEvent(kind, { ...data, place: f.place.trim() }, override, user);
      await writeAudit({ action: 'create', module: 'unit-duty', label: `${K.title}: ${f.place} ${fmtDate(f.date)} → ${r.unitLabel}${r.auto ? ' (รันคิวอัตโนมัติ)' : ' (กำหนดเอง)'}` }).catch(() => {});
      say({ type: 'ok', text: `บันทึกแล้ว — ${r.unitLabel}${r.auto ? ' (ระบบรันคิวให้)' : ''} · แจ้งไลน์กลุ่มให้อัตโนมัติ` });
      onSaved(); onClose();
    } catch (err) { say({ type: 'error', text: 'บันทึกไม่สำเร็จ: ' + (err.code || err.message) }); } finally { setBusy(false); }
  };
  return (
    <Modal title={`เพิ่มงาน${K.short}`} onClose={onClose}
      footer={<button form="unit-form" className="btn btn-primary w-full" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกและรันคิว'}</button>}>
      <form id="unit-form" onSubmit={submit} className="space-y-3">
        <div className={`overflow-hidden rounded-xl ring-2 ${c.ring}`}>
          <div className={`flex items-center gap-2 px-3 py-1.5 text-sm font-bold ${c.chip}`}>🎯 คิวถัดไป{f.override !== '' ? ' (กำหนดเอง ไม่ขยับคิว)' : ' (ระบบรันให้)'}</div>
          <div className={`p-3 ${c.soft}`}>
            <div className="text-lg font-extrabold">{roster.units[pick].label}</div>
            <ul className="mt-1 text-sm">{roster.units[pick].members.map((m, i) => <li key={i}>{memberLine(m)}</li>)}</ul>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm"><span className="mb-1 block font-medium">วันที่ออกหน่วย *</span><ThaiDateInput value={f.date} onChange={(v) => setF({ ...f, date: v })} required /></label>
          <label className="block text-sm"><span className="mb-1 block font-medium">เวลา</span><input type="time" className="input" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></label>
        </div>
        <label className="block text-sm"><span className="mb-1 block font-medium">สถานที่ / กิจกรรม *</span><input className="input" value={f.place} placeholder={kind === 'blood' ? 'เช่น รับบริจาคโลหิต อบต.เชียงเครือ' : 'เช่น งานกีฬาตำบล สนามกลาง'} onChange={(e) => setF({ ...f, place: e.target.value })} /></label>
        <label className="block text-sm"><span className="mb-1 block font-medium">คำสั่ง / หนังสือขอความอนุเคราะห์ ที่</span><input className="input" value={f.orderNo} placeholder="เช่น 123/2569" onChange={(e) => setF({ ...f, orderNo: e.target.value })} /></label>
        <label className="block text-sm"><span className="mb-1 block font-medium">หมายเหตุ</span><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
        <label className="block text-sm"><span className="mb-1 block font-medium">กำหนด{K.unitWord}เอง (ถ้าไม่ต้องการให้ระบบรันคิว)</span>
          <select className="input" value={f.override} onChange={(e) => setF({ ...f, override: e.target.value })}>
            <option value="">— ให้ระบบรันคิวอัตโนมัติ ({roster.units[nextI].label}) —</option>
            {roster.units.map((u, i) => <option key={i} value={i}>{u.label}</option>)}
          </select>
        </label>
      </form>
    </Modal>
  );
}

function RosterEditor({ kind, roster, onClose, onSaved, say }) {
  const K = UNIT_KINDS[kind];
  const [units, setUnits] = useState(JSON.parse(JSON.stringify(roster.units)));
  const [nextIdx, setNextIdx] = useState(roster.nextIdx % roster.units.length);
  const [busy, setBusy] = useState(false);
  const setM = (ui, mi, k, v) => setUnits(units.map((u, i) => (i !== ui ? u : { ...u, members: u.members.map((m, j) => (j === mi ? { ...m, [k]: v } : m)) })));
  const save = async () => {
    const clean = units.map((u) => ({ ...u, members: u.members.filter((m) => m.name.trim()) })).filter((u) => u.label.trim() && u.members.length);
    if (!clean.length) return say({ type: 'error', text: 'ต้องมีอย่างน้อย 1 รายการ' });
    setBusy(true);
    try { await saveRoster(kind, { units: clean, nextIdx: Math.min(nextIdx, clean.length - 1) }); await writeAudit({ action: 'update', module: 'unit-duty', label: `แก้ไขรายชื่อ/คิว ${K.title}` }).catch(() => {}); say({ type: 'ok', text: 'บันทึกรายชื่อและคิวแล้ว' }); onSaved(); onClose(); }
    catch (err) { say({ type: 'error', text: 'บันทึกไม่สำเร็จ: ' + (err.code || err.message) }); } finally { setBusy(false); }
  };
  return (
    <Modal title={`แก้ไขรายชื่อ/คิว${K.short}`} wide onClose={onClose} footer={<button className="btn btn-primary w-full" disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>}>
      <div className="space-y-3">
        <label className="block text-sm"><span className="mb-1 block font-medium">คิวถัดไป (ปรับคิวเองได้)</span>
          <select className="input" value={nextIdx} onChange={(e) => setNextIdx(Number(e.target.value))}>{units.map((u, i) => <option key={i} value={i}>{u.label || `${K.unitWord}ที่ ${i + 1}`}</option>)}</select>
        </label>
        {units.map((u, ui) => (
          <div key={ui} className={`rounded-xl p-3 ${unitColor(ui).soft}`}>
            <input className="input mb-2 font-bold" value={u.label} onChange={(e) => setUnits(units.map((x, i) => (i === ui ? { ...x, label: e.target.value } : x)))} aria-label="ชื่อ" />
            {u.members.map((m, mi) => (
              <div key={mi} className="mb-1.5 grid gap-1.5 sm:grid-cols-2">
                <input className="input" placeholder="ชื่อ-สกุล" value={m.name} onChange={(e) => setM(ui, mi, 'name', e.target.value)} />
                <input className="input" placeholder="ตำแหน่ง" value={m.position} onChange={(e) => setM(ui, mi, 'position', e.target.value)} />
              </div>
            ))}
            {kind === 'firstaid' && <button type="button" className="text-sm font-semibold underline" onClick={() => setUnits(units.map((x, i) => (i === ui ? { ...x, members: [...x.members, { name: '', position: '' }] } : x)))}>+ เพิ่มสมาชิกในทีม</button>}
          </div>
        ))}
        {kind === 'firstaid' && <button type="button" className="btn btn-outline" onClick={() => setUnits([...units, { label: `ทีมที่ ${units.length + 1}`, members: [{ name: '', position: '' }] }])}><Plus className="h-4 w-4" /> เพิ่มทีม</button>}
      </div>
    </Modal>
  );
}

export default function UnitDuty({ kind }) {
  const K = UNIT_KINDS[kind];
  const { profile } = useAuth();
  const [roster, setRoster] = useState(null);
  const [events, setEvents] = useState(null);
  const [form, setForm] = useState(false);
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(null);
  const [toast, setToast] = useState(null);
  const say = (t) => { setToast(t); setTimeout(() => setToast(null), 5000); };
  const reload = () => loadRoster(kind).then(setRoster).catch((e) => say({ type: 'error', text: e.message }));
  useEffect(() => { setRoster(null); reload(); }, [kind]); // eslint-disable-line
  useEffect(() => onSnapshot(query(collection(db, 'unitDuty'), where('kind', '==', kind)),
    (s) => setEvents(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setEvents([])), [kind]);

  const today = todayStr();
  const sorted = useMemo(() => [...(events || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.time || '').localeCompare(String(a.time || ''))), [events]);
  const upcoming = sorted.filter((e) => e.date >= today && e.status === 'นัดหมาย').reverse();
  const counts = useMemo(() => { const c = {}; (events || []).filter((e) => e.status !== 'ยกเลิก').forEach((e) => { c[e.unitIdx] = (c[e.unitIdx] || 0) + 1; }); return c; }, [events]);
  const lastDone = useMemo(() => { const m = {}; (events || []).filter((e) => e.status !== 'ยกเลิก').forEach((e) => { if (!m[e.unitIdx] || e.date > m[e.unitIdx]) m[e.unitIdx] = e.date; }); return m; }, [events]);
  const userName = profile?.name || profile?.email || '';

  const setStatus = async (ev, status) => {
    try {
      await updateDoc(doc(db, 'unitDuty', ev.id), { status, updatedAt: serverTimestamp() });
      if (status === 'ยกเลิก' && await releaseQueue(kind, ev)) { say({ type: 'ok', text: `ยกเลิกแล้ว และคืนคิวให้ ${ev.unitLabel}` }); reload(); }
    } catch (err) { say({ type: 'error', text: 'ไม่สำเร็จ: ' + (err.code || err.message) }); }
  };
  const remove = async () => {
    try { await deleteDoc(doc(db, 'unitDuty', del.id)); if (await releaseQueue(kind, del)) reload(); await writeAudit({ action: 'delete', module: 'unit-duty', label: `ลบงาน ${K.short} ${del.place} ${fmtDate(del.date)}` }).catch(() => {}); setDel(null); say({ type: 'ok', text: 'ลบแล้ว' }); }
    catch (err) { say({ type: 'error', text: 'ลบไม่สำเร็จ: ' + (err.code || err.message) }); }
  };
  const doExport = () => exportXlsx(sorted.map((e, i) => ({ ลำดับ: i + 1, วันที่: fmtDate(e.date), เวลา: e.time || '', 'สถานที่/กิจกรรม': e.place, 'คำสั่ง/หนังสือที่': e.orderNo || '', [K.unitWord]: e.unitLabel, ผู้ปฏิบัติงาน: (e.members || []).map((m) => m.name).join(', '), สถานะ: e.status, วิธีกำหนด: e.auto ? 'ระบบรันคิว' : 'กำหนดเอง', หมายเหตุ: e.note || '' })), K.short, `${K.title}_${today}`);

  if (!roster || !events) return <Spinner />;
  const nextI = roster.nextIdx % roster.units.length;
  const todayEv = (events || []).filter((e) => e.date === today && e.status === 'นัดหมาย');

  return (
    <div>
      <PageHeader emoji={K.emoji} title={K.title} subtitle={K.subtitle} tone={K.tone}
        actions={<div className="flex flex-wrap gap-2">
          <button className="btn bg-white text-rose-700 hover:bg-rose-50" onClick={() => setForm(true)}><CalendarPlus className="h-4 w-4" /> เพิ่มงานออกหน่วย</button>
          <button className="btn bg-white/90 text-slate-800 hover:bg-white" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" /> แก้ไขรายชื่อ/คิว</button>
          <button className="btn bg-white/90 text-slate-800 hover:bg-white" onClick={doExport}>ส่งออก Excel</button>
        </div>} />

      {todayEv.length > 0 && (
        <div className="mb-4 animate-pulse rounded-2xl bg-gradient-to-r from-red-600 to-orange-500 p-4 text-white shadow-lg">
          <div className="font-bold">🔔 วันนี้มีออกหน่วย {todayEv.length} งาน</div>
          {todayEv.map((e) => <div key={e.id} className="text-sm">{e.time ? `${e.time} น. ` : ''}{e.place} — <b>{e.unitLabel}</b></div>)}
        </div>
      )}

      <h2 className="mb-2 text-lg font-bold">คิวเวร{K.unitWord === 'ทีม' ? 'รายทีม' : 'รายบุคคล'}</h2>
      <div className={`mb-6 grid gap-3 ${kind === 'firstaid' ? 'sm:grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-2 xl:grid-cols-4'}`}>
        {roster.units.map((u, i) => {
          const c = unitColor(i); const isNext = i === nextI;
          return (
            <div key={i} className={`relative overflow-hidden rounded-2xl bg-white shadow ${isNext ? `ring-4 ${c.ring} shadow-xl` : 'ring-1 ring-slate-200'}`}>
              <div className={`h-2 w-full ${c.bar}`} />
              <div className={`flex items-center gap-2 px-3 py-2 ${c.soft}`}>
                <span className="flex-1 font-extrabold">{u.label}</span>
                {isNext && <span className={`animate-pulse rounded-full px-2.5 py-0.5 text-xs font-bold ${c.chip}`}>🎯 ถึงคิว</span>}
              </div>
              <ul className="space-y-0.5 px-3 py-2 text-sm">{u.members.map((m, j) => <li key={j}><span className="font-medium">{m.name}</span><span className="block text-xs text-slate-500">{m.position}</span></li>)}</ul>
              <div className="flex items-center justify-between border-t border-slate-100 px-3 py-1.5 text-xs text-slate-500">
                <span>ออกแล้ว <b className="text-slate-800">{counts[i] || 0}</b> ครั้ง</span>
                <span>{lastDone[i] ? `ล่าสุด ${fmtDate(lastDone[i])}` : 'ยังไม่เคยออก'}</span>
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="mb-2 text-lg font-bold">รายการออกหน่วย</h2>
      {sorted.length === 0 ? (
        <div className="card p-8 text-center text-slate-500">ยังไม่มีงานออกหน่วย — กด "เพิ่มงานออกหน่วย" ระบบจะรันคิวให้ ({roster.units[nextI].label}) และแจ้งไลน์กลุ่ม</div>
      ) : (
        <div className="space-y-2">
          {[...upcoming, ...sorted.filter((e) => !upcoming.includes(e))].map((e) => {
            const c = unitColor(e.unitIdx);
            return (
              <div key={e.id} className={`flex overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200 ${e.status === 'ยกเลิก' ? 'opacity-60' : ''}`}>
                <div className={`w-2 shrink-0 ${c.bar}`} />
                <div className="min-w-0 flex-1 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <b>{fmtDate(e.date)}{e.time ? ` · ${e.time} น.` : ''}</b>
                    {e.date === today && e.status === 'นัดหมาย' && <Badge className="bg-red-600 text-white">วันนี้</Badge>}
                    <Badge className={UNIT_STATUS_TONE[e.status]}>{e.status}</Badge>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${c.chip}`}>{e.unitLabel}</span>
                    {!e.auto && <span className="text-xs text-slate-400">กำหนดเอง</span>}
                  </div>
                  <div className="mt-1 font-medium">{e.place}{e.orderNo ? <span className="ml-2 text-sm font-normal text-slate-500">คำสั่ง/หนังสือที่ {e.orderNo}</span> : null}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1 text-sm text-slate-600"><Users className="h-4 w-4" />{(e.members || []).map((m) => m.name).join(' · ')}</div>
                  {e.note && <div className="text-sm text-slate-500">หมายเหตุ: {e.note}</div>}
                </div>
                <div className="flex shrink-0 flex-col items-end justify-center gap-1 p-2">
                  <select className="input !py-1 text-sm" value={e.status} onChange={(ev) => setStatus(e, ev.target.value)} aria-label="สถานะ">{UNIT_STATUS.map((s) => <option key={s}>{s}</option>)}</select>
                  <button className="text-slate-400 hover:text-red-600" onClick={() => setDel(e)} aria-label="ลบ"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {form && <EventForm kind={kind} roster={roster} onClose={() => setForm(false)} onSaved={reload} say={say} user={userName} />}
      {edit && <RosterEditor kind={kind} roster={roster} onClose={() => setEdit(false)} onSaved={reload} say={say} />}
      {del && <ConfirmDialog message={`ลบงาน "${del.place}" (${fmtDate(del.date)})? ${del.auto ? 'ระบบจะคืนคิวให้' + del.unitLabel : ''}`} onConfirm={remove} onCancel={() => setDel(null)} />}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
