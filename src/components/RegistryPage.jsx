import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, doc, deleteDoc, getDoc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import { CheckCircle2, Download, FileSpreadsheet, Loader2, Pencil, Plus, Printer, Search, Trash2 } from 'lucide-react';
import { db, storage } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useFiscalYear } from '../context/FiscalYearContext';
import { canWrite, OWNER_EMAIL } from '../lib/roles';
import { diffFields, writeAudit } from '../lib/audit';
import { createNumbered, createOutgoingNumbered, insertOutgoingNumbered, formatNumber, getNumbering, ORG_DOC_CODE } from '../lib/numbering';
import { exportCsv } from '../lib/exportFile';
import { exportRegistryExcel } from '../lib/report';
import { fiscalYearBE, fmtDate, nowTimeStr, thMonths, todayStr } from '../lib/thai';
import { Badge, ConfirmDialog, EmptyState, ErrorState, Modal, Spinner, Toast } from './ui';
import FileAttach from './FileAttach';
import { PageHeader } from './Logo';

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
  const [insertMode, setInsertMode] = useState(false);
  const [insertBase, setInsertBase] = useState('');
  const [insertPreview, setInsertPreview] = useState(null);
  const [people, setPeople] = useState([]);
  const [justCreated, setJustCreated] = useState(null); // { id, number, date, time } แสดงผลหลังบันทึกทะเบียนหนังสือรับ
  const [incomingPreview, setIncomingPreview] = useState(null); // เลขรับที่จะออกให้ พรีวิวก่อนบันทึกจริง
  const isOutgoing = cfg.key === 'outgoing';
  const isIncoming = cfg.key === 'incoming';
  const hasUserSelect = cfg.fields.some((f) => f.type === 'select-users');

  const say = (t) => { setToast(t); setTimeout(() => setToast(null), 3500); };

  // รายชื่อบุคลากร ใช้เติมช้อยฟิลด์ประเภท select-users (เช่น ผู้รับผิดชอบหนังสือส่ง)
  useEffect(() => {
    if (!hasUserSelect) return;
    return onSnapshot(collection(db, 'users'),
      (s) => setPeople(s.docs.map((d) => d.data()).filter((u) => u.role !== 'pending' && u.name).sort((a, b) => String(a.name).localeCompare(String(b.name), 'th'))),
      () => setPeople([]));
  }, [hasUserSelect]);

  // คำนวณเลขแทรกลำดับถัดไปจริง (อ่านตัวนับปัจจุบัน) เพื่อโชว์พรีวิวก่อนบันทึก
  useEffect(() => {
    if (!isOutgoing || !insertMode || !insertBase) { setInsertPreview(null); return; }
    let live = true;
    getDoc(doc(db, 'counters', `outgoing_insert_${fy}_${insertBase}`)).then((s) => {
      if (live) setInsertPreview((s.exists() ? s.data().last : 0) + 1);
    }).catch(() => { if (live) setInsertPreview(null); });
    return () => { live = false; };
  }, [isOutgoing, insertMode, insertBase, fy]);

  // พรีวิวเลขรับ + วันที่/เวลารับ ที่จะออกให้อัตโนมัติ (เฉพาะตอนเพิ่มหนังสือรับใหม่) — ใช้ค่าจริงเดียวกันตอนบันทึก ไม่ให้ผู้ใช้แก้เอง
  useEffect(() => {
    if (!isIncoming || !form || form.id) { setIncomingPreview(null); return; }
    let live = true;
    const tick = async () => {
      try {
        const cfgNum = await getNumbering();
        // ต้องคำนวณปีให้ตรงกับวิธีที่ createNumbered() ใช้จริงตอนบันทึก (ปีปฏิทินของวันที่รับ แปลงเป็น พ.ศ./ค.ศ. ตามตั้งค่า)
        const yCe = Number(todayStr().slice(0, 4));
        const year = cfgNum.era === 'CE' ? yCe : yCe + 543;
        const counterSnap = await getDoc(doc(db, 'counters', `incoming_${year}`));
        const next = (counterSnap.exists() ? counterSnap.data().last : 0) + 1;
        const prefix = cfgNum.prefixes?.incoming || '';
        if (live) setIncomingPreview({ number: formatNumber(next, cfgNum.digits, year, prefix), date: todayStr(), time: nowTimeStr() });
      } catch { if (live) setIncomingPreview(null); }
    };
    tick();
    const t = setInterval(tick, 30000);
    return () => { live = false; clearInterval(t); };
  }, [isIncoming, form]);

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

  // เลขที่หนังสือส่งหลัก (insertSeq = 0) ในปีงบประมาณนี้ ใหม่สุดก่อน สำหรับตัวเลือก "แทรกเลขที่ย้อนหลัง"
  const outgoingBases = useMemo(
    () => (isOutgoing ? (items || []).filter((x) => x.baseSeq && !x.insertSeq).sort((a, b) => b.baseSeq - a.baseSeq) : []),
    [items, isOutgoing],
  );
  const nextOutgoingPreview = outgoingBases.length ? outgoingBases[0].baseSeq + 1 : 1;

  const openCreate = () => {
    setErrors({}); setInsertMode(false); setInsertBase(''); setJustCreated(null);
    const values = emptyForm(cfg);
    if (isIncoming) {
      // ค่าเริ่มต้นช่อง "ถึง" เป็นผู้อำนวยการ (ผู้รับหนังสือส่วนใหญ่) เปลี่ยนเป็นบุคลากรท่านอื่นได้จากช้อย
      const director = people.find((p) => p.email === OWNER_EMAIL) || people.find((p) => p.role === 'director');
      if (director?.name) values.to = director.name;
    }
    setForm({ values });
  };
  const openEdit = (it) => {
    const values = {};
    cfg.fields.forEach((f) => { if (!f.auto) values[f.key] = it[f.key] ?? ''; });
    setErrors({});
    setViewId(null);
    setForm({ id: it.id, number: it[cfg.numberField], values });
  };

  const validate = (values) => {
    const e = {};
    cfg.fields.forEach((f) => { if (!f.auto && f.required && !String(values[f.key] || '').trim()) e[f.key] = `กรุณากรอก${f.label}`; });
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const values = Object.fromEntries(Object.entries(form.values).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
    // หนังสือรับ: วันที่/เวลารับ เป็นค่าที่ระบบกำหนดอัตโนมัติตามเวลาจริงตอนกดบันทึก (เฉพาะตอนเพิ่มใหม่ แก้ไขรายการเดิมไม่แตะค่านี้)
    if (isIncoming && !form.id) {
      values.receiveDate = todayStr();
      values.receiveTime = nowTimeStr();
    }
    const e = validate(values);
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const old = form.id ? items.find((x) => x.id === form.id) : null;
      const fyVal = fiscalYearBE(values[cfg.dateField] ?? old?.[cfg.dateField] ?? todayStr());
      if (form.id) {
        const keys = cfg.fields.filter((f) => !f.auto).map((f) => f.key);
        const { before, after } = diffFields(old, values, keys);
        await updateDoc(doc(db, cfg.key, form.id), { ...values, fy: fyVal, updatedAt: serverTimestamp(), updatedBy: profile.email });
        await writeAudit({ action: 'update', module: cfg.key, docId: form.id, label: form.number, before, after });
        say({ type: 'ok', text: 'บันทึกการแก้ไขแล้ว' });
      } else {
        let id, number;
        if (isOutgoing && insertMode) {
          if (!insertBase) { setErrors({ ...e, sendNo: 'กรุณาเลือกเลขที่หนังสือส่งที่จะแทรก' }); setSaving(false); return; }
          if (fyVal !== fy) { say({ type: 'error', text: `วันที่ที่เลือกอยู่ในปีงบประมาณ ${fyVal} กรุณาเปลี่ยนปีงบประมาณด้านบนเป็น ${fyVal} ก่อนแทรกเลขที่` }); setSaving(false); return; }
          ({ id, number } = await insertOutgoingNumbered({ fy: fyVal, baseSeq: Number(insertBase), data: { ...values, attachments: [] } }));
        } else if (isOutgoing) {
          ({ id, number } = await createOutgoingNumbered({ fy: fyVal, data: { ...values, attachments: [] } }));
        } else {
          ({ id, number } = await createNumbered({
            collectionName: cfg.key, numberField: cfg.numberField, dateStr: values[cfg.dateField],
            data: { ...values, fy: fyVal, attachments: [] },
          }));
        }
        await writeAudit({ action: 'create', module: cfg.key, docId: id, label: number, after: values });
        say({ type: 'ok', text: `บันทึกแล้ว ${cfg.numberLabel} ${number}` });
        // ปีงบประมาณของรายการใหม่อาจไม่ตรงกับปีที่เลือก
        if (fyVal !== fy) say({ type: 'ok', text: `บันทึกแล้ว ${number} (อยู่ในปีงบประมาณ ${fyVal})` });
        if (isIncoming) {
          // ทะเบียนหนังสือรับ: ค้างหน้าต่างไว้ให้เห็นเลขรับ+เวลารับที่ออกจริง ก่อนปิดเอง (เก็บ id ไว้ให้กดแนบไฟล์ต่อได้ทันที)
          setJustCreated({ id, number, date: values.receiveDate, time: values.receiveTime });
          setSaving(false);
          return;
        }
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
      exportCsv(exportRows(), name);
      writeAudit({ action: 'export', module: cfg.key, label: `${name} (${filtered.length} รายการ, ${kind})` }).catch(() => {});
    } catch (e) {
      say({ type: 'error', text: 'ส่งออกไม่สำเร็จ: ' + e.message });
    }
  };

  // รายงานรูปแบบทะเบียนราชการ (แถบชื่อเรื่องสี + หัวตารางสี): Excel จริงจากไฟล์, PDF ผ่านหน้าพิมพ์ของเบราว์เซอร์
  const [reporting, setReporting] = useState(false);
  const doReportExcel = async () => {
    if (!filtered.length) return say({ type: 'error', text: 'ไม่มีข้อมูลให้ออกรายงาน' });
    setReporting(true);
    try {
      await exportRegistryExcel(cfg, filtered, fy);
      writeAudit({ action: 'export', module: cfg.key, label: `รายงาน ${cfg.title} ปีงบ${fy} (Excel แบบฟอร์ม)` }).catch(() => {});
    } catch (e) {
      say({ type: 'error', text: 'ออกรายงานไม่สำเร็จ: ' + e.message });
    } finally { setReporting(false); }
  };
  const openReportPdf = () => window.open(`${window.location.origin}${window.location.pathname}#/print/${cfg.key}?fy=${fy}`, '_blank');

  return (
    <div className="mx-auto max-w-7xl p-4 lg:p-6">
      <PageHeader
        emoji={cfg.emoji} title={cfg.title}
        subtitle={`ปีงบประมาณ ${fy} · ${items ? `${filtered.length} จาก ${items.length} รายการ` : 'กำลังโหลด'}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <button className="btn bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25" onClick={() => doExport('csv')}><Download className="h-4 w-4" /> CSV</button>
            <button className="btn bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25" onClick={doReportExcel} disabled={reporting} title="ออกรายงาน Excel รูปแบบทะเบียนราชการ">{reporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Excel</button>
            <button className="btn bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25" onClick={openReportPdf} title="เปิดหน้าพิมพ์รายงาน แล้วเลือก บันทึกเป็น PDF"><Printer className="h-4 w-4" /> PDF</button>
            {writable && <button className="btn bg-white text-brand-800 hover:bg-brand-50" onClick={openCreate}><Plus className="h-4 w-4" /> เพิ่ม{cfg.noun}</button>}
          </div>
        }
      />

      <div className="card mb-4 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
          <input className="input !pl-10" placeholder={`ค้นหา ${searchKeys.map((k) => cfg.fields.find((f) => f.key === k).label).slice(0, 4).join(' / ')}`} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {statusField && (
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="สถานะ">
            <option value="">ทุกสถานะ</option>
            {statusField.options.map((o) => <option key={o}>{o}</option>)}
          </select>
        )}
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
                    <tr key={it.id} className="cursor-pointer border-t border-slate-100 hover:bg-brand-50/60" onClick={() => setViewId(it.id)}>
                      {listFields.map((f) => (
                        <td key={f.key} className={`px-3 py-2 align-top ${f.key === 'subject' ? 'max-w-xs' : ''}`}>
                          {f.key === cfg.statusField ? <Badge className={cfg.statusColors[it[f.key]]}>{it[f.key]}</Badge>
                            : f.key === cfg.numberField ? <span className="font-semibold text-brand-800">{it[f.key]}</span>
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
      {form && justCreated ? (
        <Modal wide title={`บันทึก${cfg.noun}สำเร็จ`} onClose={() => { setForm(null); setJustCreated(null); }}
          footer={<>
            <button className="btn btn-outline" onClick={() => { setJustCreated(null); openCreate(); }}>เพิ่มรายการใหม่</button>
            <button className="btn btn-outline" onClick={() => { const jid = justCreated.id; setForm(null); setJustCreated(null); setViewId(jid); }}>แนบไฟล์เอกสาร</button>
            <button className="btn btn-primary" onClick={() => { setForm(null); setJustCreated(null); }}>เสร็จสิ้น</button>
          </>}>
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <p className="text-slate-600">บันทึกลงทะเบียนหนังสือรับแล้ว ด้วยเลขรับ วันที่ และเวลาที่ระบบออกให้อัตโนมัติ ณ ขณะกดบันทึกจริง</p>
            <div className="w-full max-w-sm space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">เลขรับ</label>
                <input readOnly className="input bg-brand-50 text-center text-xl font-extrabold text-brand-800" value={justCreated.number} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">วันที่/เวลาที่รับหนังสือ</label>
                <input readOnly className="input bg-brand-50 text-center font-semibold text-brand-800" value={`${fmtDate(justCreated.date)} เวลา ${justCreated.time} น.`} />
              </div>
            </div>
          </div>
        </Modal>
      ) : form && (
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
            {!form.id && !isOutgoing && !isIncoming && <p className="rounded-lg bg-brand-50 p-2 text-sm text-brand-800 sm:col-span-2">{cfg.numberLabel}จะถูกสร้างอัตโนมัติเมื่อกดบันทึก และแนบไฟล์ได้หลังบันทึกแล้ว</p>}
            {!form.id && isIncoming && (
              <div className="rounded-lg bg-brand-50 p-3 text-sm text-brand-800 sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-brand-900" htmlFor="incoming-number-preview">เลขรับ / วันที่ / เวลารับหนังสือ</label>
                <input id="incoming-number-preview" readOnly className="input bg-white font-semibold text-brand-800"
                  value={incomingPreview ? `${incomingPreview.number} · ${fmtDate(incomingPreview.date)} · เวลา ${incomingPreview.time} น.` : 'กำลังคำนวณ...'} />
                <p className="mt-1">ระบบจะออกเลขรับและบันทึกวันที่-เวลาให้อัตโนมัติตามเวลาจริงตอนกดบันทึก แก้ไขเองไม่ได้ (ค่าที่แสดงนี้เป็นตัวอย่างล่วงหน้า อาจขยับได้เล็กน้อยหากมีผู้อื่นบันทึกก่อนคุณ)</p>
              </div>
            )}
            {!form.id && isOutgoing && (
              <div className="rounded-lg bg-brand-50 p-3 text-sm text-brand-800 sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-brand-900" htmlFor="outgoing-number-preview">เลขที่หนังสือส่ง</label>
                <input id="outgoing-number-preview" readOnly className="input bg-white font-semibold text-brand-800"
                  value={!insertMode ? `${ORG_DOC_CODE}/${nextOutgoingPreview}` : (insertBase ? `${ORG_DOC_CODE}/${insertBase}.${insertPreview ?? '...'}` : `${ORG_DOC_CODE}/(เลือกเลขที่เดิมก่อน)`)} />
                {!insertMode ? (
                  <p className="mt-1">เลขที่นี้จะถูกออกโดยอัตโนมัติเมื่อกดบันทึก</p>
                ) : (
                  <p className="mt-1">เลขที่จะเป็นเลขแทรกของหมายเลขที่เลือกไว้ เช่น {ORG_DOC_CODE}/20.1 (ลำดับแทรกจริงจะคำนวณตอนบันทึก)</p>
                )}
                <label className="mt-2 flex items-center gap-2 font-normal text-brand-900">
                  <input type="checkbox" className="h-4 w-4" checked={insertMode} disabled={!outgoingBases.length && !insertMode}
                    onChange={(e) => { setInsertMode(e.target.checked); setInsertBase(''); }} />
                  แทรกเลขที่ย้อนหลัง (สำหรับหนังสือที่ลงวันที่ย้อนหลังและเลขที่นั้นถูกใช้ไปแล้ว)
                </label>
                {!outgoingBases.length && !insertMode && <p className="mt-1 text-xs text-brand-600">ยังไม่มีเลขที่ในปีงบประมาณ {fy} ให้แทรก</p>}
                {insertMode && (
                  <select className="input mt-2" value={insertBase} onChange={(e) => setInsertBase(e.target.value)} aria-label="เลือกเลขที่ที่จะแทรก">
                    <option value="">-- เลือกเลขที่เดิมที่จะแทรก --</option>
                    {outgoingBases.map((b) => (
                      <option key={b.baseSeq} value={b.baseSeq}>{ORG_DOC_CODE}/{b.baseSeq} · {fmtDate(b[cfg.dateField])} · {String(b.subject || '').slice(0, 30)}</option>
                    ))}
                  </select>
                )}
                {errors.sendNo && <p className="mt-1 text-sm text-red-600">{errors.sendNo}</p>}
              </div>
            )}
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
                ) : f.type === 'select-other' ? (
                  (() => {
                    const raw = form.values[f.key] || '';
                    const isFixed = f.options.includes(raw);
                    const selectVal = isFixed ? raw : raw ? 'อื่นๆ' : '';
                    return (
                      <div className="space-y-2">
                        <select
                          id={`f-${f.key}`} className="input" value={selectVal}
                          onChange={(e) => {
                            const v = e.target.value;
                            setForm({ ...form, values: { ...form.values, [f.key]: v === 'อื่นๆ' ? '' : v } });
                          }}
                        >
                          <option value="">-- เลือก --</option>
                          {f.options.map((o) => <option key={o}>{o}</option>)}
                          <option value="อื่นๆ">อื่นๆ (ระบุ)</option>
                        </select>
                        {selectVal === 'อื่นๆ' && (
                          <input
                            className="input" placeholder="ระบุถึง..." autoFocus value={raw}
                            onChange={(e) => setForm({ ...form, values: { ...form.values, [f.key]: e.target.value } })}
                          />
                        )}
                      </div>
                    );
                  })()
                ) : f.type === 'select-users' ? (
                  <select id={`f-${f.key}`} className="input" value={form.values[f.key]} onChange={(e) => setForm({ ...form, values: { ...form.values, [f.key]: e.target.value } })}>
                    <option value="">-- เลือก{f.label} --</option>
                    {people.map((p) => <option key={p.email} value={p.name}>{p.name}{p.position ? ` (${p.position})` : ''}</option>)}
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
