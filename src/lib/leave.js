import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const LEAVE_TYPES = [
  'ลาป่วย',
  'ลากิจส่วนตัว',
  'ลาพักผ่อน',
  'ลาคลอดบุตร',
  'ลาไปช่วยเหลือภริยาที่คลอดบุตร',
  'ลาอุปสมบท/ประกอบพิธีฮัจย์',
  'ลาไปศึกษา/ฝึกอบรม/ดูงาน',
  'อื่น ๆ',
];

export const LEAVE_STATUS_COLORS = {
  'รอพิจารณา': 'bg-amber-100 text-amber-800',
  'อนุมัติ': 'bg-emerald-100 text-emerald-800',
  'ไม่อนุมัติ': 'bg-red-100 text-red-800',
  'ยกเลิก': 'bg-slate-200 text-slate-600',
};

// โควตาวันลาเริ่มต้นต่อปีงบประมาณ (ผู้ดูแลปรับได้ที่เมนูตั้งค่า) ประเภทที่ไม่ระบุ = ไม่จำกัด
export const DEFAULT_QUOTA = { 'ลาป่วย': 60, 'ลากิจส่วนตัว': 45, 'ลาพักผ่อน': 10, 'ลาคลอดบุตร': 90 };

export async function getQuota() {
  const s = await getDoc(doc(db, 'settings', 'leaveQuota'));
  return { ...DEFAULT_QUOTA, ...(s.exists() ? s.data() : {}) };
}

// นับจำนวนวันทำการ (จันทร์-ศุกร์) ระหว่างวันเริ่มและวันสิ้นสุด รวมทั้งสองวัน (YYYY-MM-DD)
export function workingDays(start, end) {
  if (!start || !end || end < start) return 0;
  const [y1, m1, d1] = start.split('-').map(Number);
  const [y2, m2, d2] = end.split('-').map(Number);
  const a = new Date(y1, m1 - 1, d1);
  const b = new Date(y2, m2 - 1, d2);
  let n = 0;
  for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    const w = d.getDay();
    if (w !== 0 && w !== 6) n += 1;
  }
  return n;
}

// จำนวนวันที่ใช้ไปแล้วต่อประเภท (นับเฉพาะที่อนุมัติ) และที่รออนุมัติ
export function usage(leaves) {
  const used = {};
  const pending = {};
  leaves.forEach((l) => {
    const d = Number(l.days) || 0;
    if (l.status === 'อนุมัติ') used[l.type] = (used[l.type] || 0) + d;
    if (l.status === 'รอพิจารณา') pending[l.type] = (pending[l.type] || 0) + d;
  });
  return { used, pending };
}
