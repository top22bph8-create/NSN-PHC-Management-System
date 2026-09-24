import logoUrl from '../assets/logo.png';

// โลโก้ รพ.สต. ใช้ซ้ำทั้งระบบ (size = ขนาดพิกเซล)
export default function Logo({ size = 40, className = '' }) {
  return <img src={logoUrl} width={size} height={size} alt="โลโก้ รพ.สต.บ้านหนองสนม" className={`shrink-0 object-contain ${className}`} />;
}

// แถบหัวหน้าจอพร้อมโลโก้ ใช้ในหน้าต่าง ๆ ให้เป็นสไตล์เดียวกัน
export function PageHeader({ icon: Icon, title, subtitle, actions }) {
  return (
    <div className="relative mb-5 overflow-hidden rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-100 via-brand-50 to-white p-4 sm:p-5">
      <img src={logoUrl} alt="" aria-hidden="true" className="pointer-events-none absolute -right-4 -top-4 h-32 w-32 object-contain opacity-15" />
      <div className="relative flex flex-wrap items-center gap-3">
        {Icon && <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white shadow"><Icon className="h-6 w-6" /></div>}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-brand-900 sm:text-2xl">{title}</h1>
          {subtitle && <p className="text-sm text-slate-600">{subtitle}</p>}
        </div>
        {actions}
      </div>
    </div>
  );
}
