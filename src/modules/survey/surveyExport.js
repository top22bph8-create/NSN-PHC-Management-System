// รายงานและส่งออก: ตารางรายงาน 8 แบบ, Excel (.xlsx), CSV, PDF/พิมพ์ (หน้า A4 ภาษาไทย พร้อมกราฟ)
import { fmtDate } from '../../lib/thai';
import { COMMENTS, QK, QUESTIONS, groupBy, keyFns, levelOf, monthLabel, quarterLabel, summarize, f1, f2, NO_DATA } from './surveyLib';

const ORG = 'โรงพยาบาลส่งเสริมสุขภาพตำบลบ้านหนองสนม';
export const REPORTS = [['day', 'รายงานผลประเมินรายวัน'], ['month', 'รายงานรายเดือน'], ['quarter', 'รายงานรายไตรมาส (ปีงบประมาณ)'], ['year', 'รายงานรายปี (ปีงบประมาณ)'], ['service', 'รายงานแยกประเภทบริการ'], ['village', 'รายงานแยกหมู่บ้าน'], ['aspect', 'รายงานคะแนนรายด้าน'], ['suggest', 'รายงานข้อเสนอแนะจากประชาชน']];
const periodLabel = { day: (k) => fmtDate(k), month: monthLabel, quarter: quarterLabel, year: (k) => `ปีงบประมาณ ${k}`, service: (k) => k, village: (k) => k };
const firstCol = { day: 'วันที่', month: 'เดือน', quarter: 'ไตรมาส', year: 'ปีงบประมาณ', service: 'ประเภทบริการ', village: 'หมู่บ้าน' };

export function buildReport(kind, rows) {
  const title = REPORTS.find((r) => r[0] === kind)[1];
  if (kind === 'aspect') {
    const s = summarize(rows);
    return { title, head: ['ด้านที่ประเมิน', 'จำนวนผู้ตอบ', 'คะแนนเฉลี่ย', 'ระดับ', 'ร้อยละพึงพอใจ (4–5)'], align: ['l', 'r', 'r', 'l', 'r'],
      rows: [...s.aspects.map((a, i) => [`${i + 1}. ${QUESTIONS[i].t}`, a.n, f2(a.avg), levelOf(a.avg), f1(a.pct)]), ['รวมทุกด้าน', s.scoreN, f2(s.overall), levelOf(s.overall), f1(s.pct)]] };
  }
  if (kind === 'suggest') {
    const list = rows.filter((r) => COMMENTS.some(([k]) => String(r[k] || '').trim())).sort((a, b) => (b.day + b.time).localeCompare(a.day + a.time));
    return { title, head: ['วันที่', 'เวลา', 'ประเภทบริการ', 'หมู่บ้าน', 'สิ่งที่ประทับใจ', 'สิ่งที่ควรปรับปรุง', 'ข้อเสนอแนะเพิ่มเติม'], align: ['l', 'l', 'l', 'l', 'l', 'l', 'l'], wide: true,
      rows: list.map((r) => [fmtDate(r.day), r.time, r.service, r.village, r.good || '', r.improve || '', r.other || '']) };
  }
  const groups = groupBy(rows, keyFns[kind], true);
  const head = [firstCol[kind], 'จำนวนผู้ตอบ', ...QUESTIONS.map((q, i) => `ข้อ ${i + 1}`), 'เฉลี่ยรวม', 'ร้อยละพึงพอใจ', 'ระดับ'];
  return { title, head, align: ['l', 'r', ...QK.map(() => 'r'), 'r', 'r', 'l'], note: 'ข้อ 1–6 ตามลำดับคำถามในแบบประเมิน (ดูคำอธิบายในรายงานคะแนนรายด้าน)',
    rows: groups.map((g) => [periodLabel[kind](g.key), g.n, ...g.aspects.map((a) => f2(a.avg)), f2(g.overall), f1(g.pct), levelOf(g.overall)]) };
}
export const rawSheet = (rows) => ({ name: 'ข้อมูลแบบประเมิน', head: ['วันที่', 'เวลา', 'ประเภทบริการ', 'หมู่บ้าน', ...QUESTIONS.map((q) => q.s), 'ประทับใจ', 'ควรปรับปรุง', 'ข้อเสนอแนะเพิ่มเติม'],
  rows: [...rows].sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time)).map((r) => [fmtDate(r.day), r.time, r.service, r.village, ...QK.map((k) => r[k]), r.good || '', r.improve || '', r.other || '']) });

export async function downloadXlsx(sheets, filename) {
  const XLSX = await import('xlsx'); const wb = XLSX.utils.book_new();
  sheets.forEach((sh) => {
    const ws = XLSX.utils.aoa_to_sheet([sh.head, ...sh.rows]);
    ws['!cols'] = sh.head.map((h, i) => ({ wch: Math.min(60, Math.max(String(h).length * 1.6, ...sh.rows.slice(0, 200).map((r) => String(r[i] ?? '').length * 1.3), 8)) }));
    XLSX.utils.book_append_sheet(wb, ws, sh.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  });
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
export function downloadCsv(sheet, filename) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const blob = new Blob(['﻿' + [sheet.head, ...sheet.rows].map((r) => r.map(esc).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${filename}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const AL = { l: 'left', r: 'right', c: 'center' };
const tbl = (r) => `<table><thead><tr>${r.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${r.rows.map((row) => `<tr>${row.map((c, i) => `<td style="text-align:${AL[r.align?.[i]] || 'left'}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

// รายงานฉบับพิมพ์/PDF: หัวหน่วยงาน ช่วงเวลา จำนวนผู้ตอบ คะแนนเฉลี่ย/ร้อยละ ตาราง 6 ด้าน กราฟ ข้อเสนอแนะ วันที่ออกรายงาน
export function openReportWindow({ rows, periodText, filterText, charts, autoPrint }) {
  const s = summarize(rows); const asp = buildReport('aspect', rows); const sug = buildReport('suggest', rows);
  const today = fmtDate(new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10));
  const sugHtml = sug.rows.length ? sug.rows.map((r) => `<div class="sg"><div class="meta">${esc(r[0])} ${esc(r[1])} · ${esc(r[2])} · ${esc(r[3])}</div>${[['ประทับใจ', r[4]], ['ควรปรับปรุง', r[5]], ['ข้อเสนอแนะเพิ่มเติม', r[6]]].filter((x) => x[1]).map((x) => `<div><b>${x[0]}:</b> ${esc(x[1])}</div>`).join('')}</div>`).join('') : `<p class="mute">${NO_DATA}</p>`;
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>รายงานผลการประเมินความพึงพอใจ</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">
<style>@page{size:A4;margin:16mm 14mm}body{font-family:'TH SarabunPSK','THSarabunPSK','TH Sarabun New','Sarabun',Tahoma,sans-serif;font-size:15pt;line-height:1.3;color:#111;max-width:182mm;margin:0 auto;padding:6mm}
.bar{position:sticky;top:0;background:#0369a1;color:#fff;padding:8px 12px;margin:-6mm -6mm 6mm;font:14px Tahoma,sans-serif}.bar button{margin-left:10px;padding:4px 12px}
h1{font-size:21pt;text-align:center;margin:0}.org{text-align:center;font-size:17pt;font-weight:700;color:#075985}h2{font-size:17pt;border-bottom:2px solid #0ea5a4;margin:6mm 0 2mm;padding-bottom:1mm;color:#075985}
.kpi{display:flex;gap:4mm;margin:3mm 0}.kpi div{flex:1;border:1px solid #94a3b8;border-radius:3mm;padding:2mm;text-align:center}.kpi b{display:block;font-size:22pt;color:#0369a1}
table{border-collapse:collapse;width:100%;margin:2mm 0}th,td{border:1px solid #333;padding:1mm 2mm;font-size:13.5pt;vertical-align:top}th{background:#e0f2fe}tr{page-break-inside:avoid}
img{max-width:100%;margin:2mm 0;page-break-inside:avoid}.sg{border-left:3px solid #0ea5a4;padding:1mm 3mm;margin:2mm 0;page-break-inside:avoid;font-size:13.5pt}.meta{color:#475569;font-size:12pt}.mute{color:#64748b}.foot{margin-top:8mm;text-align:right}
@media print{.bar{display:none}body{padding:0;max-width:none}}</style></head><body>
<div class="bar">ตัวอย่างรายงาน <button onclick="window.print()">พิมพ์ / บันทึกเป็น PDF</button> <span>(เลือกปลายทาง “บันทึกเป็น PDF” และปิดส่วนหัว-ท้ายกระดาษ)</span></div>
<div class="org">${ORG}</div><h1>รายงานผลการประเมินความพึงพอใจของผู้รับบริการ</h1>
<p style="text-align:center;margin:1mm 0">ช่วงเวลาที่ประเมิน: ${esc(periodText)}${filterText ? ` · ${esc(filterText)}` : ''}</p>
<h2>1. สรุปภาพรวม</h2>
<div class="kpi"><div><b>${s.n ? s.n.toLocaleString('th-TH') : '0'}</b>จำนวนผู้ตอบ (ราย)</div><div><b>${s.overall == null ? '-' : s.overall.toFixed(2)}</b>คะแนนเฉลี่ย (เต็ม 5)${s.overall == null ? '' : `<br>ระดับ${levelOf(s.overall)}`}</div><div><b>${s.pct == null ? '-' : s.pct.toFixed(1) + '%'}</b>ร้อยละความพึงพอใจ</div><div><b>${s.comments}</b>ผู้ให้ข้อเสนอแนะ (ราย)</div></div>
${s.n ? '' : `<p class="mute">${NO_DATA}ในช่วงเวลาและเงื่อนไขที่เลือก</p>`}
<h2>2. คะแนนรายด้าน</h2>${tbl(asp)}<p class="mute" style="font-size:12pt">ร้อยละความพึงพอใจ = จำนวนคะแนน 4 และ 5 ÷ จำนวนคะแนนทั้งหมด × 100 · เกณฑ์ระดับ: 4.51–5.00 มากที่สุด, 3.51–4.50 มาก, 2.51–3.50 ปานกลาง, 1.51–2.50 น้อย, 1.00–1.50 น้อยที่สุด</p>
<h2>3. กราฟสรุปผล</h2>${(charts || []).map((c) => `<img src="${c.data}">`).join('')}
<h2>4. ข้อเสนอแนะจากประชาชน (${sug.rows.length} ราย)</h2>${sugHtml}
<div class="foot">วันที่ออกรายงาน ${today}</div>${autoPrint ? '<script>window.onload=function(){setTimeout(function(){window.print()},900)}</script>' : ''}</body></html>`;
  const w = window.open('', '_blank'); if (!w) return false; w.document.open(); w.document.write(html); w.document.close(); return true;
}
