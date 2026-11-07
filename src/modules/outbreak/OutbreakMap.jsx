// แผนที่การระบาด (Leaflet + OpenStreetMap): จุดผู้ป่วย / คลัสเตอร์ / ความหนาแน่น (heatmap)
// เพื่อความเป็นส่วนตัว: ป๊อปอัปแสดงเฉพาะหมู่บ้าน วันเริ่มป่วย สถานะ กลุ่มอายุ — ไม่แสดงชื่อ เลขบัตร บ้านเลขที่
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fmtDate } from '../../lib/thai';
import { ageBand, isDead, vilLabel } from './outbreakLib';

const okPt = (p) => p.lat !== '' && p.lng !== '' && p.lat != null && p.lng != null && isFinite(p.lat) && isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export default function OutbreakMap({ patients, height = 480, label }) {
  const el = useRef(null); const ref = useRef({}); const [mode, setMode] = useState('points'); const [err, setErr] = useState('');
  const pts = (patients || []).filter(okPt); const missing = (patients || []).length - pts.length;

  useEffect(() => {
    const map = L.map(el.current, { scrollWheelZoom: false }).setView([17.0, 104.0], 11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; ผู้ร่วมจัดทำ <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
    ref.current = { map }; window.L = L;
    return () => { map.remove(); ref.current = {}; };
  }, []);

  useEffect(() => {
    const { map } = ref.current; if (!map) return undefined; let dead = false; let layer;
    (async () => {
      try {
        if (mode === 'cluster') await import('leaflet.markercluster');
        if (mode === 'heat') await import('leaflet.heat');
        if (dead) return;
        const mk = (p) => L.circleMarker([Number(p.lat), Number(p.lng)], { radius: 8, weight: 2, color: '#fff', fillColor: isDead(p) ? '#b91c1c' : '#e11d48', fillOpacity: 0.9 })
          .bindPopup(`<b>${esc(label?.[p.caseId] || 'ผู้ป่วย')}</b><br/>${esc(vilLabel(p.villageNo))} · กลุ่มอายุ ${esc(ageBand(p.age))}<br/>เริ่มป่วย ${p.onsetDate ? esc(fmtDate(p.onsetDate)) : '—'}<br/>${esc(p.status || '')}`);
        if (mode === 'heat') layer = L.heatLayer(pts.map((p) => [Number(p.lat), Number(p.lng), 1]), { radius: 28, blur: 22, maxZoom: 16 });
        else if (mode === 'cluster') { layer = L.markerClusterGroup({ maxClusterRadius: 45 }); pts.forEach((p) => layer.addLayer(mk(p))); }
        else layer = L.layerGroup(pts.map(mk));
        layer.addTo(map);
        if (pts.length) map.fitBounds(L.latLngBounds(pts.map((p) => [Number(p.lat), Number(p.lng)])).pad(0.25), { maxZoom: 16 });
        setErr('');
      } catch (e) { setErr('โหลดชั้นแผนที่ไม่สำเร็จ: ' + e.message); }
    })();
    return () => { dead = true; if (layer) map.removeLayer(layer); };
  }, [mode, patients]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {[['points', 'จุดผู้ป่วย'], ['cluster', 'คลัสเตอร์'], ['heat', 'ความหนาแน่น (Heatmap)']].map(([k, t]) => (
          <button key={k} onClick={() => setMode(k)} className={`rounded-full px-3 py-1.5 font-semibold ${mode === k ? 'bg-brand-700 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>{t}</button>))}
        <span className="text-slate-500">แสดง {pts.length} จุด{missing > 0 ? ` · ไม่มีพิกัด ${missing} ราย (ใส่ละติจูด/ลองจิจูดในข้อมูลผู้ป่วยเพื่อแสดงบนแผนที่)` : ''}</span>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div ref={el} style={{ height }} className="z-0 w-full overflow-hidden rounded-xl ring-1 ring-slate-200" />
      <p className="text-xs text-slate-400">แผนที่ไม่แสดงชื่อ เลขบัตร หรือบ้านเลขที่ของผู้ป่วย · หมุดสีแดงเข้ม = เสียชีวิต · ใช้ Ctrl+เลื่อนล้อเมาส์เพื่อซูม</p>
    </section>
  );
}
