import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { CheckCircle2, Loader2, UserPlus } from 'lucide-react';
import { auth, db } from '../firebase';
import { firebasePassword, toEmail } from '../lib/accounts';
import { SYSTEM_AREA_TH, SYSTEM_NAME_EN, SYSTEM_NAME_TH } from '../config/brand';
import Logo from '../components/Logo';

const authMsg = (code) =>
  ({
    'auth/email-already-in-use': 'ชื่อผู้ใช้นี้มีคนใช้แล้ว กรุณาเลือกชื่ออื่น',
    'auth/weak-password': 'รหัสผ่านสั้นเกินไป',
  })[code] || 'สมัครไม่สำเร็จ กรุณาลองใหม่ (' + code + ')';

export default function Signup() {
  const nav = useNavigate();
  const [f, setF] = useState({ username: '', password: '', password2: '', name: '', position: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    const username = f.username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{2,30}$/.test(username)) return setErr('ชื่อผู้ใช้ใช้ได้เฉพาะตัวอักษรอังกฤษพิมพ์เล็ก ตัวเลข . _ - ความยาว 2-30 ตัว');
    if (f.password.length < 4) return setErr('รหัสผ่านสั้นเกินไป');
    if (f.password !== f.password2) return setErr('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
    if (!f.name.trim()) return setErr('กรุณากรอกชื่อ-สกุล');
    setBusy(true);
    try {
      const email = toEmail(username);
      const cred = await createUserWithEmailAndPassword(auth, email, firebasePassword(f.password));
      await setDoc(doc(db, 'users', email), {
        email, username, name: f.name.trim(), position: f.position.trim(),
        role: 'pending', active: false, mustChangePassword: false, requestedAt: serverTimestamp(),
      });
      setDone(true);
      setTimeout(() => { auth.signOut().catch(() => {}); nav('/'); }, 4000);
    } catch (e2) {
      setErr(authMsg(e2.code || e2.message));
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-200 via-brand-50 to-white p-4">
        <div className="card w-full max-w-md p-8 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-14 w-14 text-brand-600" />
          <h1 className="mb-2 text-xl font-bold text-brand-900">ส่งคำขอสมัครใช้งานแล้ว</h1>
          <p className="text-slate-600">กรุณารอผู้ดูแลระบบอนุมัติสิทธิ์การใช้งาน จะพาไปหน้าเข้าสู่ระบบให้อัตโนมัติ...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-200 via-brand-50 to-white p-4">
      <div className="card w-full max-w-md p-6 sm:p-8">
        <div className="mb-5 text-center">
          <Logo size={80} className="mx-auto" />
          <h1 className="mt-2 text-lg font-bold text-brand-900">{SYSTEM_NAME_TH}</h1>
          <p className="text-sm text-slate-500">{SYSTEM_AREA_TH} · {SYSTEM_NAME_EN}</p>
          <p className="mt-2 flex items-center justify-center gap-1 font-semibold text-brand-700"><UserPlus className="h-5 w-5" /> สมัครใช้งาน</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div><label className="mb-1 block text-sm text-slate-600" htmlFor="su">ชื่อผู้ใช้ (Username)</label><input id="su" className="input" value={f.username} onChange={set('username')} autoCapitalize="none" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1 block text-sm text-slate-600" htmlFor="sp1">รหัสผ่าน</label><input id="sp1" type="password" className="input" value={f.password} onChange={set('password')} /></div>
            <div><label className="mb-1 block text-sm text-slate-600" htmlFor="sp2">ยืนยันรหัสผ่าน</label><input id="sp2" type="password" className="input" value={f.password2} onChange={set('password2')} /></div>
          </div>
          <div><label className="mb-1 block text-sm text-slate-600" htmlFor="sn">ชื่อ - สกุล</label><input id="sn" className="input" value={f.name} onChange={set('name')} /></div>
          <div><label className="mb-1 block text-sm text-slate-600" htmlFor="so">ตำแหน่ง</label><input id="so" className="input" value={f.position} onChange={set('position')} /></div>
          {err && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{err}</p>}
          <button className="btn btn-primary w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} ส่งคำขอสมัครใช้งาน</button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">มีบัญชีอยู่แล้ว? <Link to="/" className="text-brand-700 hover:underline">เข้าสู่ระบบ</Link></p>
        <p className="mt-2 text-center text-xs text-slate-400">หลังสมัคร ต้องรอผู้ดูแลระบบอนุมัติสิทธิ์ก่อนจึงจะเข้าใช้งานได้</p>
      </div>
    </div>
  );
}
