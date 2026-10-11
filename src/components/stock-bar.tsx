// 「出品30kg／販売確定5kg／仮押さえ7kg／申込可能18kg」の見える化
import { formatKg } from "@/lib/domain/units";

export function StockBar({ total, sold, held }: { total: number; sold: number; held: number }) {
  const available = total - sold - held;
  const pct = (g: number) => `${total ? (g / total) * 100 : 0}%`;
  return (
    <div>
      <div className="flex h-4 overflow-hidden rounded-full bg-leaf-light" aria-hidden>
        <div className="bg-leaf-dark" style={{ width: pct(sold) }} />
        <div className="bg-corn" style={{ width: pct(held) }} />
      </div>
      <p className="mt-1.5 flex flex-wrap gap-x-3 text-xs">
        <span>📦 出品 {formatKg(total)}</span>
        <span className="text-leaf-dark">✅ 販売確定 {formatKg(sold)}</span>
        <span className="text-amber-700">⏳ 仮押さえ {formatKg(held)}</span>
        <span className="font-bold text-leaf">🧺 申込可能 {formatKg(available)}</span>
      </p>
    </div>
  );
}
