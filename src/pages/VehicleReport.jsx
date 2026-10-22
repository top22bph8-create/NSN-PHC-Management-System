import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { Download, FileSpreadsheet, Printer } from 'lucide-react';
import { db } from '../firebase';
import { asList, getDestinations, getMissionTypes, getVehicleFleet, listText, numberedText, missionLines, vehicleLabel } from '../lib/vehicleConfig';
import { exportXlsx } from '../lib/exportFile';
import { fmtDate, todayStr } from '../lib/thai';
import { Badge, EmptyState, ErrorState, Spinner } from '../components/ui';
import { PageHeader } from '../components/Logo';
import ThaiDateInput from '../components/ThaiDateInput';
import { REGISTRIES } from '../config/registries';
import { fetchAllCompletedTrips, mileageSummary } from '../lib/vehicleMileage';

const addDaysStr = (dateStr, days) => {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

// รายงานสำหรับผู้บริหาร (ระบบขออนุญาตใช้ยานพาหนะราชการ เฟส 5) — สรุปข้อมูลตามช่วงวันที่ขอใช้รถ พร้อมตัวกรองยานพาหนะ/ประเภทภารกิจ/ผู้ขับรถ
// ดึงข้อมูลตามช่วงวันที่จาก Firestore โดยตรง (ไม่ผูกกับปีงบประมาณ เพื่อให้เลือกช่วงข้ามปีงบได้) แล้วกรอง/สรุปผลที่ฝั่งเว็บอีกชั้น
export default function VehicleReport() {
  const cfg = REGISTRIES.vehicle;
  const [from, setFrom] = useState(addDaysStr(todayStr(), -30));
  const [to, setTo] = useState(todayStr());
  const [plateFilter, setPlateFilter] = useState('');
  const [missionFilter, setMissionFilter] = useState('');
  const [driverFilter, setDriverFilter] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [fleet, setFleet] = useState([]);
  const [missionTypes, setMissionTypes] = useState([]);

  useEffect(() => { getVehicleFleet().then(setFleet).catch(() => setFleet([])); }, []);
  useEffect(() => { getMissionTypes().then(setMissionTypes).catch(() => setMissionTypes([])); }, []);
  const [allDone, setAllDone] = useState([]);
  useEffect(() => { getDestinations().catch(() => {}); }, []);
  useEffect(() => { fetchAllCompletedTrips().then(setAllDone).catch(() => setAllDone([])); }, []);

  useEffect(() => {
    if (!from || !to) return;
    setRows(null); setError('');
    return onSnapshot(
      query(collection(db, 'vehicle'), where('useDate', '>=', from), where('useDate', '<=', to), orderBy('useDate', 'desc')),
      (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => setError(e.message),
    );
  }, [from, to]);

  const drivers = useMemo(() => [...new Set((rows || []).map((r) => r.driver).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th')), [rows]);

  const filtered = useMemo(() => (rows || []).filter((r) =>
    (!plateFilter || r.plate === plateFilter)
    && (!missionFilter || asList(r.missionType).includes(missionFilter))
    && (!driverFilter || r.driver === driverFilter)), [rows, plateFilter, missionFilter, driverFilter]);

  const mileage = useMemo(() => mileageSummary(fleet, allDone, filtered), [fleet, allDone, filtered]);

  const stats = useMemo(() => {
    const totalRequests = filtered.length;
    // "อนุมัติและเดินทางจริง" = เคยกดเริ่มเดินทางแล้ว (status กำลังใช้งาน/เสร็จสิ้น) ไม่ใช่แค่สถานะอนุมัติเฉยๆ ที่ยังไม่ได้ออกเดินทาง
    const travelled = filtered.filter((r) => ['กำลังใช้งาน', 'เสร็จสิ้น'].includes(r.status));
    // ระยะทางรวม: นับเฉพาะเที่ยวที่ "เสร็จสิ้น" แล้วและมีค่า distance ที่คำนวณจากเลขไมล์จริงบันทึกไว้เท่านั้น (ค่าที่บันทึกจริง ไม่ใช่ตัวเลขประมาณการ)
    // ไม่มีแนวคิด "ระยะทางประมาณการ" ในระบบนี้ จึงไม่แสดงตัวเลขอื่นใดปนมาเป็นระยะทางรวม
    const distanceEntries = filtered.filter((r) => r.status === 'เสร็จสิ้น' && String(r.distance || '').trim() !== '');
    const totalDistance = distanceEntries.reduce((s, r) => s + (Number(r.distance) || 0), 0);
    const pending = filtered.filter((r) => r.status === 'รออนุมัติ');
    const notEnded = filtered.filter((r) => r.status === 'กำลังใช้งาน');

    const byMission = {};
    filtered.forEach((r) => {
      // 1 เที่ยวเลือกได้หลายภารกิจ — นับเที่ยวนี้ให้ทุกภารกิจที่ติ๊กไว้ (ผลรวมแต่ละแถวจึงอาจมากกว่าจำนวนเที่ยวทั้งหมด) ส่วนระยะทางรวมของเที่ยวนั้นนับซ้ำในทุกภารกิจเช่นกัน ไม่แบ่งสัดส่วน
      const ms = asList(r.missionType);
      (ms.length ? ms : ['(ไม่ระบุ)']).forEach((k) => {
        byMission[k] = byMission[k] || { count: 0, distance: 0 };
        byMission[k].count += 1;
        if (r.status === 'เสร็จสิ้น' && String(r.distance || '').trim() !== '') byMission[k].distance += Number(r.distance) || 0;
      });
    });
    const byDestination = {};
    filtered.forEach((r) => {
      const k = r.destination || '(ไม่ระบุ)';
      byDestination[k] = (byDestination[k] || 0) + 1;
    });

    return { totalRequests, travelled, totalDistance, distanceEntries, pending, notEnded, byMission, byDestination };
  }, [filtered]);

  const exportHistory = () => exportXlsx(
    filtered.map((r) => ({
      เลขที่: r.tripNo, วันที่ขอใช้รถ: fmtDate(r.useDate), ผู้ขอใช้รถ: r.requester, ตำแหน่ง: r.requesterPosition || '-', ยานพาหนะ: r.plate,
      ผู้ขับรถ: r.driver || '-', ภารกิจ: numberedText(missionLines(r)).replace(/\n/g, ' ') || '-', ปลายทาง: r.destination || '-',
      สถานะ: r.status, ออกเดินทางจริง: r.timeOut || '-', กลับถึง: r.timeIn || '-',
      เลขไมล์ก่อนเดินทาง: r.odoStart || '-', เลขไมล์เมื่อกลับ: r.odoEnd || '-', ระยะทางกม: r.distance || '-',
    })),
    'ประวัติการใช้รถ', `รายงานผู้บริหาร-ยานพาหนะ-${from}-ถึง-${to}`,
  );
  const exportMileage = () => exportXlsx(
    mileage.map((m) => ({ ยานพาหนะ: m.label, เลขไมล์เริ่มต้น: m.base ?? '-', เลขไมล์ล่าสุด: m.latest ?? '-', จำนวนเที่ยว: m.trips, ระยะทางรวมกม: m.distance })),
    'สรุปเลขไมล์รายคัน', `สรุปเลขไมล์-${from}-ถึง-${to}`,
  );

  const printUrl = () => {
    const p = new URLSearchParams({ from, to, plate: plateFilter, missionType: missionFilter, driver: driverFilter });
    return `${window.location.origin}${window.location.pathname}#/print-vehicle-report?${p.toString()}`;
  };

  return (
    <div className="mx-auto max-w-7xl p-4 lg:p-6">
      <PageHeader
        emoji="📊" title="รายงานผู้บริหาร — ระบบขออนุญาตใช้ยานพาหนะราชการ"
        subtitle={`${fmtDate(from)} ถึง ${fmtDate(to)} · ${filtered.length} รายการ`}
        actions={
          <div className="flex flex-wrap gap-2">
            <button className="btn bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25" onClick={exportHistory} disabled={!filtered.length}><FileSpreadsheet className="h-4 w-4" /> Excel</button>
            <button className="btn bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25" onClick={exportMileage} disabled={!mileage.length}><FileSpreadsheet className="h-4 w-4" /> Excel เลขไมล์</button>
            <button className="btn bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25" onClick={() => window.open(printUrl(), '_blank')}><Printer className="h-4 w-4" /> พิมพ์สรุป</button>
          </div>
        }
      />

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div><label className="mb-1 block text-xs text-slate-600">ตั้งแต่วันที่</label><ThaiDateInput value={from} onChange={setFrom} /></div>
        <div><label className="mb-1 block text-xs text-slate-600">ถึงวันที่</label><ThaiDateInput value={to} onChange={setTo} /></div>
        <div>
          <label className="mb-1 block text-xs text-slate-600">ยานพาหนะ</label>
          <select className="input" value={plateFilter} onChange={(e) => setPlateFilter(e.target.value)}>
            <option value="">-- ทุกคัน --</option>
            {fleet.map((v) => <option key={v.id} value={vehicleLabel(v)}>{vehicleLabel(v)}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-600">ประเภทภารกิจ</label>
          <select className="input" value={missionFilter} onChange={(e) => setMissionFilter(e.target.value)}>
            <option value="">-- ทุกประเภท --</option>
            {missionTypes.map((m) => <option key={m.id} value={m.label}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-600">ผู้ขับรถ</label>
          <select className="input" value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)}>
            <option value="">-- ทุกคน --</option>
            {drivers.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>

      {error ? <ErrorState message={error} /> : rows === null ? <Spinner /> : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="card p-4"><div className="text-sm text-slate-500">จำนวนคำขอใช้ยานพาหนะ</div><div className="text-2xl font-bold text-brand-800">{stats.totalRequests}</div></div>
            <div className="card p-4"><div className="text-sm text-slate-500">อนุมัติและเดินทางจริง</div><div className="text-2xl font-bold text-sky-700">{stats.travelled.length}</div></div>
            <div className="card p-4">
              <div className="text-sm text-slate-500">ระยะทางรวมของรถยนต์ (กม.)</div>
              <div className="text-2xl font-bold text-emerald-700">{stats.totalDistance.toLocaleString('th-TH')}</div>
              <div className="text-xs text-slate-400">คำนวณจากเลขไมล์จริง {stats.distanceEntries.length} เที่ยวที่เสร็จสิ้นแล้วเท่านั้น (ไม่มีตัวเลขประมาณการปนอยู่)</div>
            </div>
            <div className="card p-4"><div className="text-sm text-slate-500">รออนุมัติ / ยังไม่สิ้นสุดเดินทาง</div><div className="text-2xl font-bold text-amber-700">{stats.pending.length} / {stats.notEnded.length}</div></div>
          </div>

          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <div className="card p-4">
              <h3 className="mb-2 font-semibold">สถิติการใช้รถแยกตามภารกิจ</h3>
              <p className="mb-1 text-xs text-slate-400">1 เที่ยวติ๊กได้หลายภารกิจ จึงนับเที่ยวซ้ำในทุกภารกิจที่เลือก</p>
              {Object.keys(stats.byMission).length === 0 ? <EmptyState title="ไม่มีข้อมูล" /> : (
                <table className="w-full text-left text-sm">
                  <thead className="text-slate-500"><tr><th className="py-1">ประเภทภารกิจ</th><th className="py-1 text-center">จำนวนเที่ยว</th><th className="py-1 text-center">ระยะทางรวม (กม.)</th></tr></thead>
                  <tbody>
                    {Object.entries(stats.byMission).sort((a, b) => b[1].count - a[1].count).map(([k, v]) => (
                      <tr key={k} className="border-t border-slate-100"><td className="py-1.5">{k}</td><td className="py-1.5 text-center">{v.count}</td><td className="py-1.5 text-center">{v.distance || '-'}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="card p-4">
              <h3 className="mb-2 font-semibold">สถิติการใช้รถแยกตามสถานที่ปลายทาง</h3>
              {Object.keys(stats.byDestination).length === 0 ? <EmptyState title="ไม่มีข้อมูล" /> : (
                <table className="w-full text-left text-sm">
                  <thead className="text-slate-500"><tr><th className="py-1">สถานที่ปลายทาง</th><th className="py-1 text-center">จำนวนเที่ยว</th></tr></thead>
                  <tbody>
                    {Object.entries(stats.byDestination).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                      <tr key={k} className="border-t border-slate-100"><td className="py-1.5">{k}</td><td className="py-1.5 text-center">{v}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <div className="card p-4">
              <h3 className="mb-2 font-semibold">รายการรออนุมัติ ({stats.pending.length})</h3>
              {stats.pending.length === 0 ? <EmptyState title="ไม่มีรายการรออนุมัติ" /> : (
                <div className="space-y-1.5">
                  {stats.pending.map((r) => (
                    <div key={r.id} className="rounded-lg bg-amber-50 px-3 py-1.5 text-sm"><b>{r.tripNo}</b> · {fmtDate(r.useDate)} · {r.requester} · {numberedText(missionLines(r)).replace(/\n/g, ' ')}</div>
                  ))}
                </div>
              )}
            </div>
            <div className="card p-4">
              <h3 className="mb-2 font-semibold">ยังไม่บันทึกสิ้นสุดการเดินทาง ({stats.notEnded.length})</h3>
              {stats.notEnded.length === 0 ? <EmptyState title="ไม่มีรายการค้าง" /> : (
                <div className="space-y-1.5">
                  {stats.notEnded.map((r) => (
                    <div key={r.id} className="rounded-lg bg-sky-50 px-3 py-1.5 text-sm"><b>{r.tripNo}</b> · ออกเดินทาง {r.timeOut || '-'} · {r.requester} · {r.plate}</div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card mb-4 overflow-x-auto p-4">
            <h3 className="mb-1 font-semibold">สรุปเลขไมล์รถยนต์รายคัน</h3>
            <p className="mb-2 text-xs text-slate-400">เลขไมล์ล่าสุดนับจากเที่ยวที่เสร็จสิ้นทุกช่วงเวลา ส่วนจำนวนเที่ยว/ระยะทางรวมนับเฉพาะช่วงวันที่ที่เลือก (ระยะทางจากเลขไมล์ที่บันทึกจริงเท่านั้น)</p>
            {mileage.length === 0 ? <EmptyState title="ไม่มีรถยนต์ในทะเบียนยานพาหนะ" /> : (
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="text-slate-500"><tr><th className="py-1">ยานพาหนะ</th><th className="py-1 text-center">เลขไมล์เริ่มต้น</th><th className="py-1 text-center">เลขไมล์ล่าสุด</th><th className="py-1 text-center">จำนวนเที่ยว</th><th className="py-1 text-center">ระยะทางรวม (กม.)</th></tr></thead>
                <tbody>
                  {mileage.map((m) => (
                    <tr key={m.label} className="border-t border-slate-100">
                      <td className="py-1.5">{m.label}</td>
                      <td className="py-1.5 text-center">{m.base != null ? m.base.toLocaleString('th-TH') : '-'}</td>
                      <td className="py-1.5 text-center font-semibold">{m.latest != null ? m.latest.toLocaleString('th-TH') : '-'}</td>
                      <td className="py-1.5 text-center">{m.trips}</td>
                      <td className="py-1.5 text-center">{m.distance ? m.distance.toLocaleString('th-TH') : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card overflow-x-auto p-4">
            <h3 className="mb-2 font-semibold">ประวัติการใช้รถย้อนหลัง</h3>
            {filtered.length === 0 ? <EmptyState title="ไม่พบรายการที่ตรงกับเงื่อนไข" /> : (
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="bg-brand-50 text-slate-600">
                  <tr>
                    <th className="px-2 py-2">เลขที่</th><th className="px-2 py-2">วันที่</th><th className="px-2 py-2">ผู้ขอใช้รถ</th>
                    <th className="px-2 py-2">ยานพาหนะ</th><th className="px-2 py-2">ภารกิจ</th><th className="px-2 py-2">ปลายทาง</th>
                    <th className="px-2 py-2 text-center">สถานะ</th><th className="px-2 py-2">ออก–กลับจริง</th><th className="px-2 py-2 text-center">เลขไมล์ ก่อน→กลับ</th><th className="px-2 py-2 text-center">ระยะทาง</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 font-semibold text-brand-800">{r.tripNo}</td>
                      <td className="px-2 py-1.5">{fmtDate(r.useDate)}</td>
                      <td className="px-2 py-1.5">{r.requester}</td>
                      <td className="px-2 py-1.5">{r.plate}</td>
                      <td className="whitespace-pre-line px-2 py-1.5">{numberedText(missionLines(r)) || '-'}</td>
                      <td className="px-2 py-1.5">{r.destination || '-'}</td>
                      <td className="px-2 py-1.5 text-center"><Badge className={cfg.statusColors[r.status]}>{r.status}</Badge></td>
                      <td className="px-2 py-1.5 text-xs">{r.timeOut ? `${r.timeOut} → ${r.timeIn || '-'}` : '-'}</td>
                      <td className="px-2 py-1.5 text-center">{r.odoStart ? `${r.odoStart} → ${r.odoEnd || '-'}` : '-'}</td>
                      <td className="px-2 py-1.5 text-center">{r.distance || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
