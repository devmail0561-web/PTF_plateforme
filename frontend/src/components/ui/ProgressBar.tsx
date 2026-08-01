import { clsx } from 'clsx';

interface ProgressBarProps {
  value: number;
  max?: number;
  className?: string;
  colorClass?: string;
  showLabel?: boolean;
}

export function ProgressBar({ value, max = 100, className, colorClass = 'bg-ptf-accent', showLabel }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={clsx('w-full', className)}>
      <div className="h-2 rounded-full bg-ptf-muted overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all duration-300', colorClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <p className="text-xs text-ptf-text-3 mt-1 text-right">{Math.round(pct)}%</p>
      )}
    </div>
  );
}
