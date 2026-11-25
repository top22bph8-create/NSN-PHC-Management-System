// การ์ด "ผู้รับบริการ รพ.สต. (จาก JHCIS)" บนแดชบอร์ด: ตัวเลขรายวัน (วันนี้/เมื่อวาน/7 วัน) + รายชื่อผู้รับบริการรายวัน
// ตัวเลขอ่านจาก serviceStats/{วัน} · รายชื่ออ่านจาก serviceRoster/{วัน} (ทั้งคู่ส่งมาจากสคริปต์ sync.mjs บนเครื่อง JHCIS)
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, getDoc, onSnapshot, query, where, documentId } from 'firebase/firestore';
import { Activity, FileSpreadsheet, Search, Users } from 'lucide-react';
import { db } from '../firebase';
import { exportXlsx } from '../lib/exportFile';
import { addDays, fmtDate, todayStr } from '../lib/thai';
import ThaiDateInput from './ThaiDateInput';
import { Modal, Spinner } from './ui';

const SEX = { 1: 'ชาย', 2: 'หญิง' };
const nf = (n) => Number(n || 0).toLocaleString('th-TH');
const dow = (s) => ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'][new Date(`${s}T00:00:00`).getDay()];

function RosterModal({ initial, onClose }) {
  const [day, setDay] = useState(initial);
  const [doc_, setDoc] = useState(undefined); // undefined = กำลังโหลด, null = ไม่มีข้อมูล
  const [q, setQ] = useState('');
  useEffect(() => {
    let live = true; setDoc(undefined);
    getDoc(doc(db, 'serviceRoster', day)).then((s) => { if (live) setDoc(s.exists() ? s.data() : null); }).catch(() => { if (live) setDoc(null); });
    return () => { live = false; };
  }, [day]);
  const rows = useMemo(() => {
    const k = q.trim().toLowerCase();
    return (doc_?.rows || []).filter((r) => !k || r.slice(0, 7).join(' ').toLowerCase().includes(k));
  }, [doc_, q]);
  const exp = () => exportXlsx(rows.map((r, i) => ({ 'ลำดับ': i + 1, 'HN/PID': r[0], 'ชื่อ-สกุล': r[1], 'อายุ': r[2], 'เพศ': SEX[r[3]] || '', 'หมู่บ้าน': r[4], 'สิทธิ': r[5], 'รหัสวินิจฉัย': r[6] })), 'ผู้รับบริการ', `ผู้รับบริการ_${day}`);
  return (
    <Modal wide title={`รายชื่อผู้รับบริการ ${fmtDate(day)}`} onClose={onClose}
      footer={<button className="btn btn-outline" disabled={!rows.length} onClick={exp}><FileSpreadsheet className="h-4 w-4" /> ส่งออก Excel</button>}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-44"><ThaiDateInput value={day} onChange={(v) => v && setDay(v)} yearsBack={3} yearsForward={0} /></div>
        <button className="btn btn-outline !px-2.5 !py-1.5 text-sm" onClick={() => setDay(todayStr())}>วันนี้</button>
        <button className="btn btn-outline !px-2.5 !py-1.5 text-sm" onClick={() => setDay(addDays(todayStr(), -1))}>เมื่อวาน</button>
        <input className="input min-w-0 flex-1 basis-40 !py-1.5" placeholder="พิมพ์ชื่อ / หมู่บ้าน / สิทธิ / รหัสโรค" value={q} onChange={(e) => setQ(e.target.value)} aria-label="ค้นหาในรายชื่อ" />
      </div>
      {doc_ === undefined ? <Spinner /> : doc_ === null ? (
        <p className="py-10 text-center text-slate-400">ยังไม่มีรายชื่อของวันนี้ในระบบ (ตรวจว่าสคริปต์ซิงก์บนเครื่อง JHCIS เป็นรุ่นใหม่แล้ว และกด "ประมวลผลทันที")</p>
      ) : (
        <>
          <p className="mb-2 text-sm text-slate-500">ทั้งหมด <b className="text-slate-800">{nf(doc_.total)}</b> ครั้ง{q.trim() ? ` · ตรงกับคำค้น ${nf(rows.length)}` : ''}</p>
          {/* มือถือ: การ์ดต่อคน · คอม: ตาราง */}
          <ul className="space-y-1.5 sm:hidden">
            {rows.map((r, i) => (
              <li key={`${r[0]}-${i}`} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <div className="flex items-baseline justify-between gap-2"><b className="min-w-0 truncate">{i + 1}. {r[1]}</b><span className="shrink-0 text-xs text-slate-500">{r[2] !== '' ? `${r[2]} ปี` : ''} {SEX[r[3]] || ''}</span></div>
                <div className="text-xs text-slate-500">{[r[4], r[5]].filter(Boolean).join(' · ')}</div>
                {r[6] && <div className="text-xs text-sky-700">{r[6]}</div>}
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-slate-500"><th className="p-1.5">#</th><th className="p-1.5">ชื่อ-สกุล</th><th className="p-1.5">อายุ</th><th className="p-1.5">เพศ</th><th className="p-1.5">หมู่บ้าน</th><th className="p-1.5">สิทธิ</th><th className="p-1.5">รหัสวินิจฉัย</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r[0]}-${i}`} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-1.5 tabular-nums text-slate-400">{i + 1}</td><td className="p-1.5 font-medium">{r[1]}</td><td className="p-1.5 tabular-nums">{r[2]}</td><td className="p-1.5">{SEX[r[3]] || ''}</td><td className="p-1.5">{r[4]}</td><td className="p-1.5">{r[5]}</td><td className="p-1.5 text-sky-700">{r[6]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && <p className="py-6 text-center text-slate-400">ไม่พบรายการ</p>}
        </>
      )}
    </Modal>
  );
}

export default function DashboardService() {
  const [stats, setStats] = useState(null); // { 'YYYY-MM-DD': {visits, persons} }
  const [open, setOpen] = useState(null);
  const today = todayStr();
  const from = addDays(today, -6);
  useEffect(() => {
    const qy = query(collection(db, 'serviceStats'), where(documentId(), '>=', from), where(documentId(), '<=', today));
    return onSnapshot(qy, (s) => setStats(Object.fromEntries(s.docs.map((d) => [d.id, d.data()]))), () => setStats({}));
  }, [from, today]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = addDays(from, i); return { d, visits: stats?.[d]?.visits ?? null, persons: stats?.[d]?.persons ?? null }; }), [stats, from]);
  const t = stats?.[today]; const y = stats?.[addDays(today, -1)];
  const week = days.reduce((n, x) => n + (x.visits || 0), 0);
  const max = Math.max(1, ...days.map((x) => x.visits || 0));
  return (
    <div className="card mb-5 overflow-hidden">
      <div className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-500 px-4 py-2.5 text-white">
        <Activity className="h-5 w-5 shrink-0" /><h3 className="min-w-0 flex-1 text-sm font-bold !text-white sm:text-base">ผู้รับบริการ รพ.สต. (จาก JHCIS)</h3>
        <Link to="/service-stats" className="shrink-0 text-xs underline opacity-90 hover:opacity-100">รายงานเต็ม</Link>
      </div>
      {stats === null ? <div className="p-4"><Spinner /></div> : (
        <div className="grid gap-4 p-4 md:grid-cols-[auto_1fr]">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 md:w-[26rem]">
            {[
              ['วันนี้ (ครั้ง)', t ? nf(t.visits) : '–', 'bg-emerald-50 text-emerald-700'],
              ['วันนี้ (คน)', t ? nf(t.persons) : '–', 'bg-teal-50 text-teal-700'],
              ['เมื่อวาน (ครั้ง)', y ? nf(y.visits) : '–', 'bg-sky-50 text-sky-700'],
              ['7 วันล่าสุด', nf(week), 'bg-indigo-50 text-indigo-700'],
            ].map(([l, v, c]) => (
              <div key={l} className={`min-w-0 rounded-xl px-3 py-2 ${c}`}><div className="text-2xl font-extrabold leading-tight tabular-nums">{v}</div><div className="truncate text-xs">{l}</div></div>
            ))}
          </div>
          <div className="min-w-0">
            <div className="flex h-24 items-end gap-1.5" role="img" aria-label="กราฟจำนวนครั้งที่รับบริการ 7 วันล่าสุด">
              {days.map((x) => (
                <button key={x.d} type="button" onClick={() => setOpen(x.d)} title={`${fmtDate(x.d)}: ${x.visits ?? 'ไม่มีข้อมูล'} ครั้ง — กดดูรายชื่อ`} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-0.5">
                  <span className="text-[11px] font-semibold tabular-nums text-slate-600">{x.visits ?? '–'}</span>
                  <span className={`w-full rounded-t ${x.d === today ? 'bg-gradient-to-t from-emerald-600 to-emerald-400' : 'bg-gradient-to-t from-slate-300 to-slate-200 group-hover:from-emerald-500 group-hover:to-emerald-300'}`} style={{ height: `${Math.max(3, ((x.visits || 0) / max) * 100)}%`, maxHeight: '4rem' }} />
                  <span className="text-[10px] text-slate-500">{dow(x.d)}</span>
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="btn btn-primary !px-3 !py-1.5 text-sm" onClick={() => setOpen(today)}><Users className="h-4 w-4" /> รายชื่อผู้รับบริการวันนี้</button>
              <button className="btn btn-outline !px-3 !py-1.5 text-sm" onClick={() => setOpen(addDays(today, -1))}><Search className="h-4 w-4" /> ดูรายวันอื่น</button>
            </div>
            {!t && <p className="mt-1.5 text-xs text-slate-400">ยังไม่มีตัวเลขของวันนี้ — ข้อมูลมาจากการซิงก์ JHCIS (กด "ประมวลผลทันที" ในรายงานเต็มได้)</p>}
          </div>
        </div>
      )}
      {open && <RosterModal initial={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
