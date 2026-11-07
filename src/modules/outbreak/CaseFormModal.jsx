// ฟอร์มเปิด/แก้ไขเคสสอบสวนโรค
import { useState } from 'react';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { Loader2, Paperclip } from 'lucide-react';
import { db, storage } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { writeAudit } from '../../lib/audit';
import { todayStr } from '../../lib/thai';
import ThaiDateInput from '../../components/ThaiDateInput';
import { Modal } from '../../components/ui';
import { TEMPLATES } from './diseaseTemplates';
import { DISEASES, FILE_SOURCES, LEVELS, STATUS, validThaiId } from './outbreakLib';
import { useOfficers, useVillages } from './outbreakRefs';

const safeName = (n) => n.replace(/[^\w.\-฀-๿]/g, '_');
const OK_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png', 'webp'];

export default function CaseFormModal({ initial, onClose, onSaved }) {
  const { profile } = useAuth();
  const base = initial || { title: '', disease: DISEASES[0], diseaseOther: '', reportDate: todayStr(), place: '', villageNo: '', responsible: profile?.name || '', status: 'investigating', popAtRisk: '', detail: '', caseDef: '' };
  const villages = useVillages(); const officers = useOfficers();
  const [f, setF] = useState({ ...base });
  const [p, setP] = useState({ firstName: '', lastName: '', idCard: '', age: '', sex: '', houseNo: '', onsetDate: '', admitDate: '', hospital: '', dischargeDate: '', symptoms: '' });
  const [files, setFiles] = useState([]); const [level, setLevel] = useState('E1'); const [source, setSource] = useState(FILE_SOURCES[0]);
  const sp = (k) => (e) => setP((x) => ({ ...x, [k]: e.target.value }));
  const dp = (k) => (v) => setP((x) => ({ ...x, [k]: v }));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    if (!f.title.trim()) return setErr('กรุณาใส่ชื่อเหตุการณ์');
    if (!f.reportDate) return setErr('กรุณาเลือกวันที่รับแจ้ง');
    const pid = String(p.idCard || '').replace(/\D/g, '');
    if (!initial && pid && !validThaiId(pid)) return setErr('เลขบัตรประชาชนของผู้ป่วยไม่ถูกต้อง (13 หลัก) หรือเว้นว่างไว้');
    for (const fl of files) { const ext = fl.name.split('.').pop().toLowerCase(); if (!OK_EXT.includes(ext)) return setErr(`ไม่รองรับไฟล์ .${ext}`); if (fl.size > 20 * 1024 * 1024) return setErr(`${fl.name} ใหญ่เกิน 20 MB`); }
    setBusy(true); setErr('');
    try {
      const data = { title: f.title.trim(), disease: f.disease, diseaseOther: f.disease.startsWith('อื่นๆ') ? f.diseaseOther.trim() : '', reportDate: f.reportDate, place: f.place.trim(), villageNo: String(f.villageNo || '').trim(), villageName: (villages || []).find((v) => v.no === String(f.villageNo))?.name || '', responsible: f.responsible.trim(), status: f.status, popAtRisk: f.popAtRisk === '' ? '' : Number(f.popAtRisk), detail: f.detail.trim(), caseDef: String(f.caseDef || '').trim(), updatedAt: serverTimestamp() };
      if (initial?.id) { await updateDoc(doc(db, 'outbreakCases', initial.id), data); await writeAudit({ action: 'update', module: 'outbreak', docId: initial.id, label: data.title }); onSaved?.(initial.id); }
      else {
        const r = await addDoc(collection(db, 'outbreakCases'), { ...data, timeline: [], labs: [], measures: [], files: [], createdAt: serverTimestamp(), createdBy: profile?.email || '' });
        await writeAudit({ action: 'create', module: 'outbreak', docId: r.id, label: data.title });
        let warn = '';
        if (p.firstName.trim()) {
          const fn = p.firstName.trim(); const ln = p.lastName.trim();
          await addDoc(collection(db, 'outbreakPeople'), { caseId: r.id, kind: 'patient', firstName: fn, lastName: ln, name: `${fn} ${ln}`.trim(), idCard: pid, age: p.age === '' ? '' : Number(p.age), sex: p.sex || '', houseNo: p.houseNo.trim(), villageNo: data.villageNo, villageName: data.villageName, address: '', reportDate: f.reportDate, onsetDate: p.onsetDate || '', admitDate: p.admitDate || '', hospital: p.hospital.trim(), dischargeDate: p.dischargeDate || '', symptoms: p.symptoms.trim(), investigator: data.responsible, status: 'ป่วย (รักษาอยู่)', relation: '', lastContact: '', lat: '', lng: '', note: '', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        }
        if (files.length) {
          try {
            const added = [];
            for (const fl of files) { const path = `outbreak/${r.id}/${Date.now()}_${safeName(fl.name)}`; await uploadBytes(ref(storage, path), fl, { contentType: fl.type || undefined }); added.push({ id: `${Date.now()}${added.length}`, level, source, date: f.reportDate, note: '', name: fl.name, path, size: fl.size, by: profile?.email || '' }); }
            await updateDoc(doc(db, 'outbreakCases', r.id), { files: added });
          } catch (e) { warn = 'สร้างเคสแล้ว แต่แนบไฟล์ไม่สำเร็จ (ตรวจสอบว่าวาง Storage Rules แล้ว): ' + (e.code || e.message); }
        }
        if (warn) { window.alert(warn); }
        onSaved?.(r.id);
      }
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
        <label><span className="mb-1 block text-sm text-slate-600">หมู่บ้าน (ในเขตรับผิดชอบ)</span>
          {villages && villages.length ? <select className="input" value={f.villageNo} onChange={set('villageNo')}><option value="">— เลือกหมู่บ้าน —</option>{villages.map((v) => <option key={v.no} value={v.no}>หมู่ {v.no} {v.name}</option>)}<option value="0">นอกเขตรับผิดชอบ</option></select>
            : <input className="input" value={f.villageNo} onChange={set('villageNo')} placeholder="หมู่ที่ (ยังไม่มีรายชื่อหมู่บ้านจาก JHCIS)" />}</label>
        <label><span className="mb-1 block text-sm text-slate-600">เจ้าหน้าที่ผู้สอบสวนโรค (ข้าราชการในทะเบียนบุคลากร)</span>
          <select className="input" value={f.responsible} onChange={set('responsible')}><option value="">— เลือกเจ้าหน้าที่ —</option>{(officers || []).map((o) => <option key={o.email || o.name} value={o.name}>{o.name}{o.position ? ` (${o.position})` : ''}</option>)}{f.responsible && !(officers || []).some((o) => o.name === f.responsible) && <option value={f.responsible}>{f.responsible}</option>}</select></label>
        <label><span className="mb-1 block text-sm text-slate-600">ประชากรเสี่ยง (คน) — ใช้คำนวณ Attack rate</span><input className="input" type="number" min="0" value={f.popAtRisk} onChange={set('popAtRisk')} /></label>
        {TEMPLATES[f.disease] && (
          <div className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900 ring-1 ring-sky-200 sm:col-span-2">
            <b>เกณฑ์ลงสอบสวนตามแนวทางกรมควบคุมโรค:</b> {TEMPLATES[f.disease].criteria}{TEMPLATES[f.disease].hours ? ` · ภายใน ${TEMPLATES[f.disease].hours} ชั่วโมง` : ''}
          </div>)}
        <label className="sm:col-span-2"><span className="mb-1 block text-sm text-slate-600">นิยามผู้ป่วยของเหตุการณ์นี้ (บุคคล เวลา สถานที่ — ไม่ใส่ปัจจัยสัมผัสในนิยาม)</span>
          <textarea className="input min-h-[72px]" value={f.caseDef || ''} onChange={set('caseDef')} placeholder="กำหนดเองให้เหมาะกับเหตุการณ์" />
          {TEMPLATES[f.disease]?.definition && !f.caseDef && <button type="button" className="mt-1 text-xs text-brand-700 underline" onClick={() => setF((x) => ({ ...x, caseDef: TEMPLATES[x.disease].definition }))}>ใช้นิยามตัวอย่างของโรคนี้เป็นร่างตั้งต้น</button>}</label>
        <label className="sm:col-span-2"><span className="mb-1 block text-sm text-slate-600">รายละเอียดการสอบสวน / ความเป็นมา</span><textarea className="input min-h-[96px]" value={f.detail} onChange={set('detail')} /></label>
      </div>

      {!initial && (
        <fieldset className="mt-4 space-y-3 rounded-xl border border-rose-200 bg-rose-50/40 p-3">
          <legend className="px-2 text-sm font-bold text-rose-800">ผู้ป่วยรายแรก (ไม่บังคับ — เพิ่มรายอื่นได้ในหน้าเคส)</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label><span className="mb-1 block text-sm text-slate-600">ชื่อผู้ป่วย</span><input className="input" value={p.firstName} onChange={sp('firstName')} /></label>
            <label><span className="mb-1 block text-sm text-slate-600">สกุล</span><input className="input" value={p.lastName} onChange={sp('lastName')} /></label>
            <label><span className="mb-1 block text-sm text-slate-600">เลขบัตรประจำตัวประชาชน 13 หลัก</span><input className="input" inputMode="numeric" maxLength={17} autoComplete="off" value={p.idCard} onChange={sp('idCard')} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label><span className="mb-1 block text-sm text-slate-600">อายุ (ปี)</span><input className="input" type="number" min="0" value={p.age} onChange={sp('age')} /></label>
              <label><span className="mb-1 block text-sm text-slate-600">เพศ</span><select className="input" value={p.sex} onChange={sp('sex')}><option value="">ไม่ระบุ</option><option value="1">ชาย</option><option value="2">หญิง</option></select></label>
            </div>
            <label><span className="mb-1 block text-sm text-slate-600">บ้านเลขที่</span><input className="input" value={p.houseNo} onChange={sp('houseNo')} /></label>
            <label><span className="mb-1 block text-sm text-slate-600">วันเริ่มป่วย</span><ThaiDateInput value={p.onsetDate} onChange={dp('onsetDate')} yearsBack={3} yearsForward={0} /></label>
            <label><span className="mb-1 block text-sm text-slate-600">วันที่เข้ารับการรักษา</span><ThaiDateInput value={p.admitDate} onChange={dp('admitDate')} yearsBack={3} yearsForward={0} /></label>
            <label><span className="mb-1 block text-sm text-slate-600">สถานพยาบาลที่รักษา</span><input className="input" value={p.hospital} onChange={sp('hospital')} placeholder="เช่น โรงพยาบาลสกลนคร" /></label>
            <label><span className="mb-1 block text-sm text-slate-600">วันที่ออกจากโรงพยาบาล</span><ThaiDateInput value={p.dischargeDate} onChange={dp('dischargeDate')} yearsBack={3} yearsForward={0} /></label>
            <label className="sm:col-span-2"><span className="mb-1 block text-sm text-slate-600">อาการ</span><textarea className="input min-h-[64px]" value={p.symptoms} onChange={sp('symptoms')} /></label>
          </div>
          <p className="text-xs text-slate-500">วันรับแจ้ง หมู่บ้าน และเจ้าหน้าที่ผู้สอบสวน ใช้ค่าจากด้านบนของเหตุการณ์นี้</p>
        </fieldset>)}
      {!initial && (
        <fieldset className="mt-4 space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
          <legend className="px-2 text-sm font-bold text-emerald-800">แนบไฟล์การสอบสวนโรค (หากสอบสวนมาจากโรงพยาบาลหรือที่อื่น)</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label><span className="mb-1 block text-sm text-slate-600">ระดับรายงาน (ทะเบียน E0/E1/E2)</span><select className="input" value={level} onChange={(e) => setLevel(e.target.value)}>{Object.entries(LEVELS).map(([k, v]) => <option key={k} value={k}>{v.t}</option>)}</select></label>
            <label><span className="mb-1 block text-sm text-slate-600">มาจาก</span><input className="input" list="ob-src2" value={source} onChange={(e) => setSource(e.target.value)} /><datalist id="ob-src2">{FILE_SOURCES.map((x) => <option key={x} value={x} />)}</datalist></label>
          </div>
          <label className="btn btn-outline cursor-pointer"><Paperclip className="h-4 w-4" /> เลือกไฟล์ (PDF/Word/Excel/รูป ไม่เกิน 20 MB)<input type="file" multiple className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp" onChange={(e) => { setFiles([...files, ...e.target.files]); e.target.value = ''; }} /></label>
          {files.length > 0 && <ul className="text-sm text-slate-700">{files.map((fl, i) => <li key={i} className="flex items-center justify-between gap-2"><span className="truncate">{fl.name}</span><button type="button" className="text-red-600" onClick={() => setFiles(files.filter((_, j) => j !== i))}>เอาออก</button></li>)}</ul>}
        </fieldset>)}
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
    </Modal>
  );
}
