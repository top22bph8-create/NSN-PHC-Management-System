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
