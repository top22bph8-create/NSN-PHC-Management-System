import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { FileSpreadsheet, KeyRound, Loader2, Search, UserPlus, Users } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { ASSIGNABLE_ROLES, PENDING_LABEL, ROLES, canWrite } from '../lib/roles';
import { writeAudit } from '../lib/audit';
import { createAuthAccount, toEmail, usernameOf } from '../lib/accounts';
import { Badge, EmptyState, ErrorState, Modal, Spinner, Toast } from '../components/ui';
import { PageHeader } from '../components/Logo';

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
// เดาบทบาทจากตำแหน่ง (แก้ได้ก่อนนำเข้า และแก้ภายหลังได้ในตาราง)
const guessRole = (pos) => (pos.includes('ผู้อำนวยการ') ? 'director' : pos.includes('การเงิน') ? 'finance' : 'staff');

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
    .map((r) => {
      const position = pick(r, 'ตำแหน่ง', 'position');
      return { username: pick(r, 'user', 'ชื่อผู้ใช้').toLowerCase(), password: pick(r, 'รหัสผ่าน', 'password'), name: pick(r, 'ชื่อ', 'name'), position, role: guessRole(position) };
    })
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
        await writeAudit({ action: 'create', module: 'personnel', docId: email, label: r.name, after: { role: r.role, position: r.position } });
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
    <Modal wide title="นำเข้ารายชื่อบุคลากรจากไฟล์ Excel" onClose={busy ? () => {} : onClose}
      footer={<>
        <button className="btn btn-outline" onClick={onClose} disabled={busy}>ปิด</button>
        {rows && <button className="btn btn-primary" onClick={run} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} สร้างบัญชี {rows.length} รายการ</button>}
      </>}>
      <p className="mb-3 text-sm text-slate-600">
        ไฟล์ต้องมีหัวคอลัมน์: <b>USER, รหัสผ่าน, ชื่อ - สกุล, ตำแหน่ง</b> ระบบอ่านไฟล์ในเครื่องของท่านเท่านั้น ไม่มีการเก็บรหัสผ่านไว้ในฐานข้อมูล
        ผู้ใช้จะถูกบังคับเปลี่ยนรหัสผ่านตอนเข้าใช้งานครั้งแรก
      </p>
      <input type="file" accept=".xlsx,.xls" onChange={pickFile} className="mb-3 block w-full text-sm" aria-label="เลือกไฟล์ Excel" disabled={busy} />
      {stop && <p className="mb-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-800" role="alert">{stop}</p>}
      {okCount > 0 && !busy && <p className="mb-3 rounded-lg bg-brand-50 p-2 text-sm text-brand-800">สร้างสำเร็จ {okCount} รายการ</p>}
      {rows && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-brand-50 text-slate-600"><tr><th className="px-2 py-1">USER</th><th className="px-2 py-1">ชื่อ - สกุล</th><th className="px-2 py-1">ตำแหน่ง</th><th className="px-2 py-1">บทบาท</th><th className="px-2 py-1">ผล</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.username} className="border-t border-slate-100">
                  <td className="px-2 py-1">{r.username}</td><td className="px-2 py-1">{r.name}</td><td className="px-2 py-1">{r.position}</td>
                  <td className="px-2 py-1">
                    <select className="input !w-auto !py-0.5" value={r.role} disabled={busy} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} aria-label={`บทบาทของ ${r.name}`}>
                      {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
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
  const submit = async (e) => {
    e.preventDefault();
    const username = f.username.trim().toLowerCase();
    const email = toEmail(username);
    if (!/^[a-z0-9._@-]+$/.test(username)) return say({ type: 'error', text: 'ชื่อผู้ใช้ใช้ได้เฉพาะ a-z ตัวเลข . _ -' });
    if (existing.has(email)) return say({ type: 'error', text: 'ชื่อผู้ใช้นี้มีอยู่แล้ว' });
    setBusy(true);
    try {
      try { await createAuthAccount(email, f.password); } catch (err) { if (err.code !== 'auth/email-already-in-use') throw err; }
      await setDoc(doc(db, 'users', email), { email, username, name: clean(f.name), position: clean(f.position), role: f.role, active: true, mustChangePassword: true, createdAt: serverTimestamp() });
      await writeAudit({ action: 'create', module: 'personnel', docId: email, label: clean(f.name), after: { role: f.role } });
      say({ type: 'ok', text: 'เพิ่มบุคลากรแล้ว' });
      onClose();
    } catch (err) {
      say({ type: 'error', text: 'ไม่สำเร็จ: ' + authMsg(err.code || err.message) });
    } finally { setBusy(false); }
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="เพิ่มบุคลากร" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="mb-1 block text-sm text-slate-600" htmlFor="au">ชื่อผู้ใช้ (Username)</label><input id="au" required className="input" value={f.username} onChange={set('username')} /></div>
          <div><label className="mb-1 block text-sm text-slate-600" htmlFor="ap">รหัสผ่านเริ่มต้น</label><input id="ap" required className="input" value={f.password} onChange={set('password')} /></div>
        </div>
        <div><label className="mb-1 block text-sm text-slate-600" htmlFor="an">ชื่อ - สกุล</label><input id="an" required className="input" value={f.name} onChange={set('name')} /></div>
        <div><label className="mb-1 block text-sm text-slate-600" htmlFor="ao">ตำแหน่ง</label><input id="ao" className="input" value={f.position} onChange={set('position')} /></div>
        <div><label className="mb-1 block text-sm text-slate-600" htmlFor="ar">บทบาท</label>
          <select id="ar" className="input" value={f.role} onChange={set('role')}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <p className="text-xs text-slate-500">ต้องเปิด Enable create (sign-up) ใน Firebase Authentication ชั่วคราวระหว่างสร้างบัญชี</p>
        <button className="btn btn-primary w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} เพิ่ม</button>
      </form>
    </Modal>
  );
}

function ResetModal({ user, onClose, say }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await createAuthAccount(user.email, pw);
      await updateDoc(doc(db, 'users', user.email), { mustChangePassword: true });
      await writeAudit({ action: 'update', module: 'personnel', docId: user.email, label: `ตั้งรหัสเริ่มต้นใหม่ ${user.name}` });
      say({ type: 'ok', text: 'ตั้งรหัสเริ่มต้นใหม่แล้ว' });
      onClose();
    } catch (err) {
      say({ type: 'error', text: err.code === 'auth/email-already-in-use' ? 'ยังมีบัญชีล็อกอินเดิมอยู่ ต้องลบผู้ใช้นี้ที่ Firebase Console → Authentication ก่อน แล้วลองใหม่' : 'ไม่สำเร็จ: ' + authMsg(err.code || err.message) });
    } finally { setBusy(false); }
  };
  return (
    <Modal title={`ตั้งรหัสเริ่มต้นใหม่: ${user.name}`} onClose={onClose}>
      <form onSubmit={go} className="space-y-3">
        <ol className="list-decimal pl-5 text-sm text-slate-600">
          <li>ที่ Firebase Console → Authentication → Users ลบผู้ใช้ <b>{usernameOf(user.email)}@nsnphc.example</b></li>
          <li>เปิด Enable create (sign-up) ชั่วคราว แล้วกรอกรหัสเริ่มต้นใหม่ด้านล่าง</li>
        </ol>
        <input required className="input" placeholder="รหัสผ่านเริ่มต้นใหม่" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="รหัสผ่านเริ่มต้นใหม่" />
        <button className="btn btn-primary w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} ยืนยัน</button>
      </form>
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
    () => onSnapshot(collection(db, 'users'), (s) => setRows(s.docs.map((d) => d.data()).sort((a, b) => {
      const pa = a.role === 'pending' ? 0 : 1;
      const pb = b.role === 'pending' ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return String(a.username || a.email).localeCompare(String(b.username || b.email), 'th', { numeric: true });
    })), (e) => setError(e.message)),
    [],
  );
  const existing = useMemo(() => new Set((rows || []).map((r) => r.email)), [rows]);
  const shown = (rows || []).filter((r) => !q.trim() || `${r.name} ${r.position} ${r.username || ''} ${r.email}`.toLowerCase().includes(q.trim().toLowerCase()));

  const change = async (u, patch, what) => {
    try {
      await updateDoc(doc(db, 'users', u.email), patch);
      await writeAudit({ action: 'update', module: 'personnel', docId: u.email, label: u.name || u.email, before: { [what]: u[what] }, after: { [what]: patch[what] } });
      say({ type: 'ok', text: 'บันทึกแล้ว' });
    } catch (err) {
      say({ type: 'error', text: 'ไม่สำเร็จ: ' + (err.code || err.message) });
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-6">
      <PageHeader icon={Users} title="ทำเนียบบุคลากร" subtitle="รายชื่อเจ้าหน้าที่ บัญชีผู้ใช้ และสิทธิ์การใช้งาน"
        actions={writable && (
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-outline" onClick={() => setModal({ t: 'import' })}><FileSpreadsheet className="h-5 w-5" /> นำเข้า Excel</button>
            <button className="btn btn-primary" onClick={() => setModal({ t: 'add' })}><UserPlus className="h-5 w-5" /> เพิ่มบุคลากร</button>
          </div>
        )} />
      <div className="relative mb-3 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-brand-400" />
        <input className="input !pl-10" placeholder="ค้นหาชื่อ ตำแหน่ง หรือ Username" value={q} onChange={(e) => setQ(e.target.value)} aria-label="ค้นหาบุคลากร" />
      </div>
      <div className="card overflow-x-auto">
        {error ? <ErrorState message={error} /> : rows === null ? <Spinner /> : shown.length === 0 ? <EmptyState title="ยังไม่มีบุคลากร" hint={writable ? 'กด "นำเข้า Excel" เพื่อเพิ่มรายชื่อทั้งหมดพร้อมกัน' : ''} /> : (
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-brand-50 text-sm text-slate-600"><tr><th className="px-3 py-2">Username</th><th className="px-3 py-2">ชื่อ - สกุล</th><th className="px-3 py-2">ตำแหน่ง</th><th className="px-3 py-2">บทบาท</th><th className="px-3 py-2">สถานะ</th>{writable && <th className="px-3 py-2" />}</tr></thead>
            <tbody>
              {shown.map((u) => {
                const me = u.email === profile.email;
                const pending = u.role === 'pending';
                return (
                  <tr key={u.email} className={`border-t border-slate-100 ${pending ? 'bg-amber-50/60' : ''}`}>
                    <td className="px-3 py-2 font-mono text-sm">
                      {usernameOf(u.email)}{me && <Badge className="ml-2 bg-brand-100 text-brand-800">คุณ</Badge>}
                      {pending && <div className="mt-0.5"><Badge className="bg-amber-100 text-amber-800">รอสมัครใหม่</Badge></div>}
                    </td>
                    <td className="px-3 py-2">{u.name || '-'}</td>
                    <td className="px-3 py-2 text-sm text-slate-600">{u.position || '-'}</td>
                    <td className="px-3 py-2">
                      {writable ? (
                        <select className="input !w-auto !py-1" value={u.role} disabled={me} onChange={(e) => change(u, { role: e.target.value }, 'role')} aria-label={`บทบาทของ ${u.name}`}>
                          {pending && <option value="pending">{PENDING_LABEL}</option>}
                          {Object.entries(ASSIGNABLE_ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      ) : (pending ? PENDING_LABEL : ROLES[u.role])}
                    </td>
                    <td className="px-3 py-2">
                      {writable ? (
                        <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={!!u.active} disabled={me} onChange={(e) => change(u, { active: e.target.checked }, 'active')} /> {u.active ? 'ใช้งาน' : 'ระงับ'}</label>
                      ) : <Badge className={u.active ? 'bg-brand-100 text-brand-800' : 'bg-slate-200 text-slate-600'}>{u.active ? 'ใช้งาน' : 'ระงับ'}</Badge>}
                      {u.mustChangePassword && <div className="text-xs text-amber-700">ยังไม่เปลี่ยนรหัสผ่าน</div>}
                      {pending && writable && <div className="text-xs text-amber-700">เลือกบทบาทแล้วติ๊ก "ใช้งาน" เพื่ออนุมัติ</div>}
                    </td>
                    {writable && <td className="px-3 py-2"><button className="btn btn-outline !px-2 !py-1 text-sm" onClick={() => setModal({ t: 'reset', u })} title="ตั้งรหัสเริ่มต้นใหม่"><KeyRound className="h-4 w-4" /></button></td>}
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
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
