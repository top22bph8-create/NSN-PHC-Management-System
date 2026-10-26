import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { addDoc, collection, doc, deleteDoc, getDoc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import { ArrowLeft, CheckCircle2, Download, FileSpreadsheet, Loader2, Pencil, Plus, Printer, Search, Trash2 } from 'lucide-react';
import { db, storage } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useFiscalYear } from '../context/FiscalYearContext';
import { can, canWrite } from '../lib/roles';
import { diffFields, writeAudit } from '../lib/audit';
import { checkSeqUsed, createNumberedAtSeq, createNumbered, createOutgoingNumbered, insertOutgoingNumbered, insertRegNumbered, parseRegNumber, formatNumber, getNumbering, ORG_DOC_CODE } from '../lib/numbering';
import { exportCsv } from '../lib/exportFile';
import { exportRegistryExcel } from '../lib/report';
import { fiscalYearBE, fmtDate, nowTimeStr, thMonths, todayStr } from '../lib/thai';
import { REGISTRY_LINKS } from '../config/menu';
import { Badge, ConfirmDialog, EmptyState, ErrorState, Modal, Spinner, Toast } from './ui';
import FileAttach from './FileAttach';
import { PageHeader } from './Logo';
import ThaiDateInput from './ThaiDateInput';
import { VEHICLE_TYPES, getVehicleFleet, vehicleLabel, asList, numberedText, groupMissions, normalizeMissionDoc, missionLines } from '../lib/vehicleConfig';
import TimeKeypadInput from './TimeKeypadInput';
import OdometerKeypadInput from './OdometerKeypadInput';
import MissionGroupPicker from './MissionGroupPicker';

const emptyForm = (cfg) => {
  const f = {};
  cfg.fields.forEach((x) => {
    if (x.auto) return;
    f[x.key] = x.default ?? (x.type === 'multi-check' ? [] : x.key === cfg.dateField ? todayStr() : '');
  });
  return f;
};

// หน้าทะเบียนแบบกำหนดด้วย config: เพิ่ม แก้ไข ค้นหา ดูรายละเอียด แนบไฟล์ ลบ Export
// สรุปยอดทะเบียนคุมฎีกาเบิกจ่าย: ยอดรวมของรายการที่กรองอยู่ (เลือกเดือนด้านบนเพื่อดูรายเดือน) + ตารางสรุปรายเดือนทั้งปีงบประมาณ พร้อมยอดรวมทั้งปี
// แสดงตัวเลขเงินมีเครื่องหมายจุลภาคคั่นหลักพัน และทศนิยม 2 ตำแหน่งเมื่อมีเศษ (เช่น 12,345 / 12,345.50)
export const fmtMoney = (v) => {
  const n = Number(v);
  if (v === '' || v === null || v === undefined || Number.isNaN(n)) return '';
  return n.toLocaleString('th-TH', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
};
const num = (v) => Number(v) || 0;
const money = (n) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const FY_MONTH_ORDER = ['10', '11', '12', '01', '02', '03', '04', '05', '06', '07', '08', '09'];
function sumDeeka(list) {
  return list.reduce((a, it) => {
    const pay = num(it.payAmount), tax = num(it.taxWithheld), sso = num(it.ssoAmount);
    return { n: a.n + 1, pay: a.pay + pay, tax: a.tax + tax, sso: a.sso + sso, total: a.total + (String(it.amount ?? '').trim() !== '' ? num(it.amount) : pay + tax + sso) };
  }, { n: 0, pay: 0, tax: 0, sso: 0, total: 0 });
}
function DeekaSummary({ items, filtered, month, yearBE, fy }) {
  const [open, setOpen] = useState(false);
  const cur = sumDeeka(filtered);
  const rows = FY_MONTH_ORDER.map((mm) => ({ mm, s: sumDeeka(items.filter((it) => String(it.deekaDate || '').slice(5, 7) === mm)) })).filter((r) => r.s.n > 0);
  const all = sumDeeka(items);
  const cell = 'px-3 py-2 text-right tabular-nums';
  const cards = [
    { label: 'ยอดจ่ายเช็ค', v: cur.pay, grad: 'from-sky-500 to-blue-600', icon: '💳' },
    { label: 'ภาษีหัก ณ ที่จ่าย', v: cur.tax, grad: 'from-amber-400 to-orange-500', icon: '🧾' },
    { label: 'หักจ่ายประกันสังคม', v: cur.sso, grad: 'from-emerald-500 to-teal-600', icon: '🛡️' },
    { label: 'มูลค่าตั้งเบิกตามฎีกา', v: cur.total, grad: 'from-fuchsia-500 to-purple-700', icon: '💰' },
  ];
  return (
    <div className="card mb-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-lg font-bold text-slate-800">
          📊 ยอดรวม {month ? `เดือน${thMonths[Number(month) - 1]}` : 'ทุกเดือน'}{yearBE ? ` พ.ศ. ${yearBE}` : ''} <span className="ml-1 rounded-full bg-slate-100 px-3 py-0.5 text-base font-semibold text-slate-600">{cur.n} ฎีกา</span>
        </div>
        <button type="button" className="btn btn-outline !py-1 text-sm" onClick={() => setOpen(!open)}>{open ? 'ซ่อนสรุปรายเดือน' : '📅 สรุปรายเดือนทั้งปีงบประมาณ'}</button>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-2xl bg-gradient-to-br ${c.grad} p-4 text-white shadow-md`}>
            <div className="flex items-center justify-between text-base font-medium text-white/90"><span>{c.label}</span><span className="text-2xl">{c.icon}</span></div>
            <div className="mt-1 text-3xl font-extrabold tracking-tight tabular-nums sm:text-4xl">{money(c.v)}</div>
            <div className="text-sm text-white/80">บาท</div>
          </div>
        ))}
      </div>
      {open && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[700px] text-base">
            <thead className="text-white"><tr>
              <th className="bg-slate-700 px-3 py-2 text-left">เดือน</th><th className="bg-slate-700 px-3 py-2 text-right">จำนวนฎีกา</th><th className="bg-blue-600 px-3 py-2 text-right">ยอดจ่ายเช็ค</th><th className="bg-orange-500 px-3 py-2 text-right">ภาษีหัก ณ ที่จ่าย</th><th className="bg-teal-600 px-3 py-2 text-right">ประกันสังคม</th><th className="bg-purple-700 px-3 py-2 text-right">มูลค่าตั้งเบิก</th>
            </tr></thead>
            <tbody>
              {rows.map(({ mm, s }) => (
                <tr key={mm} className="border-t border-slate-200 odd:bg-white even:bg-slate-50">
                  <td className="px-3 py-2 font-semibold">{thMonths[Number(mm) - 1]}</td><td className={cell}>{s.n}</td><td className={`${cell} text-blue-700`}>{money(s.pay)}</td><td className={`${cell} text-orange-700`}>{money(s.tax)}</td><td className={`${cell} text-teal-700`}>{money(s.sso)}</td><td className={`${cell} font-bold text-purple-800`}>{money(s.total)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-400 bg-yellow-50 text-lg font-extrabold">
                <td className="px-3 py-2.5">รวมปีงบประมาณ {fy}</td><td className={cell}>{all.n}</td><td className={`${cell} text-blue-800`}>{money(all.pay)}</td><td className={`${cell} text-orange-800`}>{money(all.tax)}</td><td className={`${cell} text-teal-800`}>{money(all.sso)}</td><td className={`${cell} text-purple-900`}>{money(all.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function RegistryPage({ cfg }) {
  const { profile } = useAuth();
  const { fy, options: fyOptions } = useFiscalYear();
  const writable = canWrite(profile.role, cfg.key);
  const [params, setParams] = useSearchParams();

  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [yearBE, setYearBE] = useState('');
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
  const [otherActive, setOtherActive] = useState({}); // select-other กำลังอยู่ในโหมด "อื่นๆ" หรือไม่ (คีย์ตาม field key) — เก็บแยกจากค่าฟิลด์ เพราะค่าฟิลด์จะถูกเคลียร์เป็นค่าว่างตอนเลือก "อื่นๆ"
  const [otherOpen, setOtherOpen] = useState({}); // ช่องพิมพ์เองของ select-other ถูกกดปุ่ม "+" เปิดแล้วหรือยัง (คีย์ตาม field key)
  const isOutgoing = cfg.key === 'outgoing';
  const isIncoming = cfg.key === 'incoming';
  // ทะเบียนทั่วไปทุกทะเบียน (ไม่ใช่หนังสือรับ/หนังสือส่งที่มีกติกาออกเลขที่เฉพาะของตัวเองอยู่แล้ว) รองรับ "แทรกเลขที่ย้อนหลัง" แบบเดียวกับหนังสือส่ง
  const isGenericNumbered = !isOutgoing && !isIncoming;
  // ทะเบียนบางรายการ (เช่น ทะเบียนคุมเล่มเช็ค/เล่มใบเสร็จ) เลขที่ภายใน ("ลำดับ") ไม่ใช่เลขเอกสารที่มีความหมายให้แทรกย้อนหลังได้ จึงปิดเฉพาะปุ่มแทรกเลขที่สำหรับทะเบียนเหล่านี้
  const canInsertNumber = isGenericNumbered && !cfg.hideInsert;
  const hasUserSelect = cfg.fields.some((f) => f.type === 'select-users');
  // ฟิลด์แบบ select ที่ดึงช้อยแบบสด (real-time) จากเอกสาร settings/<optionsFrom> แทนช้อยตายตัวในไฟล์ config (เช่น ประเภทรถ ดึงจากทะเบียนยานพาหนะกลาง)
  const dynOptionsKeys = [...new Set(cfg.fields.filter((f) => f.optionsFrom).map((f) => f.optionsFrom))];
  const [dynOptions, setDynOptions] = useState({});
  const [genInsertMode, setGenInsertMode] = useState(false);
  const [genInsertBase, setGenInsertBase] = useState('');
  const [genInsertPreview, setGenInsertPreview] = useState(null);
  // ทะเบียนสัญญาเงินยืม: การคืนเงินยืมบันทึกผ่านปุ่มท้ายแถว/ในหน้ารายละเอียด ไม่ใช่ทะเบียนแยกอีกต่อไป (เดิมคือ reg-loan-repay)
  const isLoan = cfg.key === 'reg-loan';
  const [repayItem, setRepayItem] = useState(null); // รายการสัญญายืมเงินที่กำลังจะบันทึกการคืนเงิน
  const [repayForm, setRepayForm] = useState({ date: todayStr(), dikaList: [''] });
  const [repaySaving, setRepaySaving] = useState(false);
  // ทะเบียนคุมฎีกาเบิกจ่าย: สถานะจ่ายเช็ค และสถานะส่งภาษีหัก ณ ที่จ่ายให้สรรพากร แยกกันคนละสถานะ คนละปุ่ม ("ชำระ") ต้องเลือกวันที่ทุกครั้งที่กด
  const isDeeka = cfg.key === 'reg-deeka';
  // ฎีกาที่ไม่ได้ลงยอด "ภาษีหัก ณ ที่จ่าย" ไว้ (เว้นว่าง/เป็น 0) ถือว่าไม่มีภาษีต้องนำส่ง — แสดงสถานะ "ไม่มียอดหัก" สีเขียวแทน
  // และไม่ต้องมีปุ่มกด "ส่งสรรพากร" ให้กด (มีแต่ปุ่ม "ชำระเช็ค" เท่านั้น) ตามที่ ผอ. แจ้ง
  const hasNoTax = (it) => !(Number(it?.taxWithheld) > 0);
  const hasNoSso = (it) => !(Number(it?.ssoAmount) > 0);
  // ===== ทะเบียนควบคุมยานพาหนะ (ระบบขออนุญาตใช้ยานพาหนะราชการ เฟส 2): แยกสิทธิ์ผู้อนุมัติออกจากผู้บันทึกคำขออย่างชัดเจน =====
  // อนุมัติ/ไม่อนุมัติ/ยกเลิก (โดยผู้มีอำนาจ) ทำผ่านปุ่มเฉพาะด้านล่างเท่านั้น (ไม่ใช่ช่องสถานะในฟอร์มแก้ไขทั่วไป ซึ่งไม่มีช้อย "อนุมัติ" ให้เลือกได้เอง)
  // ผู้บันทึกคำขอเองยกเลิกคำขอของตัวเองได้เช่นกัน ถ้ายังไม่ถูกพิจารณา (เหมือนการยกเลิกใบลาของตัวเองในทะเบียนควบคุมวันลา)
  const isVehicle = cfg.key === 'vehicle';
  const canApproveVehicle = isVehicle && can(profile.role, 'vehicle', 'approve');
  const canCancelVehicle = (it) => isVehicle && writable && (canApproveVehicle || it.requesterEmail === profile.email) && ['ฉบับร่าง', 'รออนุมัติ'].includes(it.status);
  const [vehicleAction, setVehicleAction] = useState(null); // { item, kind: 'approve' | 'reject' | 'cancel' }
  const [vehicleActionNote, setVehicleActionNote] = useState('');
  const [vehicleActionSaving, setVehicleActionSaving] = useState(false);
  const openVehicleAction = (it, kind) => { setVehicleActionNote(''); setVehicleAction({ item: it, kind }); };
  const submitVehicleAction = async () => {
    const { item, kind } = vehicleAction;
    if (kind !== 'approve' && !vehicleActionNote.trim()) { say({ type: 'error', text: 'กรุณาระบุเหตุผล' }); return; }
    const after = {
      status: kind === 'approve' ? 'อนุมัติ' : kind === 'reject' ? 'ไม่อนุมัติ' : 'ยกเลิก',
      decidedBy: profile.name || profile.email,
      decidedAt: todayStr(),
      decidedNote: kind === 'approve' ? '' : vehicleActionNote.trim(),
    };
    setVehicleActionSaving(true);
    try {
      await updateDoc(doc(db, cfg.key, item.id), { ...after, updatedAt: serverTimestamp(), updatedBy: profile.email });
      await writeAudit({ action: 'update', module: cfg.key, docId: item.id, label: item[cfg.numberField], after });
      say({ type: 'ok', text: kind === 'approve' ? 'อนุมัติคำขอใช้รถแล้ว' : kind === 'reject' ? 'บันทึกไม่อนุมัติแล้ว' : 'ยกเลิกคำขอใช้รถแล้ว' });
      setVehicleAction(null);
    } catch (err) {
      say({ type: 'error', text: 'บันทึกไม่สำเร็จ: ' + (err.code || err.message) });
    } finally {
      setVehicleActionSaving(false);
    }
  };
  // เฟส 3: เริ่มเดินทาง / สิ้นสุดการเดินทาง — ทำได้เฉพาะคำขอที่ "อนุมัติ" แล้วเท่านั้น (ห้ามเริ่มเดินทางในรายการที่ยังไม่อนุมัติตามสเปก)
  // ปุ่มจะหายไปหลังกดแล้ว (สถานะเปลี่ยนเป็นกำลังใช้งาน/เสร็จสิ้นทันที) จึงกันการกดบันทึกเที่ยวเดิมซ้ำโดยไม่ตั้งใจไปในตัว
  // รถยนต์ราชการเท่านั้นที่บันทึกเลขไมล์ (รถจักรยานยนต์ซ่อนช่องนี้ตามสเปก — ตรวจจากคำว่า "รถยนต์ราชการ" ที่ขึ้นต้นข้อความช้อย "ประเภทรถ")
  const isCarTrip = (it) => String(it?.plate || '').startsWith(VEHICLE_TYPES[0]);
  const [tripModal, setTripModal] = useState(null); // { item, kind: 'start' | 'end' }
  const [tripForm, setTripForm] = useState({});
  const [tripSaving, setTripSaving] = useState(false);
  // เลขไมล์ครั้งก่อนของรถยนต์คันนี้ = ค่ามากสุดของ "เลขไมล์ปัจจุบัน" ที่เคยบันทึกไว้กับคำขออื่นของรถคันเดียวกัน (รวมคำขอเก่าที่ใช้เลขไมล์เมื่อกลับ) ถ้ายังไม่มีเลย ใช้ "เลขไมล์เริ่มต้น" ในตั้งค่าระบบ
  // (คำนวณจากข้อมูลคำขอ ไม่เขียนกลับหน้าตั้งค่า เพราะหน้านั้นแก้ได้เฉพาะ Super Admin)
  const computePrevOdo = async (plate, excludeId) => {
    if (!String(plate || '').startsWith(VEHICLE_TYPES[0])) return null;
    let best = null;
    try {
      const snap = await getDocs(query(collection(db, cfg.key), where('plate', '==', plate)));
      snap.docs.forEach((d) => {
        if (d.id === excludeId) return;
        const x = d.data();
        [x.odoCurrent, x.odoEnd].forEach((raw) => {
          if (raw === undefined || raw === null || String(raw).trim() === '') return;
          const n = Number(raw);
          if (!Number.isNaN(n) && (best === null || n > best)) best = n;
        });
      });
    } catch { /* ใช้ค่าเริ่มต้นแทน */ }
    if (best !== null) return best;
    let list = dynOptions.vehicleFleet;
    if (!list) { try { list = await getVehicleFleet(); } catch { list = []; } }
    const fv = (list || []).find((v) => vehicleLabel(v) === plate);
    return fv && String(fv.odometer || '').trim() !== '' && !Number.isNaN(Number(fv.odometer)) ? Number(fv.odometer) : null;
  };
  const [formPrev, setFormPrev] = useState(null);
  useEffect(() => {
    if (!isVehicle || !form) { setFormPrev(null); return undefined; }
    let alive = true;
    computePrevOdo(form.values.plate, form.id).then((n) => { if (alive) setFormPrev(n); });
    return () => { alive = false; };
  }, [isVehicle, form?.values?.plate, form?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // วัน+เวลา ของเที่ยวจริงเก็บเป็นข้อความ "YYYY-MM-DD HH:MM" เหมือนเดิม แต่หน้าจอแยกเป็น ช่องวันที่ + แป้นกดเวลา
  const splitDT = (str) => { const m = String(str || '').match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})/); return m ? { d: m[1], t: m[2].padStart(5, '0') } : { d: todayStr(), t: '' }; };
  const joinDT = (d, t) => (d && t ? `${d} ${t}` : '');
  const openTripStart = (it) => {
    setTripForm({ timeOut: `${todayStr()} ${nowTimeStr()}` });
    setTripModal({ item: it, kind: 'start' });
  };
  const openTripEnd = (it) => {
    setTripForm({ timeIn: `${todayStr()} ${nowTimeStr()}`, tripResult: '', note: it.note || '' });
    setTripModal({ item: it, kind: 'end' });
  };
  // เปิดหน้าลงเลขไมล์จากป๊อปอัพเตือน (?trip=รหัส&kind=start|end) — ดึงเอกสารตรงๆ เพราะเที่ยวอาจอยู่คนละปีงบประมาณกับที่เปิดดูอยู่
  useEffect(() => {
    const id = params.get('trip');
    const kind = params.get('kind');
    if (!isVehicle || !id) return;
    params.delete('trip'); params.delete('kind');
    setParams(params, { replace: true });
    getDoc(doc(db, cfg.key, id)).then((s) => {
      if (!s.exists()) return;
      const it = { id: s.id, ...s.data() };
      if (kind === 'end' && it.status === 'กำลังใช้งาน') openTripEnd(it);
      else if (kind === 'start' && it.status === 'อนุมัติ') openTripStart(it);
    }).catch(() => {});
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps
  // สแกน QR Code ประจำรถ (?scan=รหัสรถ): เปิดฟอร์มเริ่มเดินทาง/สิ้นสุดการเดินทางของเที่ยวที่ค้างอยู่ของรถคันนั้น
  useEffect(() => {
    const fleetId = params.get('scan');
    if (!isVehicle || !fleetId) return;
    params.delete('scan');
    setParams(params, { replace: true });
    (async () => {
      try {
        const fleet = await getVehicleFleet();
        const car = fleet.find((f) => f.id === fleetId);
        if (!car) { say({ type: 'error', text: 'ไม่พบรถคันนี้ในทะเบียนยานพาหนะ (QR Code อาจเก่าเกินไป)' }); return; }
        const label = vehicleLabel(car);
        const snap = await getDocs(query(collection(db, cfg.key), where('plate', '==', label)));
        const mine = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const running = mine.find((r) => r.status === 'กำลังใช้งาน');
        if (running) { openTripEnd(running); return; }
        const approvedList = mine.filter((r) => r.status === 'อนุมัติ').sort((a, b) => String(a.useDate).localeCompare(String(b.useDate)));
        const pick = approvedList.find((r) => r.requesterEmail === profile.email) || approvedList[0];
        if (pick) { openTripStart(pick); return; }
        if (writable) { say({ type: 'info', text: `${label} ยังไม่มีคำขอที่ได้รับอนุมัติ — เปิดฟอร์มขอใช้รถให้แล้ว` }); openCreateWithPlate(label); }
        else say({ type: 'error', text: `${label} ยังไม่มีคำขอที่ได้รับอนุมัติ` });
      } catch { say({ type: 'error', text: 'เปิดจาก QR Code ไม่สำเร็จ กรุณาลองใหม่' }); }
    })();
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps
  const submitTrip = async () => {
    const { item, kind } = tripModal;
    let after;
    if (kind === 'start') {
      if (!String(tripForm.timeOut || '').trim()) { say({ type: 'error', text: 'กรุณากรอกวันและเวลาออกเดินทาง' }); return; }
      after = { status: 'กำลังใช้งาน', timeOut: tripForm.timeOut.trim() };
    } else {
      if (!String(tripForm.timeIn || '').trim()) { say({ type: 'error', text: 'กรุณากรอกวันและเวลากลับถึงหน่วยงาน' }); return; }
      after = {
        status: 'เสร็จสิ้น', timeIn: tripForm.timeIn.trim(),
        tripResult: String(tripForm.tripResult || '').trim(), note: String(tripForm.note || '').trim(),
      };
    }
    setTripSaving(true);
    try {
      await updateDoc(doc(db, cfg.key, item.id), { ...after, updatedAt: serverTimestamp(), updatedBy: profile.email });
      await writeAudit({ action: 'update', module: cfg.key, docId: item.id, label: item[cfg.numberField], after });
      say({ type: 'ok', text: kind === 'start' ? 'บันทึกเริ่มเดินทางแล้ว' : 'บันทึกสิ้นสุดการเดินทางแล้ว' });
      setTripModal(null);
    } catch (err) {
      say({ type: 'error', text: 'บันทึกไม่สำเร็จ: ' + (err.code || err.message) });
    } finally {
      setTripSaving(false);
    }
  };
  const [payAction, setPayAction] = useState(null); // { item, kind: 'cheque' | 'tax' } — รายการที่กำลังจะบันทึกการชำระ
  const [payActionDate, setPayActionDate] = useState('');
  const [payActionSaving, setPayActionSaving] = useState(false);
  // ทะเบียนคุมคลัง (เล่มเช็ค/เล่มใบเสร็จ) — เพิ่มเข้าคลัง/เบิกออกจากคลังผ่านป๊อปอัพเฉพาะ คำนวณยอดคงเหลือให้อัตโนมัติ
  const SL = cfg.stockLedger;
  const isStockLedger = !!SL;
  const [stockModal, setStockModal] = useState(null); // null | 'in' | 'out'
  const [slForm, setSlForm] = useState({});
  const [slSaving, setSlSaving] = useState(false);
  const [withdrawItem, setWithdrawItem] = useState(null); // เล่มที่กำลังจะกดเบิกออกจากคลัง (คุมคลังแบบรายเล่ม)
  // ทะเบียนใบเสร็จเท่านั้น: ติดตามเลขที่ใช้ล่าสุด + เจาะปรุทำลายใบเสร็จคงเหลือปลายปีงบ
  const RU = cfg.receiptUsage;
  const [usageItem, setUsageItem] = useState(null); // เล่มที่กำลังจะบันทึกเลขที่ใช้ล่าสุด
  const [usageForm, setUsageForm] = useState({});
  const [usageSaving, setUsageSaving] = useState(false);
  const [destroyItem, setDestroyItem] = useState(null); // เล่มที่กำลังจะเจาะปรุทำลาย
  const [destroyForm, setDestroyForm] = useState({});
  const [destroySaving, setDestroySaving] = useState(false);
  const [showRemainReport, setShowRemainReport] = useState(false);

  const say = (t) => { setToast(t); setTimeout(() => setToast(null), 3500); };

  // รายชื่อบุคลากร ใช้เติมช้อยฟิลด์ประเภท select-users (เช่น ผู้รับผิดชอบหนังสือส่ง)
  useEffect(() => {
    if (!hasUserSelect) return;
    return onSnapshot(collection(db, 'users'),
      (s) => setPeople(s.docs.map((d) => d.data()).filter((u) => u.role !== 'pending' && u.name).sort((a, b) => String(a.name).localeCompare(String(b.name), 'th'))),
      () => setPeople([]));
  }, [hasUserSelect]);

  // ช้อยแบบสดจากเอกสาร settings/<key> (เช่น settings/vehicleFleet) — ใช้กับฟิลด์ที่ตั้ง optionsFrom ไว้ใน config/registries.js
  // แปลงเป็นข้อความช้อยที่จะแสดง: ถ้ามี .plate (รูปแบบทะเบียนยานพาหนะ) ใช้ vehicleLabel, ถ้ามี .label ใช้ label, ปิดใช้งาน (active:false) จะไม่ขึ้นช้อย
  useEffect(() => {
    const unsubs = dynOptionsKeys.map((key) => onSnapshot(doc(db, 'settings', key),
      (s) => {
        // ภารกิจ: รายการที่เคยบันทึกไว้ก่อนมีหมวด (ไม่มี version) ใช้รายการมาตรฐานใหม่แทน (ดู normalizeMissionDoc)
        const list = key === 'vehicleMissionTypes' ? normalizeMissionDoc(s.exists() ? s.data() : null) : (s.exists() && Array.isArray(s.data().list) ? s.data().list : []);
        setDynOptions((prev) => ({ ...prev, [key]: list }));
      },
      () => setDynOptions((prev) => ({ ...prev, [key]: key === 'vehicleMissionTypes' ? normalizeMissionDoc(null) : [] }))));
    return () => unsubs.forEach((u) => u());
  }, [dynOptionsKeys.join(',')]);

  const dynOptionLabels = (key) => (dynOptions[key] || [])
    .filter((o) => o.active !== false)
    .map((o) => (o.plate ? vehicleLabel(o) : (o.label ?? o)));

  // คำนวณเลขแทรกลำดับถัดไปจริง (อ่านตัวนับปัจจุบัน) เพื่อโชว์พรีวิวก่อนบันทึก
  useEffect(() => {
    if (!isOutgoing || !insertMode || !insertBase) { setInsertPreview(null); return; }
    let live = true;
    getDoc(doc(db, 'counters', `outgoing_insert_${fy}_${insertBase}`)).then((s) => {
      if (live) setInsertPreview((s.exists() ? s.data().last : 0) + 1);
    }).catch(() => { if (live) setInsertPreview(null); });
    return () => { live = false; };
  }, [isOutgoing, insertMode, insertBase, fy]);

  // คำนวณเลขแทรกลำดับถัดไปของทะเบียนทั่วไป (อ่านตัวนับปัจจุบันของเลขที่เดิมที่เลือก) เพื่อโชว์พรีวิวก่อนบันทึก
  useEffect(() => {
    if (!canInsertNumber || !genInsertMode || !genInsertBase) { setGenInsertPreview(null); return; }
    const parsed = parseRegNumber(genInsertBase);
    if (!parsed) { setGenInsertPreview(null); return; }
    let live = true;
    getDoc(doc(db, 'counters', `${cfg.key}_insert_${parsed.year}_${parsed.base}`)).then((s) => {
      if (live) setGenInsertPreview((s.exists() ? s.data().last : 0) + 1);
    }).catch(() => { if (live) setGenInsertPreview(null); });
    return () => { live = false; };
  }, [canInsertNumber, genInsertMode, genInsertBase, cfg]);

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
        rows.sort(cfg.key === 'reg-deeka'
          ? (a, b) => (Number((String(a[cfg.numberField] || '').match(/(\d+)/) || [0, 0])[1])) - (Number((String(b[cfg.numberField] || '').match(/(\d+)/) || [0, 0])[1]))
          : (a, b) => (b[cfg.dateField] || '').localeCompare(a[cfg.dateField] || '') || (b[cfg.numberField] || '').localeCompare(a[cfg.numberField] || ''));
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
      if (yearBE && String(Number((it[cfg.dateField] || '').slice(0, 4)) + 543) !== yearBE) return false;
      if (!t) return true;
      return searchKeys.some((k) => String(it[k] || '').toLowerCase().includes(t));
    });
  }, [items, q, status, month, yearBE, cfg, searchKeys]);
  // ปี พ.ศ. ที่มีอยู่ในรายการ (ปีปฏิทินของวันที่เอกสาร) ไว้เป็นตัวเลือกกรอง
  const yearOptions = useMemo(() => {
    const set = new Set((items || []).map((it) => Number((it[cfg.dateField] || '').slice(0, 4))).filter(Boolean).map((y) => y + 543));
    for (let y = 2569; y <= 2579; y++) set.add(y); // ล่วงหน้าไป 10 ปีนับจาก พ.ศ. 2569
    return [...set].sort((a, b) => a - b).map(String);
  }, [items, cfg]);

  const viewItem = items?.find((x) => x.id === viewId) || null;
  const listFields = cfg.fields.filter((f) => f.list);

  const display = (f, v, item) => (f.type === 'date' ? fmtDate(v) : (f.type === 'number' || f.type === 'computed') && fmtMoney(v) !== '' ? fmtMoney(v) : f.type === 'multi-check' ? (item ? numberedText(missionLines(item)) : numberedText(v)) || '-' : f.type === 'time' && v ? `${v} น.` : f.type === 'odometer' && v ? `${Number(v).toLocaleString('th-TH')} กม.` : v || '-');

  // เลขที่หนังสือส่งหลัก (insertSeq = 0) ในปีงบประมาณนี้ ใหม่สุดก่อน สำหรับตัวเลือก "แทรกเลขที่ย้อนหลัง"
  const outgoingBases = useMemo(
    () => (isOutgoing ? (items || []).filter((x) => x.baseSeq && !x.insertSeq).sort((a, b) => b.baseSeq - a.baseSeq) : []),
    [items, isOutgoing],
  );
  const nextOutgoingPreview = outgoingBases.length ? outgoingBases[0].baseSeq + 1 : 1;

  // เลขที่ "หลัก" ในปีงบประมาณนี้ (ยังไม่เคยถูกแทรก ไม่มีจุดในเลขที่) ให้เลือกเป็นฐานสำหรับแทรกเลขที่ย้อนหลัง ใหม่สุดก่อน
  const genBaseCandidates = useMemo(
    () => (canInsertNumber ? (items || []).filter((x) => !String(x[cfg.numberField] || '').includes('.')).sort((a, b) => (b[cfg.dateField] || '').localeCompare(a[cfg.dateField] || '')) : []),
    [items, canInsertNumber, cfg],
  );

  // ทะเบียนคุมคลังแบบรายเล่ม: แต่ละเล่มคือ 1 เอกสาร แยกเป็นเล่มที่ยังอยู่ในคลัง (คงคลัง) และเล่มที่เบิกใช้ไปแล้ว เรียงตามเลขที่เล่ม
  // เรียงตามตัวเลขจริงที่อยู่หน้าสุดของเลขที่เล่ม (ไม่ใช่เรียงตามตัวอักษร) เพื่อให้ 1, 2, ... 10 เรียงถูกต้อง แม้เลขที่ไม่เติมศูนย์ข้างหน้า (เช่น "บร.1/2569", "บร.10/2569")
  const bookSeq = (numStr) => { const m = String(numStr || '').match(/(\d+)/); return m ? Number(m[1]) : 0; };
  // ทะเบียนใบเสร็จ (manualNumberSuggest): คำนวณ "คำแนะนำ" เลขที่เล่มถัดไปให้ ทับด้วยปีงบประมาณที่เลือก เช่น "บร.1/2570" — ผู้ใช้แก้ไข/เขียนทับได้อย่างอิสระ ไม่ใช่เลขที่บังคับ
  const suggestBookNo = (fyVal) => {
    const digits = cfg.numberDigits ?? 0;
    const prefix = cfg.numberPrefix || '';
    const sameFy = (items || []).filter((it) => Number(it.fy) === Number(fyVal));
    const maxSeq = sameFy.reduce((max, it) => Math.max(max, bookSeq(it[cfg.numberField])), 0);
    return `${prefix}${String(maxSeq + 1).padStart(digits, '0')}/${fyVal}`;
  };
  const inStockBooks = useMemo(
    () => (isStockLedger && items ? items.filter((it) => it[cfg.statusField] === SL.inValue).sort((a, b) => bookSeq(a[cfg.numberField]) - bookSeq(b[cfg.numberField])) : []),
    [items, isStockLedger, SL, cfg],
  );
  const outBooks = useMemo(
    () => (isStockLedger && items ? items.filter((it) => it[cfg.statusField] === SL.outValue).sort((a, b) => bookSeq(a[cfg.numberField]) - bookSeq(b[cfg.numberField])) : []),
    [items, isStockLedger, SL, cfg],
  );
  // ทะเบียนใบเสร็จเท่านั้น: เล่มที่ถูกเจาะปรุทำลายแล้ว (แยกออกจาก "เล่มที่ใช้อยู่")
  const destroyedBooks = useMemo(
    () => (RU && items ? items.filter((it) => it[cfg.statusField] === RU.destroyStatusValue) : []),
    [items, RU, cfg],
  );
  // ดึงเฉพาะตัวเลขจากเลขที่ใบเสร็จ (เผื่อมีเลขศูนย์นำหน้า เช่น "01") เพื่อคำนวณแผ่นที่เหลือ
  const numVal = (s) => parseInt(String(s || '').replace(/\D/g, ''), 10) || 0;
  // ช่วงเลขที่ใบเสร็จที่ยังเหลืออยู่ในเล่ม = ตั้งแต่ (เลขที่ใช้ล่าสุด + 1) หรือเลขที่แรกของเล่มถ้ายังไม่เคยกรอกเลขที่ใช้ล่าสุด จนถึงเลขที่ท้ายเล่ม
  const remainingRangeOf = (it) => {
    const fromBase = numVal(it[SL.numFromKey]);
    const used = it[RU.lastUsedKey] ? numVal(it[RU.lastUsedKey]) : fromBase - 1;
    const from = Math.max(fromBase, used + 1);
    const to = numVal(it[SL.numToKey]);
    return { from, to };
  };
  // รายการใบเสร็จคงเหลือเมื่อปลายปีงบประมาณ (เฉพาะเล่มที่กำลังใช้อยู่และยังมีแผ่นเหลือ)
  const remainingBooks = useMemo(() => {
    if (!RU || !items) return [];
    return outBooks.map((it) => ({ it, ...remainingRangeOf(it) })).filter((r) => r.to >= r.from);
  }, [outBooks, RU, items, SL]);

  // เงื่อนไขแสดงฟิลด์แบบมีตัวเลือก (showIf) เช่น ทะเบียนหนังสือสัญญา: เลือกบุคลากรแทนช่องพิมพ์ชื่อเองเมื่อเป็น "ลูกจ้างชั่วคราว"
  const fieldVisible = (f, values) => !f.showIf || f.showIf(values);

  // ทะเบียนสัญญายืมเงิน: เกินกำหนดส่งใช้ = ยังไม่คืน และวันนี้เกินกำหนดวันส่งใช้แล้ว (สถานะที่ 3 นอกเหนือจาก "ค้างจ่าย"/"คืนแล้ว" ซึ่งเป็นแค่สี ไม่ได้เก็บเป็นฟิลด์แยก)
  const isLoanOverdue = (it) => isLoan && !!it.dueDate && it.repaid !== 'ส่งใช้เงินยืมเรียบร้อย' && it.dueDate < todayStr();

  // ทะเบียนคุมฎีกา: เลือกวิธีเพิ่ม (ปกติ = เลขถัดไป / กำหนดเลขเอง) ก่อนเปิดฟอร์ม
  const [deekaChoice, setDeekaChoice] = useState(null); // {mode, seq}
  const [deekaPlan, setDeekaPlan] = useState({ mode: 'normal', seq: '' });
  const [seqConfirm, setSeqConfirm] = useState(null); // {seq, used, fyVal}
  const seqConfirmedRef = useRef(false);
  const startAdd = () => { if (isDeeka) setDeekaChoice({ mode: 'normal', seq: '' }); else openCreate(); };
  const confirmDeekaChoice = () => {
    if (deekaChoice.mode === 'custom' && !(Number(deekaChoice.seq) >= 1)) { say({ type: 'error', text: 'กรุณากรอกเลขที่ฎีกาที่ต้องการกำหนด' }); return; }
    setDeekaPlan({ mode: deekaChoice.mode, seq: Number(deekaChoice.seq) || '' });
    setDeekaChoice(null);
    openCreate();
  };

  const openCreate = () => {
    setErrors({}); setInsertMode(false); setInsertBase(''); setGenInsertMode(false); setGenInsertBase(''); setJustCreated(null); setOtherOpen({}); setOtherActive({});
    const values = emptyForm(cfg);
    // ทะเบียนควบคุมยานพาหนะ: เติมชื่อผู้ขอใช้รถเป็นผู้ที่กำลังล็อกอินอยู่ให้อัตโนมัติ (แก้ไขเป็นคนอื่นได้ถ้าบันทึกแทนกัน)
    if (isVehicle) values.requester = profile.name || profile.email;
    setForm({ values });
  };
  const openCreateWithPlate = (plate) => {
    openCreate();
    setForm((f) => (f ? { ...f, values: { ...f.values, plate } } : f));
  };
  const openEdit = (it) => {
    const values = {};
    cfg.fields.forEach((f) => { if (!f.auto) values[f.key] = f.type === 'multi-check' ? asList(it[f.key]) : (it[f.key] ?? ''); });
    setErrors({});
    setViewId(null);
    setOtherOpen({});
    setOtherActive({});
    setForm({ id: it.id, number: it[cfg.numberField], values });
  };

  const validate = (values) => {
    const e = {};
    cfg.fields.forEach((f) => {
      if (f.auto) return;
      if (!fieldVisible(f, values)) return; // ฟิลด์ที่ซ่อนอยู่ (showIf ไม่ตรงเงื่อนไข) ไม่ต้องตรวจ required
      if (f.required && (f.type === 'multi-check' ? asList(values[f.key]).length === 0 : !String(values[f.key] || '').trim())) e[f.key] = `กรุณากรอก${f.label}`;
    });
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const values = Object.fromEntries(Object.entries(form.values).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
    // ฟิลด์คำนวณอัตโนมัติ (เช่น มูลค่าตั้งเบิกตามฎีกา) — คำนวณซ้ำจากค่าฟิลด์ต้นทางล่าสุดตอนบันทึกจริง ไม่พึ่งค่าที่โชว์บนจอเฉยๆ
    // ถ้ายังไม่กรอกฟิลด์ต้นทางเลยสักช่อง (เช่น รายการเก่าก่อนอัปเดตที่เคยกรอก "จำนวนเงิน" ไว้ตรงๆ) จะไม่คำนวณทับ เพื่อไม่ให้ค่าที่เคยบันทึกไว้หายไปโดยไม่ตั้งใจ
    cfg.fields.forEach((f) => {
      if (f.type !== 'computed') return;
      const hasAny = f.computeFrom.some((k) => String(values[k] ?? '').trim() !== '');
      if (hasAny) values[f.key] = String(f.computeFrom.reduce((s, k) => s + (Number(values[k]) || 0), 0));
    });
    // หนังสือรับ: วันที่/เวลารับ เป็นค่าที่ระบบกำหนดอัตโนมัติตามเวลาจริงตอนกดบันทึก (เฉพาะตอนเพิ่มใหม่ แก้ไขรายการเดิมไม่แตะค่านี้)
    if (isIncoming && !form.id) {
      values.receiveDate = todayStr();
      values.receiveTime = nowTimeStr();
    }
    // ทะเบียนสัญญายืมเงิน: สถานะเริ่มต้นเสมอว่า "ค้างจ่าย" ตอนสร้างใหม่ (แก้ไขผ่านปุ่มคืนเงินยืมเท่านั้น ไม่ใช่ฟอร์มแก้ไขทั่วไป)
    if (isLoan && !form.id) {
      values.repaid = 'สัญญาค้างจ่ายเงินยืม';
    }
    // ฎีกาเบิกจ่ายใหม่: เริ่มสถานะ "ค้างจ่าย"/"ค้างส่ง" เสมอ เปลี่ยนเป็นจ่ายแล้ว/ส่งแล้วได้ผ่านปุ่มท้ายแถวเท่านั้น (ดู openPayAction/submitPayAction)
    if (isDeeka && !form.id) {
      values.chequeStatus = 'ค้างจ่าย';
      values.taxStatus = 'ค้างส่ง';
      values.ssoStatus = 'ค้างจ่าย';
    }
    // แก้ไขฎีกาเก่าแล้วเพิ่มยอดหักประกันสังคมทีหลัง: ตั้งสถานะ "ค้างจ่าย" ให้ เพื่อให้ระบบแจ้งเตือนสิ้นเดือนนับรายการนี้ด้วย
    if (isDeeka && form.id && Number(values.ssoAmount) > 0) {
      const oldRec = items.find((x) => x.id === form.id);
      if (!oldRec?.ssoStatus) values.ssoStatus = 'ค้างจ่าย';
    }
    // คำขอใช้รถใหม่: บันทึกอีเมลผู้ขอไว้ (ไม่ได้อยู่ในฟอร์มที่แก้ไขเองได้) ใช้เช็กสิทธิ์ "ยกเลิกคำขอของตัวเอง" ภายหลัง
    if (isVehicle && !form.id) {
      values.requesterEmail = profile.email;
    }
    // ตำแหน่งของผู้ขอใช้รถ (ที่เลือกจากรายชื่อเจ้าหน้าที่) — เก็บติดไปกับคำขอ เพื่อใช้ออกรายงาน/แบบ 3 โดยไม่ต้องไปค้นทำเนียบทุกครั้ง
    if (isVehicle) {
      const who = (people || []).find((p) => p.name === values.requester);
      if (who) values.requesterPosition = who.position || '';
    }
    const e = validate(values);
    setErrors(e);
    if (Object.keys(e).length) return;
    // คำนวณระยะทางครั้งนี้ = เลขไมล์ปัจจุบัน − เลขไมล์ครั้งก่อน (เฉพาะรถยนต์ที่กรอกเลขไมล์ปัจจุบัน)
    if (isVehicle) {
      const oldRec = form.id ? items.find((x) => x.id === form.id) : null;
      const isCar = String(values.plate || '').startsWith(VEHICLE_TYPES[0]);
      const curTxt = String(values.odoCurrent ?? '').trim();
      if (isCar && curTxt !== '') {
        const prev = await computePrevOdo(values.plate, form.id);
        if (prev !== null && Number(curTxt) < prev) { say({ type: 'error', text: `เลขไมล์ปัจจุบันต้องไม่น้อยกว่าเลขไมล์ครั้งก่อน (${prev.toLocaleString('th-TH')} กม.)` }); return; }
        values.odoCurrent = curTxt;
        values.odoPrev = prev !== null ? String(prev) : '';
        values.distance = prev !== null ? String(Number(curTxt) - prev) : '';
      } else {
        values.odoCurrent = '';
        if (oldRec?.odoCurrent) { values.odoPrev = ''; values.distance = ''; }
      }
    }
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
        } else if (isDeeka && deekaPlan.mode === 'custom') {
          const seq = Number(deekaPlan.seq);
          const chk = await checkSeqUsed({ collectionName: cfg.key, numberField: cfg.numberField, fyVal, seq });
          if (seq > chk.max + 1) { say({ type: 'error', text: `เลขที่ฎีกาสูงสุดตอนนี้คือ ${chk.max} กำหนดได้ไม่เกิน ${chk.max + 1}` }); setSaving(false); return; }
          if (chk.used && !seqConfirmedRef.current) { setSeqConfirm({ seq, used: chk.used, fyVal }); setSaving(false); return; }
          seqConfirmedRef.current = false;
          let shifted;
          ({ id, number, shifted } = await createNumberedAtSeq({
            collectionName: cfg.key, numberField: cfg.numberField, fyVal, seq,
            data: { ...values, fy: fyVal, attachments: [] },
            prefixOverride: cfg.numberPrefix, digitsOverride: cfg.numberDigits,
          }));
          if (shifted.length) await writeAudit({ action: 'update', module: cfg.key, docId: 'renumber', label: `เลื่อนเลขที่${cfg.numberLabel} ปีงบ ${fyVal}`, after: { changes: shifted.join(', ') } });
        } else if (canInsertNumber && genInsertMode) {
          if (!genInsertBase) { setErrors({ ...e, insertBase: `กรุณาเลือก${cfg.numberLabel}เดิมที่จะแทรก` }); setSaving(false); return; }
          ({ id, number } = await insertRegNumbered({
            collectionName: cfg.key, numberField: cfg.numberField, baseNumber: genInsertBase,
            data: { ...values, fy: fyVal, attachments: [] },
          }));
        } else {
          ({ id, number } = await createNumbered({
            collectionName: cfg.key, numberField: cfg.numberField, dateStr: values[cfg.dateField],
            data: { ...values, fy: fyVal, attachments: [] },
            prefixOverride: cfg.numberPrefix, digitsOverride: cfg.numberDigits,
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

  // ลบรายการ — สำหรับทะเบียนที่กำหนด renumberOnDelete: true (เช่น ทะเบียนใบเสร็จ) หลังลบจะเรียงเลขที่ของเล่มที่เหลือในปีงบเดียวกันใหม่ทั้งหมด
  // ให้ต่อเนื่องตามจริง (ไม่เหลือช่องว่างจากเล่มที่ถูกลบ) พร้อมปรับตัวนับ (counters) ให้ตรงกับจำนวนเล่มที่เหลือจริง เพื่อไม่ให้เล่มถัดไปที่เพิ่มออกเลขที่ซ้ำ/เว้นช่วง
  const doDelete = async () => {
    const it = toDelete;
    setDeleting(true);
    try {
      for (const a of it.attachments || []) await deleteObject(ref(storage, a.path)).catch(() => {});
      await deleteDoc(doc(db, cfg.key, it.id));
      const snapshot = {};
      cfg.fields.forEach((f) => { snapshot[f.key] = it[f.key] ?? ''; });
      await writeAudit({ action: 'delete', module: cfg.key, docId: it.id, label: it[cfg.numberField], before: snapshot });

      if (cfg.renumberOnDelete) {
        const remaining = (items || [])
          .filter((x) => x.id !== it.id && x.fy === it.fy)
          .sort((a, b) => bookSeq(a[cfg.numberField]) - bookSeq(b[cfg.numberField]));
        const numCfg = await getNumbering();
        const digits = cfg.numberDigits ?? numCfg.digits;
        const prefix = cfg.numberPrefix ?? (numCfg.prefixes?.[cfg.key] || '');
        const yr = numCfg.era === 'CE' ? it.fy - 543 : it.fy;
        const batch = writeBatch(db);
        const renameLog = [];
        remaining.forEach((r, idx) => {
          const newNumber = formatNumber(idx + 1, digits, yr, prefix);
          if (newNumber !== r[cfg.numberField]) {
            batch.update(doc(db, cfg.key, r.id), { [cfg.numberField]: newNumber });
            renameLog.push(`${r[cfg.numberField]} → ${newNumber}`);
          }
        });
        batch.set(doc(db, 'counters', `${cfg.key}_${yr}`), { last: remaining.length, updatedAt: serverTimestamp() });
        await batch.commit();
        if (renameLog.length) {
          await writeAudit({ action: 'update', module: cfg.key, docId: 'renumber', label: `เรียงเลขที่${cfg.numberLabel}ใหม่ ปีงบ ${it.fy}`, after: { changes: renameLog.join(', ') } });
          say({ type: 'ok', text: `ลบข้อมูลแล้ว และเรียงเลขที่${cfg.numberLabel}ที่เหลือใหม่แล้ว (${renameLog.length} เล่ม)` });
        } else {
          say({ type: 'ok', text: 'ลบข้อมูลแล้ว' });
        }
      } else {
        say({ type: 'ok', text: 'ลบข้อมูลแล้ว' });
      }
      setToDelete(null);
      setViewId(null);
    } catch (err) {
      say({ type: 'error', text: 'ลบไม่สำเร็จ: ' + (err.code || err.message) });
    } finally {
      setDeleting(false);
    }
  };

  // ===== ทะเบียนสัญญายืมเงิน: บันทึกการคืนเงินยืม (แทนทะเบียนคืนเงินยืมแยกเดิม) =====
  const openRepay = (it) => { setRepayForm({ date: todayStr(), method: 'ฎีกา', amount: it.amount || '', dikaList: [''] }); setRepayItem(it); };
  const submitRepay = async () => {
    if (!repayForm.date) { say({ type: 'error', text: 'กรุณาเลือกวันที่ส่งใช้เงินยืม' }); return; }
    if (!String(repayForm.amount || '').trim()) { say({ type: 'error', text: 'กรุณากรอกจำนวนเงินส่งใช้' }); return; }
    const dikaList = repayForm.dikaList.map((d) => d.trim()).filter(Boolean);
    setRepaySaving(true);
    try {
      const after = {
        repaid: 'ส่งใช้เงินยืมเรียบร้อย',
        repayDate: repayForm.date,
        repayMethod: repayForm.method,
        repayAmount: String(repayForm.amount).trim(),
        repayDika: repayForm.method === 'ฎีกา' ? dikaList.join(', ') : '',
      };
      await updateDoc(doc(db, cfg.key, repayItem.id), { ...after, updatedAt: serverTimestamp(), updatedBy: profile.email });
      await writeAudit({ action: 'update', module: cfg.key, docId: repayItem.id, label: repayItem[cfg.numberField], after });
      say({ type: 'ok', text: 'บันทึกการคืนเงินยืมแล้ว' });
      setRepayItem(null);
    } catch (err) {
      say({ type: 'error', text: 'บันทึกไม่สำเร็จ: ' + (err.code || err.message) });
    } finally {
      setRepaySaving(false);
    }
  };

  // ===== ทะเบียนสัญญายืมเงิน: ขอขยายเวลาส่งใช้เงินยืม (แก้ไขกำหนดวันส่งใช้) =====
  const [extendItem, setExtendItem] = useState(null);
  const [extendDate, setExtendDate] = useState('');
  const [extendSaving, setExtendSaving] = useState(false);
  const openExtend = (it) => { setExtendDate(it.dueDate || todayStr()); setExtendItem(it); };
  const submitExtend = async () => {
    if (!extendDate) { say({ type: 'error', text: 'กรุณาเลือกวันที่กำหนดส่งใช้ใหม่' }); return; }
    setExtendSaving(true);
    try {
      const after = { dueDate: extendDate };
      await updateDoc(doc(db, cfg.key, extendItem.id), { ...after, updatedAt: serverTimestamp(), updatedBy: profile.email });
      await writeAudit({ action: 'update', module: cfg.key, docId: extendItem.id, label: extendItem[cfg.numberField], after: { dueDate: `${extendItem.dueDate || '-'} → ${extendDate}` } });
      say({ type: 'ok', text: 'บันทึกการขยายเวลาส่งใช้เงินยืมแล้ว' });
      setExtendItem(null);
    } catch (err) {
      say({ type: 'error', text: 'บันทึกไม่สำเร็จ: ' + (err.code || err.message) });
    } finally {
      setExtendSaving(false);
    }
  };

  // ===== ทะเบียนคุมฎีกาเบิกจ่าย: บันทึกการชำระเช็ค / การส่งภาษีหัก ณ ที่จ่ายให้สรรพากร (แยกกันคนละสถานะคนละปุ่ม ใช้ modal เดียวกันสลับตาม kind) =====
  const PAY_CHEQUE_KEY = { cheque: 'chequeNo', tax: 'taxChequeNo', sso: 'ssoChequeNo' };
  const [payActionChequeNo, setPayActionChequeNo] = useState('');
  const openPayAction = (it, kind) => { setPayActionDate(todayStr()); setPayActionChequeNo(String(it[PAY_CHEQUE_KEY[kind]] || '')); setPayAction({ item: it, kind }); };
  const submitPayAction = async () => {
    if (!payActionDate) { say({ type: 'error', text: 'กรุณาเลือกวันที่' }); return; }
    const { item, kind } = payAction;
    const chequeNo = payActionChequeNo.trim();
    const after = kind === 'cheque'
      ? { chequeStatus: 'จ่ายแล้ว', chequePaidDate: payActionDate, chequeNo }
      : kind === 'tax'
        ? { taxStatus: 'ส่งสรรพากรแล้ว', taxPaidDate: payActionDate, taxChequeNo: chequeNo }
        : { ssoStatus: 'จ่ายแล้ว', ssoPaidDate: payActionDate, ssoChequeNo: chequeNo };
    setPayActionSaving(true);
    try {
      await updateDoc(doc(db, cfg.key, item.id), { ...after, updatedAt: serverTimestamp(), updatedBy: profile.email });
      await writeAudit({ action: 'update', module: cfg.key, docId: item.id, label: item[cfg.numberField], after });
      say({ type: 'ok', text: kind === 'cheque' ? 'บันทึกการจ่ายเช็คแล้ว' : kind === 'tax' ? 'บันทึกการส่งภาษีสรรพากรแล้ว' : 'บันทึกการจ่ายประกันสังคมแล้ว' });
      setPayAction(null);
    } catch (err) {
      say({ type: 'error', text: 'บันทึกไม่สำเร็จ: ' + (err.code || err.message) });
    } finally {
      setPayActionSaving(false);
    }
  };

  // ===== ทะเบียนคุมคลังแบบรายเล่ม (เล่มเช็ค/เล่มใบเสร็จ): เพิ่มเล่มเข้าคลัง → สร้างเอกสารใหม่ 1 เล่ม / เบิกออก → อัปเดตเอกสารเล่มเดิม (คลิกที่เล่มในแดชบอร์ด) =====
  const openStockIn = () => {
    const extra = {}; (SL.extraInFields || []).forEach((f) => { extra[f.key] = ''; });
    const bookNo = cfg.manualNumber ? (cfg.manualNumberSuggest ? suggestBookNo(fy) : '') : '';
    setSlForm({ date: todayStr(), source: '', numFrom: SL.defaultNumFrom || '', numTo: SL.defaultNumTo || '', fy: String(fy), bookNo, ...extra });
    setStockModal('in');
  };
  // เปลี่ยนปีงบประมาณของเล่มในฟอร์ม "เพิ่มเล่มเข้าคลัง" — ถ้าเป็นทะเบียนที่มีคำแนะนำเลขที่เล่ม (manualNumberSuggest) ให้คำนวณคำแนะนำใหม่ตามปีงบที่เลือก
  const onStockInFyChange = (newFy) => {
    setSlForm((f) => ({ ...f, fy: newFy, bookNo: cfg.manualNumber && cfg.manualNumberSuggest ? suggestBookNo(newFy) : f.bookNo }));
  };
  const openWithdraw = (it) => { setSlForm({ date: todayStr(), requester: SL.defaultRequester || '', requesterPosition: SL.defaultRequesterPosition || '' }); setWithdrawItem(it); setStockModal('out'); };

  const submitStockIn = async () => {
    if (!slForm.source || !String(slForm.numFrom).trim() || !String(slForm.numTo).trim()) { say({ type: 'error', text: 'กรุณากรอกข้อมูลให้ครบ' }); return; }
    if (cfg.manualNumber && !String(slForm.bookNo || '').trim()) { say({ type: 'error', text: `กรุณากรอก${cfg.numberLabel || 'เลขที่เล่ม'}` }); return; }
    setSlSaving(true);
    try {
      const extra = {}; (SL.extraInFields || []).forEach((f) => { extra[f.key] = String(slForm[f.key] || '').trim(); });
      const values = {
        [cfg.dateField]: slForm.date,
        [cfg.statusField]: SL.inValue,
        [SL.sourceKey]: slForm.source,
        [SL.numFromKey]: slForm.numFrom.trim(),
        [SL.numToKey]: slForm.numTo.trim(),
        ...(SL.fixedAccountNoKey ? { [SL.fixedAccountNoKey]: SL.fixedAccountNo } : {}),
        ...(SL.fixedAccountNameKey ? { [SL.fixedAccountNameKey]: SL.fixedAccountName } : {}),
        ...extra,
        note: '',
      };
      // ถ้าเลือกปีงบประมาณของเล่มเองได้ (fySelectable) ใช้ปีงบที่เลือกเป็นตัวกำหนดปีงบของรายการ (เพื่อให้เล่มไปโชว์ในทะเบียนของปีงบนั้น) แทนการคำนวณจากวันที่รับเข้าอัตโนมัติ
      const fyVal = SL.fySelectable ? Number(slForm.fy) : fiscalYearBE(values[cfg.dateField]);
      let id, number;
      if (cfg.manualNumber) {
        // ยกเลิกระบบรันเลขที่อัตโนมัติ (createNumbered) สำหรับทะเบียนนี้ตามที่แจ้ง — ผู้ใช้กำหนดเลขที่เล่มเอง บันทึกตรงโดยไม่ผ่านตัวนับ counters
        number = String(slForm.bookNo).trim();
        const ref = await addDoc(collection(db, cfg.key), {
          ...values,
          [cfg.numberField]: number,
          fy: fyVal,
          attachments: [],
          createdAt: serverTimestamp(),
          createdBy: (profile.email || '').toLowerCase(),
        });
        id = ref.id;
      } else {
        const numberingDateStr = SL.fySelectable ? `${fyVal - 543}-01-01` : values[cfg.dateField];
        ({ id, number } = await createNumbered({
          collectionName: cfg.key, numberField: cfg.numberField, dateStr: numberingDateStr,
          data: { ...values, fy: fyVal, attachments: [] },
          prefixOverride: cfg.numberPrefix, digitsOverride: cfg.numberDigits,
        }));
      }
      await writeAudit({ action: 'create', module: cfg.key, docId: id, label: number, after: values });
      say({ type: 'ok', text: `บันทึกรับเล่มที่ ${number} เข้าคลังแล้ว` + (fyVal !== fy ? ` (อยู่ในปีงบประมาณ ${fyVal})` : '') });
      const extraReset = {}; (SL.extraInFields || []).forEach((f) => { extraReset[f.key] = ''; });
      const nextBookNo = cfg.manualNumber ? (cfg.manualNumberSuggest ? suggestBookNo(fyVal) : '') : slForm.bookNo;
      setSlForm({ ...slForm, numFrom: SL.defaultNumFrom || '', numTo: SL.defaultNumTo || '', bookNo: nextBookNo, ...extraReset });
    } catch (err) {
      say({ type: 'error', text: 'บันทึกไม่สำเร็จ: ' + (err.code || err.message) });
    } finally {
      setSlSaving(false);
    }
  };

  const submitWithdraw = async () => {
    if (!String(slForm.requester || '').trim()) { say({ type: 'error', text: 'กรุณากรอกผู้เบิก' }); return; }
    setSlSaving(true);
    try {
      const after = {
        [cfg.statusField]: SL.outValue,
        [SL.dateOutKey]: slForm.date,
        [SL.requesterKey]: slForm.requester.trim(),
        [SL.requesterPositionKey]: (slForm.requesterPosition || '').trim(),
      };
      await updateDoc(doc(db, cfg.key, withdrawItem.id), { ...after, updatedAt: serverTimestamp(), updatedBy: profile.email });
      await writeAudit({ action: 'update', module: cfg.key, docId: withdrawItem.id, label: withdrawItem[cfg.numberField], after });
      say({ type: 'ok', text: `บันทึกเบิกเล่มที่ ${withdrawItem[cfg.numberField]} ออกจากคลังแล้ว` });
      setStockModal(null);
      setWithdrawItem(null);
    } catch (err) {
      say({ type: 'error', text: 'บันทึกไม่สำเร็จ: ' + (err.code || err.message) });
    } finally {
      setSlSaving(false);
    }
  };

  // ===== ทะเบียนใบเสร็จเท่านั้น: บันทึกเลขที่ใช้ล่าสุด (เจ้าหน้าที่กรอกเองเป็นระยะ ไม่มีระบบตัดอัตโนมัติ) ใช้คำนวณแผ่นที่เหลือ =====
  const openUsage = (it) => { setUsageForm({ lastUsedNo: it[RU.lastUsedKey] || '' }); setUsageItem(it); };
  const submitUsage = async () => {
    setUsageSaving(true);
    try {
      const after = { [RU.lastUsedKey]: String(usageForm.lastUsedNo || '').trim() };
      await updateDoc(doc(db, cfg.key, usageItem.id), { ...after, updatedAt: serverTimestamp(), updatedBy: profile.email });
      await writeAudit({ action: 'update', module: cfg.key, docId: usageItem.id, label: usageItem[cfg.numberField], after });
      say({ type: 'ok', text: `บันทึกเลขที่ใช้ล่าสุดของเล่ม ${usageItem[cfg.numberField]} แล้ว` });
      setUsageItem(null);
    } catch (err) {
      say({ type: 'error', text: 'บันทึกไม่สำเร็จ: ' + (err.code || err.message) });
    } finally {
      setUsageSaving(false);
    }
  };

  // ===== ทะเบียนใบเสร็จเท่านั้น: เจาะปรุทำลายใบเสร็จคงเหลือปลายปีงบประมาณ — เปลี่ยนสถานะเล่มเป็น "ทำลายแล้ว" บันทึกช่วงเลขที่ที่ทำลายและวันที่นำส่ง อบจ.สกลนคร =====
  const openDestroy = (it) => {
    const { from, to } = remainingRangeOf(it);
    setDestroyForm({ date: todayStr(), from: String(from), to: String(to), sentDate: todayStr() });
    setDestroyItem(it);
  };
  const submitDestroy = async () => {
    if (!String(destroyForm.from || '').trim() || !String(destroyForm.to || '').trim()) { say({ type: 'error', text: 'กรุณากรอกช่วงเลขที่ที่ทำลาย' }); return; }
    setDestroySaving(true);
    try {
      const after = {
        [cfg.statusField]: RU.destroyStatusValue,
        [RU.destroyDateKey]: destroyForm.date,
        [RU.destroyFromKey]: destroyForm.from.trim(),
        [RU.destroyToKey]: destroyForm.to.trim(),
        [RU.destroySentDateKey]: destroyForm.sentDate,
      };
      await updateDoc(doc(db, cfg.key, destroyItem.id), { ...after, updatedAt: serverTimestamp(), updatedBy: profile.email });
      await writeAudit({ action: 'update', module: cfg.key, docId: destroyItem.id, label: destroyItem[cfg.numberField], after });
      say({ type: 'ok', text: `บันทึกเจาะปรุทำลายเล่มที่ ${destroyItem[cfg.numberField]} แล้ว (เลขที่ ${destroyForm.from}-${destroyForm.to})` });
      setDestroyItem(null);
    } catch (err) {
      say({ type: 'error', text: 'บันทึกไม่สำเร็จ: ' + (err.code || err.message) });
    } finally {
      setDestroySaving(false);
    }
  };

  const exportRows = () =>
    filtered.map((it) => {
      const r = {};
      cfg.fields.forEach((f) => { r[f.label] = f.type === 'date' ? fmtDate(it[f.key]).replace('-', '') : f.type === 'multi-check' ? missionLines(it).join(' | ') : it[f.key] || ''; });
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

  // ปุ่มกลับหน้ารวม — แสดงเฉพาะทะเบียนที่อยู่ในกลุ่ม "ทะเบียนประกอบฎีกาและทะเบียนต่างๆ" (REGISTRY_LINKS)
  const isHubRegistry = REGISTRY_LINKS.some((r) => r.key === cfg.key);

  return (
    <div className="mx-auto max-w-7xl p-4 lg:p-6">
      {isHubRegistry && (
        <Link to="/registries" className="mb-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 hover:text-brand-900">
          <ArrowLeft className="h-4 w-4" /> กลับหน้ารวมทะเบียน
        </Link>
      )}
      <PageHeader
        emoji={cfg.emoji} title={cfg.title}
        subtitle={`ปีงบประมาณ ${fy} · ${items ? `${filtered.length} จาก ${items.length} รายการ` : 'กำลังโหลด'}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <button className="btn bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25" onClick={() => doExport('csv')}><Download className="h-4 w-4" /> CSV</button>
            <button className="btn bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25" onClick={doReportExcel} disabled={reporting} title="ออกรายงาน Excel รูปแบบทะเบียนราชการ">{reporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Excel</button>
            <button className="btn bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25" onClick={openReportPdf} title="เปิดหน้าพิมพ์รายงาน แล้วเลือก บันทึกเป็น PDF"><Printer className="h-4 w-4" /> PDF</button>
            {writable && isStockLedger && (
              <button className="btn bg-white text-brand-800 hover:bg-brand-50" onClick={openStockIn}><Plus className="h-4 w-4" /> เพิ่มเล่มเข้าคลัง</button>
            )}
            {isVehicle && (
              <Link to="/vehicle-report" className="btn bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25"><FileSpreadsheet className="h-4 w-4" /> รายงานผู้บริหาร</Link>
            )}
            {writable && !isStockLedger && <button className="btn bg-white text-brand-800 hover:bg-brand-50" onClick={startAdd}><Plus className="h-4 w-4" /> {cfg.addLabel || `เพิ่ม${cfg.noun}`}</button>}
          </div>
        }
      />

      {isStockLedger && items && (
        <div className="card mb-4 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1">
            <span className="flex items-center gap-1.5"><span className="font-semibold text-slate-700">คงเหลือในคลัง:</span> <span className="text-xl font-bold text-emerald-700">{inStockBooks.length}</span> {SL.unitLabel}</span>
            <span className="flex items-center gap-1.5"><span className="font-semibold text-slate-700">{RU ? 'เล่มที่ใช้อยู่' : 'เบิกใช้แล้ว'}:</span> <span className="text-xl font-bold text-orange-700">{outBooks.length}</span> {SL.unitLabel}</span>
            {RU && <span className="flex items-center gap-1.5"><span className="font-semibold text-slate-700">ทำลายแล้ว:</span> <span className="text-xl font-bold text-slate-500">{destroyedBooks.length}</span> {SL.unitLabel}</span>}
            {RU && (
              <button type="button" className="btn btn-outline ml-auto !py-1.5 text-sm" onClick={() => setShowRemainReport(true)}>
                <FileSpreadsheet className="h-4 w-4" /> ใบเสร็จคงเหลือเมื่อปลายปีงบประมาณ
              </button>
            )}
          </div>

          {RU ? (
            // แดชบอร์ดทะเบียนใบเสร็จ: แสดงเป็นรายการแนวตั้ง (ไม่ใช่ชิปไหลต่อกัน) เพื่อให้เห็นจำนวนเล่มในคลังชัดเจน แยกฝั่งจากเล่มที่กำลังใช้อยู่
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-1.5 text-sm font-medium text-slate-600">เล่มในคลัง ({inStockBooks.length} เล่ม)</p>
                <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {inStockBooks.length === 0 && <div className="p-3 text-sm text-slate-400">ไม่มีเล่มคงคลัง</div>}
                  {inStockBooks.map((it) => (
                    <div key={it.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <div>
                        <div className="font-semibold text-emerald-800">เล่ม {it[cfg.numberField]}</div>
                        <div className="text-xs text-slate-500">เลขที่ {it[SL.numFromKey]}-{it[SL.numToKey]}</div>
                      </div>
                      {writable && (
                        <button type="button" className="btn btn-outline !py-1 !px-2.5 text-xs text-emerald-700" onClick={() => openWithdraw(it)}>เบิกออกใช้</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-sm font-medium text-slate-600">เล่มที่ใช้อยู่ ({outBooks.length} เล่ม)</p>
                <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {outBooks.length === 0 && <div className="p-3 text-sm text-slate-400">ยังไม่มีเล่มที่เบิกใช้</div>}
                  {outBooks.map((it) => {
                    const r = remainingRangeOf(it);
                    const remain = Math.max(0, r.to - r.from + 1);
                    return (
                      <div key={it.id} className="flex items-center justify-between gap-2 px-3 py-2">
                        <div>
                          <div className="font-semibold text-orange-800">เล่ม {it[cfg.numberField]}</div>
                          <div className="text-xs text-slate-500">เลขที่ {it[SL.numFromKey]}-{it[SL.numToKey]} · ใช้ล่าสุดถึงเลขที่ {it[RU.lastUsedKey] || '-'} · เหลือ {remain} แผ่น</div>
                        </div>
                        {writable && (
                          <div className="flex shrink-0 gap-1">
                            <button type="button" className="btn btn-outline !py-1 !px-2.5 text-xs text-slate-600" onClick={() => openUsage(it)}>บันทึกเลขที่ใช้ล่าสุด</button>
                            {remain > 0 && <button type="button" className="btn btn-outline !py-1 !px-2.5 text-xs text-red-700" onClick={() => openDestroy(it)}>เจาะปรุทำลาย</button>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-sm font-medium text-slate-600">เล่มในคลัง {writable && '(คลิกที่เล่มเพื่อเบิกออกใช้)'}</p>
                <div className="flex flex-wrap gap-1.5">
                  {inStockBooks.length === 0 && <span className="text-sm text-slate-400">ไม่มีเล่มคงคลัง</span>}
                  {inStockBooks.map((it) => (
                    <button
                      key={it.id}
                      type="button"
                      disabled={!writable}
                      onClick={() => openWithdraw(it)}
                      title={writable ? `คลิกเพื่อเบิกเล่มที่ ${it[cfg.numberField]} ออกจากคลัง` : undefined}
                      className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-200 disabled:cursor-default disabled:hover:bg-emerald-100"
                    >
                      เล่ม {it[cfg.numberField]} ({it[SL.numFromKey]}-{it[SL.numToKey]})
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-sm font-medium text-slate-600">เล่มที่เบิกใช้แล้ว</p>
                <div className="flex flex-wrap gap-1.5">
                  {outBooks.length === 0 && <span className="text-sm text-slate-400">ยังไม่มีเล่มที่เบิกใช้</span>}
                  {outBooks.map((it) => (
                    <span key={it.id} className="rounded-full bg-orange-100 px-3 py-1 text-sm font-semibold text-orange-800">
                      เล่ม {it[cfg.numberField]} ({it[SL.numFromKey]}-{it[SL.numToKey]})
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

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
        <select className="input" value={yearBE} onChange={(e) => setYearBE(e.target.value)} aria-label="ปี พ.ศ.">
          <option value="">ทุกปี (พ.ศ.)</option>
          {yearOptions.map((y) => <option key={y} value={y}>พ.ศ. {y}</option>)}
        </select>
      </div>

      {isDeeka && items && items.length > 0 && <DeekaSummary items={items} filtered={filtered} month={month} yearBE={yearBE} fy={fy} />}

      <div className="card overflow-hidden">
        {error ? <ErrorState message={error} onRetry={() => setReload((n) => n + 1)} />
          : items === null ? <Spinner />
          : items.length === 0 ? (
            <EmptyState title={`ยังไม่มี${cfg.noun}ในปีงบประมาณ ${fy}`} hint={writable ? `กด "${cfg.addLabel || `เพิ่ม${cfg.noun}`}" เพื่อเริ่มบันทึก` : undefined} />
          ) : filtered.length === 0 ? (
            <EmptyState title="ไม่พบรายการที่ตรงกับเงื่อนไข" hint="ลองเปลี่ยนคำค้นหาหรือตัวกรอง" />
          ) : (
            <div className="overflow-x-auto">
              <table className={`w-full text-left ${isDeeka ? 'min-w-[1100px] [&_td]:border [&_td]:border-slate-200 [&_th]:border [&_th]:border-slate-300' : 'min-w-[720px]'}`}>
                <thead className="bg-slate-100 text-sm text-slate-600">
                  <tr>
                    {listFields.map((f) => <th key={f.key} className="px-3 py-2 font-semibold">{f.label}</th>)}
                    {isLoan && <th className="px-3 py-2 text-center font-semibold">กำหนดส่งใช้ / การคืนเงินยืม</th>}
                    {isDeeka && <th className="px-3 py-2 text-center font-semibold">การชำระเช็ค / ส่งภาษีสรรพากร</th>}
                    {isVehicle && <th className="px-3 py-2 text-center font-semibold">การอนุมัติ</th>}
                    <th className="px-3 py-2 text-center font-semibold">ไฟล์</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((it) => (
                    <tr key={it.id} className={`cursor-pointer border-t border-slate-100 hover:bg-brand-50/60 ${isDeeka ? 'odd:bg-white even:bg-slate-50/70' : ''}`} onClick={() => setViewId(it.id)}>
                      {listFields.map((f) => (
                        <td key={f.key} className={`px-3 py-2 align-top ${isDeeka && f.key === 'subject' ? 'min-w-[20rem] text-base leading-relaxed' : f.key === 'subject' ? 'max-w-xs' : ''} ${isDeeka && (f.type === 'number' || f.type === 'computed') ? 'whitespace-nowrap text-right font-semibold tabular-nums' : ''}`}>
                          {f.key === cfg.statusField ? (
                            isLoanOverdue(it) ? <Badge className="bg-red-600 text-white">เกินกำหนดส่งใช้เงินยืม</Badge> : <Badge className={cfg.statusColors[it[f.key]]}>{it[f.key]}</Badge>
                          )
                            : isDeeka && f.key === 'chequeStatus' ? (
                              <Badge className={it.chequeStatus === 'จ่ายแล้ว' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 font-bold text-red-700'}>{it.chequeStatus || 'ค้างจ่าย'}</Badge>
                            )
                            : isDeeka && f.key === 'taxStatus' ? (
                              hasNoTax(it) ? (
                                <Badge className="bg-emerald-100 text-emerald-800">ไม่มียอดหัก</Badge>
                              ) : (
                                <Badge className={it.taxStatus === 'ส่งสรรพากรแล้ว' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 font-bold text-red-700'}>{it.taxStatus || 'ค้างส่ง'}</Badge>
                              )
                            )
                            : f.key === cfg.numberField ? <span className="font-semibold text-brand-800">{it[f.key]}</span>
                            : <span className={f.key === 'subject' && !isDeeka ? 'line-clamp-2' : f.key === 'subject' ? 'whitespace-pre-wrap' : ''}>{display(f, it[f.key], it)}</span>}
                        </td>
                      ))}
                      {isLoan && (
                        <td className="px-3 py-2 text-center align-top" onClick={(e) => e.stopPropagation()}>
                          {it.repaid === 'ส่งใช้เงินยืมเรียบร้อย' ? (
                            <span className="text-xs text-emerald-700">คืนแล้ว {fmtDate(it.repayDate)}</span>
                          ) : (
                            <div className="flex flex-col items-center gap-1">
                              {it.dueDate && <span className="text-xs text-slate-500">กำหนด {fmtDate(it.dueDate)}</span>}
                              {isLoanOverdue(it) ? (
                                <Badge className="bg-red-600 text-white">เกินกำหนดส่งใช้เงินยืม</Badge>
                              ) : (
                                <span className="text-xs text-amber-700">สัญญาค้างจ่ายเงินยืม</span>
                              )}
                              {writable && (
                                <div className="flex gap-1">
                                  <button className="btn btn-outline !py-1 !px-2 text-xs text-red-700" onClick={() => openRepay(it)}><Plus className="h-3.5 w-3.5" /> คืนเงินยืม</button>
                                  <button className="btn btn-outline !py-1 !px-2 text-xs text-slate-600" onClick={() => openExtend(it)}>ขอขยายเวลา</button>
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      )}
                      {isDeeka && (
                        <td className="px-3 py-2 text-center align-top" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-col items-center gap-1.5">
                            <div className="flex items-center gap-1.5">
                              {it.chequeStatus === 'จ่ายแล้ว' ? (
                                <span className="text-xs text-emerald-700">จ่ายเช็คแล้ว {fmtDate(it.chequePaidDate)}</span>
                              ) : (
                                <>
                                  <span className="text-xs font-bold text-red-600">ค้างจ่ายเช็ค</span>
                                  {writable && <button className="btn btn-outline !py-1 !px-2 text-xs text-red-700" onClick={() => openPayAction(it, 'cheque')}>ชำระเช็ค</button>}
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              {hasNoTax(it) ? (
                                <span className="text-xs text-emerald-700">ไม่มียอดหัก</span>
                              ) : it.taxStatus === 'ส่งสรรพากรแล้ว' ? (
                                <span className="text-xs text-emerald-700">ส่งสรรพากรแล้ว {fmtDate(it.taxPaidDate)}</span>
                              ) : (
                                <>
                                  <span className="text-xs font-bold text-red-600">ค้างส่งภาษี</span>
                                  {writable && <button className="btn btn-outline !py-1 !px-2 text-xs text-red-700" onClick={() => openPayAction(it, 'tax')}>ส่งสรรพากร</button>}
                                </>
                              )}
                            </div>
                            {!hasNoSso(it) && (
                              <div className="flex items-center gap-1.5">
                                {it.ssoStatus === 'จ่ายแล้ว' ? (
                                  <span className="text-xs text-emerald-700">จ่ายประกันสังคมแล้ว {fmtDate(it.ssoPaidDate)}</span>
                                ) : (
                                  <>
                                    <span className="text-xs font-bold text-red-600">ค้างจ่ายประกันสังคม</span>
                                    {writable && <button className="btn btn-outline !py-1 !px-2 text-xs text-red-700" onClick={() => openPayAction(it, 'sso')}>จ่ายประกันสังคม</button>}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      )}
                      {isVehicle && (
                        <td className="px-3 py-2 text-center align-top" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-col items-center gap-1">
                            {it.decidedBy && ['อนุมัติ', 'ไม่อนุมัติ', 'ยกเลิก'].includes(it.status) && (
                              <span className="text-xs text-slate-500">{it.status === 'อนุมัติ' ? 'อนุมัติโดย' : it.status === 'ไม่อนุมัติ' ? 'ไม่อนุมัติโดย' : 'ยกเลิกโดย'} {it.decidedBy} {fmtDate(it.decidedAt)}</span>
                            )}
                            <div className="flex flex-wrap justify-center gap-1">
                              {canApproveVehicle && it.status === 'รออนุมัติ' && (
                                <>
                                  <button className="btn btn-outline !py-1 !px-2 text-xs text-emerald-700" onClick={() => openVehicleAction(it, 'approve')}>อนุมัติ</button>
                                  <button className="btn btn-outline !py-1 !px-2 text-xs text-red-700" onClick={() => openVehicleAction(it, 'reject')}>ไม่อนุมัติ</button>
                                </>
                              )}
                              {canCancelVehicle(it) && (
                                <button className="btn btn-outline !py-1 !px-2 text-xs text-slate-600" onClick={() => openVehicleAction(it, 'cancel')}>ยกเลิกคำขอ</button>
                              )}
                              {writable && (
                                <>
                                  <button className="btn btn-outline !py-1 !px-2 text-xs text-brand-700" onClick={() => openEdit(it)}><Pencil className="h-3.5 w-3.5" /> แก้ไข</button>
                                  <button className="btn btn-outline !py-1 !px-2 text-xs text-red-700" onClick={() => setToDelete(it)}><Trash2 className="h-3.5 w-3.5" /> ลบ</button>
                                </>
                              )}
                              <button className="btn btn-outline !py-1 !px-2 text-xs text-slate-700" title="พิมพ์แบบ 3 ขออนุญาตใช้รถ (PDF)" onClick={() => window.open(`${window.location.origin}${window.location.pathname}#/print-vehicle/${it.id}`, '_blank')}><Printer className="h-3.5 w-3.5" /> พิมพ์แบบ 3</button>
                              {writable && it.status === 'อนุมัติ' && (
                                <button className="btn btn-outline !py-1 !px-2 text-xs text-sky-700" onClick={() => openTripStart(it)}>เริ่มเดินทาง</button>
                              )}
                              {writable && it.status === 'กำลังใช้งาน' && (
                                <button className="btn btn-outline !py-1 !px-2 text-xs text-emerald-700" onClick={() => openTripEnd(it)}>สิ้นสุดการเดินทาง</button>
                              )}
                            </div>
                            {it.odoCurrent && (
                              <span className="text-xs text-slate-500">เลขไมล์ {Number(it.odoCurrent).toLocaleString('th-TH')}{it.distance && ` · ใช้รถ ${Number(it.distance).toLocaleString('th-TH')} กม.`}</span>
                            )}
                            {it.status === 'เสร็จสิ้น' && it.timeOut && (
                              <span className="text-xs text-slate-500">{it.timeOut} → {it.timeIn}</span>
                            )}
                          </div>
                        </td>
                      )}
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
            <div className="w-full max-w-md">
              <div className="mb-1 text-center text-sm font-medium text-slate-600">เลขรับ</div>
              <input readOnly className="input mb-3 bg-brand-50 text-center text-xl font-extrabold text-brand-800" value={justCreated.number} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-center text-sm font-medium text-slate-600">วันที่รับ</label>
                  <input readOnly className="input bg-brand-50 text-center font-semibold text-brand-800" value={fmtDate(justCreated.date)} />
                </div>
                <div>
                  <label className="mb-1 block text-center text-sm font-medium text-slate-600">เวลารับ</label>
                  <input readOnly className="input bg-brand-50 text-center font-semibold text-brand-800" value={`${justCreated.time} น.`} />
                </div>
              </div>
            </div>
          </div>
        </Modal>
      ) : form && (
        <Modal
          wide
          title={form.id ? `แก้ไข${cfg.noun} ${form.number}` : (cfg.addLabel || `เพิ่ม${cfg.noun}`)}
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
            {!form.id && isGenericNumbered && (
              <div className="rounded-lg bg-brand-50 p-3 text-sm text-brand-800 sm:col-span-2">
                <p>{isDeeka && deekaPlan.mode === 'custom' ? `${cfg.numberLabel}จะถูกกำหนดเป็นลำดับที่ ${deekaPlan.seq} (ฎีกาถัดไปจะเลื่อนอัตโนมัติถ้าเลขนี้ถูกใช้แล้ว)` : `${cfg.numberLabel}จะถูกสร้างอัตโนมัติเมื่อกดบันทึก`} และแนบไฟล์ได้หลังบันทึกแล้ว</p>
                {canInsertNumber && genInsertMode && <p className="mt-1">เลขที่จะเป็นเลขแทรกของเลขที่เดิมที่เลือกไว้ เช่น 001.1/2569 (ลำดับแทรกจริงจะคำนวณตอนบันทึก)</p>}
                {canInsertNumber && (
                  <>
                    <label className="mt-2 flex items-center gap-2 font-normal text-brand-900">
                      <input type="checkbox" className="h-4 w-4" checked={genInsertMode} disabled={!genBaseCandidates.length && !genInsertMode}
                        onChange={(e) => { setGenInsertMode(e.target.checked); setGenInsertBase(''); }} />
                      แทรกเลขที่ย้อนหลัง (สำหรับรายการที่ลงวันที่ย้อนหลังและเลขที่นั้นถูกใช้ไปแล้ว)
                    </label>
                    {!genBaseCandidates.length && !genInsertMode && <p className="mt-1 text-xs text-brand-600">ยังไม่มี{cfg.numberLabel}ในปีงบประมาณ {fy} ให้แทรก</p>}
                    {genInsertMode && (
                      <select className="input mt-2" value={genInsertBase} onChange={(e) => setGenInsertBase(e.target.value)} aria-label={`เลือก${cfg.numberLabel}เดิมที่จะแทรก`}>
                        <option value="">-- เลือก{cfg.numberLabel}เดิมที่จะแทรก --</option>
                        {genBaseCandidates.map((b) => (
                          <option key={b.id} value={b[cfg.numberField]}>{b[cfg.numberField]} · {fmtDate(b[cfg.dateField])}</option>
                        ))}
                      </select>
                    )}
                    {genInsertMode && genInsertBase && (() => {
                      const p = parseRegNumber(genInsertBase);
                      return p ? <p className="mt-2 font-semibold">{cfg.numberLabel}ที่จะได้: {p.prefix}{p.base}.{genInsertPreview ?? '...'}/{p.year}</p> : null;
                    })()}
                    {errors.insertBase && <p className="mt-1 text-sm text-red-600">{errors.insertBase}</p>}
                  </>
                )}
              </div>
            )}
            {!form.id && isIncoming && (
              <div className="rounded-lg bg-brand-50 p-3 text-sm text-brand-800 sm:col-span-2">
                <p className="mb-2 font-medium text-brand-900">เลขรับ / วันที่ / เวลารับหนังสือ (ออกให้อัตโนมัติ)</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs text-brand-700" htmlFor="incoming-number-preview">เลขรับ</label>
                    <input id="incoming-number-preview" readOnly className="input bg-white text-center font-semibold text-brand-800" value={incomingPreview?.number ?? 'กำลังคำนวณ...'} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-brand-700" htmlFor="incoming-date-preview">วันที่รับ</label>
                    <input id="incoming-date-preview" readOnly className="input bg-white text-center font-semibold text-brand-800" value={incomingPreview ? fmtDate(incomingPreview.date) : '...'} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-brand-700" htmlFor="incoming-time-preview">เวลารับ</label>
                    <input id="incoming-time-preview" readOnly className="input bg-white text-center font-semibold text-brand-800" value={incomingPreview ? `${incomingPreview.time} น.` : '...'} />
                  </div>
                </div>
                <p className="mt-2">ระบบจะออกเลขรับและบันทึกวันที่-เวลาให้อัตโนมัติตามเวลาจริงตอนกดบันทึก แก้ไขเองไม่ได้ (ค่าที่แสดงนี้เป็นตัวอย่างล่วงหน้า อาจขยับได้เล็กน้อยหากมีผู้อื่นบันทึกก่อนคุณ)</p>
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
            {cfg.fields.filter((f) => !f.auto && fieldVisible(f, form.values)).map((f) => (
              <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                <label htmlFor={`f-${f.key}`} className="mb-1 block text-sm font-medium text-slate-600">{f.label}{f.required && <span className="text-red-600"> *</span>}</label>
                {f.type === 'textarea' ? (
                  <textarea id={`f-${f.key}`} rows={3} className="input" value={form.values[f.key]} onChange={(e) => setForm({ ...form, values: { ...form.values, [f.key]: e.target.value } })} />
                ) : f.type === 'multi-check' ? (
                  <MissionGroupPicker id={`f-${f.key}`} groups={groupMissions(dynOptions[f.optionsFrom] || [])} value={form.values[f.key]} onChange={(v) => setForm({ ...form, values: { ...form.values, [f.key]: v } })} />
                ) : f.type === 'odometer' ? (
                  <OdometerKeypadInput id={`f-${f.key}`} value={form.values[f.key]} prev={formPrev} onChange={(v) => setForm({ ...form, values: { ...form.values, [f.key]: v } })} />
                ) : f.type === 'time' ? (
                  <TimeKeypadInput id={`f-${f.key}`} value={form.values[f.key]} onChange={(v) => setForm({ ...form, values: { ...form.values, [f.key]: v } })} />
                ) : f.type === 'select' ? (
                  <select id={`f-${f.key}`} className="input" value={form.values[f.key]} onChange={(e) => setForm({ ...form, values: { ...form.values, [f.key]: e.target.value } })}>
                    <option value="">-- เลือก --</option>
                    {(f.optionsFrom ? dynOptionLabels(f.optionsFrom) : f.options).map((o) => <option key={o}>{o}</option>)}
                  </select>
                ) : f.type === 'select-other' ? (
                  (() => {
                    const opts = f.optionsFrom ? dynOptionLabels(f.optionsFrom) : f.options;
                    const raw = form.values[f.key] || '';
                    const isFixed = opts.includes(raw);
                    // active = กำลังอยู่ในโหมด "อื่นๆ" — เก็บเป็น state แยกต่างหาก เพราะพอเลือก "อื่นๆ" ค่าฟิลด์จริงจะถูกเคลียร์เป็นค่าว่างทันที
                    // (ถ้าอิงจากค่าฟิลด์อย่างเดียว พอค่าว่าง ตัวเลือกจะเด้งกลับไปเป็น "-- เลือก --" ทุกครั้ง)
                    const active = otherActive[f.key] || (!isFixed && !!raw);
                    const selectVal = isFixed ? raw : (active ? 'อื่นๆ' : '');
                    const inputOpen = active && (otherOpen[f.key] || !!raw);
                    return (
                      <div className="space-y-2">
                        <select
                          id={`f-${f.key}`} className="input" value={selectVal}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === 'อื่นๆ') {
                              setOtherActive({ ...otherActive, [f.key]: true });
                              setForm({ ...form, values: { ...form.values, [f.key]: '' } });
                            } else {
                              setOtherActive({ ...otherActive, [f.key]: false });
                              setOtherOpen({ ...otherOpen, [f.key]: false });
                              setForm({ ...form, values: { ...form.values, [f.key]: v } });
                            }
                          }}
                        >
                          <option value="">-- เลือก --</option>
                          {opts.map((o) => <option key={o}>{o}</option>)}
                          <option value="อื่นๆ">อื่นๆ (ระบุ)</option>
                        </select>
                        {active && !inputOpen && (
                          <button type="button" className="btn btn-outline !py-1.5 text-sm" onClick={() => setOtherOpen({ ...otherOpen, [f.key]: true })}>
                            <Plus className="h-4 w-4" /> เพิ่มช่องพิมพ์เอง
                          </button>
                        )}
                        {inputOpen && (
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
                    {f.pinnedOption && <option value={f.pinnedOption}>{f.pinnedOption}</option>}
                    {people.map((p) => <option key={p.email} value={p.name}>{p.name}{p.position && !f.hidePosition ? ` (${p.position})` : ''}</option>)}
                  </select>
                ) : f.type === 'date' ? (
                  <ThaiDateInput id={`f-${f.key}`} required={f.required} value={form.values[f.key]} onChange={(v) => setForm({ ...form, values: { ...form.values, [f.key]: v } })} />
                ) : f.type === 'number' ? (
                  <><input id={`f-${f.key}`} type="number" step="0.01" inputMode="decimal" className="input" value={form.values[f.key]} onChange={(e) => setForm({ ...form, values: { ...form.values, [f.key]: e.target.value } })} />{String(form.values[f.key] ?? '').trim() !== '' && <div className="mt-1 text-sm font-semibold text-brand-700">= {fmtMoney(form.values[f.key])} บาท</div>}</>
                ) : f.type === 'computed' ? (
                  // ฟิลด์คำนวณอัตโนมัติ (เช่น มูลค่าตั้งเบิกตามฎีกา = ยอดจ่ายเช็ค + ภาษีหัก ณ ที่จ่าย) — แสดงผลรวมสดขณะกรอก แก้เองไม่ได้
                  // ถ้ายังไม่ได้กรอกฟิลด์ต้นทางเลย (เช่น รายการเก่าก่อนอัปเดตฟีเจอร์นี้) ให้คงโชว์ค่าที่เคยบันทึกไว้เดิมแทนเลข 0 เพื่อไม่ให้ดูเหมือนค่าหายไป
                  // ค่าจริงที่บันทึกลง Firestore คำนวณซ้ำอีกครั้งตอนกด submit() ด้านบน เพื่อกันกรณีค่าฟิลด์ต้นทางถูกแก้ไขหลังสุด
                  <input id={`f-${f.key}`} type="text" readOnly className="input bg-slate-50 font-semibold text-slate-700"
                    value={
                      f.computeFrom.some((k) => String(form.values[k] ?? '').trim() !== '')
                        ? fmtMoney(f.computeFrom.reduce((s, k) => s + (Number(form.values[k]) || 0), 0)) || '0'
                        : (form.values[f.key] || '0')
                    } />
                ) : (
                  <input id={`f-${f.key}`} type="text" className="input" value={form.values[f.key]} onChange={(e) => setForm({ ...form, values: { ...form.values, [f.key]: e.target.value } })} />
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
              {isLoan && viewItem.repaid !== 'ส่งใช้เงินยืมเรียบร้อย' && (
                <>
                  <button className="btn btn-outline text-slate-700" onClick={() => openExtend(viewItem)}>ขอขยายเวลาเงินยืม</button>
                  <button className="btn btn-outline text-red-700" onClick={() => openRepay(viewItem)}><Plus className="h-4 w-4" /> คืนเงินยืม</button>
                </>
              )}
              {isDeeka && viewItem.chequeStatus !== 'จ่ายแล้ว' && (
                <button className="btn btn-outline text-red-700" onClick={() => openPayAction(viewItem, 'cheque')}>ชำระเช็ค</button>
              )}
              {isDeeka && !hasNoTax(viewItem) && viewItem.taxStatus !== 'ส่งสรรพากรแล้ว' && (
                <button className="btn btn-outline text-red-700" onClick={() => openPayAction(viewItem, 'tax')}>ส่งภาษีสรรพากร</button>
              )}
              {isDeeka && !hasNoSso(viewItem) && viewItem.ssoStatus !== 'จ่ายแล้ว' && (
                <button className="btn btn-outline text-red-700" onClick={() => openPayAction(viewItem, 'sso')}>จ่ายประกันสังคม</button>
              )}
              {canApproveVehicle && viewItem.status === 'รออนุมัติ' && (
                <>
                  <button className="btn btn-outline text-emerald-700" onClick={() => openVehicleAction(viewItem, 'approve')}>อนุมัติ</button>
                  <button className="btn btn-outline text-red-700" onClick={() => openVehicleAction(viewItem, 'reject')}>ไม่อนุมัติ</button>
                </>
              )}
              {isVehicle && (
                <button className="btn btn-outline" onClick={() => window.open(`${window.location.origin}${window.location.pathname}#/print-vehicle/${viewItem.id}`, '_blank')}><Printer className="h-4 w-4" /> พิมพ์แบบ 3</button>
              )}
              {canCancelVehicle(viewItem) && (
                <button className="btn btn-outline text-slate-600" onClick={() => openVehicleAction(viewItem, 'cancel')}>ยกเลิกคำขอ</button>
              )}
              {writable && viewItem.status === 'อนุมัติ' && (
                <button className="btn btn-outline text-sky-700" onClick={() => openTripStart(viewItem)}>เริ่มเดินทาง</button>
              )}
              {writable && viewItem.status === 'กำลังใช้งาน' && (
                <button className="btn btn-outline text-emerald-700" onClick={() => openTripEnd(viewItem)}>สิ้นสุดการเดินทาง</button>
              )}
              <button className="btn btn-primary" onClick={() => openEdit(viewItem)}><Pencil className="h-4 w-4" /> แก้ไข</button>
            </>
          )}
        >
          <dl className="mb-5 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {cfg.fields.filter((f) => fieldVisible(f, viewItem)).map((f) => (
              <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                <dt className="text-sm text-slate-500">{f.label}</dt>
                <dd className="whitespace-pre-wrap font-medium">
                  {f.key === cfg.statusField ? (
                    isLoanOverdue(viewItem) ? <Badge className="bg-red-600 text-white">เกินกำหนดส่งใช้เงินยืม</Badge> : <Badge className={cfg.statusColors[viewItem[f.key]]}>{viewItem[f.key]}</Badge>
                  ) : isDeeka && f.key === 'taxStatus' && hasNoTax(viewItem) ? 'ไม่มียอดหัก'
                  : isDeeka && f.key === 'ssoStatus' && hasNoSso(viewItem) ? 'ไม่มียอดหัก'
                  : display(f, viewItem[f.key], viewItem)}
                </dd>
              </div>
            ))}
          </dl>
          <FileAttach cfg={cfg} id={viewItem.id} label={viewItem[cfg.numberField]} attachments={viewItem.attachments || []} canEdit={writable} onMessage={say} />
        </Modal>
      )}

      {/* ทะเบียนสัญญายืมเงิน: ป๊อปอัพบันทึกการคืนเงินยืม */}
      {repayItem && (
        <Modal
          title={`บันทึกการคืนเงินยืม — ${repayItem.loanNo}`}
          onClose={() => !repaySaving && setRepayItem(null)}
          footer={
            <>
              <button className="btn btn-outline" disabled={repaySaving} onClick={() => setRepayItem(null)}>ยกเลิก</button>
              <button className="btn btn-green" disabled={repaySaving} onClick={submitRepay}>{repaySaving && <Loader2 className="h-4 w-4 animate-spin" />} บันทึก</button>
            </>
          }
        >
          <div className="grid gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">วันที่ส่งใช้เงินยืม</label>
              <ThaiDateInput value={repayForm.date} onChange={(v) => setRepayForm({ ...repayForm, date: v })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">วิธีส่งใช้เงินยืม</label>
              <select className="input" value={repayForm.method} onChange={(e) => setRepayForm({ ...repayForm, method: e.target.value })}>
                {['ฎีกา', 'เงินสด', 'เงินโอน'].map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">จำนวนเงินส่งใช้</label>
              <input className="input" value={repayForm.amount || ''} onChange={(e) => setRepayForm({ ...repayForm, amount: e.target.value })} />
            </div>
            {repayForm.method === 'ฎีกา' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">เลขฎีกาส่งใช้เงินยืม</label>
                {repayForm.dikaList.map((d, i) => (
                  <div key={i} className="mb-2 flex gap-2">
                    <input className="input" placeholder="เลขฎีกา" value={d} onChange={(e) => {
                      const list = [...repayForm.dikaList]; list[i] = e.target.value; setRepayForm({ ...repayForm, dikaList: list });
                    }} />
                    {repayForm.dikaList.length > 1 && (
                      <button type="button" className="btn btn-outline !px-2" onClick={() => setRepayForm({ ...repayForm, dikaList: repayForm.dikaList.filter((_, j) => j !== i) })}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" className="btn btn-outline !py-1.5 text-sm" onClick={() => setRepayForm({ ...repayForm, dikaList: [...repayForm.dikaList, ''] })}>
                  <Plus className="h-4 w-4" /> เพิ่มเลขฎีกา (ถ้ามีมากกว่า 1 ฎีกา)
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ทะเบียนสัญญายืมเงิน: ป๊อปอัพขอขยายเวลาส่งใช้เงินยืม */}
      {extendItem && (
        <Modal
          title={`ขอขยายเวลาเงินยืม — ${extendItem.loanNo}`}
          onClose={() => !extendSaving && setExtendItem(null)}
          footer={
            <>
              <button className="btn btn-outline" disabled={extendSaving} onClick={() => setExtendItem(null)}>ยกเลิก</button>
              <button className="btn btn-green" disabled={extendSaving} onClick={submitExtend}>{extendSaving && <Loader2 className="h-4 w-4 animate-spin" />} บันทึก</button>
            </>
          }
        >
          <div className="grid gap-4">
            {extendItem.dueDate && <p className="text-sm text-slate-500">กำหนดส่งใช้เดิม: <span className="font-medium text-slate-700">{fmtDate(extendItem.dueDate)}</span></p>}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">กำหนดวันส่งใช้ใหม่</label>
              <ThaiDateInput value={extendDate} onChange={setExtendDate} />
            </div>
          </div>
        </Modal>
      )}

      {/* ทะเบียนคุมฎีกาเบิกจ่าย: ป๊อปอัพบันทึกวันที่จ่ายเช็ค / วันที่ส่งภาษีสรรพากร (ใช้ modal เดียวกันสลับข้อความตาม payAction.kind) */}
      {payAction && (
        <Modal
          title={`${payAction.kind === 'cheque' ? 'ชำระเช็ค' : payAction.kind === 'tax' ? 'ส่งภาษีหัก ณ ที่จ่ายให้สรรพากร' : 'จ่ายเงินประกันสังคม'} — ${payAction.item[cfg.numberField]}`}
          onClose={() => !payActionSaving && setPayAction(null)}
          footer={
            <>
              <button className="btn btn-outline" disabled={payActionSaving} onClick={() => setPayAction(null)}>ยกเลิก</button>
              <button className="btn btn-green" disabled={payActionSaving} onClick={submitPayAction}>{payActionSaving && <Loader2 className="h-4 w-4 animate-spin" />} บันทึก</button>
            </>
          }
        >
          <div className="grid gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">{payAction.kind === 'cheque' ? 'วันที่จ่ายเช็ค' : payAction.kind === 'tax' ? 'วันที่ส่งภาษีสรรพากร' : 'วันที่จ่ายประกันสังคม'}</label>
              <ThaiDateInput value={payActionDate} onChange={setPayActionDate} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">เลขที่เช็ค</label>
              <input className="input" inputMode="numeric" placeholder="เช่น 1234567" value={payActionChequeNo} onChange={(e) => setPayActionChequeNo(e.target.value)} />
            </div>
          </div>
        </Modal>
      )}

      {/* ทะเบียนควบคุมยานพาหนะ: ป๊อปอัพอนุมัติ/ไม่อนุมัติ/ยกเลิกคำขอใช้รถ (ใช้ modal เดียวกันสลับข้อความตาม vehicleAction.kind) */}
      {vehicleAction && (
        <Modal
          title={`${vehicleAction.kind === 'approve' ? 'อนุมัติคำขอใช้รถ' : vehicleAction.kind === 'reject' ? 'ไม่อนุมัติคำขอใช้รถ' : 'ยกเลิกคำขอใช้รถ'} — ${vehicleAction.item[cfg.numberField]}`}
          onClose={() => !vehicleActionSaving && setVehicleAction(null)}
          footer={
            <>
              <button className="btn btn-outline" disabled={vehicleActionSaving} onClick={() => setVehicleAction(null)}>ปิด</button>
              <button className={vehicleAction.kind === 'approve' ? 'btn btn-green' : 'btn btn-outline text-red-700'} disabled={vehicleActionSaving} onClick={submitVehicleAction}>
                {vehicleActionSaving && <Loader2 className="h-4 w-4 animate-spin" />} ยืนยัน{vehicleAction.kind === 'approve' ? 'อนุมัติ' : vehicleAction.kind === 'reject' ? 'ไม่อนุมัติ' : 'ยกเลิกคำขอ'}
              </button>
            </>
          }
        >
          <div className="grid gap-4">
            <p className="text-sm text-slate-600">
              ภารกิจ: {missionLines(vehicleAction.item).join(', ') || '-'} · ผู้ขอใช้รถ: {vehicleAction.item.requester} · วันที่ใช้รถ: {fmtDate(vehicleAction.item.useDate)}
            </p>
            {vehicleAction.kind !== 'approve' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">เหตุผล{vehicleAction.kind === 'reject' ? 'ที่ไม่อนุมัติ' : 'ที่ยกเลิก'} <span className="text-red-600">*</span></label>
                <textarea rows={3} className="input" value={vehicleActionNote} onChange={(e) => setVehicleActionNote(e.target.value)} autoFocus />
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ทะเบียนควบคุมยานพาหนะ (เฟส 3): ป๊อปอัพเริ่มเดินทาง / สิ้นสุดการเดินทาง */}
      {tripModal && (
        <Modal
          title={`${tripModal.kind === 'start' ? 'เริ่มเดินทาง' : 'สิ้นสุดการเดินทาง'} — ${tripModal.item[cfg.numberField]}`}
          onClose={() => !tripSaving && setTripModal(null)}
          footer={
            <>
              <button className="btn btn-outline" disabled={tripSaving} onClick={() => setTripModal(null)}>ยกเลิก</button>
              <button className="btn btn-green" disabled={tripSaving} onClick={submitTrip}>{tripSaving && <Loader2 className="h-4 w-4 animate-spin" />} บันทึก</button>
            </>
          }
        >
          <div className="grid gap-4">
            {tripModal.kind === 'start' ? (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-600">วันและเวลาออกเดินทางจริง <span className="text-red-600">*</span></label>
                  <div className="grid grid-cols-2 gap-2">
                    <ThaiDateInput value={splitDT(tripForm.timeOut).d} onChange={(d) => setTripForm({ ...tripForm, timeOut: joinDT(d, splitDT(tripForm.timeOut).t) })} />
                    <TimeKeypadInput value={splitDT(tripForm.timeOut).t} onChange={(t) => setTripForm({ ...tripForm, timeOut: joinDT(splitDT(tripForm.timeOut).d, t) })} />
                  </div>
                </div>
                <p className="text-sm text-slate-500">ผู้ขับรถ: {tripModal.item.driver || '-'} · ยานพาหนะ: {tripModal.item.plate}</p>
              </>
            ) : (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-600">วันและเวลากลับถึงหน่วยงาน <span className="text-red-600">*</span></label>
                  <div className="grid grid-cols-2 gap-2">
                    <ThaiDateInput value={splitDT(tripForm.timeIn).d} onChange={(d) => setTripForm({ ...tripForm, timeIn: joinDT(d, splitDT(tripForm.timeIn).t) })} />
                    <TimeKeypadInput value={splitDT(tripForm.timeIn).t} onChange={(t) => setTripForm({ ...tripForm, timeIn: joinDT(splitDT(tripForm.timeIn).d, t) })} />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-600">ผลการปฏิบัติงาน</label>
                  <textarea rows={2} className="input" value={tripForm.tripResult || ''} onChange={(e) => setTripForm({ ...tripForm, tripResult: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-600">หมายเหตุหรือเหตุขัดข้อง</label>
                  <textarea rows={2} className="input" value={tripForm.note || ''} onChange={(e) => setTripForm({ ...tripForm, note: e.target.value })} />
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {/* ทะเบียนคุมคลัง: ป๊อปอัพเพิ่มเล่มเข้าคลัง */}
      {stockModal === 'in' && (
        <Modal
          title="เพิ่มเล่มเข้าคลัง"
          onClose={() => !slSaving && setStockModal(null)}
          footer={
            <>
              <button className="btn btn-outline" disabled={slSaving} onClick={() => setStockModal(null)}>ปิด</button>
              <button className="btn btn-green" disabled={slSaving} onClick={submitStockIn}>{slSaving && <Loader2 className="h-4 w-4 animate-spin" />} บันทึก</button>
            </>
          }
        >
          <div className="grid gap-4">
            {SL?.fySelectable && (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">ปีงบประมาณของเล่ม</label>
                <select className="input" value={slForm.fy} onChange={(e) => (cfg.manualNumber ? onStockInFyChange(e.target.value) : setSlForm({ ...slForm, fy: e.target.value }))}>
                  {(fyOptions || [fy]).map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                {!cfg.manualNumber && <p className="mt-1 text-xs text-slate-500">เลขที่เล่มจะออกตามปีงบนี้ (เช่น 1/{slForm.fy}) และเล่มนี้จะอยู่ในทะเบียนของปีงบที่เลือก</p>}
                {cfg.manualNumber && <p className="mt-1 text-xs text-slate-500">เล่มนี้จะอยู่ในทะเบียนของปีงบที่เลือก</p>}
              </div>
            )}
            {cfg.manualNumber && (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">{cfg.numberLabel || 'เลขที่เล่ม'}</label>
                <input className="input" value={slForm.bookNo || ''} onChange={(e) => setSlForm({ ...slForm, bookNo: e.target.value })} placeholder={cfg.manualNumberSuggest ? '' : 'กรอกเลขที่เล่ม'} />
                {cfg.manualNumberSuggest && <p className="mt-1 text-xs text-slate-500">เป็นเพียงคำแนะนำเลขที่ถัดไป แก้ไข/เขียนทับได้อย่างอิสระ</p>}
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">วันที่</label>
              <ThaiDateInput value={slForm.date} onChange={(v) => setSlForm({ ...slForm, date: v })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">ที่มา</label>
              <select className="input" value={slForm.source} onChange={(e) => setSlForm({ ...slForm, source: e.target.value })}>
                <option value="">-- เลือก --</option>
                {SL?.sourceOptions.map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">{SL?.numFromLabel}</label>
                <input className="input" value={slForm.numFrom || ''} onChange={(e) => setSlForm({ ...slForm, numFrom: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">{SL?.numToLabel}</label>
                <input className="input" value={slForm.numTo || ''} onChange={(e) => setSlForm({ ...slForm, numTo: e.target.value })} />
              </div>
            </div>
            {(SL?.extraInFields || []).map((f) => (
              <div key={f.key}>
                <label className="mb-1 block text-sm font-medium text-slate-600">{f.label}</label>
                <input className="input" value={slForm[f.key] || ''} onChange={(e) => setSlForm({ ...slForm, [f.key]: e.target.value })} />
              </div>
            ))}
            <p className="text-xs text-slate-500">
              {cfg.manualNumber
                ? `การบันทึกครั้งนี้นับเป็น 1 ${SL?.unitLabel} ตามเลขที่เล่มที่กรอก หากมีมากกว่า 1 ${SL?.unitLabel} ให้กดบันทึกแล้วกรอกเล่มถัดไปเพิ่มได้เรื่อยๆ`
                : `การบันทึกครั้งนี้นับเป็น 1 ${SL?.unitLabel} ออกเลขที่เล่มให้อัตโนมัติตามลำดับ หากมีมากกว่า 1 ${SL?.unitLabel} ให้กดบันทึกแล้วกรอกเล่มถัดไปเพิ่มได้เรื่อยๆ`}
            </p>
          </div>
        </Modal>
      )}

      {/* ทะเบียนคุมคลัง: ป๊อปอัพเบิกออกจากคลัง — คลิกเลือกเล่มจากแดชบอร์ดด้านบนแล้วมาที่นี่ ไม่ต้องกรอกช่วงเลขที่/จำนวนซ้ำ เพราะมาจากตอนรับเข้าแล้ว */}
      {stockModal === 'out' && withdrawItem && (
        <Modal
          title={`เบิกเล่มที่ ${withdrawItem[cfg.numberField]} ออกจากคลัง`}
          onClose={() => !slSaving && (setStockModal(null), setWithdrawItem(null))}
          footer={
            <>
              <button className="btn btn-outline" disabled={slSaving} onClick={() => { setStockModal(null); setWithdrawItem(null); }}>ยกเลิก</button>
              <button className="btn btn-green" disabled={slSaving} onClick={submitWithdraw}>{slSaving && <Loader2 className="h-4 w-4 animate-spin" />} บันทึกเบิก</button>
            </>
          }
        >
          <div className="grid gap-4">
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {SL?.numFromLabel?.replace(' ตั้งแต่', '')}: <span className="font-semibold text-slate-800">{withdrawItem[SL?.numFromKey]} - {withdrawItem[SL?.numToKey]}</span>
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">วันที่เบิก</label>
              <ThaiDateInput value={slForm.date} onChange={(v) => setSlForm({ ...slForm, date: v })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">ผู้เบิก</label>
              <input className="input" value={slForm.requester || ''} onChange={(e) => setSlForm({ ...slForm, requester: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">ตำแหน่งผู้เบิก</label>
              <input className="input" value={slForm.requesterPosition || ''} onChange={(e) => setSlForm({ ...slForm, requesterPosition: e.target.value })} />
            </div>
          </div>
        </Modal>
      )}

      {/* ทะเบียนใบเสร็จเท่านั้น: ป๊อปอัพบันทึกเลขที่ใช้ล่าสุดของเล่มที่กำลังใช้อยู่ */}
      {usageItem && (
        <Modal
          title={`บันทึกเลขที่ใช้ล่าสุด — เล่ม ${usageItem[cfg.numberField]}`}
          onClose={() => !usageSaving && setUsageItem(null)}
          footer={
            <>
              <button className="btn btn-outline" disabled={usageSaving} onClick={() => setUsageItem(null)}>ยกเลิก</button>
              <button className="btn btn-green" disabled={usageSaving} onClick={submitUsage}>{usageSaving && <Loader2 className="h-4 w-4 animate-spin" />} บันทึก</button>
            </>
          }
        >
          <div className="grid gap-4">
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              ช่วงเลขที่ใบเสร็จทั้งเล่ม: <span className="font-semibold text-slate-800">{usageItem[SL?.numFromKey]}-{usageItem[SL?.numToKey]}</span>
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">ใช้ใบเสร็จไปถึงเลขที่</label>
              <input className="input" value={usageForm.lastUsedNo || ''} onChange={(e) => setUsageForm({ ...usageForm, lastUsedNo: e.target.value })} />
            </div>
            <p className="text-xs text-slate-500">ระบบใช้เลขนี้คำนวณแผ่นที่เหลือในเล่ม และใช้เป็นค่าเริ่มต้นเวลาเจาะปรุทำลายปลายปีงบ</p>
          </div>
        </Modal>
      )}

      {/* ทะเบียนใบเสร็จเท่านั้น: ป๊อปอัพเจาะปรุทำลายใบเสร็จคงเหลือ */}
      {destroyItem && (
        <Modal
          title={`เจาะปรุทำลายใบเสร็จคงเหลือ — เล่ม ${destroyItem[cfg.numberField]}`}
          onClose={() => !destroySaving && setDestroyItem(null)}
          footer={
            <>
              <button className="btn btn-outline" disabled={destroySaving} onClick={() => setDestroyItem(null)}>ยกเลิก</button>
              <button className="btn btn-green" disabled={destroySaving} onClick={submitDestroy}>{destroySaving && <Loader2 className="h-4 w-4 animate-spin" />} บันทึกทำลาย</button>
            </>
          }
        >
          <div className="grid gap-4">
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              ช่วงเลขที่ใบเสร็จทั้งเล่ม: <span className="font-semibold text-slate-800">{destroyItem[SL?.numFromKey]}-{destroyItem[SL?.numToKey]}</span>
              {destroyItem[RU?.lastUsedKey] && <> · ใช้ล่าสุดถึงเลขที่ {destroyItem[RU.lastUsedKey]}</>}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">ทำลายเลขที่ ตั้งแต่</label>
                <input className="input" value={destroyForm.from || ''} onChange={(e) => setDestroyForm({ ...destroyForm, from: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600">ทำลายเลขที่ ถึง</label>
                <input className="input" value={destroyForm.to || ''} onChange={(e) => setDestroyForm({ ...destroyForm, to: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">วันที่เจาะปรุทำลาย</label>
              <ThaiDateInput value={destroyForm.date} onChange={(v) => setDestroyForm({ ...destroyForm, date: v })} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600">วันที่นำส่ง อบจ.สกลนคร</label>
              <ThaiDateInput value={destroyForm.sentDate} onChange={(v) => setDestroyForm({ ...destroyForm, sentDate: v })} />
            </div>
            <p className="text-xs text-slate-500">บันทึกนี้จะเปลี่ยนสถานะเล่มเป็น "ทำลายแล้ว" และนำออกจากรายการ "เล่มที่ใช้อยู่"</p>
          </div>
        </Modal>
      )}

      {/* ทะเบียนใบเสร็จเท่านั้น: รายงานใบเสร็จคงเหลือเมื่อปลายปีงบประมาณ */}
      {showRemainReport && (
        <Modal wide title="ใบเสร็จคงเหลือเมื่อปลายปีงบประมาณ" onClose={() => setShowRemainReport(false)}
          footer={<button className="btn btn-outline" onClick={() => setShowRemainReport(false)}>ปิด</button>}
        >
          {remainingBooks.length === 0 ? (
            <p className="py-6 text-center text-slate-400">ไม่มีใบเสร็จคงเหลือในเล่มที่ใช้อยู่</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-semibold">เล่มที่</th>
                    <th className="px-3 py-2 font-semibold">เลขที่คงเหลือ</th>
                    <th className="px-3 py-2 text-center font-semibold">แผ่นที่เหลือ</th>
                    {writable && <th className="px-3 py-2"></th>}
                  </tr>
                </thead>
                <tbody>
                  {remainingBooks.map(({ it, from, to }) => (
                    <tr key={it.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-semibold text-brand-800">{it[cfg.numberField]}</td>
                      <td className="px-3 py-2">{from}-{to}</td>
                      <td className="px-3 py-2 text-center">{to - from + 1}</td>
                      {writable && (
                        <td className="px-3 py-2 text-right">
                          <button type="button" className="btn btn-outline !py-1 !px-2.5 text-xs text-red-700" onClick={() => { setShowRemainReport(false); openDestroy(it); }}>เจาะปรุทำลาย</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}

      {deekaChoice && (
        <Modal title="เพิ่มฎีกาเบิกจ่าย" onClose={() => setDeekaChoice(null)}
          footer={<>
            <button className="btn btn-outline" onClick={() => setDeekaChoice(null)}>ยกเลิก</button>
            <button className="btn btn-primary" onClick={confirmDeekaChoice}>ถัดไป</button>
          </>}>
          <div className="space-y-3 text-sm">
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3">
              <input type="radio" className="mt-1" checked={deekaChoice.mode === 'normal'} onChange={() => setDeekaChoice({ ...deekaChoice, mode: 'normal' })} />
              <span><b>เพิ่มฎีกาเบิกจ่ายปกติ</b><br /><span className="text-slate-500">ระบบออกเลขที่ฎีกาถัดไปให้อัตโนมัติ</span></span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3">
              <input type="radio" className="mt-1" checked={deekaChoice.mode === 'custom'} onChange={() => setDeekaChoice({ ...deekaChoice, mode: 'custom' })} />
              <span className="flex-1"><b>เพิ่มเพื่อเรียงฎีกา / กำหนดเลขที่ฎีกาเอง</b><br /><span className="text-slate-500">ถ้าเลขนั้นถูกใช้แล้ว ระบบจะถามยืนยัน แล้วเลื่อนเลขถัดไปให้อัตโนมัติ</span>
                {deekaChoice.mode === 'custom' && (
                  <input type="number" min="1" className="input mt-2 w-40" placeholder="เลขที่ฎีกา" value={deekaChoice.seq} autoFocus
                    onChange={(e) => setDeekaChoice({ ...deekaChoice, seq: e.target.value })} />
                )}
              </span>
            </label>
          </div>
        </Modal>
      )}
      {seqConfirm && (
        <Modal title="ยืนยันการเปลี่ยนเลขที่ฎีกา" onClose={() => setSeqConfirm(null)}
          footer={<>
            <button className="btn btn-outline" onClick={() => setSeqConfirm(null)}>ยกเลิก</button>
            <button className="btn btn-primary" onClick={() => { seqConfirmedRef.current = true; setSeqConfirm(null); submit({ preventDefault() {} }); }}>ยืนยัน ใช้เลขนี้</button>
          </>}>
          <p className="text-sm">เลขที่ <b>{seqConfirm.used}</b> ถูกใช้แล้ว ต้องการเปลี่ยนฎีกานี้เป็นเลขที่ {seqConfirm.seq} จริงหรือไม่?<br />
            <span className="text-slate-500">ฎีกาเดิมเลขที่ {seqConfirm.seq} เป็นต้นไปจะเลื่อนเป็นเลขถัดไป (+1) อัตโนมัติ</span></p>
        </Modal>
      )}
      {toDelete && (
        <ConfirmDialog
          message={
            cfg.renumberOnDelete
              ? `คุณต้องการลบทะเบียน${cfg.noun}เลขที่ ${toDelete[cfg.numberField]} หรือไม่? หลังลบ ระบบจะเรียงเลขที่${cfg.numberLabel}ของเล่มอื่นที่เหลือในปีงบ ${toDelete.fy} ใหม่ทั้งหมดให้ต่อเนื่องตามจริง (เลขที่เล่มที่เหลืออาจเปลี่ยนแปลง)`
              : `คุณต้องการลบทะเบียน${cfg.noun}เลขที่ ${toDelete[cfg.numberField]} หรือไม่?`
          }
          busy={deleting} onConfirm={doDelete} onCancel={() => setToDelete(null)}
        />
      )}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
