// คิวขอเปิดสิทธิ์การรับบริการ (Authen) — อสม./เจ้าหน้าที่ติ๊ก "ขอเปิดสิทธิ์" ตอนบันทึกผลคัดกรอง แล้วรายการมาที่นี่
// ระบบนี้ "ไม่ติดต่อ QM smart/สปสช. เอง" เจ้าหน้าที่ รพ.สต. ล็อกอิน QM smart ด้วยบัญชีตัวเอง ตรวจตัวตนผู้รับบริการ แล้วกดเปิดสิทธิ์เอง จากนั้นกลับมากด "เปิดสิทธิ์แล้ว"
import { useMemo, useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { BadgeCheck, Copy, XCircle } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { writeAudit } from '../../lib/audit';
import { fmtDate } from '../../lib/thai';
import { Modal } from '../../components/ui';

const fmtCid = (c) => String(c || '').replace(/^(\d)(\d{4})(\d{5})(\d{2})(\d)$/, '$1-$2-$3-$4-$5');
const ST = { requested: ['รอเปิดสิทธิ์', 'bg-amber-100 text-amber-800'], opened: ['เปิดสิทธิ์แล้ว', 'bg-emerald-100 text-emerald-800'], cancelled: ['ยกเลิก', 'bg-slate-200 text-slate-700'] };

export default function AuthenQueue({ rows, onClose }) {
  const { profile } = useAuth();
  const [tab, setTab] = useState('requested'); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState('');
  const all = useMemo(() => (rows || []).filter((r) => r.authen?.status), [rows]);
  const cnt = useMemo(() => ({ requested: all.filter((r) => r.authen.status === 'requested').length, opened: all.filter((r) => r.authen.status === 'opened').length, cancelled: all.filter((r) => r.authen.status === 'cancelled').length }), [all]);
  const list = useMemo(() => all.filter((r) => r.authen.status === tab).sort((a, b) => String(b.screenDate).localeCompare(String(a.screenDate)) || String(a.name).localeCompare(String(b.name), 'th')), [all, tab]);
  const who = profile?.name || profile?.email || '';
  const copy = async (t, label) => { try { await navigator.clipboard.writeText(String(t)); setMsg(`คัดลอก${label}แล้ว`); } catch { setMsg('คัดลอกไม่ได้ — เลือกข้อความแล้วคัดลอกเอง'); } };
  const mark = async (r, status) => {
    setBusy(r.id);
    try {
      await updateDoc(doc(db, 'ncdScreenings', r.id), { 'authen.status': status, 'authen.doneBy': who, 'authen.doneAt': serverTimestamp() });
      await writeAudit({ action: 'update', module: 'ncd-screening', docId: r.id, label: `Authen ${status === 'opened' ? 'เปิดสิทธิ์แล้ว' : 'ยกเลิก'}: ${r.name}` });
    } catch (e) { setMsg(e.message || 'บันทึกไม่สำเร็จ'); } finally { setBusy(''); }
  };
  return (
    <Modal title="คิวขอเปิดสิทธิ์การรับบริการ (Authen)" onClose={onClose} footer={<button className="btn btn-outline" onClick={onClose}>ปิด</button>}>
      <div className="space-y-3 text-sm">
        <p className="rounded-xl bg-sky-50 p-3 text-xs text-sky-900 ring-1 ring-sky-200">ขั้นตอน: คัดลอกเลขบัตร/เบอร์โทรไปกรอกใน QM smart (บัญชีเจ้าหน้าที่) → ตรวจว่าผู้รับบริการอยู่ด้วยและยินยอม → กดเปิดสิทธิ์ใน QM smart เอง → กลับมากด “เปิดสิทธิ์แล้ว” ที่นี่ ระบบนี้ไม่เปิดสิทธิ์ให้อัตโนมัติ</p>
        <div role="tablist" className="inline-flex rounded-xl bg-slate-100 p-1">
          {['requested', 'opened', 'cancelled'].map((k) => <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === k ? 'bg-white text-rose-700 shadow' : 'text-slate-600'}`}>{ST[k][0]} ({cnt[k]})</button>)}
        </div>
        {!list.length && <div className="rounded-xl bg-slate-100 p-4 text-center text-slate-500">ไม่มีรายการ</div>}
        <ul className="space-y-2">
          {list.map((r) => (
            <li key={r.id} className="rounded-xl border p-3">
              <div className="flex flex-wrap items-center gap-2"><b>{r.name}</b><span className={`rounded-full px-2 py-0.5 text-xs ${ST[r.authen.status][1]}`}>{ST[r.authen.status][0]}</span></div>
              <div className="text-xs text-slate-600">ม.{r.villageNo || '-'} · รับบริการ {fmtDate(r.screenDate)} · ขอโดย {r.authen.requestedBy || r.screenedBy || '-'}{r.authen.doneBy ? ` · ดำเนินการโดย ${r.authen.doneBy}` : ''}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" className="btn btn-outline !px-2 !py-1 font-mono text-xs" onClick={() => copy(r.cid, 'เลขบัตร')}><Copy className="h-3 w-3" /> {fmtCid(r.cid) || 'ไม่มีเลขบัตร'}</button>
                <button type="button" className="btn btn-outline !px-2 !py-1 font-mono text-xs" onClick={() => copy(String(r.authen.phone || r.phone || '').replace(/\D/g, ''), 'เบอร์โทร')}><Copy className="h-3 w-3" /> {r.authen.phone || r.phone || 'ไม่มีเบอร์'}</button>
                {r.authen.status === 'requested' && <>
                  <button type="button" disabled={busy === r.id} className="btn btn-primary !py-1 text-xs" onClick={() => mark(r, 'opened')}><BadgeCheck className="h-4 w-4" /> เปิดสิทธิ์แล้ว</button>
                  <button type="button" disabled={busy === r.id} className="btn btn-outline !py-1 text-xs text-red-600" onClick={() => mark(r, 'cancelled')}><XCircle className="h-4 w-4" /> ยกเลิกคำขอ</button>
                </>}
              </div>
            </li>
          ))}
        </ul>
        {msg && <div className="text-xs text-slate-600" role="status">{msg}</div>}
      </div>
    </Modal>
  );
}
