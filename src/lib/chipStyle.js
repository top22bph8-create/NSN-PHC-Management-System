// สีชิปหมู่บ้าน (แต่ละหมู่สีต่างกัน เลือกแล้วทึบ+ขอบเงา+เครื่องหมายถูก) และสีปุ่มส่งออก Excel / PDF
// เขียนชื่อคลาสเต็มเพื่อให้ Tailwind สร้างให้
const P = [
  ['border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100', 'border-sky-600 bg-gradient-to-br from-sky-500 to-sky-700 text-white shadow-md shadow-sky-300 ring-2 ring-sky-300'],
  ['border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100', 'border-emerald-600 bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-md shadow-emerald-300 ring-2 ring-emerald-300'],
  ['border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100', 'border-violet-600 bg-gradient-to-br from-violet-500 to-violet-700 text-white shadow-md shadow-violet-300 ring-2 ring-violet-300'],
  ['border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100', 'border-amber-600 bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md shadow-amber-300 ring-2 ring-amber-300'],
  ['border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100', 'border-rose-600 bg-gradient-to-br from-rose-500 to-rose-700 text-white shadow-md shadow-rose-300 ring-2 ring-rose-300'],
  ['border-teal-300 bg-teal-50 text-teal-800 hover:bg-teal-100', 'border-teal-600 bg-gradient-to-br from-teal-500 to-teal-700 text-white shadow-md shadow-teal-300 ring-2 ring-teal-300'],
  ['border-fuchsia-300 bg-fuchsia-50 text-fuchsia-800 hover:bg-fuchsia-100', 'border-fuchsia-600 bg-gradient-to-br from-fuchsia-500 to-fuchsia-700 text-white shadow-md shadow-fuchsia-300 ring-2 ring-fuchsia-300'],
  ['border-indigo-300 bg-indigo-50 text-indigo-800 hover:bg-indigo-100', 'border-indigo-600 bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-md shadow-indigo-300 ring-2 ring-indigo-300'],
];
const ALL = ['border-slate-300 bg-white text-slate-700 hover:bg-slate-100', 'border-slate-700 bg-gradient-to-br from-slate-600 to-slate-800 text-white shadow-md shadow-slate-300 ring-2 ring-slate-300'];
const NONE = ['border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100', 'border-slate-600 bg-slate-600 text-white shadow-md ring-2 ring-slate-300'];
const BASE = 'inline-flex items-center gap-1 rounded-full border-2 px-3 py-1 text-sm font-semibold transition-all';
// no: เลขหมู่ ('' = ทุกหมู่), on: เลือกอยู่หรือไม่
export const chipCls = (no, on) => { const n = Number(no); const c = no === '' || no == null ? ALL : n > 0 ? P[(n - 1) % P.length] : NONE; return `${BASE} ${on ? `${c[1]} scale-105` : c[0]}`; };
export const BTN_XLSX = 'inline-flex items-center gap-1.5 rounded-lg border border-emerald-700 bg-gradient-to-br from-emerald-500 to-emerald-700 px-3 py-2 text-sm font-semibold text-white shadow-sm shadow-emerald-200 transition hover:brightness-110 active:scale-95';
export const BTN_PDF = 'inline-flex items-center gap-1.5 rounded-lg border border-rose-700 bg-gradient-to-br from-rose-500 to-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm shadow-rose-200 transition hover:brightness-110 active:scale-95';
