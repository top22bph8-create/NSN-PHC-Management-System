// รายละเอียดเคสสอบสวนโรค: ภาพรวม/วิเคราะห์ · ผู้ป่วย · ผู้สัมผัส · Timeline · ผลแล็บ · มาตรการควบคุมโรค
import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { ArrowLeft, Loader2, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { writeAudit } from '../../lib/audit';
import { fmtDate, todayStr } from '../../lib/thai';
import ThaiDateInput from '../../components/ThaiDateInput';
import { PageHeader } from '../../components/Logo';
import { Badge, ConfirmDialog, Modal, Spinner } from '../../components/ui';
import CaseFormModal from './CaseFormModal';
import { Curve, HBars } from './OutbreakBars';
import { AGE_ORDER, PERSON_STATUS, SEX, STATUS, STATUS_TONE, analyze, nf, vilLabel } from './outbreakLib';

const TABS = [['overview', 'ภาพรวม/วิเคราะห์'], ['patients', 'ผู้ป่วย'], ['contacts', 'ผู้สัมผัส'], ['timeline', 'Timeline'], ['labs', 'ผลตรวจแล็บ'], ['measures', 'มาตรการควบคุมโรค']];
const lab = 'mb-1 block text-sm text-slate-600';

function PersonModal({ kind, caseId, initial, onClose }) {
  const isP = kind === 'patient';
  const [f, setF] = useState(initial || { name: '', age: '', sex: '', villageNo: '', address: '', onsetDate: '', status: isP ? PERSON_STATUS[0] : PERSON_STATUS[3], symptoms: '', relation: '', lastContact: '', lat: '', lng: '', note: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    if (!f.name.trim()) return setErr('กรุณาใส่ชื่อ-สกุล');
    setBusy(true); setErr('');
    try {
      const data = { caseId, kind, name: f.name.trim(), age: f.age === '' ? '' : Number(f.age), sex: f.sex, villageNo: String(f.villageNo || '').trim(), address: f.address.trim(), onsetDate: f.onsetDate || '', status: f.status, symptoms: f.symptoms.trim(), relation: f.relation.trim(), lastContact: f.lastContact || '', lat: f.lat === '' ? '' : Number(f.lat), lng: f.lng === '' ? '' : Number(f.lng), note: f.note.trim(), updatedAt: serverTimestamp() };
      if (initial?.id) await updateDoc(doc(db, 'outbreakPeople', initial.id), data);
      else { const r = await addDoc(collection(db, 'outbreakPeople'), { ...data, createdAt: serverTimestamp() }); await writeAudit({ action: 'create', module: 'outbreak', docId: r.id, label: `${isP ? 'ผู้ป่วย' : 'ผู้สัมผัส'} ในเคส ${caseId}` }); }
      onClose();
    } catch (e) { setErr('บันทึกไม่สำเร็จ: ' + (e.code || e.message)); } finally { setBusy(false); }
  };
  return (
    <Modal title={`${initial ? 'แก้ไข' : 'เพิ่ม'}${isP ? 'ผู้ป่วย' : 'ผู้สัมผัส'}`} onClose={onClose} wide
      footer={<><button className="btn btn-outline" onClick={onClose} disabled={busy}>ยกเลิก</button><button className="btn btn-primary" onClick={save} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} บันทึก</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className={lab}>ชื่อ-สกุล * (ไม่ต้องใส่เลขบัตรประชาชน)</span><input className="input" value={f.name} onChange={set('name')} /></label>
        <label><span className={lab}>อายุ (ปี)</span><input className="input" type="number" min="0" value={f.age} onChange={set('age')} /></label>
        <label><span className={lab}>เพศ</span><select className="input" value={f.sex} onChange={set('sex')}><option value="">ไม่ระบุ</option><option value="1">ชาย</option><option value="2">หญิง</option></select></label>
        <label><span className={lab}>หมู่ที่</span><input className="input" value={f.villageNo} onChange={set('villageNo')} /></label>
        <label><span className={lab}>ที่อยู่ (บ้านเลขที่/จุดสังเกต)</span><input className="input" value={f.address} onChange={set('address')} /></label>
        {isP ? <label><span className={lab}>วันเริ่มป่วย</span><ThaiDateInput value={f.onsetDate} onChange={(v) => setF((x) => ({ ...x, onsetDate: v }))} yearsBack={3} yearsForward={0} /></label>
          : <label><span className={lab}>วันที่สัมผัสล่าสุด</span><ThaiDateInput value={f.lastContact} onChange={(v) => setF((x) => ({ ...x, lastContact: v }))} yearsBack={3} yearsForward={0} /></label>}
        <label><span className={lab}>สถานะ</span><select className="input" value={f.status} onChange={set('status')}>{PERSON_STATUS.map((s) => <option key={s}>{s}</option>)}</select></label>
        {isP ? <label className="sm:col-span-2"><span className={lab}>อาการ/ประวัติการป่วย/การรักษา</span><textarea className="input min-h-[72px]" value={f.symptoms} onChange={set('symptoms')} /></label>
          : <label className="sm:col-span-2"><span className={lab}>ความสัมพันธ์/ลักษณะการสัมผัส</span><input className="input" value={f.relation} onChange={set('relation')} placeholder="เช่น ญาติในบ้านเดียวกัน, เพื่อนร่วมชั้น" /></label>}
        <label><span className={lab}>ละติจูด (GPS — ใช้กับแผนที่ในรอบถัดไป)</span><input className="input" type="number" step="any" value={f.lat} onChange={set('lat')} placeholder="เช่น 17.1234" /></label>
        <label><span className={lab}>ลองจิจูด</span><input className="input" type="number" step="any" value={f.lng} onChange={set('lng')} placeholder="เช่น 104.1234" /></label>
        <label className="sm:col-span-2"><span className={lab}>หมายเหตุ</span><input className="input" value={f.note} onChange={set('note')} /></label>
      </div>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
    </Modal>
  );
}

// รายการย่อยในเอกสารเคส (Timeline/แล็บ/มาตรการ): เก็บเป็นอาร์เรย์ในเอกสารเคสเดียวกัน
function ListTab({ cs, field, columns, empty, blank, say }) {
  const [f, setF] = useState(blank); const [busy, setBusy] = useState(false);
  const items = [...(cs[field] || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const put = async (next) => { setBusy(true); try { await updateDoc(doc(db, 'outbreakCases', cs.id), { [field]: next, updatedAt: serverTimestamp() }); } catch (e) { say('บันทึกไม่สำเร็จ: ' + (e.code || e.message)); } finally { setBusy(false); } };
  const add = async () => { if (!f.date || !columns.some((c) => String(f[c.k] || '').trim())) return say('กรุณาเลือกวันที่และกรอกรายละเอียด'); await put([...(cs[field] || []), { ...f, id: String(Date.now()) }]); setF(blank); };
  return (
    <section className="card space-y-3 p-4">
      <div className="grid items-end gap-2 sm:grid-cols-[170px_repeat(auto-fit,minmax(140px,1fr))_auto]">
        <div><span className={lab}>วันที่</span><ThaiDateInput value={f.date} onChange={(v) => setF((x) => ({ ...x, date: v }))} yearsBack={3} yearsForward={1} /></div>
        {columns.map((c) => <label key={c.k}><span className={lab}>{c.t}</span><input className="input" value={f[c.k] || ''} onChange={(e) => setF((x) => ({ ...x, [c.k]: e.target.value }))} /></label>)}
        <button className="btn btn-primary" onClick={add} disabled={busy}><Plus className="h-4 w-4" /> เพิ่ม</button>
      </div>
      {!items.length ? <p className="text-sm text-slate-500">{empty}</p> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead><tr className="border-b bg-slate-50 text-left text-slate-600"><th className="p-2">วันที่</th>{columns.map((c) => <th key={c.k} className="p-2">{c.t}</th>)}<th className="w-10" /></tr></thead>
          <tbody>{items.map((it) => (<tr key={it.id} className="border-b last:border-0"><td className="p-2 whitespace-nowrap">{fmtDate(it.date)}</td>{columns.map((c) => <td key={c.k} className="p-2">{it[c.k]}</td>)}<td className="p-2"><button className="text-red-600 hover:text-red-800" aria-label="ลบ" onClick={() => window.confirm('ลบรายการนี้?') && put((cs[field] || []).filter((x) => x.id !== it.id))}><Trash2 className="h-4 w-4" /></button></td></tr>))}</tbody></table></div>)}
    </section>
  );
}

export default function OutbreakCase() {
  const { id } = useParams(); const nav = useNavigate(); const { profile } = useAuth();
  const [cs, setCs] = useState(undefined); const [people, setPeople] = useState(null);
  const [tab, setTab] = useState('overview'); const [edit, setEdit] = useState(false); const [pm, setPm] = useState(null); const [del, setDel] = useState(null); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  useEffect(() => onSnapshot(doc(db, 'outbreakCases', id), (s) => setCs(s.exists() ? { id: s.id, ...s.data() } : null), () => setCs(null)), [id]);
  useEffect(() => onSnapshot(query(collection(db, 'outbreakPeople'), where('caseId', '==', id)), (s) => setPeople(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setPeople([])), [id]);
  const patients = useMemo(() => (people || []).filter((p) => p.kind === 'patient').sort((a, b) => String(a.onsetDate || '9').localeCompare(String(b.onsetDate || '9'))), [people]);
  const contacts = useMemo(() => (people || []).filter((p) => p.kind === 'contact'), [people]);
  const an = useMemo(() => (cs ? analyze(cs, patients, contacts) : null), [cs, patients, contacts]);
  if (cs === undefined || !people) return <Spinner />;
  if (cs === null) return <div className="card p-6 text-center text-slate-600">ไม่พบเหตุการณ์นี้ <Link className="text-brand-700 underline" to="/outbreak">กลับไปหน้าหลัก</Link></div>;
  const say = (t) => { setMsg(t); setTimeout(() => setMsg(''), 4000); };
  const dname = cs.disease?.startsWith('อื่นๆ') && cs.diseaseOther ? cs.diseaseOther : cs.disease;
  const setStatus = async (v) => { try { await updateDoc(doc(db, 'outbreakCases', id), { status: v, updatedAt: serverTimestamp() }); await writeAudit({ action: 'update', module: 'outbreak', docId: id, label: `เปลี่ยนสถานะเป็น ${STATUS[v]}` }); } catch (e) { say('บันทึกไม่สำเร็จ: ' + (e.code || e.message)); } };
  const doDel = async () => {
    setBusy(true);
    try {
      if (del === 'case') { for (const p of people) await deleteDoc(doc(db, 'outbreakPeople', p.id)); await deleteDoc(doc(db, 'outbreakCases', id)); await writeAudit({ action: 'delete', module: 'outbreak', docId: id, label: cs.title }); nav('/outbreak'); }
      else { await deleteDoc(doc(db, 'outbreakPeople', del.id)); await writeAudit({ action: 'delete', module: 'outbreak', docId: del.id, label: `${del.kind === 'patient' ? 'ผู้ป่วย' : 'ผู้สัมผัส'} ในเคส ${cs.title}` }); setDel(null); }
    } catch (e) { say('ลบไม่สำเร็จ: ' + (e.code || e.message)); } finally { setBusy(false); }
  };
  const PeopleTable = ({ list, isP }) => (
    <section className="card overflow-x-auto p-4">
      <div className="mb-2 flex items-center justify-between"><h3 className="font-bold text-slate-700">{isP ? 'ผู้ป่วย' : 'ผู้สัมผัส'} {nf(list.length)} ราย</h3><button className="btn btn-primary" onClick={() => setPm({ kind: isP ? 'patient' : 'contact' })}><Plus className="h-4 w-4" /> เพิ่ม{isP ? 'ผู้ป่วย' : 'ผู้สัมผัส'}</button></div>
      {!list.length ? <p className="text-sm text-slate-500">ยังไม่มีข้อมูล</p> : (
        <table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b bg-slate-50 text-left text-slate-600"><th className="p-2">ชื่อ-สกุล</th><th className="p-2">เพศ/อายุ</th><th className="p-2">หมู่</th><th className="p-2">{isP ? 'วันเริ่มป่วย' : 'สัมผัสล่าสุด'}</th><th className="p-2">สถานะ</th><th className="p-2">{isP ? 'อาการ' : 'ความสัมพันธ์'}</th><th className="w-20" /></tr></thead>
          <tbody>{list.map((p) => (<tr key={p.id} className="border-b last:border-0 hover:bg-rose-50"><td className="p-2 font-medium">{p.name}</td><td className="p-2">{SEX[p.sex] || '-'} / {p.age === '' ? '-' : p.age}</td><td className="p-2">{p.villageNo || '-'}</td><td className="p-2">{fmtDate(isP ? p.onsetDate : p.lastContact) || '-'}</td><td className="p-2">{p.status}</td><td className="p-2 max-w-[260px] truncate" title={isP ? p.symptoms : p.relation}>{(isP ? p.symptoms : p.relation) || '-'}</td>
            <td className="p-2 whitespace-nowrap"><button className="mr-2 text-brand-700" aria-label="แก้ไข" onClick={() => setPm({ kind: p.kind, initial: p })}><Pencil className="h-4 w-4" /></button><button className="text-red-600" aria-label="ลบ" onClick={() => setDel(p)}><Trash2 className="h-4 w-4" /></button></td></tr>))}</tbody></table>)}
    </section>
  );
  return (
    <div className="space-y-4">
      <PageHeader title={cs.title} subtitle={`${dname} · รับแจ้ง ${fmtDate(cs.reportDate)}${cs.villageNo ? ` · หมู่ ${cs.villageNo}` : ''}${cs.place ? ` · ${cs.place}` : ''}`}
        actions={<button className="btn bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25 print:hidden" onClick={() => window.print()}><Printer className="h-4 w-4" /> พิมพ์สรุปเคส</button>} />
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link className="btn btn-outline" to="/outbreak"><ArrowLeft className="h-4 w-4" /> กลับ</Link>
        <select className="input !w-auto" value={cs.status} onChange={(e) => setStatus(e.target.value)} aria-label="สถานะ">{Object.entries(STATUS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
        <Badge className={STATUS_TONE[cs.status]}>{STATUS[cs.status]}</Badge>
        <button className="btn btn-outline" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" /> แก้ไขข้อมูลเหตุการณ์</button>
        <button className="btn btn-outline text-red-700" onClick={() => setDel('case')}><Trash2 className="h-4 w-4" /> ลบเคส</button>
        {msg && <span className="rounded-lg bg-red-50 px-3 py-1.5 text-sm text-red-700 ring-1 ring-red-200">{msg}</span>}
      </div>
      <div className="flex flex-wrap gap-2 print:hidden">{TABS.map(([k, t]) => <button key={k} onClick={() => setTab(k)} className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-brand-50'}`}>{t}</button>)}</div>

      {tab === 'overview' && (<>
        <section className="card grid gap-3 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><div className="text-slate-500">ผู้ป่วย</div><div className="text-2xl font-bold">{nf(an.n)} ราย</div></div>
          <div><div className="text-slate-500">เสียชีวิต / อัตราป่วยตาย</div><div className="text-2xl font-bold">{nf(an.dead)} ราย{an.cfr != null ? ` · ${an.cfr.toFixed(1)}%` : ''}</div></div>
          <div><div className="text-slate-500">Attack rate {an.risk ? `(ประชากรเสี่ยง ${nf(an.risk)} คน)` : ''}</div><div className="text-2xl font-bold">{an.attack != null ? `${an.attack.toFixed(2)}%` : '—'}</div></div>
          <div><div className="text-slate-500">ระยะเวลาการระบาด</div><div className="text-2xl font-bold">{an.days ? `${an.days} วัน` : '—'}</div>{an.first && <div className="text-xs text-slate-500">{fmtDate(an.first)} – {fmtDate(an.last)}</div>}</div>
          <div className="sm:col-span-2 lg:col-span-4"><span className="text-slate-500">ผู้สัมผัส: </span><b>{nf(contacts.length)} ราย</b>{cs.responsible && <> · <span className="text-slate-500">ผู้รับผิดชอบ: </span><b>{cs.responsible}</b></>}</div>
          {cs.detail && <div className="whitespace-pre-line sm:col-span-2 lg:col-span-4"><span className="text-slate-500">ความเป็นมา/รายละเอียด: </span>{cs.detail}</div>}
        </section>
        <Curve title="Epidemic Curve — จำนวนผู้ป่วยตามวันเริ่มป่วย (Time)" rows={an.curve} fmtLabel={fmtDate} />
        <div className="grid gap-4 md:grid-cols-3">
          <HBars title="Person — เพศ" data={an.bySex} color="from-violet-600 to-violet-400" />
          <HBars title="Person — กลุ่มอายุ" data={an.byAge} order={AGE_ORDER} color="from-amber-500 to-amber-300" />
          <HBars title="Place — หมู่บ้าน" data={an.byVillage} color="from-teal-600 to-teal-400" />
        </div>
        <section className="card p-4"><h3 className="mb-2 font-bold text-slate-700">ตรวจสอบความครบถ้วนของข้อมูล</h3>
          {an.missing.length ? <ul className="list-inside list-disc space-y-0.5 text-sm text-amber-800">{an.missing.map((m) => <li key={m}>{m}</li>)}</ul> : <p className="text-sm text-emerald-700">ข้อมูลหลักครบถ้วน</p>}
          <p className="mt-2 text-xs text-slate-400">ตัวเลขทั้งหมดคำนวณจากข้อมูลที่บันทึกในเคสนี้เท่านั้น</p></section>
      </>)}
      {tab === 'patients' && <PeopleTable list={patients} isP />}
      {tab === 'contacts' && <PeopleTable list={contacts} isP={false} />}
      {tab === 'timeline' && <ListTab cs={cs} field="timeline" say={say} columns={[{ k: 'text', t: 'เหตุการณ์/สิ่งที่ดำเนินการ' }]} blank={{ date: todayStr(), text: '' }} empty="ยังไม่มี Timeline — บันทึกวันรับแจ้ง วันออกสอบสวน วันพบผู้ป่วยรายสำคัญ ฯลฯ" />}
      {tab === 'labs' && <ListTab cs={cs} field="labs" say={say} columns={[{ k: 'who', t: 'ผู้ถูกตรวจ' }, { k: 'specimen', t: 'ตัวอย่าง' }, { k: 'test', t: 'การตรวจ' }, { k: 'result', t: 'ผล' }]} blank={{ date: todayStr(), who: '', specimen: '', test: '', result: '' }} empty="ยังไม่มีผลตรวจทางห้องปฏิบัติการ" />}
      {tab === 'measures' && <ListTab cs={cs} field="measures" say={say} columns={[{ k: 'text', t: 'มาตรการ' }, { k: 'owner', t: 'ผู้รับผิดชอบ' }, { k: 'result', t: 'ผล/หมายเหตุ' }]} blank={{ date: todayStr(), text: '', owner: '', result: '' }} empty="ยังไม่มีมาตรการควบคุมโรค — เช่น พ่นหมอกควัน กำจัดลูกน้ำ ให้ความรู้ แยกผู้ป่วย" />}

      {edit && <CaseFormModal initial={cs} onClose={() => setEdit(false)} />}
      {pm && <PersonModal kind={pm.kind} caseId={id} initial={pm.initial} onClose={() => setPm(null)} />}
      {del && <ConfirmDialog busy={busy} onCancel={() => setDel(null)} onConfirm={doDel} message={del === 'case' ? `ลบเคส “${cs.title}” พร้อมผู้ป่วยและผู้สัมผัสทั้งหมด ${nf(people.length)} ราย?` : `ลบ “${del.name}” ออกจากเคสนี้?`} />}
      <p className="hidden text-xs text-slate-400 print:block">พิมพ์โดย {profile?.name || profile?.email} · {fmtDate(todayStr())} · เอกสารนี้มีข้อมูลระบุตัวบุคคล ห้ามเผยแพร่</p>
    </div>
  );
}
