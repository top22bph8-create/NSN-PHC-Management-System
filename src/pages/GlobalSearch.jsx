import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { Inbox, Send } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useFiscalYear } from '../context/FiscalYearContext';
import { canRead } from '../lib/roles';
import { REGISTRIES } from '../config/registries';
import { fmtDate } from '../lib/thai';
import { EmptyState, ErrorState, Spinner } from '../components/ui';

const ICON = { incoming: Inbox, outgoing: Send };

// ค้นหาแบบรวม: ดึงรายการล่าสุด 500 รายการของแต่ละทะเบียน (ทุกปีงบประมาณ) แล้วกรองในเครื่อง
export default function GlobalSearch() {
  const { profile } = useAuth();
  const { setFy } = useFiscalYear();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const q = (params.get('q') || '').trim();
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setResults(null); setError('');
    if (!q) { setResults({}); return undefined; }
    (async () => {
      try {
        const t = q.toLowerCase();
        const out = {};
        for (const cfg of Object.values(REGISTRIES)) {
          if (!canRead(profile.role, cfg.key)) continue;
          const s = await getDocs(query(collection(db, cfg.key), orderBy('createdAt', 'desc'), limit(500)));
          out[cfg.key] = s.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((it) => cfg.fields.some((f) => String(it[f.key] || '').toLowerCase().includes(t) || (it.fy && String(it.fy).includes(t) && f.key === cfg.dateField)));
        }
        if (live) setResults(out);
      } catch (e) {
        if (live) setError(e.message);
      }
    })();
    return () => { live = false; };
  }, [q, profile.role]);

  const go = (cfg, it) => { if (it.fy) setFy(it.fy); nav(`${cfg.path}?open=${it.id}`); };
  const total = results ? Object.values(results).reduce((n, a) => n + a.length, 0) : 0;

  return (
    <div className="mx-auto max-w-4xl p-4 lg:p-6">
      <h1 className="text-2xl font-bold">ค้นหาแบบรวม</h1>
      <p className="mb-4 text-slate-500">{q ? `ผลการค้นหา "${q}"` : 'พิมพ์คำค้นในช่องด้านบนของหน้า แล้วกด Enter'}</p>
      {error ? <ErrorState message={error} />
        : results === null ? <Spinner label="กำลังค้นหา..." />
        : q && total === 0 ? <EmptyState title="ไม่พบข้อมูลที่ตรงกับคำค้น" hint="ลองใช้คำอื่น เช่น เลขที่หนังสือ ชื่อหน่วยงาน หรือคำในเรื่อง" />
        : Object.entries(results).map(([key, list]) => {
          const cfg = REGISTRIES[key];
          const Icon = ICON[key];
          if (!list.length) return null;
          return (
            <section key={key} className="mb-5">
              <h2 className="mb-2 flex items-center gap-2 font-semibold"><Icon className="h-5 w-5 text-blue-700" /> {cfg.title} <span className="text-sm font-normal text-slate-500">({list.length})</span> <Link to={cfg.path} className="text-sm font-normal text-blue-700 hover:underline">เปิดทะเบียน</Link></h2>
              <ul className="card divide-y divide-slate-100">
                {list.slice(0, 50).map((it) => (
                  <li key={it.id} className="cursor-pointer p-3 hover:bg-blue-50/60" onClick={() => go(cfg, it)}>
                    <div className="font-medium"><span className="text-blue-800">{it[cfg.numberField]}</span> · {it.subject}</div>
                    <div className="text-sm text-slate-500">เลขที่ {it.docNo || '-'} · {fmtDate(it[cfg.dateField])} · ปีงบประมาณ {it.fy}</div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
    </div>
  );
}
