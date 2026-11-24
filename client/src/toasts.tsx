import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export interface Toast {
  id: number;
  title: string;
  body?: string;
  icon?: ReactNode;
}

const ToastContext = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = nextId++;
    setToasts((list) => [...list, { ...t, id }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 5000);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.icon && <span className="toast-icon">{t.icon}</span>}
            <div>
              <b>{t.title}</b>
              {t.body && <p>{t.body}</p>}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => useContext(ToastContext);
