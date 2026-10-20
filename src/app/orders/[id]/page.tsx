import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { saveOrderCostAction } from "@/app/actions/costs";
import {
  approveAction,
  cancelAction,
  confirmPaymentAction,
  correctRecordAction,
  declineAction,
  markReceivedAction,
  markSentAction,
  needsDiscussionAction,
  postOrderMessageAction,
  reagreeAction,
  reportPaymentAction,
} from "@/app/actions/orders";
import { ActionButton } from "@/components/action-button";
import { ReviewForm } from "@/components/reviews";
import { itemEmoji, Loading, Notice, Page, StatusBadge } from "@/components/ui";
import { estimateReceipt } from "@/lib/domain/estimate";
import { PAYMENT_STATUS_LABELS } from "@/lib/domain/order-labels";
import { expireDueOrders } from "@/lib/domain/orders";
import { dbNow } from "@/lib/domain/tx";
import { formatDateOnly, formatJst, formatKg, formatYen, gramsToKgText } from "@/lib/domain/units";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { DELIVERY_METHOD_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_TIMING_LABELS } from "@/lib/validation/listing";
import { ChangeForm } from "./change-form";

export const metadata: Metadata = { title: "注文の詳細 | LocAI" };

export default function OrderPage({ params, searchParams }: PageProps<"/orders/[id]">) {
  return (
    <Page>
      <Suspense fallback={<Loading />}>
        <Content params={params} searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}

async function Content({ params, searchParams }: Pick<PageProps<"/orders/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const { done } = await searchParams;
  const user = await requireUser();

  // 当事者かどうかを先に確認する（他人の注文は「見つからない」）
  const head = await prisma.order.findFirst({
    where: { id, OR: [{ farmer: { userId: user.id } }, { restaurant: { userId: user.id } }] },
    select: { id: true },
  });
  if (!head) notFound();
  await expireDueOrders(prisma, { orderIds: [id] });
  const now = await dbNow(prisma);

  const order = await prisma.order.findUniqueOrThrow({
    where: { id },
    include: {
      farmer: { select: { userId: true, farmName: true, prefecture: true, city: true, addressLine: true, contactPhone: true } },
      restaurant: { select: { userId: true, shopName: true, prefecture: true, city: true, addressLine: true, contactPhone: true } },
      changeProposal: true,
      payment: true,
      fulfillment: true,
      messages: { orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "asc" } },
      corrections: { orderBy: { createdAt: "asc" } },
      costMemos: { where: { kind: "ACTUAL" } },
      review: { include: { reply: true } },
      scheduleSlot: { select: { deliveryOptionId: true } },
    },
  });
  const isFarmer = order.farmer.userId === user.id;
  const holding = order.status === "AWAITING_RESPONSE" || order.status === "AWAITING_REAGREEMENT";
  const confirmed = order.status === "CONFIRMED";
  const p = order.changeProposal;
  const pendingProposal = p && !p.respondedAt && order.status === "AWAITING_REAGREEMENT";
  // 連絡先は販売確定時に保存した値を使う（以前の注文で未保存なら、現在のプロフィールを表示）
  const counterpart = isFarmer
    ? {
        label: "お店",
        name: order.restaurant.shopName,
        area: `${order.restaurant.prefecture}${order.restaurant.city}`,
        address: order.snapRestaurantAddress ?? `${order.restaurant.prefecture}${order.restaurant.city}${order.restaurant.addressLine}`,
        phone: order.snapRestaurantPhone ?? order.restaurant.contactPhone,
      }
    : {
        label: "農家さん",
        name: order.farmer.farmName,
        area: `${order.farmer.prefecture}${order.farmer.city}`,
        address: order.snapFarmerAddress ?? `${order.farmer.prefecture}${order.farmer.city}${order.farmer.addressLine}`,
        phone: order.snapFarmerPhone ?? order.farmer.contactPhone,
      };
  const contactFromSnapshot = Boolean(isFarmer ? order.snapRestaurantAddress : order.snapFarmerAddress);

  const slots =
    isFarmer && order.status === "AWAITING_RESPONSE" && !p
      ? await prisma.scheduleSlot.findMany({
          where: { deliveryOptionId: order.scheduleSlot.deliveryOptionId, startsAt: { gt: now } },
          orderBy: { startsAt: "asc" },
        })
      : [];
  const proposalSlot = p ? await prisma.scheduleSlot.findUnique({ where: { id: p.newScheduleSlotId } }) : null;

  // 費用メモ（農家だけ）。前回の値は「呼び出し」で今回の値として確認してから使う
  const memo = isFarmer ? order.costMemos[0] ?? null : null;
  const lastMemo =
    isFarmer && !memo
      ? await prisma.costMemo.findFirst({
          where: { farmer: { userId: user.id }, kind: "ACTUAL", orderId: { not: order.id } },
          orderBy: { updatedAt: "desc" },
        })
      : null;
  const estimate = estimateReceipt(order.itemSubtotalYen, order.shippingFeeYen, memo);
  const confirmDue =
    order.payment?.firstReportedAt &&
    new Date(order.payment.firstReportedAt.getTime() + order.snapPaymentConfirmGuideHours * 3_600_000);
  const names = new Map([
    [order.farmer.userId, `👩‍🌾 ${order.farmer.farmName}`],
    [order.restaurant.userId, `🏮 ${order.restaurant.shopName}`],
  ]);

  return (
    <div className="flex flex-col gap-5">
      {done === "created" && <Notice tone="ok">🎉 購入希望を送りました。いまは「仮押さえ」です。農家さんの承認で販売確定します。</Notice>}
      {done === "duplicate" && <Notice tone="info">同じ購入希望はすでに送信済みです（重複して登録していません）。</Notice>}

      <section className="card flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={order.status} />
          {order.hasConsultation && <span className="badge bg-sky-100 text-sky-800">💬 相談あり</span>}
          {order.needsDiscussion && <span className="badge bg-red-100 text-red-700">🚩 要相談</span>}
        </div>
        <h1 className="text-2xl font-bold text-leaf-dark">
          {itemEmoji(order.snapItemName)} {order.snapItemName} {formatKg(order.quantityGrams)}
        </h1>
        <p className="text-sm">
          {counterpart.label}：<strong>{counterpart.name}</strong>（📍{counterpart.area}）
        </p>
        {holding && (
          <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">
            ⏰ {formatJst(order.deadlineAt)} までに販売確定しなければ仮押さえ解除（期限は延長されません）
          </p>
        )}
        <div className="grid gap-2 text-sm min-[400px]:grid-cols-2 sm:grid-cols-4">
          <Info label="単価（申込時）" value={`${formatYen(order.snapUnitPriceYenPerKg)}/kg`} />
          <Info label="商品代" value={formatYen(order.itemSubtotalYen)} />
          <Info label="送料" value={order.shippingFeeYen === 0 ? "0円" : formatYen(order.shippingFeeYen)} />
          <Info label="合計" value={formatYen(order.totalYen)} strong />
          <Info label="受け渡し" value={`${DELIVERY_METHOD_LABELS[order.snapDeliveryMethod]}・${formatJst(order.snapScheduleStartsAt)}`} />
          <Info label="使用日" value={formatDateOnly(order.useDate)} />
          <Info label="支払い" value={`${PAYMENT_TIMING_LABELS[order.snapPaymentTiming]}（${PAYMENT_METHOD_LABELS[order.snapPaymentMethod]}）`} />
          <Info label="支払期限" value={formatJst(order.snapPaymentDeadlineAt)} />
        </div>
        <p className="hint">金額・条件は申込時に保存したもので、出品のその後の変更では変わりません。</p>
      </section>

      {/* 条件変更案 */}
      {p && (
        <section className={`card flex flex-col gap-3 ${pendingProposal ? "border-2 border-orange-300" : ""}`}>
          <h2 className="section-title">📝 農家さんからの条件変更{p.respondedAt ? "（再同意済み）" : ""}</h2>
          <div className="grid gap-2 text-sm min-[400px]:grid-cols-2 sm:grid-cols-4">
            <Info label="数量" value={pendingProposal ? `${formatKg(order.quantityGrams)} → ${formatKg(p.newQuantityGrams)}` : formatKg(p.newQuantityGrams)} />
            <Info label="受け渡し" value={proposalSlot ? formatJst(proposalSlot.startsAt) : "-"} />
            <Info label="送料" value={formatYen(p.newShippingFeeYen)} />
            <Info label="新しい合計" value={formatYen(p.newTotalYen)} strong />
          </div>
          {p.exceptionFeeReason && <p className="text-sm">例外送料の理由：{p.exceptionFeeReason}</p>}
          {(p.warnings as string[]).map((w) => (
            <Notice key={w} tone="warn">
              ⚠️ {w}
            </Notice>
          ))}
          {pendingProposal && !isFarmer && (
            <div className="flex flex-wrap gap-2">
              <ActionButton action={reagreeAction.bind(null, order.id)} confirmText="この変更条件で販売確定しますか？">
                ✅ この条件に同意して確定
              </ActionButton>
              <ActionButton action={cancelAction.bind(null, order.id)} className="btn-danger btn-sm" confirmText="この購入希望を取り消しますか？">
                取り消す
              </ActionButton>
            </div>
          )}
        </section>
      )}

      {/* 回答（農家） */}
      {isFarmer && order.status === "AWAITING_RESPONSE" && (
        <section className="card flex flex-col gap-4">
          <h2 className="section-title">✋ 回答する</h2>
          <div className="flex flex-wrap items-start gap-3">
            <ActionButton
              action={approveAction.bind(null, order.id)}
              confirmText="申込条件のまま販売確定しますか？"
              fields={
                order.hasConsultation ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="consultationReviewed" className="size-4 accent-green-700" />
                    相談内容を確認しました
                  </label>
                ) : undefined
              }
            >
              ✅ 承認して販売確定
            </ActionButton>
            <ActionButton action={declineAction.bind(null, order.id)} className="btn-danger btn-sm" confirmText="この注文を見送りますか？仮押さえが解除されます">
              🍂 見送る
            </ActionButton>
          </div>
          {!p && (
            <details className="rounded-2xl bg-leaf-light/40 p-3">
              <summary className="cursor-pointer font-bold">📝 条件を変えて提案する（1回だけ）</summary>
              <div className="mt-3">
                <ChangeForm
                  orderId={order.id}
                  currentKg={gramsToKgText(order.quantityGrams)}
                  currentSlotId={order.scheduleSlotId}
                  slots={slots.map((s) => ({
                    id: s.id,
                    label: `${formatJst(s.startsAt)}${s.capacity !== null ? `（${s.usedCount}/${s.capacity}件）` : ""}`,
                    disabled: s.id !== order.scheduleSlotId && s.capacity !== null && s.usedCount >= s.capacity,
                  }))}
                />
              </div>
            </details>
          )}
        </section>
      )}

      {/* 取消（店） */}
      {!isFarmer && order.status === "AWAITING_RESPONSE" && (
        <section className="card-soft flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">⏳ 農家さんの回答を待っています。確定前ならいつでも取り消せます。</p>
          <ActionButton action={cancelAction.bind(null, order.id)} className="btn-danger btn-sm" confirmText="この購入希望を取り消しますか？">
            取り消す
          </ActionButton>
        </section>
      )}

      {/* 販売確定後 */}
      {confirmed && order.payment && order.fulfillment && (
        <>
          <section className="card flex flex-col gap-3">
            <h2 className="section-title">📇 取引相手の連絡先（販売確定後に表示）</h2>
            <p className="hint">
              {contactFromSnapshot
                ? "販売確定したときの住所・電話番号です。プロフィールをあとで変更しても、この注文の届け先は変わりません。"
                : "この注文は確定時の住所を保存する前の注文のため、現在のプロフィールを表示しています。"}
            </p>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <Info label="住所" value={counterpart.address} />
              <Info label="電話番号" value={counterpart.phone} />
            </div>
          </section>

          <section className="card flex flex-col gap-4">
            <h2 className="section-title">💴 支払いの記録（アプリ外で支払い・アプリには記録だけ）</h2>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="badge bg-leaf-light px-3 py-1 text-sm text-leaf-dark">{PAYMENT_STATUS_LABELS[order.payment.status]}</span>
              {order.payment.firstReportedAt && <span>申告：{formatJst(order.payment.firstReportedAt)}</span>}
              {confirmDue && order.payment.status === "BUYER_REPORTED" && (
                <span className={confirmDue < now ? "font-bold text-red-700" : ""}>
                  確認予定の目安：{formatJst(confirmDue)}まで{confirmDue < now && "（目安を過ぎています。相談欄でご連絡ください）"}
                </span>
              )}
              {order.payment.confirmedAt && <span>確認：{formatJst(order.payment.confirmedAt)}</span>}
            </div>
            <p className="hint">店の申告だけでは入金確認済みになりません。目安を過ぎても自動で確認済みにはなりません。</p>
            <div className="flex flex-wrap gap-2">
              {!isFarmer && order.payment.status !== "FARMER_CONFIRMED" && (
                <ActionButton action={reportPaymentAction.bind(null, order.id)} confirmText="アプリ外で全額を支払いましたか？">
                  💴 支払ったことを申告する
                </ActionButton>
              )}
              {isFarmer && order.payment.status !== "FARMER_CONFIRMED" && (
                <ActionButton action={confirmPaymentAction.bind(null, order.id)} confirmText="実際に入金・代金を確認しましたか？">
                  ✅ 入金・代金の受け取りを確認した
                </ActionButton>
              )}
            </div>
          </section>

          <section className="card flex flex-col gap-4">
            <h2 className="section-title">📦 受け渡しの記録（配送会社とは連携しません）</h2>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <Info label="農家：発送済み／引き渡し済み" value={order.fulfillment.farmerSentAt ? formatJst(order.fulfillment.farmerSentAt) : "未記録"} />
              <Info label="店：受取済み" value={order.fulfillment.buyerReceivedAt ? formatJst(order.fulfillment.buyerReceivedAt) : "未記録"} />
            </div>
            <div className="flex flex-wrap gap-2">
              {isFarmer && !order.fulfillment.farmerSentAt && (
                <ActionButton
                  action={markSentAction.bind(null, order.id)}
                  fields={
                    order.snapPaymentTiming === "PREPAID" && order.payment.status !== "FARMER_CONFIRMED" ? (
                      <label className="flex items-start gap-2 rounded-xl bg-amber-50 p-2 text-sm text-amber-900">
                        <input type="checkbox" name="acknowledgeUnpaid" className="mt-1 size-4 accent-green-700" />
                        前払いの注文ですが入金確認が未記録です。確認したうえで発送します
                      </label>
                    ) : undefined
                  }
                >
                  🚚 発送・引き渡しを記録
                </ActionButton>
              )}
              {!isFarmer && !order.fulfillment.buyerReceivedAt && (
                <ActionButton action={markReceivedAction.bind(null, order.id)} confirmText="実際に受け取りましたか？">
                  🧺 受け取りを記録
                </ActionButton>
              )}
            </div>
          </section>

          <section className="card-soft flex flex-col gap-3">
            <h2 className="section-title">🛠 記録の訂正・要相談</h2>
            <div className="flex flex-wrap gap-2">
              <ActionButton
                action={needsDiscussionAction.bind(null, order.id, !order.needsDiscussion)}
                className={order.needsDiscussion ? "btn-secondary btn-sm" : "btn-danger btn-sm"}
              >
                {order.needsDiscussion ? "✅ 解決したので「要相談」を外す" : "🚩 「要相談」の目印を付ける"}
              </ActionButton>
            </div>
            <p className="hint">「要相談」は補助の目印です。販売確定の状態は変わりません。確定後の取消・出荷不能・支払条件の変更は相談欄で合意し、アプリ外で対応してください。</p>
            <ActionButton
              action={correctRecordAction.bind(null, order.id)}
              className="btn-secondary btn-sm self-start"
              confirmText="自分が付けた記録を取り消しますか？（履歴に残ります）"
              fields={
                <div className="grid gap-2 text-sm sm:grid-cols-[14rem_1fr]">
                  <select name="target" className="input" defaultValue="">
                    <option value="" disabled>
                      訂正する自分の記録
                    </option>
                    {isFarmer ? (
                      <>
                        <option value="paymentConfirm">入金確認を取り消す</option>
                        <option value="sent">発送記録を取り消す</option>
                      </>
                    ) : (
                      <>
                        <option value="paymentReport">支払申告を取り消す</option>
                        <option value="received">受取記録を取り消す</option>
                      </>
                    )}
                  </select>
                  <input name="reason" className="input" maxLength={200} placeholder="訂正の理由（必須）" />
                </div>
              }
            >
              ✏️ 記録を訂正
            </ActionButton>
            {order.corrections.length > 0 && (
              <ul className="text-xs text-gray-700">
                {order.corrections.map((c) => (
                  <li key={c.id}>
                    {formatJst(c.createdAt)} {names.get(c.actorId)}：{c.recordType === "payment" ? "支払い" : "受け渡し"}の記録を訂正（理由：{c.reason}）
                  </li>
                ))}
              </ul>
            )}
          </section>

          {isFarmer && (
            <section className="card flex flex-col gap-3">
              <h2 className="section-title">🧮 概算受取額（あなただけに表示）</h2>
              <div className="rounded-2xl bg-leaf-light/50 p-3 text-sm">
                <p>
                  商品代 {formatYen(order.itemSubtotalYen)} ＋ 受け取る送料 {formatYen(order.shippingFeeYen)} − 配送実費 − 梱包費 − その他
                </p>
                <p className="mt-1 text-xl font-bold text-leaf-dark">
                  {estimate.complete ? "" : "入力済みの範囲で "}約 {formatYen(estimate.amountYen)}
                </p>
                {!estimate.complete && <p className="text-xs text-amber-800">費用未入力：{estimate.missing.join("・")}（0円とはみなしていません）</p>}
                <p className="hint mt-1">栽培費・税金・労働時間などは含まない参考値で、最終的な利益ではありません。店の請求額には影響しません。</p>
              </div>
              <ActionButton
                action={saveOrderCostAction.bind(null, order.id)}
                className="btn-secondary btn-sm self-start"
                fields={
                  <div className="flex flex-col gap-2 text-sm">
                    {lastMemo && (
                      <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        前回の費用：配送実費 {lastMemo.actualShippingYen ?? "未入力"}・梱包費 {lastMemo.packingYen ?? "未入力"}・その他 {lastMemo.otherSalesCostYen ?? "未入力"}（円）。下の欄に入れてあります。今回の値か確認してから保存してください。
                      </p>
                    )}
                    <div className="grid items-start gap-2 sm:grid-cols-3">
                      <CostInput name="actualShippingYen" label="配送実費" value={memo?.actualShippingYen ?? lastMemo?.actualShippingYen} />
                      <CostInput name="packingYen" label="梱包費" value={memo?.packingYen ?? lastMemo?.packingYen} />
                      <CostInput name="otherSalesCostYen" label="その他" value={memo?.otherSalesCostYen ?? lastMemo?.otherSalesCostYen} />
                    </div>
                  </div>
                }
              >
                💾 費用メモを保存
              </ActionButton>
            </section>
          )}
        </>
      )}

      {/* 仕入れの振り返り（店本人だけ・任意） */}
      {confirmed && !isFarmer && order.fulfillment?.buyerReceivedAt && (
        <section className="card-soft flex flex-col gap-2">
          <h2 className="section-title">📝 仕入れの振り返り（任意・あなただけに表示）</h2>
          <p className="text-sm">使い切れたかを記録すると、次に同じ食材を注文するときの参考になります。</p>
          <Link href={`/shop/loss/${order.id}`} className="btn-secondary self-start">
            この注文の振り返りを記録・訂正する
          </Link>
        </section>
      )}

      {/* 取引レビュー（受取済みの注文だけ。未着などの問題は相談欄・要相談から） */}
      {confirmed && (
        <section className="card flex flex-col gap-3">
          <h2 className="section-title">✍️ 取引レビュー</h2>
          {order.review ? (
            <div className="rounded-2xl bg-leaf-light/50 p-3">
              <p className="font-bold">
                {order.review.rating === "GOOD" ? "😊 よかった" : "🤔 気になる点があった"}
                {order.review.tags.length > 0 && <span className="ml-2 text-sm font-normal">✔ {order.review.tags.join("・")}</span>}
              </p>
              {order.review.comment && <p className="mt-1 whitespace-pre-wrap">{order.review.comment}</p>}
              {order.review.reply && <p className="mt-2 text-sm">👩‍🌾 返信：{order.review.reply.body}</p>}
              {isFarmer && (
                <Link href="/farm/reviews" className="link mt-2 inline-block text-sm">
                  レビューに返信する →
                </Link>
              )}
            </div>
          ) : isFarmer ? (
            <p className="text-gray-700">お店が受け取りを記録すると、レビューが投稿されることがあります。</p>
          ) : order.fulfillment?.buyerReceivedAt ? (
            <ReviewForm orderId={order.id} />
          ) : (
            <p className="text-gray-700">受け取りを記録すると、レビューを書けます。</p>
          )}
          {!isFarmer && (
            <p className="rounded-2xl bg-white px-3 py-2 text-sm ring-1 ring-green-100">
              届かない・内容が違うなどの問題はレビューの対象外です。下の相談欄で農家さんに連絡し、必要なら「要相談」の目印を付けてください。
            </p>
          )}
        </section>
      )}

      {/* 相談（注文スレッド） */}
      <section className="card flex flex-col gap-3">
        <h2 className="section-title">💬 この注文の相談（当事者だけが見られます）</h2>
        {order.messages.length === 0 ? (
          <p className="text-sm text-gray-700">まだメッセージはありません。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {order.messages.map((m) => (
              <li key={m.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.senderId === user.id ? "self-end bg-leaf text-white" : "self-start bg-leaf-light"}`}>
                <div className="text-xs font-bold">
                  {names.get(m.senderId)} ・ {formatJst(m.createdAt)}
                </div>
                <p className="whitespace-pre-wrap">{m.body}</p>
              </li>
            ))}
          </ul>
        )}
        <ActionButton
          action={postOrderMessageAction.bind(null, order.id)}
          className="btn-primary btn-sm self-end"
          fields={<textarea name="body" required maxLength={500} rows={2} className="input" placeholder="メッセージ（500文字以内・画像は送れません）" />}
        >
          ✉️ 送信
        </ActionButton>
      </section>

      <details className="card text-sm">
        <summary className="cursor-pointer font-bold text-leaf-dark">🕰 状態の履歴</summary>
        <ul className="mt-2 flex flex-col gap-1 text-xs">
          {order.events.map((e) => (
            <li key={e.id}>
              {formatJst(e.createdAt)} — {e.note ?? e.toStatus}
              {e.actorId ? `（${names.get(e.actorId) ?? ""}）` : "（システム）"}
            </li>
          ))}
        </ul>
      </details>

      <Link href={isFarmer ? `/farm/listings/${order.listingId}` : "/shop/orders"} className="link self-start text-sm">
        ← {isFarmer ? "出品の管理に戻る" : "マイページに戻る"}
      </Link>
    </div>
  );
}

function Info({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl bg-leaf-light/50 px-3 py-1.5">
      <div className="text-xs text-gray-700">{label}</div>
      <div className={strong ? "text-xl font-bold text-leaf-dark" : "font-bold"}>{value}</div>
    </div>
  );
}

function CostInput({ name, label, value }: { name: string; label: string; value: number | null | undefined }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs">{label}（円）</span>
      <input name={name} className="input" inputMode="numeric" defaultValue={value ?? ""} placeholder="未入力" />
    </label>
  );
}
