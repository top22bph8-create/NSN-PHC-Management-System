// หน้าเจ้าหน้าที่: งานคลินิกแพทย์แผนไทย > นัดจองคิวออนไลน์
// แท็บ: รายการคิว (รายวัน/เพิ่มคิวเอง/เปลี่ยนสถานะ) · ตั้งค่าคลินิก (วันเวลา/บริการ/วันหยุด) · QR Code & ลิงก์หน้าจอง
import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import QRCode from 'qrcode';
import { ArrowLeft, CalendarCheck, Copy, ExternalLink, Loader2, Phone, Plus, Printer, Save, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { canWrite } from '../lib/roles';
import { writeAudit } from '../lib/audit';
import { fmtDate, todayStr } from '../lib/thai';
import { getHolidays } from '../lib/leave';
import { THAI_ACTIVE, THAI_DEFAULT_CONFIG, THAI_STATUSES, THAI_STATUS_COLOR, getThaiConfig, saveThaiConfig, thaiPhones, thaiPublicUrl, thaiSlotTimes, thaiTimeRange, THAI_LOAD, thaiLoadClass } from '../lib/thaiClinic';
import { PageHeader } from '../components/Logo';
import ThaiDateInput from '../components/ThaiDateInput';
import { Badge, ConfirmDialog, EmptyState, ErrorState, Modal, Spinner, Toast } from '../components/ui';

const DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const addDays = (s, n) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function AddBookingModal({ date, cfg, existing, onClose, say, user }) {
  const times = useMemo(() => thaiSlotTimes(cfg), [cfg]);
  const [f, setF] = useState({ date, time: times[0]?.time || '', service: (cfg.services || [])[0] || '', name: '', phone: '', note: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const taken = existing.filter((b) => b.date === f.date && b.time === f.time && THAI_ACTIVE.includes(b.status)).length;
  const submit = async () => {
    if (f.name.trim().length < 2) return say({ type: 'error', text: 'กรุณากรอกชื่อ-สกุล' });
    setBusy(true);
    try {
      const code = `T${Math.floor(Math.random() * 900000) + 100000}`;
      const endT = times.find((t) => t.time === f.time)?.end || '';
      const data = { code, date: f.date, time: f.time, timeEnd: endT, slotKey: `${f.date}|${f.time}`, service: f.service, name: f.name.trim(), phone: f.phone.replace(/\D/g, ''), note: f.note.trim(), status: 'ยืนยันแล้ว', source: 'เจ้าหน้าที่', createdAt: serverTimestamp(), createdBy: user };
      const ref = await addDoc(collection(db, 'thaiBookings'), data);
      await writeAudit({ action: 'create', module: 'thai-booking', docId: ref.id, label: `${data.name} ${data.date} ${data.time}` });
      say({ type: 'ok', text: `เพิ่มคิวแล้ว (รหัส ${code})` });
      onClose();
    } catch (err) { say({ type: 'error', text: 'ไม่สำเร็จ: ' + (err.code || err.message) }); } finally { setBusy(false); }
  };
  return (
    <Modal title="เพิ่มคิว (จองทางโทรศัพท์ / Walk-in)" onClose={onClose}
      footer={<button className="btn btn-primary w-full" onClick={submit} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} บันทึกคิว</button>}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="mb-1 block text-sm text-slate-600">วันที่</label><ThaiDateInput value={f.date} onChange={(v) => setF({ ...f, date: v })} yearsBack={0} yearsForward={2} /></div>
          <div><label className="mb-1 block text-sm text-slate-600" htmlFor="ab-t">เวลา</label>
            <select id="ab-t" className="input" value={f.time} onChange={set('time')}>{times.map((t) => <option key={t.time} value={t.time}>{thaiTimeRange(t.time, t.end)} น.</option>)}</select></div>
        </div>
        {taken >= cfg.capacity && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800">⚠ ช่วงเวลานี้มีคิวครบจำนวนแล้ว ({taken}/{cfg.capacity}) — บันทึกซ้อนได้ ถ้าเจ้าหน้าที่รับไหว</p>}
        <div><label className="mb-1 block text-sm text-slate-600" htmlFor="ab-s">บริการ</label>
          <select id="ab-s" className="input" value={f.service} onChange={set('service')}>{(cfg.services || []).map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
        <div><label className="mb-1 block text-sm text-slate-600" htmlFor="ab-n">ชื่อ - สกุล</label><input id="ab-n" className="input" value={f.name} onChange={set('name')} /></div>
        <div><label className="mb-1 block text-sm text-slate-600" htmlFor="ab-p">เบอร์โทร</label><input id="ab-p" className="input" inputMode="tel" value={f.phone} onChange={set('phone')} /></div>
        <div><label className="mb-1 block text-sm text-slate-600" htmlFor="ab-o">อาการ / หมายเหตุ</label><textarea id="ab-o" rows={2} className="input" value={f.note} onChange={set('note')} /></div>
      </div>
    </Modal>
  );
}

function QueueTab({ cfg, writable, say, profileEmail }) {
  const [date, setDate] = useState(todayStr());
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [statusF, setStatusF] = useState('all');
  const [adding, setAdding] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [upcoming, setUpcoming] = useState([]);

  useEffect(() => {
    setRows(null); setError('');
    return onSnapshot(query(collection(db, 'thaiBookings'), where('date', '==', date)),
      (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.time).localeCompare(String(b.time)))),
      (e) => setError(e.code === 'permission-denied' ? 'ไม่มีสิทธิ์เข้าถึง (ต้องเผยแพร่ Firestore Rules เวอร์ชันล่าสุดก่อน)' : e.message));
  }, [date]);
  // จำนวนคิวที่ใช้งานอยู่ของเดือนที่เปิดดู + 7 วันข้างหน้า (ใช้ระบายสีปฏิทิน/ชิป)
  const monthStart = `${date.slice(0, 7)}-01`;
  const monthEnd = `${date.slice(0, 7)}-31`;
  useEffect(() => {
    const t = todayStr(); const t7 = addDays(t, 7);
    const lo = monthStart < t ? monthStart : t; const hi = monthEnd > t7 ? monthEnd : t7;
    return onSnapshot(query(collection(db, 'thaiBookings'), where('date', '>=', lo), where('date', '<=', hi)),
      (s) => setUpcoming(s.docs.map((d) => d.data()).filter((b) => THAI_ACTIVE.includes(b.status))), () => {});
  }, [monthStart, monthEnd]);
  const byDay = useMemo(() => { const m = {}; upcoming.forEach((b) => { m[b.date] = (m[b.date] || 0) + 1; }); return m; }, [upcoming]);
  const calCells = useMemo(() => {
    const [y, mo] = date.split('-').map(Number);
    const first = new Date(y, mo - 1, 1).getDay(); const len = new Date(y, mo, 0).getDate();
    return [...Array(first).fill(null), ...Array.from({ length: len }, (_, i) => `${date.slice(0, 7)}-${String(i + 1).padStart(2, '0')}`)];
  }, [date]);
  const shiftMonth = (n) => { const [y, mo] = date.split('-').map(Number); const d = new Date(y, mo - 1 + n, 1); setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`); };
  const pendingTotal = upcoming.filter((b) => b.status === 'รอยืนยัน' && b.date >= todayStr() && b.date <= addDays(todayStr(), 7)).length;

  const shown = (rows || []).filter((b) => statusF === 'all' || b.status === statusF);
  const setStatus = async (b, status) => {
    try {
      await updateDoc(doc(db, 'thaiBookings', b.id), { status, updatedAt: serverTimestamp(), updatedBy: profileEmail });
      await writeAudit({ action: 'update', module: 'thai-booking', docId: b.id, label: `${b.name} → ${status}` });
    } catch (err) { say({ type: 'error', text: 'ไม่สำเร็จ: ' + (err.code || err.message) }); }
  };
  const doDelete = async () => {
    try { await deleteDoc(doc(db, 'thaiBookings', toDelete.id)); await writeAudit({ action: 'delete', module: 'thai-booking', docId: toDelete.id, label: toDelete.name }); setToDelete(null); } catch (err) { say({ type: 'error', text: 'ลบไม่สำเร็จ: ' + (err.code || err.message) }); }
  };
  const active = (rows || []).filter((b) => THAI_ACTIVE.includes(b.status)).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button className="btn btn-outline !px-2 !py-1.5" onClick={() => setDate(addDays(date, -1))} aria-label="วันก่อนหน้า">‹</button>
        <div className="w-44"><ThaiDateInput value={date} onChange={(v) => v && setDate(v)} yearsBack={1} yearsForward={2} /></div>
        <button className="btn btn-outline !px-2 !py-1.5" onClick={() => setDate(addDays(date, 1))} aria-label="วันถัดไป">›</button>
        <button className="btn btn-outline !py-1.5" onClick={() => setDate(todayStr())}>วันนี้</button>
        <select className="input !w-auto" value={statusF} onChange={(e) => setStatusF(e.target.value)} aria-label="สถานะ">
          <option value="all">สถานะ: ทั้งหมด</option>{THAI_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {writable && <button className="btn btn-primary ml-auto" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> เพิ่มคิว</button>}
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5 text-sm">
        {Array.from({ length: 8 }, (_, i) => addDays(todayStr(), i)).map((d) => (
          <button key={d} onClick={() => setDate(d)} className={`rounded-full px-3 py-1 font-medium ring-1 ${byDay[d] ? thaiLoadClass(byDay[d]) : 'bg-white text-slate-600 ring-slate-200 hover:bg-emerald-50'} ${d === date ? 'outline outline-2 outline-offset-2 outline-slate-800' : ''}`}>
            {d === todayStr() ? 'วันนี้' : fmtDate(d).slice(0, 5)} · {byDay[d] || 0} คิว
          </button>
        ))}
        {pendingTotal > 0 && <span className="ml-auto rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-800">รอยืนยัน {pendingTotal} คิว (7 วันนี้)</span>}
      </div>

      <div className="card mb-3 p-3">
        <div className="mb-2 flex items-center gap-2">
          <button className="btn btn-outline !px-2 !py-1" onClick={() => shiftMonth(-1)} aria-label="เดือนก่อนหน้า">‹</button>
          <b className="min-w-36 text-center">{new Date(`${date.slice(0, 7)}-01T00:00:00`).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}</b>
          <button className="btn btn-outline !px-2 !py-1" onClick={() => shiftMonth(1)} aria-label="เดือนถัดไป">›</button>
          <div className="ml-auto flex flex-wrap gap-1.5 text-xs">
            {THAI_LOAD.map((l) => <span key={l.n} className={`rounded-full px-2 py-0.5 ring-1 ${l.cls}`}>{l.label}</span>)}
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500">{['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map((d) => <div key={d}>{d}</div>)}</div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {calCells.map((d, i) => d ? (
            <button key={d} onClick={() => setDate(d)} aria-label={`${fmtDate(d)} ${byDay[d] || 0} คิว`} title={`${byDay[d] || 0} คิว`}
              className={`rounded-lg py-1.5 text-sm font-semibold ring-1 ${byDay[d] ? thaiLoadClass(byDay[d]) : 'bg-white text-slate-600 ring-slate-200 hover:bg-emerald-50'} ${d === date ? 'outline outline-2 outline-offset-1 outline-slate-800' : ''} ${d === todayStr() ? 'underline' : ''}`}>
              {Number(d.slice(8))}{byDay[d] ? <span className="block text-[10px] font-normal leading-none">{byDay[d]} คิว</span> : null}
            </button>
          ) : <div key={`e${i}`} />)}
        </div>
      </div>

      <div className="card overflow-x-auto">
        {error ? <ErrorState message={error} /> : rows === null ? <Spinner /> : shown.length === 0 ? <EmptyState title="ไม่มีคิวในวันนี้" hint="คิวที่ประชาชนจองออนไลน์จะแสดงที่นี่อัตโนมัติ" /> : (
          <table className="w-full min-w-[820px] text-left">
            <thead className="bg-slate-100 text-sm text-slate-600"><tr>
              <th className="w-32 px-3 py-2">เวลา</th><th className="px-3 py-2">ชื่อ - สกุล</th><th className="px-3 py-2">โทร</th><th className="px-3 py-2">บริการ / อาการ</th><th className="w-36 px-3 py-2">สถานะ</th>{writable && <th className="w-12" />}
            </tr></thead>
            <tbody>
              {shown.map((b) => (
                <tr key={b.id} className={`border-t border-slate-100 align-top ${b.status === 'ยกเลิก' ? 'opacity-60' : ''}`}>
                  <td className="px-3 py-2 font-bold text-emerald-800 whitespace-nowrap">{thaiTimeRange(b.time, b.timeEnd)}</td>
                  <td className="px-3 py-2"><div className="font-medium">{b.name}</div><div className="text-xs text-slate-400">{b.code} · {b.source === 'online' ? 'จองออนไลน์' : b.source}</div></td>
                  <td className="px-3 py-2 text-sm">{b.phone ? <a className="inline-flex items-center gap-1 text-brand-700 underline" href={`tel:${b.phone}`}><Phone className="h-3.5 w-3.5" />{b.phone}</a> : '-'}</td>
                  <td className="px-3 py-2 text-sm text-slate-600">{b.service}{b.note && <div className="text-xs text-slate-400">{b.note}</div>}</td>
                  <td className="px-3 py-2">
                    {writable ? (
                      <select className={`rounded-full px-2 py-1 text-sm font-semibold ${THAI_STATUS_COLOR[b.status] || ''}`} value={b.status} onChange={(e) => setStatus(b, e.target.value)} aria-label={`สถานะของ ${b.name}`}>
                        {THAI_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : <Badge className={THAI_STATUS_COLOR[b.status]}>{b.status}</Badge>}
                  </td>
                  {writable && <td className="px-2 py-2"><button className="btn btn-outline !px-2 !py-1 text-red-600" onClick={() => setToDelete(b)} aria-label={`ลบ ${b.name}`}><Trash2 className="h-4 w-4" /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-2 text-sm text-slate-500">วันนี้ที่เลือก: คิวที่ยังรับบริการ {active} คิว · ทั้งหมด {rows?.length ?? 0} รายการ</p>
      {adding && <AddBookingModal date={date} cfg={cfg} existing={rows || []} onClose={() => setAdding(false)} say={say} user={profileEmail} />}
      {toDelete && <ConfirmDialog message={`ลบคิวของ "${toDelete.name}" (${thaiTimeRange(toDelete.time, toDelete.timeEnd)}) ออกถาวรหรือไม่?`} onConfirm={doDelete} onCancel={() => setToDelete(null)} />}
    </div>
  );
}

function SettingsTab({ cfg, writable, say, onSaved }) {
  const [c, setC] = useState(cfg);
  const [servicesText, setServicesText] = useState((cfg.services || []).join('\n'));
  const [newClosed, setNewClosed] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setC({ ...c, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const toggleDay = (i) => setC({ ...c, openDays: c.openDays.includes(i) ? c.openDays.filter((x) => x !== i) : [...c.openDays, i].sort() });
  const slots = useMemo(() => thaiSlotTimes(c), [c]);
  const setSlot = (i, patch) => setC({ ...c, slots: c.slots.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
  const toMinStr = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
  const save = async () => {
    const services = servicesText.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!services.length) return say({ type: 'error', text: 'ต้องมีบริการอย่างน้อย 1 รายการ' });
    if (!slots.length) return say({ type: 'error', text: 'ช่วงเวลาที่ตั้งไม่มีคิวให้จองเลย ตรวจเวลาเปิด-ปิด/ช่วงพัก' });
    setBusy(true);
    try {
      const out = { ...c, services, closedDates: [...new Set(c.closedDates)].sort() };
      await saveThaiConfig(out);
      await writeAudit({ action: 'settings', module: 'thai-booking', label: 'ตั้งค่าคลินิกแพทย์แผนไทย' });
      onSaved(out); say({ type: 'ok', text: 'บันทึกการตั้งค่าแล้ว (หน้าจองของประชาชนอัปเดตทันที)' });
    } catch (err) { say({ type: 'error', text: 'ไม่สำเร็จ: ' + (err.code || err.message) }); } finally { setBusy(false); }
  };
  const importHolidays = async () => {
    const list = await getHolidays().catch(() => []);
    setC((p) => ({ ...p, closedDates: [...new Set([...p.closedDates, ...list.map((h) => h.date).filter((d) => d >= todayStr())])] }));
  };
  const lbl = 'mb-1 block text-sm font-medium text-slate-600';
  return (
    <fieldset disabled={!writable} className="space-y-5">
      <section className="card space-y-3 p-4">
        <label className="flex items-center gap-2 font-semibold"><input type="checkbox" className="h-5 w-5" checked={!!c.enabled} onChange={set('enabled')} /> เปิดรับจองออนไลน์</label>
        <div>
          <p className={lbl}>วันที่เปิดให้บริการ</p>
          <div className="flex flex-wrap gap-2">{DAYS.map((d, i) => (
            <button type="button" key={d} onClick={() => toggleDay(i)} className={`rounded-full px-3 py-1.5 text-sm ${c.openDays.includes(i) ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{d}</button>
          ))}</div>
        </div>
        <div>
          <p className={lbl}>ช่วงเวลาให้จอง (แต่ละช่วงรับตามจำนวนคิวด้านล่าง)</p>
          <div className="space-y-2">
            {(c.slots || []).map((sl, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <span className="w-14 text-sm text-slate-500">{toMinStr(sl.start) >= 720 ? 'บ่าย' : 'เช้า'}</span>
                <input type="time" className="input !w-40" value={sl.start} onChange={(e) => setSlot(i, { start: e.target.value })} aria-label={`ช่วงที่ ${i + 1} เริ่ม`} />
                <span>ถึง</span>
                <input type="time" className="input !w-40" value={sl.end} onChange={(e) => setSlot(i, { end: e.target.value })} aria-label={`ช่วงที่ ${i + 1} สิ้นสุด`} />
                <button type="button" className="btn btn-outline !px-2 !py-1 text-red-600" onClick={() => setC({ ...c, slots: c.slots.filter((_, k) => k !== i) })} aria-label="ลบช่วงเวลา"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-outline mt-2" onClick={() => setC({ ...c, slots: [...(c.slots || []), { start: '15:30', end: '16:30' }] })}><Plus className="h-4 w-4" /> เพิ่มช่วงเวลา</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div><label className={lbl}>รับได้กี่คิว/ช่วงเวลา</label><input type="number" min="1" max="20" className="input" value={c.capacity} onChange={set('capacity')} /></div>
          <div><label className={lbl}>จองล่วงหน้าได้ (วัน)</label><input type="number" min="1" max="120" className="input" value={c.maxAdvanceDays} onChange={set('maxAdvanceDays')} /></div>
          <div><label className={lbl}>ต้องจองก่อนถึงเวลา (นาที)</label><input type="number" min="0" max="1440" className="input" value={c.minLeadMinutes} onChange={set('minLeadMinutes')} /></div>
          <div><label className={lbl}>จองค้างได้ต่อ 1 เบอร์ (คิว)</label><input type="number" min="1" max="10" className="input" value={c.maxActivePerPhone} onChange={set('maxActivePerPhone')} /></div>
        </div>
        <p className="text-xs text-slate-500">ช่วงที่เปิดจอง ({slots.length} ช่วง/วัน): {slots.map((x) => thaiTimeRange(x.time, x.end)).join(', ') || '— ไม่มี —'}</p>
      </section>

      <section className="card space-y-3 p-4">
        <p className="font-semibold">วันหยุด/วันปิดคลินิก</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={c.closeOnHolidays !== false} onChange={set('closeOnHolidays')} /> ปิดตามวันหยุดราชการที่ตั้งไว้ในระบบวันลา (ถ้ามีการบันทึกไว้ในตั้งค่าระบบ)</label>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-48"><ThaiDateInput value={newClosed} onChange={setNewClosed} yearsBack={0} yearsForward={2} /></div>
          <button type="button" className="btn btn-outline" onClick={() => { if (newClosed) { setC({ ...c, closedDates: [...new Set([...c.closedDates, newClosed])] }); setNewClosed(''); } }}>เพิ่มวันปิด</button>
          <button type="button" className="btn btn-outline" onClick={importHolidays}>ดึงวันหยุดราชการจากระบบวันลา</button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {c.closedDates.filter((d) => d >= todayStr()).sort().map((d) => (
            <span key={d} className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-sm text-rose-800">{fmtDate(d)}<button type="button" aria-label="ลบวันปิด" onClick={() => setC({ ...c, closedDates: c.closedDates.filter((x) => x !== d) })}><X className="h-3.5 w-3.5" /></button></span>
          ))}
          {c.closedDates.filter((d) => d >= todayStr()).length === 0 && <span className="text-sm text-slate-400">ยังไม่มีวันปิดพิเศษ</span>}
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><label className={lbl}>ชื่อผู้ให้บริการ</label><input className="input" value={c.providerName} onChange={set('providerName')} /></div>
          <div><label className={lbl}>ตำแหน่ง</label><input className="input" value={c.providerTitle} onChange={set('providerTitle')} /></div>
          <div><label className={lbl}>เบอร์โทรสอบถาม</label><input className="input" inputMode="tel" value={c.phone} onChange={set('phone')} /></div>
          <div><label className={lbl}>เบอร์โทรจองคิว</label><input className="input" inputMode="tel" value={c.bookingPhone || ''} onChange={set('bookingPhone')} /></div>
        </div>
        <div>
          <label className={lbl}>LINE OA ID ของระบบ (เช่น @123abcde) — ใช้ทำปุ่ม "รับข้อความยืนยันทางไลน์" หลังจอง</label>
          <input className="input" placeholder="@xxxxxxxx" value={c.lineOaId || ''} onChange={set('lineOaId')} />
          <p className="mt-1 text-xs text-slate-500">ดูได้ที่ LINE Official Account Manager → หน้าแรก (Basic ID ขึ้นต้นด้วย @) ถ้าเว้นว่าง ผู้จองจะไม่เห็นปุ่มนี้</p>
        </div>
        <div><label className={lbl}>รายการบริการ (1 บรรทัด = 1 บริการ)</label><textarea rows={6} className="input" value={servicesText} onChange={(e) => setServicesText(e.target.value)} /></div>
        <div><label className={lbl}>ประกาศบนหน้าจอง (ถ้ามี เช่น ปิดปรับปรุง/ข้อควรปฏิบัติ)</label><textarea rows={2} className="input" value={c.notice} onChange={set('notice')} /></div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={!!c.dailySummary} onChange={set('dailySummary')} /><span>ส่งสรุปคิวของวันนี้เข้าไลน์กลุ่มแพทย์แผนไทยทุกเช้า 07:30 (ใช้โควตาไลน์ 1 ข้อความต่อวันที่มีคิว) — การแจ้งเตือนเมื่อมีผู้จอง/ยกเลิกส่งทันทีอยู่แล้ว</span></label>
      </section>
      {writable && <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} บันทึกการตั้งค่า</button>}
    </fieldset>
  );
}

function QrTab({ cfg }) {
  const url = thaiPublicUrl();
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => { QRCode.toDataURL(url, { width: 480, margin: 1, errorCorrectionLevel: 'M' }).then(setQr); }, [url]);
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ } };
  return (
    <div className="grid gap-4 md:grid-cols-[auto_1fr]">
      <div className="card flex flex-col items-center p-4">
        {qr ? <img src={qr} alt="QR Code หน้าจองคิวแพทย์แผนไทย" className="h-56 w-56" /> : <Spinner />}
        <p className="mt-2 text-center text-sm font-semibold text-emerald-800">สแกนเพื่อจองคิวแพทย์แผนไทย</p>
        <p className="text-xs text-slate-500">{thaiPhones(cfg).map(([l, n]) => `${l} ${n}`).join(' · ')}</p>
      </div>
      <div className="card space-y-3 p-4 text-sm">
        <p className="font-semibold text-slate-700">ลิงก์หน้าจองสำหรับประชาชน (ไม่ต้องล็อกอิน)</p>
        <input readOnly className="input" value={url} onFocus={(e) => e.target.select()} aria-label="ลิงก์หน้าจอง" />
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-outline" onClick={copy}><Copy className="h-4 w-4" /> {copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}</button>
          <a className="btn btn-outline" href={url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> เปิดดูหน้าจอง</a>
          <a className="btn btn-primary" href={`${window.location.origin}${window.location.pathname}#/print-thai-qr`} target="_blank" rel="noreferrer"><Printer className="h-4 w-4" /> พิมพ์ป้าย QR (A4)</a>
        </div>
        <ul className="list-disc pl-5 text-slate-500">
          <li>ติดป้าย QR ที่คลินิก/บอร์ดประชาสัมพันธ์ หรือส่งลิงก์ให้ อสม. แชร์ในกลุ่มไลน์หมู่บ้าน</li>
          <li>ผู้จองได้รหัสการจอง และตรวจสอบ/ยกเลิกเองได้ด้วยรหัส + เบอร์โทร</li>
          <li>เมื่อมีผู้จองหรือยกเลิก ระบบแจ้งเข้าไลน์กลุ่มแพทย์แผนไทย (ตั้ง Target ID ที่เมนู ตั้งค่าระบบ)</li>
        </ul>
      </div>
    </div>
  );
}

export default function ThaiBooking() {
  const { profile } = useAuth();
  const writable = canWrite(profile.role, 'thai-booking');
  const [tab, setTab] = useState('queue');
  const [cfg, setCfg] = useState(null);
  const [toast, setToast] = useState(null);
  const say = (t) => { setToast(t); setTimeout(() => setToast(null), 4500); };
  useEffect(() => { getThaiConfig().then(setCfg).catch(() => setCfg(THAI_DEFAULT_CONFIG)); }, []);

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-6">
      <Link to="/group/thai" className="mb-2 inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"><ArrowLeft className="h-4 w-4" /> กลับหน้ากลุ่มงาน</Link>
      <PageHeader emoji="🌿" big tone="from-emerald-700 via-teal-600 to-emerald-500" title="ระบบจองคิวบริการแพทย์แผนไทย" subtitle={`คลินิกแพทย์แผนไทย · ${cfg?.providerName || ''} ${cfg?.providerTitle || ''} · ${thaiPhones(cfg).map(([l, n]) => `${l} ${n}`).join(' · ')}`} />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {[['queue', '📋 รายการคิว'], ['settings', '⚙️ ตั้งค่าคลินิก'], ['qr', '📱 QR Code / ลิงก์จอง']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-emerald-700 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-emerald-50'}`}>{l}</button>
        ))}
      </div>
      {!cfg ? <Spinner /> : tab === 'queue' ? <QueueTab cfg={cfg} writable={writable} say={say} profileEmail={profile.email} />
        : tab === 'settings' ? <SettingsTab cfg={cfg} writable={writable} say={say} onSaved={setCfg} /> : <QrTab cfg={cfg} />}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
