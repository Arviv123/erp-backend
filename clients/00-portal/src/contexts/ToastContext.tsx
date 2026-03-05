import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
  visible: boolean; // used for fade-out before removal
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  showSuccess: (message: string, duration?: number) => void;
  showError: (message: string, duration?: number) => void;
  showWarning: (message: string, duration?: number) => void;
  showInfo: (message: string, duration?: number) => void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

// ─── Style maps ──────────────────────────────────────────────────────────────

const TYPE_STYLES: Record<ToastType, string> = {
  success: 'bg-green-600 text-white',
  error: 'bg-red-600 text-white',
  warning: 'bg-amber-500 text-white',
  info: 'bg-blue-600 text-white',
};

const TYPE_ICONS: Record<ToastType, React.ElementType> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

// ─── Single Toast Item ────────────────────────────────────────────────────────

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const Icon = TYPE_ICONS[toast.type];

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        transition: 'opacity 300ms ease, transform 300ms ease',
        opacity: toast.visible ? 1 : 0,
        transform: toast.visible ? 'translateY(0)' : 'translateY(12px)',
      }}
      className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium min-w-[200px] max-w-sm ${TYPE_STYLES[toast.type]}`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="opacity-70 hover:opacity-100 transition-opacity mr-1 flex-shrink-0"
        aria-label="סגור"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Track timeout handles so we can clear them on manual dismiss
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    // First fade out
    setToasts(prev =>
      prev.map(t => (t.id === id ? { ...t, visible: false } : t)),
    );
    // Then remove from DOM after animation
    const removeTimer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 320);
    timers.current.set(`${id}-remove`, removeTimer);
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', duration = 4000) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      // Start invisible so we can animate in
      setToasts(prev => [
        ...prev,
        { id, type, message, duration, visible: false },
      ]);

      // Trigger enter animation on next tick
      const enterTimer = setTimeout(() => {
        setToasts(prev =>
          prev.map(t => (t.id === id ? { ...t, visible: true } : t)),
        );
      }, 10);
      timers.current.set(`${id}-enter`, enterTimer);

      // Auto-dismiss
      const autoTimer = setTimeout(() => removeToast(id), duration);
      timers.current.set(id, autoTimer);

      return id;
    },
    [removeToast],
  );

  const showSuccess = useCallback(
    (message: string, duration?: number) => showToast(message, 'success', duration),
    [showToast],
  );
  const showError = useCallback(
    (message: string, duration?: number) => showToast(message, 'error', duration),
    [showToast],
  );
  const showWarning = useCallback(
    (message: string, duration?: number) => showToast(message, 'warning', duration),
    [showToast],
  );
  const showInfo = useCallback(
    (message: string, duration?: number) => showToast(message, 'info', duration),
    [showToast],
  );

  const handleDismiss = useCallback(
    (id: string) => {
      // Cancel the auto-dismiss timer
      const autoTimer = timers.current.get(id);
      if (autoTimer) clearTimeout(autoTimer);
      timers.current.delete(id);
      removeToast(id);
    },
    [removeToast],
  );

  const value: ToastContextValue = {
    showToast,
    showSuccess,
    showError,
    showWarning,
    showInfo,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast stack — centered at bottom */}
      <div
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 items-center pointer-events-none"
        dir="rtl"
      >
        {toasts.map(toast => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastItem toast={toast} onDismiss={handleDismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside ToastProvider');
  }
  return ctx;
}

export default ToastProvider;
