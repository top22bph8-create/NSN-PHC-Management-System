import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';

// ข้อมูลงบประมาณของปีงบประมาณ (BE): รายการตั้ง/เพิ่ม/ปรับ/โอน + ฎีกาเบิกจ่ายของปีเดียวกัน
export default function useBudgetData(fy) {
  const [entries, setEntries] = useState(null); const [deekas, setDeekas] = useState(null); const [err, setErr] = useState('');
  useEffect(() => {
    setEntries(null); setDeekas(null); setErr('');
    const f = (e) => setErr(e.code === 'permission-denied' ? 'ไม่มีสิทธิ์เข้าถึง (ตรวจว่าวาง Firestore Rules ล่าสุดแล้ว)' : e.message);
    const u1 = onSnapshot(query(collection(db, 'budgetEntries'), where('fy', '==', fy)), (s) => setEntries(s.docs.map((d) => ({ id: d.id, ...d.data() }))), f);
    const u2 = onSnapshot(query(collection(db, 'reg-deeka'), where('fy', '==', fy)), (s) => setDeekas(s.docs.map((d) => ({ id: d.id, ...d.data() }))), f);
    return () => { u1(); u2(); };
  }, [fy]);
  return { entries, deekas, err };
}
