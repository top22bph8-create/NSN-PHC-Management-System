// วาดกราฟเป็นภาพ PNG ด้วย canvas (ใช้ทั้งบนหน้า Dashboard และใน PDF ให้ตรงกัน) — โทนฟ้า/เขียว ตัวอักษร Sarabun
const FONT = "Sarabun, 'TH SarabunPSK', Tahoma, sans-serif";
export const C = { blue: '#1d6fb8', green: '#2f9e6b', grid: '#e2e8f0', ink: '#1e293b', mute: '#64748b' };
export async function loadFonts() { try { await Promise.all([document.fonts.load(`400 16px Sarabun`), document.fonts.load(`700 16px Sarabun`)]); } catch { /* ใช้ฟอนต์สำรอง */ } }
const mk = (w, h) => { const c = document.createElement('canvas'); const s = 2; c.width = w * s; c.height = h * s; const g = c.getContext('2d'); g.scale(s, s); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); return { c, g, w, h }; };
const out = (o, title) => ({ data: o.c.toDataURL('image/png'), w: o.w, h: o.h, title });
const wrap = (g, text, max) => { const out = []; let line = ''; for (const ch of String(text)) { if (g.measureText(line + ch).width > max && line) { out.push(line); line = ch; } else line += ch; } if (line) out.push(line); return out; };

// กราฟแท่งแนวนอน: items=[{label,value,text?}], max = ค่าสูงสุดของแกน (เช่น 5)
export function hbarPng(items, { title, max = 5, color = C.blue, w = 900, fmt = (v) => v.toFixed(2) } = {}) {
  const rowH = 52; const top = title ? 44 : 14; const h = top + items.length * rowH + 16; const o = mk(w, h); const { g } = o;
  g.font = `700 20px ${FONT}`; g.fillStyle = C.ink; g.textAlign = 'left'; if (title) g.fillText(title, 16, 28);
  const lw = 300; const x0 = lw + 20; const bw = w - x0 - 80;
  items.forEach((it, i) => {
    const y = top + i * rowH; g.font = `400 16px ${FONT}`; g.fillStyle = C.ink; g.textAlign = 'left';
    const lines = wrap(g, it.label, lw).slice(0, 2); lines.forEach((l, j) => g.fillText(l, 16, y + 22 + (lines.length === 2 ? j * 18 - 8 : 0)));
    g.fillStyle = '#eef2f7'; g.fillRect(x0, y + 12, bw, 24);
    if (it.value != null && max) { g.fillStyle = it.color || color; g.fillRect(x0, y + 12, Math.max(2, (it.value / max) * bw), 24); }
    g.fillStyle = C.ink; g.font = `700 16px ${FONT}`; g.fillText(it.value == null ? '-' : (it.text || fmt(it.value)), x0 + bw + 8, y + 30);
  });
  return out(o, title);
}
// กราฟเส้น/แท่ง รายช่วงเวลา: points=[{label,value}]; type 'line' | 'bar'
export function seriesPng(points, { title, type = 'line', min = 0, max, color = C.blue, w = 900, h = 360, fmt = (v) => String(v) } = {}) {
  const o = mk(w, h); const { g } = o; const L = 56; const R = 20; const T = title ? 48 : 20; const B = 62; const pw = w - L - R; const ph = h - T - B;
  g.font = `700 20px ${FONT}`; g.fillStyle = C.ink; g.textAlign = 'left'; if (title) g.fillText(title, 16, 30);
  const vals = points.map((p) => p.value).filter((v) => v != null); const hi = max ?? Math.max(1, ...vals); const lo = min; const span = hi - lo || 1;
  g.font = `400 13px ${FONT}`; g.textAlign = 'right'; g.strokeStyle = C.grid; g.fillStyle = C.mute;
  for (let i = 0; i <= 4; i++) { const v = lo + (span * i) / 4; const y = T + ph - (ph * i) / 4; g.beginPath(); g.moveTo(L, y); g.lineTo(w - R, y); g.stroke(); g.fillText(fmt(Number.isInteger(v) ? v : +v.toFixed(1)), L - 8, y + 4); }
  if (!points.length) { g.textAlign = 'center'; g.fillStyle = C.mute; g.font = `400 18px ${FONT}`; g.fillText('ยังไม่มีข้อมูล', L + pw / 2, T + ph / 2); return out(o, title); }
  const step = pw / points.length; const every = Math.max(1, Math.ceil(points.length / 12));
  const xy = (p, i) => [L + step * i + step / 2, T + ph - (((p.value ?? lo) - lo) / span) * ph];
  if (type === 'bar') points.forEach((p, i) => { if (p.value == null) return; const [x, y] = xy(p, i); g.fillStyle = color; g.fillRect(x - Math.min(step * 0.35, 22), y, Math.min(step * 0.7, 44), T + ph - y); g.fillStyle = C.ink; g.font = `700 13px ${FONT}`; g.textAlign = 'center'; g.fillText(fmt(p.value), x, y - 5); });
  else { g.strokeStyle = color; g.lineWidth = 3; g.beginPath(); let st = false; points.forEach((p, i) => { if (p.value == null) return; const [x, y] = xy(p, i); if (!st) { g.moveTo(x, y); st = true; } else g.lineTo(x, y); }); g.stroke();
    points.forEach((p, i) => { if (p.value == null) return; const [x, y] = xy(p, i); g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); g.stroke(); g.fillStyle = C.ink; g.font = `700 13px ${FONT}`; g.textAlign = 'center'; g.fillText(fmt(p.value), x, y - 10); }); g.lineWidth = 1; }
  g.fillStyle = C.mute; g.font = `400 13px ${FONT}`; g.textAlign = 'center';
  points.forEach((p, i) => { if (i % every) return; const [x] = xy(p, i); g.save(); g.translate(x, T + ph + 16); g.rotate(points.length > 6 ? -Math.PI / 6 : 0); g.textAlign = points.length > 6 ? 'right' : 'center'; g.fillText(p.label, 0, 0); g.restore(); });
  return out(o, title);
}
