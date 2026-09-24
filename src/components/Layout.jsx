import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, Home, Inbox, KeyRound, LogOut, Menu, Search, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useFiscalYear } from '../context/FiscalYearContext';
import { MENU } from '../config/menu';
import { ORG_SHORT, SYSTEM_NAME_EN } from '../config/brand';
import { ROLES, canRead } from '../lib/roles';
import { usernameOf } from '../lib/accounts';
import Logo from './Logo';

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
    <nav className="flex h-full flex-col border-r border-brand-200 bg-gradient-to-b from-brand-100 via-brand-50 to-white text-brand-900" aria-label="เมนูหลัก">
      <div className="flex items-center gap-3 border-b border-brand-200 px-4 py-4">
        <Logo size={48} />
        <div className="leading-tight">
          <div className="font-bold text-brand-800">{ORG_SHORT}</div>
          <div className="text-xs text-brand-700">{SYSTEM_NAME_EN}</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-3">
        {visible.map((s) => (
          <div key={s.title} className="mb-3">
            <div className="px-3 pb-1 text-xs font-semibold tracking-wide text-brand-600">{s.title}</div>
            {s.items.map((i) => (
              <NavLink
                key={i.key} to={i.path} end={i.path === '/'} onClick={() => setOpen(false)}
                className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 transition ${isActive ? 'bg-brand-600 font-semibold text-white shadow-sm' : 'text-slate-700 hover:bg-brand-100'}`}
              >
                <i.icon className="h-5 w-5 shrink-0" />
                <span className="flex-1">{i.label}</span>
                {!i.ready && <span className="rounded bg-brand-100 px-1.5 text-xs text-brand-700">เร็วๆ นี้</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </div>
      <div className="border-t border-brand-200 bg-white/70 p-3 text-sm">
        <div className="truncate font-medium">{profile.name || profile.email}</div>
        <div className="truncate text-slate-500">{ROLES[profile.role]} · {usernameOf(profile.email)}</div>
        <div className="mt-2 flex items-center gap-4">
          <NavLink to="/account" onClick={() => setOpen(false)} className="flex items-center gap-1 text-brand-700 hover:underline"><KeyRound className="h-4 w-4" /> รหัสผ่าน</NavLink>
          <button onClick={logout} className="flex items-center gap-1 text-slate-600 hover:text-red-600"><LogOut className="h-4 w-4" /> ออกจากระบบ</button>
        </div>
      </div>
    </nav>
  );

  const tabs = [
    { to: '/', icon: Home, label: 'หน้าหลัก' },
    { to: '/leave', icon: CalendarDays, label: 'ลางาน' },
    ...(canRead(profile.role, 'incoming') ? [{ to: '/incoming', icon: Inbox, label: 'หนังสือรับ' }] : []),
  ];

  return (
    <div className="min-h-screen lg:pl-64">
      <div className="watermark" aria-hidden="true" />
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{Sidebar}</aside>
      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85%]">{Sidebar}</aside>
          <button className="absolute right-3 top-3 rounded-full bg-white p-2 shadow" onClick={() => setOpen(false)} aria-label="ปิดเมนู"><X className="h-5 w-5" /></button>
        </div>
      )}

      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-brand-200 bg-white/90 px-3 py-2 backdrop-blur lg:px-6">
        <button className="rounded-lg p-2 hover:bg-brand-50 lg:hidden" onClick={() => setOpen(true)} aria-label="เปิดเมนู"><Menu className="h-6 w-6" /></button>
        <Logo size={32} className="lg:hidden" />
        <form onSubmit={onSearch} className="relative min-w-0 flex-1 lg:max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-brand-400" />
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
      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-brand-200 bg-white/95 backdrop-blur lg:hidden" aria-label="เมนูลัด">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${isActive ? 'font-semibold text-brand-700' : 'text-slate-500'}`}>
            <t.icon className="h-6 w-6" />{t.label}
          </NavLink>
        ))}
        <button onClick={() => setOpen(true)} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs text-slate-500"><Menu className="h-6 w-6" />เมนูทั้งหมด</button>
      </nav>
    </div>
  );
}
