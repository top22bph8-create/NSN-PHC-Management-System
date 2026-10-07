import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Download, Printer, User } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useFiscalYear } from '../context/FiscalYearContext';
import { can } from '../lib/roles';
import { EVAL_ROUND_LABEL, EVAL_ROUND_RULE, LEAVE_STATUS_COLORS, LEAVE_TYPES, evalRoundOf, evalRoundStats, getQuota, matrixForAll, sortPeople, statsForPerson } from '../lib/leave';
import { exportXlsx } from '../lib/exportFile';
import { fmtDate, todayStr } from '../lib/thai';
import { Badge, EmptyState, ErrorState, Spinner } from './ui';

const printUrl = (kind, fy, personEmail) => {
  const base = `${window.location.origin}${window.location.pathname}#/print-leave-report/${kind}?fy=${fy}`;
  return personEmail ? `${base}&person=${encodeURIComponent(personEmail)}` : base;
};

// แผงรายงาน/สถิติการลา — เดิมเป็นหน้าแยก (LeaveReports.jsx) ย้ายมาฝังเป็นแท็บ "รายงาน/สถิติการลา" ในหน้าทะเบียนควบคุมวันลา (Leave.jsx) ตามคำขอ
// ไม่มี PageHeader/wrapper ของตัวเอง เพราะฝังอยู่ในเพจอื่นแล้ว
export default function LeaveReportsPanel() {
  const { profile } = useAuth();
  const { fy } = useFiscalYear();
  const viewAll = can(profile.role, 'leave', 'viewAll');
  const [tab, setTab] = useState('personal');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [quota, setQuota] = useState(null);
  const [people, setPeople] = useState(null);
  const [personEmail, setPersonEmail] = useState(profile.email);
  const [matrixMode, setMatrixMode] = useState('days'); // สลับมุมมองตาราง "สถิติการลารวม": จำนวนวัน/จำนวนครั้ง/วันที่ลาล่าสุด
  const [evalRound, setEvalRound] = useState(evalRoundOf(todayStr())); // เกณฑ์ประเมินผล: เริ่มที่รอบปัจจุบันตามวันนี้

  useEffect(() => { getQuota().then(setQuota).catch(() => setQuota({})); }, []);
  useEffect(() => {
    setRows(null); setError('');
    const base = [where('fy', '==', fy)];
    if (!viewAll) base.push(where('userEmail', '==', profile.email));
    return onSnapshot(query(collection(db, 'leaves'), ...base),
      (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.start || '').localeCompare(b.start || ''))),
      (e) => setError(e.message));
  }, [fy, viewAll, profile.email]);
  useEffect(() => {
    return onSnapshot(collection(db, 'users'),
      (s) => setPeople(sortPeople(s.docs.map((d) => d.data()).filter((u) => u.role !== 'pending'))),
      () => setPeople([]));
  }, []);

  const person = useMemo(() => (people || []).find((p) => p.email === personEmail) || (personEmail === profile.email ? profile : null), [people, personEmail, profile]);
  const personRows = useMemo(() => (rows || []).filter((l) => l.userEmail === personEmail), [rows, personEmail]);
  const stats = useMemo(() => (quota ? statsForPerson(personRows, quota) : []), [personRows, quota]);
  const matrix = useMemo(() => (people && rows ? matrixForAll(people, rows) : { types: LEAVE_TYPES, rows: [] }), [people, rows]);

  // เกณฑ์ประเมินผล (ลาป่วย+ลากิจ) ต่อรอบ: viewAll เห็นทุกคน ส่วนคนทั่วไปเห็นเฉพาะของตัวเอง (rows ถูกจำกัดด้วย email ไว้แล้วตั้งแต่ query)
  const evalPeople = useMemo(() => {
    const list = viewAll ? sortPeople(people || []) : [profile];
    return list.map((p) => ({ ...p, stats: evalRoundStats((rows || []).filter((l) => l.userEmail === p.email), evalRound) }));
  }, [viewAll, people, rows, evalRound, profile]);

  const tabs = [
    ['personal', 'ทะเบียนคุมการลา (รายบุคคล)'],
    ['statsPersonal', 'สถิติการลา (รายบุคคล)'],
    ...(viewAll ? [['combined', 'ทะเบียนรวมการลา (ทุกคน)'], ['statsAll', 'สถิติการลารวม (ทุกคน)']] : []),
    ['evalRound', 'เกณฑ์ประเมินผล (ลาป่วย+ลากิจ)'],
  ];

  const needsPerson = tab === 'personal' || tab === 'statsPersonal';

  const exportPersonal = () => exportXlsx(
    personRows.map((l) => ({ ประเภท: l.type, ตั้งแต่: fmtDate(l.start), ถึง: fmtDate(l.end), จำนวนวัน: l.days, เหตุผล: l.reason, สถานะ: l.status, ผู้พิจารณา: l.decidedBy || '', หมายเหตุ: l.decisionNote || '' })),
    'ทะเบียนคุมการลา', `ทะเบียนคุมการลา-${person?.name || personEmail}-ปีงบ${fy}`,
  );
  const exportCombined = () => exportXlsx(
    (rows || []).map((l) => ({ ชื่อ: l.name, ตำแหน่ง: l.position, ประเภท: l.type, ตั้งแต่: fmtDate(l.start), ถึง: fmtDate(l.end), จำนวนวัน: l.days, เหตุผล: l.reason, สถานะ: l.status, ผู้พิจารณา: l.decidedBy || '' })),
    'ทะเบียนรวมการลา', `ทะเบียนรวมการลา-ปีงบ${fy}`,
  );
  const exportStatsPersonal = () => exportXlsx(
    stats.map((s) => ({ ประเภท: s.type, โควตาต่อปี: s.quota ?? 'ไม่จำกัด', ใช้แล้ว: s.used, รออนุมัติ: s.pending, คงเหลือ: s.remaining ?? '-', จำนวนครั้ง: s.count })),
    'สถิติการลา', `สถิติการลา-${person?.name || personEmail}-ปีงบ${fy}`,
  );
  const exportStatsAll = () => exportXlsx(
    matrix.rows.map((r) => ({ ชื่อ: r.name, ตำแหน่ง: r.position, ...Object.fromEntries(matrix.types.map((t) => [t, r.byType[t] || 0])), รวมทั้งหมด: r.total })),
    'สถิติการลารวม', `สถิติการลารวม-ปีงบ${fy}`,
  );
  const exportEvalRound = () => exportXlsx(
    evalPeople.map((p) => ({
      ชื่อ: p.name || p.email, ตำแหน่ง: p.position || '',
      [`ลาป่วย (ครั้ง, เกณฑ์ ${EVAL_ROUND_RULE.maxCountEach})`]: p.stats.sickCount,
      [`ลาป่วย (วัน)`]: p.stats.sickDays,
      [`ลากิจ (ครั้ง, เกณฑ์ ${EVAL_ROUND_RULE.maxCountEach})`]: p.stats.personalCount,
      [`ลากิจ (วัน)`]: p.stats.personalDays,
      [`รวมลาป่วย+ลากิจ (วัน, เกณฑ์ ${EVAL_ROUND_RULE.maxCombinedDays})`]: p.stats.combinedDays,
      สถานะ: (p.stats.sickOver || p.stats.personalOver || p.stats.combinedOver) ? 'เกินเกณฑ์' : 'ปกติ',
    })),
    'เกณฑ์ประเมินผล', `เกณฑ์ประเมินผล-รอบที่${evalRound}-ปีงบ${fy}`,
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`rounded-full px-4 py-1.5 text-sm ${tab === k ? 'bg-brand-600 font-semibold text-white' : 'bg-white text-brand-800 ring-1 ring-brand-200 hover:bg-brand-50'}`}>{l}</button>)}
      </div>

      {needsPerson && (
        <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
          <User className="h-5 w-5 text-brand-600" />
          {viewAll ? (
            <select className="input !w-auto" value={personEmail} onChange={(e) => setPersonEmail(e.target.value)}>
              {(people || []).map((p) => <option key={p.email} value={p.email}>{p.name || p.email}{p.position ? ` (${p.position})` : ''}</option>)}
            </select>
          ) : (
            <span className="font-medium">{profile.name || profile.email}</span>
          )}
        </div>
      )}

      <div className="mb-3 flex flex-wrap justify-end gap-2">
        {tab === 'personal' && (
          <>
            <button className="btn btn-outline !py-1.5" onClick={exportPersonal} disabled={!personRows.length}><Download className="h-4 w-4" /> ส่งออก Excel</button>
            <button className="btn btn-primary !py-1.5" onClick={() => window.open(printUrl('personal', fy, personEmail), '_blank')}><Printer className="h-4 w-4" /> พิมพ์ PDF</button>
          </>
        )}
        {tab === 'combined' && (
          <>
            <button className="btn btn-outline !py-1.5" onClick={exportCombined} disabled={!(rows || []).length}><Download className="h-4 w-4" /> ส่งออก Excel</button>
            <button className="btn btn-primary !py-1.5" onClick={() => window.open(printUrl('combined', fy), '_blank')}><Printer className="h-4 w-4" /> พิมพ์ PDF</button>
          </>
        )}
        {tab === 'statsPersonal' && (
          <>
            <button className="btn btn-outline !py-1.5" onClick={exportStatsPersonal} disabled={!stats.length}><Download className="h-4 w-4" /> ส่งออก Excel</button>
            <button className="btn btn-primary !py-1.5" onClick={() => window.open(printUrl('statsPersonal', fy, personEmail), '_blank')}><Printer className="h-4 w-4" /> พิมพ์ PDF</button>
          </>
        )}
        {tab === 'statsAll' && (
          <>
            <div className="mr-auto flex gap-1 rounded-full bg-slate-100 p-1 text-sm">
              {[['days', 'จำนวนวัน'], ['count', 'จำนวนครั้ง'], ['lastDate', 'วันลาล่าสุด']].map(([k, l]) => (
                <button key={k} onClick={() => setMatrixMode(k)} className={`rounded-full px-3 py-1 ${matrixMode === k ? 'bg-white font-semibold text-brand-700 shadow-sm' : 'text-slate-500'}`}>{l}</button>
              ))}
            </div>
            <button className="btn btn-outline !py-1.5" onClick={exportStatsAll} disabled={!matrix.rows.length}><Download className="h-4 w-4" /> ส่งออก Excel</button>
            <button className="btn btn-primary !py-1.5" onClick={() => window.open(printUrl('statsAll', fy), '_blank')}><Printer className="h-4 w-4" /> พิมพ์ PDF</button>
          </>
        )}
        {tab === 'evalRound' && (
          <>
            <div className="mr-auto flex gap-1 rounded-full bg-slate-100 p-1 text-sm">
              {[1, 2].map((r) => (
                <button key={r} onClick={() => setEvalRound(r)} className={`rounded-full px-3 py-1 ${evalRound === r ? 'bg-white font-semibold text-brand-700 shadow-sm' : 'text-slate-500'}`}>{EVAL_ROUND_LABEL[r]}</button>
              ))}
            </div>
            <button className="btn btn-outline !py-1.5" onClick={exportEvalRound} disabled={!evalPeople.length}><Download className="h-4 w-4" /> ส่งออก Excel</button>
          </>
        )}
      </div>

      <div className="card overflow-x-auto">
        {error ? <ErrorState message={error} /> : rows === null || people === null || !quota ? <Spinner /> : (
          <>
            {tab === 'personal' && (
              personRows.length === 0 ? <EmptyState title="ยังไม่มีประวัติการลาในปีงบประมาณนี้" /> : (
                <table className="w-full min-w-[760px] text-left">
                  <thead className="bg-brand-50 text-sm text-slate-600"><tr><th className="px-3 py-2">ประเภท</th><th className="px-3 py-2">ช่วงวันที่</th><th className="px-3 py-2">วัน</th><th className="px-3 py-2">เหตุผล</th><th className="px-3 py-2">สถานะ</th><th className="px-3 py-2">ผู้พิจารณา</th></tr></thead>
                  <tbody>
                    {personRows.map((l) => (
                      <tr key={l.id} className="border-t border-slate-100">
                        <td className="px-3 py-2">{l.type}</td>
                        <td className="px-3 py-2 text-sm">{fmtDate(l.start)} - {fmtDate(l.end)}</td>
                        <td className="px-3 py-2">{l.days}</td>
                        <td className="max-w-[220px] px-3 py-2 text-sm text-slate-600">{l.reason}</td>
                        <td className="px-3 py-2"><Badge className={LEAVE_STATUS_COLORS[l.status]}>{l.status}</Badge></td>
                        <td className="px-3 py-2 text-sm">{l.decidedBy || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
            {tab === 'combined' && (
              (rows || []).length === 0 ? <EmptyState title="ยังไม่มีประวัติการลาในปีงบประมาณนี้" /> : (
                <table className="w-full min-w-[820px] text-left">
                  <thead className="bg-brand-50 text-sm text-slate-600"><tr><th className="px-3 py-2">ผู้ลา</th><th className="px-3 py-2">ประเภท</th><th className="px-3 py-2">ช่วงวันที่</th><th className="px-3 py-2">วัน</th><th className="px-3 py-2">สถานะ</th><th className="px-3 py-2">ผู้พิจารณา</th></tr></thead>
                  <tbody>
                    {(rows || []).map((l) => (
                      <tr key={l.id} className="border-t border-slate-100">
                        <td className="px-3 py-2"><div className="font-medium">{l.name}</div><div className="text-xs text-slate-500">{l.position}</div></td>
                        <td className="px-3 py-2">{l.type}</td>
                        <td className="px-3 py-2 text-sm">{fmtDate(l.start)} - {fmtDate(l.end)}</td>
                        <td className="px-3 py-2">{l.days}</td>
                        <td className="px-3 py-2"><Badge className={LEAVE_STATUS_COLORS[l.status]}>{l.status}</Badge></td>
                        <td className="px-3 py-2 text-sm">{l.decidedBy || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
            {tab === 'statsPersonal' && (
              stats.length === 0 ? <EmptyState title="ยังไม่มีข้อมูลการลาในปีงบประมาณนี้" /> : (
                <table className="w-full min-w-[760px] text-left">
                  <thead className="bg-brand-50 text-sm text-slate-600"><tr><th className="px-3 py-2">ประเภท</th><th className="px-3 py-2">โควตา/ปี</th><th className="px-3 py-2">ใช้แล้ว</th><th className="px-3 py-2">รออนุมัติ</th><th className="px-3 py-2">คงเหลือ</th><th className="px-3 py-2">จำนวนครั้ง</th><th className="px-3 py-2">วันลาล่าสุด</th></tr></thead>
                  <tbody>
                    {stats.map((s) => (
                      <tr key={s.type} className="border-t border-slate-100">
                        <td className="px-3 py-2">{s.type}</td>
                        <td className="px-3 py-2">{s.quota ?? 'ไม่จำกัด'}</td>
                        <td className="px-3 py-2">{s.used}</td>
                        <td className="px-3 py-2">{s.pending}</td>
                        <td className="px-3 py-2">{s.remaining ?? '-'}</td>
                        <td className="px-3 py-2">{s.count}</td>
                        <td className="px-3 py-2 text-sm">{s.lastDate ? fmtDate(s.lastDate) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
            {tab === 'statsAll' && (
              matrix.rows.length === 0 ? <EmptyState title="ยังไม่มีบุคลากร" /> : (
                <table className="w-full min-w-[900px] text-left">
                  <thead className="bg-brand-50 text-sm text-slate-600">
                    <tr>
                      <th className="px-3 py-2">ชื่อ-ตำแหน่ง</th>
                      {matrix.types.map((t) => <th key={t} className="px-3 py-2 text-center">{t}</th>)}
                      {matrixMode === 'days' && <th className="px-3 py-2 text-center">รวม</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.rows.map((r) => (
                      <tr key={r.email} className="border-t border-slate-100">
                        <td className="px-3 py-2"><div className="font-medium">{r.name}</div><div className="text-xs text-slate-500">{r.position}</div></td>
                        {matrix.types.map((t) => (
                          <td key={t} className="px-3 py-2 text-center">
                            {matrixMode === 'days' && (r.byType[t] || '-')}
                            {matrixMode === 'count' && (r.countByType[t] || '-')}
                            {matrixMode === 'lastDate' && (r.lastDateByType[t] ? fmtDate(r.lastDateByType[t]) : '-')}
                          </td>
                        ))}
                        {matrixMode === 'days' && <td className="px-3 py-2 text-center font-semibold">{r.total || '-'}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
            {tab === 'evalRound' && (
              evalPeople.length === 0 ? <EmptyState title="ไม่มีข้อมูล" /> : (
                <table className="w-full min-w-[760px] text-left">
                  <thead className="bg-brand-50 text-sm text-slate-600">
                    <tr>
                      {viewAll && <th className="px-3 py-2">ชื่อ-ตำแหน่ง</th>}
                      <th className="px-3 py-2 text-center">ลาป่วย (ครั้ง/วัน)</th>
                      <th className="px-3 py-2 text-center">ลากิจ (ครั้ง/วัน)</th>
                      <th className="px-3 py-2 text-center">รวมลาป่วย+ลากิจ (วัน)</th>
                      <th className="px-3 py-2 text-center">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evalPeople.map((p) => {
                      const s = p.stats;
                      const over = s.sickOver || s.personalOver || s.combinedOver;
                      return (
                        <tr key={p.email} className="border-t border-slate-100">
                          {viewAll && <td className="px-3 py-2"><div className="font-medium">{p.name || p.email}</div><div className="text-xs text-slate-500">{p.position}</div></td>}
                          <td className={`px-3 py-2 text-center ${s.sickOver ? 'font-semibold text-red-600' : ''}`}>{s.sickCount}/{EVAL_ROUND_RULE.maxCountEach} · {s.sickDays} วัน</td>
                          <td className={`px-3 py-2 text-center ${s.personalOver ? 'font-semibold text-red-600' : ''}`}>{s.personalCount}/{EVAL_ROUND_RULE.maxCountEach} · {s.personalDays} วัน</td>
                          <td className={`px-3 py-2 text-center ${s.combinedOver ? 'font-semibold text-red-600' : ''}`}>{s.combinedDays}/{EVAL_ROUND_RULE.maxCombinedDays}</td>
                          <td className="px-3 py-2 text-center"><Badge className={over ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800'}>{over ? 'เกินเกณฑ์' : 'ปกติ'}</Badge></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}
