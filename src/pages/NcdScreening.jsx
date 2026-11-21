// ระบบคัดกรองกลุ่มเสี่ยง NCD (เบาหวาน/ความดันโลหิตสูง) — เฟส 1: บันทึกผลคัดกรองบนมือถือ + แปลผลอัตโนมัติ + สรุป/ส่งออก
// ยังไม่เขียนกลับ JHCIS (เฟส 2 หลังตรวจ schema และอนุมัติ) — ทุกรายการมีสถานะ jhcis = 'pending'
import { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import QRCode from 'qrcode';
import { BadgeCheck, Copy, DatabaseZap, KeyRound, Download, FileSpreadsheet, HeartPulse, LayoutList, MapPinned, Pencil, Plus, QrCode, Search, Trash2 } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { normalizeRole } from '../lib/roles';
import { getNcdPublic, ncdPublicUrl, ncdVillageUrl, newToken, saveNcdPublic, villageKey } from '../lib/ncdPublic';
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

const OV = { normal: 'bg-emerald-100 text-emerald-800', risk: 'bg-yellow-100 text-yellow-800', suspect: 'bg-red-100 text-red-800' };

export default function NcdScreening() {
  const villages = useVillages(); const { profile } = useAuth(); const isSuper = normalizeRole(profile?.role) === 'super_admin'; const [linkOpen, setLinkOpen] = useState(false);
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState(''); const [fOv, setFOv] = useState(''); const [fVil, setFVil] = useState(''); const [fAge, setFAge] = useState('');
  const [form, setForm] = useState(null); const [del, setDel] = useState(null);
  const [authenOpen, setAuthenOpen] = useState(false); const [view, setView] = useState('all'); const [exportOpen, setExportOpen] = useState(false); const [jhcisOpen, setJhcisOpen] = useState(false); const [target, setTarget] = useState(null);
  useEffect(() => onSnapshot(doc(db, 'settings', 'ncdTargetSummary'), (d) => setTarget(d.exists() ? d.data() : null), () => setTarget(null)), []);
  useEffect(() => onSnapshot(collection(db, 'ncdScreenings'), (s) => setRows(s.docs.map((d) => deriveRow({ id: d.id, ...d.data() }))), () => setRows([])), []);
  const list = useMemo(() => (rows || []).filter((r) => (!q || `${r.name} ${r.cid}`.includes(q.trim())) && (!fOv || r.overall === fOv) && (!fVil || r.villageNo === fVil) && (!fAge || r.ageGroup === fAge)).sort((a, b) => String(b.screenDate).localeCompare(String(a.screenDate)) || String(a.name).localeCompare(String(b.name), 'th')), [rows, q, fOv, fVil, fAge]);
  const scoped = useMemo(() => (rows || []).filter((r) => !fVil || r.villageNo === fVil), [rows, fVil]);
  const sum = useMemo(() => { const c = { total: scoped.length, normal: 0, risk: 0, suspect: 0 }; scoped.forEach((r) => { if (c[r.overall] != null) c[r.overall] += 1; }); return c; }, [scoped]);
  const fy = fyStartOf();
  const byVillage = useMemo(() => {
    const nos = [...new Set([...(villages || []).map((v) => v.no), ...(rows || []).map((r) => String(r.villageNo || ''))])].filter(Boolean).sort((a, b) => Number(a) - Number(b));
    return nos.map((no) => { const l = (rows || []).filter((r) => String(r.villageNo) === no); const t = target?.byMoo?.[no]; const f = l.filter((r) => String(r.screenDate) >= fy).length; const total = t?.total ?? null; const done = (t?.done || 0) + f;
      return { no, name: (villages || []).find((v) => v.no === no)?.name || '', total, jh: t?.done ?? null, app: f, pct: total ? Math.min(100, Math.round((done / total) * 1000) / 10) : null, normal: l.filter((r) => r.overall === 'normal').length, risk: l.filter((r) => r.overall === 'risk').length, suspect: l.filter((r) => r.overall === 'suspect').length, pending: l.filter((r) => r.source === 'asm' && r.review !== 'approved').length }; });
  }, [rows, villages, target, fy]);
  const authenWait = useMemo(() => (rows || []).filter((r) => r.authen?.status === 'requested').length, [rows]);
  if (!rows) return <Spinner />;
  const remove = async () => { await deleteDoc(doc(db, 'ncdScreenings', del.id)); await writeAudit({ action: 'delete', module: 'ncd-screening', docId: del.id, label: del.name }); setDel(null); };
  return (
    <div className="space-y-4">
      <PageHeader icon={HeartPulse} emoji="🩺" title="ระบบคัดกรองกลุ่มเสี่ยง NCD" subtitle="คัดกรองเบาหวาน/ความดันโลหิตสูง แยกเกณฑ์ตามช่วงอายุ 15–34 และ 35–59 ปี · แปลผลอัตโนมัติ" actions={<div className="flex flex-wrap items-center gap-2">
        {isSuper && <button type="button" onClick={() => setLinkOpen(true)} className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-white/95 px-4 py-2.5 text-sm font-bold text-rose-700 shadow-md ring-1 ring-white/60 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-lg"><QrCode className="h-5 w-5" /> ลิงก์ / QR อสม.</button>}
        <button type="button" onClick={() => setExportOpen(true)} disabled={!rows.length} className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 px-4 py-2.5 text-sm font-bold text-white shadow-md ring-1 ring-white/40 transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50"><FileSpreadsheet className="h-5 w-5" /> รายงาน Excel</button>
        <button type="button" onClick={() => setJhcisOpen(true)} className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 px-4 py-2.5 text-sm font-bold text-white shadow-md ring-1 ring-white/40 transition hover:-translate-y-0.5 hover:shadow-lg"><DatabaseZap className="h-5 w-5" /> นำเข้า JHCIS</button>
        <button type="button" onClick={() => setAuthenOpen(true)} className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-md ring-1 ring-white/40 transition hover:-translate-y-0.5 hover:shadow-lg"><KeyRound className="h-5 w-5" /> คิวเปิดสิทธิ์ Authen{authenWait ? ` (${authenWait})` : ''}</button>
        <button type="button" onClick={() => setForm({})} className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 px-4 py-2.5 text-sm font-bold text-white shadow-md ring-1 ring-white/40 transition hover:-translate-y-0.5 hover:shadow-lg"><Plus className="h-5 w-5" /> คัดกรองรายใหม่</button>
      </div>} />
      <div role="tablist" aria-label="มุมมองรายงาน" className="inline-flex rounded-2xl bg-slate-100 p-1 shadow-inner">
        {[['all', 'ภาพรวมทั้งหมด', LayoutList], ['village', 'แยกรายหมู่บ้าน', MapPinned]].map(([k, t, Ic]) => <button key={k} role="tab" aria-selected={view === k} type="button" onClick={() => setView(k)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${view === k ? 'bg-white text-rose-700 shadow' : 'text-slate-500 hover:text-slate-700'}`}><Ic className="h-4 w-4" /> {t}</button>)}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[['คัดกรองแล้ว (ราย)', sum.total, 'from-sky-600 to-cyan-500'], ['ปกติ', sum.normal, 'from-emerald-600 to-teal-500'], ['กลุ่มเสี่ยง', sum.risk, 'from-amber-500 to-yellow-500'], ['สงสัย/ส่งต่อ', sum.suspect, 'from-rose-600 to-red-500']].map(([l, v, t]) => <div key={l} className={`rounded-2xl bg-gradient-to-br ${t} p-4 text-white shadow`}><div className="text-sm opacity-90">{l}</div><div className="text-3xl font-extrabold tabular-nums">{v}</div></div>)}
      </div>
      <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-200">บันทึกและแปลผลในระบบนี้ · ปุ่ม “นำเข้า JHCIS” จัดคิว/ออกใบรหัสสำหรับคีย์ (ยังไม่เขียนลงฐาน JHCIS อัตโนมัติ) (เกณฑ์เป็นแนวทางเบื้องต้น กรุณาเทียบกับแนวทาง/KPI ฉบับล่าสุดก่อนใช้จริง)</div>
      {view === 'village' && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="p-3">หมู่บ้าน</th><th className="p-3 text-right">เป้าหมาย 15–59 ปี</th><th className="p-3 text-right">คัดกรองแล้ว</th><th className="p-3">ความครอบคลุม</th><th className="p-3 text-right">ปกติ</th><th className="p-3 text-right">เสี่ยง</th><th className="p-3 text-right">สงสัย</th><th className="p-3 text-right">รอตรวจสอบ</th></tr></thead>
            <tbody>
              {byVillage.map((v) => (
                <tr key={v.no} onClick={() => setFVil(fVil === v.no ? '' : v.no)} className={`cursor-pointer border-t transition hover:bg-rose-50 ${fVil === v.no ? 'bg-rose-50' : ''}`}>
                  <td className="p-3 font-semibold">ม.{v.no} {v.name}</td>
                  <td className="p-3 text-right tabular-nums">{v.total ?? '–'}</td>
                  <td className="p-3 text-right tabular-nums">{v.total != null ? `${(v.jh || 0) + v.app}` : v.app}</td>
                  <td className="p-3"><div className="flex items-center gap-2"><div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-400" style={{ width: `${v.pct || 0}%` }} /></div><span className="w-12 text-xs tabular-nums text-slate-600">{v.pct != null ? `${v.pct}%` : '–'}</span></div></td>
                  <td className="p-3 text-right tabular-nums text-emerald-700">{v.normal}</td><td className="p-3 text-right tabular-nums text-amber-700">{v.risk}</td><td className="p-3 text-right tabular-nums text-red-700">{v.suspect}</td><td className="p-3 text-right tabular-nums text-violet-700">{v.pending || ''}</td>
                </tr>
              ))}
              {!byVillage.length && <tr><td colSpan={8} className="p-4 text-center text-slate-500">ยังไม่มีข้อมูลหมู่บ้าน</td></tr>}
            </tbody>
          </table>
          <div className="border-t bg-slate-50 p-2 text-xs text-slate-500">คลิกแถวเพื่อดูเฉพาะหมู่นั้น (ตัวเลขด้านบนและรายการด้านล่างจะกรองตามหมู่) · “คัดกรองแล้ว” = ทำแล้วใน JHCIS ปีงบนี้ + บันทึกในแอป (โดยประมาณ){target?.asOf ? ` · รายชื่อเป้าหมาย ณ ${target.asOf}` : ' · ยังไม่ได้ซิงก์รายชื่อเป้าหมาย'}</div>
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
      {authenOpen && <AuthenQueue rows={rows} onClose={() => setAuthenOpen(false)} />}
      {linkOpen && <AsmLinkModal villages={villages} onClose={() => setLinkOpen(false)} />}
      {del && <ConfirmDialog message={`ลบผลคัดกรองของ ${del.name}?`} onConfirm={remove} onCancel={() => setDel(null)} />}
    </div>
  );
}
