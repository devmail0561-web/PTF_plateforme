import { Card } from '@/components/ui/Card';
import { formatPTF } from '@/lib/ptf/formatters';

interface UTXOBalanceCardProps {
  available: number;
  locked: number;
  total: number;
}

export function UTXOBalanceCard({ available, locked, total }: UTXOBalanceCardProps) {
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-ptf-text">PTF Balance</h2>

      <div className="flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-ptf-text-2">Available</span>
          <span className="font-mono font-semibold text-ptf-success">{formatPTF(available)}</span>
        </div>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-ptf-text-2">Soft-locked</span>
            <span
              className="text-xs text-ptf-text-3 cursor-help"
              title="Locked as deposit during active tasks. Released when task ends."
            >
              ⓘ
            </span>
          </div>
          <span className="font-mono font-semibold text-ptf-warning">{formatPTF(locked)}</span>
        </div>
        <div className="border-t border-ptf-border pt-3 flex justify-between items-center">
          <span className="text-sm font-medium text-ptf-text">Total</span>
          <span className="font-mono font-bold text-ptf-text">{formatPTF(total)}</span>
        </div>
      </div>
    </Card>
  );
}
