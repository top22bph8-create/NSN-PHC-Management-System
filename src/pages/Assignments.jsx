import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { CalendarClock, ChevronLeft, ChevronRight, Loader2, MapPin, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { canWrite } from '../lib/roles';
import { writeAudit } from '../lib/audit';
import { ASSIGNMENT_TYPES, ASSIGNMENT_TYPE_OTHER, assignmentTypeColor } from '../lib/assignments';
import { sortPeople } from '../lib/leave';
import { fmtDate, thMonths, todayStr } from '../lib/thai';
import { Badge, ConfirmDialog, EmptyState, ErrorState, Modal, Spinner, Toast } from '../components/ui';
import { PageHeader } from '../components/Logo';
import ThaiDateInput from '../components/ThaiDateInput';

const thWeekday = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'][new Date(y, m - 1, d).getDay()];
};

function AssignmentForm({ item, people, profile, onClose, say }) {
  const isOther = item && item.type && !ASSIGNMENT_TYPES.includes(item.type);
  const [f, setF] = useState({
    date: item?.date || todayStr(),
    typeSel: isOther ? ASSIGNMENT_TYPE_OTHER : (item?.type || ASSIGNMENT_TYPES[0]),
    typeOther: isOther ? item.type : '',
    title: item?.title || '',
    time: item?.time || '',
    location: item?.location || '',
    note: item?.note || '',
  });
  const [assignees, setAssignees] = useState(() => new Set((item?.assignees || []).map((p) => p.email)));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const setDate = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  const toggle = (email) => setAssignees((s) => { const n = new Set(s); n.has(email) ? n.delete(email) : n.add(email); return n; });

  const submit = async (e) => {
    e.preventDefault();
    const type = f.typeSel === ASSIGNMENT_TYPE_OTHER ? f.typeOther.trim() : f.typeSel;
    if (!type) return say({ type: 'error', text: 'กรุณาระบุประเภทงาน' });
    if (!f.title.trim()) return say({ type: 'error', text: 'กรุณากรอกเรื่อง/รายละเอียดงาน' });
    if (assignees.size === 0) return say({ type: 'error', text: 'กรุณาเลือกผู้ปฏิบัติงานอย่างน้อย 1 คน' });
    setBusy(true);
    try {
      const picked = people.filter((p) => assignees.has(p.email)).map((p) => ({ email: p.email, name: p.name || p.email, position: p.position || '' }));
      const data = {
        date: f.date, type, title: f.title.trim(), time: f.time.trim(), location: f.location.trim(), note: f.note.trim(),
        assignees: picked, createdBy: profile.email, createdByName: profile.name || profile.email,
      };
      if (item) {
        await updateDoc(doc(db, 'assignments', item.id), data);
        await writeAudit({ action: 'update', module: 'assignments', docId: item.id, label: `${data.date} ${data.type} ${data.title}`, before: { type: item.type, title: item.title, date: item.date }, after: { type: data.type, title: data.title, date: data.date } });
        say({ type: 'ok', text: 'แก้ไขการมอบหมายงานแล้ว' });
      } else {
        const ref = await addDoc(collection(db, 'assignments'), data);
        await writeAudit({ action: 'create', module: 'assignments', docId: ref.id, label: `${data.date} ${data.type} ${data.title}`, after: { type: data.type, title: data.title, date: data.date } });
        say({ type: 'ok', text: 'บันทึกการมอบหมายงานแล้ว จะแจ้งเตือนเข้าไลน์กลุ่มอัตโนมัติเวลา 06:00 น. ของวันที่ปฏิบัติงาน' });
      }
      onClose();
    } catch (err) {
      say({ type: 'error', text: 'ไม่สำเร็จ: ' + (err.code || err.message) });
    } finally { setBusy(false); }
  };

  return (
    <Modal title={item ? 'แก้ไขการมอบหมายงาน' : 'เพิ่มการมอบหมายงาน'} wide onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className="mb-1 block text-sm text-slate-600" htmlFor="ad">วันที่ปฏิบัติงาน</label><ThaiDateInput id="ad" required value={f.date} onChange={setDate('date')} /></div>
          <div><label className="mb-1 block text-sm text-slate-600" htmlFor="at">เวลา (ไม่บังคับ)</label><input id="at" placeholder="เช่น 08.30 น." className="input" value={f.time} onChange={set('time')} /></div>
          <div><label className="mb-1 block text-sm text-slate-600" htmlFor="al">สถานที่ (ไม่บังคับ)</label><input id="al" className="input" value={f.location} onChange={set('location')} /></div>
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-600" htmlFor="atype">ประเภทงาน</label>
          <select id="atype" className="input" value={f.typeSel} onChange={set('typeSel')}>{ASSIGNMENT_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          {f.typeSel === ASSIGNMENT_TYPE_OTHER && (
            <input className="input mt-2" placeholder="พิมพ์ประเภทงานเอง เช่น ออกหน่วยเยี่ยมบ้าน" value={f.typeOther} onChange={set('typeOther')} />
          )}
        </div>
        <div><label className="mb-1 block text-sm text-slate-600" htmlFor="atitle">เรื่อง/รายละเอียดงาน</label><textarea id="atitle" required rows={2} className="input" value={f.title} onChange={set('title')} /></div>
        <div>
          <label className="mb-1 block text-sm text-slate-600">มอบหมายให้ (เลือกได้หลายคน)</label>
          <div className="grid max-h-48 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2 sm:grid-cols-2">
            {people.map((p) => (
              <label key={p.email} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-brand-50">
                <input type="checkbox" className="h-4 w-4" checked={assignees.has(p.email)} onChange={() => toggle(p.email)} />
                <span className="truncate">{p.name || p.email}{p.position ? ` (${p.position})` : ''}</span>
              </label>
            ))}
          </div>
        </div>
        <div><label className="mb-1 block text-sm text-slate-600" htmlFor="anote">หมายเหตุ (ไม่บังคับ)</label><input id="anote" className="input" value={f.note} onChange={set('note')} /></div>
        <p className="text-xs text-slate-500">ระบบจะแจ้งเตือนเข้าไลน์กลุ่มอัตโนมัติเวลา 06:00 น. ของวันที่ปฏิบัติงาน (ต้องเปิดใช้งานแจ้งเตือนไลน์และติ๊กหัวข้อ "ปฏิทินมอบหมายงาน" ที่หน้าตั้งค่าระบบไว้ก่อน)</p>
        <button className="btn btn-primary w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} บันทึก</button>
      </form>
    </Modal>
  );
}

export default function Assignments() {
  const { profile } = useAuth();
  const writable = canWrite(profile.role, 'assignments');
  const [ym, setYm] = useState(todayStr().slice(0, 7));
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [people, setPeople] = useState(null);
  const [form, setForm] = useState(null); // null | true (new) | item (edit)
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [toast, setToast] = useState(null);
  const say = (t) => { setToast(t); setTimeout(() => setToast(null), 4000); };

  useEffect(() => {
    setRows(null); setError('');
    const start = `${ym}-01`;
    const end = `${ym}-31`;
    return onSnapshot(query(collection(db, 'assignments'), where('date', '>=', start), where('date', '<=', end)),
      (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))),
      (e) => setError(e.message));
  }, [ym]);
  useEffect(() => {
    return onSnapshot(collection(db, 'users'),
      (s) => setPeople(sortPeople(s.docs.map((d) => d.data()).filter((u) => u.role !== 'pending'))),
      () => setPeople([]));
  }, []);

  const list = useMemo(() => (mineOnly ? (rows || []).filter((a) => (a.assignees || []).some((p) => p.email === profile.email)) : rows || []), [rows, mineOnly, profile.email]);

  const shiftMonth = (delta) => {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setYm(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  // ปฏิทินไทย: เลือกเดือน/ปีด้วยชื่อเดือนไทย + พ.ศ. แทน input type=month ของเบราว์เซอร์ (ซึ่งแสดงผลเป็นปฏิทินอังกฤษ/คริสต์ศักราช)
  const [ymYear, ymMonth] = ym.split('-').map(Number);
  const setMonthSel = (newM) => setYm(`${ymYear}-${String(newM).padStart(2, '0')}`);
  const setYearSelBE = (newYearBE) => setYm(`${newYearBE - 543}-${String(ymMonth).padStart(2, '0')}`);
  const nowYearBE = new Date().getFullYear() + 543;
  const yearOptionsBE = Array.from({ length: 6 }, (_, i) => nowYearBE - 2 + i);

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'assignments', toDelete.id));
      await writeAudit({ action: 'delete', module: 'assignments', docId: toDelete.id, label: `${toDelete.date} ${toDelete.type} ${toDelete.title}`, before: { type: toDelete.type, title: toDelete.title, date: toDelete.date } });
      say({ type: 'ok', text: 'ลบการมอบหมายงานแล้ว' });
      setToDelete(null);
    } catch (err) { say({ type: 'error', text: 'ไม่สำเร็จ: ' + (err.code || err.message) }); } finally { setDeleting(false); }
  };

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-6">
      <PageHeader icon={CalendarClock} emoji="🗂️" title="ปฏิทินมอบหมายงาน" subtitle="ลงเรื่องมอบหมายงานล่วงหน้า ระบบแจ้งเตือนเข้าไลน์กลุ่มอัตโนมัติ 06:00 น. ของวันปฏิบัติงาน"
        actions={writable && <button className="btn btn-primary" onClick={() => setForm(true)}><Plus className="h-5 w-5" /> เพิ่มการมอบหมายงาน</button>} />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button className="btn btn-outline !px-2 !py-1.5" onClick={() => shiftMonth(-1)} aria-label="เดือนก่อนหน้า"><ChevronLeft className="h-4 w-4" /></button>
          <select className="input !w-auto" value={ymMonth} onChange={(e) => setMonthSel(Number(e.target.value))} aria-label="เดือน">
            {thMonths.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
          </select>
          <select className="input !w-auto" value={ymYear + 543} onChange={(e) => setYearSelBE(Number(e.target.value))} aria-label="ปี พ.ศ.">
            {(yearOptionsBE.includes(ymYear + 543) ? yearOptionsBE : [...yearOptionsBE, ymYear + 543].sort((a, b) => a - b)).map((yb) => <option key={yb} value={yb}>{yb}</option>)}
          </select>
          <button className="btn btn-outline !px-2 !py-1.5" onClick={() => shiftMonth(1)} aria-label="เดือนถัดไป"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" className="h-4 w-4" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> เฉพาะงานที่มอบหมายให้ฉัน
        </label>
      </div>

      <div className="space-y-3">
        {error ? <ErrorState message={error} /> : rows === null || people === null ? <Spinner /> : list.length === 0 ? (
          <EmptyState title="ยังไม่มีการมอบหมายงานในเดือนนี้" />
        ) : list.map((a) => (
          <div key={a.id} className="card p-3 sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex w-14 flex-none flex-col items-center rounded-lg bg-brand-50 py-1.5 text-brand-800">
                  <div className="text-xs">{thWeekday(a.date)}</div>
                  <div className="text-lg font-bold leading-none">{a.date.slice(8, 10)}</div>
                  <div className="text-[11px]">{fmtDate(a.date).split('/').slice(1).join('/')}</div>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge className={assignmentTypeColor(a.type)}>{a.type}</Badge>
                    {a.time && <span className="text-sm text-slate-500">{a.time}</span>}
                  </div>
                  <div className="mt-0.5 font-medium text-slate-800">{a.title}</div>
                  {a.location && <div className="mt-0.5 flex items-center gap-1 text-sm text-slate-500"><MapPin className="h-3.5 w-3.5" /> {a.location}</div>}
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-sm text-slate-600"><Users className="h-4 w-4 text-brand-500" /> {(a.assignees || []).map((p) => p.name).join(', ')}</div>
                  {a.note && <div className="mt-1 text-sm text-slate-500">หมายเหตุ: {a.note}</div>}
                </div>
              </div>
              {writable && (
                <div className="flex shrink-0 gap-1">
                  <button className="btn btn-outline !px-2 !py-1 text-sm" onClick={() => setForm(a)}><Pencil className="h-4 w-4" /></button>
                  <button className="btn btn-outline !px-2 !py-1 text-sm text-red-600" onClick={() => setToDelete(a)}><Trash2 className="h-4 w-4" /></button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {form && people && <AssignmentForm item={form === true ? null : form} people={people} profile={profile} onClose={() => setForm(null)} say={say} />}
      {toDelete && (
        <ConfirmDialog
          message={`ลบการมอบหมายงาน "${toDelete.title}" วันที่ ${fmtDate(toDelete.date)} ใช่หรือไม่?`}
          busy={deleting} onConfirm={remove} onCancel={() => setToDelete(null)}
        />
      )}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
