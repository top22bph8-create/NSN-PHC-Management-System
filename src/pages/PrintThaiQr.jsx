import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import Logo from '../components/Logo';
import { THAI_CLINIC, getThaiConfig, thaiPhones, thaiPublicUrl } from '../lib/thaiClinic';

// ป้าย QR Code จองคิวแพทย์แผนไทย (A4 แนวตั้ง) — ติดที่คลินิก/บอร์ดประชาสัมพันธ์ (ไม่มีข้อมูลส่วนบุคคล เป็นแค่ลิงก์สาธารณะ)
export default function PrintThaiQr() {
  const [qr, setQr] = useState('');
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    getThaiConfig().then(setCfg).catch(() => setCfg({ ...THAI_CLINIC }));
    QRCode.toDataURL(thaiPublicUrl(), { width: 900, margin: 1, errorCorrectionLevel: 'M' }).then(setQr);
  }, []);
  useEffect(() => { if (qr && cfg) setTimeout(() => window.print(), 700); }, [qr, cfg]);
  if (!qr || !cfg) return <p className="p-8 text-center text-slate-500">กำลังสร้างป้าย QR Code...</p>;
  return (
    <div className="mx-auto flex min-h-dvh max-w-[794px] flex-col items-center justify-center bg-white p-10 text-center">
      <Logo size={110} />
      <h2 className="mt-4 text-4xl font-extrabold leading-snug text-slate-900">โรงพยาบาลส่งเสริมสุขภาพตำบลบ้านหนองสนม</h2>
      <p className="mt-1 text-2xl font-semibold text-slate-700">กองสาธารณสุข องค์การบริหารส่วนจังหวัดสกลนคร</p>
      <h1 className="mt-5 text-5xl font-extrabold text-emerald-800">🌿 คลินิกแพทย์แผนไทย</h1>
      <p className="mt-2 text-3xl font-bold text-slate-800">จองคิวออนไลน์ ง่ายๆ</p>
      <img src={qr} alt="QR Code จองคิว" className="mt-6 h-[400px] w-[400px] rounded-2xl border-8 border-emerald-600 p-3" />
      <p className="mt-4 text-3xl font-bold text-emerald-700">สแกนเพื่อจองคิว</p>
      <p className="mt-1 text-lg text-slate-600">เปิดกล้องมือถือ / แอปไลน์ แล้วสแกน QR Code เลือกวัน-เวลาที่ต้องการ</p>
      <div className="mt-6 rounded-2xl bg-emerald-50 px-8 py-4 text-2xl text-emerald-900">
        บริการโดย <b>{cfg.providerName} {cfg.providerTitle}</b>{thaiPhones(cfg).map(([l, n]) => <span key={n}><br />{l} <b>{n}</b></span>)}
      </div>
    </div>
  );
}
