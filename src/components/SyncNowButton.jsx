// ปุ่ม "ประมวลผลทันที": ขอให้เครื่อง JHCIS ซิงก์ข้อมูลล่าสุดขึ้นระบบทันที (ผ่านตัวรอรับคำสั่ง node sync.mjs --watch บนเครื่อง JHCIS)
import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { Loader2, RefreshCw } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

const LABEL = { service: 'สถิติบริการ', rights: 'ทะเบียนสิทธิ', pp: 'ผลงาน P&P', targets: 'รายชื่อเป้าหมาย P&P' };
const STALE_MS = 10 * 60 * 1000; // คำขอค้างเกิน 10 นาที ถือว่าเครื่อง JHCIS ไม่ตอบสนอง
const ms = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : 0);
const hhmm = (t) => (ms(t) ? new Date(ms(t)).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '');

export default function SyncNowButton({ kinds, className = '' }) {
  const { profile } = useAuth(); const [reqs, setReqs] = useState({}); const [watch, setWatch] = useState(null); const [now, setNow] = useState(Date.now()); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const key = kinds.join(',');
  useEffect(() => { const offs = kinds.map((k) => onSnapshot(doc(db, 'syncRequests', k), (s) => setReqs((x) => ({ ...x, [k]: s.exists() ? s.data() : null })), () => {})); return () => offs.forEach((f) => f()); }, [key]); // eslint-disable-line
  useEffect(() => onSnapshot(doc(db, 'settings', 'syncWatcher'), (s) => setWatch(s.exists() ? s.data() : null), () => setWatch(null)), []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);
  const st = useMemo(() => {
    const list = kinds.map((k) => reqs[k]).filter(Boolean);
    const active = list.filter((r) => (r.status === 'pending' || r.status === 'running') && now - ms(r.requestedAt) < STALE_MS);
    const stale = list.some((r) => (r.status === 'pending' || r.status === 'running') && now - ms(r.requestedAt) >= STALE_MS);
    const failed = list.find((r) => r.status === 'failed'); const last = list.filter((r) => r.status === 'done').sort((a, b) => ms(b.finishedAt) - ms(a.finishedAt))[0];
    return { active: active.length > 0, stale, failed, last, running: active.some((r) => r.status === 'running') };
  }, [reqs, now, key]); // eslint-disable-line
  const online = ms(watch?.lastSeenAt) && now - ms(watch.lastSeenAt) < 90 * 1000;
  const go = async () => {
    setBusy(true); setErr('');
    try { await Promise.all(kinds.map((k) => setDoc(doc(db, 'syncRequests', k), { status: 'pending', requestedAt: serverTimestamp(), requestedBy: profile?.email || '', message: '', kind: k }))); }
    catch (e) { setErr('ส่งคำขอไม่สำเร็จ: ' + (e.code || e.message)); } finally { setBusy(false); }
  };
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <button type="button" className="btn btn-primary" onClick={go} disabled={busy || st.active} title="สั่งให้เครื่อง JHCIS ดึงข้อมูลล่าสุดขึ้นระบบทันที">
        {busy || st.active ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} {st.running ? 'กำลังประมวลผล…' : st.active ? 'รอเครื่อง JHCIS รับคำสั่ง…' : 'ประมวลผลทันที'}
      </button>
      <span className="text-xs text-slate-500">
        {err ? <b className="text-red-600">{err}</b>
          : st.stale ? <b className="text-amber-700">⚠️ เครื่อง JHCIS ยังไม่ตอบสนอง — ตรวจว่าเปิดตัวรอรับคำสั่ง (run-watch.bat) ไว้ แล้วกดใหม่</b>
          : st.failed && !st.active ? <b className="text-red-600">❌ ประมวลผลไม่สำเร็จ: {st.failed.message || 'ดูไฟล์ sync.log บนเครื่อง JHCIS'}</b>
          : st.last ? <>✅ ประมวลผลล่าสุด {hhmm(st.last.finishedAt)} น. {online ? '· 🟢 เครื่อง JHCIS พร้อมรับคำสั่ง' : '· ⚪ เครื่อง JHCIS ยังไม่เชื่อมต่อ'}</>
          : <>{online ? '🟢 เครื่อง JHCIS พร้อมรับคำสั่ง' : '⚪ เครื่อง JHCIS ยังไม่เชื่อมต่อ (ต้องเปิด run-watch.bat บนเครื่อง JHCIS)'} · ประมวลผล: {kinds.map((k) => LABEL[k]).join(' + ')}</>}
      </span>
    </div>);
}
