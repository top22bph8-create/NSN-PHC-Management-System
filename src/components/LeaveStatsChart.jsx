import { useMemo, useState } from 'react';

// สีประจำประเภทการลา (ฮิวตรงกับ LEAVE_TYPE_COLORS ที่ใช้ในการ์ดโควตา/ตารางสถิติทั่วทั้งระบบ เพื่อให้สีของประเภทเดียวกัน
// ตรงกันทุกหน้า) แต่ต้องใช้เป็นค่าฮิวดิบ (ไม่ใช่คลาส Tailwind) เพราะ SVG fill ต้องการค่าสีตรงๆ
const TYPE_HEX = {
  'ลาป่วย': '#fb7185',
  'ลากิจส่วนตัว': '#fbbf24',
  'ลาพักผ่อน': '#34d399',
  'ลาคลอดบุตร': '#f472b6',
  'ลาไปช่วยเหลือภริยาที่คลอดบุตร': '#38bdf8',
  'ลาอุปสมบท/ประกอบพิธีฮัจย์': '#a78bfa',
  'ลาไปศึกษา/ฝึกอบรม/ดูงาน': '#22d3ee',
  'อื่น ๆ': '#94a3b8',
};
const typeHex = (t) => TYPE_HEX[t] || '#94a3b8';

const BAR_H = 20; // ความหนาแท่ง (px) — ไม่เกิน 24px ตามสเปก
const ROW_H = 34; // ความสูงต่อแถว (รวมช่องไฟบน-ล่าง)
const GAP = 2; // ช่องไฟสีพื้นหลังคั่นระหว่างท่อนสี (stacked segment) และคั่นเส้นกริด
const LABEL_W = 168; // ความกว้างคอลัมน์ชื่อบุคคล (ซ้าย)
const VALUE_W = 56; // ความกว้างคอลัมน์ตัวเลขรวม (ขวา)

// กราฟแท่งแนวนอนแบบซ้อนทับ (stacked horizontal bar) แสดงสถิติการลาของบุคลากร "ทุกคน" เทียบกัน ในมุมมองเดียว
// ใช้ดู "ความถี่" (จำนวนครั้ง) หรือ "ปริมาณ" (จำนวนวัน) ได้ตามโหมดที่เลือก — แยกสีตามประเภทการลาในแต่ละแท่ง
// ออกแบบตามหลัก: แท่งหนา <=24px, ปลายมน 4px ขอบนอก, ช่องไฟ 2px คั่นท่อนสี, ป้ายกำกับสีเสมอ (ไม่พึ่งสีอย่างเดียว),
// มี tooltip ตอนชี้เมาส์ที่ท่อนสี และตารางข้อมูลดิบยังอยู่ด้านล่างเป็นทางเลือกดูค่าที่แม่นยำ (ดู LeaveReportsPanel)
export default function LeaveStatsChart({ rows, types, mode }) {
  const [hover, setHover] = useState(null); // { x, y, name, type, value }

  const valueOf = (r, t) => (mode === 'count' ? (r.countByType[t] || 0) : (r.byType[t] || 0));
  const totalOf = (r) => (mode === 'count' ? types.reduce((s, t) => s + (r.countByType[t] || 0), 0) : (r.total || 0));
  const unit = mode === 'count' ? 'ครั้ง' : 'วัน';

  // เรียงคนที่ลาเยอะสุดไว้บนสุด ให้เห็นภาพ "ใครลาบ่อย/ลาเยอะที่สุด" ได้ทันทีโดยไม่ต้องไล่หาในตาราง
  const sorted = useMemo(() => [...rows].sort((a, b) => totalOf(b) - totalOf(a)), [rows, mode]);
  const usedTypes = useMemo(() => types.filter((t) => rows.some((r) => valueOf(r, t) > 0)), [rows, types, mode]);
  const max = Math.max(1, ...sorted.map((r) => totalOf(r)));
  // เส้นกริดอ้างอิง 4 ช่วง ปัดเป็นเลขกลมๆ ให้อ่านง่าย (0, 1/4, 1/2, 3/4, สูงสุด)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));

  const chartW = 640; // ความกว้างพื้นที่กราฟ (ไม่รวมคอลัมน์ชื่อ/ตัวเลข) — ปรับตาม viewport ด้วย viewBox
  const svgW = LABEL_W + chartW + VALUE_W;
  const svgH = sorted.length * ROW_H + 24;

  if (sorted.length === 0 || max === 0) {
    return <div className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">ยังไม่มีข้อมูลการลาในปีงบประมาณนี้สำหรับแสดงกราฟ</div>;
  }

  return (
    <div className="rounded-xl bg-white p-3 sm:p-4">
      {/* คำอธิบายสั้นๆ ของกราฟ (ไม่ใช้สีอย่างเดียวเป็นตัวบอกความหมาย) */}
      <div className="mb-2 text-sm text-slate-500">
        เปรียบเทียบ{mode === 'count' ? 'ความถี่ (จำนวนครั้ง)' : 'ปริมาณ (จำนวนวัน)'}การลาของบุคลากรทุกคน เรียงจากมากไปน้อย — เฉพาะใบลาที่อนุมัติแล้ว แยกสีตามประเภทการลา
      </div>

      {/* คำอธิบายสี (legend) — แสดงเสมอเมื่อมีมากกว่า 1 ประเภท เพื่อไม่ให้ต้องจำสีเอง */}
      {usedTypes.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {usedTypes.map((t) => (
            <div key={t} className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: typeHex(t) }} />
              {t}
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${svgW} ${svgH}`} width="100%" style={{ minWidth: 560 }} role="img" aria-label={`กราฟ${mode === 'count' ? 'ความถี่' : 'ปริมาณ'}การลารายบุคคล`}>
          {/* เส้นกริดแนวตั้ง + ตัวเลขกำกับด้านบน (recessive — สีอ่อน ไม่แย่งความสนใจจากแท่งข้อมูล) */}
          {ticks.map((tk, i) => {
            const x = LABEL_W + (max ? (tk / max) * chartW : 0);
            return (
              <g key={i}>
                <line x1={x} y1={10} x2={x} y2={svgH - 4} stroke="#e2e8f0" strokeWidth={1} />
                <text x={x} y={9} textAnchor="middle" fontSize={10} fill="#94a3b8">{tk}</text>
              </g>
            );
          })}

          {sorted.map((r, i) => {
            const y = 20 + i * ROW_H;
            const total = totalOf(r);
            let cx = LABEL_W;
            return (
              <g key={r.email}>
                {/* ชื่อ-ตำแหน่ง (ตัดด้วย title ถ้ายาวเกิน ไม่ล้นออกนอกกรอบ) */}
                <text x={LABEL_W - 8} y={y + BAR_H / 2 + 4} textAnchor="end" fontSize={12} fill="#334155" fontWeight={600}>
                  {(r.name || '').length > 22 ? `${r.name.slice(0, 21)}…` : r.name}
                  <title>{r.name}{r.position ? ` (${r.position})` : ''}</title>
                </text>
                {usedTypes.map((t) => {
                  const v = valueOf(r, t);
                  if (!v) return null;
                  const w = Math.max(0, (v / max) * chartW - GAP);
                  const segX = cx;
                  cx += (v / max) * chartW;
                  return (
                    // rx/ry มนทุกมุมของแต่ละท่อน — ที่รอยต่อระหว่างท่อนจะถูกช่องไฟ 2px (GAP) บังความมนไว้พอดี
                    // ทำให้เห็นเป็นขอบเหลี่ยมที่รอยต่อ และมนจริงเฉพาะปลายซ้ายสุด/ขวาสุดของแท่งทั้งแถบ
                    <rect
                      key={t}
                      x={segX}
                      y={y}
                      width={w}
                      height={BAR_H}
                      fill={typeHex(t)}
                      rx={4}
                      ry={4}
                      onMouseEnter={(e) => setHover({ x: e.clientX, y: e.clientY, name: r.name, type: t, value: v })}
                      onMouseMove={(e) => setHover((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h))}
                      onMouseLeave={() => setHover(null)}
                    />
                  );
                })}
                {/* ตัวเลขรวมที่ปลายแท่ง (value at the tip) */}
                <text x={LABEL_W + Math.max(6, (total / max) * chartW) + 6} y={y + BAR_H / 2 + 4} fontSize={12} fill="#475569" fontWeight={700}>
                  {total} {unit}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* tooltip ลอยตามเมาส์ตอนชี้ที่ท่อนสีในแท่ง — บอกชื่อ/ประเภท/ค่าตรงๆ เป็นตัวหนังสือ ไม่ต้องจำสีเอง */}
      {hover && (
        <div
          className="pointer-events-none fixed z-50 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs text-white shadow-lg"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <div className="font-semibold">{hover.name}</div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: typeHex(hover.type) }} />
            {hover.type}: {hover.value} {unit}
          </div>
        </div>
      )}
    </div>
  );
}
