import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { thMonths } from '../lib/thai';
import { VEHICLE_TYPES, missionLines } from '../lib/vehicleConfig';
import thSarabunRegular from '../assets/fonts/THSarabunIT9-Regular.ttf';
import thSarabunItalic from '../assets/fonts/THSarabunIT9-Italic.ttf';
import thSarabunBoldItalic from '../assets/fonts/THSarabunIT9-BoldItalic.ttf';

const FONT_STACK = '"TH SarabunIT๙", "TH SarabunPSK", "THSarabunNew", "Sarabun", sans-serif';
const ORG_NAME = 'โรงพยาบาลส่งเสริมสุขภาพตำบลบ้านหนองสนม';
const DIRECTOR_NAME = 'นายพงศกร  แป่มจำนัก';
// ข้อความท้ายแบบฟอร์ม (ตามแบบ 3 ที่แนบมา) — ถ้าคำสั่งแต่งตั้งเปลี่ยน แก้ที่ค่าคงที่นี้จุดเดียว
const DIRECTOR_LINES = [
  'ผู้อำนวยการโรงพยาบาลส่งเสริมสุขภาพตำบลบ้านหนองสนม',
  'ปฏิบัติราชการแทนนายกองค์การบริหารส่วนจังหวัดสกลนคร',
  'ตามคำสั่งองค์การบริหารส่วนจังหวัดสกลนครที่ 1939/2569 ลงวันที่ 18 มิถุนายน 2569',
];

// หน้าพิมพ์ "แบบ 3 แบบขออนุญาตใช้รถยนต์/รถจักรยานยนต์ (ส่วนกลาง)" — ใช้ฟอนต์และระยะขอบเดียวกับหน้าพิมพ์ใบลา (TH SarabunIT๙ 16pt, A4, ขอบ 1 ซม.)
function PrintFonts() {
  return (
    <style>{`
      @font-face { font-family: 'TH SarabunIT๙'; src: url('${thSarabunRegular}') format('truetype'); font-weight: 400; font-style: normal; font-display: swap; }
      @font-face { font-family: 'TH SarabunIT๙'; src: url('${thSarabunItalic}') format('truetype'); font-weight: 400; font-style: italic; font-display: swap; }
      @font-face { font-family: 'TH SarabunIT๙'; src: url('${thSarabunBoldItalic}') format('truetype'); font-weight: 700; font-style: italic; font-display: swap; }
      @page { size: A4; margin: 1cm; }
      .vf-doc { font-family: ${FONT_STACK}; font-size: 16pt; line-height: 1.3; color: #000; }
      .vf-doc .vf-title { font-size: 18pt; font-weight: 700; }
    `}</style>
  );
}

const Blank = ({ w = '8em', children }) => (
  <span className="inline-block border-b border-dotted border-slate-600 text-center align-bottom" style={{ minWidth: w }}>{children || ' '}</span>
);

// แปลง YYYY-MM-DD (ค.ศ.) เป็น { d, m, y(พ.ศ.) } สำหรับเติมช่อง "วันที่ .... เดือน .... พ.ศ. ...."
function dateParts(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return { d: String(d), m: thMonths[m - 1], y: String(y + 543) };
}
function tsToIso(ts) {
  if (!ts) return '';
  const dt = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
  if (Number.isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
const DateFill = ({ iso, prefix = 'วันที่' }) => {
  const p = dateParts(iso);
  return (
    <span>{prefix} <Blank w="2.5em">{p?.d}</Blank> เดือน <Blank w="6em">{p?.m}</Blank> พ.ศ. <Blank w="3.5em">{p?.y}</Blank></span>
  );
};

// ช่องสี่เหลี่ยมติ๊กถูก (ใช้ที่ "อนุมัติ" เมื่อคำขอได้รับอนุมัติแล้ว)
const CheckBox = ({ checked }) => (
  <span className="mr-2 inline-flex h-5 w-5 items-center justify-center border border-slate-700 align-middle leading-none" style={{ fontSize: '14pt' }}>{checked ? '✓' : ''}</span>
);

// แยก "รถยนต์ราชการ [ชื่อ] หมายเลขทะเบียน XXX" ที่เก็บไว้ในช่อง plate ออกเป็นประเภท/ชื่อรุ่น/เลขทะเบียน
function parsePlate(label = '') {
  const i = label.indexOf('หมายเลขทะเบียน');
  const head = (i >= 0 ? label.slice(0, i) : label).trim();
  const plate = (i >= 0 ? label.slice(i + 'หมายเลขทะเบียน'.length) : '').trim();
  const isCar = head.startsWith(VEHICLE_TYPES[0]);
  const name = head.replace(VEHICLE_TYPES[0], '').replace(VEHICLE_TYPES[1], '').trim();
  return { isCar, name, plate };
}

export default function PrintVehicle() {
  const { id } = useParams();
  const [v, setV] = useState(undefined);
  const [position, setPosition] = useState('');

  useEffect(() => {
    getDoc(doc(db, 'vehicle', id))
      .then(async (s) => {
        if (!s.exists()) { setV(null); return; }
        const data = { id: s.id, ...s.data() };
        // ตำแหน่งผู้ขอ: ดึงจากทำเนียบบุคลากรตามอีเมลที่บันทึกไว้ตอนยื่นคำขอ (ถ้าหาไม่เจอเว้นเป็นเส้นประให้เขียนเอง)
        // ตำแหน่งผู้ขอ: ใช้ที่เก็บไว้กับคำขอ (ตอนเลือกชื่อ) ก่อน ถ้าไม่มี (คำขอเก่า) ค่อยค้นจากทำเนียบตามอีเมล
        if (data.requesterPosition) setPosition(data.requesterPosition);
        else if (data.requesterEmail) {
          try {
            const u = await getDoc(doc(db, 'users', String(data.requesterEmail).toLowerCase()));
            if (u.exists()) setPosition(u.data().position || '');
          } catch { /* เว้นว่าง */ }
        }
        setV(data);
      })
      .catch(() => setV(null));
  }, [id]);

  useEffect(() => {
    if (v) setTimeout(() => window.print(), 500);
  }, [v]);

  if (v === undefined) return <p className="p-8 text-center text-slate-500">กำลังโหลดข้อมูล...</p>;
  if (v === null) return <div className="p-8 text-center text-slate-600">ไม่พบคำขอใช้รถนี้ หรือไม่มีสิทธิ์เข้าถึง</div>;

  const { isCar, name: carName, plate } = parsePlate(v.plate);
  const missions = missionLines(v);
  const requestIso = tsToIso(v.createdAt) || v.useDate;
  const fromIso = v.useDate;
  const toIso = v.useDate;
  const approved = ['อนุมัติ', 'กำลังใช้งาน', 'เสร็จสิ้น'].includes(v.status);
  const vehicleWord = isCar ? 'รถยนต์' : 'รถจักรยานยนต์';

  return (
    <div className="mx-auto max-w-[800px] bg-white p-6 print:p-0">
      <PrintFonts />
      <div className="mb-2 flex items-center justify-end gap-2 print:hidden">
        <button className="btn btn-outline" onClick={() => window.close()}>ปิดหน้านี้</button>
        <button className="btn btn-primary" onClick={() => window.print()}>พิมพ์ / บันทึกเป็น PDF</button>
      </div>

      <div className="vf-doc">
        <div className="text-right">แบบ ๓</div>
        <div className="vf-title mt-1 text-center">แบบขออนุญาตใช้{vehicleWord} (ส่วนกลาง)</div>
        <div className="mt-2 text-right"><DateFill iso={requestIso} /></div>

        <p className="mt-2">เรียน&nbsp; นายกองค์การบริหารส่วนจังหวัดสกลนคร</p>
        <p className="mt-1" style={{ textIndent: '2.5em' }}>
          ข้าพเจ้า <Blank w="14em">{v.requester}</Blank> ตำแหน่ง <Blank w="12em">{position}</Blank> {ORG_NAME} ขออนุญาตใช้
          {isCar ? <>รถ<Blank w="5em">{carName}</Blank>ส่วนกลาง</> : 'รถจักรยานยนต์ส่วนกลาง'} หมายเลขทะเบียน <Blank w="9em">{plate}</Blank>{' '}
          เพื่อใช้ปฏิบัติราชการต่างๆและงานที่ได้รับมอบหมาย ในงาน{missions.length === 0 && <> <Blank w="14em" /></>}
        </p>
        {missions.length > 0 && (
          <ol className="my-0.5 pl-12" style={{ listStyle: 'none' }}>
            {missions.map((m, i) => (
              <li key={m} className="flex gap-2"><span className="w-6 shrink-0 text-right">{i + 1}.</span><span>{m}</span></li>
            ))}
          </ol>
        )}
        {v.destination && <p style={{ textIndent: '2.5em' }}>ณ {v.destination}{v.village ? ` (${v.village})` : ''}</p>}
        <p style={{ textIndent: '2.5em' }}>
          โดยจะตรวจสอบพร้อมดูแลให้มีสภาพพร้อมใช้งาน และจะเก็บรักษา{vehicleWord}ไว้ในที่ปลอดภัย ตั้งแต่ <DateFill iso={fromIso} /> ถึง <DateFill iso={toIso} prefix="วันที่" />
        </p>

        <div className="mt-4 text-center">
          <div>(ลงชื่อ) <Blank w="13em" /> ผู้ขออนุญาต</div>
          <div>( {v.requester} )</div>
          <div>ตำแหน่ง {position || <Blank w="14em" />}</div>
        </div>

        <p className="mt-5">
          คำสั่งของผู้มีอำนาจให้ใช้{isCar ? <>รถ<Blank w="4em">{carName}</Blank>ส่วนกลาง</> : 'รถจักรยานยนต์ส่วนกลาง'} หมายเลขทะเบียน <Blank w="12em">{plate}</Blank>
        </p>
        <div className="mt-1 border-b border-dotted border-slate-600">&nbsp;</div>
        <div className="mt-1 border-b border-dotted border-slate-600">&nbsp;</div>

        <div className="mt-6 text-center text-lg"><b><CheckBox checked={approved} />อนุมัติ</b></div>

        <div className="mt-6 text-center">
          <div>(ลงชื่อ) <Blank w="14em" /></div>
          <div>( {DIRECTOR_NAME} )</div>
          {DIRECTOR_LINES.map((t) => <div key={t}>{t}</div>)}
          {approved && v.decidedBy && (
            <div className="mt-2 text-sm text-slate-500" style={{ fontSize: '12pt' }}>อนุมัติในระบบโดย {v.decidedBy}{v.decidedAt ? ` เมื่อวันที่ ${dateParts(v.decidedAt) ? `${dateParts(v.decidedAt).d} ${dateParts(v.decidedAt).m} ${dateParts(v.decidedAt).y}` : v.decidedAt}` : ''}</div>
          )}
        </div>
      </div>
    </div>
  );
}
