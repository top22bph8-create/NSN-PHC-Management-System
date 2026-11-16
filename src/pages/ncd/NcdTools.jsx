// เครื่องมือรายงาน NCD: ส่งออก Excel (ทั้งหมด / แยกรายหมู่บ้าน / ใบรหัสสำหรับคีย์ JHCIS) และหน้าต่าง "นำเข้า JHCIS"
import { useMemo, useState } from 'react';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { CheckCircle2, ClipboardList, DatabaseZap, Download, FileSpreadsheet, MapPinned, Send } from 'lucide-react';
import { db } from '../../firebase';
import { todayStr } from '../../lib/thai';
import { Modal } from '../../components/ui';
import { classify2Q, feeStatus, ppCodes } from '../../lib/ncdScreen';

export const OVL = { normal: 'ปกติ', risk: 'กลุ่มเสี่ยง', suspect: 'สงสัย/ส่งต่อ' };

// ปีงบประมาณ (เริ่ม 1 ต.ค.)
export const fyStartOf = (d = new Date()) => `${d.getMonth() + 1 >= 10 ? d.getFullYear() : d.getFullYear() - 1}-10-01`;

const rowMap = (r) => ({
  วันที่คัดกรอง: r.screenDate, ชื่อสกุล: r.name, เลขบัตร: r.cid, เพศ: r.sex === 'M' ? 'ชาย' : 'หญิง', อายุ: r.age, กลุ่มอายุ: r.ageGroup, หมู่: r.villageNo, บ้านเลขที่: r.houseNo || '',
  BMI: r.bmi ?? '', รอบเอว: r.waist, ความดันเฉลี่ย: r.bpSys ? `${r.bpSys}/${r.bpDia}` : '', น้ำตาล: r.glucose, อดอาหาร: r.glucose === '' ? '' : r.fasting ? 'ใช่' : 'ไม่',
  '2Q': r.q2a === '' || r.q2a == null ? '' : r.q2a || r.q2b ? 'ผิดปกติ' : 'ปกติ', 'ST-5': r.st5 ?? '', สารเสพติด: r.drug === 'yes' ? 'ใช้' : r.drug === 'no' ? 'ไม่ใช้' : '',
  'CVD risk %': r.cvdRisk ?? '', TC: r.tc ?? '', HDL: r.hdl ?? '', สรุปผล: OVL[r.overall] || '', ปัจจัยเสี่ยง: (r.risks || []).join(', '),
  ผู้คัดกรอง: r.screenedBy || '', สถานะตรวจสอบ: r.source === 'asm' ? (r.review === 'approved' ? 'ตรวจแล้ว' : 'รอตรวจสอบ') : 'เจ้าหน้าที่บันทึก',
  สถานะJHCIS: r.jhcis === 'done' ? 'ส่งแล้ว' : r.jhcis === 'queued' ? 'อยู่ในคิวส่ง' : 'รอส่ง', 'พร้อมคิด 12001': feeStatus(r).eligible ? 'ใช่' : '',
});

// ใบรหัสสำหรับคีย์ใน JHCIS (ตามเอกสารอบรม สปสช. ข้อ 20): วินิจฉัย + Specialpp + ค่าบริการ
const jhcisSheet = (r) => {
  const fee = feeStatus(r);
  const dx = ['Z00.0', 'Z13.3', 'Z13.6', 'Z71.3'];
  return {
    วันที่รับบริการ: r.screenDate, เลขบัตร: r.cid, ชื่อสกุล: r.name, อายุ: r.age, หมู่: r.villageNo, บ้านเลขที่: r.houseNo || '',
    'ความดัน (ตัวบน/ตัวล่าง)': r.sbp1 ? `${r.sbp1}/${r.dbp1}` : '', น้ำหนัก: r.weight, ส่วนสูง: r.height, รอบเอว: r.waist, 'น้ำตาล DTX/FBS': r.glucose,
    'ผล 2Q': classify2Q(r.q2a, r.q2b)?.label || '', 'ST-5': r.st5 ?? '', สารเสพติด: r.drug === 'yes' ? 'ใช้' : r.drug === 'no' ? 'ไม่ใช้' : '', อาการสำคัญ: 'คัดกรองและประเมินปัจจัยเสี่ยงต่อสุขภาพ/สุขภาพจิต',
    'วินิจฉัย (ICD-10)': dx.join(', '), 'Specialpp': ppCodes(r).join(', '), 'ค่าบริการ 12001 (100 บาท)': fee.eligible ? 'คีย์ได้' : fee.note || `ยังขาด: ${fee.missing.join(', ')}`, ให้คำปรึกษา: (r.counsel || []).join(', '), หมายเหตุ: r.note || '',
  };
};

const sheetName = (t) => String(t).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);

export async function exportWorkbook(kind, rows, villages, target, fy) {
  const XLSX = await import('xlsx'); const wb = XLSX.utils.book_new();
  const add = (name, data) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.length ? data : [{ ข้อมูล: 'ไม่มีรายการ' }]), sheetName(name));
  const vname = (no) => (villages || []).find((v) => v.no === String(no))?.name || '';
  if (kind === 'jhcis') { add('ใบรหัสคีย์ JHCIS', rows.map(jhcisSheet)); XLSX.writeFile(wb, `ncd-jhcis-keysheet-${todayStr()}.xlsx`); return; }
  if (kind === 'village') {
    const nos = [...new Set([...(villages || []).map((v) => v.no), ...rows.map((r) => String(r.villageNo || ''))])].filter(Boolean).sort((a, b) => Number(a) - Number(b));
    add('สรุปรายหมู่บ้าน', nos.map((no) => { const l = rows.filter((r) => String(r.villageNo) === no); const t = target?.byMoo?.[no]; const f = l.filter((r) => String(r.screenDate) >= fy).length; return { หมู่: no, ชื่อหมู่บ้าน: vname(no), 'เป้าหมาย 15–59 ปี': t?.total ?? '', 'ทำแล้วใน JHCIS (ปีงบนี้)': t?.done ?? '', 'บันทึกในแอป (ปีงบนี้)': f, 'ร้อยละโดยประมาณ': t?.total ? Math.min(100, Math.round((((t.done || 0) + f) / t.total) * 1000) / 10) : '', ปกติ: l.filter((r) => r.overall === 'normal').length, กลุ่มเสี่ยง: l.filter((r) => r.overall === 'risk').length, สงสัยส่งต่อ: l.filter((r) => r.overall === 'suspect').length, รอตรวจสอบ: l.filter((r) => r.source === 'asm' && r.review !== 'approved').length }; }));
    nos.forEach((no) => add(`ม.${no} ${vname(no)}`, rows.filter((r) => String(r.villageNo) === no).map(rowMap)));
    const none = rows.filter((r) => !r.villageNo); if (none.length) add('ไม่ระบุหมู่', none.map(rowMap));
    XLSX.writeFile(wb, `ncd-screening-by-village-${todayStr()}.xlsx`); return;
  }
  add('คัดกรอง NCD', rows.map(rowMap)); XLSX.writeFile(wb, `ncd-screening-${todayStr()}.xlsx`);
}

const Opt = ({ icon: Icon, title, desc, onClick, busy, tone }) => (
  <button type="button" onClick={onClick} disabled={busy} className="group flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-emerald-400 hover:shadow disabled:opacity-60">
    <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl text-white shadow ${tone}`}><Icon className="h-6 w-6" /></span>
    <span className="min-w-0 flex-1"><span className="block font-bold text-slate-800">{title}</span><span className="block text-xs text-slate-500">{desc}</span></span>
    <Download className="h-5 w-5 text-slate-400 group-hover:text-emerald-600" />
  </button>
);

export function ExportModal({ rows, filtered, villages, target, onClose }) {
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const fy = fyStartOf();
  const run = async (kind, data) => { setBusy(kind); setErr(''); try { await exportWorkbook(kind, data, villages, target, fy); } catch (e) { setErr(e.message || 'ส่งออกไม่สำเร็จ'); } finally { setBusy(''); } };
  return (
    <Modal title="ส่งออกรายงาน Excel" onClose={onClose} footer={<button className="btn btn-outline" onClick={onClose}>ปิด</button>}>
      <div className="space-y-2.5">
        <Opt icon={FileSpreadsheet} tone="bg-gradient-to-br from-emerald-500 to-teal-600" title="รายงานทั้งหมด" desc={`ตามตัวกรองที่เลือกอยู่ตอนนี้ ${filtered.length} รายการ · 1 ชีต`} busy={busy === 'all'} onClick={() => run('all', filtered)} />
        <Opt icon={MapPinned} tone="bg-gradient-to-br from-sky-500 to-blue-600" title="แยกรายหมู่บ้าน" desc={`สรุปความครอบคลุมรายหมู่ + 1 ชีตต่อหมู่บ้าน (ข้อมูลทั้งหมด ${rows.length} รายการ)`} busy={busy === 'village'} onClick={() => run('village', rows)} />
        <Opt icon={ClipboardList} tone="bg-gradient-to-br from-violet-500 to-purple-600" title="ใบรหัสสำหรับคีย์ JHCIS" desc="ค่าที่วัด รหัสวินิจฉัย Specialpp และ 12001 ของรายการที่เลือกในตัวกรอง" busy={busy === 'jhcis'} onClick={() => run('jhcis', filtered)} />
        {err && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{err}</div>}
      </div>
    </Modal>
  );
}

// "นำเข้า JHCIS": เฟสนี้ยังไม่เขียนลงฐาน JHCIS — จัดคิวรายการที่ตรวจแล้ว + ดาวน์โหลดใบรหัสไปคีย์เอง; ตัวเขียนกลับอัตโนมัติจะตามมาหลังทดสอบบนฐานสำเนา
export function JhcisModal({ rows, onClose }) {
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const ready = useMemo(() => rows.filter((r) => r.jhcis !== 'done' && (r.source !== 'asm' || r.review === 'approved')), [rows]);
  const waiting = rows.filter((r) => r.jhcis !== 'done' && r.source === 'asm' && r.review !== 'approved').length;
  const toQueue = ready.filter((r) => r.jhcis !== 'queued'); const queued = ready.length - toQueue.length;
  const queue = async () => {
    setBusy(true); setMsg('');
    try { for (let i = 0; i < toQueue.length; i += 400) { const b = writeBatch(db); toQueue.slice(i, i + 400).forEach((r) => b.update(doc(db, 'ncdScreenings', r.id), { jhcis: 'queued', queuedAt: serverTimestamp() })); await b.commit(); } setMsg(`จัดคิวแล้ว ${toQueue.length} รายการ`); }
    catch (e) { setMsg(e.message || 'จัดคิวไม่สำเร็จ'); } finally { setBusy(false); }
  };
  return (
    <Modal title="นำเข้า JHCIS" onClose={onClose} footer={<button className="btn btn-outline" onClick={onClose}>ปิด</button>}>
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[['พร้อมส่ง', ready.length, 'bg-emerald-50 text-emerald-700'], ['อยู่ในคิว', queued, 'bg-sky-50 text-sky-700'], ['รอตรวจสอบก่อน', waiting, 'bg-amber-50 text-amber-700']].map(([l, v, t]) => <div key={l} className={`rounded-xl p-3 ${t}`}><div className="text-2xl font-extrabold tabular-nums">{v}</div><div className="text-xs">{l}</div></div>)}
        </div>
        <div className="rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 ring-1 ring-amber-200"><b>สถานะตอนนี้:</b> ระบบยังไม่เขียนข้อมูลลงฐาน JHCIS โดยตรง (ต้องทดสอบบนฐานสำเนาและสำรองข้อมูลก่อน) ใช้ได้ 2 ทาง คือ ① ดาวน์โหลดใบรหัสไปคีย์ใน JHCIS เอง ② จัดคิวรายการไว้ให้ตัวนำเข้าอัตโนมัติที่จะทำในเฟสถัดไป รายการที่ อสม. ส่งมาต้องกด “ตรวจแล้ว” ก่อนจึงจะนับว่าพร้อมส่ง</div>
        <Opt icon={ClipboardList} tone="bg-gradient-to-br from-violet-500 to-purple-600" title="ดาวน์โหลดใบรหัสคีย์ JHCIS" desc={`รายการพร้อมส่ง ${ready.length} รายการ`} busy={false} onClick={() => exportWorkbook('jhcis', ready, [], null, '')} />
        <button type="button" className="btn btn-primary !h-12 w-full" disabled={busy || !toQueue.length} onClick={queue}><Send className="h-4 w-4" /> {busy ? 'กำลังจัดคิว...' : `จัดคิวส่งเข้า JHCIS (${toQueue.length} รายการ)`}</button>
        {msg && <div className="flex items-center gap-2 text-emerald-700" role="status"><CheckCircle2 className="h-4 w-4" />{msg}</div>}
        <div className="flex items-center gap-2 text-xs text-slate-500"><DatabaseZap className="h-4 w-4" /> เมื่อเปิดใช้ตัวนำเข้าอัตโนมัติ รายการในคิวจะถูกเขียนเป็น visit ใหม่พร้อมสำรองข้อมูลก่อนทุกครั้ง</div>
      </div>
    </Modal>
  );
}
