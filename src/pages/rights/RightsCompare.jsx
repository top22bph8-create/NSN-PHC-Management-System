// เปรียบเทียบสิทธิ์ที่อยู่ใน JHCIS (ทะเบียนที่ซิงก์ขึ้นระบบ) กับไฟล์จากแหล่งอื่น เช่น สปสช. — ยึดไฟล์เป็นหลักฐาน
// อ่านและเทียบในเบราว์เซอร์เท่านั้น: ไม่อัปโหลดไฟล์ ไม่เก็บเลขบัตรไว้ในระบบ · จับคู่ด้วยชื่อ-สกุล (+อายุถ้ามี)
// ถ้าต้องการแก้สิทธิ์ใน JHCIS จริงด้วยเลขบัตร ให้ใช้ import-rights.mjs ที่เครื่อง JHCIS
import { useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { Modal } from '../../components/ui';
import { todayStr } from '../../lib/thai';

const nf = (n) => Number(n || 0).toLocaleString('th-TH');
const GROUP = { 1: 'OFC', 2: 'SSS', 3: 'UC', 4: 'UC', 5: 'NRD', 7: 'LGO' };
const CLS_TH = { UC: 'UC/Wel (บัตรทอง)', OFC: 'ข้าราชการ (OFC)', SSS: 'ประกันสังคม (SSS)', LGO: 'ท้องถิ่น (LGO)', NRD: 'ต่างด้าว (NRD)', NONE: 'ไม่มีสิทธิ', OTH: 'อื่นๆ' };
// จัดกลุ่มสิทธิจากข้อความ/รหัสในไฟล์ (ยึดคำที่พบบ่อยของ สปสช.)
export const rightClass = (t) => {
  const s = String(t ?? '').trim(); if (!s) return 'NONE'; const u = s.toUpperCase();
  if (/^(UCS|WEL)$/.test(u)) return 'UC'; if (/^(OFC|OFL|VOF|POF)$/.test(u)) return 'OFC'; if (/^(SSS|VSS|PSS)$/.test(u)) return 'SSS'; if (/^(LGO|SLG|VLG)$/.test(u)) return 'LGO'; if (/^(NRD)$/.test(u)) return 'NRD';
  if (/ไม่มีสิทธิ|ไร้สิทธิ|NONE|^-$/.test(s) || u === 'NON') return 'NONE';
  if (/UCS|WEL|บัตรทอง|หลักประกันสุขภาพ|สปร|ท74|^UC\b/.test(u) || /หลักประกันสุขภาพ|บัตรทอง|สปร\./.test(s)) return 'UC';
  if (/OFC|ข้าราชการ|เบิกจ่ายตรง|กรมบัญชีกลาง/.test(u) || /ข้าราชการ|กรมบัญชีกลาง/.test(s)) return 'OFC';
  if (/SSS|ประกันสังคม/.test(u) || /ประกันสังคม/.test(s)) return 'SSS';
  if (/LGO|ท้องถิ่น|อปท/.test(u) || /ท้องถิ่น|อปท/.test(s)) return 'LGO';
  if (/NRD|ต่างด้าว/.test(u) || /ต่างด้าว/.test(s)) return 'NRD';
  return 'OTH';
};
// ชื่อหัวตารางไฟล์ สปสช. (primarydoctor108Report) เป็นภาษาไทย — ใช้แสดงในเมนู/ตัวอย่าง ให้ตรงกับคำที่ใช้ในทะเบียน JHCIS
const HDR_TH = { PID: 'เลขบัตรประชาชน', FNAME: 'ชื่อ', LNAME: 'นามสกุล', SEX: 'เพศ', BIRTHDATE: 'ปีเกิด (พ.ศ.)', NATION: 'สัญชาติ', MAININSCL: 'รหัสสิทธิหลัก', MAININSCLNAME: 'ชื่อสิทธิหลัก', SUBINSCL: 'รหัสสิทธิย่อย', SUBINSCLNAME: 'ชื่อสิทธิย่อย', HMAIN: 'รหัสหน่วยบริการรับส่งต่อ', HMAIN_NAME: 'หน่วยบริการรับส่งต่อ', HSUB: 'รหัสหน่วยบริการประจำ', HSUB_NAME: 'หน่วยบริการประจำ', HMAIN_OP: 'รหัสหน่วยบริการหลัก (OP)', HMAIN_OP_NAME: 'หน่วยบริการหลัก (OP)', PAID_MODEL: 'รูปแบบการจ่าย', PURCHASEPROVINCE: 'จังหวัดผู้ซื้อบริการ', HPROVINCEID: 'รหัสจังหวัดหน่วยบริการ', HPROVINCENAME: 'จังหวัดหน่วยบริการ', HDISTRICTID: 'รหัสอำเภอหน่วยบริการ', HDISTRICTNAME: 'อำเภอหน่วยบริการ', HSUBDISTRICTID: 'รหัสตำบลหน่วยบริการ', HSUBDISTRICTNAME: 'ตำบลหน่วยบริการ', ADDRESS: 'บ้านเลขที่', MOO: 'หมู่ที่', PROVINCEID: 'รหัสจังหวัดที่อยู่', PROVINCENAME: 'จังหวัดที่อยู่', DISTRICTID: 'รหัสอำเภอที่อยู่', DISTRICTNAME: 'อำเภอที่อยู่', SUBDISTRICTID: 'รหัสตำบลที่อยู่', SUBDISTRICTNAME: 'ตำบลที่อยู่', HSUB_OWNER: 'รหัสหน่วยบริการเจ้าของ' };
const hdrLabel = (t) => { const k = String(t ?? '').trim(); const th = HDR_TH[k.toUpperCase()]; return th ? `${th} (${k})` : k; };
const CODE_TH = { UCS: 'บัตรทอง UC (UCS)', WEL: 'สปร./Wel (WEL)', OFC: 'ข้าราชการ (OFC)', LGO: 'ท้องถิ่น (LGO)', SSS: 'ประกันสังคม (SSS)', NRD: 'ต่างด้าว (NRD)' };
const rightText = (raw, cls) => { const k = String(raw ?? '').trim(); return CODE_TH[k.toUpperCase()] || (k ? k : CLS_TH[cls]); };
const TITLES = /^(เด็กชาย|เด็กหญิง|นางสาว|ว่าที่ร้อยตรี|ว่าที่ร\.ต\.|นาย|นาง|น\.ส\.|ด\.ช\.|ด\.ญ\.|ดช|ดญ|MR\.?|MRS\.?|MISS)/i;
const nameKey = (s) => String(s ?? '').replace(/\s+/g, '').replace(/[.​]/g, '').replace(TITLES, '').replace(TITLES, '');
const hosKey = (s) => String(s ?? '').replace(/\s+/g, '').replace(/โรงพยาบาลส่งเสริมสุขภาพตำบล|รพ\.?สต\.?|ศสม\.?|โรงพยาบาล|รพ\.?/g, '').replace(/[()]/g, '');
const toAge = (v) => {
  if (v == null || v === '') return null; const now = new Date();
  if (v instanceof Date && !isNaN(v)) return Math.floor((now - v) / 31557600000);
  if (typeof v === 'number') { if (v > 20000) { const d = new Date(Math.round((v - 25569) * 86400000)); return Math.floor((now - d) / 31557600000); } return v >= 0 && v < 130 ? Math.floor(v) : null; }
  const s = String(v).trim(); let m = s.match(/^(\d{4})[xX*-]{2,4}$/); // ไฟล์ สปสช. ให้เฉพาะปี พ.ศ. เช่น 2562xxxx
  if (m) { const y = Number(m[1]); return now.getFullYear() - (y > 2400 ? y - 543 : y); }
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) { let y = Number(m[3]); if (y > 2400) y -= 543; return Math.floor((now - new Date(y, Number(m[2]) - 1, Number(m[1]))) / 31557600000); }
  m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/); if (m) { let y = Number(m[1]); if (y > 2400) y -= 543; return Math.floor((now - new Date(y, Number(m[2]) - 1, Number(m[3]))) / 31557600000); }
  m = s.match(/^(\d{1,3})\s*ปี?/); return m ? Number(m[1]) : null;
};
const KW = {
  name: ['ชื่อ-สกุล', 'ชื่อสกุล', 'ชื่อ-นามสกุล', 'ชื่อนามสกุล', 'fullname'],
  fname: ['ชื่อตัว', 'ชื่อ'], lname: ['นามสกุล', 'สกุล'],
  age: ['อายุ'], birth: ['วันเกิด', 'วดปเกิด', 'birth'],
  right: ['ชื่อสิทธิ', 'สิทธิหลัก', 'สิทธิปรับปรุง', 'สิทธิล่าสุด', 'สิทธิการรักษา', 'สิทธิ'],
  hos: ['หน่วยบริการประจำ', 'หน่วยบริการปฐมภูมิ', 'หน่วยบริการ', 'สถานพยาบาล', 'รพ.สต', 'hmain'],
  dead: ['เสียชีวิต', 'ตาย', 'dead'],
};
const detect = (hdr) => {
  const h = hdr.map((x) => String(x ?? '').replace(/\s+/g, '').toLowerCase());
  const find = (keys, ex = []) => { for (const k of keys) { const i = h.findIndex((x) => x && x.includes(k.toLowerCase()) && !ex.some((e) => x.includes(e))); if (i >= 0) return i; } return -1; };
  const eq = (...ks) => h.findIndex((x) => ks.includes(x));
  const name = find(KW.name);
  const fname = name >= 0 ? -1 : (() => { const i = h.findIndex((x) => x === 'ชื่อ' || x.includes('ชื่อตัว')); return i >= 0 ? i : eq('fname'); })();
  const lname = name >= 0 ? -1 : (() => { const i = find(KW.lname); return i >= 0 ? i : eq('lname'); })();
  // ไฟล์ สปสช. (primarydoctor108Report): MAININSCL = รหัสสิทธิหลัก (UCS/WEL/OFC...), HSUB_NAME = หน่วยบริการประจำ (รพ.สต.), MOO + ADDRESS = หมู่/บ้านเลขที่
  const right = eq('maininscl') >= 0 ? eq('maininscl') : find(KW.right, ['รหัส', 'เดิม', 'วันที่', 'ประเภท']);
  const hos = eq('hsub_name') >= 0 ? eq('hsub_name') : find(KW.hos, ['รหัส', 'จังหวัด', 'อำเภอ']);
  const birth = find(KW.birth) >= 0 ? find(KW.birth) : eq('birthdate');
  return { name, fname, lname, age: find(KW.age), birth, right, hos, dead: find(KW.dead, ['วันที่']), moo: eq('moo', 'หมู่', 'หมู่ที่'), house: eq('address', 'บ้านเลขที่') };
};

export default function RightsCompare({ jhRows, onClose }) {
  const [file, setFile] = useState(null); const [raw, setRaw] = useState(null); const [hr, setHr] = useState(0); const [map, setMap] = useState({}); const [err, setErr] = useState('');
  const [tab, setTab] = useState('all'); const [q, setQ] = useState(''); const inp = useRef(null);

  const load = async (f) => {
    setErr(''); setRaw(null); setFile(null);
    try {
      const XLSX = await import('xlsx'); const buf = await f.arrayBuffer(); const wb = XLSX.read(buf, { cellDates: true });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
      if (rows.length < 2) throw new Error('ไฟล์ไม่มีข้อมูล');
      let hi = rows.slice(0, 15).findIndex((r) => r.filter((c) => c != null && String(c).trim()).length >= 3 && r.some((c) => /ชื่อ|เลข|สิทธิ|name|cid/i.test(String(c ?? ''))));
      if (hi < 0) hi = 0;
      setRaw(rows); setHr(hi); setMap(detect(rows[hi])); setFile(f.name); setTab('all'); setQ('');
    } catch (e) { setErr(`อ่านไฟล์ไม่ได้: ${e.message || e}`); }
  };
  const hdr = raw ? raw[hr].map((x, i) => ({ i, t: hdrLabel(x) || `(คอลัมน์ ${i + 1})` })) : [];
  const setCol = (k, v) => setMap({ ...map, [k]: v === '' ? -1 : Number(v) });

  const res = useMemo(() => {
    if (!raw || (map.name < 0 && map.fname < 0)) return null;
    const jh = jhRows.map((r) => { const am = /^(.*?)\s*ม\.(\d+)\s*$/.exec(String(r[3] || '')); return ({ pid: r[0], name: r[1], age: r[2], addr: r[3], moo: am ? am[2] : '', house: am ? am[1].trim() : '', right: r[5] || 'ไม่มีสิทธิ', hos: r[6] || '', cls: GROUP[r[7]] || (r[5] && r[5] !== 'ไม่มีสิทธิ' ? 'OTH' : 'NONE') }); });
    const by = new Map(); jh.forEach((p) => { const k = nameKey(p.name); if (k) { if (!by.has(k)) by.set(k, []); by.get(k).push(p); } });
    const used = new Set(); const out = [];
    const cell = (r, c) => (c >= 0 ? r[c] : null);
    for (const r of raw.slice(hr + 1)) {
      const nm = map.name >= 0 ? String(cell(r, map.name) ?? '').trim() : `${cell(r, map.fname) ?? ''}${cell(r, map.lname) ?? ''}`.trim();
      if (!nm) continue;
      const fAge = map.birth >= 0 ? toAge(cell(r, map.birth)) : map.age >= 0 ? toAge(cell(r, map.age)) : null;
      const fRight = map.right >= 0 ? String(cell(r, map.right) ?? '').trim() : ''; const fHos = map.hos >= 0 ? String(cell(r, map.hos) ?? '').trim() : '';
      const dead = map.dead >= 0 && /^(1|y|yes|ใช่|ตาย|เสียชีวิต|true|\/|✓)/i.test(String(cell(r, map.dead) ?? '').trim());
      const fMoo = map.moo >= 0 ? String(cell(r, map.moo) ?? '').replace(/\D/g, '').replace(/^0+/, '') : ''; const fHouse = map.house >= 0 ? String(cell(r, map.house) ?? '').trim() : '';
      const f = { name: nm, age: fAge, right: fRight, hos: fHos, cls: rightClass(fRight), dead, moo: fMoo, house: fHouse };
      let c = by.get(nameKey(nm)) || [];
      if (c.length > 1 && fMoo && fHouse) { const c2 = c.filter((p) => p.moo === fMoo && p.house === fHouse); if (c2.length) c = c2; }
      if (c.length > 1 && fAge != null) { const c2 = c.filter((p) => Math.abs(Number(p.age) - fAge) <= 1); if (c2.length) c = c2; }
      if (!c.length) { out.push({ kind: 'nojh', f, jh: null, fix: 'ไม่พบชื่อนี้ในทะเบียนที่ซิงก์จาก JHCIS — อาจยังไม่ลงทะเบียนบุคคล สะกดชื่อต่างกัน หรือเป็นประเภทอาศัย 2/4 ที่ไม่ใช่ UC/Wel' }); continue; }
      if (c.length > 1) { out.push({ kind: 'amb', f, jh: c[0], fix: `ชื่อซ้ำ ${c.length} คนใน JHCIS ระบุไม่ได้ — ตรวจด้วยเลขบัตร` }); continue; }
      const p = c[0]; used.add(p.pid);
      const rightDiff = map.right >= 0 && f.cls !== p.cls; const hosDiff = map.hos >= 0 && fHos && hosKey(fHos) !== hosKey(p.hos);
      let kind = rightDiff && hosDiff ? 'both' : rightDiff ? 'right' : hosDiff ? 'hos' : 'ok'; if (dead) kind = 'dead';
      const fix = [];
      if (dead) fix.push('ไฟล์ระบุเสียชีวิต — บันทึกการตายใน JHCIS');
      if (rightDiff) fix.push(`เปลี่ยนสิทธิ์เป็น ${fRight || CLS_TH[f.cls]}`);
      if (hosDiff) fix.push(`เปลี่ยนหน่วยบริการประจำเป็น ${fHos}`);
      out.push({ kind, f, jh: p, fix: fix.join(' · ') });
    }
    // ไฟล์ สปสช. คือรายชื่อผู้ขึ้นทะเบียนที่หน่วยเรา → ใน JHCIS ที่ระบุว่า UC/Wel และประจำหน่วยเรา แต่ไม่อยู่ในไฟล์ = JHCIS ไม่ตรงกับ สปสช.
    const hc = {}; out.forEach((x) => { const k = hosKey(x.f?.hos); if (k) hc[k] = (hc[k] || 0) + 1; }); const ours = Object.entries(hc).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (ours) jh.forEach((p) => { if (!used.has(p.pid) && p.cls === 'UC' && hosKey(p.hos) === ours) out.push({ kind: 'nofile', f: null, jh: p, fix: 'JHCIS ระบุ UC/Wel ประจำหน่วยเรา แต่ สปสช. ไม่มีชื่อ — ตรวจสอบ/แก้สิทธิ์ใน JHCIS' }); });
    return out;
  }, [raw, hr, map, jhRows]);

  const KINDS = [['all', 'ทั้งหมด', ''], ['ok', 'ตรงกัน', 'text-emerald-700'], ['right', 'สิทธิ์ต่างกัน', 'text-rose-700'], ['hos', 'หน่วยบริการประจำต่างกัน', 'text-amber-700'], ['both', 'สิทธิ์และหน่วยต่างกัน', 'text-rose-700'], ['dead', 'ไฟล์ระบุเสียชีวิต', 'text-slate-700'], ['nojh', 'ในไฟล์ ไม่พบในทะเบียน JHCIS', 'text-violet-700'], ['nofile', 'JHCIS ว่า UC ประจำเรา แต่ไม่อยู่ในไฟล์', 'text-sky-700'], ['amb', 'ชื่อซ้ำ ระบุไม่ได้', 'text-orange-700']];
  const cnt = useMemo(() => { const c = { all: res?.length || 0 }; (res || []).forEach((x) => { c[x.kind] = (c[x.kind] || 0) + 1; }); return c; }, [res]);
  const shown = useMemo(() => (res || []).filter((x) => (tab === 'all' || x.kind === tab) && (!q.trim() || `${x.f?.name || ''} ${x.jh?.name || ''}`.includes(q.trim()))), [res, tab, q]);
  const label = Object.fromEntries(KINDS.map(([k, t]) => [k, t]));

  const exportX = async () => {
    const XLSX = await import('xlsx'); const wb = XLSX.utils.book_new();
    const row = (x) => ({ 'ชื่อ-สกุล': x.f?.name || x.jh?.name || '', 'อายุ (JHCIS)': x.jh?.age ?? '', 'อายุโดยประมาณ (สปสช.)': x.f?.age ?? '', 'หมู่ที่': x.jh?.moo || x.f?.moo || '', 'บ้านเลขที่': x.jh?.house || x.f?.house || '', 'PID (JHCIS)': x.jh?.pid ?? '', 'กลุ่มสิทธิ (JHCIS)': x.jh ? CLS_TH[x.jh.cls] : '', 'สิทธิ (JHCIS)': x.jh?.right || '', 'หน่วยบริการประจำ (JHCIS)': x.jh?.hos || '', 'กลุ่มสิทธิ (สปสช.)': x.f ? CLS_TH[x.f.cls] : '', 'สิทธิ (สปสช.)': x.f ? rightText(x.f.right, x.f.cls) : '', 'หน่วยบริการประจำ (สปสช.)': x.f?.hos || '', ผลเปรียบเทียบ: label[x.kind], 'สิ่งที่ต้องปรับใน JHCIS (ยึด สปสช.)': x.fix });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(KINDS.filter(([k]) => k !== 'all').map(([k, t]) => ({ รายการ: t, จำนวน: cnt[k] || 0 })).concat([{ รายการ: 'รวม', จำนวน: cnt.all }, { รายการ: `ไฟล์: ${file}`, จำนวน: '' }])), 'สรุป');
    KINDS.filter(([k]) => k !== 'all' && k !== 'ok' && cnt[k]).forEach(([k, t]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((res || []).filter((x) => x.kind === k).map(row)), t.slice(0, 31)));
    XLSX.writeFile(wb, `เปรียบเทียบสิทธิ-${todayStr()}.xlsx`);
  };

  const Sel = ({ k, label: l, req }) => (
    <label className="block text-xs font-semibold text-slate-600">{l}{req && <span className="text-rose-600"> *</span>}
      <select className="input mt-0.5 !py-1 text-sm" value={map[k] ?? -1} onChange={(e) => setCol(k, e.target.value)}><option value="">— ไม่ใช้ —</option>{hdr.map((h) => <option key={h.i} value={h.i}>{h.t}</option>)}</select>
    </label>);

  return (
    <Modal title="เปรียบเทียบสิทธิ์: JHCIS กับไฟล์จากแหล่งอื่น (ยึดไฟล์เป็นหลัก)" onClose={onClose} wide footer={<button className="btn btn-outline" onClick={onClose}>ปิด</button>}>
      <div className="space-y-3 text-sm">
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-slate-600">
          📎 เลือกไฟล์ Excel/CSV จาก สปสช. หรือแหล่งอื่น · ระบบ<b>อ่านและเทียบในเบราว์เซอร์เท่านั้น ไม่อัปโหลดไฟล์ ไม่เก็บเลขบัตร</b> · จับคู่ด้วย <b>ชื่อ-สกุล</b> (และอายุถ้าไฟล์มีวันเกิด/อายุ) เพราะทะเบียนบนเว็บไม่มีเลขบัตร — ผลเป็นแนวทางตรวจสอบ ส่วนการแก้สิทธิ์ใน JHCIS จริงให้ใช้ตัวนำเข้า (import-rights) ที่เครื่อง JHCIS ซึ่งจับคู่ด้วยเลขบัตร
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={inp} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
          <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 px-4 py-2 font-bold text-white shadow hover:shadow-md" onClick={() => inp.current?.click()}><Upload className="h-4 w-4" /> เลือกไฟล์สิทธิ์</button>
          {file && <span className="text-slate-600">📄 {file} · {nf(raw.length - hr - 1)} แถว</span>}
          {res && <button type="button" className="ml-auto inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 px-4 py-2 font-bold text-white shadow hover:shadow-md" onClick={exportX}><FileSpreadsheet className="h-4 w-4" /> ส่งออก Excel</button>}
        </div>
        {err && <div className="rounded-lg bg-red-50 p-2 text-red-700" role="alert">{err}</div>}
        {raw && (
          <details className="rounded-xl border p-3" open={map.name < 0 && map.fname < 0}>
            <summary className="cursor-pointer font-bold text-slate-700">⚙️ จับคู่คอลัมน์ในไฟล์ (ตรวจอัตโนมัติ — แก้ได้)</summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <Sel k="name" label="ชื่อ-สกุล (คอลัมน์เดียว)" /><Sel k="fname" label="ชื่อ (ถ้าแยกคอลัมน์)" /><Sel k="lname" label="นามสกุล (ถ้าแยกคอลัมน์)" />
              <Sel k="birth" label="วันเกิด" /><Sel k="age" label="อายุ" /><Sel k="right" label="สิทธิการรักษา" req /><Sel k="hos" label="หน่วยบริการประจำ" /><Sel k="dead" label="เสียชีวิต (ถ้ามี)" /><Sel k="moo" label="หมู่ที่ (ใช้แยกคนชื่อซ้ำ)" /><Sel k="house" label="บ้านเลขที่ (ใช้แยกคนชื่อซ้ำ)" />
              <label className="block text-xs font-semibold text-slate-600">แถวหัวตาราง<select className="input mt-0.5 !py-1 text-sm" value={hr} onChange={(e) => { const n = Number(e.target.value); setHr(n); setMap(detect(raw[n])); }}>{raw.slice(0, 15).map((_, i) => <option key={i} value={i}>แถวที่ {i + 1}</option>)}</select></label>
            </div>
            {map.right < 0 && map.hos < 0 && <p className="mt-2 text-xs text-amber-700">⚠ ยังไม่ได้เลือกคอลัมน์สิทธิหรือหน่วยบริการ — เลือกอย่างน้อยหนึ่งอย่างเพื่อเปรียบเทียบ</p>}
            <div className="mt-2 overflow-x-auto"><table className="w-full whitespace-nowrap text-xs"><tbody>{raw.slice(hr, hr + 4).map((r, i) => <tr key={i} className={i ? 'border-t' : 'bg-slate-50 font-bold'}>{r.slice(0, 10).map((c, j) => <td key={j} className="px-2 py-0.5">{i === 0 ? hdrLabel(c) : c instanceof Date ? c.toLocaleDateString('th-TH') : String(c ?? '').replace(/\d{13}/g, (x) => `${x.slice(0, 1)}-xxxx-xxxxx-${x.slice(10, 12)}-${x.slice(12)}`)}</td>)}</tr>)}</tbody></table></div>
          </details>
        )}
        {res && (
          <>
            <div className="flex flex-wrap gap-1.5">{KINDS.filter(([k]) => k === 'all' || cnt[k]).map(([k, t, c]) => <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-full px-3 py-1 text-xs font-bold ${tab === k ? 'bg-slate-800 text-white' : `bg-slate-100 ${c}`}`}>{t} ({nf(cnt[k])})</button>)}</div>
            <input aria-label="ค้นหาชื่อ" className="input" placeholder="พิมพ์ชื่อเพื่อค้นหา" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
            <div className="max-h-[50vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50"><tr>{['ชื่อ-สกุล', 'JHCIS: กลุ่มสิทธิ / สิทธิ · หน่วยบริการประจำ', 'สปสช.: กลุ่มสิทธิ / สิทธิ · หน่วยบริการประจำ', 'ผลเปรียบเทียบ', 'ต้องปรับใน JHCIS (ยึด สปสช.)'].map((h) => <th key={h} className="whitespace-nowrap px-2 py-1 text-left">{h}</th>)}</tr></thead>
                <tbody>{shown.slice(0, 400).map((x, i) => (
                  <tr key={i} className="border-b align-top"><td className="px-2 py-1 font-medium">{x.f?.name || x.jh?.name}<div className="text-xs text-slate-400">{x.jh ? `PID ${x.jh.pid} · ${x.jh.addr || ''}` : ''}</div></td>
                    <td className="px-2 py-1 text-xs">{x.jh ? <>{CLS_TH[x.jh.cls]}<div className="text-slate-500">{x.jh.right} · {x.jh.hos}</div></> : '—'}</td>
                    <td className="px-2 py-1 text-xs">{x.f ? <>{CLS_TH[x.f.cls]}<div className="text-slate-500">{rightText(x.f.right, x.f.cls)} · {x.f.hos || 'ไม่ระบุหน่วย'}</div></> : '—'}</td>
                    <td className="px-2 py-1 text-xs font-bold">{x.kind === 'ok' ? '✅' : x.kind === 'nojh' || x.kind === 'nofile' || x.kind === 'amb' ? '❓' : '⚠️'} {label[x.kind]}</td>
                    <td className="px-2 py-1 text-xs text-slate-600">{x.fix}</td></tr>))}
                  {!shown.length && <tr><td colSpan={5} className="p-4 text-center text-slate-500">ไม่มีรายการ</td></tr>}</tbody>
              </table>
              {shown.length > 400 && <p className="p-2 text-xs text-slate-500">แสดง 400 รายการแรก — ใช้ช่องค้นหาหรือส่งออก Excel เพื่อดูทั้งหมด</p>}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
