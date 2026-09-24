import { useEffect, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { db } from '../firebase';
import { REGISTRIES } from '../config/registries';
import { DEFAULT_NUMBERING, formatNumber, getNumbering } from '../lib/numbering';
import { writeAudit } from '../lib/audit';
import { ErrorState, Spinner, Toast } from '../components/ui';
import { PageHeader } from '../components/Logo';
import { DEFAULT_QUOTA, getQuota } from '../lib/leave';
import { Settings } from 'lucide-react';

export default function SettingsPage() {
  const [cfg, setCfg] = useState(null);
  const [quota, setQuota] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const say = (t) => { setToast(t); setTimeout(() => setToast(null), 3500); };

  useEffect(() => { getNumbering().then(setCfg).catch((e) => setError(e.message)); getQuota().then(setQuota).catch(() => setQuota({ ...DEFAULT_QUOTA })); }, []);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const value = { digits: Number(cfg.digits), era: cfg.era, prefixes: cfg.prefixes || {} };
      await setDoc(doc(db, 'settings', 'numbering'), { ...value, updatedAt: serverTimestamp() });
      const qv = Object.fromEntries(Object.entries(quota || {}).map(([k, v]) => [k, Number(v) || 0]));
      await setDoc(doc(db, 'settings', 'leaveQuota'), qv);
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
      <PageHeader icon={Settings} title="ตั้งค่าระบบ" subtitle="รูปแบบเลขทะเบียนอัตโนมัติ (ขึ้นปีใหม่เริ่มที่ 1 ใหม่) และสิทธิ์วันลาต่อปีงบประมาณ" />
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
          <div className="border-t border-brand-100 pt-4">
            <h2 className="mb-2 font-semibold">สิทธิ์วันลาต่อปีงบประมาณ (วัน)</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {Object.entries(quota || {}).map(([k, v]) => (
                <label key={k} className="flex items-center justify-between gap-2 text-sm text-slate-600">{k}
                  <input type="number" min="0" className="input !w-24" value={v} onChange={(e) => setQuota({ ...quota, [k]: e.target.value })} aria-label={`สิทธิ์${k}`} />
                </label>
              ))}
            </div>
          </div>
          <p className="text-sm text-slate-500">การเปลี่ยนรูปแบบมีผลกับรายการใหม่เท่านั้น เลขที่ออกไปแล้วจะไม่ถูกแก้ไข ค่าเริ่มต้น: {DEFAULT_NUMBERING.digits} หลัก, พ.ศ.</p>
          <button className="btn btn-primary" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} บันทึก</button>
        </form>
      )}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
