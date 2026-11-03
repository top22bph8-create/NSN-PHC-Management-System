// หน้าจองคิวออนไลน์สำหรับประชาชน (ไม่ต้องล็อกอิน) — เปิดจาก QR Code / ลิงก์ที่ #/book-thai
// ข้อมูลทั้งหมดผ่าน Cloud Functions (thaiPublicInfo/thaiBook/thaiLookup/thaiCancel) ไม่อ่านข้อมูลผู้อื่นจากฐานข้อมูลโดยตรง
import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, CheckCircle2, Loader2, Phone, Search, XCircle } from 'lucide-react';
import Logo from '../components/Logo';
import { ORG_SHORT, ORG_UNDER } from '../config/brand';
import { THAI_CLINIC, thaiBook, thaiCancel, thaiLookup, thaiPhones, thaiPublicInfo, thaiTimeRange } from '../lib/thaiClinic';

const WD = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const dparts = (s) => { const [y, m, d] = s.split('-').map(Number); return { y, m, d, wd: new Date(y, m - 1, d).getDay() }; };
const longDate = (s) => { const p = dparts(s); return `วัน${['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'][p.wd]}ที่ ${p.d} ${MONTHS[p.m - 1]} ${p.y + 543}`; };

export default function ThaiBookingPublic() {
  const [info, setInfo] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [service, setService] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [f, setF] = useState({ name: '', phone: '', note: '', hp: '' });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const [look, setLook] = useState({ code: '', phone: '' });
  const [found, setFound] = useState(null);
  const [lookErr, setLookErr] = useState('');
  const [lookBusy, setLookBusy] = useState(false);

  const load = () => {
    setInfo(null); setLoadErr('');
    thaiPublicInfo().then(setInfo).catch((e) => setLoadErr(e.message));
  };
  useEffect(load, []);

  const day = useMemo(() => info?.days?.find((d) => d.date === date), [info, date]);
  const phoneOk = /^0\d{8,9}$/.test(f.phone.replace(/\D/g, ''));
  const canSubmit = service && date && time && f.name.trim().length >= 2 && phoneOk && agree && !busy;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true); setErr('');
    try {
      const r = await thaiBook({ service, date, time, name: f.name, phone: f.phone, note: f.note, hp: f.hp });
      setDone(r);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (ex) {
      setErr(ex.message);
      if (/เต็ม|ไม่เปิดให้จอง/.test(ex.message)) { setTime(''); load(); }
    } finally { setBusy(false); }
  };
  const doLookup = async (e) => {
    e.preventDefault(); setLookBusy(true); setLookErr(''); setFound(null);
    try { setFound(await thaiLookup(look)); } catch (ex) { setLookErr(ex.message); } finally { setLookBusy(false); }
  };
  const doCancel = async () => {
    if (!window.confirm('ยืนยันยกเลิกการจองนี้?')) return;
    setLookBusy(true);
    try { await thaiCancel(look); setFound({ ...found, status: 'ยกเลิก' }); load(); } catch (ex) { setLookErr(ex.message); } finally { setLookBusy(false); }
  };

  const cfg = info?.config || {};
  const provider = `${cfg.providerName || THAI_CLINIC.providerName} ${cfg.providerTitle || THAI_CLINIC.providerTitle}`;

  return (
    <div className="min-h-dvh bg-gradient-to-b from-emerald-50 via-white to-teal-50 pb-12">
      <header className="bg-gradient-to-r from-emerald-700 via-teal-600 to-emerald-500 px-4 pb-8 pt-6 text-white shadow-lg">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <Logo size={56} className="shrink-0 rounded-full bg-white/90 p-1" />
          <div className="min-w-0">
            <p className="text-xs text-white/85">{ORG_SHORT}</p>
            <h1 className="text-xl font-extrabold leading-tight sm:text-2xl">🌿 จองคิวคลินิกแพทย์แผนไทย</h1>
            <p className="text-xs text-white/85">{ORG_UNDER}</p>
          </div>
        </div>
        <div className="mx-auto mt-4 max-w-xl rounded-xl bg-white/15 p-3 text-sm backdrop-blur">
          <p>บริการโดย <b>{provider}</b></p>
          <div className="mt-1 space-y-0.5 font-semibold">
            {thaiPhones(cfg).map(([l, n]) => <a key={n} href={`tel:${n.replace(/\D/g, '')}`} className="flex items-center gap-1.5 underline"><Phone className="h-4 w-4" /> {l} {n}</a>)}
          </div>
        </div>
      </header>

      <main className="mx-auto -mt-4 max-w-xl space-y-4 px-4">
        {done ? (
          <section className="rounded-2xl bg-white p-5 text-center shadow-lg ring-1 ring-emerald-200">
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" />
            <h2 className="mt-2 text-xl font-bold text-emerald-800">จองคิวสำเร็จ</h2>
            <p className="text-sm text-slate-500">เจ้าหน้าที่จะรับทราบและอาจโทรยืนยันตามเบอร์ที่ให้ไว้</p>
            <div className="mx-auto mt-4 max-w-xs rounded-xl bg-emerald-50 p-4 text-left text-sm">
              <div className="text-xs text-slate-500">รหัสการจอง (จดหรือแคปหน้าจอไว้)</div>
              <div className="text-2xl font-extrabold tracking-wider text-emerald-800">{done.code}</div>
              <div className="mt-2">{longDate(done.date)}</div>
              <div>เวลา <b>{thaiTimeRange(done.time, done.timeEnd)} น.</b></div>
              <div>บริการ: {done.service}</div>
              <div>ชื่อ: {done.name}</div>
            </div>
            <p className="mt-3 text-xs text-slate-500">ถ้าติดธุระมาไม่ได้ กรุณายกเลิกด้วยรหัสการจอง + เบอร์โทร (ด้านล่างของหน้านี้) หรือโทร {thaiPhones(cfg).map((x) => x[1]).join(' / ')}</p>
            <button className="btn btn-outline mt-4" onClick={() => { setDone(null); setService(''); setDate(''); setTime(''); setF({ name: '', phone: '', note: '', hp: '' }); setAgree(false); load(); }}>จองคิวเพิ่ม</button>
          </section>
        ) : loadErr ? (
          <section className="rounded-2xl bg-white p-5 shadow-lg">
            <p className="text-red-700">{loadErr}</p>
            <button className="btn btn-outline mt-3" onClick={load}>ลองใหม่</button>
          </section>
        ) : !info ? (
          <section className="rounded-2xl bg-white p-8 text-center shadow-lg"><Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-600" /><p className="mt-2 text-sm text-slate-500">กำลังโหลดตารางคิว...</p></section>
        ) : !info.enabled ? (
          <section className="rounded-2xl bg-white p-5 text-center shadow-lg">
            <p className="font-semibold text-slate-700">ขณะนี้ปิดรับจองออนไลน์ชั่วคราว</p>
            <p className="text-sm text-slate-500">กรุณาโทรจองที่ {thaiPhones(cfg).map((x) => x[1]).join(' / ')}</p>
          </section>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {cfg.notice && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">📢 {cfg.notice}</p>}

            <section className="rounded-2xl bg-white p-4 shadow-lg">
              <h2 className="mb-2 font-bold text-slate-800"><span className="mr-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-sm text-white">1</span>เลือกบริการ</h2>
              <div className="flex flex-wrap gap-2">
                {(cfg.services || []).map((s) => (
                  <button type="button" key={s} onClick={() => setService(s)} aria-pressed={service === s}
                    className={`rounded-full px-3.5 py-2 text-sm font-medium transition ${service === s ? 'bg-emerald-600 text-white shadow' : 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200 hover:bg-emerald-100'}`}>{s}</button>
                ))}
              </div>
            </section>

            <section className="rounded-2xl bg-white p-4 shadow-lg">
              <h2 className="mb-2 font-bold text-slate-800"><span className="mr-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-sm text-white">2</span>เลือกวันที่</h2>
              {info.days.length === 0 ? <p className="text-sm text-slate-500">ขณะนี้ไม่มีคิวว่างในช่วงที่เปิดจอง กรุณาโทร {thaiPhones(cfg).map((x) => x[1]).join(' / ')}</p> : (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {info.days.map((d) => {
                    const p = dparts(d.date); const left = d.slots.reduce((n, x) => n + (x.left > 0 ? 1 : 0), 0);
                    return (
                      <button type="button" key={d.date} onClick={() => { setDate(d.date); setTime(''); }} aria-pressed={date === d.date}
                        className={`w-16 shrink-0 rounded-xl py-2 text-center transition ${date === d.date ? 'bg-emerald-600 text-white shadow' : 'bg-slate-50 ring-1 ring-slate-200 hover:bg-emerald-50'}`}>
                        <div className="text-xs">{WD[p.wd]}</div>
                        <div className="text-xl font-extrabold leading-none">{p.d}</div>
                        <div className="text-[11px]">{MONTHS[p.m - 1]}</div>
                        <div className={`mt-0.5 text-[10px] ${date === d.date ? 'text-white/90' : 'text-emerald-700'}`}>ว่าง {left}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {date && day && (
              <section className="rounded-2xl bg-white p-4 shadow-lg">
                <h2 className="mb-1 font-bold text-slate-800"><span className="mr-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-sm text-white">3</span>เลือกเวลา</h2>
                <p className="mb-2 text-xs text-slate-500">{longDate(date)} · เลือกช่วงเวลาที่ว่าง</p>
                <div className="grid grid-cols-2 gap-2">
                  {day.slots.map((s) => (
                    <button type="button" key={s.time} disabled={s.left <= 0} onClick={() => setTime(s.time)} aria-pressed={time === s.time}
                      className={`rounded-lg py-2 text-sm font-semibold transition ${s.left <= 0 ? 'cursor-not-allowed bg-slate-100 text-slate-300 line-through' : time === s.time ? 'bg-emerald-600 text-white shadow' : 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200 hover:bg-emerald-100'}`}>
                      {thaiTimeRange(s.time, s.end)} น.
                    </button>
                  ))}
                </div>
              </section>
            )}

            {time && (
              <section className="rounded-2xl bg-white p-4 shadow-lg">
                <h2 className="mb-2 font-bold text-slate-800"><span className="mr-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-sm text-white">4</span>ข้อมูลผู้รับบริการ</h2>
                <div className="space-y-3">
                  <div>
                    <label htmlFor="tb-name" className="mb-1 block text-sm font-medium text-slate-600">ชื่อ - สกุล <span className="text-red-600">*</span></label>
                    <input id="tb-name" className="input" autoComplete="name" maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="tb-phone" className="mb-1 block text-sm font-medium text-slate-600">เบอร์โทรศัพท์ <span className="text-red-600">*</span></label>
                    <input id="tb-phone" className="input" inputMode="tel" autoComplete="tel" maxLength={12} placeholder="เช่น 0812345678" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
                    {f.phone && !phoneOk && <p className="mt-1 text-xs text-red-600">เบอร์โทรต้องเป็นตัวเลข 9-10 หลัก ขึ้นต้นด้วย 0</p>}
                  </div>
                  <div>
                    <label htmlFor="tb-note" className="mb-1 block text-sm font-medium text-slate-600">อาการ / ข้อมูลเพิ่มเติม (ถ้ามี)</label>
                    <textarea id="tb-note" rows={2} className="input" maxLength={300} placeholder="เช่น ปวดหลัง ปวดเข่า" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
                  </div>
                  {/* ช่องล่อบอท: คนจริงมองไม่เห็นและไม่กรอก */}
                  <input tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" value={f.hp} onChange={(e) => setF({ ...f, hp: e.target.value })} />
                  <label className="flex items-start gap-2 text-xs text-slate-600">
                    <input type="checkbox" className="mt-0.5 h-4 w-4" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                    <span>ยินยอมให้ {ORG_SHORT} เก็บและใช้ชื่อ เบอร์โทร และข้อมูลที่กรอก เพื่อการนัดหมายและติดต่อกลับเท่านั้น (ตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล)</span>
                  </label>
                </div>
                {err && <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{err}</p>}
                <button type="submit" disabled={!canSubmit} className="btn mt-4 w-full bg-emerald-600 py-3 text-base font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CalendarCheck className="h-5 w-5" />} ยืนยันการจองคิว
                </button>
              </section>
            )}
          </form>
        )}

        <section className="rounded-2xl bg-white p-4 shadow">
          <h2 className="mb-2 flex items-center gap-1.5 font-bold text-slate-700"><Search className="h-4 w-4" /> ตรวจสอบ / ยกเลิกการจอง</h2>
          <form onSubmit={doLookup} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input className="input" placeholder="รหัสการจอง เช่น T123456" value={look.code} onChange={(e) => setLook({ ...look, code: e.target.value.toUpperCase() })} aria-label="รหัสการจอง" />
            <input className="input" inputMode="tel" placeholder="เบอร์โทรที่ใช้จอง" value={look.phone} onChange={(e) => setLook({ ...look, phone: e.target.value })} aria-label="เบอร์โทร" />
            <button className="btn btn-outline" disabled={lookBusy || !look.code || !look.phone}>{lookBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'ค้นหา'}</button>
          </form>
          {lookErr && <p className="mt-2 text-sm text-red-700">{lookErr}</p>}
          {found && (
            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
              <div><b>{found.code}</b> · {found.name}</div>
              <div>{longDate(found.date)} เวลา {thaiTimeRange(found.time, found.timeEnd)} น. · {found.service}</div>
              <div className="mt-1">สถานะ: <b>{found.status}</b></div>
              {['รอยืนยัน', 'ยืนยันแล้ว'].includes(found.status) && (
                <button className="btn mt-2 border border-red-300 bg-white text-red-700 hover:bg-red-50" onClick={doCancel} disabled={lookBusy}><XCircle className="h-4 w-4" /> ยกเลิกการจองนี้</button>
              )}
            </div>
          )}
        </section>
        <p className="text-center text-xs text-slate-400">{ORG_SHORT} · {ORG_UNDER}</p>
      </main>
    </div>
  );
}
