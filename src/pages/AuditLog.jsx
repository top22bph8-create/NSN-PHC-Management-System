import { Fragment, useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { fmtDateTime } from '../lib/thai';
import { Badge, EmptyState, ErrorState, Spinner } from '../components/ui';

const ACTION = {
  login: ['เข้าสู่ระบบ', 'bg-slate-100 text-slate-700'],
  create: ['เพิ่ม', 'bg-emerald-100 text-emerald-800'],
  update: ['แก้ไข', 'bg-blue-100 text-blue-800'],
  delete: ['ลบ', 'bg-red-100 text-red-800'],
  export: ['ส่งออก', 'bg-amber-100 text-amber-800'],
  settings: ['ตั้งค่า', 'bg-purple-100 text-purple-800'],
};
const MODULE = { auth: 'ล็อกอิน', incoming: 'หนังสือรับ', outgoing: 'หนังสือส่ง', users: 'ผู้ใช้งาน', settings: 'ตั้งค่า' };

export default function AuditLog() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [open, setOpen] = useState(null);

  useEffect(() => {
    getDocs(query(collection(db, 'auditLogs'), orderBy('at', 'desc'), limit(300)))
      .then((s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch((e) => setError(e.message));
  }, []);

  const list = (rows || []).filter((r) => (!action || r.action === action) && (!q || `${r.userEmail} ${r.label} ${r.module}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-6">
      <h1 className="text-2xl font-bold">Audit Log</h1>
      <p className="mb-4 text-slate-500">บันทึกการใช้งาน 300 รายการล่าสุด (ใคร ทำอะไร เมื่อไร ข้อมูลเดิม/ใหม่) แก้ไขหรือลบไม่ได้</p>
      <div className="card mb-4 grid gap-3 p-3 sm:grid-cols-3">
        <input className="input sm:col-span-2" placeholder="ค้นหาอีเมล / เลขทะเบียน / โมดูล" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={action} onChange={(e) => setAction(e.target.value)} aria-label="ประเภทการกระทำ">
          <option value="">ทุกประเภท</option>
          {Object.entries(ACTION).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}
        </select>
      </div>
      <div className="card overflow-x-auto">
        {error ? <ErrorState message={error} /> : rows === null ? <Spinner /> : list.length === 0 ? <EmptyState title="ไม่พบรายการ" /> : (
          <table className="w-full min-w-[720px] text-left">
            <thead className="bg-slate-100 text-sm text-slate-600"><tr><th className="px-3 py-2">เวลา</th><th className="px-3 py-2">ผู้ใช้</th><th className="px-3 py-2">การกระทำ</th><th className="px-3 py-2">โมดูล</th><th className="px-3 py-2">รายการ</th></tr></thead>
            <tbody>
              {list.map((r) => (
                <Fragment key={r.id}>
                  <tr className="cursor-pointer border-t border-slate-100 hover:bg-blue-50/60" onClick={() => setOpen(open === r.id ? null : r.id)}>
                    <td className="whitespace-nowrap px-3 py-2">{fmtDateTime(r.at)}</td>
                    <td className="px-3 py-2">{r.userEmail}</td>
                    <td className="px-3 py-2"><Badge className={ACTION[r.action]?.[1]}>{ACTION[r.action]?.[0] || r.action}</Badge></td>
                    <td className="px-3 py-2">{MODULE[r.module] || r.module}</td>
                    <td className="px-3 py-2">{r.label}</td>
                  </tr>
                  {open === r.id && (
                    <tr className="bg-slate-50">
                      <td colSpan={5} className="px-3 py-3 text-sm">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div><div className="mb-1 font-semibold text-red-700">ข้อมูลเดิม</div><pre className="whitespace-pre-wrap break-words rounded bg-white p-2">{r.before ? JSON.stringify(r.before, null, 2) : '-'}</pre></div>
                          <div><div className="mb-1 font-semibold text-emerald-700">ข้อมูลใหม่</div><pre className="whitespace-pre-wrap break-words rounded bg-white p-2">{r.after ? JSON.stringify(r.after, null, 2) : '-'}</pre></div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
