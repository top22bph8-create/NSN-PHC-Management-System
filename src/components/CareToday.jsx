// ส่วนบนแดชบอร์ด: นาฬิกา + ตัวเลขสรุปงานบริการเชิงรุกวันนี้ (Smart Home Visit / Telemedicine) แบบการ์ดสี
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { canRead } from '../lib/roles';
import { todayStr } from '../lib/thai';
import { FOLLOW_DONE } from '../config/careLogs';

export function HeroClock() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => { const i = setInterval(() => setT(new Date()), 1000); return () => clearInterval(i); }, []);
  return (
    <div className="hero-clock relative z-10 ml-auto px-4 py-2 text-center">
      <div className="text-3xl font-extrabold tabular-nums leading-none sm:text-4xl">{t.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
      <div className="mt-0.5 text-xs text-brand-100">น.</div>
    </div>
  );
}

function useRows(name, allowed) {
  const [rows, setRows] = useState([]);
  useEffect(() => { if (!allowed) return undefined; return onSnapshot(collection(db, name), (s) => setRows(s.docs.map((d) => d.data())), () => setRows([])); }, [name, allowed]);
  return rows;
}

export function CareToday() {
  const { profile } = useAuth();
  const okV = canRead(profile.role, 'smart-visit'); const okT = canRead(profile.role, 'telemedicine');
  const visits = useRows('smartVisits', okV); const tele = useRows('telemedicine', okT);
  const today = todayStr(); const month = today.slice(0, 7);
  const k = useMemo(() => ({
    vToday: visits.filter((r) => r.visitDate === today).length,
    vPlan: visits.filter((r) => r.visitDate === today && r.status === 'วางแผน').length,
    vMonth: visits.filter((r) => (r.visitDate || '').startsWith(month) && r.status === 'เยี่ยมแล้ว').length,
    vDue: visits.filter((r) => r.followDate && r.followDate <= today && FOLLOW_DONE.includes(r.status)).length,
    tToday: tele.filter((r) => r.serviceDate === today).length,
    tMonth: tele.filter((r) => (r.serviceDate || '').startsWith(month) && r.status === 'ให้บริการแล้ว').length,
  }), [visits, tele, today, month]);
  if (!okV && !okT) return null;
  const tiles = [
    okV && { to: '/smart-visit', v: k.vToday, l: 'เยี่ยมบ้านวันนี้', h: `รอเยี่ยม ${k.vPlan} · เดือนนี้ ${k.vMonth}`, tone: 'from-rose-700 to-orange-600', e: '🏠' },
    okV && { to: '/smart-visit', v: k.vDue, l: 'ถึงกำหนดเยี่ยมซ้ำ', h: 'ติดตามผู้ป่วยที่นัดไว้', tone: 'from-amber-500 to-orange-500', e: '⏰' },
    okT && { to: '/telemedicine', v: k.tToday, l: 'Telemedicine วันนี้', h: `ให้บริการเดือนนี้ ${k.tMonth} ครั้ง`, tone: 'from-teal-700 to-cyan-600', e: '📡' },
  ].filter(Boolean);
  return (
    <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {tiles.map((x) => (
        <Link key={x.l} to={x.to} className={`kpi-tile flex items-center gap-3 bg-gradient-to-br ${x.tone} p-4`}>
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/90 text-2xl shadow">{x.e}</span>
          <span className="min-w-0"><span className="block text-3xl font-extrabold leading-none tabular-nums">{x.v}</span><span className="mt-1 block text-sm font-semibold">{x.l}</span><span className="block truncate text-xs text-white/80">{x.h}</span></span>
        </Link>
      ))}
    </div>
  );
}
