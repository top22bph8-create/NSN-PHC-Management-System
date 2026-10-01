import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { thMonths } from '../lib/thai';

// ตัวเลือกวันที่แบบปฏิทินไทย (พ.ศ.) ทั้งหมด — ใช้แทน <input type="date"> ของเบราว์เซอร์ที่บังคับแสดงปฏิทิน ค.ศ.
// เก็บค่าจริงเป็นสตริง ISO (YYYY-MM-DD ปี ค.ศ.) เหมือนเดิมทุกประการ เพื่อให้เข้ากับ Firestore/ฟังก์ชันคำนวณปีงบประมาณที่มีอยู่
// เปลี่ยนแค่ "หน้าตา" ที่ผู้ใช้เห็นและเลือกให้เป็น พ.ศ. ล้วน ไม่กระทบข้อมูลที่บันทึกจริง
const pad = (n) => String(n).padStart(2, '0');
const toISO = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const parseISO = (s) => {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
};
const daysInMonth = (y, m) => new Date(y, m, 0).getDate();
const weekdays = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

export default function ThaiDateInput({ id, value, onChange, required, min, max, className = '', placeholder = 'เลือกวันที่' }) {
  const [open, setOpen] = useState(false);
  const parsed = parseISO(value);
  const today = new Date();
  const [viewY, setViewY] = useState(parsed ? parsed.y : today.getFullYear());
  const [viewM, setViewM] = useState(parsed ? parsed.m : today.getMonth() + 1);
  const wrapRef = useRef(null);

  useEffect(() => {
    const p = parseISO(value);
    if (p) { setViewY(p.y); setViewM(p.m); }
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const display = parsed ? `${pad(parsed.d)}/${pad(parsed.m)}/${parsed.y + 543}` : '';
  const minP = parseISO(min);
  const maxP = parseISO(max);

  const firstWeekday = new Date(viewY, viewM - 1, 1).getDay();
  const totalDays = daysInMonth(viewY, viewM);
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);

  const prevMonth = () => { if (viewM === 1) { setViewM(12); setViewY(viewY - 1); } else setViewM(viewM - 1); };
  const nextMonth = () => { if (viewM === 12) { setViewM(1); setViewY(viewY + 1); } else setViewM(viewM + 1); };

  const inRange = (d) => {
    const iso = toISO(viewY, viewM, d);
    if (min && iso < min) return false;
    if (max && iso > max) return false;
    return true;
  };

  const pick = (d) => { onChange(toISO(viewY, viewM, d)); setOpen(false); };

  // สำคัญ: viewY ต้องเป็นปี ค.ศ. เสมอ (ใช้คำนวณ new Date()/toISO() ตรงๆ) ตัวเลือกปีจึงสร้างจากปี ค.ศ. จริง
  // แล้วค่อย +543 เฉพาะตอนแสดงผลเป็นป้ายกำกับเท่านั้น ไม่ใช่เก็บเป็นค่า พ.ศ. ไว้ในตัวเลือกเอง (เดิมพลาดบวกซ้ำ 2 ครั้งทำให้ปีเพี้ยน)
  const curCE = today.getFullYear();
  const yearOptions = [];
  for (let y = curCE - 15; y <= curCE + 5; y++) yearOptions.push(y);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button" id={id} aria-required={required}
        className={`input flex items-center justify-between gap-2 text-left ${className}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={display ? '' : 'text-slate-400'}>{display || placeholder}</span>
        <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-72 rounded-xl border border-brand-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between gap-1.5">
            <button type="button" className="rounded-lg p-1.5 hover:bg-brand-50" onClick={prevMonth} aria-label="เดือนก่อนหน้า"><ChevronLeft className="h-4 w-4" /></button>
            <div className="flex items-center gap-1">
              <select className="rounded-lg border border-brand-200 px-1 py-1 text-sm" value={viewM} onChange={(e) => setViewM(Number(e.target.value))} aria-label="เดือน">
                {thMonths.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <select className="rounded-lg border border-brand-200 px-1 py-1 text-sm" value={viewY} onChange={(e) => setViewY(Number(e.target.value))} aria-label="ปี พ.ศ.">
                {yearOptions.map((y) => <option key={y} value={y}>{y + 543}</option>)}
              </select>
            </div>
            <button type="button" className="rounded-lg p-1.5 hover:bg-brand-50" onClick={nextMonth} aria-label="เดือนถัดไป"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs text-slate-500">
            {weekdays.map((w) => <div key={w}>{w}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-sm">
            {cells.map((d, i) => {
              if (d === null) return <div key={i} />;
              const selected = parsed && parsed.y === viewY && parsed.m === viewM && parsed.d === d;
              const ok = inRange(d);
              return (
                <button
                  type="button" key={i} disabled={!ok}
                  className={`rounded-lg py-1.5 transition ${selected ? 'bg-brand-600 font-bold text-white' : ok ? 'hover:bg-brand-100' : 'cursor-not-allowed text-slate-300'}`}
                  onClick={() => pick(d)}
                >{d}</button>
              );
            })}
          </div>
          <button
            type="button"
            className="mt-2 w-full rounded-lg py-1.5 text-center text-xs font-medium text-brand-700 hover:bg-brand-50"
            onClick={() => { const t = new Date(); onChange(toISO(t.getFullYear(), t.getMonth() + 1, t.getDate())); setOpen(false); }}
          >
            วันนี้ ({pad(today.getDate())}/{pad(today.getMonth() + 1)}/{curCE + 543})
          </button>
        </div>
      )}
    </div>
  );
}
