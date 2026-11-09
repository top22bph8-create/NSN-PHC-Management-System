// คำนวณงบประมาณตามหมวด: งบรวม = ตั้งต้นปี + เพิ่มยอด + ปรับปรุง(±) + โอนเข้า − โอนออก ; เบิกจ่าย = มูลค่าตั้งเบิกตามฎีกาที่ระบุหมวดนั้น ; คงเหลือ = งบรวม − เบิกจ่าย
// คอลเลกชัน budgetEntries: { fy, cat(id), type, amount, date, note, transferId?, otherCat?, createdBy }
import { ALL_CATS, BUDGET_CATS, EXTRA_CATS, catByName } from '../config/budgetCats';
import { BUDGET_SUBS, hasSubs, subByName, subsOf } from '../config/budgetSubs';

export const ENTRY_TYPES = { initial: 'ตั้งยอดต้นปีงบประมาณ', add: 'เพิ่มยอด', adjust: 'ปรับปรุงยอด', transferIn: 'โอนเข้า (ย้ายมาจากหมวดอื่น)', transferOut: 'โอนออก (ย้ายไปหมวดอื่น)' };
export const entrySign = (e) => (e.type === 'transferOut' ? -Number(e.amount || 0) : Number(e.amount || 0)); // adjust เก็บเป็นค่าติดลบได้เอง
export const deekaAmount = (d) => Number(d.amount) || 0;

export function computeBudget(entries, deekas) {
  const blank = () => ({ initial: 0, add: 0, adjust: 0, tin: 0, tout: 0, total: 0, spent: 0, n: 0, remain: 0, pct: null });
  const out = {}; ALL_CATS.forEach((c) => { out[c.id] = blank(); });
  const bySub = {}; BUDGET_SUBS.forEach((s) => { bySub[s.id] = blank(); });
  let legacy = 0; // รายการระดับหมวดใหญ่ 1–10 แบบเดิม (ไม่มีหมวดย่อย) — ไม่นำมาคำนวณ
  const apply = (o, e) => { const a = Number(e.amount) || 0; if (e.type === 'initial') o.initial += a; else if (e.type === 'add') o.add += a; else if (e.type === 'adjust') o.adjust += a; else if (e.type === 'transferIn') o.tin += a; else if (e.type === 'transferOut') o.tout += a; };
  entries.forEach((e) => {
    if (e.sub) { if (bySub[e.sub]) apply(bySub[e.sub], e); return; }
    if (hasSubs(e.cat)) { legacy += 1; return; }
    if (out[e.cat]) apply(out[e.cat], e);
  });
  const fin = (o) => { o.total = o.initial + o.add + o.adjust + o.tin - o.tout; o.remain = o.total - o.spent; o.pct = o.total > 0 ? (o.spent / o.total) * 100 : null; };
  deekas.forEach((d) => {
    const c = catByName(d.budgetCat); if (!c) return; const a = deekaAmount(d);
    out[c.id].spent += a; out[c.id].n += 1;
    const sb = hasSubs(c.id) ? subByName(c.id, d.budgetSub) : null;
    if (sb) { bySub[sb.id].spent += a; bySub[sb.id].n += 1; }
  });
  BUDGET_SUBS.forEach((s) => fin(bySub[s.id]));
  // หมวดใหญ่ที่มีหมวดย่อย: งบ = ผลรวมของหมวดย่อย; เบิกจ่าย = ฎีกาทั้งหมดของหมวดนั้น (รวมฎีกาที่ยังไม่ระบุหมวดย่อย)
  BUDGET_CATS.filter((c) => hasSubs(c.id)).forEach((c) => { const o = out[c.id]; ['initial', 'add', 'adjust', 'tin', 'tout'].forEach((k) => { o[k] = subsOf(c.id).reduce((a, x) => a + bySub[x.id][k], 0); }); });
  ALL_CATS.forEach((c) => fin(out[c.id]));
  const mk = () => ({ initial: 0, add: 0, adjust: 0, tin: 0, tout: 0, total: 0, spent: 0, remain: 0, n: 0, pct: null });
  const sums = { main: mk(), other: mk(), all: mk(), extra: mk() };
  BUDGET_CATS.forEach((c) => ['all', c.g].forEach((g) => Object.keys(sums[g]).forEach((k) => { if (k !== 'pct') sums[g][k] += out[c.id][k]; })));
  EXTRA_CATS.forEach((c) => Object.keys(sums.extra).forEach((k) => { if (k !== 'pct') sums.extra[k] += out[c.id][k]; })); // รายจ่ายอื่น: ใช้เฉพาะ spent / n
  Object.values(sums).forEach((x) => { x.pct = x.total > 0 ? (x.spent / x.total) * 100 : null; });
  const sum = sums.all;
  return { byCat: out, bySub, legacy, sum, sums };
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

// สรุปรายจ่ายตามฎีกาแยกเดือนของปีงบประมาณ (ต.ค.→ก.ย.) และแยกกลุ่ม: main=หมวด1-10, other=หมวด11-13, x01/x02/x03=รายจ่ายอื่น, none=ยังไม่ระบุหมวด
export const FY_MONTHS = [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9];
export const GROUP_KEYS = ['main', 'other', 'x01', 'x02', 'x03', 'none'];
export function groupOfDeeka(d) { const c = catByName(d.budgetCat); if (!c) return 'none'; return c.g === 'extra' ? c.id : c.g; }
export function monthlySpend(deekas) {
  const rows = FY_MONTHS.map((m) => ({ m, main: 0, other: 0, x01: 0, x02: 0, x03: 0, none: 0, total: 0 }));
  deekas.forEach((d) => { const m = Number(String(d.deekaDate || '').slice(5, 7)); const r = rows.find((x) => x.m === m); if (!r) return; const a = deekaAmount(d); r[groupOfDeeka(d)] += a; r.total += a; });
  const tot = { m: 0, main: 0, other: 0, x01: 0, x02: 0, x03: 0, none: 0, total: 0 };
  rows.forEach((r) => GROUP_KEYS.concat('total').forEach((k) => { tot[k] += r[k]; }));
  return { rows, tot };
}
// สรุปรายปีงบประมาณ (ทุกปีที่มีฎีกา) แยกกลุ่มเดียวกัน
export function yearlySpend(allDeekas) {
  const by = {};
  allDeekas.forEach((d) => { const y = d.fy; if (!y) return; const r = (by[y] ||= { fy: y, main: 0, other: 0, x01: 0, x02: 0, x03: 0, none: 0, total: 0 }); const a = deekaAmount(d); r[groupOfDeeka(d)] += a; r.total += a; });
  return Object.values(by).sort((a, b) => b.fy - a.fy);
}
