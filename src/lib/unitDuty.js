// เวรออกหน่วย: ปฐมพยาบาล (เป็นทีม) / รับบริจาคโลหิต (ออกครั้งละคน) — ระบบรันคิวอัตโนมัติ
// ข้อมูล: unitRoster/{kind} = { units: [{ label, members: [{ name, position }] }], nextIdx }  ·  unitDuty/{id} = เหตุการณ์ออกหน่วย
import { collection, doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

// สีประจำทีม/คน (หมุนเวียน) — ใช้ทั้งหน้าเวรและแดชบอร์ด
export const UNIT_COLORS = [
  { bar: 'bg-sky-500', soft: 'bg-sky-50 text-sky-900', ring: 'ring-sky-400', head: 'from-sky-600 to-cyan-500', chip: 'bg-sky-500 text-white' },
  { bar: 'bg-emerald-500', soft: 'bg-emerald-50 text-emerald-900', ring: 'ring-emerald-400', head: 'from-emerald-600 to-green-500', chip: 'bg-emerald-500 text-white' },
  { bar: 'bg-amber-400', soft: 'bg-amber-50 text-amber-900', ring: 'ring-amber-400', head: 'from-amber-500 to-yellow-400', chip: 'bg-amber-400 text-amber-950' },
  { bar: 'bg-rose-500', soft: 'bg-rose-50 text-rose-900', ring: 'ring-rose-400', head: 'from-rose-600 to-pink-500', chip: 'bg-rose-500 text-white' },
  { bar: 'bg-violet-500', soft: 'bg-violet-50 text-violet-900', ring: 'ring-violet-400', head: 'from-violet-600 to-purple-500', chip: 'bg-violet-500 text-white' },
  { bar: 'bg-orange-500', soft: 'bg-orange-50 text-orange-900', ring: 'ring-orange-400', head: 'from-orange-600 to-amber-500', chip: 'bg-orange-500 text-white' },
  { bar: 'bg-teal-500', soft: 'bg-teal-50 text-teal-900', ring: 'ring-teal-400', head: 'from-teal-600 to-cyan-500', chip: 'bg-teal-500 text-white' },
];
export const unitColor = (i) => UNIT_COLORS[((Number(i) || 0) % UNIT_COLORS.length + UNIT_COLORS.length) % UNIT_COLORS.length];

// ตารางตามบัญชีแนบท้ายคำสั่ง รพ.สต.บ้านหนองสนม ที่ 89/2569
export const UNIT_KINDS = {
  firstaid: {
    key: 'firstaid', path: '/unit-firstaid', emoji: '🚑', title: 'เวรออกหน่วยปฐมพยาบาล', short: 'หน่วยปฐมพยาบาล', unitWord: 'ทีม',
    tone: 'from-red-600 via-rose-600 to-orange-500',
    subtitle: 'จัดเป็นทีม หมุนเวียนตามคิว — บันทึกงานแล้วระบบรันคิวและแจ้งไลน์กลุ่มให้ทันที',
    defaults: {
      units: [
        { label: 'ทีมที่ 1', members: [{ name: 'นางปิยะนาฎ พรมจันทร์', position: 'พยาบาลวิชาชีพชำนาญการ' }, { name: 'นางสาวพิไลวรรณ กุลมินทร์', position: 'นักวิชาการสาธารณสุขชำนาญการ' }, { name: 'นายแสงกล้า โพธิโคตร', position: 'พนักงานขับรถยนต์' }] },
        { label: 'ทีมที่ 2', members: [{ name: 'นางเพียงใจ ต้นน้อย', position: 'พยาบาลวิชาชีพชำนาญการ' }, { name: 'นางสาวสุกัญญา สมสวัสดิ์', position: 'นักวิชาการสาธารณสุขชำนาญการ' }, { name: 'นางสมถวิล ทัศคร', position: 'พนักงานบริการ' }] },
        { label: 'ทีมที่ 3', members: [{ name: 'นางศศิธร ภิญญะพงษ์', position: 'พยาบาลวิชาชีพชำนาญการ' }, { name: 'นางสาวสุนิศา ดาบพลหาร', position: 'นักวิชาการสาธารณสุขปฏิบัติการ' }, { name: 'นายแสงกล้า โพธิโคตร', position: 'พนักงานขับรถยนต์' }] },
        { label: 'ทีมที่ 4', members: [{ name: 'นางสาวอาระยา ใจอุ่น', position: 'แพทย์แผนไทย' }, { name: 'นางสาวทัศนวรรณ แสงสา', position: 'พนักงานผู้ช่วยเหลือคนไข้' }, { name: 'นางสาววรัญญา ลิ้พล', position: 'พนักงานการเงินและบัญชี' }] },
      ],
      nextIdx: 0, // ทีม 4 ไปล่าสุดแล้ว → ถัดไปทีม 1
    },
  },
  blood: {
    key: 'blood', path: '/unit-blood', emoji: '🩸', title: 'เวรออกรับบริจาคโลหิต', short: 'รับบริจาคโลหิต', unitWord: 'คน',
    tone: 'from-rose-700 via-red-600 to-pink-500',
    subtitle: 'ออกครั้งละ 1 คน (คนละคำสั่ง) หมุนเวียนตามลำดับคิว',
    defaults: {
      units: [
        { label: 'นางปิยะนาฎ พรมจันทร์', members: [{ name: 'นางปิยะนาฎ พรมจันทร์', position: 'พยาบาลวิชาชีพชำนาญการ' }] },
        { label: 'นางเพียงใจ ต้นน้อย', members: [{ name: 'นางเพียงใจ ต้นน้อย', position: 'พยาบาลวิชาชีพชำนาญการ' }] },
        { label: 'นางศศิธร ภิญญะพงษ์', members: [{ name: 'นางศศิธร ภิญญะพงษ์', position: 'พยาบาลวิชาชีพชำนาญการ' }] },
        { label: 'นางสาวพิไลวรรณ กุลมินทร์', members: [{ name: 'นางสาวพิไลวรรณ กุลมินทร์', position: 'นักวิชาการสาธารณสุขชำนาญการ' }] },
        { label: 'นางสาวสุกัญญา สมสวัสดิ์', members: [{ name: 'นางสาวสุกัญญา สมสวัสดิ์', position: 'นักวิชาการสาธารณสุขชำนาญการ' }] },
        { label: 'นางสาวสุนิศา ดาบพลหาร', members: [{ name: 'นางสาวสุนิศา ดาบพลหาร', position: 'นักวิชาการสาธารณสุขปฏิบัติการ' }] },
        { label: 'นางสาวอาระยา ใจอุ่น', members: [{ name: 'นางสาวอาระยา ใจอุ่น', position: 'แพทย์แผนไทย' }] },
      ],
      nextIdx: 0, // คิวถัดไป = นางปิยะนาฎ
    },
  },
};

export const UNIT_STATUS = ['นัดหมาย', 'เสร็จสิ้น', 'ยกเลิก'];
export const UNIT_STATUS_TONE = { 'นัดหมาย': 'bg-sky-100 text-sky-800', 'เสร็จสิ้น': 'bg-emerald-100 text-emerald-800', 'ยกเลิก': 'bg-slate-200 text-slate-600' };

const rosterRef = (kind) => doc(db, 'unitRoster', kind);

// อ่านรายชื่อ/คิวปัจจุบัน (ไม่มีเอกสาร = ใช้ค่าเริ่มต้นตามคำสั่ง)
export async function loadRoster(kind) {
  const s = await getDoc(rosterRef(kind));
  const d = UNIT_KINDS[kind].defaults;
  if (!s.exists()) return { units: d.units, nextIdx: d.nextIdx, saved: false };
  const x = s.data();
  return { units: x.units?.length ? x.units : d.units, nextIdx: Number.isInteger(x.nextIdx) ? x.nextIdx : d.nextIdx, saved: true };
}

export async function saveRoster(kind, roster) {
  await runTransaction(db, async (tx) => { tx.set(rosterRef(kind), { units: roster.units, nextIdx: roster.nextIdx, updatedAt: serverTimestamp() }); });
}

// สร้างงานออกหน่วย + รันคิวอัตโนมัติ (overrideIdx = กำหนดทีม/คนเอง → ไม่ขยับคิว)
export async function createUnitEvent(kind, data, overrideIdx, userName) {
  const evRef = doc(collection(db, 'unitDuty'));
  let result;
  await runTransaction(db, async (tx) => {
    const rs = await tx.get(rosterRef(kind));
    const d = UNIT_KINDS[kind].defaults;
    const units = rs.exists() && rs.data().units?.length ? rs.data().units : d.units;
    const cur = rs.exists() && Number.isInteger(rs.data().nextIdx) ? rs.data().nextIdx : d.nextIdx;
    const auto = overrideIdx == null || overrideIdx === '';
    const idx = auto ? cur % units.length : Number(overrideIdx);
    const u = units[idx];
    tx.set(evRef, { kind, ...data, unitIdx: idx, unitLabel: u.label, members: u.members, auto, status: 'นัดหมาย', createdBy: userName || '', createdAt: serverTimestamp() });
    if (auto) tx.set(rosterRef(kind), { units, nextIdx: (idx + 1) % units.length, updatedAt: serverTimestamp() });
    result = { id: evRef.id, unitIdx: idx, unitLabel: u.label, auto };
  });
  return result;
}

// ยกเลิก/ลบงานที่ระบบรันคิวให้ → คืนคิวให้ทีม/คนนั้น ถ้าคิวยังไม่ขยับต่อจากนั้น
export async function releaseQueue(kind, ev) {
  if (!ev || !ev.auto || ev.unitIdx == null) return false;
  let released = false;
  await runTransaction(db, async (tx) => {
    const rs = await tx.get(rosterRef(kind));
    if (!rs.exists()) return;
    const { units, nextIdx } = rs.data();
    if (nextIdx === (ev.unitIdx + 1) % units.length) { tx.update(rosterRef(kind), { nextIdx: ev.unitIdx, updatedAt: serverTimestamp() }); released = true; }
  });
  return released;
}

export const membersText = (members) => (members || []).map((m, i) => `${i + 1}. ${m.name}${m.position ? ` (${m.position})` : ''}`).join('\n');
