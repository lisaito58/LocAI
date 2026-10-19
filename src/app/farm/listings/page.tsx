import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { StockBar } from "@/components/stock-bar";
import { EmptyState, itemEmoji, Loading, Notice, Page, PageTitle } from "@/components/ui";
import { expireDueOrders } from "@/lib/domain/orders";
import { dbNow } from "@/lib/domain/tx";
import { formatJst, formatYen } from "@/lib/domain/units";
import { requireFarmer } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "出品一覧 | LocAI" };

export default function FarmListingsPage() {
  return (
    <Page>
      <PageTitle emoji="🌾" title="出品一覧" lead="出品ごとの在庫と、届いた購入希望の数を確認できます。" />
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
        はじめに <Link href="/farm/profile" className="link">農園情報</Link> を登録してください 👩‍🌾
      </Notice>
    );
  }
  await expireDueOrders(prisma, { farmerId: profile.id });
  const now = await dbNow(prisma);
  const listings = await prisma.listing.findMany({
    where: { farmerId: profile.id },
    orderBy: [{ status: "asc" }, { acceptDeadlineAt: "asc" }],
    include: {
      photos: { orderBy: { publishRound: "desc" }, take: 1, select: { url: true } },
      _count: { select: { orders: { where: { status: { in: ["AWAITING_RESPONSE", "AWAITING_REAGREEMENT"] } } } } },
      inquiries: { where: { status: "OPEN" }, select: { id: true } },
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-3">
        <Link href="/farm/listings/new" className="btn-primary">
          ＋ 新しく出品
        </Link>
        <Link href="/farm/orders" className="btn-secondary">
          📬 届いた注文を見る
        </Link>
      </div>
      {listings.length === 0 ? (
        <EmptyState emoji="🌱">まだ出品がありません。「新しく出品」から始めましょう。</EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {listings.map((l) => {
            const accepting = l.status === "PUBLISHED" && l.acceptDeadlineAt > now;
            return (
              <div key={l.id} className="card flex flex-col gap-3">
                <div className="flex gap-3">
                  <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-leaf-light text-4xl">
                    {l.photos[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={l.photos[0].url} alt={`${l.itemName}の写真`} className="size-full object-cover" />
                    ) : (
                      itemEmoji(l.itemName)
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`badge ${accepting ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                        {accepting ? "🟢 受付中" : l.status === "CLOSED" ? "⏸ 受付終了" : "⌛ 受付期限後"}
                      </span>
                      {l.publishRound > 1 && <span className="badge bg-sky-100 text-sky-800">🔁 再公開{l.publishRound - 1}回</span>}
                    </div>
                    <h2 className="mt-1 truncate text-lg font-bold">
                      {itemEmoji(l.itemName)} {l.itemName}
                    </h2>
                    <p className="text-xs text-gray-700">
                      {formatYen(l.unitPriceYenPerKg)}/kg ・ 受付期限 {formatJst(l.acceptDeadlineAt)}
                    </p>
                  </div>
                </div>
                <StockBar total={l.totalGrams} sold={l.soldGrams} held={l.heldGrams} />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {l._count.orders > 0 && <span className="badge bg-amber-100 text-amber-800">⏳ 回答が必要 {l._count.orders}件</span>}
                  {l.inquiries.length > 0 && <span className="badge bg-sky-100 text-sky-800">💬 相談 {l.inquiries.length}件</span>}
                  <span className="flex-1" />
                  <Link href={`/farm/listings/new?copy=${l.id}`} className="btn-secondary btn-sm">
                    📋 複製
                  </Link>
                  <Link href={`/farm/listings/${l.id}`} className="btn-primary btn-sm">
                    管理する →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
