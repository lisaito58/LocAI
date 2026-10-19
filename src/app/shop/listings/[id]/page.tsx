import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { openInquiryAction } from "@/app/actions/orders";
import { ActionButton } from "@/components/action-button";
import { ReqMark } from "@/components/fields";
import { ReviewList } from "@/components/reviews";
import { getFarmerReviews } from "@/lib/domain/reviews";
import { itemEmoji, Loading, Notice, Page } from "@/components/ui";
import { expireDueOrders, quoteOrder } from "@/lib/domain/orders";
import { dbNow } from "@/lib/domain/tx";
import {
  endOfJstDay,
  formatDateOnly,
  formatJst,
  formatKg,
  formatYen,
  gramsToKgText,
  jstLocalToDate,
  kgTextToGrams,
} from "@/lib/domain/units";
import { requireRestaurant } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { DELIVERY_METHOD_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_TIMING_LABELS } from "@/lib/validation/listing";
import { searchHref } from "@/lib/validation/search";
import { OrderForm } from "./order-form";

export const metadata: Metadata = { title: "出品の詳細 | LocAI" };

export default function ShopListingPage({ params, searchParams }: PageProps<"/shop/listings/[id]">) {
  return (
    <Page>
      <Suspense fallback={<Loading />}>
        <Content params={params} searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}

async function Content({ params, searchParams }: Pick<PageProps<"/shop/listings/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const q: Record<string, string> = {};
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string") q[k] = v;
  const { profile } = await requireRestaurant();
  if (!profile) {
    return (
      <Notice tone="warn">
        はじめに <Link href="/shop/profile" className="link">店舗情報</Link> を登録してください。
      </Notice>
    );
  }
  await expireDueOrders(prisma, { listingIds: [id] });
  const now = await dbNow(prisma);
  const listing = await prisma.listing.findFirst({
    where: { id, status: { not: "DRAFT" } },
    include: {
      farmer: {
        select: { farmName: true, prefecture: true, city: true, introduction: true, commitment: true, mainItems: true, responseGuide: true, availableWeekdays: true },
      },
      photos: { orderBy: [{ publishRound: "desc" }, { createdAt: "asc" }], select: { id: true, url: true, takenOn: true, publishRound: true } },
      deliveryOptions: {
        where: { active: true },
        include: {
          shippingRates: { where: { prefecture: profile.prefecture }, orderBy: { minGramsExclusive: "asc" } },
          scheduleSlots: { where: { startsAt: { gt: now } }, orderBy: { startsAt: "asc" } },
        },
      },
    },
  });
  if (!listing) notFound();
  const currentPhotos = listing.photos.filter((p) => p.publishRound === listing.publishRound);
  const available = listing.totalGrams - listing.soldGrams - listing.heldGrams;
  const accepting = listing.status === "PUBLISHED" && listing.acceptDeadlineAt > now;

  // 申込条件（検索から引き継ぐ。ここで変更もできる）
  const purchaseKg = q.purchaseKg ?? (q.purchase ? gramsToKgText(Number(q.purchase)) : q.qty ?? "");
  const budget = q.budget ?? "";
  const use = q.use ?? "";
  const by = q.by ?? "";
  const useEnd = /^\d{4}-\d{2}-\d{2}$/.test(use) ? endOfJstDay(use) : null;

  const choices = listing.deliveryOptions.flatMap((o) =>
    o.scheduleSlots
      .filter((s) => !useEnd || s.startsAt < useEnd)
      .map((s) => ({
        value: `${o.id}:${s.id}`,
        label: `${DELIVERY_METHOD_LABELS[o.method]} ・ ${formatJst(s.startsAt)}${s.capacity !== null && s.usedCount >= s.capacity ? "（満枠）" : ""}`,
        full: s.capacity !== null && s.usedCount >= s.capacity,
      })),
  );
  const [optionId, slotId] = (q.choice ?? "").split(":");

  let quote: Awaited<ReturnType<typeof quoteOrder>> | null = null;
  const grams = kgTextToGrams(purchaseKg);
  const byDate = jstLocalToDate(by);
  if (q.choice && grams !== null && byDate && budget && use) {
    quote = await quoteOrder(prisma, {
      listingId: listing.id,
      deliveryOptionId: optionId,
      scheduleSlotId: slotId,
      quantityGrams: grams,
      budgetYen: Number(budget),
      useDate: use,
      purchaseConfirmByAt: byDate,
      prefecture: profile.prefecture,
    });
  }

  const myOrders = await prisma.order.findMany({
    where: { restaurant: { userId: profile.userId }, listingId: { not: listing.id }, status: { in: ["AWAITING_RESPONSE", "AWAITING_REAGREEMENT", "CONFIRMED"] } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, snapItemName: true, quantityGrams: true, useDate: true, farmer: { select: { farmName: true } } },
  });
  const backHref = q.seed ? searchHref(q, { purchase: null, purchaseKg: null, choice: null, inquiry: null }) : "/shop/search";

  return (
    <div className="flex flex-col gap-5">
      <Link href={backHref} className="link self-start text-sm">
        ← 検索結果に戻る
      </Link>

      <section className="card flex flex-col gap-4 sm:flex-row">
        <div className="flex flex-col gap-2 sm:w-64">
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-3xl bg-leaf-light text-7xl">
            {currentPhotos[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentPhotos[0].url} alt={`${listing.itemName}の実物写真`} className="size-full object-cover" />
            ) : (
              itemEmoji(listing.itemName)
            )}
          </div>
          {currentPhotos[0] && (
            <p className="text-center text-xs text-gray-700">📷 農家さんが撮影した実物写真（撮影日 {formatDateOnly(currentPhotos[0].takenOn)}）</p>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <h1 className="text-2xl font-bold text-leaf-dark">
            {itemEmoji(listing.itemName)} {listing.itemName}
          </h1>
          <p className="text-sm">
            👩‍🌾 <strong>{listing.farmer.farmName}</strong>（📍{listing.farmer.prefecture}
            {listing.farmer.city}）
          </p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Info label="単価" value={`${formatYen(listing.unitPriceYenPerKg)}/kg`} />
            <Info label="申込可能" value={formatKg(Math.max(0, available))} />
            <Info label="販売単位" value={`最低${formatKg(listing.minOrderGrams)}・${formatKg(listing.orderStepGrams)}刻み`} />
            <Info label="受付期限" value={formatJst(listing.acceptDeadlineAt)} />
            {listing.sizeLabel && <Info label="大きさ" value={listing.sizeLabel} />}
            {listing.conditionNote && <Info label="状態" value={listing.conditionNote} />}
          </div>
          {listing.earlySale && listing.saleTargetAt && listing.saleTargetAt > now && (
            <p className="rounded-2xl bg-orange-50 px-3 py-2 text-sm text-orange-950">
              ⏳ 農家さんは {formatJst(listing.saleTargetAt)} までに販売を決めたいと希望しています（早く届くという意味ではありません。受け渡し日は下の日程で確認してください）。
            </p>
          )}
          {listing.description && <p className="text-sm whitespace-pre-wrap">{listing.description}</p>}
          {listing.selfDeclaredFeatures && (
            <p className="rounded-2xl bg-leaf-light/60 px-3 py-2 text-sm">
              <span className="badge mr-1 bg-white text-leaf-dark">農家さんの自己申告</span>
              {listing.selfDeclaredFeatures}
            </p>
          )}
        </div>
      </section>

      {(listing.farmer.introduction || listing.farmer.commitment) && (
        <section className="card-soft text-sm">
          <h2 className="section-title">🌾 {listing.farmer.farmName} について</h2>
          {listing.farmer.mainItems && <p className="mt-1">主な品目：{listing.farmer.mainItems}</p>}
          {listing.farmer.commitment && <p className="mt-1">こだわり（自己申告）：{listing.farmer.commitment}</p>}
          {listing.farmer.introduction && <p className="mt-2 whitespace-pre-wrap">{listing.farmer.introduction}</p>}
          <p className="mt-2 text-xs text-gray-700">
            回答の目安：{listing.farmer.responseGuide ?? "未設定"}
            {listing.farmer.availableWeekdays && ` ・ 対応曜日：${listing.farmer.availableWeekdays}`}（参考。回答を保証するものではありません）
          </p>
        </section>
      )}

      <section className="card-soft flex flex-col gap-3">
        <h2 className="section-title">✍️ {listing.farmer.farmName} の取引レビュー</h2>
        <ReviewList summary={await getFarmerReviews(prisma, listing.farmerId, 5)} />
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="section-title">🚚 受け渡し・支払いの条件</h2>
        {listing.deliveryOptions.map((o) => (
          <div key={o.id} className="rounded-2xl bg-leaf-light/40 p-3 text-sm">
            <div className="font-bold">
              {DELIVERY_METHOD_LABELS[o.method]} ・ {PAYMENT_TIMING_LABELS[o.paymentTiming]}（{PAYMENT_METHOD_LABELS[o.paymentMethod]}）
            </div>
            <div className="text-xs">
              {o.paymentTiming === "PREPAID" && o.prepayDeadlineAt ? `支払期限：${formatJst(o.prepayDeadlineAt)}` : "支払期限：受け渡しのとき"}
              {` ・ 入金確認の目安：申告から${o.paymentConfirmGuideHours}時間`}
            </div>
            <div className="mt-1 flex flex-wrap gap-1 text-xs">
              {o.shippingRates.length === 0 ? (
                <span className="badge bg-amber-100 text-amber-800">{profile.prefecture}への送料は未設定（相談のみ）</span>
              ) : (
                o.shippingRates.map((r) => (
                  <span key={r.id} className="badge bg-white">
                    {r.prefecture} {gramsToKgText(r.minGramsExclusive)}kg超〜{gramsToKgText(r.maxGramsInclusive)}kg以下 {r.feeYen === 0 ? "0円" : formatYen(r.feeYen)}
                  </span>
                ))
              )}
            </div>
          </div>
        ))}
        <p className="hint">アプリ内で決済・配送の手配はしません。支払い・発送は当事者が行い、アプリには記録だけを残します。</p>
      </section>

      {/* 申込 */}
      <section id="order" className="card flex flex-col gap-4">
        <h2 className="section-title">🧺 購入希望を送る</h2>
        {!accepting ? (
          <Notice tone="warn">この出品はいま新しい申込を受け付けていません。</Notice>
        ) : (
          <>
            <p className="hint">申し込む前に、下の条件をすべて入れて「合計と期限を確認する」を押してください。</p>
            <form className="grid gap-3 sm:grid-cols-2" action={`/shop/listings/${listing.id}#order`}>
              {Object.entries(q)
                .filter(([k]) => !["purchaseKg", "purchase", "budget", "use", "by", "choice"].includes(k))
                .map(([k, v]) => (
                  <input key={k} type="hidden" name={k} value={v} />
                ))}
              <Labeled label="⚖️ 購入する量（kg）">
                <input name="purchaseKg" className="input" inputMode="decimal" defaultValue={purchaseKg} required />
              </Labeled>
              <Labeled label="💴 送料込み予算（円）">
                <input name="budget" className="input" inputMode="numeric" defaultValue={budget} required />
              </Labeled>
              <Labeled label="🍽️ 使用日">
                <input name="use" type="date" className="input" defaultValue={use} required />
              </Labeled>
              <Labeled label="⏰ 仕入れ確定希望時刻">
                <input name="by" type="datetime-local" className="input" defaultValue={by} required />
              </Labeled>
              <Labeled label="📅 受け渡し方法と日程（使用日以前）">
                <select name="choice" className="input" defaultValue={q.choice ?? ""} required>
                  <option value="" disabled>
                    選んでください
                  </option>
                  {choices.map((c) => (
                    <option key={c.value} value={c.value} disabled={c.full}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Labeled>
              <div className="flex items-end">
                <button className="btn-secondary w-full">🧮 合計と期限を確認する</button>
              </div>
            </form>

            {quote && !quote.ok && <Notice tone="error">⚠️ {quote.error}</Notice>}
            {quote?.ok && (
              <div className="flex flex-col gap-3">
                <div className="rounded-3xl border-2 border-leaf bg-leaf-light/40 p-4">
                  <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    <Info label="数量" value={formatKg(quote.quote.quantityGrams)} />
                    <Info label="商品代" value={formatYen(quote.quote.itemSubtotalYen)} />
                    <Info label="送料" value={quote.quote.shippingFeeYen === 0 ? "0円" : formatYen(quote.quote.shippingFeeYen)} />
                    <Info label="合計（アプリが計算）" value={formatYen(quote.quote.totalYen)} strong />
                  </div>
                  <p className="mt-3 text-sm font-bold text-amber-800">
                    ⏰ {formatJst(quote.quote.deadlineAt)} までに販売確定しなければ仮押さえ解除
                  </p>
                  <p className="hint mt-1">商品代は「単価×数量」を1円未満切り捨て。税や別料金は加えていません。</p>
                </div>
                <OrderForm
                  deadlineText={formatJst(quote.quote.deadlineAt)}
                  hidden={{
                    listingId: listing.id,
                    deliveryOptionId: optionId,
                    scheduleSlotId: slotId,
                    quantityKg: purchaseKg,
                    budgetYen: budget,
                    useDate: use,
                    purchaseConfirmByAt: by,
                    expectedTotalYen: String(quote.quote.totalYen),
                    ...(q.inquiry && { inquiryId: q.inquiry }),
                  }}
                />
              </div>
            )}
          </>
        )}
      </section>

      {/* 予備相談 */}
      <section className="card-soft flex flex-col gap-3">
        <h2 className="section-title">💬 この出品について相談する</h2>
        <p className="rounded-2xl bg-white px-3 py-2 text-sm font-bold text-amber-800">
          ⚠️ 購入希望ではなく、数量は確保されません（仮押さえなし）。
        </p>
        <p className="text-xs text-gray-700">
          第一候補の注文が成立しなかったときの「予備」として相談できます。第一候補が回答待ち・確定の間は、予備から注文に進めません。複数の農家さんから実際に買う場合は、別の購入予定として通常どおり申し込んでください。
        </p>
        <ActionButton
          action={openInquiryAction.bind(null, listing.id)}
          className="btn-secondary btn-sm self-start"
          fields={
            <>
              <label className="flex flex-col gap-1 text-sm">
                <span className="label">第一候補の注文（予備相談の場合）</span>
                <select name="primaryOrderId" className="input" defaultValue="">
                  <option value="">紐付けない（送料などの相談）</option>
                  {myOrders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.snapItemName} {formatKg(o.quantityGrams)}（{o.farmer.farmName}・使用日 {formatDateOnly(o.useDate)}）
                    </option>
                  ))}
                </select>
              </label>
              <textarea name="body" required maxLength={500} rows={3} className="input" placeholder="例：第一候補がだめだった場合、3kgお願いできますか？" />
            </>
          }
        >
          💬 相談を送る
        </ActionButton>
      </section>
    </div>
  );
}

function Info({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl bg-white px-3 py-1.5">
      <div className="text-xs text-gray-700">{label}</div>
      <div className={strong ? "text-xl font-bold text-leaf-dark" : "font-bold"}>{value}</div>
    </div>
  );
}

// 申し込み前に必要な条件なので「必須」と表示する（一覧の閲覧では任意）
function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label">
        {label}
        <ReqMark required />
      </span>
      {children}
    </label>
  );
}
