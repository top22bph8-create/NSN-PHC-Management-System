// หน้าคัดกรอง NCD สำหรับ อสม. (ไม่ต้องล็อกอิน) — เปิดจาก QR/ลิงก์ #/ncd-asm?k=รหัส ส่งผ่าน Cloud Function เท่านั้น
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, ClipboardPlus, Loader2, Search } from 'lucide-react';
import Logo from '../components/Logo';
import { ORG_SHORT, ORG_UNDER } from '../config/brand';
import { ncdAsmInfo, ncdAsmRoster, ncdAsmSubmit } from '../lib/ncdPublic';
import { ageFromBirth } from '../lib/ncdScreen';
import ScreenWizard from './ncd/ScreenWizard';

const KEY = 'ncdAsmName';
const getName = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
const putName = (v) => { try { localStorage.setItem(KEY, v); } catch { /* ไม่มี storage ก็ใช้งานต่อได้ */ } };

const GROUPS = [['M-15', 'ชาย 15–34 ปี', (a, x) => x === 'M' && a <= 34], ['F-15', 'หญิง 15–34 ปี', (a, x) => x === 'F' && a <= 34], ['M-35', 'ชาย 35–59 ปี', (a, x) => x === 'M' && a >= 35], ['F-35', 'หญิง 35–59 ปี', (a, x) => x === 'F' && a >= 35]];
const norm = (t) => String(t || '').replace(/\s+/g, '').toLowerCase();

// รายชื่อกลุ่มเป้าหมายของหมู่บ้าน (เฉพาะคนที่ยังไม่ได้คัดกรองปีงบนี้) แยกกลุ่มอายุ/เพศ + ค้นหาชื่อทันทีขณะพิมพ์
function Roster({ people, doneIds, onPick }) {
  const [g, setG] = useState(''); const [q, setQ] = useState('');
  const list = useMemo(() => people.filter((p) => !doneIds.has(p.id)).map((p) => ({ ...p, age: ageFromBirth(p.birth) })).filter((p) => p.age != null), [people, doneIds]);
  const counts = useMemo(() => Object.fromEntries(GROUPS.map(([k, , f]) => [k, list.filter((p) => f(p.age, p.sex)).length])), [list]);
  const shown = useMemo(() => {
    const fn = GROUPS.find(([k]) => k === g)?.[2]; const nq = norm(q);
    return list.filter((p) => (!fn || fn(p.age, p.sex)) && (!nq || norm(p.name).includes(nq))).sort((a, b) => a.name.localeCompare(b.name, 'th')).slice(0, 80);
  }, [list, g, q]);
  const total = list.filter((p) => { const fn = GROUPS.find(([k]) => k === g)?.[2]; const nq = norm(q); return (!fn || fn(p.age, p.sex)) && (!nq || norm(p.name).includes(nq)); }).length;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="เลือกกลุ่มอายุและเพศ">
        {GROUPS.map(([k, t]) => (
          <button type="button" key={k} aria-pressed={g === k} onClick={() => setG(g === k ? '' : k)}
            className={`min-h-14 rounded-xl border-2 px-2 text-sm font-semibold transition ${g === k ? 'border-rose-600 bg-rose-50 text-rose-800' : 'border-slate-200 bg-white text-slate-700'}`}>{t}<div className="text-xs font-normal opacity-70">ยังไม่คัดกรอง {counts[k]} คน</div></button>
        ))}
      </div>
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input aria-label="ค้นหาชื่อหรือนามสกุล" className="input !h-12 !pl-10" placeholder="พิมพ์ชื่อหรือนามสกุล เพื่อค้นหา" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" /></div>
      <div className="text-xs text-slate-500">พบ {total} คน{total > shown.length ? ` (แสดง ${shown.length} คนแรก — พิมพ์ชื่อเพื่อกรองเพิ่ม)` : ''}</div>
      <ul className="space-y-2">
        {shown.map((p) => (
          <li key={p.id}><button type="button" onClick={() => onPick(p)} className="flex min-h-16 w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-slate-200 active:bg-rose-50">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-bold ${p.sex === 'M' ? 'bg-sky-100 text-sky-700' : 'bg-pink-100 text-pink-700'}`}>{p.sex === 'M' ? 'ชาย' : 'หญิง'}</span>
            <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{p.name}</span><span className="block text-xs text-slate-500">อายุ {p.age} ปี · บ้านเลขที่ {p.hno || '-'} · {p.mask || 'ไม่มีเลขบัตร'}</span></span>
          </button></li>
        ))}
        {!shown.length && <li className="rounded-2xl bg-slate-100 p-4 text-center text-sm text-slate-500">{list.length ? 'ไม่พบรายชื่อตามเงื่อนไข' : 'ไม่มีรายชื่อที่ยังไม่ได้คัดกรองแล้ว (หรือยังไม่ได้ซิงก์รายชื่อ)'}</li>}
      </ul>
    </div>
  );
}

export default function NcdAsmPublic() {
  const [sp] = useSearchParams(); const k = sp.get('k') || ''; const v = sp.get('v') || '';
  const [roster, setRoster] = useState(null); const [pick, setPick] = useState(null); const [doneIds, setDoneIds] = useState(new Set());
  const [info, setInfo] = useState(null); const [err, setErr] = useState('');
  const [asm, setAsm] = useState(getName()); const [open, setOpen] = useState(false); const [count, setCount] = useState(0); const [last, setLast] = useState('');
  useEffect(() => { if (!k) { setErr('ไม่พบรหัสในลิงก์ กรุณาสแกน QR Code ใหม่'); return; } ncdAsmInfo({ k, v }).then(setInfo).catch((e) => setErr(e.message)); if (v) ncdAsmRoster({ k, v }).then(setRoster).catch((e) => setErr(e.message)); }, [k, v]);
  const submit = (data) => ncdAsmSubmit({ k, v, tid: pick?.id || '', asmName: asm, rec: data, hp: '' });
  const vName = info?.villages?.find((x) => x.no === v)?.name || '';
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col bg-slate-50">
      <div className="bg-gradient-to-r from-rose-600 to-red-500 px-4 py-5 text-center text-white">
        <div className="flex justify-center"><Logo size={64} /></div>
        <h1 className="mt-2 text-xl font-extrabold">คัดกรองกลุ่มเสี่ยง NCD</h1>
        <p className="text-sm opacity-90">เบาหวาน · ความดันโลหิตสูง</p>
        <p className="mt-1 text-xs opacity-80">{ORG_SHORT} {ORG_UNDER}</p>
      </div>
      <div className="flex-1 space-y-4 p-4">
        {!info && !err && <div className="flex justify-center py-10 text-slate-500"><Loader2 className="h-6 w-6 animate-spin" /></div>}
        {err && <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-200" role="alert">{err}</div>}
        {info && (<>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <label htmlFor="asm-name" className="mb-1 block text-sm font-medium">ชื่อ-สกุล อสม. ผู้คัดกรอง</label>
            <input id="asm-name" className="input !h-12" value={asm} onChange={(e) => { setAsm(e.target.value); putName(e.target.value); }} placeholder="เช่น นางสมศรี ใจดี" autoComplete="name" />
            <p className="mt-1 text-xs text-slate-500">จำชื่อไว้ในเครื่องนี้ ไม่ต้องกรอกซ้ำ</p>
          </div>
          {last && <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200" role="status"><CheckCircle2 className="h-5 w-5 shrink-0" />บันทึกผลของ <b>{last}</b> แล้ว · วันนี้ส่งแล้ว {count} ราย</div>}
          {v && <div className="rounded-2xl bg-rose-50 p-3 text-center text-sm font-semibold text-rose-800 ring-1 ring-rose-200">หมู่ที่ {v} {vName}{roster?.asOf ? <span className="block text-xs font-normal opacity-80">รายชื่อ ณ {roster.asOf}</span> : null}</div>}
          {v && !roster && <div className="flex justify-center py-6 text-slate-500"><Loader2 className="h-6 w-6 animate-spin" /></div>}
          {v && roster && asm.trim().length >= 2 && <Roster people={roster.people || []} doneIds={doneIds} onPick={(p) => { setPick(p); setOpen(true); }} />}
          {v && roster && asm.trim().length < 2 && <p className="text-center text-xs text-slate-500">กรอกชื่อ อสม. ก่อน เพื่อแสดงรายชื่อ</p>}
          <button type="button" className={`btn !h-14 w-full !text-lg ${v ? 'btn-outline' : 'btn-primary'}`} disabled={asm.trim().length < 2} onClick={() => { setPick(null); setOpen(true); }}><ClipboardPlus className="h-5 w-5" /> {v ? 'คนที่ไม่อยู่ในรายชื่อ (กรอกเอง)' : 'เริ่มคัดกรองรายใหม่'}</button>
          {asm.trim().length < 2 && <p className="text-center text-xs text-slate-500">กรอกชื่อ อสม. ก่อนเริ่มคัดกรอง</p>}
          <p className="text-center text-xs text-slate-400">ข้อมูลส่งถึงเจ้าหน้าที่ รพ.สต. เพื่อตรวจสอบ ไม่แสดงข้อมูลของผู้อื่น</p>
        </>)}
      </div>
      {open && info && <ScreenWizard key={pick?.id || 'new'} title="อสม. คัดกรอง" villages={info.villages} init={pick ? { name: pick.name, sex: pick.sex, birthDate: pick.birth, houseNo: pick.hno || '', villageNo: v } : v ? { villageNo: v } : undefined} lockedMask={pick ? (pick.mask || 'ไม่มีเลขบัตร') : ''} onSubmit={submit} onClose={() => setOpen(false)} onSaved={(d) => { if (pick) setDoneIds((x) => new Set(x).add(pick.id)); setOpen(false); setPick(null); setCount((c) => c + 1); setLast(d || 'ผู้รับการคัดกรอง'); }} />}
    </div>
  );
}
