import logoUrl from '../assets/logo.png';

// โลโก้ รพ.สต. ใช้ซ้ำทั้งระบบ (size = ขนาดพิกเซล)
export default function Logo({ size = 40, className = '' }) {
  return <img src={logoUrl} width={size} height={size} alt="โลโก้ รพ.สต.บ้านหนองสนม" className={`shrink-0 object-contain ${className}`} />;
}

// แถบหัวหน้าจอพร้อมโลโก้ ใช้ในหน้าต่าง ๆ ให้เป็นสไตล์เดียวกัน (โทนฟ้าเข้มขึ้น ทันสมัย)
export function PageHeader({ icon: Icon, title, subtitle, actions }) {
  return (
    <div className="relative mb-5 overflow-hidden rounded-2xl bg-gradient-to-r from-brand-800 via-brand-700 to-brand-600 p-4 shadow-lg shadow-brand-900/15 sm:p-5">
      <div className="pointer-events-none absolute -right-6 -top-8 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
      <img src={logoUrl} alt="" aria-hidden="true" className="pointer-events-none absolute -right-4 -top-4 h-32 w-32 object-contain opacity-15" />
      <div className="relative flex flex-wrap items-center gap-3">
        {Icon && <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-white shadow ring-1 ring-white/30"><Icon className="h-6 w-6" /></div>}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-extrabold tracking-tight text-white sm:text-2xl">{title}</h1>
          {subtitle && <p className="text-sm text-brand-100">{subtitle}</p>}
        </div>
        {actions}
      </div>
    </div>
  );
}
