import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Loading, Notice, Page, PageTitle } from "@/components/ui";
import { dbNow } from "@/lib/domain/tx";
import { requireFarmer } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { blankDraft, draftFromListing } from "../draft-server";
import { ListingForm } from "../listing-form";

export const metadata: Metadata = { title: "新しく出品 | LocAI" };

export default function NewListingPage({ searchParams }: PageProps<"/farm/listings/new">) {
  return (
    <Page>
      <Suspense fallback={<Loading />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/farm/listings/new">["searchParams"] }) {
  const { user, profile } = await requireFarmer();
  if (!profile) {
    return (
      <Notice tone="warn">
        出品の前に <Link href="/farm/profile" className="link">農園情報</Link> を登録してください。
      </Notice>
    );
  }
  const copyId = (await searchParams).copy;
  const now = await dbNow(prisma);
  let source = null;
  if (typeof copyId === "string") {
    source = await prisma.listing.findFirst({
      where: { id: copyId, farmer: { userId: user.id } },
      include: { deliveryOptions: { include: { shippingRates: true } } },
    });
  }
  const initial = source
    ? draftFromListing(source, now, "copy", 0)
    : blankDraft(now, profile.prefecture, profile.paymentConfirmGuideHours ?? 24);

  return (
    <>
      <PageTitle
        emoji={source ? "📋" : "🌾"}
        title={source ? `「${source.itemName}」から複製して出品` : "新しく出品"}
        lead={
          source
            ? "説明・単位・送料表を引き継ぎました。総量・期限・日程・写真は今回の値を入力してください（在庫は引き継ぎません）。"
            : "市場などで売る分を除いた、このアプリ用の量だけを出品します。価格と数量は農家さんが決めます。"
        }
      />
      <ListingForm mode={source ? "copy" : "new"} sourceId={source?.id} initial={initial} farmPrefecture={profile.prefecture} />
    </>
  );
}
