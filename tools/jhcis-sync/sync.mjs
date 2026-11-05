// ซิงก์สถิติบริการรายวันจากฐานข้อมูล JHCIS (MySQL ในเครื่อง) ขึ้นระบบ NSN-PHC — ส่งเฉพาะ "ตัวเลขสรุป" ไม่ส่งชื่อ/เลขบัตรผู้ป่วย
// ใช้งาน:  node sync.mjs --check 2026-11-04   (ดูตัวเลขของวันนั้นบนหน้าจอ ไม่ส่งขึ้นระบบ)
//          node sync.mjs                      (ส่งย้อนหลัง N วัน ตาม config.json ค่าเริ่มต้น 7)
//          node sync.mjs --from 2025-10-01    (ส่งย้อนหลังตั้งแต่วันที่กำหนด ถึงวันนี้)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const here = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(fs.readFileSync(path.join(here, 'config.json'), 'utf8'));
const args = process.argv.slice(2);
const argv = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// อ่านค่าเชื่อมต่อฐานข้อมูลจาก database.properties ของ JHCIS (อ่านในเครื่องนี้เท่านั้น ไม่ส่งออกไปไหน)
function dbConfig() {
  const o = { host: '127.0.0.1', port: 3333, user: 'root', password: '', database: 'jhcisdb' };
  try {
    const txt = fs.readFileSync(path.join(cfg.jhcisDir || 'C:\\Program Files\\jhcis', 'database.properties'), 'utf8');
    const p = Object.fromEntries(txt.split(/\r?\n/).filter((l) => l.includes('=') && !l.trim().startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim().toLowerCase(), l.slice(i + 1).trim()]; }));
    const url = Object.entries(p).find(([k, v]) => /^jdbc:mysql:/i.test(v) || k.includes('url'))?.[1] || '';
    const m = url.match(/mysql:\/\/([^:/]+)(?::(\d+))?\/([^?;]+)/i);
    if (m) { o.host = m[1]; if (m[2]) o.port = Number(m[2]); o.database = m[3]; }
    const u = Object.entries(p).find(([k]) => /user/.test(k)); if (u) o.user = u[1];
    const pw = Object.entries(p).find(([k]) => /pass|pwd/.test(k)); if (pw) o.password = pw[1];
  } catch (e) { console.log('อ่าน database.properties ไม่ได้ ใช้ค่าเริ่มต้น:', e.message); }
  return { ...o, ...(cfg.db || {}) };
}

const failed = new Set();
async function q(conn, name, sql, params) { try { const [r] = await conn.query(sql, params); return r; } catch (e) { failed.add(name); console.log(`  ! ตัวชี้วัด "${name}" ดึงไม่ได้: ${e.code || e.message}`); return []; } }
const toMap = (rows, kf, vf = 'n') => Object.fromEntries(rows.filter((r) => r[kf] != null && String(r[kf]).trim() !== '').map((r) => [String(r[kf]).trim(), Number(r[vf])]));

async function collect(conn, from, to) {
  const days = {};
  const day = (d) => { const k = typeof d === 'string' ? d : iso(d); return (days[k] ||= { date: k, visits: 0, persons: 0, byFlag: {}, byRight: {}, bySex: {}, byAge: {}, byVillage: {}, vaccines: {}, anc: 0, deaths: 0, topDx: [] }); };
  const D = "date_format(v.visitdate,'%Y-%m-%d')";
  for (const r of await q(conn, 'ยอดรวม', `select ${D} d, count(*) visits, count(distinct v.pcucodeperson, v.pid) persons from visit v where v.visitdate between ? and ? group by d`, [from, to])) { const x = day(r.d); x.visits = Number(r.visits); x.persons = Number(r.persons); }
  for (const r of await q(conn, 'ประเภทบริการ', `select ${D} d, ifnull(nullif(trim(v.flagservice),''),'ไม่ระบุ') k, count(*) n from visit v where v.visitdate between ? and ? group by d,k`, [from, to])) day(r.d).byFlag[r.k] = Number(r.n);
  for (const r of await q(conn, 'สิทธิ', `select ${D} d, ifnull(g.rightgroupname,'ไม่ระบุ') k, count(*) n from visit v left join cright c on v.rightcode=c.rightcode left join crightgroup g on c.rightgroup=g.rightgroupcode where v.visitdate between ? and ? group by d,k`, [from, to])) day(r.d).byRight[r.k] = Number(r.n);
  for (const r of await q(conn, 'เพศ/อายุ', `select ${D} d, p.sex sx, timestampdiff(year,p.birth,v.visitdate) a from visit v left join person p on v.pcucodeperson=p.pcucodeperson and v.pid=p.pid where v.visitdate between ? and ?`, [from, to])) {
    const x = day(r.d); const s = String(r.sx || '?'); x.bySex[s] = (x.bySex[s] || 0) + 1;
    const a = r.a; const k = a == null ? null : a < 5 ? '0-4' : a < 15 ? '5-14' : a < 25 ? '15-24' : a < 60 ? '25-59' : '60+'; if (k) x.byAge[k] = (x.byAge[k] || 0) + 1;
  }
  for (const r of await q(conn, 'หมู่บ้าน', `select ${D} d, ifnull(vl.villname,'ไม่ระบุ') k, count(*) n from visit v left join person p on v.pcucodeperson=p.pcucodeperson and v.pid=p.pid left join house h on p.pcucodeperson=h.pcucode and p.hcode=h.hcode left join village vl on h.pcucode=vl.pcucode and h.villcode=vl.villcode where v.visitdate between ? and ? group by d,k`, [from, to])) day(r.d).byVillage[r.k] = Number(r.n);
  const dx = await q(conn, 'โรค/วินิจฉัย', `select ${D} d, vd.diagcode code, max(c.diseasename) name, count(distinct vd.visitno) n from visit v join visitdiag vd on v.pcucode=vd.pcucode and v.visitno=vd.visitno left join cdisease c on vd.diagcode=c.diseasecode where v.visitdate between ? and ? and vd.dxtype='01' group by d,code`, [from, to]);
  for (const r of dx) day(r.d).topDx.push({ code: r.code, name: r.name || '', n: Number(r.n) });
  Object.values(days).forEach((x) => { x.topDx.sort((a, b) => b.n - a.n); x.topDx = x.topDx.slice(0, 15); });
  for (const r of await q(conn, 'วัคซีน', `select ${D} d, e.vaccinecode k, count(*) n from visit v join visitepi e on v.pcucode=e.pcucode and v.visitno=e.visitno where v.visitdate between ? and ? group by d,k`, [from, to])) day(r.d).vaccines[r.k] = Number(r.n);
  for (const r of await q(conn, 'ฝากครรภ์', `select date_format(datecheck,'%Y-%m-%d') d, count(*) n from visitanc where datecheck between ? and ? group by d`, [from, to])) day(r.d).anc = Number(r.n);
  for (const r of await q(conn, 'เสียชีวิต', `select date_format(deaddate,'%Y-%m-%d') d, count(*) n from persondeath where deaddate between ? and ? group by d`, [from, to])) day(r.d).deaths = Number(r.n);
  return Object.values(days).sort((a, b) => a.date.localeCompare(b.date));
}

const conn = await mysql.createConnection({ ...dbConfig(), charset: 'utf8mb4' });
let from; let to = iso(new Date());
if (argv('--check')) { from = to = argv('--check'); }
else if (argv('--from')) from = argv('--from');
else { const d = new Date(); d.setDate(d.getDate() - ((cfg.days || 7) - 1)); from = iso(d); }
console.log(`ดึงข้อมูล ${from} ถึง ${to} ...`);
const out = await collect(conn, from, to);
await conn.end();
if (argv('--check')) {
  const x = out[0];
  console.log(x ? JSON.stringify(x, null, 2) : 'ไม่พบการให้บริการในวันนั้น');
  console.log(failed.size ? `\nตัวชี้วัดที่ดึงไม่ได้: ${[...failed].join(', ')}` : '\nดึงได้ครบทุกตัวชี้วัด');
  console.log('นี่คือการตรวจสอบเท่านั้น ยังไม่ได้ส่งข้อมูลขึ้นระบบ — เทียบ "visits" กับรายงานใน JHCIS ของวันเดียวกัน');
  process.exit(0);
}
if (!out.length) { console.log('ไม่มีข้อมูลในช่วงนี้'); process.exit(0); }
const note = failed.size ? `ดึงไม่ได้: ${[...failed].join(', ')}` : '';
const res = await fetch(cfg.endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey }, body: JSON.stringify({ days: out, note }) });
const body = await res.json().catch(() => ({}));
console.log(res.ok ? `ส่งสำเร็จ ${body.saved} วัน${note ? ` (${note})` : ''}` : `ส่งไม่สำเร็จ: HTTP ${res.status} ${body.error || ''}`);
process.exit(res.ok ? 0 : 1);
