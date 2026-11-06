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
const { onDocumentCreated, onDocumentUpdated, onDocumentWritten } = require('firebase-functions/v2/firestore');
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
const printVehicleUrl = (id) => `${HOSTING_URL}/#/print-vehicle/${id}`;

// ต้องตรงกับ src/lib/lineNotify.js (DEFAULT_LINE_EVENTS) — ใช้ค่าเริ่มต้นนี้ merge กับค่าที่บันทึกไว้จริงเสมอ
// เพราะเอกสาร settings/lineNotifyMeta ที่บันทึกไว้ก่อนเพิ่มเหตุการณ์ใหม่ (เช่น assignmentReminder) จะไม่มีคีย์นั้นอยู่เลย
// ถ้าไม่ merge ค่าเริ่มต้น ฟีเจอร์ที่เพิ่มทีหลังจะถูกมองว่า "ปิด" ไปเงียบๆ สำหรับบัญชีที่เคยบันทึกค่าไว้ก่อนหน้านี้
const DEFAULT_LINE_EVENTS = { submit: true, decide: true, cancel: false, assignmentReminder: true, loanBorrow: true, loanRepay: true, loanOverdue: true, birthday: true, taxOverdueReminder: true, vehicleSubmit: true, vehicleDecide: true, unitDuty: true };

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
    // ระบบขออนุญาตใช้รถ: ใช้ไลน์กลุ่มแยกต่างหาก (vehicleTargetId เก็บใน settings/lineNotify เขียนได้ฝ่ายเดียวเหมือน targetId)
    // ผู้กดอนุมัติการใช้รถในไลน์ได้ = ผู้อำนวยการ (directorUserId เดียวกับระบบใบลา) เท่านั้น
    vehicleTargetId: cred.vehicleTargetId || '',
    // คลินิกแพทย์แผนไทย: ไลน์กลุ่มแยกสำหรับแจ้งเตือนการจองคิวออนไลน์
    thaiTargetId: cred.thaiTargetId || '',
  };
}

// ===== บันทึกสถานะการส่งไลน์ (settings/lineStatus) — เดิมถ้าส่งไม่สำเร็จ (เช่นโควตาข้อความรายเดือนเต็ม HTTP 429) จะแค่ log เงียบๆ ไม่มีใครรู้ =====
// หน้าตั้งค่าและแดชบอร์ด (เฉพาะ Super Admin) อ่านเอกสารนี้เพื่อเตือน "โควตาไลน์เต็ม/ส่งไม่สำเร็จ"
async function recordLineResult(ok, status, bodyText) {
  try {
    const ref = db.doc('settings/lineStatus');
    if (ok) {
      const cur = await ref.get();
      if (cur.exists && cur.data().lastError) await ref.set({ lastError: FieldValue.delete(), recoveredAt: FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    const quotaFull = status === 429 || /monthly limit|reached your/i.test(bodyText || '');
    await ref.set({ lastError: { at: FieldValue.serverTimestamp(), status, quotaFull, message: String(bodyText || '').slice(0, 300) } }, { merge: true });
  } catch (e) { console.error('บันทึกสถานะไลน์ไม่สำเร็จ:', e.message); }
}

async function fetchLineQuota(channelAccessToken) {
  const h = { Authorization: `Bearer ${channelAccessToken}` };
  const [q, c] = await Promise.all([
    fetch('https://api.line.me/v2/bot/message/quota', { headers: h }),
    fetch('https://api.line.me/v2/bot/message/quota/consumption', { headers: h }),
  ]);
  if (!q.ok || !c.ok) throw new Error(`LINE ตอบกลับ HTTP ${q.ok ? c.status : q.status}`);
  const qj = await q.json(); const cj = await c.json();
  const limited = qj.type === 'limited';
  const limit = limited ? Number(qj.value) : null;
  const used = Number(cj.totalUsage) || 0;
  return { limited, limit, used, remaining: limited ? Math.max(0, limit - used) : null, percent: limited && limit ? Math.round((used / limit) * 100) : null };
}

async function pushLine(channelAccessToken, targetId, messages) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { Authorization: `Bearer ${channelAccessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: targetId, messages }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error('LINE push ส่งไม่สำเร็จ:', res.status, t);
    await recordLineResult(false, res.status, t);
  } else {
    await recordLineResult(true);
  }
}

// เหมือน pushLine ด้านบน แต่ "โยน error ออกมาจริง" แทนการกลืน error ไว้เงียบๆ แล้วแค่ log — ใช้เฉพาะจุดที่ผู้ใช้กดเองและรอผลจริง
// (เช่น "ส่งแจ้งเตือนไลน์ซ้ำ") เพื่อให้เห็นสาเหตุตรงๆ บนหน้าเว็บ (เช่น Channel access token หมดอายุ/ผิด, บอทไม่ได้อยู่ในกลุ่มนั้นแล้ว)
// ต่างจาก pushLine ที่ใช้ตอนแจ้งเตือนอัตโนมัติ (onLeaveCreated ฯลฯ) ซึ่งควรกลืน error ไว้ ไม่ให้กระทบขั้นตอนหลัก (บันทึกใบลา) ที่ผู้ใช้กำลังรออยู่
async function pushLineOrThrow(channelAccessToken, targetId, messages) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { Authorization: `Bearer ${channelAccessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: targetId, messages }),
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    console.error('LINE push ส่งไม่สำเร็จ (resend):', res.status, bodyText);
    await recordLineResult(false, res.status, bodyText);
    throw new Error(`LINE ปฏิเสธการส่งข้อความ (HTTP ${res.status}): ${bodyText || 'ไม่มีรายละเอียดเพิ่มเติม'}`);
  }
  await recordLineResult(true); // ส่งสำเร็จ → ล้างแบนเนอร์แจ้งเตือนสีแดงบนแดชบอร์ด
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
      if (ev.type === 'message') { await handleThaiPatientMessage(ev); continue; }
      if (ev.type !== 'postback') continue;
      const pd = new URLSearchParams((ev.postback && ev.postback.data) || '');
      if (pd.get('thaiBookingId')) await handleThaiPostback(ev);
      else if (pd.get('vehicleId')) await handleVehiclePostback(ev);
      else await handleLeavePostback(ev);
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

// ===== ระบบขออนุญาตใช้ยานพาหนะราชการ: การ์ดอนุมัติในไลน์กลุ่มแยกสำหรับงานรถ =====
const asList = (v) => (Array.isArray(v) ? v.filter(Boolean) : v ? [String(v)] : []);

function vehicleSummaryLines(v) {
  // ภารกิจที่ติ๊กไว้ (ข้อ "ภารกิจอื่น ๆ" แสดงรายละเอียดที่ผู้ขอพิมพ์ไว้แทน) — ใช้เป็นเหตุผลในการขอใช้รถด้วย
  const missions = asList(v.missionType).map((m) => (m.startsWith('ภารกิจอื่น ๆ') && v.missionOther ? `ภารกิจอื่น ๆ: ${v.missionOther}` : m));
  const missionText = missions.length ? missions.map((m, i) => `${i + 1}. ${m}`).join('\n') : '-';
  return [
    `ผู้ขอ/ผู้รับผิดชอบ: ${v.requester || '-'}${v.requesterPosition ? ` (${v.requesterPosition})` : ''}`,
    `รถ: ${v.plate || '-'}`,
    `คนขับ: ${v.driver || '-'}`,
    `วันที่ใช้: ${v.useDate || '-'}${v.wantDeparture ? ` ออกเดินทาง ${v.wantDeparture} น.` : ''}`,
    `ภารกิจ:\n${missionText}`,
    `ปลายทาง: ${v.destination || '-'}`,
  ];
}

function buildVehicleApprovalFlex(id, v) {
  const lines = vehicleSummaryLines(v);
  return {
    type: 'flex',
    altText: `🚗 มีคำขออนุญาตใช้รถใหม่\n${lines.join('\n')}\n\nสถานะ: รออนุมัติ`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm',
        contents: [
          { type: 'text', text: '🚗 มีคำขออนุญาตใช้รถใหม่', weight: 'bold', size: 'md', wrap: true },
          ...lines.map((t) => ({ type: 'text', text: t, wrap: true, size: 'sm' })),
          { type: 'text', text: 'สถานะ: รออนุมัติ', wrap: true, size: 'sm', weight: 'bold', color: '#b45309' },
        ],
      },
      footer: {
        type: 'box', layout: 'horizontal', spacing: 'sm',
        contents: [
          { type: 'button', style: 'primary', color: '#16a34a', height: 'sm', action: { type: 'postback', label: '✅ อนุมัติ', data: `action=approve&vehicleId=${id}`, displayText: `อนุมัติการใช้รถของ ${v.requester}` } },
          { type: 'button', style: 'primary', color: '#dc2626', height: 'sm', action: { type: 'postback', label: '❌ ไม่อนุมัติ', data: `action=reject&vehicleId=${id}`, displayText: `ไม่อนุมัติการใช้รถของ ${v.requester}` } },
        ],
      },
    },
  };
}

async function handleVehiclePostback(ev) {
  const params = new URLSearchParams((ev.postback && ev.postback.data) || '');
  const action = params.get('action');
  const vehicleId = params.get('vehicleId');
  const replyToken = ev.replyToken;
  if (!action || !vehicleId) return;

  const { channelAccessToken, directorUserId } = await getLineSettings();
  if (!channelAccessToken) return;
  const reply = (text) => replyToken && replyLine(channelAccessToken, replyToken, text);

  // ผู้มีสิทธิ์กดอนุมัติการใช้รถ: ผู้อำนวยการเท่านั้น (LINE User ID เดียวกับที่ตั้งไว้สำหรับอนุมัติใบลา ในหน้า "ตั้งค่าระบบ")
  if (!directorUserId) {
    await reply('⚠️ ยังไม่ได้ตั้งค่า LINE ID ของผู้อำนวยการในระบบ กรุณาแจ้งผู้ดูแลระบบให้ตั้งค่าในหน้า "ตั้งค่าระบบ" ก่อน');
    return;
  }
  const senderId = (ev.source || {}).userId;
  if (senderId !== directorUserId) {
    await reply('⚠️ ขออภัย ปุ่มนี้ใช้ได้เฉพาะผู้อำนวยการเท่านั้น');
    return;
  }
  const by = 'ผู้อำนวยการ (ผ่านไลน์)';

  const ref = db.doc(`vehicle/${vehicleId}`);
  const snap = await ref.get();
  if (!snap.exists) { await reply('ไม่พบคำขอใช้รถนี้ในระบบแล้ว (อาจถูกลบไปก่อนหน้านี้)'); return; }
  const cur = snap.data();
  if (cur.status !== 'รออนุมัติ') {
    await reply(`คำขอนี้ถูกพิจารณาไปแล้วก่อนหน้านี้ (สถานะปัจจุบัน: ${cur.status}${cur.decidedBy ? ` โดย ${cur.decidedBy}` : ''})`);
    return;
  }
  const newStatus = action === 'approve' ? 'อนุมัติ' : 'ไม่อนุมัติ';
  // ฟิลด์เหมือนที่ปุ่มอนุมัติบนเว็บบันทึก (RegistryPage.jsx submitVehicleAction) — decidedAt เป็นวันที่ YYYY-MM-DD ตามเวลาไทย
  await ref.update({ status: newStatus, decidedBy: by, decidedAt: bangkokDateStr() });
  // การเขียนนี้จะไปสั่งให้ onVehicleUpdated ทำงานต่อ (ส่งผลพิจารณา + ลิงก์พิมพ์แบบ 3 เข้ากลุ่ม)
  await reply(newStatus === 'อนุมัติ' ? `✅ อนุมัติการใช้รถของ ${cur.requester} เรียบร้อยแล้ว` : `❌ ไม่อนุมัติการใช้รถของ ${cur.requester} เรียบร้อยแล้ว`);
}


async function pushVehicleApprovalCard(id, v) {
  const { channelAccessToken, vehicleTargetId, enabled, events } = await getLineSettings();
  if (!channelAccessToken || !vehicleTargetId || !enabled || !events.vehicleSubmit) return;
  await pushLine(channelAccessToken, vehicleTargetId, [buildVehicleApprovalFlex(id, v)]);
}

// คำขอใช้รถใหม่ที่ส่งเข้าสถานะ "รออนุมัติ" ทันที — ส่งการ์ดพร้อมปุ่มอนุมัติ/ไม่อนุมัติเข้าไลน์กลุ่มงานรถ
exports.onVehicleCreated = onDocumentCreated('vehicle/{id}', async (event) => {
  const v = event.data.data();
  if (v.status !== 'รออนุมัติ') return;
  await pushVehicleApprovalCard(event.params.id, v);
});

// สถานะเปลี่ยน: ฉบับร่าง -> รออนุมัติ (ส่งการ์ดขออนุมัติ) / อนุมัติ / ไม่อนุมัติ / ยกเลิก (แจ้งผลเข้ากลุ่ม ไม่ว่าจะเปลี่ยนจากเว็บหรือปุ่มในไลน์)
exports.onVehicleUpdated = onDocumentUpdated('vehicle/{id}', async (event) => {
  const id = event.params.id;
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (before.status === after.status) return;
  if (after.status === 'รออนุมัติ') { await pushVehicleApprovalCard(id, after); return; }
  const { channelAccessToken, vehicleTargetId, enabled, events } = await getLineSettings();
  if (!channelAccessToken || !vehicleTargetId || !enabled) return;

  if (after.status === 'ยกเลิก') {
    if (!events.cancel) return;
    await sendLine(channelAccessToken, vehicleTargetId, `🚫 ยกเลิกคำขอใช้รถ\nผู้ขอ: ${after.requester}\nรถ: ${after.plate}\nวันที่: ${after.useDate}${after.decidedNote ? `\nเหตุผล: ${after.decidedNote}` : ''}`);
    return;
  }
  if (after.status === 'อนุมัติ' || after.status === 'ไม่อนุมัติ') {
    if (!events.vehicleDecide) return;
    const icon = after.status === 'อนุมัติ' ? '✅' : '❌';
    let text = `${icon} ผลการพิจารณาขออนุญาตใช้รถ\n${vehicleSummaryLines(after).join('\n')}\nผล: ${after.status}${after.decidedBy ? ` (โดย ${after.decidedBy})` : ''}${after.decidedNote ? `\nหมายเหตุ: ${after.decidedNote}` : ''}`;
    if (after.status === 'อนุมัติ') text += `\n\n🖨️ พิมพ์แบบ 3 ขออนุญาตใช้รถ (เปิดแล้วกด "พิมพ์ / บันทึกเป็น PDF"):\n${printVehicleUrl(id)}`;
    await sendLine(channelAccessToken, vehicleTargetId, text);
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


// จัดการบัญชีล็อกอิน (Firebase Auth) แทนการเข้า Firebase Console เอง — Super Admin เท่านั้น
// op 'set': ตั้ง/เปลี่ยนรหัสผ่านของบัญชี (ถ้ายังไม่มีบัญชีล็อกอินจะสร้างให้ ไม่ต้องเปิด Enable sign-up และไม่ต้องลบผู้ใช้ใน Console)
// op 'delete': ลบบัญชีล็อกอินของอีเมลนั้นทิ้ง (ใช้ตอนลบผู้ใช้/เปลี่ยน Username)
exports.adminAccountOp = onCall(async (request) => {
  const callerEmail = request.auth && request.auth.token && request.auth.token.email;
  if (!callerEmail) throw new HttpsError('unauthenticated', 'ต้องเข้าสู่ระบบก่อน');
  const callerSnap = await db.doc(`users/${callerEmail}`).get();
  if (!callerSnap.exists || callerSnap.data().role !== 'super_admin') throw new HttpsError('permission-denied', 'เฉพาะ Super Admin เท่านั้น');
  const { op, email, password } = request.data || {};
  const target = String(email || '').trim().toLowerCase();
  if (!target) throw new HttpsError('invalid-argument', 'ไม่ระบุบัญชี');
  if (op === 'set') {
    const raw = String(password || '').trim();
    if (!raw) throw new HttpsError('invalid-argument', 'กรุณาระบุรหัสผ่าน');
    const pw = firebasePasswordServer(raw);
    try {
      const u = await getAuth().getUserByEmail(target);
      await getAuth().updateUser(u.uid, { password: pw });
      return { ok: true, created: false };
    } catch (err) {
      if (err.code !== 'auth/user-not-found') throw new HttpsError('internal', err.message || String(err));
      await getAuth().createUser({ email: target, password: pw });
      return { ok: true, created: true };
    }
  }
  if (op === 'delete') {
    if (target === String(callerEmail).toLowerCase()) throw new HttpsError('failed-precondition', 'ลบบัญชีของตัวเองไม่ได้');
    try {
      const u = await getAuth().getUserByEmail(target);
      await getAuth().deleteUser(u.uid);
    } catch (err) {
      if (err.code !== 'auth/user-not-found') throw new HttpsError('internal', err.message || String(err));
    }
    return { ok: true };
  }
  throw new HttpsError('invalid-argument', 'op ไม่ถูกต้อง');
});


// ===================== คลินิกแพทย์แผนไทย: ระบบนัดจองคิวออนไลน์ =====================
// หน้าจองสำหรับประชาชน (#/book-thai) ไม่ต้องล็อกอิน เรียกผ่าน Cloud Functions (onCall) เท่านั้น — ไม่เปิดให้เขียน/อ่าน Firestore ตรงๆ
// เก็บข้อมูลที่ thaiBookings (เจ้าหน้าที่ที่ล็อกอินเท่านั้นอ่านได้) ตั้งค่าคลินิกที่ settings/thaiClinic
// แจ้งเตือนเข้า "ไลน์กลุ่มงานแพทย์แผนไทย" แยกจากกลุ่มอื่น (thaiTargetId ใน settings/lineNotify — ตั้งที่หน้าตั้งค่าระบบ)
const THAI_DEFAULT = {
  enabled: true,
  openDays: [1, 2, 3, 4, 5], // 0=อาทิตย์ ... 6=เสาร์
  // ช่วงเวลาให้จอง (กำหนดเป็นรายการช่วงเวลาตายตัว): เช้า 2 คิว บ่าย 2 คิว — แต่ละช่วงรับ capacity คิว
  slots: [{ start: '09:00', end: '10:00' }, { start: '10:30', end: '11:30' }, { start: '13:00', end: '14:00' }, { start: '14:30', end: '15:30' }],
  start: '08:30', end: '15:30', slotMinutes: 30, capacity: 1,
  lunchStart: '12:00', lunchEnd: '13:00',
  maxAdvanceDays: 30, minLeadMinutes: 60, maxActivePerPhone: 2,
  closedDates: [],
  outDates: [], // งดรับนัดรายวัน [{date, reason}] เช่น ติดให้บริการนอกสถานที่ (ตั้งจากหน้าเจ้าหน้าที่ แท็บรายการคิว)
  services: ['นวดไทยเพื่อการรักษา', 'ประคบสมุนไพร', 'อบไอน้ำสมุนไพร', 'ทับหม้อเกลือ', 'ตรวจรักษา/ให้คำปรึกษาแพทย์แผนไทย', 'อื่นๆ'],
  notice: '', dailySummary: false,
  providerName: 'พท.อาระยา ใจอุ่น', providerTitle: 'แพทย์แผนไทย', phone: '042-704651', bookingPhone: '080-481-0290',
  lineOaId: '', // LINE OA Basic ID เช่น @123abcde (ใช้ทำปุ่ม "รับข้อความยืนยันทางไลน์" หลังจอง)
};
const THAI_ACTIVE = ['รอยืนยัน', 'ยืนยันแล้ว'];

async function getThaiConfig() {
  const snap = await db.doc('settings/thaiClinic').get();
  const c = { ...THAI_DEFAULT, ...(snap.exists ? snap.data() : {}) };
  c.slotMinutes = Math.max(10, Number(c.slotMinutes) || 30);
  c.capacity = Math.max(1, Number(c.capacity) || 1);
  return c;
}
const bkkParts = (d = new Date()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
};
const toMin = (hhmm) => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const fmtHM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const addDaysStr = (dateStr, n) => { const d = new Date(`${dateStr}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dowOf = (dateStr) => new Date(`${dateStr}T00:00:00Z`).getUTCDay();
const thaiDateShort = (dateStr) => { const [y, m, d] = dateStr.split('-'); return `${Number(d)}/${Number(m)}/${Number(y) + 543}`; };

// ช่วงเวลาให้จอง: ใช้รายการ cfg.slots ถ้ามี (เรียงตามเวลาเริ่ม) ไม่เช่นนั้นสร้างจากเวลาเปิด-ปิดแบบเดิม
function thaiSlotTimes(cfg) {
  const valid = Array.isArray(cfg.slots) ? cfg.slots.filter((x) => x && /^\d{2}:\d{2}$/.test(x.start) && /^\d{2}:\d{2}$/.test(x.end) && x.start < x.end) : [];
  if (valid.length) return valid.map((x) => ({ time: x.start, end: x.end })).sort((a, b) => a.time.localeCompare(b.time));
  const out = [];
  const lunchS = cfg.lunchStart ? toMin(cfg.lunchStart) : null;
  const lunchE = cfg.lunchEnd ? toMin(cfg.lunchEnd) : null;
  for (let t = toMin(cfg.start); t + cfg.slotMinutes <= toMin(cfg.end); t += cfg.slotMinutes) {
    if (lunchS !== null && lunchE !== null && t < lunchE && t + cfg.slotMinutes > lunchS) continue;
    out.push({ time: fmtHM(t), end: fmtHM(t + cfg.slotMinutes) });
  }
  return out;
}
async function thaiClosedSet(cfg) {
  const set = new Set(cfg.closedDates || []);
  (cfg.outDates || []).forEach((x) => x && x.date && set.add(x.date));
  try {
    const h = await db.doc('settings/holidays').get();
    if (h.exists && cfg.closeOnHolidays !== false && Array.isArray(h.data().list)) h.data().list.forEach((x) => x && x.date && set.add(x.date));
  } catch (e) { /* ไม่มีเอกสารวันหยุด: ใช้เฉพาะวันปิดที่ตั้งเอง */ }
  return set;
}
// วันที่เปิดให้จองได้ (นับตั้งแต่วันนี้ ถึง maxAdvanceDays) พร้อมเวลาที่ยังว่างของแต่ละวัน
async function thaiAvailability(cfg) {
  const now = bkkParts();
  const last = addDaysStr(now.date, cfg.maxAdvanceDays);
  const closed = await thaiClosedSet(cfg);
  const snap = await db.collection('thaiBookings').where('date', '>=', now.date).where('date', '<=', last).get();
  const used = {};
  snap.docs.forEach((d) => { const b = d.data(); if (THAI_ACTIVE.includes(b.status)) used[`${b.date}|${b.time}`] = (used[`${b.date}|${b.time}`] || 0) + 1; });
  const times = thaiSlotTimes(cfg);
  const days = [];
  for (let i = 0; i <= cfg.maxAdvanceDays; i += 1) {
    const date = addDaysStr(now.date, i);
    if (!cfg.openDays.includes(dowOf(date)) || closed.has(date)) continue;
    const slots = times.map((t) => {
      const past = date === now.date && toMin(t.time) < now.minutes + cfg.minLeadMinutes;
      const left = past ? 0 : Math.max(0, cfg.capacity - (used[`${date}|${t.time}`] || 0));
      return { time: t.time, end: t.end, left };
    });
    if (slots.some((x) => x.left > 0)) days.push({ date, slots });
  }
  return days;
}
const thaiPublicConfig = (c) => ({ services: c.services, notice: c.notice, providerName: c.providerName, providerTitle: c.providerTitle, phone: c.phone, bookingPhone: c.bookingPhone, lineOaId: c.lineOaId || '' });

// เลขที่การจอง: NSM-Thai-(ลำดับ) เช่น NSM-Thai-01, NSM-Thai-02, ... NSM-Thai-100 — รันต่อเนื่องไม่รีเซ็ตตามปี เก็บตัวนับที่ counters/thai-seq
const thaiCodeText = (n) => `NSM-Thai-${String(n).padStart(2, '0')}`;
// รับรหัสที่พิมพ์ตัวพิมพ์เล็ก/ใหญ่ปนกัน แล้วแปลงเป็นรูปแบบมาตรฐาน (รหัสแบบเก่า NSM-THAI-0001-2569 คืนค่าเดิมเป็นตัวพิมพ์ใหญ่)
const thaiCanonCode = (v) => {
  const t = String(v || '').trim().toUpperCase();
  const m = t.match(/^NSM-THAI-(\d{1,6})$/);
  return m ? thaiCodeText(Number(m[1])) : t;
};
// ต้องเรียก tx.get ตัวนับก่อนการเขียนใดๆ ในธุรกรรม — คืนฟังก์ชันที่ใช้ออกเลขและเขียนตัวนับ
async function thaiReserveCode(tx) {
  const cref = db.doc('counters/thai-seq');
  const cs = await tx.get(cref);
  const n = (cs.exists ? Number(cs.data().last) || 0 : 0) + 1;
  return () => { tx.set(cref, { last: n }, { merge: true }); return thaiCodeText(n); };
}
const cleanText = (v, max) => String(v || '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const normPhone = (v) => String(v || '').replace(/\D/g, '');

exports.thaiPublicInfo = onCall({ cors: true }, async () => {
  const cfg = await getThaiConfig();
  const today = bkkParts().date;
  const closures = (cfg.outDates || []).filter((x) => x && x.date >= today && x.date <= addDaysStr(today, cfg.maxAdvanceDays))
    .map((x) => ({ date: x.date, reason: cleanText(x.reason, 80) || 'ติดให้บริการนอกสถานที่' })).sort((a, b) => a.date.localeCompare(b.date));
  if (!cfg.enabled) return { enabled: false, config: thaiPublicConfig(cfg), days: [], closures, today };
  return { enabled: true, config: thaiPublicConfig(cfg), days: await thaiAvailability(cfg), closures, today };
});

exports.thaiBook = onCall({ cors: true }, async (request) => {
  const d = request.data || {};
  if (d.hp) throw new HttpsError('invalid-argument', 'ข้อมูลไม่ถูกต้อง'); // ช่องล่อบอท (honeypot)
  const cfg = await getThaiConfig();
  if (!cfg.enabled) throw new HttpsError('failed-precondition', 'ขณะนี้ปิดรับจองออนไลน์ชั่วคราว');
  const name = cleanText(d.name, 80);
  const phone = normPhone(d.phone);
  const service = cleanText(d.service, 80);
  const note = cleanText(d.note, 300);
  const date = String(d.date || '');
  const time = String(d.time || '');
  if (name.length < 2) throw new HttpsError('invalid-argument', 'กรุณากรอกชื่อ-สกุล');
  if (!/^0\d{8,9}$/.test(phone)) throw new HttpsError('invalid-argument', 'เบอร์โทรศัพท์ไม่ถูกต้อง (ตัวเลข 9-10 หลัก ขึ้นต้นด้วย 0)');
  if (!service) throw new HttpsError('invalid-argument', 'กรุณาเลือกบริการ');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new HttpsError('invalid-argument', 'กรุณาเลือกวันและเวลา');

  const days = await thaiAvailability(cfg);
  const day = days.find((x) => x.date === date);
  const slot = day && day.slots.find((x) => x.time === time);
  const out = (cfg.outDates || []).find((x) => x && x.date === date);
  if (out) throw new HttpsError('failed-precondition', `งดรับนัดวันที่ ${thaiDateShort(date)} เนื่องจาก${cleanText(out.reason, 80).replace(/^เนื่องจาก/, '') || 'ติดให้บริการนอกสถานที่'}`);
  if (!slot || slot.left <= 0) throw new HttpsError('failed-precondition', 'ช่วงเวลานี้เต็มแล้วหรือไม่เปิดให้จอง กรุณาเลือกเวลาอื่น');

  let code = '';
  const slotKey = `${date}|${time}`;
  const mine = db.collection('thaiBookings').where('phone', '==', phone).where('status', 'in', THAI_ACTIVE);
  let ref;
  await db.runTransaction(async (tx) => {
    // ตรวจซ้ำในธุรกรรม: ช่วงเวลาเต็ม / จองเกินจำนวนต่อเบอร์ (กันบอทและกดซ้ำ)
    const sameSlot = await tx.get(db.collection('thaiBookings').where('date', '==', date).where('time', '==', time));
    if (sameSlot.docs.filter((x) => THAI_ACTIVE.includes(x.data().status)).length >= cfg.capacity) throw new HttpsError('failed-precondition', 'ช่วงเวลานี้เต็มแล้ว กรุณาเลือกเวลาอื่น');
    const myActive = await tx.get(mine);
    const future = myActive.docs.filter((x) => x.data().date >= bkkParts().date);
    if (future.length >= cfg.maxActivePerPhone) throw new HttpsError('resource-exhausted', `เบอร์นี้มีการจองที่ยังไม่ถึงวันนัดครบ ${cfg.maxActivePerPhone} รายการแล้ว`);
    const issue = await thaiReserveCode(tx);
    ref = db.collection('thaiBookings').doc();
    code = issue();
    tx.set(ref, { code, date, time, timeEnd: slot.end, slotKey, service, name, phone, note, status: 'ยืนยันแล้ว', confirmedBy: 'ระบบ (จองอัตโนมัติ)', source: 'online', createdAt: FieldValue.serverTimestamp() });
  });

  // ส่งการ์ดเข้าไลน์กลุ่มแพทย์แผนไทยทันที และเก็บผลการส่งไว้ที่ใบจอง (notifyResult) เพื่อให้เจ้าหน้าที่เห็นสาเหตุถ้าไม่ถึงกลุ่ม
  let notifyResult = 'ส่งเข้าไลน์กลุ่มแล้ว';
  try {
    const { channelAccessToken, thaiTargetId, enabled } = await getLineSettings();
    if (!enabled) notifyResult = 'ไม่ได้ส่ง: ปิดการแจ้งเตือนไลน์หลักอยู่';
    else if (!channelAccessToken) notifyResult = 'ไม่ได้ส่ง: ยังไม่ได้ตั้ง Channel Access Token';
    else if (!thaiTargetId) notifyResult = 'ไม่ได้ส่ง: ยังไม่ได้ตั้ง Target ID กลุ่มแพทย์แผนไทย';
    else await pushLineOrThrow(channelAccessToken, thaiTargetId, [{ type: 'text', text: `🌿 มีผู้จองคิวแพทย์แผนไทย (แจ้งเพื่อทราบ)\nรหัส: ${code}\nวันที่: ${thaiDateShort(date)} เวลา ${time}-${slot.end} น.\nชื่อ: ${name}\nโทร: ${phone}\nบริการ: ${service}\nอาการ: ${note || '-'}` }]);
  } catch (e) { console.error('thaiBook: ส่งไลน์ไม่สำเร็จ', e.message); notifyResult = `ส่งไม่สำเร็จ: ${String(e.message).slice(0, 160)}`; }
  try { await ref.update({ notifyResult }); } catch (e) { /* ไม่กระทบการจอง */ }
  return { ok: true, code, date, time, timeEnd: slot.end, service, name };
});

// เจ้าหน้าที่เพิ่มคิวเอง (โทรศัพท์/Walk-in) ขอเลขที่การจองจากตัวนับเดียวกัน เพื่อให้เลขเรียงต่อเนื่อง
exports.thaiNextCode = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'ต้องเข้าสู่ระบบ');
  let code = '';
  await db.runTransaction(async (tx) => { const issue = await thaiReserveCode(tx); code = issue(); });
  return { code };
});

// ผู้จองตรวจสอบ/ยกเลิกเอง ด้วยรหัสการจอง + เบอร์โทร
async function findThaiBooking(code, phone) {
  const c = thaiCanonCode(code);
  const p = normPhone(phone);
  if (!c || !p) throw new HttpsError('invalid-argument', 'กรุณากรอกรหัสการจองและเบอร์โทร');
  const snap = await db.collection('thaiBookings').where('code', '==', c).limit(5).get();
  const hit = snap.docs.find((x) => x.data().phone === p);
  if (!hit) throw new HttpsError('not-found', 'ไม่พบการจอง ตรวจสอบรหัสและเบอร์โทรอีกครั้ง');
  return hit;
}
exports.thaiLookup = onCall({ cors: true }, async (request) => {
  const hit = await findThaiBooking(request.data && request.data.code, request.data && request.data.phone);
  const b = hit.data();
  return { code: b.code, date: b.date, time: b.time, timeEnd: b.timeEnd || '', service: b.service, name: b.name, status: b.status };
});
exports.thaiCancel = onCall({ cors: true }, async (request) => {
  const hit = await findThaiBooking(request.data && request.data.code, request.data && request.data.phone);
  const b = hit.data();
  if (!THAI_ACTIVE.includes(b.status)) throw new HttpsError('failed-precondition', `การจองนี้สถานะ "${b.status}" ยกเลิกไม่ได้`);
  await hit.ref.update({ status: 'ยกเลิก', cancelledBy: 'ผู้จอง', cancelledAt: FieldValue.serverTimestamp() });
  try {
    const { channelAccessToken, thaiTargetId, enabled } = await getLineSettings();
    if (channelAccessToken && thaiTargetId && enabled) {
      await pushLine(channelAccessToken, thaiTargetId, [{ type: 'text', text: `🚫 ผู้จองยกเลิกคิวแพทย์แผนไทย\nรหัส: ${b.code}\nวันที่: ${thaiDateShort(b.date)} เวลา ${b.time}${b.timeEnd ? `-${b.timeEnd}` : ''} น.\nชื่อ: ${b.name} (${b.phone})` }]);
    }
  } catch (e) { console.error('thaiCancel: ส่งไลน์ไม่สำเร็จ', e.message); }
  return { ok: true };
});

// ---------- ระบบจองคิวบริการแพทย์แผนไทย: การ์ดยืนยันในไลน์กลุ่ม + แจ้งผู้จองอัตโนมัติ ----------
// การ์ดจองเข้าไลน์กลุ่มแพทย์แผนไทย (thaiTargetId) มีปุ่ม "ยืนยันรับจอง/ไม่สะดวก" — สมาชิกทุกคนในกลุ่มนั้นกดได้
// ผู้จองผูกไลน์ของตัวเองโดยส่งรหัสจอง (Txxxxxx) ให้ไลน์ OA ในแชทส่วนตัว → ระบบเก็บ lineUserId ไว้ในใบจอง
// เมื่อสถานะเปลี่ยนเป็นยืนยันแล้ว/ยกเลิก (ไม่ว่ากดจากไลน์หรือจากหน้าเว็บ) ระบบส่งข้อความหาผู้จองอัตโนมัติ
function buildThaiBookingFlex(id, b, status = 'รอยืนยัน', by = '') {
  const rows = [
    ['รหัส', b.code], ['วันที่', thaiDateShort(b.date)], ['เวลา', `${b.time}${b.timeEnd ? `-${b.timeEnd}` : ''} น.`],
    ['บริการ', b.service], ['ผู้จอง', b.name], ['โทร', b.phone], ['อาการ', b.note || '-'],
  ];
  const pending = status === 'รอยืนยัน';
  const color = status === 'ยืนยันแล้ว' ? '#15803d' : status === 'ยกเลิก' ? '#b91c1c' : '#b45309';
  const bubble = {
    type: 'bubble',
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm',
      contents: [
        { type: 'text', text: '🌿 ระบบจองคิวบริการแพทย์แผนไทย', weight: 'bold', size: 'md', wrap: true, color: '#047857' },
        ...rows.map(([k, v]) => ({
          type: 'box', layout: 'baseline', spacing: 'sm',
          contents: [{ type: 'text', text: k, size: 'sm', color: '#64748b', flex: 2 }, { type: 'text', text: String(v), size: 'sm', wrap: true, flex: 5 }],
        })),
        { type: 'text', text: `สถานะ: ${status}${by ? ` (โดย ${by})` : ''}`, wrap: true, size: 'sm', weight: 'bold', color },
      ],
    },
  };
  if (pending) {
    bubble.footer = {
      type: 'box', layout: 'horizontal', spacing: 'sm',
      contents: [
        { type: 'button', style: 'primary', color: '#16a34a', height: 'sm', action: { type: 'postback', label: '✅ ยืนยันรับจอง', data: `action=confirm&thaiBookingId=${id}`, displayText: `ยืนยันรับจอง ${b.code}` } },
        { type: 'button', style: 'primary', color: '#dc2626', height: 'sm', action: { type: 'postback', label: '❌ ไม่สะดวก', data: `action=reject&thaiBookingId=${id}`, displayText: `ไม่สะดวก ${b.code}` } },
      ],
    };
  }
  return { type: 'flex', altText: `🌿 จองคิวแพทย์แผนไทย ${b.code}\n${thaiDateShort(b.date)} ${b.time} · ${b.name} · ${b.phone}${b.note ? `\nอาการ: ${b.note}` : ''}`.slice(0, 390), contents: bubble };
}

// ชื่อสมาชิกในกลุ่มที่กดปุ่ม (ถ้าอ่านไม่ได้จะใช้ค่าว่าง)
async function lineMemberName(token, src) {
  try {
    if (!src.userId) return '';
    const base = src.groupId ? `group/${src.groupId}` : src.roomId ? `room/${src.roomId}` : '';
    if (!base) return '';
    const r = await fetch(`https://api.line.me/v2/bot/${base}/member/${src.userId}`, { headers: { Authorization: `Bearer ${token}` } });
    return r.ok ? ((await r.json()).displayName || '') : '';
  } catch (e) { return ''; }
}

async function handleThaiPostback(ev) {
  const params = new URLSearchParams((ev.postback && ev.postback.data) || '');
  const action = params.get('action');
  const id = params.get('thaiBookingId');
  const replyToken = ev.replyToken;
  if (!action || !id) return;
  const { channelAccessToken, thaiTargetId } = await getLineSettings();
  if (!channelAccessToken) return;
  const reply = (text) => replyToken && replyLine(channelAccessToken, replyToken, text);
  const src = ev.source || {};
  // ทุกคนในกลุ่ม/ห้อง "ระบบจองคิวบริการแพทย์แผนไทย" กดได้ — ตรวจว่าการกดมาจากกลุ่มที่ตั้งไว้เท่านั้น
  const fromId = src.groupId || src.roomId || src.userId;
  if (!thaiTargetId || fromId !== thaiTargetId) { await reply('⚠️ ปุ่มนี้ใช้ได้เฉพาะในไลน์กลุ่มระบบจองคิวบริการแพทย์แผนไทย'); return; }
  const ref = db.doc(`thaiBookings/${id}`);
  const snap = await ref.get();
  if (!snap.exists) { await reply('ไม่พบคิวนี้ในระบบแล้ว (อาจถูกลบไปก่อนหน้านี้)'); return; }
  const cur = snap.data();
  if (cur.status !== 'รอยืนยัน') { await reply(`คิว ${cur.code} (${cur.name}) ถูกดำเนินการไปแล้ว สถานะ: ${cur.status}`); return; }
  const who = (await lineMemberName(channelAccessToken, src)) || 'เจ้าหน้าที่ (ผ่านไลน์)';
  const ok = action === 'confirm';
  await ref.update(ok
    ? { status: 'ยืนยันแล้ว', confirmedBy: who, confirmedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: `${who} (ไลน์)` }
    : { status: 'ยกเลิก', cancelledBy: `${who} (ไลน์)`, cancelledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: `${who} (ไลน์)` });
  // onThaiBookingUpdated จะส่งข้อความแจ้งผู้จองต่อเอง (ถ้าผู้จองผูกไลน์ไว้)
  const linked = cur.lineUserId ? 'แจ้งผู้จองทางไลน์อัตโนมัติแล้ว' : 'ผู้จองยังไม่ได้ผูกไลน์ — กรุณาโทรแจ้ง ' + cur.phone;
  await reply(ok ? `✅ ${who} ยืนยันรับจองคิว ${cur.code} (${cur.name}, ${thaiDateShort(cur.date)} ${cur.time}) แล้ว\n${linked}` : `❌ ${who} แจ้งไม่สะดวกรับคิว ${cur.code} (${cur.name})\n${linked}`);
}

// ผู้จองส่งรหัสจอง (Txxxxxx) เข้าแชทส่วนตัวของไลน์ OA → ผูก lineUserId กับใบจอง เพื่อรับข้อความยืนยันอัตโนมัติ
async function handleThaiPatientMessage(ev) {
  const src = ev.source || {};
  if (src.groupId || src.roomId || !src.userId) return; // เฉพาะแชทส่วนตัว 1:1
  if (!ev.message || ev.message.type !== 'text') return;
  const m = String(ev.message.text || '').toUpperCase().match(/NSM-THAI-\d{1,6}(?:-\d{4})?|T\d{6}/);
  if (!m) return;
  const codeKey = thaiCanonCode(m[0]);
  const { channelAccessToken } = await getLineSettings();
  if (!channelAccessToken || !ev.replyToken) return;
  const snap = await db.collection('thaiBookings').where('code', '==', codeKey).limit(1).get();
  if (snap.empty) { await replyLine(channelAccessToken, ev.replyToken, `ไม่พบรหัสจอง ${codeKey} กรุณาตรวจสอบรหัสอีกครั้ง`); return; }
  const doc = snap.docs[0]; const b = doc.data();
  if (b.lineUserId && b.lineUserId !== src.userId) { await replyLine(channelAccessToken, ev.replyToken, 'รหัสจองนี้ผูกกับไลน์อื่นแล้ว หากต้องการเปลี่ยนกรุณาโทรติดต่อคลินิก'); return; }
  await doc.ref.update({ lineUserId: src.userId });
  const msg = {
    'รอยืนยัน': 'ระบบบันทึกคิวของท่านแล้ว',
    'ยืนยันแล้ว': 'คิวของท่านได้รับการบันทึกเรียบร้อยแล้ว ✅',
    'ยกเลิก': 'คิวนี้ถูกยกเลิกแล้ว',
  }[b.status] || `สถานะปัจจุบัน: ${b.status}`;
  await replyLine(channelAccessToken, ev.replyToken, `🌿 เชื่อมไลน์สำเร็จ\nรหัส ${b.code}\n${thaiDateShort(b.date)} เวลา ${b.time}${b.timeEnd ? `-${b.timeEnd}` : ''} น.\nบริการ: ${b.service}\n\n${msg}`);
}

// แจ้งผู้จองอัตโนมัติเมื่อแพทย์แผนไทยยืนยัน/ปฏิเสธ (เฉพาะผู้ที่ผูกไลน์แล้ว) และอัปเดตการ์ดในกลุ่มไม่ได้ (LINE ไม่รองรับ) จึงตอบสรุปในกลุ่มแทน
exports.onThaiBookingUpdated = onDocumentUpdated('thaiBookings/{id}', async (event) => {
  const before = event.data.before.data(); const after = event.data.after.data();
  if (before.status === after.status || !after.lineUserId) return;
  if (after.status === 'ยกเลิก' && String(after.cancelledBy || '') === 'ผู้จอง') return; // ผู้จองยกเลิกเอง ไม่ต้องแจ้งซ้ำ
  const { channelAccessToken, enabled } = await getLineSettings();
  if (!channelAccessToken || !enabled) return;
  const cfg = await getThaiConfig();
  const when = `${thaiDateShort(after.date)} เวลา ${after.time}${after.timeEnd ? `-${after.timeEnd}` : ''} น.`;
  const tel = cfg.bookingPhone || cfg.phone;
  let text = '';
  if (after.status === 'ยืนยันแล้ว') {
    text = `✅ ยืนยันรับจองคิวแล้ว\n${cfg.providerName} ${cfg.providerTitle}\n\nรหัส: ${after.code}\nวันที่: ${when}\nบริการ: ${after.service}\nผู้จอง: ${after.name}\n\nกรุณามาก่อนเวลานัดประมาณ 10 นาที หากมาไม่ได้โปรดแจ้งยกเลิกล่วงหน้า โทร ${tel}`;
  } else if (after.status === 'ยกเลิก') {
    text = `❌ ขออภัย คลินิกไม่สะดวกรับคิวนี้\nรหัส: ${after.code}\nวันที่: ${when}\n\nกรุณาจองคิวใหม่ในวัน/เวลาอื่น หรือโทร ${tel}`;
  } else return;
  await pushLine(channelAccessToken, after.lineUserId, [{ type: 'text', text }]);
});

// สรุปคิววันนี้เข้าไลน์กลุ่มงานแพทย์แผนไทย เวลา 07:00 น. ทุกวัน (ส่งเฉพาะวันที่มีคิว — ใช้โควตาข้อความไลน์ 1 ข้อความ/วัน)
exports.dailyThaiSummary = onSchedule({ schedule: '0 7 * * *', timeZone: 'Asia/Bangkok' }, async () => {
  const { channelAccessToken, thaiTargetId, enabled } = await getLineSettings();
  if (!channelAccessToken || !thaiTargetId || !enabled) return;
  const today = bkkParts().date;
  const snap = await db.collection('thaiBookings').where('date', '==', today).get();
  const list = snap.docs.map((x) => x.data()).filter((b) => THAI_ACTIVE.includes(b.status)).sort((a, b) => a.time.localeCompare(b.time));
  if (!list.length) return;
  await pushLine(channelAccessToken, thaiTargetId, [{ type: 'text', text: `🌿 สรุปคิวแพทย์แผนไทยวันนี้ ${thaiDateShort(today)} (${list.length} คิว)\n` + list.map((b, i) => `${i + 1}. ${b.time}${b.timeEnd ? `-${b.timeEnd}` : ''} ${b.name} โทร ${b.phone} — ${b.service}`).join('\n') }]);
});

// ===== เวรออกหน่วยปฐมพยาบาล / รับบริจาคโลหิต (unitDuty) — แจ้งไลน์กลุ่มหลัก =====
const UNIT_TITLE = { firstaid: '🚑 เวรออกหน่วยปฐมพยาบาล', blood: '🩸 เวรออกรับบริจาคโลหิต' };
function unitDutyText(head, e) {
  const mem = (e.members || []).map((m, i) => `${i + 1}. ${m.name}${m.position ? ` (${m.position})` : ''}`).join('\n');
  return `${head}\n${UNIT_TITLE[e.kind] || 'เวรออกหน่วย'}\nวันที่: ${thaiDateShort(e.date)}${e.time ? ` เวลา ${e.time} น.` : ''}\nสถานที่/กิจกรรม: ${e.place}${e.orderNo ? `\nคำสั่ง/หนังสือที่: ${e.orderNo}` : ''}\n${e.kind === 'firstaid' ? `${e.unitLabel}` : 'ผู้ปฏิบัติงาน'}:\n${mem}${e.note ? `\nหมายเหตุ: ${e.note}` : ''}`;
}
exports.onUnitDutyCreated = onDocumentCreated('unitDuty/{id}', async (event) => {
  const e = event.data.data();
  const { channelAccessToken, targetId, enabled, events } = await getLineSettings();
  if (!channelAccessToken || !targetId || !enabled || events.unitDuty === false) return;
  await sendLine(channelAccessToken, targetId, unitDutyText('📌 มีการบันทึกงานออกหน่วยใหม่', e));
});
exports.onUnitDutyUpdated = onDocumentUpdated('unitDuty/{id}', async (event) => {
  const b = event.data.before.data(); const a = event.data.after.data();
  const { channelAccessToken, targetId, enabled, events } = await getLineSettings();
  if (!channelAccessToken || !targetId || !enabled || events.unitDuty === false) return;
  if (b.status !== a.status && a.status === 'ยกเลิก') await sendLine(channelAccessToken, targetId, unitDutyText('🚫 ยกเลิกงานออกหน่วย', a));
});
// เช้าวันออกหน่วย 06:00 น. แจ้งซ้ำเฉพาะวันที่มีงาน
exports.dailyUnitDutyReminder = onSchedule({ schedule: '0 6 * * *', timeZone: 'Asia/Bangkok' }, async () => {
  const { channelAccessToken, targetId, enabled, events } = await getLineSettings();
  if (!channelAccessToken || !targetId || !enabled || events.unitDuty === false) return;
  const snap = await db.collection('unitDuty').where('date', '==', bkkParts().date).get();
  const list = snap.docs.map((d) => d.data()).filter((e) => e.status === 'นัดหมาย').sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
  for (const e of list) await sendLine(channelAccessToken, targetId, unitDutyText('⏰ วันนี้ออกหน่วย (แจ้งตอนเช้า)', e));
});

// ส่งแจ้งเตือนไลน์ซ้ำสำหรับใบลาที่มีอยู่แล้ว (Super Admin เท่านั้น) — ใช้กรณีตอนยื่นใบลาจริง (onLeaveCreated ด้านบน)
// ไม่ติดเข้ากลุ่มไลน์ด้วยสาเหตุใดก็ตาม (เช่น ตอนนั้นยังไม่ได้ตั้งค่า/เปิดสวิตช์แจ้งเตือนไลน์ไว้ หรือเครือข่ายขัดข้องชั่วคราว)
// ส่งข้อความตามสถานะปัจจุบันจริงของใบลานั้น (รอพิจารณา = การ์ดปุ่มอนุมัติ/ไม่อนุมัติเหมือนตอนยื่นใหม่, อนุมัติ/ไม่อนุมัติ/ยกเลิก = ข้อความผลพิจารณา)
exports.resendLeaveNotification = onCall(async (request) => {
  const callerEmail = request.auth && request.auth.token && request.auth.token.email;
  if (!callerEmail) throw new HttpsError('unauthenticated', 'ต้องเข้าสู่ระบบก่อน');
  const callerSnap = await db.doc(`users/${callerEmail}`).get();
  const callerRole = callerSnap.exists ? callerSnap.data().role : null;
  if (callerRole !== 'super_admin') throw new HttpsError('permission-denied', 'เฉพาะ Super Admin เท่านั้นที่ใช้งานฟังก์ชันนี้ได้');

  const leaveId = String((request.data && request.data.leaveId) || '').trim();
  if (!leaveId) throw new HttpsError('invalid-argument', 'ไม่พบรหัสใบลา');

  const { channelAccessToken, targetId, enabled } = await getLineSettings();
  if (!channelAccessToken || !targetId) throw new HttpsError('failed-precondition', 'ยังไม่ได้ตั้งค่าการแจ้งเตือนไลน์ (Channel access token / Target ID) ที่หน้า "ตั้งค่าระบบ"');
  if (!enabled) throw new HttpsError('failed-precondition', 'สวิตช์แจ้งเตือนไลน์ปิดอยู่ กรุณาเปิดที่หน้า "ตั้งค่าระบบ" ก่อนส่งแจ้งเตือนซ้ำ');

  const snap = await db.doc(`leaves/${leaveId}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'ไม่พบใบลานี้ในระบบแล้ว');
  const l = snap.data();

  try {
    if (l.status === 'รอพิจารณา') {
      const statsLines = await buildLeaveStatsLines(l).catch((e) => { console.error('buildLeaveStatsLines error:', e); return []; });
      await pushLineOrThrow(channelAccessToken, targetId, [buildLeaveApprovalFlex(leaveId, l, statsLines)]);
    } else {
      const icon = l.status === 'อนุมัติ' ? '✅' : l.status === 'ไม่อนุมัติ' ? '❌' : '🚫';
      let text = `${icon} (ส่งแจ้งเตือนซ้ำ) ใบลา\nชื่อ: ${l.name}\nตำแหน่ง: ${l.position || '-'}\nประเภท: ${l.type}\nวันที่: ${l.start} ถึง ${l.end} (${l.days} วัน)\nสถานะ: ${l.status}`;
      if (l.status === 'อนุมัติ') text += `\n\n🖨️ พิมพ์ใบลา (เปิดแล้วกด "พิมพ์ / บันทึกเป็น PDF"):\n${printLeaveUrl(leaveId)}`;
      await pushLineOrThrow(channelAccessToken, targetId, [{ type: 'text', text }]);
    }
  } catch (err) {
    throw new HttpsError('internal', err.message || 'ส่งข้อความเข้าไลน์ไม่สำเร็จ ไม่ทราบสาเหตุ');
  }
  return { ok: true };
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

// หาวันที่ "3 วันทำการ ก่อนสิ้นเดือน" ของเดือน/ปี (ค.ศ.) ที่ระบุ — นับเฉพาะวันจันทร์-ศุกร์ ไม่นับวันสุดท้ายของเดือนเองเป็นวันทำการที่ 1
// (เริ่มนับถอยหลังจากวันก่อนวันสุดท้ายของเดือน) ไม่มีปฏิทินวันหยุดราชการ จึงนับเฉพาะเสาร์-อาทิตย์เป็นวันหยุดเท่านั้น
function thirdBusinessDayBeforeMonthEnd(year, month /* 1-12 */) {
  const d = new Date(Date.UTC(year, month, 0)); // วันสุดท้ายของเดือน (month เป็น 1-12 ให้ day=0 ของเดือนถัดไป)
  let count = 0;
  while (count < 3) {
    d.setUTCDate(d.getUTCDate() - 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return d.toISOString().slice(0, 10);
}

// แจ้งเตือนเจ้าหน้าที่การเงินและบัญชีล่วงหน้าก่อนสิ้นเดือน 3 วันทำการ เวลา 08:30 น. (เวลาไทย) หากมีภาษีหัก ณ ที่จ่าย
// ในทะเบียนคุมฎีกาเบิกจ่าย (reg-deeka) ที่ยังมีสถานะ "ค้างส่ง" (ยังไม่ได้นำส่งกรมสรรพากร) อยู่ — เพื่อให้มีเวลาจัดทำ
// เอกสารฎีกาและนำส่งเงินภาษีให้ทันก่อนสิ้นเดือนตามที่แจ้ง รันทุกวันแต่จะส่งข้อความจริงเฉพาะวันที่ตรงกับ "3 วันทำการก่อน
// สิ้นเดือน" ของเดือนปัจจุบันเท่านั้น (คำนวณสดทุกครั้งเพราะวันทำการก่อนสิ้นเดือนเปลี่ยนไปตามเดือน ไม่ใช่วันที่ตายตัว)
exports.monthEndTaxReminder = onSchedule({ schedule: '30 8 * * *', timeZone: 'Asia/Bangkok' }, async () => {
  const today = bangkokDateStr();
  const [y, m] = today.split('-').map(Number);
  if (today !== thirdBusinessDayBeforeMonthEnd(y, m)) return;

  const { channelAccessToken, targetId, enabled, events } = await getLineSettings();
  if (!channelAccessToken || !targetId || !enabled || !events.taxOverdueReminder) return;

  const taxSnap = await db.collection('reg-deeka').where('taxStatus', '==', 'ค้างส่ง').get();
  // ฎีกาที่ไม่ได้ลงยอดภาษีหัก ณ ที่จ่ายไว้ (เว้นว่าง/เป็น 0) ถือว่าไม่มีภาษีต้องนำส่ง แม้ฟิลด์ taxStatus จะยังเป็นค่าเริ่มต้น "ค้างส่ง"
  // อยู่ก็ตาม (ตั้งค่าเริ่มต้นเป็นค้างส่งเสมอตอนสร้างฎีกาใหม่ ไม่ว่าจะมียอดหักหรือไม่) จึงต้องกรองออกไม่ให้แจ้งเตือนรายการเหล่านี้
  const overdue = taxSnap.docs.map((d) => d.data()).filter((l) => Number(l.taxWithheld) > 0);
  // เงินประกันสังคมที่หักไว้ (กรณีจ่ายเงินเดือนลูกจ้าง) แต่ยังไม่จ่ายก่อนสิ้นเดือน — กรองเฉพาะที่มียอดหัก > 0 เช่นเดียวกัน
  const ssoSnap = await db.collection('reg-deeka').where('ssoStatus', '==', 'ค้างจ่าย').get();
  const ssoOverdue = ssoSnap.docs.map((d) => d.data()).filter((l) => Number(l.ssoAmount) > 0);
  if (!overdue.length && !ssoOverdue.length) return;

  const byDate = (a, b) => String(a.deekaDate || '').localeCompare(String(b.deekaDate || ''));
  const parts = [];
  if (overdue.length) {
    const lines = overdue.sort(byDate).map((l, i) => `${i + 1}. ${l.deekaNo || '-'} · ${l.subject || '-'} · ภาษีหัก ณ ที่จ่าย ${l.taxWithheld || '-'} บาท`);
    parts.push(`📌 แจ้งเตือนเจ้าหน้าที่การเงินและบัญชี: ใกล้สิ้นเดือนแล้ว ยังมีภาษีหัก ณ ที่จ่ายค้างนำส่งกรมสรรพากร (${overdue.length} รายการ)\nกรุณาจัดทำเอกสารฎีกาและนำส่งเงินภาษีให้ทันก่อนสิ้นเดือน\n\n${lines.join('\n')}`);
  }
  if (ssoOverdue.length) {
    const lines = ssoOverdue.sort(byDate).map((l, i) => `${i + 1}. ${l.deekaNo || '-'} · ${l.subject || '-'} · หักประกันสังคม ${l.ssoAmount || '-'} บาท`);
    parts.push(`📌 แจ้งเตือนเจ้าหน้าที่การเงินและบัญชี: ใกล้สิ้นเดือนแล้ว ยังมีเงินประกันสังคมที่หักไว้แต่ยังไม่ได้นำจ่าย (${ssoOverdue.length} รายการ)\nกรุณานำจ่ายประกันสังคมให้ทันก่อนสิ้นเดือน\n\n${lines.join('\n')}`);
  }
  for (const text of parts) await sendLine(channelAccessToken, targetId, text);
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

// ดูแลดัชนีชื่อ (settings/nameIndex) ให้ตรงกับทะเบียนบุคลากร (users) อยู่เสมอ เพื่อให้หน้า "สมัครใช้งาน" (Signup.jsx) เช็กชื่อซ้ำ
// ก่อนสร้างบัญชีได้ "ก่อน" ล็อกอิน (ตอนนั้นยังอ่านคอลเลกชัน users ตรงๆ ไม่ได้ตามกฎความปลอดภัย จึงต้องมีดัชนีแยกที่อ่านได้แม้ไม่ล็อกอิน
// — ดู firestore.rules match /settings/nameIndex, เขียนได้ทางฟังก์ชันนี้ผ่าน Admin SDK เท่านั้น ไม่ใช่จากไคลเอนต์)
// ดัชนีเก็บเป็นลิสต์ [{key, email}] (key = ชื่อที่ตัดคำนำหน้า "นาย/นาง/นางสาว/..." แล้ว) เขียนทับทั้งลิสต์ใหม่ทุกครั้งที่มีการ
// สร้าง/แก้ไข/ลบเอกสารใน users เพื่อไม่ให้ค้างชื่อเก่า (ลบคน/เปลี่ยนชื่อ) หรือพลาดคนใหม่
const NAME_PREFIXES = ['นางสาว', 'นาง', 'นาย', 'น.ส.', 'ดร.', 'ว่าที่ร้อยตรีหญิง', 'ว่าที่ร้อยตรี'];
function normalizeNameForIndex(name) {
  let s = String(name || '').trim().replace(/\s+/g, ' ');
  for (const p of NAME_PREFIXES) { if (s.startsWith(p)) { s = s.slice(p.length).trim(); break; } }
  return s.toLowerCase();
}
exports.onUserWritten = onDocumentWritten('users/{email}', async (event) => {
  const email = event.params.email;
  const after = event.data.after.exists ? event.data.after.data() : null;
  const ref = db.doc('settings/nameIndex');
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const list = snap.exists && Array.isArray(snap.data().list) ? snap.data().list : [];
    const filtered = list.filter((x) => x.email !== email);
    if (after && after.name) {
      const key = normalizeNameForIndex(after.name);
      if (key) filtered.push({ key, email });
    }
    tx.set(ref, { list: filtered, updatedAt: FieldValue.serverTimestamp() });
  });
});


// ===== ตรวจโควตาข้อความไลน์ =====
// เรียกจากหน้าตั้งค่า (ปุ่ม "ตรวจโควตา") — เฉพาะ Super Admin
exports.getLineQuota = onCall(async (request) => {
  const callerEmail = request.auth && request.auth.token && request.auth.token.email;
  if (!callerEmail) throw new HttpsError('unauthenticated', 'ต้องเข้าสู่ระบบก่อน');
  const callerSnap = await db.doc(`users/${callerEmail}`).get();
  if (!callerSnap.exists || callerSnap.data().role !== 'super_admin') throw new HttpsError('permission-denied', 'เฉพาะ Super Admin เท่านั้น');
  const { channelAccessToken } = await getLineSettings();
  if (!channelAccessToken) throw new HttpsError('failed-precondition', 'ยังไม่ได้ตั้งค่า Channel access token');
  let info;
  try { info = await fetchLineQuota(channelAccessToken); } catch (e) { throw new HttpsError('internal', e.message); }
  await db.doc('settings/lineStatus').set({ quota: { ...info, checkedAt: FieldValue.serverTimestamp() } }, { merge: true });
  return info;
});

// ทุกวัน 08:00 — เช็กโควตา เก็บไว้ให้แดชบอร์ดแสดง และถ้าใช้ไป >= 80% ส่งเตือนเข้าไลน์กลุ่มหลักครั้งเดียวต่อเดือน
exports.dailyLineQuotaCheck = onSchedule({ schedule: '0 8 * * *', timeZone: 'Asia/Bangkok' }, async () => {
  const { channelAccessToken, targetId, enabled } = await getLineSettings();
  if (!channelAccessToken) return;
  let info;
  try { info = await fetchLineQuota(channelAccessToken); } catch (e) { console.error('ตรวจโควตาไลน์ไม่สำเร็จ:', e.message); return; }
  const ref = db.doc('settings/lineStatus');
  await ref.set({ quota: { ...info, checkedAt: FieldValue.serverTimestamp() } }, { merge: true });
  if (!enabled || !targetId || !info.limited || info.percent === null || info.percent < 80 || info.remaining <= 0) return;
  const month = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(0, 7);
  const cur = await ref.get();
  if (cur.exists && cur.data().warnedMonth === month) return;
  await ref.set({ warnedMonth: month }, { merge: true });
  await sendLine(channelAccessToken, targetId, `⚠️ โควตาข้อความไลน์ใกล้เต็ม\nใช้ไปแล้ว ${info.used} / ${info.limit} ข้อความ (${info.percent}%) เหลือ ${info.remaining} ข้อความ\nเมื่อเต็ม ระบบจะส่งแจ้งเตือนเข้าไลน์ไม่ได้จนถึงต้นเดือนหน้า`);
});

// ===== สถานะการให้บริการ รพ.สต. (แดชบอร์ด): สคริปต์บนเครื่องที่มี JHCIS ส่ง "ตัวเลขสรุปรายวัน" (ไม่มีชื่อ/เลขบัตรผู้ป่วย) เข้ามาเก็บที่ serviceStats/{YYYY-MM-DD} =====
// ยืนยันตัวตนด้วยคีย์ลับในส่วนหัว x-api-key เทียบกับ sha256 ที่เก็บใน settings/statsIngest.keyHash (สร้างคีย์ได้ที่หน้า "รายงานสถานะการให้บริการ" โดย Super Admin)
exports.ingestServiceStats = onRequest({ cors: false, memory: '256MiB' }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'ใช้ได้เฉพาะ POST' }); return; }
  try {
    const key = String(req.get('x-api-key') || '');
    const meta = await db.doc('settings/statsIngest').get();
    const want = meta.exists ? meta.data().keyHash : '';
    const got = require('crypto').createHash('sha256').update(key).digest('hex');
    if (!want || key.length < 20 || got !== want) { res.status(401).json({ ok: false, error: 'คีย์ไม่ถูกต้อง' }); return; }
    const days = Array.isArray(req.body && req.body.days) ? req.body.days : [];
    if (!days.length || days.length > 400) { res.status(400).json({ ok: false, error: 'จำนวนวันต้องอยู่ระหว่าง 1-400' }); return; }
    const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0);
    const numMap = (o, max = 60) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).slice(0, max).map(([k, v]) => [String(k).slice(0, 80), num(v)]));
    let n = 0;
    for (let i = 0; i < days.length; i += 400) {
      const batch = db.batch();
      days.slice(i, i + 400).forEach((d) => {
        if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.date))) return;
        const topDx = (Array.isArray(d.topDx) ? d.topDx : []).slice(0, 15).map((x) => ({ code: String(x.code || '').slice(0, 12), name: String(x.name || '').slice(0, 120), n: num(x.n) }));
        batch.set(db.doc(`serviceStats/${d.date}`), {
          date: d.date, visits: num(d.visits), persons: num(d.persons),
          byFlag: numMap(d.byFlag), byRight: numMap(d.byRight), bySex: numMap(d.bySex), byAge: numMap(d.byAge), byVillage: numMap(d.byVillage),
          vaccines: numMap(d.vaccines), anc: num(d.anc), deaths: num(d.deaths), topDx,
          updatedAt: FieldValue.serverTimestamp(),
        });
        n += 1;
      });
      await batch.commit();
    }
    await db.doc('settings/statsMeta').set({ lastSyncAt: FieldValue.serverTimestamp(), lastSyncDays: n, lastSyncNote: String((req.body && req.body.note) || '').slice(0, 300) }, { merge: true });
    res.json({ ok: true, saved: n });
  } catch (e) { console.error('ingestServiceStats', e); res.status(500).json({ ok: false, error: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' }); }
});

// ===== ทะเบียนสิทธิ UC/Wel ตรง-ไม่ตรง: สคริปต์ที่เครื่อง JHCIS ส่งสรุป + รายชื่อ (เฉพาะชื่อ/อายุ/ที่อยู่/สถานพยาบาล ไม่มีเลขบัตร) -> rightsRegistry/* (อ่านได้เฉพาะผู้ที่ล็อกอิน) =====
exports.ingestRightsRegistry = onRequest({ cors: false, memory: '512MiB', timeoutSeconds: 300 }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'ใช้ได้เฉพาะ POST' }); return; }
  try {
    const key = String(req.get('x-api-key') || '');
    const meta = await db.doc('settings/statsIngest').get();
    const want = meta.exists ? meta.data().keyHash : '';
    if (!want || key.length < 20 || require('crypto').createHash('sha256').update(key).digest('hex') !== want) { res.status(401).json({ ok: false, error: 'คีย์ไม่ถูกต้อง' }); return; }
    const body = req.body || {};
    const chunks = Array.isArray(body.chunks) ? body.chunks : [];
    if (!body.summary || typeof body.summary !== 'object' || chunks.length > 200) { res.status(400).json({ ok: false, error: 'ข้อมูลไม่ถูกต้อง' }); return; }
    const keep = new Set(['summary']);
    for (const c of chunks) {
      const cat = String(c.cat || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 8); const idx = Number(c.idx) || 0;
      if (!cat || !Array.isArray(c.rows) || c.rows.length > 2000) continue;
      const id = `${cat}_${idx}`; keep.add(id);
      await db.doc(`rightsRegistry/${id}`).set({ cat, idx, rows: c.rows.map((r) => (Array.isArray(r) ? r.slice(0, 10).map((x) => String(x == null ? '' : x).slice(0, 120)) : [])), updatedAt: FieldValue.serverTimestamp() });
    }
    await db.doc('rightsRegistry/summary').set({ ...body.summary, updatedAt: FieldValue.serverTimestamp() });
    const old = await db.collection('rightsRegistry').listDocuments();
    await Promise.all(old.filter((d) => !keep.has(d.id)).map((d) => d.delete()));
    res.json({ ok: true, chunks: chunks.length });
  } catch (e) { console.error('ingestRightsRegistry', e); res.status(500).json({ ok: false, error: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' }); }
});

// ===== P&P Fee Schedule: สคริปต์ที่เครื่อง JHCIS ส่งตัวเลขรายเดือนต่อกิจกรรม (ไม่มีข้อมูลผู้ป่วย) -> ppFee/fy{ปี พ.ศ.} =====
exports.ingestPpFee = onRequest({ cors: false }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'ใช้ได้เฉพาะ POST' }); return; }
  try {
    const key = String(req.get('x-api-key') || '');
    const meta = await db.doc('settings/statsIngest').get();
    const want = meta.exists ? meta.data().keyHash : '';
    if (!want || key.length < 20 || require('crypto').createHash('sha256').update(key).digest('hex') !== want) { res.status(401).json({ ok: false, error: 'คีย์ไม่ถูกต้อง' }); return; }
    const b = req.body || {};
    const fy = Number(b.fy);
    if (!Number.isInteger(fy) || fy < 2560 || fy > 2600 || !b.months || typeof b.months !== 'object' || Object.keys(b.months).length > 14) { res.status(400).json({ ok: false, error: 'ข้อมูลไม่ถูกต้อง' }); return; }
    const months = {};
    for (const [m, acts] of Object.entries(b.months)) {
      if (!/^\d{4}-\d{2}$/.test(m) || typeof acts !== 'object') continue;
      months[m] = {};
      for (const [id, v] of Object.entries(acts).slice(0, 40)) months[m][String(id).slice(0, 8)] = { n: Number(v && v.n) || 0, e: Number(v && v.e) || 0 };
    }
    const mapped = (Array.isArray(b.mapped) ? b.mapped : []).slice(0, 40).map((x) => String(x).slice(0, 8));
    await db.doc(`ppFee/fy${fy}`).set({ fy, asOf: String(b.asOf || '').slice(0, 10), months, mapped, updatedAt: FieldValue.serverTimestamp() });
    res.json({ ok: true });
  } catch (e) { console.error('ingestPpFee', e); res.status(500).json({ ok: false, error: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' }); }
});
