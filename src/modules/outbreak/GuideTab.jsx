// แท็บแนวทางสอบสวนโรครายโรค: เกณฑ์ลงสอบสวน นิยาม ระยะฟักตัว ตัวอย่างส่งตรวจ และขั้นตอนสอบสวน 10 ขั้นตอน (ติ๊กความคืบหน้า)
import { useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Plus } from 'lucide-react';
import { db } from '../../firebase';
import { todayStr } from '../../lib/thai';
import { INVESTIGATION_STEPS, SRC_NOTE, TEMPLATES } from './diseaseTemplates';

export default function GuideTab({ cs, say }) {
  const t = TEMPLATES[cs.disease]; const [busy, setBusy] = useState(false);
  const done = cs.steps || {};
  const put = async (patch) => { setBusy(true); try { await updateDoc(doc(db, 'outbreakCases', cs.id), { ...patch, updatedAt: serverTimestamp() }); } catch (e) { say('บันทึกไม่สำเร็จ: ' + (e.code || e.message)); } finally { setBusy(false); } };
  const toggle = (i) => put({ steps: { ...done, [i]: !done[i] } });
  const addMeasure = (text) => put({ measures: [...(cs.measures || []), { id: String(Date.now()) + Math.random().toString(36).slice(2, 5), date: todayStr(), text, owner: '', result: '' }] });
  const addLab = (specimen) => put({ labs: [...(cs.labs || []), { id: String(Date.now()) + Math.random().toString(36).slice(2, 5), date: todayStr(), who: '', specimen, test: '', result: '' }] });
  const nDone = INVESTIGATION_STEPS.filter((_, i) => done[i]).length;
  return (
    <div className="space-y-4">
      <section className="card space-y-2 p-4 text-sm">
        <h3 className="font-bold text-slate-700">{cs.disease}</h3>
        {t ? (<>
          <p><b>เกณฑ์ลงสอบสวน:</b> {t.criteria}{t.hours ? ` — ภายใน ${t.hours} ชั่วโมง` : ' — (เอกสารไม่ระบุกรอบเวลา)'}</p>
          {t.incubation && <p><b>ระยะฟักตัว/ช่วงสอบประวัติเสี่ยง:</b> {t.incubation}</p>}
          {t.definition && <p className="whitespace-pre-line"><b>นิยามตัวอย่างจากเอกสารกรมควบคุมโรค:</b> {t.definition}</p>}
          {cs.caseDef && <p className="whitespace-pre-line rounded-lg bg-emerald-50 p-2 ring-1 ring-emerald-200"><b>นิยามผู้ป่วยของเหตุการณ์นี้:</b> {cs.caseDef}</p>}
          <p className="text-xs text-slate-500">ที่มา: {t.src.split(',').map((k) => SRC_NOTE[k]).join(' · ')}</p>
        </>) : <p className="text-slate-500">โรคนี้ยังไม่มีแม่แบบเฉพาะโรคในระบบ — ใช้ขั้นตอนมาตรฐาน 10 ขั้นตอนด้านล่าง และกำหนดนิยามผู้ป่วยเองในหน้าแก้ไขเหตุการณ์ (ส่งแบบสอบสวนทางการของโรคนี้มาให้เพิ่มเข้าระบบได้)</p>}
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900 ring-1 ring-amber-200">แม่แบบเป็นแนวทางช่วยเตือนความจำ ไม่ใช่แบบสอบสวนทางการ — ตรวจสอบนิยามและแบบรายงานล่าสุดกับ สสจ./สคร. ก่อนรายงาน</p>
      </section>
      {t?.samples && <section className="card p-4 text-sm"><h3 className="mb-2 font-bold text-slate-700">ตัวอย่างที่ควรเก็บส่งตรวจ</h3>
        <ul className="space-y-1">{t.samples.map((x) => <li key={x} className="flex items-start justify-between gap-2"><span>• {x}</span><button disabled={busy} className="shrink-0 text-xs text-brand-700 underline" onClick={() => addLab(x)}><Plus className="inline h-3 w-3" /> เพิ่มในผลแล็บ</button></li>)}</ul></section>}
      {t?.measures && <section className="card p-4 text-sm"><h3 className="mb-2 font-bold text-slate-700">มาตรการควบคุมโรคที่ควรพิจารณา</h3>
        <ul className="space-y-1">{t.measures.map((x) => <li key={x} className="flex items-start justify-between gap-2"><span>• {x}</span><button disabled={busy} className="shrink-0 text-xs text-brand-700 underline" onClick={() => addMeasure(x)}><Plus className="inline h-3 w-3" /> เพิ่มในมาตรการ</button></li>)}</ul></section>}
      <section className="card p-4 text-sm"><h3 className="mb-2 font-bold text-slate-700">ขั้นตอนการสอบสวนทางระบาดวิทยา 10 ขั้นตอน ({nDone}/10)</h3>
        <ol className="space-y-1">{INVESTIGATION_STEPS.map((s, i) => <li key={s}><label className="flex cursor-pointer items-start gap-2"><input type="checkbox" className="mt-1" checked={!!done[i]} disabled={busy} onChange={() => toggle(i)} /><span className={done[i] ? 'text-slate-400 line-through' : ''}>{i + 1}. {s}</span></label></li>)}</ol></section>
    </div>
  );
}
