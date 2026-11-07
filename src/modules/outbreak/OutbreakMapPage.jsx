// หน้าแผนที่รวมทุกเหตุการณ์ (กรองตามเหตุการณ์/โรค)
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { Map as MapIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { db } from '../../firebase';
import { PageHeader } from '../../components/Logo';
import { Spinner } from '../../components/ui';
import OutbreakMap from './OutbreakMap';

export default function OutbreakMapPage() {
  const [cases, setCases] = useState(null); const [people, setPeople] = useState(null); const [sel, setSel] = useState('');
  useEffect(() => onSnapshot(collection(db, 'outbreakCases'), (s) => setCases(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setCases([])), []);
  useEffect(() => onSnapshot(collection(db, 'outbreakPeople'), (s) => setPeople(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setPeople([])), []);
  const label = useMemo(() => Object.fromEntries((cases || []).map((c) => [c.id, c.title])), [cases]);
  const list = useMemo(() => (people || []).filter((p) => p.kind === 'patient' && (!sel || p.caseId === sel)), [people, sel]);
  if (!cases || !people) return <Spinner />;
  return (
    <div className="space-y-4">
      <PageHeader icon={MapIcon} emoji="🗺️" title="แผนที่การระบาด" subtitle="ตำแหน่งผู้ป่วยจากพิกัด GPS ที่บันทึกในแต่ละเหตุการณ์" />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link className="text-brand-700 underline" to="/outbreak">← กลับหน้าสอบสวนโรค</Link>
        <select className="input max-w-sm" value={sel} onChange={(e) => setSel(e.target.value)}><option value="">ทุกเหตุการณ์</option>{cases.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
      </div>
      <OutbreakMap patients={list} label={label} height={560} />
    </div>
  );
}
