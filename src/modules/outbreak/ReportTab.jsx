// หน้าบันทึกรายงานสอบสวนโรค + ออกรายงานฉบับสมบูรณ์เป็น PDF / Word
import { useMemo, useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { FileDown, FileText, Plus, Printer, Save, Trash2 } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { todayStr } from '../../lib/thai';
import ThaiDateInput from '../../components/ThaiDateInput';
import { writeAudit } from '../../lib/audit';
import { SECTIONS, buildBlocks, draftBackground, draftConclusion } from './reportBuild';
import { choiceGroups, sectionText } from './reportChoices';
import CaseDefBuilder from './CaseDefBuilder';
import { downloadDocx, openPrint } from './reportExport';
import { f2, fp, twoByTwo } from './reportStats';

const lab = 'mb-1 block text-sm text-slate-600';
const WRITE = SECTIONS.filter(([k]) => k !== 'references');

export default function ReportTab({ cs, patients, contacts, an, dname, say }) {
  const { profile } = useAuth();
  const [rp, setRp] = useState(() => ({ org: 'รพ.สต.บ้านหนองสนม', reportDate: todayStr(), reporter: cs.responsible || profile?.name || '', reporterPos: '', design: 'case-control', exposures: [], ...(cs.report || {}) }));
  const [dirty, setDirty] = useState(false); const [busy, setBusy] = useState(false); const [showNames, setShowNames] = useState(false); const [mapImg, setMapImg] = useState(null);
  const set = (k, v) => { setRp((x) => ({ ...x, [k]: v })); setDirty(true); };
  const setEx = (i, k, v) => set('exposures', rp.exposures.map((e, j) => (j === i ? { ...e, [k]: v } : e)));
  const cc = rp.design !== 'cohort';
  const done = useMemo(() => WRITE.filter(([k]) => sectionText(rp, k)).length, [rp]);
  const ctx = { cs, dname, org: rp.org };
  const toggle = (k, g, item) => {
    const cur = (rp.sel || {})[k] || []; const has = cur.includes(item);
    let next = has ? cur.filter((x) => x !== item) : [...cur, item];
    if (!g.multi && !has) next = [...cur.filter((x) => !g.items.includes(x)), item];
    set('sel', { ...(rp.sel || {}), [k]: next });
  };
  const allOf = (k, g, on) => { const cur = ((rp.sel || {})[k] || []).filter((x) => !g.items.includes(x)); set('sel', { ...(rp.sel || {}), [k]: on ? [...cur, ...g.items] : cur }); };
  const Choices = ({ k }) => choiceGroups(k, ctx).filter((g) => g.items.length).map((g) => {
    const cur = (rp.sel || {})[k] || [];
    return (
      <div key={g.id} className="mb-2 rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
        <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-600"><span>{g.label} {g.multi ? '(เลือกได้หลายข้อ)' : '(เลือกได้ 1 ข้อ)'}</span>{g.multi && <span className="flex gap-2 font-normal"><button type="button" className="text-brand-700 underline" onClick={() => allOf(k, g, true)}>เลือกทั้งหมด</button><button type="button" className="text-slate-500 underline" onClick={() => allOf(k, g, false)}>ล้าง</button></span>}</div>
        {g.items.map((it) => (
          <label key={it} className="flex cursor-pointer items-start gap-2 py-0.5 text-sm"><input type={g.multi ? 'checkbox' : 'radio'} name={`${k}-${g.id}`} className="mt-1" checked={cur.includes(it)} onChange={() => toggle(k, g, it)} onClick={() => { if (!g.multi && cur.includes(it)) toggle(k, g, it); }} /><span>{it}</span></label>))}
      </div>);
  });

  const save = async () => {
    setBusy(true);
    try { await updateDoc(doc(db, 'outbreakCases', cs.id), { report: { ...rp, updatedAt: new Date().toISOString() }, ...(rp.caseDef ? { caseDef: rp.caseDef } : {}), updatedAt: serverTimestamp() }); await writeAudit({ action: 'update', module: 'outbreak', docId: cs.id, label: `บันทึกรายงานสอบสวนโรค ${cs.title}` }); setDirty(false); say('บันทึกรายงานแล้ว'); }
    catch (e) { say('บันทึกไม่สำเร็จ: ' + (e.code || e.message)); } finally { setBusy(false); }
  };
  const blocks = () => buildBlocks({ cs, patients, contacts, an, rp, dname, opts: { showNames, mapImg } });
  const fname = `รายงานสอบสวนโรค_${(cs.title || 'case').replace(/[\\/:*?"<>|\s]+/g, '_')}`;
  const pdf = () => { if (!openPrint(blocks(), fname)) say('เบราว์เซอร์บล็อกหน้าต่างใหม่ — อนุญาต pop-up สำหรับเว็บนี้แล้วลองอีกครั้ง'); };
  const word = async () => { setBusy(true); try { await downloadDocx(blocks(), fname); } catch (e) { say('สร้างไฟล์ Word ไม่สำเร็จ: ' + e.message); } finally { setBusy(false); } };
  const pickMap = (e) => {
    const f = e.target.files?.[0]; if (!f) return; const img = new Image(); const url = URL.createObjectURL(f);
    img.onload = () => { const k = Math.min(1, 1400 / img.width); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); setMapImg({ data: c.toDataURL('image/png'), w: c.width, h: c.height }); URL.revokeObjectURL(url); };
    img.onerror = () => say('อ่านไฟล์ภาพไม่ได้'); img.src = url;
  };

  return (
    <div className="space-y-4">
      <section className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-slate-700">ส่งออกรายงานฉบับสมบูรณ์</h3>
          <span className="text-sm text-slate-500">เขียนแล้ว {done}/{WRITE.length} หัวข้อ{dirty ? ' · มีการแก้ไขที่ยังไม่บันทึก' : ''}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primary" onClick={save} disabled={busy || !dirty}><Save className="h-4 w-4" /> บันทึกรายงาน</button>
          <button className="btn btn-outline" onClick={pdf} disabled={busy}><Printer className="h-4 w-4" /> ดูตัวอย่าง / PDF</button>
          <button className="btn btn-outline" onClick={word} disabled={busy}><FileDown className="h-4 w-4" /> ดาวน์โหลด Word (.docx)</button>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
          <label className="flex items-center gap-1"><input type="checkbox" checked={showNames} onChange={(e) => setShowNames(e.target.checked)} /> แสดงชื่อ-สกุลผู้ป่วยในภาคผนวก (ค่าเริ่มต้น: ไม่แสดง)</label>
          <label className="flex items-center gap-2">ภาพ Spot map (แคปจากหน้าแผนที่): <input type="file" accept="image/*" onChange={pickMap} />{mapImg && <button className="text-red-600 underline" onClick={() => setMapImg(null)}>เอาออก</button>}</label>
        </div>
        <p className="text-xs text-slate-400">PDF: เปิดหน้าตัวอย่างแล้วกด “พิมพ์ / บันทึกเป็น PDF” · ตัวเลข ตาราง Epidemic curve คำนวณจากข้อมูลในเคสอัตโนมัติ · หัวข้อที่ยังไม่เขียนจะแสดงเป็น “(ยังไม่ได้บันทึก)” ในรายงาน · ภาพแผนที่ไม่ถูกเก็บในระบบ ต้องแนบใหม่ทุกครั้งที่ออกรายงาน</p>
      </section>

      <section className="card grid gap-3 p-4 sm:grid-cols-2">
        <h3 className="font-bold text-slate-700 sm:col-span-2">ข้อมูลรายงาน</h3>
        <label><span className={lab}>หน่วยงาน</span><input className="input" value={rp.org} onChange={(e) => set('org', e.target.value)} /></label>
        <label><span className={lab}>วันที่ออกรายงาน</span><ThaiDateInput value={rp.reportDate} onChange={(v) => set('reportDate', v)} yearsBack={3} yearsForward={0} /></label>
        <label><span className={lab}>ผู้รายงาน</span><input className="input" value={rp.reporter} onChange={(e) => set('reporter', e.target.value)} /></label>
        <label><span className={lab}>ตำแหน่ง</span><input className="input" value={rp.reporterPos} onChange={(e) => set('reporterPos', e.target.value)} /></label>
        <label className="sm:col-span-2"><span className={lab}>คณะผู้สอบสวน (บรรทัดละ 1 คน พร้อมตำแหน่ง)</span><textarea className="input min-h-[64px]" value={rp.team || ''} onChange={(e) => set('team', e.target.value)} placeholder={cs.responsible || ''} /></label>
      </section>

      <section className="card space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-slate-700">เนื้อหาที่ผู้สอบสวนต้องเขียน</h3>
          <span className="flex gap-3 text-sm">
            {!rp.background && <button className="text-brand-700 underline" onClick={() => set('background', draftBackground(cs, dname, rp.org))}>ร่างความเป็นมาจากข้อมูลเคส</button>}
            {!rp.discussion && an.n > 0 && <button className="text-brand-700 underline" onClick={() => set('discussion', draftConclusion(an, dname))}>ร่างสรุปจากข้อมูลเคส</button>}
          </span></div>
        {WRITE.map(([k, t, hint]) => (
          <div key={k} className="space-y-1">
            <div className="text-sm"><b>{t}</b>{hint ? <span className="text-slate-400"> — {hint}</span> : null}</div>
            <Choices k={k} />
            {k === 'methods' && <CaseDefBuilder cs={cs} dname={dname} value={rp.caseDef || ''} onApply={(txt) => set('caseDef', txt)} />}
            <textarea className="input min-h-[64px]" value={rp[k] || ''} onChange={(e) => set(k, e.target.value)} placeholder="ข้อความเพิ่มเติม (ต่อท้ายข้อความที่เลือก) — เว้นว่างได้ถ้าเลือกครบแล้ว" />
          </div>))}
        <div className="space-y-1">
          <div className="text-sm"><b>เอกสารอ้างอิง</b></div>
          <Choices k="references" />
          <textarea className="input min-h-[64px]" value={rp.references || ''} onChange={(e) => set('references', e.target.value)} placeholder="เอกสารอ้างอิงเพิ่มเติม" />
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <h3 className="font-bold text-slate-700">การศึกษาเชิงวิเคราะห์ (ตาราง 2×2)</h3>
        <label className="block max-w-md"><span className={lab}>รูปแบบการศึกษา</span><select className="input" value={rp.design} onChange={(e) => set('design', e.target.value)}><option value="case-control">Case-control — คำนวณ Odds ratio (OR)</option><option value="cohort">Cohort — คำนวณ Relative risk (RR)</option></select></label>
        <p className="text-xs text-slate-500">{cc ? 'กรอกจำนวนคนตามสถานะการสัมผัสปัจจัยและการป่วย: a = ป่วย+สัมผัส · b = ไม่ป่วย+สัมผัส · c = ป่วย+ไม่สัมผัส · d = ไม่ป่วย+ไม่สัมผัส' : 'กรอก a = สัมผัส+ป่วย · b = สัมผัส+ไม่ป่วย · c = ไม่สัมผัส+ป่วย · d = ไม่สัมผัส+ไม่ป่วย'}</p>
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
          <thead><tr className="border-b bg-slate-50 text-left text-slate-600"><th className="p-2">ปัจจัยสัมผัส (เช่น ดื่มน้ำบ่อ ก)</th>{['a', 'b', 'c', 'd'].map((x) => <th key={x} className="w-20 p-2 text-center">{x}</th>)}<th className="p-2 text-right">{cc ? 'OR' : 'RR'} (95% CI)</th><th className="p-2 text-right">p</th><th className="w-8" /></tr></thead>
          <tbody>{rp.exposures.map((e, i) => { const r = twoByTwo(rp.design, e.a, e.b, e.c, e.d); const okv = [e.a, e.b, e.c, e.d].every((x) => x !== '' && x != null); return (
            <tr key={i} className="border-b last:border-0"><td className="p-1"><input className="input" value={e.name || ''} onChange={(ev) => setEx(i, 'name', ev.target.value)} /></td>
              {['a', 'b', 'c', 'd'].map((x) => <td key={x} className="p-1"><input className="input text-center" type="number" min="0" value={e[x] ?? ''} onChange={(ev) => setEx(i, x, ev.target.value)} /></td>)}
              <td className="p-2 text-right tabular-nums">{r && okv ? `${f2(r.est)} (${f2(r.lo)}–${f2(r.hi)})${r.zero ? '*' : ''}` : '-'}</td><td className="p-2 text-right tabular-nums">{r && okv ? fp(r.p) : '-'}</td>
              <td className="p-1"><button className="text-red-600" aria-label="ลบ" onClick={() => set('exposures', rp.exposures.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button></td></tr>); })}</tbody></table></div>
        <button className="btn btn-outline" onClick={() => set('exposures', [...rp.exposures, { name: '', a: '', b: '', c: '', d: '' }])}><Plus className="h-4 w-4" /> เพิ่มปัจจัยสัมผัส</button>
        <p className="text-xs text-slate-400"><FileText className="mr-1 inline h-3 w-3" />95% CI คำนวณแบบ Woolf (OR) / log (RR); p จาก chi-square ไม่ปรับค่า — ถ้ามีช่องค่าน้อยกว่า 5 ควรใช้ Fisher's exact test ด้วยโปรแกรมสถิติ</p>
      </section>
    </div>
  );
}
