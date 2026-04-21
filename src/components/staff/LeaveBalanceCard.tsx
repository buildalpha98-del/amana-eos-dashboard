import { cn } from "@/lib/utils";

interface LeaveBalanceCardProps {
  balance: { accrued: number; taken: number; remaining: number };
  type: "annual" | "personal" | "long_service";
  className?: string;
}

const TYPE_LABELS = { annual: "Annual leave", personal: "Personal leave", long_service: "Long service" };

export function LeaveBalanceCard({ balance, type, className }: LeaveBalanceCardProps) {
  const pct = balance.accrued > 0 ? Math.min(100, (balance.remaining / balance.accrued) * 100) : 0;
  return (
    <div className={cn("border rounded-lg p-4 bg-white", className)}>
      <div className="text-sm font-medium text-gray-900">{TYPE_LABELS[type]}</div>
      <div className="grid grid-cols-3 gap-2 my-3 text-center">
        <div>
          <div className="text-2xl font-semibold">{balance.accrued}</div>
          <div className="text-xs text-gray-500">Accrued</div>
        </div>
        <div>
          <div className="text-2xl font-semibold">{balance.taken}</div>
          <div className="text-xs text-gray-500">Taken</div>
        </div>
        <div>
          <div className="text-2xl font-semibold text-green-700">{balance.remaining}</div>
          <div className="text-xs text-gray-500">Remaining</div>
        </div>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
