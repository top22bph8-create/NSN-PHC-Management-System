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
