// สร้างโครงรายงานการสอบสวนโรคฉบับสมบูรณ์ (blocks) ตามหลักการสอบสวนการระบาดของกรมควบคุมโรค:
// ความเป็นมา → วัตถุประสงค์ → วิธีการ → ผล (ยืนยันการระบาด, นิยาม/ค้นหาผู้ป่วย, บุคคล-เวลา-สถานที่, แล็บ, วิเคราะห์) → มาตรการ → ปัญหา → สรุป/วิจารณ์ → ข้อเสนอแนะ
// ตัวเลขในรายงานคำนวณจากข้อมูลในเคสเท่านั้น; ส่วนที่ผู้สอบสวนต้องเขียนเองและยังว่างจะแสดงเป็น "(ยังไม่ได้บันทึก)"
import { fmtDate } from '../../lib/thai';
import { AGE_ORDER, SEX, STATUS, fullName, nf } from './outbreakLib';
import { TEMPLATES } from './diseaseTemplates';
import { curvePng } from './reportChart';
import { f2, fp, twoByTwo } from './reportStats';
import { sectionText } from './reportChoices';

export const EMPTY = '(ยังไม่ได้บันทึก)';
export const SECTIONS = [
  ['background', '1. ความเป็นมา', 'การรับแจ้งเหตุการณ์ ใครแจ้ง เมื่อใด สถานการณ์ที่ผ่านมาของโรคในพื้นที่ เหตุผลที่ต้องสอบสวน'],
  ['objectives', '2. วัตถุประสงค์', 'เช่น เพื่อยืนยันการวินิจฉัยและการระบาด เพื่อหาแหล่งโรค/ปัจจัยเสี่ยง เพื่อกำหนดมาตรการควบคุมและป้องกัน'],
  ['methods', '3. วิธีการศึกษา', 'ระบาดวิทยาเชิงพรรณนา การค้นหาผู้ป่วยเพิ่ม (ที่ไหน อย่างไร) การเก็บตัวอย่าง การศึกษาสิ่งแวดล้อม การศึกษาเชิงวิเคราะห์'],
  ['confirm', '4.1 การยืนยันการวินิจฉัยและการระบาด', 'เปรียบเทียบจำนวนผู้ป่วยกับช่วงเวลาเดียวกันของปีก่อน/ค่ามัธยฐานย้อนหลัง; ผลตรวจที่ยืนยันโรค'],
  ['caseFinding', '4.2 การค้นหาผู้ป่วยเพิ่มเติม', 'วิธีค้นหา (เคาะประตูบ้าน/โรงพยาบาล/โรงเรียน) จำนวนที่ตรวจพบเพิ่ม'],
  ['envStudy', '4.6 ผลการศึกษาสิ่งแวดล้อมและข้อมูลอื่น', 'สุขาภิบาล แหล่งน้ำ อาหาร แหล่งเพาะพันธุ์ยุง/สัตว์นำโรค ผลสำรวจสิ่งแวดล้อม'],
  ['hypothesis', '4.7 สมมติฐานการเกิดโรค', 'สมมติฐานเกี่ยวกับแหล่งโรค วิธีถ่ายทอด และปัจจัยเสี่ยง ที่ได้จากระบาดวิทยาเชิงพรรณนา'],
  ['analyticNote', '4.8 การแปลผลการศึกษาเชิงวิเคราะห์', 'แปลผล OR/RR, 95% CI และข้อจำกัด (ถ้ามีการศึกษาเชิงวิเคราะห์)'],
  ['problems', '6. ปัญหา อุปสรรค และข้อจำกัดของการสอบสวน', ''],
  ['discussion', '7. สรุปและวิจารณ์ผล', 'สรุปผลการสอบสวนเทียบกับสมมติฐาน และวิจารณ์'],
  ['recommendations', '8. ข้อเสนอแนะ', 'มาตรการที่ควรดำเนินการต่อ และการป้องกันการเกิดซ้ำ ทั้งระยะสั้นและระยะยาว'],
  ['references', 'เอกสารอ้างอิง', 'เช่น แนวทางเฝ้าระวังและสอบสวนโรค กรมควบคุมโรค; นิยามโรคที่ใช้'],
];

export function draftBackground(cs, dname, org) {
  return `วันที่ ${fmtDate(cs.reportDate)} ${org} ได้รับแจ้งเหตุการณ์ “${cs.title}” (โรค${dname})${cs.place ? ` บริเวณ${cs.place}` : ''}${cs.villageNo ? ` หมู่ที่ ${cs.villageNo}${cs.villageName ? ` ${cs.villageName}` : ''}` : ''} จึงดำเนินการสอบสวนโรค — (เพิ่มเติม: ผู้แจ้ง ช่องทาง และสถานการณ์โรคในพื้นที่ที่ผ่านมา)`;
}
export function draftConclusion(an, dname) {
  if (!an?.n) return '';
  return `การสอบสวนพบผู้ป่วย${dname} ${an.n} ราย${an.dead ? ` เสียชีวิต ${an.dead} ราย (อัตราป่วยตาย ${an.cfr.toFixed(1)}%)` : ' ไม่มีผู้เสียชีวิต'}${an.attack != null ? ` อัตราป่วย (attack rate) ${an.attack.toFixed(2)}%` : ''}${an.first ? ` ผู้ป่วยรายแรกเริ่มป่วยวันที่ ${fmtDate(an.first)} รายสุดท้ายวันที่ ${fmtDate(an.last)}` : ''} — (เพิ่มเติม: แหล่งโรค/ปัจจัยเสี่ยงที่สรุปได้)`;
}

const pct = (n, t) => (t ? `${((n / t) * 100).toFixed(1)}` : '-');
const distTable = (obj, order, head) => {
  const keys = (order ? order.filter((k) => obj[k]) : Object.keys(obj)).sort((a, b) => (order ? 0 : obj[b] - obj[a])); const t = keys.reduce((s, k) => s + obj[k], 0);
  return { t: 'table', head: [head, 'จำนวน (ราย)', 'ร้อยละ'], rows: [...keys.map((k) => [k, nf(obj[k]), pct(obj[k], t)]), ['รวม', nf(t), '100.0']], align: ['l', 'r', 'r'] };
};
const para = (txt) => (String(txt || '').trim() ? String(txt).trim().split(/\n+/).map((x) => ({ t: 'p', text: x })) : [{ t: 'p', text: EMPTY, missing: true }]);

export function buildBlocks({ cs, patients, contacts, an, rp = {}, dname, opts = {} }) {
  const tpl = TEMPLATES[cs.disease]; const B = []; const org = rp.org || 'รพ.สต.บ้านหนองสนม';
  const sec = (k) => SECTIONS.find((s) => s[0] === k);
  const text = (k) => { B.push({ t: 'h2', text: sec(k)[1] }); B.push(...para(sectionText(rp, k))); };
  B.push({ t: 'title', text: 'รายงานการสอบสวนโรคฉบับสมบูรณ์', sub: `${cs.title}`, lines: [`โรค: ${dname}`, `หน่วยงาน: ${org}`, `วันที่รับแจ้ง: ${fmtDate(cs.reportDate)}`, `สถานะ: ${STATUS[cs.status] || cs.status || '-'}`, `วันที่ออกรายงาน: ${fmtDate(rp.reportDate)}`, `ผู้รายงาน: ${rp.reporter || cs.responsible || EMPTY}${rp.reporterPos ? ` (${rp.reporterPos})` : ''}`] });
  B.push({ t: 'h1', text: 'บทสรุปผู้บริหาร' });
  B.push({ t: 'p', text: `พบผู้ป่วย ${nf(an.n)} ราย${an.dead ? ` เสียชีวิต ${nf(an.dead)} ราย อัตราป่วยตาย ${an.cfr.toFixed(1)}%` : ''}${an.attack != null ? ` อัตราป่วย ${an.attack.toFixed(2)}% (ประชากรเสี่ยง ${nf(an.risk)} คน)` : ''}${an.first ? ` ระยะเวลาการระบาด ${an.days} วัน (${fmtDate(an.first)} – ${fmtDate(an.last)})` : ''} ผู้สัมผัสที่ติดตาม ${nf(contacts.length)} ราย` });

  text('background'); text('objectives');
  B.push({ t: 'h2', text: 'ข้อมูลเหตุการณ์' });
  B.push({ t: 'table', head: ['หัวข้อ', 'รายละเอียด'], rows: [['ชื่อเหตุการณ์', cs.title], ['โรค', dname], ['พื้นที่เกิดเหตุ', [cs.place, cs.villageNo ? `หมู่ที่ ${cs.villageNo} ${cs.villageName || ''}` : ''].filter(Boolean).join(' ') || '-'], ['วันที่รับแจ้ง', fmtDate(cs.reportDate)], ['ประชากรเสี่ยง', cs.popAtRisk ? `${nf(cs.popAtRisk)} คน` : '-'], ['ผู้รับผิดชอบการสอบสวน', cs.responsible || '-']], align: ['l', 'l'] });
  if (tpl) B.push({ t: 'p', text: `เกณฑ์ลงสอบสวนตามแนวทางกรมควบคุมโรค: ${tpl.criteria}${tpl.hours ? ` (ภายใน ${tpl.hours} ชั่วโมง)` : ''}` });

  text('methods');
  B.push({ t: 'h2', text: '3.1 นิยามผู้ป่วย' });
  if (rp.caseDef || cs.caseDef) B.push(...para(rp.caseDef || cs.caseDef));
  else if (tpl?.definition) B.push({ t: 'p', text: `(นิยามตัวอย่างของโรคจากแนวทางกรมควบคุมโรค — ควรปรับเป็นนิยามของเหตุการณ์นี้) ${tpl.definition}` });
  else B.push(...para(''));

  B.push({ t: 'h1', text: '4. ผลการสอบสวน' });
  text('confirm'); text('caseFinding');
  B.push({ t: 'h2', text: '4.3 ระบาดวิทยาเชิงพรรณนา' });
  B.push({ t: 'h3', text: 'ก) บุคคล (Person)' });
  B.push({ t: 'p', text: `ผู้ป่วยทั้งหมด ${nf(an.n)} ราย เสียชีวิต ${nf(an.dead)} ราย${an.cfr != null ? ` (อัตราป่วยตาย ${an.cfr.toFixed(1)}%)` : ''}` });
  if (an.n) { B.push({ t: 'cap', text: 'ตารางที่ 1 จำนวนและร้อยละของผู้ป่วยจำแนกตามเพศ' }); B.push(distTable(an.bySex, null, 'เพศ'));
    B.push({ t: 'cap', text: 'ตารางที่ 2 จำนวนและร้อยละของผู้ป่วยจำแนกตามกลุ่มอายุ' }); B.push(distTable(an.byAge, AGE_ORDER, 'กลุ่มอายุ (ปี)'));
    const cls = {}; patients.forEach((p) => { const k = p.classification || 'ยังไม่จำแนก'; cls[k] = (cls[k] || 0) + 1; });
    B.push({ t: 'cap', text: 'ตารางที่ 3 ผู้ป่วยจำแนกตามนิยาม' }); B.push(distTable(cls, null, 'การจำแนก'));
    const ages = patients.map((p) => Number(p.age)).filter((x) => isFinite(x) && x !== null && x >= 0 && String(x) !== '');
    if (ages.length) { const s = [...ages].sort((a, b) => a - b); const med = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; B.push({ t: 'p', text: `อายุเฉลี่ย ${(ages.reduce((x, y) => x + y, 0) / ages.length).toFixed(1)} ปี มัธยฐาน ${med} ปี (อายุต่ำสุด ${s[0]} สูงสุด ${s[s.length - 1]} ปี; มีข้อมูลอายุ ${ages.length} จาก ${an.n} ราย)` }); } }
  B.push({ t: 'h3', text: 'ข) เวลา (Time)' });
  if (an.curve.length) {
    const peak = an.curve.reduce((m, r) => (r.n > m.n ? r : m), an.curve[0]);
    B.push({ t: 'p', text: `ผู้ป่วยรายแรกเริ่มป่วยวันที่ ${fmtDate(an.first)} รายสุดท้ายวันที่ ${fmtDate(an.last)} รวม ${an.days} วัน วันที่มีผู้ป่วยเริ่มป่วยมากที่สุดคือ ${fmtDate(peak.d)} (${peak.n} ราย)` });
    const img = curvePng(an.curve); if (img) B.push({ t: 'img', ...img, caption: 'รูปที่ 1 Epidemic curve แสดงจำนวนผู้ป่วยตามวันเริ่มป่วย' });
  } else B.push({ t: 'p', text: 'ยังไม่มีข้อมูลวันเริ่มป่วย', missing: true });
  B.push({ t: 'h3', text: 'ค) สถานที่ (Place)' });
  if (an.n) { B.push({ t: 'cap', text: 'ตารางที่ 4 ผู้ป่วยจำแนกตามหมู่บ้าน' }); B.push(distTable(an.byVillage, null, 'หมู่บ้าน')); }
  if (opts.mapImg) B.push({ t: 'img', data: opts.mapImg.data, w: opts.mapImg.w, h: opts.mapImg.h, caption: 'รูปที่ 2 แผนที่จุดผู้ป่วย (Spot map)' });
  else B.push({ t: 'p', text: '(แนบภาพ Spot map จากหน้าแผนที่ได้ในหน้าบันทึกรายงาน)', missing: true });

  B.push({ t: 'h2', text: '4.4 ผลการตรวจทางห้องปฏิบัติการ' });
  if ((cs.labs || []).length) B.push({ t: 'table', head: ['วันที่', 'ผู้ถูกตรวจ', 'ตัวอย่าง', 'การตรวจ', 'ผล'], rows: [...cs.labs].sort((a, b) => String(a.date).localeCompare(String(b.date))).map((l) => [fmtDate(l.date), l.who || '-', l.specimen || '-', l.test || '-', l.result || '-']), align: ['l', 'l', 'l', 'l', 'l'] });
  else B.push({ t: 'p', text: 'ยังไม่มีผลตรวจทางห้องปฏิบัติการ', missing: true });

  B.push({ t: 'h2', text: '4.5 ลำดับเหตุการณ์ (Timeline)' });
  if ((cs.timeline || []).length) B.push({ t: 'table', head: ['วันที่', 'เหตุการณ์/สิ่งที่ดำเนินการ'], rows: [...cs.timeline].sort((a, b) => String(a.date).localeCompare(String(b.date))).map((x) => [fmtDate(x.date), x.text || '']), align: ['l', 'l'] });
  else B.push({ t: 'p', text: EMPTY, missing: true });

  text('envStudy'); text('hypothesis');
  B.push({ t: 'h2', text: '4.8 ผลการศึกษาเชิงวิเคราะห์' });
  const ex = (rp.exposures || []).map((e) => ({ e, r: twoByTwo(rp.design, e.a, e.b, e.c, e.d) })).filter((x) => x.r);
  if (ex.length) {
    const cc = rp.design !== 'cohort';
    B.push({ t: 'p', text: cc ? 'รูปแบบการศึกษา: Case-control study (ใช้ Odds ratio; 95% CI ด้วยวิธี Woolf)' : 'รูปแบบการศึกษา: Cohort study (ใช้ Relative risk; 95% CI ด้วยวิธี log)' });
    B.push({ t: 'cap', text: `ตารางที่ 5 ความสัมพันธ์ระหว่างปัจจัยสัมผัสกับการป่วย (${cc ? 'OR' : 'RR'}, 95% CI)` });
    B.push({ t: 'table', head: ['ปัจจัยสัมผัส', cc ? 'ป่วย: สัมผัส/ไม่สัมผัส' : 'สัมผัส: ป่วย/ไม่ป่วย', cc ? 'ไม่ป่วย: สัมผัส/ไม่สัมผัส' : 'ไม่สัมผัส: ป่วย/ไม่ป่วย', cc ? 'OR' : 'RR', '95% CI', 'p (chi-square)'],
      rows: ex.map(({ e, r }) => [e.name || '-', cc ? `${e.a}/${e.c}` : `${e.a}/${e.b}`, cc ? `${e.b}/${e.d}` : `${e.c}/${e.d}`, f2(r.est) + (r.zero ? '*' : ''), `${f2(r.lo)} – ${f2(r.hi)}`, fp(r.p)]), align: ['l', 'c', 'c', 'r', 'c', 'r'] });
    if (ex.some((x) => x.r.zero)) B.push({ t: 'p', text: '* มีช่องที่เป็นศูนย์ จึงบวก 0.5 ในทุกช่องก่อนคำนวณ' });
  } else B.push({ t: 'p', text: 'ไม่ได้ทำการศึกษาเชิงวิเคราะห์ หรือยังไม่ได้บันทึกข้อมูลตาราง 2×2', missing: true });
  const sig = ex.filter(({ r }) => r.p != null && r.p < 0.05 && r.lo > 1);
  if (sig.length) B.push({ t: 'p', text: `ปัจจัยที่สัมพันธ์กับการป่วยอย่างมีนัยสำคัญทางสถิติ (p < 0.05 และ 95% CI ไม่คร่อม 1) ได้แก่ ${sig.map(({ e, r }) => `${e.name || 'ปัจจัยที่ ' + (ex.indexOf(ex.find((x) => x.e === e)) + 1)} (${r.measure} = ${f2(r.est)}, 95% CI ${f2(r.lo)}–${f2(r.hi)})`).join('; ')}` });
  B.push(...para(sectionText(rp, 'analyticNote')).filter((x) => !x.missing));

  B.push({ t: 'h1', text: '5. มาตรการควบคุมและป้องกันโรค' });
  if ((cs.measures || []).length) B.push({ t: 'table', head: ['วันที่', 'มาตรการ', 'ผู้รับผิดชอบ', 'ผล/หมายเหตุ'], rows: [...cs.measures].sort((a, b) => String(a.date).localeCompare(String(b.date))).map((m) => [fmtDate(m.date), m.text || '', m.owner || '-', m.result || '-']), align: ['l', 'l', 'l', 'l'] });
  else B.push({ t: 'p', text: 'ยังไม่มีมาตรการควบคุมโรคที่บันทึกไว้', missing: true });
  B.push({ t: 'p', text: `ผู้สัมผัสที่ติดตาม ${nf(contacts.length)} ราย` });

  text('problems'); text('discussion'); text('recommendations');
  B.push({ t: 'h2', text: 'คณะผู้สอบสวน' }); B.push(...para(rp.team || [cs.responsible].filter(Boolean).join('\n')));
  text('references');

  if (patients.length) {
    B.push({ t: 'pb' }); B.push({ t: 'h1', text: 'ภาคผนวก ก. บัญชีรายชื่อผู้ป่วย (Line list)' });
    if (!opts.showNames) B.push({ t: 'p', text: 'หมายเหตุ: ไม่แสดงชื่อ-สกุลเพื่อคุ้มครองข้อมูลส่วนบุคคล' });
    B.push({ t: 'table', head: ['ลำดับ', ...(opts.showNames ? ['ชื่อ-สกุล'] : []), 'อายุ', 'เพศ', 'หมู่', 'เริ่มป่วย', 'รักษาที่', 'การจำแนก', 'สถานะ'],
      rows: patients.map((p, i) => [String(i + 1), ...(opts.showNames ? [fullName(p)] : []), p.age === '' || p.age == null ? '-' : String(p.age), SEX[p.sex] || '-', p.villageNo || '-', fmtDate(p.onsetDate), p.hospital || '-', (p.classification || '-').replace(/\s*\(.*\)/, ''), p.status || '-']),
      align: ['c', ...(opts.showNames ? ['l'] : []), 'c', 'c', 'c', 'c', 'l', 'l', 'l'], small: true });
  }
  return B;
}
