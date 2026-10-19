import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { closeInquiryAction, postInquiryMessageAction } from "@/app/actions/orders";
import { ActionButton } from "@/components/action-button";
import { itemEmoji, Loading, Notice, Page, StatusBadge } from "@/components/ui";
import { expireDueOrders } from "@/lib/domain/orders";
import { formatJst, formatKg } from "@/lib/domain/units";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "出品への相談 | LocAI" };

export default function InquiryPage({ params }: PageProps<"/inquiries/[id]">) {
  return (
    <Page narrow>
      <Suspense fallback={<Loading />}>
        <Content params={params} />
      </Suspense>
    </Page>
  );
}

async function Content({ params }: Pick<PageProps<"/inquiries/[id]">, "params">) {
  const { id } = await params;
  const user = await requireUser();
  const inquiry = await prisma.listingInquiry.findFirst({
    where: { id, OR: [{ restaurant: { userId: user.id } }, { listing: { farmer: { userId: user.id } } }] },
    include: {
      listing: { select: { id: true, itemName: true, farmer: { select: { userId: true, farmName: true } } } },
      restaurant: { select: { userId: true, shopName: true } },
      messages: { orderBy: { createdAt: "asc" } },
      primaryOrder: { select: { id: true, snapItemName: true, quantityGrams: true } },
    },
  });
  if (!inquiry) notFound();
  if (inquiry.primaryOrder) await expireDueOrders(prisma, { orderIds: [inquiry.primaryOrder.id] });
  const primary = inquiry.primaryOrderId
    ? await prisma.order.findUnique({ where: { id: inquiry.primaryOrderId }, select: { id: true, status: true } })
    : null;
  const isRestaurant = inquiry.restaurant.userId === user.id;
  const names = new Map([
    [inquiry.listing.farmer.userId, `👩‍🌾 ${inquiry.listing.farmer.farmName}`],
    [inquiry.restaurant.userId, `🏮 ${inquiry.restaurant.shopName}`],
  ]);
  const primaryBlocks = primary && ["AWAITING_RESPONSE", "AWAITING_REAGREEMENT", "CONFIRMED"].includes(primary.status);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <span className="badge bg-sky-100 text-sky-800">{inquiry.primaryOrderId ? "予備相談" : "出品への相談"}</span>
        <h1 className="mt-2 text-2xl font-bold text-leaf-dark">
          {itemEmoji(inquiry.listing.itemName)} {inquiry.listing.itemName} への相談
        </h1>
        <p className="text-sm text-gray-700">
          {isRestaurant ? `農家さん：${inquiry.listing.farmer.farmName}` : `お店：${inquiry.restaurant.shopName}`}
        </p>
      </div>
      <Notice tone="warn">💡 これは購入希望ではありません。数量は確保されず（仮押さえなし）、注文の状態もありません。</Notice>

      {inquiry.primaryOrder && primary && (
        <div className="card-soft flex flex-wrap items-center gap-2 text-sm">
          第一候補：{inquiry.primaryOrder.snapItemName} {formatKg(inquiry.primaryOrder.quantityGrams)}
          <StatusBadge status={primary.status} />
          {isRestaurant && (
            <Link href={`/orders/${primary.id}`} className="link">
              注文を見る
            </Link>
          )}
        </div>
      )}

      <section className="card flex flex-col gap-3">
        <ul className="flex flex-col gap-2">
          {inquiry.messages.map((m) => (
            <li key={m.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.senderId === user.id ? "self-end bg-leaf text-white" : "self-start bg-leaf-light"}`}>
              <div className="text-xs opacity-70">
                {names.get(m.senderId)} ・ {formatJst(m.createdAt)}
              </div>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </li>
          ))}
        </ul>
        {inquiry.status === "OPEN" ? (
          <ActionButton
            action={postInquiryMessageAction.bind(null, inquiry.id)}
            className="btn-primary btn-sm self-end"
            fields={<textarea name="body" required maxLength={500} rows={2} className="input" placeholder="メッセージ（500文字以内）" />}
          >
            ✉️ 送信
          </ActionButton>
        ) : (
          <p className="text-center text-sm text-gray-700">この相談は{inquiry.status === "CONVERTED" ? "注文に進みました" : "終了しました"}。</p>
        )}
      </section>

      {inquiry.status === "OPEN" && (
        <div className="flex flex-wrap gap-2">
          {isRestaurant &&
            (primaryBlocks ? (
              <p className="rounded-2xl bg-gray-50 px-3 py-2 text-sm text-gray-600">
                第一候補が{primary!.status === "CONFIRMED" ? "販売確定しているため、予備には進めません。追加で買う場合は別の購入予定として申し込んでください" : "回答待ちのため、まだ予備の注文には進めません"}。
              </p>
            ) : (
              <Link href={`/shop/listings/${inquiry.listing.id}?inquiry=${inquiry.id}#order`} className="btn-primary btn-sm">
                🧺 最新の在庫・条件で注文に進む
              </Link>
            ))}
          <ActionButton action={closeInquiryAction.bind(null, inquiry.id)} className="btn-secondary btn-sm" confirmText="この相談を終了しますか？">
            相談を終了する
          </ActionButton>
        </div>
      )}
    </div>
  );
}
