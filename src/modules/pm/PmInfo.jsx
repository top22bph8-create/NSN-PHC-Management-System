// งาน PM ข้อมูลข่าวสาร อำเภอเมืองสกลนคร — หน้ารวมระบบย่อย (ไอคอน) ภายใต้งานข้อมูลข่าวสารและสารสนเทศ
import { Link } from 'react-router-dom';
import { ArrowRight, Banknote, ClipboardList } from 'lucide-react';
import { PageHeader } from '../../components/Logo';

const TOOLS = [
  { to: '/pm-info/hospital-debt', icon: Banknote, title: 'ระบบตรวจสอบเงินค้างจ่ายจาก รพ.สกลนคร', desc: 'รายชื่อ รพ.สต. อำเภอเมืองสกลนคร 24 แห่ง พร้อมช่องแนบไฟล์นำเข้าของแต่ละแห่ง', tone: 'from-emerald-600 to-teal-500' },
];

export default function PmInfo() {
  return (
    <div className="mx-auto max-w-5xl p-4 lg:p-6">
      <PageHeader icon={ClipboardList} emoji="🗃️" title="งาน PM ข้อมูลข่าวสาร อำเภอเมืองสกลนคร" subtitle="งานติดตามและตรวจสอบข้อมูลร่วมของ รพ.สต. ในอำเภอเมืองสกลนคร" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((t) => (
          <Link key={t.to} to={t.to} className="card group flex flex-col gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-lg">
            <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${t.tone} text-white shadow`}><t.icon className="h-7 w-7" /></div>
            <div className="min-w-0">
              <div className="font-bold leading-snug text-slate-800">{t.title}</div>
              <p className="mt-1 text-sm text-slate-500">{t.desc}</p>
            </div>
            <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-brand-700">เปิดใช้งาน <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></span>
          </Link>
        ))}
      </div>
    </div>
  );
}
