// ปฏิทินมอบหมายงาน: ประเภทงานมาตรฐาน (เลือก "อื่น ๆ" แล้วพิมพ์เองได้)
export const ASSIGNMENT_TYPES = ['ประชุม', 'งานอบรม', 'หน่วยปฐมพยาบาล', 'อื่น ๆ (ระบุเอง)'];
export const ASSIGNMENT_TYPE_OTHER = 'อื่น ๆ (ระบุเอง)';

export const ASSIGNMENT_TYPE_COLORS = {
  'ประชุม': 'bg-blue-100 text-blue-800',
  'งานอบรม': 'bg-purple-100 text-purple-800',
  'หน่วยปฐมพยาบาล': 'bg-rose-100 text-rose-800',
};
export const assignmentTypeColor = (type) => ASSIGNMENT_TYPE_COLORS[type] || 'bg-slate-100 text-slate-700';
