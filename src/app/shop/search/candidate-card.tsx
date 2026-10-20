// 検索結果の1件。金額・数量・期限はアプリの計算結果。AIの説明は別枠で後から入る
// 数量が未指定のときは、購入量・送料・合計を「未計算」と表示する（予算内・配送可能などと断定しない）
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { itemEmoji } from "@/components/ui";
import type { Candidate } from "@/lib/domain/search";
import { formatJst, formatKg, formatYen } from "@/lib/domain/units";
import { DELIVERY_METHOD_LABELS, PAYMENT_TIMING_LABELS } from "@/lib/validation/listing";

export function CandidateCard({
  c,
  href,
  wantedGrams,
  ai,
  footer,
}: {
  c: Candidate;
  href: string;
  wantedGrams?: number;
  ai?: ReactNode;
  footer?: ReactNode;
}) {
  const diff = c.purchaseGrams !== null && wantedGrams !== undefined ? c.purchaseGrams - wantedGrams : 0;
  return (
    <article className="card flex flex-col gap-3 p-4 sm:flex-row">
      <Link href={href} className="relative flex h-40 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-leaf-light text-6xl sm:size-36">
        {c.photoUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.photoUrl} alt={`${c.itemName}の${c.photoIsReference ? "参考画像" : "実物写真"}`} className="size-full object-cover" />
            {c.photoIsReference && <span className="absolute bottom-1.5 left-1.5 rounded-md bg-white/90 px-1.5 text-xs font-bold text-gray-800">参考画像</span>}
          </>
        ) : (
          <span role="img" aria-label="写真なし">
            {itemEmoji(c.itemName)}
          </span>
        )}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {c.saleTargetReachable && <span className="badge bg-orange-100 text-orange-900">⏳ 早めに販売したい</span>}
          {c.trialOffered && <span className="badge bg-orange-100 text-orange-900">🧺 お試しセットあり</span>}
          {c.isNewFarmer && <span className="badge bg-lime-100 text-lime-900">🌱 新しく参加</span>}
          {c.isRepeat && <span className="badge bg-pink-100 text-pink-900">💚 リピート</span>}
          <span className="badge bg-leaf-light text-leaf-dark">{DELIVERY_METHOD_LABELS[c.deliveryMethod]}</span>
          <span className="badge bg-white text-gray-800 ring-1 ring-green-200">{PAYMENT_TIMING_LABELS[c.paymentTiming]}</span>
        </div>
        <Link href={href} className="text-lg font-bold text-leaf-dark hover:underline">
          {itemEmoji(c.itemName)} {c.itemName}
          {c.sizeLabel && <span className="ml-1 text-sm font-normal">（{c.sizeLabel}）</span>}
        </Link>
        <p className="text-sm text-gray-700">
          👩‍🌾 {c.farmName} ・ 📍{c.farmPrefecture}
          {c.farmCity}
          {c.responseGuide && ` ・ 回答目安：${c.responseGuide}`}
        </p>
        <div className="grid grid-cols-1 gap-x-3 gap-y-1 rounded-2xl bg-leaf-light/50 p-2.5 text-sm min-[420px]:grid-cols-2 lg:grid-cols-3">
          <span>単価 {formatYen(c.unitPriceYenPerKg)}/kg</span>
          <span>
            販売単位 最低{formatKg(c.minOrderGrams)}・{formatKg(c.orderStepGrams)}刻み
          </span>
          <span>申込可能 {formatKg(c.availableGrams)}</span>
          {c.purchaseGrams !== null ? (
            <>
              <span>
                購入予定 <strong>{formatKg(c.purchaseGrams)}</strong>
                {diff > 0 && <span className="text-amber-800">（希望より+{formatKg(diff)}）</span>}
              </span>
              <span>商品代 {formatYen(c.itemSubtotalYen!)}</span>
              <span>送料 {c.shippingFeeYen === null ? "未設定" : c.shippingFeeYen === 0 ? "0円" : formatYen(c.shippingFeeYen)}</span>
            </>
          ) : (
            <span className="col-span-full text-gray-700">数量が未指定のため、購入量・送料・合計はまだ計算していません。</span>
          )}
        </div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="text-sm text-gray-700">
            <div>📅 受け渡し {formatJst(c.firstSlotAt)}〜</div>
            <div>🗓 受付期限 {formatJst(c.acceptDeadlineAt)}</div>
            {c.saleTargetReachable && c.saleTargetAt && <div className="font-bold text-orange-900">⏳ 販売希望期限 {formatJst(c.saleTargetAt)}</div>}
            <div className="font-bold text-amber-900">⏰ いま申し込むと {formatJst(c.orderDeadlineAt)} までに回答</div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-700">送料込み合計</div>
            <div className="text-2xl font-bold text-leaf-dark">
              {c.totalYen !== null ? formatYen(c.totalYen) : c.purchaseGrams === null ? <span className="text-base">未計算</span> : "送料未確定"}
            </div>
          </div>
        </div>
        {ai && (
          <Suspense fallback={<p className="text-sm text-gray-700">🤖 AIが説明を考えています…</p>}>
            {ai}
          </Suspense>
        )}
        {footer}
      </div>
    </article>
  );
}
