import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { StockBar } from "@/components/stock-bar";
import { itemEmoji, Loading, Page, PageTitle } from "@/components/ui";
import { expireDueOrders } from "@/lib/domain/orders";
import { gramsToKgText } from "@/lib/domain/units";
import { dbNow } from "@/lib/domain/tx";
import { requireFarmer } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { DELIVERY_METHOD_LABELS, isServicePrefecture } from "@/lib/validation/listing";
import { ListingEditForm } from "../edit-form";
import { TrialSettings } from "./trial-settings";
import { RatesEditor } from "./rates-editor";

export const metadata: Metadata = { title: "出品を編集 | LocAI" };

export default function EditListingPage({ params }: PageProps<"/farm/listings/[id]/edit">) {
  return (
    <Page>
      <PageTitle
        emoji="✏️"
        title="出品を編集する"
        lead="基本情報・送料表・お試し販売を変更できます。変更は新しい申し込みにだけ使われ、届いている購入希望や販売確定した注文の条件は変わりません。"
      />
      <Suspense fallback={<Loading />}>
        <Content params={params} />
      </Suspense>
    </Page>
  );
}

async function Content({ params }: Pick<PageProps<"/farm/listings/[id]/edit">, "params">) {
  const { id } = await params;
  const { profile } = await requireFarmer();
  if (!profile) notFound();
  await expireDueOrders(prisma, { listingIds: [id] });
  const listing = await prisma.listing.findFirst({
    where: { id, farmerId: profile.id },
    include: {
      deliveryOptions: {
        where: { active: true },
        include: { shippingRates: { orderBy: [{ prefecture: "asc" }, { minGramsExclusive: "asc" }] } },
      },
    },
  });
  if (!listing) notFound();
  const now = await dbNow(prisma);
  return (
    <div className="flex flex-col gap-6">
      <section className="card flex flex-col gap-3">
        <h2 className="text-xl font-bold">
          {itemEmoji(listing.itemName)} {listing.itemName}
        </h2>
        <StockBar total={listing.totalGrams} sold={listing.soldGrams} held={listing.heldGrams} closed={listing.status !== "PUBLISHED" || listing.acceptDeadlineAt <= now} />
        <p className="text-sm">
          品目（食材名）は変更できません。別の野菜や品種を売る場合は、
          <Link href={`/farm/listings/new?copy=${listing.id}`} className="link">
            この出品を複製して新しく出品
          </Link>
          してください（届いている注文の品目は変わりません）。
        </p>
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="section-title">📝 基本情報</h2>
        <ListingEditForm
          listingId={listing.id}
          initial={{
            unitPriceYenPerKg: listing.unitPriceYenPerKg,
            totalKg: gramsToKgText(listing.totalGrams),
            description: listing.description ?? "",
            selfDeclaredFeatures: listing.selfDeclaredFeatures ?? "",
            conditionNote: listing.conditionNote ?? "",
            sizeLabel: listing.sizeLabel ?? "",
          }}
        />
      </section>

      <section className="card flex flex-col gap-4">
        <h2 className="section-title">💴 送料表（都道府県・重量帯ごと）</h2>
        {listing.deliveryOptions.map((o) => (
          <div key={o.id} className="flex flex-col gap-3 rounded-2xl bg-leaf-light/40 p-3">
            <h3 className="font-bold">{DELIVERY_METHOD_LABELS[o.method]}</h3>
            {o.method === "PICKUP" ? (
              <p className="text-sm">引き取りは送料0円です（関西2府4県のお店が申し込めます）。</p>
            ) : (
              <RatesEditor
                listingId={listing.id}
                optionId={o.id}
                defaultPrefecture={isServicePrefecture(profile.prefecture) ? profile.prefecture : "大阪府"}
                initial={o.shippingRates.map((r) => ({
                  prefecture: r.prefecture,
                  minKg: gramsToKgText(r.minGramsExclusive),
                  maxKg: gramsToKgText(r.maxGramsInclusive),
                  feeYen: String(r.feeYen),
                }))}
              />
            )}
          </div>
        ))}
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="section-title">🧺 お試し販売（任意）</h2>
        <TrialSettings
          listingId={listing.id}
          initial={{
            enabled: listing.trialEnabled,
            setKg: listing.trialSetGrams ? gramsToKgText(listing.trialSetGrams) : "",
            priceYen: listing.trialSetPriceYen ? String(listing.trialSetPriceYen) : "",
            count: listing.trialSetCount !== null ? String(listing.trialSetCount) : "",
          }}
          dailyLimit={profile.trialDailyLimit}
        />
      </section>

      <Link href={`/farm/listings/${listing.id}`} className="link self-start">
        ← 出品の管理に戻る
      </Link>
    </div>
  );
}
