import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import { Download, FileSpreadsheet, Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { db, storage } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useFiscalYear } from '../context/FiscalYearContext';
import { canWrite } from '../lib/roles';
import { diffFields, writeAudit } from '../lib/audit';
import { createNumbered } from '../lib/numbering';
import { exportCsv, exportXlsx } from '../lib/exportFile';
import { fiscalYearBE, fmtDate, thMonths, todayStr } from '../lib/thai';
import { Badge, ConfirmDialog, EmptyState, ErrorState, Modal, Spinner, Toast } from './ui';
import FileAttach from './FileAttach';

const emptyForm = (cfg) => {
  const f = {};
  cfg.fields.forEach((x) => {
    if (x.auto) return;
    f[x.key] = x.default ?? (x.key === cfg.dateField ? todayStr() : '');
  });
  return f;
};

// หน้าทะเบียนแบบกำหนดด้วย config: เพิ่ม แก้ไข ค้นหา ดูรายละเอียด แนบไฟล์ ลบ Export
export default function RegistryPage({ cfg }) {
  const { profile } = useAuth();
  const { fy } = useFiscalYear();
  const writable = canWrite(profile.role, cfg.key);
  const [params, setParams] = useSearchParams();

  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [month, setMonth] = useState('');
  const [form, setForm] = useState(null); // null | {id?, values}
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [viewId, setViewId] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState(null);

  const say = (t) => { setToast(t); setTimeout(() => setToast(null), 3500); };

  // โหลดข้อมูลตามปีงบประมาณที่เลือก (เรียงฝั่งเครื่องเพื่อไม่ต้องสร้าง Index)
  useEffect(() => {
    setItems(null);
    setError('');
    const qy = query(collection(db, cfg.key), where('fy', '==', fy));
    return onSnapshot(
      qy,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        rows.sort((a, b) => (b[cfg.dateField] || '').localeCompare(a[cfg.dateField] || '') || (b[cfg.numberField] || '').localeCompare(a[cfg.numberField] || ''));
        setItems(rows);
      },
      (e) => setError(e.code === 'permission-denied' ? 'ไม่มีสิทธิ์เข้าถึงข้อมูลส่วนนี้' : e.message),
    );
  }, [cfg, fy, reload]);

  // เปิดรายละเอียดจากผลค้นหารวม (?open=id)
  useEffect(() => {
    const id = params.get('open');
    if (id && items?.some((x) => x.id === id)) {
      setViewId(id);
      params.delete('open');
      setParams(params, { replace: true });
    }
  }, [items, params, setParams]);

  const searchKeys = useMemo(() => cfg.fields.filter((f) => f.search).map((f) => f.key), [cfg]);
  const statusField = cfg.fields.find((f) => f.key === cfg.statusField);

  const filtered = useMemo(() => {
    if (!items) return [];
    const t = q.trim().toLowerCase();
    return items.filter((it) => {
      if (status && it[cfg.statusField] !== status) return false;
      if (month && (it[cfg.dateField] || '').slice(5, 7) !== month) return false;
      if (!t) return true;
      return searchKeys.some((k) => String(it[k] || '').toLowerCase().includes(t));
    });
  }, [items, q, status, month, cfg, searchKeys]);

  const viewItem = items?.find((x) => x.id === viewId) || null;
  const listFields = cfg.fields.filter((f) => f.list);

  const display = (f, v) => (f.type === 'date' ? fmtDate(v) : v || '-');

  const openCreate = () => { setErrors({}); setForm({ values: emptyForm(cfg) }); };
  const openEdit = (it) => {
    const values = {};
    cfg.fields.forEach((f) => { if (!f.auto) values[f.key] = it[f.key] ?? ''; });
    setErrors({});
    setViewId(null);
    setForm({ id: it.id, number: it[cfg.numberField], values });
  };

  const validate = (values) => {
    const e = {};
    cfg.fields.forEach((f) => { if (f.required && !String(values[f.key] || '').trim()) e[f.key] = `กรุณากรอก${f.label}`; });
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const values = Object.fromEntries(Object.entries(form.values).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
    const e = validate(values);
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const fyVal = fiscalYearBE(values[cfg.dateField]);
      if (form.id) {
        const old = items.find((x) => x.id === form.id);
        const keys = cfg.fields.filter((f) => !f.auto).map((f) => f.key);
        const { before, after } = diffFields(old, values, keys);
        await updateDoc(doc(db, cfg.key, form.id), { ...values, fy: fyVal, updatedAt: serverTimestamp(), updatedBy: profile.email });
        await writeAudit({ action: 'update', module: cfg.key, docId: form.id, label: form.number, before, after });
        say({ type: 'ok', text: 'บันทึกการแก้ไขแล้ว' });
      } else {
        const { id, number } = await createNumbered({
          collectionName: cfg.key, numberField: cfg.numberField, dateStr: values[cfg.dateField],
          data: { ...values, fy: fyVal, attachments: [] },
        });
        await writeAudit({ action: 'create', module: cfg.key, docId: id, label: number, after: values });
        say({ type: 'ok', text: `บันทึกแล้ว ${cfg.numberLabel} ${number}` });
        // ปีงบประมาณของรายการใหม่อาจไม่ตรงกับปีที่เลือก
        if (fyVal !== fy) say({ type: 'ok', text: `บันทึกแล้ว ${number} (อยู่ในปีงบประมาณ ${fyVal})` });
      }
      setForm(null);
    } catch (err) {
      say({ type: 'error', text: 'บันทึกไม่สำเร็จ: ' + (err.code || err.message) });
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    const it = toDelete;
    setDeleting(true);
    try {
      for (const a of it.attachments || []) await deleteObject(ref(storage, a.path)).catch(() => {});
      await deleteDoc(doc(db, cfg.key, it.id));
      const snapshot = {};
      cfg.fields.forEach((f) => { snapshot[f.key] = it[f.key] ?? ''; });
      await writeAudit({ action: 'delete', module: cfg.key, docId: it.id, label: it[cfg.numberField], before: snapshot });
      say({ type: 'ok', text: 'ลบข้อมูลแล้ว' });
      setToDelete(null);
      setViewId(null);
    } catch (err) {
      say({ type: 'error', text: 'ลบไม่สำเร็จ: ' + (err.code || err.message) });
    } finally {
      setDeleting(false);
    }
  };

  const exportRows = () =>
    filtered.map((it) => {
      const r = {};
      cfg.fields.forEach((f) => { r[f.label] = f.type === 'date' ? fmtDate(it[f.key]).replace('-', '') : it[f.key] || ''; });
      r['จำนวนไฟล์แนบ'] = (it.attachments || []).length;
      return r;
    });

  const doExport = async (kind) => {
    if (!filtered.length) return say({ type: 'error', text: 'ไม่มีข้อมูลให้ส่งออก' });
    const name = `${cfg.title}_ปีงบ${fy}`;
    try {
      if (kind === 'xlsx') await exportXlsx(exportRows(), cfg.noun, name);
      else exportCsv(exportRows(), name);
      writeAudit({ action: 'export', module: cfg.key, label: `${name} (${filtered.length} รายการ, ${kind})` }).catch(() => {});
    } catch (e) {
      say({ type: 'error', text: 'ส่งออกไม่สำเร็จ: ' + e.message });
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-4 lg:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{cfg.title}</h1>
          <p className="text-slate-500">ปีงบประมาณ {fy} · {items ? `${filtered.length} จาก ${items.length} รายการ` : 'กำลังโหลด'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-outline" onClick={() => doExport('xlsx')}><FileSpreadsheet className="h-4 w-4" /> Excel</button>
          <button className="btn btn-outline" onClick={() => doExport('csv')}><Download className="h-4 w-4" /> CSV</button>
          {writable && <button className="btn btn-primary" onClick={openCreate}><Plus className="h-4 w-4" /> เพิ่ม{cfg.noun}</button>}
        </div>
      </div>

      <div className="card mb-4 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
          <input className="input !pl-10" placeholder={`ค้นหา ${searchKeys.map((k) => cfg.fields.find((f) => f.key === k).label).slice(0, 4).join(' / ')}`} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="สถานะ">
          <option value="">ทุกสถานะ</option>
          {statusField.options.map((o) => <option key={o}>{o}</option>)}
        </select>
        <select className="input" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="เดือน">
          <option value="">ทุกเดือน</option>
          {thMonths.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        {error ? <ErrorState message={error} onRetry={() => setReload((n) => n + 1)} />
          : items === null ? <Spinner />
          : items.length === 0 ? (
            <EmptyState title={`ยังไม่มี${cfg.noun}ในปีงบประมาณ ${fy}`} hint={writable ? `กด "เพิ่ม${cfg.noun}" เพื่อเริ่มบันทึก` : undefined} />
          ) : filtered.length === 0 ? (
            <EmptyState title="ไม่พบรายการที่ตรงกับเงื่อนไข" hint="ลองเปลี่ยนคำค้นหาหรือตัวกรอง" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left">
                <thead className="bg-slate-100 text-sm text-slate-600">
                  <tr>{listFields.map((f) => <th key={f.key} className="px-3 py-2 font-semibold">{f.label}</th>)}<th className="px-3 py-2 text-center font-semibold">ไฟล์</th></tr>
                </thead>
                <tbody>
                  {filtered.map((it) => (
                    <tr key={it.id} className="cursor-pointer border-t border-slate-100 hover:bg-blue-50/60" onClick={() => setViewId(it.id)}>
                      {listFields.map((f) => (
                        <td key={f.key} className={`px-3 py-2 align-top ${f.key === 'subject' ? 'max-w-xs' : ''}`}>
                          {f.key === cfg.statusField ? <Badge className={cfg.statusColors[it[f.key]]}>{it[f.key]}</Badge>
                            : f.key === cfg.numberField ? <span className="font-semibold text-blue-800">{it[f.key]}</span>
                            : <span className={f.key === 'subject' ? 'line-clamp-2' : ''}>{display(f, it[f.key])}</span>}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-center text-slate-500">{(it.attachments || []).length || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {/* ฟอร์มเพิ่ม/แก้ไข */}
      {form && (
        <Modal
          wide
          title={form.id ? `แก้ไข${cfg.noun} ${form.number}` : `เพิ่ม${cfg.noun}`}
          onClose={() => !saving && setForm(null)}
          footer={
            <>
              <button type="button" className="btn btn-outline" disabled={saving} onClick={() => setForm(null)}>ยกเลิก</button>
              <button type="submit" form="reg-form" className="btn btn-green" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} บันทึก
              </button>
            </>
          }
        >
          <form id="reg-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
            {!form.id && <p className="rounded-lg bg-blue-50 p-2 text-sm text-blue-800 sm:col-span-2">{cfg.numberLabel}จะถูกสร้างอัตโนมัติเมื่อกดบันทึก และแนบไฟล์ได้หลังบันทึกแล้ว</p>}
            {cfg.fields.filter((f) => !f.auto).map((f) => (
              <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                <label htmlFor={`f-${f.key}`} className="mb-1 block text-sm font-medium text-slate-600">{f.label}{f.required && <span className="text-red-600"> *</span>}</label>
                {f.type === 'textarea' ? (
                  <textarea id={`f-${f.key}`} rows={3} className="input" value={form.values[f.key]} onChange={(e) => setForm({ ...form, values: { ...form.values, [f.key]: e.target.value } })} />
                ) : f.type === 'select' ? (
                  <select id={`f-${f.key}`} className="input" value={form.values[f.key]} onChange={(e) => setForm({ ...form, values: { ...form.values, [f.key]: e.target.value } })}>
                    <option value="">-- เลือก --</option>
                    {f.options.map((o) => <option key={o}>{o}</option>)}
                  </select>
                ) : (
                  <input id={`f-${f.key}`} type={f.type === 'date' ? 'date' : 'text'} className="input" value={form.values[f.key]} onChange={(e) => setForm({ ...form, values: { ...form.values, [f.key]: e.target.value } })} />
                )}
                {errors[f.key] && <p className="mt-1 text-sm text-red-600">{errors[f.key]}</p>}
              </div>
            ))}
          </form>
        </Modal>
      )}

      {/* รายละเอียด + ไฟล์แนบ */}
      {viewItem && (
        <Modal
          wide
          title={`${cfg.noun} ${viewItem[cfg.numberField]}`}
          onClose={() => setViewId(null)}
          footer={writable && (
            <>
              <button className="btn btn-outline text-red-600" onClick={() => setToDelete(viewItem)}><Trash2 className="h-4 w-4" /> ลบ</button>
              <button className="btn btn-primary" onClick={() => openEdit(viewItem)}><Pencil className="h-4 w-4" /> แก้ไข</button>
            </>
          )}
        >
          <dl className="mb-5 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {cfg.fields.map((f) => (
              <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                <dt className="text-sm text-slate-500">{f.label}</dt>
                <dd className="whitespace-pre-wrap font-medium">
                  {f.key === cfg.statusField ? <Badge className={cfg.statusColors[viewItem[f.key]]}>{viewItem[f.key]}</Badge> : display(f, viewItem[f.key])}
                </dd>
              </div>
            ))}
          </dl>
          <FileAttach cfg={cfg} id={viewItem.id} label={viewItem[cfg.numberField]} attachments={viewItem.attachments || []} canEdit={writable} onMessage={say} />
        </Modal>
      )}

      {toDelete && (
        <ConfirmDialog
          message={`คุณต้องการลบทะเบียน${cfg.noun}เลขที่ ${toDelete[cfg.numberField]} หรือไม่?`}
          busy={deleting} onConfirm={doDelete} onCancel={() => setToDelete(null)}
        />
      )}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
