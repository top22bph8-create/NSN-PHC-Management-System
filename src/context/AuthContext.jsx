import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { OWNER_EMAIL } from '../lib/roles';
import { writeAudit } from '../lib/audit';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, profile: null, problem: null });

  useEffect(
    () =>
      onAuthStateChanged(auth, async (user) => {
        if (!user) {
          setState({ loading: false, user: null, profile: null, problem: null });
          return;
        }
        setState((s) => ({ ...s, loading: true }));
        try {
          const email = user.email.toLowerCase();
          const ref = doc(db, 'users', email);
          let snap = await getDoc(ref);
          // ครั้งแรกของเจ้าของระบบ: สร้างสิทธิ์ Super Admin ให้อัตโนมัติ
          if (!snap.exists() && email === OWNER_EMAIL) {
            await setDoc(ref, {
              email,
              name: 'ผู้ดูแลระบบสูงสุด',
              role: 'super_admin',
              active: true,
              createdAt: serverTimestamp(),
            });
            snap = await getDoc(ref);
          }
          if (!snap.exists()) {
            setState({ loading: false, user, profile: null, problem: 'no-profile' });
            return;
          }
          const profile = { ...snap.data(), email };
          if (!profile.active) {
            setState({ loading: false, user, profile: null, problem: 'inactive' });
            return;
          }
          setState({ loading: false, user, profile, problem: null });
          try {
            if (!sessionStorage.getItem('nsn-login-logged')) {
              sessionStorage.setItem('nsn-login-logged', '1');
              await writeAudit({ action: 'login', module: 'auth', label: email });
            }
          } catch {
            /* บันทึก Audit ไม่สำเร็จไม่ควรทำให้เข้าระบบไม่ได้ */
          }
        } catch (e) {
          setState({ loading: false, user, profile: null, problem: 'error', error: e.code || e.message });
        }
      }),
    [],
  );

  const logout = async () => {
    try { sessionStorage.removeItem('nsn-login-logged'); } catch { /* ignore */ }
    await signOut(auth);
  };

  // โหลดโปรไฟล์ใหม่ (ใช้หลังเปลี่ยนรหัสผ่านครั้งแรก)
  const refresh = async () => {
    const u = auth.currentUser;
    if (!u) return;
    const email = u.email.toLowerCase();
    const snap = await getDoc(doc(db, 'users', email));
    if (snap.exists()) setState((s) => ({ ...s, profile: { ...snap.data(), email } }));
  };

  return <Ctx.Provider value={{ ...state, logout, refresh }}>{children}</Ctx.Provider>;
}
