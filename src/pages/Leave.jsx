import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { CalendarDays, Check, ChevronLeft, Download, Loader2, Plus, User, Users, X } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useFiscalYear } from '../context/FiscalYearContext';
import { can } from '../lib/roles';
import { writeAudit } from '../lib/audit';
import { LEAVE_STATUS_COLORS, LEAVE_TYPES, getQuota, usage, workingDays } from '../lib/leave';
import { exportXlsx } from '../lib/exportFile';
import { fiscalYearBE, fmtDate, todayStr } from '../lib/thai';
import { Badge, EmptyState, ErrorState, Modal, Spinner, Toast } from '../components/ui';
import { PageHeader } from '../components/Logo';

// การ์ดโควตา/สถิติการลาของบุคคลใดบุคคลหนึ่ง (ใช้ทั้งของตัวเองด้านบน และในแดชบอร์ดรายบุคคล)
function QuotaGrid({ quota, used, pending }) {
  if (!quota) return null;
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Object.entries(quota).map(([type, q]) => {
        const u = used[type] || 0; const p = pending[type] || 0;
        const pct = q ? Math.min(100, ((u + p) / q) * 100) : 0;
        return (
          <div key={type} className="card p-3">
            <div className="text-sm text-slate-500">{type}</div>
            <div className="text-2xl font-bold text-brand-800">{Math.max(0, q - u)} <span className="text-sm font-normal text-slate-500">/ {q} วัน คงเหลือ</span></div>
            <div className="mt-1 h-2 overflow-hidden rounded bg-brand-100"><div className="h-2 rounded bg-brand-500" style={{ width: `${pct}%` }} /></div>
            <div className="mt-1 text-xs text-slate-500">ใช้แล้ว {u}{p ? ` · รออนุมัติ ${p}` : ''}</div>
          </div>
        );
      })}
    </div>
  );
}

function LeaveForm({ profile, quota, mine, pageFy, onClose, say }) {
  const [f, setF] = useState({ type: LEAVE_TYPES[0], start: todayStr(), end: todayStr(), days: 1, reason: '', contact: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => {
    const v = e.target.value;
    setF((p) => {
      const n = { ...p, [k]: v };
      if (k === 'start' && n.end < v) n.end = v;
      if (k === 'start' || k === 'end') n.days = workingDays(n.start, n.end);
      return n;
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    const days = Number(f.days);
    if (!(days > 0)) return say({ type: 'error', text: 'จำนวนวันลาต้องมากกว่า 0 (วันที่เลือกอาจตรงกับเสาร์-อาทิตย์)' });
    if (f.end < f.start) return say({ type: 'error', text: 'วันที่สิ้นสุดต้องไม่ก่อนวันเริ่มลา' });
    const fy = fiscalYearBE(f.start);
    if (fiscalYearBE(f.end) !== fy) return say({ type: 'error', text: 'ช่วงลาคร่อมปีงบประมาณ กรุณาแยกยื่นเป็น 2 ใบ (ก่อน/หลัง 1 ตุลาคม)' });
    if (fy !== pageFy) return say({ type: 'error', text: `ช่วงลานี้อยู่ในปีงบประมาณ ${fy} กรุณาเลือกปีงบประมาณ ${fy} ที่มุมขวาบนก่อนยื่นใบลา` });
    const { used, pending } = usage(mine.filter((l) => l.fy === fy));
    const q = quota[f.type];
    if (q != null && (used[f.type] || 0) + (pending[f.type] || 0) + days > q) {
      return say({ type: 'error', text: `เกินสิทธิ์${f.type}ประจำปี ${q} วัน (ใช้/รออนุมัติแล้ว ${(used[f.type] || 0) + (pending[f.type] || 0)} วัน)` });
    }
    setBusy(true);
    try {
      const data = {
        userEmail: profile.email, name: profile.name || profile.email, position: profile.position || '',
        type: f.type, start: f.start, end: f.end, days, reason: f.reason.trim(), contact: f.contact.trim(),
        fy, status: 'รอพิจารณา', createdAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'leaves'), data);
      await writeAudit({ action: 'create', module: 'leave', docId: ref.id, label: `${data.name} ${f.type} ${days} วัน`, after: { type: f.type, start: f.start, end: f.end, days } });
      say({ type: 'ok', text: 'ยื่นใบลาแล้ว รอผู้อำนวยการพิจารณา' });
      onClose();
    } catch (err) {
      say({ type: 'error', text: 'ไม่สำเร็จ: ' + (err.code || err.message) });
    } finally { setBusy(false); }
  };

  return (
    <Modal title="ยื่นใบลา" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div><label className="mb-1 block text-sm text-slate-600" htmlFor="lt">ประเภทการลา</label>
          <select id="lt" className="input" value={f.type} onChange={set('type')}>{LEAVE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className="mb-1 block text-sm text-slate-600" htmlFor="ls">ตั้งแต่วันที่</label><input id="ls" type="date" required className="input" value={f.start} onChange={set('start')} /></div>
          <div><label className="mb-1 block text-sm text-slate-600" htmlFor="le">ถึงวันที่</label><input id="le" type="date" required min={f.start} className="input" value={f.end} onChange={set('end')} /></div>
          <div><label className="mb-1 block text-sm text-slate-600" htmlFor="ld">จำนวนวัน</label><input id="ld" type="number" step="0.5" min="0.5" required className="input" value={f.days} onChange={set('days')} /></div>
        </div>
        <p className="text-xs text-slate-500">นับเฉพาะวันจันทร์-ศุกร์ อัตโนมัติ (ปรับเป็น 0.5 ได้กรณีลาครึ่งวัน) วันหยุดนักขัตฤกษ์ให้ปรับจำนวนวันเอง</p>
        <div><label className="mb-1 block text-sm text-slate-600" htmlFor="lr">เหตุผลการลา</label><textarea id="lr" required rows={2} className="input" value={f.reason} onChange={set('reason')} /></div>
        <div><label className="mb-1 block text-sm text-slate-600" htmlFor="lc">ติดต่อได้ที่ (เบอร์โทร/ที่อยู่ ระหว่างลา)</label><input id="lc" className="input" value={f.contact} onChange={set('contact')} /></div>
        <button className="btn btn-primary w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} ยื่นใบลา</button>
      </form>
    </Modal>
  );
}

function DecideModal({ leave, decision, onClose, say, by }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      await updateDoc(doc(db, 'leaves', leave.id), { status: decision, decidedBy: by, decidedAt: serverTimestamp(), decisionNote: note.trim() });
      await writeAudit({ action: 'update', module: 'leave', docId: leave.id, label: `${leave.name} ${leave.type}`, before: { status: leave.status }, after: { status: decision } });
      say({ type: 'ok', text: `บันทึกผล: ${decision}` });
      onClose();
    } catch (err) {
      say({ type: 'error', text: 'ไม่สำเร็จ: ' + (err.code || err.message) });
    } finally { setBusy(false); }
  };
  return (
    <Modal title={`${decision}: ${leave.name}`} onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose}>ยกเลิก</button><button className={`btn ${decision === 'อนุมัติ' ? 'btn-primary' : 'btn-danger'}`} onClick={go} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} ยืนยัน{decision}</button></>}>
      <p className="mb-2">{leave.type} {fmtDate(leave.start)} - {fmtDate(leave.end)} ({leave.days} วัน)</p>
      <label className="mb-1 block text-sm text-slate-600" htmlFor="dn">หมายเหตุ (ไม่บังคับ)</label>
      <input id="dn" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
    </Modal>
  );
}

function PersonDashboard({ person, rows, quota, fy, canFileForOthers, isSelf, onBack, say }) {
  const [form, setForm] = useState(false);
  const mine = useMemo(() => rows.filter((l) => l.userEmail === person.email), [rows, person.email]);
  const { used, pending } = useMemo(() => usage(mine), [mine]);
  const canFile = isSelf || canFileForOthers;
  return (
    <div>
      <button className="mb-3 flex items-center gap-1 text-sm text-brand-700 hover:underline" onClick={onBack}><ChevronLeft className="h-4 w-4" /> กลับไปรายชื่อบุคลากร</button>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-700"><User className="h-6 w-6" /></div>
          <div>
            <div className="text-lg font-bold text-slate-800">{person.name || person.email}</div>
            <div className="text-sm text-slate-500">{person.position || ''}</div>
          </div>
        </div>
        {canFile && <button className="btn btn-primary" onClick={() => setForm(true)}><Plus className="h-5 w-5" /> ยื่นใบลา</button>}
      </div>
      <QuotaGrid quota={quota} used={used} pending={pending} />
      <div className="card overflow-x-auto">
        {mine.length === 0 ? <EmptyState title="ยังไม่มีประวัติการลาในปีงบประมาณนี้" /> : (
          <table className="w-full min-w-[640px] text-left">
            <thead className="bg-brand-50 text-sm text-slate-600"><tr><th className="px-3 py-2">ประเภท</th><th className="px-3 py-2">ช่วงวันที่</th><th className="px-3 py-2">วัน</th><th className="px-3 py-2">สถานะ</th></tr></thead>
            <tbody>
              {mine.map((l) => (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{l.type}</td>
                  <td className="px-3 py-2 text-sm">{fmtDate(l.start)} - {fmtDate(l.end)}</td>
                  <td className="px-3 py-2">{l.days}</td>
                  <td className="px-3 py-2"><Badge className={LEAVE_STATUS_COLORS[l.status]}>{l.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {form && quota && <LeaveForm profile={person} quota={quota} mine={mine} pageFy={fy} onClose={() => setForm(false)} say={say} />}
    </div>
  );
}

export default function Leave() {
  const { profile } = useAuth();
  const { fy } = useFiscalYear();
  const viewAll = can(profile.role, 'leave', 'viewAll');
  const canApprove = can(profile.role, 'leave', 'approve');
  const canFileForOthers = ['super_admin', 'admin_clerk'].includes(profile.role);
  const [tab, setTab] = useState('mine');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [quota, setQuota] = useState(null);
  const [form, setForm] = useState(false);
  const [decide, setDecide] = useState(null);
  const [toast, setToast] = useState(null);
  const [people, setPeople] = useState(null);
  const [person, setPerson] = useState(null);
  const say = (t) => { setToast(t); setTimeout(() => setToast(null), 4000); };

  useEffect(() => { getQuota().then(setQuota).catch(() => setQuota({})); }, []);
  useEffect(() => {
    setRows(null); setError('');
    const base = [where('fy', '==', fy)];
    if (!viewAll) base.push(where('userEmail', '==', profile.email));
    return onSnapshot(query(collection(db, 'leaves'), ...base),
      (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.start || '').localeCompare(a.start || ''))),
      (e) => setError(e.message));
  }, [fy, viewAll, profile.email]);

  // รายชื่อบุคลากรทั้งหมด สำหรับแท็บ "รายบุคคล" (เห็นเฉพาะผู้ที่มีสิทธิ์ดูรายการลาทุกคน)
  useEffect(() => {
    if (!viewAll) return;
    return onSnapshot(collection(db, 'users'),
      (s) => setPeople(s.docs.map((d) => d.data()).filter((u) => u.role !== 'pending').sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email), 'th'))),
      () => setPeople([]));
  }, [viewAll]);

  const mine = useMemo(() => (rows || []).filter((l) => l.userEmail === profile.email), [rows, profile.email]);
  const { used, pending } = useMemo(() => usage(mine), [mine]);
  const list = tab === 'mine' ? mine : tab === 'wait' ? (rows || []).filter((l) => l.status === 'รอพิจารณา') : rows || [];
  const waitCount = (rows || []).filter((l) => l.status === 'รอพิจารณา').length;

  const cancel = async (l) => {
    try {
      await updateDoc(doc(db, 'leaves', l.id), { status: 'ยกเลิก' });
      await writeAudit({ action: 'update', module: 'leave', docId: l.id, label: `${l.name} ${l.type}`, before: { status: l.status }, after: { status: 'ยกเลิก' } });
      say({ type: 'ok', text: 'ยกเลิกใบลาแล้ว' });
    } catch (err) { say({ type: 'error', text: 'ไม่สำเร็จ: ' + (err.code || err.message) }); }
  };

  const exportAll = () => exportXlsx(
    list.map((l) => ({ ชื่อ: l.name, ตำแหน่ง: l.position, ประเภท: l.type, ตั้งแต่: fmtDate(l.start), ถึง: fmtDate(l.end), จำนวนวัน: l.days, เหตุผล: l.reason, สถานะ: l.status, ผู้พิจารณา: l.decidedBy || '', หมายเหตุ: l.decisionNote || '' })),
    'วันลา', `วันลา-ปีงบ${fy}`,
  );

  const tabs = [['mine', 'ใบลาของฉัน'], ...(viewAll ? [['all', 'ทั้งหมด'], ['wait', `รอพิจารณา${waitCount ? ` (${waitCount})` : ''}`], ['people', 'รายบุคคล']] : [])];

  if (tab === 'people' && viewAll) {
    return (
      <div className="mx-auto max-w-6xl p-4 lg:p-6">
        <PageHeader icon={Users} title="วันลารายบุคคล" subtitle={`ปีงบประมาณ ${fy} (1 ต.ค. - 30 ก.ย.)`} />
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {tabs.map(([k, l]) => <button key={k} onClick={() => { setTab(k); setPerson(null); }} className={`rounded-full px-4 py-1.5 text-sm ${tab === k ? 'bg-brand-600 font-semibold text-white' : 'bg-white text-brand-800 ring-1 ring-brand-200 hover:bg-brand-50'}`}>{l}</button>)}
        </div>
        {person ? (
          <PersonDashboard person={person} rows={rows || []} quota={quota} fy={fy} canFileForOthers={canFileForOthers} isSelf={person.email === profile.email} onBack={() => setPerson(null)} say={say} />
        ) : people === null ? <Spinner /> : people.length === 0 ? <EmptyState title="ยังไม่มีบุคลากร" /> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {people.map((p) => {
              const cnt = (rows || []).filter((l) => l.userEmail === p.email && l.status === 'อนุมัติ').length;
              return (
                <button key={p.email} onClick={() => setPerson(p)} className="card flex items-center gap-3 p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-brand-100 text-brand-700"><User className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-slate-800">{p.name || p.email}</div>
                    <div className="truncate text-sm text-slate-500">{p.position || '-'}</div>
                  </div>
                  <Badge className="bg-brand-50 text-brand-700">{cnt} ครั้ง</Badge>
                </button>
              );
            })}
          </div>
        )}
        <Toast toast={toast} onClose={() => setToast(null)} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-6">
      <PageHeader icon={CalendarDays} title="ระบบควบคุมวันลา" subtitle={`ปีงบประมาณ ${fy} (1 ต.ค. - 30 ก.ย.)`}
        actions={<button className="btn btn-primary" onClick={() => setForm(true)}><Plus className="h-5 w-5" /> ยื่นใบลา</button>} />

      <QuotaGrid quota={quota} used={used} pending={pending} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`rounded-full px-4 py-1.5 text-sm ${tab === k ? 'bg-brand-600 font-semibold text-white' : 'bg-white text-brand-800 ring-1 ring-brand-200 hover:bg-brand-50'}`}>{l}</button>)}
        {viewAll && <button className="btn btn-outline ml-auto !py-1.5" onClick={exportAll} disabled={!list.length}><Download className="h-4 w-4" /> ส่งออก Excel</button>}
      </div>

      <div className="card overflow-x-auto">
        {error ? <ErrorState message={error} /> : rows === null ? <Spinner /> : list.length === 0 ? <EmptyState title="ไม่มีใบลา" /> : (
          <table className="w-full min-w-[820px] text-left">
            <thead className="bg-brand-50 text-sm text-slate-600"><tr><th className="px-3 py-2">ผู้ลา</th><th className="px-3 py-2">ประเภท</th><th className="px-3 py-2">ช่วงวันที่</th><th className="px-3 py-2">วัน</th><th className="px-3 py-2">เหตุผล</th><th className="px-3 py-2">สถานะ</th><th className="px-3 py-2" /></tr></thead>
            <tbody>
              {list.map((l) => (
                <tr key={l.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2"><div className="font-medium">{l.name}</div><div className="text-xs text-slate-500">{l.position}</div></td>
                  <td className="px-3 py-2">{l.type}</td>
                  <td className="px-3 py-2 text-sm">{fmtDate(l.start)} - {fmtDate(l.end)}</td>
                  <td className="px-3 py-2">{l.days}</td>
                  <td className="max-w-[220px] px-3 py-2 text-sm text-slate-600">{l.reason}{l.decisionNote && <div className="text-xs text-brand-700">ผู้พิจารณา: {l.decisionNote}</div>}</td>
                  <td className="px-3 py-2"><Badge className={LEAVE_STATUS_COLORS[l.status]}>{l.status}</Badge></td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {l.status === 'รอพิจารณา' && canApprove && (
                      <span className="flex gap-1">
                        <button className="btn btn-primary !px-2 !py-1 text-sm" onClick={() => setDecide({ l, d: 'อนุมัติ' })}><Check className="h-4 w-4" /> อนุมัติ</button>
                        <button className="btn btn-outline !px-2 !py-1 text-sm" onClick={() => setDecide({ l, d: 'ไม่อนุมัติ' })}><X className="h-4 w-4" /></button>
                      </span>
                    )}
                    {l.status === 'รอพิจารณา' && l.userEmail === profile.email && !canApprove && <button className="btn btn-outline !px-2 !py-1 text-sm" onClick={() => cancel(l)}>ยกเลิก</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {form && quota && <LeaveForm profile={profile} quota={quota} mine={mine} pageFy={fy} onClose={() => setForm(false)} say={say} />}
      {decide && <DecideModal leave={decide.l} decision={decide.d} by={profile.name || profile.email} onClose={() => setDecide(null)} say={say} />}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
