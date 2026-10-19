import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { StockBar } from "@/components/stock-bar";
import { itemEmoji, Loading, Page, PageTitle } from "@/components/ui";
import { expireDueOrders } from "@/lib/domain/orders";
import { dateToJstLocal, gramsToKgText } from "@/lib/domain/units";
import { requireFarmer } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PriceReview } from "./price-review";

export const metadata: Metadata = { title: "販売条件を見直す | LocAI" };

export default function ReviewPage({ params }: PageProps<"/farm/listings/[id]/review">) {
  return (
    <Page>
      <PageTitle
        emoji="🔎"
        title="販売条件を見直す"
        lead="残りの量を確認して、価格を変える前に概算受取額を試算できます。値下げは任意で、アプリやAIが自動で行うことはありません。"
      />
      <Suspense fallback={<Loading />}>
        <Content params={params} />
      </Suspense>
    </Page>
  );
}

async function Content({ params }: Pick<PageProps<"/farm/listings/[id]/review">, "params">) {
  const { id } = await params;
  const { profile } = await requireFarmer();
  if (!profile) notFound();
  await expireDueOrders(prisma, { listingIds: [id] });
  const listing = await prisma.listing.findFirst({ where: { id, farmerId: profile.id } });
  if (!listing) notFound();
  const available = listing.totalGrams - listing.soldGrams - listing.heldGrams;
  // 前回の費用は「呼び出し」として入れるだけ。今回の値かは本人が確認する
  const last = await prisma.costMemo.findFirst({ where: { farmerId: profile.id, kind: "ACTUAL" }, orderBy: { updatedAt: "desc" } });
  const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

  return (
    <div className="flex flex-col gap-5">
      <section className="card flex flex-col gap-2">
        <h2 className="text-xl font-bold">
          {itemEmoji(listing.itemName)} {listing.itemName}
        </h2>
        <StockBar total={listing.totalGrams} sold={listing.soldGrams} held={listing.heldGrams} />
      </section>
      <PriceReview
        listingId={listing.id}
        currentPrice={listing.unitPriceYenPerKg}
        availableKg={gramsToKgText(Math.max(0, available))}
        lastCosts={last ? { actualShippingYen: str(last.actualShippingYen), packingYen: str(last.packingYen), otherSalesCostYen: str(last.otherSalesCostYen) } : null}
        earlySale={listing.earlySale}
        saleTargetAt={listing.saleTargetAt ? dateToJstLocal(listing.saleTargetAt) : ""}
      />
      <Link href={`/farm/listings/${listing.id}`} className="link self-start">
        ← 出品の管理に戻る
      </Link>
    </div>
  );
}
