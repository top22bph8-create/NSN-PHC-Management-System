import { Link, useParams } from 'react-router-dom';
import { Hammer } from 'lucide-react';
import { SOON } from '../config/menu';

export default function ComingSoon() {
  const { key } = useParams();
  const info = SOON[key];
  return (
    <div className="mx-auto max-w-2xl p-4 lg:p-6">
      <div className="card p-6 text-center">
        <Hammer className="mx-auto h-12 w-12 text-amber-500" />
        <h1 className="mt-3 text-2xl font-bold">{info ? info.label : 'ไม่พบหน้านี้'}</h1>
        <p className="mt-1 text-slate-500">{info ? 'โมดูลนี้อยู่ระหว่างพัฒนา จะเพิ่มในรอบถัดไป' : 'ไม่มีหน้าที่คุณต้องการ'}</p>
        {info && (
          <ul className="mx-auto mt-4 max-w-md list-disc space-y-1 pl-6 text-left text-slate-700">
            {info.features.map((f) => <li key={f}>{f}</li>)}
          </ul>
        )}
        <Link to="/" className="btn btn-primary mt-6">กลับหน้า Dashboard</Link>
      </div>
    </div>
  );
}
