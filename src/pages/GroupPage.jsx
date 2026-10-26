import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { GROUPS } from '../config/menu';
import { canRead } from '../lib/roles';

// หน้ากลุ่มงาน: แสดงรายการงานทั้งหมดของกลุ่มเป็นการ์ดใหญ่ (เปิดจากเมนูซ้าย หรือกดหัวกลุ่มบนแดชบอร์ด)
export default function GroupPage() {
  const { key } = useParams();
  const { profile } = useAuth();
  const g = GROUPS.find((x) => x.key === key);
  if (!g) return <Navigate to="/" replace />;
  const items = g.items.filter((i) => !i.module || canRead(profile.role, i.module));
  return (
    <div className="mx-auto max-w-5xl p-4 lg:p-6">
      <div className={`mb-5 flex items-center gap-4 rounded-2xl bg-gradient-to-r ${g.tone} p-5 text-white shadow-md`}>
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 text-3xl">{g.emoji}</div>
        <div>
          <h1 className="text-xl font-bold">{g.title}</h1>
          <p className="text-sm text-white/80">{items.filter((i) => i.ready).length} งานที่ใช้ได้ · เลือกงานที่ต้องการ</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => (
          <Link key={i.key} to={i.path} className={`card group relative flex flex-col gap-2 p-5 transition hover:-translate-y-0.5 hover:shadow-lg ${i.ready ? '' : 'opacity-70'}`}>
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${g.tone} text-white shadow-sm`}><i.icon className="h-6 w-6" /></div>
            <div className="font-bold text-slate-800">{i.label}</div>
            {i.desc && <div className="text-sm text-slate-500">{i.desc}</div>}
            {!i.ready && <span className="w-fit rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">เร็วๆ นี้</span>}
            <ArrowRight className="absolute bottom-4 right-4 h-5 w-5 text-slate-300 opacity-0 transition group-hover:translate-x-1 group-hover:opacity-100" />
          </Link>
        ))}
      </div>
    </div>
  );
}
