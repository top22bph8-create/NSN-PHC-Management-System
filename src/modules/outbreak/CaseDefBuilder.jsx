// ตัวช่วยสร้างนิยามผู้ป่วย (สงสัย / เข้าข่าย / ยืนยัน) ด้วยการคลิกเลือก — องค์ประกอบ บุคคล-เวลา-สถานที่ + อาการ + ผลตรวจ
// หลักการ: นิยามต้องระบุ บุคคล เวลา สถานที่ และไม่ใส่ปัจจัยสัมผัสที่กำลังศึกษาไว้ในนิยาม
import { useState } from 'react';
import ThaiDateInput from '../../components/ThaiDateInput';
import { fmtDate } from '../../lib/thai';
import { PERSON_GROUPS, PROBABLE_OPTS, SYMPTOMS, SYM_DEFAULT, labOpts } from './reportChoices';

const lab = 'mb-1 block text-xs text-slate-600';
export default function CaseDefBuilder({ cs, dname, value, onApply }) {
  const [open, setOpen] = useState(false);
  const lo = labOpts(cs.disease);
  const [f, setF] = useState({ person: PERSON_GROUPS[0], place: [cs.place, cs.villageNo ? `หมู่ที่ ${cs.villageNo}${cs.villageName ? ' ' + cs.villageName : ''}` : ''].filter(Boolean).join(' ') || '', from: '', to: '', sym: SYM_DEFAULT[cs.disease] || [], min: 1, prob: [], conf: [] });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const tog = (k, v) => setF((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }));
  const who = `${f.person}${f.place ? ` ${f.place}` : ' ในพื้นที่ที่สอบสวน'}`;
  const when = f.from || f.to ? ` ระหว่างวันที่ ${f.from ? fmtDate(f.from) : '…'} ถึง ${f.to ? fmtDate(f.to) : 'ปัจจุบัน'}` : '';
  const clin = f.sym.length ? `มีอาการอย่างน้อย ${f.min} อาการ จากต่อไปนี้: ${f.sym.join(', ')}` : 'มีอาการเข้าได้กับโรค';
  const text = [
    `ผู้ป่วยสงสัย (Suspected): ${who}${when} ที่${clin}`,
    `ผู้ป่วยเข้าข่าย (Probable): ผู้ป่วยสงสัยที่${f.prob.length ? f.prob.join(' หรือ ') : 'มีประวัติสัมผัสผู้ป่วยยืนยัน'}`,
    `ผู้ป่วยยืนยัน (Confirmed): ผู้ป่วยสงสัยหรือเข้าข่ายที่ตรวจพบเชื้อ${dname} ${f.conf.length ? `ด้วยวิธี ${f.conf.join(' หรือ ')}` : 'ด้วยวิธีทางห้องปฏิบัติการ'}`,
  ].join('\n');
  if (!open) return (
    <div className="mb-2 flex flex-wrap items-center gap-3 rounded-lg bg-sky-50 p-2 text-sm ring-1 ring-sky-200">
      <button type="button" className="btn btn-outline" onClick={() => setOpen(true)}>🧩 สร้างนิยามผู้ป่วยแบบคลิกเลือก</button>
      <span className="text-slate-600">{value ? 'มีนิยามของเหตุการณ์นี้แล้ว (จะแสดงในรายงานหัวข้อ 3.1)' : 'ยังไม่ได้กำหนดนิยามผู้ป่วยของเหตุการณ์นี้'}</span>
    </div>);
  return (
    <div className="mb-2 space-y-3 rounded-lg bg-sky-50 p-3 ring-1 ring-sky-200">
      <div className="flex items-center justify-between"><b className="text-sm">ตัวช่วยสร้างนิยามผู้ป่วย — {dname}</b><button type="button" className="text-sm text-slate-500 underline" onClick={() => setOpen(false)}>ปิด</button></div>
      <div className="grid gap-2 sm:grid-cols-4">
        <label><span className={lab}>บุคคล</span><select className="input" value={f.person} onChange={(e) => set('person', e.target.value)}>{PERSON_GROUPS.map((x) => <option key={x}>{x}</option>)}</select></label>
        <label className="sm:col-span-1"><span className={lab}>สถานที่</span><input className="input" value={f.place} onChange={(e) => set('place', e.target.value)} placeholder="เช่น หมู่ 5 บ้านหนองสนม" /></label>
        <label><span className={lab}>เวลา: ตั้งแต่วันที่</span><ThaiDateInput value={f.from} onChange={(v) => set('from', v)} yearsBack={3} yearsForward={0} /></label>
        <label><span className={lab}>ถึงวันที่ (ว่าง = ปัจจุบัน)</span><ThaiDateInput value={f.to} onChange={(v) => set('to', v)} yearsBack={3} yearsForward={0} /></label>
      </div>
      <div><span className={lab}>อาการ (ติ๊กรายการเสนอแนะตามโรคไว้ให้ ปรับได้) — ต้องมีอย่างน้อย
        <select className="mx-1 rounded border px-1" value={f.min} onChange={(e) => set('min', Number(e.target.value))}>{[1, 2, 3, 4].map((n) => <option key={n}>{n}</option>)}</select>อาการ</span>
        <div className="flex flex-wrap gap-1.5">{SYMPTOMS.map((x) => <button type="button" key={x} onClick={() => tog('sym', x)} className={`rounded-full px-2.5 py-1 text-xs ${f.sym.includes(x) ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-300'}`}>{x}</button>)}</div></div>
      <div><span className={lab}>เกณฑ์ผู้ป่วยเข้าข่าย (เลือกได้หลายข้อ)</span>
        <div className="flex flex-wrap gap-1.5">{PROBABLE_OPTS.map((x) => <button type="button" key={x} onClick={() => tog('prob', x)} className={`rounded-full px-2.5 py-1 text-xs ${f.prob.includes(x) ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-300'}`}>{x}</button>)}</div></div>
      <div><span className={lab}>การตรวจที่ใช้ยืนยัน (เลือกตามที่ส่งตรวจจริง)</span>
        <div className="flex flex-wrap gap-1.5">{lo.test.map((x) => <button type="button" key={x} onClick={() => tog('conf', x)} className={`rounded-full px-2.5 py-1 text-xs ${f.conf.includes(x) ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-300'}`}>{x}</button>)}</div></div>
      <div><span className={lab}>ตัวอย่างนิยามที่ได้ (แก้ไขข้อความได้ก่อนนำไปใช้)</span>
        <textarea className="input min-h-[110px]" value={text} readOnly /></div>
      <div className="flex gap-2"><button type="button" className="btn btn-primary" onClick={() => { onApply(text); setOpen(false); }}>ใช้เป็นนิยามของเหตุการณ์นี้</button>
        <span className="self-center text-xs text-slate-500">หลังนำไปใช้ แก้ไขข้อความเพิ่มได้ในช่อง “ข้อความเพิ่มเติม” ของหัวข้อวิธีการศึกษา — ระวังอย่าใส่ปัจจัยสัมผัสที่กำลังศึกษาไว้ในนิยาม</span></div>
    </div>);
}
