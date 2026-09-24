// บทบาทและสิทธิ์การเข้าถึง (Role-Based Access Control)
// หมายเหตุ: ต้องตรงกับไฟล์ firestore.rules และ storage.rules
export const OWNER_EMAIL = 'top22bph8@gmail.com';

export const ROLES = {
  super_admin: 'Super Admin',
  director: 'ผู้อำนวยการ',
  admin_clerk: 'งานธุรการ',
  finance: 'งานการเงิน',
  supplies: 'งานพัสดุ',
  disease_control: 'งานส่งเสริมป้องกันควบคุมโรค',
  family_med: 'งานเวชปฏิบัติครอบครัว',
  viewer: 'ผู้ดูรายงาน',
  staff: 'เจ้าหน้าที่ทั่วไป',
};

const ALL = Object.keys(ROLES);

export const ACCESS = {
  incoming: { read: ['super_admin', 'director', 'admin_clerk', 'viewer'], write: ['super_admin', 'admin_clerk'] },
  outgoing: { read: ['super_admin', 'director', 'admin_clerk', 'viewer'], write: ['super_admin', 'admin_clerk'] },
  personnel: { read: ALL, write: ['super_admin'] },
  leave: { read: ALL, write: ALL, viewAll: ['super_admin', 'director', 'admin_clerk'], approve: ['super_admin', 'director'] },
  users: { read: ['super_admin'], write: ['super_admin'] },
  settings: { read: ['super_admin'], write: ['super_admin'] },
  backup: { read: ['super_admin'], write: ['super_admin'] },
  audit: { read: ['super_admin', 'director'], write: [] },
};

export const canRead = (role, module) => !!role && (ACCESS[module]?.read || []).includes(role);
export const canWrite = (role, module) => !!role && (ACCESS[module]?.write || []).includes(role);
export const can = (role, module, action) => !!role && (ACCESS[module]?.[action] || []).includes(role);
