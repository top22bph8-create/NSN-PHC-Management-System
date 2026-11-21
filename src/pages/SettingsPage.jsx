import { useEffect, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { CalendarCheck, CalendarX2, Car, Hash, Loader2, Lock, MessageCircle, Plus, Trash2 } from 'lucide-react';
import { db } from '../firebase';
import { REGISTRIES } from '../config/registries';
import { DEFAULT_NUMBERING, ORG_DOC_CODE, formatNumber, getNumbering } from '../lib/numbering';
import { writeAudit } from '../lib/audit';
import { ErrorState, Spinner, Toast } from '../components/ui';
import { PageHeader } from '../components/Logo';
import { DEFAULT_HOLIDAYS, DEFAULT_QUOTA, getHolidays, getQuota } from '../lib/leave';
import ThaiDateInput from '../components/ThaiDateInput';
import LineQuotaStatus from '../components/LineQuotaStatus';
import { DEFAULT_LINE_EVENTS, getLineMeta, getLineWebhookLog, saveLineCredentials, saveLineDirectorId, saveLineMeta, setLineActiveChannel } from '../lib/lineNotify';
import {
  DEFAULT_DESTINATIONS, DEFAULT_MISSION_GROUPS, DEFAULT_MISSION_TYPES, DEFAULT_VEHICLE_FLEET, MISSION_LIST_VERSION, VEHICLE_STATUSES, VEHICLE_TYPES,
  getDestinations, getMissionTypes, getVehicleFleet, vehicleLabel,
} from '../lib/vehicleConfig';
import { Settings } from 'lucide-react';

// ===== ชิ้นส่วนจัดหน้าตั้งค่า: การ์ดหมวดมีแถบสีหัว / กล่องย่อยมีเลขขั้น / ช่องกรอกคีย์ลับ =====
const TONES = {
  blue: { head: 'border-blue-200 bg-blue-50 text-blue-900', chip: 'bg-blue-600', side: 'border-l-blue-500', num: 'bg-blue-600', badge: 'bg-blue-100 text-blue-800', field: 'border-blue-300 bg-blue-50/60' },
  emerald: { head: 'border-emerald-200 bg-emerald-50 text-emerald-900', chip: 'bg-emerald-600', side: 'border-l-emerald-500', num: 'bg-emerald-600', badge: 'bg-emerald-100 text-emerald-800', field: 'border-emerald-300 bg-emerald-50/60' },
  amber: { head: 'border-amber-200 bg-amber-50 text-amber-900', chip: 'bg-amber-500', side: 'border-l-amber-500', num: 'bg-amber-500', badge: 'bg-amber-100 text-amber-800', field: 'border-amber-300 bg-amber-50/60' },
  green: { head: 'border-green-200 bg-green-50 text-green-900', chip: 'bg-green-600', side: 'border-l-green-500', num: 'bg-green-600', badge: 'bg-green-100 text-green-800', field: 'border-green-300 bg-green-50/60' },
  rose: { head: 'border-rose-200 bg-rose-50 text-rose-900', chip: 'bg-rose-600', side: 'border-l-rose-500', num: 'bg-rose-600', badge: 'bg-rose-100 text-rose-800', field: 'border-rose-300 bg-rose-50/60' },
  sky: { head: 'border-sky-200 bg-sky-50 text-sky-900', chip: 'bg-sky-600', side: 'border-l-sky-500', num: 'bg-sky-600', badge: 'bg-sky-100 text-sky-800', field: 'border-sky-300 bg-sky-50/60' },
  violet: { head: 'border-violet-200 bg-violet-50 text-violet-900', chip: 'bg-violet-600', side: 'border-l-violet-500', num: 'bg-violet-600', badge: 'bg-violet-100 text-violet-800', field: 'border-violet-300 bg-violet-50/60' },
  teal: { head: 'border-teal-200 bg-teal-50 text-teal-900', chip: 'bg-teal-600', side: 'border-l-teal-500', num: 'bg-teal-600', badge: 'bg-teal-100 text-teal-800', field: 'border-teal-300 bg-teal-50/60' },
  slate: { head: 'border-slate-200 bg-slate-100 text-slate-800', chip: 'bg-slate-600', side: 'border-l-slate-400', num: 'bg-slate-600', badge: 'bg-slate-200 text-slate-700', field: 'border-slate-300 bg-slate-50' },
};

function Section({ tone = 'blue', icon: Icon, title, desc, children }) {
  const t = TONES[tone];
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className={`flex items-center gap-3 border-b px-4 py-3 ${t.head}`}>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white ${t.chip}`}>{Icon && <Icon className="h-5 w-5" />}</span>
        <div className="min-w-0">
          <h2 className="font-semibold leading-tight">{title}</h2>
          {desc && <p className="text-xs opacity-80">{desc}</p>}
        </div>
      </header>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}

function Sub({ step, tone = 'slate', title, hint, children }) {
  const t = TONES[tone];
  return (
    <div className={`space-y-3 rounded-xl border border-slate-200 border-l-4 bg-slate-50/70 p-3 ${t.side}`}>
      <div>
        <div className="flex items-center gap-2 font-semibold text-slate-800">
          {step && <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs text-white ${t.num}`}>{step}</span>}
          {title}
        </div>
        {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

// ช่องกรอกคีย์/รหัสลับ (เขียนได้อย่างเดียว): แถบป้ายสี + ไอคอนกุญแจ + ตัวอักษร monospace + แสดงสถานะ "รอบันทึก" เมื่อกรอกแล้ว
function SecretInput({ id, tone = 'slate', badge, label, placeholder, value, onChange, hint }) {
  const t = TONES[tone];
  const filled = !!value.trim();
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${t.badge}`}>{badge}</span>
        <label className="text-sm font-medium text-slate-700" htmlFor={id}>{label}</label>
        <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${filled ? 'bg-amber-100 font-semibold text-amber-800' : 'bg-slate-100 text-slate-500'}`}>
          <Lock className="h-3 w-3" /> {filled ? 'กรอกแล้ว — กด “บันทึก” เพื่อเก็บ' : 'ค่าเดิมถูกเก็บไว้ (ว่าง = ไม่เปลี่ยน)'}
        </span>
      </div>
      <input id={id} name={`${id}-nofill`} type="text" style={{ WebkitTextSecurity: 'disc' }} autoComplete="off" data-lpignore="true" data-1p-ignore="true" spellCheck={false}
        className={`input border-2 font-mono !text-sm ${filled ? 'border-amber-400 bg-amber-50' : t.field}`} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

// กลุ่มเหตุการณ์แจ้งเตือนไลน์ (คีย์เดิมใน settings/lineNotifyMeta.events ไม่เปลี่ยน)
const EVENT_GROUPS = [
  { title: '📝 ใบลา', text: 'text-blue-700', on: 'border-blue-300 bg-blue-50 text-blue-900', items: [['submit', 'เมื่อยื่นใบลาใหม่'], ['decide', 'เมื่ออนุมัติ/ไม่อนุมัติ'], ['cancel', 'เมื่อยกเลิกใบลา']] },
  { title: '📅 งานมอบหมาย / เวร', text: 'text-violet-700', on: 'border-violet-300 bg-violet-50 text-violet-900', items: [['assignmentReminder', 'ปฏิทินมอบหมายงาน (ทุกวัน 06:00 น.)'], ['unitDuty', 'เวรออกหน่วยปฐมพยาบาล/รับบริจาคโลหิต (แจ้งตอนบันทึก + 06:00 น. วันออกหน่วย)']] },
  { title: '💰 การเงิน / ภาษี', text: 'text-emerald-700', on: 'border-emerald-300 bg-emerald-50 text-emerald-900', items: [['loanBorrow', 'ยืมเงิน (ทะเบียนสัญญายืมเงิน)'], ['loanRepay', 'ส่งใช้เงินยืม'], ['loanOverdue', 'เงินยืมเกินกำหนดส่งใช้ (ทุกวัน 06:00 น.)'], ['taxOverdueReminder', 'ภาษีหัก ณ ที่จ่ายค้างส่งสรรพากร (แจ้งเวลา 08:30 น. ของวันก่อนสิ้นเดือน 3 วันทำการ)']] },
  { title: '🚗 ขอใช้รถราชการ', text: 'text-rose-700', on: 'border-rose-300 bg-rose-50 text-rose-900', items: [['vehicleSubmit', 'เมื่อมีคำขอใช้รถใหม่ (กลุ่มงานรถ)'], ['vehicleDecide', 'เมื่ออนุมัติ/ไม่อนุมัติการใช้รถ']] },
  { title: '🎉 อื่น ๆ', text: 'text-amber-700', on: 'border-amber-300 bg-amber-50 text-amber-900', items: [['birthday', 'วันเกิดบุคลากร (ทุกวัน 06:00 น.)']] },
];

export default function SettingsPage() {
  const [cfg, setCfg] = useState(null);
  const [quota, setQuota] = useState(null);
  const [holidays, setHolidays] = useState(null);
  const [newHoliday, setNewHoliday] = useState({ date: '', name: '' });
  // ===== เฟส 1 ของ "ระบบขออนุญาตใช้ยานพาหนะราชการ": ทะเบียนรถกลาง + ประเภทภารกิจ + สถานที่ปลายทาง ให้แก้ไขได้ที่นี่ =====
  const [fleet, setFleet] = useState(null);
  const [newVehicle, setNewVehicle] = useState({ type: VEHICLE_TYPES[0], name: '', plate: '', owner: 'รพ.สต.บ้านหนองสนม', caretaker: '', status: 'พร้อมใช้งาน', odometer: '', note: '' });
  const [missionTypes, setMissionTypes] = useState(null);
  const [newMission, setNewMission] = useState('');
  const [newMissionGroup, setNewMissionGroup] = useState(Object.keys(DEFAULT_MISSION_GROUPS)[0]);
  const [destinations, setDestinations] = useState(null);
  const [newDest, setNewDest] = useState('');
  const [lineMeta, setLineMeta] = useState({ enabled: false, events: { ...DEFAULT_LINE_EVENTS } });
  const [lineToken, setLineToken] = useState('');
  const [lineToken2, setLineToken2] = useState('');
  const [lineToken3, setLineToken3] = useState('');
  const [lineTargetId, setLineTargetId] = useState('');
  const [lineVehicleTargetId, setLineVehicleTargetId] = useState('');
  const [lineThaiTargetId, setLineThaiTargetId] = useState('');
  const [lineTargets, setLineTargets] = useState([]);
  const [lineTargetsError, setLineTargetsError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const say = (t) => { setToast(t); setTimeout(() => setToast(null), 3500); };

  useEffect(() => {
    getNumbering().then(setCfg).catch((e) => setError(e.message));
    getQuota().then(setQuota).catch(() => setQuota({ ...DEFAULT_QUOTA }));
    getHolidays().then((list) => setHolidays([...list].sort((a, b) => a.date.localeCompare(b.date)))).catch(() => setHolidays([...DEFAULT_HOLIDAYS]));
    getLineMeta().then(setLineMeta).catch(() => {});
    getVehicleFleet().then(setFleet).catch(() => setFleet([...DEFAULT_VEHICLE_FLEET]));
    getMissionTypes().then(setMissionTypes).catch(() => setMissionTypes([...DEFAULT_MISSION_TYPES]));
    getDestinations().then(setDestinations).catch(() => setDestinations([...DEFAULT_DESTINATIONS]));
    getLineWebhookLog().then(setLineTargets).catch((e) => {
      console.error('getLineWebhookLog failed:', e);
      setLineTargetsError(`${e.code || ''} ${e.message || e}`.trim());
    });
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const value = { digits: Number(cfg.digits), era: cfg.era, prefixes: cfg.prefixes || {} };
      await setDoc(doc(db, 'settings', 'numbering'), { ...value, updatedAt: serverTimestamp() });
      const qv = Object.fromEntries(Object.entries(quota || {}).map(([k, v]) => [k, Number(v) || 0]));
      await setDoc(doc(db, 'settings', 'leaveQuota'), qv);
      const hv = [...(holidays || [])].sort((a, b) => a.date.localeCompare(b.date));
      await setDoc(doc(db, 'settings', 'holidays'), { list: hv, updatedAt: serverTimestamp() });
      await writeAudit({ action: 'settings', module: 'settings', docId: 'numbering', label: 'รูปแบบเลขทะเบียน', after: value });
      await saveLineMeta(lineMeta);
      const tokenChanged = !!lineToken.trim();
      // Channel access token จริงของ LINE ยาวกว่า 100 ตัวอักษร — ถ้าสั้นกว่านี้มักเป็นค่าที่เบราว์เซอร์เติมให้เอง (เช่น จุด 11 ตัว) ห้ามบันทึกทับ
      if (tokenChanged && lineToken.trim().length < 100) throw new Error('ช่อง Channel access token สั้นผิดปกติ (อาจเป็นค่าที่เบราว์เซอร์เติมให้เอง) — ลบช่องนี้ให้ว่างแล้วบันทึกใหม่ หรือวาง token ที่คัดลอกจาก LINE Developers ใหม่ทั้งหมด');
      const token2Changed = !!lineToken2.trim();
      if (token2Changed && lineToken2.trim().length < 100) throw new Error('ช่อง Channel access token (ไลน์ช่องที่ 2) สั้นผิดปกติ — ลบช่องนี้แล้ววาง token จริงจาก LINE Developers Console อีกครั้ง');
      const token3Changed = !!lineToken3.trim();
      if (token3Changed && lineToken3.trim().length < 100) throw new Error('ช่อง Channel access token (ไลน์ช่องที่ 3) สั้นผิดปกติ — ลบช่องนี้แล้ววาง token จริงจากหน้า LINE Developers (Messaging API → Channel access token) อีกครั้ง');
      const targetChanged = !!lineTargetId.trim();
      const vehicleTargetChanged = !!lineVehicleTargetId.trim();
      const thaiTargetChanged = !!lineThaiTargetId.trim();
      const typed = [lineTargetId, lineVehicleTargetId, lineThaiTargetId].map((x) => x.trim()).filter(Boolean);
      if (new Set(typed).size !== typed.length) throw new Error('Target ID ของกลุ่มไลน์ซ้ำกัน — แต่ละกลุ่ม (กลุ่มหลัก / ใช้รถ / แพทย์แผนไทย) ต้องใช้รหัสคนละตัว');
      if (tokenChanged || token2Changed || token3Changed || targetChanged || vehicleTargetChanged || thaiTargetChanged) {
        await saveLineCredentials({ channelAccessToken: lineToken.trim(), channelAccessToken2: lineToken2.trim(), channelAccessToken3: lineToken3.trim(), targetId: lineTargetId.trim(), vehicleTargetId: lineVehicleTargetId.trim(), thaiTargetId: lineThaiTargetId.trim() });
        setLineToken(''); setLineToken2(''); setLineToken3(''); setLineTargetId(''); setLineVehicleTargetId(''); setLineThaiTargetId('');
      }
      await writeAudit({ action: 'settings', module: 'settings', docId: 'lineNotify', label: 'แจ้งเตือนไลน์ (LINE Messaging API)', after: { enabled: lineMeta.enabled, events: lineMeta.events, tokenChanged, targetChanged, vehicleTargetChanged } });
      const fleetV = (fleet || []).map((v, i) => ({ ...v, id: v.id || `v${Date.now()}_${i}` }));
      await setDoc(doc(db, 'settings', 'vehicleFleet'), { list: fleetV, updatedAt: serverTimestamp() });
      const missionV = missionTypes || [];
      await setDoc(doc(db, 'settings', 'vehicleMissionTypes'), { list: missionV, version: MISSION_LIST_VERSION, updatedAt: serverTimestamp() });
      const destV = destinations || [];
      await setDoc(doc(db, 'settings', 'vehicleDestinations'), { list: destV, updatedAt: serverTimestamp() });
      await writeAudit({ action: 'settings', module: 'settings', docId: 'vehicleConfig', label: 'ระบบขออนุญาตใช้ยานพาหนะราชการ (ทะเบียนรถ/ประเภทภารกิจ/สถานที่)', after: { fleetCount: fleetV.length, missionCount: missionV.length, destCount: destV.length } });
      say({ type: 'ok', text: 'บันทึกการตั้งค่าแล้ว' });
    } catch (err) {
      say({ type: 'error', text: 'ไม่สำเร็จ: ' + (err.code || err.message) });
    } finally {
      setBusy(false);
    }
  };

  const year = (cfg?.era === 'CE' ? new Date().getFullYear() : new Date().getFullYear() + 543);

  return (
    <div className="mx-auto max-w-3xl p-4 lg:p-6">
      <PageHeader icon={Settings} title="ตั้งค่าระบบ" subtitle="รูปแบบเลขทะเบียนอัตโนมัติ (ขึ้นปีใหม่เริ่มที่ 1 ใหม่) และสิทธิ์วันลาต่อปีงบประมาณ" />
      {error ? <ErrorState message={error} /> : !cfg ? <Spinner /> : (
        <form onSubmit={save} className="space-y-5">
          <Section tone="blue" icon={Hash} title="รูปแบบเลขทะเบียน" desc="เลขรันอัตโนมัติ ขึ้นปีใหม่เริ่มที่ 1 ใหม่">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600" htmlFor="era">ปีในเลขทะเบียน</label>
                <select id="era" className="input" value={cfg.era} onChange={(e) => setCfg({ ...cfg, era: e.target.value })}>
                  <option value="BE">พ.ศ.</option><option value="CE">ค.ศ.</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600" htmlFor="digits">จำนวนหลักของลำดับ</label>
                <select id="digits" className="input" value={cfg.digits} onChange={(e) => setCfg({ ...cfg, digits: e.target.value })}>
                  {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <div className="rounded-lg bg-brand-50 p-3 text-sm text-brand-800">
              เลขที่หนังสือส่งใช้รูปแบบตายตัวของหน่วยงาน <b>{ORG_DOC_CODE}/ลำดับ</b> รันต่อเนื่องไปเรื่อย ๆ ตามปีงบประมาณ (ไม่ปรับตามการตั้งค่าด้านล่าง)
              หากลงวันที่ย้อนหลังและเลขที่เดิมถูกใช้ไปแล้ว ให้ใช้ปุ่ม "แทรกเลขที่ย้อนหลัง" ตอนเพิ่มหนังสือส่ง ระบบจะออกเป็นเลขทศนิยม เช่น /20.1, /20.2
            </div>
            {Object.values(REGISTRIES).filter((r) => r.key !== 'outgoing').map((r) => (
              <div key={r.key} className="grid items-end gap-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-600" htmlFor={`p-${r.key}`}>คำนำหน้า{r.numberLabel} (ไม่บังคับ)</label>
                  <input id={`p-${r.key}`} className="input" maxLength={10} value={cfg.prefixes?.[r.key] || ''} onChange={(e) => setCfg({ ...cfg, prefixes: { ...cfg.prefixes, [r.key]: e.target.value } })} />
                </div>
                <div className="rounded-lg bg-white p-2 text-sm ring-1 ring-slate-200">ตัวอย่าง: <b>{formatNumber(1, Number(cfg.digits), year, cfg.prefixes?.[r.key] || '')}</b></div>
              </div>
            ))}
            <p className="text-sm text-slate-500">การเปลี่ยนรูปแบบมีผลกับรายการใหม่เท่านั้น เลขที่ออกไปแล้วจะไม่ถูกแก้ไข ค่าเริ่มต้น: {DEFAULT_NUMBERING.digits} หลัก, พ.ศ.</p>
          </Section>

          <Section tone="emerald" icon={CalendarCheck} title="สิทธิ์วันลาต่อปีงบประมาณ" desc="จำนวนวัน/ปี แยกตามประเภทการลา">
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(quota || {}).map(([k, v]) => (
                <label key={k} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-700">{k}
                  <input type="number" min="0" className="input !w-24 text-center font-semibold" value={v} onChange={(e) => setQuota({ ...quota, [k]: e.target.value })} aria-label={`สิทธิ์${k}`} />
                </label>
              ))}
            </div>
          </Section>

          <Section tone="amber" icon={CalendarX2} title="วันหยุดราชการ" desc="ไม่นับเป็นวันลาเมื่อลาตรงกับวันนี้">
            <details className="rounded-lg bg-amber-50/60 p-2 text-sm text-slate-600">
              <summary className="cursor-pointer font-medium text-amber-800">คำอธิบาย</summary>
              <p className="mt-1">
                ระบบใช้รายการนี้ตัดวันหยุดราชการออกจากจำนวนวันลาที่คำนวณอัตโนมัติ (เช่น 13 ต.ค. วันนวมินทรมหาราช) บางวัน (มาฆบูชา/วิสาขบูชา/อาสาฬหบูชา และวันชดเชย) เลื่อนไปทุกปีตามปฏิทินจันทรคติ/วันหยุดสุดสัปดาห์
                ต้องมาเพิ่มปีถัดไปเองที่นี่เมื่อมีประกาศจากทางราชการ (ราชกิจจานุเบกษา/ครม.)
              </p>
            </details>
            {!holidays ? <Spinner /> : (
              <div className="space-y-2">
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {holidays.length === 0 ? <p className="p-2 text-sm text-slate-400">ยังไม่มีรายการ</p> : holidays.map((h, i) => (
                    <div key={`${h.date}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-sm">
                      <span><b>{h.date}</b> — {h.name}</span>
                      <button type="button" className="text-red-500 hover:text-red-700" onClick={() => setHolidays(holidays.filter((_, j) => j !== i))} aria-label={`ลบวันหยุด ${h.name}`}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-50/40 p-2">
                  <div><label className="mb-1 block text-xs text-slate-600">วันที่</label><ThaiDateInput value={newHoliday.date} onChange={(v) => setNewHoliday({ ...newHoliday, date: v })} /></div>
                  <div className="flex-1"><label className="mb-1 block text-xs text-slate-600">ชื่อวันหยุด</label><input className="input" placeholder="เช่น วันปิยมหาราช" value={newHoliday.name} onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })} /></div>
                  <button
                    type="button" className="btn btn-outline"
                    onClick={() => {
                      if (!newHoliday.date || !newHoliday.name.trim()) return;
                      if (holidays.some((h) => h.date === newHoliday.date)) return;
                      setHolidays([...holidays, { date: newHoliday.date, name: newHoliday.name.trim() }].sort((a, b) => a.date.localeCompare(b.date)));
                      setNewHoliday({ date: '', name: '' });
                    }}
                  ><Plus className="h-4 w-4" /> เพิ่ม</button>
                </div>
              </div>
            )}
          </Section>

          <Section tone="green" icon={MessageCircle} title="แจ้งเตือนไลน์ (LINE Messaging API)" desc="ใบลา · งานมอบหมาย · เงินยืม · ขอใช้รถ · คิวแพทย์แผนไทย ฯลฯ">
            <LineQuotaStatus full />
            <details className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              <summary className="cursor-pointer font-medium text-slate-700">วิธีเตรียม/คำอธิบายการตั้งค่าไลน์ (กดเพื่อดู)</summary>
              <p className="mt-2">
                <b>LINE Notify แบบเดิมปิดให้บริการถาวรแล้วตั้งแต่ 31 มี.ค. 2568</b> ระบบนี้จึงเปลี่ยนมาใช้ LINE Messaging API แทน ต้องมี LINE Official Account ของหน่วยงานเอง (สมัครฟรีได้ที่{' '}
                <a className="text-brand-700 underline" href="https://developers.line.biz/console/" target="_blank" rel="noreferrer">LINE Developers Console</a>) แล้วนำ <b>Channel access token</b> (แบบ long-lived) กับ <b>Target ID</b> ของกลุ่ม/ผู้ใช้ปลายทางมาวางไว้ที่นี่
                — ระบบเก็บค่าทั้งสองนี้แบบเขียนได้อย่างเดียว ไม่มีใครดึงกลับมาดูได้อีก แม้แต่ผู้ดูแลระบบ (ป้องกันการรั่วไหล)
                การส่งข้อความจริงต้องติดตั้ง Cloud Function เสริม 1 ตัว (ดูขั้นตอนเตรียมทั้งหมดใน README หัวข้อ "แจ้งเตือนไลน์") มิฉะนั้นจะบันทึกค่าไว้เฉยๆ ยังไม่ส่งข้อความ
              </p>
              <p className="mt-2 rounded-lg bg-amber-50 p-2 text-amber-800">
                ✨ เมื่อมีการยื่นใบลาใหม่ ข้อความที่ส่งเข้ากลุ่มจะมีปุ่ม <b>"อนุมัติ" / "ไม่อนุมัติ"</b> ให้กดตัดสินใจได้ทันทีในไลน์
                (กดได้เฉพาะ LINE ของ "ผู้อำนวยการ" ที่ตั้งค่าไว้ด้านล่างเท่านั้น) พอกดแล้วระบบจะส่งลิงก์เปิดหน้าใบลาที่พร้อมพิมพ์กลับเข้ากลุ่มให้อัตโนมัติ
                · หน้า "ปฏิทินมอบหมายงาน" ก็ใช้การตั้งค่าชุดเดียวกันนี้ส่งแจ้งเตือนงานที่มอบหมายไว้ล่วงหน้าเข้ากลุ่มอัตโนมัติทุกวันเวลา 06:00 น. (เฉพาะวันที่มีการมอบหมายงานไว้)
              </p>
            </details>

            <Sub step="1" tone="sky" title="ช่องไลน์ (Channel access token)" hint="กรอกเฉพาะตอนต้องการบันทึก/เปลี่ยน — เว้นว่างไว้ = ไม่แก้ไขค่าเดิม (ค่าที่บันทึกแล้วดึงกลับมาดูไม่ได้)">
              <SecretInput id="lineToken" tone="sky" badge="ช่อง 1 · หลัก" label="Channel access token — ไลน์ช่องที่ 1 (หลัก)" placeholder="วาง token ของบอทตัวที่ 1 ที่นี่" value={lineToken} onChange={setLineToken} />
              <SecretInput id="lineToken2" tone="emerald" badge="ช่อง 2 · สำรอง" label="Channel access token — ไลน์ช่องที่ 2 (สำรอง เมื่อโควตาช่องแรกเต็ม)" placeholder="วาง token ของบอทตัวที่ 2 ที่นี่" value={lineToken2} onChange={setLineToken2}
                hint="ใช้ Target ID และการตั้งค่าแจ้งเตือนชุดเดียวกับช่อง 1 ทุกคำสั่ง — ข้อควรรู้: LINE อนุญาตบอท 1 ตัวต่อ 1 กลุ่ม เมื่อสลับช่องต้องเอาบอทตัวเดิมออกจากกลุ่มแล้วเชิญตัวที่จะใช้เข้าแทน และตั้ง Webhook URL ของบอทให้เป็น URL เดียวกับตัวแรก (ปุ่มอนุมัติในไลน์จึงจะทำงาน)" />
              <SecretInput id="lineToken3" tone="violet" badge="ช่อง 3 · สำรอง" label="Channel access token — ไลน์ช่องที่ 3 (สำรองอีกตัว)" placeholder="วาง token ของบอทตัวที่ 3 ที่นี่" value={lineToken3} onChange={setLineToken3}
                hint="ใช้ Target ID และการตั้งค่าแจ้งเตือนชุดเดียวกับช่อง 1 ทุกคำสั่ง — ข้อควรรู้: LINE อนุญาตบอท 1 ตัวต่อ 1 กลุ่ม เมื่อสลับช่องต้องเอาบอทตัวเดิมออกจากกลุ่มแล้วเชิญตัวที่จะใช้เข้าแทน และตั้ง Webhook URL ของบอทให้เป็น URL เดียวกับตัวแรก (ปุ่มอนุมัติในไลน์จึงจะทำงาน)" />
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-slate-700">ช่องที่ใช้ส่งตอนนี้:</span>
                  {['1', '2', '3'].map((c) => (
                    <button key={c} type="button" onClick={async () => { await setLineActiveChannel(c); setLineMeta({ ...lineMeta, activeChannel: c }); say({ type: 'ok', text: `สลับไปใช้ไลน์ช่อง ${c} แล้ว` }); }}
                      className={`btn !py-1 text-xs ${(lineMeta.activeChannel || '1') === c ? 'btn-primary' : 'btn-outline'}`}>ไลน์ช่อง {c}{c === '1' ? ' (หลัก)' : ' (สำรอง)'}</button>
                  ))}
                  <span className="text-xs text-slate-500">สลับแล้วมีผลทันที ไม่ต้องกดบันทึก</span>
                </div>
                <label className="mt-2 flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" className="h-4 w-4" checked={lineMeta.autoSwitch !== false} onChange={(e) => setLineMeta({ ...lineMeta, autoSwitch: e.target.checked })} /> สลับอัตโนมัติเมื่อโควตาเต็ม (และกลับไปช่อง 1 ทุกวันที่ 1 ของเดือน) <span className="text-xs text-slate-400">— ต้องกด "บันทึก" ด้านล่าง</span></label>
              </div>
            </Sub>

            <Sub step="2" tone="violet" title="กลุ่มปลายทาง (Target ID)" hint="รหัสกลุ่ม/ผู้ใช้ที่ขึ้นต้นด้วย C… (กลุ่ม) หรือ U… (รายบุคคล) — เว้นว่างไว้ = ไม่แก้ไขค่าเดิม แต่ละกลุ่มต้องใช้รหัสคนละตัว">
              <SecretInput id="lineTargetId" tone="violet" badge="กลุ่มหลัก" label="Target ID — กลุ่มหลัก: ใบลา/งานมอบหมาย/เงินยืม/สรุปคิวแพทย์แผนไทย ฯลฯ" placeholder="เช่น Cxxxxxxxx... (กลุ่ม) หรือ Uxxxxxxxx... (รายบุคคล)" value={lineTargetId} onChange={setLineTargetId} />
              <SecretInput id="lineVehicleTargetId" tone="rose" badge="กลุ่มงานรถ" label='Target ID — ไลน์กลุ่ม "ขออนุญาตใช้รถ"' placeholder="เช่น Cxxxxxxxx... (กลุ่มงานรถ)" value={lineVehicleTargetId} onChange={setLineVehicleTargetId}
                hint='คำขอใช้รถใหม่จะส่งการ์ดปุ่ม "อนุมัติ/ไม่อนุมัติ" เข้ากลุ่มนี้ (กดได้เฉพาะ LINE ของผู้อำนวยการ) พออนุมัติแล้วส่งลิงก์พิมพ์แบบ 3 กลับเข้ากลุ่ม ต้องเชิญบอทเข้ากลุ่มนี้แล้วพิมพ์ข้อความ 1 ครั้งให้ระบบตรวจพบรหัสกลุ่มในรายการด้านล่าง' />
              <SecretInput id="lineThaiTargetId" tone="teal" badge="กลุ่มแพทย์แผนไทย" label='Target ID — ไลน์กลุ่ม "งานแพทย์แผนไทย" (แจ้งเตือนการจองคิวออนไลน์)' placeholder="เช่น Cxxxxxxxx... (กลุ่มงานแพทย์แผนไทย)" value={lineThaiTargetId} onChange={setLineThaiTargetId}
                hint='เมื่อมีผู้จองหรือยกเลิกคิวแพทย์แผนไทย ระบบส่งข้อความเข้ากลุ่มนี้ (เชิญบอทเข้ากลุ่มแล้วพิมพ์ข้อความ 1 ครั้ง จะเห็น ID ในรายการด้านล่าง กด "ใช้เป็นกลุ่มแพทย์แผนไทย")' />
              <div className={`flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm ${lineMeta.directorUserId ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                <b>LINE ผู้อำนวยการ (สำหรับปุ่มอนุมัติ):</b>
                {lineMeta.directorUserId ? (
                  <span className="font-medium">✅ ตั้งค่าแล้ว <code className="break-all text-xs">({lineMeta.directorUserId})</code></span>
                ) : (
                  <span>⚠️ ยังไม่ได้ตั้งค่า — ให้ผู้อำนวยการพิมพ์ข้อความคุยกับบอทแบบส่วนตัว (1:1) 1 ครั้ง แล้วกด "ตั้งเป็นผู้อำนวยการ" ที่รายการด้านล่าง</span>
                )}
              </div>
            </Sub>

            <Sub step="3" tone="slate" title="Target ID ที่ตรวจพบล่าสุด (จาก Webhook)" hint="กดปุ่มข้างรายการเพื่อนำรหัสไปใส่ในช่องด้านบนอัตโนมัติ แล้วกด “บันทึก”">
              {lineTargetsError ? (
                <p className="text-sm text-rose-600">
                  โหลดไม่สำเร็จ: <code className="break-all">{lineTargetsError}</code> (ส่งข้อความนี้ให้ผู้ดูแลระบบช่วยตรวจสอบ)
                </p>
              ) : lineTargets.length === 0 ? (
                <p className="text-sm text-slate-500">
                  ยังไม่พบ Target ID — ต้อง (1) ติดตั้งฟังก์ชัน <code>lineWebhook</code> ด้วย <code>firebase deploy --only functions</code>
                  (2) นำ URL ของฟังก์ชันไปวางเป็น Webhook URL ในหน้า Messaging API ของ LINE Developers Console แล้วเปิดสวิตช์ "Use webhook"
                  (3) พิมพ์ข้อความอะไรก็ได้ 1 ครั้งในแชท/กลุ่มที่มีบอทอยู่ แล้วรีเฟรชหน้านี้ (ดูขั้นตอนละเอียดใน README หัวข้อ "แจ้งเตือนไลน์")
                </p>
              ) : (
                <div className="space-y-2">
                  {lineTargets.map((t) => (
                    <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2 text-sm">
                      <div className="min-w-0">
                        <div>
                          <span className="rounded bg-brand-100 px-1.5 py-0.5 text-xs font-medium text-brand-800">{t.type}</span>{' '}
                          <code className="break-all">{t.id}</code>
                          {lineMeta.directorUserId && t.id === lineMeta.directorUserId && (
                            <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800">ผู้อำนวยการ</span>
                          )}
                        </div>
                        <div className="truncate text-xs text-slate-500">ข้อความล่าสุด: {t.lastMessage}</div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        <button type="button" className="btn btn-outline !py-1 text-xs" onClick={() => setLineTargetId(t.id)}>ใช้เป็นกลุ่มหลัก</button>
                        {t.type !== 'รายบุคคล' && (
                          <>
                            <button type="button" className="btn btn-outline !py-1 text-xs" onClick={() => setLineVehicleTargetId(t.id)}>ใช้เป็นกลุ่มงานรถ</button>
                            <button type="button" className="btn btn-outline !py-1 text-xs" onClick={() => setLineThaiTargetId(t.id)}>ใช้เป็นกลุ่มแพทย์แผนไทย</button>
                          </>
                        )}
                        {t.type === 'รายบุคคล' && (
                          <button
                            type="button" className="btn btn-outline !py-1 text-xs"
                            onClick={async () => { await saveLineDirectorId(t.id); setLineMeta({ ...lineMeta, directorUserId: t.id }); say('ตั้งเป็นผู้อำนวยการแล้ว'); }}
                          >
                            ตั้งเป็นผู้อำนวยการ
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Sub>

            <Sub step="4" tone="amber" title="เลือกเหตุการณ์ที่จะแจ้งเตือน">
              <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3 text-sm font-semibold ${lineMeta.enabled ? 'border-emerald-400 bg-emerald-50 text-emerald-900' : 'border-slate-300 bg-white text-slate-700'}`}>
                <input type="checkbox" className="h-5 w-5" checked={!!lineMeta.enabled} onChange={(e) => setLineMeta({ ...lineMeta, enabled: e.target.checked })} />
                เปิดใช้งานแจ้งเตือนไลน์ (สวิตช์หลัก)
                <span className={`ml-auto rounded-full px-2 py-0.5 text-xs ${lineMeta.enabled ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>{lineMeta.enabled ? 'เปิดอยู่' : 'ปิดอยู่'}</span>
              </label>
              {EVENT_GROUPS.map((g) => (
                <div key={g.title}>
                  <div className={`mb-1 text-xs font-semibold ${g.text}`}>{g.title}</div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {g.items.map(([key, label]) => {
                      const on = key === 'unitDuty' ? lineMeta.events.unitDuty !== false : !!lineMeta.events[key];
                      return (
                        <label key={key} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${on ? g.on : 'border-slate-200 bg-white text-slate-600'}`}>
                          <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={on} onChange={(e) => setLineMeta({ ...lineMeta, events: { ...lineMeta.events, [key]: e.target.checked } })} />
                          <span>{label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </Sub>
          </Section>

          <Section tone="rose" icon={Car} title="ระบบขออนุญาตใช้ยานพาหนะราชการ" desc="ทะเบียนรถ · ประเภทภารกิจ · สถานที่ปลายทาง">
            <p className="text-sm text-slate-500">จัดการรายชื่อยานพาหนะของหน่วยงาน ประเภทภารกิจ และสถานที่ปลายทางมาตรฐาน ที่จะใช้เป็นช้อยในฟอร์มขอใช้รถ — เปลี่ยนที่นี่จุดเดียว มีผลทุกจุดที่ใช้งาน</p>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="border-l-4 border-rose-500 pl-2 text-sm font-semibold text-slate-800">ทะเบียนยานพาหนะ</h3>
              <button type="button" className="btn btn-outline !py-1 text-xs" onClick={() => window.open(`${window.location.origin}${window.location.pathname}#/print-vehicle-qr`, '_blank')}>🖨️ พิมพ์ป้าย QR Code รถ</button>
            </div>
            {!fleet ? <Spinner /> : (
              <div className="mb-4 space-y-2">
                <div className="space-y-1">
                  {fleet.length === 0 ? <p className="rounded-lg bg-slate-50 p-2 text-sm text-slate-400">ยังไม่มีรายการ</p> : fleet.map((v, i) => (
                    <div key={v.id || i} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-sm">
                      <span>
                        {vehicleLabel(v)}
                        <span className={`ml-2 rounded px-1.5 py-0.5 text-xs ${v.status === 'พร้อมใช้งาน' ? 'bg-emerald-100 text-emerald-800' : v.status === 'ไม่พร้อมใช้งาน' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-800'}`}>{v.status}</span>
                        {v.caretaker && <span className="ml-2 text-xs text-slate-500">ผู้รับผิดชอบ: {v.caretaker}</span>}
                        {/* เลขไมล์เริ่มต้น (ตั้งครั้งแรกก่อนใช้งาน) — หลังมีเที่ยวที่ "เสร็จสิ้น" ระบบใช้เลขไมล์เมื่อกลับของเที่ยวล่าสุดเป็น "เลขไมล์ครั้งก่อน" แทนค่านี้อัตโนมัติ */}
                        {String(v.type || '').startsWith(VEHICLE_TYPES[0]) && (
                          <label className="ml-2 inline-flex items-center gap-1 text-xs text-slate-600">เลขไมล์เริ่มต้น
                            <input inputMode="numeric" className="input !w-28 !py-0.5" value={v.odometer || ''} onChange={(e) => setFleet(fleet.map((x, j) => (j === i ? { ...x, odometer: e.target.value.replace(/\D/g, '') } : x)))} />
                          </label>
                        )}
                      </span>
                      <button type="button" className="text-red-500 hover:text-red-700" onClick={() => setFleet(fleet.filter((_, j) => j !== i))} aria-label={`ลบ ${vehicleLabel(v)}`}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
                <div className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs text-slate-600">ประเภทยานพาหนะ</label>
                    <select className="input" value={newVehicle.type} onChange={(e) => setNewVehicle({ ...newVehicle, type: e.target.value })}>
                      {VEHICLE_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-600">ชื่อ/รุ่นรถ (ไม่บังคับ)</label>
                    <input className="input" value={newVehicle.name} onChange={(e) => setNewVehicle({ ...newVehicle, name: e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-600">หมายเลขทะเบียน</label>
                    <input className="input" value={newVehicle.plate} onChange={(e) => setNewVehicle({ ...newVehicle, plate: e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-600">หน่วยงานเจ้าของรถ</label>
                    <input className="input" value={newVehicle.owner} onChange={(e) => setNewVehicle({ ...newVehicle, owner: e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-600">ผู้รับผิดชอบรถ (ไม่บังคับ)</label>
                    <input className="input" value={newVehicle.caretaker} onChange={(e) => setNewVehicle({ ...newVehicle, caretaker: e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-600">สถานะ</label>
                    <select className="input" value={newVehicle.status} onChange={(e) => setNewVehicle({ ...newVehicle, status: e.target.value })}>
                      {VEHICLE_STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="sm:col-span-3">
                    <button
                      type="button" className="btn btn-outline"
                      onClick={() => {
                        if (!newVehicle.plate.trim()) return;
                        setFleet([...fleet, { ...newVehicle, id: `v${Date.now()}` }]);
                        setNewVehicle({ type: VEHICLE_TYPES[0], name: '', plate: '', owner: 'รพ.สต.บ้านหนองสนม', caretaker: '', status: 'พร้อมใช้งาน', odometer: '', note: '' });
                      }}
                    ><Plus className="h-4 w-4" /> เพิ่มยานพาหนะ</button>
                  </div>
                </div>
              </div>
            )}

            <h3 className="mb-2 mt-2 border-l-4 border-violet-500 pl-2 text-sm font-semibold text-slate-800">ประเภทภารกิจ</h3>
            {!missionTypes ? <Spinner /> : (
              <div className="mb-4 space-y-2">
                <div className="max-h-96 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {missionTypes.map((m, i) => (
                    <div key={m.id || i} className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm ${m.active === false ? 'bg-slate-100 text-slate-400' : 'bg-slate-50'}`}>
                      <input
                        className="min-w-0 flex-1 bg-transparent outline-none"
                        value={m.label}
                        onChange={(e) => setMissionTypes(missionTypes.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                      />
                      <select className="max-w-[10rem] rounded border border-slate-200 bg-white px-1 py-0.5 text-xs" value={m.group || ''} onChange={(e) => setMissionTypes(missionTypes.map((x, j) => (j === i ? { ...x, group: e.target.value } : x)))} aria-label="หมวดภารกิจ">
                        {[...new Set([...Object.keys(DEFAULT_MISSION_GROUPS), ...missionTypes.map((x) => x.group).filter(Boolean)])].map((g) => <option key={g}>{g}</option>)}
                      </select>
                      <button type="button" className="text-xs text-brand-700 underline" onClick={() => setMissionTypes(missionTypes.map((x, j) => (j === i ? { ...x, active: x.active === false } : x)))}>
                        {m.active === false ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1"><label className="mb-1 block text-xs text-slate-600">เพิ่มประเภทภารกิจใหม่</label><input className="input" value={newMission} onChange={(e) => setNewMission(e.target.value)} /></div>
                  <div><label className="mb-1 block text-xs text-slate-600">หมวด</label>
                    <select className="input" value={newMissionGroup} onChange={(e) => setNewMissionGroup(e.target.value)}>
                      {Object.keys(DEFAULT_MISSION_GROUPS).map((g) => <option key={g}>{g}</option>)}
                    </select>
                  </div>
                  <button
                    type="button" className="btn btn-outline"
                    onClick={() => {
                      if (!newMission.trim()) return;
                      setMissionTypes([...missionTypes, { id: `m${Date.now()}`, label: newMission.trim(), group: newMissionGroup, active: true }]);
                      setNewMission('');
                    }}
                  ><Plus className="h-4 w-4" /> เพิ่ม</button>
                </div>
                <p className="text-xs text-slate-400">ปิดใช้งานแทนการลบ เพื่อไม่ให้รายการเก่าที่เคยเลือกประเภทนี้ไว้แสดงผลผิดเพี้ยน</p>
              </div>
            )}

            <h3 className="mb-2 mt-2 border-l-4 border-teal-500 pl-2 text-sm font-semibold text-slate-800">สถานที่ปลายทาง</h3>
            {!destinations ? <Spinner /> : (
              <div className="space-y-2">
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {destinations.length === 0 ? <p className="p-2 text-sm text-slate-400">ยังไม่มีรายการ</p> : destinations.map((d, i) => (
                    <div key={d.id || i} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-sm">
                      <span>{d.label}</span>
                      <button type="button" className="text-red-500 hover:text-red-700" onClick={() => setDestinations(destinations.filter((_, j) => j !== i))} aria-label={`ลบ ${d.label}`}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1"><label className="mb-1 block text-xs text-slate-600">เพิ่มสถานที่ปลายทางใหม่</label><input className="input" value={newDest} onChange={(e) => setNewDest(e.target.value)} /></div>
                  <button
                    type="button" className="btn btn-outline"
                    onClick={() => {
                      if (!newDest.trim()) return;
                      setDestinations([...destinations, { id: `d${Date.now()}`, label: newDest.trim() }]);
                      setNewDest('');
                    }}
                  ><Plus className="h-4 w-4" /> เพิ่ม</button>
                </div>
                <p className="text-xs text-slate-400">ผู้ใช้ทั่วไปยังเลือก "อื่น ๆ (ระบุ)" แล้วพิมพ์เองได้เสมอในฟอร์มขอใช้รถ (เฟสถัดไป)</p>
              </div>
            )}
          </Section>

          <div className="sticky bottom-0 z-10 -mx-4 border-t border-brand-100 bg-white/90 px-4 py-3 backdrop-blur lg:-mx-6 lg:px-6">
            <button className="btn btn-primary w-full sm:w-auto" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} บันทึกการตั้งค่าทั้งหมด</button>
          </div>
        </form>
      )}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
