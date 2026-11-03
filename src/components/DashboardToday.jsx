// ส่วน "วันนี้" บนแดชบอร์ด: คิวจองแพทย์แผนไทยวันนี้ · ผู้ถูกมอบหมายงานวันนี้ · เวรประจำวันวันนี้ + ตารางเวรประจำวัน (แก้ไขได้เฉพาะ Super Admin)
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, getDoc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { CalendarCheck, CalendarClock, Loader2, Pencil, Stethoscope, Users } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { canRead, normalizeRole } from '../lib/roles';
import { writeAudit } from '../lib/audit';
import { fmtDate, todayStr } from '../lib/thai';
import { THAI_ACTIVE, THAI_STATUS_COLOR, thaiLoadClass, thaiTimeRange } from '../lib/thaiClinic';
import { Badge, Modal } from './ui';
import ThaiDateInput from './ThaiDateInput';

// ---------- เวรประจำวัน (ค่าเริ่มต้นตามตารางที่ รพ.สต.ประกาศ เริ่ม 27 ต.ค. 2569) ----------
export const DUTY_DAYS = [
  { dow: 1, label: 'จันทร์', cls: 'bg-yellow-300 text-yellow-950', icon: '☀️' },
  { dow: 2, label: 'อังคาร', cls: 'bg-pink-300 text-pink-950', icon: '🌸' },
  { dow: 3, label: 'พุธ', cls: 'bg-lime-400 text-lime-950', icon: '🍃' },
  { dow: 4, label: 'พฤหัสบดี', cls: 'bg-orange-300 text-orange-950', icon: '🌞' },
  { dow: 5, label: 'ศุกร์', cls: 'bg-sky-300 text-sky-950', icon: '⭐' },
];
export const DUTY_ROOMS = [
  { key: 'exam', label: 'ห้องตรวจโรค', icon: '🩺', head: 'bg-sky-200 text-sky-950', cell: 'bg-sky-50' },
  { key: 'er', label: 'ห้อง ER', sub: 'โต๊ะนั่งเจ้าหน้าที่ อยู่หน้าบอร์ดประชาสัมพันธ์', icon: '🚨', head: 'bg-violet-200 text-violet-950', cell: 'bg-violet-50' },
  { key: 'drug', label: 'ห้องยา', icon: '💊', head: 'bg-green-200 text-green-950', cell: 'bg-green-50' },
];
export const DUTY_DEFAULT = {
  title: 'เวรประจำวันด้านการรักษาพยาบาลและการสาธารณสุขประจำห้องตรวจโรค ห้องฉุกเฉิน และห้องจ่ายยา',
  startDate: '2026-10-27',
  days: {
    1: { exam: 'เพียงใจ', er: 'สุนิศา', drug: 'สุกัญญา' },
    2: { exam: 'ปิยะนาฏ', er: 'พิไลวรรณ', drug: 'สุนิศา' },
    3: { exam: 'เพียงใจ', er: 'สุกัญญา', drug: 'พิไลวรรณ' },
    4: { exam: 'ปิยะนาฏ', er: 'ศศิธร', drug: 'สุนิศา' },
    5: { exam: 'ศศิธร', er: 'ปิยะนาฏ', drug: 'สุกัญญา' },
  },
  notes: [
    { title: 'หมายเหตุ สมถวิล', items: ['วัดสัญญาณชีพ+ซักประวัติข้อมูลผู้รับบริการ', 'บันทึกข้อมูลลงในแฟ้มประวัติ'], cls: 'border-sky-300 bg-sky-50', head: 'bg-sky-600' },
    { title: 'ทัศนวรรณ์', items: ['Authen ผู้มารับบริการ', 'ส่งข้อมูลผู้รับบริการเข้าห้องตรวจ (1,2,3)'], cls: 'border-violet-300 bg-violet-50', head: 'bg-violet-600' },
    { title: 'แสงกล้า', items: ['ภารกิจประจำวัน', 'ประจำจุดเช็คสิทธิ์การรักษา', 'รับเรื่องการย้ายสิทธิการรักษาพยาบาล'], cls: 'border-emerald-300 bg-emerald-50', head: 'bg-emerald-600' },
  ],
};
const NOTE_STYLES = [
  { cls: 'border-sky-300 bg-sky-50', head: 'bg-sky-600' }, { cls: 'border-violet-300 bg-violet-50', head: 'bg-violet-600' }, { cls: 'border-emerald-300 bg-emerald-50', head: 'bg-emerald-600' },
  { cls: 'border-amber-300 bg-amber-50', head: 'bg-amber-600' }, { cls: 'border-rose-300 bg-rose-50', head: 'bg-rose-600' },
];
const dowToday = () => new Date(`${todayStr()}T00:00:00`).getDay();

function useRoster() {
  const [roster, setRoster] = useState(DUTY_DEFAULT);
  useEffect(() => { getDoc(doc(db, 'settings', 'dutyRoster')).then((s) => { if (s.exists()) setRoster({ ...DUTY_DEFAULT, ...s.data() }); }).catch(() => {}); }, []);
  return [roster, setRoster];
}

function Panel({ icon: Icon, title, tone, to, count, children }) {
  return (
    <div className="card flex flex-col overflow-hidden">
      <div className={`flex items-center gap-2 px-4 py-2.5 text-white ${tone}`}>
        <Icon className="h-5 w-5" /><h3 className="flex-1 font-bold !text-white">{title}</h3>
        {count != null && <span className="rounded-full bg-white/25 px-2.5 py-0.5 text-sm font-bold">{count}</span>}
        {to && <Link to={to} className="text-xs underline opacity-90 hover:opacity-100">ดูทั้งหมด</Link>}
      </div>
      <div className="max-h-72 flex-1 overflow-y-auto p-3">{children}</div>
    </div>
  );
}
const Empty = ({ children }) => <p className="py-6 text-center text-sm text-slate-400">{children}</p>;

export function TodayCards() {
  const { profile } = useAuth();
  const [roster] = useRoster();
  const [thai, setThai] = useState(null);
  const [assign, setAssign] = useState(null);
  const canThai = canRead(profile.role, 'thai-booking');
  const canAssign = canRead(profile.role, 'assignments');
  const today = todayStr();

  useEffect(() => {
    if (!canThai) return undefined;
    return onSnapshot(query(collection(db, 'thaiBookings'), where('date', '==', today)),
      (s) => setThai(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((b) => THAI_ACTIVE.includes(b.status)).sort((a, b) => String(a.time).localeCompare(String(b.time)))), () => setThai([]));
  }, [canThai, today]);
  useEffect(() => {
    if (!canAssign) return undefined;
    return onSnapshot(query(collection(db, 'assignments'), where('date', '==', today)),
      (s) => setAssign(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')))), () => setAssign([]));
  }, [canAssign, today]);

  const dow = dowToday();
  const duty = roster.days?.[dow];
  const dayInfo = DUTY_DAYS.find((d) => d.dow === dow);

  return (
    <div className="mb-5 grid items-stretch gap-4 lg:grid-cols-3">
      <Panel icon={Stethoscope} title="เวรประจำวันนี้" tone="bg-gradient-to-r from-sky-600 to-cyan-500">
        {!duty || !dayInfo ? <Empty>วันนี้ไม่มีเวรประจำห้อง (วันหยุดสุดสัปดาห์)</Empty> : (
          <div>
            <div className={`mb-2 rounded-lg px-3 py-1 text-center font-bold ${dayInfo.cls}`}>{dayInfo.icon} วัน{dayInfo.label} · {fmtDate(today)}</div>
            {DUTY_ROOMS.map((r) => (
              <div key={r.key} className={`mb-1.5 flex items-center gap-3 rounded-lg px-3 py-2 ${r.cell}`}>
                <span className="text-xl">{r.icon}</span>
                <div className="flex-1 text-sm text-slate-600">{r.label}</div>
                <div className="text-lg font-extrabold text-slate-800">{duty[r.key] || '-'}</div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {canThai && (
        <Panel icon={CalendarCheck} title="คิวจองแพทย์แผนไทยวันนี้" tone="bg-gradient-to-r from-emerald-600 to-teal-500" to="/thai-booking" count={thai ? `${thai.length} คิว` : null}>
          {thai === null ? <div className="py-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></div> : thai.length === 0 ? <Empty>วันนี้ยังไม่มีคิวจอง</Empty> : (
            <ul className="space-y-1.5">
              {thai.map((b) => (
                <li key={b.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
                  <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-bold ${thaiLoadClass(Math.min(4, thai.length))}`}>{thaiTimeRange(b.time, b.timeEnd)}</span>
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{b.name}</div><div className="truncate text-xs text-slate-500">{b.service}{b.note ? ` · ${b.note}` : ''}</div></div>
                  <Badge className={THAI_STATUS_COLOR[b.status]}>{b.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {canAssign && (
        <Panel icon={CalendarClock} title="ผู้ถูกมอบหมายงานวันนี้" tone="bg-gradient-to-r from-amber-500 to-orange-500" to="/assignments" count={assign ? `${assign.length} งาน` : null}>
          {assign === null ? <div className="py-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></div> : assign.length === 0 ? <Empty>วันนี้ไม่มีงานที่มอบหมาย</Empty> : (
            <ul className="space-y-1.5">
              {assign.map((a) => {
                const mine = (a.assignees || []).some((p) => p.email === profile.email);
                return (
                  <li key={a.id} className={`rounded-lg px-2.5 py-1.5 ${mine ? 'bg-amber-100 ring-1 ring-amber-300' : 'bg-slate-50'}`}>
                    <div className="flex items-center gap-1 text-sm font-medium"><span className="flex-1">{a.title}</span>{mine && <Badge className="bg-amber-500 text-white">ของฉัน</Badge>}</div>
                    <div className="text-xs text-slate-500">{[a.type, a.time, a.location].filter(Boolean).join(' · ')}</div>
                    <div className="mt-0.5 flex items-start gap-1 text-xs text-slate-700"><Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />{(a.assignees || []).map((p) => p.name).join(', ')}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}

// ---------- ตารางเวรประจำวัน (หน้าตาตามป้ายประกาศ) ----------
function EditRoster({ roster, onClose, onSaved }) {
  const { profile } = useAuth();
  const [r, setR] = useState(() => JSON.parse(JSON.stringify(roster)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const setCell = (dow, k, v) => setR({ ...r, days: { ...r.days, [dow]: { ...(r.days[dow] || {}), [k]: v } } });
  const setNote = (i, patch) => setR({ ...r, notes: r.notes.map((n, j) => (j === i ? { ...n, ...patch } : n)) });
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const out = { ...r, notes: r.notes.filter((n) => n.title.trim()).map((n, i) => ({ ...n, items: (n.items || []).map((x) => x.trim()).filter(Boolean), ...NOTE_STYLES[i % NOTE_STYLES.length] })) };
      await setDoc(doc(db, 'settings', 'dutyRoster'), out);
      await writeAudit({ action: 'settings', module: 'settings', label: 'แก้ไขตารางเวรประจำวัน' });
      onSaved(out); onClose();
    } catch (e) { setErr(e.code === 'permission-denied' ? 'ไม่มีสิทธิ์บันทึก (เฉพาะ Super Admin)' : e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="แก้ไขตารางเวรประจำวัน" wide onClose={onClose}
      footer={<button className="btn btn-primary w-full" onClick={save} disabled={busy || !profile}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} บันทึกตารางเวร</button>}>
      <div className="space-y-4">
        {err && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{err}</p>}
        <div><label className="mb-1 block text-sm text-slate-600">หัวเรื่อง</label><textarea rows={2} className="input" value={r.title} onChange={(e) => setR({ ...r, title: e.target.value })} /></div>
        <div className="w-56"><label className="mb-1 block text-sm text-slate-600">เริ่มใช้ตั้งแต่วันที่</label><ThaiDateInput value={r.startDate} onChange={(v) => v && setR({ ...r, startDate: v })} yearsBack={1} yearsForward={2} /></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead><tr><th className="p-1 text-left">วัน</th>{DUTY_ROOMS.map((x) => <th key={x.key} className="p-1 text-left">{x.label}</th>)}</tr></thead>
            <tbody>{DUTY_DAYS.map((d) => (
              <tr key={d.dow}><td className="p-1 font-medium">{d.label}</td>
                {DUTY_ROOMS.map((x) => <td key={x.key} className="p-1"><input className="input !py-1.5" value={r.days?.[d.dow]?.[x.key] || ''} onChange={(e) => setCell(d.dow, x.key, e.target.value)} aria-label={`${d.label} ${x.label}`} /></td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-600">กรอบหมายเหตุด้านล่าง (ชื่อผู้รับผิดชอบ + หน้าที่ 1 บรรทัด = 1 ข้อ)</p>
          {r.notes.map((n, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-[12rem_1fr]">
              <input className="input" placeholder="ชื่อ/หัวข้อ" value={n.title} onChange={(e) => setNote(i, { title: e.target.value })} />
              <textarea rows={3} className="input" value={(n.items || []).join('\n')} onChange={(e) => setNote(i, { items: e.target.value.split('\n') })} />
            </div>
          ))}
          {r.notes.length < 5 && <button type="button" className="btn btn-outline" onClick={() => setR({ ...r, notes: [...r.notes, { title: '', items: [] }] })}>+ เพิ่มกรอบหมายเหตุ</button>}
        </div>
      </div>
    </Modal>
  );
}

export function DutyRosterTable() {
  const { profile } = useAuth();
  const [roster, setRoster] = useRoster();
  const [edit, setEdit] = useState(false);
  const isAdmin = normalizeRole(profile.role) === 'super_admin';
  const dow = dowToday();
  return (
    <section className="mb-7 overflow-hidden rounded-2xl border border-sky-200 bg-gradient-to-b from-sky-50 via-white to-emerald-50 shadow-sm">
      <div className="relative bg-gradient-to-r from-sky-600 via-cyan-500 to-emerald-500 px-4 py-3 text-center text-white">
        <h2 className="text-base font-extrabold leading-snug !text-white sm:text-lg">📋 {roster.title}</h2>
        <p className="mt-1 inline-block rounded-full bg-yellow-200 px-3 py-0.5 text-sm font-bold text-yellow-900">เริ่ม {fmtDate(roster.startDate)} เป็นต้นไป</p>
        {isAdmin && <button className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-lg bg-white/20 px-2 py-1 text-xs font-semibold hover:bg-white/30" onClick={() => setEdit(true)}><Pencil className="h-3.5 w-3.5" /> แก้ไข</button>}
      </div>
      <div className="overflow-x-auto p-3">
        <table className="w-full min-w-[560px] border-separate border-spacing-1.5 text-center">
          <thead>
            <tr>
              <th className="rounded-xl bg-blue-600 px-3 py-2 text-white">📅 วัน</th>
              {DUTY_ROOMS.map((r) => <th key={r.key} className={`rounded-xl px-3 py-2 ${r.head}`}><div className="text-base font-extrabold">{r.icon} {r.label}</div>{r.sub && <div className="text-[11px] font-normal">{r.sub}</div>}</th>)}
            </tr>
          </thead>
          <tbody>
            {DUTY_DAYS.map((d) => {
              const isToday = d.dow === dow;
              return (
                <tr key={d.dow}>
                  <td className={`rounded-xl px-3 py-2.5 text-left font-extrabold ${d.cls} ${isToday ? 'ring-4 ring-slate-800/70' : ''}`}>{d.icon} {d.label}{isToday && <span className="ml-1 rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-white">วันนี้</span>}</td>
                  {DUTY_ROOMS.map((r) => <td key={r.key} className={`rounded-xl px-3 py-2.5 text-lg font-bold text-slate-800 ${r.cell} ${isToday ? 'ring-2 ring-slate-700/60 font-extrabold' : ''}`}>{roster.days?.[d.dow]?.[r.key] || '-'}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
        {roster.notes?.length > 0 && (
          <div className="mt-2 grid gap-3 md:grid-cols-3">
            {roster.notes.map((n, i) => {
              const st = NOTE_STYLES[i % NOTE_STYLES.length];
              return (
                <div key={i} className={`overflow-hidden rounded-xl border-2 ${n.cls || st.cls}`}>
                  <div className={`px-3 py-1 text-sm font-bold text-white ${n.head || st.head}`}>📝 {n.title}</div>
                  <ol className="list-decimal space-y-0.5 px-7 py-2 text-sm text-slate-700">{(n.items || []).map((x, j) => <li key={j}>{x}</li>)}</ol>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-center text-sm font-semibold text-sky-700">💙 ร่วมใจบริการด้วยใจ ดูแลด้วยใจ ห่วงใยสุขภาพชุมชน</p>
      </div>
      {edit && <EditRoster roster={roster} onClose={() => setEdit(false)} onSaved={setRoster} />}
    </section>
  );
}
