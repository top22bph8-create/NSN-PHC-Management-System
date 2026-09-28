import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { ORG_SHORT, ORG_UNDER } from '../config/brand';
import { useFiscalYear } from '../context/FiscalYearContext';
import { getQuota, matrixForAll, sortPeople, statsForPerson } from '../lib/leave';
import { fmtDate } from '../lib/thai';
import Logo from '../components/Logo';

const TITLES = {
  personal: 'ทะเบียนคุมการลา (รายบุคคล)',
  combined: 'ทะเบียนรวมการลา (ทุกคน)',
  statsPersonal: 'สถิติการลา (รายบุคคล)',
  statsAll: 'สถิติการลารวม (ทุกคน)',
};
const COLOR = '4FA8E0';

// หน้าพิมพ์รายงาน/สถิติการลา (ใช้ฟังก์ชัน "พิมพ์" ของเบราว์เซอร์ -> เลือก "บันทึกเป็น PDF")
export default function PrintLeaveReport() {
  const { kind } = useParams();
  const [params] = useSearchParams();
  const { fy: currentFy } = useFiscalYear();
  const fy = Number(params.get('fy') || currentFy);
  const personEmail = params.get('person') || '';

  const [rows, setRows] = useState(null);
  const [people, setPeople] = useState(null);
  const [quota, setQuota] = useState(null);
  const [person, setPerson] = useState(null);

  useEffect(() => {
    // รายงานรายบุคคล (personal/statsPersonal) กรองด้วย userEmail เสมอ ให้ตรงกับ Firestore Rules
    // (คนทั่วไปอ่านได้เฉพาะใบลาของตัวเอง — ไม่ใส่ตัวกรองนี้แล้วดึงทั้งปีจะถูกปฏิเสธทั้งคำขอ)
    const base = [where('fy', '==', fy)];
    if (personEmail) base.push(where('userEmail', '==', personEmail));
    getDocs(query(collection(db, 'leaves'), ...base))
      .then((s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.start || '').localeCompare(b.start || ''))))
      .catch(() => setRows([]));
    getDocs(collection(db, 'users'))
      .then((s) => setPeople(sortPeople(s.docs.map((d) => d.data()).filter((u) => u.role !== 'pending'))))
      .catch(() => setPeople([]));
    getQuota().then(setQuota).catch(() => setQuota({}));
    if (personEmail) getDoc(doc(db, 'users', personEmail)).then((s) => setPerson(s.exists() ? s.data() : { email: personEmail })).catch(() => setPerson({ email: personEmail }));
  }, [fy, personEmail]);

  const ready = rows !== null && people !== null && quota !== null && (!personEmail || person !== null);
  useEffect(() => { if (ready) setTimeout(() => window.print(), 400); }, [ready]);

  if (!TITLES[kind]) return <div className="p-8">ไม่พบรายงานนี้</div>;
  if (!ready) return <div className="p-8 text-center text-slate-500">กำลังโหลดข้อมูล...</div>;

  const personRows = personEmail ? rows.filter((l) => l.userEmail === personEmail) : [];
  const stats = personEmail ? statsForPerson(personRows, quota) : [];
  const matrix = matrixForAll(people, rows);

  return (
    <div className="mx-auto max-w-[1100px] bg-white p-6 print:p-0">
      <div className="mb-1 flex items-center justify-end gap-2 print:hidden">
        <button className="btn btn-outline" onClick={() => window.close()}>ปิดหน้านี้</button>
        <button className="btn btn-primary" onClick={() => window.print()}>พิมพ์ / บันทึกเป็น PDF</button>
      </div>
      <div className="mb-3 flex items-center gap-3 overflow-hidden rounded-lg border-2" style={{ borderColor: `#${COLOR}` }}>
        <div className="flex items-center gap-3 px-3 py-2" style={{ background: `#${COLOR}`, width: '100%' }}>
          <Logo size={40} />
          <div className="flex-1 text-center text-white">
            <div className="text-lg font-bold">{TITLES[kind]}{personEmail ? ` — ${person?.name || personEmail}${person?.position ? ` (${person.position})` : ''}` : ''}</div>
            <div className="text-sm">{ORG_SHORT} · {ORG_UNDER} · ปีงบประมาณ {fy}</div>
          </div>
        </div>
      </div>

      {kind === 'personal' && (
        <table className="w-full border-collapse text-sm">
          <thead><tr>
            {['ประเภท', 'ตั้งแต่', 'ถึง', 'จำนวนวัน', 'เหตุผล', 'สถานะ', 'ผู้พิจารณา'].map((h) => <th key={h} className="border border-slate-400 px-2 py-1.5 font-semibold" style={{ background: '#e8f4fc' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {personRows.length === 0 ? <tr><td colSpan={7} className="border border-slate-400 p-4 text-center text-slate-400">ไม่มีข้อมูลในปีงบประมาณ {fy}</td></tr> : personRows.map((l) => (
              <tr key={l.id}>
                <td className="border border-slate-300 px-2 py-1">{l.type}</td>
                <td className="border border-slate-300 px-2 py-1">{fmtDate(l.start)}</td>
                <td className="border border-slate-300 px-2 py-1">{fmtDate(l.end)}</td>
                <td className="border border-slate-300 px-2 py-1 text-center">{l.days}</td>
                <td className="border border-slate-300 px-2 py-1">{l.reason}</td>
                <td className="border border-slate-300 px-2 py-1">{l.status}</td>
                <td className="border border-slate-300 px-2 py-1">{l.decidedBy || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {kind === 'combined' && (
        <table className="w-full border-collapse text-sm">
          <thead><tr>
            {['ผู้ลา', 'ตำแหน่ง', 'ประเภท', 'ตั้งแต่', 'ถึง', 'จำนวนวัน', 'สถานะ', 'ผู้พิจารณา'].map((h) => <th key={h} className="border border-slate-400 px-2 py-1.5 font-semibold" style={{ background: '#e8f4fc' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={8} className="border border-slate-400 p-4 text-center text-slate-400">ไม่มีข้อมูลในปีงบประมาณ {fy}</td></tr> : rows.map((l) => (
              <tr key={l.id}>
                <td className="border border-slate-300 px-2 py-1">{l.name}</td>
                <td className="border border-slate-300 px-2 py-1">{l.position}</td>
                <td className="border border-slate-300 px-2 py-1">{l.type}</td>
                <td className="border border-slate-300 px-2 py-1">{fmtDate(l.start)}</td>
                <td className="border border-slate-300 px-2 py-1">{fmtDate(l.end)}</td>
                <td className="border border-slate-300 px-2 py-1 text-center">{l.days}</td>
                <td className="border border-slate-300 px-2 py-1">{l.status}</td>
                <td className="border border-slate-300 px-2 py-1">{l.decidedBy || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {kind === 'statsPersonal' && (
        <table className="w-full border-collapse text-sm">
          <thead><tr>
            {['ประเภท', 'โควตา/ปี', 'ใช้แล้ว', 'รออนุมัติ', 'คงเหลือ', 'จำนวนครั้ง'].map((h) => <th key={h} className="border border-slate-400 px-2 py-1.5 font-semibold" style={{ background: '#e8f4fc' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {stats.length === 0 ? <tr><td colSpan={6} className="border border-slate-400 p-4 text-center text-slate-400">ไม่มีข้อมูลในปีงบประมาณ {fy}</td></tr> : stats.map((s) => (
              <tr key={s.type}>
                <td className="border border-slate-300 px-2 py-1">{s.type}</td>
                <td className="border border-slate-300 px-2 py-1 text-center">{s.quota ?? 'ไม่จำกัด'}</td>
                <td className="border border-slate-300 px-2 py-1 text-center">{s.used}</td>
                <td className="border border-slate-300 px-2 py-1 text-center">{s.pending}</td>
                <td className="border border-slate-300 px-2 py-1 text-center">{s.remaining ?? '-'}</td>
                <td className="border border-slate-300 px-2 py-1 text-center">{s.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {kind === 'statsAll' && (
        <table className="w-full border-collapse text-xs">
          <thead><tr>
            <th className="border border-slate-400 px-2 py-1.5 font-semibold" style={{ background: '#e8f4fc' }}>ชื่อ-ตำแหน่ง</th>
            {matrix.types.map((t) => <th key={t} className="border border-slate-400 px-1 py-1.5 font-semibold" style={{ background: '#e8f4fc' }}>{t}</th>)}
            <th className="border border-slate-400 px-2 py-1.5 font-semibold" style={{ background: '#e8f4fc' }}>รวม</th>
          </tr></thead>
          <tbody>
            {matrix.rows.length === 0 ? <tr><td colSpan={matrix.types.length + 2} className="border border-slate-400 p-4 text-center text-slate-400">ไม่มีบุคลากร</td></tr> : matrix.rows.map((r) => (
              <tr key={r.email}>
                <td className="border border-slate-300 px-2 py-1">{r.name}<div className="text-[10px] text-slate-500">{r.position}</div></td>
                {matrix.types.map((t) => <td key={t} className="border border-slate-300 px-1 py-1 text-center">{r.byType[t] || '-'}</td>)}
                <td className="border border-slate-300 px-2 py-1 text-center font-semibold">{r.total || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="mt-4 text-xs text-slate-400 print:mt-8">พิมพ์จากระบบ NSN-PHC Management System เมื่อวันที่ {new Date().toLocaleDateString('th-TH', { dateStyle: 'long' })}</p>
    </div>
  );
}
