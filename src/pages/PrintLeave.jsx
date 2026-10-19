import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { ORG_UNDER } from '../config/brand';
import { fmtDateLong } from '../lib/thai';
import { OWNER_EMAIL } from '../lib/roles';
import { getQuota } from '../lib/leave';
import thSarabunRegular from '../assets/fonts/THSarabunIT9-Regular.ttf';
import thSarabunItalic from '../assets/fonts/THSarabunIT9-Italic.ttf';
import thSarabunBoldItalic from '../assets/fonts/THSarabunIT9-BoldItalic.ttf';

const FONT_STACK = '"TH SarabunIT๙", "TH SarabunPSK", "THSarabunNew", "Sarabun", sans-serif';

// ฟอนต์ TH SarabunIT๙ (ไฟล์ที่แนบมา) + ระยะขอบกระดาษ (1 ซม. เท่ากันทั้ง 4 ด้าน — ลดจากมาตรฐานหนังสือราชการ 2.5 ซม.
// เพื่อให้มีที่พอสำหรับเนื้อหาทั้งหมดในแผ่นเดียว หลังขยายตัวอักษรขึ้นเป็น 16pt/18pt ตามมาตรฐานราชการ โดยไม่ลดขนาดตัวอักษรลง)
// หมายเหตุ: มีเฉพาะไฟล์ปกติ/เอียง/หนา-เอียง ไม่มีไฟล์ตัวหนาตรงแยกต่างหาก จึงให้เบราว์เซอร์สังเคราะห์ตัวหนาปกติ (faux bold) จากไฟล์ปกติแทน
// ".print-doc" ด้านล่าง: ปรับขนาดตัวอักษรของคลาส Tailwind text-sm/text-xs/text-lg ที่ใช้อยู่ทั่วไฟล์นี้ให้เป็นหน่วย pt ที่กำหนดเอง
// (เดิมคลาสเหล่านี้คำนวณจาก rem ของหน้าเว็บ) ใช้ selector เจาะจงคลาส .print-doc เพื่อไม่กระทบขนาดตัวอักษรของหน้าอื่นๆ ของเว็บ
// ขนาดตัวอักษรตามมาตรฐานหนังสือราชการไทย (ระเบียบสำนักนายกรัฐมนตรีว่าด้วยงานสารบรรณ + มติ ครม. การใช้ฟอนต์ TH SarabunPSK):
// เนื้อหาทั่วไป 16pt, ชื่อเรื่อง/หัวแบบฟอร์ม 18pt ตัวหนา — ปรับขึ้นจาก 12pt/14pt เดิม (ตอนนั้นจำเป็นต้องใช้ขนาดเล็กเพราะตาราง
// สถิติการลายังวางเต็มความกว้างแยกเป็นบล็อกข้างบน ทำให้เนื้อหาสูงมาก) หลังย่อตารางให้อยู่ในคอลัมน์ซ้ายแล้ว (ดูหมายเหตุเวอร์ชันใน
// README) เหลือพื้นที่ว่างมากขึ้น จึงขยายตัวอักษรกลับไปที่ขนาดมาตรฐานได้ — ทดสอบจริงด้วยการแปลง PDF และนับจำนวนหน้าแล้วว่า
// ยังพอดี 1 แผ่น A4 ไม่ล้นไปหน้า 2 (แบบที่เนื้อหายาวที่สุดคือ "แบบใบลาป่วย ลาคลอดบุตร ลากิจส่วนตัว")
function PrintFonts() {
  return (
    <style>{`
      @font-face { font-family: 'TH SarabunIT๙'; src: url('${thSarabunRegular}') format('truetype'); font-weight: 400; font-style: normal; font-display: swap; }
      @font-face { font-family: 'TH SarabunIT๙'; src: url('${thSarabunItalic}') format('truetype'); font-weight: 400; font-style: italic; font-display: swap; }
      @font-face { font-family: 'TH SarabunIT๙'; src: url('${thSarabunBoldItalic}') format('truetype'); font-weight: 700; font-style: italic; font-display: swap; }
      @page { size: A4; margin: 1cm; }
      .print-doc .text-lg { font-size: 18pt; }
      .print-doc .text-sm { font-size: 16pt; }
      .print-doc .text-xs:not(.chk-mark):not(.pf-tip) { font-size: 16pt; }
      .print-doc .pf-label { display: inline-block; width: 3.2em; }
    `}</style>
  );
}

const ORG_ADDRESS_LINE1 = 'โรงพยาบาลส่งเสริมสุขภาพตำบลบ้านหนองสนม';
const ORG_ADDRESS_LINE2 = 'ตำบลเชียงเครือ อำเภอเมืองสกลนคร จังหวัดสกลนคร 47000';
const ORG_LONG = `${ORG_ADDRESS_LINE1} กองสาธารณสุข ${ORG_UNDER}`;
const ORG_DEPT = `กองสาธารณสุข ${ORG_UNDER}`;
// ผู้ตรวจสอบ/ผู้บังคับบัญชา ที่พิมพ์ชื่อ-ตำแหน่งไว้ล่วงหน้าในแบบใบลาพักผ่อน (ตามแบบฟอร์มตัวอย่างจริง)
const CHECKER_NAME = 'นางสาวพิไลวรรณ  กุลมินทร์';
const CHECKER_POSITION = 'นักวิชาการสาธารณสุขชำนาญการ';
const DIRECTOR_NAME = 'นายพงศกร  แป่มจำนัก';
const DIRECTOR_POSITION = 'ผู้อำนวยการโรงพยาบาลส่งเสริมสุขภาพตำบลบ้านหนองสนม';
// เฉพาะใบลาของผู้อำนวยการ (นายพงศกร แป่มจำนัก) เท่านั้น: ผู้อนุญาตการลา (ลงนามแทนในกล่อง "คำสั่ง") คือผู้อำนวยการกองสาธารณสุข
// และผู้รับมอบงานระหว่างลาคือบุคคลนี้โดยเฉพาะ (ไม่ใช่ค่าที่กรอกเองในฟอร์มลาเหมือนบุคลากรทั่วไป) ตามที่ผู้อำนวยการแจ้งไว้ ไม่กระทบใบลาของบุคลากรคนอื่น
const OWNER_APPROVER_NAME = 'นายวิสุทธิ์  ศิริคุณ';
const OWNER_APPROVER_POSITION = 'ผู้อำนวยการกองสาธารณสุข';
const OWNER_DELEGATE_NAME = 'นางสาวพิไลวรรณ  กุลมินทร์';
const OWNER_DELEGATE_POSITION = 'นักวิชาการสาธารณสุขชำนาญการ';

// เส้นประสำหรับให้กรอกด้วยลายมือ
const Blank = ({ w = 'w-40' }) => <span className={`inline-block border-b border-dotted border-slate-500 align-bottom ${w}`}>&nbsp;</span>;

// แปลง Firestore Timestamp (หรือค่าที่แปลงเป็นวันที่ได้) เป็นเลขวันที่ ISO (YYYY-MM-DD) ตามเวลาเครื่อง ใช้เทียบวันที่แบบง่าย
function tsToDateStr(ts) {
  if (!ts) return '';
  const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// แปลง Firestore Timestamp (หรือค่าที่แปลงเป็นวันที่ได้) เป็นวันที่ไทยแบบยาว เช่น "18 มิถุนายน 2569"
function tsToThaiLong(ts) {
  const iso = tsToDateStr(ts);
  return iso ? fmtDateLong(iso) : '';
}

// ช่องสี่เหลี่ยม ติ๊กเครื่องหมายถูกอัตโนมัติตามประเภทที่ตรงกับใบลานี้
// ("chk-mark" กันไม่ให้ override ขนาด .text-xs ของ PrintFonts มาโดนเครื่องหมายถูกตัวนี้จนล้นกล่อง)
function CheckBox({ checked }) {
  return (
    <span className="mr-1 inline-flex h-4 w-4 items-center justify-center border border-slate-600 align-middle text-xs chk-mark leading-none">
      {checked ? '✓' : ''}
    </span>
  );
}

// กล่อง "ความเห็นของผู้บังคับบัญชา" — เว้นว่างให้เซ็นด้วยลายมือ เว้นแต่ระบุ presetName/Position ไว้ล่วงหน้า (presetExtra = บรรทัดตำแหน่งเพิ่มเติมใต้ตำแหน่งหลัก)
function SignatureBox({ role, presetName, presetPosition, presetExtra, sigWidth = 'w-56' }) {
  return (
    <div className="mt-2 text-sm leading-[1.25]">
      <div className="font-bold underline">ความเห็นของ{role}</div>
      {/* เส้นจุดสำหรับเขียนความเห็น 2 แถว ตามแบบฟอร์มตัวอย่าง (เดิมมีแถวเดียว) */}
      <div className="mt-1 border-b border-dotted border-slate-400">&nbsp;</div>
      <div className="mt-1 border-b border-dotted border-slate-400">&nbsp;</div>
      {/* เว้นระยะจากเส้นความเห็นด้านบนห่างอีกประมาณ 1 แถว ก่อนถึงบรรทัดลงนาม ไม่ให้ติดกัน (ตามที่ ผอ. แจ้งปรับเพิ่ม)
          และเส้นประจุดสำหรับลงลายเซ็นปรับให้พอดีกับความกว้างของชื่อในวงเล็บด้านล่าง (sigWidth) ไม่ให้กว้างเกินไป */}
      {presetName ? (
        <div className="mt-4 text-center leading-[1.15]">
          <div className={`mx-auto ${sigWidth} border-b border-dotted border-slate-500`}>&nbsp;</div>
          <div>( {presetName} )</div>
          <div>{presetPosition}</div>
          {presetExtra ? <div>{presetExtra}</div> : null}
          <div className="mt-1">วันที่ <Blank w="w-40" /></div>
        </div>
      ) : (
        <div className="mt-2">
          <div><b>( ลงชื่อ )</b> <Blank w="w-52" /></div>
          <div>( <Blank w="w-52" /> )</div>
          <div>( ตำแหน่ง ) <Blank w="w-52" /></div>
          <div>วันที่ <Blank w="w-10" /> เดือน <Blank w="w-24" /> พ.ศ. <Blank w="w-14" /></div>
        </div>
      )}
    </div>
  );
}

// บรรทัดลงชื่อ "ผู้ตรวจสอบ" — จัดชื่อ/ตำแหน่ง/เส้นปะให้อยู่กึ่งกลางเพื่อความสวยงาม เว้นแต่ระบุ presetName ไว้ล่วงหน้า
function CheckerLine({ presetName, presetPosition }) {
  return (
    <div className="mt-2 text-center text-sm leading-[1.2]">
      <div className="leading-[1.2]"><b>( ลงชื่อ )</b> <Blank w="w-52" /> ผู้ตรวจสอบ</div>
      <div>( {presetName || <Blank w="w-52" />} )</div>
      <div>ตำแหน่ง {presetPosition || <Blank w="w-52" />}</div>
      <div>วันที่ <Blank w="w-40" /></div>
    </div>
  );
}

// คำสั่งมอบหมายงานในหน้าที่ระหว่างลา — แสดงชื่อผู้มอบงาน (ผู้ยื่นใบลา) และผู้รับมอบงาน (ผู้ที่ถูกเลือกไว้) ให้ครบตามตัวอย่าง
// isOwnerLeave: เฉพาะใบลาของผู้อำนวยการ (นายพงศกร แป่มจำนัก) ให้บังคับผู้รับมอบงานเป็น นางสาวพิไลวรรณ กุลมินทร์ เสมอ (ไม่ใช้ค่าที่กรอกเองในฟอร์ม)
function DelegateBox({ l, isOwnerLeave }) {
  const delegateName = isOwnerLeave ? OWNER_DELEGATE_NAME : l.delegateTo;
  return (
    <div className="mt-2 text-sm leading-[1.25]">
      <p>ในวันลาครั้งนี้ข้าพเจ้ามอบหมายการทำงานในหน้าที่</p>
      <p className="leading-[1.2]">ให้ {delegateName ? <b>{delegateName}</b> : <Blank w="w-56" />} เป็นผู้ดำเนินการแทน</p>
      <div className="mt-1 text-center">
        <div><b>( ลงชื่อ )</b> <Blank w="w-44" /> ผู้มอบงาน</div>
        <div>( {l.name} )</div>
      </div>
      <div className="mt-1 text-center">
        <div><b>( ลงชื่อ )</b> <Blank w="w-44" /> ผู้รับมอบงาน</div>
        <div>( {delegateName || <Blank w="w-44" />} )</div>
        {isOwnerLeave && <div>ตำแหน่ง {OWNER_DELEGATE_POSITION}</div>}
      </div>
    </div>
  );
}

// กล่อง "คำสั่ง" อนุญาต/ไม่อนุญาต — ติ๊กเครื่องหมายถูกอัตโนมัติตามผลพิจารณาจริง ลงชื่อผู้อำนวยการไว้ล่วงหน้า
// (ยกเว้นเป็นใบลาของผู้อำนวยการเอง ซึ่งไม่มีใครลงนามแทนตายตัวได้ จึงเว้นว่างไว้ให้เซ็นเอง)
// วันที่ใต้ลายเซ็นเติมอัตโนมัติตามวันที่กดบันทึกผลพิจารณาจริง (decidedAt) ถ้ายังไม่พิจารณาจะเว้นว่างไว้
// pushTop: ระยะเลื่อนกล่อง "คำสั่ง" ลงมา (px) ให้หัวข้อ "คำสั่ง" อยู่ระดับบรรทัดเดียวกับ "ผู้มอบงาน" ในคอลัมน์ซ้าย ตามที่ ผอ. แจ้ง
// ค่านี้วัดจริงด้วย Playwright getBoundingClientRect ของแต่ละแบบ — หลังขยายฟอนต์เป็น 16pt/18pt (ดูหมายเหตุ PrintFonts) และย่อระยะห่าง
// ต่างๆ ลงเพื่อให้พอดี 1 แผ่น ค่าที่วัดได้ใหม่คือ 42 สำหรับแบบที่มี DelegateBox (ลาป่วยฯ/ลาพักผ่อน/ลาทั่วไป) และ 0 สำหรับแบบลาอุปสมบท
function OrderBox({ status, isOwnerLeave, decidedDate, pushTop = 42 }) {
  return (
    <div className="text-sm leading-[1.25]" style={{ marginTop: pushTop }}>
      <div className="font-bold underline">คำสั่ง</div>
      <div className="mt-1 flex gap-6">
        <label className="flex items-center gap-1.5"><CheckBox checked={status === 'อนุมัติ'} /> อนุญาต</label>
        <label className="flex items-center gap-1.5"><CheckBox checked={status === 'ไม่อนุมัติ'} /> ไม่อนุญาต</label>
      </div>
      {/* เส้นจุดสำหรับเขียนความเห็น 2 แถว ให้ตรงกับกล่อง "ความเห็นของผู้บังคับบัญชา" */}
      <div className="mt-1 border-b border-dotted border-slate-400">&nbsp;</div>
      <div className="mt-1 border-b border-dotted border-slate-400">&nbsp;</div>
      {/* เว้นระยะจากเส้นความเห็นด้านบนห่างอีกประมาณ 1 แถว ก่อนถึงบรรทัดลงนาม เท่ากับกล่องผู้บังคับบัญชา
          และเส้นประจุดลงลายเซ็นปรับให้พอดีกับความกว้างของชื่อในวงเล็บด้านล่าง */}
      {isOwnerLeave ? (
        <div className="mt-4 text-center leading-[1.15]">
          <div className="mx-auto w-[150px] border-b border-dotted border-slate-500">&nbsp;</div>
          <div>( {OWNER_APPROVER_NAME} )</div>
          <div>{OWNER_APPROVER_POSITION}</div>
          {decidedDate ? <div className="mt-1">วันที่ {decidedDate}</div> : <div className="mt-1">วันที่ <Blank w="w-10" /> เดือน <Blank w="w-24" /> พ.ศ. <Blank w="w-14" /></div>}
        </div>
      ) : (
        <div className="mt-4 text-center leading-[1.15]">
          <div className="mx-auto w-[130px] border-b border-dotted border-slate-500">&nbsp;</div>
          <div>( {DIRECTOR_NAME} )</div>
          <div>{DIRECTOR_POSITION}</div>
          {decidedDate ? <div className="mt-1">วันที่ {decidedDate}</div> : <div className="mt-1">วันที่ <Blank w="w-10" /> เดือน <Blank w="w-24" /> พ.ศ. <Blank w="w-14" /></div>}
        </div>
      )}
    </div>
  );
}

// ตาราง "สถิติการลาในปีงบประมาณนี้" แบบมีคอลัมน์ประเภทลา (ลาป่วย/ลากิจ/ลาคลอด)
// วางเต็มความกว้างหน้ากระดาษ (ไม่อยู่ในคอลัมน์ซ้าย-ขวาเหมือนเดิม) เพื่อให้หัวตารางไม่ถูกบีบจนขึ้นบรรทัดใหม่ซ้อนกันหลายบรรทัด
// ซึ่งเคยทำให้ตารางสูงเกินและดันเนื้อหาล้นไปหน้า 2 — ดูหมายเหตุเวอร์ชันใน README
function StatsTable({ rows }) {
  return (
    <table className="mt-2 w-full border-collapse border border-slate-600 text-sm leading-[1.2]">
      <thead>
        <tr>
          <th className="border border-slate-600 px-2 py-1 text-left align-top">ประเภทลา</th>
          <th className="border border-slate-600 px-2 py-1 text-left align-top">ลามาแล้ว<br />(วันทำการ)</th>
          <th className="border border-slate-600 px-2 py-1 text-left align-top">ลาครั้งนี้<br />(วันทำการ)</th>
          <th className="border border-slate-600 px-2 py-1 text-left align-top">รวมเป็น<br />(วันทำการ)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.type}>
            <td className="border border-slate-600 px-2 py-1">{r.type}</td>
            <td className="border border-slate-600 px-2 py-1 text-center">{r.before || '-'}</td>
            <td className="border border-slate-600 px-2 py-1 text-center">{r.thisTime || '-'}</td>
            <td className="border border-slate-600 px-2 py-1 text-center">{r.total || '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ตาราง "สถิติการลาในปีงบประมาณนี้" แบบไม่มีคอลัมน์ประเภท (ใช้เฉพาะแบบใบลาพักผ่อน ตามตัวอย่าง แถวแรกกรอกข้อมูลจริง แถวสองเว้นว่าง) — เต็มความกว้างเช่นกัน
function VacationStatsTable({ before, thisTime, total }) {
  return (
    <table className="mt-2 w-full border-collapse border border-slate-600 text-sm leading-[1.2]">
      <thead>
        <tr>
          <th className="border border-slate-600 px-2 py-1 text-left align-top">ลามาแล้ว<br />(วันทำการ)</th>
          <th className="border border-slate-600 px-2 py-1 text-left align-top">ลาครั้งนี้<br />(วันทำการ)</th>
          <th className="border border-slate-600 px-2 py-1 text-left align-top">รวมเป็น<br />(วันทำการ)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="border border-slate-600 px-2 py-1 text-center">{before || '-'}</td>
          <td className="border border-slate-600 px-2 py-1 text-center">{thisTime || '-'}</td>
          <td className="border border-slate-600 px-2 py-1 text-center">{total || '-'}</td>
        </tr>
        <tr>
          <td className="border border-slate-600 px-2 py-1">&nbsp;</td>
          <td className="border border-slate-600 px-2 py-1">&nbsp;</td>
          <td className="border border-slate-600 px-2 py-1">&nbsp;</td>
        </tr>
      </tbody>
    </table>
  );
}

// หัวแบบฟอร์ม (ไม่มีโลโก้ รพ.สต. / วันที่เติมอัตโนมัติตามวันที่บันทึกใบลาเข้าระบบ)
function Head({ title, dateText }) {
  return (
    <div className="mb-1">
      <div className="text-center text-lg font-bold underline leading-[1.1]">{title}</div>
      <div className="mt-0.5 flex justify-end">
        <div className="text-left text-sm leading-[1.1]">
          <div>{ORG_ADDRESS_LINE1}</div>
          <div>{ORG_ADDRESS_LINE2}</div>
        </div>
      </div>
      <div className="text-center text-sm leading-[1.1]">วันที่ {dateText || <Blank w="w-40" />}</div>
    </div>
  );
}

// คอลัมน์ซ้าย-ขวาด้านล่างตาราง/เนื้อหาหลัก — ใช้ float แทน CSS grid โดยเจตนา: เบราว์เซอร์ตัดหน้าพิมพ์ (page-break) ของ
// CSS grid แบบ 2 คอลัมน์ไม่ได้ดี มักดันทั้งบล็อกไปหน้าถัดไปทั้งก้อนแม้มีที่เหลือพอเขียนบางส่วน ทำให้เหลือที่ว่างเยอะโดยใช่เหตุ
// ส่วน float ยอมให้ตัดแบ่งเนื้อหาข้ามหน้าได้ตามจริง จึงใช้พื้นที่กระดาษได้เต็มกว่า (ดูหมายเหตุเวอร์ชันใน README)
function TwoCol({ left, right }) {
  return (
    <div className="mt-2" style={{ display: 'flow-root' }}>
      <div style={{ float: 'left', width: '46%' }}>{left}</div>
      <div style={{ float: 'right', width: '46%' }}>{right}</div>
    </div>
  );
}

// แบบใบลาป่วย / ลากิจส่วนตัว / ลาคลอดบุตร (แบบใช้ร่วมกัน มีช่องติ๊กประเภท) — ตรงตามแบบฟอร์มตัวอย่างที่แนบ (ไม่มีคำสั่งมอบหมายงาน)
function SickPersonalMaternity({ l, stats, lastSame, to, dateText, isOwnerLeave, decidedDate }) {
  const isType = (t) => l.type === t;
  return (
    <>
      <Head title="แบบใบลาป่วย ลาคลอดบุตร ลากิจส่วนตัว" dateText={dateText} />
      <p className="leading-[1.1]"><span className="pf-label">เรื่อง</span>ขอลา{l.type.replace('ลา', '')}</p>
      <p className="leading-[1.1]"><span className="pf-label">เรียน</span>{to}</p>
      <p className="mt-1 leading-[1.15]">
        <span className="pf-label"></span>ข้าพเจ้า {l.name} ตำแหน่ง {l.position || <Blank />}
      </p>
      <p className="leading-[1.15]">สังกัด {ORG_LONG}</p>
      <div className="mt-1 flex gap-3 leading-[1.15]">
        <span>ขอลา</span>
        <span className="flex flex-col gap-0.5">
          <span><CheckBox checked={isType('ลาป่วย')} /> ป่วย</span>
          <span><CheckBox checked={isType('ลากิจส่วนตัว')} /> กิจส่วนตัว</span>
          <span><CheckBox checked={isType('ลาคลอดบุตร')} /> คลอดบุตร</span>
        </span>
      </div>
      <p className="mt-1 leading-[1.15]">
        ตั้งแต่วันที่ {fmtDateLong(l.start)} ถึง {fmtDateLong(l.end)} มีกำหนดลาครั้งนี้ {l.days} วัน
      </p>
      <p className="leading-[1.15]">
        ข้าพเจ้าได้ลา <CheckBox checked={isType('ลาป่วย')} />ป่วย <CheckBox checked={isType('ลากิจส่วนตัว')} />กิจส่วนตัว <CheckBox checked={isType('ลาคลอดบุตร')} />คลอดบุตร ครั้งสุดท้ายตั้งแต่วันที่ {lastSame ? fmtDateLong(lastSame) : <Blank />}
      </p>
      <p className="leading-[1.15]">ในระหว่างลาจะติดต่อข้าพเจ้าได้ที่ {l.contact || <Blank w="w-96" />}</p>
      <p className="leading-[1.15]">หมายเลขโทรศัพท์มือถือหมายเลข {l.phone || <Blank w="w-64" />}</p>
      <div className="mt-1 text-center text-sm leading-[1.15]">
        <div><b>( ลงชื่อ )</b> <Blank w="w-56" /></div>
        <div>( {l.name} )</div>
        <div>ตำแหน่ง {l.position}</div>
      </div>
      {/* ตารางสถิติการลา: ย่อให้เหลือครึ่งหน้า (คอลัมน์ซ้ายของ TwoCol) ชิดขอบซ้ายตรงกับข้อความด้านบน และอยู่บรรทัดเดียวกับ
          "ความเห็นของผู้บังคับบัญชา" คอลัมน์ขวา ตามแบบฟอร์มตัวอย่างจริง (เดิมวางเต็มความกว้างแยกต่างหากก่อนคอลัมน์) */}
      <TwoCol
        left={<>
          <p className="mt-2 text-sm font-bold underline">สถิติการลาในปีงบประมาณนี้</p>
          <StatsTable rows={stats} />
          <DelegateBox l={l} isOwnerLeave={isOwnerLeave} />
          <CheckerLine presetName={CHECKER_NAME} presetPosition={CHECKER_POSITION} />
        </>}
        right={<>
          <SignatureBox role="ผู้บังคับบัญชา" presetName={CHECKER_NAME} presetPosition={CHECKER_POSITION} presetExtra="หัวหน้างานบริหาร" sigWidth="w-[150px]" />
          <OrderBox status={l.status} isOwnerLeave={isOwnerLeave} decidedDate={decidedDate} pushTop={42} />
        </>}
      />
    </>
  );
}

// แบบใบลาพักผ่อน — ตรงตามแบบฟอร์มตัวอย่างที่แนบ (มีคำสั่งมอบหมายงาน + ผู้ตรวจสอบ/ผู้บังคับบัญชาพิมพ์ชื่อไว้ล่วงหน้า)
function Vacation({ l, to, quotaAccrued, quotaRemain, quotaTotal, before, thisTime, total, isOwnerLeave, dateText, decidedDate }) {
  return (
    <>
      <Head title="แบบใบลาพักผ่อน" dateText={dateText} />
      <p><span className="pf-label">เรื่อง</span>ขอลาพักผ่อน</p>
      <p><span className="pf-label">เรียน</span>{to}</p>
      <p className="mt-1 leading-[1.25]">
        <span className="pf-label"></span>ข้าพเจ้า {l.name} ตำแหน่ง {l.position || <Blank />}
      </p>
      <p className="leading-[1.25]">
        สังกัด {ORG_DEPT} มีวันลาพักผ่อนสะสม {quotaAccrued} วันทำการ มีสิทธิลาพักผ่อนประจำปีนี้อีก {quotaRemain} วันทำการ รวมเป็น {quotaTotal} วันทำการ ประสงค์ขออนุญาตลาพักผ่อน
      </p>
      <p className="leading-[1.25]">
        ระหว่างวันที่ {fmtDateLong(l.start)} ถึงวันที่ {fmtDateLong(l.end)} รวม {l.days} วันทำการ ในระหว่างลาจะติดต่อข้าพเจ้าได้ที่โทรศัพท์มือถือหมายเลข {l.phone || <Blank w="w-56" />}
      </p>
      <div className="mt-3 text-center text-sm leading-[1.3]">
        <div><b>( ลงชื่อ )</b> <Blank w="w-56" /></div>
        <div>( {l.name} )</div>
        <div>ตำแหน่ง {l.position}</div>
      </div>
      <TwoCol
        left={<>
          <p className="mt-2 text-sm font-bold underline">สถิติการลาในปีงบประมาณนี้</p>
          <VacationStatsTable before={before} thisTime={thisTime} total={total} />
          <DelegateBox l={l} isOwnerLeave={isOwnerLeave} />
          <CheckerLine presetName={CHECKER_NAME} presetPosition={CHECKER_POSITION} />
        </>}
        right={<>
          <SignatureBox role="ผู้บังคับบัญชา" presetName={CHECKER_NAME} presetPosition={CHECKER_POSITION} presetExtra="หัวหน้างานบริหาร" sigWidth="w-[150px]" />
          <OrderBox status={l.status} isOwnerLeave={isOwnerLeave} decidedDate={decidedDate} pushTop={42} />
        </>}
      />
    </>
  );
}

// แบบใบลาอุปสมบท / ประกอบพิธีฮัจย์ (ยังไม่มีตัวอย่างแนบมาสำหรับประเภทนี้ ใช้โครงเดียวกับแบบลาป่วย/กิจ/คลอด)
function Ordination({ l, to, dateText, isOwnerLeave, decidedDate }) {
  return (
    <>
      <Head title={l.type.includes('ฮัจย์') ? 'แบบใบลาอุปสมบท/ประกอบพิธีฮัจย์' : 'แบบใบลาอุปสมบท'} dateText={dateText} />
      <p><span className="pf-label">เรื่อง</span>ขอลาอุปสมบท/ประกอบพิธีฮัจย์</p>
      <p><span className="pf-label">เรียน</span>{to}</p>
      <p className="mt-1 leading-[1.25]">
        <span className="pf-label"></span>ข้าพเจ้า {l.name} ตำแหน่ง {l.position || <Blank />} สังกัด {ORG_LONG}
      </p>
      <p className="leading-[1.25]">เกิดวันที่ <Blank /> เข้ารับราชการเมื่อวันที่ <Blank /></p>
      <p className="leading-[1.25]">ข้าพเจ้า <Blank w="w-24" /> เคยอุปสมบท/ประกอบพิธีฮัจย์มาก่อน</p>
      <p className="leading-[1.25]">บัดนี้มีศรัทธาจะอุปสมบท/ประกอบพิธีฮัจย์ ณ <Blank w="w-96" /></p>
      <p className="leading-[1.25]">
        จึงขออนุญาตลาตั้งแต่วันที่ {fmtDateLong(l.start)} ถึงวันที่ {fmtDateLong(l.end)} มีกำหนด {l.days} วัน
      </p>
      <p className="leading-[1.25]">เหตุผล/รายละเอียดเพิ่มเติม {l.reason || <Blank w="w-96" />}</p>
      <div className="mt-3 text-center text-sm leading-[1.3]">
        <div><b>( ลงชื่อ )</b> <Blank w="w-56" /></div>
        <div>( {l.name} )</div>
        <div>ตำแหน่ง {l.position}</div>
      </div>
      <TwoCol
        left={<DelegateBox l={l} isOwnerLeave={isOwnerLeave} />}
        right={<>
          <SignatureBox role="ผู้บังคับบัญชา" presetName={CHECKER_NAME} presetPosition={CHECKER_POSITION} presetExtra="หัวหน้างานบริหาร" sigWidth="w-[150px]" />
          <OrderBox status={l.status} isOwnerLeave={isOwnerLeave} decidedDate={decidedDate} pushTop={0} />
        </>}
      />
    </>
  );
}

// แบบใบลาทั่วไป (ประเภทที่ไม่มีตัวอย่างเฉพาะ เช่น ลาไปช่วยเหลือภริยาคลอดบุตร / ลาไปศึกษาฝึกอบรม / อื่น ๆ)
function GenericLeave({ l, stats, to, dateText, isOwnerLeave, decidedDate }) {
  return (
    <>
      <Head title={`แบบใบ${l.type}`} dateText={dateText} />
      <p><span className="pf-label">เรื่อง</span>ขอ{l.type}</p>
      <p><span className="pf-label">เรียน</span>{to}</p>
      <p className="mt-1 leading-[1.25]">
        <span className="pf-label"></span>ข้าพเจ้า {l.name} ตำแหน่ง {l.position || <Blank />} สังกัด {ORG_LONG}
      </p>
      <p className="leading-[1.25]">เนื่องจาก {l.reason || <Blank w="w-96" />}</p>
      <p className="leading-[1.25]">
        ตั้งแต่วันที่ {fmtDateLong(l.start)} ถึงวันที่ {fmtDateLong(l.end)} มีกำหนด {l.days} วัน
      </p>
      <p className="leading-[1.25]">ในระหว่างลาจะติดต่อข้าพเจ้าได้ที่ {l.contact || <Blank w="w-96" />}</p>
      <div className="mt-3 text-center text-sm leading-[1.3]">
        <div><b>( ลงชื่อ )</b> <Blank w="w-56" /></div>
        <div>( {l.name} )</div>
        <div>ตำแหน่ง {l.position}</div>
      </div>
      <TwoCol
        left={<>
          <p className="mt-2 text-sm font-bold underline">สถิติการลาในปีงบประมาณนี้</p>
          <StatsTable rows={stats} />
          <DelegateBox l={l} isOwnerLeave={isOwnerLeave} />
        </>}
        right={<>
          <SignatureBox role="ผู้บังคับบัญชา" presetName={CHECKER_NAME} presetPosition={CHECKER_POSITION} presetExtra="หัวหน้างานบริหาร" sigWidth="w-[150px]" />
          <OrderBox status={l.status} isOwnerLeave={isOwnerLeave} decidedDate={decidedDate} pushTop={42} />
        </>}
      />
    </>
  );
}

export default function PrintLeave() {
  const { id } = useParams();
  const [l, setL] = useState(null);
  const [extra, setExtra] = useState(null);
  const [person, setPerson] = useState(null);
  const [quotaCfg, setQuotaCfg] = useState(null);
  const [notFound, setNotFound] = useState(false);
  // วันลาครั้งสุดท้ายของประเภทเดียวกัน (ช่อง "ครั้งสุดท้ายตั้งแต่วันที่" ในแบบใบลาป่วย/กิจ/คลอด) ต้องค้นหาข้ามปีงบประมาณด้วย
  // ไม่จำกัดเฉพาะปีงบประมาณปัจจุบันเหมือนตาราง "สถิติการลา" (ดู lastSameDate ด้านล่าง)
  const [lastSameDate, setLastSameDate] = useState(undefined); // undefined = กำลังค้นหา, null = ไม่เคยลาประเภทนี้มาก่อน

  // ซ่อนชื่อโปรแกรมออกจากหัวกระดาษ/ท้ายกระดาษที่เบราว์เซอร์แทรกให้อัตโนมัติตอนพิมพ์
  useEffect(() => {
    const prevTitle = document.title;
    document.title = '​';
    return () => { document.title = prevTitle; };
  }, []);

  useEffect(() => {
    getDoc(doc(db, 'leaves', id)).then(async (snap) => {
      if (!snap.exists()) { setNotFound(true); return; }
      const data = { id: snap.id, ...snap.data() };
      setL(data);
      // ดึงประวัติการลาของบุคคลนี้ในปีงบประมาณเดียวกัน เพื่อคำนวณสถิติ "ลามาแล้ว" (ไม่รวมใบนี้)
      const s = await getDocs(query(collection(db, 'leaves'), where('fy', '==', data.fy), where('userEmail', '==', data.userEmail)));
      const others = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => x.id !== data.id && x.status === 'อนุมัติ');
      setExtra(others);
      // ดึงประวัติการลา "ประเภทเดียวกัน" ของบุคคลนี้แยกต่างหาก โดยไม่จำกัดปีงบประมาณ (ต่างจากด้านบน) เพื่อหาวันลาครั้งสุดท้าย
      // ของประเภทนี้มาใส่ในช่อง "ครั้งสุดท้ายตั้งแต่วันที่" — ถ้าจำกัดเฉพาะปีงบประมาณปัจจุบันเหมือน "ลามาแล้ว" ช่องนี้จะว่างผิดพลาด
      // ทุกครั้งที่เป็นการลาประเภทนี้ครั้งแรกของปีงบประมาณ ทั้งที่จริงเคยลาประเภทเดียวกันไว้ในปีงบประมาณก่อนหน้า
      const sameTypeSnap = await getDocs(query(collection(db, 'leaves'), where('userEmail', '==', data.userEmail), where('type', '==', data.type), where('status', '==', 'อนุมัติ')));
      const prevSame = sameTypeSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((x) => x.id !== data.id && x.end < data.start)
        .sort((a, b) => b.end.localeCompare(a.end))[0];
      setLastSameDate(prevSame?.end || null);
      const [pSnap, q] = await Promise.all([getDoc(doc(db, 'users', data.userEmail)), getQuota()]);
      setPerson(pSnap.exists() ? pSnap.data() : {});
      setQuotaCfg(q);
    }).catch(() => setNotFound(true));
  }, [id]);

  useEffect(() => {
    if (l && extra && person && quotaCfg && lastSameDate !== undefined) setTimeout(() => window.print(), 400);
  }, [l, extra, person, quotaCfg, lastSameDate]);

  if (notFound) return <div className="p-8 text-center">ไม่พบใบลานี้</div>;
  if (!l || !extra || !person || !quotaCfg || lastSameDate === undefined) return <div className="p-8 text-center text-slate-500">กำลังโหลดข้อมูล...</div>;

  const STAT_TYPES = ['ลาป่วย', 'ลากิจส่วนตัว', 'ลาคลอดบุตร'];
  const stats = STAT_TYPES.map((type) => {
    const before = extra.filter((x) => x.type === type).reduce((s2, x) => s2 + (Number(x.days) || 0), 0);
    const thisTime = l.type === type ? Number(l.days) || 0 : 0;
    return { type, before: before || '', thisTime: thisTime || '', total: (before + thisTime) || '' };
  });
  if (!STAT_TYPES.includes(l.type)) {
    const before = extra.filter((x) => x.type === l.type).reduce((s2, x) => s2 + (Number(x.days) || 0), 0);
    stats.push({ type: l.type, before: before || '', thisTime: l.days, total: before + Number(l.days || 0) });
  }
  const isOwnerLeave = l.userEmail === OWNER_EMAIL;
  // ทุกคนเรียนถึงผู้อำนวยการ รพ.สต. ยกเว้นใบลาของผู้อำนวยการเองที่ต้องส่งขึ้นไปที่กองสาธารณสุข
  const to = isOwnerLeave ? 'ผู้อำนวยการกองสาธารณสุข' : 'ผู้อำนวยการโรงพยาบาลส่งเสริมสุขภาพตำบลบ้านหนองสนม';
  // วันที่หัวกระดาษ ปกติ = วันที่บันทึกใบลาเข้าระบบจริง (createdAt) แต่ถ้าเป็น "ลาย้อนหลัง" (วันเริ่มลาอยู่ก่อนวันที่ยื่นจริง)
  // ให้ใช้วันเริ่มลาแทนตามที่แจ้ง เพื่อไม่ให้หนังสือขอลาลงวันที่ขัดแย้งกับวันที่ลาจริงที่ระบุไว้ในเนื้อหา
  // วันที่ใต้ลายเซ็นคำสั่ง = วันที่กดบันทึกผลพิจารณาจริง (decidedAt) ไม่เกี่ยวข้อง ไม่ต้องย้อนหลังตาม
  const createdDateStr = tsToDateStr(l.createdAt);
  const isBackdated = createdDateStr && l.start && l.start < createdDateStr;
  const dateText = isBackdated ? fmtDateLong(l.start) : tsToThaiLong(l.createdAt);
  const decidedDate = tsToThaiLong(l.decidedAt);

  // ยอดวันลาพักผ่อน: ยกยอดสะสม (ตั้งค่าไว้ที่ทำเนียบบุคลากร) + สิทธิ์ปีนี้คงเหลือ (สิทธิ์รวม - ลามาแล้ว) = รวมสิทธิ์ทั้งหมด
  const vBefore = extra.filter((x) => x.type === 'ลาพักผ่อน').reduce((s2, x) => s2 + (Number(x.days) || 0), 0);
  const vThisTime = l.type === 'ลาพักผ่อน' ? Number(l.days) || 0 : 0;
  const vTotal = vBefore + vThisTime;
  const quotaAccrued = Number(person.vacationCarryOver) || 0;
  const quotaRemain = Math.max(0, (Number(quotaCfg['ลาพักผ่อน']) || 0) - vBefore);
  const quotaTotal = quotaAccrued + quotaRemain;

  return (
    <div
      className="print-doc mx-auto max-w-[800px] bg-white p-8 text-slate-800 print:max-w-none print:p-0"
      style={{ fontFamily: FONT_STACK, fontSize: '16pt', lineHeight: 1.25 }}
    >
      <PrintFonts />
      <div className="mb-3 flex justify-end gap-2 print:hidden">
        <button className="btn btn-outline" onClick={() => window.close()}>ปิดหน้านี้</button>
        <button className="btn btn-primary" onClick={() => window.print()}>พิมพ์ / บันทึกเป็น PDF</button>
      </div>
      <p className="pf-tip mb-2 text-xs text-amber-700 print:hidden">เคล็ดลับ: ตอนสั่งพิมพ์ ให้เปิด "การตั้งค่าเพิ่มเติม" แล้วปิดตัวเลือก "ส่วนหัวและส่วนท้าย" (Headers and footers) เพื่อไม่ให้เบราว์เซอร์แทรกวันที่/URL/เลขหน้าลงในกระดาษ (ไม่มีวิธีปิดจากโค้ดของเว็บได้ ต้องปิดที่ตัวเลือกนี้ในกล่องพิมพ์เองทุกครั้ง) · แบบฟอร์มนี้ใช้ฟอนต์ TH SarabunIT๙ ที่แนบมาฝังไว้ในไฟล์ให้แล้ว จึงแสดงผลเหมือนกันทุกเครื่อง · หากต้องการให้ไฟล์ PDF ที่บันทึกจากหน้าพิมพ์นี้ไปเก็บที่โฟลเดอร์ Downloads ของเครื่องโดยอัตโนมัติทุกครั้ง (ไม่ต้องเลือกที่เก็บเอง) ให้ไปที่การตั้งค่าเบราว์เซอร์ (เช่น Chrome: การตั้งค่า → ดาวน์โหลด) แล้วปิดตัวเลือก "ถามก่อนว่าจะบันทึกไฟล์แต่ละไฟล์ไว้ที่ไหน"</p>
      {l.type === 'ลาพักผ่อน' ? (
        <Vacation l={l} to={to} quotaAccrued={quotaAccrued} quotaRemain={quotaRemain} quotaTotal={quotaTotal} before={vBefore || ''} thisTime={vThisTime || ''} total={vTotal || ''} isOwnerLeave={isOwnerLeave} dateText={dateText} decidedDate={decidedDate} />
      ) : ['ลาป่วย', 'ลากิจส่วนตัว', 'ลาคลอดบุตร'].includes(l.type) ? (
        <SickPersonalMaternity l={l} stats={stats} lastSame={lastSameDate} to={to} dateText={dateText} isOwnerLeave={isOwnerLeave} decidedDate={decidedDate} />
      ) : l.type === 'ลาอุปสมบท/ประกอบพิธีฮัจย์' ? (
        <Ordination l={l} to={to} dateText={dateText} isOwnerLeave={isOwnerLeave} decidedDate={decidedDate} />
      ) : (
        <GenericLeave l={l} stats={stats} to={to} dateText={dateText} isOwnerLeave={isOwnerLeave} decidedDate={decidedDate} />
      )}
    </div>
  );
}
