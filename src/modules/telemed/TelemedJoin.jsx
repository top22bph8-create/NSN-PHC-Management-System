// หน้าเข้าห้องวิดีโอคอลของคนไข้ (ไม่ต้องล็อกอิน) — เปิดจากปุ่มใน LINE หรือ QR
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { Loader2, Video } from 'lucide-react';
import { functions } from '../../firebase';
import Logo from '../../components/Logo';

export default function TelemedJoin() {
  const { token } = useParams();
  const [ok, setOk] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [url, setUrl] = useState('');
  const join = async () => {
    setBusy(true); setErr('');
    try { const r = await httpsCallable(functions, 'telemedJoin')({ token }); setUrl(r.data.url); }
    catch (e) { setErr((e.message || 'เข้าห้องไม่สำเร็จ').replace(/^.*?: /, '')); } finally { setBusy(false); }
  };
  if (url) return <iframe title="video" src={url} allow="camera; microphone; fullscreen; display-capture; autoplay" className="fixed inset-0 h-full w-full border-0 bg-slate-900" />;
  const inLine = /Line\//i.test(navigator.userAgent);
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 to-brand-600 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto mb-3 w-fit"><Logo size={72} /></div>
        <h1 className="text-xl font-extrabold text-brand-900">รพ.สต.บ้านหนองสนม</h1>
        <p className="mb-4 text-slate-600">ห้องวิดีโอคอล Telemedicine</p>
        {inLine && <p className="mb-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">หากกล้อง/ไมค์ไม่ทำงานในแอป LINE ให้กดเมนู ⋮ มุมขวาบน แล้วเลือก "เปิดในเบราว์เซอร์" (Safari/Chrome)</p>}
        <label className="mb-4 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-left text-sm"><input type="checkbox" className="mt-1" checked={ok} onChange={(e) => setOk(e.target.checked)} /><span>ข้าพเจ้ายินยอมให้ รพ.สต.บ้านหนองสนม ให้บริการสุขภาพทางไกลผ่านวิดีโอและเสียง และใช้ข้อมูลเพื่อการดูแลรักษา โดยไม่มีการบันทึกวิดีโอ</span></label>
        {err && <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{err}</p>}
        <button className="btn btn-primary w-full !py-3 text-base" disabled={!ok || busy} onClick={join}>{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Video className="h-5 w-5" />} เข้าห้องวิดีโอคอล</button>
        <p className="mt-3 text-xs text-slate-400">ต้องอนุญาตให้ใช้กล้องและไมโครโฟนเมื่อเบราว์เซอร์ถาม</p>
      </div>
    </div>
  );
}
