// ปุ่ม "ประมวลผลทันที": ขอให้เครื่อง JHCIS ซิงก์ข้อมูลล่าสุดขึ้นระบบทันที (ผ่านตัวรอรับคำสั่ง node sync.mjs --watch บนเครื่อง JHCIS)
import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { AlertTriangle, CheckCircle2, Loader2, PlugZap, RefreshCw, X } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

const LABEL = { service: 'สถิติบริการ', rights: 'ทะเบียนสิทธิ', pp: 'ผลงาน P&P', targets: 'รายชื่อเป้าหมาย P&P' };
const STALE_MS = 3 * 60 * 1000; // คำขอค้างเกิน 3 นาที ถือว่าเครื่อง JHCIS ไม่ตอบสนอง
const ONLINE_MS = 90 * 1000; // ตัวรอรับคำสั่งส่งสัญญาณทุก 15 วินาที — เงียบเกิน 90 วินาทีถือว่าหยุดเชื่อมต่อ
const ms = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : 0);
const hhmm = (t) => (ms(t) ? new Date(ms(t)).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '');


// สถานะการเชื่อมต่อ JHCIS แบบเข้าใจง่าย: เขียว = กำลังเชื่อมต่อ / แดง = หยุดเชื่อมต่อ + ปุ่ม "เชื่อมต่ออัตโนมัติ" (เปิดหน้าตรวจสาเหตุและวิธีกู้คืน)
function useLinkState(watch, now) {
  const seen = ms(watch?.lastSeenAt); const keyAt = ms(watch?.keyCreatedAt);
  const online = !!seen && now - seen < ONLINE_MS;
  let cause = '';
  if (!online) {
    if (keyAt && keyAt > seen) cause = 'key';
    else if (!seen) cause = 'never';
    else cause = 'down';
  }
  return { online, seen, cause };
}
const fmtAgo = (t, now) => { if (!t) return 'ยังไม่เคยเชื่อมต่อ'; const m = Math.max(0, Math.round((now - t) / 60000)); return m < 1 ? 'เมื่อสักครู่' : m < 60 ? `${m} นาทีที่แล้ว` : m < 1440 ? `${Math.floor(m / 60)} ชม.ที่แล้ว` : `${Math.floor(m / 1440)} วันที่แล้ว`; };

export function JhcisLinkStatus({ watch, now }) {
  const [open, setOpen] = useState(false);
  const { online, seen, cause } = useLinkState(watch, now);
  const causeText = { key: 'คีย์เชื่อมข้อมูลถูกสร้างใหม่ แต่เครื่อง JHCIS ยังใช้คีย์เก่า', never: 'ยังไม่เคยมีสัญญาณจากเครื่อง JHCIS', down: 'ไม่ได้รับสัญญาณจากเครื่อง JHCIS (ปิดเครื่อง/ตัวเชื่อมต่อหยุด/ไม่มีอินเทอร์เน็ต)' }[cause];
  return (
    <>
      {online ? (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800" role="status">
          <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" /></span>
          กำลังเชื่อมต่อกับ JHCIS
        </span>
      ) : (
        <span className="inline-flex flex-wrap items-center gap-2 rounded-full border border-red-300 bg-red-50 py-0.5 pl-3 pr-1 text-xs font-semibold text-red-800" role="alert">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-500" /> หยุดการเชื่อมต่อกับ JHCIS</span>
          <button type="button" className="inline-flex items-center gap-1 rounded-full bg-red-600 px-3 py-1 text-white hover:bg-red-700" onClick={() => setOpen(true)}><PlugZap className="h-3.5 w-3.5" /> เชื่อมต่ออัตโนมัติ</button>
        </span>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2">
              <PlugZap className="h-5 w-5 text-red-600" /><b className="text-base">กู้คืนการเชื่อมต่อ JHCIS</b>
              <button type="button" className="ml-auto rounded p-1 text-slate-500 hover:bg-slate-100" onClick={() => setOpen(false)} aria-label="ปิด"><X className="h-4 w-4" /></button>
            </div>
            {online ? (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="h-5 w-5" /> เชื่อมต่อกับ JHCIS สำเร็จแล้ว — ใช้งานได้ตามปกติ</div>
            ) : (
              <div className="space-y-3 text-sm text-slate-700">
                <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-red-800"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><b>{causeText}</b><div className="text-xs">สัญญาณล่าสุด: {fmtAgo(seen, now)} (หน้านี้ตรวจอัตโนมัติทุก 15 วินาที)</div></div></div>
                {cause === 'key' && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                    <b>แก้ด้วยการตั้งคีย์ใหม่บนเครื่อง JHCIS (ทำครั้งเดียว)</b>
                    <ol className="ml-5 mt-1 list-decimal space-y-0.5">
                      <li>หน้า “สถิติการให้บริการ” กด <b>สร้างคีย์เชื่อมข้อมูลใหม่</b> (คีย์ถูกคัดลอกลงคลิปบอร์ด) — ถ้าสร้างไว้แล้วและยังไม่ได้ใช้ ข้ามไปข้อ 2</li>
                      <li>บนเครื่อง JHCIS ดับเบิลคลิก <code>C:\nsn-sync\set-key-v2.bat</code> (ถ้าขอให้วางคีย์ คลิกขวา 1 ครั้ง แล้วกด Enter)</li>
                      <li>รอประมาณ 30 วินาที สถานะบนหน้านี้จะเปลี่ยนเป็นสีเขียวเอง</li>
                    </ol>
                  </div>
                )}
                {cause !== 'key' && (
                  <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
                    <b>ให้ระบบกู้คืนเองอัตโนมัติ (ติดตั้งตัวเฝ้าระวัง ทำครั้งเดียว)</b>
                    <ol className="ml-5 mt-1 list-decimal space-y-0.5">
                      <li>เปิดเครื่อง JHCIS ให้ออนไลน์ (ล็อกอิน Windows)</li>
                      <li>เปิดโฟลเดอร์ <code>C:\nsn-sync</code> แล้วดับเบิลคลิก <code>install-keepalive.bat</code></li>
                      <li>หลังจากนั้นทุก 1 นาที ระบบตรวจและเปิดตัวเชื่อมต่อกลับให้เองเมื่อหยุด (รวมถึงเปิดเครื่องใหม่/ปิดหน้าต่างพลาด) — ถ้าเพิ่งเปิดเครื่อง รอไม่เกิน 1–2 นาที</li>
                    </ol>
                    <p className="mt-1 text-xs text-slate-500">ถ้าติดตั้งแล้วแต่ยังแดง แปลว่าเครื่อง JHCIS ปิดอยู่/ไม่มีอินเทอร์เน็ต หรือคีย์ไม่ตรง — ลองตั้งคีย์ใหม่ด้วย <code>set-key-v2.bat</code></p>
                  </div>
                )}
              </div>
            )}
            <div className="mt-3 flex justify-end"><button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>ปิด</button></div>
          </div>
        </div>
      )}
    </>
  );
}

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
  const online = useLinkState(watch, now).online;
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
      <JhcisLinkStatus watch={watch} now={now} />
      <span className="text-xs text-slate-500">
        {err ? <b className="text-red-600">{err}</b>
          : st.stale && !online ? <b className="text-amber-700">⚠️ คำสั่งค้างอยู่ — จะประมวลผลให้เองทันทีที่เชื่อมต่อ JHCIS ได้</b>
          : st.stale ? <b className="text-amber-700">⚠️ เครื่อง JHCIS ยังไม่ตอบสนองคำสั่งล่าสุด — กดใหม่อีกครั้ง</b>
          : st.failed && !st.active ? <b className="text-red-600">❌ ประมวลผลไม่สำเร็จ: {st.failed.message || 'ดูไฟล์ sync.log บนเครื่อง JHCIS'}</b>
          : st.last ? <>✅ ประมวลผลล่าสุด {hhmm(st.last.finishedAt)} น.</>
          : <>ประมวลผล: {kinds.map((k) => LABEL[k]).join(' + ')}</>}
      </span>
    </div>);
}
