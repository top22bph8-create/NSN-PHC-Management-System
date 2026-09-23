import { collection, doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';

export const DEFAULT_NUMBERING = { digits: 3, era: 'BE', prefixes: {} };

export async function getNumbering() {
  const s = await getDoc(doc(db, 'settings', 'numbering'));
  return { ...DEFAULT_NUMBERING, ...(s.exists() ? s.data() : {}) };
}

export const formatNumber = (n, digits, year, prefix = '') =>
  `${prefix}${String(n).padStart(digits, '0')}/${year}`;

// สร้างเอกสารพร้อมเลขทะเบียนอัตโนมัติ (นับต่อเนื่องภายในปี ขึ้นปีใหม่เริ่ม 001 ใหม่ ข้อมูลปีเก่ายังอยู่)
export async function createNumbered({ collectionName, numberField, dateStr, data }) {
  const cfg = await getNumbering();
  const y = Number(dateStr.slice(0, 4));
  const year = cfg.era === 'CE' ? y : y + 543;
  const prefix = cfg.prefixes?.[collectionName] || '';
  const counterRef = doc(db, 'counters', `${collectionName}_${year}`);
  const newRef = doc(collection(db, collectionName));
  let number = '';
  await runTransaction(db, async (tx) => {
    const c = await tx.get(counterRef);
    const next = (c.exists() ? c.data().last : 0) + 1;
    number = formatNumber(next, cfg.digits, year, prefix);
    tx.set(counterRef, { last: next, updatedAt: serverTimestamp() });
    tx.set(newRef, {
      ...data,
      [numberField]: number,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser.email.toLowerCase(),
    });
  });
  return { id: newRef.id, number };
}
