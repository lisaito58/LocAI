import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { StockBar } from "@/components/stock-bar";
import { EmptyState, itemEmoji, Loading, Notice, Page, PageTitle } from "@/components/ui";
import { expireDueOrders } from "@/lib/domain/orders";
import { SOON_HOURS } from "@/lib/domain/todo";
import { dbNow } from "@/lib/domain/tx";
import { formatJst, formatYen } from "@/lib/domain/units";
import { requireFarmer } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "出品一覧 | LocAI" };

export default function FarmListingsPage({ searchParams }: PageProps<"/farm/listings">) {
  return (
    <Page>
      <PageTitle emoji="🌾" title="出品" lead="出品ごとの在庫と、届いた購入希望の数を確認できます。" />
      <Suspense fallback={<Loading />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}

async function Content({ searchParams }: Pick<PageProps<"/farm/listings">, "searchParams">) {
  const tab = (await searchParams).tab === "closed" ? "closed" : "open";
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
  const soon = new Date(now.getTime() + SOON_HOURS * 3_600_000);
  const listings = await prisma.listing.findMany({
    where: { farmerId: profile.id },
    orderBy: [{ status: "asc" }, { acceptDeadlineAt: "asc" }],
    include: {
      photos: { orderBy: { publishRound: "desc" }, take: 1, select: { url: true } },
      _count: { select: { orders: { where: { status: { in: ["AWAITING_RESPONSE", "AWAITING_REAGREEMENT"] } } } } },
      inquiries: { where: { status: "OPEN" }, select: { id: true } },
    },
  });

  const isAccepting = (l: (typeof listings)[number]) => l.status === "PUBLISHED" && l.acceptDeadlineAt > now;
  const openListings = listings.filter(isAccepting);
  const closedListings = listings.filter((l) => !isAccepting(l));
  const shown = tab === "open" ? openListings : closedListings;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-3">
        <Link href="/farm/listings/new" className="btn-primary">
          ＋ 野菜を出品する
        </Link>
        <Link href="/farm/orders" className="btn-secondary">
          📬 届いた注文を見る
        </Link>
      </div>
      {listings.length === 0 ? (
        <EmptyState emoji="🌱">まだ出品がありません。「野菜を出品する」から始めましょう。</EmptyState>
      ) : (
        <>
          <nav aria-label="出品の表示切り替え" className="grid grid-cols-2 gap-2">
            {(
              [
                ["open", `🟢 受付中（${openListings.length}）`],
                ["closed", `⏸ 受付終了・期限切れ（${closedListings.length}）`],
              ] as const
            ).map(([key, label]) => (
              <Link
                key={key}
                href={key === "open" ? "/farm/listings" : "/farm/listings?tab=closed"}
                aria-current={tab === key ? "page" : undefined}
                className={`flex min-h-11 items-center justify-center rounded-xl border-2 px-3 py-2 text-center font-bold ${
                  tab === key ? "border-leaf bg-leaf text-white" : "border-green-200 bg-white text-leaf-dark hover:bg-leaf-light"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
          {shown.length === 0 && (
            <EmptyState emoji="🌱">{tab === "open" ? "いま受付中の出品はありません。" : "受付終了・期限切れの出品はありません。"}</EmptyState>
          )}
        <div id="soon" className="grid scroll-mt-24 gap-4 sm:grid-cols-2">
          {shown.map((l) => {
            const accepting = isAccepting(l);
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
                      {accepting && l.earlySale && l.saleTargetAt && l.saleTargetAt > now && (
                        <span className={`badge ${l.saleTargetAt <= soon ? "bg-orange-200 text-orange-950" : "bg-orange-50 text-orange-900"}`}>
                          ⏳ 販売希望期限 {formatJst(l.saleTargetAt)}
                          {l.saleTargetAt <= soon && "（近い）"}
                        </span>
                      )}
                    </div>
                    <h2 className="mt-1 truncate text-lg font-bold">
                      {itemEmoji(l.itemName)} {l.itemName}
                    </h2>
                    <p className="text-xs text-gray-700">
                      {formatYen(l.unitPriceYenPerKg)}/kg ・ 受付期限 {formatJst(l.acceptDeadlineAt)}
                    </p>
                  </div>
                </div>
                <StockBar total={l.totalGrams} sold={l.soldGrams} held={l.heldGrams} closed={!accepting} />
                <div className="mt-auto flex flex-wrap items-center gap-2 text-sm">
                  {l._count.orders > 0 && <span className="badge bg-amber-100 text-amber-800">⏳ 回答が必要 {l._count.orders}件</span>}
                  {l.inquiries.length > 0 && <span className="badge bg-sky-100 text-sky-800">💬 相談 {l.inquiries.length}件</span>}
                  <span className="flex-1" />
                  <Link href={`/farm/listings/${l.id}/edit`} className="btn-secondary btn-sm">
                    ✏️ 価格・送料を編集
                  </Link>
                  <Link href={`/farm/listings/${l.id}/review`} className="btn-secondary btn-sm">
                    🧮 受取額を試算
                  </Link>
                  <Link href={`/farm/listings/new?copy=${l.id}`} className="btn-secondary btn-sm">
                    📋 複製して出品
                  </Link>
                  <Link href={`/farm/listings/${l.id}`} className="btn-primary btn-sm">
                    📦 注文・残量を見る →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
        </>
      )}
    </div>
  );
}
