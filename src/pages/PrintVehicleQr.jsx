import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { getVehicleFleet, vehicleLabel } from '../lib/vehicleConfig';
import { ORG_SHORT, ORG_UNDER } from '../config/brand';

// หน้าพิมพ์ป้าย QR Code ประจำรถแต่ละคัน — ติดในรถ/ที่กุญแจ ให้คนขับสแกนแล้วลงเวลา/เลขไมล์ได้ทันที
// (ลิงก์ = หน้าทะเบียนขอใช้รถ + รหัสรถ ระบบจะเปิดฟอร์มเริ่มเดินทาง/สิ้นสุดการเดินทางของเที่ยวที่อนุมัติไว้ให้อัตโนมัติ)
export const vehicleScanUrl = (fleetId) => `${window.location.origin}${window.location.pathname}#/vehicle?scan=${encodeURIComponent(fleetId)}`;

export default function PrintVehicleQr() {
  const [items, setItems] = useState(null);

  useEffect(() => {
    (async () => {
      const fleet = await getVehicleFleet().catch(() => []);
      const out = [];
      for (const v of fleet) {
        if (!v.id) continue;
        out.push({ id: v.id, label: vehicleLabel(v), qr: await QRCode.toDataURL(vehicleScanUrl(v.id), { width: 400, margin: 1, errorCorrectionLevel: 'M' }) });
      }
      setItems(out);
    })();
  }, []);

  useEffect(() => {
    if (items && items.length) setTimeout(() => window.print(), 600);
  }, [items]);

  if (items === null) return <p className="p-8 text-center text-slate-500">กำลังสร้าง QR Code...</p>;
  if (!items.length) return <p className="p-8 text-center text-slate-600">ยังไม่มีรถในทะเบียนยานพาหนะ (หรือยังไม่ได้กดบันทึกในหน้าตั้งค่าระบบ)</p>;

  return (
    <div className="mx-auto max-w-[800px] bg-white p-4 print:p-0">
      <style>{'@page { size: A4; margin: 1cm; }'}</style>
      <div className="mb-3 flex items-center justify-end gap-2 print:hidden">
        <button className="btn btn-outline" onClick={() => window.close()}>ปิดหน้านี้</button>
        <button className="btn btn-primary" onClick={() => window.print()}>พิมพ์ / บันทึกเป็น PDF</button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {items.map((it) => (
          <div key={it.id} className="break-inside-avoid rounded-xl border-2 border-slate-700 p-4 text-center">
            <div className="text-sm font-semibold">{ORG_SHORT}</div>
            <div className="mb-1 text-xs text-slate-500">{ORG_UNDER}</div>
            <div className="text-base font-bold">สแกนเพื่อลงเวลา / เลขไมล์</div>
            <img src={it.qr} alt={it.label} className="mx-auto my-2 h-56 w-56" />
            <div className="text-base font-bold">{it.label}</div>
            <div className="mt-1 text-xs text-slate-500">เปิดด้วยกล้องมือถือ แล้วเข้าสู่ระบบ — ใช้ได้เมื่อ ผอ. อนุมัติคำขอแล้ว</div>
          </div>
        ))}
      </div>
    </div>
  );
}
