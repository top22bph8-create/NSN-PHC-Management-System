// เครื่องมือรายงาน NCD: ส่งออก Excel (ทั้งหมด / แยกรายหมู่บ้าน / ใบรหัสสำหรับคีย์ JHCIS) และหน้าต่าง "นำเข้า JHCIS"
import { useMemo, useState } from 'react';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { CheckCircle2, ClipboardList, DatabaseZap, Download, FileSpreadsheet, FileText, MapPinned, Search, Send, User } from 'lucide-react';
import { db } from '../../firebase';
import { todayStr } from '../../lib/thai';
import { Modal } from '../../components/ui';
import { classify2Q, feeStatus, ppCodes } from '../../lib/ncdScreen';
import { openNcdFormPrint } from '../../lib/ncdFormPrint';
import { openNcdRosterPrint } from '../../lib/ncdRosterPrint';
import { ncdTargetStatus } from '../../lib/ncdPublic';
import { ageFromBirth } from '../../lib/ncdScreen';

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

export async function exportWorkbook(kind, rows, villages, target, fy, fname) {
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
  add('คัดกรอง NCD', rows.map(rowMap)); XLSX.writeFile(wb, `${fname || `ncd-screening-${todayStr()}`}.xlsx`);
}

const Opt = ({ icon: Icon, title, desc, onClick, busy, tone }) => (
  <button type="button" onClick={onClick} disabled={busy} className="group flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-emerald-400 hover:shadow disabled:opacity-60">
    <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl text-white shadow ${tone}`}><Icon className="h-6 w-6" /></span>
    <span className="min-w-0 flex-1"><span className="block font-bold text-slate-800">{title}</span><span className="block text-xs text-slate-500">{desc}</span></span>
    <Download className="h-5 w-5 text-slate-400 group-hover:text-emerald-600" />
  </button>
);

// เมนูรายงาน: Excel / PDF แบบฟอร์ม / ฟอร์มเปล่า / ใบรหัส JHCIS — ส่งออกได้ทั้งภาพรวม รายหมู่บ้าน และรายบุคคล
export function ExportModal({ rows, filtered, villages, target, onClose }) {
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const [vil, setVil] = useState(''); const [pq, setPq] = useState('');
  const fy = fyStartOf();
  const nos = useMemo(() => [...new Set([...(villages || []).map((v) => v.no), ...rows.map((r) => String(r.villageNo || ''))])].filter(Boolean).sort((a, b) => Number(a) - Number(b)), [villages, rows]);
  const vname = (no) => (villages || []).find((v) => v.no === String(no))?.name || '';
  const vRows = useMemo(() => (vil ? rows.filter((r) => String(r.villageNo) === vil) : []), [rows, vil]);
  const people = useMemo(() => { const k = pq.trim(); if (!k) return []; return rows.filter((r) => `${r.name} ${r.cid}`.includes(k)).slice(0, 8); }, [rows, pq]);
  const [rv, setRv] = useState('');
  // รายชื่อกลุ่มเป้าหมาย ทำแล้ว / ยังไม่ทำ (ดึงจากเซิร์ฟเวอร์: จับคู่รายชื่อเป้าหมายกับ JHCIS + ผลคัดกรองในแอป ปีงบนี้)
  const roster = async (which, how) => {
    setBusy(`r-${which}-${how}`); setErr('');
    try {
      const st = await ncdTargetStatus({ v: rv || 'all' }); const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
      const list = (st.people || []).filter((p) => (which === 'done' ? p.status : !p.status));
      const scope = rv ? `ม.${rv} ${vname(rv)}` : 'ทุกหมู่บ้าน';
      if (!list.length) { setErr(which === 'done' ? 'ยังไม่มีผู้ที่ทำแล้วในขอบเขตนี้' : 'ไม่มีผู้ที่ยังไม่ทำในขอบเขตนี้ (หรือยังไม่ได้ซิงก์รายชื่อเป้าหมาย)'); return; }
      if (how === 'form') { const rs = list.map((p) => byId[p.appId]).filter(Boolean); if (!rs.length) { setErr('ผู้ที่ทำแล้วเป็นการทำใน JHCIS เดิม ไม่มีผลละเอียดในระบบนี้ จึงพิมพ์ตามแบบฟอร์มไม่ได้'); return; } openNcdFormPrint(rs); return; }
      const rec = (p) => (p.appId ? byId[p.appId] : null);
      const base = (p) => ({ หมู่: p.moo, 'ชื่อ-สกุล': p.name, เพศ: p.sex === 'M' ? 'ชาย' : 'หญิง', อายุ: ageFromBirth(p.birth) ?? '', บ้านเลขที่: p.hno || '', 'เลขบัตร (ปิดบัง)': p.mask || '' });
      const data = list.map((p) => { const r = rec(p); return which === 'done'
        ? { ...base(p), ทำที่: p.jh ? 'JHCIS' : 'บันทึกในแอป', วันที่คัดกรอง: r?.screenDate || '', สรุปผล: r ? OVL[r.overall] || '' : '', ความดัน: r?.bpSys ? `${r.bpSys}/${r.bpDia}` : '', น้ำตาล: r?.glucose ?? '', BMI: r?.bmi ?? '', ผู้คัดกรอง: r?.screenedBy || r?.asmName || '' }
        : { ...base(p), สถานะ: 'ยังไม่ทำ', 'ผู้รับผิดชอบ/อสม.': '', 'วันที่นัด/หมายเหตุ': '' }; });
      const label = which === 'done' ? 'ผู้ที่ทำแล้ว' : 'ผู้ที่ยังไม่ทำ';
      if (how === 'xlsx') { const XLSX = await import('xlsx'); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), sheetName(label)); XLSX.writeFile(wb, `ncd-${which}-${rv ? `moo${rv}` : 'all'}-${todayStr()}.xlsx`); return; }
      const head = Object.keys(data[0]);
      openNcdRosterPrint({ title: `รายชื่อกลุ่มเป้าหมายคัดกรอง NCD — ${label}`, sub: `${scope} · ปีงบประมาณเริ่ม ${st.fy} · รายชื่อเป้าหมาย ณ ${st.asOf || '-'}`, head, rows: data.map((d) => head.map((h) => d[h])), widths: which === 'done' ? [4, 5, 20, 5, 5, 7, 14, 9, 9, 9, 8, 7, 5, 8].slice(0, head.length + 1) : [4, 6, 24, 6, 6, 9, 16, 9, 10, 10].slice(0, head.length + 1) });
    } catch (e) { setErr(e.message || 'ดึงรายชื่อไม่สำเร็จ'); } finally { setBusy(''); }
  };
  const run = async (kind, data, fname) => { setBusy(`${kind}${fname || ''}`); setErr(''); try { await exportWorkbook(kind, data, villages, target, fy, fname); } catch (e) { setErr(e.message || 'ส่งออกไม่สำเร็จ'); } finally { setBusy(''); } };
  const H = ({ children }) => <div className="pt-1 text-xs font-bold uppercase tracking-wide text-slate-500">{children}</div>;
  const Btn = ({ icon: Icon, children, onClick, disabled, tone = 'btn-outline' }) => <button type="button" className={`${tone} !py-2 text-sm`} disabled={disabled} onClick={onClick}><Icon className="h-4 w-4" /> {children}</button>;
  return (
    <Modal title="รายงาน NCD" onClose={onClose} footer={<button className="btn btn-outline" onClick={onClose}>ปิด</button>}>
      <div className="space-y-3">
        <H>ภาพรวม</H>
        <Opt icon={FileSpreadsheet} tone="bg-gradient-to-br from-emerald-500 to-teal-600" title="Excel — ทั้งหมด" desc={`ตามตัวกรองที่เลือกอยู่ตอนนี้ ${filtered.length} รายการ · 1 ชีต`} busy={busy === 'all'} onClick={() => run('all', filtered)} />
        <Opt icon={MapPinned} tone="bg-gradient-to-br from-sky-500 to-blue-600" title="Excel — แยกรายหมู่บ้านทุกหมู่" desc={`สรุปความครอบคลุมรายหมู่ + 1 ชีตต่อหมู่บ้าน (ข้อมูลทั้งหมด ${rows.length} รายการ)`} busy={busy === 'village'} onClick={() => run('village', rows)} />
        <Opt icon={FileText} tone="bg-gradient-to-br from-rose-400 to-red-500" title="PDF แบบฟอร์ม — ตามตัวกรอง" desc={`พิมพ์แบบฟอร์มการตรวจสุขภาพประชาชนจากผลคัดกรอง ${filtered.length} ราย`} busy={false} onClick={() => filtered.length && openNcdFormPrint(filtered)} />
        <Opt icon={FileText} tone="bg-gradient-to-br from-slate-400 to-slate-600" title="PDF ฟอร์มเปล่า" desc="แบบฟอร์มเปล่าสำหรับให้ อสม. กรอกด้วยมือ" busy={false} onClick={() => openNcdFormPrint([], { blank: true })} />
        <Opt icon={ClipboardList} tone="bg-gradient-to-br from-violet-500 to-purple-600" title="ใบรหัสสำหรับคีย์ JHCIS" desc="ค่าที่วัด รหัสวินิจฉัย Specialpp และ 12001 ของรายการที่เลือกในตัวกรอง" busy={busy === 'jhcis'} onClick={() => run('jhcis', filtered)} />

        <div className="border-t pt-3"><H>รายชื่อกลุ่มเป้าหมาย: ทำแล้ว / ยังไม่ทำ</H>
          <select aria-label="ขอบเขตหมู่บ้านของรายชื่อ" className="input mt-1" value={rv} onChange={(e) => setRv(e.target.value)}><option value="">ทุกหมู่บ้าน</option>{nos.map((no) => <option key={no} value={no}>ม.{no} {vname(no)}</option>)}</select>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-2"><div className="mb-1 text-sm font-bold text-emerald-800">ผู้ที่ทำแล้ว</div><div className="flex flex-wrap gap-1.5">
              <Btn icon={FileSpreadsheet} disabled={!!busy} onClick={() => roster('done', 'xlsx')}>Excel</Btn><Btn icon={FileText} disabled={!!busy} onClick={() => roster('done', 'pdf')}>PDF รายชื่อ</Btn><Btn icon={FileText} disabled={!!busy} onClick={() => roster('done', 'form')}>PDF ตามแบบฟอร์ม</Btn></div></div>
            <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-2"><div className="mb-1 text-sm font-bold text-rose-800">ผู้ที่ยังไม่ทำ</div><div className="flex flex-wrap gap-1.5">
              <Btn icon={FileSpreadsheet} disabled={!!busy} onClick={() => roster('todo', 'xlsx')}>Excel</Btn><Btn icon={FileText} disabled={!!busy} onClick={() => roster('todo', 'pdf')}>PDF รายชื่อ</Btn></div></div>
          </div>
          <p className="mt-1 text-xs text-slate-500">ทำแล้ว = ทำใน JHCIS หรือบันทึกในแอปปีงบนี้ · “PDF ตามแบบฟอร์ม” พิมพ์เฉพาะคนที่มีผลคัดกรองในระบบนี้ (คนที่ทำใน JHCIS เดิมไม่มีผลละเอียด)</p>
        </div>

        <div className="border-t pt-3"><H>รายหมู่บ้าน</H>
          <select aria-label="เลือกหมู่บ้าน" className="input mt-1" value={vil} onChange={(e) => setVil(e.target.value)}><option value="">เลือกหมู่บ้าน…</option>{nos.map((no) => <option key={no} value={no}>ม.{no} {vname(no)} ({rows.filter((r) => String(r.villageNo) === no).length} ราย)</option>)}</select>
          <div className="mt-2 flex flex-wrap gap-2">
            <Btn icon={FileSpreadsheet} disabled={!vRows.length || !!busy} onClick={() => run('all', vRows, `ncd-moo${vil}-${todayStr()}`)}>Excel หมู่นี้ ({vRows.length})</Btn>
            <Btn icon={FileText} disabled={!vRows.length} onClick={() => openNcdFormPrint(vRows)}>PDF แบบฟอร์มหมู่นี้ ({vRows.length})</Btn>
            <Btn icon={ClipboardList} disabled={!vRows.length || !!busy} onClick={() => run('jhcis', vRows)}>ใบรหัส JHCIS หมู่นี้</Btn>
          </div>
        </div>

        <div className="border-t pt-3"><H>รายบุคคล</H>
          <div className="relative mt-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input aria-label="ค้นหาชื่อหรือเลขบัตร" className="input pl-9" placeholder="พิมพ์ชื่อ หรือเลขบัตร เพื่อเลือกรายบุคคล" value={pq} onChange={(e) => setPq(e.target.value)} /></div>
          <ul className="mt-2 space-y-1">
            {people.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border p-2 text-sm">
                <User className="h-4 w-4 text-slate-400" />
                <div className="min-w-0 flex-1"><b>{r.name}</b><div className="text-xs text-slate-500">ม.{r.villageNo || '-'} · {r.screenDate} · {OVL[r.overall] || ''}</div></div>
                <Btn icon={FileText} onClick={() => openNcdFormPrint([r])}>PDF</Btn>
                <Btn icon={FileSpreadsheet} disabled={!!busy} onClick={() => run('all', [r], `ncd-${String(r.cid || r.id).slice(-6)}-${r.screenDate}`)}>Excel</Btn>
              </li>))}
            {pq.trim() && !people.length && <li className="p-2 text-center text-xs text-slate-500">ไม่พบรายชื่อที่ตรงกัน</li>}
          </ul>
        </div>
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
