// ตรวจ "วิธีที่ JHCIS บันทึกการคัดกรอง NCD จริง" แบบสรุปตัวเลข (อ่านอย่างเดียว ไม่แก้/ไม่เขียน ไม่มีชื่อ/เลขบัตร/ค่าตรวจรายคน)
// ผลลัพธ์: ncd-usage5.txt — ความหมายของรหัส จำนวนครั้งที่ใช้ ICD-10/ค่าบริการ/รหัส PP ที่พบในการคัดกรองจริง 1 ปีล่าสุด
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const here = path.dirname(fileURLToPath(import.meta.url));
let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(path.join(here, 'config.json'), 'utf8')); } catch { /* ไม่มี config.json ก็ใช้ค่าจาก JHCIS ได้ */ }
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
    const url = Object.values(p).find((v) => /^jdbc:mysql:/i.test(v)) || '';
    const m = url.match(/mysql:\/\/([^:/]+)(?::(\d+))?\/([^?;]+)/i);
    if (m) { o.host = m[1]; if (m[2]) o.port = Number(m[2]); o.database = m[3]; }
  } catch (e) { console.log('อ่าน database.properties ไม่ได้ ใช้ค่าเริ่มต้น:', e.message); }
  let extra = {}; try { extra = JSON.parse(fs.readFileSync(path.join(here, 'db.json'), 'utf8')); } catch { /* ไม่มี db.json */ }
  return { ...o, ...(cfg.db || {}), ...extra };
}



const conn = await mysql.createConnection({ ...dbConfig(), charset: 'utf8mb4' });
const out = []; const log = (s = '') => { out.push(s); console.log(s); };
const Q = async (title, sql, params = []) => { try { const [r] = await conn.query(sql, params); log(`\n## ${title} (${r.length} แถว)`); r.forEach((x) => log('  ' + JSON.stringify(x))); return r; } catch (e) { log(`\n## ${title} — ดึงไม่ได้: ${e.code || e.message}`); return []; } };
const SINCE = "date_sub(curdate(), interval 365 day)";
const S = 'ncd_person_ncd_screen';
log(`ตรวจรอบ 5 เมื่อ ${new Date().toISOString()}`);
// ใช้หาความหมายรหัส smoke/alcohol ในตารางคัดกรอง โดยเทียบกับรหัส Specialpp (1B5x บุหรี่ / 1B6xx สุรา) ที่บันทึกในวิสิตเดียวกัน — ไม่แสดงข้อมูลบุคคล
const J = `from ${S} s join f43specialpp f on f.pcucode = s.pcucode and f.visitno = s.visitno where s.screen_date >= ${SINCE}`;
await Q('smoke เทียบกับรหัส PP บุหรี่ (1B5x)', `select s.smoke, f.ppspecial, count(*) n ${J} and f.ppspecial like '1B5%' group by s.smoke, f.ppspecial order by s.smoke, n desc`);
await Q('alcohol เทียบกับรหัส PP สุรา (1B6xx)', `select s.alcohol, f.ppspecial, count(*) n ${J} and f.ppspecial like '1B6%' group by s.alcohol, f.ppspecial order by s.alcohol, n desc`);
await Q('smoke / alcohol เทียบเพศ (หาว่าค่า 2 คือสูบ/ดื่มหรือไม่)', `select p.sex, s.smoke, s.alcohol, count(*) n from ${S} s join person p on p.pid = s.pid and p.pcucodeperson = s.pcucode where s.screen_date >= ${SINCE} group by p.sex, s.smoke, s.alcohol order by n desc limit 20`);
await Q('screen_q4 เทียบกับ alcohol (q4 คือสุราหรือไม่)', `select screen_q4 q4, alcohol, count(*) n from ${S} where screen_date >= ${SINCE} group by screen_q4, alcohol order by n desc`);
await Q('screen_q1 / q2 เทียบกับประวัติเบาหวาน-ความดันในทะเบียน (ญาติ/ตนเอง)', `select s.screen_q1 q1, s.screen_q2 q2, exists(select 1 from personchronic c where c.pid = s.pid and c.pcucodeperson = s.pcucode) has_chronic, count(*) n from ${S} s where s.screen_date >= ${SINCE} group by 1, 2, 3 order by n desc limit 12`);
await Q('do_measure / servplace ที่พบ', `select do_measure, servplace, count(*) n from ${S} where screen_date >= ${SINCE} group by 1, 2`);
await conn.end();
fs.writeFileSync(path.join(here, 'ncd-usage5.txt'), out.join('\n'), 'utf8');
console.log('\nเสร็จแล้ว — ไฟล์ผลลัพธ์: ' + path.join(here, 'ncd-usage5.txt'));
