import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { Loader2, UserPlus } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../lib/roles';
import { writeAudit } from '../lib/audit';
import { Badge, EmptyState, ErrorState, Spinner, Toast } from '../components/ui';

export default function Users() {
  const { profile } = useAuth();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [f, setF] = useState({ email: '', name: '', role: 'admin_clerk' });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const say = (t) => { setToast(t); setTimeout(() => setToast(null), 3500); };

  useEffect(
    () => onSnapshot(collection(db, 'users'), (s) => setRows(s.docs.map((d) => d.data()).sort((a, b) => a.email.localeCompare(b.email))), (e) => setError(e.message)),
    [],
  );

  const add = async (e) => {
    e.preventDefault();
    const email = f.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return say({ type: 'error', text: 'รูปแบบอีเมลไม่ถูกต้อง' });
    if (rows.some((r) => r.email === email)) return say({ type: 'error', text: 'อีเมลนี้มีสิทธิ์อยู่แล้ว' });
    setBusy(true);
    try {
      await setDoc(doc(db, 'users', email), { email, name: f.name.trim(), role: f.role, active: true, createdAt: serverTimestamp() });
      await writeAudit({ action: 'create', module: 'users', docId: email, label: email, after: { role: f.role, name: f.name } });
      setF({ email: '', name: '', role: 'admin_clerk' });
      say({ type: 'ok', text: 'เพิ่มสิทธิ์แล้ว' });
    } catch (err) {
      say({ type: 'error', text: 'ไม่สำเร็จ: ' + (err.code || err.message) });
    } finally {
      setBusy(false);
    }
  };

  const change = async (u, patch, what) => {
    try {
      await updateDoc(doc(db, 'users', u.email), patch);
      await writeAudit({ action: 'update', module: 'users', docId: u.email, label: u.email, before: { [what]: u[what] }, after: { [what]: patch[what] } });
      say({ type: 'ok', text: 'บันทึกแล้ว' });
    } catch (err) {
      say({ type: 'error', text: 'ไม่สำเร็จ: ' + (err.code || err.message) });
    }
  };

  return (
    <div className="mx-auto max-w-5xl p-4 lg:p-6">
      <h1 className="text-2xl font-bold">ผู้ใช้งานและสิทธิ์</h1>
      <p className="mb-4 text-slate-500">กำหนดบทบาทของเจ้าหน้าที่ (Role-Based Access Control)</p>

      <div className="card mb-5 p-4">
        <h2 className="mb-1 flex items-center gap-2 font-semibold"><UserPlus className="h-5 w-5" /> เพิ่มผู้ใช้งาน</h2>
        <ol className="mb-3 list-decimal pl-5 text-sm text-slate-600">
          <li>สร้างบัญชีที่ Firebase Console → Authentication → Users → Add user (อีเมลและรหัสผ่านชั่วคราว)</li>
          <li>กลับมากรอกอีเมลเดียวกันที่นี่ แล้วเลือกบทบาท</li>
        </ol>
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-4">
          <input className="input sm:col-span-1" type="email" required placeholder="อีเมล" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} aria-label="อีเมล" />
          <input className="input" required placeholder="ชื่อ-สกุล" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label="ชื่อ-สกุล" />
          <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} aria-label="บทบาท">
            {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn btn-green" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} เพิ่ม</button>
        </form>
      </div>

      <div className="card overflow-x-auto">
        {error ? <ErrorState message={error} /> : rows === null ? <Spinner /> : rows.length === 0 ? <EmptyState title="ยังไม่มีผู้ใช้งาน" /> : (
          <table className="w-full min-w-[640px] text-left">
            <thead className="bg-slate-100 text-sm text-slate-600"><tr><th className="px-3 py-2">อีเมล</th><th className="px-3 py-2">ชื่อ</th><th className="px-3 py-2">บทบาท</th><th className="px-3 py-2">สถานะ</th></tr></thead>
            <tbody>
              {rows.map((u) => {
                const me = u.email === profile.email;
                return (
                  <tr key={u.email} className="border-t border-slate-100">
                    <td className="px-3 py-2">{u.email}{me && <Badge className="ml-2 bg-blue-100 text-blue-800">คุณ</Badge>}</td>
                    <td className="px-3 py-2">{u.name || '-'}</td>
                    <td className="px-3 py-2">
                      <select className="input !w-auto !py-1" value={u.role} disabled={me} onChange={(e) => change(u, { role: e.target.value }, 'role')} aria-label={`บทบาทของ ${u.email}`}>
                        {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={!!u.active} disabled={me} onChange={(e) => change(u, { active: e.target.checked }, 'active')} /> {u.active ? 'ใช้งาน' : 'ระงับ'}</label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
