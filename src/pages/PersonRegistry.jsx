// หน้าทะเบียนรายบุคคล (ผู้สูงอายุ / ผู้พิการ / ผู้ป่วยจิตเวช) — อ่านโครงสร้างจาก src/config/personRegistries.js
// ฟีเจอร์: กรองรายหมู่บ้าน (ชิปหมู่ที่พร้อมจำนวน) · ค้นหา · กรองตามตัวกรองเฉพาะทะเบียน/สถานะ · เพิ่ม/แก้ไข/ลบ
//          ดาวน์โหลดแบบฟอร์ม Excel · นำเข้า Excel (ตรวจก่อนนำเข้า ข้ามหรืออัปเดตรายการที่เลขบัตรซ้ำ) · ส่งออก Excel
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { ArrowLeft, Download, FileDown, Loader2, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { canWrite } from '../lib/roles';
import { writeAudit } from '../lib/audit';
import { exportXlsx } from '../lib/exportFile';
import { calcDuration, fmtDate, todayStr } from '../lib/thai';
import { groupOfPath } from '../config/menu';
import { PageHeader } from '../components/Logo';
import ThaiDateInput from '../components/ThaiDateInput';
import { Badge, ConfirmDialog, EmptyState, ErrorState, Modal, Spinner, Toast } from '../components/ui';

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const mooKey = (v) => String(v ?? '').replace(/[^\d]/g, '') || clean(v); // "หมู่ 5" / "5" -> "5"
const mooNum = (v) => Number(mooKey(v)) || 999;

// ตรวจเลขบัตรประชาชนไทย 13 หลัก (checksum) — ใช้เป็น "คำเตือน" ไม่ใช่ข้อห้าม (ข้อมูลจริงบางรายอาจไม่ครบ/ไม่มีเลข)
function idCardChecksumOk(id) {
  if (!/^\d{13}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(id[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(id[12]);
}

// แปลงวันที่จากไฟล์ Excel/ข้อความ -> YYYY-MM-DD (รับ พ.ศ. หรือ ค.ศ. รูปแบบ วว/ดด/ปปปป หรือ ปปปป-ดด-วว) ไม่ผ่าน = null
function parseDateText(v) {
  const s = clean(v);
  if (!s) return '';
  let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  let d; let mo; let y;
  if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; } else {
    m = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
    if (!m) return null;
    y = +m[1]; mo = +m[2]; d = +m[3];
  }
  if (y > 2400) y -= 543;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// สีประจำหมู่บ้าน (คงที่ตามเลขหมู่) — ใช้กับแถบกรองหมู่บ้านและป้ายหมู่/บ้านในตาราง
const VCOL = [
  { chip: 'bg-rose-100 text-rose-900 ring-rose-300 hover:bg-rose-200', on: 'bg-rose-600 text-white ring-rose-700', badge: 'bg-rose-100 text-rose-800' },
  { chip: 'bg-orange-100 text-orange-900 ring-orange-300 hover:bg-orange-200', on: 'bg-orange-500 text-white ring-orange-600', badge: 'bg-orange-100 text-orange-800' },
  { chip: 'bg-amber-100 text-amber-900 ring-amber-300 hover:bg-amber-200', on: 'bg-amber-500 text-white ring-amber-600', badge: 'bg-amber-100 text-amber-800' },
  { chip: 'bg-lime-100 text-lime-900 ring-lime-300 hover:bg-lime-200', on: 'bg-lime-600 text-white ring-lime-700', badge: 'bg-lime-100 text-lime-800' },
  { chip: 'bg-emerald-100 text-emerald-900 ring-emerald-300 hover:bg-emerald-200', on: 'bg-emerald-600 text-white ring-emerald-700', badge: 'bg-emerald-100 text-emerald-800' },
  { chip: 'bg-cyan-100 text-cyan-900 ring-cyan-300 hover:bg-cyan-200', on: 'bg-cyan-600 text-white ring-cyan-700', badge: 'bg-cyan-100 text-cyan-800' },
  { chip: 'bg-sky-100 text-sky-900 ring-sky-300 hover:bg-sky-200', on: 'bg-sky-600 text-white ring-sky-700', badge: 'bg-sky-100 text-sky-800' },
  { chip: 'bg-indigo-100 text-indigo-900 ring-indigo-300 hover:bg-indigo-200', on: 'bg-indigo-600 text-white ring-indigo-700', badge: 'bg-indigo-100 text-indigo-800' },
  { chip: 'bg-violet-100 text-violet-900 ring-violet-300 hover:bg-violet-200', on: 'bg-violet-600 text-white ring-violet-700', badge: 'bg-violet-100 text-violet-800' },
  { chip: 'bg-fuchsia-100 text-fuchsia-900 ring-fuchsia-300 hover:bg-fuchsia-200', on: 'bg-fuchsia-600 text-white ring-fuchsia-700', badge: 'bg-fuchsia-100 text-fuchsia-800' },
];
const vcol = (k) => VCOL[(Number(String(k).replace(/\D/g, '')) || 0) % VCOL.length];

const ageOf = (birthday) => { const d = birthday ? calcDuration(birthday) : null; return d ? d.years : null; };

function FieldInput({ f, value, onChange, mooOptions }) {
  const id = `pf-${f.key}`;
  if (f.type === 'select') {
    return (
      <select id={id} className="input" value={value || ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">- ไม่ระบุ -</option>
        {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (f.type === 'date') return <ThaiDateInput id={id} value={value || ''} onChange={onChange} yearsBack={f.key === 'birthday' ? 110 : 30} yearsForward={f.key === 'cardExpire' || f.key === 'nextAppt' ? 15 : 0} />;
  if (f.type === 'textarea') return <textarea id={id} rows={2} className="input" value={value || ''} onChange={(e) => onChange(e.target.value)} />;
  const listId = f.key === 'moo' ? 'pf-moo-list' : f.datalist ? `pf-${f.key}-list` : undefined;
  return (
    <>
      <input
        id={id}
        className="input"
        inputMode={f.type === 'tel' || f.type === 'idcard' || f.key === 'moo' ? 'numeric' : undefined}
        maxLength={f.type === 'idcard' ? 13 : undefined}
        list={listId}
        value={value || ''}
        onChange={(e) => onChange(f.type === 'idcard' ? e.target.value.replace(/\D/g, '') : e.target.value)}
      />
      {f.key === 'moo' && <datalist id="pf-moo-list">{mooOptions.map((o) => <option key={o} value={o} />)}</datalist>}
      {f.datalist && <datalist id={`pf-${f.key}-list`}>{f.datalist.map((o) => <option key={o} value={o} />)}</datalist>}
    </>
  );
}

function PersonForm({ cfg, rows, initial, villageOf, onClose, say }) {
  const [v, setV] = useState(() => {
    const base = { ...(initial || {}) };
    cfg.fields.forEach((f) => { if (base[f.key] === undefined) base[f.key] = f.default || ''; });
    return base;
  });
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState({});
  const set = (k) => (val) => {
    setV((p) => {
      const next = { ...p, [k]: val };
      // เลือกหมู่ที่เดิมแล้วเติมชื่อหมู่บ้านให้อัตโนมัติ (ถ้ายังไม่ได้กรอก)
      if (k === 'moo' && !p.village && villageOf[mooKey(val)]) next.village = villageOf[mooKey(val)];
      return next;
    });
  };
  const mooOptions = useMemo(() => [...new Set(rows.map((r) => mooKey(r.moo)).filter(Boolean))].sort((a, b) => mooNum(a) - mooNum(b)), [rows]);

  const submit = async (e) => {
    e.preventDefault();
    const out = {};
    cfg.fields.forEach((f) => { out[f.key] = f.type === 'date' || f.type === 'select' ? (v[f.key] || '') : clean(v[f.key]); });
    out.moo = mooKey(out.moo);
    const er = {};
    cfg.fields.forEach((f) => { if (f.required && !out[f.key]) er[f.key] = 'จำเป็นต้องกรอก'; });
    if (out.idCard && out.idCard.length !== 13) er.idCard = 'เลขบัตรประชาชนต้องมี 13 หลัก';
    const dup = out.idCard && rows.find((r) => r.id !== initial?.id && r.idCard === out.idCard);
    if (dup) er.idCard = `เลขบัตรนี้มีในทะเบียนแล้ว (${dup.name})`;
    setErrs(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      if (initial?.id) {
        await updateDoc(doc(db, cfg.key, initial.id), { ...out, updatedAt: serverTimestamp() });
        await writeAudit({ action: 'update', module: cfg.key, docId: initial.id, label: out.name });
        say({ type: 'ok', text: 'บันทึกการแก้ไขแล้ว' });
      } else {
        const ref = await addDoc(collection(db, cfg.key), { ...out, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        await writeAudit({ action: 'create', module: cfg.key, docId: ref.id, label: out.name });
        say({ type: 'ok', text: 'เพิ่มรายการแล้ว' });
      }
      onClose();
    } catch (err) {
      say({ type: 'error', text: 'ไม่สำเร็จ: ' + (err.code || err.message) });
    } finally { setBusy(false); }
  };

  return (
    <Modal wide title={`${initial?.id ? 'แก้ไข' : 'เพิ่ม'}${cfg.noun}`} onClose={onClose}
      footer={<button className="btn btn-primary w-full" onClick={submit} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} บันทึก</button>}>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        {cfg.fields.map((f) => (
          <div key={f.key} className={f.type === 'textarea' || f.key === 'name' ? 'sm:col-span-2' : ''}>
            <label htmlFor={`pf-${f.key}`} className="mb-1 block text-sm font-medium text-slate-600">{f.label}{f.required && <span className="text-red-600"> *</span>}</label>
            <FieldInput f={f} value={v[f.key]} onChange={set(f.key)} mooOptions={mooOptions} />
            {f.key === 'idCard' && v.idCard?.length === 13 && !idCardChecksumOk(v.idCard) && <p className="mt-1 text-xs text-amber-700">⚠ เลขบัตรไม่ผ่านการตรวจหลักตรวจสอบ ลองตรวจสอบอีกครั้ง (ยังบันทึกได้)</p>}
            {f.hint && !errs[f.key] && <p className="mt-1 text-xs text-slate-400">{f.hint}</p>}
            {errs[f.key] && <p className="mt-1 text-xs text-red-600">{errs[f.key]}</p>}
          </div>
        ))}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

// ===== แบบฟอร์ม Excel สำหรับนำเข้า =====
async function downloadTemplate(cfg) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('ข้อมูลนำเข้า');
  const heads = cfg.fields.map((f) => f.label + (f.required ? ' *' : ''));
  ws.addRow(heads);
  const example = {
    idCard: '1234567890123', namePrefix: 'นาง', name: 'ตัวอย่าง ใจดี', gender: 'หญิง', birthday: '15/03/2500', houseNo: '12/3', moo: '1', village: 'บ้านหนองสนม',
    phone: '0812345678', caregiver: 'ญาติ', caregiverPhone: '0898765432', status: 'มีชีวิตอยู่',
  };
  ws.addRow(cfg.fields.map((f) => example[f.key] ?? (f.type === 'select' ? f.options[0] : f.type === 'date' ? '01/01/2565' : '')));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: 'middle', wrapText: true };
  ws.getRow(1).height = 32;
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${cfg.reportColor || 'E8F4FC'}` } };
  ws.getRow(2).font = { italic: true, color: { argb: 'FF888888' } };
  cfg.fields.forEach((f, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.max(14, f.label.length + 4);
    // คอลัมน์ข้อความล้วน: กัน Excel แปลงเลขบัตร/เบอร์/วันที่เป็นตัวเลข
    if (['idcard', 'tel', 'date', 'text'].includes(f.type)) col.numFmt = '@';
    if (f.type === 'select') {
      for (let r = 2; r <= 1500; r += 1) {
        ws.getCell(r, i + 1).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${f.options.join(',')}"`] };
      }
    }
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const help = wb.addWorksheet('คำอธิบาย');
  help.columns = [{ width: 28 }, { width: 90 }];
  help.addRow([`แบบฟอร์มนำเข้า${cfg.title}`]);
  help.getRow(1).font = { bold: true, size: 14 };
  help.addRow([]);
  help.addRow(['วิธีใช้', 'กรอกข้อมูลที่แผ่น "ข้อมูลนำเข้า" โดยลบแถวตัวอย่าง (แถวที่ 2 ตัวอักษรเอียง) ก่อน แล้วนำไฟล์ไปเลือกที่ปุ่ม "นำเข้า Excel" ในระบบ']);
  help.addRow(['ห้ามเปลี่ยน', 'ชื่อหัวคอลัมน์แถวที่ 1 (ระบบจับคู่ข้อมูลจากชื่อหัวคอลัมน์) — เรียงคอลัมน์ใหม่หรือลบคอลัมน์ที่ไม่ใช้ได้']);
  help.addRow(['วันที่', 'พิมพ์ วว/ดด/ปปปป เป็น พ.ศ. เช่น 15/03/2500 (รับ ค.ศ. ได้เช่นกัน)']);
  help.addRow(['เลขบัตรประชาชน', '13 หลัก ไม่ต้องมีขีด ระบบใช้ตรวจสอบรายการซ้ำ']);
  help.addRow(['หมู่ที่', 'ใส่ตัวเลข เช่น 1, 2, 3 (ใช้กรองรายหมู่บ้าน)']);
  help.addRow(['* ', 'ช่องที่มีเครื่องหมาย * ต้องกรอก']);
  help.addRow([]);
  help.addRow(['ตัวเลือกของช่องแบบเลือก', '']);
  help.getRow(help.rowCount).font = { bold: true };
  cfg.fields.filter((f) => f.type === 'select').forEach((f) => help.addRow([f.label, f.options.join(' / ')]));
  help.eachRow((r) => { r.alignment = { wrapText: true, vertical: 'top' }; });

  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = `แบบฟอร์มนำเข้า_${cfg.title}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// อ่านไฟล์ Excel -> วิเคราะห์ทีละแถว (ยังไม่เขียนฐานข้อมูล)
async function analyzeFile(cfg, file, rows) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer());
  const sheet = wb.Sheets['ข้อมูลนำเข้า'] || wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false, dateNF: 'dd/mm/yyyy' });
  const byLabel = new Map(cfg.fields.map((f) => [f.label, f]));
  const existing = new Map(rows.map((r) => [r.idCard || `n:${clean(r.name)}|${mooKey(r.moo)}`, r]));
  const seen = new Set();
  const items = [];
  raw.forEach((rec, idx) => {
    const line = idx + 2;
    const data = {};
    Object.entries(rec).forEach(([h, val]) => {
      const f = byLabel.get(clean(String(h).replace(/\*/g, '')));
      if (f) data[f.key] = val;
    });
    if (!Object.values(data).some((x) => clean(x))) return; // แถวว่าง
    const out = {};
    const errors = [];
    const warns = [];
    cfg.fields.forEach((f) => {
      const val = data[f.key];
      if (f.type === 'date') {
        const d = parseDateText(val);
        if (d === null) { errors.push(`${f.label}: รูปแบบวันที่ไม่ถูกต้อง ("${val}")`); out[f.key] = ''; } else out[f.key] = d;
      } else if (f.type === 'select') {
        const t = clean(val);
        if (!t) out[f.key] = f.default || '';
        else {
          const hit = f.options.find((o) => o === t) || f.options.find((o) => o.startsWith(t) || t.startsWith(o.split(' ')[0]));
          if (hit) out[f.key] = hit; else { out[f.key] = ''; warns.push(`${f.label}: "${t}" ไม่ตรงตัวเลือก (เว้นว่างไว้)`); }
        }
      } else if (f.type === 'idcard') out[f.key] = clean(val).replace(/\D/g, '');
      else if (f.type === 'tel') out[f.key] = clean(val).replace(/[^\d,\-/ ]/g, '');
      else out[f.key] = clean(val);
    });
    out.moo = mooKey(out.moo);
    if (!out.name) errors.push('ไม่มีชื่อ - สกุล');
    if (!out.moo && !cfg.idOptional) errors.push('ไม่มีหมู่ที่');
    if (!out.idCard) { if (!cfg.idOptional) errors.push('ไม่มีเลขบัตรประชาชน'); else warns.push('ยังไม่มีเลขบัตรประชาชน (เติมภายหลังได้)'); }
    else if (out.idCard.length !== 13) errors.push(`เลขบัตรไม่ครบ 13 หลัก (${out.idCard})`);
    else if (!idCardChecksumOk(out.idCard)) warns.push('เลขบัตรไม่ผ่านหลักตรวจสอบ');
    // กุญแจตรวจซ้ำ: เลขบัตร ถ้าไม่มี (เฉพาะทะเบียนที่ยอมให้ว่าง) ใช้ ชื่อ+หมู่
    const dkey = out.idCard || `n:${out.name}|${out.moo}`;
    let kind = 'new';
    if (!errors.length) {
      if (seen.has(dkey)) { errors.push(out.idCard ? 'เลขบัตรซ้ำกับแถวอื่นในไฟล์' : 'ชื่อ+หมู่ซ้ำกับแถวอื่นในไฟล์'); } else seen.add(dkey);
      if (!errors.length && existing.has(dkey)) kind = 'dup';
    }
    items.push({ line, out, errors, warns, kind: errors.length ? 'error' : kind, existingId: existing.get(dkey)?.id });
  });
  return items;
}

function ImportModal({ cfg, rows, onClose, say }) {
  const [items, setItems] = useState(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('skip');
  const pick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name); setBusy(true);
    try { setItems(await analyzeFile(cfg, file, rows)); } catch (err) { say({ type: 'error', text: 'อ่านไฟล์ไม่สำเร็จ: ' + (err.message || err) }); } finally { setBusy(false); }
  };
  const cnt = (k) => (items || []).filter((i) => i.kind === k).length;
  const go = async () => {
    const todo = items.filter((i) => i.kind === 'new' || (i.kind === 'dup' && mode === 'update'));
    if (!todo.length) return say({ type: 'error', text: 'ไม่มีรายการที่นำเข้าได้' });
    setBusy(true);
    try {
      for (let s = 0; s < todo.length; s += 400) {
        const batch = writeBatch(db);
        todo.slice(s, s + 400).forEach((i) => {
          if (i.kind === 'dup') batch.update(doc(db, cfg.key, i.existingId), { ...i.out, updatedAt: serverTimestamp() });
          else batch.set(doc(collection(db, cfg.key)), { ...i.out, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        });
        await batch.commit();
      }
      await writeAudit({ action: 'create', module: cfg.key, label: `นำเข้าจาก Excel "${fileName}": เพิ่ม ${todo.filter((i) => i.kind === 'new').length} / อัปเดต ${todo.filter((i) => i.kind === 'dup').length}` });
      say({ type: 'ok', text: `นำเข้าแล้ว ${todo.length} รายการ` });
      onClose();
    } catch (err) {
      say({ type: 'error', text: 'นำเข้าไม่สำเร็จ: ' + (err.code || err.message) });
    } finally { setBusy(false); }
  };
  const problems = (items || []).filter((i) => i.errors.length || i.warns.length).slice(0, 60);
  return (
    <Modal wide title={`นำเข้า${cfg.title}จาก Excel`} onClose={onClose}
      footer={items && <button className="btn btn-primary w-full" onClick={go} disabled={busy || (cnt('new') + (mode === 'update' ? cnt('dup') : 0) === 0)}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} นำเข้า {cnt('new') + (mode === 'update' ? cnt('dup') : 0)} รายการ</button>}>
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-outline" onClick={() => downloadTemplate(cfg)}><FileDown className="h-4 w-4" /> ดาวน์โหลดแบบฟอร์ม Excel</button>
          <span className="text-slate-500">กรอกตามแบบฟอร์ม แล้วเลือกไฟล์ด้านล่าง</span>
        </div>
        <input type="file" accept=".xlsx,.xls" onChange={pick} disabled={busy} className="block w-full text-sm" aria-label="เลือกไฟล์ Excel" />
        {busy && !items && <Spinner label="กำลังอ่านไฟล์..." />}
        {items && (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-emerald-100 text-emerald-800">ใหม่ {cnt('new')}</Badge>
              <Badge className="bg-amber-100 text-amber-800">เลขบัตรซ้ำกับในระบบ {cnt('dup')}</Badge>
              <Badge className="bg-red-100 text-red-700">ผิดพลาด (ไม่นำเข้า) {cnt('error')}</Badge>
            </div>
            {cnt('dup') > 0 && (
              <div className="rounded-lg bg-amber-50 p-2 text-amber-900">
                <label className="mr-4"><input type="radio" name="imode" checked={mode === 'skip'} onChange={() => setMode('skip')} /> ข้ามรายการที่ซ้ำ</label>
                <label><input type="radio" name="imode" checked={mode === 'update'} onChange={() => setMode('update')} /> อัปเดตข้อมูลเดิมด้วยข้อมูลจากไฟล์</label>
              </div>
            )}
            {problems.length > 0 && (
              <div className="max-h-52 overflow-auto rounded-lg border border-slate-200 p-2 text-xs">
                {problems.map((i) => (
                  <div key={i.line} className={i.errors.length ? 'text-red-700' : 'text-amber-700'}>
                    แถว {i.line} ({i.out.name || '-'}): {[...i.errors, ...i.warns].join(' · ')}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

export default function PersonRegistry({ cfg }) {
  const { profile } = useAuth();
  const writable = canWrite(profile.role, cfg.key);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [moo, setMoo] = useState('all');
  const [extra, setExtra] = useState('all');
  const [grp, setGrp] = useState('all');
  const [status, setStatus] = useState('all');
  const [form, setForm] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const say = (t) => { setToast(t); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 4500); };
  const groupKey = groupOfPath(cfg.path);

  useEffect(() => {
    setRows(null); setError(''); setMoo('all'); setExtra('all'); setGrp('all'); setStatus('all'); setQ('');
    return onSnapshot(collection(db, cfg.key),
      (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => mooNum(a.moo) - mooNum(b.moo) || String(a.name || '').localeCompare(String(b.name || ''), 'th'))),
      (e) => setError(e.code === 'permission-denied' ? 'ไม่มีสิทธิ์เข้าถึงข้อมูลส่วนนี้ (ต้องเผยแพร่ Firestore Rules เวอร์ชันล่าสุดก่อน)' : e.message));
  }, [cfg.key]);

  // หมู่บ้านที่มีในข้อมูล + จำนวนราย + ชื่อหมู่บ้านที่พบบ่อยของแต่ละหมู่
  const villages = useMemo(() => {
    const map = new Map();
    (rows || []).forEach((r) => {
      const k = mooKey(r.moo) || '-';
      const e = map.get(k) || { k, n: 0, names: {} };
      e.n += 1;
      if (clean(r.village)) e.names[clean(r.village)] = (e.names[clean(r.village)] || 0) + 1;
      map.set(k, e);
    });
    return [...map.values()].sort((a, b) => mooNum(a.k) - mooNum(b.k)).map((e) => ({ ...e, name: Object.entries(e.names).sort((a, b) => b[1] - a[1])[0]?.[0] || '' }));
  }, [rows]);
  const villageOf = useMemo(() => Object.fromEntries(villages.map((v) => [v.k, v.name])), [villages]);

  const filterField = cfg.fields.find((f) => f.key === cfg.filterKey);
  const shown = useMemo(() => (rows || []).filter((r) => {
    if (cfg.groupKey && grp !== 'all' && r[cfg.groupKey] !== grp) return false;
    if (moo !== 'all' && (mooKey(r.moo) || '-') !== moo) return false;
    if (extra !== 'all' && r[cfg.filterKey] !== extra) return false;
    if (status !== 'all' && (r.status || 'มีชีวิตอยู่') !== status) return false;
    const t = clean(q).toLowerCase();
    if (!t) return true;
    return `${r.namePrefix || ''}${r.name || ''} ${r.idCard || ''} ${r.houseNo || ''} ${r.village || ''} ${r.phone || ''} ${r.caregiver || ''}`.toLowerCase().includes(t);
  }), [rows, moo, extra, grp, status, q, cfg.filterKey, cfg.groupKey]);

  const doDelete = async () => {
    setDeleting(true);
    try {
      await deleteDoc(doc(db, cfg.key, toDelete.id));
      await writeAudit({ action: 'delete', module: cfg.key, docId: toDelete.id, label: toDelete.name });
      say({ type: 'ok', text: 'ลบรายการแล้ว' });
      setToDelete(null);
    } catch (err) { say({ type: 'error', text: 'ลบไม่สำเร็จ: ' + (err.code || err.message) }); } finally { setDeleting(false); }
  };

  const doReport = async () => {
    if (!(rows || []).length) return say({ type: 'error', text: 'ยังไม่มีข้อมูลให้ทำรายงาน' });
    try { const m = await import('../lib/personReports'); await m.exportMentalReport(cfg, rows, villageOf); say({ type: 'ok', text: 'สร้างรายงานแล้ว' }); } catch (err) { say({ type: 'error', text: 'สร้างรายงานไม่สำเร็จ: ' + (err.message || err) }); }
  };

  const doExport = async () => {
    if (!shown.length) return say({ type: 'error', text: 'ไม่มีข้อมูลให้ส่งออก' });
    const data = shown.map((r, i) => {
      const o = { ลำดับ: i + 1 };
      cfg.fields.forEach((f) => {
        o[f.label] = f.type === 'date' ? (r[f.key] ? fmtDate(r[f.key]) : '') : f.key === 'name' ? `${r.namePrefix || ''}${r.name || ''}` : (r[f.key] || '');
        if (f.key === 'birthday') o['อายุ (ปี)'] = ageOf(r.birthday) ?? '';
      });
      return o;
    });
    await exportXlsx(data, cfg.noun, `${cfg.title}${moo !== 'all' ? `_หมู่${moo}` : ''}_${todayStr()}`);
    writeAudit({ action: 'export', module: cfg.key, label: `ส่งออก${cfg.title} ${data.length} ราย${moo !== 'all' ? ` (หมู่ ${moo})` : ''}` }).catch(() => {});
  };

  // คอลัมน์เพิ่มเติมของแต่ละทะเบียน (ที่ตั้ง list: true และไม่ใช่คอลัมน์พื้นฐาน)
  const BASE = ['idCard', 'name', 'birthday', 'houseNo', 'moo', 'village', 'status'];
  const extraCols = cfg.fields.filter((f) => f.list && !BASE.includes(f.key));
  const activeCount = (rows || []).filter((r) => (r.status || 'มีชีวิตอยู่') === 'มีชีวิตอยู่').length;

  return (
    <div className="mx-auto max-w-7xl p-4 lg:p-6">
      {groupKey && <Link to={`/group/${groupKey}`} className="mb-2 inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"><ArrowLeft className="h-4 w-4" /> กลับหน้ากลุ่มงาน</Link>}
      <PageHeader
        emoji={cfg.emoji}
        big
        tone={cfg.headerTone}
        title={cfg.title}
        subtitle={rows ? `ทั้งหมด ${rows.length} ${cfg.unit} · ยังมีชีวิตอยู่ ${activeCount} ${cfg.unit} · ${villages.length} หมู่บ้าน` : 'กำลังโหลด...'}
        actions={(
          <div className="flex flex-wrap gap-2">
            {writable && <button className="btn bg-white text-slate-800 hover:bg-slate-50" onClick={() => setForm({})}><Plus className="h-4 w-4" /> เพิ่ม{cfg.noun}</button>}
            {writable && <button className="btn bg-white/90 text-slate-800 hover:bg-white" onClick={() => setShowImport(true)}><Upload className="h-4 w-4" /> นำเข้า Excel</button>}
            <button className="btn bg-white/90 text-slate-800 hover:bg-white" onClick={doExport}><Download className="h-4 w-4" /> ส่งออก Excel</button>
            {cfg.report && <button className="btn bg-white/90 text-slate-800 hover:bg-white" onClick={doReport}><FileDown className="h-4 w-4" /> รายงาน/ทะเบียน</button>}
          </div>
        )}
      />
      {cfg.sensitive && <p className="mb-3 rounded-lg bg-violet-50 p-2 text-sm text-violet-800">🔒 ข้อมูลสุขภาพจิตเป็นข้อมูลอ่อนไหวตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล — ใช้เพื่อการดูแลรักษาเท่านั้น ไม่นำออกนอกหน่วยงาน/ไม่เผยแพร่ต่อสาธารณะ</p>}

      {/* กลุ่มผู้ป่วย (แท็บ) + กลุ่มสี — เฉพาะทะเบียนที่กำหนด groupKey/colorKey */}
      {cfg.groupKey && (
        <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="กรองตามกลุ่มผู้ป่วย">
          {[['all', `ทุกกลุ่ม (${rows?.length ?? 0})`], ...(cfg.fields.find((f) => f.key === cfg.groupKey)?.options || []).map((o) => [o, `${o} (${(rows || []).filter((r) => r[cfg.groupKey] === o).length})`])].map(([k, label]) => (
            <button key={k} aria-pressed={grp === k} onClick={() => setGrp(k)} className={`rounded-lg px-3 py-1.5 text-sm font-bold ring-1 transition ${grp === k ? 'bg-violet-700 text-white ring-violet-800' : `${cfg.optionStyle?.[cfg.groupKey]?.[k] || 'bg-white text-slate-700'} ring-slate-200 hover:brightness-95`}`}>{label}</button>
          ))}
        </div>
      )}
      {cfg.colorKey && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="กรองตามกลุ่มสี">
          <span className="text-sm text-slate-500">กลุ่มสี:</span>
          {['all', ...cfg.fields.find((f) => f.key === cfg.colorKey).options].map((o) => (
            <button key={o} aria-pressed={extra === o} onClick={() => setExtra(o)} title={cfg.colorHelp?.[o]} className={`rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-black/10 transition ${o === 'all' ? (extra === 'all' ? 'bg-slate-800 text-white' : 'bg-white text-slate-700') : cfg.optionStyle[cfg.colorKey][o]} ${extra === o && o !== 'all' ? 'outline outline-2 outline-offset-2 outline-slate-800' : o !== 'all' && extra !== 'all' ? 'opacity-50' : ''}`}>
              {o === 'all' ? 'ทุกสี' : `${o} (${(rows || []).filter((r) => r[cfg.colorKey] === o).length})`}
            </button>
          ))}
          {cfg.colorHelp && <span className="ml-1 text-xs text-slate-500">{Object.entries(cfg.colorHelp).map(([k, v]) => `${k} = ${v}`).join(' · ')}</span>}
        </div>
      )}

      {/* กรองรายหมู่บ้าน */}
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="กรองตามหมู่บ้าน">
        <button className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${moo === 'all' ? 'bg-brand-700 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-brand-50'}`} onClick={() => setMoo('all')}>
          ทุกหมู่บ้าน ({rows?.length ?? 0})
        </button>
        {villages.map((v) => (
          <button key={v.k} className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 transition ${moo === v.k ? `${vcol(v.k).on} shadow-md` : vcol(v.k).chip}`} aria-pressed={moo === v.k} onClick={() => setMoo(v.k)}>
            {v.k === '-' ? 'ไม่ระบุหมู่' : `หมู่ ${v.k}`}{v.name ? ` ${v.name}` : ''} ({v.n})
          </button>
        ))}
      </div>

      <div className="card mb-4 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
          <input className="input !pl-10" placeholder="ค้นหาชื่อ / เลขบัตร / บ้านเลขที่ / เบอร์โทร / ผู้ดูแล" value={q} onChange={(e) => setQ(e.target.value)} aria-label="ค้นหา" />
        </div>
        {filterField && !cfg.colorKey && (
          <select className="input" value={extra} onChange={(e) => setExtra(e.target.value)} aria-label={cfg.filterLabel}>
            <option value="all">{cfg.filterLabel}: ทั้งหมด</option>
            {filterField.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="สถานะ">
          <option value="all">สถานะ: ทั้งหมด</option>
          {['มีชีวิตอยู่', 'เสียชีวิต', 'ย้ายออก'].map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>

      <div className="card overflow-x-auto">
        {error ? <ErrorState message={error} /> : rows === null ? <Spinner /> : shown.length === 0 ? (
          <EmptyState title={rows.length === 0 ? `ยังไม่มีข้อมูล${cfg.noun}` : 'ไม่พบรายการตามเงื่อนไข'} hint={rows.length === 0 && writable ? 'กด "เพิ่ม" หรือ "นำเข้า Excel" (ดาวน์โหลดแบบฟอร์มได้ในหน้านำเข้า)' : undefined} />
        ) : (
          <table className="w-full min-w-[1400px] text-left [&_th]:whitespace-nowrap">
            <thead className="bg-slate-100 text-sm text-slate-600">
              <tr>
                <th className="w-12 px-3 py-2">#</th>
                <th className="px-3 py-2">CID (เลขบัตรประชาชน)</th>
                <th className="px-3 py-2">ชื่อ - สกุล</th>
                <th className="px-3 py-2">วันเดือนปีเกิด</th>
                <th className="w-16 px-3 py-2">อายุ</th>
                <th className="px-3 py-2">บ้านเลขที่</th>
                <th className="w-16 px-3 py-2">หมู่</th>
                <th className="px-3 py-2">บ้าน</th>
                {extraCols.map((f) => <th key={f.key} className="px-3 py-2">{f.label}</th>)}
                <th className="w-28 px-3 py-2">สถานะ</th>
                {writable && <th className="w-24 px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={r.id} className="border-t border-slate-100 align-top">
                  <td className={`border-l-4 px-3 py-2 text-sm text-slate-400 ${cfg.colorKey ? (cfg.optionBorder?.[r[cfg.colorKey]] || 'border-l-slate-200') : 'border-l-transparent'}`}>{i + 1}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-sm text-slate-700">{r.idCard || '-'}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-800">{r.namePrefix}{r.name}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-sm">{r.birthday ? fmtDate(r.birthday) : '-'}</td>
                  <td className="px-3 py-2 text-sm">{ageOf(r.birthday) ?? '-'}</td>
                  <td className="px-3 py-2 text-sm text-slate-600">{r.houseNo || '-'}</td>
                  <td className="px-3 py-2 text-sm"><span className={`inline-block min-w-8 rounded-md px-2 py-0.5 text-center font-bold ${vcol(r.moo).badge}`}>{mooKey(r.moo) || '-'}</span></td>
                  <td className="px-3 py-2 text-sm">{r.village ? <span className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 font-medium ${vcol(r.moo).badge}`}>{r.village}</span> : '-'}</td>
                  {extraCols.map((f) => (
                    <td key={f.key} className="px-3 py-2 text-sm text-slate-600">
                      {f.type === 'date' ? (r[f.key] ? fmtDate(r[f.key]) : '-') : cfg.optionStyle?.[f.key]?.[r[f.key]] ? <span className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-bold ${cfg.optionStyle[f.key][r[f.key]]}`}>{r[f.key]}</span> : (r[f.key] || '-')}
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <Badge className={(r.status || 'มีชีวิตอยู่') === 'มีชีวิตอยู่' ? 'bg-emerald-100 text-emerald-800' : (r.status === 'เสียชีวิต' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-800')}>{r.status || 'มีชีวิตอยู่'}</Badge>
                  </td>
                  {writable && (
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button className="btn btn-outline !px-2 !py-1 text-sm" onClick={() => setForm(r)} title="แก้ไข" aria-label={`แก้ไข ${r.name}`}><Pencil className="h-4 w-4" /></button>
                        <button className="btn btn-outline !px-2 !py-1 text-sm text-red-600" onClick={() => setToDelete(r)} title="ลบ" aria-label={`ลบ ${r.name}`}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-2 text-sm text-slate-500">แสดง {shown.length} จาก {rows?.length ?? 0} {cfg.unit}</p>

      {form && <PersonForm cfg={cfg} rows={rows || []} initial={form.id ? form : null} villageOf={villageOf} onClose={() => setForm(null)} say={say} />}
      {showImport && <ImportModal cfg={cfg} rows={rows || []} onClose={() => setShowImport(false)} say={say} />}
      {toDelete && <ConfirmDialog message={`ลบ "${toDelete.namePrefix || ''}${toDelete.name}" ออกจาก${cfg.title}หรือไม่?`} busy={deleting} onConfirm={doDelete} onCancel={() => setToDelete(null)} />}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
