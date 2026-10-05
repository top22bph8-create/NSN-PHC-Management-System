// บทบาทและสิทธิ์การเข้าถึง (Role-Based Access Control)
// หมายเหตุ: ต้องตรงกับไฟล์ firestore.rules และ storage.rules
export const OWNER_EMAIL = 'top22bph8@gmail.com';

// ลดบทบาทเหลือ 2 แบบตามที่แจ้ง: "Super Admin" (ตั้งค่า/อนุมัติบัญชี/แก้ไขได้ทุกอย่าง) และ "ผู้ใช้งาน" (พนักงานทั่วไป
// แก้ไขทะเบียนต่างๆ ได้เท่ากันหมด ไม่แบ่งแผนกอีกต่อไป) — มีแค่ Super Admin เท่านั้นที่กำหนด/เปลี่ยนบทบาทให้คนอื่นได้
// (บังคับที่ ACCESS.personnel/users ด้านล่าง: write: ['super_admin'] เท่านั้น)
export const ROLES = {
  super_admin: 'Super Admin',
  staff: 'ผู้ใช้งาน',
};

const ALL = Object.keys(ROLES);

// บทบาทที่ผู้ดูแลระบบกำหนดให้ผู้ใช้งานได้ (ไม่รวม "pending" ซึ่งเป็นสถานะรออนุมัติเท่านั้น)
export const ASSIGNABLE_ROLES = ROLES;
// ป้ายกำกับสำหรับบัญชีที่สมัครเข้ามาเองและรออนุมัติ (ไม่ใช่บทบาทที่ใช้งานจริง)
export const PENDING_LABEL = 'รอผู้ดูแลระบบอนุมัติ';

// รองรับบัญชีเก่าที่ยังมีค่า role แบบละเอียด (director/admin_clerk/finance/ฯลฯ) ค้างอยู่ในฐานข้อมูล จากก่อนรวมบทบาท
// เหลือ 2 แบบ — แปลงให้เท่ากับ "ผู้ใช้งาน" โดยอัตโนมัติเสมอ (ไม่ต้องไปไล่แก้ค่าที่บันทึกไว้เดิมทีละคน) ส่วน super_admin
// และ pending คงค่าเดิมไว้ตรงๆ
export const normalizeRole = (role) => (role === 'super_admin' || role === 'pending' ? role : role ? 'staff' : role);

export const ACCESS = {
  incoming: { read: ALL, write: ALL },
  outgoing: { read: ALL, write: ALL },
  vehicle: { read: ALL, write: ALL },
  duty: { read: ALL, write: ALL },
  homevisit: { read: ALL, write: ALL },
  // ทำเนียบบุคลากร (ฐานข้อมูลบุคคล/ประวัติราชการ) — Super Admin เท่านั้นที่แก้ไขได้ ดูได้ทุกคน
  personnel: { read: ALL, write: ['super_admin'] },
  // กำหนดผู้ใช้งาน/อนุมัติสมัครสมาชิก (Username/รหัสผ่าน/บทบาท/บัญชี) — Super Admin เท่านั้นทั้งดูและแก้
  users: { read: ['super_admin'], write: ['super_admin'] },
  leave: { read: ALL, write: ALL, viewAll: ['super_admin'], approve: ['super_admin'] },
  assignments: { read: ALL, write: ALL },
  'reg-orders': { read: ALL, write: ALL },
  'reg-announce': { read: ALL, write: ALL },
  'reg-procurement': { read: ALL, write: ALL },
  'reg-contract-no': { read: ALL, write: ALL },
  'reg-loan': { read: ALL, write: ALL },
  'reg-cheque': { read: ALL, write: ALL },
  'reg-receipt': { read: ALL, write: ALL },
  'reg-deeka': { read: ALL, write: ALL },
  'reg-certificate': { read: ALL, write: ALL },
  settings: { read: ['super_admin'], write: ['super_admin'] },
  backup: { read: ['super_admin'], write: ['super_admin'] },
  audit: { read: ['super_admin'], write: [] },
};

export const canRead = (role, module) => !!role && (ACCESS[module]?.read || []).includes(normalizeRole(role));
export const canWrite = (role, module) => !!role && (ACCESS[module]?.write || []).includes(normalizeRole(role));
export const can = (role, module, action) => !!role && (ACCESS[module]?.[action] || []).includes(normalizeRole(role));
