import { useState } from 'react';
import { Link } from 'react-router-dom';

// ลิงก์งานบนการ์ด: href = เว็บภายนอก (แท็บใหม่) / copyText = โปรแกรมในเครื่อง (เบราว์เซอร์เปิดไฟล์ในเครื่องโดยตรงไม่ได้ → คัดลอกที่อยู่ไฟล์ให้) / path = หน้าในระบบ
export default function MenuLink({ item, className, children }) {
  const [note, setNote] = useState('');
  if (item.copyText) {
    const copy = async () => {
      try { await navigator.clipboard.writeText(item.copyText); setNote('คัดลอกที่อยู่โปรแกรมแล้ว — กด Win+R วางแล้ว Enter เพื่อเปิด'); }
      catch { setNote(`เปิดไม่ได้จากเว็บ — ที่อยู่โปรแกรม: ${item.copyText}`); }
      setTimeout(() => setNote(''), 7000);
    };
    return (
      <>
        <button type="button" onClick={copy} className={`${className} w-full text-left`}>{children}</button>
        {note && <div role="status" className="fixed bottom-20 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-lg bg-slate-800 px-4 py-2 text-sm text-white shadow-lg lg:bottom-6">{note}</div>}
      </>
    );
  }
  if (item.href) return <a href={item.href} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>;
  return <Link to={item.path} className={className}>{children}</Link>;
}
