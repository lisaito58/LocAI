import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Loading, Notice, Page, PageTitle } from "@/components/ui";
import { expireDueOrders } from "@/lib/domain/orders";
import { dbNow } from "@/lib/domain/tx";
import { gramsToKgText } from "@/lib/domain/units";
import { requireFarmer } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { draftFromListing } from "../../draft-server";
import { ListingForm } from "../../listing-form";

export const metadata: Metadata = { title: "残りを再公開 | LocAI" };

export default function RepublishPage({ params }: PageProps<"/farm/listings/[id]/republish">) {
  return (
    <Page>
      <PageTitle
        emoji="🔁"
        title="残りを再公開"
        lead="同じ出品のまま、残っている量の受付を再開します。新しい写真・今の販売可能量・状態・期限・日程を確認してください。"
      />
      <Suspense fallback={<Loading />}>
        <Content params={params} />
      </Suspense>
    </Page>
  );
}

async function Content({ params }: Pick<PageProps<"/farm/listings/[id]/republish">, "params">) {
  const { id } = await params;
  const { profile } = await requireFarmer();
  if (!profile) notFound();
  await expireDueOrders(prisma, { listingIds: [id] });
  const listing = await prisma.listing.findFirst({
    where: { id, farmerId: profile.id },
    include: { deliveryOptions: { include: { shippingRates: true } } },
  });
  if (!listing) notFound();
  const now = await dbNow(prisma);
  if (listing.status === "PUBLISHED" && listing.acceptDeadlineAt > now) {
    return <Notice tone="warn">受付中の出品は再公開できません。先に「受付終了」してください。</Notice>;
  }
  const available = listing.totalGrams - listing.soldGrams - listing.heldGrams;
  return (
    <ListingForm
      mode="republish"
      sourceId={listing.id}
      initial={draftFromListing(listing, now, "republish", available)}
      farmPrefecture={profile.prefecture}
      currentAvailableKg={gramsToKgText(available)}
    />
  );
}
