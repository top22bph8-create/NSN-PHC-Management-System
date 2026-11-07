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
    if (p.server) o.host = p.server === 'localhost' ? '127.0.0.1' : p.server;
    if (p.port) o.port = Number(p.port);
    if (p.database) o.database = p.database;
    if (p.username) o.user = p.username;
    if (p.password != null) o.password = p.password;
    const url = Object.values(p).find((v) => /^jdbc:mysql:/i.test(v)) || '';
    const m = url.match(/mysql:\/\/([^:/]+)(?::(\d+))?\/([^?;]+)/i);
    if (m) { o.host = m[1]; if (m[2]) o.port = Number(m[2]); o.database = m[3]; }
  } catch (e) { console.log('อ่าน database.properties ไม่ได้ ใช้ค่าเริ่มต้น:', e.message); }
  let extra = {};
  try { extra = JSON.parse(fs.readFileSync(path.join(here, 'db.json'), 'utf8')); } catch { /* ไม่มี db.json: ใช้ค่าจาก database.properties/config.json */ }
  return { ...o, ...(cfg.db || {}), ...extra };
}

// นับเฉพาะ "ให้บริการแล้ว" ตามเงื่อนไขเดียวกับรายงานของ JHCIS (flagservice < 04 หรือว่าง) — ตัดรหัส 99 (คิวค้าง/ยกเลิก) ออก
const SVC = "(v.flagservice < '04' or v.flagservice is null or length(trim(v.flagservice)) = 0)";
const failed = new Set();
async function q(conn, name, sql, params) { try { const [r] = await conn.query(sql, params); return r; } catch (e) { failed.add(name); console.log(`  ! ตัวชี้วัด "${name}" ดึงไม่ได้: ${e.code || e.message}`); return []; } }
const toMap = (rows, kf, vf = 'n') => Object.fromEntries(rows.filter((r) => r[kf] != null && String(r[kf]).trim() !== '').map((r) => [String(r[kf]).trim(), Number(r[vf])]));

async function collect(conn, from, to) {
  const days = {};
  const day = (d) => { const k = typeof d === 'string' ? d : iso(d); return (days[k] ||= { date: k, visits: 0, persons: 0, byFlag: {}, byRight: {}, bySex: {}, byAge: {}, byVillage: {}, vaccines: {}, anc: 0, deaths: 0, topDx: [] }); };
  const D = "date_format(v.visitdate,'%Y-%m-%d')";
  for (const r of await q(conn, 'ยอดรวม', `select ${D} d, count(*) visits, count(distinct v.pcucodeperson, v.pid) persons from visit v where v.visitdate between ? and ? and ${SVC} group by d`, [from, to])) { const x = day(r.d); x.visits = Number(r.visits); x.persons = Number(r.persons); }
  for (const r of await q(conn, 'ประเภทบริการ', `select ${D} d, ifnull(nullif(trim(v.flagservice),''),'ไม่ระบุ') k, count(*) n from visit v where v.visitdate between ? and ? group by d,k`, [from, to])) day(r.d).byFlag[r.k] = Number(r.n);
  for (const r of await q(conn, 'สิทธิ', `select ${D} d, ifnull(g.rightgroupname,'ไม่ระบุ') k, count(*) n from visit v left join cright c on v.rightcode=c.rightcode left join crightgroup g on c.rightgroup=g.rightgroupcode where v.visitdate between ? and ? and ${SVC} group by d,k`, [from, to])) day(r.d).byRight[r.k] = Number(r.n);
  for (const r of await q(conn, 'เพศ/อายุ', `select ${D} d, p.sex sx, timestampdiff(year,p.birth,v.visitdate) a from visit v left join person p on v.pcucodeperson=p.pcucodeperson and v.pid=p.pid where v.visitdate between ? and ? and ${SVC}`, [from, to])) {
    const x = day(r.d); const s = String(r.sx || '?'); x.bySex[s] = (x.bySex[s] || 0) + 1;
    const a = r.a; const k = a == null ? null : a < 5 ? '0-4' : a < 15 ? '5-14' : a < 25 ? '15-24' : a < 60 ? '25-59' : '60+'; if (k) x.byAge[k] = (x.byAge[k] || 0) + 1;
  }
  for (const r of await q(conn, 'หมู่บ้าน', `select ${D} d, ifnull(vl.villname,'ไม่ระบุ') k, count(*) n from visit v left join person p on v.pcucodeperson=p.pcucodeperson and v.pid=p.pid left join house h on p.pcucodeperson=h.pcucode and p.hcode=h.hcode left join village vl on h.pcucode=vl.pcucode and h.villcode=vl.villcode where v.visitdate between ? and ? and ${SVC} group by d,k`, [from, to])) day(r.d).byVillage[r.k] = Number(r.n);
  const dx = await q(conn, 'โรค/วินิจฉัย', `select ${D} d, vd.diagcode code, max(c.diseasename) name, count(distinct vd.visitno) n from visit v join visitdiag vd on v.pcucode=vd.pcucode and v.visitno=vd.visitno left join cdisease c on vd.diagcode=c.diseasecode where v.visitdate between ? and ? and ${SVC} and vd.dxtype='01' group by d,code`, [from, to]);
  for (const r of dx) day(r.d).topDx.push({ code: r.code, name: r.name || '', n: Number(r.n) });
  Object.values(days).forEach((x) => { x.topDx.sort((a, b) => b.n - a.n); x.topDx = x.topDx.slice(0, 15); });
  for (const r of await q(conn, 'วัคซีน', `select ${D} d, e.vaccinecode k, count(*) n from visit v join visitepi e on v.pcucode=e.pcucode and v.visitno=e.visitno where v.visitdate between ? and ? and ${SVC} group by d,k`, [from, to])) day(r.d).vaccines[r.k] = Number(r.n);
  for (const r of await q(conn, 'ฝากครรภ์', `select date_format(datecheck,'%Y-%m-%d') d, count(*) n from visitanc where datecheck between ? and ? group by d`, [from, to])) day(r.d).anc = Number(r.n);
  for (const r of await q(conn, 'เสียชีวิต', `select date_format(deaddate,'%Y-%m-%d') d, count(*) n from persondeath where deaddate between ? and ? group by d`, [from, to])) day(r.d).deaths = Number(r.n);
  return Object.values(days).sort((a, b) => a.date.localeCompare(b.date));
}

const conn = await mysql.createConnection({ ...dbConfig(), charset: 'utf8mb4' });
if (args.includes('--explore')) {
  // โหมดสำรวจโครงสร้าง (ไม่ส่งข้อมูลผู้ป่วย): ชื่อคอลัมน์ตาราง person และรหัสสิทธิ เพื่อออกแบบรายงานทะเบียนสิทธิ
  const [cols] = await conn.query('show columns from person');
  console.log('คอลัมน์ person:', cols.map((c) => c.Field).join(', '));
  const [rights] = await conn.query('select c.rightcode, c.rightname, c.rightgroup from cright c order by c.rightgroup, c.rightcode');
  console.log('\nรหัสสิทธิ (cright):'); rights.forEach((r) => console.log(` ${r.rightcode} | ${r.rightgroup} | ${r.rightname}`));
  const [grp] = await conn.query('select * from crightgroup'); console.log('\nกลุ่มสิทธิ:', JSON.stringify(grp));
  const [tl] = await conn.query('select typelive, count(*) n from person group by typelive'); console.log('\nประเภทการอยู่อาศัย person.typelive:', JSON.stringify(tl));
  for (const col of ['hosmain', 'hossub']) { try { const [r] = await conn.query(`select ${col} h, count(*) n from person where rightcode is not null group by ${col} order by n desc limit 6`); console.log(`\nสถานพยาบาลหลัก (${col}) ที่พบมากสุด:`, JSON.stringify(r)); } catch (e) { console.log(`\nไม่มีคอลัมน์ ${col}:`, e.code); } }
  await conn.end(); process.exit(0);
}
if (args.includes('--explore-pp')) {
  // สำรวจโครงสร้างเพื่อออกแบบรายงาน P&P Fee Schedule (ไม่ส่งข้อมูลผู้ป่วย แสดงเฉพาะชื่อตาราง/คอลัมน์/จำนวนรวมของรหัส)
  const T = async (sql, p) => { try { return (await conn.query(sql, p))[0]; } catch (e) { console.log('  ! ', e.code || e.message); return []; } };
  const tabs = (await T('show tables')).map((r) => Object.values(r)[0]);
  console.log('ตารางที่เกี่ยวข้อง:', tabs.filter((t) => /^(visit|cdrug|cproc|ndp|nhso|cicd|cdisease|cvacc)/i.test(t)).join(', '));
  for (const t of ['visitdiag', 'visitdrug', 'cdrug', 'visitepi', 'visitanc', 'visitancpregnancy']) {
    if (!tabs.includes(t)) { console.log(`\n(${t}: ไม่มีตารางนี้)`); continue; }
    console.log(`\n${t}:`, (await T(`show columns from ${t}`)).map((c) => c.Field).join(', '));
  }
  const proc = tabs.filter((t) => /proc|oper|lab|ndp/i.test(t)); console.log('\nตารางหัตถการ/แล็บ:', proc.join(', '));
  const pat = ['Z34', 'Z35', 'Z32', 'Z39', 'Z121', 'Z12.1', 'Z130', 'Z13.0', 'K060', 'K06.0', 'G431', 'G43.1', 'Z304', 'Z30.4', 'Z300', 'Z30.0', 'Z251', 'Z25.1', 'Z115', 'Z11.5', 'Z235', 'Z236', 'Z23.5', 'Z23.6', 'I10', 'E1'];
  const where = pat.map(() => 'v.diagcode like ?').join(' or ');
  const r = await T(`select upper(replace(v.diagcode,'.','')) c, count(*) n from visitdiag v where v.dateupdate >= date_sub(curdate(), interval 400 day) and (${where}) group by c order by n desc limit 40`, pat.map((x) => x + '%'));
  console.log('\nรหัส ICD-10 (400 วันล่าสุด) จำนวนครั้ง:', r.map((x) => `${x.c}=${x.n}`).join(' '));
  if (tabs.includes('cdrug')) { const c = await T(`select count(*) n, sum(tmtcode is not null and tmtcode<>'') tmt from cdrug`); console.log('\ncdrug: จำนวน', JSON.stringify(c)); }
  await conn.end(); process.exit(0);
}
if (args.includes('--explore-lab')) {
  // สำรวจตารางแล็บ (ชื่อคอลัมน์ + จำนวนแถวใน 400 วัน + ชื่อรายการแล็บ) เพื่อผูก HbA1c / Creatinine / Potassium — ไม่แสดงข้อมูลผู้ป่วย
  const T = async (sql, p) => { try { return (await conn.query(sql, p))[0]; } catch (e) { console.log('  ! ', e.code || e.message); return []; } };
  const tabs = (await T('show tables')).map((r) => Object.values(r)[0]);
  const labTabs = tabs.filter((t) => /lab|ncdscreen|ncdperson|cproc|cicd9|ncd/i.test(t));
  console.log('ตารางแล็บ/หัตถการ:', labTabs.join(', '));
  for (const t of labTabs.filter((x) => /^(visitlab|ncdlab|labfu|visitlabblood|visitlabsugarblood)/i.test(x))) {
    const cols = await T(`show columns from ${t}`);
    console.log(`\n${t}: ${cols.map((c) => c.Field).join(', ')}`);
    const hit = cols.map((c) => c.Field).filter((f) => /a1c|hba|creat|crea|pota|^k$|egfr|bun/i.test(f));
    for (const f of hit) { const r = await T(`select count(*) n from ${t} where \`${f}\` is not null and \`${f}\` <> '' and \`${f}\` <> 0`); console.log(`   คอลัมน์ ${f}: มีค่า ${r[0]?.n ?? '?'} แถว (ทั้งตาราง)`); }
  }
  for (const t of ['cproc', 'clabmain', 'clab', 'clabtest', 'cdrug']) {
    if (!tabs.includes(t)) continue;
    const cols = (await T(`show columns from ${t}`)).map((c) => c.Field);
    const nameCol = cols.find((c) => /name/i.test(c)); if (!nameCol) continue;
    const rr = await T(`select \`${nameCol}\` nm, ${cols[0]} cd from ${t} where \`${nameCol}\` like '%A1c%' or \`${nameCol}\` like '%hba1c%' or \`${nameCol}\` like '%creatinine%' or \`${nameCol}\` like '%ครีเอตินิน%' or \`${nameCol}\` like '%potassium%' or \`${nameCol}\` like '%โพแทสเซียม%' or \`${nameCol}\` like '%น้ำตาลสะสม%' limit 30`);
    console.log(`\nรายการใน ${t} ที่ชื่อเกี่ยวข้อง:`); rr.forEach((x) => console.log(`  ${x.cd} | ${x.nm}`));
  }
  await conn.end(); process.exit(0);
}
if (args.includes('--explore-lab2')) {
  // รายการแล็บใน clabchcyhembmsse ที่เกี่ยวกับ HbA1c / Creatinine / Potassium + จำนวนครั้งใน 400 วัน (เฉพาะรหัส/ชื่อรายการและตัวเลขรวม)
  const T = async (sql, p) => { try { return (await conn.query(sql, p))[0]; } catch (e) { console.log('  ! ', e.code || e.message); return []; } };
  const cols = (await T('show columns from clabchcyhembmsse')).map((c) => c.Field); console.log('clabchcyhembmsse:', cols.join(', '));
  const nameCol = cols.find((c) => /name/i.test(c)) || cols[1];
  const rows = await T(`select c.labcode, c.\`${nameCol}\` nm, (select count(*) from visitlabchcyhembmsse v where v.labcode = c.labcode and v.datecheck >= date_sub(curdate(), interval 400 day)) n from clabchcyhembmsse c where c.\`${nameCol}\` like '%A1c%' or c.\`${nameCol}\` like '%creat%' or c.\`${nameCol}\` like '%ครีเอ%' or c.\`${nameCol}\` like '%pota%' or c.\`${nameCol}\` like '%โพแท%' or c.\`${nameCol}\` like '%น้ำตาลสะสม%' or c.\`${nameCol}\` like '%HPV%' or c.\`${nameCol}\` like '%ไวรัสตับ%'`);
  console.log('\nรายการแล็บที่เกี่ยวข้อง (รหัส | ชื่อ | จำนวนครั้ง 400 วัน):'); rows.forEach((x) => console.log(`  ${x.labcode} | ${x.nm} | ${x.n}`));
  const top = await T(`select c.labcode, c.\`${nameCol}\` nm, count(*) n from visitlabchcyhembmsse v join clabchcyhembmsse c on c.labcode = v.labcode where v.datecheck >= date_sub(curdate(), interval 400 day) group by c.labcode, c.\`${nameCol}\` order by n desc limit 30`);
  console.log('\nรายการแล็บที่ใช้บ่อยสุด 30 อันดับ:'); top.forEach((x) => console.log(`  ${x.labcode} | ${x.nm} | ${x.n}`));
  const cr = await T(`select dg.drugname nm, count(*) n from visitdrug vd join visit v on v.pcucode = vd.pcucode and v.visitno = vd.visitno join cdrug dg on dg.drugcode = vd.drugcode where v.visitdate >= date_sub(curdate(), interval 400 day) and dg.drugname like '%Creatinine%' group by dg.drugname`);
  console.log('\nค่าบริการ Creatinine ใน visitdrug:'); cr.forEach((x) => console.log(`  ${x.nm} | ${x.n}`));
  await conn.end(); process.exit(0);
}
if (args.includes('--pp')) {
  // รายงาน P&P Fee Schedule: นับจำนวนครั้งของแต่ละกิจกรรมจาก JHCIS ตามรหัส ICD-10 (เลขรหัสไม่มีจุด) ทั้งปีงบประมาณ แล้วจำกัดจำนวนครั้งต่อคนต่อปีตามตาราง
  // ส่งเฉพาะตัวเลขรายเดือนต่อกิจกรรม (ไม่มีชื่อ/เลขบัตรผู้ป่วย) — เงินคำนวณที่หน้าเว็บจากอัตราจ่ายในตาราง
  const PCU = String(cfg.pcucode || '05449');
  const now = new Date(); const fyStartYear = now.getMonth() + 1 >= 10 ? now.getFullYear() : now.getFullYear() - 1;
  const fy = Number(argv('--fy')) || fyStartYear + 544; const sy = fy - 544;
  const from2 = `${sy}-10-01`; const to2 = `${sy + 1}-09-30`;
  const ageY = (b, d) => { if (!b) return null; const x = new Date(b); const y = new Date(d); if (isNaN(x)) return null; let a = y.getFullYear() - x.getFullYear(); if (y.getMonth() < x.getMonth() || (y.getMonth() === x.getMonth() && y.getDate() < x.getDate())) a--; return a; };
  const ageM = (b, d) => { if (!b) return null; const x = new Date(b); const y = new Date(d); if (isNaN(x)) return null; return (y.getFullYear() - x.getFullYear()) * 12 + (y.getMonth() - x.getMonth()) - (y.getDate() < x.getDate() ? 1 : 0); };
  // กติกาแต่ละกิจกรรม: codes = รหัส ICD-10 (ไม่มีจุด), cap = จำนวนครั้งสูงสุดต่อคนต่อปีงบ, ok = เงื่อนไขอายุ/เพศ
  const RULES = [
    { id: '3', codes: ['Z320', 'Z321'], cap: 4 },
    { id: '4', codes: ['Z390', 'Z391', 'Z392'], cap: 3 },
    { id: '5', codes: ['Z392'], cap: 2 },
    { id: '6', codes: ['Z121'], cap: 1 },
    { id: '7', codes: ['Z130'], cap: 1, ok: (r, d) => String(r.sex) === '2' && ageY(r.birth, d) >= 13 && ageY(r.birth, d) <= 45 },
    { id: '9', codes: ['Z130'], cap: 1, ok: (r, d) => { const m = ageM(r.birth, d); return m >= 6 && m <= 12; } },
    { id: '10', codes: ['K060'], cap: 2, ok: (r, d) => ageY(r.birth, d) >= 25 && ageY(r.birth, d) <= 59 },
    { id: '14', codes: ['Z251'], cap: 1 },
    { id: '19', codes: ['Z235', 'Z236'], cap: 1, ok: (r, d) => ageY(r.birth, d) >= 25 },
  ];
  const T = async (sql, p) => { try { return (await conn.query(sql, p))[0]; } catch (e) { console.log('  ! ดึงไม่ได้:', e.code || e.message); return []; } };
  const events = {}; RULES.forEach((r) => { events[r.id] = []; }); events['1'] = []; events['18'] = [];
  const allCodes = [...new Set(RULES.flatMap((r) => r.codes))];
  const diag = await T(`select v.pid, date_format(v.visitdate,'%Y-%m-%d') d, upper(replace(g.diagcode,'.','')) code, p.sex, p.birth, c.rightgroup rg
    from visitdiag g join visit v on v.pcucode = g.pcucode and v.visitno = g.visitno
    join person p on p.pcucodeperson = v.pcucodeperson and p.pid = v.pid left join cright c on c.rightcode = v.rightcode
    where v.pcucode = ? and v.visitdate between ? and ? and ${SVC} and upper(replace(g.diagcode,'.','')) in (${allCodes.map(() => '?').join(',')})`, [PCU, from2, to2, ...allCodes]);
  for (const r of diag) {
    if (String(r.rg) === '5') continue; // คนต่างด้าว ไม่อยู่ในกลุ่ม "คนไทยทุกสิทธิ"
    for (const rule of RULES) if (rule.codes.includes(r.code) && (!rule.ok || rule.ok(r, r.d))) events[rule.id].push({ k: String(r.pid), d: r.d });
  }
  // ฝากครรภ์: นับแถว visitanc ต่อครรภ์ (pid+pregno) สูงสุด 8 ครั้ง
  const anc = await T(`select v.pid, a.pregno, date_format(a.datecheck,'%Y-%m-%d') d, c.rightgroup rg from visitanc a left join visit v on v.pcucode = a.pcucode and v.visitno = a.visitno
    left join cright c on c.rightcode = v.rightcode where a.pcucode = ? and a.datecheck between ? and ?`, [PCU, from2, to2]);
  for (const r of anc) if (String(r.rg) !== '5') events['1'].push({ k: `${r.pid}_${r.pregno}`, d: r.d });
  // วัคซีน EPI อายุ 0–14 ปี: นับทุกเข็ม (ไม่จำกัดจำนวน)
  const epi = await T(`select e.pid, date_format(e.dateepi,'%Y-%m-%d') d, p.birth from visitepi e join person p on p.pcucodeperson = e.pcucodeperson and p.pid = e.pid
    where e.pcucode = ? and e.dateepi between ? and ?`, [PCU, from2, to2]);
  for (const r of epi) { const a = ageY(r.birth, r.d); if (a != null && a >= 0 && a <= 14) events['18'].push({ k: `${r.pid}`, d: r.d }); }
  // ยาคุมกำเนิด: JHCIS บันทึกเป็นรายการค่าบริการใน visitdrug/cdrug (ชื่อรายการ) — นับ 1 ครั้งต่อคนต่อวัน
  const DRUG_RULES = [
    { id: '11', like: '%ยาเม็ดคุมกำเนิดชนิดฮอร์โมนเดี่ยว%', cap: 5 },
    { id: '12', like: '%ยาเม็ดคุมกำเนิดชนิดฮอร์โมนรวม%', cap: 5 },
    { id: '13', like: '%ยาฉีดคุมกำเนิด%', cap: 5 },
    { id: '8', like: '%Hct%', cap: 1, ageMonths: [6, 12] },
    { id: '2', like: '%ขัดทำความสะอาดฟัน%', cap: 1 },
  ];
  const drugCap = {};
  for (const dr of DRUG_RULES) {
    events[dr.id] = []; drugCap[dr.id] = dr.cap;
    const rows2 = await T(`select v.pid, date_format(v.visitdate,'%Y-%m-%d') d, max(c.rightgroup) rg from visitdrug vd join visit v on v.pcucode = vd.pcucode and v.visitno = vd.visitno
      join cdrug dg on dg.drugcode = vd.drugcode left join cright c on c.rightcode = v.rightcode
      ${dr.ageMonths ? 'join person pe on pe.pcucodeperson = v.pcucodeperson and pe.pid = v.pid' : ''}
      where v.pcucode = ? and v.visitdate between ? and ? and ${SVC} and dg.drugname like ?
      ${dr.ageMonths ? `and timestampdiff(month, pe.birth, v.visitdate) between ${dr.ageMonths[0]} and ${dr.ageMonths[1]}` : ''} group by v.pid, v.visitdate`, [PCU, from2, to2, dr.like]);
    for (const r of rows2) if (String(r.rg) !== '5') events[dr.id].push({ k: String(r.pid), d: r.d });
  }
  // กิจกรรม 20: HbA1c (CH99) ผู้ป่วย DM type 2 (E11) สิทธิ UC (rightgroup 3) cap 2
  // กิจกรรม 21: HT รายใหม่ (I10 ครั้งแรกในชีวิตอยู่ในปีงบนี้) ตรวจ Creatinine (CH09) และ Potassium (CH19) ครบทั้งคู่ cap 1
  {
    events['20'] = []; drugCap['20'] = 2; events['21'] = []; drugCap['21'] = 1;
    const dm = new Set((await T(`select distinct v.pid from visitdiag d join visit v on v.pcucode = d.pcucode and v.visitno = d.visitno where v.pcucode = ? and d.diagcode like 'E11%' and v.visitdate >= date_sub(?, interval 3 year)`, [PCU, from2])).map((r) => String(r.pid)));
    const hb = await T(`select v.pid, date_format(v.visitdate,'%Y-%m-%d') d, max(c.rightgroup) rg from visitlabchcyhembmsse l join visit v on v.pcucode = l.pcucode and v.visitno = l.visitno left join cright c on c.rightcode = v.rightcode
      where v.pcucode = ? and v.visitdate between ? and ? and l.labcode = 'CH99' group by v.pid, v.visitdate`, [PCU, from2, to2]);
    for (const r of hb) if (dm.has(String(r.pid)) && String(r.rg) === '3') events['20'].push({ k: String(r.pid), d: r.d });
    const newHt = new Set((await T(`select v.pid from visitdiag d join visit v on v.pcucode = d.pcucode and v.visitno = d.visitno where v.pcucode = ? and d.diagcode like 'I10%' group by v.pid having min(v.visitdate) between ? and ?`, [PCU, from2, to2])).map((r) => String(r.pid)));
    const lb = await T(`select v.pid, date_format(v.visitdate,'%Y-%m-%d') d, l.labcode, max(c.rightgroup) rg from visitlabchcyhembmsse l join visit v on v.pcucode = l.pcucode and v.visitno = l.visitno left join cright c on c.rightcode = v.rightcode
      where v.pcucode = ? and v.visitdate between ? and ? and l.labcode in ('CH09','CH19') group by v.pid, v.visitdate, l.labcode`, [PCU, from2, to2]);
    const got = {};
    for (const r of lb) { if (!newHt.has(String(r.pid)) || String(r.rg) === '5') continue; const g = got[r.pid] || (got[r.pid] = {}); g[r.labcode] = r.d; }
    for (const [pid, g] of Object.entries(got)) if (g.CH09 && g.CH19) events['21'].push({ k: pid, d: g.CH09 > g.CH19 ? g.CH09 : g.CH19 });
  }
  // กิจกรรม 15–17 แยกตามรายการแล็บ: 15 HPV (หญิง 30–59 ปี), 16 HBsAg, 17 HCV-Ab — ต้องมีรหัส Z11.5 ในการมารับบริการครั้งนั้น, cap 1 ครั้ง/คน/ปี ไม่รวมสิทธิกลุ่ม 5
  for (const sc of [
    { id: '15', codes: ['CY1000HPV1'], women: true },
    { id: '16', codes: ['SE1100', 'SE_HBsAg'] },
    { id: '17', codes: ['SE1400', 'SE_HCV'] },
  ]) {
    events[sc.id] = []; drugCap[sc.id] = 1;
    const rr = await T(`select v.pid, date_format(v.visitdate,'%Y-%m-%d') d, max(c.rightgroup) rg from visitlabchcyhembmsse l join visit v on v.pcucode = l.pcucode and v.visitno = l.visitno left join cright c on c.rightcode = v.rightcode
      ${sc.women ? 'join person pe on pe.pcucodeperson = v.pcucodeperson and pe.pid = v.pid' : ''}
      where v.pcucode = ? and v.visitdate between ? and ? and l.labcode in (${sc.codes.map(() => '?').join(',')})
      and exists (select 1 from visitdiag dz where dz.pcucode = v.pcucode and dz.visitno = v.visitno and replace(dz.diagcode,'.','') like 'Z115%')
      ${sc.women ? "and pe.sex = '2' and timestampdiff(year, pe.birth, v.visitdate) between 30 and 59" : ''} group by v.pid, v.visitdate`, [PCU, from2, to2, ...sc.codes]);
    for (const r of rr) if (String(r.rg) !== '5') events[sc.id].push({ k: String(r.pid), d: r.d });
  }
  const capFor = (id) => (id === '1' ? 8 : id === '18' ? Infinity : drugCap[id] || RULES.find((r) => r.id === id).cap);
  const months = {}; const tot = {};
  for (const [id, list] of Object.entries(events)) {
    const cap = capFor(id); const seen = {}; const byK = {};
    list.sort((a, b) => a.d.localeCompare(b.d));
    for (const ev of list) {
      const m = ev.d.slice(0, 7); const o = ((months[m] ||= {})[id] ||= { n: 0, e: 0 });
      o.n++; byK[ev.k] = (byK[ev.k] || new Set()); byK[ev.k].add(ev.d);
      if ((seen[ev.k] = (seen[ev.k] || 0) + 1) <= cap) o.e++;
    }
    tot[id] = { n: list.length, e: Object.values(months).reduce((a, mm) => a + (mm[id]?.e || 0), 0), persons: Object.keys(byK).length };
  }
  const mapped = Object.keys(events);
  console.log(`ปีงบ ${fy} (${from2} ถึง ${to2}) หน่วยบริการ ${PCU}`);
  console.log('กิจกรรม: บันทึกทั้งหมด / เบิกได้หลังจำกัดครั้ง / จำนวนคน'); Object.entries(tot).sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true })).forEach(([id, t]) => console.log(`  ข้อ ${id}: ${t.n} / ${t.e} / ${t.persons}`));
  if (args.includes('--check')) {
    const kw = ['ขัดฟัน', 'ทำความสะอาดฟัน', 'Hct', 'ฮีมาโตคริต', 'HbA1c', 'ฮีโมโกลบิน', 'Creatinine', 'ครีอะตินิน', 'Potassium', 'โพแทสเซียม', 'HPV', 'HBsAg', 'ตับอักเสบบี', 'HCV', 'ตับอักเสบซี', 'Triferdine', 'ไตรเฟอร์ดีน', 'Ferrofolic', 'เฟอโรโฟลิก', 'Folic', 'ฟลูออไรด์', 'ตั้งครรภ์', 'FIT', 'เลือดแฝง'];
    const found = await T(`select dg.drugname nm, count(*) n from visitdrug vd join visit v on v.pcucode = vd.pcucode and v.visitno = vd.visitno join cdrug dg on dg.drugcode = vd.drugcode
      where v.pcucode = ? and v.visitdate >= date_sub(curdate(), interval 400 day) and (${kw.map(() => 'dg.drugname like ?').join(' or ')}) group by dg.drugname order by n desc limit 40`, [PCU, ...kw.map((k) => `%${k}%`)]);
    console.log('\nรายการค่าบริการ/ยาที่เกี่ยวข้อง (400 วัน):'); found.forEach((x) => console.log(`  ${x.nm} = ${x.n}`));
    const all18 = await T(`select dg.drugname nm, count(*) n from visitdrug vd join visit v on v.pcucode = vd.pcucode and v.visitno = vd.visitno join cdrug dg on dg.drugcode = vd.drugcode
      where v.pcucode = ? and v.visitdate >= date_sub(curdate(), interval 400 day) and (dg.drugname like '18%' or dg.drugname like '07%' or dg.drugname like '13%' or dg.drugname like '%HbA1c%' or dg.drugname like '%A1c%' or dg.drugname like '%creatinine%' or dg.drugname like '%HPV%') group by dg.drugname order by dg.drugname limit 120`, [PCU]);
    console.log('\nรายการค่าบริการทั้งหมดที่ขึ้นต้น 18/07/13 (400 วัน):'); all18.forEach((x) => console.log(`  ${x.nm} = ${x.n}`));
    const dr = await T(`select d.drugname nm, count(*) n from visitdiag g join visit v on v.pcucode = g.pcucode and v.visitno = g.visitno
      join visitdrug vd on vd.pcucode = v.pcucode and vd.visitno = v.visitno join cdrug d on d.drugcode = vd.drugcode
      where v.pcucode = ? and v.visitdate >= date_sub(curdate(), interval 400 day) and upper(replace(g.diagcode,'.','')) in ('Z304','Z300') group by d.drugname order by n desc limit 14`, [PCU]);
    console.log('\nยาที่พบในการมารับบริการรหัส Z30.0/Z30.4 (400 วัน):'); dr.forEach((x) => console.log(`  ${x.nm} = ${x.n}`));
    console.log('\nนี่คือการตรวจสอบเท่านั้น ยังไม่ได้ส่งข้อมูล'); await conn.end(); process.exit(0);
  }
  await conn.end();
  const url = cfg.ppEndpoint || 'https://us-central1-nsn-phc-web.cloudfunctions.net/ingestPpFee';
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey }, body: JSON.stringify({ fy, asOf: iso(new Date()), months, mapped }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { console.log(`ส่งไม่สำเร็จ: HTTP ${res.status} ${body.error || ''}`); process.exit(1); }
  console.log('ส่งสำเร็จ'); process.exit(0);
}
if (args.includes('--targets')) {
  // กลุ่มเป้าหมายรายกิจกรรม: ใครทำแล้ว/ยังไม่ได้ทำ แยกรายหมู่บ้าน (ส่งชื่อ อายุ บ้านเลขที่ หมู่ สถานะ — ไม่มีเลขบัตร) -> ppTargets
  const PCU = String(cfg.pcucode || '05449');
  const today = new Date(); const todayS = iso(today);
  const T = async (sql, p) => { try { return (await conn.query(sql, p))[0]; } catch (e) { console.log('  ! ดึงไม่ได้:', e.code || e.message); return []; } };
  const [pc] = await conn.query('show columns from person'); const alive = pc.some((x) => x.Field === 'dischar') ? "and (p.dischar is null or p.dischar in ('9','','0'))" : '';
  const ageY = (b) => { const x = new Date(b); if (!b || isNaN(x)) return null; let a = today.getFullYear() - x.getFullYear(); if (today.getMonth() < x.getMonth() || (today.getMonth() === x.getMonth() && today.getDate() < x.getDate())) a--; return a; };
  const ageM = (b) => { const x = new Date(b); if (!b || isNaN(x)) return null; return (today.getFullYear() - x.getFullYear()) * 12 + (today.getMonth() - x.getMonth()) - (today.getDate() < x.getDate() ? 1 : 0); };
  const people = await T(`select p.pid, t.titlename, p.fname, p.lname, p.sex, p.birth, hs.hno, hs.villcode
    from person p left join ctitle t on t.titlecode = p.prename join house hs on hs.pcucode = p.pcucodeperson and hs.hcode = p.hcode
    where p.typelive in ('1','3') and hs.villcode is not null and hs.villcode not like '%00' and not exists (select 1 from persondeath d where d.pid = p.pid and d.pcucodeperson = p.pcucodeperson) ${alive}`);
  const P = new Map(people.map((r) => [String(r.pid), r]));
  const vname = {}; for (const r of await T('select villcode, villname from village')) vname[parseInt(String(r.villcode).slice(6, 8), 10)] = r.villname;
  const moo = (r) => parseInt(String(r.villcode).slice(6, 8), 10);
  const nm = (r) => `${r.titlename || ''}${r.fname || ''} ${r.lname || ''}`.trim();
  const lastDiag = async (codes, since) => { const m = new Map(); for (const r of await T(`select v.pid, date_format(max(v.visitdate),'%Y-%m-%d') d from visitdiag g join visit v on v.pcucode = g.pcucode and v.visitno = g.visitno
      where v.pcucode = ? and v.visitdate >= ? and ${SVC} and upper(replace(g.diagcode,'.','')) in (${codes.map(() => '?').join(',')}) group by v.pid`, [PCU, since, ...codes])) m.set(String(r.pid), r.d); return m; };
  const dAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return iso(d); };
  const fyStartYear = today.getMonth() + 1 >= 10 ? today.getFullYear() : today.getFullYear() - 1; const fyStart = `${fyStartYear}-10-01`;
  const acts = {}; const cats = {};
  const add = (id, cat, name, rule, rows) => {
    const by = {}; let d = 0; let pa = 0; let t = 0;
    for (const r of rows) { const m = r.moo; const o = (by[m] ||= { t: 0, d: 0, p: 0 }); o.t++; t++; if (r.st === 'done') { o.d++; d++; } else if (r.st === 'partial') { o.p++; pa++; } }
    acts[id] = { cat, name, rule, total: t, done: d, partial: pa, todo: t - d - pa, byMoo: by };
    cats[cat] = rows.sort((a, b) => a.moo - b.moo || String(a.hno).localeCompare(String(b.hno), 'th', { numeric: true })).map((r) => [r.pid, r.name, r.age, r.hno || '', r.moo, r.st, r.detail]);
  };
  const mk = (r, st, detail, age) => ({ pid: r.pid, name: nm(r), age, hno: r.hno, moo: moo(r), st, detail });
  // 6) FIT: อายุ 50–70 ปี ทุก 2 ปี
  { const served = await lastDiag(['Z121'], dAgo(730)); const rows = [];
    for (const r of P.values()) { const a = ageY(r.birth); if (a >= 50 && a <= 70) rows.push(served.has(String(r.pid)) ? mk(r, 'done', `ตรวจล่าสุด ${served.get(String(r.pid))}`, a) : mk(r, 'todo', 'ยังไม่ได้ตรวจใน 2 ปี', a)); }
    add('6', 'TFIT', 'คัดกรองมะเร็งลำไส้ใหญ่ FIT TEST', 'อายุ 50–70 ปี (ทุก 2 ปี) — ทำแล้ว = มีรหัส Z12.1 ใน 2 ปีล่าสุด', rows); }
  // 9) ยาเม็ดเสริมธาตุเหล็กเด็ก 6–12 เดือน
  { const served = await lastDiag(['Z130'], dAgo(400)); const rows = [];
    for (const r of P.values()) { const m = ageM(r.birth); if (m >= 6 && m <= 12) { const ds = served.get(String(r.pid)); rows.push(ds ? mk(r, 'done', `ได้รับ ${ds}`, `${m} เดือน`) : mk(r, 'todo', 'ยังไม่ได้รับ', `${m} เดือน`)); } }
    add('9', 'TCH', 'ยาเม็ดเสริมธาตุเหล็กเด็ก 6–12 เดือน', 'เด็กอายุ 6–12 เดือน — ทำแล้ว = มีรหัส Z13.0', rows); }
  // 14) วัคซีนไข้หวัดใหญ่ (ประมาณการกลุ่มเสี่ยง: อายุ 65 ปีขึ้นไป)
  { const served = await lastDiag(['Z251'], fyStart); const rows = [];
    for (const r of P.values()) { const a = ageY(r.birth); if (a >= 65) rows.push(served.has(String(r.pid)) ? mk(r, 'done', `ฉีด ${served.get(String(r.pid))}`, a) : mk(r, 'todo', 'ยังไม่ได้ฉีดในปีงบนี้', a)); }
    add('14', 'TFLU', 'วัคซีนไข้หวัดใหญ่', 'อายุ 65 ปีขึ้นไป (กลุ่มเสี่ยงอื่น เช่น โรคเรื้อรัง ยังไม่รวม) — ทำแล้ว = มีรหัส Z25.1 ในปีงบนี้', rows); }
  // 1) หญิงตั้งครรภ์: ครรภ์ที่ LMP ไม่เกิน 300 วัน และกำหนดคลอดยังไม่เกิน 45 วัน
  { const preg = await T(`select pid, pregno, date_format(edc,'%Y-%m-%d') edc from visitancpregnancy where lmp >= date_sub(curdate(), interval 300 day) and edc >= date_sub(curdate(), interval 45 day)`);
    const cnt = {}; for (const r of await T('select pid, pregno, count(*) n, date_format(max(datecheck),\'%Y-%m-%d\') d from visitanc group by pid, pregno')) cnt[`${r.pid}_${r.pregno}`] = r;
    const rows = [];
    for (const g of preg) { const r = P.get(String(g.pid)); if (!r) continue; const c = cnt[`${g.pid}_${g.pregno}`]; const n = c ? Number(c.n) : 0;
      rows.push(mk(r, n >= 8 ? 'done' : n > 0 ? 'partial' : 'todo', n ? `ฝากครรภ์ ${n}/8 ครั้ง (ล่าสุด ${c.d}) · กำหนดคลอด ${g.edc}` : `ยังไม่เคยฝากครรภ์ · กำหนดคลอด ${g.edc}`, ageY(r.birth))); }
    add('1', 'TANC', 'ฝากครรภ์ ANC 1–8 ครั้ง', 'หญิงตั้งครรภ์ปัจจุบัน (กำหนดคลอดยังไม่เกิน 45 วัน) — ทำแล้ว = ฝากครรภ์ครบ 8 ครั้ง', rows); }
  for (const [id, a] of Object.entries(acts)) console.log(`ข้อ ${id} ${a.name}: เป้าหมาย ${a.total} · ทำแล้ว ${a.done} · ทำบางส่วน ${a.partial} · ยังไม่ทำ ${a.todo}`);
  if (args.includes('--check')) { console.log('นี่คือการตรวจสอบเท่านั้น ยังไม่ได้ส่งข้อมูล'); await conn.end(); process.exit(0); }
  await conn.end();
  const chunks = []; for (const [cat, list] of Object.entries(cats)) for (let i = 0; i < list.length || i === 0; i += 1500) { chunks.push({ cat, idx: i / 1500, rows: list.slice(i, i + 1500) }); if (!list.length) break; }
  const url = cfg.targetsEndpoint || 'https://us-central1-nsn-phc-web.cloudfunctions.net/ingestPpTargets';
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey }, body: JSON.stringify({ summary: { acts, villages: vname, asOf: todayS }, chunks }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { console.log(`ส่งไม่สำเร็จ: HTTP ${res.status} ${body.error || ''}`); process.exit(1); }
  console.log(`ส่งสำเร็จ ${body.chunks} ชุด`); process.exit(0);
}
if (args.includes('--rights')) {
  // โหมดทะเบียนสิทธิ UC/Wel: ตรง = อยู่ในเขต (ประเภทอาศัย 1-4) และขึ้นทะเบียนที่ รพ.สต.เรา / ไม่ตรง = อยู่ในเขตแต่ขึ้นทะเบียนที่อื่น / B = นอกเขตแต่มาขึ้นทะเบียนกับเรา
  const PCU = String(cfg.pcucode || '05449');
  const [pc] = await conn.query('show columns from person'); const has = (c) => pc.some((x) => x.Field === c);
  const alive = has('dischar') ? "and (p.dischar is null or p.dischar in ('9','','0'))" : '';
  const rows = await conn.query(`select p.pid, t.titlename, p.fname, p.lname, p.birth, p.typelive, p.hossub, h.hosname, c.rightgroup, c.rightname, p.dateexpire,
      hs.hno, hs.villcode, concat(ifnull(hs.hno,''), ' ม.', cast(substr(hs.villcode,7,2) as unsigned)) addr
    from person p
    left join ctitle t on t.titlecode = p.prename
    left join cright c on c.rightcode = p.rightcode
    left join chospital h on h.hoscode = p.hossub
    left join house hs on hs.pcucode = p.pcucodeperson and hs.hcode = p.hcode
    where not exists (select 1 from persondeath d where d.pid = p.pid and d.pcucodeperson = p.pcucodeperson) ${alive}`).then((r) => r[0]);
  await conn.end();
  const today = new Date(); const age = (b) => { if (!b) return ''; const d = new Date(b); return isNaN(d) ? '' : Math.floor((today - d) / 31557600000); };
  const nm = (r) => `${r.titlename || ''}${r.fname || ''} ${r.lname || ''}`.trim();
  const cats = { A: [], B: [], C: [], RUC: [], ROFC: [], RSSS: [], RLGO: [], RNRD: [], ROTH: [], RNON: [] }; const RK = { 1: 'ROFC', 2: 'RSSS', 7: 'RLGO', 5: 'RNRD' }; const sum = { reg: {}, regUcWel: [0, 0], pcu: PCU, inAreaNoUcWel: 0, expired: 0, hosC: {}, byType: {} };
  for (const r of rows) {
    const g = String(r.rightgroup || ''); const uc = g === '3' || g === '4';
    const inArea = r.villcode && !String(r.villcode).endsWith('00'); const tl = String(r.typelive || '');
    const here = String(r.hossub || '').trim() === PCU; const t14 = ['1', '2', '3', '4'].includes(tl);
    if (tl === '1' || tl === '3') { // ประชากรตามทะเบียนราษฎร์ (ประเภทอาศัย 1,3) แยกตามประเภทสิทธิ; สิทธิหมดอายุนับเป็นไร้สิทธิ
      const key = !g || (r.dateexpire && new Date(r.dateexpire) < today) ? 'RNON' : uc ? 'RUC' : (RK[g] || 'ROTH');
      cats[key].push([r.pid, nm(r), age(r.birth), (r.addr || '').trim(), tl, r.rightname || 'ไม่มีสิทธิ', r.hosname || (r.hossub ? `รหัส ${r.hossub}` : 'ไม่ระบุ'), g]);
      sum.reg[key] = (sum.reg[key] || 0) + 1; if (key === 'RUC') sum.regUcWel[g === '3' ? 0 : 1]++;
    }
    if (inArea && t14 && !uc) { sum.inAreaNoUcWel++; continue; }
    if (!uc) continue;
    if (r.dateexpire && new Date(r.dateexpire) < today) { sum.expired++; continue; }
    const row = [r.pid, nm(r), age(r.birth), (r.addr || '').trim(), tl, r.rightname || '', r.hosname || (r.hossub ? `รหัส ${r.hossub}` : 'ไม่ระบุ'), g];
    const bt = (sum.byType[tl] ||= { A: [0, 0], C: [0, 0] }); const gi = g === '3' ? 0 : 1;
    if (inArea && t14 && here) { cats.A.push(row); bt.A[gi]++; }
    else if (inArea && t14) { cats.C.push(row); bt.C[gi]++; sum.hosC[row[6]] = (sum.hosC[row[6]] || 0) + 1; }
    else if (!inArea && here) cats.B.push(row);
  }
  sum.counts = { A: cats.A.length, B: cats.B.length, C: cats.C.length };
  sum.hosC = Object.fromEntries(Object.entries(sum.hosC).sort((a, b) => b[1] - a[1]).slice(0, 20));
  sum.asOf = iso(today);
  console.log(`ตรง(A)=${sum.counts.A}  นอกเขตมาขึ้นกับเรา(B)=${sum.counts.B}  ไม่ตรง(C)=${sum.counts.C}  ในเขตไม่มี UC/Wel=${sum.inAreaNoUcWel}  หมดอายุ=${sum.expired}`);
  console.log('ประชากรตามทะเบียนราษฎร์ แยกสิทธิ:', JSON.stringify(sum.reg), ' UC/Wel =', sum.regUcWel.join('/'));
  if (args.includes('--check')) { console.log('นี่คือการตรวจสอบเท่านั้น ยังไม่ได้ส่งข้อมูล'); process.exit(0); }
  const chunks = []; for (const [cat, list] of Object.entries(cats)) for (let i = 0; i < list.length || (i === 0 && !list.length); i += 1500) { chunks.push({ cat, idx: i / 1500, rows: list.slice(i, i + 1500) }); if (!list.length) break; }
  const url = cfg.rightsEndpoint || 'https://us-central1-nsn-phc-web.cloudfunctions.net/ingestRightsRegistry';
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey }, body: JSON.stringify({ summary: sum, chunks }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { console.log(`ส่งไม่สำเร็จ: HTTP ${res.status} ${body.error || ''}`); process.exit(1); }
  console.log(`ส่งสำเร็จ ${body.chunks} ชุด`); process.exit(0);
}
let from; let to = iso(new Date());
if (argv('--check')) { from = to = argv('--check'); }
else if (argv('--from')) from = argv('--from');
else { const d = new Date(); d.setDate(d.getDate() - ((cfg.days || 7) - 1)); from = iso(d); }
{ const d = dbConfig(); console.log(`เชื่อมต่อ ${d.user}@${d.host}:${d.port}/${d.database}`); }
console.log(`ดึงข้อมูล ${from} ถึง ${to} ...`);
const out = await collect(conn, from, to);
await conn.end();
if (argv('--check')) {
  const x = out[0];
  if (x) {
    console.log('===== สรุปแบบย่อ (เทียบกับ JHCIS) =====');
    console.log(`วันที่ ${x.date}  ครั้ง(visits)=${x.visits}  คน(persons)=${x.persons}`);
    console.log('ตามประเภทบริการ flagservice:', JSON.stringify(x.byFlag));
    console.log('ตามสิทธิ:', JSON.stringify(x.byRight));
    console.log('==========================================');
  }
  if (argv('--full')) console.log(x ? JSON.stringify(x, null, 2) : 'ไม่พบการให้บริการในวันนั้น');
  console.log(failed.size ? `\nตัวชี้วัดที่ดึงไม่ได้: ${[...failed].join(', ')}` : '\nดึงได้ครบทุกตัวชี้วัด');
  console.log('นี่คือการตรวจสอบเท่านั้น ยังไม่ได้ส่งข้อมูลขึ้นระบบ — เทียบ "visits" กับรายงานใน JHCIS ของวันเดียวกัน');
  process.exit(0);
}
if (!out.length) { console.log('ไม่มีข้อมูลในช่วงนี้'); process.exit(0); }
const note = failed.size ? `ดึงไม่ได้: ${[...failed].join(', ')}` : '';
// ส่งทีละ 100 วัน (เซิร์ฟเวอร์รับได้ไม่เกิน 400 วัน/ครั้ง)
let saved = 0; let ok = true;
for (let i = 0; i < out.length; i += 100) {
  const part = out.slice(i, i + 100);
  const res = await fetch(cfg.endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey }, body: JSON.stringify({ days: part, note }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { console.log(`ส่งไม่สำเร็จ: HTTP ${res.status} ${body.error || ''}`); ok = false; break; }
  saved += body.saved || 0; console.log(`  ส่งแล้ว ${saved}/${out.length} วัน`);
}
if (ok) console.log(`ส่งสำเร็จ ${saved} วัน${note ? ` (${note})` : ''}`);
process.exit(ok ? 0 : 1);
