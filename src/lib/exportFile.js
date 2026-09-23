// ส่งออกข้อมูล rows = [{ หัวคอลัมน์: ค่า }]
export async function exportXlsx(rows, sheetName, fileName) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, `${fileName}.xlsx`);
}

export function exportCsv(rows, fileName) {
  if (!rows.length) return;
  const heads = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [heads.map(esc).join(',')].concat(rows.map((r) => heads.map((h) => esc(r[h])).join(',')));
  // ใส่ BOM เพื่อให้ Excel เปิดภาษาไทยได้ถูกต้อง
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${fileName}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
