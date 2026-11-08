// QR Code แบบประเมิน: ลิงก์จริงของเว็บแอป · ดาวน์โหลด PNG · ป้ายประชาสัมพันธ์ A4 (PNG/พิมพ์) · คัดลอกลิงก์
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Download, Printer } from 'lucide-react';
import logoUrl from '../../assets/logo.png';
import { loadFonts } from './surveyCharts';

export const surveyUrl = () => `${window.location.origin}${window.location.pathname}#/satisfaction`;
const FONT = "Sarabun, 'TH SarabunPSK', Tahoma, sans-serif";
const img = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
const center = (g, t, y, size, color, weight = 700) => { g.font = `${weight} ${size}px ${FONT}`; g.fillStyle = color; g.textAlign = 'center'; g.fillText(t, 1240, y); };

// ป้าย A4 แนวตั้ง 2480×3508 px (300 dpi) — โทนฟ้า-ขาว-เขียว
export async function posterPng(url) {
  await loadFonts();
  const W = 2480; const H = 3508; const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#0b6fb8'); bg.addColorStop(0.55, '#16a3a0'); bg.addColorStop(1, '#3fb97a'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.globalAlpha = 0.12; g.fillStyle = '#fff'; g.beginPath(); g.arc(2300, 200, 700, 0, 7); g.fill(); g.beginPath(); g.arc(120, 3300, 800, 0, 7); g.fill(); g.globalAlpha = 1;
  g.fillStyle = '#fff'; rr(g, 150, 150, W - 300, H - 300, 120); g.fill();
  const band = g.createLinearGradient(150, 0, W - 150, 0); band.addColorStop(0, '#0b6fb8'); band.addColorStop(1, '#3fb97a'); g.fillStyle = band; rr(g, 150, 150, W - 300, 560, 120); g.fill(); g.fillRect(150, 400, W - 300, 310);
  const logo = await img(logoUrl); if (logo) { g.fillStyle = '#fff'; g.beginPath(); g.arc(1240, 330, 190, 0, 7); g.fill(); g.drawImage(logo, 1240 - 160, 330 - 160, 320, 320); }
  center(g, 'โรงพยาบาลส่งเสริมสุขภาพตำบลบ้านหนองสนม', 640, 92, '#fff');
  center(g, 'ร่วมประเมินความพึงพอใจ', 1000, 190, '#0b5a96', 800); center(g, 'ในการรับบริการ', 1200, 190, '#0b5a96', 800);
  const qr = await QRCode.toDataURL(url, { width: 1400, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0a4f86', light: '#ffffff' } }); const qi = await img(qr);
  g.lineWidth = 28; g.strokeStyle = '#2fa36b'; rr(g, 640, 1330, 1200, 1200, 70); g.stroke(); g.fillStyle = '#fff'; rr(g, 640, 1330, 1200, 1200, 70); g.fill();
  if (qi) g.drawImage(qi, 690, 1380, 1100, 1100);
  center(g, 'เพียงสแกน QR Code', 2740, 130, '#0b5a96'); center(g, 'ใช้เวลาเพียง 1–2 นาที', 2890, 110, '#1f8a5b');
  center(g, 'ทุกความคิดเห็นของท่าน', 3050, 84, '#334155', 600); center(g, 'มีส่วนร่วมในการพัฒนาคุณภาพบริการ', 3145, 84, '#334155', 600);
  center(g, 'รพ.สต.บ้านหนองสนม', 3280, 70, '#0b6fb8');
  return new Promise((res) => c.toBlob((b) => res({ blob: b, url: URL.createObjectURL(b) }), 'image/png'));
}
const save = (href, name) => { const a = document.createElement('a'); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove(); };

export default function SurveyQr({ say }) {
  const url = surveyUrl(); const local = /localhost|127\.0\.0\.1|^file:/.test(window.location.href);
  const [qr, setQr] = useState(''); const [poster, setPoster] = useState(null); const [busy, setBusy] = useState(false);
  useEffect(() => { QRCode.toDataURL(url, { width: 900, margin: 2, errorCorrectionLevel: 'M' }).then(setQr); }, [url]);
  const copy = async () => { try { await navigator.clipboard.writeText(url); say('คัดลอกลิงก์แล้ว'); } catch { window.prompt('คัดลอกลิงก์นี้', url); } };
  const makePoster = async () => { setBusy(true); try { const p = await posterPng(url); setPoster(p); return p; } finally { setBusy(false); } };
  const dlPoster = async () => { const p = poster || await makePoster(); save(p.url, 'ป้ายQR-ประเมินความพึงพอใจ-A4.png'); };
  const printPoster = async () => {
    const p = poster || await makePoster(); const w = window.open('', '_blank'); if (!w) return say('เบราว์เซอร์บล็อกหน้าต่างใหม่ — อนุญาต pop-up แล้วลองอีกครั้ง');
    w.document.open(); w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>ป้าย QR ประเมินความพึงพอใจ</title><style>@page{size:A4;margin:0}html,body{margin:0}img{display:block;width:210mm;height:297mm}</style></head><body><img src="${p.url}" onload="setTimeout(function(){window.print()},500)"></body></html>`); w.document.close();
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card space-y-3 p-4">
        <h3 className="font-bold text-slate-700">QR Code แบบประเมินสำหรับประชาชน</h3>
        {local && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900 ring-1 ring-amber-200">⚠️ คุณเปิดหน้านี้จากเครื่องทดสอบ (localhost) ลิงก์ใน QR จะใช้งานจริงไม่ได้ — ให้เปิดจากเว็บจริงที่เผยแพร่แล้วค่อยสร้าง/พิมพ์ QR</p>}
        {qr && <img src={qr} alt="QR Code แบบประเมิน" className="mx-auto h-64 w-64 rounded-xl border-4 border-emerald-500 p-2" />}
        <p className="break-all rounded-lg bg-slate-50 p-2 text-center text-sm text-slate-700">{url}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <button className="btn btn-outline" onClick={copy}><Copy className="h-4 w-4" /> คัดลอกลิงก์</button>
          <button className="btn btn-outline" onClick={() => save(qr, 'QR-ประเมินความพึงพอใจ.png')} disabled={!qr}><Download className="h-4 w-4" /> ดาวน์โหลด QR (PNG)</button>
          <a className="btn btn-outline" href={url} target="_blank" rel="noreferrer">เปิดแบบประเมินทดสอบ</a>
        </div>
        <p className="text-xs text-slate-500">ทดสอบสแกนด้วยกล้องโทรศัพท์ก่อนพิมพ์เสมอ · QR ชี้ไปที่หน้าแบบประเมินจริง ไม่ต้องล็อกอิน</p>
      </section>
      <section className="card space-y-3 p-4">
        <h3 className="font-bold text-slate-700">ป้ายประชาสัมพันธ์ A4</h3>
        <div className="flex flex-wrap gap-2"><button className="btn btn-primary" onClick={makePoster} disabled={busy}>{busy ? 'กำลังสร้าง…' : 'สร้าง/ดูตัวอย่างป้าย'}</button>
          <button className="btn btn-outline" onClick={dlPoster} disabled={busy}><Download className="h-4 w-4" /> ดาวน์โหลดป้าย (PNG)</button>
          <button className="btn btn-outline" onClick={printPoster} disabled={busy}><Printer className="h-4 w-4" /> พิมพ์ป้าย</button></div>
        {poster ? <img src={poster.url} alt="ตัวอย่างป้าย" className="mx-auto max-h-[560px] rounded-lg shadow ring-1 ring-slate-200" /> : <p className="text-sm text-slate-500">กด “สร้าง/ดูตัวอย่างป้าย” — ป้ายโทนฟ้า-ขาว-เขียว มี QR ขนาดใหญ่กลางป้าย พร้อมพิมพ์บนกระดาษ A4 (ภาพ 300 dpi)</p>}
      </section>
    </div>);
}
