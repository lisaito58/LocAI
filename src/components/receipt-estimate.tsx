// 概算受取額の表示。費用が未入力のときに「手元に残る額」と誤解されないよう、
// 受け取る総額と、費用を差し引いた概算額を分けて表示する（未入力の費用は0円とみなさない）
import type { estimateReceipt } from "@/lib/domain/estimate";
import { formatYen } from "@/lib/domain/units";

export function ReceiptEstimate({ r, size = "md" }: { r: ReturnType<typeof estimateReceipt>; size?: "sm" | "md" }) {
  const big = size === "md" ? "text-xl" : "text-lg";
  return (
    <dl className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <dt className="text-sm">受け取る総額（商品代＋送料）</dt>
        <dd className="font-bold">{formatYen(r.grossYen)}</dd>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <dt className="text-sm">費用を差し引いた概算額</dt>
        <dd className={`${big} font-bold text-leaf-dark`}>
          {r.noneEntered ? <span className="text-gray-700">未計算</span> : `約 ${formatYen(r.amountYen)}`}
        </dd>
      </div>
      {r.noneEntered ? (
        <p className="text-sm text-amber-900">配送実費・梱包費などを入力すると計算できます。</p>
      ) : (
        !r.complete && (
          <p className="text-sm text-amber-900">
            未入力の費用（{r.missing.join("・")}）を除いた暫定額です。入力すると実際に近い額になります。
          </p>
        )
      )}
    </dl>
  );
}
