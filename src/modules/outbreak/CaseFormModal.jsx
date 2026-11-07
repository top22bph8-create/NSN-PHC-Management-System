// ฟอร์มเปิด/แก้ไขเคสสอบสวนโรค
import { useState } from 'react';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { writeAudit } from '../../lib/audit';
import { todayStr } from '../../lib/thai';
import ThaiDateInput from '../../components/ThaiDateInput';
import { Modal } from '../../components/ui';
import { DISEASES, STATUS } from './outbreakLib';

export default function CaseFormModal({ initial, onClose, onSaved }) {
  const { profile } = useAuth();
  const base = initial || { title: '', disease: DISEASES[0], diseaseOther: '', reportDate: todayStr(), place: '', villageNo: '', responsible: profile?.name || '', status: 'investigating', popAtRisk: '', detail: '' };
  const [f, setF] = useState({ ...base });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    if (!f.title.trim()) return setErr('กรุณาใส่ชื่อเหตุการณ์');
    if (!f.reportDate) return setErr('กรุณาเลือกวันที่รับแจ้ง');
    setBusy(true); setErr('');
    try {
      const data = { title: f.title.trim(), disease: f.disease, diseaseOther: f.disease.startsWith('อื่นๆ') ? f.diseaseOther.trim() : '', reportDate: f.reportDate, place: f.place.trim(), villageNo: String(f.villageNo || '').trim(), responsible: f.responsible.trim(), status: f.status, popAtRisk: f.popAtRisk === '' ? '' : Number(f.popAtRisk), detail: f.detail.trim(), updatedAt: serverTimestamp() };
      if (initial?.id) { await updateDoc(doc(db, 'outbreakCases', initial.id), data); await writeAudit({ action: 'update', module: 'outbreak', docId: initial.id, label: data.title }); onSaved?.(initial.id); }
      else { const r = await addDoc(collection(db, 'outbreakCases'), { ...data, timeline: [], labs: [], measures: [], createdAt: serverTimestamp(), createdBy: profile?.email || '' }); await writeAudit({ action: 'create', module: 'outbreak', docId: r.id, label: data.title }); onSaved?.(r.id); }
      onClose();
    } catch (e) { setErr('บันทึกไม่สำเร็จ: ' + (e.code || e.message)); } finally { setBusy(false); }
  };
  return (
    <Modal title={initial ? 'แก้ไขข้อมูลเหตุการณ์' : 'เปิดสอบสวนโรคใหม่'} onClose={onClose} wide
      footer={<><button className="btn btn-outline" onClick={onClose} disabled={busy}>ยกเลิก</button><button className="btn btn-primary" onClick={save} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} บันทึก</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className="mb-1 block text-sm text-slate-600">ชื่อเหตุการณ์ *</span><input className="input" value={f.title} onChange={set('title')} placeholder="เช่น ไข้เลือดออก หมู่ 5 บ้านหนองสนม" /></label>
        <label><span className="mb-1 block text-sm text-slate-600">ชนิดโรค *</span><select className="input" value={f.disease} onChange={set('disease')}>{DISEASES.map((d) => <option key={d}>{d}</option>)}</select></label>
        {f.disease.startsWith('อื่นๆ') ? <label><span className="mb-1 block text-sm text-slate-600">ระบุโรค</span><input className="input" value={f.diseaseOther} onChange={set('diseaseOther')} /></label> : <div />}
        <label><span className="mb-1 block text-sm text-slate-600">วันที่รับแจ้ง *</span><ThaiDateInput value={f.reportDate} onChange={(v) => setF((x) => ({ ...x, reportDate: v }))} yearsBack={3} yearsForward={0} /></label>
        <label><span className="mb-1 block text-sm text-slate-600">สถานะการสอบสวน</span><select className="input" value={f.status} onChange={set('status')}>{Object.entries(STATUS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
        <label><span className="mb-1 block text-sm text-slate-600">พื้นที่เกิดเหตุ</span><input className="input" value={f.place} onChange={set('place')} placeholder="เช่น ชุมชน/โรงเรียน/ตลาด" /></label>
        <label><span className="mb-1 block text-sm text-slate-600">หมู่ที่</span><input className="input" value={f.villageNo} onChange={set('villageNo')} placeholder="เช่น 5" /></label>
        <label><span className="mb-1 block text-sm text-slate-600">ผู้รับผิดชอบ</span><input className="input" value={f.responsible} onChange={set('responsible')} /></label>
        <label><span className="mb-1 block text-sm text-slate-600">ประชากรเสี่ยง (คน) — ใช้คำนวณ Attack rate</span><input className="input" type="number" min="0" value={f.popAtRisk} onChange={set('popAtRisk')} /></label>
        <label className="sm:col-span-2"><span className="mb-1 block text-sm text-slate-600">รายละเอียดการสอบสวน / ความเป็นมา</span><textarea className="input min-h-[96px]" value={f.detail} onChange={set('detail')} /></label>
      </div>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
    </Modal>
  );
}
