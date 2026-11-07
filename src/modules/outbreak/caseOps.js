// ลบเคสสอบสวนโรค: ลบผู้ป่วย/ผู้สัมผัสในเคส + ไฟล์แนบใน Storage (พยายามลบ ถ้าลบไฟล์ไม่ได้ก็ไม่หยุดการลบเคส) + เอกสารเคส
import { deleteDoc, doc } from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import { db, storage } from '../../firebase';
import { writeAudit } from '../../lib/audit';

export async function deleteCaseFully(cs, people) {
  for (const p of people || []) await deleteDoc(doc(db, 'outbreakPeople', p.id));
  for (const f of cs.files || []) { try { if (f.path) await deleteObject(ref(storage, f.path)); } catch { /* ไฟล์อาจถูกลบไปแล้ว */ } }
  await deleteDoc(doc(db, 'outbreakCases', cs.id));
  await writeAudit({ action: 'delete', module: 'outbreak', docId: cs.id, label: cs.title });
}
