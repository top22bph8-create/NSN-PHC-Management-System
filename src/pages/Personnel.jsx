// ทำเนียบบุคลากร — ฐานข้อมูลบุคคลากรข้าราชการและลูกจ้างหน่วยงาน (ข้อมูลส่วนตัว/ประวัติราชการล้วนๆ)
// แยกออกจากหน้า "กำหนดผู้ใช้งาน/อนุมัติสมัครสมาชิก" (UserAccounts.jsx) แล้วตามที่แจ้ง — หน้านี้ไม่มี Username/รหัสผ่าน/บทบาท/
// สถานะเปิด-ปิดใช้งานอีกต่อไป (ย้ายไปอยู่หน้านั้นทั้งหมด) ดูได้ทุกคนที่ล็อกอิน แก้ไขได้เฉพาะ Super Admin (ACCESS.personnel ใน lib/roles.js)
// เพิ่มข้อมูลที่ควรมีสำหรับฐานข้อมูลบุคคลากรราชการ: ประเภทบุคลากร, เลขบัตรประชาชน, เบอร์โทรศัพท์, วุฒิการศึกษา
import { useEffect, useMemo, useState } from 'react';
import { doc, collection, onSnapshot, updateDoc } from 'firebase/firestore';
import { FileSpreadsheet, Loader2, Pencil, Printer, Search, Users } from 'lucide-react';
import { db } from '../firebase';
import { fmtDate, calcDuration, fmtDuration } from '../lib/thai';
import { exportXlsx } from '../lib/exportFile';
import ThaiDateInput from '../components/ThaiDateInput';
import { useAuth } from '../context/AuthContext';
import { canWrite } from '../lib/roles';
import { writeAudit } from '../lib/audit';
import { usernameOf } from '../lib/accounts';
import { Badge, EmptyState, ErrorState, Modal, Spinner, Toast } from '../components/ui';
import { PageHeader } from '../components/Logo';

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// ประเภทบุคลากร ตามที่ใช้จริงในหน่วยงานสาธารณสุขระดับ รพ.สต.
export const PERSONNEL_TYPES = ['ข้าราชการ', 'พนักงานราชการ', 'พนักงานกระทรวงสาธารณสุข', 'ลูกจ้างประจำ', 'ลูกจ้างชั่วคราว', 'จ้างเหมาบริการ', 'อื่นๆ'];

function EditPersonModal({ user, onClose, say }) {
  const [f, setF] = useState({
    name: user.name || '', position: user.position || '', personnelType: user.personnelType || '',
    idCard: user.idCard || '', phone: user.phone || '', education: user.education || '',
    birthday: user.birthday || '', startWorkDate: user.startWorkDate || '', civilServiceDate: user.civilServiceDate || '',
    vacationCarryOver: user.vacationCarryOver || 0,
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setDate = (k) => (v) => setF({ ...f, [k]: v });
  const age = calcDuration(f.birthday);
  const svcAge = calcDuration(f.civilServiceDate);

  const submit = async () => {
    if (f.idCard && !/^\d{13}$/.test(f.idCard.trim())) return say({ type: 'error', text: 'เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก (หรือเว้นว่างไว้)' });
    setBusy(true);
    try {
      const patch = {
        name: clean(f.name), position: clean(f.position), personnelType: f.personnelType,
        idCard: clean(f.idCard), phone: clean(f.phone), education: clean(f.education),
        birthday: f.birthday || '', startWorkDate: f.startWorkDate || '', civilServiceDate: f.civilServiceDate || '',
        vacationCarryOver: Number(f.vacationCarryOver) || 0,
      };
      await updateDoc(doc(db, 'users', user.email), patch);
      await writeAudit({ action: 'update', module: 'personnel', docId: user.email, label: `แก้ไขข้อมูลบุคลากร ${patch.name}` });
      say({ type: 'ok', text: 'บันทึกแล้ว' });
      onClose();
    } catch (err) {
      say({ type: 'error', text: 'ไม่สำเร็จ: ' + (err.code || err.message) });
    } finally { setBusy(false); }
  };

  return (
    <Modal title={`แก้ไขข้อมูลบุคลากร: ${user.name}`} onClose={onClose}
      footer={<button className="btn btn-primary w-full" onClick={submit} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} บันทึก</button>}>
      <div className="space-y-3">
        <div><label className="mb-1 block text-sm text-slate-600" htmlFor="pn">ชื่อ - สกุล</label><input id="pn" required className="input" value={f.name} onChange={set('name')} /></div>
        <div><label className="mb-1 block text-sm text-slate-600" htmlFor="po">ตำแหน่ง</label><input id="po" className="input" value={f.position} onChange={set('position')} /></div>
        <div>
          <label className="mb-1 block text-sm text-slate-600" htmlFor="pt">ประเภทบุคลากร</label>
          <select id="pt" className="input" value={f.personnelType} onChange={set('personnelType')}>
            <option value="">- ไม่ระบุ -</option>
            {PERSONNEL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="mb-1 block text-sm text-slate-600" htmlFor="pid">เลขบัตรประชาชน</label><input id="pid" className="input" value={f.idCard} onChange={set('idCard')} placeholder="13 หลัก" maxLength={13} /></div>
          <div><label className="mb-1 block text-sm text-slate-600" htmlFor="pph">เบอร์โทรศัพท์</label><input id="pph" className="input" value={f.phone} onChange={set('phone')} /></div>
        </div>
        <div><label className="mb-1 block text-sm text-slate-600" htmlFor="ped">วุฒิการศึกษา</label><input id="ped" className="input" value={f.education} onChange={set('education')} placeholder="เช่น ปริญญาตรี สาขา..." /></div>
        <div>
          <label className="mb-1 block text-sm text-slate-600" htmlFor="pbd">วันเดือนปีเกิด</label>
          <ThaiDateInput id="pbd" value={f.birthday} onChange={setDate('birthday')} yearsBack={80} yearsForward={0} />
          {age && <p className="mt-1 text-xs text-brand-700">อายุ {fmtDuration(age)}</p>}
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-600" htmlFor="pwd">วันมาปฏิบัติงาน ณ สถานบริการนี้</label>
          <ThaiDateInput id="pwd" value={f.startWorkDate} onChange={setDate('startWorkDate')} yearsBack={50} yearsForward={0} />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-600" htmlFor="pcsd">วันบรรจุเป็นข้าราชการ</label>
          <ThaiDateInput id="pcsd" value={f.civilServiceDate} onChange={setDate('civilServiceDate')} yearsBack={50} yearsForward={0} />
          {svcAge && <p className="mt-1 text-xs text-brand-700">อายุราชการ {fmtDuration(svcAge)}</p>}
        </div>
        <div><label className="mb-1 block text-sm text-slate-600" htmlFor="pvc">ยกยอดลาพักผ่อนสะสม (วัน)</label><input id="pvc" type="number" min="0" className="input" value={f.vacationCarryOver} onChange={set('vacationCarryOver')} /></div>
        <p className="text-xs text-slate-500">การเปลี่ยน Username/รหัสผ่าน/บทบาท ให้ไปที่เมนู "กำหนดผู้ใช้งาน/อนุมัติสมัครสมาชิก"</p>
      </div>
    </Modal>
  );
}

export default function Personnel() {
  const { profile } = useAuth();
  const writable = canWrite(profile.role, 'personnel');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const say = (t) => { setToast(t); setTimeout(() => setToast(null), 5000); };

  useEffect(
    () => onSnapshot(collection(db, 'users'), (s) => setRows(s.docs.map((d) => d.data()).filter((u) => u.role !== 'pending')
      .sort((a, b) => String(a.name || a.username || a.email).localeCompare(String(b.name || b.username || b.email), 'th', { numeric: true }))), (e) => setError(e.message)),
    [],
  );
  const shown = useMemo(() => (rows || []).filter((r) => !q.trim() || `${r.name} ${r.position} ${r.personnelType || ''} ${r.phone || ''}`.toLowerCase().includes(q.trim().toLowerCase())), [rows, q]);

  // ออกรายงานประวัติบุคลากรทั้งหมดเป็น Excel — ใช้ชุดข้อมูลเดียวกับตารางในหน้านี้ (ไม่กรองตามคำค้นหา เอาทุกคน)
  const doExportExcel = () => {
    if (!rows?.length) return say({ type: 'error', text: 'ไม่มีข้อมูลบุคลากรให้ออกรายงาน' });
    const data = rows.map((u) => ({
      'ชื่อ - สกุล': u.name || usernameOf(u.email),
      'ตำแหน่ง': u.position || '',
      'ประเภทบุคลากร': u.personnelType || '',
      'เลขบัตรประชาชน': u.idCard || '',
      'เบอร์โทรศัพท์': u.phone || '',
      'วุฒิการศึกษา': u.education || '',
      'วันเดือนปีเกิด': u.birthday ? fmtDate(u.birthday) : '',
      'อายุ': u.birthday ? fmtDuration(calcDuration(u.birthday)) : '',
      'วันมาปฏิบัติงาน': u.startWorkDate ? fmtDate(u.startWorkDate) : '',
      'วันบรรจุเป็นข้าราชการ': u.civilServiceDate ? fmtDate(u.civilServiceDate) : '',
      'อายุราชการ': u.civilServiceDate ? fmtDuration(calcDuration(u.civilServiceDate)) : '',
      'ยกยอดลาพักผ่อนสะสม(วัน)': u.vacationCarryOver || 0,
    }));
    exportXlsx(data, 'ทำเนียบบุคลากร', `ทำเนียบบุคลากร_${new Date().toISOString().slice(0, 10)}`);
    writeAudit({ action: 'export', module: 'personnel', label: `รายงานประวัติบุคลากร (Excel) ${rows.length} รายการ` }).catch(() => {});
  };
  const openPrintPersonnel = () => window.open(`${window.location.origin}${window.location.pathname}#/print-personnel`, '_blank');

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-6">
      <PageHeader icon={Users} emoji="👥" title="ทำเนียบบุคลากร" subtitle="ฐานข้อมูลบุคคลากรข้าราชการและลูกจ้างหน่วยงาน (จัดการ Username/บทบาท/บัญชีผู้ใช้ ที่เมนู “กำหนดผู้ใช้งาน”)"
        actions={
          <div className="flex flex-wrap gap-2">
            <button className="btn bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25" onClick={doExportExcel} title="ออกรายงานประวัติบุคลากรเป็น Excel"><FileSpreadsheet className="h-4 w-4" /> Excel</button>
            <button className="btn bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25" onClick={openPrintPersonnel} title="เปิดหน้าพิมพ์รายงาน แล้วเลือก บันทึกเป็น PDF"><Printer className="h-4 w-4" /> PDF</button>
          </div>
        } />
      <div className="relative mb-3 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-brand-400" />
        <input className="input !pl-10" placeholder="ค้นหาชื่อ ตำแหน่ง ประเภทบุคลากร หรือเบอร์โทร" value={q} onChange={(e) => setQ(e.target.value)} aria-label="ค้นหาบุคลากร" />
      </div>
      <div className="card overflow-x-auto">
        {error ? <ErrorState message={error} /> : rows === null ? <Spinner /> : shown.length === 0 ? <EmptyState title="ยังไม่มีข้อมูลบุคลากร" hint="เพิ่มบัญชีผู้ใช้งานที่เมนู “กำหนดผู้ใช้งาน/อนุมัติสมัครสมาชิก” ก่อน แล้วค่อยกลับมากรอกข้อมูลส่วนตัวที่นี่" /> : (
          <table className="w-full min-w-[1400px] table-fixed text-left">
            <thead className="bg-brand-50 text-sm text-slate-600">
              <tr>
                <th className="w-44 px-3 py-2">ชื่อ - สกุล</th><th className="w-44 px-3 py-2">ตำแหน่ง</th><th className="w-36 px-3 py-2">ประเภทบุคลากร</th>
                <th className="w-28 px-3 py-2">เบอร์โทร</th><th className="w-36 px-3 py-2">วันเกิด / อายุ</th><th className="w-28 px-3 py-2">วันมาปฏิบัติงาน</th>
                <th className="w-40 px-3 py-2">วันบรรจุ / อายุราชการ</th><th className="w-28 px-3 py-2">ยกยอดลาพักผ่อนสะสม</th>{writable && <th className="w-16 px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.email} className="border-t border-slate-100">
                  <td className="truncate px-3 py-2" title={u.name || ''}>{u.name || usernameOf(u.email)}</td>
                  <td className="truncate px-3 py-2 text-sm text-slate-600" title={u.position || ''}>{u.position || '-'}</td>
                  <td className="px-3 py-2 text-sm">{u.personnelType ? <Badge className="bg-brand-100 text-brand-800">{u.personnelType}</Badge> : <span className="text-slate-400">-</span>}</td>
                  <td className="truncate px-3 py-2 text-sm text-slate-600">{u.phone || '-'}</td>
                  <td className="px-3 py-2 text-sm text-slate-600">
                    {u.birthday ? (<>🎂 {fmtDate(u.birthday)}<div className="text-xs text-slate-400">อายุ {fmtDuration(calcDuration(u.birthday))}</div></>) : '-'}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-600">{u.startWorkDate ? fmtDate(u.startWorkDate) : '-'}</td>
                  <td className="px-3 py-2 text-sm text-slate-600">
                    {u.civilServiceDate ? (<>{fmtDate(u.civilServiceDate)}<div className="text-xs text-slate-400">อายุราชการ {fmtDuration(calcDuration(u.civilServiceDate))}</div></>) : '-'}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-600">{u.vacationCarryOver || 0}</td>
                  {writable && (
                    <td className="px-3 py-2"><button className="btn btn-outline !px-2 !py-1 text-sm" onClick={() => setModal(u)} title="แก้ไขข้อมูลบุคลากร"><Pencil className="h-4 w-4" /></button></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {modal && <EditPersonModal user={modal} onClose={() => setModal(null)} say={say} />}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
