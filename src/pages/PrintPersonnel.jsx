// หน้าพิมพ์รายงาน "ทำเบียนประวัติบุคลากร" (ใช้ฟังก์ชัน "พิมพ์" ของเบราว์เซอร์ -> เลือก "บันทึกเป็น PDF" เพื่อได้ไฟล์ PDF)
// แนวนอน (landscape) เพราะคอลัมน์ข้อมูลเยอะ — ดึงข้อมูลจากคอลเล็กชัน users เหมือนหน้าทำเนียบบุคลากร (ไม่รวมบัญชีที่ยัง "รอสมัครใหม่")
import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { ORG_SHORT, ORG_UNDER } from '../config/brand';
import { fmtDate, calcDuration, fmtDuration } from '../lib/thai';
import { usernameOf } from '../lib/accounts';
import Logo from '../components/Logo';

export default function PrintPersonnel() {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    getDocs(collection(db, 'users')).then((s) => {
      const list = s.docs.map((d) => d.data()).filter((u) => u.role !== 'pending')
        .sort((a, b) => String(a.name || a.username || a.email).localeCompare(String(b.name || b.username || b.email), 'th', { numeric: true }));
      setRows(list);
    }).catch(() => setRows([]));
  }, []);

  useEffect(() => {
    if (rows) setTimeout(() => window.print(), 400);
  }, [rows]);

  return (
    <div className="mx-auto max-w-[1400px] bg-white p-6 text-sm print:p-0">
      <style>{`@page { size: A4 landscape; margin: 1.2cm; }`}</style>
      <div className="mb-1 flex items-center justify-end gap-2 print:hidden">
        <button className="btn btn-outline" onClick={() => window.close()}>ปิดหน้านี้</button>
        <button className="btn btn-primary" onClick={() => window.print()}>พิมพ์ / บันทึกเป็น PDF</button>
      </div>
      <div className="mb-3 flex items-center gap-3 overflow-hidden rounded-lg border-2" style={{ borderColor: '#4FA8E0' }}>
        <div className="flex w-full items-center gap-3 px-3 py-2" style={{ background: '#4FA8E0' }}>
          <Logo size={40} />
          <div className="flex-1 text-center text-white">
            <div className="text-lg font-bold">ทำเนียบบุคลากร · ประวัติบุคคลากรข้าราชการและลูกจ้างหน่วยงาน</div>
            <div className="text-sm">{ORG_SHORT} · {ORG_UNDER}</div>
          </div>
        </div>
      </div>
      {rows === null ? (
        <p className="p-6 text-center text-slate-500">กำลังโหลดข้อมูล...</p>
      ) : (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              {['ลำดับ', 'ชื่อ - สกุล', 'ตำแหน่ง', 'ประเภทบุคลากร', 'เลขบัตรประชาชน', 'เบอร์โทรศัพท์', 'วุฒิการศึกษา', 'วันเดือนปีเกิด', 'อายุ', 'วันมาปฏิบัติงาน', 'วันบรรจุเป็นข้าราชการ', 'อายุราชการ', 'ยกยอดลาพักผ่อนสะสม(วัน)'].map((h) => (
                <th key={h} className="border border-slate-400 px-1.5 py-1 font-semibold" style={{ background: '#e8f4fc' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={13} className="border border-slate-400 p-4 text-center text-slate-400">ไม่มีข้อมูลบุคลากร</td></tr>
            ) : rows.map((u, i) => (
              <tr key={u.email}>
                <td className="border border-slate-300 px-1.5 py-1 text-center">{i + 1}</td>
                <td className="border border-slate-300 px-1.5 py-1">{u.name || usernameOf(u.email)}</td>
                <td className="border border-slate-300 px-1.5 py-1">{u.position || ''}</td>
                <td className="border border-slate-300 px-1.5 py-1">{u.personnelType || ''}</td>
                <td className="border border-slate-300 px-1.5 py-1">{u.idCard || ''}</td>
                <td className="border border-slate-300 px-1.5 py-1">{u.phone || ''}</td>
                <td className="border border-slate-300 px-1.5 py-1">{u.education || ''}</td>
                <td className="border border-slate-300 px-1.5 py-1">{u.birthday ? fmtDate(u.birthday) : ''}</td>
                <td className="border border-slate-300 px-1.5 py-1">{u.birthday ? fmtDuration(calcDuration(u.birthday)) : ''}</td>
                <td className="border border-slate-300 px-1.5 py-1">{u.startWorkDate ? fmtDate(u.startWorkDate) : ''}</td>
                <td className="border border-slate-300 px-1.5 py-1">{u.civilServiceDate ? fmtDate(u.civilServiceDate) : ''}</td>
                <td className="border border-slate-300 px-1.5 py-1">{u.civilServiceDate ? fmtDuration(calcDuration(u.civilServiceDate)) : ''}</td>
                <td className="border border-slate-300 px-1.5 py-1 text-center">{u.vacationCarryOver || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-4 text-xs text-slate-400 print:mt-8">พิมพ์จากระบบ NSN-PHC Management System เมื่อวันที่ {new Date().toLocaleDateString('th-TH', { dateStyle: 'long' })}</p>
    </div>
  );
}
