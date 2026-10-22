import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, Delete } from 'lucide-react';

// ช่องเลือกเวลาแบบ "แป้นตัวเลขใหญ่" ใช้ง่ายบนมือถือ — แตะช่องเพื่อเปิดแป้น กดตัวเลข 4 ตัว (เช่น 0830) ระบบจัดเป็นรูปแบบ HH:MM ให้
// พอกด "ตกลง" แป้นจะหุบลงและเวลาจะไปอยู่ในช่อง (เก็บค่าเป็นข้อความ "HH:MM" เวลา 24 ชั่วโมง)
// กันค่าผิดรูปแบบตั้งแต่ตอนกด: หลักชั่วโมงแรกเกิน 2 ระบบเติม 0 นำหน้าให้ (กด 8 = 08) ชั่วโมงเกิน 23 / นาทีหลักสิบเกิน 5 จะไม่รับตัวเลขนั้น
const pad2 = (n) => String(n).padStart(2, '0');
const nowDigits = () => { const d = new Date(); return `${pad2(d.getHours())}${pad2(d.getMinutes())}`; };

function fmt(buf) {
  const c = (buf + '----').slice(0, 4);
  return `${c.slice(0, 2)}:${c.slice(2)}`;
}

export default function TimeKeypadInput({ id, value, onChange, placeholder = 'แตะเพื่อเลือกเวลา', className = '' }) {
  const [open, setOpen] = useState(false);
  const [buf, setBuf] = useState('');

  const openPad = () => { setBuf(String(value || '').replace(/\D/g, '').slice(0, 4)); setOpen(true); };
  const press = (d) => setBuf((b) => {
    if (b.length >= 4) return b;
    if (b.length === 0 && Number(d) > 2) return `0${d}`;
    if (b.length === 1 && b[0] === '2' && Number(d) > 3) return b;
    if (b.length === 2 && Number(d) > 5) return b;
    return b + d;
  });
  const ok = buf.length === 4;
  const confirm = () => { if (!ok) return; onChange(`${buf.slice(0, 2)}:${buf.slice(2)}`); setOpen(false); };

  return (
    <>
      <button
        id={id} type="button" onClick={openPad}
        className={`input flex w-full items-center justify-between text-left ${value ? '' : 'text-slate-400'} ${className}`}
      >
        <span>{value ? `${value} น.` : placeholder}</span>
        <Clock className="h-4 w-4 text-slate-400" />
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="เลือกเวลา" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-t-3xl bg-white p-4 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 rounded-2xl bg-brand-50 py-4 text-center">
              <div className="text-5xl font-bold tracking-widest text-brand-800">{fmt(buf)}</div>
              <div className="mt-1 text-sm text-slate-500">เวลา 24 ชั่วโมง (เช่น 0830 = 08:30 น.)</div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button key={d} type="button" className="h-16 rounded-2xl bg-slate-100 text-3xl font-semibold text-slate-800 active:bg-brand-200" onClick={() => press(d)}>{d}</button>
              ))}
              <button type="button" className="h-16 rounded-2xl bg-slate-100 text-base font-medium text-slate-600 active:bg-brand-200" onClick={() => setBuf(nowDigits())}>ตอนนี้</button>
              <button type="button" className="h-16 rounded-2xl bg-slate-100 text-3xl font-semibold text-slate-800 active:bg-brand-200" onClick={() => press('0')}>0</button>
              <button type="button" aria-label="ลบตัวเลขล่าสุด" className="flex h-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 active:bg-brand-200" onClick={() => setBuf((b) => b.slice(0, -1))}><Delete className="h-7 w-7" /></button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" className="h-14 rounded-2xl border border-slate-300 text-lg text-slate-600" onClick={() => setOpen(false)}>ยกเลิก</button>
              <button type="button" disabled={!ok} className="h-14 rounded-2xl bg-brand-600 text-lg font-bold text-white disabled:opacity-40" onClick={confirm}>ตกลง</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
