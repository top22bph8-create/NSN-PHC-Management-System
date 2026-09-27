/**
 * Cloud Function เสริม: แจ้งเตือนเข้ากลุ่มไลน์ผ่าน LINE Notify เมื่อมีการยื่น/อนุมัติ/ไม่อนุมัติ/ยกเลิกใบลา
 *
 * ทำไมต้องมีไฟล์นี้แยกจากเว็บ: LINE Notify API (https://notify-api.line.me/api/notify) ไม่อนุญาตให้เว็บเบราว์เซอร์
 * เรียกตรง (ติด CORS) จึงต้องมีโค้ดฝั่งเซิร์ฟเวอร์ทำหน้าที่ส่งแทน — Cloud Function นี้ทำงานอัตโนมัติทุกครั้งที่มีการ
 * สร้าง/แก้ไขเอกสารในทะเบียนวันลา (Firestore) โดยไม่ต้องให้เว็บเรียกเอง
 *
 * วิธีติดตั้ง/เผยแพร่: ดู README.md หัวข้อ "แจ้งเตือนไลน์ (LINE Notify)"
 */
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

async function getLineSettings() {
  const [tokenSnap, metaSnap] = await Promise.all([
    db.doc('settings/lineNotify').get(),
    db.doc('settings/lineNotifyMeta').get(),
  ]);
  const token = tokenSnap.exists ? tokenSnap.data().token : '';
  const meta = metaSnap.exists ? metaSnap.data() : { enabled: false, events: {} };
  return { token, enabled: !!meta.enabled, events: meta.events || {} };
}

async function sendLine(token, message) {
  const res = await fetch('https://notify-api.line.me/api/notify', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ message }),
  });
  if (!res.ok) {
    console.error('LINE Notify ส่งไม่สำเร็จ:', res.status, await res.text());
  }
}

// เมื่อมีการยื่นใบลาใหม่
exports.onLeaveCreated = onDocumentCreated('leaves/{id}', async (event) => {
  const l = event.data.data();
  const { token, enabled, events } = await getLineSettings();
  if (!token || !enabled || !events.submit) return;
  await sendLine(
    token,
    `📋 มีการยื่นใบลาใหม่\nชื่อ: ${l.name}\nตำแหน่ง: ${l.position || '-'}\nประเภท: ${l.type}\nวันที่: ${l.start} ถึง ${l.end} (${l.days} วัน)\nเหตุผล: ${l.reason || '-'}\nสถานะ: รอพิจารณา`,
  );
});

// เมื่อสถานะใบลาเปลี่ยน (อนุมัติ / ไม่อนุมัติ / ยกเลิก)
exports.onLeaveUpdated = onDocumentUpdated('leaves/{id}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (before.status === after.status) return;
  const { token, enabled, events } = await getLineSettings();
  if (!token || !enabled) return;

  if (after.status === 'ยกเลิก') {
    if (!events.cancel) return;
    await sendLine(token, `🚫 ยกเลิกใบลา\nชื่อ: ${after.name}\nประเภท: ${after.type}\nวันที่: ${after.start} ถึง ${after.end}`);
    return;
  }
  if (after.status === 'อนุมัติ' || after.status === 'ไม่อนุมัติ') {
    if (!events.decide) return;
    const icon = after.status === 'อนุมัติ' ? '✅' : '❌';
    await sendLine(
      token,
      `${icon} ผลการพิจารณาใบลา\nชื่อ: ${after.name}\nประเภท: ${after.type}\nวันที่: ${after.start} ถึง ${after.end}\nผล: ${after.status}${after.decisionNote ? `\nหมายเหตุ: ${after.decisionNote}` : ''}`,
    );
  }
});
