// หน้าแผนที่รวม + กำหนดขอบเขตเขตรับผิดชอบ/หมู่บ้าน + ปักหมุด/ลากหมุดผู้ป่วย (Spot map)
import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Map as MapIcon, Pencil, Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { PageHeader } from '../../components/Logo';
import { Spinner } from '../../components/ui';
import OutbreakMap from './OutbreakMap';
import { PersonModal } from './OutbreakCase';
import { inPoly, locate, useAreas, useVillages } from './outbreakRefs';

export default function OutbreakMapPage() {
  const { profile } = useAuth(); const areas = useAreas(); const villages = useVillages();
  const [cases, setCases] = useState(null); const [people, setPeople] = useState(null); const [sel, setSel] = useState('');
  const [ed, setEd] = useState(null); // {id?, name, kind, villageNo, points}
  const [pm, setPm] = useState(null); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => onSnapshot(collection(db, 'outbreakCases'), (s) => setCases(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setCases([])), []);
  useEffect(() => onSnapshot(collection(db, 'outbreakPeople'), (s) => setPeople(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setPeople([])), []);
  const say = (t) => { setMsg(t); setTimeout(() => setMsg(''), 5000); };
  const label = useMemo(() => Object.fromEntries((cases || []).map((c) => [c.id, c.title])), [cases]);
  const list = useMemo(() => (people || []).filter((p) => p.kind === 'patient' && (!sel || p.caseId === sel)), [people, sel]);
  const cs = (cases || []).find((c) => c.id === sel);
  const outside = useMemo(() => { const c = (areas || []).filter((a) => a.kind === 'catchment' && (a.points || []).length > 2); if (!c.length) return null; return list.filter((p) => p.lat !== '' && p.lat != null && !c.some((a) => inPoly(Number(p.lat), Number(p.lng), a.points))).length; }, [list, areas]);
  if (!cases || !people || !areas) return <Spinner />;

  const saveArea = async () => {
    if (!ed.name.trim()) return say('กรุณาตั้งชื่อขอบเขต');
    if ((ed.points || []).length < 3) return say('ต้องมีอย่างน้อย 3 มุม');
    if (ed.kind === 'village' && !ed.villageNo) return say('กรุณาเลือกหมู่บ้าน');
    setBusy(true);
    try {
      const v = (villages || []).find((x) => x.no === ed.villageNo);
      const data = { name: ed.name.trim(), kind: ed.kind, villageNo: ed.kind === 'village' ? ed.villageNo : '', villageName: v?.name || '', points: ed.points, updatedAt: serverTimestamp(), updatedBy: profile?.name || '' };
      if (ed.id) await updateDoc(doc(db, 'outbreakGeo', ed.id), data); else await addDoc(collection(db, 'outbreakGeo'), { ...data, createdAt: serverTimestamp() });
      setEd(null); say('บันทึกขอบเขตแล้ว');
    } catch (e) { say('บันทึกไม่สำเร็จ: ' + (e.code || e.message)); } finally { setBusy(false); }
  };
  const delArea = async (a) => { if (!window.confirm(`ลบขอบเขต "${a.name}"?`)) return; try { await deleteDoc(doc(db, 'outbreakGeo', a.id)); } catch (e) { say('ลบไม่สำเร็จ: ' + (e.code || e.message)); } };
  const move = async (p, lat, lng) => { try { await updateDoc(doc(db, 'outbreakPeople', p.id), { lat, lng, updatedAt: serverTimestamp() }); const l = locate(areas, lat, lng); say(`ย้ายหมุดแล้ว${l.inside === false ? ' — อยู่นอกเขตรับผิดชอบ' : ''}`); } catch (e) { say('ย้ายไม่สำเร็จ: ' + (e.code || e.message)); } };
  const place = async (p, lat, lng) => { const l = locate(areas, lat, lng); try { await updateDoc(doc(db, 'outbreakPeople', p.id), { lat, lng, ...(l.villageNo && !p.villageNo ? { villageNo: l.villageNo } : {}), updatedAt: serverTimestamp() }); say(`วางพิกัดให้ ${p.name} แล้ว${l.inside === false ? ' — อยู่นอกเขตรับผิดชอบ' : ''}`); } catch (e) { say('บันทึกไม่สำเร็จ: ' + (e.code || e.message)); } };
  const mapAreas = ed ? areas.filter((a) => a.id !== ed.id) : areas;

  return (
    <div className="space-y-4">
      <PageHeader icon={MapIcon} emoji="🗺️" title="แผนที่การระบาด / Spot map" subtitle="ภาพถ่ายดาวเทียมเห็นหลังคาเรือน · กำหนดเขตรับผิดชอบ · ปักและลากหมุดผู้ป่วย" />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link className="text-brand-700 underline" to="/outbreak">← กลับหน้าสอบสวนโรค</Link>
        <select className="input max-w-sm" value={sel} onChange={(e) => setSel(e.target.value)}><option value="">ทุกเหตุการณ์ (ดูอย่างเดียว)</option>{cases.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
        {!sel && <span className="text-slate-500">เลือกเหตุการณ์เพื่อปักหมุดผู้ป่วยใหม่</span>}
        {outside != null && <span className={outside ? 'font-semibold text-amber-700' : 'text-emerald-700'}>{outside ? `ผู้ป่วยนอกเขตรับผิดชอบ ${outside} ราย` : 'ผู้ป่วยทุกรายอยู่ในเขตรับผิดชอบ'}</span>}
        {msg && <span className="rounded bg-sky-50 px-2 py-1 text-sky-800">{msg}</span>}
      </div>
      <OutbreakMap patients={list} label={label} areas={mapAreas} height={600}
        draw={ed ? { points: ed.points, onChange: (points) => setEd((x) => ({ ...x, points })) } : null}
        onMove={ed ? undefined : move} onPlace={ed ? undefined : place}
        onAddAt={!ed && cs ? (lat, lng) => setPm({ preset: { lat, lng, villageNo: locate(areas, lat, lng).villageNo } }) : undefined} />

      <section className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-slate-700">ขอบเขตพื้นที่รับผิดชอบ</h3>
          {!ed && <button className="btn btn-primary" onClick={() => setEd({ name: '', kind: areas.some((a) => a.kind === 'catchment') ? 'village' : 'catchment', villageNo: '', points: [] })}><Plus className="h-4 w-4" /> วาดขอบเขตใหม่</button>}
        </div>
        {ed && (
          <div className="grid gap-3 rounded-xl bg-amber-50/60 p-3 ring-1 ring-amber-200 sm:grid-cols-4">
            <label><span className="mb-1 block text-sm text-slate-600">ชนิด</span><select className="input" value={ed.kind} onChange={(e) => setEd((x) => ({ ...x, kind: e.target.value }))}><option value="catchment">เขตรับผิดชอบทั้งหมดของ รพ.สต.</option><option value="village">หมู่บ้าน</option></select></label>
            {ed.kind === 'village' && <label><span className="mb-1 block text-sm text-slate-600">หมู่บ้าน</span><select className="input" value={ed.villageNo} onChange={(e) => { const v = (villages || []).find((x) => x.no === e.target.value); setEd((x) => ({ ...x, villageNo: e.target.value, name: x.name || (v ? `หมู่ ${v.no} ${v.name}` : '') })); }}><option value="">— เลือก —</option>{(villages || []).map((v) => <option key={v.no} value={v.no}>หมู่ {v.no} {v.name}</option>)}</select></label>}
            <label className={ed.kind === 'village' ? '' : 'sm:col-span-2'}><span className="mb-1 block text-sm text-slate-600">ชื่อขอบเขต</span><input className="input" value={ed.name} onChange={(e) => setEd((x) => ({ ...x, name: e.target.value }))} placeholder="เช่น เขตรับผิดชอบ รพ.สต.บ้านหนองสนม" /></label>
            <div className="flex items-end gap-2">
              <button className="btn btn-outline" onClick={() => setEd((x) => ({ ...x, points: x.points.slice(0, -1) }))} disabled={!ed.points.length}>ย้อนมุมล่าสุด</button>
              <button className="btn btn-outline" onClick={() => setEd(null)} disabled={busy}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={saveArea} disabled={busy}>บันทึก ({ed.points.length} มุม)</button>
            </div>
          </div>)}
        {!areas.length && !ed ? <p className="text-sm text-slate-500">ยังไม่ได้กำหนดขอบเขต — กด "วาดขอบเขตใหม่" แล้วคลิกตามแนวเขตบนภาพถ่ายดาวเทียม (เริ่มจากเขตรับผิดชอบทั้งหมด แล้วค่อยวาดแต่ละหมู่บ้าน)</p> : (
          <ul className="divide-y text-sm">{areas.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 py-2"><span><b>{a.name}</b> <span className="text-slate-500">· {a.kind === 'catchment' ? 'เขตรับผิดชอบ' : `หมู่บ้าน ม.${a.villageNo}`} · {(a.points || []).length} มุม</span></span>
              {!ed && <span className="flex gap-3"><button className="text-brand-700" aria-label="แก้ไข" onClick={() => setEd({ ...a, points: [...(a.points || [])] })}><Pencil className="h-4 w-4" /></button><button className="text-red-600" aria-label="ลบ" onClick={() => delArea(a)}><Trash2 className="h-4 w-4" /></button></span>}</li>))}</ul>)}
      </section>
      {pm && cs && <PersonModal kind="patient" caseId={cs.id} caseDefaults={cs} initial={null} preset={pm.preset} onClose={() => setPm(null)} />}
    </div>
  );
}
