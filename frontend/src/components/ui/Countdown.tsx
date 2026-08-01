'use client';
import { clsx } from 'clsx';
import { useTaskCountdown } from '@/hooks/useTaskCountdown';

interface CountdownProps {
  deadline: string | null;
  className?: string;
}

export function Countdown({ deadline, className }: CountdownProps) {
  const { days, hours, minutes, seconds, isExpired, urgency } = useTaskCountdown(deadline);

  if (!deadline) return <span className="text-ptf-text-3 text-sm">No deadline</span>;

  if (isExpired) {
    return (
      <span className={clsx('text-ptf-error text-sm font-mono font-semibold', className)}>
        Expired
      </span>
    );
  }

  const colorClass =
    urgency === 'critical'
      ? 'text-ptf-error animate-countdown-urgent'
      : urgency === 'warning'
      ? 'text-ptf-warning'
      : 'text-ptf-success';

  const parts = days > 0
    ? `${days}d ${hours}h ${minutes}m`
    : `${hours}h ${minutes}m ${seconds}s`;

  return (
    <span className={clsx('font-mono text-sm font-semibold', colorClass, className)}>
      {parts}
    </span>
  );
}
