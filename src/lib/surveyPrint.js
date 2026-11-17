// พิมพ์แบบสำรวจ อสม. (A4 แนวนอน บันทึกเป็น PDF ได้จากหน้าต่างพิมพ์) ใช้ร่วมกันในหน้าทะเบียนสิทธิ์ และรายงาน P&P Fee Schedule
// พิมพ์ "แบบสำรวจ อสม." (บันทึกเป็น PDF ได้จากหน้าต่างพิมพ์) — รายชื่อกลุ่มไม่ตรง แยกรายหมู่บ้าน หมู่ละหลายหน้า
export const escH = (x) => String(x ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
export const houseOf = (addr) => String(addr || '').replace(/\s*ม\.\d+\s*$/, '').trim() || '-';
// ชื่อ-สกุลอยู่บรรทัดเดียวเสมอ: ชื่อยาวมากค่อยลดขนาดตัวอักษรลงตามความยาว
export const nmSize = (n) => { const L = String(n || '').length; return L <= 22 ? 18 : L <= 26 ? 16.5 : L <= 32 ? 15 : 13.5; };
export const bx = (t) => `<span class="bx">☐</span>${t}`;
export const SURVEY_KINDS = {
  rights: {
    note: () => `<b>วิธีสำรวจ:</b> รายชื่อนี้คือผู้ที่อยู่ในเขต แต่ขึ้นทะเบียนสิทธิ์ที่หน่วยบริการอื่น สอบถามบุคคลตามรายชื่อว่า <b>อาศัยอยู่จริงในพื้นที่หรือไม่ และอยู่ต่อเนื่องเกิน 6 เดือนหรือไม่</b> — หากอยู่เกิน 6 เดือนและต้องการใช้บริการที่ รพ.สต.บ้านหนองสนม ให้แจ้งนำบัตรประชาชนมาติดต่อ รพ.สต. เพื่อแจ้งย้ายสิทธิ์`,
    cols: [4, 5, 23, 4, 6, 14, 11, 9, 11, 7, 6],
    head: '<tr><th rowspan="2">ที่</th><th rowspan="2">PID</th><th rowspan="2">ชื่อ - สกุล</th><th rowspan="2">อายุ</th><th rowspan="2">บ้าน<br>เลขที่</th><th rowspan="2">หน่วยบริการ<br>ประจำปัจจุบัน</th><th colspan="3" class="grp">ผลการสำรวจ (ติ๊ก ✓)</th><th rowspan="2">เบอร์<br>โทร</th><th rowspan="2">หมาย<br>เหตุ</th></tr><tr><th>การอยู่อาศัย</th><th>ระยะเวลา</th><th>การย้ายสิทธิ์</th></tr>',
    row: (r, n) => `<tr><td class="c">${n}</td><td class="c">${escH(r[0])}</td><td class="nm" style="font-size:${nmSize(r[1])}px">${escH(r[1])}</td><td class="c">${escH(r[2])}</td><td class="c">${escH(houseOf(r[3]))}</td><td class="sm"><div class="clamp">${escH(r[6])}</div></td><td class="chk">${bx('อยู่จริง')}<br>${bx('ไม่ได้อยู่')}</td><td class="chk">${bx('≥ 6 เดือน')}<br>${bx('&lt; 6 เดือน')}</td><td class="chk">${bx('ต้องการย้าย')}<br>${bx('ไม่ต้องการ')}</td><td></td><td></td></tr>`,
  },
  dead: {
    note: () => `<b>วิธีสำรวจ:</b> สอบถามญาติ/เพื่อนบ้านของบุคคลตามรายชื่อว่า <b>เสียชีวิตจริงหรือไม่ วันที่เสียชีวิต และสาเหตุการตาย</b> (ถ้ามีใบมรณบัตรให้ติ๊กและแจ้งเจ้าหน้าที่) รายชื่อนี้ไฟล์ตรวจสอบสิทธิ์ระบุว่าเสียชีวิต แต่ JHCIS ยังไม่ได้บันทึกการตาย`,
    cols: [4, 5, 22, 4, 6, 12, 12, 13, 7, 8, 7],
    head: '<tr><th rowspan="2">ที่</th><th rowspan="2">PID</th><th rowspan="2">ชื่อ - สกุล</th><th rowspan="2">อายุ</th><th rowspan="2">บ้าน<br>เลขที่</th><th colspan="4" class="grp">ผลการสำรวจ</th><th rowspan="2">ผู้ให้ข้อมูล<br>/ เบอร์โทร</th><th rowspan="2">หมาย<br>เหตุ</th></tr><tr><th>สถานะ (ติ๊ก ✓)</th><th>วันที่เสียชีวิต<br>(วัน/เดือน/ปี)</th><th>สาเหตุการตาย</th><th>ใบ<br>มรณบัตร</th></tr>',
    row: (r, n) => `<tr><td class="c">${n}</td><td class="c">${escH(r[0])}</td><td class="nm" style="font-size:${nmSize(r[1])}px">${escH(r[1])}</td><td class="c">${escH(r[2])}</td><td class="c">${escH(houseOf(r[3]))}</td><td class="chk">${bx('เสียชีวิตจริง')}<br>${bx('ยังมีชีวิต')}</td><td class="c dt">&nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp;&nbsp;/</td><td></td><td class="chk">${bx('มี')}<br>${bx('ไม่มี')}</td><td></td><td></td></tr>`,
  },
};
const titleSize = (t) => { const L = String(t).length; return L <= 42 ? 22 : L <= 56 ? 19 : 16; };
export function openSurveyPrint({ groups, title, asOf, kind = 'rights' }) {
  const K0 = SURVEY_KINDS[kind];
  const w = window.open('', '_blank');
  if (!w) { window.alert('เบราว์เซอร์บล็อกหน้าต่างใหม่ — กรุณาอนุญาตป๊อปอัปสำหรับเว็บนี้แล้วกดอีกครั้ง'); return; }
  const mainTitle = String(title).replace(/\s*—\s*รพ\.สต\.บ้านหนองสนม\s*$/, '').replace(/\s*\((ขึ้นทะเบียนที่อื่น|ตามไฟล์ตรวจสอบสิทธิ์ แต่ JHCIS ยังไม่บันทึกการตาย)\)\s*/, ' ').trim();
  let logo = ''; try { logo = new URL('logo.png', document.baseURI).href; } catch { /* ไม่มีโลโก้ก็พิมพ์ได้ */ }
  // แบ่งหน้าเอง หน้าละ PER แถว (ตัวอักษรใหญ่ แถวสูง อ่านง่ายสำหรับ อสม. สูงวัย) พอดี A4 แนวนอน แล้วใส่ช่องลงชื่อท้ายทุกหน้า
  const pages = groups.flatMap((g) => {
    const K = g.spec || K0; const PER = K.per || 7; const gTitle = g.title || mainTitle;
    const colgroup = `<colgroup>${K.cols.map((c) => `<col style="width:${c}%">`).join('')}</colgroup>`;
    const total = Math.max(1, Math.ceil(g.rows.length / PER));
    return Array.from({ length: total }, (_, pi) => {
      const rows = g.rows.slice(pi * PER, (pi + 1) * PER).map((r, i) => K.row(r, pi * PER + i + 1)).join('');
      return `<section class="pg">
<header class="band">${logo ? `<img class="lg" src="${escH(logo)}" alt="">` : ''}<div class="tt"><h1 style="font-size:${titleSize(gTitle)}px">${escH(gTitle)}</h1><div class="sub">${escH(g.sub || '')}${g.sub ? ' · ' : ''}รพ.สต.บ้านหนองสนม · ต.เชียงเครือ อ.เมืองสกลนคร จ.สกลนคร · ข้อมูล ณ ${escH(asOf)}</div></div><div class="vil"><div class="vn">${escH(g.label)}</div><div class="vc">รวม ${g.rows.length} คน · หน้า ${pi + 1}/${total}</div></div></header>
<p class="note">${K.note(g)}</p>
<div class="tw"><table>${colgroup}<thead>${K.head}</thead><tbody>${rows}</tbody></table></div>
<div class="sign"><div><span class="ln"></span><b>อสม. ผู้สำรวจ</b><i>(ลงชื่อ)</i></div><div><span class="ln s"></span><b>วันที่สำรวจ</b><i>วัน / เดือน / ปี</i></div><div><span class="ln"></span><b>เจ้าหน้าที่ รพ.สต. ผู้รับข้อมูล</b><i>(ลงชื่อ)</i></div></div>
<div class="pv">เอกสารนี้มีข้อมูลส่วนบุคคลของประชาชน โปรดเก็บรักษา และส่งคืนเจ้าหน้าที่ รพ.สต. ทันทีเมื่อสำรวจเสร็จ</div></section>`;
    });
  }).join('');
  w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${escH(mainTitle)}</title><style>
@page{size:A4 landscape;margin:8mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'Sarabun','TH Sarabun New','Noto Sans Thai',Tahoma,sans-serif;font-size:15px;color:#0f172a;margin:0}
.pg{page-break-after:always;break-inside:avoid;height:192mm;overflow:hidden;display:flex;flex-direction:column}.pg:last-child{page-break-after:auto}
.band{display:flex;align-items:center;gap:14px;background:linear-gradient(100deg,#0b4f8a,#1d8ad8);color:#fff;border-radius:12px;padding:9px 16px}
.band .lg{width:52px;height:52px;object-fit:contain;background:#fff;border-radius:50%;padding:3px;flex:none}
.band .tt{flex:1;min-width:0}.band h1{margin:0;font-size:22px;line-height:1.25;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.band .sub{font-size:13.5px;opacity:.92;margin-top:2px}
.band .vil{flex:none;text-align:center;background:#fff;color:#0b4f8a;border-radius:10px;padding:5px 16px;min-width:200px}
.band .vn{font-size:21px;font-weight:800;line-height:1.25}.band .vc{font-size:13.5px;color:#334155}
.note{margin:7px 0;padding:6px 12px;background:#eef6fd;border-left:5px solid #1d8ad8;border-radius:6px;font-size:15px;line-height:1.5}
.tw{flex:1}table{width:calc(100% - 2px);border-collapse:collapse;table-layout:fixed}
th,td{border:1.2px solid #64748b;padding:3px 6px;vertical-align:middle;overflow:hidden}
th{background:#cfe3f7;color:#0b2f52;font-size:15px;line-height:1.3;font-weight:800}th.grp{background:#a9cdef;font-size:15.5px}
td{font-size:16px}tbody tr:nth-child(even) td{background:#f4f8fc}tbody tr{height:58px;page-break-inside:avoid}thead{display:table-header-group}
td.c{text-align:center}td.nm{font-weight:700;line-height:1.3;white-space:nowrap}td.sm{font-size:13.5px;color:#334155}td.chk{font-size:15px;line-height:1.55;white-space:nowrap}td.dt{color:#64748b;letter-spacing:1px}
.bx{font-size:18px;line-height:1;vertical-align:middle;margin-right:3px}
.clamp{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.3;max-height:2.6em}
.sign{display:grid;grid-template-columns:1.25fr 1fr 1.35fr;gap:26px;margin-top:8px;text-align:center;font-size:15px}
.sign>div{display:flex;flex-direction:column;align-items:center}.sign .ln{display:block;width:100%;height:24px;border-bottom:1.4px dotted #334155}
.sign b{margin-top:3px;font-size:15px}.sign i{font-style:normal;font-size:12.5px;color:#64748b}
.pv{margin-top:6px;text-align:center;font-size:11.5px;color:#64748b}
@media screen{body{padding:12px;background:#e2e8f0}.pg{background:#fff;padding:8px;margin-bottom:16px;border-radius:8px}}
</style></head><body>${pages}<script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script></body></html>`);
  w.document.close();
}


// แบบสำรวจกลุ่มเป้าหมาย P&P ที่ยังไม่ได้รับบริการ: ถามว่า "อยู่ในพื้นที่หรือไม่" เพื่อกำหนดเป้าหมายการทำงาน (แถว = [pid, ชื่อ, อายุ, บ้านเลขที่, หมู่, สถานะ, รายละเอียด])
export const PP_SPEC = {
  per: 6,
  note: (g) => `<b>วิธีสำรวจ:</b> สอบถามบุคคลตามรายชื่อว่า <b>ยังอาศัยอยู่ในพื้นที่จริงหรือไม่</b> — ถ้าอยู่ ให้นัดมารับบริการและลงวันที่นัด · ถ้าไม่อยู่ (ย้ายออก/ไปทำงานที่อื่น/เสียชีวิต) ให้ติ๊กและบันทึกสถานที่ใหม่ เพื่อให้เจ้าหน้าที่ตัดออกจากเป้าหมาย${g?.rule ? `<br><span style="font-size:13.5px;color:#334155"><b>เกณฑ์เป้าหมาย:</b> ${escH(g.rule)}</span>` : ''}`,
  cols: [4, 5, 21, 4, 6, 14, 15, 13, 10, 8],
  head: '<tr><th rowspan="2">ที่</th><th rowspan="2">PID</th><th rowspan="2">ชื่อ - สกุล</th><th rowspan="2">อายุ</th><th rowspan="2">บ้าน<br>เลขที่</th><th rowspan="2">สถานะ /<br>รายละเอียดในระบบ</th><th colspan="3" class="grp">ผลการสำรวจ (ติ๊ก ✓)</th><th rowspan="2">หมาย<br>เหตุ</th></tr><tr><th>การอยู่อาศัย</th><th>การติดตาม</th><th>วันที่นัด /<br>เบอร์โทร</th></tr>',
  row: (r, n) => `<tr><td class="c">${n}</td><td class="c">${escH(r[0])}</td><td class="nm" style="font-size:${nmSize(r[1])}px">${escH(r[1])}</td><td class="c">${escH(r[2])}</td><td class="c">${escH(houseOf(r[3]))}</td><td class="sm"><b>${r[5] === 'partial' ? 'ทำบางส่วน' : 'ยังไม่ทำ'}</b><div class="clamp">${escH(r[6])}</div></td><td class="chk">${bx('อยู่ในพื้นที่')}<br>${bx('ไม่อยู่ / ย้าย')}</td><td class="chk">${bx('รับนัด')}<br>${bx('ปฏิเสธ/ทำที่อื่น')}</td><td></td><td></td></tr>`,
};

// รายงานสรุปผลงาน P&P ทุกตัวชี้วัด (A4 แนวตั้ง) — sections = [{title, rows:[[ชื่อกิจกรรม, อัตรา, เบิกได้, เงิน, ทำแล้ว, บางส่วน, ยังไม่ทำ, เป้าหมาย]], sub}]
export function openPPReportPrint({ title, label, asOf, sections, total }) {
  const w = window.open('', '_blank');
  if (!w) { window.alert('เบราว์เซอร์บล็อกหน้าต่างใหม่ — กรุณาอนุญาตป๊อปอัปสำหรับเว็บนี้แล้วกดอีกครั้ง'); return; }
  let logo = ''; try { logo = new URL('logo.png', document.baseURI).href; } catch { /* ไม่มีโลโก้ก็พิมพ์ได้ */ }
  const nf = (n) => Number(n || 0).toLocaleString('th-TH');
  const body = sections.map((s) => `<tr class="cat"><td colspan="8">${escH(s.title)} <span class="r">${nf(s.sub)} บาท</span></td></tr>${s.rows.map((r) => `<tr><td class="nm">${escH(r[0])}</td><td class="n">${nf(r[1])}</td><td class="n">${r[2] == null ? '–' : nf(r[2])}</td><td class="n b">${r[3] == null ? '–' : nf(r[3])}</td><td class="n g">${r[7] == null ? '–' : nf(r[4])}</td><td class="n a">${r[7] == null ? '–' : nf(r[5])}</td><td class="n x">${r[7] == null ? '–' : nf(r[6])}</td><td class="n">${r[7] == null ? 'ตามต้องการ' : nf(r[7])}</td></tr>`).join('')}`).join('');
  w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${escH(title)}</title><style>
@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'Sarabun','TH Sarabun New','Noto Sans Thai',Tahoma,sans-serif;font-size:14px;color:#0f172a;margin:0}
.band{display:flex;align-items:center;gap:12px;background:linear-gradient(100deg,#0b4f8a,#1d8ad8);color:#fff;border-radius:12px;padding:10px 16px;margin-bottom:10px}
.band img{width:50px;height:50px;object-fit:contain;background:#fff;border-radius:50%;padding:3px}.band h1{margin:0;font-size:22px;font-weight:800}.band .sub{font-size:13.5px;opacity:.92}
.tot{margin:0 0 8px;font-size:16px}.tot b{color:#047857;font-size:20px}
table{width:100%;border-collapse:collapse}th,td{border:1px solid #94a3b8;padding:4px 6px}th{background:#cfe3f7;color:#0b2f52;font-size:13px}
td.nm{font-size:14px}td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}td.b{font-weight:800}td.g{color:#047857}td.a{color:#b45309}td.x{color:#be123c;font-weight:700}
tr.cat td{background:#e8f1fb;font-weight:800;font-size:14.5px;color:#0b2f52}tr.cat .r{float:right}tr{page-break-inside:avoid}thead{display:table-header-group}
.ft{margin-top:8px;font-size:12px;color:#64748b;line-height:1.5}
</style></head><body><div class="band">${logo ? `<img src="${escH(logo)}" alt="">` : ''}<div><h1>${escH(title)}</h1><div class="sub">รพ.สต.บ้านหนองสนม · ${escH(label)} · ข้อมูล ณ ${escH(asOf)}</div></div></div>
<p class="tot">ประมาณการเงินที่พึงได้รับ <b>${nf(total)}</b> บาท</p>
<table><thead><tr><th rowspan="2" style="width:34%">กิจกรรม</th><th rowspan="2">อัตรา<br>จ่าย</th><th rowspan="2">เบิกได้<br>(ครั้ง)</th><th rowspan="2">ประมาณการ<br>(บาท)</th><th colspan="4">กลุ่มเป้าหมาย (คน)</th></tr><tr><th>ทำแล้ว</th><th>บางส่วน</th><th>ยังไม่ทำ</th><th>เป้าหมาย</th></tr></thead><tbody>${body}</tbody></table>
<div class="ft">เงิน = จำนวนครั้งที่เบิกได้ (หลังจำกัดครั้งต่อคนต่อปี) × อัตราจ่าย เป็นการประมาณการ ไม่ใช่ยอดเบิกจ่ายจริง · นับจากการให้บริการที่ รพ.สต.บ้านหนองสนม ในฐานข้อมูล JHCIS</div>
<script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script></body></html>`);
  w.document.close();
}
