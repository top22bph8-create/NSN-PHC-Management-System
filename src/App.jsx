import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FiscalYearProvider } from './context/FiscalYearContext';
import { canRead } from './lib/roles';
import { REGISTRIES } from './config/registries';
import Layout from './components/Layout';
import RegistryPage from './components/RegistryPage';
import { Spinner } from './components/ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import GlobalSearch from './pages/GlobalSearch';
import ComingSoon from './pages/ComingSoon';
import Users from './pages/Users';
import SettingsPage from './pages/SettingsPage';
import AuditLog from './pages/AuditLog';

function Blocked({ problem, error }) {
  const { logout, user } = useAuth();
  const text = {
    'no-profile': 'บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งาน กรุณาแจ้งผู้ดูแลระบบให้เพิ่มอีเมลของท่านในเมนู "ผู้ใช้งานและสิทธิ์"',
    inactive: 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ',
    error: `โหลดข้อมูลสิทธิ์ไม่สำเร็จ (${error}) ตรวจสอบว่าได้เผยแพร่ Firestore Rules ล่าสุดแล้ว`,
  }[problem];
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card max-w-md p-6 text-center">
        <h1 className="mb-2 text-xl font-bold">เข้าใช้งานไม่ได้</h1>
        <p className="mb-1 text-sm text-slate-500">{user?.email}</p>
        <p className="mb-4">{text}</p>
        <button className="btn btn-outline" onClick={logout}>ออกจากระบบ</button>
      </div>
    </div>
  );
}

// ป้องกันหน้า: ต้องล็อกอิน และมีสิทธิ์อ่านโมดูลนั้น
function Guard({ module, children }) {
  const { profile } = useAuth();
  if (module && !canRead(profile.role, module)) {
    return <div className="p-8 text-center text-slate-600">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</div>;
  }
  return children;
}

function Shell() {
  const { loading, user, profile, problem, error } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Login />;
  if (problem || !profile) return <Blocked problem={problem} error={error} />;
  return (
    <FiscalYearProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="search" element={<GlobalSearch />} />
          {Object.values(REGISTRIES).map((cfg) => (
            <Route key={cfg.key} path={cfg.path.slice(1)} element={<Guard module={cfg.key}><RegistryPage cfg={cfg} /></Guard>} />
          ))}
          <Route path="users" element={<Guard module="users"><Users /></Guard>} />
          <Route path="settings" element={<Guard module="settings"><SettingsPage /></Guard>} />
          <Route path="audit" element={<Guard module="audit"><AuditLog /></Guard>} />
          <Route path="soon/:key" element={<ComingSoon />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </FiscalYearProvider>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </HashRouter>
  );
}
