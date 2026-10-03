import ExcelJS from 'exceljs';
import { ORG_UNDER, ORG_SHORT } from '../config/brand';
import { fmtDate } from './thai';

// แปลงค่าฟิลด์ให้เป็นข้อความสำหรับตาราง (วันที่ -> พ.ศ., อื่น ๆ -> ข้อความ)
export function cellText(cfg, key, row) {
  const f = cfg.fields.find((x) => x.key === key);
  const v = row[key];
  if (!f) return v || '';
  if (f.type === 'date') return fmtDate(v);
  return v || '';
}

// สร้างและดาวน์โหลดรายงาน Excel รูปแบบทะเบียนราชการ (แถบชื่อเรื่องสี + หัวตารางสี + เส้นขอบ)
// cfg.reportLayout (ถ้ามี): หัวตาราง 2 ชั้นแบบมีหัวข้อกลุ่มคร่อมคอลัมน์ย่อย เช่น "รับ" คร่อม "จำนวน(เล่ม)"/"เล่มที่" ตามแบบฟอร์มตัวอย่าง
// แต่ละสมาชิกของ reportLayout เป็น {key} (คอลัมน์เดี่ยว คร่อม 2 แถวหัวตาราง) หรือ {group, color, keys} (หัวข้อกลุ่ม คร่อมคอลัมน์ย่อยตาม keys)
export async function exportRegistryExcel(cfg, rows, fy) {
  const layout = cfg.reportLayout;
  const cols = layout ? layout.flatMap((e) => e.keys || [e.key]) : (cfg.reportColumns || cfg.fields.filter((f) => f.list).map((f) => f.key));
  const labels = cols.map((k) => cfg.fields.find((f) => f.key === k)?.label || k);
  const color = cfg.reportColor || '4FA8E0';
  const borderAll = { top: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' }, bottom: { style: 'thin' } };

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(cfg.noun.slice(0, 31), { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 } });

  ws.mergeCells(1, 1, 1, cols.length);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = cfg.title;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color}` } };
  ws.getRow(1).height = 22;

  ws.mergeCells(2, 1, 2, cols.length);
  const subCell = ws.getCell(2, 1);
  subCell.value = `${ORG_SHORT}  ${ORG_UNDER}  ·  ปีงบประมาณ ${fy}`;
  subCell.font = { bold: true, size: 11 };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color}` } };
  ws.getRow(2).height = 18;

  if (layout) {
    let colIdx = 1;
    layout.forEach((entry) => {
      if (entry.group) {
        const span = entry.keys.length;
        ws.mergeCells(3, colIdx, 3, colIdx + span - 1);
        const gc = ws.getCell(3, colIdx);
        gc.value = entry.group;
        gc.font = { bold: true };
        gc.alignment = { horizontal: 'center', vertical: 'middle' };
        gc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${entry.color || 'E8F4FC'}` } };
        gc.border = borderAll;
        entry.keys.forEach((k, j) => {
          const c = ws.getCell(4, colIdx + j);
          c.value = cfg.fields.find((f) => f.key === k)?.label || k;
          c.font = { bold: true };
          c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F4FC' } };
          c.border = borderAll;
        });
        colIdx += span;
      } else {
        ws.mergeCells(3, colIdx, 4, colIdx);
        const c = ws.getCell(3, colIdx);
        c.value = cfg.fields.find((f) => f.key === entry.key)?.label || entry.key;
        c.font = { bold: true };
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F4FC' } };
        c.border = borderAll;
        colIdx += 1;
      }
    });
    ws.getRow(3).height = 20;
    ws.getRow(4).height = 20;
  } else {
    const headerRow = ws.addRow(labels);
    headerRow.eachCell((c) => {
      c.font = { bold: true };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F4FC' } };
      c.border = borderAll;
    });
  }

  rows.forEach((r) => {
    const row = ws.addRow(cols.map((k) => cellText(cfg, k, r)));
    row.eachCell((c) => {
      c.alignment = { vertical: 'top', wrapText: true };
      c.border = { top: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' }, bottom: { style: 'thin' } };
    });
  });

  ws.columns.forEach((c, i) => { c.width = Math.max(12, Math.min(40, labels[i].length + 8)); });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${cfg.title}_ปีงบ${fy}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}
