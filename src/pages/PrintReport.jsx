import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { REGISTRIES } from '../config/registries';
import { cellText } from '../lib/report';
import { ORG_SHORT, ORG_UNDER } from '../config/brand';
import { useFiscalYear } from '../context/FiscalYearContext';
import Logo from '../components/Logo';

// หน้าพิมพ์รายงาน (ใช้ฟังก์ชัน "พิมพ์" ของเบราว์เซอร์ -> เลือก "บันทึกเป็น PDF" เพื่อได้ไฟล์ PDF)
export default function PrintReport() {
  const { key } = useParams();
  const [params] = useSearchParams();
  const cfg = REGISTRIES[key];
  const { fy: currentFy } = useFiscalYear();
  const fy = params.get('fy') || currentFy;
  const [rows, setRows] = useState(null);

  useEffect(() => {
    if (!cfg) return;
    getDocs(query(collection(db, cfg.key), where('fy', '==', Number(fy))))
      .then((s) => {
        const list = s.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (a[cfg.dateField] || '').localeCompare(b[cfg.dateField] || ''));
        setRows(list);
      })
      .catch(() => setRows([]));
  }, [cfg, fy]);

  useEffect(() => {
    if (rows) setTimeout(() => window.print(), 400);
  }, [rows]);

  if (!cfg) return <div className="p-8">ไม่พบทะเบียนนี้</div>;
  const cols = cfg.reportColumns || cfg.fields.filter((f) => f.list).map((f) => f.key);
  const labels = cols.map((k) => cfg.fields.find((f) => f.key === k)?.label || k);
  const color = `#${cfg.reportColor || '4FA8E0'}`;

  return (
    <div className="mx-auto max-w-[1100px] bg-white p-6 print:p-0">
      <div className="mb-1 flex items-center justify-end gap-2 print:hidden">
        <button className="btn btn-outline" onClick={() => window.close()}>ปิดหน้านี้</button>
        <button className="btn btn-primary" onClick={() => window.print()}>พิมพ์ / บันทึกเป็น PDF</button>
      </div>
      <div className="mb-3 flex items-center gap-3 border-2 rounded-lg overflow-hidden" style={{ borderColor: color }}>
        <div className="flex items-center gap-3 px-3 py-2" style={{ background: color, width: '100%' }}>
          <Logo size={40} />
          <div className="flex-1 text-center text-white">
            <div className="text-lg font-bold">{cfg.title}</div>
            <div className="text-sm">{ORG_SHORT} · {ORG_UNDER} · ปีงบประมาณ {fy}</div>
          </div>
        </div>
      </div>
      {rows === null ? (
        <p className="p-6 text-center text-slate-500">กำลังโหลดข้อมูล...</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {labels.map((l) => (
                <th key={l} className="border border-slate-400 px-2 py-1.5 font-semibold" style={{ background: '#e8f4fc' }}>{l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={cols.length} className="border border-slate-400 p-4 text-center text-slate-400">ไม่มีข้อมูลในปีงบประมาณ {fy}</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id}>
                {cols.map((k) => <td key={k} className="border border-slate-300 px-2 py-1 align-top">{cellText(cfg, k, r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-4 text-xs text-slate-400 print:mt-8">พิมพ์จากระบบ NSN-PHC Management System เมื่อวันที่ {new Date().toLocaleDateString('th-TH', { dateStyle: 'long' })}</p>
    </div>
  );
}
