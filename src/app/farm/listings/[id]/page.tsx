import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { approveAllAction, closeListingAction } from "@/app/actions/listings";
import { ActionButton } from "@/components/action-button";
import { StockBar } from "@/components/stock-bar";
import { EmptyState, itemEmoji, Loading, Notice, Page, StatusBadge } from "@/components/ui";
import { expireDueOrders } from "@/lib/domain/orders";
import { dbNow } from "@/lib/domain/tx";
import { formatJst, formatKg, formatYen, gramsToKgText } from "@/lib/domain/units";
import { requireFarmer } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { DELIVERY_METHOD_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_TIMING_LABELS } from "@/lib/validation/listing";

export const metadata: Metadata = { title: "出品の管理 | LocAI" };

export default function FarmListingPage({ params, searchParams }: PageProps<"/farm/listings/[id]">) {
  return (
    <Page>
      <Suspense fallback={<Loading />}>
        <Content params={params} searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}

async function Content({ params, searchParams }: Pick<PageProps<"/farm/listings/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const { done } = await searchParams;
  const { profile } = await requireFarmer();
  if (!profile) notFound();
  await expireDueOrders(prisma, { listingIds: [id] });
  const listing = await prisma.listing.findFirst({
    where: { id, farmerId: profile.id },
    include: {
      photos: { orderBy: [{ publishRound: "desc" }, { createdAt: "asc" }], select: { url: true, takenOn: true, publishRound: true, referenceCredit: true } },
      deliveryOptions: {
        where: { active: true },
        include: { shippingRates: { orderBy: [{ prefecture: "asc" }, { minGramsExclusive: "asc" }] }, scheduleSlots: { orderBy: { startsAt: "asc" } } },
      },
      orders: {
        orderBy: { deadlineAt: "asc" },
        include: { restaurant: { select: { shopName: true, city: true, prefecture: true } }, changeProposal: true },
      },
      inquiries: {
        orderBy: { updatedAt: "desc" },
        include: { restaurant: { select: { shopName: true } }, _count: { select: { messages: true } } },
      },
    },
  });
  if (!listing) notFound();
  const now = await dbNow(prisma);
  const trialUsed = listing.orders.filter((o) => o.isTrial && ["AWAITING_RESPONSE", "AWAITING_REAGREEMENT", "CONFIRMED"].includes(o.status)).length;
  const accepting = listing.status === "PUBLISHED" && listing.acceptDeadlineAt > now;
  const canRepublish = !accepting;
  const available = listing.totalGrams - listing.soldGrams - listing.heldGrams;

  const active = listing.orders.filter((o) => o.status === "AWAITING_RESPONSE" || o.status === "AWAITING_REAGREEMENT");
  const plainCount = active.filter((o) => o.status === "AWAITING_RESPONSE" && !o.hasConsultation).length;
  const confirmed = listing.orders.filter((o) => o.status === "CONFIRMED");
  const ended = listing.orders.filter((o) => ["DECLINED", "CANCELLED", "EXPIRED"].includes(o.status));

  // 店舗ごとにまとめる（期限の近い順）
  const byShop = new Map<string, typeof active>();
  for (const o of active) byShop.set(o.restaurant.shopName, [...(byShop.get(o.restaurant.shopName) ?? []), o]);

  return (
    <div className="flex flex-col gap-5">
      {done === "created" && (
        <Notice tone="ok">
          <p className="text-lg font-bold">🎉 出品しました</p>
          <p>お店から購入希望が届くと、ホームの「今やること」と下の一覧に表示されます。次にできること：</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href="/farm" className="btn-secondary btn-sm">
              🏡 ホームへ
            </Link>
            <Link href="/farm/listings/new" className="btn-secondary btn-sm">
              ＋ ほかの野菜も出品する
            </Link>
            <Link href="/farm/listings" className="btn-secondary btn-sm">
              🌾 出品一覧を見る
            </Link>
          </div>
        </Notice>
      )}
      {done === "republished" && <Notice tone="ok">🔁 再公開しました。残りの量で受付を再開しています。</Notice>}

      <section className="card flex flex-col gap-4 sm:flex-row">
        <div className="flex size-40 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-leaf-light text-6xl">
          {listing.photos[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={listing.photos[0].url} alt={`${listing.itemName}の${listing.photos[0].referenceCredit ? "参考画像" : "実物写真"}`} className="size-full object-cover" />
          ) : (
            itemEmoji(listing.itemName)
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            <span className={`badge ${accepting ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
              {accepting ? "🟢 受付中" : listing.status === "CLOSED" ? "⏸ 受付終了" : "⌛ 受付期限後"}
            </span>
            {listing.photos[0] &&
              (listing.photos[0].referenceCredit ? (
                <span className="badge bg-gray-100 text-gray-800">🖼️ テスト用の参考画像（実物ではありません）</span>
              ) : (
                <span className="badge bg-leaf-light text-leaf-dark">📷 撮影 {listing.photos[0].takenOn.toISOString().slice(0, 10)}</span>
              ))}
          </div>
          <h1 className="text-2xl font-bold text-leaf-dark">
            {itemEmoji(listing.itemName)} {listing.itemName}
          </h1>
          <p className="text-sm text-gray-700">
            {formatYen(listing.unitPriceYenPerKg)}/kg ・ 最低{formatKg(listing.minOrderGrams)}・{formatKg(listing.orderStepGrams)}単位 ・ 回答猶予
            {listing.responseGraceMinutes / 60}時間
          </p>
          <p className="text-sm">
            ⏰ 受付期限 <strong>{formatJst(listing.acceptDeadlineAt)}</strong> ／ 回答の最終期限 <strong>{formatJst(listing.responseDeadlineAt)}</strong>
          </p>
          <StockBar total={listing.totalGrams} sold={listing.soldGrams} held={listing.heldGrams} />
          {listing.trialEnabled && listing.trialSetGrams && (
            <p className="text-sm font-bold text-leaf-dark">
              🧺 お試しセット：1セット{formatKg(listing.trialSetGrams)}・{formatYen(listing.trialSetPriceYen ?? 0)}（用意 {listing.trialSetCount}セット、申込中・確定 {trialUsed}セット）
            </p>
          )}
          {listing.earlySale && listing.saleTargetAt && (
            <p className="text-sm font-bold text-orange-900">⏳ 早めに販売したい：販売希望期限 {formatJst(listing.saleTargetAt)}（受付・回答・受け渡しの期限は別です）</p>
          )}
          <div className="mt-1 flex flex-wrap gap-2">
            {accepting && (
              <ActionButton action={closeListingAction.bind(null, listing.id)} className="btn-secondary btn-sm" confirmText="新しい申込の受付を終了しますか？（既存の注文はそのまま有効です）">
                ⏸ 受付終了
              </ActionButton>
            )}
            {canRepublish && available >= listing.minOrderGrams && (
              <Link href={`/farm/listings/${listing.id}/republish`} className="btn-primary btn-sm">
                🔁 残りを再公開
              </Link>
            )}
            <Link href={`/farm/listings/${listing.id}/edit`} className="btn-primary btn-sm">
              ✏️ 出品を編集する
            </Link>
            <Link href={`/farm/listings/${listing.id}/review`} className="btn-secondary btn-sm">
              🔎 販売条件を見直す（試算・早めに販売）
            </Link>
            <Link href={`/farm/listings/new?copy=${listing.id}`} className="btn-secondary btn-sm">
              📋 前回から複製して新しく出品
            </Link>
          </div>
        </div>
      </section>

      {/* 届いた購入希望 */}
      <section className="card flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">📬 回答が必要な購入希望（期限の近い順）</h2>
          {plainCount > 0 && (
            <ActionButton
              action={approveAllAction.bind(null, listing.id)}
              confirmText={`条件どおり（相談なし）の回答待ち ${plainCount}件 をすべて承認しますか？`}
            >
              ✅ 条件どおりの{plainCount}件をまとめて承認
            </ActionButton>
          )}
        </div>
        {active.length === 0 ? (
          <EmptyState emoji="📭">いま回答が必要な購入希望はありません。</EmptyState>
        ) : (
          [...byShop].map(([shop, orders]) => (
            <div key={shop} className="rounded-2xl border border-green-100 p-3">
              <div className="mb-2 font-bold">🏮 {shop}</div>
              <ul className="flex flex-col gap-2">
                {orders.map((o) => (
                  <li key={o.id}>
                    <Link href={`/orders/${o.id}`} className="flex flex-wrap items-center gap-2 rounded-xl bg-leaf-light/50 px-3 py-2 text-sm hover:bg-leaf-light">
                      <StatusBadge status={o.status} />
                      {o.isTrial && <span className="badge bg-orange-100 text-orange-900">🧺 お試し</span>}
                      <span className={`badge ${o.hasConsultation ? "bg-sky-100 text-sky-800" : "bg-white text-leaf-dark"}`}>
                        {o.hasConsultation ? "💬 相談あり" : "👌 条件どおり"}
                      </span>
                      <strong>{formatKg(o.status === "AWAITING_REAGREEMENT" ? o.heldGrams : o.quantityGrams)}</strong>
                      <span>合計 {formatYen(o.changeProposal && !o.changeProposal.respondedAt ? o.changeProposal.newTotalYen : o.totalYen)}</span>
                      <span className="text-xs text-gray-700">受け渡し {formatJst(o.snapScheduleStartsAt)}</span>
                      <span className="ml-auto text-xs font-bold text-amber-700">⏰ {formatJst(o.deadlineAt)}まで</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
        <p className="hint">全量がそろわなくても、注文ごとに承認できます。「相談あり」の注文は内容を確認してから個別に承認してください。</p>
      </section>

      {/* 予備相談・送料の相談 */}
      <section className="card flex flex-col gap-3">
        <h2 className="section-title">💬 出品への相談（購入希望ではありません・数量は確保されません）</h2>
        {listing.inquiries.length === 0 ? (
          <p className="text-sm text-gray-700">相談はまだありません。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {listing.inquiries.map((q) => (
              <li key={q.id}>
                <Link href={`/inquiries/${q.id}`} className="flex items-center gap-2 rounded-xl bg-sky-50 px-3 py-2 text-sm hover:bg-sky-100">
                  🏮 {q.restaurant.shopName}
                  <span className="badge bg-white text-sky-800">{q.primaryOrderId ? "予備相談" : "相談"}</span>
                  <span className="badge bg-white">{q.status === "OPEN" ? "相談中" : q.status === "CONVERTED" ? "注文に進んだ" : "終了"}</span>
                  <span className="ml-auto text-xs">💬 {q._count.messages}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 確定・終了した注文 */}
      <section className="card flex flex-col gap-3">
        <h2 className="section-title">✅ 販売確定した注文</h2>
        {confirmed.length === 0 ? (
          <p className="text-sm text-gray-700">まだありません。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {confirmed.map((o) => (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`} className="flex flex-wrap items-center gap-2 rounded-xl bg-green-50 px-3 py-2 text-sm hover:bg-green-100">
                  🏮 {o.restaurant.shopName} <strong>{formatKg(o.quantityGrams)}</strong> {formatYen(o.totalYen)}
                  {o.needsDiscussion && <span className="badge bg-red-100 text-red-700">🚩 要相談</span>}
                  <span className="ml-auto text-xs">受け渡し {formatJst(o.snapScheduleStartsAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {ended.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-gray-700">終了した注文（見送り・取消・期限切れ）{ended.length}件</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {ended.map((o) => (
                <li key={o.id}>
                  <Link href={`/orders/${o.id}`} className="flex items-center gap-2 rounded-xl px-3 py-1.5 hover:bg-gray-50">
                    <StatusBadge status={o.status} /> {o.restaurant.shopName} {formatKg(o.quantityGrams)}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* 受け渡し条件 */}
      <section className="card flex flex-col gap-3">
        <h2 className="section-title">🚚 受け渡し条件（新しい申込に使う条件）</h2>
        {listing.deliveryOptions.map((o) => (
          <div key={o.id} className="rounded-2xl bg-leaf-light/40 p-3 text-sm">
            <div className="font-bold">
              {DELIVERY_METHOD_LABELS[o.method]} ・ {PAYMENT_TIMING_LABELS[o.paymentTiming]}（{PAYMENT_METHOD_LABELS[o.paymentMethod]}）
              {o.prepayDeadlineAt && ` ・ 支払期限 ${formatJst(o.prepayDeadlineAt)}`}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {o.shippingRates.map((r) => (
                <span key={r.id} className="badge bg-white">
                  {r.prefecture} {gramsToKgText(r.minGramsExclusive)}〜{gramsToKgText(r.maxGramsInclusive)}kg {r.feeYen === 0 ? "0円（無料）" : formatYen(r.feeYen)}
                </span>
              ))}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {o.scheduleSlots.map((s) => (
                <span key={s.id} className="badge bg-white">
                  📅 {formatJst(s.startsAt)}
                  {s.capacity !== null && `（${s.usedCount}/${s.capacity}件）`}
                </span>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="card flex flex-col gap-2">
        <h2 className="section-title">✏️ 出品の内容を変える</h2>
        <p className="text-sm">基本情報（価格・総量・説明など）・送料表・お試し販売を変更できます。届いている購入希望や確定した注文の条件は変わりません。</p>
        <Link href={`/farm/listings/${listing.id}/edit`} className="btn-primary self-start">
          ✏️ 出品を編集する
        </Link>
      </section>
    </div>
  );
}
