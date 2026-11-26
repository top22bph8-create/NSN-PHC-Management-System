// ระบบตรวจสอบเงินค้างจ่ายจาก รพ.สกลนคร — รายชื่อ รพ.สต. + รหัส และช่องแนบไฟล์นำเข้าท้ายชื่อแต่ละแห่ง
// ไฟล์เก็บที่ Storage: pm-debt/{รหัส}/… · รายการไฟล์เก็บที่ Firestore: pmDebtFiles/{รหัส}.attachments
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { ArrowLeft, Banknote, Download, Loader2, Paperclip, Trash2, Upload } from 'lucide-react';
import { db, storage } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { canWrite } from '../../lib/roles';
import { writeAudit } from '../../lib/audit';
import { fmtDateTime } from '../../lib/thai';
import { PageHeader } from '../../components/Logo';
import { ConfirmDialog, Spinner, Toast } from '../../components/ui';
import { PM_UNITS } from './pmUnits';

const MAX = 20 * 1024 * 1024;
const OK_EXT = ['xls', 'xlsx', 'csv', 'zip', 'rar', '7z', 'pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'txt'];
const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.ceil((b || 0) / 1024)} KB`);
const safeName = (n) => n.replace(/[^\w.\-฀-๿]/g, '_');

function UnitFiles({ code, name, files, canEdit, onDone, onAskDelete }) {
  const { user } = useAuth();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const open = async (f) => {
    try { window.open(await getDownloadURL(ref(storage, f.path)), '_blank', 'noopener'); } catch { onDone({ type: 'error', text: 'เปิดไฟล์ไม่สำเร็จ' }); }
  };
  const pick = async (e) => {
    const picked = [...e.target.files]; e.target.value = '';
    if (!picked.length) return;
    setBusy(true);
    try {
      let list = [...files]; const added = [];
      for (const f of picked) {
        const ext = f.name.split('.').pop().toLowerCase();
        if (!OK_EXT.includes(ext)) { onDone({ type: 'error', text: `${f.name}: ไม่รองรับไฟล์ .${ext} (รองรับ ${OK_EXT.join(', ')})` }); continue; }
        if (f.size > MAX) { onDone({ type: 'error', text: `${f.name}: ไฟล์ใหญ่เกิน 20 MB` }); continue; }
        const path = `pm-debt/${code}/${Date.now()}_${safeName(f.name)}`;
        await uploadBytes(ref(storage, path), f, { contentType: f.type || undefined });
        list = [...list, { name: f.name, path, size: f.size, uploadedBy: user.email.toLowerCase(), uploadedAt: new Date().toISOString() }];
        added.push(f.name);
      }
      if (added.length) {
        await setDoc(doc(db, 'pmDebtFiles', code), { code, name, attachments: list, updatedAt: serverTimestamp() }, { merge: true });
        await writeAudit({ action: 'update', module: 'pm-info', docId: code, label: `เงินค้างจ่าย ${name}`, after: { แนบไฟล์: added } });
        onDone({ type: 'ok', text: `แนบไฟล์ให้ ${name} แล้ว` });
      }
    } catch (err) { onDone({ type: 'error', text: 'อัปโหลดไม่สำเร็จ: ' + (err.code || err.message) }); } finally { setBusy(false); }
  };

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:justify-end">
      {files.map((f) => (
        <span key={f.path} className="inline-flex max-w-full items-center gap-1 rounded-full bg-emerald-50 py-0.5 pl-2.5 pr-1 text-xs text-emerald-800 ring-1 ring-emerald-200" title={`${f.name} · ${fmtSize(f.size)} · ${fmtDateTime(f.uploadedAt)}`}>
          <button type="button" onClick={() => open(f)} className="inline-flex min-w-0 items-center gap-1 hover:underline"><Download className="h-3 w-3 shrink-0" /><span className="max-w-[10rem] truncate">{f.name}</span></button>
          {canEdit && <button type="button" onClick={() => onAskDelete(code, name, f)} className="rounded-full p-1 text-rose-600 hover:bg-rose-100" aria-label={`ลบไฟล์ ${f.name}`}><Trash2 className="h-3 w-3" /></button>}
        </span>
      ))}
      {!files.length && <span className="text-xs text-slate-400">ยังไม่มีไฟล์</span>}
      {canEdit && (
        <>
          <input ref={inputRef} type="file" multiple accept={OK_EXT.map((x) => `.${x}`).join(',')} className="hidden" onChange={pick} />
          <button type="button" className="btn btn-outline !px-2.5 !py-1 text-xs" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} แนบไฟล์
          </button>
        </>
      )}
    </div>
  );
}

export default function HospitalDebt() {
  const { profile } = useAuth();
  const canEdit = canWrite(profile?.role, 'pm-info');
  const [docs, setDocs] = useState(null);
  const [q, setQ] = useState('');
  const [toast, setToast] = useState(null);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);
  useEffect(() => onSnapshot(collection(db, 'pmDebtFiles'), (s) => setDocs(Object.fromEntries(s.docs.map((d) => [d.id, d.data()]))), () => setDocs({})), []);
  const rows = useMemo(() => {
    const k = q.trim().toLowerCase();
    return PM_UNITS.filter(([c, n]) => !k || `${c} ${n}`.toLowerCase().includes(k));
  }, [q]);
  const total = useMemo(() => Object.values(docs || {}).reduce((n, d) => n + (d.attachments?.length || 0), 0), [docs]);

  const doDelete = async () => {
    const { code, name, file } = del; setBusy(true);
    try {
      const rest = (docs?.[code]?.attachments || []).filter((a) => a.path !== file.path);
      await setDoc(doc(db, 'pmDebtFiles', code), { attachments: rest, updatedAt: serverTimestamp() }, { merge: true });
      await deleteObject(ref(storage, file.path)).catch(() => {});
      await writeAudit({ action: 'delete', module: 'pm-info', docId: code, label: `เงินค้างจ่าย ${name}`, before: { ไฟล์: file.name } });
      setToast({ type: 'ok', text: 'ลบไฟล์แล้ว' });
    } catch (err) { setToast({ type: 'error', text: 'ลบไม่สำเร็จ: ' + (err.code || err.message) }); } finally { setBusy(false); setDel(null); }
  };

  return (
    <div className="mx-auto max-w-5xl p-4 lg:p-6">
      <PageHeader icon={Banknote} emoji="💵" tone="from-emerald-700 via-emerald-600 to-teal-500" title="ระบบตรวจสอบเงินค้างจ่ายจาก รพ.สกลนคร" subtitle="รายชื่อ รพ.สต. อำเภอเมืองสกลนคร และช่องแนบไฟล์นำเข้าของแต่ละแห่ง" />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link to="/pm-info" className="btn btn-outline !px-3 !py-1.5 text-sm"><ArrowLeft className="h-4 w-4" /> งาน PM</Link>
        <Link to="/pm-info/receivable" className="btn btn-primary !px-3 !py-1.5 text-sm">📊 รายงานพึงรับ 2569</Link>
        <input className="input min-w-0 flex-1 basis-48 !py-1.5" placeholder="พิมพ์ชื่อหรือรหัส รพ.สต." value={q} onChange={(e) => setQ(e.target.value)} aria-label="ค้นหา รพ.สต." />
        <span className="inline-flex items-center gap-1 text-sm text-slate-500"><Paperclip className="h-4 w-4" /> ไฟล์ทั้งหมด <b className="text-slate-800">{total}</b> ไฟล์ · {PM_UNITS.length} แห่ง</span>
      </div>
      {docs === null ? <Spinner /> : (
        <div className="card divide-y divide-slate-100 overflow-hidden">
          {rows.map(([code, name], i) => (
            <div key={code} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3 sm:px-4">
              <div className="flex min-w-0 items-center gap-3 sm:w-80 sm:shrink-0">
                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-slate-400">{i + 1}</span>
                <span className="shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-sm font-semibold text-emerald-700 ring-1 ring-emerald-100">{code}</span>
                <span className="min-w-0 font-medium leading-snug">{name}</span>
              </div>
              <UnitFiles code={code} name={name} files={docs[code]?.attachments || []} canEdit={canEdit} onDone={setToast} onAskDelete={(c, n, file) => setDel({ code: c, name: n, file })} />
            </div>
          ))}
          {!rows.length && <p className="py-8 text-center text-slate-400">ไม่พบ รพ.สต. ที่ค้นหา</p>}
        </div>
      )}
      {del && <ConfirmDialog message={`ลบไฟล์ "${del.file.name}" ของ ${del.name}?`} busy={busy} onConfirm={doDelete} onCancel={() => setDel(null)} />}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
