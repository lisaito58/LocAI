import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState, itemEmoji, Loading, Notice, Page, PageTitle, StatusBadge } from "@/components/ui";
import { expireDueOrders } from "@/lib/domain/orders";
import { dbNow } from "@/lib/domain/tx";
import { formatJst, formatKg, formatYen } from "@/lib/domain/units";
import { requireFarmer } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "届いた注文 | LocAI" };

export default function FarmOrdersPage() {
  return (
    <Page>
      <PageTitle emoji="📬" title="届いた注文" lead="すべての出品の購入希望を、期限の近い順に並べています。" />
      <Suspense fallback={<Loading />}>
        <Content />
      </Suspense>
    </Page>
  );
}

async function Content() {
  const { profile } = await requireFarmer();
  if (!profile) {
    return (
      <Notice tone="warn">
        はじめに <Link href="/farm/profile" className="link">農園情報</Link> を登録してください。
      </Notice>
    );
  }
  await expireDueOrders(prisma, { farmerId: profile.id });
  const now = await dbNow(prisma);
  const orders = await prisma.order.findMany({
    where: { farmerId: profile.id, status: { in: ["AWAITING_RESPONSE", "AWAITING_REAGREEMENT", "CONFIRMED"] } },
    orderBy: { deadlineAt: "asc" },
    include: { restaurant: { select: { shopName: true, city: true } }, payment: true, fulfillment: true },
  });
  const waiting = orders.filter((o) => o.status !== "CONFIRMED");
  const confirmed = orders.filter((o) => o.status === "CONFIRMED");
  const paymentQueue = confirmed.filter((o) => o.payment?.status === "BUYER_REPORTED");
  const toShip = confirmed.filter((o) => !o.fulfillment?.farmerSentAt);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="section-title">⏳ 回答が必要</h2>
        {waiting.length === 0 ? (
          <EmptyState emoji="📭">回答が必要な購入希望はありません。</EmptyState>
        ) : (
          waiting.map((o) => (
            <Link key={o.id} href={`/orders/${o.id}`} className="card flex flex-wrap items-center gap-2 p-4 hover:ring-2 hover:ring-sprout">
              <StatusBadge status={o.status} />
              <span className={`badge ${o.hasConsultation ? "bg-sky-100 text-sky-800" : "bg-leaf-light text-leaf-dark"}`}>
                {o.hasConsultation ? "💬 相談あり" : "👌 条件どおり"}
              </span>
              <span className="font-bold">
                {itemEmoji(o.snapItemName)} {o.snapItemName} {formatKg(o.quantityGrams)}
              </span>
              <span className="text-sm">🏮 {o.restaurant.shopName}（{o.restaurant.city}）</span>
              <span className="text-sm">{formatYen(o.totalYen)}</span>
              <span className="ml-auto text-sm font-bold text-amber-700">⏰ {formatJst(o.deadlineAt)}まで</span>
            </Link>
          ))
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="section-title">💴 入金の確認待ち（店が支払いを申告済み）</h2>
        {paymentQueue.length === 0 ? (
          <p className="text-sm text-green-900/60">確認待ちはありません。</p>
        ) : (
          paymentQueue.map((o) => {
            const due = new Date(o.payment!.firstReportedAt!.getTime() + o.snapPaymentConfirmGuideHours * 3_600_000);
            return (
              <Link key={o.id} href={`/orders/${o.id}`} className="card-soft flex flex-wrap items-center gap-2 p-3 text-sm hover:bg-leaf-light">
                🏮 {o.restaurant.shopName} ・ {o.snapItemName} {formatYen(o.totalYen)}
                <span className={`ml-auto font-bold ${due < now ? "text-red-700" : "text-amber-700"}`}>
                  確認の目安 {formatJst(due)}
                  {due < now && "（過ぎています）"}
                </span>
              </Link>
            );
          })
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="section-title">🚚 発送・引き渡しの予定</h2>
        {toShip.length === 0 ? (
          <p className="text-sm text-green-900/60">予定はありません。</p>
        ) : (
          toShip.map((o) => (
            <Link key={o.id} href={`/orders/${o.id}`} className="card-soft flex flex-wrap items-center gap-2 p-3 text-sm hover:bg-leaf-light">
              📅 {formatJst(o.snapScheduleStartsAt)} ・ 🏮 {o.restaurant.shopName} ・ {o.snapItemName} {formatKg(o.quantityGrams)}
              {o.needsDiscussion && <span className="badge bg-red-100 text-red-700">🚩 要相談</span>}
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
