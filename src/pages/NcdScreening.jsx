// ระบบคัดกรองกลุ่มเสี่ยง NCD (เบาหวาน/ความดันโลหิตสูง) — เฟส 1: บันทึกผลคัดกรองบนมือถือ + แปลผลอัตโนมัติ + สรุป/ส่งออก
// ยังไม่เขียนกลับ JHCIS (เฟส 2 หลังตรวจ schema และอนุมัติ) — ทุกรายการมีสถานะ jhcis = 'pending'
import { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import QRCode from 'qrcode';
import { BadgeCheck, Copy, Download, HeartPulse, Link2, Pencil, Plus, Search, Trash2, FileSpreadsheet } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { normalizeRole } from '../lib/roles';
import { getNcdPublic, ncdPublicUrl, newToken, saveNcdPublic } from '../lib/ncdPublic';
import { writeAudit } from '../lib/audit';
import { fmtDate, todayStr } from '../lib/thai';
import { PageHeader } from '../components/Logo';
import ScreenWizard from './ncd/ScreenWizard';
import { deriveRow } from '../lib/ncdScreen';
import { Badge, ConfirmDialog, EmptyState, Modal, Spinner } from '../components/ui';
import { useVillages } from '../modules/outbreak/outbreakRefs';


// ลิงก์/QR สำหรับ อสม. (Super Admin เท่านั้น): เปิด-ปิด สร้างรหัสใหม่ คัดลอกลิงก์ ดาวน์โหลด QR
function AsmLinkModal({ onClose }) {
  const [cfg, setCfg] = useState(null); const [qr, setQr] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const [sure, setSure] = useState(false);
  useEffect(() => { getNcdPublic().then(setCfg).catch(() => setCfg({ enabled: false, token: '' })); }, []);
  const url = cfg?.token ? ncdPublicUrl(cfg.token) : '';
  useEffect(() => { if (url) QRCode.toDataURL(url, { width: 720, margin: 1, errorCorrectionLevel: 'M' }).then(setQr); else setQr(''); }, [url]);
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
const OVL = { normal: 'ปกติ', risk: 'กลุ่มเสี่ยง', suspect: 'สงสัย/ส่งต่อ' };

export default function NcdScreening() {
  const villages = useVillages(); const { profile } = useAuth(); const isSuper = normalizeRole(profile?.role) === 'super_admin'; const [linkOpen, setLinkOpen] = useState(false);
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState(''); const [fOv, setFOv] = useState(''); const [fVil, setFVil] = useState(''); const [fAge, setFAge] = useState('');
  const [form, setForm] = useState(null); const [del, setDel] = useState(null);
  useEffect(() => onSnapshot(collection(db, 'ncdScreenings'), (s) => setRows(s.docs.map((d) => deriveRow({ id: d.id, ...d.data() }))), () => setRows([])), []);
  const list = useMemo(() => (rows || []).filter((r) => (!q || `${r.name} ${r.cid}`.includes(q.trim())) && (!fOv || r.overall === fOv) && (!fVil || r.villageNo === fVil) && (!fAge || r.ageGroup === fAge)).sort((a, b) => String(b.screenDate).localeCompare(String(a.screenDate)) || String(a.name).localeCompare(String(b.name), 'th')), [rows, q, fOv, fVil, fAge]);
  const sum = useMemo(() => { const c = { total: (rows || []).length, normal: 0, risk: 0, suspect: 0 }; (rows || []).forEach((r) => { if (c[r.overall] != null) c[r.overall] += 1; }); return c; }, [rows]);
  if (!rows) return <Spinner />;
  const remove = async () => { await deleteDoc(doc(db, 'ncdScreenings', del.id)); await writeAudit({ action: 'delete', module: 'ncd-screening', docId: del.id, label: del.name }); setDel(null); };
  const exportXlsx = async () => {
    const XLSX = await import('xlsx');
    const data = list.map((r) => ({ วันที่คัดกรอง: r.screenDate, ชื่อสกุล: r.name, เลขบัตร: r.cid, เพศ: r.sex === 'M' ? 'ชาย' : 'หญิง', อายุ: r.age, กลุ่มอายุ: r.ageGroup, หมู่: r.villageNo, 'BMI': r.bmi ?? '', รอบเอว: r.waist, ความดันเฉลี่ย: `${r.bpSys}/${r.bpDia}`, น้ำตาล: r.glucose, อดอาหาร: r.fasting ? 'ใช่' : 'ไม่', สรุปผล: OVL[r.overall] || '', ปัจจัยเสี่ยง: (r.risks || []).join(', '), สถานะJHCIS: r.jhcis === 'done' ? 'ส่งแล้ว' : 'รอส่ง' }));
    const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'คัดกรอง NCD'); XLSX.writeFile(wb, `ncd-screening-${todayStr()}.xlsx`);
  };
  return (
    <div className="space-y-4">
      <PageHeader icon={HeartPulse} emoji="🩺" title="ระบบคัดกรองกลุ่มเสี่ยง NCD" subtitle="คัดกรองเบาหวาน/ความดันโลหิตสูง แยกเกณฑ์ตามช่วงอายุ 15–34 และ 35–59 ปี · แปลผลอัตโนมัติ" actions={<>{isSuper && <button className="btn-outline" onClick={() => setLinkOpen(true)}><Link2 className="h-4 w-4" /> ลิงก์/QR อสม.</button>}<button className="btn-outline" onClick={exportXlsx} disabled={!list.length}><FileSpreadsheet className="h-4 w-4" /> Excel</button><button className="btn btn-primary" onClick={() => setForm({})}><Plus className="h-4 w-4" /> คัดกรองรายใหม่</button></>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[['คัดกรองแล้ว (ราย)', sum.total, 'from-sky-600 to-cyan-500'], ['ปกติ', sum.normal, 'from-emerald-600 to-teal-500'], ['กลุ่มเสี่ยง', sum.risk, 'from-amber-500 to-yellow-500'], ['สงสัย/ส่งต่อ', sum.suspect, 'from-rose-600 to-red-500']].map(([l, v, t]) => <div key={l} className={`rounded-2xl bg-gradient-to-br ${t} p-4 text-white shadow`}><div className="text-sm opacity-90">{l}</div><div className="text-3xl font-extrabold tabular-nums">{v}</div></div>)}
      </div>
      <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-200">เฟส 1: บันทึกและแปลผลในระบบนี้ · ยังไม่ส่งเข้า JHCIS อัตโนมัติ (เกณฑ์เป็นแนวทางเบื้องต้น กรุณาเทียบกับแนวทาง/KPI ฉบับล่าสุดก่อนใช้จริง)</div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input aria-label="ค้นหาชื่อหรือเลขบัตร" className="input pl-9" placeholder="ค้นหาชื่อ/เลขบัตร" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select aria-label="กรองผลสรุป" className="input w-auto" value={fOv} onChange={(e) => setFOv(e.target.value)}><option value="">ทุกผล</option>{Object.entries(OVL).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
        <select aria-label="กรองหมู่บ้าน" className="input w-auto" value={fVil} onChange={(e) => setFVil(e.target.value)}><option value="">ทุกหมู่บ้าน</option>{(villages || []).map((v) => <option key={v.no} value={v.no}>ม.{v.no}</option>)}</select>
        <select aria-label="กรองกลุ่มอายุ" className="input w-auto" value={fAge} onChange={(e) => setFAge(e.target.value)}><option value="">ทุกกลุ่มอายุ</option><option value="15-34">15–34 ปี</option><option value="35-59">35–59 ปี</option></select>
      </div>
      {!list.length ? <EmptyState title="ยังไม่มีรายการคัดกรอง" hint="กด “คัดกรองรายใหม่” เพื่อเริ่มบันทึก" /> : (
        <div className="space-y-2">
          {list.map((r) => (
            <div key={r.id} className="card flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><b>{r.name}</b><Badge className={OV[r.overall]}>{OVL[r.overall]}</Badge>{r.source === 'asm' && <Badge className={r.review === 'approved' ? 'bg-sky-100 text-sky-800' : 'bg-violet-100 text-violet-800'}>อสม. {r.asmName || ''}{r.review === 'approved' ? ' · ตรวจแล้ว' : ' · รอตรวจสอบ'}</Badge>}{r.jhcis !== 'done' && <Badge className="bg-slate-100 text-slate-600">รอส่ง JHCIS</Badge>}</div>
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
      {linkOpen && <AsmLinkModal onClose={() => setLinkOpen(false)} />}
      {del && <ConfirmDialog message={`ลบผลคัดกรองของ ${del.name}?`} onConfirm={remove} onCancel={() => setDel(null)} />}
    </div>
  );
}
