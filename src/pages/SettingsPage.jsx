import { useEffect, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Loader2, MessageCircle } from 'lucide-react';
import { db } from '../firebase';
import { REGISTRIES } from '../config/registries';
import { DEFAULT_NUMBERING, ORG_DOC_CODE, formatNumber, getNumbering } from '../lib/numbering';
import { writeAudit } from '../lib/audit';
import { ErrorState, Spinner, Toast } from '../components/ui';
import { PageHeader } from '../components/Logo';
import { DEFAULT_QUOTA, getQuota } from '../lib/leave';
import { DEFAULT_LINE_EVENTS, getLineMeta, saveLineMeta, saveLineToken } from '../lib/lineNotify';
import { Settings } from 'lucide-react';

export default function SettingsPage() {
  const [cfg, setCfg] = useState(null);
  const [quota, setQuota] = useState(null);
  const [lineMeta, setLineMeta] = useState({ enabled: false, events: { ...DEFAULT_LINE_EVENTS } });
  const [lineToken, setLineToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const say = (t) => { setToast(t); setTimeout(() => setToast(null), 3500); };

  useEffect(() => {
    getNumbering().then(setCfg).catch((e) => setError(e.message));
    getQuota().then(setQuota).catch(() => setQuota({ ...DEFAULT_QUOTA }));
    getLineMeta().then(setLineMeta).catch(() => {});
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const value = { digits: Number(cfg.digits), era: cfg.era, prefixes: cfg.prefixes || {} };
      await setDoc(doc(db, 'settings', 'numbering'), { ...value, updatedAt: serverTimestamp() });
      const qv = Object.fromEntries(Object.entries(quota || {}).map(([k, v]) => [k, Number(v) || 0]));
      await setDoc(doc(db, 'settings', 'leaveQuota'), qv);
      await writeAudit({ action: 'settings', module: 'settings', docId: 'numbering', label: 'รูปแบบเลขทะเบียน', after: value });
      await saveLineMeta(lineMeta);
      if (lineToken.trim()) {
        await saveLineToken(lineToken.trim());
        setLineToken('');
      }
      await writeAudit({ action: 'settings', module: 'settings', docId: 'lineNotify', label: 'แจ้งเตือนไลน์ (LINE Notify)', after: { enabled: lineMeta.enabled, events: lineMeta.events, tokenChanged: !!lineToken.trim() } });
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
          <div className="rounded-lg bg-brand-50 p-3 text-sm text-brand-800">
            เลขที่หนังสือส่งใช้รูปแบบตายตัวของหน่วยงาน <b>{ORG_DOC_CODE}/ลำดับ</b> รันต่อเนื่องไปเรื่อย ๆ ตามปีงบประมาณ (ไม่ปรับตามการตั้งค่าด้านล่าง)
            หากลงวันที่ย้อนหลังและเลขที่เดิมถูกใช้ไปแล้ว ให้ใช้ปุ่ม "แทรกเลขที่ย้อนหลัง" ตอนเพิ่มหนังสือส่ง ระบบจะออกเป็นเลขทศนิยม เช่น /20.1, /20.2
          </div>
          {Object.values(REGISTRIES).filter((r) => r.key !== 'outgoing').map((r) => (
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

          <div className="border-t border-brand-100 pt-4">
            <h2 className="mb-1 flex items-center gap-2 font-semibold"><MessageCircle className="h-5 w-5 text-brand-600" /> แจ้งเตือนไลน์เมื่อมีการยื่น/พิจารณาวันลา (LINE Notify)</h2>
            <p className="mb-3 text-sm text-slate-500">
              วาง TOKEN จาก <a className="text-brand-700 underline" href="https://notify-bot.line.me/my/" target="_blank" rel="noreferrer">notify-bot.line.me/my</a> (สร้าง Token แล้วเลือกกลุ่มไลน์ที่จะแจ้งเตือน)
              ที่นี่ครั้งเดียว — ระบบเก็บ TOKEN นี้แบบเขียนได้อย่างเดียว ไม่มีใครดึงกลับมาดูได้อีก แม้แต่ผู้ดูแลระบบ (ป้องกันการรั่วไหล)
              การส่งข้อความจริงต้องติดตั้ง Cloud Function เสริม 1 ตัว (ดูขั้นตอนใน README หัวข้อ "แจ้งเตือนไลน์") มิฉะนั้นจะบันทึก TOKEN ไว้เฉยๆ ยังไม่ส่งข้อความ
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600" htmlFor="lineToken">LINE Notify TOKEN</label>
                <input id="lineToken" type="password" autoComplete="off" className="input" placeholder="วาง TOKEN ใหม่ที่นี่เพื่อบันทึก/เปลี่ยน (เว้นว่างไว้ = ไม่แก้ไข TOKEN เดิม)" value={lineToken} onChange={(e) => setLineToken(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" className="h-5 w-5" checked={lineMeta.enabled} onChange={(e) => setLineMeta({ ...lineMeta, enabled: e.target.checked })} /> เปิดใช้งานแจ้งเตือนไลน์
              </label>
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" className="h-4 w-4" checked={lineMeta.events.submit} onChange={(e) => setLineMeta({ ...lineMeta, events: { ...lineMeta.events, submit: e.target.checked } })} /> เมื่อยื่นใบลาใหม่</label>
                <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" className="h-4 w-4" checked={lineMeta.events.decide} onChange={(e) => setLineMeta({ ...lineMeta, events: { ...lineMeta.events, decide: e.target.checked } })} /> เมื่ออนุมัติ/ไม่อนุมัติ</label>
                <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" className="h-4 w-4" checked={lineMeta.events.cancel} onChange={(e) => setLineMeta({ ...lineMeta, events: { ...lineMeta.events, cancel: e.target.checked } })} /> เมื่อยกเลิกใบลา</label>
              </div>
            </div>
          </div>

          <button className="btn btn-primary" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} บันทึก</button>
        </form>
      )}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
