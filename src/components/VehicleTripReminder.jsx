import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Printer } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { canRead } from '../lib/roles';
import { fmtDate } from '../lib/thai';
import { Modal } from './ui';

// ป๊อปอัพเตือนในระบบขออนุญาตใช้รถ — เด้งขึ้นให้ "ผู้ขอใช้รถ/ผู้ขับรถ" ของคำขอที่:
//  - อนุมัติแล้ว (ผอ. กดอนุมัติ): แจ้งให้พิมพ์แบบ 3 และให้ลงเวลา/เลขไมล์ก่อนเดินทาง
//  - กำลังเดินทาง: เตือนให้ลงเวลากลับถึงและเลขไมล์เมื่อกลับ (ระบบแสดงเลขไมล์ครั้งก่อนและคำนวณระยะทางให้)
// ขึ้นทันทีที่สถานะเปลี่ยนขณะเปิดเว็บอยู่ และขึ้นอีกเมื่อเข้าระบบครั้งถัดไปถ้ายังไม่ลงบันทึก — ปุ่ม "ไว้ทีหลัง" ซ่อนเฉพาะรอบการใช้งานนี้ (เก็บใน sessionStorage)
const SNOOZE_KEY = 'vehicleReminderSnooze';
const readSnooze = () => { try { return JSON.parse(sessionStorage.getItem(SNOOZE_KEY) || '[]'); } catch { return []; } };

export default function VehicleTripReminder() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [snoozed, setSnoozed] = useState(readSnooze);
  const allowed = !!profile && canRead(profile.role, 'vehicle');

  useEffect(() => {
    if (!allowed) return undefined;
    // เงื่อนไขเดียว (status in) ไม่ต้องสร้าง index เพิ่ม
    return onSnapshot(
      query(collection(db, 'vehicle'), where('status', 'in', ['อนุมัติ', 'กำลังใช้งาน'])),
      (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setRows([]),
    );
  }, [allowed]);

  const mine = useMemo(() => rows
    .filter((r) => r.requesterEmail === profile?.email || (profile?.name && (r.requester === profile.name || r.driver === profile.name)))
    .filter((r) => !snoozed.includes(`${r.id}:${r.status}`))
    .sort((a, b) => String(a.useDate || '').localeCompare(String(b.useDate || ''))), [rows, profile, snoozed]);

  const it = mine[0];
  if (!allowed || !it) return null;

  const snooze = () => {
    const next = [...snoozed, `${it.id}:${it.status}`];
    setSnoozed(next);
    try { sessionStorage.setItem(SNOOZE_KEY, JSON.stringify(next)); } catch { /* ไม่เป็นไร */ }
  };
  const go = (kind) => { snooze(); nav(`/vehicle?trip=${it.id}&kind=${kind}`); };
  const printUrl = `${window.location.origin}${window.location.pathname}#/print-vehicle/${it.id}`;
  const approved = it.status === 'อนุมัติ';

  return (
    <Modal
      title={approved ? '✅ คำขอใช้รถได้รับอนุมัติแล้ว' : '🚗 อย่าลืมลงเวลาและเลขไมล์เมื่อกลับ'}
      onClose={snooze}
      footer={
        <>
          <button className="btn btn-outline" onClick={snooze}>ไว้ทีหลัง</button>
          {approved && <button className="btn btn-outline" onClick={() => window.open(printUrl, '_blank')}><Printer className="h-4 w-4" /> พิมพ์แบบ 3</button>}
          <button className="btn btn-primary" onClick={() => go(approved ? 'start' : 'end')}>{approved ? 'ลงเวลา/เลขไมล์ก่อนเดินทาง' : 'ลงเวลากลับ/เลขไมล์เมื่อกลับ'}</button>
        </>
      }
    >
      <div className="space-y-2 text-[15px]">
        <p className="font-semibold">{it.tripNo} · {it.plate}</p>
        <p>ผู้ขอ: {it.requester} · วันที่ใช้รถ {fmtDate(it.useDate)}{it.wantDeparture ? ` เวลา ${it.wantDeparture} น.` : ''}</p>
        {approved ? (
          <p className="rounded-xl bg-emerald-50 p-3 text-emerald-900">
            ผู้อำนวยการอนุมัติแล้ว พิมพ์แบบ 3 ไปใช้ได้เลย และก่อนออกเดินทางให้กด "ลงเวลา/เลขไมล์ก่อนเดินทาง"
            เมื่อเดินทางกลับถึง <b>ต้องลงเวลามาถึงและเลขไมล์เมื่อถึง</b> ระบบจะแสดงเลขไมล์ครั้งก่อนและคำนวณระยะทางครั้งนี้ให้
          </p>
        ) : (
          <p className="rounded-xl bg-amber-50 p-3 text-amber-900">
            ออกเดินทางแล้วเมื่อ {it.timeOut || '-'}{it.odoStart ? ` (เลขไมล์ก่อนเดินทาง ${Number(it.odoStart).toLocaleString('th-TH')} กม.)` : ''}
            — เมื่อกลับถึงแล้ว กรุณาลงเวลามาถึงและเลขไมล์เมื่อถึงเพื่อปิดเที่ยวนี้
          </p>
        )}
      </div>
    </Modal>
  );
}
