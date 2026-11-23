// ระบบคัดกรองกลุ่มเสี่ยง NCD (เบาหวาน/ความดันโลหิตสูง) — เฟส 1: บันทึกผลคัดกรองบนมือถือ + แปลผลอัตโนมัติ + สรุป/ส่งออก
// ยังไม่เขียนกลับ JHCIS (เฟส 2 หลังตรวจ schema และอนุมัติ) — ทุกรายการมีสถานะ jhcis = 'pending'
import { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import QRCode from 'qrcode';
import { BadgeCheck, Copy, DatabaseZap, KeyRound, Download, FileSpreadsheet, HeartPulse, LayoutList, MapPinned, Pencil, Plus, QrCode, RefreshCw, Search, Trash2, Users } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { normalizeRole } from '../lib/roles';
import { getNcdPublic, ncdPublicUrl, ncdTargetStatus, ncdVillageUrl, newToken, saveNcdPublic, villageKey } from '../lib/ncdPublic';
import { writeAudit } from '../lib/audit';
import { fmtDate } from '../lib/thai';
import { PageHeader } from '../components/Logo';
import ScreenWizard from './ncd/ScreenWizard';
import AuthenQueue from './ncd/AuthenQueue';
import { ExportModal, JhcisModal, OVL, fyStartOf } from './ncd/NcdTools';
import { deriveRow, feeStatus } from '../lib/ncdScreen';
import { Badge, ConfirmDialog, EmptyState, Modal, Spinner } from '../components/ui';
import { useVillages } from '../modules/outbreak/outbreakRefs';


// ลิงก์/QR สำหรับ อสม. (Super Admin เท่านั้น): เปิด-ปิด สร้างรหัสใหม่ คัดลอกลิงก์ ดาวน์โหลด QR
function AsmLinkModal({ onClose, villages }) {
  const [cfg, setCfg] = useState(null); const [qr, setQr] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const [sure, setSure] = useState(false);
  useEffect(() => { getNcdPublic().then(setCfg).catch(() => setCfg({ enabled: false, token: '' })); }, []);
  const url = cfg?.token ? ncdPublicUrl(cfg.token) : '';
  useEffect(() => { if (url) QRCode.toDataURL(url, { width: 720, margin: 1, errorCorrectionLevel: 'M' }).then(setQr); else setQr(''); }, [url]);
  const [vq, setVq] = useState({});
  useEffect(() => {
    if (!cfg?.token || !villages?.length) { setVq({}); return undefined; }
    let live = true;
    (async () => { const out = {}; for (const v of villages) { const k = await villageKey(cfg.token, v.no); const link = ncdVillageUrl(k, v.no); out[v.no] = { link, img: await QRCode.toDataURL(link, { width: 640, margin: 1, errorCorrectionLevel: 'M' }) }; } if (live) setVq(out); })().catch(() => {});
    return () => { live = false; };
  }, [cfg?.token, villages]);
  const copyV = async (link) => { try { await navigator.clipboard.writeText(link); setMsg('คัดลอกลิงก์หมู่บ้านแล้ว'); } catch { setMsg('คัดลอกไม่ได้ — กดค้างที่ลิงก์'); } };
  const apply = async (v) => { setBusy(true); try { await saveNcdPublic(v); setCfg((p) => ({ ...p, ...v })); } catch (e) { setMsg(e.message || 'บันทึกไม่สำเร็จ'); } finally { setBusy(false); } };
  const copy = async () => { try { await navigator.clipboard.writeText(url); setMsg('คัดลอกลิงก์แล้ว'); } catch { setMsg('คัดลอกไม่ได้ — กดค้างที่ลิงก์เพื่อคัดลอก'); } };
  if (!cfg) return <Modal title="ลิงก์/QR สำหรับ อสม." onClose={onClose}><Spinner /></Modal>;
  return (
    <Modal title="ลิงก์/QR สำหรับ อสม." onClose={onClose} footer={<button className="btn btn-outline" onClick={onClose}>ปิด</button>}>
      <div className="space-y-3 text-sm">
        <p className="text-slate-600">อสม. สแกน QR แล้วกรอกคัดกรองบนมือถือได้โดยไม่ต้องล็อกอิน ข้อมูลที่ส่งมาจะขึ้นสถานะ “รอตรวจสอบ” ให้เจ้าหน้าที่ยืนยัน</p>
        {!cfg.token ? <button className="btn btn-primary" disabled={busy} onClick={() => apply({ token: newToken(), enabled: true })}>สร้างลิงก์ใหม่</button> : (<>
          <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={!!cfg.enabled} disabled={busy} onChange={(e) => apply({ enabled: e.target.checked })} /> เปิดรับข้อมูลจาก อสม.</label>
          {qr && <img src={qr} alt="QR Code คัดกรอง NCD" className={`mx-auto h-60 w-60 rounded-xl border p-2 ${cfg.enabled ? '' : 'opacity-40'}`} />}
          <input readOnly aria-label="ลิงก์สำหรับ อสม." className="input text-xs" value={url} onFocus={(e) => e.target.select()} />
          <div className="border-t pt-3"><div className="font-semibold">QR แยกรายหมู่บ้าน (แสดงรายชื่อกลุ่มเป้าหมายของหมู่นั้นให้เลือก)</div>
            <p className="mb-2 text-xs text-slate-500">รายชื่อมาจากการซิงก์ JHCIS (รันตัวส่งรายชื่อ NCD ที่เครื่อง JHCIS ก่อน) QR ของหมู่ไหนเห็นเฉพาะคนในหมู่นั้น</p>
            <div className="grid grid-cols-2 gap-3">
              {(villages || []).map((v) => (
                <div key={v.no} className={`rounded-xl border p-2 text-center ${cfg.enabled ? '' : 'opacity-40'}`}>
                  <div className="mb-1 text-sm font-semibold">ม.{v.no} {v.name}</div>
                  {vq[v.no] ? <img src={vq[v.no].img} alt={`QR หมู่ ${v.no}`} className="mx-auto h-36 w-36" /> : <div className="mx-auto h-36 w-36 animate-pulse rounded bg-slate-100" />}
                  {vq[v.no] && <div className="mt-1 flex justify-center gap-1"><button className="btn btn-outline !px-2 !py-1 text-xs" onClick={() => copyV(vq[v.no].link)}><Copy className="h-3 w-3" /> ลิงก์</button><a className="btn btn-outline !px-2 !py-1 text-xs" href={vq[v.no].img} download={`qr-ncd-moo${v.no}.png`}><Download className="h-3 w-3" /> QR</a></div>}
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-outline" onClick={copy}><Copy className="h-4 w-4" /> คัดลอกลิงก์</button>
            <a className="btn btn-outline" href={qr} download="qr-ncd-asm.png"><Download className="h-4 w-4" /> ดาวน์โหลด QR</a>
            <button className="btn btn-outline text-red-600" disabled={busy} onClick={() => { if (!sure) { setSure(true); return; } setSure(false); apply({ token: newToken(), enabled: true }); }}>{sure ? 'กดอีกครั้งเพื่อยืนยัน (QR เก่าจะใช้ไม่ได้)' : 'สร้างรหัสใหม่'}</button>
          </div>
        </>)}
        {msg && <div className="text-xs text-slate-600" role="status">{msg}</div>}
      </div>
    </Modal>
  );
}

// รายชื่อกลุ่มเป้าหมาย 15–59 ปี ของหมู่บ้าน แยก ทำแล้ว / ยังไม่ทำ (ทำแล้ว = JHCIS ปีงบนี้ หรือบันทึกในแอปปีงบนี้)
function VillageRoster({ no, name, st, rows, onClose, onRefresh }) {
  const [tab, setTab] = useState('todo'); const [q, setQ] = useState('');
  const byId = useMemo(() => Object.fromEntries((rows || []).map((r) => [r.id, r])), [rows]);
  const people = st?.people || [];
  const cnt = { all: people.length, done: people.filter((p) => p.status).length, todo: people.filter((p) => !p.status).length };
  const shown = people.filter((p) => (tab === 'all' || (tab === 'done' ? p.status : !p.status)) && (!q || `${p.name} ${p.hno}`.includes(q.trim())));
  return (
    <Modal title={`กลุ่มเป้าหมาย ม.${no} ${name || ''}`} onClose={onClose} footer={<><button className="btn btn-outline" onClick={onRefresh}><RefreshCw className="h-4 w-4" /> รีเฟรช</button><button className="btn btn-outline" onClick={onClose}>ปิด</button></>}>
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">{[['todo', 'ยังไม่ทำ'], ['done', 'ทำแล้ว'], ['all', 'ทั้งหมด']].map(([k, t]) => <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-full px-3 py-1 text-xs font-bold ${tab === k ? (k === 'todo' ? 'bg-rose-600 text-white' : k === 'done' ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-white') : 'bg-slate-100 text-slate-600'}`}>{t} ({cnt[k]})</button>)}</div>
        <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input aria-label="ค้นหาชื่อหรือบ้านเลขที่" className="input pl-9" placeholder="ค้นหาชื่อ / บ้านเลขที่" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {!st ? <Spinner /> : !people.length && !st.villages?.[no] ? <p className="rounded-xl bg-slate-100 p-4 text-center text-slate-500">ยังไม่มีรายชื่อเป้าหมายของหมู่นี้ (ต้องรันตัวซิงก์ที่เครื่อง JHCIS: sync.mjs --ncd-targets)</p> : (
          <ul className="max-h-[55vh] space-y-1 overflow-y-auto">
            {shown.map((p) => { const r = p.appId ? byId[p.appId] : null; return (
              <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-xl border p-2">
                <div className="min-w-0 flex-1"><div className="font-semibold">{p.name}</div><div className="text-xs text-slate-500">{p.sex === 'M' ? 'ชาย' : 'หญิง'} · บ้านเลขที่ {p.hno || '-'} · {p.mask || 'ไม่มีเลขบัตร'}</div></div>
                {p.jh && <Badge className="bg-emerald-100 text-emerald-800">ทำแล้วใน JHCIS</Badge>}
                {p.status === 'app' && <Badge className="bg-sky-100 text-sky-800">ทำในแอป{r ? ` · ${OVL[r.overall] || ''}` : ''}</Badge>}
                {!p.status && <Badge className="bg-rose-100 text-rose-700">ยังไม่ทำ</Badge>}
              </li>); })}
            {!shown.length && <li className="p-4 text-center text-slate-500">ไม่พบรายชื่อ</li>}
          </ul>)}
        <p className="text-xs text-slate-500">เลขบัตรแสดงแบบปิดบัง · รายชื่อเป้าหมาย ณ {st?.asOf || '-'} · ปีงบประมาณเริ่ม {st?.fy || '-'}</p>
      </div>
    </Modal>
  );
}

const OV = { normal: 'bg-emerald-100 text-emerald-800', risk: 'bg-yellow-100 text-yellow-800', suspect: 'bg-red-100 text-red-800' };

export default function NcdScreening() {
  const villages = useVillages(); const { profile } = useAuth(); const isSuper = normalizeRole(profile?.role) === 'super_admin'; const [linkOpen, setLinkOpen] = useState(false);
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState(''); const [fOv, setFOv] = useState(''); const [fVil, setFVil] = useState(''); const [fAge, setFAge] = useState('');
  const [form, setForm] = useState(null); const [del, setDel] = useState(null);
  const [authenOpen, setAuthenOpen] = useState(false); const [view, setView] = useState('all'); const [exportOpen, setExportOpen] = useState(false); const [jhcisOpen, setJhcisOpen] = useState(false); const [target, setTarget] = useState(null);
  const [st, setSt] = useState(null); const [rosterNo, setRosterNo] = useState(''); const [stTick, setStTick] = useState(0);
  useEffect(() => onSnapshot(doc(db, 'settings', 'ncdTargetSummary'), (d) => setTarget(d.exists() ? d.data() : null), () => setTarget(null)), []);
  useEffect(() => onSnapshot(collection(db, 'ncdScreenings'), (s) => setRows(s.docs.map((d) => deriveRow({ id: d.id, ...d.data() }))), () => setRows([])), []);
  const loadSt = (v) => { setSt(null); ncdTargetStatus(v ? { v } : {}).then(setSt).catch(() => setSt({ villages: {}, people: [], error: true })); };
  useEffect(() => { if (view === 'village' || rosterNo) loadSt(rosterNo); }, [view, rosterNo, stTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(() => (rows || []).filter((r) => (!q || `${r.name} ${r.cid}`.includes(q.trim())) && (!fOv || r.overall === fOv) && (!fVil || r.villageNo === fVil) && (!fAge || r.ageGroup === fAge)).sort((a, b) => String(b.screenDate).localeCompare(String(a.screenDate)) || String(a.name).localeCompare(String(b.name), 'th')), [rows, q, fOv, fVil, fAge]);
  const fy = fyStartOf();
  // ผลคัดกรองจริง: เฉพาะปีงบนี้ นับคนละครั้ง (เลขบัตร หรือ หมู่+ชื่อ) ใช้รายการล่าสุด
  const fyRows = useMemo(() => { const m = new Map(); (rows || []).forEach((r) => { if (String(r.screenDate || '') < fy) return; const k = r.cid || `${r.villageNo}|${String(r.name || '').replace(/\s+/g, '')}`; const o = m.get(k); if (!o || String(o.screenDate) < String(r.screenDate)) m.set(k, r); }); return [...m.values()]; }, [rows, fy]);
  const scoped = useMemo(() => fyRows.filter((r) => !fVil || String(r.villageNo) === fVil), [fyRows, fVil]);
  const stV = st?.villages || null;
  const tgt = useMemo(() => { const ks = Object.keys(stV || {}).filter((k) => !fVil || k === fVil); let total = 0; let done = 0; ks.forEach((k) => { total += stV[k].total; done += stV[k].jh + stV[k].appOnly; }); return stV ? { total, done, todo: total - done } : null; }, [stV, fVil]);
  const sum = useMemo(() => { const c = { total: scoped.length, normal: 0, risk: 0, suspect: 0 }; scoped.forEach((r) => { if (c[r.overall] != null) c[r.overall] += 1; }); return c; }, [scoped]);
  const byVillage = useMemo(() => {
    const nos = [...new Set([...(villages || []).map((v) => v.no), ...Object.keys(stV || {}), ...Object.keys(target?.byMoo || {}), ...(rows || []).map((r) => String(r.villageNo || ''))])].filter(Boolean).sort((a, b) => Number(a) - Number(b));
    return nos.map((no) => { const l = fyRows.filter((r) => String(r.villageNo) === no); const c = stV?.[no]; const t = target?.byMoo?.[no];
      const total = c ? c.total : (t?.total ?? null); const done = c ? c.jh + c.appOnly : (t ? (t.done || 0) + l.length : l.length);
      return { no, name: (villages || []).find((v) => v.no === no)?.name || '', total, done, jh: c ? c.jh : (t?.done ?? null), app: c ? c.appOnly : l.length, todo: total != null ? Math.max(0, total - done) : null, pct: total ? Math.min(100, Math.round((done / total) * 1000) / 10) : null, normal: l.filter((r) => r.overall === 'normal').length, risk: l.filter((r) => r.overall === 'risk').length, suspect: l.filter((r) => r.overall === 'suspect').length, pending: (rows || []).filter((r) => String(r.villageNo) === no && r.source === 'asm' && r.review !== 'approved').length }; });
  }, [rows, fyRows, villages, target, stV]);
  const authenWait = useMemo(() => (rows || []).filter((r) => r.authen?.status === 'requested').length, [rows]);
  if (!rows) return <Spinner />;
  const remove = async () => { await deleteDoc(doc(db, 'ncdScreenings', del.id)); await writeAudit({ action: 'delete', module: 'ncd-screening', docId: del.id, label: del.name }); setDel(null); };
  return (
    <div className="space-y-4">
      <PageHeader icon={HeartPulse} emoji="🩺" title="ระบบคัดกรองกลุ่มเสี่ยง NCD" subtitle="คัดกรองเบาหวาน/ความดันโลหิตสูง แยกเกณฑ์ตามช่วงอายุ 15–34 และ 35–59 ปี · แปลผลอัตโนมัติ" />
      <div className="-mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setForm({})} className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 px-4 py-2.5 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg"><Plus className="h-5 w-5" /> คัดกรองรายใหม่</button>
        <button type="button" onClick={() => setExportOpen(true)} disabled={!rows.length} className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 px-4 py-2.5 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50"><FileSpreadsheet className="h-5 w-5" /> รายงาน</button>
        <button type="button" onClick={() => setJhcisOpen(true)} className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 px-4 py-2.5 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg"><DatabaseZap className="h-5 w-5" /> นำเข้า JHCIS</button>
        <button type="button" onClick={() => setAuthenOpen(true)} className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg"><KeyRound className="h-5 w-5" /> คิวเปิดสิทธิ์ Authen{authenWait ? ` (${authenWait})` : ''}</button>
        {isSuper && <button type="button" onClick={() => setLinkOpen(true)} className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-rose-700 shadow-md ring-1 ring-rose-200 transition hover:-translate-y-0.5 hover:shadow-lg"><QrCode className="h-5 w-5" /> ลิงก์ / QR อสม.</button>}
      </div>
      <div role="tablist" aria-label="มุมมองรายงาน" className="inline-flex rounded-2xl bg-slate-100 p-1 shadow-inner">
        {[['all', 'ภาพรวมทั้งหมด', LayoutList], ['village', 'แยกรายหมู่บ้าน', MapPinned]].map(([k, t, Ic]) => <button key={k} role="tab" aria-selected={view === k} type="button" onClick={() => setView(k)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${view === k ? 'bg-white text-rose-700 shadow' : 'text-slate-500 hover:text-slate-700'}`}><Ic className="h-4 w-4" /> {t}</button>)}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[[tgt ? 'ทำแล้ว (JHCIS + แอป)' : 'คัดกรองในแอป (ปีงบนี้)', tgt ? tgt.done : sum.total, 'from-sky-600 to-cyan-500', tgt ? `จากเป้าหมาย ${tgt.total}` : ''], ['ยังไม่ทำ', tgt ? tgt.todo : '–', 'from-slate-600 to-slate-500', tgt && tgt.total ? `${Math.round((tgt.todo / tgt.total) * 1000) / 10}% ของเป้าหมาย` : ''], ['ปกติ', sum.normal, 'from-emerald-600 to-teal-500', 'ผลที่บันทึกในแอป'], ['กลุ่มเสี่ยง', sum.risk, 'from-amber-500 to-yellow-500', 'ผลที่บันทึกในแอป'], ['สงสัย/ส่งต่อ', sum.suspect, 'from-rose-600 to-red-500', 'ผลที่บันทึกในแอป']].map(([l, v, t, n]) => <div key={l} className={`rounded-2xl bg-gradient-to-br ${t} p-4 text-white shadow`}><div className="text-sm opacity-90">{l}</div><div className="text-3xl font-extrabold tabular-nums">{v}</div>{n && <div className="text-[11px] opacity-80">{n}</div>}</div>)}
      </div>
      <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-200">บันทึกและแปลผลในระบบนี้ · ปุ่ม “นำเข้า JHCIS” จัดคิว/ออกใบรหัสสำหรับคีย์ (ยังไม่เขียนลงฐาน JHCIS อัตโนมัติ) (เกณฑ์เป็นแนวทางเบื้องต้น กรุณาเทียบกับแนวทาง/KPI ฉบับล่าสุดก่อนใช้จริง)</div>
      {view === 'village' && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="p-3">หมู่บ้าน</th><th className="p-3 text-right">เป้าหมาย 15–59 ปี</th><th className="p-3 text-right">ทำแล้ว</th><th className="p-3 text-right">ยังไม่ทำ</th><th className="p-3">ความครอบคลุม</th><th className="p-3 text-right">ปกติ</th><th className="p-3 text-right">เสี่ยง</th><th className="p-3 text-right">สงสัย</th><th className="p-3 text-right">รอตรวจสอบ</th><th className="p-3" /></tr></thead>
            <tbody>
              {byVillage.map((v) => (
                <tr key={v.no} onClick={() => setFVil(fVil === v.no ? '' : v.no)} className={`cursor-pointer border-t transition hover:bg-rose-50 ${fVil === v.no ? 'bg-rose-50' : ''}`}>
                  <td className="p-3 font-semibold">ม.{v.no} {v.name}</td>
                  <td className="p-3 text-right tabular-nums">{v.total ?? '–'}</td>
                  <td className="p-3 text-right tabular-nums text-emerald-700">{v.done}</td><td className="p-3 text-right tabular-nums text-rose-600">{v.todo ?? '–'}</td>
                  <td className="p-3"><div className="flex items-center gap-2"><div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-400" style={{ width: `${v.pct || 0}%` }} /></div><span className="w-12 text-xs tabular-nums text-slate-600">{v.pct != null ? `${v.pct}%` : '–'}</span></div></td>
                  <td className="p-3 text-right tabular-nums text-emerald-700">{v.normal}</td><td className="p-3 text-right tabular-nums text-amber-700">{v.risk}</td><td className="p-3 text-right tabular-nums text-red-700">{v.suspect}</td><td className="p-3 text-right tabular-nums text-violet-700">{v.pending || ''}</td><td className="p-3 text-right"><button type="button" className="btn-outline !px-2 !py-1 text-xs" onClick={(e) => { e.stopPropagation(); setRosterNo(v.no); }}><Users className="h-3 w-3" /> รายชื่อ</button></td>
                </tr>
              ))}
              {!byVillage.length && <tr><td colSpan={10} className="p-4 text-center text-slate-500">ยังไม่มีข้อมูลหมู่บ้าน</td></tr>}
            </tbody>
          </table>
          <div className="border-t bg-slate-50 p-2 text-xs text-slate-500">คลิกแถวเพื่อดูเฉพาะหมู่นั้น (ตัวเลขด้านบนและรายการด้านล่างจะกรองตามหมู่) · “ทำแล้ว” = ทำใน JHCIS ปีงบนี้ หรือบันทึกในแอปปีงบนี้ (จับคู่เลขบัตร/ชื่อ นับคนละครั้ง) · ปกติ/เสี่ยง/สงสัย นับจากผลที่บันทึกในแอปปีงบนี้ · กด “รายชื่อ” เพื่อดูว่าใครทำแล้ว/ยังไม่ทำ{target?.asOf ? ` · รายชื่อเป้าหมาย ณ ${target.asOf}` : ' · ยังไม่ได้ซิงก์รายชื่อเป้าหมาย'}</div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input aria-label="ค้นหาชื่อหรือเลขบัตร" className="input pl-9" placeholder="ค้นหาชื่อ/เลขบัตร" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select aria-label="กรองผลสรุป" className="input w-auto" value={fOv} onChange={(e) => setFOv(e.target.value)}><option value="">ทุกผล</option>{Object.entries(OVL).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
        <select aria-label="กรองหมู่บ้าน" className="input w-auto" value={fVil} onChange={(e) => setFVil(e.target.value)}><option value="">ทุกหมู่บ้าน</option>{(villages || []).map((v) => <option key={v.no} value={v.no}>ม.{v.no}</option>)}</select>
        <select aria-label="กรองกลุ่มอายุ" className="input w-auto" value={fAge} onChange={(e) => setFAge(e.target.value)}><option value="">ทุกกลุ่มอายุ</option><option value="15-34">15–34 ปี</option><option value="35-59">35–59 ปี</option><option value="60+">60 ปีขึ้นไป</option></select>
      </div>
      {!list.length ? <EmptyState title="ยังไม่มีรายการคัดกรอง" hint="กด “คัดกรองรายใหม่” เพื่อเริ่มบันทึก" /> : (
        <div className="space-y-2">
          {list.map((r) => (
            <div key={r.id} className="card flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><b>{r.name}</b><Badge className={OV[r.overall]}>{OVL[r.overall]}</Badge>{r.authen?.status === 'requested' && <Badge className="bg-sky-100 text-sky-800">รอเปิดสิทธิ์ Authen</Badge>}{r.authen?.status === 'opened' && <Badge className="bg-emerald-100 text-emerald-800">เปิดสิทธิ์แล้ว</Badge>}{r.source === 'asm' && <Badge className={r.review === 'approved' ? 'bg-sky-100 text-sky-800' : 'bg-violet-100 text-violet-800'}>อสม. {r.asmName || ''}{r.review === 'approved' ? ' · ตรวจแล้ว' : ' · รอตรวจสอบ'}</Badge>}{r.jhcis === 'queued' ? <Badge className="bg-sky-100 text-sky-800">อยู่ในคิวส่ง JHCIS</Badge> : r.jhcis !== 'done' && <Badge className="bg-slate-100 text-slate-600">รอส่ง JHCIS</Badge>}{feeStatus(r).eligible && <Badge className="bg-emerald-100 text-emerald-800">พร้อมคิด 12001</Badge>}</div>
                <div className="text-xs text-slate-600">{r.sex === 'M' ? 'ชาย' : 'หญิง'} {r.age} ปี · ม.{r.villageNo || '-'} · {fmtDate(r.screenDate)} · ความดัน {r.bpSys}/{r.bpDia}{r.glucose ? ` · น้ำตาล ${r.glucose} (${r.fasting ? 'อด' : 'ไม่อด'})` : ''}{r.bmi ? ` · BMI ${r.bmi}` : ''}</div>
                {!!r.risks?.length && <div className="text-xs text-slate-500">ปัจจัยเสี่ยง: {r.risks.join(', ')}</div>}
              </div>
              {r.source === 'asm' && r.review !== 'approved' && <button className="btn-outline !py-2 text-xs" onClick={() => updateDoc(doc(db, 'ncdScreenings', r.id), { review: 'approved' })}><BadgeCheck className="h-4 w-4" /> ตรวจแล้ว</button>}
              <button className="btn-outline !p-2" aria-label="แก้ไข" onClick={() => setForm(r)}><Pencil className="h-4 w-4" /></button>
              <button className="btn-outline !p-2 text-red-600" aria-label="ลบ" onClick={() => setDel(r)}><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
      {form && <ScreenWizard init={form.id ? form : null} villages={villages} existing={rows} onClose={() => setForm(null)} onSaved={() => setForm(null)} />}
      {exportOpen && <ExportModal rows={rows} filtered={list} villages={villages} target={target} onClose={() => setExportOpen(false)} />}
      {jhcisOpen && <JhcisModal rows={rows} onClose={() => setJhcisOpen(false)} />}
      {rosterNo && <VillageRoster no={rosterNo} name={(villages || []).find((v) => v.no === rosterNo)?.name} st={st} rows={rows} onClose={() => setRosterNo('')} onRefresh={() => setStTick((n) => n + 1)} />}
      {authenOpen && <AuthenQueue rows={rows} onClose={() => setAuthenOpen(false)} />}
      {linkOpen && <AsmLinkModal villages={villages} onClose={() => setLinkOpen(false)} />}
      {del && <ConfirmDialog message={`ลบผลคัดกรองของ ${del.name}?`} onConfirm={remove} onCancel={() => setDel(null)} />}
    </div>
  );
}
