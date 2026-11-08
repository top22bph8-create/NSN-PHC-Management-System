// ประเมินความพึงพอใจ (เจ้าหน้าที่): Dashboard · รายงาน · QR Code/ป้าย · ตั้งค่า — ข้อมูลทั้งหมดคำนวณจากคำตอบจริงใน Firestore ตามตัวกรอง
import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { BarChart3, Download, FileSpreadsheet, Printer, FileText } from 'lucide-react';
import { db } from '../../firebase';
import { PageHeader } from '../../components/Logo';
import { Spinner } from '../../components/ui';
import ThaiDateInput from '../../components/ThaiDateInput';
import { fmtDate, todayStr } from '../../lib/thai';
import SurveyQr from './SurveyQr';
import SurveySettings from './SurveySettings';
import { C, hbarPng, loadFonts, seriesPng } from './surveyCharts';
import { DEFAULT_SERVICES, NO_DATA, OTHER_VILLAGE, QUESTIONS, groupBy, keyFns, levelOf, monthLabel, summarize, withDay, f1, f2 } from './surveyLib';
import { REPORTS, buildReport, downloadCsv, downloadXlsx, openReportWindow, rawSheet } from './surveyExport';

const TABS = [['dash', 'แดชบอร์ด'], ['report', 'รายงาน / ส่งออก'], ['qr', 'QR Code / ป้าย A4'], ['set', 'ตั้งค่า']];
const fiscalStart = () => { const t = todayStr(); const [y, m] = t.split('-').map(Number); return `${m >= 10 ? y : y - 1}-10-01`; };
const monthStart = () => `${todayStr().slice(0, 7)}-01`;
const qStart = () => { const [y, m] = todayStr().split('-').map(Number); const s = m >= 10 ? 10 : m >= 7 ? 7 : m >= 4 ? 4 : 1; return `${y}-${String(s).padStart(2, '0')}-01`; };

function Kpi({ label, value, sub, tone }) {
  return <div className={`rounded-2xl bg-gradient-to-br ${tone} p-4 text-white shadow`}><div className="text-sm opacity-90">{label}</div><div className="text-3xl font-extrabold tabular-nums">{value}</div>{sub && <div className="text-xs opacity-90">{sub}</div>}</div>;
}

export default function SurveyHome() {
  const [tab, setTab] = useState('dash'); const [all, setAll] = useState(null); const [cfg, setCfg] = useState(null); const [msg, setMsg] = useState('');
  const [fl, setFl] = useState({ from: fiscalStart(), to: todayStr(), service: '', village: '' }); const [kind, setKind] = useState('month'); const [charts, setCharts] = useState([]);
  const say = (t) => { setMsg(t); setTimeout(() => setMsg(''), 5000); };
  useEffect(() => onSnapshot(collection(db, 'satisfactionResponses'), (s) => setAll(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setAll([])), []);
  useEffect(() => onSnapshot(doc(db, 'satisfactionConfig', 'main'), (s) => setCfg(s.exists() ? s.data() : {}), () => setCfg({})), []);
  const base = useMemo(() => withDay(all || []), [all]);
  const rows = useMemo(() => base.filter((r) => (!fl.from || r.day >= fl.from) && (!fl.to || r.day <= fl.to) && (!fl.service || r.service === fl.service) && (!fl.village || r.village === fl.village)), [base, fl]);
  const S = useMemo(() => summarize(rows), [rows]);
  const services = useMemo(() => [...new Set([...(cfg?.services?.length ? cfg.services : DEFAULT_SERVICES), ...base.map((r) => r.service)])], [cfg, base]);
  const villages = useMemo(() => [...new Set([...(cfg?.villages || []), ...base.map((r) => r.village), OTHER_VILLAGE])], [cfg, base]);
  const set = (k, v) => setFl((x) => ({ ...x, [k]: v }));

  // กราฟ 4 แบบ (ใช้ทั้งในแดชบอร์ดและรายงาน PDF) — คำนวณใหม่ทุกครั้งที่ตัวกรองเปลี่ยน
  useEffect(() => {
    let dead = false;
    (async () => {
      await loadFonts(); if (dead) return;
      const mon = groupBy(rows, keyFns.month, true); const svc = groupBy(rows, keyFns.service, false).sort((a, b) => b.n - a.n); const maxN = Math.max(1, ...svc.map((x) => x.n));
      setCharts([
        hbarPng(S.aspects.map((a, i) => ({ label: `${i + 1}. ${QUESTIONS[i].s}`, value: a.avg })), { title: 'คะแนนเฉลี่ยแยก 6 ด้าน (เต็ม 5)', max: 5 }),
        seriesPng(mon.map((m) => ({ label: monthLabel(m.key), value: m.overall })), { title: 'แนวโน้มคะแนนเฉลี่ยรายเดือน', type: 'line', min: 1, max: 5, fmt: (v) => (Number.isInteger(v) ? String(v) : v.toFixed(2)) }),
        seriesPng(mon.map((m) => ({ label: monthLabel(m.key), value: m.n })), { title: 'จำนวนผู้ประเมินรายเดือน (ราย)', type: 'bar', color: C.green }),
        hbarPng(svc.map((x) => ({ label: x.key, value: x.n, text: `${x.n} ราย${x.overall != null ? ` · เฉลี่ย ${x.overall.toFixed(2)}` : ''}`, color: C.green })), { title: 'จำนวนผู้ประเมินแยกประเภทบริการ', max: maxN }),
      ]);
    })();
    return () => { dead = true; };
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const rep = useMemo(() => buildReport(kind, rows), [kind, rows]);
  const periodText = `${fl.from ? fmtDate(fl.from) : 'ตั้งแต่เริ่มมีข้อมูล'} – ${fl.to ? fmtDate(fl.to) : 'ปัจจุบัน'}`;
  const filterText = [fl.service && `ประเภทบริการ: ${fl.service}`, fl.village && `หมู่บ้าน: ${fl.village}`].filter(Boolean).join(' · ');
  const fname = `ความพึงพอใจ_${fl.from || 'all'}_${fl.to || 'now'}`;
  const xlsxOne = () => downloadXlsx([{ name: rep.title, head: rep.head, rows: rep.rows }], `${rep.title}_${fl.from}_${fl.to}`);
  const xlsxAll = () => downloadXlsx([{ name: 'สรุปภาพรวม', head: ['รายการ', 'ค่า'], rows: [['ช่วงเวลา', periodText], ['เงื่อนไขเพิ่มเติม', filterText || '-'], ['จำนวนผู้ตอบ', S.n], ['คะแนนเฉลี่ยรวม', f2(S.overall)], ['ระดับ', levelOf(S.overall)], ['ร้อยละความพึงพอใจ', f1(S.pct)], ['ผู้ให้ข้อเสนอแนะ', S.comments]] },
    ...REPORTS.map(([k]) => { const r = buildReport(k, rows); return { name: r.title.replace('รายงาน', '').trim(), head: r.head, rows: r.rows }; }), rawSheet(rows)], fname);
  const pdf = (autoPrint) => { if (!openReportWindow({ rows, periodText, filterText, charts, autoPrint })) say('เบราว์เซอร์บล็อกหน้าต่างใหม่ — อนุญาต pop-up แล้วลองอีกครั้ง'); };

  if (!all || !cfg) return <Spinner />;
  const noData = !S.n;
  return (
    <div className="space-y-4">
      <PageHeader icon={BarChart3} emoji="📊" title="ประเมินความพึงพอใจ" subtitle="ผลประเมินจากผู้รับบริการที่สแกน QR Code · รายงานและส่งออก Excel/PDF" />
      <div className="flex flex-wrap items-center gap-2">{TABS.map(([k, t]) => <button key={k} onClick={() => setTab(k)} className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-brand-50'}`}>{t}</button>)}
        {msg && <span className="rounded-lg bg-sky-50 px-3 py-1.5 text-sm text-sky-800 ring-1 ring-sky-200">{msg}</span>}</div>

      {(tab === 'dash' || tab === 'report') && (
        <section className="card space-y-2 p-4">
          <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label><span className="mb-1 block text-sm text-slate-600">วันที่เริ่มต้น</span><ThaiDateInput value={fl.from} onChange={(v) => set('from', v)} yearsBack={5} yearsForward={0} /></label>
            <label><span className="mb-1 block text-sm text-slate-600">วันที่สิ้นสุด</span><ThaiDateInput value={fl.to} onChange={(v) => set('to', v)} yearsBack={5} yearsForward={0} /></label>
            <label><span className="mb-1 block text-sm text-slate-600">ประเภทบริการ</span><select className="input" value={fl.service} onChange={(e) => set('service', e.target.value)}><option value="">ทั้งหมด</option>{services.map((s) => <option key={s}>{s}</option>)}</select></label>
            <label><span className="mb-1 block text-sm text-slate-600">หมู่บ้าน</span><select className="input" value={fl.village} onChange={(e) => set('village', e.target.value)}><option value="">ทั้งหมด</option>{villages.map((s) => <option key={s}>{s}</option>)}</select></label>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">{[['เดือนนี้', monthStart(), todayStr()], ['ไตรมาสนี้', qStart(), todayStr()], ['ปีงบประมาณนี้', fiscalStart(), todayStr()], ['ทั้งหมด', '', '']].map(([t, a, b]) => <button key={t} className="rounded-full bg-slate-100 px-3 py-1 hover:bg-brand-50" onClick={() => setFl((x) => ({ ...x, from: a, to: b }))}>{t}</button>)}
            <span className="self-center text-slate-500">พบ {S.n.toLocaleString('th-TH')} แบบประเมินตามเงื่อนไข (จากทั้งหมด {base.length.toLocaleString('th-TH')})</span></div>
        </section>)}

      {tab === 'dash' && (<>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="ผู้ตอบแบบประเมินทั้งหมด (ราย)" value={S.n.toLocaleString('th-TH')} tone="from-sky-600 to-cyan-500" />
          <Kpi label="คะแนนความพึงพอใจเฉลี่ย (เต็ม 5)" value={noData ? '0' : f2(S.overall)} sub={noData ? NO_DATA : `ระดับ${levelOf(S.overall)}`} tone="from-blue-700 to-sky-500" />
          <Kpi label="ร้อยละความพึงพอใจ (คะแนน 4–5)" value={noData ? '0%' : `${f1(S.pct)}%`} sub={noData ? NO_DATA : ''} tone="from-emerald-600 to-teal-500" />
          <Kpi label="ผู้ให้ข้อเสนอแนะ (ราย)" value={S.comments.toLocaleString('th-TH')} tone="from-teal-600 to-green-500" />
        </div>
        {noData && <p className="rounded-xl bg-amber-50 p-3 text-amber-900 ring-1 ring-amber-200">{NO_DATA}ตามเงื่อนไขที่เลือก — ลองปรับช่วงวันที่ หรือให้ผู้รับบริการสแกน QR Code ที่แท็บ “QR Code / ป้าย A4”</p>}
        <div className="grid gap-4 lg:grid-cols-2">{charts.map((c) => <section key={c.title} className="card p-3"><img src={c.data} alt={c.title} className="w-full" /></section>)}</div>
        <section className="card overflow-x-auto p-4"><h3 className="mb-2 font-bold text-slate-700">คะแนนรายด้าน (ตารางประกอบกราฟ)</h3>
          <table className="w-full min-w-[560px] text-sm"><thead><tr className="border-b bg-slate-50 text-left text-slate-600"><th className="p-2">ด้าน</th><th className="p-2 text-right">ผู้ตอบ</th><th className="p-2 text-right">เฉลี่ย</th><th className="p-2">ระดับ</th><th className="p-2 text-right">% พึงพอใจ</th></tr></thead>
            <tbody>{S.aspects.map((a, i) => <tr key={a.k} className="border-b last:border-0"><td className="p-2">{i + 1}. {QUESTIONS[i].t}</td><td className="p-2 text-right">{a.n}</td><td className="p-2 text-right font-semibold">{f2(a.avg)}</td><td className="p-2">{levelOf(a.avg)}</td><td className="p-2 text-right">{f1(a.pct)}</td></tr>)}</tbody></table></section>
      </>)}

      {tab === 'report' && (<>
        <section className="card space-y-3 p-4">
          <div className="flex flex-wrap gap-2">{REPORTS.map(([k, t]) => <button key={k} onClick={() => setKind(k)} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${kind === k ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>{t.replace('รายงาน', '').replace('ผลประเมิน', '').trim()}</button>)}</div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={() => pdf(false)} disabled={noData}><FileText className="h-4 w-4" /> รายงาน PDF (สรุปคะแนนและกราฟ)</button>
            <button className="btn btn-outline" onClick={() => pdf(true)} disabled={noData}><Printer className="h-4 w-4" /> พิมพ์รายงาน</button>
            <button className="btn btn-outline" onClick={xlsxOne} disabled={!rep.rows.length}><FileSpreadsheet className="h-4 w-4" /> Excel รายงานที่เลือก</button>
            <button className="btn btn-outline" onClick={xlsxAll} disabled={noData}><FileSpreadsheet className="h-4 w-4" /> Excel ครบทุกรายงาน + ข้อมูลดิบ</button>
            <button className="btn btn-outline" onClick={() => downloadCsv(rawSheet(rows), `${fname}_ข้อมูลแบบประเมิน`)} disabled={noData}><Download className="h-4 w-4" /> ข้อมูลแบบประเมิน (CSV)</button>
            <button className="btn btn-outline" onClick={() => { const r = buildReport('suggest', rows); downloadXlsx([{ name: 'ข้อเสนอแนะ', head: r.head, rows: r.rows }], `${fname}_ข้อเสนอแนะ`); }} disabled={noData}><Download className="h-4 w-4" /> ข้อเสนอแนะ (Excel)</button>
          </div>
          <p className="text-xs text-slate-400">รายงานทุกแบบเปลี่ยนตามตัวกรองด้านบน · ไตรมาสและรายปีใช้ปีงบประมาณ (ไตรมาส 1 = ต.ค.–ธ.ค.) · ข้อมูลแบบประเมินไม่มีชื่อ/เลขบัตรผู้ตอบ</p>
        </section>
        <section className="card overflow-x-auto p-4"><h3 className="mb-2 font-bold text-slate-700">{rep.title}</h3>
          {!rep.rows.length ? <p className="text-sm text-slate-500">{NO_DATA}</p> : (
            <table className="w-full text-sm" style={{ minWidth: rep.wide ? 900 : 640 }}><thead><tr className="border-b bg-slate-50 text-left text-slate-600">{rep.head.map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
              <tbody>{rep.rows.map((r, i) => <tr key={i} className="border-b align-top last:border-0">{r.map((c, j) => <td key={j} className={`p-2 ${rep.align?.[j] === 'r' ? 'text-right tabular-nums' : ''}`}>{c}</td>)}</tr>)}</tbody></table>)}
          {rep.note && <p className="mt-2 text-xs text-slate-400">{rep.note}: {QUESTIONS.map((q, i) => `${i + 1} ${q.s}`).join(' · ')}</p>}
        </section>
      </>)}

      {tab === 'qr' && <SurveyQr say={say} />}
      {tab === 'set' && <SurveySettings say={say} />}
    </div>);
}
