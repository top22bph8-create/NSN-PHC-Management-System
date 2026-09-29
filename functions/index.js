/**
 * Cloud Function เสริม: แจ้งเตือนเข้ากลุ่มไลน์ผ่าน LINE Messaging API เมื่อมีการยื่น/อนุมัติ/ไม่อนุมัติ/ยกเลิกใบลา
 * พร้อมปุ่ม "อนุมัติ/ไม่อนุมัติ" ให้ผู้อำนวยการกดตัดสินใจได้จากในไลน์กลุ่มโดยตรง แล้วส่งลิงก์ไปพิมพ์ใบลาให้อัตโนมัติ
 *
 * หมายเหตุสำคัญ: LINE ได้ปิดบริการ "LINE Notify" ถาวรตั้งแต่ 31 มี.ค. 2568 (2025) แล้ว ไฟล์นี้จึงใช้ LINE Messaging API
 * แทน (ต้องมี LINE Official Account ของหน่วยงานเอง + Channel access token + Target ID ของกลุ่ม/ผู้ใช้ปลายทาง)
 *
 * ทำไมต้องมีไฟล์นี้แยกจากเว็บ: LINE Messaging API ไม่อนุญาตให้เว็บเบราว์เซอร์เรียกตรง (ติด CORS) จึงต้องมีโค้ดฝั่ง
 * เซิร์ฟเวอร์ทำหน้าที่ส่งแทน — Cloud Function นี้ทำงานอัตโนมัติทุกครั้งที่มีการสร้าง/แก้ไขเอกสารในทะเบียนวันลา
 * (Firestore) โดยไม่ต้องให้เว็บเรียกเอง
 *
 * หมายเหตุเรื่องไฟล์ PDF: LINE Messaging API ไม่รองรับการส่งไฟล์ PDF แนบเข้าแชทโดยตรงจากฝั่งบอท (ส่งได้แค่
 * รูปภาพ/วิดีโอ/ข้อความ/ปุ่ม ฯลฯ) จึงส่งเป็น "ลิงก์" ไปเปิดหน้าใบลาที่พร้อมพิมพ์แทน (หน้าเดียวกับที่เว็บมีอยู่แล้ว)
 * ผู้เปิดลิงก์กดปุ่ม "พิมพ์ / บันทึกเป็น PDF" เองอีกทีในหน้านั้น
 *
 * วิธีติดตั้ง/เผยแพร่ และวิธีเตรียม LINE Official Account + หา Target ID: ดู README.md หัวข้อ "แจ้งเตือนไลน์"
 */
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

// URL ของเว็บที่เผยแพร่จริง (GitHub Pages) — ใช้สร้างลิงก์พิมพ์ใบลาที่ส่งเข้าไลน์
const HOSTING_URL = 'https://top22bph8-create.github.io/NSN-PHC-Management-System';
const printLeaveUrl = (id) => `${HOSTING_URL}/#/print-leave/${id}`;

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
    // LINE User ID ของผู้อำนวยการ — ใช้ตรวจสิทธิ์ตอนกดปุ่มอนุมัติ/ไม่อนุมัติในไลน์กลุ่ม (ไม่ใช่ข้อมูลลับ อ่านได้ปกติ)
    directorUserId: meta.directorUserId || '',
  };
}

async function pushLine(channelAccessToken, targetId, messages) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { Authorization: `Bearer ${channelAccessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: targetId, messages }),
  });
  if (!res.ok) {
    console.error('LINE push ส่งไม่สำเร็จ:', res.status, await res.text());
  }
}

async function replyLine(channelAccessToken, replyToken, text) {
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { Authorization: `Bearer ${channelAccessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
  });
  if (!res.ok) {
    console.error('LINE reply ส่งไม่สำเร็จ:', res.status, await res.text());
  }
}

async function sendLine(channelAccessToken, targetId, message) {
  await pushLine(channelAccessToken, targetId, [{ type: 'text', text: message }]);
}

// สร้างข้อความแบบ Flex พร้อมปุ่ม "อนุมัติ" / "ไม่อนุมัติ" สำหรับใบลาที่เพิ่งยื่นใหม่
function buildLeaveApprovalFlex(id, l) {
  const summary = `📋 มีการยื่นใบลาใหม่\nชื่อ: ${l.name}\nตำแหน่ง: ${l.position || '-'}\nประเภท: ${l.type}\nวันที่: ${l.start} ถึง ${l.end} (${l.days} วัน)\nเหตุผล: ${l.reason || '-'}`;
  return {
    type: 'flex',
    altText: `${summary}\nสถานะ: รอพิจารณา`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          { type: 'text', text: '📋 มีการยื่นใบลาใหม่', weight: 'bold', size: 'md', wrap: true },
          { type: 'text', text: `ชื่อ: ${l.name}`, wrap: true, size: 'sm' },
          { type: 'text', text: `ตำแหน่ง: ${l.position || '-'}`, wrap: true, size: 'sm' },
          { type: 'text', text: `ประเภท: ${l.type}`, wrap: true, size: 'sm' },
          { type: 'text', text: `วันที่: ${l.start} ถึง ${l.end} (${l.days} วัน)`, wrap: true, size: 'sm' },
          { type: 'text', text: `เหตุผล: ${l.reason || '-'}`, wrap: true, size: 'sm' },
          { type: 'text', text: 'สถานะ: รอพิจารณา', wrap: true, size: 'sm', weight: 'bold', color: '#b45309' },
        ],
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          {
            type: 'button', style: 'primary', color: '#16a34a', height: 'sm',
            action: { type: 'postback', label: '✅ อนุมัติ', data: `action=approve&leaveId=${id}`, displayText: `อนุมัติใบลาของ ${l.name}` },
          },
          {
            type: 'button', style: 'primary', color: '#dc2626', height: 'sm',
            action: { type: 'postback', label: '❌ ไม่อนุมัติ', data: `action=reject&leaveId=${id}`, displayText: `ไม่อนุมัติใบลาของ ${l.name}` },
          },
        ],
      },
    },
  };
}

// Webhook รับข้อความ/ปุ่มกดจาก LINE — ทำ 2 หน้าที่:
// 1) "หา Target ID / LINE User ID" ของกลุ่ม/ผู้ใช้ปลายทาง (LINE ไม่มีหน้าจอโชว์ตรงๆ ต้องอ่านจากเหตุการณ์ที่ยิงเข้ามา)
// 2) รับการกดปุ่ม "อนุมัติ/ไม่อนุมัติ" จากผู้อำนวยการ แล้วอัปเดตสถานะใบลาให้อัตโนมัติ
// วิธีใช้: ตั้งค่า URL ของฟังก์ชันนี้เป็น Webhook URL ใน LINE Developers Console (Messaging API) แล้วเปิดสวิตช์ "Use webhook"
// หมายเหตุ: ฟังก์ชันนี้ไม่ได้ตรวจลายเซ็น (signature) ของ LINE สำหรับส่วนตรวจจับ Target ID (อ่านอย่างเดียว ไม่กระทบข้อมูลจริง)
// แต่ส่วนกดอนุมัติ/ไม่อนุมัติมีการตรวจ LINE User ID ของผู้ส่งเทียบกับผู้อำนวยการที่ตั้งค่าไว้ก่อนจะแก้ข้อมูลจริงเสมอ
exports.lineWebhook = onRequest(async (req, res) => {
  try {
    const events = (req.body && req.body.events) || [];
    const now = new Date().toISOString();
    const additions = {};
    for (const ev of events) {
      const src = ev.source || {};
      const id = src.groupId || src.roomId || src.userId;
      if (!id) continue;
      const type = src.groupId ? 'กลุ่ม' : src.roomId ? 'ห้องแชท' : 'รายบุคคล';
      const lastMessage = ev.type === 'message' && ev.message && ev.message.type === 'text'
        ? ev.message.text
        : `(เหตุการณ์: ${ev.type})`;
      additions[id] = { type, lastMessage, at: now };
    }
    if (Object.keys(additions).length) {
      // อ่านค่า targets เดิมมาก่อน แล้วรวม (merge) เป็น object ใหม่ทั้งก้อนในโค้ด แทนการใช้ field path
      // แบบมีจุด ("targets.รหัส") ตรงๆ ใน set(merge:true) — บาง client/เวอร์ชันตีความ key ที่มีจุดเป็นชื่อ
      // ฟิลด์ตรงๆ (flat) แทนที่จะเป็นการซ้อนข้อมูล (nested) ทำให้อ่านค่า targets ฝั่งเว็บไม่เจอ
      const ref = db.doc('settings/lineWebhookLog');
      const snap = await ref.get();
      const targets = (snap.exists && snap.data().targets) || {};
      await ref.set({ targets: { ...targets, ...additions } }, { merge: true });
    }

    // จัดการปุ่มอนุมัติ/ไม่อนุมัติ แยกจากส่วนตรวจจับ Target ID ด้านบน
    for (const ev of events) {
      if (ev.type !== 'postback') continue;
      await handleLeavePostback(ev);
    }
  } catch (e) {
    console.error('lineWebhook error:', e);
  }
  // ต้องตอบ 200 กลับให้ LINE เสมอและเร็ว มิฉะนั้น LINE จะขึ้นสถานะ error ให้ Webhook นี้
  res.status(200).send('OK');
});

async function handleLeavePostback(ev) {
  const params = new URLSearchParams((ev.postback && ev.postback.data) || '');
  const action = params.get('action');
  const leaveId = params.get('leaveId');
  const replyToken = ev.replyToken;
  if (!action || !leaveId) return;

  const { channelAccessToken, directorUserId } = await getLineSettings();
  if (!channelAccessToken) return;

  const reply = (text) => replyToken && replyLine(channelAccessToken, replyToken, text);

  if (!directorUserId) {
    await reply('⚠️ ยังไม่ได้ตั้งค่า LINE ID ของผู้อำนวยการในระบบ กรุณาแจ้งผู้ดูแลระบบให้ตั้งค่าในหน้า "ตั้งค่าระบบ" ก่อน');
    return;
  }
  const senderId = (ev.source || {}).userId;
  if (senderId !== directorUserId) {
    await reply('⚠️ ขออภัย ปุ่มนี้ใช้ได้เฉพาะผู้อำนวยการเท่านั้น');
    return;
  }

  const ref = db.doc(`leaves/${leaveId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    await reply('ไม่พบใบลานี้ในระบบแล้ว (อาจถูกลบไปก่อนหน้านี้)');
    return;
  }
  const cur = snap.data();
  if (cur.status !== 'รอพิจารณา') {
    await reply(`ใบลานี้ถูกพิจารณาไปแล้วก่อนหน้านี้ (สถานะปัจจุบัน: ${cur.status})`);
    return;
  }

  const newStatus = action === 'approve' ? 'อนุมัติ' : 'ไม่อนุมัติ';
  await ref.update({
    status: newStatus,
    decidedBy: 'ผู้อำนวยการ (ผ่านไลน์)',
    decidedAt: FieldValue.serverTimestamp(),
  });
  // การเขียนนี้จะไปสั่งให้ onLeaveUpdated ด้านล่างทำงานต่อเอง (ส่งข้อความผลพิจารณา + ลิงก์พิมพ์ใบลาเข้ากลุ่ม)
  await reply(newStatus === 'อนุมัติ' ? `✅ อนุมัติใบลาของ ${cur.name} เรียบร้อยแล้ว` : `❌ ไม่อนุมัติใบลาของ ${cur.name} เรียบร้อยแล้ว`);
}

// เมื่อมีการยื่นใบลาใหม่ — ส่งการ์ดพร้อมปุ่มอนุมัติ/ไม่อนุมัติให้ผู้อำนวยการกดตัดสินใจได้จากในไลน์กลุ่มโดยตรง
exports.onLeaveCreated = onDocumentCreated('leaves/{id}', async (event) => {
  const id = event.params.id;
  const l = event.data.data();
  const { channelAccessToken, targetId, enabled, events } = await getLineSettings();
  if (!channelAccessToken || !targetId || !enabled || !events.submit) return;
  await pushLine(channelAccessToken, targetId, [buildLeaveApprovalFlex(id, l)]);
});

// เมื่อสถานะใบลาเปลี่ยน (อนุมัติ / ไม่อนุมัติ / ยกเลิก) — ไม่ว่าจะเปลี่ยนจากในเว็บหรือกดปุ่มในไลน์ก็ตาม
exports.onLeaveUpdated = onDocumentUpdated('leaves/{id}', async (event) => {
  const id = event.params.id;
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
    let text = `${icon} ผลการพิจารณาใบลา\nชื่อ: ${after.name}\nประเภท: ${after.type}\nวันที่: ${after.start} ถึง ${after.end}\nผล: ${after.status}${after.decisionNote ? `\nหมายเหตุ: ${after.decisionNote}` : ''}`;
    if (after.status === 'อนุมัติ') {
      text += `\n\n🖨️ พิมพ์ใบลา (เปิดแล้วกด "พิมพ์ / บันทึกเป็น PDF"):\n${printLeaveUrl(id)}`;
    }
    await sendLine(channelAccessToken, targetId, text);
  }
});

// วันที่ปัจจุบันแบบ YYYY-MM-DD ตามเวลาไทย (UTC+7 คงที่ ไม่มีปรับเวลาออมแสง จึงบวกตรงๆ ได้โดยไม่ต้องใช้ Intl timezone)
function bangkokDateStr() {
  const bkk = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return bkk.toISOString().slice(0, 10);
}

// แจ้งเตือนปฏิทินมอบหมายงานทุกวัน เวลา 06:00 น. (เวลาไทย) — ส่งเฉพาะวันที่มีการสร้างปฏิทินมอบหมายงานไว้ล่วงหน้าเท่านั้น
// (ไม่มีงานมอบหมายในวันนั้น = ไม่ส่งข้อความ) อ่านจากคอลเลกชัน "assignments" (หน้า "ปฏิทินมอบหมายงาน" ในเว็บ)
exports.dailyAssignmentReminder = onSchedule({ schedule: '0 6 * * *', timeZone: 'Asia/Bangkok' }, async () => {
  const { channelAccessToken, targetId, enabled, events } = await getLineSettings();
  if (!channelAccessToken || !targetId || !enabled || !events.assignmentReminder) return;

  const today = bangkokDateStr();
  const snap = await db.collection('assignments').where('date', '==', today).get();
  if (snap.empty) return;

  const items = snap.docs.map((d) => d.data()).sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
  const lines = items.map((a, i) => {
    const names = (a.assignees || []).map((p) => p.name).join(', ') || '-';
    const timePart = a.time ? ` เวลา ${a.time}` : '';
    const locPart = a.location ? ` ณ ${a.location}` : '';
    const notePart = a.note ? `\n   หมายเหตุ: ${a.note}` : '';
    return `${i + 1}. [${a.type}] ${a.title}${timePart}${locPart}\n   ผู้ปฏิบัติงาน: ${names}${notePart}`;
  });
  const text = `📅 แจ้งเตือนงานมอบหมายวันนี้ (${today})\n\n${lines.join('\n\n')}`;
  await sendLine(channelAccessToken, targetId, text);
});
