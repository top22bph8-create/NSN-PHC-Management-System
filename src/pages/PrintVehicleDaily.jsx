import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { fmtDate } from '../lib/thai';
import { KM_STATUSES, hasKm, odoFrom, odoTo, missionLines, numberedText } from '../lib/vehicleConfig';
import { ORG_SHORT, ORG_UNDER } from '../config/brand';
import Logo from '../components/Logo';

// รายงานการเดินทางประจำวัน — รายการใช้ยานพาหนะของวันที่เลือก (เฉพาะที่ ผอ. อนุมัติแล้ว/กำลังใช้งาน/เสร็จสิ้น)
// ระยะทางครั้งนี้ = เลขไมล์ปัจจุบัน − เลขไมล์ครั้งก่อน (คำนวณตอนบันทึกคำขอ) ; รถจักรยานยนต์ไม่มีเลขไมล์
export default function PrintVehicleDaily() {
  const [params] = useSearchParams();
  const date = params.get('date') || '';
  const [rows, setRows] = useState(null);

  useEffect(() => {
    if (!date) return;
    getDocs(query(collection(db, 'vehicle'), where('useDate', '==', date)))
      .then((s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch(() => setRows([]));
  }, [date]);

  const list = useMemo(() => (rows || []).filter((r) => KM_STATUSES.includes(r.status))
    .sort((a, b) => String(a.wantDeparture || '').localeCompare(String(b.wantDeparture || '')) || String(a.tripNo).localeCompare(String(b.tripNo))), [rows]);
  const total = list.filter(hasKm).reduce((s, r) => s + (Number(r.distance) || 0), 0);
  const nKm = list.filter(hasKm).length;

  useEffect(() => { if (rows) setTimeout(() => window.print(), 400); }, [rows]);

  const th = 'border border-slate-500 px-1.5 py-1 font-semibold';
  const td = 'border border-slate-400 px-1.5 py-1 align-top';

  return (
    <div className="mx-auto max-w-[1100px] bg-white p-6 print:p-0" style={{ fontSize: '12pt' }}>
      <style>{'@page { size: A4 landscape; margin: 1cm; }'}</style>
      <div className="mb-2 flex items-center justify-end gap-2 print:hidden">
        <button className="btn btn-outline" onClick={() => window.close()}>ปิดหน้านี้</button>
        <button className="btn btn-primary" onClick={() => window.print()}>พิมพ์ / บันทึกเป็น PDF</button>
      </div>
      <div className="mb-3 flex items-center gap-3">
        <Logo size={48} />
        <div className="flex-1 text-center">
          <div className="text-xl font-bold">รายงานการเดินทางประจำวัน — การใช้ยานพาหนะราชการ</div>
          <div>{ORG_SHORT} · {ORG_UNDER}</div>
          <div className="font-semibold">ประจำวันที่ {fmtDate(date)}</div>
        </div>
      </div>

      {rows === null ? <p className="p-6 text-center text-slate-500">กำลังโหลดข้อมูล...</p> : (
        <>
          <table className="w-full border-collapse">
            <thead>
              <tr style={{ background: '#e8f4fc' }}>
                {['ที่', 'ผู้ขอใช้รถ/ผู้รับผิดชอบ', 'ยานพาหนะ', 'ผู้ขับรถ', 'ภารกิจ', 'ปลายทาง', 'ออก–กลับจริง', 'เลขไมล์ครั้งก่อน', 'เลขไมล์ปัจจุบัน', 'ระยะทางครั้งนี้ (กม.)'].map((l) => <th key={l} className={th}>{l}</th>)}
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={10} className="border border-slate-400 p-4 text-center text-slate-400">ไม่มีการใช้ยานพาหนะในวันนี้</td></tr>
              ) : list.map((r, i) => (
                <tr key={r.id}>
                  <td className={`${td} text-center`}>{i + 1}</td>
                  <td className={td}>{r.requester}{r.requesterPosition ? <div className="text-xs text-slate-500">{r.requesterPosition}</div> : null}</td>
                  <td className={td}>{r.plate}</td>
                  <td className={td}>{r.driver || '-'}</td>
                  <td className={`${td} whitespace-pre-line`}>{numberedText(missionLines(r)) || '-'}</td>
                  <td className={td}>{r.destination || '-'}</td>
                  <td className={`${td} text-center`}>{r.timeOut ? `${r.timeOut.slice(-5)} – ${r.timeIn ? r.timeIn.slice(-5) : '-'}` : (r.wantDeparture ? `${r.wantDeparture} (กำหนด)` : '-')}</td>
                  <td className={`${td} text-right`}>{odoFrom(r) ? Number(odoFrom(r)).toLocaleString('th-TH') : '-'}</td>
                  <td className={`${td} text-right`}>{odoTo(r) ? Number(odoTo(r)).toLocaleString('th-TH') : '-'}</td>
                  <td className={`${td} text-right font-semibold`}>{hasKm(r) ? Number(r.distance).toLocaleString('th-TH') : '-'}</td>
                </tr>
              ))}
              {list.length > 0 && (
                <tr style={{ background: '#f1f5f9' }}>
                  <td colSpan={9} className={`${td} text-right font-bold`}>รวมระยะทางที่ใช้รถยนต์วันนี้ ({nKm} รายการที่บันทึกเลขไมล์)</td>
                  <td className={`${td} text-right font-bold`}>{total.toLocaleString('th-TH')}</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="mt-1 text-xs text-slate-500">* ระยะทางครั้งนี้ = เลขไมล์ปัจจุบัน − เลขไมล์ครั้งก่อน ของรถคันเดียวกัน (รถจักรยานยนต์ไม่บันทึกเลขไมล์)</p>

          <div className="mt-10 grid grid-cols-2 text-center" style={{ breakInside: 'avoid' }}>
            <div>(ลงชื่อ) ........................................ ผู้รายงาน<div className="mt-1">( ........................................ )</div></div>
            <div>(ลงชื่อ) ........................................ ผู้อำนวยการ<div className="mt-1">( นายพงศกร  แป่มจำนัก )</div></div>
          </div>
        </>
      )}
      <p className="mt-4 text-xs text-slate-400">พิมพ์จากระบบ NSN-PHC Management System เมื่อวันที่ {new Date().toLocaleDateString('th-TH', { dateStyle: 'long' })}</p>
    </div>
  );
}
