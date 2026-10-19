import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ReviewList } from "@/components/reviews";
import { Loading, Notice, Page, PageTitle } from "@/components/ui";
import { getFarmerReviews } from "@/lib/domain/reviews";
import { requireFarmer } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "取引レビュー | LocAI" };

export default function FarmReviewsPage() {
  return (
    <Page>
      <PageTitle
        emoji="✍️"
        title="あなたへの取引レビュー"
        lead="受け取りを記録したお店からのレビューです。返信できます（レビューの削除はできません。不適切な内容は通報してください）。"
      />
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
  const summary = await getFarmerReviews(prisma, profile.id, 50);
  return <ReviewList summary={summary} canReply canReport />;
}
