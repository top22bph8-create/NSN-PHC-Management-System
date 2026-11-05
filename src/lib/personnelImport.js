// นำเข้าข้อมูลทำเนียบบุคลากรจาก Excel (หัวตาราง 2 แถว) — จับคู่กับบัญชีเดิมด้วยเลขบัตรประชาชน หรือชื่อ-สกุล
// ไม่สร้างบุคลากรใหม่ (ต้องมีบัญชีผู้ใช้อยู่แล้ว) และไม่เดาวันที่ที่ผิดปกติ — แจ้งเตือนให้ตรวจแทน
import { normalizeName } from './people';

const TYPO = [['สาธารณสุช', 'สาธารณสุข'], ['แพทแผนไทย', 'แพทย์แผนไทย']];
export const PERSONNEL_TYPES_LIST = ['ข้าราชการ', 'พนักงานราชการ', 'พนักงานกระทรวงสาธารณสุข', 'ลูกจ้างประจำ', 'ลูกจ้างชั่วคราว', 'จ้างเหมาบริการ'];
const squash = (s) => String(s ?? '').replace(/\s+/g, '');
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// ปีในไฟล์เป็น พ.ศ. (เช่น 2565) → ค.ศ.; ปี 1990–2100 ถือเป็น ค.ศ. อยู่แล้ว; นอกเหนือจากนั้นถือว่าผิดปกติ
export function toIso(v) {
  if (v == null || v === '') return { iso: '' };
  let y, m, d;
  if (v instanceof Date) { y = v.getUTCFullYear(); m = v.getUTCMonth() + 1; d = v.getUTCDate(); }
  else {
    const t = String(v).trim();
    const a = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); const b = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (a) { y = +a[1]; m = +a[2]; d = +a[3]; } else if (b) { d = +b[1]; m = +b[2]; y = +b[3]; } else return { iso: '', text: t };
  }
  if (y >= 2400) y -= 543;
  else if (y < 1990 || y > 2100) return { iso: '', bad: `${d}/${m}/${y}` };
  return { iso: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
}

const colKey = (h) => {
  if (!h || h.includes('ระยะเวลา')) return null;
  if (h.includes('ชื่อ') && h.includes('สกุล')) return 'name';
  if (h.includes('ตำแหน่ง')) return 'position';
  if (h.includes('ถ่ายโอน')) return 'transferDate';
  if (h.includes('วันที่บรรจุ')) return 'civil';
  if (h.includes('มาปฏิบัติงาน')) return 'startWorkDate';
  if (h.includes('โทรศัพท์')) return 'phone';
  if (h.includes('ปริญญาตรี')) return 'education';
  if (h.includes('ปริญญาโท')) return 'masterDegree';
  if (h.includes('อบรม')) return 'training';
  if (h.includes('บัตรประจำตัว') || h.includes('บัตรประชาชน')) return 'idCard';
  if (h.includes('เลขที่ใบอนุญาต')) return 'licenseNo';
  return null;
};
const licenseNameOf = (position, no) => {
  const s = `${position} ${no}`;
  if (s.includes('พยาบาล')) return 'ใบอนุญาตประกอบวิชาชีพการพยาบาลและการผดุงครรภ์';
  if (s.includes('แผนไทย') || /พท\./.test(s)) return 'ใบอนุญาตประกอบโรคศิลปะสาขาการแพทย์แผนไทย';
  if (s.includes('สาธารณสุข') || s.includes('สธช')) return 'ใบอนุญาตประกอบวิชาชีพสาธารณสุขชุมชน (สภาการสาธารณสุขชุมชน)';
  return '';
};

// rows = อาร์เรย์ของแถว (ค่าเซลล์ดิบ) เริ่มจากแถวหัวตารางแถวที่ 1
export function parsePersonnelSheet(rows) {
  const width = Math.max(...rows.slice(0, 2).map((r) => r.length));
  const map = {};
  for (let c = 0; c < width; c++) {
    const h = clean(`${rows[0]?.[c] ?? ''} ${rows[1]?.[c] ?? ''}`);
    const k = colKey(h); if (k && !(k in map)) map[k] = c;
  }
  if (!('name' in map)) throw new Error('ไม่พบคอลัมน์ "ชื่อ-สกุล"');
  const out = [];
  rows.slice(2).forEach((r, i) => {
    const g = (k) => (k in map ? r[map[k]] : undefined);
    const rawName = clean(g('name'));
    if (!rawName || rawName === '-') return;
    const warns = []; const p = { _row: i + 3, _name: rawName };
    const txt = (k) => { let t = clean(g(k)); for (const [a, b] of TYPO) if (t.includes(a)) { t = t.split(a).join(b); warns.push(`แก้คำผิด "${a}" → "${b}"`); } return t; };
    p.position = txt('position'); p.education = txt('education'); p.masterDegree = txt('masterDegree'); p.training = txt('training');
    p.phone = clean(g('phone')); p.licenseNo = clean(g('licenseNo'));
    p.idCard = String(g('idCard') ?? '').replace(/\D/g, '');
    if (p.idCard && p.idCard.length !== 13) { warns.push(`เลขบัตร ${p.idCard} ไม่ครบ 13 หลัก — ข้าม`); p.idCard = ''; }
    for (const k of ['transferDate', 'startWorkDate']) {
      const d = toIso(g(k)); p[k] = d.iso;
      if (d.bad) warns.push(`${k === 'startWorkDate' ? 'วันมาปฏิบัติงาน' : 'วันถ่ายโอน'} "${d.bad}" ผิดปกติ — ไม่นำเข้า ให้ตรวจแล้วกรอกเอง`);
    }
    const c = g('civil'); const cd = toIso(c);
    if (cd.iso) { p.civilServiceDate = cd.iso; p.personnelType = 'ข้าราชการ'; }
    else {
      p.civilServiceDate = '';
      const t = clean(c); if (PERSONNEL_TYPES_LIST.includes(t)) p.personnelType = t;
      else if (cd.bad) warns.push(`วันบรรจุ "${cd.bad}" ผิดปกติ — ไม่นำเข้า`);
    }
    p.licenseName = licenseNameOf(p.position, p.licenseNo);
    p._warns = warns; p._nameKey = squash(normalizeName(rawName));
    out.push(p);
  });
  return out;
}

const FIELDS = ['position', 'personnelType', 'idCard', 'phone', 'education', 'masterDegree', 'training', 'transferDate', 'civilServiceDate', 'startWorkDate', 'licenseName', 'licenseNo'];
export const FIELD_LABEL = { position: 'ตำแหน่ง', personnelType: 'ประเภทบุคลากร', idCard: 'เลขบัตร', phone: 'โทรศัพท์', education: 'ปริญญาตรี', masterDegree: 'ปริญญาโท', training: 'ผ่านการอบรม', transferDate: 'วันถ่ายโอน อบจ.', civilServiceDate: 'วันบรรจุ', startWorkDate: 'วันมาปฏิบัติงาน', licenseName: 'ชื่อใบอนุญาต', licenseNo: 'เลขที่ใบอนุญาต' };

// จับคู่กับ users (เลขบัตรก่อน แล้วค่อยชื่อ) และสรุปสิ่งที่จะเติม/ขัดแย้ง
export function planPersonnel(people, users, overwrite = false) {
  return people.map((p) => {
    const byId = p.idCard ? users.filter((u) => String(u.idCard || '') === p.idCard) : [];
    const byName = users.filter((u) => squash(normalizeName(u.name)) === p._nameKey);
    const hits = byId.length ? byId : byName;
    const res = { p, user: hits.length === 1 ? hits[0] : null, ambiguous: hits.length > 1, matchBy: byId.length ? 'เลขบัตร' : 'ชื่อ', patch: {}, conflicts: [] };
    if (res.user) {
      for (const k of FIELDS) {
        const nv = p[k]; if (!nv) continue;
        const ov = res.user[k];
        if (!ov) res.patch[k] = nv;
        else if (String(ov) !== String(nv)) { if (overwrite) res.patch[k] = nv; res.conflicts.push({ k, ov, nv }); }
      }
    }
    return res;
  });
}
