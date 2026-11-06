// ติดตามผลงานปีงบประมาณ 2570 — ปฏิทินงาน/สถานะรายการ/ผลงานเทียบเป้า/ประมาณรายได้/ผู้รับผิดชอบ
// แผนงาน 46 รายการอยู่ใน src/lib/workPlan.js; ผลงาน เป้าหมาย ผู้รับผิดชอบ เก็บที่ Firestore workTrack/fy2570_{เลขรายการ}
// จำนวนฝากครรภ์ดึงจาก JHCIS อัตโนมัติ (serviceStats) ส่วนรายการอื่นเจ้าหน้าที่กรอก/ติ๊กเอง
import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { CalendarDays, ClipboardList, FileSpreadsheet, Loader2, Search } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { writeAudit } from '../lib/audit';
import { exportXlsx } from '../lib/exportFile';
import { sortPeople } from '../lib/leave';
import { FY, FY_END, FY_START, GROUPS, ITEMS, ST, periodLabel, periodsOf, summarize } from '../lib/workPlan';
import { fmtDate, todayStr } from '../lib/thai';
import { PageHeader } from '../components/Logo';
import { Modal, Spinner, Toast } from '../components/ui';

const nf = (n) => Number(n || 0).toLocaleString('th-TH');
const MONTHS = ['ต.ค.', 'พ.ย.', 'ธ.ค.', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.'];
const monthIdx = (d) => { const m = Number(d.slice(5, 7)); const y = Number(d.slice(0, 4)); return (y - 2026) * 12 + (m - 10); };
const docId = (n) => `fy${FY}_${n}`;
const Pill = ({ st }) => <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${ST[st].cls}`}>{ST[st].label}</span>;

function ItemModal({ item, rec, auto, people, profile, onClose, say }) {
  const [owners, setOwners] = useState(() => new Set((rec?.owners || []).map((o) => o.email)));
  const [target, setTarget] = useState(rec?.target ?? '');
  const [note, setNote] = useState(rec?.note || '');
  const [per, setPer] = useState(() => JSON.parse(JSON.stringify(rec?.periods || {})));
  const [busy, setBusy] = useState(false);
  const today = todayStr();
  const cur = useMemo(() => summarize(item, { target, periods: per }, today, auto), [item, target, per, auto, today]);
  const setP = (k, patch) => setPer((p) => ({ ...p, [k]: { ...(p[k] || {}), ...patch } }));
  const save = async () => {
    setBusy(true);
    try {
      const picked = people.filter((p) => owners.has(p.email)).map((p) => ({ email: p.email, name: p.name || p.email }));
      const periods = {};
      Object.entries(per).forEach(([k, v]) => { const o = {}; if (v.n !== '' && v.n != null) o.n = Number(v.n); if (v.done) o.done = true; if (Object.keys(o).length) periods[k] = o; });
      const s = summarize(item, { target: Number(target) || 0, periods }, today, auto);
      const data = {
        itemId: item.n, fy: FY, title: item.t, group: item.g, owners: picked, ownerEmails: picked.map((o) => o.email), target: Number(target) || 0, periods, note: note.trim(),
        deadlines: s.rows.filter((r) => !r.done).map((r) => ({ key: r.key, label: periodLabel(item, r), end: r.end })),
        updatedAt: serverTimestamp(), updatedBy: profile.email, updatedByName: profile.name || profile.email,
      };
      await setDoc(doc(db, 'workTrack', docId(item.n)), data);
      await writeAudit({ action: 'update', module: 'work-tracker', docId: docId(item.n), label: `${item.n}. ${item.t}`, after: { target: data.target, owners: picked.map((o) => o.name), total: s.total } });
      say({ type: 'ok', text: 'บันทึกแล้ว' }); onClose();
    } catch (e) { say({ type: 'error', text: 'ไม่สำเร็จ: ' + (e.code || e.message) }); } finally { setBusy(false); }
  };
  const toggle = (email) => setOwners((s) => { const n = new Set(s); n.has(email) ? n.delete(email) : n.add(email); return n; });
  return (
    <Modal title={`${item.n}. ${item.t}`} onClose={onClose} wide footer={<><button className="btn-outline" onClick={onClose}>ยกเลิก</button><button className="btn-primary" disabled={busy} onClick={save}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'บันทึก'}</button></>}>
      <div className="space-y-4 text-sm">
        <p className="text-slate-500">{GROUPS[item.g - 1].name} · ช่วง {fmtDate(item.s)} – {fmtDate(item.e)}{item.rate ? ` · อัตรา ${item.rate.baht ? `${item.rate.baht} บาท` : `${item.rate.pts} คะแนน`}/${item.rate.per}` : ''}{item.note ? ` · ${item.note}` : ''}</p>
        <div>
          <label className="mb-1 block font-medium">ผู้รับผิดชอบ</label>
          <div className="grid max-h-40 gap-1 overflow-auto rounded border p-2 sm:grid-cols-2">
            {people.map((p) => <label key={p.email} className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={owners.has(p.email)} onChange={() => toggle(p.email)} />{p.name || p.email}</label>)}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="mb-1 block font-medium">เป้าหมายทั้งปีงบ (จำนวน)</label><input className="input" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^0-9]/g, ''))} placeholder="เว้นว่าง = ไม่ตั้งเป้า" /></div>
          <div><label className="mb-1 block font-medium">หมายเหตุ</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        <div>
          <div className="mb-1 font-medium">ผลงานรายรอบ {item.auto && <span className="ml-1 rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-700">ดึงจาก JHCIS อัตโนมัติ (พิมพ์ทับได้)</span>}</div>
          <table className="w-full">
            <thead><tr className="border-b text-left text-slate-500"><th className="py-1">รอบ</th><th>ครบกำหนด</th><th className="w-28">จำนวนที่ทำได้</th><th>เสร็จ</th><th>สถานะ</th></tr></thead>
            <tbody>{cur.rows.map((r) => (
              <tr key={r.key} className="border-b last:border-0">
                <td className="py-1">{periodLabel(item, r)}</td><td>{fmtDate(r.end)}</td>
                <td><input className="input !py-1" inputMode="numeric" value={per[r.key]?.n ?? ''} placeholder={auto[r.key] != null ? String(auto[r.key]) : '0'} onChange={(e) => setP(r.key, { n: e.target.value.replace(/[^0-9]/g, '') })} /></td>
                <td><input type="checkbox" className="h-4 w-4" checked={!!per[r.key]?.done} onChange={(e) => setP(r.key, { done: e.target.checked })} /></td>
                <td><Pill st={r.status} /></td>
              </tr>))}</tbody>
          </table>
        </div>
        <p className="rounded bg-slate-50 p-2">รวมผลงาน <b>{nf(cur.total)}</b>{Number(target) > 0 ? ` / เป้า ${nf(target)} (${cur.pct}%)` : ''}{cur.baht ? ` · ประมาณรายได้ ${nf(cur.baht)} บาท` : ''}{cur.pts ? ` · ประมาณ ${nf(cur.pts)} คะแนน` : ''}</p>
      </div>
    </Modal>
  );
}

export default function WorkTracker() {
  const { profile } = useAuth();
  const [tab, setTab] = useState('sum');
  const [recs, setRecs] = useState(null);
  const [people, setPeople] = useState(null);
  const [anc, setAnc] = useState({});
  const [edit, setEdit] = useState(null);
  const [toast, setToast] = useState(null);
  const [f, setF] = useState({ g: '', st: '', owner: '', q: '' });
  const say = (t) => { setToast(t); setTimeout(() => setToast(null), 4000); };
  const today = todayStr();

  useEffect(() => onSnapshot(collection(db, 'workTrack'), (s) => setRecs(Object.fromEntries(s.docs.map((d) => [d.id, d.data()]))), () => setRecs({})), []);
  useEffect(() => onSnapshot(collection(db, 'users'), (s) => setPeople(sortPeople(s.docs.map((d) => d.data()).filter((u) => u.role !== 'pending'))), () => setPeople([])), []);
  useEffect(() => onSnapshot(query(collection(db, 'serviceStats'), where('date', '>=', FY_START), where('date', '<=', FY_END), orderBy('date')), (s) => {
    const m = {}; s.docs.forEach((d) => { const x = d.data(); const k = String(x.date).slice(0, 7); m[k] = (m[k] || 0) + Number(x.anc || 0); }); setAnc(m);
  }, () => setAnc({})), []);

  const autoOf = (it) => (it.auto === 'anc' ? anc : {});
  const rows = useMemo(() => (recs ? ITEMS.map((it) => { const rec = recs[docId(it.n)]; return { it, rec, s: summarize(it, rec, today, autoOf(it)) }; }) : []), [recs, anc, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => rows.filter(({ it, rec, s }) => (!f.g || it.g === Number(f.g)) && (!f.st || s.status === f.st) && (!f.owner || (rec?.ownerEmails || []).includes(f.owner)) && (!f.q || `${it.n} ${it.t}`.includes(f.q))), [rows, f]);
  if (!recs || !people) return <Spinner />;

  const cnt = (st) => rows.filter((r) => r.s.status === st).length;
  const baht = rows.reduce((a, r) => a + r.s.baht, 0); const pts = rows.reduce((a, r) => a + r.s.pts, 0);
  const urgent = rows.filter((r) => r.s.status === 'overdue' || r.s.status === 'soon').sort((a, b) => (a.s.status === b.s.status ? (a.s.next?.end || '').localeCompare(b.s.next?.end || '') : a.s.status === 'overdue' ? -1 : 1));
  const byOwner = {};
  rows.forEach(({ rec, s }) => (rec?.owners || []).forEach((o) => { const x = (byOwner[o.email] ||= { name: o.name, n: 0, over: 0, soon: 0, done: 0 }); x.n++; if (s.status === 'overdue') x.over++; if (s.status === 'soon') x.soon++; if (s.status === 'done') x.done++; }));
  const unassigned = rows.filter((r) => !(r.rec?.owners || []).length).length;
  const ownerText = (rec) => (rec?.owners || []).map((o) => o.name).join(', ');
  const toXlsx = () => exportXlsx(rows.map(({ it, rec, s }) => ({ 'ที่': it.n, 'กลุ่มงาน': GROUPS[it.g - 1].name, 'กิจกรรม': it.t, 'ผู้รับผิดชอบ': ownerText(rec), 'สถานะ': ST[s.status].label, 'เป้าหมาย': rec?.target || '', 'ผลงานรวม': s.total, 'ร้อยละ': s.pct, 'ประมาณรายได้ (บาท)': s.baht || '', 'ประมาณคะแนน': s.pts || '', 'ครบกำหนดถัดไป': s.next ? fmtDate(s.next.end) : '' })), 'ติดตามผลงาน', `ติดตามผลงาน_ปีงบ${FY}`);

  const Kpi = ({ label, v, cls = '' }) => <div className="card p-3"><div className="text-xs text-slate-500">{label}</div><div className={`text-2xl font-bold tabular-nums ${cls}`}>{v}</div></div>;
  return (
    <div className="space-y-4">
      <PageHeader title={`ติดตามผลงานปีงบประมาณ ${FY}`} subtitle="ปฏิทินงาน สถานะรายการ ผลงานเทียบเป้าหมาย ประมาณรายได้ และผู้รับผิดชอบ" actions={<button className="btn-outline" onClick={toXlsx}><FileSpreadsheet className="h-4 w-4" /> ส่งออก Excel</button>} />
      <div className="flex gap-2">
        {[['sum', 'ภาพรวม', ClipboardList], ['cal', 'ปฏิทินงาน/รายการ', CalendarDays]].map(([k, t, Ic]) => <button key={k} onClick={() => setTab(k)} className={`${tab === k ? 'btn-primary' : 'btn-outline'} gap-1`}><Ic className="h-4 w-4" />{t}</button>)}
      </div>

      {tab === 'sum' && (<>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Kpi label="รายการทั้งหมด" v={ITEMS.length} />
          <Kpi label="เสร็จแล้ว" v={cnt('done')} cls="text-emerald-600" />
          <Kpi label="ใกล้ครบกำหนด (≤14 วัน)" v={cnt('soon')} cls="text-amber-600" />
          <Kpi label="เลยกำหนด" v={cnt('overdue')} cls="text-rose-600" />
          <Kpi label="ประมาณรายได้สะสม" v={<>{nf(baht)}<span className="text-sm font-normal text-slate-500"> บาท{pts ? ` + ${nf(pts)} คะแนน` : ''}</span></>} />
        </div>
        <section className="card p-4">
          <h3 className="mb-2 font-bold text-slate-700">ความก้าวหน้าแยกกลุ่มงาน</h3>
          <ul className="space-y-2">{GROUPS.map((g) => {
            const gr = rows.filter((r) => r.it.g === g.id); const avg = Math.round(gr.reduce((a, r) => a + r.s.pct, 0) / gr.length);
            return (<li key={g.id}><button className="w-full text-left" onClick={() => { setF({ ...f, g: String(g.id) }); setTab('cal'); }}>
              <div className="flex justify-between text-sm"><span>{g.id}. {g.name} <span className="text-slate-400">({gr.length} รายการ)</span></span><b className="tabular-nums">{avg}%</b></div>
              <div className="h-2.5 rounded-full bg-slate-100"><div className="h-2.5 rounded-full bg-gradient-to-r from-sky-600 to-emerald-400" style={{ width: `${avg}%` }} /></div></button></li>);
          })}</ul>
        </section>
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card p-4">
            <h3 className="mb-2 font-bold text-slate-700">ต้องติดตามเร่งด่วน ({urgent.length})</h3>
            {urgent.length === 0 ? <p className="text-sm text-slate-400">ไม่มีรายการเลยกำหนดหรือใกล้ครบกำหนด</p> : (
              <ul className="max-h-96 space-y-1 overflow-auto text-sm">{urgent.slice(0, 40).map(({ it, rec, s }) => (
                <li key={it.n}><button className="flex w-full items-start justify-between gap-2 rounded px-1 py-1 text-left hover:bg-slate-50" onClick={() => setEdit(it)}>
                  <span><b>{it.n}.</b> {it.t}<br /><span className="text-xs text-slate-500">{s.next ? `${periodLabel(it, s.next)} · ครบ ${fmtDate(s.next.end)}` : ''} · {ownerText(rec) || 'ยังไม่มอบหมาย'}</span></span><Pill st={s.status} /></button></li>))}</ul>)}
          </section>
          <section className="card p-4">
            <h3 className="mb-2 font-bold text-slate-700">ผู้รับผิดชอบรายคน</h3>
            <table className="w-full text-sm"><thead><tr className="border-b text-left text-slate-500"><th className="py-1">ชื่อ</th><th className="text-right">รายการ</th><th className="text-right">เสร็จ</th><th className="text-right">ใกล้ครบ</th><th className="text-right">เลยกำหนด</th></tr></thead>
              <tbody>{Object.entries(byOwner).sort((a, b) => b[1].over - a[1].over || b[1].n - a[1].n).map(([email, x]) => (
                <tr key={email} className="cursor-pointer border-b last:border-0 hover:bg-slate-50" onClick={() => { setF({ ...f, owner: email }); setTab('cal'); }}><td className="py-1">{x.name}</td><td className="text-right">{x.n}</td><td className="text-right text-emerald-700">{x.done}</td><td className="text-right text-amber-700">{x.soon}</td><td className="text-right text-rose-700">{x.over}</td></tr>))}</tbody></table>
            <p className="mt-2 text-xs text-slate-500">ยังไม่มอบหมายผู้รับผิดชอบ {unassigned} รายการ — เปิดรายการเพื่อเลือกผู้รับผิดชอบ</p>
          </section>
        </div>
        <p className="text-xs text-slate-500">สถานะคิดจากรอบที่ครบกำหนด: รอบถือว่าเสร็จเมื่อติ๊กเสร็จ หรือผลงานถึงเป้าต่อรอบ (เป้าทั้งปี ÷ จำนวนรอบ) หากไม่ตั้งเป้า มีผลงานในรอบ = เสร็จ · ประมาณรายได้ = ผลงาน × อัตราจ่ายตามเว็บอ้างอิง ใช้ประกอบการติดตามเท่านั้น ไม่ใช่ยอดเบิกจ่ายจริง</p>
      </>)}

      {tab === 'cal' && (<>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-44 flex-1"><Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" /><input className="input pl-8" placeholder="ค้นหากิจกรรม" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
          <select className="input !w-auto" value={f.g} onChange={(e) => setF({ ...f, g: e.target.value })}><option value="">ทุกกลุ่มงาน</option>{GROUPS.map((g) => <option key={g.id} value={g.id}>{g.id}. {g.name}</option>)}</select>
          <select className="input !w-auto" value={f.st} onChange={(e) => setF({ ...f, st: e.target.value })}><option value="">ทุกสถานะ</option>{Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          <select className="input !w-auto" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })}><option value="">ทุกผู้รับผิดชอบ</option>{people.map((p) => <option key={p.email} value={p.email}>{p.name || p.email}</option>)}</select>
          {profile?.email && <button className={f.owner === profile.email ? 'btn-primary' : 'btn-outline'} onClick={() => setF({ ...f, owner: f.owner === profile.email ? '' : profile.email })}>งานของฉัน</button>}
          <span className="text-sm text-slate-500">{shown.length} รายการ</span>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">{Object.entries(ST).map(([k, v]) => <span key={k} className="flex items-center gap-1"><span className={`inline-block h-3 w-3 rounded ${v.cell}`} />{v.label}</span>)}</div>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[1000px] border-collapse text-sm">
            <thead><tr className="bg-slate-50 text-left text-slate-500"><th className="px-2 py-1">#</th><th className="px-2">กิจกรรม</th><th className="px-2">ผู้รับผิดชอบ</th>{MONTHS.map((m) => <th key={m} className="w-12 text-center text-xs">{m}</th>)}<th className="px-2 text-right">ผลงาน</th><th className="px-2">สถานะ</th></tr></thead>
            <tbody>{GROUPS.map((g) => {
              const list = shown.filter((r) => r.it.g === g.id); if (!list.length) return null;
              return [<tr key={`g${g.id}`}><td colSpan={17} className="bg-slate-100 px-2 py-1 font-bold text-slate-700">{g.id}. {g.name}</td></tr>,
                ...list.map(({ it, rec, s }) => {
                  const cells = []; let i = 0;
                  const segs = s.rows.map((r) => ({ a: Math.max(0, monthIdx(r.start)), b: Math.min(11, monthIdx(r.end)), r })).filter((x) => x.b >= 0 && x.a <= 11).sort((x, y) => x.a - y.a);
                  segs.forEach((sg) => { if (sg.a > i) cells.push(<td key={`e${i}`} colSpan={sg.a - i} />); cells.push(<td key={sg.r.key} colSpan={sg.b - sg.a + 1} className="p-0.5"><div title={`${periodLabel(it, sg.r)} · ครบ ${fmtDate(sg.r.end)} · ${ST[sg.r.status].label}${sg.r.n ? ` · ทำได้ ${sg.r.n}` : ''}`} className={`flex h-6 items-center justify-center rounded text-xs ${ST[sg.r.status].cell} ${sg.r.status === 'future' ? 'text-slate-500' : 'text-white'}`}>{sg.r.n || ''}</div></td>); i = sg.b + 1; });
                  if (i < 12) cells.push(<td key="tail" colSpan={12 - i} />);
                  return (<tr key={it.n} className="cursor-pointer border-b hover:bg-sky-50" onClick={() => setEdit(it)}>
                    <td className="px-2 py-1 text-slate-400">{it.n}</td><td className="px-2">{it.t}</td><td className="px-2 text-xs text-slate-600">{ownerText(rec) || <span className="text-slate-300">-</span>}</td>{cells}
                    <td className="px-2 text-right tabular-nums">{nf(s.total)}{rec?.target ? <span className="text-xs text-slate-400"> /{nf(rec.target)}</span> : null}<div className="text-xs text-slate-400">{s.pct}%</div></td><td className="px-2"><Pill st={s.status} /></td></tr>);
                })];
            })}</tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">กดที่แถวเพื่อมอบหมายผู้รับผิดชอบ ตั้งเป้าหมาย และบันทึกผลงานรายรอบ · ตัวเลขในช่องคือผลงานที่ทำได้ในรอบนั้น</p>
      </>)}
      {edit && <ItemModal item={edit} rec={recs[docId(edit.n)]} auto={autoOf(edit)} people={people} profile={profile} onClose={() => setEdit(null)} say={say} />}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
