// แท็บ "รายงาน/ทะเบียน" ของระบบจองคิวบริการแพทย์แผนไทย
// รายงานการจองรายเดือน/รายปี · สถิติ (ตามสถานะ บริการ วันในสัปดาห์ ช่วงเวลา ผู้รับบริการซ้ำ) · ทะเบียนรายชื่อผู้จอง · ส่งออก Excel
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Download, Loader2 } from 'lucide-react';
import { db } from '../firebase';
import { fmtDate, thMonths, todayStr } from '../lib/thai';
import { THAI_STATUSES, THAI_STATUS_COLOR, thaiTimeRange } from '../lib/thaiClinic';
import { Badge, EmptyState, ErrorState, Spinner } from '../components/ui';

const DOW = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '-');
const dowOf = (d) => new Date(`${d}T00:00:00`).getDay();
const countBy = (rows, fn) => { const m = new Map(); rows.forEach((r) => { const k = fn(r); m.set(k, (m.get(k) || 0) + 1); }); return m; };

export default function ReportTab({ cfg }) {
  const nowBE = Number(todayStr().slice(0, 4)) + 543;
  const [year, setYear] = useState(nowBE);
  const [month, setMonth] = useState(0); // 0 = ทั้งปี
  const [all, setAll] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAll(null); setError('');
    const y = year - 543;
    return onSnapshot(query(collection(db, 'thaiBookings'), where('date', '>=', `${y}-01-01`), where('date', '<=', `${y}-12-31`)),
      (s) => setAll(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => setError(e.code === 'permission-denied' ? 'ไม่มีสิทธิ์อ่านข้อมูลการจอง' : e.message));
  }, [year]);

  const rows = useMemo(() => (all || []).filter((b) => !month || Number(b.date.slice(5, 7)) === month).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)), [all, month]);
  const st = (list, s) => list.filter((b) => b.status === s).length;

  const monthly = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const l = (all || []).filter((b) => Number(b.date.slice(5, 7)) === i + 1);
    return {
      m: i + 1, total: l.length, ...Object.fromEntries(THAI_STATUSES.map((s) => [s, st(l, s)])),
      online: l.filter((b) => b.source === 'online').length, staff: l.filter((b) => b.source !== 'online').length,
      people: new Set(l.map((b) => b.phone).filter(Boolean)).size,
    };
  }), [all]); // eslint-disable-line react-hooks/exhaustive-deps
  const sum = (k) => monthly.reduce((a, r) => a + r[k], 0);

  const byService = useMemo(() => [...countBy(rows, (b) => b.service || 'ไม่ระบุ')].sort((a, b) => b[1] - a[1]), [rows]);
  const byDow = useMemo(() => { const m = countBy(rows, (b) => dowOf(b.date)); return DOW.map((d, i) => [d, m.get(i) || 0]); }, [rows]);
  const bySlot = useMemo(() => [...countBy(rows, (b) => thaiTimeRange(b.time, b.timeEnd))].sort((a, b) => a[0].localeCompare(b[0])), [rows]);
  const repeat = useMemo(() => {
    const m = new Map();
    rows.forEach((b) => { const k = b.phone || b.name; const e = m.get(k) || { name: b.name, phone: b.phone, n: 0, visited: 0 }; e.n += 1; if (b.status === 'มารับบริการแล้ว') e.visited += 1; m.set(k, e); });
    return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 10);
  }, [rows]);
  const visited = st(rows, 'มารับบริการแล้ว'); const noShow = st(rows, 'ไม่มาตามนัด');
  const label = month ? `${thMonths[month - 1]} ${year}` : `ทั้งปี ${year}`;

  const exportExcel = async () => {
    setBusy(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const head = (ws, title, n) => {
        ws.mergeCells(1, 1, 1, n); ws.getCell(1, 1).value = title; ws.getCell(1, 1).font = { bold: true, size: 14 }; ws.getCell(1, 1).alignment = { horizontal: 'center' };
        ws.mergeCells(2, 1, 2, n); ws.getCell(2, 1).value = `โรงพยาบาลส่งเสริมสุขภาพตำบลบ้านหนองสนม กองสาธารณสุข องค์การบริหารส่วนจังหวัดสกลนคร · ${label}`; ws.getCell(2, 1).alignment = { horizontal: 'center' };
      };
      const table = (ws, cols, data, widths) => {
        const hr = ws.addRow(cols); hr.font = { bold: true }; hr.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        hr.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } }; });
        data.forEach((r) => ws.addRow(r));
        ws.eachRow((r, i) => { if (i >= 3) r.eachCell((c) => { c.border = { top: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' }, bottom: { style: 'thin' } }; }); });
        widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
      };
      const w1 = wb.addWorksheet('ทะเบียนการจอง', { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 } });
      head(w1, 'ทะเบียนการจองคิวบริการแพทย์แผนไทย', 10);
      table(w1, ['ที่', 'เลขที่การจอง', 'วันที่', 'เวลา', 'ชื่อ - สกุล', 'โทรศัพท์', 'บริการ', 'อาการ/หมายเหตุ', 'สถานะ', 'ช่องทาง'],
        rows.map((b, i) => [i + 1, b.code, fmtDate(b.date), thaiTimeRange(b.time, b.timeEnd), b.name, b.phone, b.service, b.note || '', b.status, b.source === 'online' ? 'จองออนไลน์' : 'เจ้าหน้าที่']),
        [6, 24, 12, 14, 26, 14, 28, 34, 16, 14]);
      const w2 = wb.addWorksheet('สถิติรายเดือน', { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 } });
      head(w2, `สถิติการจองคิวแพทย์แผนไทย รายเดือน พ.ศ. ${year}`, 11);
      table(w2, ['เดือน', 'จองทั้งหมด', ...THAI_STATUSES, 'ออนไลน์', 'เจ้าหน้าที่', 'ผู้รับบริการ (คน)', '% มารับบริการ'],
        [...monthly.map((r) => [thMonths[r.m - 1], r.total, ...THAI_STATUSES.map((s) => r[s]), r.online, r.staff, r.people, pct(r['มารับบริการแล้ว'], r['มารับบริการแล้ว'] + r['ไม่มาตามนัด'])]),
          ['รวม', sum('total'), ...THAI_STATUSES.map((s) => sum(s)), sum('online'), sum('staff'), '', pct(sum('มารับบริการแล้ว'), sum('มารับบริการแล้ว') + sum('ไม่มาตามนัด'))]],
        [14, 12, 12, 12, 14, 12, 10, 10, 10, 14, 14]);
      const w3 = wb.addWorksheet('ตามบริการ-วัน-เวลา');
      head(w3, `สถิติตามบริการ / วัน / ช่วงเวลา · ${label}`, 3);
      table(w3, ['รายการ', 'จำนวนคิว', 'ร้อยละ'], [
        ...byService.map(([k, n]) => [`บริการ: ${k}`, n, pct(n, rows.length)]),
        ...byDow.map(([k, n]) => [`วัน: ${k}`, n, pct(n, rows.length)]),
        ...bySlot.map(([k, n]) => [`ช่วงเวลา: ${k} น.`, n, pct(n, rows.length)]),
      ], [46, 12, 10]);
      const buf = await wb.xlsx.writeBuffer();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      a.download = `ทะเบียนจองคิวแพทย์แผนไทย_${month ? `${String(month).padStart(2, '0')}-` : ''}${year}.xlsx`;
      a.click(); URL.revokeObjectURL(a.href);
    } finally { setBusy(false); }
  };

  const Bar = ({ n, max, color = 'bg-emerald-500' }) => <div className="h-2 w-full rounded bg-slate-100"><div className={`h-2 rounded ${color}`} style={{ width: `${max ? (n / max) * 100 : 0}%` }} /></div>;
  const years = [nowBE - 3, nowBE - 2, nowBE - 1, nowBE, nowBE + 1].filter((y) => y >= 2569 || y === nowBE);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className="input !w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="ปี พ.ศ.">{years.map((y) => <option key={y} value={y}>พ.ศ. {y}</option>)}</select>
        <select className="input !w-auto" value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="เดือน">
          <option value={0}>ทั้งปี</option>{thMonths.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <button className="btn btn-primary ml-auto" onClick={exportExcel} disabled={busy || !all}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} ส่งออก Excel (ทะเบียน + สถิติ)</button>
      </div>
      {error ? <ErrorState message={error} /> : !all ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {[['จองทั้งหมด', rows.length, 'bg-emerald-50 text-emerald-800'], ['ยืนยันแล้ว', st(rows, 'ยืนยันแล้ว'), 'bg-sky-50 text-sky-800'], ['มารับบริการ', visited, 'bg-green-50 text-green-800'],
              ['ไม่มาตามนัด', noShow, 'bg-rose-50 text-rose-800'], ['ยกเลิก', st(rows, 'ยกเลิก'), 'bg-slate-100 text-slate-700'], ['% มารับบริการ', pct(visited, visited + noShow), 'bg-amber-50 text-amber-800']].map(([l, v, c]) => (
              <div key={l} className={`rounded-xl p-3 text-center ${c}`}><div className="text-2xl font-extrabold">{v}</div><div className="text-xs">{l}</div></div>
            ))}
          </div>

          <section className="card overflow-x-auto p-3">
            <h3 className="mb-2 font-bold">📅 สถิติรายเดือน พ.ศ. {year}</h3>
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-emerald-100 text-emerald-900"><tr><th className="px-2 py-1.5 text-left">เดือน</th><th>จองทั้งหมด</th>{THAI_STATUSES.map((s) => <th key={s}>{s}</th>)}<th>ออนไลน์</th><th>เจ้าหน้าที่</th><th>ผู้รับบริการ</th><th>% มารับ</th></tr></thead>
              <tbody>
                {monthly.map((r) => (
                  <tr key={r.m} className={`border-t text-center ${month === r.m ? 'bg-emerald-50 font-semibold' : ''}`}>
                    <td className="px-2 py-1 text-left"><button className="underline" onClick={() => setMonth(month === r.m ? 0 : r.m)}>{thMonths[r.m - 1]}</button></td>
                    <td className="font-bold">{r.total}</td>{THAI_STATUSES.map((s) => <td key={s}>{r[s]}</td>)}<td>{r.online}</td><td>{r.staff}</td><td>{r.people}</td><td>{pct(r['มารับบริการแล้ว'], r['มารับบริการแล้ว'] + r['ไม่มาตามนัด'])}</td>
                  </tr>
                ))}
                <tr className="border-t-2 bg-slate-100 text-center font-bold"><td className="px-2 py-1 text-left">รวมทั้งปี</td><td>{sum('total')}</td>{THAI_STATUSES.map((s) => <td key={s}>{sum(s)}</td>)}<td>{sum('online')}</td><td>{sum('staff')}</td><td />{<td>{pct(sum('มารับบริการแล้ว'), sum('มารับบริการแล้ว') + sum('ไม่มาตามนัด'))}</td>}</tr>
              </tbody>
            </table>
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            {[['💆 ตามบริการ', byService, 'bg-emerald-500'], ['🗓️ ตามวันในสัปดาห์', byDow, 'bg-sky-500'], ['⏰ ตามช่วงเวลา', bySlot.map(([k, n]) => [`${k} น.`, n]), 'bg-pink-400']].map(([t, data, color]) => {
              const max = Math.max(1, ...data.map((x) => x[1]));
              return (
                <section key={t} className="card p-3">
                  <h3 className="mb-2 font-bold">{t} <span className="text-xs font-normal text-slate-500">({label})</span></h3>
                  {data.length === 0 ? <p className="text-sm text-slate-400">ไม่มีข้อมูล</p> : data.map(([k, n]) => (
                    <div key={k} className="mb-1.5"><div className="flex justify-between text-sm"><span>{k}</span><b>{n} <span className="font-normal text-slate-400">({pct(n, rows.length)})</span></b></div><Bar n={n} max={max} color={color} /></div>
                  ))}
                </section>
              );
            })}
          </div>

          <section className="card p-3">
            <h3 className="mb-2 font-bold">🔁 ผู้รับบริการที่จองบ่อย 10 อันดับแรก <span className="text-xs font-normal text-slate-500">({label})</span></h3>
            {repeat.length === 0 ? <p className="text-sm text-slate-400">ไม่มีข้อมูล</p> : (
              <ol className="list-decimal space-y-0.5 pl-5 text-sm">{repeat.map((r) => <li key={r.phone || r.name}>{r.name} <span className="text-slate-400">{r.phone}</span> — จอง <b>{r.n}</b> ครั้ง (มารับบริการ {r.visited})</li>)}</ol>
            )}
          </section>

          <section className="card overflow-x-auto">
            <h3 className="p-3 pb-0 font-bold">📒 ทะเบียนรายชื่อผู้จอง · {label} ({rows.length} รายการ)</h3>
            {rows.length === 0 ? <EmptyState title="ไม่มีรายการจองในช่วงนี้" /> : (
              <table className="mt-2 w-full min-w-[900px] text-left text-sm">
                <thead className="bg-slate-100 text-slate-600"><tr><th className="px-2 py-1.5">ที่</th><th>เลขที่การจอง</th><th>วันที่</th><th>เวลา</th><th>ชื่อ - สกุล</th><th>โทร</th><th>บริการ</th><th>อาการ</th><th>สถานะ</th></tr></thead>
                <tbody>
                  {rows.map((b, i) => (
                    <tr key={b.id} className="border-t align-top"><td className="px-2 py-1">{i + 1}</td><td className="whitespace-nowrap font-mono text-xs">{b.code}</td><td className="whitespace-nowrap">{fmtDate(b.date)}</td><td className="whitespace-nowrap">{thaiTimeRange(b.time, b.timeEnd)}</td>
                      <td>{b.name}</td><td>{b.phone}</td><td>{b.service}</td><td className="text-slate-500">{b.note}</td><td><Badge className={THAI_STATUS_COLOR[b.status]}>{b.status}</Badge></td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
