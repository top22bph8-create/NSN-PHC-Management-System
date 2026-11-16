import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { Loader2, MessageCircle, RefreshCw } from 'lucide-react';
import { functions } from '../firebase';
import { getLineMeta, getLineStatus, setLineActiveChannel } from '../lib/lineNotify';
import { fmtDateTime } from '../lib/thai';

// การ์ดโควตาข้อความไลน์ช่อง 1 และ 2 บนแดชบอร์ด (เฉพาะ Super Admin — ผู้เรียกต้องกรองสิทธิ์เอง และฟังก์ชัน getLineQuota ตรวจสิทธิ์ซ้ำฝั่งเซิร์ฟเวอร์)
const CH = { '1': { name: 'ไลน์ช่อง 1', sub: 'หลัก', ring: 'border-sky-200', head: 'bg-sky-600' }, '2': { name: 'ไลน์ช่อง 2', sub: 'สำรอง', ring: 'border-emerald-200', head: 'bg-emerald-600' } };
const STALE_MS = 30 * 60 * 1000;

export default function LineQuotaCard() {
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const load = () => Promise.all([getLineStatus(), getLineMeta().catch(() => ({}))])
    .then(([a, m]) => { const next = { ...a, activeChannel: m.activeChannel || a.activeChannel || '1', autoSwitch: m.autoSwitch }; setSt(next); return next; })
    .catch(() => { setSt({}); return {}; });
  const check = async () => {
    setBusy(true); setErr('');
    try { await httpsCallable(functions, 'getLineQuota')(); await load(); }
    catch (e) { setErr(e.message || 'ตรวจโควตาไม่สำเร็จ'); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    load().then((s) => {
      const at = s?.quota?.checkedAt?.toDate ? s.quota.checkedAt.toDate().getTime() : 0;
      if (!s?.quotas || Date.now() - at > STALE_MS) check(); // ข้อมูลเก่ากว่า 30 นาที → ตรวจใหม่อัตโนมัติ
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!st) return null;
  const quotas = st.quotas || {};
  if (!Object.keys(quotas).length && !busy) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
        <MessageCircle className="h-5 w-5 text-slate-500" /> โควตาข้อความไลน์: ยังไม่เคยตรวจ
        <button type="button" className="btn btn-outline ml-auto !py-1 text-xs" onClick={check}><RefreshCw className="h-4 w-4" /> ตรวจโควตา</button>
        {err && <span className="w-full text-xs text-red-600">{err}</span>}
      </div>
    );
  }
  const act = String(st.activeChannel || '1');
  const checkedAt = st.quota?.checkedAt;
  const doSwitch = async (c) => { setBusy(true); try { await setLineActiveChannel(c); await load(); } catch (e) { setErr(e.message || 'สลับช่องไม่สำเร็จ'); } finally { setBusy(false); } };

  return (
    <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-600 text-white"><MessageCircle className="h-5 w-5" /></span>
        <div>
          <div className="font-semibold leading-tight text-slate-800">โควตาข้อความไลน์เดือนนี้</div>
          <div className="text-xs text-slate-500">
            {checkedAt?.toDate ? `ตรวจล่าสุด ${fmtDateTime(checkedAt)}` : ''}{st.autoSwitch === false ? ' · สลับอัตโนมัติ: ปิด' : ' · สลับอัตโนมัติ: เปิด'}
          </div>
        </div>
        <button type="button" className="btn btn-outline ml-auto !py-1 text-xs" onClick={check} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} ตรวจโควตาตอนนี้</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {['1', '2'].map((c) => {
          const x = quotas[c];
          const meta = CH[c];
          if (!x) return (
            <div key={c} className="rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-400">{meta.name} ({meta.sub}): ยังไม่ได้ตั้งค่า token</div>
          );
          const pct = x.limited && x.limit ? Math.min(100, Math.round((x.used / x.limit) * 100)) : 0;
          const full = x.limited && x.remaining <= 0;
          const bar = full || pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500';
          const isAct = act === c;
          return (
            <div key={c} className={`rounded-xl border-2 p-3 ${isAct ? meta.ring : 'border-slate-200'} ${isAct ? 'bg-white' : 'bg-slate-50/60'}`}>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold text-white ${meta.head}`}>{meta.name} · {meta.sub}</span>
                {isAct ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">● ใช้ส่งอยู่</span>
                  : <button type="button" className="ml-auto rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100" onClick={() => doSwitch(c)} disabled={busy}>สลับมาใช้ช่องนี้</button>}
              </div>
              {x.error ? <div className="text-sm text-red-600">ตรวจไม่ได้: {x.error}</div> : x.limited ? (
                <>
                  <div className="flex items-baseline justify-between">
                    <span className={`text-2xl font-bold ${full ? 'text-red-600' : 'text-slate-800'}`}>เหลือ {x.remaining}</span>
                    <span className="text-sm text-slate-500">ใช้ไป {x.used} / {x.limit} ({pct}%)</span>
                  </div>
                  <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-200"><div className={`h-2.5 rounded-full ${bar}`} style={{ width: `${pct}%` }} /></div>
                  {full && <div className="mt-1 text-xs font-medium text-red-600">โควตาเต็ม</div>}
                </>
              ) : <div className="text-sm text-slate-600">ไม่จำกัดจำนวน (ใช้ไป {x.used} ข้อความ)</div>}
            </div>
          );
        })}
      </div>
      {err && <div className="mt-1 text-xs text-red-600">{err}</div>}
    </div>
  );
}
