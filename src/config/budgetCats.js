// หมวดแผนการใช้จ่ายเงินบำรุงโรงพยาบาลและหน่วยบริการสาธารณสุข (หมวด 1-10 = เงินบำรุง g:'main'; หมวด 11-13 = แหล่งงบประมาณอื่น g:'other' แยกยอด ไม่รวมกับหมวด 1-10)
// เก็บค่าในฎีกา (reg-deeka.budgetCat) เป็นชื่อหมวดตามนี้ — อย่าเปลี่ยนข้อความของหมวดที่ใช้งานแล้ว
export const BUDGET_CATS = [
  { id: 'c01', no: 1, g: 'main', name: 'ค่ายาและเวชภัณฑ์' },
  { id: 'c02', no: 2, g: 'main', name: 'ค่าวัสดุ' },
  { id: 'c03', no: 3, g: 'main', name: 'ค่าตอบแทนทางการแพทย์' },
  { id: 'c04', no: 4, g: 'main', name: 'ค่าบริการทางการแพทย์' },
  { id: 'c05', no: 5, g: 'main', name: 'ค่าครุภัณฑ์ ที่ดิน และสิ่งปลูกสร้าง' },
  { id: 'c06', no: 6, g: 'main', name: 'ค่าใช้สอย' },
  { id: 'c07', no: 7, g: 'main', name: 'ค่าสาธารณูปโภค' },
  { id: 'c08', no: 8, g: 'main', name: 'ค่าจ้างลูกจ้างเงินบำรุง' },
  { id: 'c09', no: 9, g: 'main', name: 'ค่าตอบแทนการปฏิบัติงานนอกเวลาราชการ' },
  { id: 'c10', no: 10, g: 'main', name: 'ค่าใช้จ่ายการเดินทางไปราชการ/ค่าใช้จ่ายในการเข้ารับการฝึกอบรม' },
  { id: 'c11', no: 11, g: 'other', name: 'งบประมาณค่าเสื่อม จาก สปสช.' },
  { id: 'c12', no: 12, g: 'other', name: 'งบอุดหนุนจากกองทุนหลักประกันสุขภาพระดับท้องถิ่น' },
  { id: 'c13', no: 13, g: 'other', name: 'ยอดกันเงินรายจ่ายจากปีงบประมาณก่อน' },
];
export const GROUPS = [
  { id: 'main', label: 'หมวด 1–10 (เงินบำรุง)', short: 'หมวด 1–10' },
  { id: 'other', label: 'หมวด 11–13 (งบจากแหล่งอื่น)', short: 'หมวด 11–13' },
  { id: 'all', label: 'รวมทุกหมวด', short: 'รวมทุกหมวด' },
];
export const catsOf = (g) => BUDGET_CATS.filter((c) => g === 'all' || c.g === g);
export const CAT_NAMES = BUDGET_CATS.map((c) => c.name);
export const catByName = (n) => BUDGET_CATS.find((c) => c.name === n);
export const catById = (id) => BUDGET_CATS.find((c) => c.id === id);
