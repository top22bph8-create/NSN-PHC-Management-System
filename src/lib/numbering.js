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

// ===== เลขทะเบียนหนังสือส่ง: รูปแบบตายตัวของหน่วยงาน (ไม่ผูกกับการตั้งค่าเลขทะเบียนทั่วไป) =====
export const ORG_DOC_CODE = 'สน 51006.24';

export const formatOutgoing = (seq, insertSeq = 0) =>
  `${ORG_DOC_CODE}/${seq}${insertSeq ? `.${insertSeq}` : ''}`;

// ออกเลขที่หนังสือส่งถัดไป รันต่อเนื่องตามปีงบประมาณ (ไม่ขึ้นปีใหม่กลางทาง ไม่มีเลขปีต่อท้าย)
export async function createOutgoingNumbered({ fy, data }) {
  const counterRef = doc(db, 'counters', `outgoing_seq_${fy}`);
  const newRef = doc(collection(db, 'outgoing'));
  let number = '';
  let seq = 0;
  await runTransaction(db, async (tx) => {
    const c = await tx.get(counterRef);
    seq = (c.exists() ? c.data().last : 0) + 1;
    number = formatOutgoing(seq);
    tx.set(counterRef, { last: seq, updatedAt: serverTimestamp() });
    tx.set(newRef, {
      ...data,
      fy,
      sendNo: number,
      baseSeq: seq,
      insertSeq: 0,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser.email.toLowerCase(),
    });
  });
  return { id: newRef.id, number };
}

// แทรกเลขที่ย้อนหลังในเลขที่ที่ออกไปแล้ว (เช่น /20 ที่ใช้ไปแล้ว -> แทรกใหม่เป็น /20.1, /20.2, ...)
export async function insertOutgoingNumbered({ fy, baseSeq, data }) {
  const counterRef = doc(db, 'counters', `outgoing_insert_${fy}_${baseSeq}`);
  const newRef = doc(collection(db, 'outgoing'));
  let number = '';
  let idx = 0;
  await runTransaction(db, async (tx) => {
    const c = await tx.get(counterRef);
    idx = (c.exists() ? c.data().last : 0) + 1;
    number = formatOutgoing(baseSeq, idx);
    tx.set(counterRef, { last: idx, updatedAt: serverTimestamp() });
    tx.set(newRef, {
      ...data,
      fy,
      sendNo: number,
      baseSeq: Number(baseSeq),
      insertSeq: idx,
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser.email.toLowerCase(),
    });
  });
  return { id: newRef.id, number };
}
