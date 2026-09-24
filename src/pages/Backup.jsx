import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { AlertTriangle, DatabaseBackup, Download, Loader2, Upload } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { BACKUP_COLLECTIONS, buildBackup, countOf, markBackupDone, restoreBackup, validateBackup } from '../lib/backup';
import { writeAudit } from '../lib/audit';
import { fmtDateTime } from '../lib/thai';
import { PageHeader } from '../components/Logo';
import { Toast } from '../components/ui';

const LABEL = { users: 'บุคลากรและสิทธิ์', settings: 'การตั้งค่า', counters: 'ตัวนับเลขทะเบียน', incoming: 'หนังสือรับ', outgoing: 'หนังสือส่ง', leaves: 'ใบลา', auditLogs: 'Audit Log' };

export default function Backup() {
  const { profile } = useAuth();
  const [last, setLast] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState(null);
  const [file, setFile] = useState(null);
  const [confirm, setConfirm] = useState('');
  const [progress, setProgress] = useState(0);
  const [toast, setToast] = useState(null);
  const say = (t) => { setToast(t); setTimeout(() => setToast(null), 5000); };

  const loadLast = () => getDoc(doc(db, 'settings', 'backup')).then((s) => setLast(s.exists() ? s.data() : null)).catch(() => setLast(null));
  useEffect(() => { loadLast(); }, []);

  const days = last?.lastBackupAt ? Math.floor((Date.now() - last.lastBackupAt.toDate().getTime()) / 86400000) : null;

  const download = async () => {
    setBusy(true);
    try {
      const b = await buildBackup();
      const blob = new Blob([JSON.stringify(b)], { type: 'application/json' });
      const a = document.createElement('a');
      const d = new Date();
      a.href = URL.createObjectURL(blob);
      a.download = `NSN-PHC-backup-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      const c = countOf(b);
      await markBackupDone(profile.email, c);
      await writeAudit({ action: 'export', module: 'backup', label: 'สำรองข้อมูลทั้งระบบ', after: c });
      setCounts(c);
      loadLast();
      say({ type: 'ok', text: 'ดาวน์โหลดไฟล์สำรองข้อมูลแล้ว' });
    } catch (e) {
      say({ type: 'error', text: 'สำรองข้อมูลไม่สำเร็จ: ' + (e.code || e.message) });
    } finally { setBusy(false); }
  };

  const pick = async (e) => {
    const f = e.target.files?.[0];
    setFile(null); setConfirm('');
    if (!f) return;
    try {
      const b = JSON.parse(await f.text());
      validateBackup(b);
      setFile({ name: f.name, data: b, counts: countOf(b), at: b.exportedAt });
    } catch (err) {
      say({ type: 'error', text: err.message || 'อ่านไฟล์ไม่สำเร็จ' });
    }
  };

  const restore = async () => {
    setBusy(true); setProgress(0);
    try {
      const n = await restoreBackup(file.data, setProgress);
      await writeAudit({ action: 'settings', module: 'backup', label: `กู้คืนข้อมูลจากไฟล์ ${file.name}`, after: file.counts });
      say({ type: 'ok', text: `กู้คืนข้อมูลแล้ว ${n} รายการ` });
      setFile(null); setConfirm('');
    } catch (e) {
      say({ type: 'error', text: 'กู้คืนไม่สำเร็จ: ' + (e.code || e.message) });
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-3xl p-4 lg:p-6">
      <PageHeader icon={DatabaseBackup} title="สำรอง / กู้คืนข้อมูล" subtitle="ดาวน์โหลดข้อมูลทั้งระบบเก็บไว้ที่เครื่องหรือ Google Drive" />

      {days !== null && days >= 7 && (
        <p className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-amber-800" role="alert"><AlertTriangle className="h-5 w-5 shrink-0" /> ไม่ได้สำรองข้อมูลมา {days} วันแล้ว ควรสำรองอย่างน้อยสัปดาห์ละครั้ง</p>
      )}
      {last === null && <p className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-amber-800" role="alert"><AlertTriangle className="h-5 w-5 shrink-0" /> ยังไม่เคยสำรองข้อมูล</p>}

      <div className="card mb-5 p-5">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold"><Download className="h-5 w-5 text-brand-600" /> สำรองข้อมูล</h2>
        <p className="mb-1 text-sm text-slate-600">สำรอง: {BACKUP_COLLECTIONS.map((c) => LABEL[c]).join(', ')}</p>
        <p className="mb-3 text-sm text-slate-500">ไม่รวมไฟล์แนบ (PDF/รูป) ซึ่งเก็บใน Firebase Storage และไม่รวมรหัสผ่าน (รหัสผ่านอยู่ที่ Firebase Authentication)</p>
        {last?.lastBackupAt && <p className="mb-3 text-sm">สำรองล่าสุด: <b>{fmtDateTime(last.lastBackupAt)}</b> โดย {last.by}</p>}
        <button className="btn btn-primary" onClick={download} disabled={busy}>{busy && !file && <Loader2 className="h-4 w-4 animate-spin" />} ดาวน์โหลดไฟล์สำรองข้อมูล (.json)</button>
        {counts && <ul className="mt-3 grid grid-cols-2 gap-1 text-sm text-slate-600 sm:grid-cols-3">{Object.entries(counts).map(([k, v]) => <li key={k}>{LABEL[k] || k}: <b>{v}</b></li>)}</ul>}
      </div>

      <div className="card p-5">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold"><Upload className="h-5 w-5 text-brand-600" /> กู้คืนข้อมูล</h2>
        <p className="mb-3 text-sm text-slate-600">เลือกไฟล์สำรอง ระบบจะเขียนทับรายการที่มีเลขเดียวกัน และเพิ่มรายการที่หายไป (ไม่ลบรายการอื่น และไม่กู้คืน Audit Log)</p>
        <input type="file" accept=".json,application/json" onChange={pick} className="block w-full text-sm" aria-label="เลือกไฟล์สำรองข้อมูล" disabled={busy} />
        {file && (
          <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50 p-3">
            <p className="text-sm">ไฟล์: <b>{file.name}</b> · สำรองเมื่อ {fmtDateTime(file.at)}</p>
            <ul className="my-2 grid grid-cols-2 gap-1 text-sm sm:grid-cols-3">{Object.entries(file.counts).map(([k, v]) => <li key={k}>{LABEL[k] || k}: <b>{v}</b></li>)}</ul>
            <label className="mb-1 block text-sm text-slate-600" htmlFor="cf">พิมพ์คำว่า <b>กู้คืน</b> เพื่อยืนยัน</label>
            <div className="flex gap-2">
              <input id="cf" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={busy} />
              <button className="btn btn-danger" onClick={restore} disabled={busy || confirm.trim() !== 'กู้คืน'}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} กู้คืน</button>
            </div>
            {busy && <p className="mt-2 text-sm text-slate-600">กำลังกู้คืน... {progress} รายการ</p>}
          </div>
        )}
      </div>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
