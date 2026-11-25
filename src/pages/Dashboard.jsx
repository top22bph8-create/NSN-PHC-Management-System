import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import {
  Inbox, CalendarDays, Send, ArrowRight, Hammer, User, Clock, AlertTriangle,
} from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useFiscalYear } from '../context/FiscalYearContext';
import { ROLES, canRead, normalizeRole } from '../lib/roles';
import { REGISTRIES } from '../config/registries';
import { GROUPS } from '../config/menu';
import { TodayCards } from '../components/DashboardToday';
import DashboardUnitDuty from '../components/DashboardUnitDuty';
import DashboardService from '../components/DashboardService';
import LineQuotaStatus from '../components/LineQuotaStatus';
import LineQuotaCard from '../components/LineQuotaCard';
import MenuLink from '../components/MenuLink';
import { getQuota, usage } from '../lib/leave';
import { addDays, fmtDate, thMonths, todayStr } from '../lib/thai';
import { Badge, ErrorState, Spinner } from '../components/ui';
import Logo from '../components/Logo';
import { SYSTEM_AREA_TH, SYSTEM_NAME_EN, SYSTEM_NAME_TH } from '../config/brand';

// สีแถบประจำแต่ละประเภทการลา (ไล่เฉดสด เห็นชัดเจน) ใช้ทั้งการ์ด "คนลาเดือนนี้" และแถบ "วันลาคงเหลือ" บนแดชบอร์ดตามที่แจ้ง
const LEAVE_TYPE_TONE = {
  'ลาป่วย': { bar: 'from-rose-400 to-rose-600', badge: 'bg-rose-100 text-rose-700' },
  'ลากิจส่วนตัว': { bar: 'from-amber-400 to-amber-600', badge: 'bg-amber-100 text-amber-700' },
  'ลาพักผ่อน': { bar: 'from-emerald-400 to-emerald-600', badge: 'bg-emerald-100 text-emerald-700' },
  'ลาคลอดบุตร': { bar: 'from-pink-400 to-pink-600', badge: 'bg-pink-100 text-pink-700' },
  'ลาไปช่วยเหลือภริยาที่คลอดบุตร': { bar: 'from-sky-400 to-sky-600', badge: 'bg-sky-100 text-sky-700' },
  'ลาอุปสมบท/ประกอบพิธีฮัจย์': { bar: 'from-violet-400 to-violet-600', badge: 'bg-violet-100 text-violet-700' },
  'ลาไปศึกษา/ฝึกอบรม/ดูงาน': { bar: 'from-cyan-400 to-cyan-600', badge: 'bg-cyan-100 text-cyan-700' },
  'อื่น ๆ': { bar: 'from-slate-400 to-slate-600', badge: 'bg-slate-100 text-slate-700' },
};
const leaveTone = (type) => LEAVE_TYPE_TONE[type] || LEAVE_TYPE_TONE['อื่น ๆ'];

function Stat({ icon: Icon, label, value, tone, hint }) {
  return (
    <div className="card flex min-w-0 items-center gap-3 p-3 transition hover:shadow-md sm:p-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12 ${tone}`}><Icon className="h-5 w-5 sm:h-6 sm:w-6" /></div>
      <div className="min-w-0">
        <div className="text-2xl font-bold leading-none tabular-nums sm:text-3xl">{value}</div>
        <div className="mt-1 truncate text-xs text-slate-500 sm:text-sm">{label}</div>
        {hint && <div className="truncate text-[11px] text-slate-400">{hint}</div>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { profile } = useAuth();
  const { fy } = useFiscalYear();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [leaveRows, setLeaveRows] = useState(null);
  const [leaveQuota, setLeaveQuota] = useState(null);
  const [assignCount, setAssignCount] = useState(null);
  useEffect(() => {
    if (!canRead(profile.role, 'assignments')) return;
    getDocs(query(collection(db, 'assignments'), where('date', '>=', todayStr()), where('date', '<=', addDays(todayStr(), 7))))
      .then((s) => setAssignCount(s.size)).catch(() => setAssignCount(null));
  }, [profile.role]);

  const readable = ['incoming', 'outgoing'].filter((m) => canRead(profile.role, m));
  const canSeeLeave = canRead(profile.role, 'leave');

  // คนลาเดือนนี้ + วันลาคงเหลือของตัวเอง — ดึงเฉพาะเมื่อมีสิทธิ์อ่านโมดูลวันลา (ทุกคนอ่านได้แล้วตามที่แจ้ง)
  useEffect(() => {
    if (!canSeeLeave) { setLeaveRows([]); return; }
    let live = true;
    setLeaveRows(null);
    getDocs(query(collection(db, 'leaves'), where('fy', '==', fy)))
      .then((s) => { if (live) setLeaveRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))); })
      .catch(() => { if (live) setLeaveRows([]); });
    return () => { live = false; };
  }, [fy, canSeeLeave]);
  useEffect(() => { if (canSeeLeave) getQuota().then(setLeaveQuota).catch(() => setLeaveQuota({})); }, [canSeeLeave]);

  const leaveMonth = useMemo(() => {
    if (!leaveRows) return null;
    const now = new Date();
    const y = now.getFullYear(); const mo = now.getMonth();
    const monthStart = `${y}-${String(mo + 1).padStart(2, '0')}-01`;
    const monthEnd = `${y}-${String(mo + 1).padStart(2, '0')}-${String(new Date(y, mo + 1, 0).getDate()).padStart(2, '0')}`;
    const onLeave = leaveRows
      .filter((l) => l.status === 'อนุมัติ' && l.start <= monthEnd && l.end >= monthStart)
      .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    const mine = leaveRows.filter((l) => l.userEmail === profile.email);
    const { used, pending } = usage(mine);
    return { onLeave, used, pending, monthLabel: `${thMonths[mo]} ${y + 543}` };
  }, [leaveRows, profile.email]);

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
    return {
      inTotal: inc.length, inMonth: inc.filter((x) => (x.receiveDate || '').startsWith(thisMonth)).length,
      outTotal: data.outgoing.length, outMonth: data.outgoing.filter((x) => (x.sendDate || '').startsWith(thisMonth)).length,
      pending, overdue, near, monthly,
    };
  }, [data]);

  const maxBar = m ? Math.max(1, ...m.monthly.map((x) => Math.max(x.inc, x.out))) : 1;
  const today = new Date().toLocaleDateString('th-TH', { dateStyle: 'full' });

  return (
    <div className="mx-auto max-w-7xl p-4 lg:p-6">
      <div className="relative mb-4 flex items-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-r from-brand-700 via-brand-600 to-brand-400 p-4 text-white shadow-md sm:gap-5 sm:p-6">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-14 right-24 hidden h-32 w-32 rounded-full bg-white/10 md:block" />
        <div className="shrink-0 rounded-2xl bg-white/90 p-1.5 shadow sm:p-2"><Logo size={56} className="sm:hidden" /><Logo size={88} className="hidden sm:block" /></div>
        <div className="relative min-w-0 flex-1">
          <div className="text-xs text-brand-50 sm:text-sm">{today}</div>
          <h1 className="mt-0.5 text-base font-bold leading-snug !text-white sm:text-xl lg:text-2xl">{SYSTEM_NAME_TH}</h1>
          <div className="text-xs text-brand-50 sm:text-sm">{SYSTEM_AREA_TH} · {SYSTEM_NAME_EN}</div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-sm font-medium sm:text-base">
              {profile.email === 'top22bph8@gmail.com' ? 'นายพงศกร แป่มจำนัก · ผู้อำนวยการ' : `${profile.name || profile.email} · ${ROLES[normalizeRole(profile.role)]}`}
            </span>
            <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold">ปีงบประมาณ {fy}</span>
          </div>
        </div>
      </div>

      {normalizeRole(profile.role) === 'super_admin' && <><LineQuotaStatus /><LineQuotaCard /></>}

      <TodayCards />
      {canRead(profile.role, 'service-stats') && <DashboardService />}
      <DashboardUnitDuty />

      {error ? <ErrorState message={error} />
        : !data && readable.length ? <Spinner />
        : (
          <>
            {m && (
              <>
                <h2 className="mb-2 text-base font-semibold sm:text-lg">ภาพรวมงานธุรการ</h2>
                <div className="mb-5 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
                  <Stat icon={Inbox} label="หนังสือรับทั้งหมด" value={m.inTotal} hint={`เดือนนี้ ${m.inMonth}`} tone="bg-brand-100 text-brand-700" />
                  <Stat icon={Send} label="หนังสือส่งทั้งหมด" value={m.outTotal} hint={`เดือนนี้ ${m.outMonth}`} tone="bg-sky-100 text-sky-700" />
                  <Stat icon={Clock} label="รอดำเนินการ" value={m.pending.length} hint={m.near.length ? `ใกล้ครบกำหนด ${m.near.length}` : 'ไม่มีใกล้ครบกำหนด'} tone="bg-amber-100 text-amber-700" />
                  <Stat icon={AlertTriangle} label="เกินกำหนด" value={m.overdue.length} hint={m.overdue.length ? 'ควรเร่งติดตาม' : 'ไม่มีค้าง'} tone={m.overdue.length ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'} />
                </div>
              </>
            )}

            <h2 className="mb-3 text-base font-semibold sm:text-lg">กลุ่มงาน</h2>
            <div className="mb-7 grid grid-cols-1 items-start gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
              {GROUPS.map((g) => {
                const items = g.items.filter((i) => !i.module || canRead(profile.role, i.module));
                const live = items.filter((i) => i.ready);
                const statOf = (i) => (m && i.key === 'incoming' ? `${m.inTotal} รายการ` : m && i.key === 'outgoing' ? `${m.outTotal} รายการ` : i.key === 'assignments' && assignCount !== null ? `7 วัน: ${assignCount} งาน` : null);
                return (
                  <div key={g.key} className="card overflow-hidden transition hover:shadow-lg">
                    <MenuLink item={g.items.length === 1 && g.items[0].href ? g.items[0] : { path: `/group/${g.key}` }} className={`flex items-center gap-3 bg-gradient-to-r ${g.tone} px-4 py-3 text-white`}>
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 text-xl">{g.emoji}</span>
                      <span className="min-w-0 flex-1 font-bold leading-snug">{g.title}</span>
                      <ArrowRight className="h-5 w-5 opacity-70" />
                    </MenuLink>
                    <div className="p-2">
                      {live.length === 0 ? (
                        <Link to={`/group/${g.key}`} className="flex items-center gap-2 rounded-lg px-3 py-3 text-sm text-slate-400 hover:bg-slate-50">
                          <Hammer className="h-4 w-4" /> เร็วๆ นี้ — อยู่ระหว่างพัฒนา
                        </Link>
                      ) : live.map((i) => (
                        <MenuLink key={i.key} item={i} className={i.manual
                          ? 'my-1 flex items-center gap-3 rounded-xl border-2 border-dashed border-sky-400 bg-gradient-to-r from-sky-50 to-cyan-50 px-3 py-2.5 text-sm font-semibold text-sky-900 shadow-sm transition hover:border-sky-600 hover:shadow-md'
                          : 'flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50'}>
                          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${g.soft}`}><i.icon className="h-4 w-4" /></span>
                          <span className="min-w-0 flex-1 leading-snug">{i.manual && i.emoji && <span className="emoji-blink mr-1 text-base">{i.emoji}</span>}{i.label}</span>
                          {i.manual && <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[11px] font-bold text-white">คู่มือ</span>}
                          {statOf(i) && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${g.soft}`}>{statOf(i)}</span>}
                        </MenuLink>
                      ))}
                      {items.some((i) => !i.ready) && live.length > 0 && (
                        <p className="px-3 pb-1 pt-1 text-xs text-slate-400">เร็วๆ นี้: {items.filter((i) => !i.ready).map((i) => i.label).join(', ')}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <h2 className="mb-3 text-base font-semibold sm:text-lg">ภาพรวมและแจ้งเตือน</h2>
            {m && (
              <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
                <div className="card overflow-hidden lg:col-span-2">
                  <div className="flex items-center gap-2 bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-2.5 text-white">
                    <Inbox className="h-5 w-5" /><h3 className="min-w-0 flex-1 text-sm font-bold !text-white sm:text-base">จำนวนเอกสารรายเดือน (ปีงบ {fy})</h3>
                    <span className="shrink-0 rounded-full bg-white/25 px-2.5 py-0.5 text-xs font-bold">รับ {m.inTotal} · ส่ง {m.outTotal}</span>
                  </div>
                  <div className="p-4">
                    <div className="relative flex h-44 items-end gap-0.5 sm:h-56 sm:gap-1.5 lg:h-64 rounded-lg bg-gradient-to-b from-sky-50 to-white px-1 pt-2" role="img" aria-label="กราฟจำนวนหนังสือรับและส่งรายเดือน">
                      {[25, 50, 75].map((g) => <div key={g} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-sky-100" style={{ bottom: `${g * 0.8 + 20}%` }} />)}
                      {m.monthly.every((x) => !x.inc && !x.out) && <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">ยังไม่มีหนังสือรับ/ส่งในปีงบประมาณนี้</div>}
                      {m.monthly.map((x) => (
                        <div key={x.label} className="flex flex-1 flex-col items-center gap-1">
                          <div className="flex h-36 w-full items-end justify-center gap-px sm:h-48 sm:gap-0.5 lg:h-56">
                            <div className="w-1/2 rounded-t bg-gradient-to-t from-sky-700 to-sky-400" style={{ height: `${(x.inc / maxBar) * 100}%` }} title={`รับ ${x.inc}`} />
                            <div className="w-1/2 rounded-t bg-gradient-to-t from-fuchsia-600 to-pink-400" style={{ height: `${(x.out / maxBar) * 100}%` }} title={`ส่ง ${x.out}`} />
                          </div>
                          <span className="text-[10px] text-slate-500 sm:text-xs">{x.label}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 sm:text-sm"><span><i className="mr-1 inline-block h-3 w-3 rounded bg-sky-500" />หนังสือรับ</span><span><i className="mr-1 inline-block h-3 w-3 rounded bg-pink-500" />หนังสือส่ง</span></div>
                  </div>
                </div>

                {canSeeLeave && leaveMonth && (
                  <div className="card overflow-hidden">
                    <div className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-white">
                      <CalendarDays className="h-5 w-5" /><h3 className="flex-1 font-bold !text-white">คนลาเดือน{leaveMonth.monthLabel}</h3>
                      <span className="shrink-0 rounded-full bg-white/25 px-2.5 py-0.5 text-sm font-bold">{leaveMonth.onLeave.length}</span>
                    </div>
                    <div className="p-4">
                    {leaveMonth.onLeave.length === 0 ? (
                      <p className="py-6 text-center text-slate-400">ไม่มีใครลาในเดือนนี้</p>
                    ) : (
                      <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
                        {leaveMonth.onLeave.map((l) => (
                          <li key={l.id} className="flex cursor-pointer items-center gap-2 py-2 hover:bg-slate-50" onClick={() => nav('/leave')}>
                            <User className="h-4 w-4 shrink-0 text-slate-400" />
                            <div className="min-w-0 flex-1"><div className="truncate font-medium">{l.name}</div><div className="text-sm text-slate-500">{fmtDate(l.start)} - {fmtDate(l.end)} ({l.days} วัน)</div></div>
                            <Badge className={leaveTone(l.type).badge}>{l.type}</Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                    </div>
                  </div>
                )}

                {canSeeLeave && leaveMonth && leaveQuota && (
                  <div className="card overflow-hidden">
                    <div className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-500 px-4 py-2.5 text-white">
                      <CalendarDays className="h-5 w-5" /><h3 className="flex-1 font-bold !text-white">วันลาคงเหลือของฉัน (ปีงบ {fy})</h3>
                      <Link to="/leave" className="text-xs underline opacity-90 hover:opacity-100">ดูทั้งหมด</Link>
                    </div>
                    <div className="space-y-3 p-4">
                      {Object.entries(leaveQuota).map(([type, q]) => {
                        const u = leaveMonth.used[type] || 0;
                        const p = leaveMonth.pending[type] || 0;
                        const isVacation = type === 'ลาพักผ่อน';
                        const accrued = isVacation ? (Number(profile.vacationCarryOver) || 0) : 0;
                        const remain = Math.max(0, q - u) + accrued;
                        const pct = q ? Math.max(0, Math.min(100, ((q - u - p) / q) * 100)) : 0; // แถบ = สัดส่วนวันที่ยังเหลือ (เต็ม = ยังไม่ได้ใช้เลย)
                        return (
                          <div key={type}>
                            <div className="mb-0.5 flex items-center justify-between text-sm">
                              <span className="font-medium text-slate-700">{type}</span>
                              <span className="font-bold text-slate-800">{remain} <span className="font-normal text-slate-400">/ {q} วัน{isVacation && accrued ? `+${accrued}สะสม` : ''}</span></span>
                            </div>
                            <div className="h-3 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200"><div className={`h-3 rounded-full bg-gradient-to-r ${leaveTone(type).bar}`} style={{ width: `${pct}%` }} /></div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              </div>
            )}
          </>
        )}
    </div>
  );
}
