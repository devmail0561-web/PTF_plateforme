'use client';
import { useToastStore, type Toast } from '@/lib/toast/toastStore';
import { clsx } from 'clsx';

const TYPE_STYLES: Record<Toast['type'], string> = {
  success: 'bg-ptf-success/10 border-ptf-success/30 text-ptf-success',
  error:   'bg-ptf-error/10 border-ptf-error/30 text-ptf-error',
  warning: 'bg-ptf-warning/10 border-ptf-warning/30 text-ptf-warning',
  info:    'bg-ptf-info/10 border-ptf-info/30 text-ptf-info',
};

const TYPE_ICONS: Record<Toast['type'], string> = {
  success: '✓',
  error:   '✕',
  warning: '⚠',
  info:    'ℹ',
};

export function Toaster() {
  const { toasts, remove } = useToastStore();

  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={clsx(
            'flex items-start gap-3 px-4 py-3 rounded-xl border text-sm font-medium',
            'shadow-lg pointer-events-auto',
            'animate-in slide-in-from-right-5 fade-in duration-200',
            TYPE_STYLES[t.type]
          )}
        >
          <span className="shrink-0 font-bold">{TYPE_ICONS[t.type]}</span>
          <span className="flex-1 leading-snug">{t.message}</span>
          <button
            onClick={() => remove(t.id)}
            className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
