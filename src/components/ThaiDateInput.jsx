import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

// yearsBack/yearsForward: ช่วงปีให้เลือกในช้อย (ค่าเริ่มต้นเดิม -15/+5 ปีจากปีปัจจุบัน เหมาะกับวันลา/วันปฏิบัติงาน)
// ใช้ค่ากว้างขึ้นสำหรับวันเกิด/วันบรรจุราชการที่ย้อนหลังไปได้หลายสิบปี (ดูตัวอย่างการใช้งานที่ Personnel.jsx)
export default function ThaiDateInput({ id, value, onChange, required, min, max, className = '', placeholder = 'เลือกวันที่', yearsBack = 15, yearsForward = 5 }) {
  const [open, setOpen] = useState(false);
  const parsed = parseISO(value);
  const today = new Date();
  const [viewY, setViewY] = useState(parsed ? parsed.y : today.getFullYear());
  const [viewM, setViewM] = useState(parsed ? parsed.m : today.getMonth() + 1);
  const wrapRef = useRef(null);
  const popRef = useRef(null);
  // ตำแหน่งกล่องปฏิทิน (คำนวณเป็น fixed โดยอิงตำแหน่งจริงของปุ่มบนจอ แล้ว "วาดออกนอก" DOM เดิมด้วย portal ไปที่ document.body
  // แก้ปัญหาเดิม: เมื่อใช้ ThaiDateInput ในกล่องโต้ตอบ (Modal) ที่มี overflow ครอบไว้ (เช่นเมนูวันที่จ่ายเช็ค/วันที่ชำระภาษี
  // ในทะเบียนคุมฎีกาเบิกจ่าย) ปฏิทินแบบเดิมที่วางด้วย position:absolute อยู่ภายใน Modal จะถูกครอบตัด (clip) มองไม่เห็นบางส่วน
  // หรือเห็นไม่ครบ เปลี่ยนมาวาดนอกกล่องเสมอจึงไม่ถูกตัดอีกต่อไป ไม่ว่าจะใช้ที่ไหนในระบบ
  const [pos, setPos] = useState(null);

  useEffect(() => {
    const p = parseISO(value);
    if (p) { setViewY(p.y); setViewM(p.m); }
  }, [value]);

  const reposition = () => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const popWidth = 288; // w-72
    const popHeight = 360; // ประมาณความสูงกล่องปฏิทิน ใช้กะทิศทางเปิดขึ้น/ลง
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < popHeight && r.top > spaceBelow;
    let left = r.left;
    if (left + popWidth > window.innerWidth - 8) left = window.innerWidth - popWidth - 8;
    if (left < 8) left = 8;
    setPos({
      left,
      top: openUp ? undefined : r.bottom + 4,
      bottom: openUp ? window.innerHeight - r.top + 4 : undefined,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    // ต้องฟัง scroll แบบ capture เพื่อจับการเลื่อนของ container ภายใน (เช่นเนื้อหา Modal ที่เลื่อนได้) ไม่ใช่แค่หน้าเว็บหลัก
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target) && popRef.current && !popRef.current.contains(e.target)) setOpen(false);
    };
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
  for (let y = curCE - yearsBack; y <= curCE + yearsForward; y++) yearOptions.push(y);

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
      {open && pos && createPortal(
        <div
          ref={popRef}
          className="fixed z-[999] w-72 rounded-xl border border-brand-200 bg-white p-3 shadow-lg"
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom }}
        >
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
        </div>,
        document.body
      )}
    </div>
  );
}
