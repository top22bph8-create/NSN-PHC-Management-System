// รายงานส่งออกกลุ่มเป้าหมายประชากร — กรองตามกลุ่มอายุ/หมู่บ้าน/เพศ/สิทธิ/สถานบริการ แล้วส่งออก Excel
// ข้อมูลมาจาก rightsRegistry (หมวด R*: ประชากรตามทะเบียนราษฎร์ ประเภทอาศัย 1,3) ที่สคริปต์ node sync.mjs --rights ส่งมา
// ไม่มีเลขบัตรประชาชน · เฉพาะเจ้าหน้าที่ที่ล็อกอินอ่านได้
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { FileSpreadsheet, RotateCcw, Search, Users } from 'lucide-react';
import { db } from '../firebase';
import { fmtDateTime } from '../lib/thai';
import { PageHeader } from '../components/Logo';
import { Spinner, Toast } from '../components/ui';

const nf = (n) => Number(n || 0).toLocaleString('th-TH');
const RT = { RUC: 'UC/WEL', ROFC: 'ข้าราชการ (OFC)', RSSS: 'ประกันสังคม (SSS)', RLGO: 'พนักงานท้องถิ่น (LGO)', RNRD: 'แรงงานต่างด้าว (NRD)', ROTH: 'สิทธิอื่นๆ', RNON: 'ไม่มีสิทธิ/สิทธิหมดอายุ' };
const AGES = [['0-4', 0, 4], ['5-14', 5, 14], ['15-24', 15, 24], ['25-34', 25, 34], ['35-44', 35, 44], ['45-59', 45, 59], ['60-69', 60, 69], ['70+', 70, 200]];
const SEXL = { 1: 'ชาย', 2: 'หญิง', '': 'ไม่ระบุ' };
const DIMS = { vil: 'หมู่บ้าน', age: 'กลุ่มอายุ', sex: 'เพศ', rt: 'ประเภทสิทธิ', hos: 'สถานบริการตามสิทธิ' };
const ageGroup = (a) => (AGES.find(([, lo, hi]) => a >= lo && a <= hi) || ['ไม่ทราบอายุ'])[0];
const vilOf = (addr) => { const m = /ม\.\s*(\d+)/.exec(addr || ''); const n = m ? Number(m[1]) : 0; return n ? `ม.${n}` : 'นอกเขต/ไม่ระบุ'; };
const vilNo = (v) => (/\d+/.test(v) ? Number(/\d+/.exec(v)[0]) : 999);

function Chip({ on, onClick, children }) {
  return <button type="button" onClick={onClick} className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ${on ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-600 ring-slate-300 hover:bg-brand-50'}`}>{children}</button>;
}
const toggle = (set, setSet, k) => { const n = new Set(set); n.has(k) ? n.delete(k) : n.add(k); setSet(n); };

export default function PopExport() {
  const [docs, setDocs] = useState(null);
  const [ages, setAges] = useState(new Set());
  const [aMin, setAMin] = useState(''); const [aMax, setAMax] = useState('');
  const [sexes, setSexes] = useState(new Set());
  const [vils, setVils] = useState(new Set());
  const [rts, setRts] = useState(new Set());
  const [hoses, setHoses] = useState(new Set());
  const [hosKw, setHosKw] = useState('');
  const [kw, setKw] = useState('');
  const [rowDim, setRowDim] = useState('vil'); const [colDim, setColDim] = useState('sex');
  const [withName, setWithName] = useState(true);
  const [toast, setToast] = useState(null);
  useEffect(() => onSnapshot(collection(db, 'rightsRegistry'), (s) => setDocs(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setDocs([])), []);

  const sum = docs?.find((d) => d.id === 'summary');
  const people = useMemo(() => {
    if (!docs) return [];
    const out = [];
    for (const k of Object.keys(RT)) {
      docs.filter((d) => d.cat === k).sort((a, b) => a.idx - b.idx).forEach((d) => (d.rows || []).forEach((r) => {
        const age = r[2] === '' || r[2] == null ? null : Number(r[2]);
        out.push({ pid: r[0], name: r[1], age, addr: r[3], tl: r[4], right: r[5], hos: r[6] || 'ไม่ระบุ', sex: r[8] || '', rt: k, vil: vilOf(r[3]), ag: age == null ? 'ไม่ทราบอายุ' : ageGroup(age) });
      }));
    }
    return out;
  }, [docs]);
  const hasSex = people.some((p) => p.sex);

  const vilList = useMemo(() => [...new Set(people.map((p) => p.vil))].sort((a, b) => vilNo(a) - vilNo(b)), [people]);
  const hosList = useMemo(() => { const m = {}; people.forEach((p) => { m[p.hos] = (m[p.hos] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); }, [people]);

  const list = useMemo(() => {
    const lo = aMin === '' ? null : Number(aMin); const hi = aMax === '' ? null : Number(aMax); const k = kw.trim();
    return people.filter((p) => (!ages.size || ages.has(p.ag)) && (lo == null || (p.age != null && p.age >= lo)) && (hi == null || (p.age != null && p.age <= hi))
      && (!sexes.size || sexes.has(p.sex)) && (!vils.size || vils.has(p.vil)) && (!rts.size || rts.has(p.rt)) && (!hoses.size || hoses.has(p.hos))
      && (!k || `${p.name} ${p.pid} ${p.addr}`.includes(k)));
  }, [people, ages, aMin, aMax, sexes, vils, rts, hoses, kw]);

  const label = (p, d) => (d === 'vil' ? p.vil : d === 'age' ? p.ag : d === 'sex' ? SEXL[p.sex] || 'ไม่ระบุ' : d === 'rt' ? RT[p.rt] : p.hos);
  const ordOf = (d, keys) => (d === 'vil' ? [...keys].sort((a, b) => vilNo(a) - vilNo(b)) : d === 'age' ? [...AGES.map((a) => a[0]), 'ไม่ทราบอายุ'].filter((k) => keys.has(k)) : [...keys].sort((a, b) => a.localeCompare(b, 'th')));
  const cross = useMemo(() => {
    const rk = new Set(); const ck = new Set(); const m = {};
    list.forEach((p) => { const r = label(p, rowDim); const c = label(p, colDim); rk.add(r); ck.add(c); m[r] = m[r] || {}; m[r][c] = (m[r][c] || 0) + 1; });
    return { rows: ordOf(rowDim, rk), cols: ordOf(colDim, ck), m };
  }, [list, rowDim, colDim]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => { setAges(new Set()); setAMin(''); setAMax(''); setSexes(new Set()); setVils(new Set()); setRts(new Set()); setHoses(new Set()); setKw(''); };
  const conds = () => [
    ages.size && `กลุ่มอายุ: ${[...ages].join(', ')}`, (aMin !== '' || aMax !== '') && `อายุ ${aMin || 0}–${aMax || 'ขึ้นไป'} ปี`, sexes.size && `เพศ: ${[...sexes].map((x) => SEXL[x]).join(', ')}`,
    vils.size && `หมู่บ้าน: ${[...vils].join(', ')}`, rts.size && `สิทธิ: ${[...rts].map((x) => RT[x]).join(', ')}`, hoses.size && `สถานบริการ: ${[...hoses].join(', ')}`, kw.trim() && `คำค้น: ${kw.trim()}`,
  ].filter(Boolean);

  const doExport = async () => {
    if (!list.length) { setToast({ type: 'error', text: 'ไม่มีรายชื่อตามเงื่อนไข' }); setTimeout(() => setToast(null), 4000); return; }
    const XLSX = await import('xlsx'); const wb = XLSX.utils.book_new();
    const rows = list.map((p, i) => {
      const o = { 'ลำดับ': i + 1 };
      if (withName) { o['เลข PID'] = p.pid; o['ชื่อ-สกุล'] = p.name; }
      o['เพศ'] = SEXL[p.sex] || 'ไม่ระบุ'; o['อายุ (ปี)'] = p.age ?? ''; o['กลุ่มอายุ'] = p.ag; o['หมู่บ้าน'] = p.vil;
      if (withName) o['ที่อยู่'] = p.addr;
      o['สิทธิการรักษา'] = p.right; o['ประเภทสิทธิ'] = RT[p.rt]; o['สถานบริการตามสิทธิ'] = p.hos; return o;
    });
    const ws = XLSX.utils.json_to_sheet(rows); ws['!cols'] = Object.keys(rows[0]).map((h) => ({ wch: Math.max(8, Math.min(40, h.length + 6)) }));
    XLSX.utils.book_append_sheet(wb, ws, 'รายชื่อ');
    const head = [`${DIMS[rowDim]} \\ ${DIMS[colDim]}`, ...cross.cols, 'รวม'];
    const body = cross.rows.map((r) => [r, ...cross.cols.map((c) => cross.m[r]?.[c] || 0), cross.cols.reduce((n, c) => n + (cross.m[r]?.[c] || 0), 0)]);
    body.push(['รวม', ...cross.cols.map((c) => cross.rows.reduce((n, r) => n + (cross.m[r]?.[c] || 0), 0)), list.length]);
    const info = [['รายงานประชากรตามเงื่อนไข — รพ.สต.บ้านหนองสนม'], [`ข้อมูล ณ ${sum?.asOf || ''}`], [`เงื่อนไข: ${conds().join(' | ') || 'ทั้งหมด'}`], [`จำนวน ${list.length} คน`], [], head, ...body];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(info), 'สรุป');
    XLSX.writeFile(wb, `ประชากรตามเงื่อนไข_${sum?.asOf || 'รายงาน'}.xlsx`);
  };

  if (!docs) return <Spinner />;
  return (
    <div className="space-y-4">
      <PageHeader icon={Users} emoji="👥" title="รายงานประชากรตามเงื่อนไข" subtitle={sum ? `ประชากรตามทะเบียนราษฎร์ (ประเภทอาศัย 1,3) · ข้อมูล ณ ${sum.asOf || ''}${sum.updatedAt?.toDate ? ` · ส่งล่าสุด ${fmtDateTime(sum.updatedAt)}` : ''}` : ''}
        actions={<button className="btn bg-white/15 text-white ring-1 ring-white/30 hover:bg-white/25" onClick={doExport}><FileSpreadsheet className="h-4 w-4" /> ส่งออก Excel</button>} />
      {!sum || people.length === 0 ? <p className="card p-6 text-slate-500">ยังไม่มีข้อมูล — ให้รันสคริปต์ที่เครื่อง JHCIS: <code>node sync.mjs --rights</code></p> : (
        <>
          {!hasSex && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">ข้อมูลชุดนี้ยังไม่มีเพศ — ให้รัน <code>node sync.mjs --rights</code> อีกครั้งด้วยสคริปต์เวอร์ชันใหม่ ตัวกรองเพศจึงจะใช้ได้</p>}
          <section className="card space-y-4 p-4">
            <div className="flex items-center justify-between"><h3 className="font-bold text-slate-700">กำหนดเงื่อนไข (ไม่เลือก = ทั้งหมด)</h3><button className="btn btn-outline" onClick={reset}><RotateCcw className="h-4 w-4" /> ล้างเงื่อนไข</button></div>
            <div><p className="mb-1 text-sm font-semibold text-slate-600">กลุ่มอายุ</p>
              <div className="flex flex-wrap items-center gap-2">
                {AGES.map(([k]) => <Chip key={k} on={ages.has(k)} onClick={() => toggle(ages, setAges, k)}>{k} ปี</Chip>)}
                <span className="ml-2 text-sm text-slate-500">หรือกำหนดเอง</span>
                <input className="input !w-20" type="number" min="0" placeholder="จาก" value={aMin} onChange={(e) => setAMin(e.target.value)} aria-label="อายุตั้งแต่" />
                <span className="text-sm">–</span>
                <input className="input !w-20" type="number" min="0" placeholder="ถึง" value={aMax} onChange={(e) => setAMax(e.target.value)} aria-label="อายุถึง" /><span className="text-sm text-slate-500">ปี</span>
              </div></div>
            <div className="grid gap-4 md:grid-cols-2">
              <div><p className="mb-1 text-sm font-semibold text-slate-600">เพศ</p><div className="flex flex-wrap gap-2">{['1', '2'].map((k) => <Chip key={k} on={sexes.has(k)} onClick={() => toggle(sexes, setSexes, k)}>{SEXL[k]}</Chip>)}</div></div>
              <div><p className="mb-1 text-sm font-semibold text-slate-600">ประเภทสิทธิการรักษา</p><div className="flex flex-wrap gap-2">{Object.entries(RT).map(([k, t]) => <Chip key={k} on={rts.has(k)} onClick={() => toggle(rts, setRts, k)}>{t}</Chip>)}</div></div>
            </div>
            <div><p className="mb-1 text-sm font-semibold text-slate-600">หมู่บ้าน</p><div className="flex flex-wrap gap-2">{vilList.map((k) => <Chip key={k} on={vils.has(k)} onClick={() => toggle(vils, setVils, k)}>{k}</Chip>)}</div></div>
            <div><p className="mb-1 text-sm font-semibold text-slate-600">สถานบริการตามสิทธิ {hoses.size > 0 && <span className="font-normal text-slate-500">(เลือกแล้ว {hoses.size})</span>}</p>
              <input className="input mb-2 !w-64" placeholder="ค้นหาชื่อสถานบริการ" value={hosKw} onChange={(e) => setHosKw(e.target.value)} />
              <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto rounded-lg bg-slate-50 p-2">
                {hosList.filter(([h]) => !hosKw.trim() || h.includes(hosKw.trim())).slice(0, 60).map(([h, n]) => <Chip key={h} on={hoses.has(h)} onClick={() => toggle(hoses, setHoses, h)}>{h} <span className="opacity-70">({nf(n)})</span></Chip>)}
              </div></div>
            <div className="relative max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className="input !pl-9" placeholder="ค้นหาชื่อ / PID / ที่อยู่" value={kw} onChange={(e) => setKw(e.target.value)} /></div>
          </section>

          <section className="card p-4">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <p className="text-lg font-bold text-brand-800">ตรงเงื่อนไข {nf(list.length)} คน <span className="text-sm font-normal text-slate-500">จากทั้งหมด {nf(people.length)} คน</span></p>
              <label className="ml-auto flex items-center gap-1.5 text-sm"><input type="checkbox" checked={withName} onChange={(e) => setWithName(e.target.checked)} /> ใส่ชื่อ-สกุล/PID/ที่อยู่ในไฟล์ Excel</label>
            </div>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-slate-600">ตารางสรุป แถว:</span>
              <select className="input !w-auto" value={rowDim} onChange={(e) => setRowDim(e.target.value)}>{Object.entries(DIMS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
              <span className="font-semibold text-slate-600">คอลัมน์:</span>
              <select className="input !w-auto" value={colDim} onChange={(e) => setColDim(e.target.value)}>{Object.entries(DIMS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead><tr className="border-b bg-slate-50 text-left text-slate-600"><th className="p-2">{DIMS[rowDim]}</th>{cross.cols.map((c) => <th key={c} className="p-2 text-right">{c}</th>)}<th className="p-2 text-right">รวม</th></tr></thead>
                <tbody>
                  {cross.rows.map((r) => (
                    <tr key={r} className="border-b last:border-0 hover:bg-sky-50"><td className="p-2">{r}</td>{cross.cols.map((c) => <td key={c} className="p-2 text-right tabular-nums">{nf(cross.m[r]?.[c] || 0)}</td>)}<td className="p-2 text-right font-semibold tabular-nums">{nf(cross.cols.reduce((n, c) => n + (cross.m[r]?.[c] || 0), 0))}</td></tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t-2 font-bold"><td className="p-2">รวม</td>{cross.cols.map((c) => <td key={c} className="p-2 text-right tabular-nums">{nf(cross.rows.reduce((n, r) => n + (cross.m[r]?.[c] || 0), 0))}</td>)}<td className="p-2 text-right tabular-nums">{nf(list.length)}</td></tr></tfoot>
              </table>
            </div>
          </section>

          <section className="card overflow-x-auto p-4">
            <h3 className="mb-2 font-bold text-slate-700">ตัวอย่างรายชื่อ (แสดง 100 รายการแรก — ไฟล์ Excel มีครบทุกคน)</h3>
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="border-b bg-slate-50 text-left text-slate-600"><th className="p-2">ชื่อ-สกุล</th><th className="p-2">เพศ</th><th className="p-2">อายุ</th><th className="p-2">หมู่บ้าน</th><th className="p-2">สิทธิ</th><th className="p-2">สถานบริการตามสิทธิ</th></tr></thead>
              <tbody>{list.slice(0, 100).map((p) => (<tr key={p.pid} className="border-b last:border-0"><td className="p-2">{p.name}</td><td className="p-2">{SEXL[p.sex] || '-'}</td><td className="p-2">{p.age ?? '-'}</td><td className="p-2">{p.vil}</td><td className="p-2">{p.right}</td><td className="p-2">{p.hos}</td></tr>))}</tbody>
            </table>
          </section>
        </>
      )}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
