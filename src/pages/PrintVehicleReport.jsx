import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { REGISTRIES } from '../config/registries';
import { fmtDate } from '../lib/thai';
import { asList, numberedText } from '../lib/vehicleConfig';
import { ORG_SHORT, ORG_UNDER } from '../config/brand';
import Logo from '../components/Logo';

// หน้าพิมพ์รายงานผู้บริหาร — สรุปการใช้ยานพาหนะราชการตามช่วงวันที่/ตัวกรองที่เลือกไว้ในหน้ารายงาน (VehicleReport.jsx)
// ใช้ฟังก์ชัน "พิมพ์" ของเบราว์เซอร์ -> เลือก "บันทึกเป็น PDF" เพื่อได้ไฟล์ PDF ตามแบบฉบับหน้าพิมพ์อื่นๆ ของระบบ
export default function PrintVehicleReport() {
  const cfg = REGISTRIES.vehicle;
  const [params] = useSearchParams();
  const from = params.get('from') || '';
  const to = params.get('to') || '';
  const plate = params.get('plate') || '';
  const missionType = params.get('missionType') || '';
  const driver = params.get('driver') || '';
  const [rows, setRows] = useState(null);

  useEffect(() => {
    if (!from || !to) return;
    getDocs(query(collection(db, 'vehicle'), where('useDate', '>=', from), where('useDate', '<=', to), orderBy('useDate', 'desc')))
      .then((s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch(() => setRows([]));
  }, [from, to]);

  const filtered = useMemo(() => (rows || []).filter((r) =>
    (!plate || r.plate === plate)
    && (!missionType || asList(r.missionType).includes(missionType))
    && (!driver || r.driver === driver)), [rows, plate, missionType, driver]);

  const stats = useMemo(() => {
    const travelled = filtered.filter((r) => ['กำลังใช้งาน', 'เสร็จสิ้น'].includes(r.status));
    const distanceEntries = filtered.filter((r) => r.status === 'เสร็จสิ้น' && String(r.distance || '').trim() !== '');
    const totalDistance = distanceEntries.reduce((s, r) => s + (Number(r.distance) || 0), 0);
    const pending = filtered.filter((r) => r.status === 'รออนุมัติ');
    const notEnded = filtered.filter((r) => r.status === 'กำลังใช้งาน');
    return { travelled, totalDistance, distanceEntries, pending, notEnded };
  }, [filtered]);

  useEffect(() => {
    if (rows) setTimeout(() => window.print(), 400);
  }, [rows]);

  const color = `#${cfg.reportColor || '4FA8E0'}`;

  return (
    <div className="mx-auto max-w-[1100px] bg-white p-6 print:p-0">
      <div className="mb-1 flex items-center justify-end gap-2 print:hidden">
        <button className="btn btn-outline" onClick={() => window.close()}>ปิดหน้านี้</button>
        <button className="btn btn-primary" onClick={() => window.print()}>พิมพ์ / บันทึกเป็น PDF</button>
      </div>
      <div className="mb-3 flex items-center gap-3 border-2 rounded-lg overflow-hidden" style={{ borderColor: color }}>
        <div className="flex items-center gap-3 px-3 py-2" style={{ background: color, width: '100%' }}>
          <Logo size={40} />
          <div className="flex-1 text-center text-white">
            <div className="text-lg font-bold">รายงานผู้บริหาร — ระบบขออนุญาตใช้ยานพาหนะราชการ</div>
            <div className="text-sm">{ORG_SHORT} · {ORG_UNDER} · {fmtDate(from)} ถึง {fmtDate(to)}</div>
          </div>
        </div>
      </div>

      {rows === null ? (
        <p className="p-6 text-center text-slate-500">กำลังโหลดข้อมูล...</p>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-4 gap-2 text-center text-sm">
            <div className="rounded border border-slate-300 p-2"><div className="text-slate-500">จำนวนคำขอ</div><div className="text-lg font-bold">{filtered.length}</div></div>
            <div className="rounded border border-slate-300 p-2"><div className="text-slate-500">เดินทางจริง</div><div className="text-lg font-bold">{stats.travelled.length}</div></div>
            <div className="rounded border border-slate-300 p-2"><div className="text-slate-500">ระยะทางรวม (กม.)</div><div className="text-lg font-bold">{stats.totalDistance.toLocaleString('th-TH')}</div></div>
            <div className="rounded border border-slate-300 p-2"><div className="text-slate-500">รออนุมัติ / ค้างเดินทาง</div><div className="text-lg font-bold">{stats.pending.length} / {stats.notEnded.length}</div></div>
          </div>
          <p className="mb-2 text-xs text-slate-400">* ระยะทางรวมคำนวณจากเลขไมล์จริงของเที่ยวที่บันทึก "เสร็จสิ้น" แล้วเท่านั้น ({stats.distanceEntries.length} เที่ยว) ไม่มีตัวเลขประมาณการปนอยู่</p>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {['เลขที่', 'วันที่', 'ผู้ขอใช้รถ', 'ยานพาหนะ', 'ผู้ขับรถ', 'ภารกิจ', 'ปลายทาง', 'สถานะ', 'ระยะทาง (กม.)'].map((l) => (
                  <th key={l} className="border border-slate-400 px-2 py-1.5 font-semibold" style={{ background: '#e8f4fc' }}>{l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="border border-slate-400 p-4 text-center text-slate-400">ไม่มีข้อมูลตามเงื่อนไขที่เลือก</td></tr>
              ) : filtered.map((r) => (
                <tr key={r.id}>
                  <td className="border border-slate-300 px-2 py-1 align-top">{r.tripNo}</td>
                  <td className="border border-slate-300 px-2 py-1 align-top">{fmtDate(r.useDate)}</td>
                  <td className="border border-slate-300 px-2 py-1 align-top">{r.requester}</td>
                  <td className="border border-slate-300 px-2 py-1 align-top">{r.plate}</td>
                  <td className="border border-slate-300 px-2 py-1 align-top">{r.driver || '-'}</td>
                  <td className="whitespace-pre-line border border-slate-300 px-2 py-1 align-top">{numberedText(r.missionType) || '-'}</td>
                  <td className="border border-slate-300 px-2 py-1 align-top">{r.destination || '-'}</td>
                  <td className="border border-slate-300 px-2 py-1 align-top">{r.status}</td>
                  <td className="border border-slate-300 px-2 py-1 align-top">{r.distance || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p className="mt-4 text-xs text-slate-400 print:mt-8">พิมพ์จากระบบ NSN-PHC Management System เมื่อวันที่ {new Date().toLocaleDateString('th-TH', { dateStyle: 'long' })}</p>
    </div>
  );
}
