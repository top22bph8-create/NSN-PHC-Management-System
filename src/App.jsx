import { HashRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FiscalYearProvider } from './context/FiscalYearContext';
import { canRead } from './lib/roles';
import { REGISTRIES } from './config/registries';
import Layout from './components/Layout';
import RegistryPage from './components/RegistryPage';
import { Spinner } from './components/ui';
import Logo from './components/Logo';
import Login from './pages/Login';
import Signup from './pages/Signup';
import PrintReport from './pages/PrintReport';
import Dashboard from './pages/Dashboard';
import GlobalSearch from './pages/GlobalSearch';
import ComingSoon from './pages/ComingSoon';
import Personnel from './pages/Personnel';
import Leave from './pages/Leave';
import Backup from './pages/Backup';
import Account, { ForcedChange } from './pages/ChangePassword';
import SettingsPage from './pages/SettingsPage';
import AuditLog from './pages/AuditLog';

function Blocked({ problem, error }) {
  const { logout, user, profile } = useAuth();
  const pending = problem === 'inactive' && profile?.role === 'pending';
  const text = pending
    ? 'คำขอสมัครใช้งานของคุณกำลังรอผู้ดูแลระบบอนุมัติ กรุณารอการอนุมัติแล้วเข้าสู่ระบบใหม่อีกครั้ง'
    : {
        'no-profile': 'บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งาน กรุณาแจ้งผู้ดูแลระบบให้เพิ่มอีเมลของท่านในเมนู "ทำเนียบบุคลากร"',
        inactive: 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ',
        error: `โหลดข้อมูลสิทธิ์ไม่สำเร็จ (${error}) ตรวจสอบว่าได้เผยแพร่ Firestore Rules ล่าสุดแล้ว`,
      }[problem];
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-100 to-white p-4">
      <div className="card max-w-md p-6 text-center">
        <Logo size={80} className="mx-auto mb-2" />
        <h1 className="mb-2 text-xl font-bold">{pending ? 'รอการอนุมัติ' : 'เข้าใช้งานไม่ได้'}</h1>
        <p className="mb-1 text-sm text-slate-500">{user?.email}</p>
        <p className="mb-4">{text}</p>
        <button className="btn btn-outline" onClick={logout}>ออกจากระบบ</button>
      </div>
    </div>
  );
}

// เกตหน้าพิมพ์รายงาน: ต้องล็อกอินและมีสิทธิ์อ่านโมดูลนั้นก่อนจึงเห็นรายงาน
function PrintGate() {
  const { loading, user, profile, problem, error } = useAuth();
  const { key } = useParams();
  if (loading) return <Spinner />;
  if (!user) return <Login />;
  if (problem || !profile) return <Blocked problem={problem} error={error} />;
  if (!canRead(profile.role, key)) {
    return <div className="p-8 text-center text-slate-600">คุณไม่มีสิทธิ์เข้าถึงรายงานนี้</div>;
  }
  return (
    <FiscalYearProvider>
      <PrintReport />
    </FiscalYearProvider>
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
  if (profile.mustChangePassword) return <ForcedChange />;
  return (
    <FiscalYearProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="search" element={<GlobalSearch />} />
          {Object.values(REGISTRIES).map((cfg) => (
            <Route key={cfg.key} path={cfg.path.slice(1)} element={<Guard module={cfg.key}><RegistryPage cfg={cfg} /></Guard>} />
          ))}
          <Route path="personnel" element={<Guard module="personnel"><Personnel /></Guard>} />
          <Route path="leave" element={<Guard module="leave"><Leave /></Guard>} />
          <Route path="backup" element={<Guard module="backup"><Backup /></Guard>} />
          <Route path="account" element={<Account />} />
          <Route path="users" element={<Navigate to="/personnel" replace />} />
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
        <Routes>
          <Route path="/signup" element={<Signup />} />
          <Route path="/print/:key" element={<PrintGate />} />
          <Route path="/*" element={<Shell />} />
        </Routes>
      </AuthProvider>
    </HashRouter>
  );
}
