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
