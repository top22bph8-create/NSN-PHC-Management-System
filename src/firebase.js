// ค่าเชื่อมต่อ Firebase ของ รพ.สต.บ้านหนองสนม
// ค่าเหล่านี้เปิดเผยได้ตามปกติ ความปลอดภัยอยู่ที่ Firestore/Storage Rules (ดูไฟล์ firestore.rules, storage.rules)
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyAGnLzjmmmTIo3Ks_InRopMihfSYKOg0yg',
  authDomain: 'nsn-phc-web.firebaseapp.com',
  projectId: 'nsn-phc-web',
  storageBucket: 'nsn-phc-web.firebasestorage.app',
  messagingSenderId: '214096890146',
  appId: '1:214096890146:web:7161d8d01f448ca7213d7b',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
