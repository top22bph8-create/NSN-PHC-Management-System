import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { functions } from '../firebase';
import { getLineStatus } from '../lib/lineNotify';
import { fmtDateTime } from '../lib/thai';

// สถานะโควตา/การส่งไลน์ — full = หน้าตั้งค่า (มีปุ่มตรวจโควตา แสดงเสมอ), ไม่ full = แดชบอร์ด (แสดงเฉพาะเมื่อมีปัญหาหรือโควตาใกล้เต็ม)
export default function LineQuotaStatus({ full }) {
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const load = () => getLineStatus().then(setSt).catch(() => setSt({}));
  useEffect(() => { load(); }, []);

  const check = async () => {
    setBusy(true); setErr('');
    try {
      const { data } = await httpsCallable(functions, 'getLineQuota')();
      setSt((p) => ({ ...(p || {}), quota: { ...data, checkedAt: { toDate: () => new Date() } } }));
      load();
    } catch (e) { setErr(e.message || 'ตรวจโควตาไม่สำเร็จ (ต้องติดตั้ง Cloud Function ก่อน)'); }
    finally { setBusy(false); }
  };

  if (!st) return null;
  const q = st.quota;
  const e = st.lastError;
  const pct = q?.percent ?? null;
  const problem = !!e || (pct !== null && pct >= 80);
  if (!full && !problem) return null;

  return (
    <div className="mb-4 space-y-2">
      {e && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <b>{e.quotaFull ? 'โควตาข้อความไลน์เดือนนี้เต็มแล้ว — ระบบส่งแจ้งเตือนเข้าไลน์ไม่ได้ จนกว่าจะขึ้นเดือนใหม่ (หรืออัปเกรดแพ็กเกจ LINE OA)' : `ส่งแจ้งเตือนไลน์ไม่สำเร็จ (HTTP ${e.status || '?'})`}</b>
            <div className="text-xs text-red-700">ครั้งล่าสุด {e.at?.toDate ? fmtDateTime(e.at) : ''}{!e.quotaFull && e.message ? ` · ${e.message}` : ''}</div>
          </div>
        </div>
      )}
      {(full || (pct !== null && pct >= 80)) && (
        <div className={`rounded-lg border p-3 text-sm ${pct !== null && pct >= 80 ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-brand-100 bg-white text-slate-700'}`}>
          <div className="flex flex-wrap items-center gap-2">
            {pct !== null && pct >= 80 ? <AlertTriangle className="h-5 w-5 text-amber-600" /> : <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
            <b>โควตาข้อความไลน์</b>
            {q ? (q.limited ? <span>ใช้ไป {q.used} / {q.limit} ข้อความ ({pct}%) · เหลือ {q.remaining}</span> : <span>ไม่จำกัดจำนวน (ใช้ไป {q.used} ข้อความเดือนนี้)</span>) : <span className="text-slate-500">ยังไม่เคยตรวจ</span>}
            {full && <button type="button" className="btn btn-outline ml-auto !py-1 text-xs" onClick={check} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} ตรวจโควตาตอนนี้</button>}
          </div>
          {q?.limited && <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-2 rounded-full ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>}
          {q?.checkedAt?.toDate && <div className="mt-1 text-xs text-slate-500">ตรวจล่าสุด {fmtDateTime(q.checkedAt)} · ระบบตรวจอัตโนมัติทุกวัน 08:00 และเตือนเข้าไลน์เมื่อใช้ไป 80%</div>}
          {err && <div className="mt-1 text-xs text-red-600">{err}</div>}
        </div>
      )}
    </div>
  );
}
