import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { CalendarDays, Check, ChevronLeft, Download, Loader2, Pencil, Plus, Printer, Send, Trash2, User, X, XCircle } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useFiscalYear } from '../context/FiscalYearContext';
import { can } from '../lib/roles';
import { writeAudit } from '../lib/audit';
import { EVAL_ROUND_LABEL, EVAL_ROUND_RULE, LEAVE_STATUS_COLORS, LEAVE_TYPE_COLORS, LEAVE_TYPES, evalRoundOf, getHolidays, getQuota, posRank, usage, workingDays } from '../lib/leave';
import { exportXlsx } from '../lib/exportFile';
import { normalizeName } from '../lib/people';
import { fiscalYearBE, fmtDate, todayStr } from '../lib/thai';
import { Badge, ConfirmDialog, EmptyState, ErrorState, Modal, Spinner, Toast } from '../components/ui';
import { PageHeader } from '../components/Logo';
import ThaiDateInput from '../components/ThaiDateInput';
import LeaveReportsPanel from '../components/LeaveReportsPanel';

// โทนสีพาสเทลอ่อนๆ ไล่ให้แต่ละคนในรายชื่อบุคลากร (ตามลำดับการ์ด) เพื่อความสวยงาม แยกแยะง่าย — วนซ้ำเมื่อคนเกินจำนวนสี
const PERSON_PALETTE = [
  { bg: 'bg-rose-50 ring-rose-100 hover:bg-rose-100/60', avatar: 'bg-rose-100 text-rose-700', name: 'text-rose-900' },
  { bg: 'bg-amber-50 ring-amber-100 hover:bg-amber-100/60', avatar: 'bg-amber-100 text-amber-700', name: 'text-amber-900' },
  { bg: 'bg-emerald-50 ring-emerald-100 hover:bg-emerald-100/60', avatar: 'bg-emerald-100 text-emerald-700', name: 'text-emerald-900' },
  { bg: 'bg-sky-50 ring-sky-100 hover:bg-sky-100/60', avatar: 'bg-sky-100 text-sky-700', name: 'text-sky-900' },
  { bg: 'bg-violet-50 ring-violet-100 hover:bg-violet-100/60', avatar: 'bg-violet-100 text-violet-700', name: 'text-violet-900' },
  { bg: 'bg-fuchsia-50 ring-fuchsia-100 hover:bg-fuchsia-100/60', avatar: 'bg-fuchsia-100 text-fuchsia-700', name: 'text-fuchsia-900' },
  { bg: 'bg-cyan-50 ring-cyan-100 hover:bg-cyan-100/60', avatar: 'bg-cyan-100 text-cyan-700', name: 'text-cyan-900' },
  { bg: 'bg-lime-50 ring-lime-100 hover:bg-lime-100/60', avatar: 'bg-lime-100 text-lime-700', name: 'text-lime-900' },
];

// การ์ดโควตา/สถิติการลาของบุคคลใดบุคคลหนึ่ง (ใช้ในแดชบอร์ดรายบุคคล) — การ์ด "ลาพักผ่อน" แสดงยอดสะสมยกมา (จากทำเนียบ
// บุคลากร) รวมกับสิทธิ์ปีนี้คงเหลือให้เห็นเป็น "วันลาสะสม" ทั้งก้อนตามที่แจ้ง (ลาพักผ่อนที่ใช้ไม่หมดในแต่ละปีงบจะถูกยกไป
// เป็นวันสะสมให้อัตโนมัติทุกต้นปีงบประมาณใหม่ — ดู Cloud Function "annualVacationCarryOver")
function QuotaGrid({ quota, used, pending, vacationCarryOver }) {
  if (!quota) return null;
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Object.entries(quota).map(([type, q]) => {
        const u = used[type] || 0; const p = pending[type] || 0;
        const pct = q ? Math.min(100, ((u + p) / q) * 100) : 0;
        const isVacation = type === 'ลาพักผ่อน';
        const accrued = isVacation ? (Number(vacationCarryOver) || 0) : 0;
        const remainThisYear = Math.max(0, q - u);
        const total = remainThisYear + accrued;
        const c = LEAVE_TYPE_COLORS[type] || LEAVE_TYPE_COLORS._default;
        return (
          <div key={type} className={`rounded-2xl p-4 ring-1 ${c.ring} ${c.tile}`}>
            <div className={`text-sm font-semibold ${c.label}`}>{type}</div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/70"><div className={`h-2.5 rounded-full ${c.bar}`} style={{ width: `${pct}%` }} /></div>
            <div className="mt-2 text-sm text-slate-600">
              วันลาใช้ไป <span className={`font-bold ${c.label}`}>{u}</span> วัน{p ? <> · รออนุมัติ {p} วัน</> : null}
            </div>
            <div className={`text-lg font-bold ${c.value}`}>
              คงเหลือ {total} วัน
              <span className="ml-1 text-xs font-normal text-slate-500">
                (สิทธิ์ {q} วัน/ปี{isVacation && accrued ? ` + ยกยอดสะสม ${accrued} วัน` : ''})
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// การ์ดโควตาแบบย่อ (ใช้ในการ์ดรายบุคคลที่หน้ารายชื่อบุคลากร) — แยกสีต่อประเภทลา (LEAVE_TYPE_COLORS) และระบุชัดเจนเป็นคำว่า
// "ใช้ไป...วัน" / "คงเหลือ...วัน" ต่อประเภท (ไม่ใช่แค่เลข X/Y ที่อาจตีความสับสน) — ลาพักผ่อนรวมยอดสะสมเข้าไปในตัวเลขคงเหลือด้วย
// ใช้ชุดสี/คำเดียวกันกับ QuotaGrid (แดชบอร์ดรายบุคคล) เพื่อให้ตรงกันทุกหน้า ("สัมพันธ์กันทุกรายงาน")
function MiniQuota({ quota, used, vacationCarryOver }) {
  if (!quota) return null;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {Object.entries(quota).map(([type, q]) => {
        const u = used[type] || 0;
        const isVacation = type === 'ลาพักผ่อน';
        const accrued = isVacation ? (Number(vacationCarryOver) || 0) : 0;
        const left = Math.max(0, q - u) + accrued;
        const pct = q ? Math.min(100, (u / q) * 100) : 0;
        const c = LEAVE_TYPE_COLORS[type] || LEAVE_TYPE_COLORS._default;
        return (
          <div key={type} className={`rounded-xl p-2.5 ring-1 ${c.ring} ${c.tile}`}>
            <div className={`truncate text-[11px] font-semibold ${c.label}`} title={type}>{type}</div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/70"><div className={`h-1.5 rounded-full ${c.bar}`} style={{ width: `${pct}%` }} /></div>
            <div className="mt-1.5 text-[11px] text-slate-500">ใช้ไป <b className={c.label}>{u}</b> วัน</div>
            <div className={`text-sm font-bold ${c.value}`}>
              คงเหลือ {left} วัน
              <span className="block text-[10px] font-normal text-slate-400">
                จากสิทธิ์ {q} วัน/ปี{isVacation && accrued ? ` +สะสม ${accrued}` : ''}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LeaveForm({ profile, quota, mine, pageFy, people, onClose, say }) {
  const [f, setF] = useState({ type: LEAVE_TYPES[0], start: todayStr(), end: todayStr(), days: 1, reason: '', contact: '', phone: '', delegateTo: '' });
  const [busy, setBusy] = useState(false);
  // วันหยุดราชการ: โหลดครั้งเดียวตอนเปิดฟอร์ม ใช้ตัด "วันลา" ที่ตรงกับวันหยุดราชการออกจากจำนวนวันทำการอัตโนมัติ ตามที่แจ้ง
  // (เช่น 13 ต.ค. วันนวมินทรมหาราช) — ดูแลรายการวันหยุดได้ที่หน้า "ตั้งค่าระบบ"
  const [holidaySet, setHolidaySet] = useState(null);
  useEffect(() => { getHolidays().then((list) => setHolidaySet(new Set(list.map((h) => h.date)))).catch(() => setHolidaySet(new Set())); }, []);
  useEffect(() => { if (holidaySet) setF((p) => ({ ...p, days: workingDays(p.start, p.end, holidaySet) })); }, [holidaySet]);
  const set = (k) => (e) => {
    const v = e.target.value;
    setF((p) => {
      const n = { ...p, [k]: v };
      if (k === 'start' && n.end < v) n.end = v;
      if (k === 'start' || k === 'end') n.days = workingDays(n.start, n.end, holidaySet);
      return n;
    });
  };
  // สำหรับ ThaiDateInput ที่ส่งค่าวันที่ ISO กลับมาตรงๆ (ไม่ใช่ event) ใช้ตรรกะเดียวกับ set() ด้านบน
  const setDate = (k) => (v) => {
    setF((p) => {
      const n = { ...p, [k]: v };
      if (k === 'start' && n.end < v) n.end = v;
      if (k === 'start' || k === 'end') n.days = workingDays(n.start, n.end, holidaySet);
      return n;
    });
  };
  const delegates = (people || []).filter((p) => p.email !== profile.email);

  // แจ้งเตือนแบบเรียลไทม์ก่อนกดยื่น: เทียบวันลาที่กำลังจะยื่น + ที่ใช้ไปแล้ว/รออนุมัติ กับโควตาตามระเบียบ
  const fyNow = fiscalYearBE(f.start);
  const { used: usedNow, pending: pendingNow } = usage(mine.filter((l) => l.fy === fyNow));
  const qNow = quota[f.type];
  const daysNow = Number(f.days) || 0;
  const alreadyNow = (usedNow[f.type] || 0) + (pendingNow[f.type] || 0);
  const overNow = qNow != null && alreadyNow + daysNow > qNow;
  const remainNow = qNow != null ? Math.max(0, qNow - alreadyNow) : null;

  // เกณฑ์ประเมินผล (ลาป่วย+ลากิจ ไม่เกิน 9 ครั้ง/ประเภท และรวมกันไม่เกิน 23 วันทำการ/รอบประเมิน 6 เดือน) — "เงื่อนไขบังคับห้ามเกิน" ตามที่แจ้ง
  // บล็อกการยื่นเหมือนโควตาประจำปี (นับรวมใบที่รออนุมัติด้วย ไม่ใช่แค่อนุมัติแล้ว กันยื่นพร้อมกันหลายใบจนทะลุเกณฑ์ตอนอนุมัติทีหลัง)
  const isEvalType = f.type === EVAL_ROUND_RULE.sickType || f.type === EVAL_ROUND_RULE.personalType;
  const roundNow = evalRoundOf(f.start);
  const roundLeavesNow = mine.filter((l) => l.fy === fyNow && evalRoundOf(l.start) === roundNow && l.status !== 'ยกเลิก' && l.status !== 'ไม่อนุมัติ');
  const sickCountNow = roundLeavesNow.filter((l) => l.type === EVAL_ROUND_RULE.sickType).length;
  const personalCountNow = roundLeavesNow.filter((l) => l.type === EVAL_ROUND_RULE.personalType).length;
  const combinedDaysNow = roundLeavesNow
    .filter((l) => l.type === EVAL_ROUND_RULE.sickType || l.type === EVAL_ROUND_RULE.personalType)
    .reduce((s, l) => s + (Number(l.days) || 0), 0);
  const sickCountAfter = sickCountNow + (f.type === EVAL_ROUND_RULE.sickType ? 1 : 0);
  const personalCountAfter = personalCountNow + (f.type === EVAL_ROUND_RULE.personalType ? 1 : 0);
  const combinedDaysAfter = combinedDaysNow + daysNow;
  const evalOverNow = isEvalType && (sickCountAfter > EVAL_ROUND_RULE.maxCountEach || personalCountAfter > EVAL_ROUND_RULE.maxCountEach || combinedDaysAfter > EVAL_ROUND_RULE.maxCombinedDays);

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
    if (evalOverNow) {
      return say({ type: 'error', text: `เกินเกณฑ์ประเมินผล${EVAL_ROUND_LABEL[roundNow]}: ลาป่วย/ลากิจ ไม่เกิน ${EVAL_ROUND_RULE.maxCountEach} ครั้งต่อประเภท และรวมกันไม่เกิน ${EVAL_ROUND_RULE.maxCombinedDays} วันทำการต่อรอบ กรุณาปรึกษาผู้บริหารก่อนยื่นเพิ่ม` });
    }
    setBusy(true);
    try {
      const delegate = delegates.find((p) => p.name === f.delegateTo);
      const data = {
        userEmail: profile.email, name: profile.name || profile.email, position: profile.position || '',
        type: f.type, start: f.start, end: f.end, days, reason: f.reason.trim(), contact: f.contact.trim(), phone: f.phone.trim(),
        delegateTo: f.delegateTo || '', delegatePosition: delegate?.position || '',
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
          <div><label className="mb-1 block text-sm text-slate-600" htmlFor="ls">ตั้งแต่วันที่</label><ThaiDateInput id="ls" required value={f.start} onChange={setDate('start')} /></div>
          <div><label className="mb-1 block text-sm text-slate-600" htmlFor="le">ถึงวันที่</label><ThaiDateInput id="le" required min={f.start} value={f.end} onChange={setDate('end')} /></div>
          <div><label className="mb-1 block text-sm text-slate-600" htmlFor="ld">จำนวนวัน</label><input id="ld" type="number" step="0.5" min="0.5" required className="input" value={f.days} onChange={set('days')} /></div>
        </div>
        <p className="text-xs text-slate-500">นับเฉพาะวันจันทร์-ศุกร์ และไม่นับวันหยุดราชการ (เช่น 13 ต.ค.) ให้อัตโนมัติ (ปรับเป็น 0.5 ได้กรณีลาครึ่งวัน หรือแก้จำนวนวันเองได้หากไม่ตรงกับที่คำนวณ)</p>
        {qNow != null && (
          <div className={`rounded-lg px-3 py-2 text-sm ${overNow ? 'bg-red-50 text-red-700 ring-1 ring-red-200' : 'bg-brand-50 text-brand-800 ring-1 ring-brand-200'}`}>
            สิทธิ์{f.type}ตามระเบียบ {qNow} วัน/ปี · ใช้แล้ว/รออนุมัติ {alreadyNow} วัน · คงเหลือก่อนยื่นครั้งนี้ {remainNow} วัน
            {overNow && <div className="mt-0.5 font-semibold">⚠️ เกินสิทธิ์ตามระเบียบ {alreadyNow + daysNow - qNow} วัน — ระบบจะไม่ให้บันทึกใบลานี้ กรุณาปรับจำนวนวันหรือเลือกประเภทอื่น</div>}
          </div>
        )}
        {isEvalType && (
          <div className={`rounded-lg px-3 py-2 text-sm ${evalOverNow ? 'bg-red-50 text-red-700 ring-1 ring-red-200' : 'bg-slate-50 text-slate-600 ring-1 ring-slate-200'}`}>
            เกณฑ์ประเมินผล {EVAL_ROUND_LABEL[roundNow]}: ลาป่วย {sickCountAfter}/{EVAL_ROUND_RULE.maxCountEach} ครั้ง · ลากิจ {personalCountAfter}/{EVAL_ROUND_RULE.maxCountEach} ครั้ง · รวมวันลาป่วย+ลากิจ {combinedDaysAfter}/{EVAL_ROUND_RULE.maxCombinedDays} วัน (นับรวมใบนี้แล้ว ไม่รวมใบที่ยกเลิก/ไม่อนุมัติ)
            {evalOverNow && <div className="mt-0.5 font-semibold">⚠️ เกินเกณฑ์บังคับของรอบนี้ — ระบบจะไม่ให้บันทึกใบลานี้</div>}
          </div>
        )}
        <div><label className="mb-1 block text-sm text-slate-600" htmlFor="lr">เหตุผลการลา</label><textarea id="lr" required rows={2} className="input" value={f.reason} onChange={set('reason')} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="mb-1 block text-sm text-slate-600" htmlFor="lc">ติดต่อได้ที่ (ที่อยู่/สถานที่ระหว่างลา)</label><input id="lc" className="input" value={f.contact} onChange={set('contact')} /></div>
          <div><label className="mb-1 block text-sm text-slate-600" htmlFor="lp">หมายเลขโทรศัพท์มือถือ</label><input id="lp" className="input" value={f.phone} onChange={set('phone')} /></div>
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-600" htmlFor="ldg">มอบหมายงานในหน้าที่ให้ (ผู้ดำเนินการแทนระหว่างลา)</label>
          <select id="ldg" className="input" value={f.delegateTo} onChange={set('delegateTo')}>
            <option value="">-- เลือกผู้รับมอบงาน --</option>
            {delegates.map((p) => <option key={p.email} value={p.name}>{p.name}{p.position ? ` (${p.position})` : ''}</option>)}
          </select>
        </div>
        <button className="btn btn-primary w-full" disabled={busy || overNow || evalOverNow}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} ยื่นใบลา</button>
      </form>
    </Modal>
  );
}

// เลือกใบลาที่จะยกเลิก/ลบ จากปุ่มบนหัวหน้าเพจ: คนทั่วไปยกเลิกได้เฉพาะใบของตัวเองที่ยังรอพิจารณา, Super Admin เลือกยกเลิก/ลบใบของใครก็ได้
function CancelPickerModal({ rows, profile, isSuperAdmin, onClose, say }) {
  const eligible = useMemo(
    () => (isSuperAdmin ? rows.filter((l) => l.status !== 'ยกเลิก') : rows.filter((l) => l.userEmail === profile.email && l.status === 'รอพิจารณา')),
    [rows, profile.email, isSuperAdmin],
  );
  const [selId, setSelId] = useState('');
  const [busy, setBusy] = useState(false);
  const sel = eligible.find((l) => l.id === selId) || null;

  const doCancel = async () => {
    if (!sel) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, 'leaves', sel.id), { status: 'ยกเลิก' });
      await writeAudit({ action: 'update', module: 'leave', docId: sel.id, label: `${sel.name} ${sel.type}`, before: { status: sel.status }, after: { status: 'ยกเลิก' } });
      say({ type: 'ok', text: 'ยกเลิกใบลาแล้ว' });
      onClose();
    } catch (err) { say({ type: 'error', text: 'ไม่สำเร็จ: ' + (err.code || err.message) }); } finally { setBusy(false); }
  };
  const doDelete = async () => {
    if (!sel) return;
    setBusy(true);
    try {
      await deleteDoc(doc(db, 'leaves', sel.id));
      await writeAudit({ action: 'delete', module: 'leave', docId: sel.id, label: `${sel.name} ${sel.type}`, before: { status: sel.status } });
      say({ type: 'ok', text: 'ลบใบลาแล้ว' });
      onClose();
    } catch (err) { say({ type: 'error', text: 'ไม่สำเร็จ: ' + (err.code || err.message) }); } finally { setBusy(false); }
  };

  return (
    <Modal title="ยกเลิกวันลา" onClose={onClose}>
      {eligible.length === 0 ? (
        <p className="text-slate-500">{isSuperAdmin ? 'ไม่มีใบลาให้ยกเลิก' : 'คุณไม่มีใบลาที่ยังรอพิจารณาให้ยกเลิก (ยกเลิกได้เฉพาะใบลาของตัวเองที่ยังไม่ได้รับการพิจารณา)'}</p>
      ) : (
        <>
          <label className="mb-1 block text-sm text-slate-600" htmlFor="cancelSel">เลือกใบลาที่ต้องการยกเลิก</label>
          <select id="cancelSel" className="input" value={selId} onChange={(e) => setSelId(e.target.value)}>
            <option value="">-- เลือกใบลา --</option>
            {eligible.map((l) => (
              <option key={l.id} value={l.id}>{l.name} · {l.type} · {fmtDate(l.start)}-{fmtDate(l.end)} · {l.status}</option>
            ))}
          </select>
          {!isSuperAdmin && <p className="mt-2 text-xs text-slate-500">บุคคลอื่นที่ไม่ใช่ผู้ทำใบลาจะยกเลิกแทนไม่ได้ ยกเว้น Super Admin</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn btn-outline" onClick={onClose} disabled={busy}>ปิด</button>
            {isSuperAdmin && <button className="btn btn-danger" disabled={!sel || busy} onClick={doDelete}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} <Trash2 className="h-4 w-4" /> ลบถาวร</button>}
            <button className="btn btn-primary" disabled={!sel || busy} onClick={doCancel}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} <XCircle className="h-4 w-4" /> ยกเลิกใบลานี้</button>
          </div>
        </>
      )}
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

// แก้ไขจำนวนวันลาของแถวที่มีอยู่แล้ว (Super Admin เท่านั้น) — ใช้แก้ให้ตรงตอนที่ระบบยังไม่หักวันหยุดราชการให้อัตโนมัติ
// (เช่น วันลาที่คลุม 13 ต.ค. ควรนับ 4 วันทำการ ไม่ใช่ 5) มีปุ่ม "คำนวณใหม่ตามวันหยุดราชการ" ช่วยคำนวณให้ หรือจะพิมพ์เองก็ได้
function EditDaysModal({ leave, onClose, say }) {
  const [days, setDays] = useState(leave.days);
  const [busy, setBusy] = useState(false);
  const [holidaySet, setHolidaySet] = useState(null);
  useEffect(() => { getHolidays().then((list) => setHolidaySet(new Set(list.map((h) => h.date)))).catch(() => setHolidaySet(new Set())); }, []);
  const recalc = () => setDays(workingDays(leave.start, leave.end, holidaySet || new Set()));
  const go = async () => {
    const n = Number(days);
    if (!n || n <= 0) return say({ type: 'error', text: 'กรุณากรอกจำนวนวันให้ถูกต้อง' });
    setBusy(true);
    try {
      await updateDoc(doc(db, 'leaves', leave.id), { days: n });
      await writeAudit({ action: 'update', module: 'leave', docId: leave.id, label: `${leave.name} ${leave.type}`, before: { days: leave.days }, after: { days: n } });
      say({ type: 'ok', text: 'แก้ไขจำนวนวันลาแล้ว' });
      onClose();
    } catch (err) {
      say({ type: 'error', text: 'ไม่สำเร็จ: ' + (err.code || err.message) });
    } finally { setBusy(false); }
  };
  return (
    <Modal title={`แก้ไขจำนวนวันลา: ${leave.name}`} onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose}>ยกเลิก</button><button className="btn btn-primary" onClick={go} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} บันทึก</button></>}>
      <p className="mb-2 text-sm text-slate-600">{leave.type} {fmtDate(leave.start)} - {fmtDate(leave.end)} (เดิม {leave.days} วัน)</p>
      <div className="flex items-end gap-2">
        <div className="flex-1"><label className="mb-1 block text-sm text-slate-600" htmlFor="edd">จำนวนวันลา (วันทำการ)</label><input id="edd" type="number" step="0.5" min="0.5" className="input" value={days} onChange={(e) => setDays(e.target.value)} /></div>
        <button type="button" className="btn btn-outline !py-2" onClick={recalc} disabled={!holidaySet} title="คำนวณใหม่โดยนับวันจันทร์-ศุกร์ และตัดวันหยุดราชการออก">คำนวณใหม่</button>
      </div>
      <p className="mt-2 text-xs text-slate-500">ปุ่ม "คำนวณใหม่" จะคำนวณจากวันจันทร์-ศุกร์ในช่วงวันที่ของใบลานี้ หักวันหยุดราชการที่ตั้งค่าไว้ (หน้า "ตั้งค่าระบบ") ออกให้</p>
    </Modal>
  );
}

// แดชบอร์ดรายบุคคล — แสดงเมื่อคลิกเข้าไปในชื่อจากรายชื่อบุคลากร: โควตา/ประวัติการลา + ปุ่มยื่นใบลา (เฉพาะเจ้าของชื่อ หรือผู้มีสิทธิ์ยื่นแทน)
function PersonDashboard({ person, rows, quota, fy, canFileForOthers, isSelf, people, onBack, say }) {
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
      <QuotaGrid quota={quota} used={used} pending={pending} vacationCarryOver={person.vacationCarryOver} />
      <div className="card overflow-x-auto">
        {mine.length === 0 ? <EmptyState title="ยังไม่มีประวัติการลาในปีงบประมาณนี้" /> : (
          <table className="w-full min-w-[640px] text-left">
            <thead className="bg-brand-50 text-sm text-slate-600"><tr><th className="px-3 py-2">ประเภท</th><th className="px-3 py-2">ช่วงวันที่</th><th className="px-3 py-2">วัน</th><th className="px-3 py-2">สถานะ</th><th className="px-3 py-2" /></tr></thead>
            <tbody>
              {mine.map((l) => (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{l.type}</td>
                  <td className="px-3 py-2 text-sm">{fmtDate(l.start)} - {fmtDate(l.end)}</td>
                  <td className="px-3 py-2">{l.days}</td>
                  <td className="px-3 py-2"><Badge className={LEAVE_STATUS_COLORS[l.status]}>{l.status}</Badge></td>
                  <td className="px-3 py-2"><button className="btn btn-outline !px-2 !py-1 text-sm" title="พิมพ์ใบลา (PDF)" onClick={() => window.open(`${window.location.origin}${window.location.pathname}#/print-leave/${l.id}`, '_blank')}><Printer className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {form && quota && <LeaveForm profile={person} quota={quota} mine={mine} pageFy={fy} people={people} onClose={() => setForm(false)} say={say} />}
    </div>
  );
}

// รายชื่อบุคลากรเป็นแถบสีพาสเทล — หน้าแรกของทะเบียนควบคุมวันลา คลิกชื่อใครก็เข้าไปดูประวัติ/ยื่นใบลาของคนนั้นได้ (PersonDashboard ด้านบน)
function PeopleList({ people, rows, quota, canFileForOthers, profileEmail, onPick, onQuickForm }) {
  if (people === null) return <Spinner />;
  if (people.length === 0) return <EmptyState title="ยังไม่มีบุคลากร" />;
  return (
    <div className="space-y-3">
      {people.map((p, i) => {
        const mineP = rows.filter((l) => l.userEmail === p.email);
        const { used } = usage(mineP);
        const canFile = p.email === profileEmail || canFileForOthers;
        const pal = PERSON_PALETTE[i % PERSON_PALETTE.length];
        return (
          <div key={p.email} className={`rounded-2xl p-3 ring-1 transition sm:p-4 ${pal.bg}`}>
            <div className="flex flex-wrap items-center gap-3">
              <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onPick(p)}>
                <div className={`flex h-11 w-11 flex-none items-center justify-center rounded-full ${pal.avatar}`}><User className="h-5 w-5" /></div>
                <div className="min-w-0">
                  <div className={`truncate text-base font-bold ${pal.name}`}>{p.name || p.email}</div>
                  <div className="truncate text-sm text-slate-500">{p.position || '-'}</div>
                </div>
              </button>
              {canFile && <button className="btn btn-primary !py-1.5 shrink-0" onClick={() => onQuickForm(p)}><Plus className="h-4 w-4" /> ยื่นใบลา</button>}
            </div>
            <div className="mt-3"><MiniQuota quota={quota} used={used} vacationCarryOver={p.vacationCarryOver} /></div>
          </div>
        );
      })}
    </div>
  );
}

export default function Leave() {
  const { profile } = useAuth();
  const { fy } = useFiscalYear();
  const viewAll = can(profile.role, 'leave', 'viewAll');
  const canApprove = can(profile.role, 'leave', 'approve');
  // รวมบทบาทเหลือ Super Admin/ผู้ใช้งาน แล้ว — "ผู้ใช้งาน" ทุกคนยื่นใบลาแทนเพื่อนร่วมงานได้เท่ากันหมด (ไม่แยกเฉพาะงานธุรการอีกต่อไป)
  const canFileForOthers = can(profile.role, 'leave', 'write');
  // หน้าแรก (default) ของทะเบียนคือรายชื่อบุคลากรเลยตามคำขอ — ตัดแท็บ "ใบลาของฉัน" และไม่จำกัดแท็บรายชื่อบุคลากรไว้เฉพาะ Super Admin อีกต่อไป
  const [tab, setTab] = useState('people');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [quota, setQuota] = useState(null);
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
    // เรียงตามวันที่ลาจากน้อยไปมาก (เก่าสุดก่อน) ให้อ่านเป็นทะเบียนไล่ตามลำดับเวลาตามคำขอ
    return onSnapshot(query(collection(db, 'leaves'), ...base),
      (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.start || '').localeCompare(b.start || ''))),
      (e) => setError(e.message));
  }, [fy, viewAll, profile.email]);

  // รายชื่อบุคลากรทั้งหมด: ใช้ทั้งหน้ารายชื่อบุคลากร (ทุกคนเห็นได้แล้ว) และตัวเลือก "มอบหมายงานให้" ในฟอร์มยื่นใบลา เรียงตามลำดับตำแหน่งที่กำหนด
  useEffect(() => {
    return onSnapshot(collection(db, 'users'),
      (s) => setPeople(s.docs.map((d) => d.data()).filter((u) => u.role !== 'pending').sort((a, b) => {
        const r = posRank(a.position) - posRank(b.position);
        return r !== 0 ? r : String(a.name || a.email).localeCompare(String(b.name || b.email), 'th');
      })),
      () => setPeople([]));
  }, []);
  const [quickForm, setQuickForm] = useState(null); // ยื่นใบลาแบบเร็วจากท้ายแถวในรายชื่อบุคลากร
  const [showCancel, setShowCancel] = useState(false);
  const [toDeleteRow, setToDeleteRow] = useState(null); // ลบแถวข้อมูลตรงๆ จากตาราง "ทั้งหมด" (Super Admin เท่านั้น)
  const [deletingRow, setDeletingRow] = useState(false);
  const [editDaysRow, setEditDaysRow] = useState(null); // แก้ไขจำนวนวันลาของแถวที่มีอยู่แล้ว (Super Admin เท่านั้น เช่น แก้ให้ตรงหลังหักวันหยุดราชการ)
  const isSuperAdmin = profile.role === 'super_admin';
  const [repairingGroup, setRepairingGroup] = useState(null);
  const [resendingId, setResendingId] = useState(null);

  // ส่งแจ้งเตือนไลน์ของใบลาแถวนี้ซ้ำอีกครั้ง (Super Admin เท่านั้น) — กรณีตอนยื่น/พิจารณาจริง ไลน์ไม่แจ้งเตือนด้วยสาเหตุใดก็ตาม
  // (เช่น ตอนนั้นยังปิดสวิตช์แจ้งเตือนอยู่ หรือเครือข่ายขัดข้องชั่วคราว) เรียก Cloud Function "resendLeaveNotification"
  const resendNotify = async (l) => {
    setResendingId(l.id);
    try {
      await httpsCallable(functions, 'resendLeaveNotification')({ leaveId: l.id });
      say({ type: 'ok', text: 'ส่งแจ้งเตือนไลน์ซ้ำแล้ว' });
    } catch (err) {
      say({ type: 'error', text: 'ส่งไม่สำเร็จ: ' + (err.message || err.code) });
    } finally { setResendingId(null); }
  };

  // ตรวจหาใบลาที่ "อีเมลหลุด" ไม่ตรงกับบัญชีผู้ใช้ปัจจุบันในระบบแล้ว (userEmail ของใบลาไม่พบในทะเบียนบุคลากรตอนนี้)
  // สาเหตุหลักคือเคยมีการเปลี่ยน Username/อีเมลภายในของบัญชีนั้นหลังยื่นใบลาไปแล้ว ทำให้การ์ดสรุปวันลาที่หน้า "รายชื่อบุคลากร"
  // จับคู่อีเมลไม่เจอ เลยนับเป็น 0 เสมอ (ทั้งที่ตารางทะเบียน "ทั้งหมด" ยังแสดงรายการถูกต้อง เพราะเก็บชื่อ/ตำแหน่งไว้ในตัวเอกสารเองอยู่แล้ว)
  // จับกลุ่มตามชื่อ (ตัดคำนำหน้าออกก่อนเทียบ) แล้วลองจับคู่กับบัญชีปัจจุบันที่ชื่อตรงกันพอดี 1 บัญชี เพื่อเสนอปุ่ม "ซ่อมแซม" ให้กดได้เลย
  const orphanGroups = useMemo(() => {
    if (!isSuperAdmin || !people || !rows) return [];
    const emailSet = new Set(people.map((p) => p.email));
    const byKey = new Map();
    rows.forEach((l) => {
      if (!l.userEmail || emailSet.has(l.userEmail)) return;
      const key = `${normalizeName(l.name || '')}__${l.userEmail}`;
      if (!byKey.has(key)) byKey.set(key, { name: l.name, oldEmail: l.userEmail, items: [] });
      byKey.get(key).items.push(l);
    });
    return Array.from(byKey.values()).map((g) => ({ ...g, match: people.filter((p) => normalizeName(p.name) === normalizeName(g.name)) }));
  }, [isSuperAdmin, people, rows]);

  const repairOrphanGroup = async (g) => {
    if (g.match.length !== 1) return;
    setRepairingGroup(g.oldEmail);
    try {
      const batch = writeBatch(db);
      g.items.forEach((l) => batch.update(doc(db, 'leaves', l.id), { userEmail: g.match[0].email }));
      await batch.commit();
      await writeAudit({ action: 'update', module: 'leave', label: `ซ่อมแซมอีเมลใบลาที่หลุด: ${g.name} (${g.items.length} รายการ) ${g.oldEmail} → ${g.match[0].email}` });
      say({ type: 'ok', text: `ซ่อมแซมอีเมลใบลาของ ${g.name} แล้ว ${g.items.length} รายการ` });
    } catch (err) {
      say({ type: 'error', text: 'ซ่อมแซมไม่สำเร็จ: ' + (err.code || err.message) });
    } finally { setRepairingGroup(null); }
  };

  const doDeleteRow = async () => {
    if (!toDeleteRow) return;
    setDeletingRow(true);
    try {
      await deleteDoc(doc(db, 'leaves', toDeleteRow.id));
      await writeAudit({ action: 'delete', module: 'leave', docId: toDeleteRow.id, label: `${toDeleteRow.name} ${toDeleteRow.type}`, before: { status: toDeleteRow.status } });
      say({ type: 'ok', text: 'ลบแถวข้อมูลออกจากทะเบียนแล้ว' });
      setToDeleteRow(null);
    } catch (err) {
      say({ type: 'error', text: 'ลบไม่สำเร็จ: ' + (err.code || err.message) });
    } finally { setDeletingRow(false); }
  };

  const list = tab === 'wait' ? (rows || []).filter((l) => l.status === 'รอพิจารณา') : rows || [];
  const waitCount = (rows || []).filter((l) => l.status === 'รอพิจารณา').length;

  const exportAll = () => exportXlsx(
    list.map((l) => ({ ชื่อ: l.name, ตำแหน่ง: l.position, ประเภท: l.type, ตั้งแต่: fmtDate(l.start), ถึง: fmtDate(l.end), จำนวนวัน: l.days, เหตุผล: l.reason, สถานะ: l.status, ผู้พิจารณา: l.decidedBy || '', หมายเหตุ: l.decisionNote || '' })),
    'วันลา', `วันลา-ปีงบ${fy}`,
  );

  const goTab = (k) => { setTab(k); setPerson(null); };

  // แท็บ: รายชื่อบุคลากร (หน้าแรก) + ทั้งหมด/รอพิจารณา (เฉพาะผู้มีสิทธิ์ดูรายการลาทุกคน) + รายงาน/สถิติการลา (ย้ายมารวมในทะเบียนนี้ตามคำขอ)
  const tabs = [
    ['people', 'รายชื่อบุคลากร'],
    ...(viewAll ? [['all', 'ทั้งหมด'], ['wait', `รอพิจารณา${waitCount ? ` (${waitCount})` : ''}`]] : []),
    ['reports', 'รายงาน/สถิติการลา'],
  ];

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-6">
      <PageHeader icon={CalendarDays} emoji="🗓️" title="ระบบควบคุมวันลา" subtitle={`ปีงบประมาณ ${fy} (1 ต.ค. - 30 ก.ย.)`}
        actions={<>
          {isSuperAdmin && <button className="btn btn-outline" onClick={() => goTab('all')}><Pencil className="h-5 w-5" /> แก้ไขวันลาบุคลากร</button>}
          <button className="btn btn-outline" onClick={() => setShowCancel(true)}><XCircle className="h-5 w-5" /> ยกเลิกวันลา</button>
        </>} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tabs.map(([k, l]) => <button key={k} onClick={() => goTab(k)} className={`rounded-full px-4 py-1.5 text-sm ${tab === k ? 'bg-brand-600 font-semibold text-white' : 'bg-white text-brand-800 ring-1 ring-brand-200 hover:bg-brand-50'}`}>{l}</button>)}
        {tab !== 'people' && tab !== 'reports' && viewAll && <button className="btn btn-outline ml-auto !py-1.5" onClick={exportAll} disabled={!list.length}><Download className="h-4 w-4" /> ส่งออก Excel</button>}
      </div>

      {isSuperAdmin && orphanGroups.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
          <div className="font-semibold text-amber-800">
            ⚠️ พบใบลา {orphanGroups.reduce((s, g) => s + g.items.length, 0)} รายการ ที่อีเมลในทะเบียนไม่ตรงกับบัญชีปัจจุบันของผู้ลาแล้ว (มักเกิดจากเคยเปลี่ยน Username/บัญชีภายหลังยื่นใบลา)
            ทำให้การ์ดสรุปวันลาที่แท็บ "รายชื่อบุคลากร" ไม่นับรวมรายการเหล่านี้ (แม้จะยังอยู่ครบในแท็บ "ทั้งหมด" ก็ตาม) — กดปุ่มด้านล่างเพื่อซ่อมแซมให้ตรงกับบัญชีปัจจุบัน
          </div>
          <ul className="mt-2 space-y-1.5">
            {orphanGroups.map((g) => (
              <li key={g.oldEmail + g.name} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/70 px-2 py-1.5">
                <span>{g.name} — {g.items.length} รายการ ({g.items.map((i) => `${i.type} ${fmtDate(i.start)}`).join(', ')})</span>
                {g.match.length === 1 ? (
                  <button className="btn btn-primary !px-2 !py-1 text-xs" disabled={repairingGroup === g.oldEmail} onClick={() => repairOrphanGroup(g)}>
                    {repairingGroup === g.oldEmail && <Loader2 className="h-3.5 w-3.5 animate-spin" />} ซ่อมแซมให้ตรงกับบัญชีปัจจุบัน
                  </button>
                ) : g.match.length === 0 ? (
                  <span className="text-xs text-red-600">ไม่พบบัญชีปัจจุบันที่ชื่อตรงกัน (ตรวจสอบเอง — อาจเป็นบัญชีที่ถูกลบไปแล้ว)</span>
                ) : (
                  <span className="text-xs text-red-600">พบบัญชีชื่อตรงกันมากกว่า 1 บัญชี (ต้องเลือกเอง)</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'people' && (
        person ? (
          <PersonDashboard person={person} rows={rows || []} quota={quota} fy={fy} canFileForOthers={canFileForOthers} isSelf={person.email === profile.email} people={people} onBack={() => setPerson(null)} say={say} />
        ) : (
          <PeopleList people={people} rows={rows || []} quota={quota} canFileForOthers={canFileForOthers} profileEmail={profile.email} onPick={setPerson} onQuickForm={setQuickForm} />
        )
      )}

      {(tab === 'all' || tab === 'wait') && (
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
                      <span className="flex flex-wrap gap-1">
                        <button className="btn btn-outline !px-2 !py-1 text-sm" title="พิมพ์ใบลา (PDF)" onClick={() => window.open(`${window.location.origin}${window.location.pathname}#/print-leave/${l.id}`, '_blank')}><Printer className="h-4 w-4" /></button>
                        {l.status === 'รอพิจารณา' && canApprove && (
                          <>
                            <button className="btn btn-primary !px-2 !py-1 text-sm" onClick={() => setDecide({ l, d: 'อนุมัติ' })}><Check className="h-4 w-4" /> อนุมัติ</button>
                            <button className="btn btn-outline !px-2 !py-1 text-sm" onClick={() => setDecide({ l, d: 'ไม่อนุมัติ' })}><X className="h-4 w-4" /></button>
                          </>
                        )}
                        {l.status === 'รอพิจารณา' && l.userEmail === profile.email && !canApprove && (
                          <button className="btn btn-outline !px-2 !py-1 text-sm" onClick={async () => {
                            try {
                              await updateDoc(doc(db, 'leaves', l.id), { status: 'ยกเลิก' });
                              await writeAudit({ action: 'update', module: 'leave', docId: l.id, label: `${l.name} ${l.type}`, before: { status: l.status }, after: { status: 'ยกเลิก' } });
                              say({ type: 'ok', text: 'ยกเลิกใบลาแล้ว' });
                            } catch (err) { say({ type: 'error', text: 'ไม่สำเร็จ: ' + (err.code || err.message) }); }
                          }}>ยกเลิก</button>
                        )}
                        {isSuperAdmin && (
                          <button className="btn btn-outline !px-2 !py-1 text-sm" title="แก้ไขจำนวนวันลา" onClick={() => setEditDaysRow(l)}><Pencil className="h-4 w-4" /></button>
                        )}
                        {isSuperAdmin && (
                          <button className="btn btn-outline !px-2 !py-1 text-sm" title="ส่งแจ้งเตือนไลน์ซ้ำ" disabled={resendingId === l.id} onClick={() => resendNotify(l)}>
                            {resendingId === l.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          </button>
                        )}
                        {isSuperAdmin && (
                          <button className="btn btn-outline !px-2 !py-1 text-sm text-red-600" title="ลบแถวนี้ออกจากทะเบียนถาวร" onClick={() => setToDeleteRow(l)}><Trash2 className="h-4 w-4" /></button>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'reports' && <LeaveReportsPanel />}

      {quickForm && quota && (
        <LeaveForm profile={quickForm} quota={quota} mine={(rows || []).filter((l) => l.userEmail === quickForm.email)} pageFy={fy} people={people} onClose={() => setQuickForm(null)} say={say} />
      )}
      {decide && <DecideModal leave={decide.l} decision={decide.d} by={profile.name || profile.email} onClose={() => setDecide(null)} say={say} />}
      {editDaysRow && <EditDaysModal leave={editDaysRow} onClose={() => setEditDaysRow(null)} say={say} />}
      {showCancel && <CancelPickerModal rows={rows || []} profile={profile} isSuperAdmin={isSuperAdmin} onClose={() => setShowCancel(false)} say={say} />}
      {toDeleteRow && (
        <ConfirmDialog
          message={`ลบแถวข้อมูล "${toDeleteRow.name} · ${toDeleteRow.type} · ${fmtDate(toDeleteRow.start)}-${fmtDate(toDeleteRow.end)}" ออกจากทะเบียนถาวรหรือไม่? (ลบแล้วกู้คืนไม่ได้)`}
          busy={deletingRow} onConfirm={doDeleteRow} onCancel={() => setToDeleteRow(null)}
        />
      )}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
