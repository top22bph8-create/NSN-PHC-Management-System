import { useState } from 'react';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { auth, db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { firebasePassword } from '../lib/accounts';
import { writeAudit } from '../lib/audit';
import { PageHeader } from '../components/Logo';
import { Toast } from '../components/ui';

export const MIN_LEN = 8;

// ฟอร์มเปลี่ยนรหัสผ่าน ใช้ทั้งหน้าบังคับครั้งแรก (forced) และหน้าบัญชีของฉัน
export function PasswordForm({ forced = false }) {
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
      if (profile.mustChangePassword) await updateDoc(doc(db, 'users', profile.email), { mustChangePassword: false });
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
        <label htmlFor="old" className="mb-1 block text-sm font-medium text-slate-600">{forced ? 'รหัสผ่านเริ่มต้นที่ได้รับ' : 'รหัสผ่านปัจจุบัน'}</label>
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

// หน้าเต็มจอ: บังคับเปลี่ยนรหัสผ่านตอนเข้าระบบครั้งแรก
export function ForcedChange() {
  const { logout } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-200 via-brand-50 to-white p-4">
      <div className="card w-full max-w-md p-6 sm:p-8">
        <div className="mb-4 text-center">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-700"><ShieldCheck className="h-8 w-8" /></div>
          <h1 className="text-xl font-bold text-brand-900">ตั้งรหัสผ่านใหม่</h1>
          <p className="text-sm text-slate-600">เพื่อความปลอดภัย กรุณาเปลี่ยนรหัสผ่านเริ่มต้นก่อนเข้าใช้งานครั้งแรก</p>
        </div>
        <PasswordForm forced />
        <button onClick={logout} className="mt-3 w-full text-sm text-slate-500 hover:underline">ออกจากระบบ</button>
      </div>
    </div>
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
