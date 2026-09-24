import { useRef, useState } from 'react';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';
import { Download, Eye, FileText, Loader2, Replace, Trash2, Upload } from 'lucide-react';
import { db, storage } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { writeAudit } from '../lib/audit';
import { ConfirmDialog } from './ui';

const DOC_TYPES = ['หนังสือต้นฉบับ', 'เอกสารแนบ', 'ภาพถ่าย', 'อื่น ๆ'];
const MAX = 20 * 1024 * 1024;
const OK_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png', 'webp'];

const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);
const safeName = (n) => n.replace(/[^\w.\-฀-๿]/g, '_');

// จัดการไฟล์แนบของเอกสาร 1 รายการ: อัปโหลด ดูตัวอย่าง ดาวน์โหลด ลบ แทนที่
export default function FileAttach({ cfg, id, label, attachments = [], canEdit, onMessage }) {
  const { user } = useAuth();
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const inputRef = useRef(null);
  const replaceRef = useRef(null);
  const [replacing, setReplacing] = useState(null);

  const save = (list) => updateDoc(doc(db, cfg.key, id), { attachments: list });

  const validate = (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!OK_EXT.includes(ext)) return `ไม่รองรับไฟล์ .${ext} (รองรับ ${OK_EXT.join(', ')})`;
    if (file.size > MAX) return 'ไฟล์ใหญ่เกิน 20 MB';
    return null;
  };

  const upload = async (file) => {
    const path = `docs/${cfg.key}/${id}/${Date.now()}_${safeName(file.name)}`;
    await uploadBytes(ref(storage, path), file, { contentType: file.type || undefined });
    return {
      name: file.name, path, size: file.size, contentType: file.type || '',
      docType, uploadedBy: user.email.toLowerCase(), uploadedAt: new Date().toISOString(),
    };
  };

  const onPick = async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    try {
      let list = [...attachments];
      for (const f of files) {
        const err = validate(f);
        if (err) { onMessage({ type: 'error', text: `${f.name}: ${err}` }); continue; }
        list = [...list, await upload(f)];
      }
      await save(list);
      await writeAudit({ action: 'update', module: cfg.key, docId: id, label, after: { แนบไฟล์: files.map((f) => f.name) } });
      onMessage({ type: 'ok', text: 'อัปโหลดไฟล์แล้ว' });
    } catch (err) {
      onMessage({ type: 'error', text: 'อัปโหลดไม่สำเร็จ: ' + (err.code || err.message) });
    } finally {
      setBusy(false);
    }
  };

  const onReplace = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    const old = replacing;
    setReplacing(null);
    if (!file || !old) return;
    const err = validate(file);
    if (err) { onMessage({ type: 'error', text: err }); return; }
    setBusy(true);
    try {
      const fresh = await upload(file);
      await save(attachments.map((a) => (a.path === old.path ? { ...fresh, docType: old.docType } : a)));
      await deleteObject(ref(storage, old.path)).catch(() => {});
      await writeAudit({ action: 'update', module: cfg.key, docId: id, label, before: { ไฟล์: old.name }, after: { ไฟล์: file.name } });
      onMessage({ type: 'ok', text: 'แทนที่ไฟล์แล้ว' });
    } catch (e2) {
      onMessage({ type: 'error', text: 'แทนที่ไฟล์ไม่สำเร็จ: ' + (e2.code || e2.message) });
    } finally {
      setBusy(false);
    }
  };

  const open = async (a, download = false) => {
    try {
      const url = await getDownloadURL(ref(storage, a.path));
      if (download) {
        const l = document.createElement('a');
        l.href = url; l.download = a.name; l.target = '_blank'; l.rel = 'noopener';
        l.click();
      } else {
        window.open(url, '_blank', 'noopener');
      }
    } catch (e) {
      onMessage({ type: 'error', text: 'เปิดไฟล์ไม่สำเร็จ: ' + (e.code || e.message) });
    }
  };

  const remove = async () => {
    const a = toDelete;
    setBusy(true);
    try {
      await save(attachments.filter((x) => x.path !== a.path));
      await deleteObject(ref(storage, a.path)).catch(() => {});
      await writeAudit({ action: 'delete', module: cfg.key, docId: id, label, before: { ไฟล์: a.name } });
      onMessage({ type: 'ok', text: 'ลบไฟล์แล้ว' });
    } catch (e) {
      onMessage({ type: 'error', text: 'ลบไฟล์ไม่สำเร็จ: ' + (e.code || e.message) });
    } finally {
      setBusy(false);
      setToDelete(null);
    }
  };

  return (
    <div>
      <h3 className="mb-2 font-semibold">ไฟล์แนบ ({attachments.length})</h3>
      {attachments.length === 0 && <p className="mb-2 text-sm text-slate-500">ยังไม่มีไฟล์แนบ</p>}
      <ul className="space-y-2">
        {attachments.map((a) => (
          <li key={a.path} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2">
            <FileText className="h-5 w-5 shrink-0 text-brand-700" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{a.name}</div>
              <div className="text-sm text-slate-500">{a.docType} · {fmtSize(a.size)}</div>
            </div>
            <button className="btn btn-outline !px-2 !py-1" onClick={() => open(a)} title="ดูตัวอย่าง"><Eye className="h-4 w-4" /></button>
            <button className="btn btn-outline !px-2 !py-1" onClick={() => open(a, true)} title="ดาวน์โหลด"><Download className="h-4 w-4" /></button>
            {canEdit && (
              <>
                <button className="btn btn-outline !px-2 !py-1" disabled={busy} title="แทนที่ไฟล์" onClick={() => { setReplacing(a); replaceRef.current?.click(); }}><Replace className="h-4 w-4" /></button>
                <button className="btn btn-outline !px-2 !py-1 text-red-600" disabled={busy} title="ลบ" onClick={() => setToDelete(a)}><Trash2 className="h-4 w-4" /></button>
              </>
            )}
          </li>
        ))}
      </ul>

      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select className="input !w-auto" value={docType} onChange={(e) => setDocType(e.target.value)} aria-label="ประเภทเอกสาร">
            {DOC_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <button className="btn btn-primary" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} อัปโหลดไฟล์
          </button>
          <span className="text-sm text-slate-500">PDF, Word, Excel, รูปภาพ ไม่เกิน 20 MB</span>
          <input ref={inputRef} type="file" multiple hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp" onChange={onPick} />
          <input ref={replaceRef} type="file" hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp" onChange={onReplace} />
        </div>
      )}

      {toDelete && (
        <ConfirmDialog
          message={`คุณต้องการลบไฟล์ "${toDelete.name}" หรือไม่?`}
          confirmLabel="ลบไฟล์" busy={busy} onConfirm={remove} onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  );
}
