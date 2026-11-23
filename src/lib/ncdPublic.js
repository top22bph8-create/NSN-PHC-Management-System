// ลิงก์คัดกรอง NCD สำหรับ อสม. (ไม่ต้องล็อกอิน) — เรียก Cloud Functions ncdAsmInfo / ncdAsmSubmit; รหัสลับอยู่ใน settings/ncdPublic (Super Admin เท่านั้น)
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, functions } from '../firebase';

const call = (name) => async (data) => {
  try { return (await httpsCallable(functions, name)(data || {})).data; } catch (err) { throw new Error(err?.message || 'เชื่อมต่อไม่สำเร็จ'); }
};
export const ncdAsmInfo = call('ncdAsmInfo');
export const ncdAsmSubmit = call('ncdAsmSubmit');
export const ncdAsmRoster = call('ncdAsmRoster');
export const ncdTargetStatus = call('ncdTargetStatus');

// รหัสรายหมู่บ้าน = HMAC-SHA256(รหัสหลัก, 'ncd-v'+หมู่) 24 ตัวแรก (ต้องตรงกับ Cloud Function ncdVillageKey)
export const villageKey = async (master, no) => {
  const enc = new TextEncoder(); const key = await crypto.subtle.importKey('raw', enc.encode(String(master)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`ncd-v${no}`)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
};
export const ncdVillageUrl = (k, no) => `${window.location.origin}${window.location.pathname}#/ncd-asm?k=${encodeURIComponent(k)}&v=${encodeURIComponent(no)}`;

export const ncdPublicUrl = (token) => `${window.location.origin}${window.location.pathname}#/ncd-asm?k=${encodeURIComponent(token)}`;
export const newToken = () => { const a = new Uint8Array(18); crypto.getRandomValues(a); return Array.from(a, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 28); };
export const getNcdPublic = async () => { const s = await getDoc(doc(db, 'settings', 'ncdPublic')); return s.exists() ? s.data() : { enabled: false, token: '' }; };
export const saveNcdPublic = (v) => setDoc(doc(db, 'settings', 'ncdPublic'), { ...v, updatedAt: serverTimestamp() }, { merge: true });
