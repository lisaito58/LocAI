import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState, itemEmoji, Loading, Notice, Page, PageTitle, StatusBadge } from "@/components/ui";
import { PAYMENT_STATUS_LABELS } from "@/lib/domain/order-labels";
import { expireDueOrders } from "@/lib/domain/orders";
import { formatDateOnly, formatJst, formatKg, formatYen } from "@/lib/domain/units";
import { requireRestaurant } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "注文 | LocAI" };

export default function ShopOrdersPage() {
  return (
    <Page>
      <PageTitle emoji="🧺" title="注文" lead="対応が必要な注文、農家さんの回答待ち、使用日別の確保済み食材を分けて表示します。" />
      <Suspense fallback={<Loading />}>
        <Content />
      </Suspense>
    </Page>
  );
}

async function Content() {
  const { profile } = await requireRestaurant();
  if (!profile) {
    return (
      <Notice tone="warn">
        はじめに <Link href="/shop/profile" className="link">店舗情報</Link> を登録してください。
      </Notice>
    );
  }
  await expireDueOrders(prisma, { restaurantId: profile.id });
  const orders = await prisma.order.findMany({
    where: { restaurantId: profile.id },
    orderBy: [{ useDate: "asc" }, { createdAt: "desc" }],
    include: { farmer: { select: { farmName: true } }, payment: true, fulfillment: true, changeProposal: true },
  });
  const inquiries = await prisma.listingInquiry.findMany({
    where: { restaurantId: profile.id },
    orderBy: { updatedAt: "desc" },
    take: 20,
    include: { listing: { select: { itemName: true, farmer: { select: { farmName: true } } } } },
  });

  const confirmed = orders.filter((o) => o.status === "CONFIRMED");
  const reagree = orders.filter((o) => o.status === "AWAITING_REAGREEMENT");
  const waiting = orders.filter((o) => o.status === "AWAITING_RESPONSE");
  const now = new Date();
  const payNeeded = confirmed.filter((o) => o.payment?.status === "AWAITING_PAYMENT");
  const receiveNeeded = confirmed.filter(
    (o) => o.fulfillment && !o.fulfillment.buyerReceivedAt && (o.fulfillment.farmerSentAt || o.snapScheduleStartsAt <= now),
  );
  const ended = orders.filter((o) => ["DECLINED", "CANCELLED", "EXPIRED"].includes(o.status));

  // 使用日ごとにまとめる（献立の検討用）
  const byUseDate = new Map<string, typeof confirmed>();
  for (const o of confirmed) {
    const key = o.useDate.toISOString().slice(0, 10);
    byUseDate.set(key, [...(byUseDate.get(key) ?? []), o]);
  }

  return (
    <div className="flex flex-col gap-6">
      {reagree.length > 0 && (
        <section id="reagreement" className="flex scroll-mt-24 flex-col gap-3">
          <h2 className="section-title">📝 条件変更の確認・再同意が必要</h2>
          {reagree.map((o) => (
            <Link key={o.id} href={`/orders/${o.id}`} className="card flex flex-wrap items-center gap-2 border-2 border-amber-300 p-4">
              <StatusBadge status={o.status} />
              <span className="font-bold">
                {itemEmoji(o.snapItemName)} {o.snapItemName}
              </span>
              <span className="text-sm">👩‍🌾 {o.farmer.farmName}</span>
              <span className="ml-auto text-sm font-bold text-amber-800">⏰ {formatJst(o.deadlineAt)}までに確認</span>
            </Link>
          ))}
        </section>
      )}
      {payNeeded.length > 0 && (
        <section id="payment" className="flex scroll-mt-24 flex-col gap-3">
          <h2 className="section-title">💴 支払いが必要（アプリ外で支払い、申告する）</h2>
          {payNeeded.map((o) => (
            <Link key={o.id} href={`/orders/${o.id}`} className="card flex flex-wrap items-center gap-2 border-2 border-amber-300 p-4">
              <span className="font-bold">
                {itemEmoji(o.snapItemName)} {o.snapItemName} {formatYen(o.totalYen)}
              </span>
              <span className="text-sm">👩‍🌾 {o.farmer.farmName}</span>
              <span className="ml-auto text-sm font-bold text-amber-800">支払期限 {formatJst(o.snapPaymentDeadlineAt)}</span>
            </Link>
          ))}
        </section>
      )}
      {receiveNeeded.length > 0 && (
        <section id="receive" className="flex scroll-mt-24 flex-col gap-3">
          <h2 className="section-title">📦 受け取りの確認が必要</h2>
          {receiveNeeded.map((o) => (
            <Link key={o.id} href={`/orders/${o.id}`} className="card flex flex-wrap items-center gap-2 border-2 border-amber-300 p-4">
              <span className="font-bold">
                {itemEmoji(o.snapItemName)} {o.snapItemName} {formatKg(o.quantityGrams)}
              </span>
              <span className="text-sm">{o.fulfillment?.farmerSentAt ? "🚚 農家さんが発送・引き渡しを記録" : "📅 受け渡し予定を過ぎています"}</span>
              <span className="ml-auto text-sm">受け取ったら記録してください</span>
            </Link>
          ))}
        </section>
      )}

      <section id="awaiting" className="flex scroll-mt-24 flex-col gap-3">
        <h2 className="section-title">⏳ 農家さんの回答待ち（まだ確保できていません）</h2>
        {waiting.length === 0 ? (
          <EmptyState emoji="🕊️">回答待ちの購入希望はありません。</EmptyState>
        ) : (
          waiting.map((o) => (
            <Link key={o.id} href={`/orders/${o.id}`} className="card flex flex-wrap items-center gap-2 p-4 hover:ring-2 hover:ring-sprout">
              <StatusBadge status={o.status} />
              <span className="font-bold">
                {itemEmoji(o.snapItemName)} {o.snapItemName} {formatKg(o.quantityGrams)}
              </span>
              <span className="text-sm text-gray-700">👩‍🌾 {o.farmer.farmName}</span>
              <span className="text-sm">{formatYen(o.changeProposal && !o.changeProposal.respondedAt ? o.changeProposal.newTotalYen : o.totalYen)}</span>
              <span className="ml-auto text-sm font-bold text-amber-800">⏰ {formatJst(o.deadlineAt)}までに回答がなければ解除</span>
            </Link>
          ))
        )}
      </section>

      <section id="secured" className="flex scroll-mt-24 flex-col gap-3">
        <h2 className="section-title">🍽️ 使用日別の確保済み食材（販売確定）</h2>
        {byUseDate.size === 0 ? (
          <EmptyState emoji="🥕">まだ販売確定した食材はありません。</EmptyState>
        ) : (
          [...byUseDate].map(([date, list]) => (
            <div key={date} className="card flex flex-col gap-2">
              <div className="font-bold text-leaf-dark">📅 {formatDateOnly(list[0].useDate)} に使う食材</div>
              {list.map((o) => (
                <Link key={o.id} href={`/orders/${o.id}`} className="flex flex-wrap items-center gap-2 rounded-2xl bg-leaf-light/50 px-3 py-2 text-sm hover:bg-leaf-light">
                  <span className="font-bold">
                    {itemEmoji(o.snapItemName)} {o.snapItemName} {formatKg(o.quantityGrams)}
                  </span>
                  <span>👩‍🌾 {o.farmer.farmName}</span>
                  <span>{formatYen(o.totalYen)}</span>
                  <span className="badge bg-white">💴 {o.payment ? PAYMENT_STATUS_LABELS[o.payment.status] : "-"}</span>
                  <span className="badge bg-white">{o.fulfillment?.buyerReceivedAt ? "🧺 受取済み" : o.fulfillment?.farmerSentAt ? "🚚 発送済み" : "📦 受け渡し前"}</span>
                  {o.isTrial && <span className="badge bg-orange-100 text-orange-900">🧺 お試し</span>}
                  {o.needsDiscussion && <span className="badge bg-red-100 text-red-700">🚩 要相談</span>}
                  <span className="ml-auto text-xs">受け渡し {formatJst(o.snapScheduleStartsAt)}</span>
                </Link>
              ))}
            </div>
          ))
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">💬 農家さんへの質問（注文とは別）</h2>
          <Link href="/inquiries" className="btn-secondary btn-sm">
            相談一覧を開く
          </Link>
        </div>
        {inquiries.length === 0 ? (
          <p className="text-sm text-gray-700">相談はまだありません。</p>
        ) : (
          inquiries.map((q) => (
            <Link key={q.id} href={`/inquiries/${q.id}`} className="card-soft flex flex-wrap items-center gap-2 p-3 text-sm hover:bg-leaf-light">
              {itemEmoji(q.listing.itemName)} {q.listing.itemName}（{q.listing.farmer.farmName}）
              <span className="badge bg-white">{q.primaryOrderId ? "予備の相談" : "質問"}</span>
              <span className="badge bg-white">{q.status === "CLOSED" ? "終えた相談" : "やり取り中"}</span>
            </Link>
          ))
        )}
      </section>

      {ended.length > 0 && (
        <details className="card text-sm">
          <summary className="cursor-pointer font-bold text-leaf-dark">🍂 成立しなかった購入希望 {ended.length}件</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {ended.map((o) => (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`} className="flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-gray-50">
                  <StatusBadge status={o.status} /> {o.snapItemName} {formatKg(o.quantityGrams)}（{o.farmer.farmName}）
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
