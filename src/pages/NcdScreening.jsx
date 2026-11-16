// ระบบคัดกรองกลุ่มเสี่ยง NCD (เบาหวาน/ความดันโลหิตสูง) — เฟส 1: บันทึกผลคัดกรองบนมือถือ + แปลผลอัตโนมัติ + สรุป/ส่งออก
// ยังไม่เขียนกลับ JHCIS (เฟส 2 หลังตรวจ schema และอนุมัติ) — ทุกรายการมีสถานะ jhcis = 'pending'
import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { HeartPulse, Pencil, Plus, Search, Trash2, FileSpreadsheet } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { writeAudit } from '../lib/audit';
import { fmtDate, todayStr } from '../lib/thai';
import { PageHeader } from '../components/Logo';
import ThaiDateInput from '../components/ThaiDateInput';
import { Badge, ConfirmDialog, EmptyState, Modal, Spinner } from '../components/ui';
import { useVillages } from '../modules/outbreak/outbreakRefs';
import { ageFromBirth, ageGroupOf, calcBmi, classifyBp, classifyGlucose, needGlucose, overall, riskFactors, validCid } from '../lib/ncdScreen';

const EMPTY = { cid: '', name: '', sex: '', birthDate: '', villageNo: '', screenDate: todayStr(), smoke: false, alcohol: false, familyDM: false, familyHT: false, hxHT: false, weight: '', height: '', waist: '', sbp1: '', dbp1: '', sbp2: '', dbp2: '', fasting: true, glucose: '', note: '' };

const Chk = ({ id, label, v, set }) => (
  <label htmlFor={id} className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm"><input id={id} type="checkbox" className="h-5 w-5" checked={!!v} onChange={(e) => set(e.target.checked)} />{label}</label>
);
const Num = ({ id, label, v, set, ph, step }) => (
  <div><label htmlFor={id} className="text-xs">{label}</label><input id={id} inputMode="decimal" step={step} className="input" placeholder={ph} value={v} onChange={(e) => set(e.target.value.replace(/[^0-9.]/g, ''))} /></div>
);

function ScreenForm({ init, villages, onClose, onSaved }) {
  const { profile } = useAuth();
  const [f, setF] = useState({ ...EMPTY, ...init });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const s = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  const age = ageFromBirth(f.birthDate);
  const bmi = calcBmi(f.weight, f.height);
  const bp = classifyBp(f.sbp1, f.dbp1, f.sbp2, f.dbp2);
  const gl = classifyGlucose(f.glucose, f.fasting);
  const ng = age != null ? needGlucose(age, f) : null;
  const ov = bp || gl ? overall(bp, gl) : null;
  const save = async () => {
    if (!f.name.trim()) return setErr('กรุณากรอกชื่อ-สกุล');
    if (f.cid && !validCid(f.cid)) return setErr('เลขบัตรประชาชนไม่ถูกต้อง (13 หลัก)');
    if (!f.sex) return setErr('กรุณาเลือกเพศ');
    if (age == null) return setErr('กรุณาเลือกวันเกิด');
    if (!ageGroupOf(age)) return setErr(`อายุ ${age} ปี อยู่นอกช่วงคัดกรอง 15–59 ปี`);
    if (!bp) return setErr('กรุณากรอกความดันอย่างน้อย 1 ครั้ง');
    if (ng?.need && !f.glucose) return setErr(`ต้องเจาะน้ำตาล: ${ng.why}`);
    setBusy(true); setErr('');
    try {
      const data = { ...f, cid: f.cid.replace(/\D/g, ''), name: f.name.trim(), age, ageGroup: ageGroupOf(age), bmi, bpLevel: bp.key, bpSys: bp.sys, bpDia: bp.dia, gluLevel: gl?.key || '', overall: ov.key, risks: riskFactors(f), glucoseNeeded: !!ng?.need };
      if (init?.id) { await updateDoc(doc(db, 'ncdScreenings', init.id), { ...data, updatedAt: serverTimestamp() }); await writeAudit({ action: 'update', module: 'ncd-screening', docId: init.id, label: data.name }); }
      else { const r = await addDoc(collection(db, 'ncdScreenings'), { ...data, jhcis: 'pending', screenedBy: profile?.name || profile?.email || '', createdAt: serverTimestamp() }); await writeAudit({ action: 'create', module: 'ncd-screening', docId: r.id, label: data.name }); }
      onSaved();
    } catch (e) { setErr(e.message || 'บันทึกไม่สำเร็จ'); } finally { setBusy(false); }
  };
  return (
    <Modal title={init?.id ? 'แก้ไขผลคัดกรอง' : 'คัดกรองรายใหม่'} onClose={onClose} wide footer={<><button className="btn btn-outline" onClick={onClose}>ยกเลิก</button><button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'กำลังบันทึก...' : 'บันทึก'}</button></>}>
      <div className="space-y-4 text-sm">
        <section className="space-y-2"><h3 className="font-bold text-slate-800">1. ข้อมูลผู้รับการคัดกรอง</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <div><label htmlFor="ncd-name" className="text-xs">ชื่อ-สกุล</label><input id="ncd-name" className="input" value={f.name} onChange={(e) => s('name')(e.target.value)} /></div>
            <div><label htmlFor="ncd-cid" className="text-xs">เลขบัตรประชาชน 13 หลัก</label><input id="ncd-cid" inputMode="numeric" maxLength={13} className="input" value={f.cid} onChange={(e) => s('cid')(e.target.value.replace(/\D/g, ''))} /></div>
            <div><label className="text-xs">เพศ</label><div className="flex gap-2">{[['M', 'ชาย'], ['F', 'หญิง']].map(([k, t]) => <button type="button" key={k} onClick={() => s('sex')(k)} className={`btn flex-1 ${f.sex === k ? 'btn-primary' : 'btn-outline'}`}>{t}</button>)}</div></div>
            <div><label className="text-xs">วันเกิด {age != null && <b className="text-brand-700">· อายุ {age} ปี{ageGroupOf(age) ? ` (กลุ่ม ${ageGroupOf(age)})` : ' (นอกช่วง 15–59)'}</b>}</label><ThaiDateInput id="ncd-birth" value={f.birthDate} onChange={s('birthDate')} yearsBack={80} yearsForward={0} /></div>
            <div><label htmlFor="ncd-vil" className="text-xs">หมู่บ้าน</label><select id="ncd-vil" className="input" value={f.villageNo} onChange={(e) => s('villageNo')(e.target.value)}><option value="">— เลือก —</option>{(villages || []).map((v) => <option key={v.no} value={v.no}>ม.{v.no} {v.name}</option>)}</select></div>
            <div><label className="text-xs">วันที่คัดกรอง</label><ThaiDateInput id="ncd-date" value={f.screenDate} onChange={s('screenDate')} /></div>
          </div>
        </section>
        <section className="space-y-2"><h3 className="font-bold text-slate-800">2. พฤติกรรมเสี่ยง/ประวัติ <span className="text-xs font-normal text-slate-500">(แฟ้ม SPECIALPP)</span></h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <Chk id="ncd-smoke" label="สูบบุหรี่" v={f.smoke} set={s('smoke')} /><Chk id="ncd-alc" label="ดื่มสุรา" v={f.alcohol} set={s('alcohol')} />
            <Chk id="ncd-fdm" label="ญาติสายตรงเป็นเบาหวาน" v={f.familyDM} set={s('familyDM')} /><Chk id="ncd-fht" label="ญาติสายตรงเป็นความดันสูง" v={f.familyHT} set={s('familyHT')} />
            <Chk id="ncd-hxht" label="เคยมีความดันโลหิตสูง" v={f.hxHT} set={s('hxHT')} />
          </div>
        </section>
        <section className="space-y-2"><h3 className="font-bold text-slate-800">3. วัดร่างกาย <span className="text-xs font-normal text-slate-500">(แฟ้ม NCDSCREEN)</span></h3>
          <div className="grid grid-cols-3 gap-2"><Num id="ncd-w" label="น้ำหนัก (กก.)" v={f.weight} set={s('weight')} /><Num id="ncd-h" label="ส่วนสูง (ซม.)" v={f.height} set={s('height')} /><Num id="ncd-waist" label="รอบเอว (ซม.)" v={f.waist} set={s('waist')} /></div>
          {bmi != null && <div className="text-xs text-slate-600">BMI = <b>{bmi}</b></div>}
          <div className="grid grid-cols-4 gap-2"><Num id="ncd-s1" label="ซิสโตลิก ครั้งที่ 1" v={f.sbp1} set={s('sbp1')} ph="120" /><Num id="ncd-d1" label="ไดแอสโตลิก 1" v={f.dbp1} set={s('dbp1')} ph="80" /><Num id="ncd-s2" label="ซิสโตลิก ครั้งที่ 2" v={f.sbp2} set={s('sbp2')} /><Num id="ncd-d2" label="ไดแอสโตลิก 2" v={f.dbp2} set={s('dbp2')} /></div>
          {bp && <div className="flex flex-wrap items-center gap-2 text-xs">ความดันเฉลี่ย <b>{bp.sys}/{bp.dia}</b> <Badge className={bp.tone}>{bp.label}</Badge> <span className="text-slate-500">{bp.action}</span></div>}
        </section>
        <section className="space-y-2"><h3 className="font-bold text-slate-800">4. น้ำตาลในเลือด</h3>
          {ng && <div className={`rounded-lg px-3 py-2 text-xs ring-1 ${ng.need ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-slate-50 text-slate-600 ring-slate-200'}`}>{ng.need ? 'ต้องเจาะน้ำตาล — ' : 'ไม่จำเป็นต้องเจาะ — '}{ng.why}</div>}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex gap-2 self-end">{[[true, 'อดอาหาร'], [false, 'ไม่อดอาหาร']].map(([k, t]) => <button type="button" key={String(k)} onClick={() => s('fasting')(k)} className={`btn flex-1 ${f.fasting === k ? 'btn-primary' : 'btn-outline'}`}>{t}</button>)}</div>
            <Num id="ncd-glu" label="น้ำตาลปลายนิ้ว (มก./ดล.)" v={f.glucose} set={s('glucose')} />
          </div>
          {gl && <div className="flex flex-wrap items-center gap-2 text-xs"><Badge className={gl.tone}>{gl.label}</Badge><span className="text-slate-500">{gl.action}</span></div>}
        </section>
        {ov && <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200"><b>สรุปผล:</b><Badge className={ov.tone}>{ov.label}</Badge></div>}
        <div><label htmlFor="ncd-note" className="text-xs">หมายเหตุ</label><textarea id="ncd-note" rows={2} className="input" value={f.note} onChange={(e) => s('note')(e.target.value)} /></div>
        {err && <div className="rounded-lg bg-red-50 p-2 text-red-700" role="alert">{err}</div>}
      </div>
    </Modal>
  );
}

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
      {form && <ScreenForm init={form.id ? form : null} villages={villages} onClose={() => setForm(null)} onSaved={() => setForm(null)} />}
      {del && <ConfirmDialog message={`ลบผลคัดกรองของ ${del.name}?`} onConfirm={remove} onCancel={() => setDel(null)} />}
    </div>
  );
}
