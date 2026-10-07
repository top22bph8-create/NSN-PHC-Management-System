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
const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

initializeApp();
const db = getFirestore();

// URL ของเว็บที่เผยแพร่จริง (GitHub Pages) — ใช้สร้างลิงก์พิมพ์ใบลาที่ส่งเข้าไลน์
const HOSTING_URL = 'https://top22bph8-create.github.io/NSN-PHC-Management-System';
const printLeaveUrl = (id) => `${HOSTING_URL}/#/print-leave/${id}`;

// ต้องตรงกับ src/lib/lineNotify.js (DEFAULT_LINE_EVENTS) — ใช้ค่าเริ่มต้นนี้ merge กับค่าที่บันทึกไว้จริงเสมอ
// เพราะเอกสาร settings/lineNotifyMeta ที่บันทึกไว้ก่อนเพิ่มเหตุการณ์ใหม่ (เช่น assignmentReminder) จะไม่มีคีย์นั้นอยู่เลย
// ถ้าไม่ merge ค่าเริ่มต้น ฟีเจอร์ที่เพิ่มทีหลังจะถูกมองว่า "ปิด" ไปเงียบๆ สำหรับบัญชีที่เคยบันทึกค่าไว้ก่อนหน้านี้
const DEFAULT_LINE_EVENTS = { submit: true, decide: true, cancel: false, assignmentReminder: true, loanBorrow: true, loanRepay: true, loanOverdue: true, birthday: true };

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
    events: { ...DEFAULT_LINE_EVENTS, ...(meta.events || {}) },
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

// โควตาเริ่มต้นต่อปีงบประมาณ — ต้องตรงกับ src/lib/leave.js (DEFAULT_QUOTA) เสมอ คัดลอกมาไว้ที่นี่แยกต่างหาก
// เพราะไฟล์ฝั่ง Cloud Function (CommonJS + firebase-admin) นำเข้าไฟล์ ES module ฝั่งเว็บ (firebase/firestore
// ฝั่งไคลเอนต์) มาใช้ตรงๆ ไม่ได้
const DEFAULT_QUOTA = {
  'ลาป่วย': 60, 'ลากิจส่วนตัว': 45, 'ลาพักผ่อน': 10, 'ลาคลอดบุตร': 90,
  'ลาไปช่วยเหลือภริยาที่คลอดบุตร': 15, 'ลาอุปสมบท/ประกอบพิธีฮัจย์': 120,
};

// สรุป "สถิติการลา/วันคงเหลือ" ของคนยื่นใบลา เฉพาะประเภทการลาที่กำลังยื่นใบนี้เพียงประเภทเดียวตามที่แจ้ง (ไม่แสดงทุก
// ประเภทเหมือนรอบก่อน) — คำนวณจากใบลาทั้งหมดของคนนี้ในปีงบประมาณเดียวกัน (รวมใบที่เพิ่งยื่นใหม่ด้วย เพราะตอนที่ฟังก์ชัน
// นี้ทำงาน เอกสารใบลาใหม่ถูกบันทึกเข้า Firestore เรียบร้อยแล้ว) ส่วนลาพักผ่อนคิดรวมวันยกยอดสะสมจากทำเนียบบุคลากรด้วย
async function buildLeaveStatsLines(l) {
  const [quotaSnap, personSnap, leavesSnap] = await Promise.all([
    db.doc('settings/leaveQuota').get(),
    db.doc(`users/${l.userEmail}`).get(),
    db.collection('leaves').where('fy', '==', l.fy).where('userEmail', '==', l.userEmail).get(),
  ]);
  const quota = { ...DEFAULT_QUOTA, ...(quotaSnap.exists ? quotaSnap.data() : {}) };
  const person = personSnap.exists ? personSnap.data() : {};
  let used = 0;
  let pending = 0;
  leavesSnap.docs.forEach((d) => {
    const x = d.data();
    if (x.type !== l.type) return; // นับเฉพาะประเภทเดียวกับใบที่กำลังยื่นนี้
    const days = Number(x.days) || 0;
    if (x.status === 'อนุมัติ') used += days;
    if (x.status === 'รอพิจารณา') pending += days;
  });

  if (l.type === 'ลาพักผ่อน') {
    const accrued = Number(person.vacationCarryOver) || 0;
    const q = quota[l.type] ?? 0;
    const remain = Math.max(0, q - used);
    return [`🗓️ ลาพักผ่อน: ยกยอดสะสม ${accrued} + สิทธิ์ปีนี้คงเหลือ ${remain} วัน = รวม ${accrued + remain} วัน (ใช้แล้ว ${used} · รออนุมัติ ${pending})`];
  }
  const q = quota[l.type];
  if (q == null) return [`${l.type}: ใช้แล้ว ${used} วัน · รออนุมัติ ${pending} วัน (ไม่จำกัดสิทธิ์)`];
  const remain = Math.max(0, q - used);
  return [`${l.type}: ใช้แล้ว ${used} · รออนุมัติ ${pending} จากโควตา ${q} วัน → คงเหลือ ${remain} วัน`];
}

// สร้างข้อความแบบ Flex พร้อมปุ่ม "อนุมัติ" / "ไม่อนุมัติ" สำหรับใบลาที่เพิ่งยื่นใหม่
// statsLines = สถิติการลา/วันคงเหลือเฉพาะประเภทที่กำลังยื่นของคนนี้ (จาก buildLeaveStatsLines) แสดงประกอบการพิจารณา
function buildLeaveApprovalFlex(id, l, statsLines = []) {
  const summary = `📋 มีการยื่นใบลาใหม่\nชื่อ: ${l.name}\nตำแหน่ง: ${l.position || '-'}\nประเภท: ${l.type}\nวันที่: ${l.start} ถึง ${l.end} (${l.days} วัน)\nเหตุผล: ${l.reason || '-'}`;
  const statsText = statsLines.length ? `\n\n📊 สถิติ/วันคงเหลือ "${l.type}" ของ ${l.name}\n${statsLines.join('\n')}` : '';
  return {
    type: 'flex',
    altText: `${summary}${statsText}\n\nสถานะ: รอพิจารณา`,
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
          ...(statsLines.length ? [
            { type: 'separator', margin: 'sm' },
            { type: 'text', text: `📊 สถิติ/วันคงเหลือ "${l.type}" ของ ${l.name}`, weight: 'bold', size: 'xs', wrap: true, margin: 'sm', color: '#0f766e' },
            ...statsLines.map((t) => ({ type: 'text', text: t, wrap: true, size: 'xs', color: '#475569' })),
          ] : []),
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
  // แนบสถิติการลา/วันคงเหลือทุกประเภทของคนยื่นไปด้วย เพื่อให้ผู้อำนวยการเห็นข้อมูลประกอบการพิจารณาอนุมัติทันทีในไลน์
  // (พลาดไม่เป็นไร ถ้าดึงสถิติไม่สำเร็จก็ยังส่งการ์ดอนุมัติ/ไม่อนุมัติตามปกติ เพียงแต่ไม่มีส่วนสถิติแนบ)
  const statsLines = await buildLeaveStatsLines(l).catch((e) => { console.error('buildLeaveStatsLines error:', e); return []; });
  await pushLine(channelAccessToken, targetId, [buildLeaveApprovalFlex(id, l, statsLines)]);
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

// ต้องตรงกับ src/lib/accounts.js (firebasePassword) — Firebase Auth บังคับรหัสผ่านอย่างน้อย 6 ตัวอักษร
// รหัสผ่านที่สั้นกว่านั้น (เช่น "05449" ที่ผู้อำนวยการต้องการ) จะถูกต่อท้ายด้วย "#nsn" ก่อนส่งให้ Firebase Auth จริง
// ส่วนค่าดิบ (ไม่ต่อท้าย) คือค่าที่ผู้ใช้งานพิมพ์ตอนล็อกอิน และเป็นค่าที่เก็บไว้ในคอลเลกชัน credentials ให้ Super Admin ดู
function firebasePasswordServer(p) {
  const s = String(p);
  return s.length >= 6 ? s : `${s}#nsn`;
}

// รีเซ็ตรหัสผ่านของผู้ใช้งานทุกคน (ยกเว้น Super Admin และบัญชี "รอสมัครใหม่" ที่ยังไม่อนุมัติ) เป็นรหัสผ่านเดียวกัน
// โดยคง Username เดิมของแต่ละคนไว้ (ไม่แตะ Username) — ต้องใช้ Admin SDK (getAuth().updateUser) เพราะ Client SDK
// ของเว็บไม่มีสิทธิ์แก้รหัสผ่านของบัญชีคนอื่น (แก้ได้แต่รหัสผ่านของตัวเองตอนล็อกอินอยู่เท่านั้น) — ดูคำอธิบายเพิ่มเติม
// ในคอมเมนต์ที่ src/pages/Personnel.jsx จุดที่เรียกใช้ฟังก์ชันนี้
// ตรวจสิทธิ์ผู้เรียกเองในนี้ด้วย (ไม่พึ่งกฎ Firestore) เพราะ Admin SDK ข้ามกฎ Firestore ไปโดยสิ้นเชิง
exports.adminBulkResetPassword = onCall(async (request) => {
  const callerEmail = request.auth && request.auth.token && request.auth.token.email;
  if (!callerEmail) throw new HttpsError('unauthenticated', 'ต้องเข้าสู่ระบบก่อน');

  const callerSnap = await db.doc(`users/${callerEmail}`).get();
  const callerRole = callerSnap.exists ? callerSnap.data().role : null;
  if (callerRole !== 'super_admin') throw new HttpsError('permission-denied', 'เฉพาะ Super Admin เท่านั้นที่ใช้งานฟังก์ชันนี้ได้');

  const rawPassword = String((request.data && request.data.password) || '').trim();
  if (!rawPassword) throw new HttpsError('invalid-argument', 'กรุณาระบุรหัสผ่านใหม่');
  const authPassword = firebasePasswordServer(rawPassword);

  const usersSnap = await db.collection('users').get();
  const targets = usersSnap.docs
    .map((d) => d.data())
    .filter((u) => u.email && u.email !== callerEmail && u.role !== 'super_admin' && u.role !== 'pending');

  const results = { success: [], failed: [] };
  for (const u of targets) {
    try {
      const authUser = await getAuth().getUserByEmail(u.email);
      await getAuth().updateUser(authUser.uid, { password: authPassword });
      await db.doc(`users/${u.email}`).set({ mustChangePassword: true }, { merge: true });
      await db.doc(`credentials/${u.email}`).set({
        username: (u.username || u.email.split('@')[0]),
        password: rawPassword,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      results.success.push(u.email);
    } catch (err) {
      console.error('adminBulkResetPassword ล้มเหลวสำหรับ', u.email, err);
      results.failed.push({ email: u.email, name: u.name || u.username || u.email, reason: err.message || String(err) });
    }
  }
  return results;
});

// แปลงวันที่ ISO (YYYY-MM-DD) เป็นรูปแบบไทย วัน/เดือน/ปี พ.ศ. สำหรับใช้ในข้อความแจ้งเตือนไลน์ของทะเบียนสัญญายืมเงินด้านล่าง
function thDate(s) {
  if (!s) return '-';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${Number(y) + 543}`;
}

// เมื่อมีการบันทึกสัญญายืมเงินใหม่ (ทะเบียนคุมสัญญายืมเงิน) — แจ้งเข้ากลุ่มไลน์
exports.onLoanCreated = onDocumentCreated('reg-loan/{id}', async (event) => {
  const l = event.data.data();
  const { channelAccessToken, targetId, enabled, events } = await getLineSettings();
  if (!channelAccessToken || !targetId || !enabled || !events.loanBorrow) return;
  const text = `💵 มีการยืมเงินใหม่\nเลขที่สัญญา: ${l.loanNo}\nผู้ยืม: ${l.borrower}\nเรื่อง: ${l.subject || '-'}\nจำนวนเงิน: ${l.amount || '-'} บาท\nวันที่ยืม: ${thDate(l.loanDate)}\nกำหนดส่งใช้: ${thDate(l.dueDate)}`;
  await sendLine(channelAccessToken, targetId, text);
});

// เมื่อมีการบันทึกการคืนเงินยืม (สถานะเปลี่ยนจาก "ค้างจ่าย" เป็น "ส่งใช้เรียบร้อย") หรือเมื่อขอขยายเวลา (dueDate เปลี่ยน) — แจ้งเข้ากลุ่มไลน์
exports.onLoanUpdated = onDocumentUpdated('reg-loan/{id}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const { channelAccessToken, targetId, enabled, events } = await getLineSettings();
  if (!channelAccessToken || !targetId || !enabled) return;

  if (before.repaid !== after.repaid && after.repaid === 'ส่งใช้เงินยืมเรียบร้อย') {
    if (!events.loanRepay) return;
    const text = `✅ ส่งใช้เงินยืมเรียบร้อย\nเลขที่สัญญา: ${after.loanNo}\nผู้ยืม: ${after.borrower}\nวันที่ส่งใช้: ${thDate(after.repayDate)}${after.repayMethod ? `\nวิธีส่งใช้: ${after.repayMethod}` : ''}${after.repayAmount ? `\nจำนวนเงิน: ${after.repayAmount} บาท` : ''}${after.repayDika ? `\nเลขฎีกาส่งใช้: ${after.repayDika}` : ''}`;
    await sendLine(channelAccessToken, targetId, text);
  }
});

// แจ้งเตือนสัญญายืมเงินที่เกินกำหนดส่งใช้ทุกวัน เวลา 06:00 น. (เวลาไทย) — แจ้งซ้ำทุกวันจนกว่าจะบันทึกการคืนเงินยืมหรือขอขยายเวลาใหม่
exports.dailyLoanOverdueReminder = onSchedule({ schedule: '0 6 * * *', timeZone: 'Asia/Bangkok' }, async () => {
  const { channelAccessToken, targetId, enabled, events } = await getLineSettings();
  if (!channelAccessToken || !targetId || !enabled || !events.loanOverdue) return;

  const today = bangkokDateStr();
  const snap = await db.collection('reg-loan').where('repaid', '==', 'สัญญาค้างจ่ายเงินยืม').get();
  const overdue = snap.docs.map((d) => d.data()).filter((l) => l.dueDate && l.dueDate < today);
  if (!overdue.length) return;

  const lines = overdue
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
    .map((l, i) => `${i + 1}. ${l.loanNo} · ${l.borrower} · ครบกำหนด ${thDate(l.dueDate)} (${l.amount || '-'} บาท)`);
  const text = `⚠️ สัญญายืมเงินเกินกำหนดส่งใช้ (${overdue.length} รายการ)\n\n${lines.join('\n')}`;
  await sendLine(channelAccessToken, targetId, text);
});

// คำอวยพรวันเกิดหลายๆ แบบ (สุ่มเลือกไม่ให้ซ้ำแบบเดิมทุกครั้ง) — ใช้กับ dailyBirthdayReminder ด้านล่าง
const BIRTHDAY_GREETINGS = [
  'ขอให้มีความสุขมากๆ สุขภาพแข็งแรง สมหวังในทุกสิ่งที่ตั้งใจไว้นะคะ/ครับ 🥳',
  'ขอให้วันนี้เป็นวันพิเศษ เต็มไปด้วยความสุขและเสียงหัวเราะตลอดทั้งปีเลยนะคะ/ครับ 🎉',
  'ขอให้สุขภาพแข็งแรง ร่ำรวยเงินทอง โชคดีตลอดปีนะคะ/ครับ 🌸✨',
  'สุขสันต์วันเกิดนะคะ/ครับ ขอให้ทุกวันเป็นวันดีๆ เหมือนวันนี้ 💐',
  'ขอให้เติบโตก้าวหน้าในหน้าที่การงาน และมีคนที่รักอยู่รอบตัวเสมอนะคะ/ครับ 🎁',
];

// แจ้งเตือนวันคล้ายวันเกิดบุคลากรทุกวัน เวลา 06:00 น. (เวลาไทย) — อ่านจากช่อง "birthday" (YYYY-MM-DD) ในทะเบียนบุคลากร
// เทียบเฉพาะเดือน/วัน (ไม่สนปี) กับวันนี้ ส่งเฉพาะวันที่มีคนครบรอบวันเกิดจริงเท่านั้น พร้อมคำอวยพรและอิโมจิน่ารักๆ
exports.dailyBirthdayReminder = onSchedule({ schedule: '0 6 * * *', timeZone: 'Asia/Bangkok' }, async () => {
  const { channelAccessToken, targetId, enabled, events } = await getLineSettings();
  if (!channelAccessToken || !targetId || !enabled || !events.birthday) return;

  const today = bangkokDateStr();
  const mmdd = today.slice(5); // "MM-DD" ไม่สนปีเกิด
  const usersSnap = await db.collection('users').get();
  const celebrants = usersSnap.docs
    .map((d) => d.data())
    .filter((u) => u.birthday && String(u.birthday).slice(5) === mmdd && u.role !== 'pending');
  if (!celebrants.length) return;

  const daySeed = Number(today.replace(/-/g, ''));
  for (let i = 0; i < celebrants.length; i++) {
    const u = celebrants[i];
    const greeting = BIRTHDAY_GREETINGS[(daySeed + i) % BIRTHDAY_GREETINGS.length];
    const text = `🎉🎂 วันนี้เป็นวันคล้ายวันเกิดของ "${u.name}"${u.position ? ` (${u.position})` : ''} 🎂🎉\n\n${greeting} 🌟🎈`;
    await sendLine(channelAccessToken, targetId, text);
  }
});

// ยกยอดวันลาพักผ่อน (10 วัน/ปีงบ) ที่ใช้ไม่หมดในปีงบประมาณ ไปเป็น "วันลาสะสม" ของแต่ละคนโดยอัตโนมัติตามที่แจ้ง — รันปีละ
// ครั้งเดียวตอนต้นปีงบประมาณใหม่ (1 ต.ค. เวลา 01:00 น. เวลาไทย) คำนวณจากปีงบที่เพิ่งปิดไป (30 ก.ย.) ของแต่ละคน:
// วันลาพักผ่อนคงเหลือ = โควตาลาพักผ่อนของปีนั้น (ตั้งค่าได้ที่ "ตั้งค่าระบบ") - วันที่ใช้ไปแล้ว(อนุมัติ) แล้วนำส่วนที่เหลือ
// ไปบวกเพิ่มเข้าช่อง "ยกยอดลาพักผ่อนสะสม" ในทำเนียบบุคลากร (ยอดเดิมไม่ถูกล้าง สะสมพอกพูนไปเรื่อยๆ ทุกปี ไม่ได้กำหนดเพดาน
// สูงสุดไว้ — ถ้าต้องการจำกัดเพดานสะสมสูงสุดตามระเบียบจริง แจ้งมาได้ จะเพิ่มเงื่อนไขให้) ดูยอดสะสมปัจจุบันของแต่ละคนได้ที่
// หน้า "ทำเนียบบุคลากร" หรือการ์ด "ลาพักผ่อน" ในหน้า "ระบบควบคุมวันลา" (แสดงยอดสะสม + สิทธิ์ปีนี้คงเหลือ = รวม)
exports.annualVacationCarryOver = onSchedule({ schedule: '0 1 1 10 *', timeZone: 'Asia/Bangkok' }, async () => {
  const [y] = bangkokDateStr().split('-').map(Number); // ปี ค.ศ. ของวันที่รัน (1 ต.ค.)
  const endedFy = y + 543; // ปีงบประมาณที่เพิ่งปิดไปเมื่อวานนี้ (30 ก.ย.)

  const [quotaSnap, usersSnap, leavesSnap] = await Promise.all([
    db.doc('settings/leaveQuota').get(),
    db.collection('users').get(),
    db.collection('leaves').where('fy', '==', endedFy).where('type', '==', 'ลาพักผ่อน').where('status', '==', 'อนุมัติ').get(),
  ]);
  const vacQuota = Number((quotaSnap.exists && quotaSnap.data()['ลาพักผ่อน']) ?? DEFAULT_QUOTA['ลาพักผ่อน']) || 0;
  const usedByEmail = {};
  leavesSnap.docs.forEach((d) => {
    const x = d.data();
    usedByEmail[x.userEmail] = (usedByEmail[x.userEmail] || 0) + (Number(x.days) || 0);
  });

  const updates = [];
  usersSnap.docs.forEach((d) => {
    const u = d.data();
    if (u.role === 'pending') return;
    const used = usedByEmail[u.email] || 0;
    const unused = Math.max(0, vacQuota - used);
    if (unused <= 0) return;
    const newCarry = (Number(u.vacationCarryOver) || 0) + unused;
    updates.push(d.ref.update({ vacationCarryOver: newCarry }));
  });
  await Promise.all(updates);
  console.log(`annualVacationCarryOver: ยกยอดลาพักผ่อนปีงบ ${endedFy} ให้ ${updates.length} คน`);
});
