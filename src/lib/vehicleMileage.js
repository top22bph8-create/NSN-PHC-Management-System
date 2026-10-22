import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { vehicleLabel, VEHICLE_TYPES, KM_STATUSES, hasKm } from './vehicleConfig';

// สรุปเลขไมล์ต่อรถยนต์ (รถจักรยานยนต์ไม่บันทึกเลขไมล์) สำหรับรายงานผู้บริหาร
// - เลขไมล์เริ่มต้น = ค่าที่ตั้งไว้ในตั้งค่าระบบ (ทะเบียนยานพาหนะ)
// - เลขไมล์ล่าสุด = "เลขไมล์ปัจจุบัน" สูงสุดที่เคยบันทึกกับคำขอของรถคันนั้นทุกช่วงเวลา (รวมคำขอเก่าที่ใช้เลขไมล์เมื่อกลับ) ถ้ายังไม่มีเลย ใช้เลขไมล์เริ่มต้น
// - จำนวนเที่ยว/ระยะทางรวม = เฉพาะคำขอในช่วงวันที่/ตัวกรองที่เลือก; ระยะทางรวมนับเฉพาะที่มีระยะทางที่คำนวณจากเลขไมล์จริง (ไม่ประมาณการ)
export async function fetchAllCompletedTrips() {
  const s = await getDocs(collection(db, 'vehicle'));
  return s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => KM_STATUSES.includes(r.status));
}

export function mileageSummary(fleet, allRecords, filtered) {
  return (fleet || [])
    .filter((v) => String(v.type || '').startsWith(VEHICLE_TYPES[0]))
    .map((v) => {
      const label = vehicleLabel(v);
      let latest = null;
      (allRecords || []).forEach((r) => {
        if (r.plate !== label) return;
        [r.odoCurrent, r.odoEnd].forEach((raw) => {
          if (raw === undefined || raw === null || String(raw).trim() === '') return;
          const n = Number(raw);
          if (!Number.isNaN(n) && (latest === null || n > latest)) latest = n;
        });
      });
      const base = String(v.odometer || '').trim() !== '' ? Number(v.odometer) : null;
      const mine = (filtered || []).filter((r) => r.plate === label && KM_STATUSES.includes(r.status));
      return {
        label, base, latest: latest !== null ? latest : base,
        trips: mine.length,
        distance: mine.filter(hasKm).reduce((s, r) => s + (Number(r.distance) || 0), 0),
      };
    });
}
