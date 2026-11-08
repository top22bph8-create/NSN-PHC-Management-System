// แบบประเมินความพึงพอใจสำหรับประชาชน (ไม่ต้องล็อกอิน) — เปิดจาก QR Code ที่ #/satisfaction
// ไม่เก็บชื่อ-นามสกุลหรือเลขบัตรประชาชน; บันทึกวัน-เวลาจากเซิร์ฟเวอร์อัตโนมัติ; ตรวจข้อมูลซ้ำอีกชั้นที่ Firestore Rules
import { useEffect, useMemo, useRef, useState } from 'react';
import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { CheckCircle2, Loader2, RotateCcw, Send } from 'lucide-react';
import { db } from '../../firebase';
import Logo from '../../components/Logo';
import { COMMENTS, DEFAULT_SERVICES, OTHER_VILLAGE, QUESTIONS, SCALE, QK } from './surveyLib';

const LOCK = 'nsn-survey-last';
const blank = () => ({ service: '', village: '', good: '', improve: '', other: '', ...Object.fromEntries(QK.map((k) => [k, 0])) });
const fmtNow = () => new Date().toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Bangkok' });

export default function SurveyPublic() {
  const [cfg, setCfg] = useState(null); const [f, setF] = useState(blank()); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false); const [err, setErr] = useState('');
  const hp = useRef(''); const qref = useRef({});
  useEffect(() => { getDoc(doc(db, 'satisfactionConfig', 'main')).then((s) => setCfg(s.exists() ? s.data() : {})).catch(() => setCfg({})); }, []);
  const services = cfg?.services?.length ? cfg.services : DEFAULT_SERVICES;
  const villages = useMemo(() => [...(cfg?.villages || []), OTHER_VILLAGE], [cfg]);
  const answered = QK.filter((k) => f[k] > 0).length;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const missing = QUESTIONS.find((q) => !f[q.k]);
  const ready = f.service && f.village && !missing;

  const submit = async (e) => {
    e.preventDefault(); if (busy) return; setErr('');
    if (!f.service) return setErr('กรุณาเลือกประเภทบริการ');
    if (!f.village) return setErr('กรุณาเลือกหมู่บ้าน');
    if (missing) { setErr(`กรุณาตอบทุกข้อ — ยังไม่ได้ตอบข้อ ${QUESTIONS.indexOf(missing) + 1}`); qref.current[missing.k]?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    try { const last = Number(localStorage.getItem(LOCK) || 0); if (Date.now() - last < 20000 && !window.confirm('เพิ่งส่งแบบประเมินจากเครื่องนี้ไปเมื่อสักครู่ ต้องการส่งอีกครั้งใช่หรือไม่?')) return; } catch { /* ไม่มี localStorage ก็ข้ามได้ */ }
    if (hp.current) { setDone(true); return; } // ช่องดักบอท: คนจริงมองไม่เห็นและไม่กรอก
    setBusy(true);
    try {
      const data = { service: f.service, village: f.village, ...Object.fromEntries(QK.map((k) => [k, f[k]])), createdAt: serverTimestamp() };
      COMMENTS.forEach(([k]) => { const t = String(f[k] || '').trim().slice(0, 1000); if (t) data[k] = t; });
      await Promise.race([addDoc(collection(db, 'satisfactionResponses'), data), new Promise((_, rej) => setTimeout(() => rej({ code: 'timeout' }), 25000))]);
      try { localStorage.setItem(LOCK, String(Date.now())); } catch { /* ignore */ }
      setDone(true); window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (ex) { setErr(ex.code === 'permission-denied' ? 'ไม่สามารถบันทึกได้ในขณะนี้ กรุณาแจ้งเจ้าหน้าที่' : ex.code === 'timeout' ? 'การเชื่อมต่ออินเทอร์เน็ตช้า ยังไม่ทราบผลการบันทึก — กรุณารอสักครู่แล้วลองส่งอีกครั้ง' : 'บันทึกไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง'); } finally { setBusy(false); }
  };
  const reset = () => { if (!window.confirm('ล้างข้อมูลที่กรอกทั้งหมดใช่หรือไม่?')) return; setF(blank()); setErr(''); };

  const shell = (children) => (
    <div className="min-h-dvh bg-gradient-to-b from-sky-100 via-white to-emerald-50 text-slate-800">
      <div className="mx-auto max-w-xl px-4 pb-16 pt-5 text-[17px]">{children}</div>
    </div>);
  if (!cfg) return shell(<p className="py-20 text-center text-slate-500"><Loader2 className="mr-2 inline h-5 w-5 animate-spin" />กำลังโหลดแบบประเมิน…</p>);
  if (cfg.open === false) return shell(<div className="rounded-2xl bg-white p-6 text-center shadow"><Logo size={72} className="mx-auto" /><p className="mt-3 text-lg font-bold">ขณะนี้ปิดรับแบบประเมินชั่วคราว</p><p className="text-slate-600">ขออภัยในความไม่สะดวก</p></div>);
  if (done) return shell(
    <div className="rounded-3xl bg-white p-7 text-center shadow-lg ring-1 ring-emerald-200">
      <CheckCircle2 className="mx-auto h-20 w-20 text-emerald-500" />
      <h1 className="mt-3 text-2xl font-extrabold text-emerald-800">ขอบคุณสำหรับความคิดเห็นของท่าน</h1>
      <p className="mt-2 text-lg text-slate-700">รพ.สต.บ้านหนองสนม จะนำข้อเสนอแนะไปพัฒนาคุณภาพบริการให้ดียิ่งขึ้น</p>
      <p className="mt-3 text-sm text-slate-500">บันทึกข้อมูลเรียบร้อยแล้ว</p>
      <button className="mt-6 inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-3 text-base font-bold text-white" onClick={() => { setF(blank()); setDone(false); }}><RotateCcw className="h-4 w-4" /> ผู้รับบริการท่านอื่นประเมินต่อ</button>
    </div>);

  return shell(
    <form onSubmit={submit} noValidate>
      <header className="rounded-3xl bg-gradient-to-br from-sky-600 to-emerald-500 p-5 text-center text-white shadow-lg">
        <Logo size={76} className="mx-auto rounded-full bg-white p-1" />
        <p className="mt-2 text-lg font-bold">โรงพยาบาลส่งเสริมสุขภาพตำบลบ้านหนองสนม</p>
        <h1 className="mt-1 text-2xl font-extrabold">แบบประเมินความพึงพอใจในการรับบริการ</h1>
      </header>
      <p className="mt-4 rounded-2xl bg-white/80 p-4 text-base leading-relaxed text-slate-700 ring-1 ring-sky-100">ขอขอบคุณที่มารับบริการที่ รพ.สต.บ้านหนองสนม ความคิดเห็นของท่านมีคุณค่าและจะนำไปพัฒนาคุณภาพบริการให้ดียิ่งขึ้น แบบประเมินนี้<b>ไม่จำเป็นต้องระบุชื่อ</b></p>

      <div className="sticky top-0 z-10 -mx-4 mt-3 bg-white/90 px-4 py-2 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between text-sm font-semibold text-slate-600"><span>ตอบแล้ว {answered}/6 ข้อ</span><span>{ready ? '✅ พร้อมส่ง' : 'ตอบให้ครบทุกข้อ'}</span></div>
        <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-500 transition-all" style={{ width: `${(answered / 6) * 100}%` }} /></div>
      </div>

      <section className="mt-4 space-y-4 rounded-2xl bg-white p-4 shadow ring-1 ring-slate-100">
        <h2 className="text-lg font-extrabold text-sky-800">ข้อมูลทั่วไป</h2>
        <div>
          <p className="mb-2 font-bold">1. ประเภทบริการที่ท่านมารับ</p>
          <div className="grid gap-2">{services.map((s) => (
            <button type="button" key={s} onClick={() => set('service', s)} className={`rounded-xl border-2 px-4 py-3 text-left text-base font-semibold ${f.service === s ? 'border-sky-600 bg-sky-50 text-sky-900' : 'border-slate-200 bg-white text-slate-700'}`}>{f.service === s ? '🔵 ' : '⚪ '}{s}</button>))}</div>
        </div>
        <label className="block"><span className="mb-2 block font-bold">2. หมู่บ้านที่ท่านอาศัยอยู่</span>
          <select className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-3 text-base" value={f.village} onChange={(e) => set('village', e.target.value)}><option value="">— เลือกหมู่บ้าน —</option>{villages.map((v) => <option key={v}>{v}</option>)}</select></label>
        <p className="text-sm text-slate-500">3. วันที่รับบริการ: <b>{fmtNow()}</b> (บันทึกอัตโนมัติ) · ไม่เก็บชื่อ-นามสกุลหรือเลขบัตรประชาชน</p>
      </section>

      <section className="mt-4 space-y-4">
        <h2 className="px-1 text-lg font-extrabold text-sky-800">ความพึงพอใจของท่าน</h2>
        <p className="px-1 text-sm text-slate-600">แตะเลือกระดับความพึงพอใจ: 5 = มากที่สุด … 1 = น้อยที่สุด</p>
        {QUESTIONS.map((q, i) => (
          <div key={q.k} ref={(el) => { qref.current[q.k] = el; }} className={`rounded-2xl bg-white p-4 shadow ring-2 ${!f[q.k] && err && missing?.k === q.k ? 'ring-red-300' : 'ring-transparent'}`}>
            <p className="font-bold leading-snug">{i + 1}. {q.t}</p><p className="mb-3 text-sm text-slate-500">{q.hint}</p>
            <div className="grid grid-cols-5 gap-1.5">{SCALE.map((s) => (
              <button type="button" key={s.v} onClick={() => set(q.k, s.v)} aria-pressed={f[q.k] === s.v} aria-label={`${s.v} ${s.t}`}
                className="flex min-h-[86px] flex-col items-center justify-center rounded-xl border-2 px-0.5 py-2 text-center transition active:scale-95"
                style={f[q.k] === s.v ? { background: s.c, borderColor: s.c, color: '#fff' } : { borderColor: '#cbd5e1', background: '#fff', color: '#334155' }}>
                <span className="text-3xl leading-none">{s.e}</span><span className="mt-1 text-xl font-extrabold leading-none">{s.v}</span><span className="mt-0.5 text-[12px] font-semibold leading-tight">{s.t}</span>
              </button>))}</div>
          </div>))}
      </section>

      <section className="mt-4 space-y-3 rounded-2xl bg-white p-4 shadow ring-1 ring-slate-100">
        <h2 className="text-lg font-extrabold text-sky-800">ข้อเสนอแนะ <span className="text-sm font-normal text-slate-500">(ไม่บังคับ)</span></h2>
        {COMMENTS.map(([k, t]) => <label key={k} className="block"><span className="mb-1 block font-bold">{t}</span><textarea className="min-h-[84px] w-full rounded-xl border-2 border-slate-200 p-3 text-base" maxLength={1000} value={f[k]} onChange={(e) => set(k, e.target.value)} /></label>)}
        <input tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" onChange={(e) => { hp.current = e.target.value; }} />
      </section>

      {err && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 font-semibold text-red-700 ring-1 ring-red-200">{err}</p>}
      <div className="mt-4 grid grid-cols-[1fr_2fr] gap-3">
        <button type="button" onClick={reset} disabled={busy} className="rounded-2xl border-2 border-slate-300 bg-white py-4 text-base font-bold text-slate-600">ล้างข้อมูล</button>
        <button type="submit" disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-600 to-emerald-600 py-4 text-lg font-extrabold text-white shadow-lg disabled:opacity-60">
          {busy ? <><Loader2 className="h-5 w-5 animate-spin" /> กำลังบันทึก…</> : <><Send className="h-5 w-5" /> ส่งแบบประเมิน</>}</button>
      </div>
      <p className="mt-4 text-center text-xs text-slate-400">รพ.สต.บ้านหนองสนม · ข้อมูลของท่านเป็นความลับและใช้เพื่อพัฒนาบริการเท่านั้น</p>
    </form>);
}
