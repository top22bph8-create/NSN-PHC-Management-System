import { AlertTriangle, FileX2, Loader2, X } from 'lucide-react';

export function Spinner({ label = 'กำลังโหลด...' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-slate-500" role="status">
      <Loader2 className="h-5 w-5 animate-spin" /> {label}
    </div>
  );
}

export function EmptyState({ title = 'ยังไม่มีข้อมูล', hint, action }) {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center text-slate-500">
      <FileX2 className="h-10 w-10 text-slate-300" />
      <div className="text-lg font-medium text-slate-600">{title}</div>
      {hint && <div className="text-sm">{hint}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="m-4 flex flex-col items-center gap-2 rounded-lg border border-red-200 bg-red-50 py-8 text-center text-red-700">
      <AlertTriangle className="h-8 w-8" />
      <div className="font-medium">เกิดข้อผิดพลาด</div>
      <div className="max-w-md px-4 text-sm">{message}</div>
      {onRetry && <button className="btn btn-outline mt-2" onClick={onRetry}>ลองใหม่</button>}
    </div>
  );
}

export function Modal({ title, onClose, children, wide = false, footer }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={`flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100" aria-label="ปิด"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// กล่องยืนยันก่อนลบข้อมูล
export function ConfirmDialog({ message, confirmLabel = 'ลบข้อมูล', busy, onConfirm, onCancel }) {
  return (
    <Modal
      title="ยืนยันการลบ"
      onClose={onCancel}
      footer={
        <>
          <button className="btn btn-outline" onClick={onCancel} disabled={busy}>ยกเลิก</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-base">{message}</p>
      <p className="mt-2 text-sm text-slate-500">การลบไม่สามารถย้อนกลับได้ และจะถูกบันทึกใน Audit Log</p>
    </Modal>
  );
}

export function Badge({ children, className = 'bg-slate-100 text-slate-700' }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-sm font-medium ${className}`}>{children}</span>;
}

export function Toast({ toast, onClose }) {
  if (!toast) return null;
  const color = toast.type === 'error' ? 'bg-red-600' : 'bg-brand-700';
  return (
    <div className={`fixed bottom-20 left-1/2 z-[60] -translate-x-1/2 rounded-lg px-4 py-2 text-white shadow-lg lg:bottom-6 ${color}`} onClick={onClose} role="status">
      {toast.text}
    </div>
  );
}
