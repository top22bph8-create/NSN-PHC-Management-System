import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { HeartPulse, Home, Inbox, LogOut, Menu, Search, Send, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useFiscalYear } from '../context/FiscalYearContext';
import { MENU } from '../config/menu';
import { ROLES, canRead } from '../lib/roles';

export default function Layout() {
  const { profile, logout } = useAuth();
  const { fy, setFy, options } = useFiscalYear();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const nav = useNavigate();
  const loc = useLocation();

  const visible = MENU.map((s) => ({
    ...s,
    items: s.items.filter((i) => !i.module || canRead(profile.role, i.module)),
  })).filter((s) => s.items.length);

  const onSearch = (e) => {
    e.preventDefault();
    if (q.trim()) { nav(`/search?q=${encodeURIComponent(q.trim())}`); setOpen(false); }
  };

  const Sidebar = (
    <nav className="flex h-full flex-col bg-blue-900 text-blue-50" aria-label="เมนูหลัก">
      <div className="flex items-center gap-3 border-b border-blue-800 px-4 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500"><HeartPulse className="h-6 w-6 text-white" /></div>
        <div className="leading-tight">
          <div className="font-bold">รพ.สต.บ้านหนองสนม</div>
          <div className="text-sm text-blue-200">ระบบบริหารงาน</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-3">
        {visible.map((s) => (
          <div key={s.title} className="mb-3">
            <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-blue-300">{s.title}</div>
            {s.items.map((i) => (
              <NavLink
                key={i.key} to={i.path} end={i.path === '/'} onClick={() => setOpen(false)}
                className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 ${isActive ? 'bg-white/15 font-semibold text-white' : 'hover:bg-white/10'}`}
              >
                <i.icon className="h-5 w-5 shrink-0" />
                <span className="flex-1">{i.label}</span>
                {!i.ready && <span className="rounded bg-blue-800 px-1.5 text-xs text-blue-200">เร็วๆ นี้</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </div>
      <div className="border-t border-blue-800 p-3 text-sm">
        <div className="truncate font-medium">{profile.name || profile.email}</div>
        <div className="truncate text-blue-300">{ROLES[profile.role]}</div>
        <button onClick={logout} className="mt-2 flex items-center gap-2 text-blue-200 hover:text-white"><LogOut className="h-4 w-4" /> ออกจากระบบ</button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{Sidebar}</aside>
      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85%]">{Sidebar}</aside>
          <button className="absolute right-3 top-3 rounded-full bg-white p-2" onClick={() => setOpen(false)} aria-label="ปิดเมนู"><X className="h-5 w-5" /></button>
        </div>
      )}

      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 lg:px-6">
        <button className="rounded-lg p-2 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="เปิดเมนู"><Menu className="h-6 w-6" /></button>
        <form onSubmit={onSearch} className="relative min-w-0 flex-1 lg:max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
          <input className="input !pl-10" placeholder="ค้นหาทั้งระบบ เช่น 2569, เลขที่หนังสือ, เรื่อง" value={q} onChange={(e) => setQ(e.target.value)} aria-label="ค้นหาทั้งระบบ" />
        </form>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <span className="hidden sm:inline">ปีงบประมาณ</span>
          <select className="input !w-auto !py-1.5" value={fy} onChange={(e) => setFy(e.target.value)} aria-label="ปีงบประมาณ">
            {options.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </header>

      <main className="pb-20 lg:pb-6" key={loc.pathname}><Outlet /></main>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white lg:hidden" aria-label="เมนูลัด">
        {[
          { to: '/', icon: Home, label: 'หน้าหลัก' },
          { to: '/incoming', icon: Inbox, label: 'หนังสือรับ' },
          { to: '/outgoing', icon: Send, label: 'หนังสือส่ง' },
        ].map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-xs ${isActive ? 'text-blue-700' : 'text-slate-500'}`}>
            <t.icon className="h-6 w-6" />{t.label}
          </NavLink>
        ))}
        <button onClick={() => setOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-xs text-slate-500"><Menu className="h-6 w-6" />เมนูทั้งหมด</button>
      </nav>
    </div>
  );
}
