import { useState } from 'react';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { HeartPulse, Loader2 } from 'lucide-react';
import { auth } from '../firebase';

const msgFor = (code) =>
  ({
    'auth/invalid-credential': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
    'auth/invalid-email': 'รูปแบบอีเมลไม่ถูกต้อง',
    'auth/too-many-requests': 'ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่',
    'auth/network-request-failed': 'เชื่อมต่ออินเทอร์เน็ตไม่ได้',
  })[code] || 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setInfo(''); setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (e2) {
      setErr(msgFor(e2.code));
      setBusy(false);
    }
  };

  const reset = async () => {
    setErr(''); setInfo('');
    if (!email.trim()) return setErr('กรุณากรอกอีเมลก่อน แล้วกด "ลืมรหัสผ่าน"');
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch { /* ไม่เปิดเผยว่ามีอีเมลนี้ในระบบหรือไม่ */ }
    setInfo('หากอีเมลนี้มีในระบบ จะได้รับลิงก์ตั้งรหัสผ่านใหม่ทางอีเมล');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-emerald-50 p-4">
      <div className="card w-full max-w-md p-6 sm:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500"><HeartPulse className="h-8 w-8 text-white" /></div>
          <h1 className="text-xl font-bold text-blue-900">ระบบบริหารงาน</h1>
          <p className="text-slate-600">รพ.สต.บ้านหนองสนม ต.เชียงเครือ อ.เมือง จ.สกลนคร</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-600">อีเมล</label>
            <input id="email" type="email" required autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label htmlFor="pw" className="mb-1 block text-sm font-medium text-slate-600">รหัสผ่าน</label>
            <input id="pw" type="password" required autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {err && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{err}</p>}
          {info && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-700" role="status">{info}</p>}
          <button className="btn btn-primary w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} เข้าสู่ระบบ</button>
          <button type="button" onClick={reset} className="w-full text-sm text-blue-700 hover:underline">ลืมรหัสผ่าน</button>
        </form>
        <p className="mt-6 text-center text-xs text-slate-500">สำหรับเจ้าหน้าที่ที่ได้รับอนุญาตเท่านั้น · หากยังไม่มีบัญชีให้ติดต่อผู้ดูแลระบบ</p>
      </div>
    </div>
  );
}
