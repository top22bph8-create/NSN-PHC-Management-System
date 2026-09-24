import { Timestamp, collection, doc, getDocs, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

// คอลเลกชันที่สำรอง (auditLogs สำรองไว้เก็บถาวร แต่ไม่กู้คืนกลับ เพื่อคงความเป็นหลักฐาน)
export const BACKUP_COLLECTIONS = ['users', 'settings', 'counters', 'incoming', 'outgoing', 'leaves', 'auditLogs'];
export const RESTORE_COLLECTIONS = BACKUP_COLLECTIONS.filter((c) => c !== 'auditLogs');
export const BACKUP_VERSION = 1;

// แปลง Timestamp เป็นข้อความ และแปลงกลับตอนกู้คืน
const encode = (v) => {
  if (v instanceof Timestamp) return { __ts: v.toDate().toISOString() };
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)]));
  return v;
};
const decode = (v) => {
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === 'object') {
    if (Object.keys(v).length === 1 && typeof v.__ts === 'string') return Timestamp.fromDate(new Date(v.__ts));
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x)]));
  }
  return v;
};

export async function buildBackup() {
  const data = {};
  for (const name of BACKUP_COLLECTIONS) {
    const snap = await getDocs(collection(db, name));
    data[name] = snap.docs.map((d) => ({ id: d.id, data: encode(d.data()) }));
  }
  return { app: 'NSN-PHC Management System', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), collections: data };
}

export const countOf = (backup) => Object.fromEntries(Object.entries(backup.collections || {}).map(([k, v]) => [k, v.length]));

export function validateBackup(b) {
  if (!b || b.app !== 'NSN-PHC Management System' || !b.collections) throw new Error('ไม่ใช่ไฟล์สำรองข้อมูลของระบบนี้');
  if (b.version !== BACKUP_VERSION) throw new Error('ไฟล์สำรองเป็นเวอร์ชันที่ไม่รองรับ');
}

// กู้คืน: เขียนทับเอกสารที่มี id เดียวกัน ไม่ลบเอกสารอื่นที่มีอยู่ (แบ่งเขียนครั้งละ 400 รายการ)
export async function restoreBackup(b, onProgress = () => {}) {
  validateBackup(b);
  let done = 0;
  for (const name of RESTORE_COLLECTIONS) {
    const items = b.collections[name] || [];
    for (let i = 0; i < items.length; i += 400) {
      const batch = writeBatch(db);
      items.slice(i, i + 400).forEach((it) => batch.set(doc(db, name, it.id), decode(it.data)));
      await batch.commit();
      done += Math.min(400, items.length - i);
      onProgress(done);
    }
  }
  return done;
}

export const markBackupDone = (email, counts) =>
  setDoc(doc(db, 'settings', 'backup'), { lastBackupAt: serverTimestamp(), by: email, counts });
