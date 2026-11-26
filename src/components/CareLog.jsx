// คอมโพเนนต์กลางของ "ทะเบียนบันทึกการให้บริการรายครั้ง" (Smart Home Visit / Telemedicine) — ตั้งค่าที่ config/careLogs.js
import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Download, ExternalLink, LocateFixed, Loader2, Pencil, Phone, Plus, Search, Trash2 } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { canWrite } from '../lib/roles';
import { writeAudit } from '../lib/audit';
import { exportXlsx } from '../lib/exportFile';
import { fmtDate, todayStr } from '../lib/thai';
import { Badge, ConfirmDialog, EmptyState, Modal, Spinner, Toast } from './ui';
import { PageHeader } from './Logo';

const PAGE = 100;
const mapsUrl = (g) => (g && g.includes(',') ? `https://www.google.com/maps?q=${g.replace(/\s/g, '')}` : '');

function Field({ f, value, onChange }) {
  const base = 'input';
  if (f.type === 'textarea') return <textarea className={base} rows={3} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  if (f.type === 'select') return <select className={base} value={value ?? ''} onChange={(e) => onChange(e.target.value)}><option value="">— เลือก —</option>{f.options.map((o) => <option key={o} value={o}>{o}</option>)}</select>;
  if (f.type === 'gps') {
    const locate = () => {
      if (!navigator.geolocation) return alert('อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง');
      navigator.geolocation.getCurrentPosition((p) => onChange(`${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`), () => alert('ดึงตำแหน่งไม่สำเร็จ — โปรดอนุญาตการเข้าถึงตำแหน่งในเบราว์เซอร์'), { enableHighAccuracy: true, timeout: 15000 });
    };
    return (
      <div className="flex gap-2">
        <input className={base} placeholder="ละติจูด, ลองจิจูด" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="btn btn-outline shrink-0 !px-3" onClick={locate} title="ใช้ตำแหน่งปัจจุบัน"><LocateFixed className="h-5 w-5" /></button>
      </div>
    );
  }
  const type = { date: 'date', time: 'time', number: 'number', tel: 'tel' }[f.type] || 'text';
  return <input className={base} type={type} inputMode={f.type === 'number' ? 'decimal' : undefined} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
}

export default function CareLog({ cfg }) {
  const { profile, user } = useAuth();
  const canEdit = canWrite(profile.role, cfg.key);
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState(''); const [moo, setMoo] = useState(''); const [st, setSt] = useState(''); const [month, setMonth] = useState(todayStr().slice(0, 7));
  const [page, setPage] = useState(0);
  const [edit, setEdit] = useState(null); const [del, setDel] = useState(null); const [busy, setBusy] = useState(false); const [toast, setToast] = useState(null);
  const today = todayStr(); const thisMonth = today.slice(0, 7);

  useEffect(() => onSnapshot(collection(db, cfg.collection), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => { setErr(e.code === 'permission-denied' ? 'ไม่มีสิทธิ์เข้าถึงข้อมูล (ต้อง deploy firestore.rules ชุดล่าสุดก่อน)' : e.message); setRows([]); }), [cfg.collection]);
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);
  useEffect(() => setPage(0), [q, moo, st, month]);

  const kpis = useMemo(() => (rows ? cfg.kpis(rows, today, thisMonth) : []), [rows, cfg, today, thisMonth]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase(); const sf = cfg.fields.filter((f) => f.search);
    return (rows || []).filter((r) => (!month || (r[cfg.dateField] || '').startsWith(month)) && (!moo || r[cfg.mooField] === moo) && (!st || r[cfg.statusField] === st)
      && (!t || sf.some((f) => String(r[f.key] || '').toLowerCase().includes(t)))).sort((a, b) => String(b[cfg.dateField] || '').localeCompare(String(a[cfg.dateField] || '')));
  }, [rows, q, moo, st, month, cfg]);
  const byGroup = useMemo(() => { const m = {}; shown.forEach((r) => { const k = r[cfg.groupField] || 'ไม่ระบุ'; m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); }, [shown, cfg]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE)); const cur = Math.min(page, pages - 1); const slice = shown.slice(cur * PAGE, cur * PAGE + PAGE);
  const listFields = cfg.fields.filter((f) => f.list);
  const mooF = cfg.fields.find((f) => f.key === cfg.mooField);

  const openNew = () => setEdit({ data: Object.fromEntries(cfg.fields.map((f) => [f.key, f.today ? today : (f.default ?? '')])), id: null });
  const save = async () => {
    const miss = cfg.fields.find((f) => f.required && !String(edit.data[f.key] ?? '').trim());
    if (miss) return setToast({ type: 'error', text: `กรุณากรอก "${miss.label}"` });
    setBusy(true);
    try {
      const data = { ...edit.data };
      if (edit.id) { await updateDoc(doc(db, cfg.collection, edit.id), { ...data, updatedAt: serverTimestamp(), updatedBy: user.email.toLowerCase() }); await writeAudit({ action: 'update', module: cfg.key, docId: edit.id, label: data[cfg.nameField] }); }
      else { const r = await addDoc(collection(db, cfg.collection), { ...data, createdAt: serverTimestamp(), createdBy: user.email.toLowerCase() }); await writeAudit({ action: 'create', module: cfg.key, docId: r.id, label: data[cfg.nameField] }); }
      setEdit(null); setToast({ type: 'ok', text: 'บันทึกแล้ว' });
    } catch (e) { setToast({ type: 'error', text: 'บันทึกไม่สำเร็จ: ' + (e.code || e.message) }); } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { await deleteDoc(doc(db, cfg.collection, del.id)); await writeAudit({ action: 'delete', module: cfg.key, docId: del.id, label: del[cfg.nameField] }); setDel(null); setToast({ type: 'ok', text: 'ลบแล้ว' }); }
    catch (e) { setToast({ type: 'error', text: 'ลบไม่สำเร็จ: ' + (e.code || e.message) }); } finally { setBusy(false); }
  };
  const exportRows = async () => {
    const out = shown.map((r, i) => Object.fromEntries([['ลำดับ', i + 1], ...cfg.fields.map((f) => [f.label, r[f.key] ?? ''])]));
    await exportXlsx(out, cfg.title.slice(0, 28), `${cfg.title}_${month || 'ทั้งหมด'}`);
    writeAudit({ action: 'export', module: cfg.key, label: `${shown.length} รายการ` }).catch(() => {});
  };

  return (
    <div className="mx-auto max-w-7xl p-4 lg:p-6">
      <PageHeader emoji={cfg.emoji} title={cfg.title} subtitle={cfg.subtitle} tone={cfg.tone} actions={canEdit && <button className="btn bg-white text-slate-800 shadow hover:bg-slate-100" onClick={openNew}><Plus className="h-5 w-5" /> เพิ่ม{cfg.noun}</button>} />
      {err && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className={`rounded-2xl bg-gradient-to-br ${k.tone} p-4 text-white shadow-md`}>
            <div className="text-3xl font-extrabold tabular-nums">{k.value}</div>
            <div className="mt-1 text-sm font-semibold">{k.label}</div>
            <div className="text-xs opacity-80">{k.hint}</div>
          </div>
        ))}
      </div>
      <div className="card p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1"><Search className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-brand-400" /><input className="input !pl-10" placeholder="ค้นหาชื่อ / HN / ทีม" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <input type="month" className="input !w-auto" value={month} onChange={(e) => setMonth(e.target.value)} title="เดือน (ล้างเพื่อดูทั้งหมด)" />
          {mooF && <select className="input !w-auto" value={moo} onChange={(e) => setMoo(e.target.value)}><option value="">ทุกหมู่บ้าน</option>{mooF.options.map((o) => <option key={o}>{o}</option>)}</select>}
          <select className="input !w-auto" value={st} onChange={(e) => setSt(e.target.value)}><option value="">ทุกสถานะ</option>{Object.keys(cfg.statusColors).map((o) => <option key={o}>{o}</option>)}</select>
          <button className="btn btn-outline" onClick={exportRows} disabled={!shown.length}><Download className="h-4 w-4" /> ส่งออก Excel</button>
        </div>
        {byGroup.length > 0 && <div className="mb-3 flex flex-wrap gap-1.5 text-xs">{byGroup.map(([k, n]) => <span key={k} className="rounded-full bg-brand-50 px-2.5 py-1 text-brand-800 ring-1 ring-brand-200">{k} <b>{n}</b></span>)}<span className="px-1 py-1 text-slate-500">รวม {shown.length} {cfg.unit}</span></div>}
        {rows === null ? <Spinner /> : !shown.length ? <EmptyState title={`ยังไม่มี${cfg.noun}ในช่วงที่เลือก`} hint={canEdit ? `กด "เพิ่ม${cfg.noun}" เพื่อเริ่มบันทึก` : ''} /> : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-brand-50 text-left text-xs text-brand-900"><tr><th className="px-2 py-2">#</th>{listFields.map((f) => <th key={f.key} className="whitespace-nowrap px-2 py-2">{f.label}</th>)}<th className="px-2 py-2" /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {slice.map((r, i) => {
                  const late = r[cfg.followField] && r[cfg.followField] <= today && r[cfg.statusField] !== 'วางแผน' && r[cfg.statusField] !== 'นัดหมาย';
                  return (
                    <tr key={r.id} className="hover:bg-brand-50/40">
                      <td className="px-2 py-1.5 text-slate-400">{cur * PAGE + i + 1}</td>
                      {listFields.map((f) => (
                        <td key={f.key} className="whitespace-nowrap px-2 py-1.5">
                          {f.key === cfg.statusField ? <Badge className={cfg.statusColors[r[f.key]] || ''}>{r[f.key] || '-'}</Badge>
                            : f.type === 'date' ? <span className={f.key === cfg.followField && late ? 'font-semibold text-amber-700' : ''}>{r[f.key] ? fmtDate(r[f.key]) : '-'}{f.key === cfg.followField && late ? ' ⏰' : ''}</span>
                              : (r[f.key] ?? '') === '' ? '-' : String(r[f.key])}
                        </td>
                      ))}
                      <td className="whitespace-nowrap px-2 py-1.5 text-right">
                        {r.phone && <a href={`tel:${r.phone}`} className="mr-1 inline-flex rounded p-1 text-emerald-700 hover:bg-emerald-50" title={r.phone}><Phone className="h-4 w-4" /></a>}
                        {mapsUrl(r.gps) && <a href={mapsUrl(r.gps)} target="_blank" rel="noopener noreferrer" className="mr-1 inline-flex rounded p-1 text-sky-700 hover:bg-sky-50" title="เปิดแผนที่"><ExternalLink className="h-4 w-4" /></a>}
                        {canEdit && <><button className="mr-1 rounded p-1 text-brand-700 hover:bg-brand-50" onClick={() => setEdit({ id: r.id, data: { ...r } })} title="แก้ไข"><Pencil className="h-4 w-4" /></button>
                          <button className="rounded p-1 text-red-600 hover:bg-red-50" onClick={() => setDel(r)} title="ลบ"><Trash2 className="h-4 w-4" /></button></>}
                      </td>
                    </tr>);
                })}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && <div className="mt-2 flex items-center justify-end gap-2 text-sm"><button className="btn btn-outline !px-3 !py-1" disabled={cur === 0} onClick={() => setPage(cur - 1)}>ก่อนหน้า</button>หน้า {cur + 1}/{pages}<button className="btn btn-outline !px-3 !py-1" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>ถัดไป</button></div>}
        <p className="mt-3 text-xs text-slate-400">ข้อมูลผู้รับบริการเป็นข้อมูลส่วนบุคคลด้านสุขภาพ — ใช้เฉพาะงานบริการของหน่วยงาน ไม่ต้องบันทึกเลขบัตรประชาชน และทุกการเพิ่ม/แก้ไข/ลบ/ส่งออกจะถูกบันทึกใน Audit Log</p>
      </div>

      {edit && (
        <Modal wide title={`${edit.id ? 'แก้ไข' : 'เพิ่ม'}${cfg.noun}`} onClose={() => !busy && setEdit(null)}
          footer={<><button className="btn btn-outline" onClick={() => setEdit(null)} disabled={busy}>ยกเลิก</button><button className="btn btn-primary" onClick={save} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} บันทึก</button></>}>
          <div className="grid gap-3 sm:grid-cols-2">
            {cfg.fields.map((f) => (
              <label key={f.key} className={`block text-sm ${f.type === 'textarea' || f.type === 'gps' ? 'sm:col-span-2' : ''}`}>
                <span className="mb-1 block font-medium text-slate-700">{f.label}{f.required && <span className="text-red-500"> *</span>}</span>
                <Field f={f} value={edit.data[f.key]} onChange={(v) => setEdit((s) => ({ ...s, data: { ...s.data, [f.key]: v } }))} />
                {f.hint && <span className="mt-0.5 block text-xs text-slate-400">{f.hint}</span>}
              </label>
            ))}
          </div>
        </Modal>
      )}
      {del && <ConfirmDialog message={`ลบ${cfg.noun}ของ "${del[cfg.nameField]}" ?`} busy={busy} onConfirm={remove} onCancel={() => setDel(null)} />}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
