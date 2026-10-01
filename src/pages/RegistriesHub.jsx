import { Link } from 'react-router-dom';
import { BookOpenCheck } from 'lucide-react';
import { REGISTRY_LINKS } from '../config/menu';
import { PageHeader } from '../components/Logo';

// หน้ารวม "ทะเบียนประกอบฎีกาและทะเบียนต่างๆ" — แทนที่จะกางหัวข้อย่อยทั้งหมดไว้ในเมนูซ้ายจนรก
// ย้ายมาแสดงเป็นการ์ดไอคอนกลางหน้า จัดเรียงเป็นแถว กดไอคอนเพื่อเข้าแต่ละทะเบียน (ตอนนี้ยังเป็นหน้า "เร็วๆ นี้" รอไฟล์ทะเบียนตัวอย่าง)
export default function RegistriesHub() {
  return (
    <div className="mx-auto max-w-5xl p-4 lg:p-6">
      <PageHeader icon={BookOpenCheck} emoji="📚" title="ทะเบียนประกอบฎีกาและทะเบียนต่างๆ" subtitle="เลือกทะเบียนที่ต้องการ" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {REGISTRY_LINKS.map((r) => (
          <Link
            key={r.key}
            to={r.path}
            className="card flex flex-col items-center gap-3 p-5 text-center transition hover:-translate-y-0.5 hover:border-mint-400 hover:shadow-md"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-mint-400 to-mint-600 text-white shadow-sm">
              <r.icon className="h-7 w-7" />
            </div>
            <span className="text-sm font-semibold text-brand-900">{r.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
