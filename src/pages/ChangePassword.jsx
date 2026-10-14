import { useState } from 'react';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { KeyRound, Loader2 } from 'lucide-react';
import { auth } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { firebasePassword } from '../lib/accounts';
import { writeAudit } from '../lib/audit';
import { PageHeader } from '../components/Logo';
import { Toast } from '../components/ui';

export const MIN_LEN = 8;

// ฟอร์มเปลี่ยนรหัสผ่าน (สมัครใจ ไม่มีการบังคับเปลี่ยนรหัสผ่านครั้งแรกอีกต่อไปตามที่แจ้ง — ใช้รหัสผ่านที่ผู้ดูแลระบบตั้งให้ได้ทันที)
export function PasswordForm() {
  const { profile, refresh } = useAuth();
  const [oldPw, setOld] = useState('');
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (pw1.length < MIN_LEN) return setErr(`รหัสผ่านใหม่ต้องยาวอย่างน้อย ${MIN_LEN} ตัวอักษร`);
    if (!/[A-Za-z]/.test(pw1) || !/\d/.test(pw1)) return setErr('รหัสผ่านใหม่ต้องมีทั้งตัวอักษรภาษาอังกฤษและตัวเลข');
    if (pw1 !== pw2) return setErr('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');
    if (pw1 === oldPw) return setErr('รหัสผ่านใหม่ต้องไม่ซ้ำรหัสเดิม');
    setBusy(true);
    try {
      const u = auth.currentUser;
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, firebasePassword(oldPw)));
      await updatePassword(u, pw1);
      try { await writeAudit({ action: 'update', module: 'auth', docId: profile.email, label: 'เปลี่ยนรหัสผ่าน' }); } catch { /* ignore */ }
      setOld(''); setPw1(''); setPw2('');
      setToast({ type: 'ok', text: 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว' });
      await refresh();
    } catch (e2) {
      setErr(['auth/invalid-credential', 'auth/wrong-password'].includes(e2.code) ? 'รหัสผ่านปัจจุบันไม่ถูกต้อง' : 'ไม่สำเร็จ: ' + (e2.code || e2.message));
    } finally {
      setBusy(false);
      setTimeout(() => setToast(null), 3500);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="old" className="mb-1 block text-sm font-medium text-slate-600">รหัสผ่านปัจจุบัน</label>
        <input id="old" type="password" required autoComplete="current-password" className="input" value={oldPw} onChange={(e) => setOld(e.target.value)} />
      </div>
      <div>
        <label htmlFor="n1" className="mb-1 block text-sm font-medium text-slate-600">รหัสผ่านใหม่ (อย่างน้อย {MIN_LEN} ตัว มีตัวอักษรและตัวเลข)</label>
        <input id="n1" type="password" required autoComplete="new-password" className="input" value={pw1} onChange={(e) => setPw1(e.target.value)} />
      </div>
      <div>
        <label htmlFor="n2" className="mb-1 block text-sm font-medium text-slate-600">ยืนยันรหัสผ่านใหม่</label>
        <input id="n2" type="password" required autoComplete="new-password" className="input" value={pw2} onChange={(e) => setPw2(e.target.value)} />
      </div>
      {err && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{err}</p>}
      <button className="btn btn-primary w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} บันทึกรหัสผ่านใหม่</button>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </form>
  );
}

export default function Account() {
  const { profile } = useAuth();
  return (
    <div className="mx-auto max-w-lg p-4 lg:p-6">
      <PageHeader icon={KeyRound} title="บัญชีของฉัน" subtitle={`${profile.name || ''} · ${profile.position || ''}`} />
      <div className="card p-5"><PasswordForm /></div>
    </div>
  );
}
