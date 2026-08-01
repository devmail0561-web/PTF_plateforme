import { clsx } from 'clsx';
import { forwardRef, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-ptf-text-2">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={clsx(
            'w-full px-3 py-2 rounded-lg text-sm',
            'bg-ptf-elevated border border-ptf-border',
            'text-ptf-text placeholder:text-ptf-text-3',
            'focus:outline-none focus:ring-2 focus:ring-ptf-accent/50 focus:border-ptf-accent',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error && 'border-ptf-error focus:ring-ptf-error/50',
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-ptf-error">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
