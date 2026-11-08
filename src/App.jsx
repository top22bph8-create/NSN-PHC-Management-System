import { HashRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FiscalYearProvider } from './context/FiscalYearContext';
import { can, canRead } from './lib/roles';
import { REGISTRIES } from './config/registries';
import { PERSON_REGISTRIES } from './config/personRegistries';
import PersonRegistry from './pages/PersonRegistry';
import UnitDuty from './pages/UnitDuty';
import ServiceStats from './pages/ServiceStats';
import RightsRegistry from './pages/RightsRegistry';
import PopExport from './pages/PopExport';
import PPFee from './pages/PPFee';
import ThaiBooking from './pages/ThaiBooking';
import ThaiBookingPublic from './pages/ThaiBookingPublic';
import PrintThaiQr from './pages/PrintThaiQr';
import Layout from './components/Layout';
import RegistryPage from './components/RegistryPage';
import { Spinner } from './components/ui';
import Logo from './components/Logo';
import Login from './pages/Login';
import PrintReport from './pages/PrintReport';
import PrintLeave from './pages/PrintLeave';
import PrintLeaveReport from './pages/PrintLeaveReport';
import PrintPersonnel from './pages/PrintPersonnel';
import PrintVehicleReport from './pages/PrintVehicleReport';
import PrintVehicle from './pages/PrintVehicle';
import PrintVehicleQr from './pages/PrintVehicleQr';
import PrintVehicleDaily from './pages/PrintVehicleDaily';
import Dashboard from './pages/Dashboard';
import GlobalSearch from './pages/GlobalSearch';
import ComingSoon from './pages/ComingSoon';
import Personnel from './pages/Personnel';
import UserAccounts from './pages/UserAccounts';
import Leave from './pages/Leave';
import Assignments from './pages/Assignments';
import GroupPage from './pages/GroupPage';
import VehicleReport from './pages/VehicleReport';
import Backup from './pages/Backup';
import Account from './pages/ChangePassword';
import SettingsPage from './pages/SettingsPage';
import SurveyHome from './modules/survey/SurveyHome';
import SurveyPublic from './modules/survey/SurveyPublic';
import OutbreakHome from './modules/outbreak/OutbreakHome';
import OutbreakMapPage from './modules/outbreak/OutbreakMapPage';
import OutbreakCase from './modules/outbreak/OutbreakCase';

function Blocked({ problem, error }) {
  const { logout, user, profile } = useAuth();
  const pending = problem === 'inactive' && profile?.role === 'pending';
  const text = pending
    ? 'บัญชีนี้ยังรอผู้ดูแลระบบเปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ'
    : {
        'no-profile': 'บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งาน กรุณาแจ้งผู้ดูแลระบบให้เพิ่มอีเมลของท่านในเมนู "กำหนดผู้ใช้งาน/อนุมัติสมัครสมาชิก"',
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

// เกตหน้าพิมพ์รายงานประวัติบุคลากร: ต้องล็อกอินและมีสิทธิ์อ่านโมดูลทำเนียบบุคลากรก่อนจึงเห็นรายงาน
function PrintPersonnelGate() {
  const { loading, user, profile, problem, error } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Login />;
  if (problem || !profile) return <Blocked problem={problem} error={error} />;
  if (!canRead(profile.role, 'personnel')) {
    return <div className="p-8 text-center text-slate-600">คุณไม่มีสิทธิ์เข้าถึงรายงานนี้</div>;
  }
  return <PrintPersonnel />;
}

// เกตหน้าพิมพ์ใบลา: ต้องล็อกอินและมีสิทธิ์อ่านโมดูลวันลาก่อนจึงเห็นแบบฟอร์ม
function PrintLeaveGate() {
  const { loading, user, profile, problem, error } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Login />;
  if (problem || !profile) return <Blocked problem={problem} error={error} />;
  if (!canRead(profile.role, 'leave')) {
    return <div className="p-8 text-center text-slate-600">คุณไม่มีสิทธิ์เข้าถึงแบบฟอร์มนี้</div>;
  }
  return <PrintLeave />;
}

// เกตหน้าพิมพ์รายงาน/สถิติการลา: ต้องล็อกอินและมีสิทธิ์อ่านโมดูลวันลาก่อนจึงเห็นรายงาน
// รายงานที่รวมข้อมูลทุกคน (ทะเบียนรวม/สถิติรวม) ต้องมีสิทธิ์ "ดูวันลาของทุกคน" เท่านั้น (ตรงกับ Firestore Rules)
function PrintLeaveReportGate() {
  const { loading, user, profile, problem, error } = useAuth();
  const { kind } = useParams();
  if (loading) return <Spinner />;
  if (!user) return <Login />;
  if (problem || !profile) return <Blocked problem={problem} error={error} />;
  if (!canRead(profile.role, 'leave')) {
    return <div className="p-8 text-center text-slate-600">คุณไม่มีสิทธิ์เข้าถึงรายงานนี้</div>;
  }
  if (['combined', 'statsAll'].includes(kind) && !can(profile.role, 'leave', 'viewAll')) {
    return <div className="p-8 text-center text-slate-600">คุณไม่มีสิทธิ์ดูรายงานรวมทุกคน (ดูได้เฉพาะรายงานของตัวเอง)</div>;
  }
  return (
    <FiscalYearProvider>
      <PrintLeaveReport />
    </FiscalYearProvider>
  );
}

// เกตหน้าพิมพ์รายงานผู้บริหาร (ระบบขออนุญาตใช้ยานพาหนะราชการ): ต้องล็อกอินและมีสิทธิ์อ่านโมดูลยานพาหนะก่อนจึงเห็นรายงาน
function PrintVehicleReportGate() {
  const { loading, user, profile, problem, error } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Login />;
  if (problem || !profile) return <Blocked problem={problem} error={error} />;
  if (!canRead(profile.role, 'vehicle')) {
    return <div className="p-8 text-center text-slate-600">คุณไม่มีสิทธิ์เข้าถึงรายงานนี้</div>;
  }
  return <PrintVehicleReport />;
}

// เกตหน้าพิมพ์แบบ 3 ขออนุญาตใช้รถ: ต้องล็อกอินและมีสิทธิ์อ่านโมดูลยานพาหนะก่อนจึงเห็นแบบฟอร์ม
function PrintVehicleGate() {
  const { loading, user, profile, problem, error } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Login />;
  if (problem || !profile) return <Blocked problem={problem} error={error} />;
  if (!canRead(profile.role, 'vehicle')) {
    return <div className="p-8 text-center text-slate-600">คุณไม่มีสิทธิ์เข้าถึงแบบฟอร์มนี้</div>;
  }
  return <PrintVehicle />;
}

// เกตหน้าพิมพ์ป้าย QR Code รถ: ต้องล็อกอินและมีสิทธิ์อ่านโมดูลยานพาหนะ
function PrintVehicleQrGate() {
  const { loading, user, profile, problem, error } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Login />;
  if (problem || !profile) return <Blocked problem={problem} error={error} />;
  if (!canRead(profile.role, 'vehicle')) {
    return <div className="p-8 text-center text-slate-600">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</div>;
  }
  return <PrintVehicleQr />;
}

// เกตหน้าพิมพ์รายงานการเดินทางประจำวัน: ต้องล็อกอินและมีสิทธิ์อ่านโมดูลยานพาหนะ
function PrintVehicleDailyGate() {
  const { loading, user, profile, problem, error } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Login />;
  if (problem || !profile) return <Blocked problem={problem} error={error} />;
  if (!canRead(profile.role, 'vehicle')) {
    return <div className="p-8 text-center text-slate-600">คุณไม่มีสิทธิ์เข้าถึงรายงานนี้</div>;
  }
  return <PrintVehicleDaily />;
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
          {Object.values(PERSON_REGISTRIES).map((cfg) => (
            <Route key={cfg.key} path={cfg.path.slice(1)} element={<Guard module={cfg.key}><PersonRegistry cfg={cfg} /></Guard>} />
          ))}
          <Route path="unit-firstaid" element={<Guard module="unit-duty"><UnitDuty kind="firstaid" /></Guard>} />
          <Route path="rights-registry" element={<Guard module="rights-registry"><RightsRegistry /></Guard>} />
          <Route path="survey" element={<Guard module="survey"><SurveyHome /></Guard>} />
          <Route path="outbreak" element={<Guard module="outbreak"><OutbreakHome /></Guard>} />
          <Route path="outbreak/map" element={<Guard module="outbreak"><OutbreakMapPage /></Guard>} />
          <Route path="outbreak/:id" element={<Guard module="outbreak"><OutbreakCase /></Guard>} />
          <Route path="pop-export" element={<Guard module="pop-export"><PopExport /></Guard>} />
          <Route path="pp-fee" element={<Guard module="pp-fee"><PPFee /></Guard>} />
          <Route path="service-stats" element={<Guard module="service-stats"><ServiceStats /></Guard>} />
          <Route path="unit-blood" element={<Guard module="unit-duty"><UnitDuty kind="blood" /></Guard>} />
          <Route path="thai-booking" element={<Guard module="thai-booking"><ThaiBooking /></Guard>} />
          <Route path="personnel" element={<Guard module="personnel"><Personnel /></Guard>} />
          <Route path="leave" element={<Guard module="leave"><Leave /></Guard>} />
          {/* รายงาน/สถิติการลา ย้ายไปเป็นแท็บในหน้าทะเบียนควบคุมวันลา (Leave.jsx) แล้วตามคำขอ — ลิงก์เก่ายังเปิดได้ เด้งไปหน้าทะเบียนวันลาแทน */}
          <Route path="leave-reports" element={<Navigate to="/leave" replace />} />
          <Route path="assignments" element={<Guard module="assignments"><Assignments /></Guard>} />
          <Route path="registries" element={<Navigate to="/group/finance" replace />} />
          <Route path="group/:key" element={<GroupPage />} />
          <Route path="vehicle-report" element={<Guard module="vehicle"><VehicleReport /></Guard>} />
          <Route path="backup" element={<Guard module="backup"><Backup /></Guard>} />
          <Route path="account" element={<Account />} />
          <Route path="users" element={<Guard module="users"><UserAccounts /></Guard>} />
          <Route path="settings" element={<Guard module="settings"><SettingsPage /></Guard>} />
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
          {/* หน้าสาธารณะ (ไม่ต้องล็อกอิน): จองคิวแพทย์แผนไทยผ่าน QR Code + ป้าย QR สำหรับพิมพ์ */}
          <Route path="/book-thai" element={<ThaiBookingPublic />} />
          <Route path="/satisfaction" element={<SurveyPublic />} />
          <Route path="/print-thai-qr" element={<PrintThaiQr />} />
          <Route path="/print/:key" element={<PrintGate />} />
          <Route path="/print-personnel" element={<PrintPersonnelGate />} />
          <Route path="/print-leave/:id" element={<PrintLeaveGate />} />
          <Route path="/print-leave-report/:kind" element={<PrintLeaveReportGate />} />
          <Route path="/print-vehicle/:id" element={<PrintVehicleGate />} />
          <Route path="/print-vehicle-daily" element={<PrintVehicleDailyGate />} />
          <Route path="/print-vehicle-qr" element={<PrintVehicleQrGate />} />
          <Route path="/print-vehicle-report" element={<PrintVehicleReportGate />} />
          <Route path="/*" element={<Shell />} />
        </Routes>
      </AuthProvider>
    </HashRouter>
  );
}
