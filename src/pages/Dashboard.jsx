import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import {
  AlertTriangle, Armchair, Building2, Activity, Car, CheckCircle2, Clock, HeartPulse, Inbox,
  Package, Megaphone, CalendarDays, Users, ScrollText, Send, ShoppingCart, Wallet, FileSignature,
} from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useFiscalYear } from '../context/FiscalYearContext';
import { ROLES, canRead } from '../lib/roles';
import { REGISTRIES } from '../config/registries';
import { addDays, fmtDate, fmtDateTime, thMonths, todayStr } from '../lib/thai';
import { ErrorState, Spinner } from '../components/ui';
import Logo from '../components/Logo';
import { SYSTEM_AREA_TH, SYSTEM_NAME_EN, SYSTEM_NAME_TH } from '../config/brand';

const CARDS = [
  { label: 'ระบบควบคุมวันลา', icon: CalendarDays, path: '/leave', ready: true, module: 'leave' },
  { label: 'ทำเนียบบุคลากร', icon: Users, path: '/personnel', ready: true, module: 'personnel' },
  { key: 'incoming', label: 'หนังสือรับ', icon: Inbox, path: '/incoming', live: true },
  { key: 'outgoing', label: 'หนังสือส่ง', icon: Send, path: '/outgoing', live: true },
  { label: 'คำสั่ง', icon: ScrollText, path: '/soon/orders' },
  { label: 'ประกาศ', icon: Megaphone, path: '/soon/orders' },
  { label: 'ทะเบียนยืมเงิน', icon: Wallet, path: '/soon/finance' },
  { label: 'สั่งซื้อ/สั่งจ้าง', icon: ShoppingCart, path: '/soon/finance' },
  { label: 'สัญญา', icon: FileSignature, path: '/soon/finance' },
  { label: 'ครุภัณฑ์', icon: Armchair, path: '/soon/equipment' },
  { label: 'พัสดุ', icon: Package, path: '/soon/supplies' },
  { label: 'ยานพาหนะ', icon: Car, path: '/soon/vehicle' },
  { label: 'อาคาร/สิ่งก่อสร้าง', icon: Building2, path: '/soon/land' },
  { label: 'งานควบคุมโรค', icon: Activity, path: '/soon/disease' },
  { label: 'งานเวชปฏิบัติครอบครัว', icon: HeartPulse, path: '/soon/family' },
];

const ACTION = { create: 'เพิ่ม', update: 'แก้ไข', delete: 'ลบ', login: 'เข้าสู่ระบบ', export: 'ส่งออก', settings: 'ตั้งค่า' };

function Stat({ icon: Icon, label, value, tone }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${tone}`}><Icon className="h-6 w-6" /></div>
      <div><div className="text-2xl font-bold leading-none">{value}</div><div className="mt-1 text-sm text-slate-500">{label}</div></div>
    </div>
  );
}

export default function Dashboard() {
  const { profile } = useAuth();
  const { fy } = useFiscalYear();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [logs, setLogs] = useState([]);

  const readable = ['incoming', 'outgoing'].filter((m) => canRead(profile.role, m));

  useEffect(() => {
    let live = true;
    setData(null); setError('');
    (async () => {
      try {
        const out = { incoming: [], outgoing: [] };
        for (const m of readable) {
          const s = await getDocs(query(collection(db, m), where('fy', '==', fy)));
          out[m] = s.docs.map((d) => ({ id: d.id, ...d.data() }));
        }
        if (live) setData(out);
      } catch (e) {
        if (live) setError(e.code === 'permission-denied' ? 'ไม่มีสิทธิ์เข้าถึงข้อมูล' : e.message);
      }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fy, profile.role]);

  useEffect(() => {
    if (!canRead(profile.role, 'audit')) return;
    getDocs(query(collection(db, 'auditLogs'), orderBy('at', 'desc'), limit(8)))
      .then((s) => setLogs(s.docs.map((d) => ({ id: d.id, ...d.data() }))))
      .catch(() => {});
  }, [profile.role]);

  const m = useMemo(() => {
    if (!data) return null;
    const today = todayStr();
    const thisMonth = today.slice(0, 7);
    const soon = addDays(today, 3);
    const inc = data.incoming;
    const cfgIn = REGISTRIES.incoming;
    const pending = inc.filter((x) => x.status !== cfgIn.doneStatus);
    const overdue = pending.filter((x) => x.dueDate && x.dueDate < today);
    const near = pending.filter((x) => x.dueDate && x.dueDate >= today && x.dueDate <= soon);
    const monthly = Array.from({ length: 12 }, (_, i) => {
      const mon = ((i + 9) % 12) + 1; // ต.ค. เป็นเดือนแรกของปีงบประมาณ
      const key = String(mon).padStart(2, '0');
      return {
        label: thMonths[mon - 1].slice(0, 3),
        inc: inc.filter((x) => (x.receiveDate || '').slice(5, 7) === key).length,
        out: data.outgoing.filter((x) => (x.sendDate || '').slice(5, 7) === key).length,
      };
    });
    const byUnit = {};
    inc.forEach((x) => { const u = x.unit || 'ไม่ระบุ'; byUnit[u] = (byUnit[u] || 0) + 1; });
    const recent = [
      ...inc.map((x) => ({ ...x, mod: 'incoming', no: x.receiveNo, date: x.receiveDate })),
      ...data.outgoing.map((x) => ({ ...x, mod: 'outgoing', no: x.sendNo, date: x.sendDate })),
    ].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 6);
    return {
      inTotal: inc.length, inMonth: inc.filter((x) => (x.receiveDate || '').startsWith(thisMonth)).length,
      outTotal: data.outgoing.length, outMonth: data.outgoing.filter((x) => (x.sendDate || '').startsWith(thisMonth)).length,
      pending, overdue, near, monthly, byUnit: Object.entries(byUnit).sort((a, b) => b[1] - a[1]),
      recent, outDraft: data.outgoing.filter((x) => x.status === 'ร่าง').length,
    };
  }, [data]);

  const maxBar = m ? Math.max(1, ...m.monthly.map((x) => Math.max(x.inc, x.out))) : 1;
  const maxUnit = m ? Math.max(1, ...m.byUnit.map((x) => x[1])) : 1;
  const today = new Date().toLocaleDateString('th-TH', { dateStyle: 'full' });

  return (
    <div className="mx-auto max-w-7xl p-4 lg:p-6">
      <div className="relative mb-5 flex items-center gap-4 overflow-hidden rounded-2xl bg-gradient-to-r from-brand-600 to-brand-400 p-5 text-white shadow-md">
        <div className="hidden shrink-0 rounded-2xl bg-white/90 p-2 shadow sm:block"><Logo size={88} /></div>
        <div className="min-w-0">
        <div className="text-sm text-brand-50">{today}</div>
        <h1 className="mt-1 text-lg font-bold leading-snug sm:text-xl">{SYSTEM_NAME_TH}</h1>
        <div className="text-sm text-brand-50">{SYSTEM_AREA_TH} · {SYSTEM_NAME_EN}</div>
        <div className="mt-1 text-brand-50">
          {profile.email === 'top22bph8@gmail.com' || profile.role === 'director' ? 'นายพงศกร แป่มจำนัก · ผู้อำนวยการ' : `${profile.name || profile.email} · ${ROLES[profile.role]}`}
        </div>
        <div className="mt-1 text-sm text-brand-100">ปีงบประมาณ {fy}</div>
        </div>
      </div>

      {error ? <ErrorState message={error} />
        : !data && readable.length ? <Spinner />
        : (
          <>
            {m && (
              <>
                <h2 className="mb-2 text-lg font-semibold">ภาพรวมงานธุรการ</h2>
                <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
                  <Stat icon={Inbox} label="หนังสือรับทั้งหมด" value={m.inTotal} tone="bg-brand-100 text-brand-700" />
                  <Stat icon={Clock} label="รอดำเนินการ" value={m.pending.length} tone="bg-amber-100 text-amber-700" />
                  <Stat icon={AlertTriangle} label="เกินกำหนด" value={m.overdue.length} tone="bg-red-100 text-red-700" />
                  <Stat icon={Clock} label="ใกล้ครบกำหนด (3 วัน)" value={m.near.length} tone="bg-orange-100 text-orange-700" />
                  <Stat icon={Send} label="หนังสือส่งทั้งหมด" value={m.outTotal} tone="bg-sky-100 text-sky-700" />
                </div>
              </>
            )}

            <h2 className="mb-2 text-lg font-semibold">ระบบงานทั้งหมด</h2>
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {CARDS.map((c) => {
                const allowed = c.ready ? canRead(profile.role, c.module) : !c.live || canRead(profile.role, c.key);
                const stats = c.live && m && allowed
                  ? (c.key === 'incoming' ? { total: m.inTotal, month: m.inMonth } : { total: m.outTotal, month: m.outMonth })
                  : null;
                return (
                  <Link key={c.label} to={allowed ? c.path : '#'} className={`card flex flex-col gap-2 p-4 transition ${allowed ? 'hover:border-brand-400 hover:shadow-md' : 'opacity-50'}`}>
                    <div className="flex items-center gap-2"><c.icon className={`h-6 w-6 ${c.live || c.ready ? 'text-brand-700' : 'text-slate-400'}`} /><span className="font-semibold">{c.label}</span></div>
                    {stats ? (
                      <div className="text-sm text-slate-600"><span className="text-2xl font-bold text-slate-800">{stats.total}</span> รายการ · เดือนนี้ {stats.month}</div>
                    ) : (
                      <span className={`text-sm ${c.ready ? 'text-brand-700' : 'text-slate-400'}`}>{c.ready ? 'เปิดใช้งานแล้ว' : c.live ? 'ไม่มีสิทธิ์เข้าถึง' : 'เร็วๆ นี้'}</span>
                    )}
                  </Link>
                );
              })}
            </div>

            {m && (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="card p-4">
                  <h3 className="mb-3 font-semibold">จำนวนเอกสารรายเดือน (ปีงบประมาณ {fy})</h3>
                  <div className="flex h-40 items-end gap-1" role="img" aria-label="กราฟจำนวนหนังสือรับและส่งรายเดือน">
                    {m.monthly.map((x) => (
                      <div key={x.label} className="flex flex-1 flex-col items-center gap-1">
                        <div className="flex h-32 w-full items-end justify-center gap-0.5">
                          <div className="w-1/2 rounded-t bg-brand-600" style={{ height: `${(x.inc / maxBar) * 100}%` }} title={`รับ ${x.inc}`} />
                          <div className="w-1/2 rounded-t bg-brand-300" style={{ height: `${(x.out / maxBar) * 100}%` }} title={`ส่ง ${x.out}`} />
                        </div>
                        <span className="text-[11px] text-slate-500">{x.label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-4 text-sm text-slate-600"><span><i className="mr-1 inline-block h-3 w-3 rounded bg-brand-600" />หนังสือรับ</span><span><i className="mr-1 inline-block h-3 w-3 rounded bg-brand-300" />หนังสือส่ง</span></div>
                </div>

                <div className="card p-4">
                  <h3 className="mb-3 font-semibold">หนังสือรับตามกลุ่มงาน</h3>
                  {m.byUnit.length === 0 ? <p className="py-8 text-center text-slate-400">ยังไม่มีข้อมูล</p> : (
                    <ul className="space-y-2">
                      {m.byUnit.map(([u, n]) => (
                        <li key={u} className="text-sm">
                          <div className="mb-0.5 flex justify-between"><span>{u}</span><span className="font-semibold">{n}</span></div>
                          <div className="h-2 rounded bg-slate-100"><div className="h-2 rounded bg-brand-600" style={{ width: `${(n / maxUnit) * 100}%` }} /></div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="card p-4">
                  <h3 className="mb-3 flex items-center gap-2 font-semibold"><AlertTriangle className="h-5 w-5 text-red-600" /> แจ้งเตือนสำคัญ</h3>
                  {m.overdue.length + m.near.length === 0 ? (
                    <p className="flex items-center gap-2 py-6 text-emerald-700"><CheckCircle2 className="h-5 w-5" /> ไม่มีรายการเกินกำหนดหรือใกล้ครบกำหนด</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {[...m.overdue.map((x) => ({ x, red: true })), ...m.near.map((x) => ({ x, red: false }))].slice(0, 8).map(({ x, red }) => (
                        <li key={x.id} className="flex cursor-pointer items-start gap-2 py-2 hover:bg-slate-50" onClick={() => nav(`/incoming?open=${x.id}`)}>
                          <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${red ? 'bg-red-500' : 'bg-orange-400'}`} />
                          <div className="min-w-0 flex-1"><div className="truncate font-medium">{x.receiveNo} · {x.subject}</div><div className="text-sm text-slate-500">{red ? 'เกินกำหนด' : 'ใกล้ครบกำหนด'} {fmtDate(x.dueDate)}</div></div>
                        </li>
                      ))}
                    </ul>
                  )}
                  {m.outDraft > 0 && <p className="mt-2 text-sm text-amber-700">หนังสือส่งสถานะ "ร่าง" ค้างอยู่ {m.outDraft} รายการ</p>}
                </div>

                <div className="card p-4">
                  <h3 className="mb-3 font-semibold">เอกสารล่าสุด</h3>
                  {m.recent.length === 0 ? <p className="py-6 text-center text-slate-400">ยังไม่มีเอกสาร</p> : (
                    <ul className="divide-y divide-slate-100">
                      {m.recent.map((x) => (
                        <li key={x.mod + x.id} className="flex cursor-pointer items-start gap-2 py-2 hover:bg-slate-50" onClick={() => nav(`${REGISTRIES[x.mod].path}?open=${x.id}`)}>
                          {x.mod === 'incoming' ? <Inbox className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" /> : <Send className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />}
                          <div className="min-w-0 flex-1"><div className="truncate font-medium">{x.no} · {x.subject}</div><div className="text-sm text-slate-500">{fmtDate(x.date)}</div></div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {logs.length > 0 && (
                  <div className="card p-4 lg:col-span-2">
                    <h3 className="mb-3 flex items-center justify-between font-semibold">กิจกรรมล่าสุด <Link to="/audit" className="text-sm font-normal text-brand-700 hover:underline">ดูทั้งหมด</Link></h3>
                    <ul className="divide-y divide-slate-100 text-sm">
                      {logs.map((l) => (
                        <li key={l.id} className="flex flex-wrap gap-x-3 py-1.5"><span className="text-slate-500">{fmtDateTime(l.at)}</span><span className="font-medium">{l.userEmail}</span><span>{ACTION[l.action] || l.action} {l.label}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        )}
    </div>
  );
}
