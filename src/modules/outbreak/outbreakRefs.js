// ข้อมูลอ้างอิงจากระบบเดิม (อ่านอย่างเดียว): หมู่บ้านในเขตรับผิดชอบ และเจ้าหน้าที่ข้าราชการจากทะเบียนบุคลากร
import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';

// หมู่บ้านในเขตรับผิดชอบ: มาจากตาราง village ของ JHCIS ที่สคริปต์ซิงก์ส่งไว้ใน ppTargets/summary.villages { หมู่ที่: ชื่อบ้าน }
export function useVillages() {
  const [v, setV] = useState(null);
  useEffect(() => onSnapshot(doc(db, 'ppTargets', 'summary'), (s) => {
    const m = s.exists() ? s.data().villages || {} : {};
    setV(Object.entries(m).filter(([k]) => Number(k) > 0).sort((a, b) => Number(a[0]) - Number(b[0])).map(([no, name]) => ({ no: String(no), name: String(name || '') })));
  }, () => setV([])), []);
  return v;
}

// เจ้าหน้าที่ผู้สอบสวนโรค: เฉพาะบุคลากรประเภท "ข้าราชการ" ในทำเนียบบุคลากร (users)
export function useOfficers() {
  const [v, setV] = useState(null);
  useEffect(() => onSnapshot(collection(db, 'users'), (s) => {
    setV(s.docs.map((d) => d.data()).filter((u) => u.role !== 'pending' && u.active !== false && u.personnelType === 'ข้าราชการ')
      .map((u) => ({ email: u.email, name: `${u.namePrefix || ''}${u.name || ''}`.trim(), position: u.position || '' })).filter((u) => u.name)
      .sort((a, b) => a.name.localeCompare(b.name, 'th')));
  }, () => setV([])), []);
  return v;
}

// ขอบเขตพื้นที่ที่ผู้ใช้วาดเอง (outbreakGeo): kind = catchment (เขตรับผิดชอบทั้งหมด) | village (หมู่บ้าน, villageNo)
// points เก็บเป็น [{lat,lng}] เพราะ Firestore ไม่รองรับอาร์เรย์ซ้อนอาร์เรย์
export function useAreas() {
  const [v, setV] = useState(null);
  useEffect(() => onSnapshot(collection(db, 'outbreakGeo'), (s) => setV(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setV([])), []);
  return v;
}

// จุดอยู่ในรูปหลายเหลี่ยมหรือไม่ (ray casting)
export function inPoly(lat, lng, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]; const b = pts[j];
    if ((a.lat > lat) !== (b.lat > lat) && lng < ((b.lng - a.lng) * (lat - a.lat)) / (b.lat - a.lat) + a.lng) c = !c;
  }
  return c;
}

// หมู่บ้านที่จุดนี้อยู่ภายใน (จากรูปหลายเหลี่ยมหมู่บ้านที่วาดไว้) และอยู่ในเขตรับผิดชอบหรือไม่
export function locate(areas, lat, lng) {
  const A = (areas || []).filter((a) => (a.points || []).length > 2);
  const v = A.find((a) => a.kind === 'village' && inPoly(lat, lng, a.points));
  const c = A.filter((a) => a.kind === 'catchment');
  return { villageNo: v?.villageNo || '', inside: c.length ? c.some((a) => inPoly(lat, lng, a.points)) : null };
}
