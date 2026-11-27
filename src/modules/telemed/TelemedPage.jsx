// หน้า Telemedicine = ทะเบียนนัด/บันทึกบริการ (CareLog) + ปุ่ม "เข้าห้อง" ต่อแถว + ตั้งค่า (Super Admin)
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { Loader2, Settings, Video } from 'lucide-react';
import { functions } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import CareLog from '../../components/CareLog';
import { Modal } from '../../components/ui';
import { TELEMED } from '../../config/careLogs';

function SettingsModal({ onClose }) {
  const [key, setKey] = useState(''); const [tok, setTok] = useState(''); const [oa, setOa] = useState('@678qxlha'); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const save = async () => {
    setBusy(true); setMsg('');
    try { const r = await httpsCallable(functions, 'telemedSaveSettings')({ dailyApiKey: key, lineToken: tok, oaBasicId: oa }); setMsg(`บันทึกแล้ว · Daily API Key: ${r.data.hasKey ? 'ตั้งแล้ว' : 'ยังไม่ตั้ง'} · โทเคน OA ผู้ป่วย: ${r.data.hasLineToken ? 'ตั้งแล้ว' + (r.data.botName ? ` (${r.data.botName})` : '') : 'ยังไม่ตั้ง'} · OA: ${r.data.oaBasicId || '-'}`); setKey(''); setTok(''); }
    catch (e) { setMsg('ไม่สำเร็จ: ' + (e.message || e.code)); } finally { setBusy(false); }
  };
  return (
    <Modal title="ตั้งค่า Telemedicine (วิดีโอคอล + LINE OA)" onClose={onClose} footer={<><button className="btn btn-outline" onClick={onClose}>ปิด</button><button className="btn btn-primary" onClick={save} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} บันทึก</button></>}>
      <div className="space-y-3 text-sm">
        <label className="block"><span className="mb-1 block font-medium">Daily API Key</span><input className="input" type="password" autoComplete="off" placeholder="วางคีย์จาก dashboard.daily.co → Developers (เว้นว่างถ้าไม่เปลี่ยน)" value={key} onChange={(e) => setKey(e.target.value)} /><span className="text-xs text-slate-400">เก็บฝั่งเซิร์ฟเวอร์เท่านั้น ไม่แสดงกลับมา</span></label>
        <label className="block"><span className="mb-1 block font-medium">Channel access token ของ OA ผู้ป่วย</span><input className="input" type="password" autoComplete="off" placeholder="วางโทเคนจาก LINE Developers → Messaging API → Issue (เว้นว่างถ้าไม่เปลี่ยน)" value={tok} onChange={(e) => setTok(e.target.value)} /><span className="text-xs text-slate-400">ใช้ส่งปุ่มเข้าห้อง/แชทหาคนไข้ แยกจากไลน์แจ้งเตือนภายใน · ระบบจะตรวจโทเคนให้ตอนบันทึก</span></label>
        <label className="block"><span className="mb-1 block font-medium">LINE OA Basic ID</span><input className="input" placeholder="เช่น @123abcde (ดูได้ใน LINE Official Account Manager → หน้าแรก)" value={oa} onChange={(e) => setOa(e.target.value)} /><span className="text-xs text-slate-400">ใช้สร้าง QR ให้คนไข้สแกนแล้วเปิดแชท OA พร้อมรหัสนัด</span></label>
        {msg && <p className="rounded bg-slate-50 p-2 text-slate-700">{msg}</p>}
      </div>
    </Modal>
  );
}

export default function TelemedPage() {
  const { profile } = useAuth(); const [show, setShow] = useState(false);
  const admin = profile.role === 'super_admin';
  return (
    <>
      <CareLog cfg={TELEMED}
        headerExtra={admin && <button className="btn bg-white/20 text-white hover:bg-white/30" onClick={() => setShow(true)}><Settings className="h-5 w-5" /> ตั้งค่าห้อง/LINE</button>}
        rowExtra={(r) => <Link to={`/telemedicine/room/${r.id}`} className="mr-1 inline-flex items-center gap-1 rounded bg-teal-600 px-2 py-1 text-xs font-semibold text-white hover:bg-teal-700" title="เข้าห้องตรวจ"><Video className="h-3.5 w-3.5" /> ห้องตรวจ{r.unreadChat ? <span className="rounded-full bg-amber-400 px-1.5 text-[10px] text-slate-900">{r.unreadChat}</span> : null}</Link>} />
      {show && <SettingsModal onClose={() => setShow(false)} />}
    </>
  );
}
