// พิมพ์รายชื่อกลุ่มเป้าหมาย NCD (ทำแล้ว / ยังไม่ทำ) เป็นตารางหน้า A4 แนวนอน — บันทึกเป็น PDF ได้จากหน้าต่างพิมพ์
import { escH } from './surveyPrint';

export function openNcdRosterPrint({ title, sub, head, rows, widths }) {
  const w = window.open('', '_blank');
  if (!w) { window.alert('เบราว์เซอร์บล็อกหน้าต่างใหม่ — กรุณาอนุญาตป๊อปอัปสำหรับเว็บนี้แล้วลองอีกครั้ง'); return; }
  let logo = ''; try { logo = new URL('logo.png', document.baseURI).href; } catch { /* ไม่มีโลโก้ก็พิมพ์ได้ */ }
  const colg = widths ? `<colgroup>${widths.map((x) => `<col style="width:${x}%">`).join('')}</colgroup>` : '';
  const body = rows.map((r, i) => `<tr>${[i + 1, ...r].map((c, j) => `<td class="${j === 0 ? 'c' : ''}">${escH(c)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${head.length + 1}" class="c">ไม่มีรายการ</td></tr>`;
  w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${escH(title)}</title><style>
@page{size:A4 landscape;margin:10mm}
*{box-sizing:border-box}body{margin:0;font-family:'Sarabun','Noto Sans Thai',Tahoma,sans-serif;color:#111;font-size:12.5px}
.hd{display:flex;align-items:center;gap:10px;margin-bottom:6px}.hd img{height:42px}.hd h1{margin:0;font-size:18px}.hd p{margin:0;color:#444;font-size:12px}
table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #444;padding:3px 5px;vertical-align:middle;overflow-wrap:anywhere}
th{background:#e8eef5;font-size:12px}thead{display:table-header-group}tr{page-break-inside:avoid}.c{text-align:center}
.ft{margin-top:6px;font-size:11px;color:#555}
</style></head><body><div class="hd">${logo ? `<img src="${escH(logo)}" alt="">` : ''}<div><h1>${escH(title)}</h1><p>${escH(sub || '')}</p></div></div>
<table>${colg}<thead><tr><th>ที่</th>${head.map((h) => `<th>${escH(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>
<div class="ft">รวม ${rows.length} ราย · พิมพ์จากระบบ รพ.สต.บ้านหนองสนม · เลขบัตรแสดงแบบปิดบัง</div>
<script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script></body></html>`);
  w.document.close();
}
