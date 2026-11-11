// หน้าหลักโมดูลสอบสวนโรค & แผนที่การระบาด — Dashboard + รายการเหตุการณ์
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { Biohazard, FilePlus2, FileText, Map as MapIcon, Paperclip, Pencil, Plus, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../../firebase';
import { fmtDate } from '../../lib/thai';
import { PageHeader } from '../../components/Logo';
import { Badge, ConfirmDialog, Spinner } from '../../components/ui';
import { deleteCaseFully } from './caseOps';
import CaseFormModal from './CaseFormModal';
import { Curve, HBars } from './OutbreakBars';
import { LEVELS, STATUS, STATUS_TONE, countBy, epiCurve, isDead, nf, vilLabel } from './outbreakLib';

function Kpi({ label, value, tone }) {
  return <div className={`rounded-2xl bg-gradient-to-br ${tone} p-4 text-white shadow`}><div className="text-sm opacity-90">{label}</div><div className="text-3xl font-extrabold tabular-nums">{nf(value)}</div></div>;
}

export default function OutbreakHome() {
  const nav = useNavigate();
  const [cases, setCases] = useState(null); const [people, setPeople] = useState(null);
  const [form, setForm] = useState(false); const [editCs, setEditCs] = useState(null); const [delCs, setDelCs] = useState(null); const [busy, setBusy] = useState(false); const [all, setAll] = useState(false); const [hint, setHint] = useState(''); const [lv, setLv] = useState('');
  useEffect(() => onSnapshot(collection(db, 'outbreakCases'), (s) => setCases(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setCases([])), []);
  useEffect(() => onSnapshot(collection(db, 'outbreakPeople'), (s) => setPeople(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setPeople([])), []);
  const d = useMemo(() => {
    const cs = cases || []; const pt = (people || []).filter((p) => p.kind === 'patient');
    const disease = Object.fromEntries(cs.map((c) => [c.id, c.disease?.startsWith('อื่นๆ') && c.diseaseOther ? c.diseaseOther : c.disease || 'ไม่ระบุ']));
    const today = new Date(); const from = new Date(today); from.setDate(from.getDate() - 29); const p2 = (x) => String(x).padStart(2, '0'); const iso = (x) => `${x.getFullYear()}-${p2(x.getMonth() + 1)}-${p2(x.getDate())}`;
    return {
      cases: cs.length, patients: pt.length, deaths: pt.filter(isDead).length, investigating: cs.filter((c) => c.status === 'investigating').length, controlled: cs.filter((c) => c.status === 'controlled' || c.status === 'closed').length,
      byDisease: countBy(pt, (p) => disease[p.caseId] || 'ไม่ระบุ'), byVillage: countBy(pt, (p) => vilLabel(p.villageNo)),
      curve: epiCurve(pt, { from: iso(from), to: iso(today) }),
      reg: cs.flatMap((c) => (c.files || []).map((f) => ({ ...f, caseId: c.id, caseTitle: c.title }))).sort((a, b) => String(b.date).localeCompare(String(a.date))),
      withFiles: cs.filter((c) => (c.files || []).length).length,
      recent: [...cs].sort((a, b) => String(b.reportDate).localeCompare(String(a.reportDate))), count: Object.fromEntries(cs.map((c) => [c.id, pt.filter((p) => p.caseId === c.id).length])), disease,
    };
  }, [cases, people]);
  if (!cases || !people) return <Spinner />;
  return (
    <div className="space-y-4">
      <PageHeader icon={Biohazard} emoji="🦠" title="สอบสวนโรค & แผนที่การระบาด" subtitle="เปิดเคสสอบสวนโรค บันทึกผู้ป่วย/ผู้สัมผัส วิเคราะห์ Person–Time–Place และ Epidemic Curve" />
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" onClick={() => setForm(true)}><Plus className="h-4 w-4" /> เปิดสอบสวนโรคใหม่</button>
        <button className="btn btn-outline" onClick={() => nav('/outbreak/map')}><MapIcon className="h-4 w-4" /> ดูแผนที่การระบาด</button>
        <button className="btn btn-outline" onClick={() => setHint('ออกรายงานสอบสวนโรค (PDF/Word) อยู่ในรอบพัฒนาที่ 3 — เปิดเคสแล้วใช้ปุ่มพิมพ์สรุปในหน้าเคสได้ก่อน')}><FileText className="h-4 w-4" /> ออกรายงานสอบสวนโรค</button>
        {hint && <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-sm text-amber-800 ring-1 ring-amber-200">{hint}</span>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="เหตุการณ์สอบสวนโรค" value={d.cases} tone="from-rose-600 to-pink-500" />
        <Kpi label="ผู้ป่วย (ราย)" value={d.patients} tone="from-orange-500 to-amber-500" />
        <Kpi label="ผู้เสียชีวิต (ราย)" value={d.deaths} tone="from-slate-700 to-slate-500" />
        <Kpi label="กำลังสอบสวน" value={d.investigating} tone="from-sky-600 to-cyan-500" />
        <Kpi label="ควบคุมโรคแล้ว" value={d.controlled} tone="from-emerald-600 to-teal-500" />
      </div>
      <Curve title="ผู้ป่วยรายวัน (ตามวันเริ่มป่วย 30 วันล่าสุด)" rows={d.curve} fmtLabel={fmtDate} />
      <div className="grid gap-4 md:grid-cols-2">
        <HBars title="ผู้ป่วยแยกตามโรค" data={d.byDisease} />
        <HBars title="ผู้ป่วยแยกตามหมู่บ้าน" data={d.byVillage} color="from-teal-600 to-teal-400" />
      </div>
      <section className="card overflow-x-auto p-4">
        <div className="mb-2 flex items-center justify-between"><h3 className="font-bold text-slate-700">{all ? 'เหตุการณ์ทั้งหมด' : 'เหตุการณ์ล่าสุด'} ({nf(d.recent.length)})</h3>{d.recent.length > 8 && <button className="text-sm text-brand-700 underline" onClick={() => setAll(!all)}>{all ? 'แสดงเฉพาะ 8 รายการล่าสุด' : 'แสดงทั้งหมด'}</button>}</div>
        {!d.recent.length ? <p className="text-sm text-slate-500"><FilePlus2 className="mr-1 inline h-4 w-4" />ยังไม่มีเหตุการณ์ — กด “เปิดสอบสวนโรคใหม่” เพื่อเริ่มต้น</p> : (
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b bg-slate-50 text-left text-slate-600"><th className="p-2">วันที่รับแจ้ง</th><th className="p-2">เหตุการณ์</th><th className="p-2">โรค</th><th className="p-2">หมู่</th><th className="p-2 text-right">ผู้ป่วย</th><th className="p-2">สถานะ</th><th className="p-2">ไฟล์สอบสวน</th><th className="w-24 p-2" /></tr></thead>
            <tbody>{(all ? d.recent : d.recent.slice(0, 8)).map((c) => (
              <tr key={c.id} className="cursor-pointer border-b last:border-0 hover:bg-rose-50" onClick={() => nav(`/outbreak/${c.id}`)}>
                <td className="p-2">{fmtDate(c.reportDate)}</td><td className="p-2 font-medium text-brand-800"><Link to={`/outbreak/${c.id}`}>{c.title}</Link></td><td className="p-2">{d.disease[c.id]}</td><td className="p-2">{c.villageNo || '-'}</td><td className="p-2 text-right tabular-nums">{nf(d.count[c.id])}</td><td className="p-2"><Badge className={STATUS_TONE[c.status]}>{STATUS[c.status] || c.status}</Badge></td><td className="p-2">{(c.files || []).length ? <span className="inline-flex items-center gap-1 text-emerald-700"><Paperclip className="h-3.5 w-3.5" />มี {(c.files || []).length} ไฟล์</span> : <span className="text-slate-300">-</span>}</td>
                <td className="p-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}><button className="mr-3 text-brand-700" aria-label="แก้ไขเคส" title="แก้ไขเคส" onClick={() => setEditCs(c)}><Pencil className="h-4 w-4" /></button><button className="text-red-600" aria-label="ลบเคส" title="ลบเคส" onClick={() => setDelCs(c)}><Trash2 className="h-4 w-4" /></button></td>
              </tr>))}</tbody>
          </table>)}
      </section>
      <section className="card overflow-x-auto p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="font-bold text-slate-700">ทะเบียนไฟล์การสอบสวนโรค E0 / E1 / E2</h3>
          <span className="text-sm text-slate-500">มีไฟล์แนบ {nf(d.withFiles)} เคส · {nf(d.reg.length)} ไฟล์</span>
          <div className="ml-auto flex gap-1.5">{[['', 'ทั้งหมด'], ...Object.keys(LEVELS).map((k) => [k, k])].map(([k, t]) => <button key={k || 'all'} onClick={() => setLv(k)} className={`rounded-full px-3 py-1 text-sm font-semibold ${lv === k ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-brand-50'}`}>{t}{k ? ` (${d.reg.filter((f) => f.level === k).length})` : ''}</button>)}</div>
        </div>
        {!d.reg.length ? <p className="text-sm text-slate-500">ยังไม่มีไฟล์สอบสวนโรคที่แนบ — เปิดเคสแล้วไปที่แท็บ “ไฟล์สอบสวน / ทะเบียน E0–E2”</p> : (
          <table className="w-full min-w-[640px] text-sm"><thead><tr className="border-b bg-slate-50 text-left text-slate-600"><th className="p-2">ระดับ</th><th className="p-2">เคส</th><th className="p-2">ไฟล์</th><th className="p-2">มาจาก</th><th className="p-2">วันที่เอกสาร</th></tr></thead>
            <tbody>{d.reg.filter((f) => !lv || f.level === lv).map((f) => (<tr key={f.id} className="cursor-pointer border-b last:border-0 hover:bg-emerald-50" onClick={() => nav(`/outbreak/${f.caseId}`)}><td className="p-2"><Badge className={LEVELS[f.level]?.tone}>{f.level}</Badge></td><td className="p-2 font-medium text-brand-800">{f.caseTitle}</td><td className="p-2">{f.name}</td><td className="p-2">{f.source}</td><td className="p-2 whitespace-nowrap">{fmtDate(f.date)}</td></tr>))}</tbody></table>)}
      </section>
      {form && <CaseFormModal onClose={() => setForm(false)} onSaved={(id) => nav(`/outbreak/${id}`)} />}
      {editCs && <CaseFormModal initial={editCs} onClose={() => setEditCs(null)} />}
      {delCs && <ConfirmDialog busy={busy} onCancel={() => setDelCs(null)} message={`ลบเคส “${delCs.title}” พร้อมผู้ป่วย ผู้สัมผัส และไฟล์แนบทั้งหมดในเคสนี้ ใช่หรือไม่? (กู้คืนไม่ได้)`}
        onConfirm={async () => { setBusy(true); try { await deleteCaseFully(delCs, (people || []).filter((p) => p.caseId === delCs.id)); setDelCs(null); } catch (e) { window.alert('ลบไม่สำเร็จ: ' + (e.code || e.message)); } finally { setBusy(false); } }} />}
    </div>
  );
}
