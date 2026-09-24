import { useState } from 'react';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { Eye, EyeOff, Loader2, Lock, User } from 'lucide-react';
import { auth } from '../firebase';
import { firebasePassword, toEmail } from '../lib/accounts';
import { ORG_UNDER, SYSTEM_AREA_TH, SYSTEM_NAME_EN, SYSTEM_NAME_TH } from '../config/brand';
import Logo from '../components/Logo';

const msgFor = (code) =>
  ({
    'auth/invalid-credential': 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
    'auth/invalid-email': 'รูปแบบชื่อผู้ใช้ไม่ถูกต้อง',
    'auth/too-many-requests': 'ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่',
    'auth/network-request-failed': 'เชื่อมต่ออินเทอร์เน็ตไม่ได้',
  })[code] || 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setInfo(''); setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, toEmail(username), firebasePassword(password));
    } catch (e2) {
      setErr(msgFor(e2.code));
      setBusy(false);
    }
  };

  const reset = async () => {
    setErr(''); setInfo('');
    if (!username.includes('@')) return setInfo('หากลืมรหัสผ่าน กรุณาติดต่อผู้ดูแลระบบเพื่อตั้งรหัสใหม่ (ผู้ที่ใช้อีเมลจริงกรอกอีเมลแล้วกดปุ่มนี้ได้)');
    try { await sendPasswordResetEmail(auth, username.trim()); } catch { /* ไม่เปิดเผยว่ามีอีเมลนี้ในระบบหรือไม่ */ }
    setInfo('หากอีเมลนี้มีในระบบ จะได้รับลิงก์ตั้งรหัสผ่านใหม่ทางอีเมล');
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-brand-200 via-brand-50 to-white p-4">
      <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-brand-300/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-brand-400/30 blur-3xl" />
      <div className="card relative w-full max-w-md p-6 sm:p-8">
        <div className="mb-6 text-center">
          <Logo size={120} className="mx-auto drop-shadow" />
          <h1 className="mt-3 text-lg font-bold leading-snug text-brand-900 sm:text-xl">{SYSTEM_NAME_TH}</h1>
          <p className="text-sm text-slate-600">{SYSTEM_AREA_TH}</p>
          <p className="mt-1 inline-block rounded-full bg-brand-100 px-3 py-0.5 text-sm font-semibold text-brand-700">{SYSTEM_NAME_EN}</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="username" className="mb-1 block text-sm font-medium text-slate-600">ชื่อผู้ใช้ (Username)</label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-brand-400" />
              <input id="username" required autoComplete="username" autoCapitalize="none" className="input !pl-10" value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
          </div>
          <div>
            <label htmlFor="pw" className="mb-1 block text-sm font-medium text-slate-600">รหัสผ่าน</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-brand-400" />
              <input id="pw" type={show ? 'text' : 'password'} required autoComplete="current-password" className="input !pl-10 !pr-10" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-2 rounded p-0.5 text-slate-400 hover:text-brand-700" aria-label={show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}>
                {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>
          {err && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{err}</p>}
          {info && <p className="rounded-lg bg-brand-50 p-2 text-sm text-brand-800" role="status">{info}</p>}
          <button className="btn btn-primary w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} เข้าสู่ระบบ</button>
          <button type="button" onClick={reset} className="w-full text-sm text-brand-700 hover:underline">ลืมรหัสผ่าน</button>
        </form>
        <p className="mt-6 text-center text-xs text-slate-500">สำหรับเจ้าหน้าที่ที่ได้รับอนุญาตเท่านั้น<br />{ORG_UNDER}</p>
      </div>
    </div>
  );
}
