// ทะเบียนรายบุคคลของงานการพยาบาล: ผู้สูงอายุ / ผู้พิการ / ผู้ป่วยจิตเวช
// ต่างจากทะเบียนเลขที่เอกสาร (RegistryPage) ตรงที่เป็น "ทะเบียนถาวรรายคน" ไม่แยกตามปีงบประมาณ
// เพิ่มชนิดทะเบียนใหม่ได้โดยเพิ่มค่าในไฟล์นี้ (หน้า PersonRegistry.jsx อ่านจากที่นี่ทั้งหมด รวมถึงแบบฟอร์มนำเข้า Excel)

export const PREFIXES = ['นาย', 'นาง', 'นางสาว', 'เด็กชาย', 'เด็กหญิง', 'พระ', 'อื่นๆ'];
export const GENDERS = ['ชาย', 'หญิง'];
export const STATUSES = ['มีชีวิตอยู่', 'เสียชีวิต', 'ย้ายออก'];
export const RIGHTS = ['บัตรทอง (UC)', 'ข้าราชการ', 'ประกันสังคม', 'อปท./อื่นๆ', 'ไม่มีสิทธิ'];

// ฟิลด์ที่ทุกทะเบียนมี — list: แสดงในตาราง, required: ต้องกรอก, type: text|select|date|textarea|tel|idcard
const COMMON_HEAD = [
  { key: 'idCard', label: 'เลขบัตรประชาชน', type: 'idcard', required: true, list: true, hint: '13 หลัก (ใช้ตรวจสอบรายการซ้ำตอนนำเข้า)' },
  { key: 'namePrefix', label: 'คำนำหน้า', type: 'select', options: PREFIXES },
  { key: 'name', label: 'ชื่อ - สกุล', type: 'text', required: true, list: true },
  { key: 'gender', label: 'เพศ', type: 'select', options: GENDERS },
  { key: 'birthday', label: 'วันเดือนปีเกิด', type: 'date', list: true, hint: 'ระบบคำนวณอายุให้อัตโนมัติ' },
  { key: 'houseNo', label: 'บ้านเลขที่', type: 'text', list: true },
  { key: 'moo', label: 'หมู่ที่', type: 'text', required: true, list: true, hint: 'ตัวเลข เช่น 1, 2, 3 (ใช้กรองรายหมู่บ้าน)' },
  { key: 'village', label: 'ชื่อหมู่บ้าน', type: 'text', list: true },
  { key: 'phone', label: 'เบอร์โทรศัพท์', type: 'tel' },
  { key: 'caregiver', label: 'ผู้ดูแล / ญาติ', type: 'text' },
  { key: 'caregiverPhone', label: 'เบอร์โทรผู้ดูแล', type: 'tel' },
];
const COMMON_TAIL = [
  { key: 'status', label: 'สถานะ', type: 'select', options: STATUSES, default: 'มีชีวิตอยู่', list: true },
  { key: 'note', label: 'หมายเหตุ', type: 'textarea' },
];

export const PERSON_REGISTRIES = {
  'reg-elderly': {
    key: 'reg-elderly',
    path: '/reg-elderly',
    emoji: '🧓',
    title: 'ทะเบียนผู้สูงอายุ',
    noun: 'ผู้สูงอายุ',
    unit: 'ราย',
    headerTone: 'from-orange-600 via-amber-500 to-yellow-500',
    reportColor: 'FFE699',
    filterKey: 'adlGroup',
    filterLabel: 'กลุ่มศักยภาพ (ADL)',
    fields: [
      ...COMMON_HEAD,
      { key: 'adlGroup', label: 'กลุ่มศักยภาพ (ADL)', type: 'select', options: ['ติดสังคม (กลุ่ม 1)', 'ติดบ้าน (กลุ่ม 2)', 'ติดเตียง (กลุ่ม 3)'], list: true },
      { key: 'disease', label: 'โรคประจำตัว', type: 'text', list: true },
      { key: 'rights', label: 'สิทธิการรักษา', type: 'select', options: RIGHTS },
      { key: 'allowance', label: 'เบี้ยยังชีพผู้สูงอายุ', type: 'select', options: ['ได้รับ', 'ไม่ได้รับ'] },
      { key: 'ltc', label: 'อยู่ในระบบ LTC', type: 'select', options: ['ใช่', 'ไม่ใช่'] },
      { key: 'lastVisit', label: 'เยี่ยมบ้านล่าสุด', type: 'date' },
      ...COMMON_TAIL,
    ],
  },
  'reg-disabled': {
    key: 'reg-disabled',
    path: '/reg-disabled',
    emoji: '♿',
    title: 'ทะเบียนผู้พิการ',
    noun: 'ผู้พิการ',
    unit: 'ราย',
    headerTone: 'from-sky-700 via-blue-600 to-cyan-500',
    reportColor: 'BDD7EE',
    filterKey: 'disabilityType',
    filterLabel: 'ประเภทความพิการ',
    fields: [
      ...COMMON_HEAD,
      { key: 'disabilityCardNo', label: 'เลขที่บัตรประจำตัวคนพิการ', type: 'text' },
      { key: 'registerDate', label: 'วันที่ขึ้นทะเบียนคนพิการ', type: 'date', list: true },
      {
        key: 'disabilityType', label: 'ประเภทความพิการ', type: 'select', list: true,
        options: [
          'ทางการเห็น', 'ทางการได้ยินหรือสื่อความหมาย', 'ทางการเคลื่อนไหวหรือทางร่างกาย', 'ทางจิตใจหรือพฤติกรรม',
          'ทางสติปัญญา', 'ทางการเรียนรู้', 'ทางออทิสติก',
        ],
      },
      { key: 'disabilityDetail', label: 'ลักษณะความพิการ', type: 'text', list: true, hint: 'อธิบายอาการ/ลักษณะความพิการ เช่น ตาบอด 2 ข้าง, ขาลีบ เดินลำบาก' },
      { key: 'severity', label: 'ระดับความรุนแรง', type: 'select', options: ['เล็กน้อย', 'ปานกลาง', 'รุนแรง'] },
      { key: 'level', label: 'ระดับ (ตามทะเบียนเดิม 1-5)', type: 'select', options: ['1', '2', '3', '4', '5'], list: true, hint: 'ค่าระดับ 1-5 จากทะเบียนเดิมของ รพ.สต. (ยังไม่ได้กำหนดความหมาย)' },
      { key: 'hn', label: 'HN', type: 'text', hint: 'เลขประจำตัวผู้ป่วย (Hospital Number)' },
      { key: 'cardIssue', label: 'วันที่ออกบัตร', type: 'date' },
      { key: 'cardExpire', label: 'วันหมดอายุบัตร', type: 'date', list: true },
      { key: 'allowance', label: 'เบี้ยความพิการ', type: 'select', options: ['ได้รับ', 'ไม่ได้รับ'] },
      { key: 'aid', label: 'กายอุปกรณ์ / อุปกรณ์ช่วย', type: 'text' },
      { key: 'rights', label: 'สิทธิการรักษา', type: 'select', options: RIGHTS },
      { key: 'adlGroup', label: 'กลุ่มศักยภาพ (ADL)', type: 'select', options: ['ติดสังคม (กลุ่ม 1)', 'ติดบ้าน (กลุ่ม 2)', 'ติดเตียง (กลุ่ม 3)'] },
      { key: 'lastVisit', label: 'เยี่ยมบ้านล่าสุด', type: 'date' },
      ...COMMON_TAIL,
    ],
  },
  'reg-mental': {
    key: 'reg-mental',
    path: '/reg-mental',
    emoji: '🧠',
    title: 'ทะเบียนผู้ป่วยจิตเวช',
    noun: 'ผู้ป่วยจิตเวช',
    unit: 'ราย',
    headerTone: 'from-violet-700 via-purple-600 to-fuchsia-500',
    reportColor: 'D9C3F0',
    filterKey: 'riskLevel',
    filterLabel: 'ระดับความเสี่ยง',
    sensitive: true,
    fields: [
      ...COMMON_HEAD,
      { key: 'diagnosis', label: 'การวินิจฉัย / โรค', type: 'text', list: true, datalist: ['จิตเภท (Schizophrenia)', 'โรคซึมเศร้า', 'โรคไบโพลาร์ (อารมณ์สองขั้ว)', 'โรควิตกกังวล', 'โรคจิตจากสารเสพติด', 'ภาวะสมองเสื่อม', 'ปัญญาอ่อน', 'ลมชัก/ชัก', 'อื่นๆ'] },
      { key: 'icd10', label: 'รหัส ICD-10', type: 'text' },
      { key: 'smiV', label: 'ผู้ป่วย SMI-V', type: 'select', options: ['ใช่', 'ไม่ใช่'], hint: 'ผู้ป่วยจิตเวชที่มีความเสี่ยงสูงต่อการก่อความรุนแรง' },
      { key: 'riskLevel', label: 'ระดับความเสี่ยง', type: 'select', options: ['ต่ำ', 'ปานกลาง', 'สูง'], list: true },
      { key: 'hospital', label: 'สถานพยาบาลที่รักษา', type: 'text' },
      { key: 'medication', label: 'ยาที่ใช้', type: 'text' },
      { key: 'adherence', label: 'การกินยา', type: 'select', options: ['กินยาสม่ำเสมอ', 'ขาดยา', 'ไม่ทราบ'], list: true },
      { key: 'lastVisit', label: 'เยี่ยมบ้านล่าสุด', type: 'date' },
      { key: 'nextAppt', label: 'วันนัดครั้งถัดไป', type: 'date', list: true },
      ...COMMON_TAIL,
    ],
  },
};
