// ส่งออกรายงาน: PDF (เปิดหน้าพิมพ์ A4 แล้วเลือก "บันทึกเป็น PDF") และ Word (.docx)
import { EMPTY } from './reportBuild';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const AL = { l: 'left', r: 'right', c: 'center' };

export function toHtml(blocks, title) {
  const body = blocks.map((b) => {
    switch (b.t) {
      case 'title': return `<div class="cover"><div class="org">รายงานการสอบสวนโรคฉบับสมบูรณ์</div><h1 class="ttl">${esc(b.sub)}</h1>${b.lines.map((l) => `<div>${esc(l)}</div>`).join('')}</div>`;
      case 'h1': return `<h2 class="h1">${esc(b.text)}</h2>`;
      case 'h2': return `<h3 class="h2">${esc(b.text)}</h3>`;
      case 'h3': return `<h4 class="h3">${esc(b.text)}</h4>`;
      case 'p': return `<p class="${b.missing ? 'miss' : ''}">${esc(b.text)}</p>`;
      case 'cap': return `<div class="cap">${esc(b.text)}</div>`;
      case 'img': return `<figure><img src="${b.data}" style="max-width:100%"/><figcaption>${esc(b.caption)}</figcaption></figure>`;
      case 'pb': return '<div style="page-break-after:always"></div>';
      case 'table': return `<table class="${b.small ? 'sm' : ''}"><thead><tr>${b.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c, i) => `<td style="text-align:${AL[b.align?.[i]] || 'left'}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      default: return '';
    }
  }).join('\n');
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">
<style>@page{size:A4;margin:18mm 16mm}body{font-family:'Sarabun','TH Sarabun New',Tahoma,sans-serif;font-size:14pt;line-height:1.45;color:#111;max-width:180mm;margin:0 auto;padding:8mm}
.bar{position:sticky;top:0;background:#0f766e;color:#fff;padding:8px 12px;margin:-8mm -8mm 8mm;font:14px Tahoma,sans-serif}.bar button{margin-left:12px;padding:4px 12px}
.cover{text-align:center;padding:30mm 0 12mm;border-bottom:2px solid #111;margin-bottom:8mm}.org{font-size:16pt}.ttl{font-size:22pt;margin:6mm 0}
.h1{font-size:17pt;margin:8mm 0 2mm;border-bottom:1px solid #999}.h2{font-size:15pt;margin:5mm 0 1mm}.h3{font-size:14pt;margin:3mm 0 1mm}p{margin:1.5mm 0;text-align:justify;text-indent:10mm}.miss{color:#b45309;font-style:italic}
table{border-collapse:collapse;width:100%;margin:2mm 0 4mm;page-break-inside:auto}tr{page-break-inside:avoid}th,td{border:1px solid #333;padding:1.5mm 2mm;vertical-align:top;font-size:13pt}th{background:#e5e7eb}table.sm th,table.sm td{font-size:10.5pt;padding:1mm}
.cap{font-weight:700;margin-top:3mm}figure{margin:3mm 0;text-align:center}figcaption{font-size:12pt}@media print{.bar{display:none}body{padding:0;max-width:none}}</style></head>
<body><div class="bar">ตัวอย่างรายงาน — <button onclick="window.print()">พิมพ์ / บันทึกเป็น PDF</button> <span>(ในหน้าต่างพิมพ์เลือกปลายทาง “บันทึกเป็น PDF” และปิด “ส่วนหัวและท้ายกระดาษ”)</span></div>${body}</body></html>`;
}

export function openPrint(blocks, title) {
  const w = window.open('', '_blank'); if (!w) return false;
  w.document.open(); w.document.write(toHtml(blocks, title)); w.document.close();
  return true;
}

const dataToBytes = (url) => { const bin = atob(url.split(',')[1]); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };

export async function downloadDocx(blocks, filename) {
  const D = await import('docx');
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, ImageRun, PageBreak, Footer, PageNumber, ShadingType } = D;
  const FONT = 'Tahoma';
  const run = (text, o = {}) => new TextRun({ text, font: FONT, ...o });
  const P = (text, o = {}) => new Paragraph({ spacing: { after: 100, line: 300 }, ...o, children: [run(text, o.run)] });
  const AA = { l: AlignmentType.LEFT, r: AlignmentType.RIGHT, c: AlignmentType.CENTER };
  const out = [];
  for (const b of blocks) {
    if (b.t === 'title') {
      out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1800, after: 200 }, children: [run('รายงานการสอบสวนโรคฉบับสมบูรณ์', { size: 32 })] }));
      out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [run(b.sub, { size: 44, bold: true })] }));
      b.lines.forEach((l) => out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [run(l, { size: 24 })] })));
      out.push(new Paragraph({ children: [new PageBreak()] }));
    } else if (b.t === 'h1') out.push(new Paragraph({ spacing: { before: 360, after: 120 }, border: { bottom: { style: 'single', size: 6, color: '999999', space: 1 } }, children: [run(b.text, { size: 30, bold: true })] }));
    else if (b.t === 'h2') out.push(new Paragraph({ spacing: { before: 240, after: 80 }, keepNext: true, children: [run(b.text, { size: 26, bold: true })] }));
    else if (b.t === 'h3') out.push(new Paragraph({ spacing: { before: 160, after: 60 }, keepNext: true, children: [run(b.text, { size: 24, bold: true })] }));
    else if (b.t === 'p') out.push(P(b.text, { alignment: AlignmentType.THAI_DISTRIBUTE, indent: { firstLine: 567 }, run: b.missing ? { italics: true, color: 'B45309', size: 22 } : { size: 22 } }));
    else if (b.t === 'cap') out.push(new Paragraph({ spacing: { before: 120, after: 60 }, keepNext: true, children: [run(b.text, { size: 22, bold: true })] }));
    else if (b.t === 'pb') out.push(new Paragraph({ children: [new PageBreak()] }));
    else if (b.t === 'img') {
      const w = 560; const h = Math.round((w * b.h) / b.w);
      out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 100 }, children: [new ImageRun({ type: 'png', data: dataToBytes(b.data), transformation: { width: w, height: h } })] }));
      out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [run(b.caption, { size: 20 })] }));
    } else if (b.t === 'table') {
      const sz = b.small ? 17 : 21;
      const cell = (txt, i, head) => new TableCell({ shading: head ? { type: ShadingType.CLEAR, fill: 'E5E7EB', color: 'auto' } : undefined, margins: { top: 40, bottom: 40, left: 70, right: 70 }, children: [new Paragraph({ alignment: head ? AlignmentType.CENTER : AA[b.align?.[i]] || AlignmentType.LEFT, children: [run(String(txt ?? ''), { size: sz, bold: head })] })] });
      out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ tableHeader: true, cantSplit: true, children: b.head.map((h, i) => cell(h, i, true)) }), ...b.rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, i, false)) }))] }));
      out.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
    }
  }
  const doc = new Document({
    creator: 'ระบบบริหารงานภายใน รพ.สต.บ้านหนองสนม', title: filename,
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run('หน้า ', { size: 18 }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18 })] })] }) },
      children: out }],
  });
  const blob = await Packer.toBlob(doc);
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${filename}.docx`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
export { EMPTY };
