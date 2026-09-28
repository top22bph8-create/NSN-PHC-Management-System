/**
 * Cloud Function เสริม: แจ้งเตือนเข้ากลุ่มไลน์ผ่าน LINE Messaging API เมื่อมีการยื่น/อนุมัติ/ไม่อนุมัติ/ยกเลิกใบลา
 *
 * หมายเหตุสำคัญ: LINE ได้ปิดบริการ "LINE Notify" ถาวรตั้งแต่ 31 มี.ค. 2568 (2025) แล้ว ไฟล์นี้จึงใช้ LINE Messaging API
 * แทน (ต้องมี LINE Official Account ของหน่วยงานเอง + Channel access token + Target ID ของกลุ่ม/ผู้ใช้ปลายทาง)
 *
 * ทำไมต้องมีไฟล์นี้แยกจากเว็บ: LINE Messaging API ไม่อนุญาตให้เว็บเบราว์เซอร์เรียกตรง (ติด CORS) จึงต้องมีโค้ดฝั่ง
 * เซิร์ฟเวอร์ทำหน้าที่ส่งแทน — Cloud Function นี้ทำงานอัตโนมัติทุกครั้งที่มีการสร้าง/แก้ไขเอกสารในทะเบียนวันลา
 * (Firestore) โดยไม่ต้องให้เว็บเรียกเอง
 *
 * วิธีติดตั้ง/เผยแพร่ และวิธีเตรียม LINE Official Account + หา Target ID: ดู README.md หัวข้อ "แจ้งเตือนไลน์"
 */
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

async function getLineSettings() {
  const [credSnap, metaSnap] = await Promise.all([
    db.doc('settings/lineNotify').get(),
    db.doc('settings/lineNotifyMeta').get(),
  ]);
  const cred = credSnap.exists ? credSnap.data() : {};
  const meta = metaSnap.exists ? metaSnap.data() : { enabled: false, events: {} };
  return {
    channelAccessToken: cred.channelAccessToken || '',
    targetId: cred.targetId || '',
    enabled: !!meta.enabled,
    events: meta.events || {},
  };
}

async function sendLine(channelAccessToken, targetId, message) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { Authorization: `Bearer ${channelAccessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: targetId, messages: [{ type: 'text', text: message }] }),
  });
  if (!res.ok) {
    console.error('LINE Messaging API ส่งไม่สำเร็จ:', res.status, await res.text());
  }
}

// เมื่อมีการยื่นใบลาใหม่
exports.onLeaveCreated = onDocumentCreated('leaves/{id}', async (event) => {
  const l = event.data.data();
  const { channelAccessToken, targetId, enabled, events } = await getLineSettings();
  if (!channelAccessToken || !targetId || !enabled || !events.submit) return;
  await sendLine(
    channelAccessToken, targetId,
    `📋 มีการยื่นใบลาใหม่\nชื่อ: ${l.name}\nตำแหน่ง: ${l.position || '-'}\nประเภท: ${l.type}\nวันที่: ${l.start} ถึง ${l.end} (${l.days} วัน)\nเหตุผล: ${l.reason || '-'}\nสถานะ: รอพิจารณา`,
  );
});

// เมื่อสถานะใบลาเปลี่ยน (อนุมัติ / ไม่อนุมัติ / ยกเลิก)
exports.onLeaveUpdated = onDocumentUpdated('leaves/{id}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (before.status === after.status) return;
  const { channelAccessToken, targetId, enabled, events } = await getLineSettings();
  if (!channelAccessToken || !targetId || !enabled) return;

  if (after.status === 'ยกเลิก') {
    if (!events.cancel) return;
    await sendLine(channelAccessToken, targetId, `🚫 ยกเลิกใบลา\nชื่อ: ${after.name}\nประเภท: ${after.type}\nวันที่: ${after.start} ถึง ${after.end}`);
    return;
  }
  if (after.status === 'อนุมัติ' || after.status === 'ไม่อนุมัติ') {
    if (!events.decide) return;
    const icon = after.status === 'อนุมัติ' ? '✅' : '❌';
    await sendLine(
      channelAccessToken, targetId,
      `${icon} ผลการพิจารณาใบลา\nชื่อ: ${after.name}\nประเภท: ${after.type}\nวันที่: ${after.start} ถึง ${after.end}\nผล: ${after.status}${after.decisionNote ? `\nหมายเหตุ: ${after.decisionNote}` : ''}`,
    );
  }
});
