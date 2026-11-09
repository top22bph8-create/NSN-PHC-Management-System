// เลือกหมวดงบประมาณ → หมวดย่อย (ปรากฏเมื่อเลือกหมวด) → เดือน/ปีของยอดจ่าย (เฉพาะค่าตอบแทน/ค่าสาธารณูปโภค)
import { BUDGET_CATS, EXTRA_CATS, catByName } from '../config/budgetCats';
import { hasSubs, subByName, subsOf } from '../config/budgetSubs';
import { thMonths } from '../lib/thai';

export const budgetErrors = (v) => {
  const c = catByName(v.budgetCat); if (!c || !hasSubs(c.id)) return '';
  const sb = subByName(c.id, v.budgetSub); if (!sb) return 'กรุณาเลือกหมวดย่อย';
  if (sb.period && (!v.budgetPeriodMonth || !v.budgetPeriodYear)) return 'กรุณาระบุเดือนและปีของยอดจ่าย';
  return '';
};

export default function BudgetPicker({ value, onChange, fy, error, compact = false }) {
  const c = catByName(value.budgetCat); const subs = c ? subsOf(c.id) : []; const sb = c ? subByName(c.id, value.budgetSub) : null;
  const y0 = Number(fy) || new Date().getFullYear() + 543; const years = [y0 - 1, y0, y0 + 1].map(String);
  const groups = [...new Set(subs.map((s) => s.group))];
  return (
    <div className={`space-y-2 ${compact ? '' : 'rounded-xl border border-emerald-200 bg-emerald-50/50 p-3'}`}>
      <select className="input" value={value.budgetCat || ''} onChange={(e) => onChange({ budgetCat: e.target.value, budgetSub: '', budgetPeriodMonth: '', budgetPeriodYear: '' })}>
        <option value="">-- เลือกหมวดงบประมาณ --</option>
        <optgroup label="แผนการใช้จ่ายเงินบำรุง (หมวด 1–10)">{BUDGET_CATS.filter((x) => x.g === 'main').map((x) => <option key={x.id} value={x.name}>{x.no}. {x.name}</option>)}</optgroup>
        <optgroup label="งบจากแหล่งอื่น (หมวด 11–13)">{BUDGET_CATS.filter((x) => x.g === 'other').map((x) => <option key={x.id} value={x.name}>{x.no}. {x.name}</option>)}</optgroup>
        <optgroup label="รายจ่ายอื่น (ไม่ตั้งยอด)">{EXTRA_CATS.map((x) => <option key={x.id} value={x.name}>{x.name}</option>)}</optgroup>
      </select>
      {subs.length > 0 && (
        <select className="input" value={value.budgetSub || ''} onChange={(e) => onChange({ budgetSub: e.target.value, budgetPeriodMonth: '', budgetPeriodYear: '' })}>
          <option value="">-- เลือกหมวดย่อย --</option>
          {groups.map((g) => <optgroup key={g || 'x'} label={g || 'หมวดย่อย'}>{subs.filter((s) => s.group === g).map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}</optgroup>)}
        </select>)}
      {sb?.period && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm text-slate-600">ยอดจ่ายประจำเดือน
            <select className="input mt-1" value={value.budgetPeriodMonth || ''} onChange={(e) => onChange({ budgetPeriodMonth: e.target.value })}><option value="">-- เดือน --</option>{thMonths.map((m) => <option key={m}>{m}</option>)}</select></label>
          <label className="block text-sm text-slate-600">ปี (พ.ศ.)
            <select className="input mt-1" value={value.budgetPeriodYear || ''} onChange={(e) => onChange({ budgetPeriodYear: e.target.value })}><option value="">-- ปี --</option>{years.map((y) => <option key={y}>{y}</option>)}</select></label>
        </div>)}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>);
}
