// ไฟล์การสอบสวนโรคที่แนบมาจากโรงพยาบาล/หน่วยงานอื่น จัดเก็บเป็นทะเบียน E0 / E1 / E2 (เก็บไฟล์ใน Firebase Storage: outbreak/{caseId}/…)
import { useRef, useState } from 'react';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Download, Loader2, Trash2, Upload } from 'lucide-react';
import { db, storage } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { writeAudit } from '../../lib/audit';
import { fmtDate, todayStr } from '../../lib/thai';
import ThaiDateInput from '../../components/ThaiDateInput';
import { Badge } from '../../components/ui';
import { FILE_SOURCES, LEVELS, fmtSize } from './outbreakLib';

const MAX = 20 * 1024 * 1024;
const OK_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png', 'webp'];
const safeName = (n) => n.replace(/[^\w.\-฀-๿]/g, '_');
const lab = 'mb-1 block text-sm text-slate-600';

export default function CaseFiles({ cs, say }) {
  const { user } = useAuth();
  const [level, setLevel] = useState('E1'); const [source, setSource] = useState(FILE_SOURCES[0]); const [date, setDate] = useState(todayStr()); const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false); const inp = useRef(null);
  const files = [...(cs.files || [])].sort((a, b) => `${a.level}${a.date}`.localeCompare(`${b.level}${b.date}`));
  const put = (list) => updateDoc(doc(db, 'outbreakCases', cs.id), { files: list, updatedAt: serverTimestamp() });
  const onPick = async (e) => {
    const picked = [...e.target.files]; e.target.value = '';
    if (!picked.length) return;
    setBusy(true);
    try {
      const added = [];
      for (const file of picked) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (!OK_EXT.includes(ext)) { say(`ไม่รองรับไฟล์ .${ext} (รองรับ ${OK_EXT.join(', ')})`); continue; }
        if (file.size > MAX) { say(`${file.name} ใหญ่เกิน 20 MB`); continue; }
        const path = `outbreak/${cs.id}/${Date.now()}_${safeName(file.name)}`;
        await uploadBytes(ref(storage, path), file, { contentType: file.type || undefined });
        added.push({ id: `${Date.now()}${added.length}`, level, source, date, note: note.trim(), name: file.name, path, size: file.size, by: user?.email || '' });
      }
      if (added.length) { await put([...(cs.files || []), ...added]); await writeAudit({ action: 'create', module: 'outbreak', docId: cs.id, label: `แนบไฟล์สอบสวน ${level} ${added.length} ไฟล์ — ${cs.title}` }); setNote(''); }
    } catch (err) { say('แนบไฟล์ไม่สำเร็จ: ' + (err.code || err.message)); } finally { setBusy(false); }
  };
  const open = async (f) => { try { window.open(await getDownloadURL(ref(storage, f.path)), '_blank', 'noopener'); } catch (e) { say('เปิดไฟล์ไม่สำเร็จ: ' + (e.code || e.message)); } };
  const remove = async (f) => {
    if (!window.confirm(`ลบไฟล์ “${f.name}” ?\nการลบไม่สามารถย้อนกลับได้`)) return;
    setBusy(true);
    try { try { await deleteObject(ref(storage, f.path)); } catch (e) { if (e.code !== 'storage/object-not-found') throw e; } await put((cs.files || []).filter((x) => x.id !== f.id)); await writeAudit({ action: 'delete', module: 'outbreak', docId: cs.id, label: `ลบไฟล์สอบสวน ${f.level} ${f.name}` }); }
    catch (e) { say('ลบไม่สำเร็จ: ' + (e.code || e.message)); } finally { setBusy(false); }
  };
  return (
    <section className="card space-y-4 p-4">
      <div>
        <h3 className="font-bold text-slate-700">ทะเบียนไฟล์การสอบสวนโรค E0 / E1 / E2</h3>
        <p className="text-sm text-slate-500">แนบรายงาน/ไฟล์ที่สอบสวนมาจากโรงพยาบาลหรือหน่วยงานอื่น เลือกระดับรายงานให้ตรงกับเอกสาร (PDF, Word, Excel, รูปภาพ ไม่เกิน 20 MB ต่อไฟล์)</p>
      </div>
      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label><span className={lab}>ระดับรายงาน</span><select className="input" value={level} onChange={(e) => setLevel(e.target.value)}>{Object.entries(LEVELS).map(([k, v]) => <option key={k} value={k}>{v.t}</option>)}</select></label>
        <label><span className={lab}>มาจาก</span><input className="input" list="ob-sources" value={source} onChange={(e) => setSource(e.target.value)} /><datalist id="ob-sources">{FILE_SOURCES.map((s) => <option key={s} value={s} />)}</datalist></label>
        <label><span className={lab}>วันที่ของเอกสาร</span><ThaiDateInput value={date} onChange={(v) => v && setDate(v)} yearsBack={3} yearsForward={0} /></label>
        <label><span className={lab}>หมายเหตุ</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      <div><input ref={inp} type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp" className="hidden" onChange={onPick} />
        <button className="btn btn-primary" onClick={() => inp.current?.click()} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} แนบไฟล์การสอบสวนโรค</button></div>
      {!files.length ? <p className="text-sm text-slate-500">ยังไม่มีไฟล์แนบ</p> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead><tr className="border-b bg-slate-50 text-left text-slate-600"><th className="p-2">ระดับ</th><th className="p-2">ไฟล์</th><th className="p-2">มาจาก</th><th className="p-2">วันที่เอกสาร</th><th className="p-2">หมายเหตุ</th><th className="w-20" /></tr></thead>
          <tbody>{files.map((f) => (<tr key={f.id} className="border-b last:border-0"><td className="p-2"><Badge className={LEVELS[f.level]?.tone}>{f.level}</Badge></td><td className="p-2">{f.name} <span className="text-xs text-slate-400">({fmtSize(f.size)})</span></td><td className="p-2">{f.source}</td><td className="p-2 whitespace-nowrap">{fmtDate(f.date)}</td><td className="p-2">{f.note || '-'}</td>
            <td className="p-2 whitespace-nowrap"><button className="mr-2 text-brand-700" aria-label="ดาวน์โหลด" onClick={() => open(f)}><Download className="h-4 w-4" /></button><button className="text-red-600" aria-label="ลบ" onClick={() => remove(f)} disabled={busy}><Trash2 className="h-4 w-4" /></button></td></tr>))}</tbody></table></div>)}
    </section>
  );
}
