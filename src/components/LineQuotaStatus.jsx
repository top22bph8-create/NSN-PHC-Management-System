import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { functions } from '../firebase';
import { getLineStatus, getLineMeta, setLineActiveChannel } from '../lib/lineNotify';
import { fmtDateTime } from '../lib/thai';

// สถานะโควตา/การส่งไลน์ — full = หน้าตั้งค่า (มีปุ่มตรวจโควตา แสดงเสมอ), ไม่ full = แดชบอร์ด (แสดงเฉพาะเมื่อมีปัญหาหรือโควตาใกล้เต็ม)
export default function LineQuotaStatus({ full }) {
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // ช่องที่ใช้ส่งจริง/สลับอัตโนมัติ อ่านจาก lineNotifyMeta (ค่าจริงที่สลับได้ทันที) ส่วน lineStatus เป็นแค่ภาพตอนตรวจโควตาล่าสุด
  const load = () => Promise.all([getLineStatus(), getLineMeta().catch(() => ({}))]).then(([a, m]) => setSt({ ...a, activeChannel: m.activeChannel || a.activeChannel || '1', autoSwitch: m.autoSwitch })).catch(() => setSt({}));
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
  const quotas = st.quotas || {};
  const hasPer = Object.keys(quotas).length > 0;
  const act = String(st.activeChannel || '1');
  const okQ = (ch) => (quotas[ch] && !quotas[ch].error ? quotas[ch] : null);
  const isExh = (x) => !!x && !!x.limited && x.remaining <= 0;
  // ช่องสำรองที่แนะนำให้สลับไป: ช่องอื่นที่ยังมีโควตาเหลือก่อน (รองรับ 3 ช่อง) ไม่มีก็ช่องอื่นช่องแรก
  const others = ['1', '2', '3'].filter((c) => c !== act);
  const other = others.find((c) => okQ(c) && !isExh(okQ(c))) || others.find((c) => okQ(c)) || others[0];
  // โควตาของช่องที่ "ใช้อยู่" (ถ้ามีข้อมูลรายช่อง) ไม่ใช่ช่องแรกเสมอไป
  const q = hasPer ? okQ(act) : st.quota;
  const e = st.lastError;
  const pct = q ? (q.percent ?? (q.limited && q.limit ? Math.round((q.used / q.limit) * 100) : null)) : null;
  // เวลา (ms) ของข้อผิดพลาดล่าสุด และของการตรวจโควตาล่าสุด
  const tms = (t) => (t?.toDate ? t.toDate().getTime() : 0);
  const errAt = tms(e?.at);
  const quotaAt = tms(st.quota?.checkedAt);
  const quotaKnown = !!q && q.limited !== undefined;
  const exhausted = quotaKnown && q.limited && q.remaining <= 0;
  // ข้อผิดพลาดเก่าที่ช่องที่ใช้อยู่โควตายังเหลือและตรวจ/สลับหลังเกิดข้อผิดพลาดแล้ว = ข้อมูลค้าง ไม่ต้องแสดง
  const staleError = !!e && quotaKnown && !exhausted && (quotaAt > errAt || tms(st.lastSwitch?.at) > errAt);
  const showErr = !!e && !staleError;
  const monthlyErr = showErr && /monthly limit/i.test(e.message || '');
  // ช่องสำรองยังมีโควตาเหลือ → ไม่ใช่วิกฤต แค่ให้สลับช่อง
  const otherQ = okQ(other);
  const otherOk = !!otherQ && !isExh(otherQ);
  const switchable = (exhausted || monthlyErr) && otherOk;
  // โควตาเต็มจริงเมื่อ LINE ตอบ "monthly limit" หรือตรวจโควตาแล้วเหลือ 0 และไม่มีช่องสำรองเหลือ
  const quotaFull = (exhausted || monthlyErr) && !otherOk;
  const warn = !quotaFull && !switchable && pct !== null && pct >= 80;
  const problem = showErr || quotaFull || warn || switchable;
  if (!full && !problem) return null;
  const redBox = (showErr || quotaFull) && !switchable;
  const doSwitch = async () => {
    setBusy(true); setErr('');
    try { await setLineActiveChannel(other); setSt((p) => ({ ...(p || {}), activeChannel: other })); await load(); }
    catch (x) { setErr(x.message || 'สลับช่องไม่สำเร็จ'); }
    finally { setBusy(false); }
  };

  // บนแดชบอร์ดแสดงการ์ดเดียวเท่านั้น: เต็ม/ส่งไม่สำเร็จ (แดง) > สลับช่องได้ (เหลือง) > ใกล้เต็ม (เหลือง) — หน้าตั้งค่าแสดงแถบโควตาเสมอ
  const showBar = full || warn;

  return (
    <div className="mb-4 space-y-2">
      {switchable && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <b>โควตาไลน์ช่อง {act} เต็มแล้ว — ช่อง {other} ยังเหลือ {otherQ.limited ? `${otherQ.remaining} ข้อความ` : 'ไม่จำกัด'}</b>
            <div className="text-xs">{st.autoSwitch === false ? 'ปิดสลับอัตโนมัติอยู่ กดปุ่มเพื่อสลับ' : 'ระบบจะสลับให้อัตโนมัติเมื่อส่งแจ้งเตือนครั้งถัดไป หรือกดสลับทันทีได้ที่นี่'}</div>
          </div>
          <button type="button" className="btn btn-primary !py-1 text-xs" onClick={doSwitch} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} สลับไปไลน์ช่อง {other} ทันที</button>
        </div>
      )}
      {redBox && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <b>{quotaFull ? 'โควตาข้อความไลน์เดือนนี้เต็มแล้ว — ระบบส่งแจ้งเตือนเข้าไลน์ไม่ได้ จนกว่าจะขึ้นเดือนใหม่ (หรืออัปเกรดแพ็กเกจ LINE OA)' : `ส่งแจ้งเตือนไลน์ไม่สำเร็จ (HTTP ${e?.status || '?'})`}</b>
            {showErr && <div className="text-xs text-red-700">ครั้งล่าสุด {e.at?.toDate ? fmtDateTime(e.at) : ''}{!quotaFull && e.message ? ` · ${e.message}` : ''}</div>}
          </div>
        </div>
      )}
      {showBar && (full || !(redBox || switchable)) && (
        <div className={`rounded-lg border p-3 text-sm ${warn || quotaFull || switchable ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-brand-100 bg-white text-slate-700'}`}>
          <div className="flex flex-wrap items-center gap-2">
            {warn || quotaFull || switchable ? <AlertTriangle className="h-5 w-5 text-amber-600" /> : <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
            <b>โควตาข้อความไลน์{hasPer ? ` (ช่อง ${act} ที่ใช้อยู่)` : ''}</b>
            {q ? (q.limited ? <span>ใช้ไป {q.used} / {q.limit} ข้อความ ({pct}%) · เหลือ {q.remaining}</span> : <span>ไม่จำกัดจำนวน (ใช้ไป {q.used} ข้อความเดือนนี้)</span>) : <span className="text-slate-500">ยังไม่เคยตรวจ</span>}
            {full && <button type="button" className="btn btn-outline ml-auto !py-1 text-xs" onClick={check} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} ตรวจโควตาตอนนี้</button>}
          </div>
          {q?.limited && <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-2 rounded-full ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>}
          {st.quotas && Object.keys(st.quotas).length > 1 && (
            <div className="mt-1 text-xs text-slate-600">
              {Object.entries(st.quotas).map(([ch, x]) => (
                <span key={ch} className="mr-3">ไลน์ช่อง {ch}{String(st.activeChannel || '1') === ch ? ' (ใช้อยู่)' : ''}: {x.error ? 'ตรวจไม่ได้' : x.limited ? `ใช้ ${x.used}/${x.limit} เหลือ ${x.remaining}` : `ใช้ ${x.used} (ไม่จำกัด)`}</span>
              ))}
              {st.lastSwitch?.at?.toDate && <span className="text-slate-500">· สลับอัตโนมัติล่าสุด {fmtDateTime(st.lastSwitch.at)} ไปช่อง {st.lastSwitch.to}</span>}
            </div>
          )}
          {q?.checkedAt?.toDate && <div className="mt-1 text-xs text-slate-500">ตรวจล่าสุด {fmtDateTime(q.checkedAt)} · ระบบตรวจอัตโนมัติทุกวัน 08:00 และเตือนเข้าไลน์เมื่อใช้ไป 80%</div>}
          {err && <div className="mt-1 text-xs text-red-600">{err}</div>}
        </div>
      )}
    </div>
  );
}
