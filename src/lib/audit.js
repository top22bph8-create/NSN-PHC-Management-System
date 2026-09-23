import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';

// ตัดค่า undefined และแปลงเป็นข้อมูลธรรมดาก่อนบันทึก
const plain = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));

// บันทึก Audit Log: action = login | create | update | delete | export | settings
export async function writeAudit({ action, module, docId = '', label = '', before = null, after = null }) {
  const u = auth.currentUser;
  if (!u) return;
  await addDoc(collection(db, 'auditLogs'), {
    action,
    module,
    docId,
    label,
    before: plain(before),
    after: plain(after),
    userEmail: u.email.toLowerCase(),
    at: serverTimestamp(),
  });
}

// คืนเฉพาะฟิลด์ที่เปลี่ยน { before, after }
export function diffFields(oldObj, newObj, keys) {
  const before = {};
  const after = {};
  keys.forEach((k) => {
    if ((oldObj[k] ?? '') !== (newObj[k] ?? '')) {
      before[k] = oldObj[k] ?? '';
      after[k] = newObj[k] ?? '';
    }
  });
  return { before, after };
}
