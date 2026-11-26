// ห้องตรวจ Telemedicine (เจ้าหน้าที่): QR นัด/ผูก LINE · ปุ่มโทรหาคนไข้ทาง LINE · วิดีโอคอล · แชท LINE · บันทึกอาการ
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import QRCode from 'qrcode';
import { ArrowLeft, Copy, Loader2, MessageCircle, PhoneCall, QrCode, Send, Video } from 'lucide-react';
import { db, functions } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { writeAudit } from '../../lib/audit';
import { fmtDate } from '../../lib/thai';
import { Spinner, Toast } from '../../components/ui';
import { TELEMED } from '../../config/careLogs';

const call = (name, data) => httpsCallable(functions, name)(data).then((r) => r.data);
const NOTE_KEYS = ['complaint', 'advice', 'meds', 'duration', 'outcome', 'doctor', 'hospital', 'amount', 'status'];

export default function TelemedRoom() {
  const { id } = useParams(); const { user } = useAuth();
  const [d, setD] = useState(undefined); const [chat, setChat] = useState([]);
  const [info, setInfo] = useState(null); const [qr, setQr] = useState(''); const [roomUrl, setRoomUrl] = useState('');
  const [busy, setBusy] = useState(''); const [toast, setToast] = useState(null); const [msg, setMsg] = useState(''); const [form, setForm] = useState({});
  const endRef = useRef(null);

  useEffect(() => onSnapshot(doc(db, 'telemedicine', id), (s) => { setD(s.exists() ? { id: s.id, ...s.data() } : null); }, () => setD(null)), [id]);
  useEffect(() => onSnapshot(query(collection(db, 'telemedicine', id, 'chat'), orderBy('at', 'asc')), (s) => setChat(s.docs.map((x) => ({ id: x.id, ...x.data() }))), () => {}), [id]);
  useEffect(() => { if (d && d.unreadChat) updateDoc(doc(db, 'telemedicine', id), { unreadChat: 0 }).catch(() => {}); }, [d?.unreadChat, id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (d) setForm((f) => (Object.keys(f).length ? f : Object.fromEntries(NOTE_KEYS.map((k) => [k, d[k] ?? ''])))); }, [d]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat.length]);
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }, [toast]);
  const run = async (key, fn, ok) => { setBusy(key); try { const r = await fn(); if (ok) setToast({ type: 'ok', text: ok }); return r; } catch (e) { setToast({ type: 'error', text: (e.message || e.code || 'ผิดพลาด').replace(/^.*?: /, '') }); return null; } finally { setBusy(''); } };

  const prepare = () => run('prep', async () => {
    const r = await call('telemedCreateRoom', { id }); setInfo(r);
    setQr(await QRCode.toDataURL(r.lineUrl || r.joinUrl, { width: 260, margin: 1 }));
    writeAudit({ action: 'update', module: 'telemedicine', docId: id, label: 'สร้างห้อง/QR นัด' }).catch(() => {});
  }, 'สร้างห้องและ QR แล้ว');
  const enter = () => run('enter', async () => { if (!d.roomName) await prepare(); const r = await call('telemedStaffToken', { id }); setRoomUrl(r.url); });
  const ring = () => run('ring', () => call('telemedCall', { id }), 'ส่งปุ่มเชิญเข้าห้องไปที่ LINE คนไข้แล้ว');
  const send = async (e) => { e.preventDefault(); const t = msg.trim(); if (!t) return; setMsg(''); const r = await run('send', () => call('telemedChatSend', { id, text: t })); if (!r) setMsg(t); };
  const saveNote = () => run('save', async () => { await updateDoc(doc(db, 'telemedicine', id), { ...form, updatedAt: serverTimestamp(), updatedBy: user.email.toLowerCase() }); writeAudit({ action: 'update', module: 'telemedicine', docId: id, label: 'บันทึกผลการให้บริการ' }).catch(() => {}); }, 'บันทึกแล้ว');
  const copy = (t) => navigator.clipboard?.writeText(t).then(() => setToast({ type: 'ok', text: 'คัดลอกแล้ว' }));

  if (d === undefined) return <Spinner />;
  if (d === null) return <div className="p-6 text-center text-slate-500">ไม่พบรายการนัด <Link className="text-brand-700 underline" to="/telemedicine">กลับ</Link></div>;
  const F = (k, label, type = 'text', rows) => (
    <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">{label}</span>
      {rows ? <textarea className="input" rows={rows} value={form[k] ?? ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
        : <input className="input" type={type} value={form[k] ?? ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />}</label>);
  const linked = !!d.lineUserId;

  return (
    <div className="mx-auto max-w-7xl p-4 lg:p-6">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Link to="/telemedicine" className="btn btn-outline !px-3"><ArrowLeft className="h-4 w-4" /> กลับ</Link>
        <h1 className="text-xl font-extrabold text-brand-900">ห้องตรวจ Telemedicine — {d.patientName}</h1>
        <span className="text-sm text-slate-500">{fmtDate(d.serviceDate)} {d.serviceTime || ''} · HN {d.hn || '-'}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${linked ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{linked ? '✅ ผูก LINE แล้ว' : '⏳ ยังไม่ผูก LINE'}</span>
        {d.patientJoinedAt && <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-800">คนไข้เคยเข้าห้องแล้ว</span>}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="card overflow-hidden p-0">
            {roomUrl ? <iframe title="video" src={roomUrl} allow="camera; microphone; fullscreen; display-capture; autoplay" className="h-[480px] w-full border-0 bg-slate-900" />
              : <div className="flex h-60 flex-col items-center justify-center gap-3 bg-slate-900 text-white"><Video className="h-10 w-10 opacity-70" /><button className="btn bg-teal-500 text-white hover:bg-teal-600" onClick={enter} disabled={!!busy}>{busy === 'enter' && <Loader2 className="h-4 w-4 animate-spin" />} เข้าห้องวิดีโอคอล</button><p className="text-xs text-slate-400">ต้องอนุญาตกล้องและไมค์ในเบราว์เซอร์</p></div>}
          </div>
          <div className="card p-4">
            <h2 className="mb-3 font-bold text-brand-900">บันทึกอาการ/ผลการให้บริการ</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">{F('complaint', 'อาการ/ประเด็นปรึกษา', 'text', 3)}</div>
              <div className="sm:col-span-2">{F('advice', 'สรุปคำแนะนำ/แผนการรักษา', 'text', 3)}</div>
              <div className="sm:col-span-2">{F('meds', 'ยา/การสั่งยา', 'text', 2)}</div>
              {F('doctor', 'แพทย์ผู้ให้คำปรึกษา')}{F('hospital', 'โรงพยาบาลปลายทาง')}
              {F('duration', 'ระยะเวลา (นาที)', 'number')}{F('amount', 'ยอดเบิกบริการ (บาท)', 'number')}
              <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">ผลลัพธ์</span><select className="input" value={form.outcome ?? ''} onChange={(e) => setForm({ ...form, outcome: e.target.value })}><option value="">—</option>{TELEMED.fields.find((f) => f.key === 'outcome').options.map((o) => <option key={o}>{o}</option>)}</select></label>
              <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">สถานะ</span><select className="input" value={form.status ?? ''} onChange={(e) => setForm({ ...form, status: e.target.value })}>{Object.keys(TELEMED.statusColors).map((o) => <option key={o}>{o}</option>)}</select></label>
            </div>
            <div className="mt-3 text-right"><button className="btn btn-primary" onClick={saveNote} disabled={!!busy}>{busy === 'save' && <Loader2 className="h-4 w-4 animate-spin" />} บันทึก</button></div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="mb-2 flex items-center gap-2 font-bold text-brand-900"><QrCode className="h-5 w-5" /> นัดหมาย/ผูก LINE</h2>
            {!info ? <button className="btn btn-outline w-full" onClick={prepare} disabled={!!busy}>{busy === 'prep' && <Loader2 className="h-4 w-4 animate-spin" />} สร้างห้อง + QR นัดหมาย</button> : (
              <div className="space-y-2 text-center text-sm">
                {qr && <img src={qr} alt="QR" className="mx-auto h-52 w-52 rounded border" />}
                <p className="text-slate-600">{info.lineUrl ? 'ให้คนไข้สแกนด้วยกล้อง/LINE → เปิดแชท OA พร้อมรหัสนัด แล้วกดส่ง' : '⚠️ ยังไม่ได้ตั้ง LINE OA Basic ID — QR นี้เป็นลิงก์เข้าห้องตรง'}</p>
                <div className="flex items-center justify-center gap-2"><code className="rounded bg-slate-100 px-2 py-1 font-bold">{info.bindCode}</code><button className="rounded p-1 hover:bg-slate-100" onClick={() => copy(info.bindCode)} title="คัดลอก"><Copy className="h-4 w-4" /></button></div>
                <button className="text-xs text-brand-700 underline" onClick={() => copy(info.joinUrl)}>คัดลอกลิงก์เข้าห้องของคนไข้</button>
              </div>)}
            <button className="btn mt-3 w-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50" onClick={ring} disabled={!linked || !!busy} title={linked ? '' : 'คนไข้ยังไม่ได้ผูก LINE'}>{busy === 'ring' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />} โทรหาคนไข้ทาง LINE</button>
            <p className="mt-1 text-xs text-slate-400">ระบบส่งปุ่ม "เข้าห้องวิดีโอคอล" ไปที่ LINE คนไข้ (ไม่ใช่สายเรียกเข้า)</p>
          </div>
          <div className="card flex h-[420px] flex-col p-0">
            <div className="flex items-center gap-2 border-b px-4 py-2 font-bold text-brand-900"><MessageCircle className="h-5 w-5" /> แชทกับคนไข้ (LINE OA)</div>
            <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-3 text-sm">
              {!chat.length && <p className="pt-10 text-center text-slate-400">ยังไม่มีข้อความ</p>}
              {chat.map((c) => c.system ? <div key={c.id} className="text-center text-xs text-slate-400">{c.text}</div> : (
                <div key={c.id} className={`flex ${c.dir === 'out' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-1.5 ${c.dir === 'out' ? 'bg-brand-600 text-white' : 'bg-white shadow'}`}>{c.text}</div></div>))}
              <div ref={endRef} />
            </div>
            <form onSubmit={send} className="flex gap-2 border-t p-2"><input className="input" placeholder={linked ? 'พิมพ์ข้อความถึงคนไข้…' : 'ต้องผูก LINE ก่อนจึงแชทได้'} value={msg} onChange={(e) => setMsg(e.target.value)} disabled={!linked} /><button className="btn btn-primary !px-3" disabled={!linked || !msg.trim() || !!busy}><Send className="h-4 w-4" /></button></form>
          </div>
        </div>
      </div>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
