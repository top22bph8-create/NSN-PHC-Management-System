// แดชบอร์ด: กำหนดการออกหน่วยปฐมพยาบาล / รับบริจาคโลหิต + คิวถัดไป (แถบสีเมื่อถึงคิว)
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDoc, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { canRead } from '../lib/roles';
import { fmtDate, todayStr } from '../lib/thai';
import { UNIT_KINDS, unitColor } from '../lib/unitDuty';

function KindCard({ kind }) {
  const K = UNIT_KINDS[kind];
  const [roster, setRoster] = useState(K.defaults);
  const [events, setEvents] = useState([]);
  const today = todayStr();
  useEffect(() => { getDoc(doc(db, 'unitRoster', kind)).then((s) => { if (s.exists() && s.data().units?.length) setRoster({ units: s.data().units, nextIdx: Number.isInteger(s.data().nextIdx) ? s.data().nextIdx : 0 }); }).catch(() => {}); }, [kind]);
  useEffect(() => onSnapshot(query(collection(db, 'unitDuty'), where('date', '>=', today)),
    (s) => setEvents(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => e.kind === kind && e.status === 'นัดหมาย').sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time || '').localeCompare(String(b.time || '')))), () => setEvents([])), [kind, today]);
  const nextI = roster.nextIdx % roster.units.length;
  const nu = roster.units[nextI]; const c = unitColor(nextI);
  const todays = events.filter((e) => e.date === today);
  return (
    <div className="card flex flex-col overflow-hidden">
      <div className={`flex items-center gap-2 bg-gradient-to-r px-4 py-2.5 text-white ${K.tone}`}>
        <span className="text-xl">{K.emoji}</span><h3 className="flex-1 font-bold !text-white">{K.title}</h3>
        <Link to={K.path} className="text-xs underline opacity-90 hover:opacity-100">ดูทั้งหมด</Link>
      </div>
      {todays.length > 0 && (
        <div className="animate-pulse bg-red-600 px-4 py-2 text-sm font-bold text-white">
          🔔 วันนี้ออกหน่วย: {todays.map((e) => `${e.time ? `${e.time} น. ` : ''}${e.place} (${e.unitLabel})`).join(' · ')}
        </div>
      )}
      <div className="p-3">
        <div className={`overflow-hidden rounded-xl ring-2 ${c.ring}`}>
          <div className={`px-3 py-1 text-xs font-bold ${c.chip}`}>🎯 คิวถัดไป</div>
          <div className={`px-3 py-2 ${c.soft}`}>
            <div className="font-extrabold">{nu.label}</div>
            <div className="text-xs">{nu.members.map((m) => m.name).join(' · ')}</div>
          </div>
        </div>
        <h4 className="mb-1 mt-3 text-sm font-semibold text-slate-600">กำหนดการที่จะถึง</h4>
        {events.length === 0 ? <p className="py-3 text-center text-sm text-slate-400">ยังไม่มีกำหนดการออกหน่วย</p> : (
          <ul className="space-y-1.5">
            {events.slice(0, 4).map((e) => {
              const ec = unitColor(e.unitIdx);
              return (
                <li key={e.id} className="flex overflow-hidden rounded-lg bg-slate-50">
                  <span className={`w-1.5 shrink-0 ${ec.bar}`} />
                  <div className="min-w-0 flex-1 px-2.5 py-1.5 text-sm">
                    <div className="font-semibold">{fmtDate(e.date)}{e.time ? ` · ${e.time} น.` : ''} <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold ${ec.chip}`}>{e.unitLabel}</span></div>
                    <div className="truncate text-slate-600">{e.place}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function DashboardUnitDuty() {
  const { profile } = useAuth();
  if (!canRead(profile.role, 'unit-duty')) return null;
  return (
    <div className="mb-5 grid gap-4 md:grid-cols-2">
      <KindCard kind="firstaid" />
      <KindCard kind="blood" />
    </div>
  );
}
