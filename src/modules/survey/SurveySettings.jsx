// ตั้งค่าแบบประเมิน (หลังบ้าน): รายชื่อหมู่บ้าน ประเภทบริการ และเปิด/ปิดรับแบบประเมิน — เก็บที่ satisfactionConfig/main (ประชาชนอ่านได้เพื่อแสดงตัวเลือก)
import { useEffect, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { Loader2, Save } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useVillages } from '../outbreak/outbreakRefs';
import { DEFAULT_SERVICES } from './surveyLib';

const lines = (t) => [...new Set(String(t || '').split('\n').map((x) => x.trim()).filter(Boolean))];
export default function SurveySettings({ say }) {
  const { profile } = useAuth(); const jh = useVillages();
  const [loaded, setLoaded] = useState(false); const [villages, setVillages] = useState(''); const [services, setServices] = useState(DEFAULT_SERVICES.join('\n')); const [open, setOpen] = useState(true); const [busy, setBusy] = useState(false);
  useEffect(() => onSnapshot(doc(db, 'satisfactionConfig', 'main'), (s) => { if (!loaded) { const d = s.exists() ? s.data() : {}; setVillages((d.villages || []).join('\n')); setServices((d.services?.length ? d.services : DEFAULT_SERVICES).join('\n')); setOpen(d.open !== false); } setLoaded(true); }, () => setLoaded(true)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const fromJh = () => { if (!jh?.length) return say('ยังไม่มีรายชื่อหมู่บ้านจาก JHCIS ในระบบ'); setVillages(jh.map((v) => `หมู่ ${v.no}${v.name ? ' ' + v.name : ''}`).join('\n')); };
  const save = async () => {
    setBusy(true);
    try { await setDoc(doc(db, 'satisfactionConfig', 'main'), { villages: lines(villages), services: lines(services), open, updatedAt: serverTimestamp(), updatedBy: profile?.name || '' }); say('บันทึกการตั้งค่าแล้ว'); }
    catch (e) { say('บันทึกไม่สำเร็จ: ' + (e.code || e.message)); } finally { setBusy(false); }
  };
  if (!loaded) return <p className="p-4 text-slate-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />กำลังโหลด…</p>;
  return (
    <section className="card space-y-4 p-4">
      <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} /> เปิดรับแบบประเมิน (ปิดชั่วคราวได้โดยไม่ต้องเปลี่ยน QR Code)</label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block"><span className="mb-1 block text-sm text-slate-600">รายชื่อหมู่บ้านในตำบล (บรรทัดละ 1 หมู่บ้าน) — ตัวเลือก “{'นอกเขตตำบล/ไม่ระบุ'}” ระบบเพิ่มให้เองท้ายรายการ</span>
          <textarea className="input min-h-[220px]" value={villages} onChange={(e) => setVillages(e.target.value)} placeholder={'หมู่ 1 บ้านหนองสนม\nหมู่ 2 …'} />
          <button type="button" className="mt-1 text-sm text-brand-700 underline" onClick={fromJh}>ดึงรายชื่อหมู่บ้านจากข้อมูล JHCIS ในระบบ ({jh ? jh.length : 0} หมู่บ้าน)</button></label>
        <label className="block"><span className="mb-1 block text-sm text-slate-600">ประเภทบริการ (บรรทัดละ 1 รายการ)</span>
          <textarea className="input min-h-[220px]" value={services} onChange={(e) => setServices(e.target.value)} />
          <button type="button" className="mt-1 text-sm text-slate-500 underline" onClick={() => setServices(DEFAULT_SERVICES.join('\n'))}>คืนค่าเริ่มต้น 5 ประเภท</button></label>
      </div>
      <p className="text-xs text-slate-500">การเปลี่ยนชื่อหมู่บ้าน/ประเภทบริการ มีผลกับแบบประเมินที่ตอบหลังจากนี้ — คำตอบเดิมยังคงใช้ชื่อเดิมในรายงาน</p>
      <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} บันทึกการตั้งค่า</button>
    </section>);
}
