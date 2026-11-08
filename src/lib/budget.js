// คำนวณงบประมาณตามหมวด: งบรวม = ตั้งต้นปี + เพิ่มยอด + ปรับปรุง(±) + โอนเข้า − โอนออก ; เบิกจ่าย = มูลค่าตั้งเบิกตามฎีกาที่ระบุหมวดนั้น ; คงเหลือ = งบรวม − เบิกจ่าย
// คอลเลกชัน budgetEntries: { fy, cat(id), type, amount, date, note, transferId?, otherCat?, createdBy }
import { BUDGET_CATS } from '../config/budgetCats';

export const ENTRY_TYPES = { initial: 'ตั้งยอดต้นปีงบประมาณ', add: 'เพิ่มยอด', adjust: 'ปรับปรุงยอด', transferIn: 'โอนเข้า (ย้ายมาจากหมวดอื่น)', transferOut: 'โอนออก (ย้ายไปหมวดอื่น)' };
export const entrySign = (e) => (e.type === 'transferOut' ? -Number(e.amount || 0) : Number(e.amount || 0)); // adjust เก็บเป็นค่าติดลบได้เอง
export const deekaAmount = (d) => Number(d.amount) || 0;

export function computeBudget(entries, deekas) {
  const out = {}; BUDGET_CATS.forEach((c) => { out[c.id] = { initial: 0, add: 0, adjust: 0, tin: 0, tout: 0, total: 0, spent: 0, n: 0, remain: 0, pct: null }; });
  entries.forEach((e) => { const o = out[e.cat]; if (!o) return; const a = Number(e.amount) || 0;
    if (e.type === 'initial') o.initial += a; else if (e.type === 'add') o.add += a; else if (e.type === 'adjust') o.adjust += a; else if (e.type === 'transferIn') o.tin += a; else if (e.type === 'transferOut') o.tout += a; });
  deekas.forEach((d) => { const c = BUDGET_CATS.find((x) => x.name === d.budgetCat); if (!c) return; out[c.id].spent += deekaAmount(d); out[c.id].n += 1; });
  BUDGET_CATS.forEach((c) => { const o = out[c.id]; o.total = o.initial + o.add + o.adjust + o.tin - o.tout; o.remain = o.total - o.spent; o.pct = o.total > 0 ? (o.spent / o.total) * 100 : null; });
  const sum = { initial: 0, add: 0, adjust: 0, tin: 0, tout: 0, total: 0, spent: 0, remain: 0, n: 0 };
  Object.values(out).forEach((o) => Object.keys(sum).forEach((k) => { sum[k] += o[k]; }));
  sum.pct = sum.total > 0 ? (sum.spent / sum.total) * 100 : null;
  return { byCat: out, sum };
}
export const money = (n) => (n == null || !isFinite(n) ? '-' : Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

// เปิดหน้าพิมพ์/PDF (A4) จาก HTML เนื้อหา
export function openPrint(title, bodyHtml, landscape = false) {
  const w = window.open('', '_blank'); if (!w) return false;
  w.document.open();
  w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${title}</title><link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">
<style>@page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:14mm}body{font-family:'TH SarabunPSK','THSarabunPSK','TH Sarabun New','Sarabun',Tahoma,sans-serif;font-size:15pt;line-height:1.3;color:#111;padding:6mm}
.bar{position:sticky;top:0;background:#047857;color:#fff;padding:8px 12px;margin:-6mm -6mm 6mm;font:14px Tahoma,sans-serif}.bar button{margin-left:10px;padding:4px 12px}
h1{font-size:19pt;text-align:center;margin:0}h2{font-size:16pt;text-align:center;margin:0 0 3mm;font-weight:400}table{border-collapse:collapse;width:100%;margin:2mm 0}th,td{border:1px solid #333;padding:1mm 2mm;font-size:13.5pt;vertical-align:top}th{background:#d1fae5}tr{page-break-inside:avoid}.r{text-align:right}.c{text-align:center}.tot td{font-weight:700;background:#f1f5f9}.neg{color:#b91c1c}.foot{margin-top:6mm;font-size:12pt;color:#475569}
@media print{.bar{display:none}body{padding:0}}</style></head><body><div class="bar">ตัวอย่างรายงาน <button onclick="window.print()">พิมพ์ / บันทึกเป็น PDF</button></div>${bodyHtml}</body></html>`);
  w.document.close(); return true;
}
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
