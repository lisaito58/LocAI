import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { closeInquiryAction, postInquiryMessageAction } from "@/app/actions/orders";
import { ActionButton } from "@/components/action-button";
import { itemEmoji, Loading, Page, StatusBadge } from "@/components/ui";
import { expireDueOrders } from "@/lib/domain/orders";
import { markInquiryRead } from "@/lib/domain/records";
import { formatJst, formatKg } from "@/lib/domain/units";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "農家さんへの質問 | LocAI" };

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
  // 開いたら既読にする（画面を閉じても、相談は終わらない）
  await markInquiryRead(prisma, { inquiryId: inquiry.id, userId: user.id });

  return (
    <div className="flex flex-col gap-4">
      <Link href="/inquiries" className="link self-start text-sm">
        ← 相談一覧へ
      </Link>
      <div>
        <span className="badge bg-sky-100 px-3 py-1 text-sm text-sky-900">{inquiry.primaryOrderId ? "予備の相談（以前の形式）" : "農家さんへの質問"}</span>
        <h1 className="mt-2 text-2xl font-bold text-leaf-dark">
          {itemEmoji(inquiry.listing.itemName)} {inquiry.listing.itemName}
        </h1>
        <p className="text-gray-800">{isRestaurant ? `農家さん：${inquiry.listing.farmer.farmName}` : `お店：${inquiry.restaurant.shopName}`}</p>
      </div>
      <p className="rounded-2xl bg-white px-3 py-2 text-sm ring-1 ring-green-100">
        💬 メッセージだけでは注文や在庫の確保はされません。この画面を閉じても相談は残り、「相談一覧」からいつでも続けられます。
      </p>

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
            <li key={m.id} className={`max-w-[85%] rounded-2xl px-3 py-2 ${m.senderId === user.id ? "self-end bg-leaf text-white" : "self-start bg-leaf-light"}`}>
              <div className="text-sm font-bold">
                {names.get(m.senderId)} ・ {formatJst(m.createdAt)}
              </div>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </li>
          ))}
        </ul>
        {inquiry.status !== "CLOSED" ? (
          <ActionButton
            action={postInquiryMessageAction.bind(null, inquiry.id)}
            className="btn-primary self-end"
            fields={
              <label className="flex flex-col gap-1">
                <span className="label">{isRestaurant ? "農家さんへのメッセージ" : "お店への返信"}</span>
                <textarea name="body" required maxLength={500} rows={3} className="input" placeholder="メッセージ（500文字以内）" />
              </label>
            }
          >
            ✉️ 送信する
          </ActionButton>
        ) : (
          <p className="text-center text-sm">この相談は終えています。続けたい場合は、出品の画面から新しく質問してください。</p>
        )}
      </section>

      {isRestaurant && (
        <div className="flex flex-col gap-2">
          {inquiry.primaryOrderId && primaryBlocks ? (
            <p className="rounded-2xl bg-gray-50 px-3 py-2 text-sm text-gray-800">
              第一候補が{primary!.status === "CONFIRMED" ? "販売確定しているため、予備には進めません。追加で買う場合は別の購入予定として申し込んでください" : "回答待ちのため、まだ予備の注文には進めません"}。
            </p>
          ) : inquiry.primaryOrderId && inquiry.status === "OPEN" ? (
            <Link href={`/shop/listings/${inquiry.listing.id}?inquiry=${inquiry.id}#order`} className="btn-primary self-start">
              🧺 最新の在庫・条件で注文に進む
            </Link>
          ) : (
            <Link href={`/shop/listings/${inquiry.listing.id}`} className="btn-secondary self-start">
              🥬 出品を見る（申し込みは出品の画面から）
            </Link>
          )}
        </div>
      )}

      {inquiry.status !== "CLOSED" && (
        <details className="rounded-2xl border border-gray-300 bg-white p-3 text-sm">
          <summary className="cursor-pointer font-bold">この相談を終える（もうやり取りしない場合）</summary>
          <p className="mt-2">終えると、この相談にはメッセージを送れなくなります（これまでのやり取りは残ります）。画面を閉じるだけなら、終える必要はありません。</p>
          <div className="mt-2">
            <ActionButton action={closeInquiryAction.bind(null, inquiry.id)} className="btn-ghost btn-sm" confirmText="この相談を終えますか？終えるとメッセージを送れなくなります（画面を閉じるだけなら、このボタンは不要です）">
              相談を終える
            </ActionButton>
          </div>
        </details>
      )}
    </div>
  );
}
