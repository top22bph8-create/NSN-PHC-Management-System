// คลังตัวอย่างแบบฟอร์มรายงาน (งานควบคุมโรค): อัปโหลดไฟล์ Word/PDF/Excel/รูปจากภายนอก ตั้งชื่อแบบฟอร์ม เปิด/ดาวน์โหลด แก้ชื่อ และลบได้
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { ArrowLeft, Download, FileSpreadsheet, FileText, Image as ImageIcon, Loader2, Pencil, Search, Trash2, Upload } from 'lucide-react';
import { db, storage } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { PageHeader } from '../../components/Logo';
import { ConfirmDialog, Modal, Spinner } from '../../components/ui';
import { writeAudit } from '../../lib/audit';
import { fmtDate } from '../../lib/thai';
import { fmtSize } from './outbreakLib';

const MAX = 20 * 1024 * 1024;
const OK_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'webp'];
const CATS = ['แบบสอบสวนโรค', 'รายงานการสอบสวนโรค (E0/E1/E2)', 'แบบรายงานโรค (รง.506)', 'แบบรายงานสถานการณ์/ผลการควบคุมโรค', 'แบบฟอร์มอื่นๆ'];
const safeName = (n) => n.replace(/[^\w.\-฀-๿]/g, '_');
const extOf = (n) => String(n || '').split('.').pop().toLowerCase();
const lab = 'mb-1 block text-sm text-slate-600';
const icon = (e) => (['xls', 'xlsx'].includes(e) ? <FileSpreadsheet className="h-5 w-5 text-emerald-600" /> : ['jpg', 'jpeg', 'png', 'webp'].includes(e) ? <ImageIcon className="h-5 w-5 text-sky-600" /> : <FileText className={`h-5 w-5 ${e === 'pdf' ? 'text-red-600' : 'text-blue-600'}`} />);

export default function FormSamples() {
  const { user } = useAuth(); const [rows, setRows] = useState(null); const [q, setQ] = useState(''); const [msg, setMsg] = useState('');
  const [up, setUp] = useState(null); const [edit, setEdit] = useState(null); const [del, setDel] = useState(null); const [busy, setBusy] = useState(false); const inp = useRef(null);
  const say = (t) => { setMsg(t); setTimeout(() => setMsg(''), 6000); };
  useEffect(() => onSnapshot(collection(db, 'reportFormSamples'), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => { setRows([]); say('โหลดไม่สำเร็จ: ' + (e.code || e.message)); }), []);
  const list = useMemo(() => (rows || []).filter((r) => !q.trim() || `${r.name} ${r.category} ${r.note} ${r.fileName}`.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => String(a.category).localeCompare(String(b.category)) || String(a.name).localeCompare(String(b.name), 'th')), [rows, q]);

  const pick = (e) => {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    const ext = extOf(file.name);
    if (!OK_EXT.includes(ext)) return say(`ไม่รองรับไฟล์ .${ext} (รองรับ ${OK_EXT.join(', ')})`);
    if (file.size > MAX) return say(`${file.name} ใหญ่เกิน 20 MB`);
    setUp({ file, name: file.name.replace(/\.[^.]+$/, ''), category: CATS[0], note: '' });
  };
  const upload = async () => {
    const name = up.name.trim(); if (!name) return say('กรุณาตั้งชื่อแบบฟอร์ม');
    setBusy(true);
    try {
      const path = `outbreak-forms/${Date.now()}/${safeName(up.file.name)}`;
      await uploadBytes(ref(storage, path), up.file, { contentType: up.file.type || undefined });
      const r = await addDoc(collection(db, 'reportFormSamples'), { name, category: up.category.trim(), note: up.note.trim(), fileName: up.file.name, path, size: up.file.size, ext: extOf(up.file.name), createdBy: user?.email || '', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      await writeAudit({ action: 'create', module: 'outbreak', docId: r.id, label: `เพิ่มตัวอย่างแบบฟอร์ม “${name}”` }).catch(() => {});
      setUp(null); say('เพิ่มตัวอย่างแบบฟอร์มแล้ว');
    } catch (e) { say('อัปโหลดไม่สำเร็จ: ' + (e.code || e.message)); } finally { setBusy(false); }
  };
  const open = async (r) => { try { window.open(await getDownloadURL(ref(storage, r.path)), '_blank', 'noopener'); } catch (e) { say('เปิดไฟล์ไม่สำเร็จ: ' + (e.code || e.message)); } };
  const saveEdit = async () => {
    const name = edit.name.trim(); if (!name) return say('กรุณาตั้งชื่อแบบฟอร์ม');
    setBusy(true);
    try { await updateDoc(doc(db, 'reportFormSamples', edit.id), { name, category: edit.category.trim(), note: edit.note.trim(), updatedAt: serverTimestamp() }); setEdit(null); say('บันทึกแล้ว'); }
    catch (e) { say('บันทึกไม่สำเร็จ: ' + (e.code || e.message)); } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { try { await deleteObject(ref(storage, del.path)); } catch (e) { if (e.code !== 'storage/object-not-found') throw e; } await deleteDoc(doc(db, 'reportFormSamples', del.id)); await writeAudit({ action: 'delete', module: 'outbreak', docId: del.id, label: `ลบตัวอย่างแบบฟอร์ม “${del.name}”` }).catch(() => {}); setDel(null); say('ลบแล้ว'); }
    catch (e) { say('ลบไม่สำเร็จ: ' + (e.code || e.message)); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <Link to="/outbreak" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-50"><ArrowLeft className="h-4 w-4" /> กลับงานสอบสวนโรค</Link>
      <PageHeader emoji="🗂️" title="คลังตัวอย่างแบบฟอร์มรายงาน" tone="from-rose-600 via-rose-500 to-orange-500" subtitle="เก็บไฟล์ Word / PDF / Excel จากภายนอกไว้เป็นตัวอย่าง ตั้งชื่อ เปิดดู ดาวน์โหลด และลบได้"
        actions={<><input ref={inp} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp" className="hidden" onChange={pick} /><button className="btn bg-white text-rose-700 hover:bg-rose-50" onClick={() => inp.current?.click()}><Upload className="h-4 w-4" /> เพิ่มตัวอย่างแบบฟอร์ม</button></>} />
      {msg && <p className="rounded-lg bg-sky-50 px-3 py-2 text-sky-800 ring-1 ring-sky-200">{msg}</p>}
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input pl-9" placeholder="ค้นหาชื่อแบบฟอร์ม / หมวด / หมายเหตุ" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {rows === null ? <Spinner /> : !list.length ? <p className="card p-6 text-center text-slate-500">{rows.length ? 'ไม่พบรายการที่ค้นหา' : 'ยังไม่มีตัวอย่างแบบฟอร์ม — กด “เพิ่มตัวอย่างแบบฟอร์ม” เพื่ออัปโหลดไฟล์ Word/PDF'}</p> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((r) => (
            <div key={r.id} className="card flex flex-col gap-2 p-3.5">
              <div className="flex items-start gap-2.5"><div className="mt-0.5 rounded-lg bg-slate-50 p-2">{icon(r.ext)}</div>
                <div className="min-w-0 flex-1"><div className="font-semibold leading-snug text-slate-800">{r.name}</div><div className="mt-0.5 text-xs text-rose-700">{r.category}</div></div></div>
              {r.note && <p className="text-sm text-slate-600">{r.note}</p>}
              <div className="truncate text-xs text-slate-400" title={r.fileName}>{r.fileName} · {fmtSize(r.size)}{r.createdAt?.toDate ? ` · ${fmtDate(r.createdAt.toDate().toISOString().slice(0, 10))}` : ''}</div>
              <div className="mt-auto flex gap-2 pt-1"><button className="btn btn-outline flex-1 !py-1.5 text-sm" onClick={() => open(r)}><Download className="h-4 w-4" /> เปิด/ดาวน์โหลด</button>
                <button className="btn btn-outline !px-2.5 !py-1.5" aria-label="แก้ชื่อ" onClick={() => setEdit({ id: r.id, name: r.name, category: r.category || '', note: r.note || '' })}><Pencil className="h-4 w-4" /></button>
                <button className="btn btn-outline !px-2.5 !py-1.5 text-red-600" aria-label="ลบ" onClick={() => setDel(r)}><Trash2 className="h-4 w-4" /></button></div>
            </div>))}
        </div>)}

      {(up || edit) && (() => { const f = up || edit; const set = (p) => (up ? setUp((x) => ({ ...x, ...p })) : setEdit((x) => ({ ...x, ...p }))); return (
        <Modal title={up ? 'เพิ่มตัวอย่างแบบฟอร์ม' : 'แก้ไขข้อมูลแบบฟอร์ม'} onClose={() => !busy && (setUp(null), setEdit(null))}
          footer={<div className="flex justify-end gap-2"><button className="btn btn-outline" disabled={busy} onClick={() => { setUp(null); setEdit(null); }}>ยกเลิก</button><button className="btn btn-primary" disabled={busy} onClick={up ? upload : saveEdit}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} {up ? 'อัปโหลดและบันทึก' : 'บันทึก'}</button></div>}>
          <div className="space-y-3">
            {up && <p className="rounded-lg bg-slate-50 p-2 text-sm text-slate-600">ไฟล์: <b>{up.file.name}</b> ({fmtSize(up.file.size)})</p>}
            <label className="block"><span className={lab}>ชื่อแบบฟอร์ม</span><input className="input" autoFocus value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="เช่น แบบสอบสวนโรคมือ เท้า ปาก (กรมควบคุมโรค)" /></label>
            <label className="block"><span className={lab}>หมวดหมู่</span><input className="input" list="fs-cats" value={f.category} onChange={(e) => set({ category: e.target.value })} /><datalist id="fs-cats">{CATS.map((c) => <option key={c} value={c} />)}</datalist></label>
            <label className="block"><span className={lab}>หมายเหตุ (ไม่บังคับ)</span><textarea className="input min-h-[64px]" value={f.note} onChange={(e) => set({ note: e.target.value })} /></label>
          </div>
        </Modal>); })()}
      {del && <ConfirmDialog busy={busy} onCancel={() => setDel(null)} onConfirm={remove} message={`ลบตัวอย่างแบบฟอร์ม “${del.name}” พร้อมไฟล์ถาวร? การลบไม่สามารถย้อนกลับได้`} />}
    </div>);
}
