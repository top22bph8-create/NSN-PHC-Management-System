// ระบบคัดกรองกลุ่มเสี่ยง NCD (เบาหวาน/ความดันโลหิตสูง) — เฟส 1: บันทึกผลคัดกรองบนมือถือ + แปลผลอัตโนมัติ + สรุป/ส่งออก
// ยังไม่เขียนกลับ JHCIS (เฟส 2 หลังตรวจ schema และอนุมัติ) — ทุกรายการมีสถานะ jhcis = 'pending'
import { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { HeartPulse, Pencil, Plus, Search, Trash2, FileSpreadsheet } from 'lucide-react';
import { db } from '../firebase';
import { writeAudit } from '../lib/audit';
import { fmtDate, todayStr } from '../lib/thai';
import { PageHeader } from '../components/Logo';
import ScreenWizard from './ncd/ScreenWizard';
import { Badge, ConfirmDialog, EmptyState, Spinner } from '../components/ui';
import { useVillages } from '../modules/outbreak/outbreakRefs';

const OV = { normal: 'bg-emerald-100 text-emerald-800', risk: 'bg-yellow-100 text-yellow-800', suspect: 'bg-red-100 text-red-800' };
const OVL = { normal: 'ปกติ', risk: 'กลุ่มเสี่ยง', suspect: 'สงสัย/ส่งต่อ' };

export default function NcdScreening() {
  const villages = useVillages();
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState(''); const [fOv, setFOv] = useState(''); const [fVil, setFVil] = useState(''); const [fAge, setFAge] = useState('');
  const [form, setForm] = useState(null); const [del, setDel] = useState(null);
  useEffect(() => onSnapshot(collection(db, 'ncdScreenings'), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRows([])), []);
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
      <PageHeader icon={HeartPulse} emoji="🩺" title="ระบบคัดกรองกลุ่มเสี่ยง NCD" subtitle="คัดกรองเบาหวาน/ความดันโลหิตสูง แยกเกณฑ์ตามช่วงอายุ 15–34 และ 35–59 ปี · แปลผลอัตโนมัติ" actions={<><button className="btn-outline" onClick={exportXlsx} disabled={!list.length}><FileSpreadsheet className="h-4 w-4" /> Excel</button><button className="btn btn-primary" onClick={() => setForm({})}><Plus className="h-4 w-4" /> คัดกรองรายใหม่</button></>} />
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
                <div className="flex flex-wrap items-center gap-2"><b>{r.name}</b><Badge className={OV[r.overall]}>{OVL[r.overall]}</Badge>{r.jhcis !== 'done' && <Badge className="bg-slate-100 text-slate-600">รอส่ง JHCIS</Badge>}</div>
                <div className="text-xs text-slate-600">{r.sex === 'M' ? 'ชาย' : 'หญิง'} {r.age} ปี · ม.{r.villageNo || '-'} · {fmtDate(r.screenDate)} · ความดัน {r.bpSys}/{r.bpDia}{r.glucose ? ` · น้ำตาล ${r.glucose} (${r.fasting ? 'อด' : 'ไม่อด'})` : ''}{r.bmi ? ` · BMI ${r.bmi}` : ''}</div>
                {!!r.risks?.length && <div className="text-xs text-slate-500">ปัจจัยเสี่ยง: {r.risks.join(', ')}</div>}
              </div>
              <button className="btn-outline !p-2" aria-label="แก้ไข" onClick={() => setForm(r)}><Pencil className="h-4 w-4" /></button>
              <button className="btn-outline !p-2 text-red-600" aria-label="ลบ" onClick={() => setDel(r)}><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
      {form && <ScreenWizard init={form.id ? form : null} villages={villages} existing={rows} onClose={() => setForm(null)} onSaved={() => setForm(null)} />}
      {del && <ConfirmDialog message={`ลบผลคัดกรองของ ${del.name}?`} onConfirm={remove} onCancel={() => setDel(null)} />}
    </div>
  );
}
