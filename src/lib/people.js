// ป้องกันการสมัคร/เพิ่มชื่อซ้ำในทะเบียนบุคลากร — ตัดคำนำหน้าชื่อที่พบบ่อยออกก่อนเทียบ เพื่อให้จับคู่ชื่อเดิมได้
// แม้พิมพ์คำนำหน้าต่างกัน (เช่น "นางสาวอาระยา ใจอุ่น" กับ "น.ส.อาระยา ใจอุ่น" ถือเป็นชื่อเดียวกัน)
const NAME_PREFIXES = ['นางสาว', 'นาง', 'นาย', 'น.ส.', 'ดร.', 'ว่าที่ร้อยตรีหญิง', 'ว่าที่ร้อยตรี'];

export function normalizeName(name) {
  let s = String(name || '').trim().replace(/\s+/g, ' ');
  for (const p of NAME_PREFIXES) {
    if (s.startsWith(p)) { s = s.slice(p.length).trim(); break; }
  }
  return s.toLowerCase();
}

// settings/nameIndex: ดัชนีชื่อ (ตัดคำนำหน้าแล้ว) -> อีเมล ดูแลโดย Cloud Function (onUserWritten ใน functions/index.js)
// อ่านได้แม้ไม่ได้ล็อกอิน (หน้าสมัครใช้งานต้องเช็กชื่อซ้ำก่อนสร้างบัญชี) — ดู firestore.rules match /settings/nameIndex
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export async function findNameInIndex(name) {
  const key = normalizeName(name);
  if (!key) return null;
  try {
    const snap = await getDoc(doc(db, 'settings', 'nameIndex'));
    const list = snap.exists() && Array.isArray(snap.data().list) ? snap.data().list : [];
    const hit = list.find((x) => x.key === key);
    return hit ? hit.email : null;
  } catch {
    return null; // อ่านไม่สำเร็จ (เช่นระหว่างออฟไลน์) ไม่ควรบล็อกการสมัคร
  }
}

// แยกคำนำหน้าออกจากชื่อ ("นางสาวสุนิศา ดาบพลหาร" -> { prefix: 'นางสาว', rest: 'สุนิศา ดาบพลหาร' }) — ใช้ลำดับยาวก่อน (นางสาว ก่อน นาง)
export const PREFIX_OPTIONS = ['นาย', 'นาง', 'นางสาว', 'ว่าที่ร้อยตรี', 'ดร.'];
export function splitPrefix(name) {
  const s = String(name || '').trim();
  const list = ['ว่าที่ร้อยตรีหญิง', 'ว่าที่ร้อยตรี', 'นางสาว', 'น.ส.', 'นาง', 'นาย', 'ดร.'];
  for (const p of list) if (s.startsWith(p)) return { prefix: p === 'น.ส.' ? 'นางสาว' : p, rest: s.slice(p.length).trim() };
  return { prefix: '', rest: s };
}
// ชื่อเต็มสำหรับแสดง: คำนำหน้า (ฟิลด์ namePrefix) + ชื่อ (ไม่เติมซ้ำถ้าชื่อมีคำนำหน้าอยู่แล้ว)
export const fullName = (u) => {
  const n = String(u?.name || '').trim();
  return u?.namePrefix && !splitPrefix(n).prefix ? `${u.namePrefix}${n}` : n;
};
