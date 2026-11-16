// นำผลคัดกรอง NCD (ที่เจ้าหน้าที่ "จัดคิว" ในแอป) เขียนลง JHCIS เป็น visit ใหม่
//   ค่าเริ่มต้น = ทดลอง (dry-run) แสดงสิ่งที่จะเขียน ไม่แตะฐานข้อมูล
//   node ncd-writeback.mjs            ทดลอง
//   node ncd-writeback.mjs --apply    เขียนจริง (ต้องปิดโปรแกรม JHCIS ทุกเครื่องก่อน และควรลองกับฐานสำเนา)
//   node ncd-writeback.mjs --rollback ncd-writeback-xxxx.json   ลบแถวที่เคยเขียน (ใช้ไฟล์บันทึกที่สร้างตอน --apply)
// หลักความปลอดภัย: เขียนเฉพาะ INSERT (ไม่แก้/ไม่ลบข้อมูลเดิม) · visitno ใหม่ = สูงสุด+1 · ข้ามคนที่มีวิสิตคัดกรองวันเดียวกันแล้ว · ไม่ลงค่าบริการ/ค่าใช้จ่ายใดๆ · บันทึกคีย์ที่เขียนไว้ให้ย้อนกลับได้
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




const args = process.argv.slice(2); const APPLY = args.includes('--apply'); const PCU = String(cfg.pcucode || '05449');
const USER = 'NSN-APP';
const conn = await mysql.createConnection({ ...dbConfig(), charset: 'utf8mb4' });
const pad = (n) => String(n).padStart(2, '0');
const nowDT = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
const bkk = (v) => (v === '' || v == null ? null : Number(v));

if (args.includes('--rollback')) {
  const f = args[args.indexOf('--rollback') + 1]; const log = JSON.parse(fs.readFileSync(path.resolve(f), 'utf8'));
  console.log(`ย้อนกลับ ${log.items.length} รายการ จากไฟล์ ${f}`);
  if (!APPLY) { console.log('ทดลองเท่านั้น — เพิ่ม --apply เพื่อลบจริง'); process.exit(0); }
  for (const it of log.items) {
    for (const t of ['f43specialpp', 'visitlabsugarblood', 'ncd_person_ncd_screen', 'visitdiag']) await conn.query(`delete from ${t} where pcucode = ? and visitno = ?`, [PCU, it.visitno]);
    await conn.query('delete from visit where pcucode = ? and visitno = ?', [PCU, it.visitno]);
    console.log(`ลบ visitno ${it.visitno} แล้ว`);
  }
  await conn.end(); process.exit(0);
}

// ---- รหัสที่ยืนยันจากข้อมูลจริงของ JHCIS ----
const SMOKE = { never: '0', former: '1', current: '2' };          // ncd_person_ncd_screen.smoke (เทียบกับ PP 1B52/1B51)
const ALCOHOL = { none: '0', former: '1', sometimes: '2', regular: '4' }; // alcohol (0 ไม่ดื่ม · 1 เลิก? · 2 นานๆครั้ง · 4 เป็นประจำ — ตาม ds_alc_smoke)
const ppCodes = (r) => {
  const o = []; const q = r.q2a === '' || r.q2a == null || r.q2b === '' || r.q2b == null ? null : (r.q2a || r.q2b ? '1B0211' : '1B0210'); if (q) o.push(q);
  if (r.smokeStatus === 'never') o.push('1B52'); else if (r.smokeStatus === 'former') o.push('1B51');
  if (r.alcoholFreq === 'none') o.push('1B600'); else if (r.alcoholFreq === 'former') o.push('1B601');
  if ((r.counsel || []).length) o.push('1F38');
  return o;
};
const fyBE = (d) => { const y = Number(d.slice(0, 4)); return (Number(d.slice(5, 7)) >= 10 ? y + 1 : y) + 543; };
const grpText = (age) => (age <= 34 ? '15-34 ปี' : age <= 59 ? '35-59 ปี' : '60 ปีขึ้นไป');
const ageAt = (birth, d) => { const b = new Date(birth); const x = new Date(d); let a = x.getFullYear() - b.getFullYear(); if (x.getMonth() < b.getMonth() || (x.getMonth() === b.getMonth() && x.getDate() < b.getDate())) a--; return a; };

// ---- ดึงคิวจากคลาวด์ ----
const url = cfg.ncdQueueEndpoint || 'https://us-central1-nsn-phc-web.cloudfunctions.net/ncdQueue';
const post = async (body) => { const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey }, body: JSON.stringify(body) }); const j = await res.json().catch(() => ({})); if (!res.ok) throw new Error(`HTTP ${res.status} ${j.error || ''}`); return j; };
const queue = (await post({ action: 'list' })).rows || [];
console.log(`${APPLY ? '*** เขียนจริง ***' : 'ทดลอง (ไม่แตะฐานข้อมูล)'} · รายการในคิว ${queue.length}`);
if (!queue.length) { await conn.end(); process.exit(0); }

const [eng] = await conn.query("select table_name t, engine e from information_schema.tables where table_schema = database() and table_name in ('visit','visitdiag','ncd_person_ncd_screen','f43specialpp','visitlabsugarblood')");
const tx = eng.length === 5 && eng.every((x) => /innodb/i.test(x.e || ''));
console.log('เอนจินตาราง:', eng.map((x) => `${x.t}=${x.e}`).join(', '), tx ? '(ทรานแซกชันได้)' : '(ไม่รองรับทรานแซกชัน — ต้องปิด JHCIS ก่อนเขียนจริง)');
if (APPLY && !tx && !args.includes('--jhcis-closed')) { console.log('ไม่เขียน: ตารางไม่รองรับทรานแซกชัน ให้ปิด JHCIS ทุกเครื่องแล้วรันใหม่พร้อม --jhcis-closed'); process.exit(1); }

// ค่าอ้างอิงจากข้อมูลจริง (รูปแบบรหัสวินิจฉัย, clinic, ppsplace, ค่าหมวดหมู่ของ visit คัดกรองล่าสุด)
const first = async (sql, p = []) => (await conn.query(sql, p))[0][0] || null;
const dxFmt = async (code) => { const r = await first("select diagcode from visitdiag where replace(diagcode,'.','') = ? limit 1", [code.replace('.', '')]); return r?.diagcode || code; };
const dxClinic = (await first("select clinic from visitdiag where replace(diagcode,'.','') like 'Z13%' and clinic is not null order by visitno desc limit 1"))?.clinic ?? null;
const ppPlace = (await first('select ppsplace from f43specialpp where pcucode = ? and ppsplace is not null order by dateserv desc limit 1', [PCU]))?.ppsplace ?? PCU;
const tmpl = await first('select v.timeservice, v.incup, v.servicetype, v.receivepatient, v.alivestatus, v.typein, v.hosmain, v.hossub from visit v join ncd_person_ncd_screen s on s.pcucode = v.pcucode and s.visitno = v.visitno where v.pcucode = ? order by v.visitno desc limit 1', [PCU]) || {};

const results = []; const written = [];
for (const r of queue) {
  const tag = `${r.id} ${String(r.name || '').slice(0, 20)}`;
  try {
    const cid = String(r.cid || '').replace(/\D/g, ''); if (cid.length !== 13) throw new Error('ไม่มีเลขบัตร 13 หลัก');
    const [pp] = await conn.query('select pid, pcucodeperson, rightcode, rightno, hosmain, hossub, birth from person where idcard = ? and pcucodeperson = ?', [cid, PCU]);
    if (pp.length !== 1) throw new Error(pp.length ? 'พบเลขบัตรซ้ำหลายคนใน JHCIS' : 'ไม่พบเลขบัตรนี้ใน JHCIS');
    const p = pp[0]; const date = String(r.screenDate).slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('วันที่คัดกรองไม่ถูกต้อง');
    const [dup] = await conn.query("select v.visitno from visit v join visitdiag g on g.pcucode = v.pcucode and g.visitno = v.visitno where v.pcucode = ? and v.pid = ? and v.visitdate = ? and replace(g.diagcode,'.','') in ('Z131','Z133','Z136') limit 1", [PCU, p.pid, date]);
    if (dup.length) { console.log(`- ข้าม ${tag}: มีวิสิตคัดกรองวันเดียวกันแล้ว (visitno ${dup[0].visitno}) — ถือว่าบันทึกแล้ว`); results.push({ id: r.id, status: 'done', visitno: dup[0].visitno }); continue; }
    const age = ageAt(p.birth, date); const sbp = bkk(r.sbp1); const dbp = bkk(r.dbp1); const glu = bkk(r.glucose);
    const weight = bkk(r.weight); const height = bkk(r.height); const waist = bkk(r.waist); const bmi = weight && height ? Math.round((weight / ((height / 100) ** 2)) * 10) / 10 : 0;
    const sexM = String(r.sex) === 'M'; const place = r.screenPlace === 'unit' ? '1' : '2';
    const symptoms = `คัดกรองและประเมินปัจจัยเสี่ยงต่อสุขภาพ/สุขภาพจิต อายุ ${grpText(age)} ปีงบประมาณ ${fyBE(date)}`;
    const dxList = [['Z00.0', '01'], ['Z13.3', '04'], ['Z13.6', '04'], ['Z71.3', '04']]; if (glu) dxList.push(['Z13.1', '04']);
    const ppList = ppCodes(r);
    const plan = { visit: { date, pid: p.pid, bp: sbp && dbp ? `${sbp}/${dbp}` : null, weight, height, waist, symptoms }, screen: { age, bmi, glucose: glu, smoke: SMOKE[r.smokeStatus] ?? null, alcohol: ALCOHOL[r.alcoholFreq] ?? null, servplace: place }, dx: dxList.map((x) => x[0]), pp: ppList };
    console.log(`- ${tag}: ${JSON.stringify(plan)}`);
    if (!APPLY) { results.push({ id: r.id, status: 'plan' }); continue; }

    if (tx) await conn.beginTransaction();
    let visitno = 0; const done = [];
    try {
      for (let t = 0; t < 5; t++) {
        visitno = ((await first('select ifnull(max(visitno), 0) + 1 n from visit where pcucode = ?', [PCU]))?.n) || 1;
        try {
          await conn.query('insert into visit (pcucode, visitno, visitdate, pcucodeperson, pid, timeservice, timestart, timeend, rightcode, rightno, hosmain, hossub, incup, symptoms, weight, height, pressure, pressure2, waist, alivestatus, locateservice, username, flagservice, servicetype, dateupdate, typein) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [PCU, visitno, date, p.pcucodeperson, p.pid, tmpl.timeservice ?? null, nowDT().slice(11), nowDT().slice(11), p.rightcode, p.rightno, p.hosmain ?? tmpl.hosmain ?? null, p.hossub ?? tmpl.hossub ?? null, tmpl.incup ?? null, symptoms, weight, height, sbp && dbp ? `${sbp}/${dbp}` : null, bkk(r.sbp2) && bkk(r.dbp2) ? `${bkk(r.sbp2)}/${bkk(r.dbp2)}` : null, waist, tmpl.alivestatus ?? null, place, USER, '03', tmpl.servicetype ?? '1', nowDT(), tmpl.typein ?? null]);
          break;
        } catch (e) { if (e.code === 'ER_DUP_ENTRY' && t < 4) continue; throw e; }
      }
      done.push('visit');
      for (const [code, dxtype] of dxList) { await conn.query('insert into visitdiag (pcucode, visitno, diagcode, conti, clinic, dxtype, doctordiag, dateupdate) values (?,?,?,?,?,?,?,?)', [PCU, visitno, await dxFmt(code), '0', dxClinic, dxtype, USER, nowDT()]); }
      done.push('visitdiag');
      const no = ((await first('select ifnull(max(`no`), 0) + 1 n from ncd_person_ncd_screen where pcucode = ? and pid = ?', [PCU, String(p.pid)]))?.n) || 1;
      await conn.query('insert into ncd_person_ncd_screen (pcucode, pid, `no`, age_year, screen_date, height, weight, waist, hbp_s1, hbp_d1, screen_q1, screen_q2, screen_q3, screen_q4, screen_q5, screen_q6, hbp_s2, hbp_d2, bsl, bmi, result_new_dm, result_new_hbp, result_new_waist, result_new_obesity, d_update, user_update, visitno, smoke, alcohol, bstest, dateupdate, servplace) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [PCU, String(p.pid), no, age, date, height || 0, weight || 0, waist || 0, sbp || 0, dbp || 0, '0', '0', '0', '0', '0', '0', bkk(r.sbp2), bkk(r.dbp2), glu, bmi, '1', sbp >= 140 || dbp >= 90 ? '1' : '0', waist && (sexM ? waist >= 90 : waist >= 80) ? '1' : '0', bmi >= 25 ? '1' : '0', date, USER, visitno, SMOKE[r.smokeStatus] ?? null, ALCOHOL[r.alcoholFreq] ?? null, glu ? (r.fasting === false ? '4' : '3') : null, nowDT(), place]);
      done.push('ncd_person_ncd_screen');
      if (glu) { await conn.query('insert into visitlabsugarblood (pcucode, visitno, sugarnumdigit, typetesting, dateupdate) values (?,?,?,?,?)', [PCU, visitno, glu, '1', nowDT()]); done.push('visitlabsugarblood'); }
      for (const code of ppList) await conn.query('insert into f43specialpp (pcucodeperson, pid, dateserv, ppspecial, pcucode, visitno, servplace, ppsplace, provider, dateupdate) values (?,?,?,?,?,?,?,?,?,?)', [p.pcucodeperson, p.pid, date, code, PCU, visitno, place, ppPlace, USER, nowDT()]);
      done.push('f43specialpp');
      if (tx) await conn.commit();
    } catch (e) {
      if (tx) await conn.rollback(); else if (visitno) { for (const t of ['f43specialpp', 'visitlabsugarblood', 'ncd_person_ncd_screen', 'visitdiag']) await conn.query(`delete from ${t} where pcucode = ? and visitno = ?`, [PCU, visitno]).catch(() => {}); await conn.query('delete from visit where pcucode = ? and visitno = ?', [PCU, visitno]).catch(() => {}); }
      throw e;
    }
    written.push({ id: r.id, visitno, pid: p.pid, date });
    results.push({ id: r.id, status: 'done', visitno });
    console.log(`  ✓ เขียนแล้ว visitno ${visitno}`);
  } catch (e) { console.log(`  ✗ ${tag}: ${e.message}`); results.push({ id: r.id, status: 'error', error: e.message }); }
}
await conn.end();
if (APPLY) {
  if (written.length) { const f = path.join(here, `ncd-writeback-${nowDT().replace(/[: ]/g, '-')}.json`); fs.writeFileSync(f, JSON.stringify({ at: nowDT(), items: written }, null, 1), 'utf8'); console.log(`บันทึกไฟล์ย้อนกลับ: ${f}`); }
  const m = await post({ action: 'mark', results: results.filter((x) => x.status !== 'plan') }); console.log(`แจ้งผลกลับแอป ${m.updated} รายการ`);
}
console.log(APPLY ? `เสร็จ: เขียน ${written.length} · ผิดพลาด ${results.filter((x) => x.status === 'error').length}` : 'ทดลองเสร็จ — ยังไม่ได้เขียนอะไร (เพิ่ม --apply เมื่อพร้อม)');
