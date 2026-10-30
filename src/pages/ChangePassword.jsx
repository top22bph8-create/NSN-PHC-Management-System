import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { KeyRound, Loader2 } from 'lucide-react';
import { auth, db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { firebasePassword } from '../lib/accounts';
import { writeAudit } from '../lib/audit';
import ThaiDateInput from '../components/ThaiDateInput';
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

// ข้อมูลส่วนตัวของตัวเอง — เป็นเอกสารเดียวกับ "ทำเนียบบุคลากร" (users/{email}) แก้ที่ไหนก็เปลี่ยนตรงกันทั้งสองหน้า
// (ตำแหน่ง/สิทธิ์/ประเภทบุคลากร ผู้ดูแลระบบเป็นผู้แก้)
export function ProfileForm() {
  const { profile, refresh } = useAuth();
  const [f, setF] = useState({ namePrefix: profile.namePrefix || '', name: profile.name || '', phone: profile.phone || '', education: profile.education || '', birthday: profile.birthday || '' });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) return setToast({ type: 'error', text: 'กรุณากรอกชื่อ - สกุล' });
    setBusy(true);
    try {
      const patch = { namePrefix: f.namePrefix, name: f.name.replace(/\s+/g, ' ').trim(), phone: f.phone.trim(), education: f.education.trim(), birthday: f.birthday || '' };
      await updateDoc(doc(db, 'users', profile.email), patch);
      try { await writeAudit({ action: 'update', module: 'auth', docId: profile.email, label: 'แก้ไขข้อมูลส่วนตัว' }); } catch { /* ignore */ }
      await refresh();
      setToast({ type: 'ok', text: 'บันทึกข้อมูลส่วนตัวแล้ว (เปลี่ยนในทำเนียบบุคลากรด้วย)' });
    } catch (err) {
      setToast({ type: 'error', text: 'ไม่สำเร็จ: ' + (err.code || err.message) });
    } finally { setBusy(false); setTimeout(() => setToast(null), 3500); }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="mp" className="mb-1 block text-sm font-medium text-slate-600">คำนำหน้า</label>
          <select id="mp" className="input" value={f.namePrefix} onChange={set('namePrefix')}>
            <option value="">- ไม่ระบุ -</option>
            {['นาย', 'นาง', 'นางสาว', 'ว่าที่ร้อยตรี', 'ดร.'].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="mn" className="mb-1 block text-sm font-medium text-slate-600">ชื่อ - สกุล</label>
          <input id="mn" required className="input" value={f.name} onChange={set('name')} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="mt" className="mb-1 block text-sm font-medium text-slate-600">เบอร์โทรศัพท์</label><input id="mt" inputMode="tel" className="input" value={f.phone} onChange={set('phone')} /></div>
        <div><label htmlFor="mb" className="mb-1 block text-sm font-medium text-slate-600">วันเดือนปีเกิด</label><ThaiDateInput id="mb" value={f.birthday} onChange={(v) => setF({ ...f, birthday: v })} yearsBack={80} yearsForward={0} /></div>
      </div>
      <div><label htmlFor="me" className="mb-1 block text-sm font-medium text-slate-600">วุฒิการศึกษา</label><input id="me" className="input" value={f.education} onChange={set('education')} /></div>
      <p className="text-xs text-slate-500">ตำแหน่งและสิทธิ์การใช้งาน แก้โดยผู้ดูแลระบบที่หน้า "ทำเนียบบุคลากร"</p>
      <button className="btn btn-primary w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} บันทึกข้อมูลส่วนตัว</button>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </form>
  );
}

export default function Account() {
  const { profile } = useAuth();
  return (
    <div className="mx-auto max-w-xl p-4 lg:p-6">
      <PageHeader icon={KeyRound} title="บัญชีของฉัน" subtitle={`${profile.name || ''} · ${profile.position || ''}`} />
      <div className="card mb-4 p-5"><h2 className="mb-3 font-semibold text-slate-700">ข้อมูลส่วนตัว</h2><ProfileForm /></div>
      <div className="card p-5"><h2 className="mb-3 font-semibold text-slate-700">เปลี่ยนรหัสผ่าน</h2><PasswordForm /></div>
    </div>
  );
}
