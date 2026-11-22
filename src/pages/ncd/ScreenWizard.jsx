// ฟอร์มคัดกรอง NCD แบบทีละขั้น (เต็มจอบนมือถือ) — 5 ขั้น: บุคคล → พฤติกรรม → วัดร่างกาย → น้ำตาล → สรุปผล/คำแนะนำ
import { useMemo, useState } from 'react';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { writeAudit } from '../../lib/audit';
import { todayStr } from '../../lib/thai';
import ThaiDateInput from '../../components/ThaiDateInput';
import { Badge } from '../../components/ui';
import { COUNSEL, SYMPTOMS, adviceFor, ageFromBirth, ageGroupOf, calcBmi, classify2Q, classifyBp, classifyCvd, classifyGlucose, classifySt5, feeStatus, lifestyleRisks, mentalRisks, metabolicRisks, needCvd, needGlucose, needLipid, overall, ppCodes, riskFactors, validCid, waistOver } from '../../lib/ncdScreen';

export const EMPTY = { cid: '', name: '', sex: '', birthDate: '', villageNo: '', houseNo: '', phone: '', screenDate: todayStr(), screenPlace: 'community', knownDM: false, knownHT: false, familyDM: false, familyHT: false, hxHT: false, smokeStatus: '', alcoholFreq: '', exercise: '', sweet: '', salty: '', veg: '', symptoms: [], weight: '', height: '', waist: '', sbp1: '', dbp1: '', sbp2: '', dbp2: '', fasting: true, glucose: '', smokePerDay: '', q2a: '', q2b: '', st5: '', drug: '', cvdRisk: '', tc: '', hdl: '', counsel: [], note: '', authenReq: false, authenConsent: false };
const STEPS = ['ข้อมูลบุคคล', 'พฤติกรรม', 'สุขภาพจิต', 'วัดร่างกาย', 'น้ำตาล/ไขมัน', 'สรุปผล'];

// ปุ่มเลือกตัวเลือกเดียว (ใหญ่ กดง่ายบนมือถือ)
function Seg({ label, value, onChange, opts, id }) {
  return (
    <div role="group" aria-labelledby={id}>
      <div id={id} className="mb-1.5 text-sm font-medium text-slate-700">{label}</div>
      <div className="flex flex-wrap gap-2">
        {opts.map(([k, t]) => (
          <button type="button" key={String(k)} onClick={() => onChange(value === k ? '' : k)} aria-pressed={value === k}
            className={`min-h-12 flex-1 rounded-xl border-2 px-3 text-sm font-medium transition ${value === k ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}>{t}</button>
        ))}
      </div>
    </div>
  );
}
const Toggle = ({ id, label, v, set }) => (
  <button type="button" id={id} aria-pressed={!!v} onClick={() => set(!v)}
    className={`flex min-h-12 w-full items-center gap-3 rounded-xl border-2 px-3 text-left text-sm transition ${v ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-slate-200 bg-white text-slate-700'}`}>
    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 ${v ? 'border-amber-500 bg-amber-500 text-white' : 'border-slate-300'}`}>{v && <Check className="h-4 w-4" />}</span>{label}
  </button>
);
function Field({ id, label, unit, v, set, ph, hint }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <div className="relative"><input id={id} inputMode="decimal" className="input !h-14 !text-xl font-semibold tabular-nums" placeholder={ph} value={v} onChange={(e) => set(e.target.value.replace(/[^0-9.]/g, ''))} />{unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{unit}</span>}</div>
      {hint && <div className="mt-0.5 text-xs">{hint}</div>}
    </div>
  );
}

export default function ScreenWizard({ init, villages, existing, onClose, onSaved, onSubmit, lockedMask = '', title = 'คัดกรองกลุ่มเสี่ยง NCD' }) {
  const { profile } = useAuth();
  const [f, setF] = useState({ ...EMPTY, ...init });
  const [step, setStep] = useState(0); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const s = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  const age = ageFromBirth(f.birthDate); const grp = age != null ? ageGroupOf(age) : null;
  const bmi = calcBmi(f.weight, f.height);
  const bp = classifyBp(f.sbp1, f.dbp1, f.sbp2, f.dbp2);
  const gl = classifyGlucose(f.glucose, f.fasting);
  const ng = age != null ? needGlucose(age, f) : null;
  const q2 = classify2Q(f.q2a, f.q2b); const st = classifySt5(f.st5); const cvd = classifyCvd(f.cvdRisk); const fee = age != null ? feeStatus({ ...f, age }) : null;
  const toggleCounsel = (k) => setF((p) => ({ ...p, counsel: p.counsel.includes(k) ? p.counsel.filter((x) => x !== k) : [...p.counsel, k] }));
  const ov = bp || gl ? overall(bp, gl) : null;
  const dup = useMemo(() => f.cid.length === 13 && (existing || []).some((r) => r.cid === f.cid && r.id !== init?.id && String(r.screenDate).slice(0, 4) === String(f.screenDate).slice(0, 4)), [f.cid, f.screenDate, existing, init]);
  const toggleSym = (k) => setF((p) => ({ ...p, symptoms: p.symptoms.includes(k) ? p.symptoms.filter((x) => x !== k) : [...p.symptoms, k] }));

  const check = (i) => {
    if (i === 0) {
      if (!f.name.trim()) return 'กรุณากรอกชื่อ-สกุล';
      if (f.cid && !validCid(f.cid)) return 'เลขบัตรประชาชนไม่ถูกต้อง (13 หลัก)';
      if (!f.sex) return 'กรุณาเลือกเพศ';
      if (age == null) return 'กรุณาเลือกวันเกิด';
      if (!grp) return `อายุ ${age} ปี ต่ำกว่า 15 ปี ไม่อยู่ในกลุ่มคัดกรอง`;
    }
    if (i === 3 && !bp) return 'กรุณากรอกความดันอย่างน้อย 1 ครั้ง (ซิสโตลิกและไดแอสโตลิก)';
    if (i === 4 && ng?.need && !f.glucose) return `ต้องเจาะน้ำตาล: ${ng.why}`;
    if (i === 5 && f.authenReq) {
      if (!f.authenConsent) return 'ขอเปิดสิทธิ์ Authen ต้องติ๊กยืนยันว่าผู้รับบริการอยู่ด้วยและยินยอม';
      if (!lockedMask && f.cid.length !== 13) return 'ขอเปิดสิทธิ์ Authen ต้องมีเลขบัตรประชาชน 13 หลัก';
      if (f.phone.replace(/\D/g, '').length < 9) return 'ขอเปิดสิทธิ์ Authen ต้องกรอกเบอร์โทรผู้รับบริการ/ญาติ (ขั้นที่ 1)';
    }
    return '';
  };
  const next = () => { const e = check(step); setErr(e); if (!e) setStep((x) => x + 1); };
  const save = async () => {
    for (let i = 0; i < 6; i++) { const e = check(i); if (e) { setErr(e); setStep(i); return; } }
    setBusy(true); setErr('');
    try {
      const data = { ...f, cid: f.cid.replace(/\D/g, ''), name: f.name.trim(), age, ageGroup: grp, bmi, waistOver: waistOver(f.sex, f.waist), bpLevel: bp.key, bpSys: bp.sys, bpDia: bp.dia, gluLevel: gl?.key || '', overall: ov.key, risks: riskFactors(f), glucoseNeeded: !!ng?.need, pp: ppCodes(f), smoke: f.smokeStatus === 'current', alcohol: !!f.alcoholFreq && f.alcoholFreq !== 'none' && f.alcoholFreq !== 'former' };
      if (onSubmit) { await onSubmit(data); onSaved(data.name); return; }
      // เจ้าหน้าที่บันทึกเอง: สร้างคำขอเปิดสิทธิ์ Authen (ถ้าติ๊ก) — ไม่ทับคำขอเดิมที่มีสถานะแล้ว
      const reqAuthen = f.authenReq && f.authenConsent && !init?.authen?.status;
      delete data.authenReq; delete data.authenConsent;
      if (reqAuthen) data.authen = { status: 'requested', consent: true, phone: f.phone, requestedBy: profile?.name || profile?.email || '', requestedAt: serverTimestamp() };
      if (init?.id) { await updateDoc(doc(db, 'ncdScreenings', init.id), { ...data, updatedAt: serverTimestamp() }); await writeAudit({ action: 'update', module: 'ncd-screening', docId: init.id, label: data.name }); }
      else { const r = await addDoc(collection(db, 'ncdScreenings'), { ...data, jhcis: 'pending', screenedBy: profile?.name || profile?.email || '', createdAt: serverTimestamp() }); await writeAudit({ action: 'create', module: 'ncd-screening', docId: r.id, label: data.name }); }
      onSaved();
    } catch (e) { setErr(e.message || 'บันทึกไม่สำเร็จ'); } finally { setBusy(false); }
  };

  const adv = adviceFor(ov, f);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-50" role="dialog" aria-modal="true" aria-label="คัดกรอง NCD">
      <header className="bg-gradient-to-r from-rose-600 to-red-500 px-4 pb-3 pt-3 text-white shadow">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <div className="min-w-0 flex-1"><div className="text-xs opacity-90">{title} · ขั้น {step + 1}/{STEPS.length}</div><div className="truncate text-lg font-bold">{STEPS[step]}{f.name && step > 0 ? ` · ${f.name}` : ''}</div></div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="rounded-full p-2 hover:bg-white/20"><X className="h-6 w-6" /></button>
        </div>
        <div className="mx-auto mt-2 flex max-w-xl gap-1.5" aria-hidden="true">{STEPS.map((t, i) => <div key={t} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-white' : 'bg-white/30'}`} />)}</div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-xl space-y-4">
          {step === 0 && (<>
            <div><label htmlFor="ncd-name" className="mb-1 block text-sm font-medium">ชื่อ-สกุล</label><input id="ncd-name" className="input !h-14 !text-lg" value={f.name} onChange={(e) => s('name')(e.target.value)} autoComplete="off" /></div>
            {lockedMask ? <div><div className="mb-1 text-sm font-medium">เลขบัตรประชาชน</div><div className="rounded-xl bg-slate-100 p-3 font-mono text-sm text-slate-600">{lockedMask} <span className="text-xs">(ดึงจากทะเบียน ไม่ต้องกรอก)</span></div></div> : <div><label htmlFor="ncd-cid" className="mb-1 block text-sm font-medium">เลขบัตรประชาชน 13 หลัก</label><input id="ncd-cid" inputMode="numeric" maxLength={13} className="input !h-14 !text-lg tabular-nums" value={f.cid} onChange={(e) => s('cid')(e.target.value.replace(/\D/g, ''))} />
              {f.cid.length === 13 && <div className={`mt-1 text-xs ${validCid(f.cid) ? 'text-emerald-600' : 'text-red-600'}`}>{validCid(f.cid) ? 'เลขบัตรถูกต้อง' : 'เลขบัตรไม่ถูกต้อง'}</div>}
              {dup && <div className="mt-1 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 ring-1 ring-amber-200">คนนี้มีผลคัดกรองในปีนี้แล้ว — ตรวจสอบว่าไม่ได้บันทึกซ้ำ</div>}</div>}
            <Seg id="s-sex" label="เพศ" value={f.sex} onChange={s('sex')} opts={[['M', 'ชาย'], ['F', 'หญิง']]} />
            <div><div className="mb-1 text-sm font-medium">วันเกิด</div><ThaiDateInput id="ncd-birth" value={f.birthDate} onChange={s('birthDate')} yearsBack={80} yearsForward={0} />
              {age != null && <div className={`mt-2 rounded-xl p-3 text-sm ring-1 ${grp ? 'bg-sky-50 text-sky-900 ring-sky-200' : 'bg-red-50 text-red-700 ring-red-200'}`}>อายุ <b>{age}</b> ปี · {grp ? <>กลุ่มคัดกรอง <b>{grp === '15-34' ? '15–34 ปี' : grp === '35-59' ? '35–59 ปี' : '60 ปีขึ้นไป'}</b></> : 'ต่ำกว่า 15 ปี ไม่อยู่ในกลุ่มคัดกรอง'}</div>}</div>
            <div className="grid grid-cols-2 gap-3">
              <div><label htmlFor="ncd-vil" className="mb-1 block text-sm font-medium">หมู่บ้าน</label><select id="ncd-vil" className="input !h-12" value={f.villageNo} onChange={(e) => s('villageNo')(e.target.value)}><option value="">— เลือก —</option>{(villages || []).map((v) => <option key={v.no} value={v.no}>ม.{v.no} {v.name}</option>)}</select></div>
              <div><label htmlFor="ncd-house" className="mb-1 block text-sm font-medium">บ้านเลขที่</label><input id="ncd-house" className="input !h-12" value={f.houseNo} onChange={(e) => s('houseNo')(e.target.value)} /></div>
              <div><label htmlFor="ncd-phone" className="mb-1 block text-sm font-medium">เบอร์โทร</label><input id="ncd-phone" inputMode="tel" className="input !h-12" value={f.phone} onChange={(e) => s('phone')(e.target.value.replace(/[^0-9-]/g, ''))} /></div>
              <div><div className="mb-1 text-sm font-medium">วันที่คัดกรอง</div><ThaiDateInput id="ncd-date" value={f.screenDate} onChange={s('screenDate')} /></div>
            </div>
            <Seg id="s-place" label="สถานที่คัดกรอง" value={f.screenPlace} onChange={(v) => s('screenPlace')(v || 'community')} opts={[['community', 'ในชุมชน/หมู่บ้าน'], ['unit', 'ที่ รพ.สต.']]} />
            <div className="space-y-2"><div className="text-sm font-medium text-slate-700">ประวัติสุขภาพ</div>
              <Toggle id="ncd-kdm" label="เคยได้รับการวินิจฉัยเป็นเบาหวานแล้ว" v={f.knownDM} set={s('knownDM')} />
              <Toggle id="ncd-kht" label="เคยได้รับการวินิจฉัยเป็นความดันโลหิตสูงแล้ว" v={f.knownHT} set={s('knownHT')} />
              <Toggle id="ncd-fdm" label="พ่อ/แม่/พี่น้อง เป็นเบาหวาน" v={f.familyDM} set={s('familyDM')} />
              <Toggle id="ncd-fht" label="พ่อ/แม่/พี่น้อง เป็นความดันโลหิตสูง" v={f.familyHT} set={s('familyHT')} />
              <Toggle id="ncd-hxht" label="เคยวัดความดันได้สูงมาก่อน (ยังไม่ได้วินิจฉัย)" v={f.hxHT} set={s('hxHT')} />
              {(f.knownDM || f.knownHT) && <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800 ring-1 ring-amber-200">ผู้ที่เป็นโรคอยู่แล้วโดยปกติไม่นับเป็นกลุ่มคัดกรอง — บันทึกต่อได้ แต่ควรตรวจสอบก่อนนับในตัวชี้วัด</div>}</div>
          </>)}

          {step === 1 && (<>
            <p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900 ring-1 ring-sky-200">ถามพฤติกรรมของผู้รับการคัดกรอง แล้วแตะเลือกคำตอบ (ข้ามได้ถ้าไม่ตอบ)</p>
            <Seg id="s-smoke" label="การสูบบุหรี่" value={f.smokeStatus} onChange={s('smokeStatus')} opts={[['never', 'ไม่เคยสูบ'], ['former', 'เลิกแล้ว'], ['current', 'สูบอยู่']]} />
            {f.smokeStatus === 'current' && <Field id="ncd-cig" label="สูบวันละกี่มวน" unit="มวน" v={f.smokePerDay} set={s('smokePerDay')} />}
            <Seg id="s-alc" label="การดื่มสุรา" value={f.alcoholFreq} onChange={s('alcoholFreq')} opts={[['none', 'ไม่เคยดื่ม'], ['former', 'เลิกดื่มแล้ว ≥ 1 ปี'], ['sometimes', 'ดื่มบางครั้ง'], ['regular', 'ดื่มเป็นประจำ']]} />
            <Seg id="s-ex" label="ออกกำลังกาย (≥ 150 นาที/สัปดาห์)" value={f.exercise} onChange={s('exercise')} opts={[['enough', 'เพียงพอ'], ['low', 'ไม่เพียงพอ']]} />
            <Seg id="s-sweet" label="กินหวาน/ดื่มน้ำหวาน" value={f.sweet} onChange={s('sweet')} opts={[['rare', 'น้อย'], ['often', 'บ่อย']]} />
            <Seg id="s-salty" label="กินเค็ม (ปลาร้า น้ำปลา ของหมักดอง)" value={f.salty} onChange={s('salty')} opts={[['ok', 'ไม่จัด'], ['often', 'เค็มจัด']]} />
            <Seg id="s-veg" label="กินผักผลไม้" value={f.veg} onChange={s('veg')} opts={[['ok', 'เพียงพอ'], ['low', 'น้อย']]} />
            <div className="space-y-2"><div className="text-sm font-medium text-slate-700">อาการที่พบ (เลือกได้หลายข้อ)</div>{SYMPTOMS.map(([k, t]) => <Toggle key={k} id={`sym-${k}`} label={t} v={f.symptoms.includes(k)} set={() => toggleSym(k)} />)}</div>
          </>)}

          {step === 2 && (<>
            <p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900 ring-1 ring-sky-200">คัดกรองความเครียด ซึมเศร้า และสารเสพติด (รายการคัดกรองที่ สปสช. กำหนดสำหรับอายุ 15–59 ปี)</p>
            <div className="space-y-2"><div className="text-sm font-semibold">แบบคัดกรองซึมเศร้า 2Q — ในช่วง 2 สัปดาห์ที่ผ่านมา</div>
              <Seg id="s-q2a" label="รู้สึกหดหู่ เศร้า หรือท้อแท้สิ้นหวังหรือไม่" value={f.q2a} onChange={s('q2a')} opts={[[false, 'ไม่มี'], [true, 'มี']]} />
              <Seg id="s-q2b" label="รู้สึกเบื่อ ทำอะไรก็ไม่เพลิดเพลิน หรือไม่" value={f.q2b} onChange={s('q2b')} opts={[[false, 'ไม่มี'], [true, 'มี']]} />
              {q2 && <Badge className={q2.tone}>{q2.label}</Badge>}</div>
            <Field id="ncd-st5" label="คะแนนความเครียด ST-5 (รวม 0–15)" unit="คะแนน" v={f.st5} set={(v) => s('st5')(v === '' ? '' : String(Math.min(15, Number(v))))} hint={st ? <Badge className={st.tone}>{st.label}</Badge> : <span className="text-slate-500">0–4 น้อย · 5–7 ปานกลาง · 8–9 มาก · 10–15 มากที่สุด</span>} />
            <Seg id="s-drug" label="การใช้สารเสพติด" value={f.drug} onChange={s('drug')} opts={[['no', 'ไม่ใช้'], ['yes', 'ใช้/เคยใช้ใน 3 เดือน']]} />
            <div className="space-y-2"><div className="text-sm font-medium text-slate-700">ให้คำปรึกษา/แนะนำเรื่อง (เลือกได้หลายข้อ)</div>{COUNSEL.map(([k, t]) => <Toggle key={k} id={`cn-${k}`} label={t} v={f.counsel.includes(k)} set={() => toggleCounsel(k)} />)}</div>
          </>)}

          {step === 3 && (<>
            <div className="grid grid-cols-3 gap-3"><Field id="ncd-w" label="น้ำหนัก" unit="กก." v={f.weight} set={s('weight')} /><Field id="ncd-h" label="ส่วนสูง" unit="ซม." v={f.height} set={s('height')} /><Field id="ncd-waist" label="รอบเอว" unit="ซม." v={f.waist} set={s('waist')} /></div>
            {(bmi != null || f.waist) && <div className="flex flex-wrap gap-2 text-sm">{bmi != null && <Badge className={bmi >= 25 ? 'bg-orange-100 text-orange-800' : bmi >= 23 ? 'bg-yellow-100 text-yellow-800' : 'bg-emerald-100 text-emerald-800'}>BMI {bmi}</Badge>}{f.waist && <Badge className={waistOver(f.sex, f.waist) ? 'bg-orange-100 text-orange-800' : 'bg-emerald-100 text-emerald-800'}>รอบเอว{waistOver(f.sex, f.waist) ? 'เกินเกณฑ์' : 'ปกติ'} (เกณฑ์ {f.sex === 'M' ? '90' : '80'} ซม.)</Badge>}</div>}
            <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200"><div className="mb-2 text-sm font-semibold">ความดันโลหิต ครั้งที่ 1</div><div className="grid grid-cols-2 gap-3"><Field id="ncd-s1" label="ตัวบน (ซิสโตลิก)" unit="mmHg" v={f.sbp1} set={s('sbp1')} ph="120" /><Field id="ncd-d1" label="ตัวล่าง (ไดแอสโตลิก)" unit="mmHg" v={f.dbp1} set={s('dbp1')} ph="80" /></div></div>
            <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200"><div className="mb-2 text-sm font-semibold">ครั้งที่ 2 <span className="font-normal text-slate-500">(วัดซ้ำหลังพัก 5 นาที — แนะนำเมื่อค่าสูง)</span></div><div className="grid grid-cols-2 gap-3"><Field id="ncd-s2" label="ตัวบน" unit="mmHg" v={f.sbp2} set={s('sbp2')} /><Field id="ncd-d2" label="ตัวล่าง" unit="mmHg" v={f.dbp2} set={s('dbp2')} /></div></div>
            {bp && <div className={`rounded-2xl p-4 ring-1 ${bp.tone} ring-black/5`}><div className="text-xs opacity-80">ความดันเฉลี่ย</div><div className="text-3xl font-extrabold tabular-nums">{bp.sys}/{bp.dia}</div><div className="font-semibold">{bp.label}</div><div className="text-sm">{bp.action}</div>{bp.index >= 2 && !(f.sbp2 && f.dbp2) && <div className="mt-1 text-xs font-semibold">ค่าสูง — ควรวัดซ้ำครั้งที่ 2</div>}</div>}
          </>)}

          {step === 4 && (<>
            {ng && <div className={`rounded-2xl p-4 text-sm ring-1 ${ng.need ? 'bg-amber-50 text-amber-900 ring-amber-200' : 'bg-slate-100 text-slate-700 ring-slate-200'}`}><b>{ng.need ? 'ต้องเจาะน้ำตาลปลายนิ้ว' : 'ไม่จำเป็นต้องเจาะน้ำตาล'}</b><div className="mt-0.5">{ng.why}</div></div>}
            <Seg id="s-fast" label="สภาพการเจาะ" value={f.fasting} onChange={(v) => s('fasting')(v === '' ? true : v)} opts={[[true, 'อดอาหาร ≥ 8 ชม.'], [false, 'ไม่อดอาหาร']]} />
            <Field id="ncd-glu" label="น้ำตาลปลายนิ้ว (DTX)" unit="มก./ดล." v={f.glucose} set={s('glucose')} />
            {gl && <div className={`rounded-2xl p-4 ring-1 ring-black/5 ${gl.tone}`}><div className="text-xl font-bold">{gl.label}</div><div className="text-sm">{gl.action}</div><div className="mt-1 text-xs opacity-80">เกณฑ์ {f.fasting ? 'อดอาหาร: ปกติ <100 · เสี่ยง 100–125 · สงสัย ≥126' : 'ไม่อดอาหาร: ปกติ <140 · เสี่ยง 140–199 · สงสัย ≥200'}</div></div>}
            {needCvd(age) && <Field id="ncd-cvd" label="ความเสี่ยงโรคหัวใจและหลอดเลือด (CVD risk) อายุ 35–59 ปี" unit="%" v={f.cvdRisk} set={s('cvdRisk')} hint={cvd ? <Badge className={cvd.tone}>{cvd.label}</Badge> : <span className="text-slate-500">กรอก % ที่คำนวณจากโปรแกรม Thai CV risk (ถ้ามี)</span>} />}
            {needLipid(age) && <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200"><div className="mb-2 text-sm font-semibold">ไขมันในเลือด (อายุ 45–70 ปี ตรวจทุก 5 ปี · เว้นผู้ที่รักษาไขมันอยู่)</div><div className="grid grid-cols-2 gap-3"><Field id="ncd-tc" label="Total Cholesterol" unit="มก./ดล." v={f.tc} set={s('tc')} /><Field id="ncd-hdl" label="HDL" unit="มก./ดล." v={f.hdl} set={s('hdl')} /></div></div>}
          </>)}

          {step === 5 && (<>
            <div className={`rounded-3xl p-5 text-center shadow ring-1 ring-black/5 ${ov?.tone || 'bg-slate-100'}`}><div className="text-sm opacity-80">{f.name} · {age} ปี · {f.sex === 'M' ? 'ชาย' : 'หญิง'}</div><div className="mt-1 text-3xl font-extrabold">{ov?.label || '-'}</div></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200"><div className="text-xs text-slate-500">ความดัน</div><div className="text-xl font-bold tabular-nums">{bp ? `${bp.sys}/${bp.dia}` : '-'}</div>{bp && <Badge className={bp.tone}>{bp.label}</Badge>}</div>
              <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200"><div className="text-xs text-slate-500">น้ำตาล ({f.fasting ? 'อด' : 'ไม่อด'})</div><div className="text-xl font-bold tabular-nums">{f.glucose || '-'}</div>{gl ? <Badge className={gl.tone}>{gl.label}</Badge> : <span className="text-xs text-slate-400">ไม่ได้เจาะ</span>}</div>
              <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200"><div className="text-xs text-slate-500">BMI</div><div className="text-xl font-bold tabular-nums">{bmi ?? '-'}</div></div>
              <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200"><div className="text-xs text-slate-500">รอบเอว</div><div className="text-xl font-bold tabular-nums">{f.waist || '-'}</div></div>
            </div>
            {fee && <div className={`rounded-2xl p-3 text-sm ring-1 ${fee.eligible ? 'bg-emerald-50 text-emerald-900 ring-emerald-200' : 'bg-slate-100 text-slate-700 ring-slate-200'}`}>{fee.eligible ? <><b>ครบรายการเบิก สปสช. ข้อ 20</b> — เจ้าหน้าที่คีย์ค่าบริการ 12001 (100 บาท) และ Specialpp {ppCodes(f).join(', ')} ใน JHCIS เอง (แอปไม่คีย์ให้อัตโนมัติ)</> : <>{fee.note || <>ยังไม่ครบรายการเบิก: ขาด {fee.missing.join(', ')}</>}</>}</div>}
            {(!!metabolicRisks(f).length || !!lifestyleRisks(f).length || !!mentalRisks(f).length) && <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200 text-sm"><div className="mb-1 font-semibold">ปัจจัยเสี่ยงที่พบ</div><div className="flex flex-wrap gap-1.5">{riskFactors(f).map((x) => <Badge key={x} className="bg-amber-100 text-amber-800">{x}</Badge>)}</div></div>}
            <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-emerald-200"><div className="mb-1 font-semibold">คำแนะนำเบื้องต้น</div><ul className="list-disc space-y-1 pl-5">{adv.map((a) => <li key={a}>{a}</li>)}</ul></div>
            {init?.authen?.status ? <div className="rounded-2xl bg-slate-100 p-3 text-sm text-slate-700 ring-1 ring-slate-200">สถานะขอเปิดสิทธิ์ Authen: <b>{{ requested: 'รอเจ้าหน้าที่เปิดสิทธิ์', opened: 'เปิดสิทธิ์แล้ว', cancelled: 'ยกเลิกคำขอ' }[init.authen.status] || init.authen.status}</b></div> : (
              <div className="space-y-2 rounded-2xl bg-sky-50 p-3 ring-1 ring-sky-200">
                <div className="text-sm font-semibold text-sky-900">ขอเปิดสิทธิ์การรับบริการ (Authen)</div>
                <Toggle id="ncd-authen" label="ผู้รับบริการรับบริการจริงครั้งนี้ ขอให้เจ้าหน้าที่เปิดสิทธิ์" v={f.authenReq} set={(v) => setF((p) => ({ ...p, authenReq: v, authenConsent: v ? p.authenConsent : false }))} />
                {f.authenReq && (<>
                  <Toggle id="ncd-authen-ok" label="ผู้รับบริการอยู่ด้วยและยินยอมให้ยืนยันตัวตน (Authen) ด้วยเลขบัตรและเบอร์โทรนี้" v={f.authenConsent} set={s('authenConsent')} />
                  <p className="text-xs text-sky-900">ระบบแค่ส่งคำขอเข้าคิว เจ้าหน้าที่ รพ.สต. จะเป็นผู้เปิดสิทธิ์ใน QM smart เอง ต้องมีเลขบัตร 13 หลักและเบอร์โทร (ขั้นที่ 1)</p>
                </>)}
              </div>
            )}
            <div><label htmlFor="ncd-note" className="mb-1 block text-sm font-medium">หมายเหตุ</label><textarea id="ncd-note" rows={2} className="input" value={f.note} onChange={(e) => s('note')(e.target.value)} /></div>
          </>)}
          {err && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200" role="alert">{err}</div>}
        </div>
      </main>

      <footer className="border-t bg-white px-4 py-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom, 0px))' }}>
        <div className="mx-auto flex max-w-xl gap-3">
          <button type="button" className="btn btn-outline !h-12" onClick={() => { setErr(''); step ? setStep(step - 1) : onClose(); }}>{step ? <><ArrowLeft className="h-4 w-4" /> ย้อนกลับ</> : 'ยกเลิก'}</button>
          {step < STEPS.length - 1
            ? <button type="button" className="btn btn-primary !h-12 flex-1" onClick={next}>ถัดไป <ArrowRight className="h-4 w-4" /></button>
            : <button type="button" className="btn btn-primary !h-12 flex-1" onClick={save} disabled={busy}>{busy ? 'กำลังบันทึก...' : <><Check className="h-5 w-5" /> บันทึกผลคัดกรอง</>}</button>}
        </div>
      </footer>
    </div>
  );
}
