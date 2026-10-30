import { deleteApp, getApps, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { firebaseConfig, functions } from '../firebase';

// Username (เช่น 1, 2, 3) แปลงเป็นอีเมลภายในระบบ ผู้ใช้ไม่ต้องรู้จักอีเมลนี้
// ใช้โดเมน .example ซึ่งสงวนไว้ ไม่มีใครจดทะเบียนได้ ป้องกันการแย่งบัญชีผ่านอีเมล
export const INTERNAL_DOMAIN = 'nsnphc.example';

export const toEmail = (input) => {
  const v = String(input || '').trim().toLowerCase();
  return v.includes('@') ? v : `${v}@${INTERNAL_DOMAIN}`;
};

export const usernameOf = (email) => (email.endsWith(`@${INTERNAL_DOMAIN}`) ? email.split('@')[0] : email);

// Firebase กำหนดรหัสผ่านขั้นต่ำ 6 ตัว: รหัสสั้นกว่านั้น (เช่น PIN 4 หลัก) ระบบต่อท้ายให้เอง
// ผู้ใช้พิมพ์รหัสเดิมได้ และจะถูกบังคับให้ตั้งรหัสใหม่ (>= 8 ตัว) เมื่อเข้าครั้งแรก
export const firebasePassword = (p) => (String(p).length >= 6 ? String(p) : `${p}#nsn`);

// สร้างบัญชีล็อกอินผ่านแอปรอง เพื่อไม่ให้ผู้ดูแลที่กำลังใช้งานอยู่หลุดจากระบบ
// ต้องเปิด "Enable create (sign-up)" ใน Firebase Authentication ชั่วคราวระหว่างสร้างบัญชี
export async function createAuthAccount(email, password) {
  const name = 'account-creator';
  const app = getApps().find((a) => a.name === name) || initializeApp(firebaseConfig, name);
  const a = getAuth(app);
  try {
    await createUserWithEmailAndPassword(a, email, firebasePassword(password));
  } finally {
    await signOut(a).catch(() => {});
    await deleteApp(app).catch(() => {});
  }
}

// ตั้ง/เปลี่ยนรหัสผ่านบัญชีล็อกอิน (สร้างให้ถ้ายังไม่มี) ผ่าน Cloud Function — ไม่ต้องเข้า Firebase Console / ไม่ต้องเปิด sign-up
export async function setAuthPassword(email, password) {
  try {
    await httpsCallable(functions, 'adminAccountOp')({ op: 'set', email, password });
  } catch (err) { throw wrapFnErr(err); }
}
// ลบบัญชีล็อกอิน (ไม่มีอยู่แล้วก็ถือว่าสำเร็จ)
export async function deleteAuthAccount(email) {
  try {
    await httpsCallable(functions, 'adminAccountOp')({ op: 'delete', email });
  } catch (err) { throw wrapFnErr(err); }
}
function wrapFnErr(err) {
  const e = new Error(err.code === 'functions/not-found' || err.code === 'functions/internal' && /not found|NOT_FOUND/i.test(err.message || '')
    ? 'ยังไม่ได้ deploy Cloud Functions เวอร์ชันล่าสุด (ดูวิธีใน README v106)'
    : (err.message || String(err)));
  e.code = err.code;
  return e;
}
