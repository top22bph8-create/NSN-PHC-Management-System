// แผนที่การระบาด / Spot map (Leaflet): ภาพถ่ายดาวเทียมความละเอียดสูง (Esri World Imagery) หรือแผนที่ถนน OpenStreetMap
// - แสดงขอบเขตเขตรับผิดชอบ/หมู่บ้านที่วาดไว้ · จุดผู้ป่วย / คลัสเตอร์ / Heatmap
// - ลากหมุดเพื่อย้ายตำแหน่ง · คลิกแผนที่เพื่อปักหมุดผู้ป่วยใหม่ หรือวางพิกัดให้ผู้ป่วยที่ยังไม่มีพิกัด · วาด/แก้ไขขอบเขต
// ความเป็นส่วนตัว: ป๊อปอัปแสดงเฉพาะหมู่บ้าน กลุ่มอายุ วันเริ่มป่วย สถานะ — ไม่แสดงชื่อ เลขบัตร บ้านเลขที่
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fmtDate } from '../../lib/thai';
import { ageBand, isDead, vilLabel } from './outbreakLib';

const okPt = (p) => p.lat !== '' && p.lng !== '' && p.lat != null && p.lng != null && isFinite(p.lat) && isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dot = (color, size = 18) => L.divIcon({ className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2], html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 0 4px rgba(0,0,0,.7)"></span>` });
const vtx = L.divIcon({ className: '', iconSize: [16, 16], iconAnchor: [8, 8], html: '<span style="display:block;width:16px;height:16px;border-radius:3px;background:#facc15;border:2px solid #111;box-shadow:0 0 3px rgba(0,0,0,.8)"></span>' });
const BASES = {
  sat: ['ภาพถ่ายดาวเทียม', 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', 'Imagery &copy; Esri, Maxar, Earthstar Geographics และผู้ให้ข้อมูลอื่น'],
  osm: ['แผนที่ถนน', 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'],
};
const AREA_STYLE = { catchment: { color: '#22d3ee', weight: 3, fillOpacity: 0.04, dashArray: '8 6' }, village: { color: '#fde047', weight: 2, fillOpacity: 0.06 } };

// props: patients, label{caseId:title}, areas, height,
//   onMove(p,lat,lng) ลากหมุด · onAddAt(lat,lng) ปักหมุดใหม่ · onPlace(p,lat,lng) วางพิกัดให้ผู้ป่วยที่ยังไม่มี
//   draw = { points:[{lat,lng}], onChange(points) } โหมดวาดขอบเขต
export default function OutbreakMap({ patients, label, areas, height = 480, onMove, onAddAt, onPlace, draw }) {
  const el = useRef(null); const R = useRef({}); const [mode, setMode] = useState('points'); const [base, setBase] = useState('sat'); const [labels, setLabels] = useState(true); const [err, setErr] = useState('');
  const [pending, setPending] = useState(null); // {type:'add'} | {type:'place', p}
  const pts = (patients || []).filter(okPt); const unplaced = (patients || []).filter((p) => !okPt(p));
  const live = useRef({}); live.current = { pending, draw, onAddAt, onPlace, onMove };

  useEffect(() => {
    const map = L.map(el.current, { scrollWheelZoom: false, maxZoom: 20 }).setView([17.0, 104.0], 12);
    R.current = { map, fitted: false }; window.L = L;
    map.on('click', (e) => {
      const { pending: pd, draw: dr, onAddAt: add, onPlace: place } = live.current; const { lat, lng } = e.latlng;
      if (dr) { dr.onChange([...(dr.points || []), { lat: +lat.toFixed(6), lng: +lng.toFixed(6) }]); return; }
      if (!pd) return;
      if (pd.type === 'add') add?.(+lat.toFixed(6), +lng.toFixed(6)); else place?.(pd.p, +lat.toFixed(6), +lng.toFixed(6));
      setPending(null);
    });
    return () => { map.remove(); R.current = {}; };
  }, []);

  useEffect(() => { if (el.current) el.current.style.cursor = pending || draw ? 'crosshair' : ''; }, [pending, draw]);

  // ชั้นแผนที่ฐาน
  useEffect(() => {
    const { map } = R.current; if (!map) return undefined; const [, url, attr] = BASES[base];
    const layers = [L.tileLayer(url, { maxZoom: 20, maxNativeZoom: 19, attribution: attr }).addTo(map)];
    if (base === 'sat' && labels) layers.push(L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20, maxNativeZoom: 19 }).addTo(map));
    layers.forEach((l, i) => l.setZIndex?.(i));
    return () => layers.forEach((l) => map.removeLayer(l));
  }, [base, labels]);

  // ขอบเขตพื้นที่
  useEffect(() => {
    const { map } = R.current; if (!map) return undefined;
    const g = L.layerGroup((areas || []).filter((a) => (a.points || []).length > 2).map((a) => L.polygon(a.points.map((q) => [q.lat, q.lng]), AREA_STYLE[a.kind] || AREA_STYLE.village).bindTooltip(esc(a.name || (a.kind === 'catchment' ? 'เขตรับผิดชอบ' : 'หมู่บ้าน')), { sticky: true, direction: 'top' }))).addTo(map);
    const all = (areas || []).flatMap((a) => a.points || []);
    if (all.length && !R.current.fitted && !pts.length) { map.fitBounds(L.latLngBounds(all.map((q) => [q.lat, q.lng])).pad(0.1)); R.current.fitted = true; }
    return () => map.removeLayer(g);
  }, [areas]); // eslint-disable-line react-hooks/exhaustive-deps

  // จุดผู้ป่วย
  useEffect(() => {
    const { map } = R.current; if (!map) return undefined; let dead = false; let layer;
    (async () => {
      try {
        if (mode === 'cluster') await import('leaflet.markercluster');
        if (mode === 'heat') await import('leaflet.heat');
        if (dead) return;
        const movable = mode === 'points' && !!onMove;
        const mk = (p) => {
          const m = L.marker([Number(p.lat), Number(p.lng)], { icon: dot(isDead(p) ? '#7f1d1d' : p.classification?.includes('ยืนยัน') ? '#dc2626' : '#f97316'), draggable: movable })
            .bindPopup(`<b>${esc(label?.[p.caseId] || 'ผู้ป่วย')}</b><br/>${esc(vilLabel(p.villageNo))} · กลุ่มอายุ ${esc(ageBand(p.age))}<br/>เริ่มป่วย ${p.onsetDate ? esc(fmtDate(p.onsetDate)) : '—'}<br/>${esc(p.status || '')}${p.classification ? '<br/>' + esc(p.classification) : ''}${movable ? '<br/><i style="color:#64748b">ลากหมุดเพื่อย้ายตำแหน่ง</i>' : ''}`);
          if (movable) m.on('dragend', () => { const q = m.getLatLng(); live.current.onMove?.(p, +q.lat.toFixed(6), +q.lng.toFixed(6)); });
          return m;
        };
        if (mode === 'heat') layer = L.heatLayer(pts.map((p) => [Number(p.lat), Number(p.lng), 1]), { radius: 28, blur: 22, maxZoom: 18 });
        else if (mode === 'cluster') { layer = L.markerClusterGroup({ maxClusterRadius: 45 }); pts.forEach((p) => layer.addLayer(mk(p))); }
        else layer = L.layerGroup(pts.map(mk));
        layer.addTo(map);
        if (pts.length && !R.current.fitted) { map.fitBounds(L.latLngBounds(pts.map((p) => [Number(p.lat), Number(p.lng)])).pad(0.25), { maxZoom: 18 }); R.current.fitted = true; }
        setErr('');
      } catch (e) { setErr('โหลดชั้นแผนที่ไม่สำเร็จ: ' + e.message); }
    })();
    return () => { dead = true; if (layer) map.removeLayer(layer); };
  }, [mode, patients]); // eslint-disable-line react-hooks/exhaustive-deps

  // โหมดวาดขอบเขต: หมุดมุมลากได้ + เส้นเชื่อม
  useEffect(() => {
    const { map } = R.current; if (!map || !draw) return undefined; const P = draw.points || [];
    const g = L.layerGroup().addTo(map);
    if (P.length > 1) (P.length > 2 ? L.polygon : L.polyline)(P.map((q) => [q.lat, q.lng]), { color: '#facc15', weight: 3, fillOpacity: 0.12 }).addTo(g);
    P.forEach((q, i) => {
      const m = L.marker([q.lat, q.lng], { icon: vtx, draggable: true }).addTo(g);
      m.on('dragend', () => { const n = m.getLatLng(); const next = [...P]; next[i] = { lat: +n.lat.toFixed(6), lng: +n.lng.toFixed(6) }; live.current.draw?.onChange(next); });
      m.on('contextmenu', () => live.current.draw?.onChange(P.filter((_, k) => k !== i)));
    });
    return () => map.removeLayer(g);
  }, [draw]);

  const goHere = () => navigator.geolocation?.getCurrentPosition((pos) => R.current.map?.setView([pos.coords.latitude, pos.coords.longitude], 18), () => setErr('ไม่สามารถอ่านตำแหน่งของอุปกรณ์ได้'));
  const Btn = ({ on, onClick, children }) => <button type="button" onClick={onClick} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${on ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>{children}</button>;
  return (
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(BASES).map(([k, [t]]) => <Btn key={k} on={base === k} onClick={() => setBase(k)}>{t}</Btn>)}
        {base === 'sat' && <label className="flex items-center gap-1 text-sm text-slate-600"><input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} /> ชื่อสถานที่</label>}
        <span className="mx-1 h-5 w-px bg-slate-300" />
        {[['points', 'จุดผู้ป่วย'], ['cluster', 'คลัสเตอร์'], ['heat', 'Heatmap']].map(([k, t]) => <Btn key={k} on={mode === k} onClick={() => setMode(k)}>{t}</Btn>)}
        <button type="button" onClick={goHere} className="text-sm text-brand-700 underline">📍 ตำแหน่งฉัน</button>
      </div>
      {!draw && (onAddAt || onPlace) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {onAddAt && <button type="button" className={`btn ${pending?.type === 'add' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setPending(pending?.type === 'add' ? null : { type: 'add' })}>📌 {pending?.type === 'add' ? 'คลิกบนแผนที่เพื่อปักหมุด… (กดอีกครั้งเพื่อยกเลิก)' : 'ปักหมุดผู้ป่วยใหม่'}</button>}
          {onPlace && unplaced.length > 0 && (
            <select className="input max-w-xs" value={pending?.type === 'place' ? pending.p.id : ''} onChange={(e) => setPending(e.target.value ? { type: 'place', p: unplaced.find((x) => x.id === e.target.value) } : null)}>
              <option value="">วางพิกัดให้ผู้ป่วยที่ยังไม่มีพิกัด ({unplaced.length})…</option>
              {unplaced.map((p) => <option key={p.id} value={p.id}>{p.name || 'ผู้ป่วย'} {p.villageNo ? `· ม.${p.villageNo}` : ''}</option>)}
            </select>)}
          {pending?.type === 'place' && <span className="rounded bg-amber-50 px-2 py-1 text-amber-800">คลิกบนแผนที่เพื่อวางตำแหน่งของ {pending.p.name}</span>}
        </div>)}
      {draw && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900 ring-1 ring-amber-200">โหมดวาดขอบเขต: คลิกบนแผนที่เพื่อเพิ่มมุม · ลากสี่เหลี่ยมสีเหลืองเพื่อปรับ · คลิกขวา (กดค้างบนมือถือ) ที่มุมเพื่อลบ</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div ref={el} style={{ height }} className="z-0 w-full overflow-hidden rounded-xl ring-1 ring-slate-200" />
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span>แสดง {pts.length} จุด{unplaced.length ? ` · ยังไม่มีพิกัด ${unplaced.length} ราย` : ''}</span>
        <span><i className="inline-block h-3 w-3 rounded-full bg-orange-500 align-middle" /> ป่วย/สงสัย</span><span><i className="inline-block h-3 w-3 rounded-full bg-red-600 align-middle" /> ยืนยัน</span><span><i className="inline-block h-3 w-3 rounded-full bg-red-900 align-middle" /> เสียชีวิต</span>
        <span><i className="inline-block h-0 w-4 border-t-2 border-dashed border-cyan-400 align-middle" /> เขตรับผิดชอบ</span><span><i className="inline-block h-0 w-4 border-t-2 border-yellow-300 align-middle" /> หมู่บ้าน</span>
        <span>ซูมด้วย Ctrl+ล้อเมาส์ หรือปุ่ม +/− · ป๊อปอัปไม่แสดงชื่อ/เลขบัตร/บ้านเลขที่</span>
      </div>
    </section>
  );
}
