// หน้า "กำหนดผู้ใช้งาน/อนุมัติสมัครสมาชิก" — แยกออกมาจาก "ทำเนียบบุคลากร" (Personnel.jsx) ตามที่แจ้ง
// เดิมทั้งสองเมนูชี้ไปหน้าเดียวกัน (ซ้ำกัน) ตอนนี้แยกจริง: หน้านี้ดูแลเฉพาะเรื่อง "บัญชีผู้ใช้งาน" ล้วนๆ
// (Username/รหัสผ่าน/บทบาท/สถานะเปิด-ปิดใช้งาน/อนุมัติสมัครสมาชิก) ส่วนข้อมูลส่วนตัว/ประวัติราชการย้ายไปอยู่ที่
// หน้า "ทำเนียบบุคลากร" แทน (Super Admin เท่านั้นที่เข้าหน้านี้ได้ ทั้งดูและแก้ไข — ดู ACCESS.users ใน lib/roles.js)
import { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Eye, EyeOff, FileSpreadsheet, KeyRound, Loader2, Pencil, Search, ShieldAlert, Trash2, UserPlus } from 'lucide-react';
import { db, functions } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { ASSIGNABLE_ROLES, PENDING_LABEL, ROLES, canWrite, normalizeRole } from '../lib/roles';
import { writeAudit } from '../lib/audit';
import { createAuthAccount, toEmail, usernameOf } from '../lib/accounts';
import { Badge, ConfirmDialog, EmptyState, ErrorState, Modal, Spinner, Toast } from '../components/ui';
import { PageHeader } from '../components/Logo';

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

const authMsg = (code) =>
  ({
    'auth/operation-not-allowed': 'Firebase ยังไม่อนุญาตให้สร้างบัญชี: เปิด Authentication → Settings → User actions → Enable create (sign-up) ชั่วคราว',
    'auth/email-already-in-use': 'มีบัญชีล็อกอินนี้แล้ว',
    'auth/admin-restricted-operation': 'Firebase ยังไม่อนุญาตให้สร้างบัญชี: เปิด Authentication → Settings → User actions → Enable create (sign-up) ชั่วคราว',
  })[code] || code;

async function readSheet(file) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer());
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  const pick = (r, ...keys) => {
    const k = Object.keys(r).find((x) => keys.some((w) => clean(x).toLowerCase().includes(w)));
    return k ? clean(r[k]) : '';
  };
  return rows
    .map((r) => ({ username: pick(r, 'user', 'ชื่อผู้ใช้').toLowerCase(), password: pick(r, 'รหัสผ่าน', 'password'), name: pick(r, 'ชื่อ', 'name'), position: pick(r, 'ตำแหน่ง', 'position'), role: 'staff' }))
    .filter((r) => r.username && r.password && r.name);
}

function ImportModal({ existing, onClose, say }) {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState({});
  const [stop, setStop] = useState('');

  const pickFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const r = await readSheet(f);
      if (!r.length) return say({ type: 'error', text: 'ไม่พบข้อมูล: ต้องมีคอลัมน์ USER, รหัสผ่าน, ชื่อ - สกุล, ตำแหน่ง' });
      setRows(r); setResult({}); setStop('');
    } catch (err) {
      say({ type: 'error', text: 'อ่านไฟล์ไม่สำเร็จ: ' + err.message });
    }
  };

  const run = async () => {
    setBusy(true); setStop('');
    const res = {};
    for (const r of rows) {
      const email = toEmail(r.username);
      if (existing.has(email)) { res[r.username] = 'ข้าม: มีในระบบแล้ว'; setResult({ ...res }); continue; }
      try {
        try {
          await createAuthAccount(email, r.password);
        } catch (e) {
          if (e.code !== 'auth/email-already-in-use') throw e; // มีบัญชีล็อกอินอยู่แล้ว: สร้างเฉพาะข้อมูลสิทธิ์
        }
        await setDoc(doc(db, 'users', email), {
          email, username: r.username, name: r.name, position: r.position, role: r.role,
          active: true, mustChangePassword: true, createdAt: serverTimestamp(),
        });
        await setDoc(doc(db, 'credentials', email), { username: r.username, password: r.password });
        await writeAudit({ action: 'create', module: 'users', docId: email, label: r.name, after: { role: r.role, position: r.position } });
        res[r.username] = 'สำเร็จ';
      } catch (e) {
        res[r.username] = 'ไม่สำเร็จ: ' + authMsg(e.code || e.message);
        if (['auth/operation-not-allowed', 'auth/admin-restricted-operation'].includes(e.code)) { setStop(authMsg(e.code)); setResult({ ...res }); break; }
      }
      setResult({ ...res });
    }
    setBusy(false);
  };

  const okCount = Object.values(result).filter((v) => v === 'สำเร็จ').length;
  return (
    <Modal wide title="นำเข้ารายชื่อจากไฟล์ Excel" onClose={busy ? () => {} : onClose}
      footer={<>
        <button className="btn btn-outline" onClick={onClose} disabled={busy}>ปิด</button>
        {rows && <button className="btn btn-primary" onClick={run} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} สร้างบัญชี {rows.length} รายการ</button>}
      </>}>
      <p className="mb-3 text-sm text-slate-600">
        ไฟล์ต้องมีหัวคอลัมน์: <b>USER, รหัสผ่าน, ชื่อ - สกุล, ตำแหน่ง</b> ระบบอ่านไฟล์ในเครื่องของท่านเท่านั้น ไม่มีการเก็บรหัสผ่านไว้ในฐานข้อมูล
        ผู้ใช้จะถูกบังคับเปลี่ยนรหัสผ่านตอนเข้าใช้งานครั้งแรก ทุกบัญชีที่นำเข้าจะได้บทบาท "ผู้ใช้งาน" (ปรับเป็น Super Admin ทีหลังได้ในตาราง)
        ส่วนวันเกิด/วันบรรจุราชการ ฯลฯ ให้ไปกรอกเพิ่มที่หน้า "ทำเนียบบุคลากร"
      </p>
      <input type="file" accept=".xlsx,.xls" onChange={pickFile} className="mb-3 block w-full text-sm" aria-label="เลือกไฟล์ Excel" disabled={busy} />
      {stop && <p className="mb-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-800" role="alert">{stop}</p>}
      {okCount > 0 && !busy && <p className="mb-3 rounded-lg bg-brand-50 p-2 text-sm text-brand-800">สร้างสำเร็จ {okCount} รายการ</p>}
      {rows && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-brand-50 text-slate-600"><tr><th className="px-2 py-1">USER</th><th className="px-2 py-1">ชื่อ - สกุล</th><th className="px-2 py-1">ตำแหน่ง</th><th className="px-2 py-1">ผล</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.username} className="border-t border-slate-100">
                  <td className="px-2 py-1">{r.username}</td><td className="px-2 py-1">{r.name}</td><td className="px-2 py-1">{r.position}</td>
                  <td className={`px-2 py-1 ${result[r.username]?.startsWith('ไม่') ? 'text-red-600' : 'text-slate-600'}`}>{result[r.username] || (existing.has(toEmail(r.username)) ? 'มีในระบบแล้ว' : '-')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

function AddModal({ existing, onClose, say }) {
  const [f, setF] = useState({ username: '', password: '', name: '', position: '', role: 'staff' });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const username = f.username.trim().toLowerCase();
    const email = toEmail(username);
    if (!/^[a-z0-9._@-]+$/.test(username)) return say({ type: 'error', text: 'ชื่อผู้ใช้ใช้ได้เฉพาะ a-z ตัวเลข . _ -' });
    if (existing.has(email)) return say({ type: 'error', text: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' });
    setBusy(true);
    try {
      try { await createAuthAccount(email, f.password); } catch (err) { if (err.code !== 'auth/email-already-in-use') throw err; }
      await setDoc(doc(db, 'users', email), { email, username, name: clean(f.name), position: clean(f.position), role: f.role, active: true, mustChangePassword: true, createdAt: serverTimestamp() });
      await setDoc(doc(db, 'credentials', email), { username, password: f.password });
      await writeAudit({ action: 'create', module: 'users', docId: email, label: clean(f.name), after: { role: f.role } });
      say({ type: 'ok', text: 'เพิ่มบัญชีผู้ใช้งานแล้ว ไปกรอกข้อมูลส่วนตัว/ประวัติราชการเพิ่มที่หน้า "ทำเนียบบุคลากร" ได้เลย' });
      onClose();
    } catch (err) {
      say({ type: 'error', text: 'ไม่สำเร็จ: ' + authMsg(err.code || err.message) });
    } finally { setBusy(false); }
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="เพิ่มบัญชีผู้ใช้งาน" onClose={onClose}
      footer={<button className="btn btn-primary w-full" onClick={submit} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} เพิ่ม</button>}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="mb-1 block text-sm text-slate-600" htmlFor="au">ชื่อผู้ใช้ (Username)</label><input id="au" required className="input" value={f.username} onChange={set('username')} /></div>
          <div><label className="mb-1 block text-sm text-slate-600" htmlFor="ap">รหัสผ่านเริ่มต้น</label><input id="ap" required className="input" value={f.password} onChange={set('password')} /></div>
        </div>
        <div><label className="mb-1 block text-sm text-slate-600" htmlFor="an">ชื่อ - สกุล</label><input id="an" required className="input" value={f.name} onChange={set('name')} /></div>
        <div><label className="mb-1 block text-sm text-slate-600" htmlFor="ao">ตำแหน่ง</label><input id="ao" className="input" value={f.position} onChange={set('position')} /></div>
        <div><label className="mb-1 block text-sm text-slate-600" htmlFor="ar">บทบาท</label>
          <select id="ar" className="input" value={f.role} onChange={set('role')}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <p className="text-xs text-slate-500">ต้องเปิด Enable create (sign-up) ใน Firebase Authentication ชั่วคราวระหว่างสร้างบัญชี</p>
      </div>
    </Modal>
  );
}

function ResetModal({ user, onClose, say }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      await createAuthAccount(user.email, pw);
      await updateDoc(doc(db, 'users', user.email), { mustChangePassword: true });
      await setDoc(doc(db, 'credentials', user.email), { username: usernameOf(user.email), password: pw }, { merge: true });
      await writeAudit({ action: 'update', module: 'users', docId: user.email, label: `ตั้งรหัสเริ่มต้นใหม่ ${user.name}` });
      say({ type: 'ok', text: 'ตั้งรหัสเริ่มต้นใหม่แล้ว' });
      onClose();
    } catch (err) {
      say({ type: 'error', text: err.code === 'auth/email-already-in-use' ? 'ยังมีบัญชีล็อกอินเดิมอยู่ ต้องลบผู้ใช้นี้ที่ Firebase Console → Authentication ก่อน แล้วลองใหม่' : 'ไม่สำเร็จ: ' + authMsg(err.code || err.message) });
    } finally { setBusy(false); }
  };
  return (
    <Modal title={`ตั้งรหัสเริ่มต้นใหม่: ${user.name}`} onClose={onClose}
      footer={<button className="btn btn-primary w-full" onClick={go} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} ยืนยัน</button>}>
      <div className="space-y-3">
        <ol className="list-decimal pl-5 text-sm text-slate-600">
          <li>ที่ Firebase Console → Authentication → Users ลบผู้ใช้ <b>{usernameOf(user.email)}@nsnphc.example</b></li>
          <li>เปิด Enable create (sign-up) ชั่วคราว แล้วกรอกรหัสเริ่มต้นใหม่ด้านล่าง</li>
        </ol>
        <input required className="input" placeholder="รหัสผ่านเริ่มต้นใหม่" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="รหัสผ่านเริ่มต้นใหม่" />
      </div>
    </Modal>
  );
}

// เปลี่ยน Username/Password ของบัญชี (Super Admin เท่านั้น) — ไม่แตะชื่อ-สกุล/ตำแหน่ง/ข้อมูลส่วนตัวอื่นๆ อีกต่อไป
// (ย้ายไปแก้ที่หน้า "ทำเนียบบุคลากร" แทน) เปลี่ยน Username ต้องสร้างบัญชี Auth ใหม่ภายใต้อีเมลใหม่ (ย้ายข้อมูลเดิมทั้งหมด
// ไปเอกสารใหม่ด้วย spread ...user ลบเอกสารเดิม) บัญชี Auth เดิมจะค้างอยู่แต่ใช้งานต่อไม่ได้แล้วเพราะไม่มีโปรไฟล์
function EditAccountModal({ user, onClose, say, prefill }) {
  const [f, setF] = useState({ username: prefill?.username || usernameOf(user.email), password: prefill?.password || '' });
  const [busy, setBusy] = useState(false);
  const [needDelete, setNeedDelete] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async () => {
    setNeedDelete(false);
    const newUsername = f.username.trim().toLowerCase();
    if (!/^[a-z0-9._@-]+$/.test(newUsername)) return say({ type: 'error', text: 'ชื่อผู้ใช้ใช้ได้เฉพาะ a-z ตัวเลข . _ -' });
    const usernameChanged = newUsername !== usernameOf(user.email);
    setBusy(true);
    try {
      if (usernameChanged) {
        const newEmail = toEmail(newUsername);
        let pw = f.password.trim();
        if (!pw) {
          const cSnap = await getDoc(doc(db, 'credentials', user.email));
          pw = cSnap.exists() ? cSnap.data().password : '';
        }
        if (!pw) { say({ type: 'error', text: 'ไม่พบรหัสผ่านเดิมที่บันทึกไว้ กรุณากรอกรหัสผ่านใหม่สำหรับชื่อผู้ใช้นี้ด้วย' }); setBusy(false); return; }
        await createAuthAccount(newEmail, pw);
        await setDoc(doc(db, 'users', newEmail), { ...user, email: newEmail, username: newUsername, updatedAt: serverTimestamp() });
        await setDoc(doc(db, 'credentials', newEmail), { username: newUsername, password: pw });
        await deleteDoc(doc(db, 'users', user.email));
        await deleteDoc(doc(db, 'credentials', user.email)).catch(() => {});
        await writeAudit({ action: 'update', module: 'users', docId: newEmail, label: `เปลี่ยน Username ${usernameOf(user.email)} → ${newUsername}` });
        say({ type: 'ok', text: `เปลี่ยน Username แล้ว เข้าสู่ระบบด้วย "${newUsername}" ได้ทันที (บัญชีเดิมใน Firebase Authentication จะค้างอยู่แต่ใช้งานไม่ได้แล้ว ลบทิ้งเองที่ Console ภายหลังได้)` });
        onClose();
        return;
      }
      if (f.password.trim()) {
        try {
          await createAuthAccount(user.email, f.password.trim());
          await updateDoc(doc(db, 'users', user.email), { mustChangePassword: true });
          await setDoc(doc(db, 'credentials', user.email), { username: newUsername, password: f.password.trim() }, { merge: true });
        } catch (err) {
          if (err.code === 'auth/email-already-in-use') { setNeedDelete(true); setBusy(false); return; }
          throw err;
        }
      }
      await writeAudit({ action: 'update', module: 'users', docId: user.email, label: `แก้ไขบัญชี ${user.name}` });
      say({ type: 'ok', text: 'บันทึกแล้ว' });
      onClose();
    } catch (err) {
      say({ type: 'error', text: 'ไม่สำเร็จ: ' + authMsg(err.code || err.message) });
    } finally { setBusy(false); }
  };

  return (
    <Modal title={`แก้ไขบัญชี: ${user.name}`} onClose={onClose}
      footer={<button className="btn btn-primary w-full" onClick={submit} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} บันทึก</button>}>
      <div className="space-y-3">
        <div><label className="mb-1 block text-sm text-slate-600" htmlFor="eu">ชื่อผู้ใช้ (Username)</label><input id="eu" required className="input" value={f.username} onChange={set('username')} /></div>
        <div>
          <label className="mb-1 block text-sm text-slate-600" htmlFor="ep">รหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)</label>
          <input id="ep" className="input" value={f.password} onChange={set('password')} placeholder="เว้นว่าง = ใช้รหัสเดิม" />
        </div>
        {f.username.trim().toLowerCase() !== usernameOf(user.email) && (
          <p className="rounded-lg bg-brand-50 p-2 text-xs text-brand-800">กำลังเปลี่ยนชื่อผู้ใช้ — ถ้าไม่กรอกรหัสผ่านใหม่ ระบบจะใช้รหัสผ่านเดิมของบัญชีนี้ที่บันทึกไว้ให้อัตโนมัติ</p>
        )}
        {needDelete && (
          <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800">
            ยังมีบัญชีล็อกอินเดิมอยู่ ต้องไปที่ Firebase Console → Authentication → Users ลบผู้ใช้ <b>{usernameOf(user.email)}@nsnphc.example</b> ก่อน แล้วกดยืนยันอีกครั้ง
          </p>
        )}
      </div>
    </Modal>
  );
}

// รีเซ็ตรหัสผ่านของทุกคนพร้อมกัน (ยกเว้น Super Admin และบัญชี "รอสมัครใหม่") เป็นรหัสผ่านเดียวกัน โดย Username ของแต่ละคนยังคงเดิม
// เรียก Cloud Function "adminBulkResetPassword" (functions/index.js) ซึ่งใช้ Admin SDK แก้รหัสผ่านของทุกบัญชีได้โดยตรงในคำสั่งเดียว
function BulkResetModal({ onClose, say }) {
  const [pw, setPw] = useState('05449');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const go = async () => {
    if (!confirmed) return;
    setBusy(true);
    setResult(null);
    try {
      const call = httpsCallable(functions, 'adminBulkResetPassword');
      const res = await call({ password: pw });
      const data = res.data || { success: [], failed: [] };
      setResult(data);
      await writeAudit({ action: 'update', module: 'users', docId: 'bulk', label: `รีเซ็ตรหัสผ่านทุกคน (สำเร็จ ${data.success?.length || 0} คน)` });
      say({ type: data.failed?.length ? 'error' : 'ok', text: `รีเซ็ตรหัสผ่านสำเร็จ ${data.success?.length || 0} คน${data.failed?.length ? ` ไม่สำเร็จ ${data.failed.length} คน` : ''}` });
    } catch (err) {
      say({ type: 'error', text: 'ไม่สำเร็จ: ' + (err.message || String(err)) });
    } finally { setBusy(false); }
  };

  return (
    <Modal title="รีเซ็ตรหัสผ่านทุกคนพร้อมกัน" onClose={onClose}
      footer={!result && <button className="btn btn-primary w-full" onClick={go} disabled={busy || !confirmed}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} ยืนยันรีเซ็ตรหัสผ่านทุกคน</button>}>
      {!result ? (
        <div className="space-y-3">
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            คำสั่งนี้จะตั้งรหัสผ่านใหม่เป็นค่าเดียวกันให้กับผู้ใช้งาน <b>ทุกคน ยกเว้น Super Admin</b> (และบัญชี "รอสมัครใหม่") — Username ของแต่ละคนจะยังคงเดิม
            ทุกคนจะต้องเปลี่ยนรหัสผ่านใหม่เองตอนล็อกอินครั้งถัดไป การกระทำนี้ย้อนกลับไม่ได้
          </p>
          <div>
            <label className="mb-1 block text-sm text-slate-600" htmlFor="brp">รหัสผ่านใหม่ (ตั้งให้ทุกคน)</label>
            <input id="brp" required className="input" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="รหัสผ่านใหม่สำหรับทุกคน" />
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5 h-5 w-5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            ยืนยันว่าต้องการรีเซ็ตรหัสผ่านของผู้ใช้งานทุกคน (ยกเว้น Super Admin) เป็นรหัสผ่านนี้
          </label>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="rounded-lg bg-brand-50 p-3 text-brand-900">สำเร็จ {result.success?.length || 0} คน{result.failed?.length ? ` · ไม่สำเร็จ ${result.failed.length} คน` : ''}</p>
          {result.failed?.length > 0 && (
            <ul className="max-h-48 list-disc space-y-1 overflow-y-auto rounded-lg bg-red-50 p-3 pl-7 text-red-800">
              {result.failed.map((f) => <li key={f.email}>{f.name || f.email}: {f.reason}</li>)}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function UserAccounts() {
  const { profile } = useAuth();
  const writable = canWrite(profile.role, 'users');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [creds, setCreds] = useState({});
  const [showPw, setShowPw] = useState({});
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [requests, setRequests] = useState([]);
  const say = (t) => { setToast(t); setTimeout(() => setToast(null), 5000); };

  useEffect(
    () => onSnapshot(collection(db, 'users'), (s) => setRows(s.docs.map((d) => d.data()).sort((a, b) => {
      const pa = a.role === 'pending' ? 0 : 1;
      const pb = b.role === 'pending' ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return String(a.username || a.email).localeCompare(String(b.username || b.email), 'th', { numeric: true });
    })), (e) => setError(e.message)),
    [],
  );
  useEffect(() => onSnapshot(collection(db, 'credentials'), (s) => {
    const m = {};
    s.docs.forEach((d) => { m[d.id] = d.data().password; });
    setCreds(m);
  }, () => {}), []);
  useEffect(() => onSnapshot(collection(db, 'accountChangeRequests'), (s) => {
    setRequests(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => r.status === 'รอดำเนินการ'));
  }, () => {}), []);
  const existing = useMemo(() => new Set((rows || []).map((r) => r.email)), [rows]);
  const shown = (rows || []).filter((r) => !q.trim() || `${r.name} ${r.position} ${r.username || ''} ${r.email}`.toLowerCase().includes(q.trim().toLowerCase()));

  const change = async (u, patch, what) => {
    try {
      await updateDoc(doc(db, 'users', u.email), patch);
      await writeAudit({ action: 'update', module: 'users', docId: u.email, label: u.name || u.email, before: { [what]: u[what] }, after: { [what]: patch[what] } });
      say({ type: 'ok', text: 'บันทึกแล้ว' });
    } catch (err) {
      say({ type: 'error', text: 'ไม่สำเร็จ: ' + (err.code || err.message) });
    }
  };

  const doDelete = async () => {
    const u = toDelete;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'users', u.email));
      await deleteDoc(doc(db, 'credentials', u.email)).catch(() => {});
      await writeAudit({ action: 'delete', module: 'users', docId: u.email, label: u.name || u.email });
      say({ type: 'ok', text: `ลบ ${u.name || usernameOf(u.email)} ออกจากระบบแล้ว` });
      setToDelete(null);
    } catch (err) {
      say({ type: 'error', text: 'ลบไม่สำเร็จ: ' + (err.code || err.message) });
    } finally { setDeleting(false); }
  };

  const dismissRequest = (id) => deleteDoc(doc(db, 'accountChangeRequests', id)).catch(() => {});

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-6">
      <PageHeader icon={KeyRound} emoji="🔑" title="กำหนดผู้ใช้งาน/อนุมัติสมัครสมาชิก" subtitle="บัญชีผู้ใช้งาน, บทบาท, สถานะเปิด-ปิดใช้งาน และการสมัครสมาชิก (ข้อมูลส่วนตัว/ประวัติราชการ ไปที่ “ทำเนียบบุคลากร”)"
        actions={writable && (
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-outline" onClick={() => setModal({ t: 'import' })}><FileSpreadsheet className="h-5 w-5" /> นำเข้า Excel</button>
            <button className="btn btn-primary" onClick={() => setModal({ t: 'add' })}><UserPlus className="h-5 w-5" /> เพิ่มบัญชี</button>
            <button className="btn btn-outline text-red-700" onClick={() => setModal({ t: 'bulkReset' })}><ShieldAlert className="h-5 w-5" /> รีเซ็ตรหัสผ่านทุกคน</button>
          </div>
        )} />
      {requests.length > 0 && (
        <div className="card mb-4 border-amber-200 bg-amber-50 p-4">
          <h2 className="mb-2 text-sm font-bold text-amber-900">คำขอเปลี่ยน Username/Password จากหน้าล็อกอิน ({requests.length})</h2>
          <ul className="space-y-2">
            {requests.map((r) => (
              <li key={r.id} className="rounded-lg bg-white p-3 text-sm shadow-sm">
                <p>Username ปัจจุบัน: <b>{r.currentUsername}</b></p>
                {r.wantUsername && <p>ต้องการเปลี่ยนเป็น Username: <b>{r.wantUsername}</b></p>}
                {r.wantPassword && <p>ต้องการเปลี่ยนรหัสผ่านเป็น: <b>{r.wantPassword}</b></p>}
                {r.note && <p className="text-slate-600">หมายเหตุ: {r.note}</p>}
                <div className="mt-2 flex gap-2">
                  {(() => {
                    const target = (rows || []).find((u) => usernameOf(u.email) === r.currentUsername);
                    return target ? (
                      <button className="btn btn-outline !py-1 text-xs" onClick={() => { setModal({ t: 'edit', u: target, prefill: { username: r.wantUsername || usernameOf(target.email), password: r.wantPassword || '' } }); }}>เปิดแก้ไขให้</button>
                    ) : <span className="text-xs text-slate-500">ไม่พบผู้ใช้นี้ในระบบ</span>;
                  })()}
                  <button className="btn btn-outline !py-1 text-xs text-red-600" onClick={() => dismissRequest(r.id)}>ปิดคำขอ</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="relative mb-3 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-brand-400" />
        <input className="input !pl-10" placeholder="ค้นหาชื่อ ตำแหน่ง หรือ Username" value={q} onChange={(e) => setQ(e.target.value)} aria-label="ค้นหาบัญชีผู้ใช้งาน" />
      </div>
      <div className="card overflow-x-auto">
        {error ? <ErrorState message={error} /> : rows === null ? <Spinner /> : shown.length === 0 ? <EmptyState title="ยังไม่มีบัญชีผู้ใช้งาน" hint={writable ? 'กด "นำเข้า Excel" เพื่อเพิ่มรายชื่อทั้งหมดพร้อมกัน' : ''} /> : (
          <table className="w-full min-w-[920px] table-fixed text-left">
            <thead className="bg-brand-50 text-sm text-slate-600"><tr><th className="w-32 px-3 py-2">Username</th><th className="w-28 px-3 py-2">รหัสผ่าน</th><th className="w-44 px-3 py-2">ชื่อ - สกุล</th><th className="w-40 px-3 py-2">ตำแหน่ง</th><th className="w-32 px-3 py-2">บทบาท</th><th className="w-32 px-3 py-2">สถานะ</th>{writable && <th className="w-28 px-3 py-2" />}</tr></thead>
            <tbody>
              {shown.map((u) => {
                const me = u.email === profile.email;
                const pending = u.role === 'pending';
                const roleValue = pending ? 'pending' : normalizeRole(u.role);
                return (
                  <tr key={u.email} className={`border-t border-slate-100 ${pending ? 'bg-amber-50/60' : ''}`}>
                    <td className="truncate px-3 py-2 font-mono text-sm">
                      {usernameOf(u.email)}{me && <Badge className="ml-2 bg-brand-100 text-brand-800">คุณ</Badge>}
                      {pending && <div className="mt-0.5"><Badge className="bg-amber-100 text-amber-800">รอสมัครใหม่</Badge></div>}
                    </td>
                    <td className="px-3 py-2 font-mono text-sm">
                      {creds[u.email] ? (
                        <span className="flex items-center gap-1">
                          {showPw[u.email] ? creds[u.email] : '••••••••'}
                          <button type="button" className="text-slate-400 hover:text-brand-700" onClick={() => setShowPw({ ...showPw, [u.email]: !showPw[u.email] })} aria-label="แสดง/ซ่อนรหัสผ่าน">
                            {showPw[u.email] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </span>
                      ) : <span className="text-slate-400">-</span>}
                    </td>
                    <td className="truncate px-3 py-2" title={u.name || ''}>{u.name || '-'}</td>
                    <td className="truncate px-3 py-2 text-sm text-slate-600" title={u.position || ''}>{u.position || '-'}</td>
                    <td className="px-3 py-2">
                      {writable ? (
                        <select className="input !w-full !py-1" value={roleValue} disabled={me} onChange={(e) => change(u, { role: e.target.value }, 'role')} aria-label={`บทบาทของ ${u.name}`}>
                          {pending && <option value="pending">{PENDING_LABEL}</option>}
                          {Object.entries(ASSIGNABLE_ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      ) : (pending ? PENDING_LABEL : ROLES[roleValue])}
                    </td>
                    <td className="px-3 py-2">
                      {writable ? (
                        <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={!!u.active} disabled={me} onChange={(e) => change(u, { active: e.target.checked }, 'active')} /> {u.active ? 'ใช้งาน' : 'ระงับ'}</label>
                      ) : <Badge className={u.active ? 'bg-brand-100 text-brand-800' : 'bg-slate-200 text-slate-600'}>{u.active ? 'ใช้งาน' : 'ระงับ'}</Badge>}
                      {u.mustChangePassword && <div className="text-xs text-amber-700">ยังไม่เปลี่ยนรหัสผ่าน</div>}
                      {pending && writable && <div className="text-xs text-amber-700">เลือกบทบาทแล้วติ๊ก "ใช้งาน" เพื่ออนุมัติ</div>}
                    </td>
                    {writable && (
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button className="btn btn-outline !px-2 !py-1 text-sm" onClick={() => setModal({ t: 'reset', u })} title="ตั้งรหัสเริ่มต้นใหม่"><KeyRound className="h-4 w-4" /></button>
                          <button className="btn btn-outline !px-2 !py-1 text-sm" onClick={() => setModal({ t: 'edit', u })} title="แก้ไข Username/รหัสผ่าน"><Pencil className="h-4 w-4" /></button>
                          {!me && <button className="btn btn-outline !px-2 !py-1 text-sm text-red-600" onClick={() => setToDelete(u)} title="ลบผู้ใช้งานออกจากระบบถาวร"><Trash2 className="h-4 w-4" /></button>}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {modal?.t === 'import' && <ImportModal existing={existing} onClose={() => setModal(null)} say={say} />}
      {modal?.t === 'add' && <AddModal existing={existing} onClose={() => setModal(null)} say={say} />}
      {modal?.t === 'reset' && <ResetModal user={modal.u} onClose={() => setModal(null)} say={say} />}
      {modal?.t === 'edit' && <EditAccountModal user={modal.u} prefill={modal.prefill} onClose={() => setModal(null)} say={say} />}
      {modal?.t === 'bulkReset' && <BulkResetModal onClose={() => setModal(null)} say={say} />}
      {toDelete && (
        <ConfirmDialog
          message={`ลบ ${toDelete.name || usernameOf(toDelete.email)} ออกจากระบบถาวรหรือไม่? (ผู้ใช้นี้จะเข้าระบบไม่ได้อีกทันที — บัญชีใน Firebase Authentication จะยังค้างอยู่ ลบทิ้งเองที่ Console ภายหลังได้หากต้องการ)`}
          busy={deleting} onConfirm={doDelete} onCancel={() => setToDelete(null)}
        />
      )}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
