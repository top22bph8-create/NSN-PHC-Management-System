import { useState } from 'react';
import { Link } from 'react-router-dom';

// ลิงก์งานบนการ์ด: href = เว็บภายนอก (แท็บใหม่) / protocol = โปรแกรมในเครื่องผ่านตัวช่วย (jhcis://) /
// copyText = สำรอง (คัดลอกที่อยู่ไฟล์) / path = หน้าในระบบ
export default function MenuLink({ item, className, children }) {
  const [panel, setPanel] = useState(false);
  if (item.protocol) {
    const open = () => {
      const a = document.createElement('a');
      a.href = item.protocol;
      document.body.appendChild(a); a.click(); a.remove();
      setPanel(true);
      setTimeout(() => setPanel(false), 15000);
    };
    const copy = () => navigator.clipboard?.writeText(item.copyText).catch(() => {});
    return (
      <>
        <button type="button" onClick={open} className={`${className} w-full text-left`}>{children}</button>
        {panel && (
          <div role="status" className="fixed bottom-20 left-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 rounded-xl bg-slate-800 p-4 text-sm text-white shadow-xl lg:bottom-6">
            <p className="font-semibold">กำลังเปิดโปรแกรม…</p>
            <p className="mt-1 text-slate-200">ถ้าเบราว์เซอร์ถามว่าเปิดแอปหรือไม่ ให้กด “เปิด” (ติ๊ก “อนุญาตเสมอ” จะไม่ถามอีก)</p>
            <p className="mt-2 text-slate-200">ถ้าไม่มีอะไรเกิดขึ้น แปลว่ายังไม่ได้ติดตั้งตัวช่วย (ทำครั้งเดียวต่อเครื่อง):</p>
            <a className="mt-1 inline-block font-semibold text-sky-300 underline" href={`${import.meta.env.BASE_URL}jhcis-setup.reg`} download>ดาวน์โหลดตัวช่วยติดตั้ง (jhcis-setup.reg)</a>
            <span className="text-slate-300"> → ดับเบิลคลิกไฟล์ → กด “ใช่/Yes”</span>
            <button type="button" className="mt-2 block text-xs text-slate-300 underline" onClick={copy}>หรือคัดลอกที่อยู่ไฟล์ไปเปิดเอง</button>
          </div>
        )}
      </>
    );
  }
  if (item.href) return <a href={item.href} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>;
  return <Link to={item.path} className={className}>{children}</Link>;
}
