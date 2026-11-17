import SyncNowButton from '../components/SyncNowButton';
// ทะเบียนสิทธิ UC/Wel ตรง-ไม่ตรง — แดชบอร์ด + รายชื่อ
// ข้อมูลมาจากสคริปต์ที่เครื่อง JHCIS (node sync.mjs --rights) เก็บใน Firestore rightsRegistry (ชื่อ/อายุ/ที่อยู่/สถานพยาบาล ไม่มีเลขบัตร อ่านได้เฉพาะผู้ล็อกอิน)
import { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { FileSpreadsheet, Printer, Search } from 'lucide-react';
import { db } from '../firebase';
import { exportXlsx } from '../lib/exportFile';
import { fmtDateTime } from '../lib/thai';
import { PageHeader } from '../components/Logo';
import { Modal, Spinner } from '../components/ui';
import { VILLAGES, VILLAGES_ASOF } from '../config/villages';

const nf = (n) => Number(n || 0).toLocaleString('th-TH');
const TL = { 1: '1 อยู่จริงและมีชื่อในทะเบียนบ้าน', 2: '2 อยู่จริงแต่ไม่มีชื่อในทะเบียนบ้าน', 3: '3 มีชื่อในทะเบียนบ้านแต่ไม่ได้อยู่', 4: '4 ไม่มีชื่อในทะเบียนบ้านและไม่ได้อยู่' };
const CATS = {
  A: { title: 'ตรง: อยู่ในเขต (ประเภท 1–4) และขึ้นทะเบียนที่ รพ.สต.เรา', tone: 'from-emerald-600 to-emerald-400', hint: 'ประชากรในเขตที่ใช้สิทธิ UC/Wel ตรงกับหน่วยบริการประจำ' },
  C: { title: 'ไม่ตรง: อยู่ในเขต (ประเภท 1–4) แต่ขึ้นทะเบียนที่อื่น', tone: 'from-rose-600 to-rose-400', hint: 'ควรตรวจสอบ/ชี้แจงเพื่อย้ายสิทธิมาที่หน่วยบริการประจำ' },
  B: { title: 'ประชากรที่อื่น ขึ้นทะเบียนที่ รพ.สต.เรา', tone: 'from-sky-600 to-sky-400', hint: 'อยู่นอกเขตรับผิดชอบแต่เลือก รพ.สต.บ้านหนองสนมเป็นหน่วยบริการประจำ' },
};
const REG = [['RUC', 'ประชากรสิทธิ UC (UCS+WEL)'], ['ROFC', 'ประชากรสิทธิ ข้าราชการ (OFC)'], ['RSSS', 'ประชากรสิทธิ ประกันสังคม (SSS)'], ['RLGO', 'ประชากรสิทธิพนักงานท้องถิ่น (LGO)'], ['RNON', 'ประชากรไร้สิทธิ'], ['RNRD', 'ประชากรแรงงานต่างด้าว (NRD)'], ['ROTH', 'ประชากรสิทธิอื่นๆ']];
REG.forEach(([k, t]) => { CATS[k] = { title: t }; });
const COLS = ['เลข PID', 'ชื่อ-สกุล', 'อายุ', 'ที่อยู่', 'ประเภทอาศัย', 'สิทธิ', 'หน่วยบริการประจำ'];


// พิมพ์ "แบบสำรวจ อสม." (บันทึกเป็น PDF ได้จากหน้าต่างพิมพ์) — รายชื่อกลุ่มไม่ตรง แยกรายหมู่บ้าน หมู่ละหลายหน้า
const escH = (x) => String(x ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const houseOf = (addr) => String(addr || '').replace(/\s*ม\.\d+\s*$/, '').trim() || '-';
// ชื่อ-สกุลอยู่บรรทัดเดียวเสมอ: ชื่อยาวมากค่อยลดขนาดตัวอักษรลงตามความยาว
const nmSize = (n) => { const L = String(n || '').length; return L <= 24 ? 16.5 : L <= 28 ? 15 : L <= 34 ? 13.5 : 12; };
const bx = (t) => `<span class="bx">☐</span> ${t}`;
const SURVEY_KINDS = {
  rights: {
    note: (asOf) => `<b>คำชี้แจง:</b> กรุณาเยี่ยมบ้าน/สอบถามบุคคลตามรายชื่อ ว่า <b>อาศัยอยู่ในพื้นที่จริงหรือไม่ และอยู่ต่อเนื่องเกิน 6 เดือนหรือไม่</b> หากอยู่เกิน 6 เดือนและต้องการใช้บริการที่ รพ.สต.บ้านหนองสนม ให้แจ้งบุคคลนั้นนำบัตรประชาชนมาติดต่อ รพ.สต.บ้านหนองสนม เพื่อแจ้งย้ายสิทธิ์ <span class="asof">(ข้อมูล ณ ${escH(asOf)})</span>`,
    cols: [4, 5, 22, 4, 6, 14, 11, 9, 11, 8, 6],
    head: '<tr><th rowspan="2">ที่</th><th rowspan="2">PID</th><th rowspan="2">ชื่อ - สกุล</th><th rowspan="2">อายุ</th><th rowspan="2">บ้าน<br>เลขที่</th><th rowspan="2">หน่วยบริการประจำ<br>(ปัจจุบัน)</th><th colspan="3">ผลการสำรวจ (ติ๊ก ✓)</th><th rowspan="2">เบอร์โทร</th><th rowspan="2">หมายเหตุ</th></tr><tr><th>การอยู่อาศัย</th><th>ระยะเวลา</th><th>การย้ายสิทธิ์</th></tr>',
    row: (r, n) => `<tr><td class="c">${n}</td><td class="c">${escH(r[0])}</td><td class="nm" style="font-size:${nmSize(r[1])}px">${escH(r[1])}</td><td class="c">${escH(r[2])}</td><td class="c">${escH(houseOf(r[3]))}</td><td class="sm"><div class="clamp">${escH(r[6])}</div></td><td class="chk">${bx('อยู่จริง')}<br>${bx('ไม่ได้อยู่')}</td><td class="chk">${bx('≥ 6 เดือน')}<br>${bx('&lt; 6 เดือน')}</td><td class="chk">${bx('ต้องการย้าย')}<br>${bx('ไม่ต้องการ')}</td><td></td><td></td></tr>`,
  },
  dead: {
    note: (asOf) => `<b>คำชี้แจง:</b> กรุณาสอบถามญาติ/เพื่อนบ้านของบุคคลตามรายชื่อ ว่า <b>เสียชีวิตจริงหรือไม่ วันที่เสียชีวิต และสาเหตุการตาย</b> (ถ้ามีใบมรณบัตรให้ติ๊กและแจ้งเจ้าหน้าที่ เพื่อบันทึกการตายในโปรแกรม JHCIS) รายชื่อนี้มาจากไฟล์ตรวจสอบสิทธิ์ที่ระบุว่าเสียชีวิต แต่ JHCIS ยังไม่ได้บันทึกการตาย <span class="asof">(ข้อมูล ณ ${escH(asOf)})</span>`,
    cols: [4, 5, 22, 4, 6, 12, 11, 13, 7, 9, 7],
    head: '<tr><th rowspan="2">ที่</th><th rowspan="2">PID</th><th rowspan="2">ชื่อ - สกุล</th><th rowspan="2">อายุ</th><th rowspan="2">บ้าน<br>เลขที่</th><th colspan="4">ผลการสำรวจ</th><th rowspan="2">ผู้ให้ข้อมูล<br>/ เบอร์โทร</th><th rowspan="2">หมายเหตุ</th></tr><tr><th>สถานะ (ติ๊ก ✓)</th><th>วันที่เสียชีวิต<br>(วัน/เดือน/ปี)</th><th>สาเหตุการตาย</th><th>ใบมรณบัตร</th></tr>',
    row: (r, n) => `<tr><td class="c">${n}</td><td class="c">${escH(r[0])}</td><td class="nm" style="font-size:${nmSize(r[1])}px">${escH(r[1])}</td><td class="c">${escH(r[2])}</td><td class="c">${escH(houseOf(r[3]))}</td><td class="chk">${bx('เสียชีวิตจริง')}<br>${bx('ยังมีชีวิต')}</td><td class="c dt">&nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp;&nbsp;/</td><td></td><td class="chk">${bx('มี')}<br>${bx('ไม่มี')}</td><td></td><td></td></tr>`,
  },
};
function openSurveyPrint({ groups, title, asOf, kind = 'rights' }) {
  const K = SURVEY_KINDS[kind];
  const w = window.open('', '_blank');
  if (!w) { window.alert('เบราว์เซอร์บล็อกหน้าต่างใหม่ — กรุณาอนุญาตป๊อปอัปสำหรับเว็บนี้แล้วกดอีกครั้ง'); return; }
  // แบ่งหน้าเอง หน้าละ PER แถว (ตัวอักษรใหญ่ แถวสูง อ่านง่ายสำหรับ อสม. สูงวัย) แล้วใส่ช่องลงชื่อท้ายทุกหน้า
  const PER = 8;
  const colgroup = `<colgroup>${K.cols.map((c) => `<col style="width:${c}%">`).join('')}</colgroup>`;
  const pages = groups.flatMap((g) => {
    const total = Math.max(1, Math.ceil(g.rows.length / PER));
    return Array.from({ length: total }, (_, pi) => {
      const rows = g.rows.slice(pi * PER, (pi + 1) * PER).map((r, i) => K.row(r, pi * PER + i + 1)).join('');
      return `<section class="pg"><h1>${escH(title)}</h1>
<h2>${escH(g.label)} <span class="n">(รวม ${g.rows.length} คน · หน้า ${pi + 1}/${total})</span></h2>
<p class="note">${K.note(asOf)}</p>
<table>${colgroup}<thead>${K.head}</thead><tbody>${rows}</tbody></table>
<div class="sign"><div>ลงชื่อ <span class="ln"></span> อสม. ผู้สำรวจ</div><div>วันที่สำรวจ <span class="ln s"></span></div><div>ลงชื่อ <span class="ln"></span> เจ้าหน้าที่ รพ.สต. ผู้รับข้อมูล</div></div></section>`;
    });
  }).join('');
  w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${escH(title)}</title><style>
@page{size:A4 landscape;margin:9mm}*{box-sizing:border-box}body{font-family:'Sarabun','TH Sarabun New','Noto Sans Thai',Tahoma,sans-serif;font-size:15px;color:#111;margin:0}
.pg{page-break-after:always;break-inside:avoid;height:188mm}.pg:last-child{page-break-after:auto}
h1{font-size:19px;margin:0 0 3px;text-align:center}h2{font-size:18px;margin:0 0 6px;text-align:center}h2 .n{font-weight:normal;font-size:15px}
.note{margin:0 0 8px;font-size:14px;line-height:1.45}.asof{color:#555}
table{width:99.5%;border-collapse:collapse;table-layout:fixed}th,td{border:1.3px solid #222;padding:4px 6px;vertical-align:middle;overflow:hidden}
th{background:#e3eef8;font-size:14.5px;line-height:1.3;font-weight:700}td{font-size:15.5px}
td.c{text-align:center}td.nm{font-weight:600;line-height:1.3;white-space:nowrap}td.sm{font-size:13.5px}td.chk{font-size:14.5px;line-height:1.55;white-space:nowrap}td.dt{color:#666;letter-spacing:1px}
.bx{font-size:17px;line-height:1;vertical-align:middle;margin-right:2px}
tbody tr{height:60px;page-break-inside:avoid}thead{display:table-header-group}
.clamp{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.3;max-height:2.6em}
.sign{display:flex;justify-content:space-between;align-items:flex-end;margin-top:18px;font-size:15px}.sign>div{white-space:nowrap}
.ln{display:inline-block;width:185px;border-bottom:1.3px dotted #222;vertical-align:baseline}.ln.s{width:120px}
@media screen{body{padding:12px}.pg{margin-bottom:24px}}
</style></head><body>${pages}<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`);
  w.document.close();
}

export default function RightsRegistry() {
  const [docs, setDocs] = useState(null);
  const [open, setOpen] = useState(null);
  const [kw, setKw] = useState('');
  const [hos, setHos] = useState('');
  useEffect(() => onSnapshot(collection(db, 'rightsRegistry'), (s) => setDocs(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setDocs([])), []);
  const [ov, setOv] = useState({}); // กำหนดหมู่บ้านเอง: pid -> หมู่ที่ (เก็บแยกใน rightsVillageOverrides เพราะข้อมูลหลักถูกซิงก์ทับจาก JHCIS)
  const [deadOpen, setDeadOpen] = useState(false);
  const [fix, setFix] = useState(null); // {kw, tab, busy}
  useEffect(() => onSnapshot(collection(db, 'rightsVillageOverrides'), (s) => setOv(Object.fromEntries(s.docs.map((d) => [d.id, Number(d.data().no)]))), () => setOv({})), []);
  const sum = docs?.find((d) => d.id === 'summary');
  const rowsOf = (cat) => (docs || []).filter((d) => d.cat === cat).sort((a, b) => a.idx - b.idx).flatMap((d) => d.rows || []);
  const vnoOf = (r) => { const g = /ม\.(\d+)\s*$/.exec(String(r[3] || '')); return g ? Number(g[1]) : (ov[r[0]] ?? -1); };
  // ตัวกรองรายหมู่บ้านในหน้าต่างรายชื่อ ('' = ทุกหมู่, -1 = ไม่ระบุหมู่) และในรายชื่อตายตามไฟล์
  const [vf, setVf] = useState('');
  const [dvf, setDvf] = useState('');
  useEffect(() => { setVf(''); }, [open]);
  useEffect(() => { if (!deadOpen) setDvf(''); }, [deadOpen]);
  const vNames = useMemo(() => {
    const base = (sum?.villages || []).length ? sum.villages : VILLAGES;
    return base.filter((v) => v.no > 0).map((v) => ({ no: v.no, name: v.name })).sort((a, b) => a.no - b.no);
  }, [docs]); // eslint-disable-line react-hooks/exhaustive-deps
  const baseList = useMemo(() => {
    if (!open) return [];
    const k = kw.trim();
    return rowsOf(open).filter((r) => (!k || r.slice(0, 4).join(' ').includes(k)) && (!hos || r[6] === hos));
  }, [docs, open, kw, hos, ov]); // eslint-disable-line react-hooks/exhaustive-deps
  const vilCounts = useMemo(() => { const m = {}; for (const r of baseList) { const n = vnoOf(r); m[n] = (m[n] || 0) + 1; } return m; }, [baseList, ov]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(() => (vf === '' ? baseList : baseList.filter((r) => vnoOf(r) === Number(vf))), [baseList, vf, ov]); // eslint-disable-line react-hooks/exhaustive-deps
  const printSurvey = () => {
    const src = rowsOf(open).filter((r) => !hos || r[6] === hos);
    const byV = {}; for (const r of src) { const n = vnoOf(r); (byV[n] ||= []).push(r); }
    const numOf = (r) => parseInt(String(houseOf(r[3])).replace(/\D.*$/, ''), 10) || 0;
    const sortR = (a) => a.sort((x, y) => numOf(x) - numOf(y) || String(x[1]).localeCompare(String(y[1]), 'th'));
    const wanted = vf !== '' ? [Number(vf)] : [...vNames.map((v) => v.no), 0, -1];
    const groups = wanted.filter((n) => byV[n]?.length).map((n) => ({ label: n > 0 ? `หมู่ที่ ${n} ${vNames.find((v) => v.no === n)?.name || ''}` : n === 0 ? 'นอกเขต' : 'ไม่ระบุหมู่', rows: sortR(byV[n]) }));
    if (!groups.length) { window.alert('ไม่มีรายชื่อให้พิมพ์'); return; }
    openSurveyPrint({ groups, title: 'แบบสำรวจบุคคลที่สิทธิ์ UC/Wel ไม่ตรงหน่วยบริการประจำ (ขึ้นทะเบียนที่อื่น) — รพ.สต.บ้านหนองสนม', asOf: sum?.asOf || '' });
  };
  const printDeadSurvey = () => {
    const src = deadShown.map((d) => [d.pid, d.name, d.age, d.addr || '', '', d.right || '']);
    const byV = {}; for (const r of src) { const n = deadVno({ addr: r[3] }); (byV[n] ||= []).push(r); }
    const numOf = (r) => parseInt(String(houseOf(r[3])).replace(/\D.*$/, ''), 10) || 0;
    const sortR = (a) => a.sort((x, y) => numOf(x) - numOf(y) || String(x[1]).localeCompare(String(y[1]), 'th'));
    const wanted = dvf !== '' ? [Number(dvf)] : [...vNames.map((v) => v.no), 0, -1];
    const groups = wanted.filter((n) => byV[n]?.length).map((n) => ({ label: n > 0 ? `หมู่ที่ ${n} ${vNames.find((v) => v.no === n)?.name || ''}` : n === 0 ? 'นอกเขต' : 'ไม่ระบุหมู่', rows: sortR(byV[n]) }));
    if (!groups.length) { window.alert('ไม่มีรายชื่อให้พิมพ์'); return; }
    openSurveyPrint({ kind: 'dead', groups, title: 'แบบสำรวจผู้เสียชีวิต (ตามไฟล์ตรวจสอบสิทธิ์ แต่ JHCIS ยังไม่บันทึกการตาย) — รพ.สต.บ้านหนองสนม', asOf: sum?.deadReport?.asOf || sum?.asOf || '' });
  };
  const deadVno = (d) => { const g = /ม\.(\d+)\s*$/.exec(String(d.addr || '')); return g ? Number(g[1]) : -1; };
  // กำหนด/ล้างหมู่บ้านของคนที่ไม่ระบุหมู่ (เก็บแยกใน rightsVillageOverrides — ไม่ถูกซิงก์ JHCIS ทับ)
  const setVil = async (pid, v) => {
    try {
      if (v === '' || v == null) await deleteDoc(doc(db, 'rightsVillageOverrides', String(pid)));
      else await setDoc(doc(db, 'rightsVillageOverrides', String(pid)), { no: Number(v), updatedAt: serverTimestamp() });
    } catch (e) { window.alert('บันทึกหมู่บ้านไม่สำเร็จ: ' + (e.code || e.message)); }
  };
  // คนที่ที่อยู่ไม่มีหมู่ (หรือที่เรากำหนดหมู่ให้เอง) รวมทุกประเภท ไม่ซ้ำ PID
  const fixList = useMemo(() => {
    const seen = new Map();
    for (const k of ['A', 'C', ...REG.map((x) => x[0])]) for (const r of rowsOf(k)) { if (!/ม\.\d+\s*$/.test(String(r[3] || '')) && !seen.has(r[0])) seen.set(r[0], r); }
    return [...seen.values()];
  }, [docs]); // eslint-disable-line react-hooks/exhaustive-deps
  const vilRows = useMemo(() => {
    const keys = ['A', 'C', ...REG.map((x) => x[0])];
    const m = {};
    for (const k of keys) for (const r of rowsOf(k)) { const no = vnoOf(r); ((m[no] ||= {})[k] = (m[no][k] || 0) + 1); }
    const reg = (v) => REG.reduce((a, x) => a + (v?.[x[0]] || 0), 0);
    // ชื่อหมู่บ้าน/หลังคาเรือนมาจาก JHCIS ที่ซิงก์ล่าสุด (sum.villages); ถ้ายังไม่มีใช้ค่าสำรองใน config
    const live = (sum?.villages || []).map((v) => ({ ...v, households: VILLAGES.find((x) => x.no === v.no)?.households ?? 0 }));
    const base = live.length ? live : VILLAGES;
    const list = base.map((v) => ({ ...v, name: v.no === 0 ? 'นอกเขต (ใช้บันทึกคนนอกเขตฯ)' : v.name, ...(m[v.no] || {}), pop: reg(m[v.no]) }));
    list.push({ no: -1, name: 'ไม่ระบุหมู่/ไม่มีที่อยู่', houses: 0, households: 0, ...(m[-1] || {}), pop: reg(m[-1]) });
    return list;
  }, [docs]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!docs) return <Spinner />;
  const c = sum?.counts || {};
  const deadAll = sum?.deadReport?.list || [];
  const deadCnt = {}; for (const d of deadAll) { const n = deadVno(d); deadCnt[n] = (deadCnt[n] || 0) + 1; }
  const deadShown = dvf === '' ? deadAll : deadAll.filter((d) => deadVno(d) === Number(dvf));
  const VCOLS = [['pop', 'ประชากร (ทะเบียนราษฎร์)'], ['RUC', 'UC/Wel'], ['ROFC', 'ข้าราชการ'], ['RSSS', 'ประกันสังคม'], ['RLGO', 'อปท.'], ['RNRD', 'ต่างด้าว'], ['ROTH', 'อื่นๆ'], ['RNON', 'ไม่มีสิทธิ'], ['A', 'UC/Wel ตรง'], ['C', 'UC/Wel ไม่ตรง']];
  const vilXlsx = () => exportXlsx(vilRows.map((v) => ({ 'หมู่ที่': v.no > 0 ? v.no : '-', 'รหัสหมู่บ้าน': v.code || '', 'ชื่อหมู่บ้าน': v.name, 'บ้าน(หลัง)': v.houses, 'ครอบครัว': v.households, ...Object.fromEntries(VCOLS.map(([k, t]) => [t, v[k] || 0])) })), 'หมู่บ้าน', 'รายงานหมู่บ้านและสิทธิ์การรักษา');
  const toXlsx = () => exportXlsx(list.map((r) => Object.fromEntries(COLS.map((h, i) => [h, r[i]]))), 'รายชื่อ', `ทะเบียนสิทธิ_${open}${vf !== '' ? `_${vf === '-1' ? 'ไม่ระบุหมู่' : `หมู่${vf}`}` : ''}`);
  return (
    <div className="space-y-4">
      <PageHeader title="รายงานหมู่บ้านและสิทธิ์การรักษา (UC/Wel ตรง–ไม่ตรง)" subtitle={sum ? `ข้อมูล ณ ${sum.asOf || ''} · ส่งล่าสุด ${sum.updatedAt?.toDate ? fmtDateTime(sum.updatedAt.toDate()) : ''}` : 'ยังไม่มีข้อมูล'} />
      <SyncNowButton kinds={['rights']} className="print:hidden" />
      {sum?.reg && (
        <section className="card p-5 print:shadow-none">
          <div className="mb-3 text-center font-bold leading-relaxed">
            <div>โรงพยาบาลส่งเสริมสุขภาพตำบลบ้านหนองสนม</div><div>ตำบลเชียงเครือ อำเภอเมืองสกลนคร จังหวัดสกลนคร</div><div>รหัสสถานบริการ {sum.pcu || '05449'}</div>
          </div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-slate-700">ประชากร (ให้ใช้สิทธิ์ประชากรตามทะเบียนราษฎร์)</p>
            <button className="btn-outline print:hidden" onClick={() => window.print()}>พิมพ์รายงาน</button>
          </div>
          <ul className="space-y-1">
            {REG.map(([k, t]) => (
              <li key={k}><button onClick={() => { setOpen(k); setKw(''); setHos(''); }} className="flex w-full items-baseline gap-2 rounded px-1 py-1 text-left hover:bg-sky-50">
                <span>- {t}</span><span className="flex-1 border-b border-dotted border-slate-400" /><b className="tabular-nums">{nf(sum.reg[k] || 0)}</b><span className="text-sm text-slate-500">คน</span></button></li>))}
          </ul>
          <p className="mt-2 text-sm text-slate-600">รวม {nf(Object.values(sum.reg).reduce((a, b) => a + b, 0))} คน · UC = {nf(sum.regUcWel?.[0])} + WEL = {nf(sum.regUcWel?.[1])} · <span className="print:hidden">กดที่รายการเพื่อดูรายชื่อตามประเภทสิทธิ</span></p>
          <p className="text-xs text-slate-400">ประชากรตามทะเบียนราษฎร์ = ประเภทการอยู่อาศัย 1 และ 3 · ตัดผู้เสียชีวิต · สิทธิที่หมดอายุนับเป็นไร้สิทธิ</p>
        </section>
      )}
      {sum && (
        <section className="card overflow-x-auto p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold text-slate-700">หมู่บ้านในเขตรับผิดชอบ และสิทธิ์การรักษาแยกหมู่บ้าน</h3>
            <button className="btn-outline print:hidden" onClick={vilXlsx}><FileSpreadsheet className="h-4 w-4" /> ส่งออก Excel</button>
          </div>
          <table className="w-full whitespace-nowrap text-sm">
            <thead><tr className="border-b bg-slate-50 text-slate-500"><th className="px-2 py-1 text-left">หมู่</th><th className="px-2 py-1 text-left">หมู่บ้าน</th><th className="px-2 py-1 text-right">บ้าน(หลัง)</th><th className="px-2 py-1 text-right">ครอบครัว</th>{VCOLS.map(([k, t]) => <th key={k} className={`px-2 py-1 text-right ${k === 'A' ? 'text-emerald-700' : k === 'C' ? 'text-rose-700' : ''}`}>{t}</th>)}</tr></thead>
            <tbody>{vilRows.map((v) => (
              <tr key={v.no} className="border-b last:border-0 hover:bg-slate-50"><td className="px-2 py-1">{v.no > 0 ? v.no : '-'}</td><td className="px-2 py-1 font-medium">{v.no === -1 ? <button className="text-left font-medium text-sky-700 underline decoration-dotted hover:text-sky-900 print:no-underline" onClick={() => setFix({ kw: '', tab: 'todo' })}>{v.name} ✎ กำหนดหมู่บ้าน</button> : v.name}</td><td className="px-2 py-1 text-right tabular-nums">{nf(v.houses)}</td><td className="px-2 py-1 text-right tabular-nums">{nf(v.households)}</td>{VCOLS.map(([k]) => <td key={k} className={`px-2 py-1 text-right tabular-nums ${k === 'A' ? 'text-emerald-700' : k === 'C' ? 'text-rose-700' : ''}`}>{nf(v[k])}</td>)}</tr>))}
              <tr className="border-t-2 bg-slate-50 font-bold"><td className="px-2 py-1" colSpan={2}>รวม</td><td className="px-2 py-1 text-right tabular-nums">{nf(vilRows.reduce((a, v) => a + v.houses, 0))}</td><td className="px-2 py-1 text-right tabular-nums">{nf(vilRows.reduce((a, v) => a + v.households, 0))}</td>{VCOLS.map(([k]) => <td key={k} className="px-2 py-1 text-right tabular-nums">{nf(vilRows.reduce((a, v) => a + (v[k] || 0), 0))}</td>)}</tr>
            </tbody>
          </table>
          <p className="mt-1 text-xs text-slate-400">ชื่อหมู่บ้านและจำนวนบ้านดึงจาก JHCIS ทุกครั้งที่ซิงก์ (ครอบครัวเป็นค่าที่บันทึกไว้ ณ {VILLAGES_ASOF}) · ประชากรและสิทธิ์นับจากทะเบียนราษฎร์ (ประเภทอาศัย 1,3) แยกตามหมู่ในที่อยู่ · “UC/Wel ตรง/ไม่ตรง” ใช้เกณฑ์เดียวกับด้านบน</p>
        </section>
      )}
      {sum?.deadReport && (
        <section className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h3 className="font-bold text-slate-700">⚠️ ตายตามไฟล์ตรวจสอบสิทธิ์ แต่ JHCIS ยังไม่ตัดตาย</h3>
            <p className="text-xs text-slate-500">จากไฟล์ {sum.deadReport.fileName} (นำเข้า {sum.deadReport.asOf}) · คนที่บันทึกตายใน JHCIS แล้วจะหายจากรายการเองในรอบซิงก์ถัดไป</p>
          </div>
          <button className={`btn ${(sum.deadReport.list || []).length ? 'bg-rose-600 text-white hover:bg-rose-700' : 'btn-outline'}`} onClick={() => setDeadOpen(true)}>{nf((sum.deadReport.list || []).length)} คน — ดูรายชื่อ</button>
        </section>
      )}
      {!sum ? <p className="card p-6 text-slate-500">ยังไม่มีข้อมูล — ให้รันสคริปต์ที่เครื่อง JHCIS: <code>node sync.mjs --rights</code></p> : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            {['A', 'C', 'B'].map((k) => (
              <button key={k} onClick={() => { setOpen(k); setKw(''); setHos(''); }} className="card p-4 text-left transition hover:shadow-md">
                <div className={`mb-2 h-1.5 w-16 rounded-full bg-gradient-to-r ${CATS[k].tone}`} />
                <div className="text-3xl font-bold tabular-nums">{nf(c[k])} <span className="text-base font-normal text-slate-500">คน</span></div>
                <div className="mt-1 text-sm font-semibold text-slate-700">{CATS[k].title}</div>
                <div className="mt-1 text-xs text-slate-500">{CATS[k].hint}</div>
                <div className="mt-2 text-xs font-medium text-sky-700">กดดูรายชื่อ →</div>
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">UC/Wel = สิทธิบัตรทอง (กลุ่มสิทธิ UC และ สปร./ท.) · ตัดผู้เสียชีวิตและสิทธิที่หมดอายุแล้ว (หมดอายุ {nf(sum.expired)} คน) · ประชากรในเขตประเภท 1–4 ที่ไม่มีสิทธิ UC/Wel อีก {nf(sum.inAreaNoUcWel)} คน (ใช้สิทธิอื่น เช่น ข้าราชการ ประกันสังคม)</p>
          <section className="card overflow-x-auto p-4">
            <h3 className="mb-2 font-bold text-slate-700">แยกตามประเภทการอยู่อาศัย</h3>
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-slate-500"><th className="py-1">ประเภทอาศัย</th><th className="text-right">ตรง UC</th><th className="text-right">ตรง Wel</th><th className="text-right">ไม่ตรง UC</th><th className="text-right">ไม่ตรง Wel</th></tr></thead>
              <tbody>{[1, 2, 3, 4].map((t) => { const x = sum.byType?.[t] || { A: [0, 0], C: [0, 0] }; return (
                <tr key={t} className="border-b last:border-0"><td className="py-1">{TL[t]}</td><td className="text-right tabular-nums">{nf(x.A[0])}</td><td className="text-right tabular-nums">{nf(x.A[1])}</td><td className="text-right tabular-nums text-rose-700">{nf(x.C[0])}</td><td className="text-right tabular-nums text-rose-700">{nf(x.C[1])}</td></tr>); })}</tbody>
            </table>
            <p className="mt-1 text-xs text-slate-400">UC = กลุ่มสิทธิ 3 (บัตรทอง ไม่มี ท.) · Wel = กลุ่มสิทธิ 4 (สปร. มี ท.)</p>
          </section>
          <section className="card p-4">
            <h3 className="mb-2 font-bold text-slate-700">กลุ่มไม่ตรง — ขึ้นทะเบียนที่หน่วยบริการใดบ้าง</h3>
            <ul className="space-y-1 text-sm">{Object.entries(sum.hosC || {}).map(([h, n]) => (
              <li key={h}><button className="flex w-full justify-between gap-2 rounded px-1 py-0.5 text-left hover:bg-slate-50" onClick={() => { setOpen('C'); setKw(''); setHos(h); }}><span className="truncate">{h}</span><b className="tabular-nums">{nf(n)}</b></button></li>))}</ul>
          </section>
        </>
      )}
      {fix && (() => {
        const vOpts = vilRows.filter((v) => v.no >= 0);
        const k = fix.kw.trim();
        const rows = fixList.filter((r) => (fix.tab === 'done' ? ov[r[0]] != null : ov[r[0]] == null) && (!k || r.slice(0, 4).join(' ').includes(k)));
        return (
          <Modal title="กำหนดหมู่บ้านให้ผู้ที่ไม่ระบุหมู่/ไม่มีที่อยู่" onClose={() => setFix(null)} wide>
            <p className="mb-2 text-xs text-slate-500">เลือกหมู่บ้านให้แต่ละคน ระบบจะนับเข้าหมู่นั้นในตารางทันที (เก็บแยกไว้ในเว็บ ไม่ได้แก้ในโปรแกรม JHCIS จึงไม่ถูกซิงก์ทับ — ถ้าแก้ที่อยู่ใน JHCIS ภายหลัง ระบบจะใช้ที่อยู่จาก JHCIS แทน)</p>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button className={fix.tab === 'todo' ? 'btn btn-primary' : 'btn-outline'} onClick={() => setFix({ ...fix, tab: 'todo' })}>ยังไม่กำหนด ({nf(fixList.filter((r) => ov[r[0]] == null).length)})</button>
              <button className={fix.tab === 'done' ? 'btn btn-primary' : 'btn-outline'} onClick={() => setFix({ ...fix, tab: 'done' })}>กำหนดแล้ว ({nf(fixList.filter((r) => ov[r[0]] != null).length)})</button>
              <div className="relative min-w-48 flex-1"><Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" /><input className="input pl-8" placeholder="ค้นหาชื่อ / PID" value={fix.kw} onChange={(e) => setFix({ ...fix, kw: e.target.value })} /></div>
            </div>
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50"><tr><th className="px-2 py-1 text-left">เลข PID</th><th className="px-2 py-1 text-left">ชื่อ-สกุล</th><th className="px-2 py-1 text-left">อายุ</th><th className="px-2 py-1 text-left">ที่อยู่เดิม</th><th className="px-2 py-1 text-left">หมู่บ้านที่กำหนด</th></tr></thead>
                <tbody>{rows.slice(0, 300).map((r) => (
                  <tr key={r[0]} className="border-b"><td className="px-2 py-1">{r[0]}</td><td className="px-2 py-1">{r[1]}</td><td className="px-2 py-1">{r[2]}</td><td className="px-2 py-1 text-slate-500">{r[3] || '-'}</td>
                    <td className="px-2 py-1"><select className="input !py-1" value={ov[r[0]] ?? ''} onChange={(e) => setVil(r[0], e.target.value)}><option value="">— เลือกหมู่บ้าน —</option>{vOpts.map((v) => <option key={v.no} value={v.no}>{v.no > 0 ? `หมู่ ${v.no} ` : ''}{v.name}</option>)}</select></td></tr>))}
                  {!rows.length && <tr><td colSpan={5} className="p-4 text-center text-slate-500">{fix.tab === 'todo' ? 'ไม่มีรายการที่ต้องกำหนด 🎉' : 'ยังไม่มีรายการที่กำหนด'}</td></tr>}</tbody>
              </table>
              {rows.length > 300 && <p className="p-2 text-xs text-slate-500">แสดง 300 รายการแรก — ใช้ช่องค้นหาเพื่อกรอง</p>}
            </div>
            <p className="mt-2 text-xs text-slate-400">ในช่อง “กำหนดแล้ว” เลือก “— เลือกหมู่บ้าน —” เพื่อยกเลิกการกำหนด</p>
          </Modal>);
      })()}
      {deadOpen && sum?.deadReport && (
        <Modal title="ตายตามไฟล์ตรวจสอบสิทธิ์ แต่ JHCIS ยังไม่ตัดตาย" onClose={() => setDeadOpen(false)} wide>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">กรุณาตรวจสอบแล้วบันทึกการตายในโปรแกรม JHCIS (ระบบนี้ไม่ได้ตัดตายให้เอง)</p>
            <button className="btn bg-rose-600 text-white hover:bg-rose-700" onClick={printDeadSurvey} title="เปิดหน้าต่างพิมพ์ — เลือก 'บันทึกเป็น PDF' ได้"><Printer className="h-4 w-4" /> พิมพ์แบบสำรวจ อสม. (PDF){dvf !== '' ? ` — ${dvf === '-1' ? 'ไม่ระบุหมู่' : `หมู่ ${dvf}`}` : ' — ทุกหมู่'}</button>
            <button className="btn-outline" onClick={() => exportXlsx(deadShown.map((d) => ({ 'เลข PID': d.pid, 'ชื่อ-สกุล': d.name, 'อายุ': d.age, 'ที่อยู่': d.addr, 'รหัสสิทธิใน JHCIS': d.right, 'สิทธิตามไฟล์': d.newRight })), 'ยังไม่ตัดตาย', 'ตายตามไฟล์สิทธิ_JHCISยังไม่ตัดตาย')}><FileSpreadsheet className="h-4 w-4" /> ส่งออก Excel</button>
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            <button onClick={() => setDvf('')} className={`rounded-full border px-3 py-1 text-xs font-medium ${dvf === '' ? 'border-rose-600 bg-rose-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}>ทุกหมู่บ้าน ({nf(deadAll.length)})</button>
            {vNames.filter((v) => deadCnt[v.no]).map((v) => (
              <button key={v.no} onClick={() => setDvf(String(v.no))} title={v.name} className={`rounded-full border px-3 py-1 text-xs font-medium ${dvf === String(v.no) ? 'border-rose-600 bg-rose-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}>หมู่ {v.no} ({nf(deadCnt[v.no])})</button>))}
            {deadCnt[-1] ? <button onClick={() => setDvf('-1')} className={`rounded-full border px-3 py-1 text-xs font-medium ${dvf === '-1' ? 'border-amber-600 bg-amber-600 text-white' : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'}`}>ไม่ระบุหมู่ ({nf(deadCnt[-1])})</button> : null}
          </div>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50"><tr>{['เลข PID', 'ชื่อ-สกุล', 'อายุ', 'ที่อยู่', 'สิทธิใน JHCIS'].map((h) => <th key={h} className="px-2 py-1 text-left">{h}</th>)}</tr></thead>
              <tbody>{deadShown.map((d) => <tr key={d.pid} className="border-b"><td className="px-2 py-1">{d.pid}</td><td className="px-2 py-1">{d.name}</td><td className="px-2 py-1">{d.age}</td><td className="px-2 py-1">{d.addr || '-'}</td><td className="px-2 py-1">{d.right || '-'}</td></tr>)}
                {!deadShown.length && <tr><td colSpan={5} className="p-4 text-center text-slate-500">ไม่มีรายการค้างแล้ว 🎉</td></tr>}</tbody>
            </table>
          </div>
        </Modal>
      )}
      {open && (
        <Modal title={`${CATS[open].title}${hos ? ` — ${hos}` : ''}${vf !== '' ? ` — ${vf === '-1' ? 'ไม่ระบุหมู่' : vf === '0' ? 'นอกเขต' : `หมู่ ${vf}`}` : ''}`} onClose={() => setOpen(null)} wide>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-48"><Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" /><input className="input pl-8" placeholder="ค้นหาชื่อ / PID / ที่อยู่" value={kw} onChange={(e) => setKw(e.target.value)} /></div>
            {hos && <button className="btn-outline" onClick={() => setHos('')}>ล้างตัวกรองหน่วยบริการ</button>}
            <button className="btn-outline" onClick={toXlsx}><FileSpreadsheet className="h-4 w-4" /> ส่งออก Excel</button>
            {open === 'C' && <button className="btn bg-sky-600 text-white hover:bg-sky-700" onClick={printSurvey} title="เปิดหน้าต่างพิมพ์ — เลือก 'บันทึกเป็น PDF' ได้"><Printer className="h-4 w-4" /> พิมพ์แบบสำรวจ อสม. (PDF){vf !== '' ? ` — ${vf === '-1' ? 'ไม่ระบุหมู่' : vf === '0' ? 'นอกเขต' : `หมู่ ${vf}`}` : ' — ทุกหมู่'}</button>}
            <span className="text-sm text-slate-500">{nf(list.length)} คน</span>
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            <button onClick={() => setVf('')} className={`rounded-full border px-3 py-1 text-xs font-medium ${vf === '' ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}>ทุกหมู่บ้าน ({nf(baseList.length)})</button>
            {vNames.filter((v) => vilCounts[v.no]).map((v) => (
              <button key={v.no} onClick={() => setVf(String(v.no))} title={v.name} className={`rounded-full border px-3 py-1 text-xs font-medium ${vf === String(v.no) ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}>หมู่ {v.no} ({nf(vilCounts[v.no])})</button>))}
            {vilCounts[0] ? <button onClick={() => setVf('0')} className={`rounded-full border px-3 py-1 text-xs font-medium ${vf === '0' ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}>นอกเขต ({nf(vilCounts[0])})</button> : null}
            {vilCounts[-1] ? <button onClick={() => setVf('-1')} className={`rounded-full border px-3 py-1 text-xs font-medium ${vf === '-1' ? 'border-amber-600 bg-amber-600 text-white' : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'}`}>ไม่ระบุหมู่ ({nf(vilCounts[-1])})</button> : null}
          </div>
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50"><tr>{COLS.map((h) => <th key={h} className="whitespace-nowrap px-2 py-1 text-left">{h}</th>)}</tr></thead>
              <tbody>{list.slice(0, 500).map((r, i) => <tr key={i} className="border-b"><td className="px-2 py-1">{r[0]}</td><td className="px-2 py-1">{r[1]}</td><td className="px-2 py-1">{r[2]}</td><td className="px-2 py-1">{r[3]}</td><td className="px-2 py-1">{r[4]}</td><td className="px-2 py-1">{r[5]}</td><td className="px-2 py-1">{r[6]}</td></tr>)}</tbody>
            </table>
            {list.length > 500 && <p className="p-2 text-xs text-slate-500">แสดง 500 รายการแรก — ค้นหาเพื่อกรอง หรือส่งออก Excel เพื่อดูทั้งหมด</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}
