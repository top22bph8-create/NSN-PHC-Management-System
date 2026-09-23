// ตั้งค่าการเชื่อมต่อ Firebase ของ รพ.สต.บ้านหนองสนม
// ค่าเหล่านี้เปิดเผยได้ตามปกติ ความปลอดภัยอยู่ที่ Firestore Rules
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAGnLzjmmmTIo3Ks_InRopMihfSYKOg0yg",
  authDomain: "nsn-phc-web.firebaseapp.com",
  projectId: "nsn-phc-web",
  storageBucket: "nsn-phc-web.firebasestorage.app",
  messagingSenderId: "214096890146",
  appId: "1:214096890146:web:7161d8d01f448ca7213d7b",
  measurementId: "G-S8D5Z3LV49"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
