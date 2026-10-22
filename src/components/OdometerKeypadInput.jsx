import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Delete, Gauge } from 'lucide-react';

// ช่องกรอก "เลขไมล์ปัจจุบัน" แบบแป้นตัวเลขใหญ่ (เหมือนช่องเวลา) — แตะช่องเพื่อเปิดแป้น กดตัวเลข กด "ตกลง" แล้วค่าไปอยู่ในช่อง
// ถ้าส่ง prev (เลขไมล์ครั้งก่อน) มาด้วย จะแสดงระยะทางครั้งนี้ (ปัจจุบัน − ครั้งก่อน) สดๆ ขณะกด และไม่ให้กดตกลงถ้าน้อยกว่าครั้งก่อน
const fmtN = (s) => (s === '' ? '–' : Number(s).toLocaleString('th-TH'));

export default function OdometerKeypadInput({ id, value, onChange, prev = null, placeholder = 'แตะเพื่อกรอกเลขไมล์' }) {
  const [open, setOpen] = useState(false);
  const [buf, setBuf] = useState('');

  const openPad = () => { setBuf(String(value || '').replace(/\D/g, '')); setOpen(true); };
  const press = (d) => setBuf((b) => (b.length >= 7 ? b : b === '' && d === '0' ? b : b + d));
  const cur = buf === '' ? null : Number(buf);
  const tooLow = cur !== null && prev !== null && cur < prev;
  const ok = cur !== null && !tooLow;
  const confirm = () => { if (!ok) return; onChange(String(cur)); setOpen(false); };

  return (
    <>
      <button id={id} type="button" onClick={openPad} className={`input flex w-full items-center justify-between text-left ${value ? '' : 'text-slate-400'}`}>
        <span>{value ? `${fmtN(value)} กม.` : placeholder}</span>
        <Gauge className="h-4 w-4 text-slate-400" />
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="กรอกเลขไมล์ปัจจุบัน" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-t-3xl bg-white p-4 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 rounded-2xl bg-brand-50 py-3 text-center">
              <div className="text-sm text-slate-500">เลขไมล์ปัจจุบัน (กม.)</div>
              <div className="text-5xl font-bold tracking-wide text-brand-800">{fmtN(buf)}</div>
              <div className="mt-1 text-sm text-slate-600">เลขไมล์ครั้งก่อน: <b>{prev !== null ? `${prev.toLocaleString('th-TH')} กม.` : 'ยังไม่มีข้อมูล'}</b></div>
              {prev !== null && cur !== null && (tooLow
                ? <div className="mt-1 text-sm font-medium text-red-600">เลขไมล์ต้องไม่น้อยกว่าครั้งก่อน</div>
                : <div className="mt-1 text-lg font-bold text-emerald-700">ระยะทางครั้งนี้ {(cur - prev).toLocaleString('th-TH')} กม.</div>)}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button key={d} type="button" className="h-16 rounded-2xl bg-slate-100 text-3xl font-semibold text-slate-800 active:bg-brand-200" onClick={() => press(d)}>{d}</button>
              ))}
              <button type="button" className="h-16 rounded-2xl bg-slate-100 text-base font-medium text-slate-600 active:bg-brand-200" onClick={() => setBuf('')}>ล้าง</button>
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
