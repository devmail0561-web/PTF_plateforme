'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { clsx } from 'clsx';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className={clsx(
        'bg-ptf-elevated border border-ptf-border rounded-xl p-6 w-full max-w-lg',
        'backdrop:bg-black/60 backdrop:backdrop-blur-sm',
        'text-ptf-text',
        '[&::backdrop]:bg-black/60',
        className
      )}
    >
      {title && (
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-ptf-text">{title}</h2>
          <button
            onClick={onClose}
            className="text-ptf-text-3 hover:text-ptf-text transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      )}
      {children}
    </dialog>
  );
}
