import { useState } from 'react';
import { Link } from 'react-router-dom';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { Eye, EyeOff, Loader2, Lock, User, UserPlus } from 'lucide-react';
import { auth, db } from '../firebase';
import { firebasePassword, toEmail } from '../lib/accounts';
import { ORG_UNDER, SYSTEM_AREA_TH, SYSTEM_NAME_EN, SYSTEM_NAME_TH } from '../config/brand';
import Logo from '../components/Logo';
import { Modal } from '../components/ui';

const msgFor = (code) =>
  ({
    'auth/invalid-credential': 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
    'auth/invalid-email': 'รูปแบบชื่อผู้ใช้ไม่ถูกต้อง',
    'auth/too-many-requests': 'ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่',
    'auth/network-request-failed': 'เชื่อมต่ออินเทอร์เน็ตไม่ได้',
  })[code] || 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่';

// คำขอเปลี่ยน Username/Password ที่ผู้ใช้งานส่งมาจากหน้าล็อกอิน (ตอนยังไม่ได้เข้าสู่ระบบ)
// ผู้ดูแลระบบ (Super Admin) จะเห็นคำขอนี้ที่หน้า "ทำเนียบบุคลากร" แล้วดำเนินการแก้ไขให้
function RequestChangeModal({ onClose }) {
  const [f, setF] = useState({ currentUsername: '', wantUsername: '', wantPassword: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!f.currentUsername.trim()) return setErr('กรุณากรอกชื่อผู้ใช้ปัจจุบัน');
    if (!f.wantUsername.trim() && !f.wantPassword.trim()) return setErr('กรุณาระบุอย่างน้อยหนึ่งอย่างที่ต้องการเปลี่ยน (Username หรือ Password)');
    setBusy(true);
    try {
      await addDoc(collection(db, 'accountChangeRequests'), {
        currentUsername: f.currentUsername.trim().toLowerCase(),
        wantUsername: f.wantUsername.trim().toLowerCase(),
        wantPassword: f.wantPassword.trim(),
        note: f.note.trim(),
        status: 'รอดำเนินการ',
        createdAt: serverTimestamp(),
      });
      setDone(true);
    } catch (e2) {
      setErr('ส่งคำขอไม่สำเร็จ กรุณาลองใหม่ (' + (e2.code || e2.message) + ')');
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <Modal title="ส่งคำขอแล้ว" onClose={onClose}>
        <p className="text-sm text-slate-600">ส่งคำขอเปลี่ยน Username/Password ให้ผู้ดูแลระบบแล้ว กรุณารอผู้ดูแลระบบดำเนินการแก้ไขให้ แล้วลองเข้าสู่ระบบใหม่อีกครั้ง</p>
        <button className="btn btn-primary mt-4 w-full" onClick={onClose}>ปิด</button>
      </Modal>
    );
  }

  return (
    <Modal title="ขอแก้ไข Username / Password" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-slate-500">คำขอนี้จะถูกส่งให้ผู้ดูแลระบบพิจารณาดำเนินการให้ ไม่ได้เปลี่ยนทันที</p>
        <div><label className="mb-1 block text-sm text-slate-600" htmlFor="rq1">ชื่อผู้ใช้ปัจจุบัน (Username เดิม)</label><input id="rq1" required className="input" value={f.currentUsername} onChange={set('currentUsername')} autoCapitalize="none" /></div>
        <div><label className="mb-1 block text-sm text-slate-600" htmlFor="rq2">ต้องการเปลี่ยนชื่อผู้ใช้เป็น (เว้นว่างถ้าไม่เปลี่ยน)</label><input id="rq2" className="input" value={f.wantUsername} onChange={set('wantUsername')} autoCapitalize="none" /></div>
        <div><label className="mb-1 block text-sm text-slate-600" htmlFor="rq3">ต้องการเปลี่ยนรหัสผ่านเป็น (เว้นว่างถ้าไม่เปลี่ยน)</label><input id="rq3" className="input" value={f.wantPassword} onChange={set('wantPassword')} /></div>
        <div><label className="mb-1 block text-sm text-slate-600" htmlFor="rq4">หมายเหตุ (ถ้ามี)</label><input id="rq4" className="input" value={f.note} onChange={set('note')} /></div>
        {err && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{err}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} ส่งคำขอ</button>
      </form>
    </Modal>
  );
}

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [showRequest, setShowRequest] = useState(false);

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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-brand-700 via-brand-300 to-brand-50 p-4">
      <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-white/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-brand-900/20 blur-3xl" />
      <div className="card relative w-full max-w-md p-6 shadow-2xl shadow-brand-900/20 sm:p-8">
        <div className="mb-6 text-center">
          <Logo size={120} className="mx-auto drop-shadow-lg" />
          <h1 className="mt-4 bg-gradient-to-r from-brand-800 to-brand-500 bg-clip-text text-xl font-extrabold leading-snug text-transparent sm:text-2xl">{SYSTEM_NAME_TH}</h1>
          <p className="mt-1 text-sm font-medium text-slate-600">{SYSTEM_AREA_TH}</p>
          <p className="mt-2 inline-block rounded-full bg-gradient-to-r from-brand-600 to-brand-800 px-4 py-1 text-sm font-bold tracking-wide text-white shadow-sm">{SYSTEM_NAME_EN}</p>
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
          <div className="flex items-center justify-center gap-3">
            <button type="button" onClick={reset} className="text-sm text-brand-700 hover:underline">ลืมรหัสผ่าน</button>
            <span className="text-slate-300">|</span>
            <button type="button" onClick={() => setShowRequest(true)} className="text-sm text-brand-700 hover:underline">ขอแก้ไข Username/Password</button>
          </div>
        </form>
        <Link to="/signup" className="mt-4 flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-brand-300 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50">
          <UserPlus className="h-4 w-4" /> ยังไม่มีบัญชี? สมัครใช้งาน
        </Link>
        <p className="mt-6 text-center text-xs text-slate-500">สำหรับเจ้าหน้าที่ที่ได้รับอนุญาตเท่านั้น<br />{ORG_UNDER}</p>
      </div>
      {showRequest && <RequestChangeModal onClose={() => setShowRequest(false)} />}
    </div>
  );
}
