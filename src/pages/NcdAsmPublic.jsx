// หน้าคัดกรอง NCD สำหรับ อสม. (ไม่ต้องล็อกอิน) — เปิดจาก QR/ลิงก์ #/ncd-asm?k=รหัส ส่งผ่าน Cloud Function เท่านั้น
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, ClipboardPlus, Loader2 } from 'lucide-react';
import Logo from '../components/Logo';
import { ORG_SHORT, ORG_UNDER } from '../config/brand';
import { ncdAsmInfo, ncdAsmSubmit } from '../lib/ncdPublic';
import ScreenWizard from './ncd/ScreenWizard';

const KEY = 'ncdAsmName';
const getName = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
const putName = (v) => { try { localStorage.setItem(KEY, v); } catch { /* ไม่มี storage ก็ใช้งานต่อได้ */ } };

export default function NcdAsmPublic() {
  const [sp] = useSearchParams(); const k = sp.get('k') || '';
  const [info, setInfo] = useState(null); const [err, setErr] = useState('');
  const [asm, setAsm] = useState(getName()); const [open, setOpen] = useState(false); const [count, setCount] = useState(0); const [last, setLast] = useState('');
  useEffect(() => { if (!k) { setErr('ไม่พบรหัสในลิงก์ กรุณาสแกน QR Code ใหม่'); return; } ncdAsmInfo({ k }).then(setInfo).catch((e) => setErr(e.message)); }, [k]);
  const submit = (data) => ncdAsmSubmit({ k, asmName: asm, rec: data, hp: '' });
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
          <button type="button" className="btn btn-primary !h-14 w-full !text-lg" disabled={asm.trim().length < 2} onClick={() => setOpen(true)}><ClipboardPlus className="h-5 w-5" /> เริ่มคัดกรองรายใหม่</button>
          {asm.trim().length < 2 && <p className="text-center text-xs text-slate-500">กรอกชื่อ อสม. ก่อนเริ่มคัดกรอง</p>}
          <p className="text-center text-xs text-slate-400">ข้อมูลส่งถึงเจ้าหน้าที่ รพ.สต. เพื่อตรวจสอบ ไม่แสดงข้อมูลของผู้อื่น</p>
        </>)}
      </div>
      {open && info && <ScreenWizard title="อสม. คัดกรอง" villages={info.villages} onSubmit={submit} onClose={() => setOpen(false)} onSaved={(d) => { setOpen(false); setCount((c) => c + 1); setLast(d || 'ผู้รับการคัดกรอง'); }} />}
    </div>
  );
}
