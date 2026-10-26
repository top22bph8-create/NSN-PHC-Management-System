import { Timestamp, collection, doc, getDoc, getDocs, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

// คอลเลกชันที่สำรอง — ครบทุกทะเบียนของระบบ (เดิมสำรองไม่ครบ และอ่านทั้งคอลเลกชัน settings ซึ่งชนกฎความปลอดภัยของ settings/lineNotify
// (ห้ามอ่านจากเบราว์เซอร์) ทำให้ส่งออกล้มเหลวทั้งไฟล์) — ตอนนี้อ่าน settings ทีละเอกสารที่ระบุ และข้ามคอลเลกชันที่ล้มเหลวแล้วรายงานให้ทราบ
export const BACKUP_COLLECTIONS = [
  'users', 'credentials', 'counters', 'incoming', 'outgoing', 'leaves', 'vehicle', 'duty', 'homevisit', 'assignments',
  'reg-orders', 'reg-announce', 'reg-procurement', 'reg-contract-no', 'reg-loan', 'reg-cheque', 'reg-receipt', 'reg-deeka', 'reg-certificate',
];
// เอกสารใน settings ที่สำรอง (ไม่รวม lineNotify = โทเคนไลน์, nameIndex/lineWebhookLog = สร้างใหม่ได้เอง)
export const SETTINGS_DOCS = ['numbering', 'holidays', 'leaveQuota', 'lineNotifyMeta', 'vehicleDestinations', 'vehicleFleet', 'vehicleMissionTypes'];
export const RESTORE_COLLECTIONS = ['settings', ...BACKUP_COLLECTIONS];
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

export async function buildBackup(onStep = () => {}) {
  const data = {};
  const failed = [];
  // settings: อ่านทีละเอกสาร
  onStep('settings');
  const st = [];
  for (const id of SETTINGS_DOCS) {
    try {
      const d = await getDoc(doc(db, 'settings', id));
      if (d.exists()) st.push({ id, data: encode(d.data()) });
    } catch { failed.push(`settings/${id}`); }
  }
  data.settings = st;
  for (const name of BACKUP_COLLECTIONS) {
    onStep(name);
    try {
      const snap = await getDocs(collection(db, name));
      data[name] = snap.docs.map((d) => ({ id: d.id, data: encode(d.data()) }));
    } catch { failed.push(name); data[name] = []; }
  }
  return { app: 'NSN-PHC Management System', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), collections: data, failed };
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
  const failed = [];
  for (const name of RESTORE_COLLECTIONS) {
    const items = b.collections[name] || [];
    for (let i = 0; i < items.length; i += 400) {
      const chunk = items.slice(i, i + 400);
      try {
        const batch = writeBatch(db);
        chunk.forEach((it) => batch.set(doc(db, name, it.id), decode(it.data)));
        await batch.commit();
        done += chunk.length;
      } catch {
        // ชุดที่ล้มเหลว (เช่นติดกฎความปลอดภัยบางรายการ) → ลองทีละรายการ เพื่อไม่ให้ทั้งชุดหาย
        for (const it of chunk) {
          try { await setDoc(doc(db, name, it.id), decode(it.data)); done += 1; } catch { failed.push(`${name}/${it.id}`); }
        }
      }
      onProgress(done);
    }
  }
  return { done, failed };
}

export const markBackupDone = (email, counts) =>
  setDoc(doc(db, 'settings', 'backup'), { lastBackupAt: serverTimestamp(), by: email, counts });
