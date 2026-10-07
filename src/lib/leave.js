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

// รอบประเมินผลการปฏิบัติราชการ: แบ่งปีงบประมาณเป็น 2 รอบ รอบละ 6 เดือน — รอบที่ 1 = 1 ต.ค. - 31 มี.ค., รอบที่ 2 = 1 เม.ย. - 30 ก.ย.
// ทั้งสองรอบอยู่ในปีงบประมาณเดียวกันเสมอตาม fiscalYearBE (รอบ 1 เริ่มเดือน ต.ค. ซึ่งเป็นเดือนแรกของปีงบใหม่แล้ว) จึงกรองจาก
// รายการวันลาที่ query มาด้วยปีงบเดียวกันได้เลย ไม่ต้อง query แยก
export function evalRoundOf(dateStr) {
  const m = Number(String(dateStr || '').slice(5, 7));
  return (m >= 10 || m <= 3) ? 1 : 2;
}
export const EVAL_ROUND_LABEL = {
  1: 'รอบที่ 1 (1 ต.ค. - 31 มี.ค.)',
  2: 'รอบที่ 2 (1 เม.ย. - 30 ก.ย.)',
};

// เกณฑ์การลาที่หน่วยงานกำหนดใช้ประกอบการประเมินผลการปฏิบัติราชการ ต่อรอบประเมิน (6 เดือน) ตามที่แจ้ง:
// ลาป่วยไม่เกิน 9 ครั้ง, ลากิจส่วนตัวไม่เกิน 9 ครั้ง และลาป่วย+ลากิจรวมกันต้องไม่เกิน 23 วันทำการ/รอบ
// (เป็นเกณฑ์ประกอบการประเมิน ไม่ใช่สิทธิ์วันลาตามระเบียบ จึงไม่บล็อกการยื่นใบลาเหมือนโควตาประจำปี — แจ้งเตือนให้ทราบเท่านั้น)
export const EVAL_ROUND_RULE = { sickType: 'ลาป่วย', personalType: 'ลากิจส่วนตัว', maxCountEach: 9, maxCombinedDays: 23 };

// วันที่ลาล่าสุดของแต่ละประเภท (ไม่นับใบที่ยกเลิก) จากรายการใบลาที่ส่งเข้ามา — ใช้ดู "วันลาล่าสุด" ของแต่ละคนแต่ละประเภท
export function lastDatesByType(leaves) {
  const out = {};
  (leaves || []).forEach((l) => {
    if (l.status === 'ยกเลิก') return;
    if (!out[l.type] || l.start > out[l.type]) out[l.type] = l.start;
  });
  return out;
}

// สรุปจำนวนครั้ง/วันลาป่วย+ลากิจ ของคนคนหนึ่งในรอบประเมินที่ระบุ (นับเฉพาะใบที่อนุมัติแล้ว) พร้อมธงเกินเกณฑ์หรือไม่
export function evalRoundStats(leaves, round) {
  const inRound = (leaves || []).filter((l) => l.status === 'อนุมัติ' && evalRoundOf(l.start) === round);
  const sickLeaves = inRound.filter((l) => l.type === EVAL_ROUND_RULE.sickType);
  const personalLeaves = inRound.filter((l) => l.type === EVAL_ROUND_RULE.personalType);
  const sickCount = sickLeaves.length;
  const personalCount = personalLeaves.length;
  const sickDays = sickLeaves.reduce((s, l) => s + (Number(l.days) || 0), 0);
  const personalDays = personalLeaves.reduce((s, l) => s + (Number(l.days) || 0), 0);
  const combinedDays = sickDays + personalDays;
  return {
    sickCount, personalCount, sickDays, personalDays, combinedDays,
    sickOver: sickCount > EVAL_ROUND_RULE.maxCountEach,
    personalOver: personalCount > EVAL_ROUND_RULE.maxCountEach,
    combinedOver: combinedDays > EVAL_ROUND_RULE.maxCombinedDays,
  };
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
  const last = lastDatesByType(leaves);
  const types = Array.from(new Set([...LEAVE_TYPES, ...Object.keys(used), ...Object.keys(pending)]));
  return types
    .filter((t) => (used[t] || 0) + (pending[t] || 0) > 0 || quota?.[t] != null)
    .map((type) => {
      const q = quota?.[type];
      const u = used[type] || 0;
      const p = pending[type] || 0;
      return { type, quota: q ?? null, used: u, pending: p, remaining: q != null ? Math.max(0, q - u) : null, count: count[type] || 0, lastDate: last[type] || null };
    });
}

// สรุปสถิติการลารวมทุกคน: ตาราง matrix คน x ประเภท (นับเฉพาะวันที่อนุมัติแล้ว)
export function matrixForAll(people, leaves) {
  const types = LEAVE_TYPES;
  const approved = (leaves || []).filter((l) => l.status === 'อนุมัติ');
  const rows = sortPeople(people).map((p) => {
    const mine = approved.filter((l) => l.userEmail === p.email);
    const allMine = (leaves || []).filter((l) => l.userEmail === p.email); // รวมทุกสถานะ (ยกเว้นยกเลิก) ใช้หาวันลาล่าสุด
    const byType = {};
    const countByType = {};
    let total = 0;
    mine.forEach((l) => { const d = Number(l.days) || 0; byType[l.type] = (byType[l.type] || 0) + d; countByType[l.type] = (countByType[l.type] || 0) + 1; total += d; });
    const lastDateByType = lastDatesByType(allMine);
    return { email: p.email, name: p.name || p.email, position: p.position || '', byType, countByType, lastDateByType, total };
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
