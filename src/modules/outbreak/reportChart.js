// วาด Epidemic curve เป็นภาพ PNG (ใช้ทั้งหน้าพิมพ์ PDF และไฟล์ Word)
const sd = (iso) => { const [, m, d] = iso.split('-'); return `${Number(d)}/${Number(m)}`; };
export function curvePng(rows, title = 'จำนวนผู้ป่วยตามวันเริ่มป่วย') {
  if (!rows || !rows.length || typeof document === 'undefined') return null;
  const W = 900; const H = 400; const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  const L = 60; const R = 20; const T = 40; const B = 70; const pw = W - L - R; const ph = H - T - B;
  const max = Math.max(1, ...rows.map((r) => r.n)); const step = max <= 5 ? 1 : max <= 12 ? 2 : Math.ceil(max / 6); const top = Math.ceil(max / step) * step;
  g.font = '16px Tahoma, Sarabun, sans-serif'; g.fillStyle = '#111'; g.textAlign = 'center'; g.fillText(title, W / 2, 24);
  g.strokeStyle = '#ccc'; g.fillStyle = '#333'; g.textAlign = 'right'; g.font = '13px Tahoma, Sarabun, sans-serif';
  for (let v = 0; v <= top; v += step) { const y = T + ph - (v / top) * ph; g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke(); g.fillText(String(v), L - 8, y + 4); }
  const bw = pw / rows.length; const every = Math.max(1, Math.ceil(rows.length / 16));
  rows.forEach((r, i) => { const x = L + i * bw; const h = (r.n / top) * ph; g.fillStyle = '#b91c1c'; g.fillRect(x + bw * 0.1, T + ph - h, bw * 0.8, h); g.strokeStyle = '#fff'; g.strokeRect(x + bw * 0.1, T + ph - h, bw * 0.8, h);
    if (i % every === 0) { g.save(); g.translate(x + bw / 2, T + ph + 14); g.rotate(-Math.PI / 4); g.fillStyle = '#333'; g.textAlign = 'right'; g.fillText(sd(r.d), 0, 0); g.restore(); } });
  g.strokeStyle = '#111'; g.beginPath(); g.moveTo(L, T); g.lineTo(L, T + ph); g.lineTo(W - R, T + ph); g.stroke();
  g.fillStyle = '#111'; g.textAlign = 'center'; g.fillText('วัน/เดือนที่เริ่มป่วย', L + pw / 2, H - 8);
  g.save(); g.translate(16, T + ph / 2); g.rotate(-Math.PI / 2); g.fillText('จำนวนผู้ป่วย (ราย)', 0, 0); g.restore();
  return { data: c.toDataURL('image/png'), w: W, h: H };
}
