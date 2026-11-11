// นำเข้าไฟล์ตรวจสอบสิทธิ์ (Excel จากแหล่งอื่น) เทียบเลขบัตรประชาชนกับ JHCIS
//   node import-rights.mjs "ไฟล์.xlsx"            → ดูตัวอย่างอย่างเดียว (ไม่แก้ฐานข้อมูล) + สร้างรายงาน Excel
//   node import-rights.mjs "ไฟล์.xlsx" --apply    → สำรองค่าเดิมเป็น CSV แล้วอัปเดต person.rightcode ที่ต่าง
//   node import-rights.mjs --rollback backup-rights-xxx.csv   → คืนค่าสิทธิ์เดิมจากไฟล์สำรอง
// แก้เฉพาะคอลัมน์ person.rightcode ของคนที่ยังไม่ตัดตาย และ "ไม่" บันทึกการตายให้ใน JHCIS (แค่แจ้งในรายงาน)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import XLSX from 'xlsx';
import { plan, nid } from './rights-plan.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(fs.readFileSync(path.join(here, 'config.json'), 'utf8'));
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const APPLY = args.includes('--apply');
const rbI = args.indexOf('--rollback');

function dbConfig() {
  const o = { host: '127.0.0.1', port: 3333, user: 'root', password: '', database: 'jhcisdb' };
  try {
    const txt = fs.readFileSync(path.join(cfg.jhcisDir || 'C:\\Program Files\\jhcis', 'database.properties'), 'utf8');
    const p = Object.fromEntries(txt.split(/\r?\n/).filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim().toLowerCase(), l.slice(i + 1).trim()]; }));
    if (p.server) o.host = p.server === 'localhost' ? '127.0.0.1' : p.server;
    if (p.port) o.port = Number(p.port);
    if (p.database) o.database = p.database;
    if (p.username) o.user = p.username;
    if (p.password != null) o.password = p.password;
    const m = (Object.values(p).find((v) => /^jdbc:mysql:/i.test(v)) || '').match(/mysql:\/\/([^:/]+)(?::(\d+))?\/([^?;]+)/i);
    if (m) { o.host = m[1]; if (m[2]) o.port = Number(m[2]); o.database = m[3]; }
  } catch (e) { console.log('อ่าน database.properties ไม่ได้ ใช้ค่าเริ่มต้น:', e.message); }
  let extra = {}; try { extra = JSON.parse(fs.readFileSync(path.join(here, 'db.json'), 'utf8')); } catch { /* ไม่มี db.json */ }
  return { ...o, ...(cfg.db || {}), ...extra };
}
const stamp = () => { const d = new Date(); const z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`; };
const csvQ = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

const conn = await mysql.createConnection({ ...dbConfig(), charset: 'utf8mb4' });
const PCU = String(cfg.pcucode || '05449');

if (rbI >= 0) {
  const bf = args[rbI + 1]; if (!bf) { console.log('ระบุไฟล์สำรอง เช่น --rollback backup-rights-20261112-100000.csv'); process.exit(1); }
  const lines = fs.readFileSync(bf, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).slice(1).filter(Boolean);
  let n = 0;
  for (const ln of lines) { const c = ln.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((x) => x.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')); const [pcu, pid, , old] = c; const [r] = await conn.query('update person set rightcode = ? where pcucodeperson = ? and pid = ?', [old === '' ? null : old, pcu, pid]); n += r.affectedRows; }
  console.log(`คืนค่าสิทธิ์เดิมแล้ว ${n} รายการ`); await conn.end(); process.exit(0);
}
if (!file) { console.log('ใช้งาน: node import-rights.mjs "ไฟล์.xlsx" [--apply]'); process.exit(1); }

// ----- อ่านไฟล์ Excel: หาคอลัมน์จากชื่อหัวตาราง -----
const wb = XLSX.readFile(file, { cellDates: true });
const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
const hdr = raw[0].map((h) => String(h || '').replace(/\s+/g, ''));
const col = (...keys) => hdr.findIndex((h) => keys.some((k) => h.includes(k)));
const C = { id: col('เลขบัตร'), name: col('ชื่อ-สกุล', 'ชื่อสกุล'), oldCode: col('รหัสสิทธิเดิม'), oldName: col('สิทธิเดิม'), newCode: col('รหัสสิทธิปรับปรุง'), newName: col('สิทธิปรับปรุงล่าสุด'), dead: col('ยังไม่ตัดตาย', 'ตัดตาย') };
if (C.id < 0 || C.newCode < 0) { console.log('ไม่พบคอลัมน์ "เลขบัตรปชช" หรือ "รหัสสิทธิปรับปรุงล่าสุด" ในไฟล์ — หัวตารางที่พบ:', raw[0]); process.exit(1); }
const fileRows = raw.slice(1).filter((r) => r[C.id] != null).map((r) => ({ id: nid(r[C.id]), name: r[C.name] ?? '', oldCode: r[C.oldCode], oldName: r[C.oldName] ?? '', newCode: r[C.newCode], newName: r[C.newName] ?? '', dead: String(r[C.dead] ?? '').trim() === '/' }));
console.log(`อ่านไฟล์ได้ ${fileRows.length} แถว`);

// ----- อ่านข้อมูล JHCIS -----
const [persons] = await conn.query(`select p.pcucodeperson, p.pid, p.idcard, p.rightcode, p.fname, p.lname, p.birth,
    concat(ifnull(hs.hno,''), ' ม.', cast(substr(hs.villcode,7,2) as unsigned)) addr
  from person p left join house hs on hs.pcucode = p.pcucodeperson and hs.hcode = p.hcode where p.pcucodeperson = ?`, [PCU]);
const [rc] = await conn.query('select rightcode, rightname from cright'); const rightCodes = new Set(rc.map((r) => String(r.rightcode).trim()));
const [dd] = await conn.query('select pcucodeperson, pid from persondeath'); const deadPids = new Set(dd.map((r) => `${r.pcucodeperson}|${r.pid}`));
console.log(`JHCIS: person ${persons.length} คน (หน่วย ${PCU}) · รหัสสิทธิใน cright ${rightCodes.size} รหัส · ตัดตายแล้ว ${deadPids.size}`);

const P = plan(fileRows, persons, rightCodes, deadPids);
const nm = (p) => `${p.fname || ''} ${p.lname || ''}`.trim();
const sheets = {
  'จะเปลี่ยนสิทธิ': P.change.map(({ f, p, cur, nc }) => ({ เลขบัตร: f.id, 'ชื่อ-สกุล(ไฟล์)': f.name, 'ชื่อใน JHCIS': nm(p), PID: p.pid, 'รหัสสิทธิใน JHCIS ตอนนี้': cur, 'สิทธิเดิมตามไฟล์': f.oldName, 'รหัสสิทธิใหม่': nc, 'สิทธิใหม่(สปสช.)': f.newName })),
  'ตายในไฟล์-JHCIS ยังไม่ตัดตาย': P.deadNotMarked.map(({ f, p }) => ({ เลขบัตร: f.id, 'ชื่อ-สกุล(ไฟล์)': f.name, 'ชื่อใน JHCIS': nm(p), PID: p.pid, 'รหัสสิทธิใน JHCIS': p.rightcode })),
  'ไม่พบในJHCIS': P.notFound.map((f) => ({ เลขบัตร: f.id, 'ชื่อ-สกุล': f.name, 'สิทธิใหม่': f.newName, ตายตามไฟล์: f.dead ? 'ใช่' : '' })),
  'รหัสสิทธิไม่มีใน JHCIS': P.unknownCode.map(({ f, p, code }) => ({ เลขบัตร: f.id, 'ชื่อ-สกุล': f.name, PID: p.pid, 'รหัสสิทธิใหม่': code, 'สิทธิใหม่': f.newName })),
  'ไม่มีสิทธิใหม่(ว่าง)': P.noNewRight.map(({ f, p }) => ({ เลขบัตร: f.id, 'ชื่อ-สกุล': f.name, PID: p.pid, 'รหัสสิทธิใน JHCIS': p.rightcode, ตายตามไฟล์: f.dead ? 'ใช่' : '' })),
  'สิทธิเดิมไม่ตรงไฟล์': P.oldMismatch.map(({ f, p, cur }) => ({ เลขบัตร: f.id, 'ชื่อ-สกุล': f.name, PID: p.pid, 'รหัสใน JHCIS': cur, 'รหัสเดิมตามไฟล์': f.oldCode })),
  'เลขบัตรซ้ำในไฟล์': P.dupFile.map((f) => ({ เลขบัตร: f.id, 'ชื่อ-สกุล': f.name })),
};
// รายชื่อ "ตายในไฟล์ แต่ JHCIS ยังไม่ตัดตาย" เก็บเป็น dead-report.json (ไม่มีเลขบัตร) — sync.mjs --rights ส่งขึ้นเว็บ แสดงที่หน้า "รายงานหมู่บ้านและสิทธิ์การรักษา"
{
  const today = new Date(); const age = (b) => { if (!b) return ''; const d = new Date(b); return isNaN(d) ? '' : Math.floor((today - d) / 31557600000); };
  fs.writeFileSync(path.join(here, 'dead-report.json'), JSON.stringify({ asOf: new Date().toISOString().slice(0, 10), fileName: path.basename(file), total: P.deadNotMarked.length, list: P.deadNotMarked.slice(0, 500).map(({ f, p }) => ({ pid: String(p.pid), name: nm(p), age: age(p.birth), addr: String(p.addr || '').trim(), right: String(p.rightcode || ''), newRight: String(f.newName || '') })) }));
  console.log(`บันทึก dead-report.json แล้ว (${P.deadNotMarked.length} คน) — จะขึ้นที่หน้าเว็บในรอบซิงก์สิทธิ์ถัดไป หรือกด "ประมวลผลทันที"`);
}
const out = XLSX.utils.book_new();
const summary = [['รายการ', 'จำนวน'], ['แถวในไฟล์', P.stats.file], ['พบใน JHCIS (ตามเลขบัตร)', P.stats.matched], ['สิทธิตรงกันอยู่แล้ว', P.same.length], ['จะเปลี่ยนสิทธิ', P.change.length], ['ตายในไฟล์ แต่ JHCIS ยังไม่ตัดตาย', P.deadNotMarked.length], ['ตายในไฟล์ และ JHCIS ตัดตายแล้ว', P.deadAlready.length], ['ไม่พบใน JHCIS', P.notFound.length], ['รหัสสิทธิใหม่ไม่มีใน JHCIS (ไม่แก้)', P.unknownCode.length], ['ไม่มีสิทธิใหม่/ว่าง (ไม่แก้)', P.noNewRight.length], ['รหัสเดิมในไฟล์ไม่ตรง JHCIS', P.oldMismatch.length]];
XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet(summary), 'สรุป');
for (const [n, rows] of Object.entries(sheets)) if (rows.length) XLSX.utils.book_append_sheet(out, XLSX.utils.json_to_sheet(rows), n.slice(0, 31));
const rep = path.join(here, `รายงานตรวจสิทธิ-${stamp()}.xlsx`); XLSX.writeFile(out, rep);
console.log('\n' + summary.slice(1).map((r) => `  ${r[0]}: ${r[1]}`).join('\n'));
console.log(`\nสร้างรายงานแล้ว: ${rep}`);
if (P.oldMismatch.length > P.stats.matched * 0.2) console.log('⚠ รหัสเดิมในไฟล์ไม่ตรงกับ JHCIS มากผิดปกติ — ตรวจสอบว่ารหัสสิทธิของไฟล์ใช้ชุดเดียวกับ JHCIS ก่อนสั่ง --apply');

if (!APPLY) { console.log('\nนี่เป็นการดูตัวอย่างเท่านั้น ยังไม่ได้แก้ฐานข้อมูล JHCIS — ถ้าตรวจรายงานแล้วถูกต้อง ให้รันซ้ำพร้อม --apply'); await conn.end(); process.exit(0); }

// ----- อัปเดตจริง (สำรองก่อน) -----
if (!P.change.length) { console.log('ไม่มีรายการที่ต้องเปลี่ยน'); await conn.end(); process.exit(0); }
const bk = path.join(here, `backup-rights-${stamp()}.csv`);
fs.writeFileSync(bk, '\uFEFF' + ['pcucodeperson,pid,idcard,rightcode_เดิม,rightcode_ใหม่', ...P.change.map(({ f, p, cur, nc }) => [p.pcucodeperson, p.pid, f.id, cur, nc].map(csvQ).join(','))].join('\r\n'));
console.log(`สำรองค่าเดิมแล้ว: ${bk}`);
let done = 0, skipped = 0;
await conn.beginTransaction();
try {
  for (const { p, cur, nc } of P.change) {
    const [r] = await conn.query('update person set rightcode = ? where pcucodeperson = ? and pid = ? and rightcode <=> ?', [nc, p.pcucodeperson, p.pid, cur === '' ? null : cur]);
    if (r.affectedRows) done++; else skipped++;
  }
  await conn.commit();
} catch (e) { await conn.rollback(); console.log('เกิดข้อผิดพลาด ยกเลิกทั้งหมด ไม่มีการแก้ข้อมูล:', e.message); await conn.end(); process.exit(1); }
console.log(`✅ อัปเดตสิทธิ์แล้ว ${done} คน (ข้าม ${skipped} เพราะค่าเปลี่ยนไประหว่างนั้น)`);
console.log(`ถ้าต้องการย้อนกลับ: node import-rights.mjs --rollback "${path.basename(bk)}"`);
await conn.end();
