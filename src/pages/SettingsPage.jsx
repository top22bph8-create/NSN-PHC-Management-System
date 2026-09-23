import { useEffect, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { db } from '../firebase';
import { REGISTRIES } from '../config/registries';
import { DEFAULT_NUMBERING, formatNumber, getNumbering } from '../lib/numbering';
import { writeAudit } from '../lib/audit';
import { ErrorState, Spinner, Toast } from '../components/ui';

export default function SettingsPage() {
  const [cfg, setCfg] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const say = (t) => { setToast(t); setTimeout(() => setToast(null), 3500); };

  useEffect(() => { getNumbering().then(setCfg).catch((e) => setError(e.message)); }, []);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const value = { digits: Number(cfg.digits), era: cfg.era, prefixes: cfg.prefixes || {} };
      await setDoc(doc(db, 'settings', 'numbering'), { ...value, updatedAt: serverTimestamp() });
      await writeAudit({ action: 'settings', module: 'settings', docId: 'numbering', label: 'รูปแบบเลขทะเบียน', after: value });
      say({ type: 'ok', text: 'บันทึกการตั้งค่าแล้ว' });
    } catch (err) {
      say({ type: 'error', text: 'ไม่สำเร็จ: ' + (err.code || err.message) });
    } finally {
      setBusy(false);
    }
  };

  const year = (cfg?.era === 'CE' ? new Date().getFullYear() : new Date().getFullYear() + 543);

  return (
    <div className="mx-auto max-w-2xl p-4 lg:p-6">
      <h1 className="text-2xl font-bold">ตั้งค่าเลขทะเบียน</h1>
      <p className="mb-4 text-slate-500">กำหนดรูปแบบเลขอัตโนมัติ ขึ้นปีใหม่เลขจะเริ่มที่ 1 ใหม่ ข้อมูลปีเก่ายังอยู่ครบ</p>
      {error ? <ErrorState message={error} /> : !cfg ? <Spinner /> : (
        <form onSubmit={save} className="card space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600" htmlFor="era">ปีในเลขทะเบียน</label>
              <select id="era" className="input" value={cfg.era} onChange={(e) => setCfg({ ...cfg, era: e.target.value })}>
                <option value="BE">พ.ศ.</option><option value="CE">ค.ศ.</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600" htmlFor="digits">จำนวนหลักของลำดับ</label>
              <select id="digits" className="input" value={cfg.digits} onChange={(e) => setCfg({ ...cfg, digits: e.target.value })}>
                {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          {Object.values(REGISTRIES).map((r) => (
            <div key={r.key} className="grid items-end gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600" htmlFor={`p-${r.key}`}>คำนำหน้า{r.numberLabel} (ไม่บังคับ)</label>
                <input id={`p-${r.key}`} className="input" maxLength={10} value={cfg.prefixes?.[r.key] || ''} onChange={(e) => setCfg({ ...cfg, prefixes: { ...cfg.prefixes, [r.key]: e.target.value } })} />
              </div>
              <div className="rounded-lg bg-slate-50 p-2 text-sm">ตัวอย่าง: <b>{formatNumber(1, Number(cfg.digits), year, cfg.prefixes?.[r.key] || '')}</b></div>
            </div>
          ))}
          <p className="text-sm text-slate-500">การเปลี่ยนรูปแบบมีผลกับรายการใหม่เท่านั้น เลขที่ออกไปแล้วจะไม่ถูกแก้ไข ค่าเริ่มต้น: {DEFAULT_NUMBERING.digits} หลัก, พ.ศ.</p>
          <button className="btn btn-primary" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} บันทึก</button>
        </form>
      )}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
