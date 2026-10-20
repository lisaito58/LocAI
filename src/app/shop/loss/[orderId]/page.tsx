import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { itemEmoji, Loading, Notice, Page, PageTitle } from "@/components/ui";
import { formatJst, formatKg, formatYen } from "@/lib/domain/units";
import { requireRestaurant } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { LossForm } from "./loss-form";

export const metadata: Metadata = { title: "振り返りを記録 | LocAI" };

export default function LossRecordPage({ params }: PageProps<"/shop/loss/[orderId]">) {
  return (
    <Page narrow>
      <PageTitle emoji="📝" title="振り返りを記録" lead="記録はあなただけが見られます。農家さんやほかのお店には公開されず、注文や評価にも影響しません。" />
      <Suspense fallback={<Loading />}>
        <Content params={params} />
      </Suspense>
    </Page>
  );
}

async function Content({ params }: Pick<PageProps<"/shop/loss/[orderId]">, "params">) {
  const { orderId } = await params;
  const { profile } = await requireRestaurant();
  if (!profile) notFound();
  // 自分の注文だけ（他人の注文IDは「見つからない」）
  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId: profile.id },
    include: { farmer: { select: { farmName: true } }, fulfillment: true, lossRecord: true },
  });
  if (!order) notFound();
  if (order.status !== "CONFIRMED" || !order.fulfillment?.buyerReceivedAt) {
    return <Notice tone="warn">受け取りを記録した注文だけ、振り返りを記録できます。</Notice>;
  }
  const rec = order.lossRecord;
  const received = rec?.receivedGrams ?? order.quantityGrams;
  const initialChoice = !rec ? "" : rec.status === "IN_USE" ? "IN_USE" : rec.method === "DIRECT" ? "DIRECT" : `R${rec.ratioQuarters ?? 0}`;
  return (
    <div className="flex flex-col gap-4">
      <section className="card flex flex-col gap-1">
        <p className="text-lg font-bold">
          {itemEmoji(order.snapItemName)} {order.snapItemName}（{order.farmer.farmName}）
        </p>
        <p>受取日：{formatJst(order.fulfillment.buyerReceivedAt)}</p>
        <p>
          受取量：{formatKg(received)}
          {rec && rec.receivedGrams !== order.quantityGrams && `（注文の数量は${formatKg(order.quantityGrams)}）`} ・ 商品代：{formatYen(order.itemSubtotalYen)}
        </p>
        {rec && (
          <p className="mt-1 rounded-xl bg-leaf-light/60 px-3 py-2 text-sm">
            いまの記録：
            {rec.status === "IN_USE"
              ? "まだ使用中（未完了）"
              : `${formatKg(rec.wasteGrams ?? 0)}を廃棄${rec.approximate ? "（概算）" : ""}`}
            。訂正すると、この記録を上書きします（二重には数えません）。
          </p>
        )}
      </section>
      <section className="card">
        <LossForm orderId={order.id} receivedGrams={received} initialChoice={initialChoice} />
      </section>
      <Link href="/shop/loss" className="link self-start">
        ← 仕入れの振り返りに戻る
      </Link>
    </div>
  );
}
