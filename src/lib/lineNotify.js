import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

// การตั้งค่าแจ้งเตือนไลน์ แยกเป็น 2 เอกสาร:
// - settings/lineNotify      → เก็บ TOKEN อย่างเดียว เขียนได้ฝ่ายเดียว (อ่านไม่ได้เลยแม้แต่ Super Admin กัน TOKEN รั่วไหล)
//                              Cloud Function ฝั่งเซิร์ฟเวอร์อ่านได้ผ่าน Admin SDK เท่านั้น
// - settings/lineNotifyMeta  → เก็บว่าเปิดใช้งานหรือไม่ และแจ้งเตือนเหตุการณ์ไหนบ้าง (ไม่ลับ อ่านได้ปกติ)
// เหตุผลที่ต้องมี Cloud Function คั่นกลาง: LINE Notify API ไม่อนุญาตให้เรียกตรงจากเบราว์เซอร์ (ติด CORS)
export const DEFAULT_LINE_EVENTS = { submit: true, decide: true, cancel: false };

export async function getLineMeta() {
  const s = await getDoc(doc(db, 'settings', 'lineNotifyMeta'));
  return { enabled: false, events: { ...DEFAULT_LINE_EVENTS }, ...(s.exists() ? s.data() : {}) };
}

// บันทึก TOKEN ใหม่ (เรียกเฉพาะตอนผู้ใช้พิมพ์ TOKEN ใหม่เข้ามาเท่านั้น — เว้นว่างไว้แปลว่าไม่แตะ TOKEN เดิม)
export async function saveLineToken(token) {
  await setDoc(doc(db, 'settings', 'lineNotify'), { token, updatedAt: serverTimestamp() });
}

// บันทึกสถานะเปิด/ปิด และเหตุการณ์ที่จะแจ้งเตือน (แก้ได้อิสระจาก TOKEN)
export async function saveLineMeta({ enabled, events }) {
  await setDoc(doc(db, 'settings', 'lineNotifyMeta'), { enabled: !!enabled, events: { ...DEFAULT_LINE_EVENTS, ...events } });
}
