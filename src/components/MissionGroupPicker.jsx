import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

// ช่องติ๊กเลือกภารกิจแบบจัดเป็นหมวด ใช้บนมือถือได้ง่าย: แตะหัวข้อหมวดเพื่อเปิด/ปิด แต่ละข้อเป็นแถวใหญ่แตะติ๊กได้ทั้งแถว
// หัวข้อหมวดแสดงจำนวนข้อที่ติ๊กแล้ว และด้านบนมีสรุปรายการที่เลือกทั้งหมดเป็นข้อๆ
// groups = [{ name, items: [ข้อความ] }] / value = อาร์เรย์ข้อความที่ติ๊กไว้ / ค่าเก่าที่ไม่อยู่ในรายการปัจจุบันจะรวมไว้ในหมวด "รายการเดิม"
export default function MissionGroupPicker({ groups, value, onChange, id }) {
  const cur = Array.isArray(value) ? value : [];
  const known = new Set(groups.flatMap((g) => g.items));
  const legacy = cur.filter((c) => !known.has(c));
  const all = legacy.length ? [...groups, { name: 'รายการเดิม', items: legacy }] : groups;
  // เปิดหมวดที่มีข้อติ๊กอยู่ไว้ก่อน ถ้ายังไม่ติ๊กอะไรเลยเปิดหมวดแรก
  const [openSet, setOpenSet] = useState(() => new Set(all.filter((g) => g.items.some((i) => cur.includes(i))).map((g) => g.name).concat(cur.length ? [] : [all[0]?.name])));
  const toggleGroup = (n) => setOpenSet((s) => { const x = new Set(s); if (x.has(n)) x.delete(n); else x.add(n); return x; });
  const order = all.flatMap((g) => g.items);
  const toggle = (item) => onChange(cur.includes(item) ? cur.filter((c) => c !== item) : order.filter((o) => o === item || cur.includes(o)));

  return (
    <div id={id} className="space-y-2">
      {cur.length > 0 && (
        <div className="rounded-xl bg-brand-50 p-2 text-sm text-brand-900">
          <div className="mb-1 font-semibold">เลือกแล้ว {cur.length} ข้อ</div>
          <ol className="list-decimal space-y-0.5 pl-5">{order.filter((o) => cur.includes(o)).map((o) => <li key={o}>{o}</li>)}</ol>
        </div>
      )}
      {all.map((g, gi) => {
        const n = g.items.filter((i) => cur.includes(i)).length;
        const isOpen = openSet.has(g.name);
        return (
          <div key={g.name} className="overflow-hidden rounded-xl border border-slate-200">
            <button type="button" className="flex w-full items-center justify-between gap-2 bg-slate-50 px-3 py-3 text-left font-semibold text-slate-700" onClick={() => toggleGroup(g.name)} aria-expanded={isOpen}>
              <span>{gi + 1}. {g.name}{n > 0 && <span className="ml-2 rounded-full bg-brand-600 px-2 py-0.5 text-xs font-bold text-white">{n}</span>}</span>
              <ChevronDown className={`h-5 w-5 shrink-0 transition ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <div className="divide-y divide-slate-100">
                {g.items.map((item) => (
                  <label key={item} className={`flex cursor-pointer items-start gap-3 px-3 py-3 text-[15px] ${cur.includes(item) ? 'bg-brand-50' : 'bg-white'}`}>
                    <input type="checkbox" className="mt-0.5 h-6 w-6 shrink-0" checked={cur.includes(item)} onChange={() => toggle(item)} />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
