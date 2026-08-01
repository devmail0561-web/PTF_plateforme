import { clsx } from 'clsx';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export function Card({ children, className, hover }: CardProps) {
  return (
    <div
      className={clsx(
        'bg-ptf-surface border border-ptf-border rounded-xl p-6',
        hover && 'hover:border-ptf-muted transition-colors duration-150 cursor-pointer',
        className
      )}
    >
      {children}
    </div>
  );
}
