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

// โควตาวันลาเริ่มต้นต่อปีงบประมาณ อ้างอิงระเบียบสำนักนายกรัฐมนตรีว่าด้วยการลาของข้าราชการ พ.ศ. 2555
// (ผู้ดูแลปรับได้ที่เมนูตั้งค่า) ประเภทที่ไม่ระบุในนี้ = ไม่จำกัดสิทธิ์ (ลาไปศึกษา/ฝึกอบรม/ดูงาน, อื่น ๆ)
// - ลาป่วย: ไม่มีเพดานตายตัวตามระเบียบ แต่ตั้งไว้เป็นค่าเตือน/บล็อกของระบบ ปรับได้ตามนโยบายหน่วยงาน
// - ลากิจส่วนตัว: ไม่เกิน 45 วันทำการ/ปี, ลาพักผ่อน: 10 วันทำการ/ปี (สะสมได้ ดูที่ทำเนียบบุคลากร)
// - ลาคลอดบุตร: ไม่เกิน 90 วัน, ลาไปช่วยเหลือภริยาคลอดบุตร: ไม่เกิน 15 วันทำการ, ลาอุปสมบท/ฮัจย์: ไม่เกิน 120 วัน
export const DEFAULT_QUOTA = {
  'ลาป่วย': 60,
  'ลากิจส่วนตัว': 45,
  'ลาพักผ่อน': 10,
  'ลาคลอดบุตร': 90,
  'ลาไปช่วยเหลือภริยาที่คลอดบุตร': 15,
  'ลาอุปสมบท/ประกอบพิธีฮัจย์': 120,
};

export async function getQuota() {
  const s = await getDoc(doc(db, 'settings', 'leaveQuota'));
  return { ...DEFAULT_QUOTA, ...(s.exists() ? s.data() : {}) };
}

// ลำดับตำแหน่งที่ใช้จัดเรียงรายชื่อบุคลากร (ใช้ร่วมกันทั้งหน้าวันลารายบุคคลและหน้ารายงาน)
export const POSITION_ORDER = [
  'นักวิชาการสาธารณสุขชำนาญการพิเศษ',
  'นักวิชาการสาธารณสุข',
  'พยาบาลวิชาชีพ',
  'แพทย์แผนไทย',
  'ผู้ช่วยเหลือคนไข้',
  'พนักงานบริการ',
  'พนักงานการเงินและบัญชี',
  'คนขับรถ',
];
export const posRank = (position) => {
  const p = String(position || '');
  const i = POSITION_ORDER.findIndex((k) => p.includes(k));
  return i === -1 ? POSITION_ORDER.length : i;
};
export const sortPeople = (people) => [...(people || [])].sort((a, b) => {
  const r = posRank(a.position) - posRank(b.position);
  return r !== 0 ? r : String(a.name || a.email).localeCompare(String(b.name || b.email), 'th');
});

// สรุปสถิติการลารายบุคคล (ต่อประเภท): โควตา/ใช้แล้ว(อนุมัติ)/รออนุมัติ/คงเหลือ/จำนวนครั้ง — ใช้ในหน้ารายงานและหน้าพิมพ์
export function statsForPerson(leaves, quota) {
  const { used, pending } = usage(leaves);
  const count = {};
  (leaves || []).forEach((l) => { if (l.status === 'อนุมัติ') count[l.type] = (count[l.type] || 0) + 1; });
  const types = Array.from(new Set([...LEAVE_TYPES, ...Object.keys(used), ...Object.keys(pending)]));
  return types
    .filter((t) => (used[t] || 0) + (pending[t] || 0) > 0 || quota?.[t] != null)
    .map((type) => {
      const q = quota?.[type];
      const u = used[type] || 0;
      const p = pending[type] || 0;
      return { type, quota: q ?? null, used: u, pending: p, remaining: q != null ? Math.max(0, q - u) : null, count: count[type] || 0 };
    });
}

// สรุปสถิติการลารวมทุกคน: ตาราง matrix คน x ประเภท (นับเฉพาะวันที่อนุมัติแล้ว)
export function matrixForAll(people, leaves) {
  const types = LEAVE_TYPES;
  const approved = (leaves || []).filter((l) => l.status === 'อนุมัติ');
  const rows = sortPeople(people).map((p) => {
    const mine = approved.filter((l) => l.userEmail === p.email);
    const byType = {};
    let total = 0;
    mine.forEach((l) => { const d = Number(l.days) || 0; byType[l.type] = (byType[l.type] || 0) + d; total += d; });
    return { email: p.email, name: p.name || p.email, position: p.position || '', byType, total };
  });
  return { types, rows };
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
