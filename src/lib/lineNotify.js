import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

// การตั้งค่าแจ้งเตือนไลน์ แยกเป็น 2 เอกสาร:
// - settings/lineNotify      → เก็บ Channel Access Token + Target ID (กลุ่ม/ผู้ใช้ปลายทาง) เขียนได้ฝ่ายเดียว
//                              อ่านไม่ได้เลยแม้แต่ Super Admin (กัน Token รั่วไหล) — Cloud Function ฝั่งเซิร์ฟเวอร์อ่านได้ผ่าน Admin SDK เท่านั้น
// - settings/lineNotifyMeta  → เก็บว่าเปิดใช้งานหรือไม่ และแจ้งเตือนเหตุการณ์ไหนบ้าง (ไม่ลับ อ่านได้ปกติ)
//
// หมายเหตุสำคัญ: LINE ได้ปิดบริการ "LINE Notify" ถาวรตั้งแต่ 31 มี.ค. 2568 (2025) แล้ว
// ระบบนี้จึงเปลี่ยนมาใช้ LINE Messaging API แทน (ต้องมี LINE Official Account ของตัวเอง + Channel Access Token
// และต้องรู้ Target ID ของกลุ่ม/ผู้ใช้ปลายทางที่จะส่งเข้าไป) — ดูขั้นตอนเตรียมทั้งหมดใน README หัวข้อ "แจ้งเตือนไลน์"
// เหตุผลที่ต้องมี Cloud Function คั่นกลาง: LINE Messaging API ไม่อนุญาตให้เว็บเบราว์เซอร์เรียกตรง (ติด CORS)
export const DEFAULT_LINE_EVENTS = { submit: true, decide: true, cancel: false };

export async function getLineMeta() {
  const s = await getDoc(doc(db, 'settings', 'lineNotifyMeta'));
  return { enabled: false, events: { ...DEFAULT_LINE_EVENTS }, ...(s.exists() ? s.data() : {}) };
}

// บันทึก Channel Access Token และ/หรือ Target ID ใหม่ (ใช้ merge เพื่อแก้ทีละช่องได้ โดยไม่ต้องอ่านค่าเดิมกลับมาก่อน
// เพราะกฎความปลอดภัยห้ามอ่านเอกสารนี้แม้แต่ Super Admin) — เว้นช่องไหนว่างไว้ = ไม่แตะค่าเดิมของช่องนั้น
export async function saveLineCredentials({ channelAccessToken, targetId }) {
  const patch = { updatedAt: serverTimestamp() };
  if (channelAccessToken) patch.channelAccessToken = channelAccessToken;
  if (targetId) patch.targetId = targetId;
  if (Object.keys(patch).length > 1) await setDoc(doc(db, 'settings', 'lineNotify'), patch, { merge: true });
}

// บันทึกสถานะเปิด/ปิด และเหตุการณ์ที่จะแจ้งเตือน (แก้ได้อิสระจาก Token/Target ID)
export async function saveLineMeta({ enabled, events }) {
  await setDoc(doc(db, 'settings', 'lineNotifyMeta'), { enabled: !!enabled, events: { ...DEFAULT_LINE_EVENTS, ...events } });
}
