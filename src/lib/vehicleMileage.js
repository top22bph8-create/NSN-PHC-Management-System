import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { vehicleLabel, VEHICLE_TYPES } from './vehicleConfig';

// สรุปเลขไมล์ต่อรถยนต์ (รถจักรยานยนต์ไม่บันทึกเลขไมล์) สำหรับรายงานผู้บริหาร
// - เลขไมล์เริ่มต้น = ค่าที่ตั้งไว้ในตั้งค่าระบบ (ทะเบียนยานพาหนะ)
// - เลขไมล์ล่าสุด = "เลขไมล์เมื่อกลับ" สูงสุดจากเที่ยวที่เสร็จสิ้นแล้วทุกช่วงเวลา (ถ้ายังไม่มีเที่ยวเลย ใช้เลขไมล์เริ่มต้น)
// - จำนวนเที่ยว/ระยะทางรวม = เฉพาะเที่ยวในช่วงวันที่/ตัวกรองที่เลือก และนับระยะทางเฉพาะเที่ยวที่เสร็จสิ้นและมีค่าที่บันทึกจริงเท่านั้น (ไม่ประมาณการ)
export async function fetchAllCompletedTrips() {
  const s = await getDocs(query(collection(db, 'vehicle'), where('status', '==', 'เสร็จสิ้น')));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function mileageSummary(fleet, allDone, filtered) {
  return (fleet || [])
    .filter((v) => String(v.type || '').startsWith(VEHICLE_TYPES[0]))
    .map((v) => {
      const label = vehicleLabel(v);
      let latest = null;
      (allDone || []).forEach((r) => {
        if (r.plate !== label || String(r.odoEnd || '').trim() === '') return;
        const n = Number(r.odoEnd);
        if (!Number.isNaN(n) && (latest === null || n > latest)) latest = n;
      });
      const base = String(v.odometer || '').trim() !== '' ? Number(v.odometer) : null;
      const mine = (filtered || []).filter((r) => r.plate === label);
      const done = mine.filter((r) => r.status === 'เสร็จสิ้น' && String(r.distance || '').trim() !== '');
      return {
        label, base, latest: latest !== null ? latest : base,
        trips: mine.filter((r) => ['กำลังใช้งาน', 'เสร็จสิ้น'].includes(r.status)).length,
        distance: done.reduce((s, r) => s + (Number(r.distance) || 0), 0),
      };
    });
}
