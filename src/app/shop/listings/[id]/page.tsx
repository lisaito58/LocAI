import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { openInquiryAction } from "@/app/actions/orders";
import { ActionButton } from "@/components/action-button";
import { ReqMark } from "@/components/fields";
import { ReviewList } from "@/components/reviews";
import { getLossWarning } from "@/lib/domain/loss";
import { getFarmerReviews } from "@/lib/domain/reviews";
import { itemEmoji, Loading, Notice, Page } from "@/components/ui";
import { expireDueOrders, quoteOrder } from "@/lib/domain/orders";
import { dbNow } from "@/lib/domain/tx";
import {
  endOfJstDay,
  formatDateOnly,
  formatJst,
  formatJstDate,
  formatKg,
  formatYen,
  gramsToKgText,
  jstLocalToDate,
  kgTextToGrams,
} from "@/lib/domain/units";
import { requireRestaurant } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { DELIVERY_METHOD_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_TIMING_LABELS } from "@/lib/validation/listing";
import { searchHref } from "@/lib/validation/search";
import { LossNotice } from "./loss-notice";
import { OrderForm } from "./order-form";

export const metadata: Metadata = { title: "出品の詳細 | LocAI" };

export default function ShopListingPage({ params, searchParams }: PageProps<"/shop/listings/[id]">) {
  return (
    <Page>
      <Suspense fallback={<Loading />}>
        <Content params={params} searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}

async function Content({ params, searchParams }: Pick<PageProps<"/shop/listings/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const q: Record<string, string> = {};
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string") q[k] = v;
  const { profile } = await requireRestaurant();
  if (!profile) {
    return (
      <Notice tone="warn">
        はじめに <Link href="/shop/profile" className="link">店舗情報</Link> を登録してください。
      </Notice>
    );
  }
  await expireDueOrders(prisma, { listingIds: [id] });
  const now = await dbNow(prisma);
  const listing = await prisma.listing.findFirst({
    where: { id, status: { not: "DRAFT" } },
    include: {
      farmer: {
        select: { farmName: true, prefecture: true, city: true, introduction: true, commitment: true, mainItems: true, responseGuide: true, availableWeekdays: true },
      },
      photos: { orderBy: [{ publishRound: "desc" }, { createdAt: "asc" }], select: { id: true, url: true, takenOn: true, publishRound: true } },
      deliveryOptions: {
        where: { active: true },
        include: {
          shippingRates: { where: { prefecture: profile.prefecture }, orderBy: { minGramsExclusive: "asc" } },
          scheduleSlots: { where: { startsAt: { gt: now } }, orderBy: { startsAt: "asc" } },
        },
      },
    },
  });
  if (!listing) notFound();
  const currentPhotos = listing.photos.filter((p) => p.publishRound === listing.publishRound);
  const available = listing.totalGrams - listing.soldGrams - listing.heldGrams;
  const accepting = listing.status === "PUBLISHED" && listing.acceptDeadlineAt > now;

  // 申込条件（検索から引き継ぐ。ここで変更もできる）
  const purchaseKg = q.purchaseKg ?? (q.purchase ? gramsToKgText(Number(q.purchase)) : q.qty ?? "");
  const budget = q.budget ?? "";
  const use = q.use ?? "";
  const by = q.by ?? "";
  const useEnd = /^\d{4}-\d{2}-\d{2}$/.test(use) ? endOfJstDay(use) : null;

  // 受け取り日程の選択肢（農家が登録した実際の日程だけ）
  //   通常の候補：使用日の3日前から使用日まで（目安。保存期間・鮮度の保証ではない）
  //   それより前：「前の日程も表示する」を選んだときだけ
  //   使用日より後：候補に入れない（使用日を変えると選べる）。申込時もサーバーで確認する
  const useStart = useEnd ? new Date(useEnd.getTime() - 86_400_000) : null;
  const nearFrom = useStart ? new Date(useStart.getTime() - 3 * 86_400_000) : null;
  const showEarly = q.early === "1";
  const allSlots = listing.deliveryOptions.flatMap((o) =>
    o.scheduleSlots.map((s) => {
      const full = s.capacity !== null && s.usedCount >= s.capacity;
      const sameDay = useStart && useEnd ? s.startsAt >= useStart && s.startsAt < useEnd : false;
      return {
        value: `${o.id}:${s.id}`,
        startsAt: s.startsAt,
        label: `${DELIVERY_METHOD_LABELS[o.method]} ・ ${formatJst(s.startsAt)}${sameDay ? "（使用日当日：時間に間に合うか確認）" : ""}${full ? "（満枠）" : ""}`,
        full,
      };
    }),
  );
  const nearChoices = useEnd && nearFrom ? allSlots.filter((c) => c.startsAt >= nearFrom && c.startsAt < useEnd) : [];
  const earlyChoices = useEnd && nearFrom ? allSlots.filter((c) => c.startsAt < nearFrom) : [];
  const laterCount = useEnd ? allSlots.filter((c) => c.startsAt >= useEnd).length : 0;
  const [optionId, slotId] = (q.choice ?? "").split(":");

  let quote: Awaited<ReturnType<typeof quoteOrder>> | null = null;
  // お試しセット（任意）：残りセット数と、この店が使えるか（同じ農家につき1回）
  const ACTIVE = ["AWAITING_RESPONSE", "AWAITING_REAGREEMENT", "CONFIRMED"] as const;
  const trialOffered = listing.trialEnabled && listing.trialSetGrams && listing.trialSetPriceYen && listing.trialSetCount !== null;
  const trialUsed = trialOffered ? await prisma.order.count({ where: { listingId: listing.id, isTrial: true, status: { in: [...ACTIVE] } } }) : 0;
  const trialRemaining = trialOffered ? Math.max(0, listing.trialSetCount! - trialUsed) : 0;
  const myTrial = trialOffered
    ? await prisma.order.findFirst({ where: { restaurantId: profile.id, farmerId: listing.farmerId, isTrial: true, status: { in: [...ACTIVE] } }, select: { status: true } })
    : null;
  const trialChoosable = Boolean(trialOffered && trialRemaining > 0 && !myTrial);
  const isTrial = q.kind === "trial" && trialChoosable;

  const grams = isTrial ? listing.trialSetGrams! : kgTextToGrams(purchaseKg);
  const byDate = jstLocalToDate(by);
  if (q.choice && grams !== null && byDate && budget && use) {
    quote = await quoteOrder(prisma, {
      isTrial,
      restaurantId: profile.id,
      listingId: listing.id,
      deliveryOptionId: optionId,
      scheduleSlotId: slotId,
      quantityGrams: grams,
      budgetYen: Number(budget),
      useDate: use,
      purchaseConfirmByAt: byDate,
      prefecture: profile.prefecture,
    });
  }

  // 前回のロス記録による注文前の案内（記録がなければ出さない）
  const lossWarning = quote?.ok ? await getLossWarning(prisma, profile.id, listing.itemName) : null;

  // この出品への質問が続いていれば、その会話に案内する
  const openInquiry = await prisma.listingInquiry.findFirst({
    where: { listingId: listing.id, restaurantId: profile.id, status: "OPEN", primaryOrderId: null },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  // 申込フォーム（前回のロス記録による案内がある場合は、その後に表示する）
  const orderForm = quote?.ok ? (
    <OrderForm
      deadlineText={formatJst(quote.quote.deadlineAt)}
      hidden={{
        listingId: listing.id,
        deliveryOptionId: optionId,
        scheduleSlotId: slotId,
        quantityKg: purchaseKg,
        budgetYen: budget,
        useDate: use,
        purchaseConfirmByAt: by,
        expectedTotalYen: String(quote.quote.totalYen),
        ...(isTrial && { isTrial: "1" }),
        ...(q.inquiry && { inquiryId: q.inquiry }),
      }}
    />
  ) : null;
  const backHref = q.seed ? searchHref(q, { purchase: null, purchaseKg: null, choice: null, inquiry: null }) : "/shop/search";

  return (
    <div className="flex flex-col gap-5">
      <Link href={backHref} className="link self-start text-sm">
        ← 検索結果に戻る
      </Link>

      <section className="card flex flex-col gap-4 sm:flex-row">
        <div className="flex flex-col gap-2 sm:w-64">
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-3xl bg-leaf-light text-7xl">
            {currentPhotos[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentPhotos[0].url} alt={`${listing.itemName}の実物写真`} className="size-full object-cover" />
            ) : (
              itemEmoji(listing.itemName)
            )}
          </div>
          {currentPhotos[0] && (
            <p className="text-center text-xs text-gray-700">📷 農家さんが撮影した実物写真（撮影日 {formatDateOnly(currentPhotos[0].takenOn)}）</p>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <h1 className="text-2xl font-bold text-leaf-dark">
            {itemEmoji(listing.itemName)} {listing.itemName}
          </h1>
          <p className="text-sm">
            👩‍🌾 <strong>{listing.farmer.farmName}</strong>（📍{listing.farmer.prefecture}
            {listing.farmer.city}）
          </p>
          <div className="grid gap-2 text-sm min-[400px]:grid-cols-2">
            <Info label="単価" value={`${formatYen(listing.unitPriceYenPerKg)}/kg`} />
            <Info label="申込可能" value={formatKg(Math.max(0, available))} />
            <Info label="販売単位" value={`最低${formatKg(listing.minOrderGrams)}・${formatKg(listing.orderStepGrams)}刻み`} />
            <Info label="受付期限" value={formatJst(listing.acceptDeadlineAt)} />
            {listing.sizeLabel && <Info label="大きさ" value={listing.sizeLabel} />}
            {listing.conditionNote && <Info label="状態" value={listing.conditionNote} />}
          </div>
          {listing.earlySale && listing.saleTargetAt && listing.saleTargetAt > now && (
            <p className="rounded-2xl bg-orange-50 px-3 py-2 text-sm text-orange-950">
              ⏳ 農家さんは {formatJst(listing.saleTargetAt)} までに販売を決めたいと希望しています（早く届くという意味ではありません。受け渡し日は下の日程で確認してください）。
            </p>
          )}
          {listing.description && <p className="text-sm whitespace-pre-wrap">{listing.description}</p>}
          {listing.selfDeclaredFeatures && (
            <p className="rounded-2xl bg-leaf-light/60 px-3 py-2 text-sm">
              <span className="badge mr-1 bg-white text-leaf-dark">農家さんの自己申告</span>
              {listing.selfDeclaredFeatures}
            </p>
          )}
        </div>
      </section>

      {(listing.farmer.introduction || listing.farmer.commitment) && (
        <section className="card-soft text-sm">
          <h2 className="section-title">🌾 {listing.farmer.farmName} について</h2>
          {listing.farmer.mainItems && <p className="mt-1">主な品目：{listing.farmer.mainItems}</p>}
          {listing.farmer.commitment && <p className="mt-1">こだわり（自己申告）：{listing.farmer.commitment}</p>}
          {listing.farmer.introduction && <p className="mt-2 whitespace-pre-wrap">{listing.farmer.introduction}</p>}
          <p className="mt-2 text-xs text-gray-700">
            回答の目安：{listing.farmer.responseGuide ?? "未設定"}
            {listing.farmer.availableWeekdays && ` ・ 対応曜日：${listing.farmer.availableWeekdays}`}（参考。回答を保証するものではありません）
          </p>
        </section>
      )}

      <section className="card-soft flex flex-col gap-3">
        <h2 className="section-title">✍️ {listing.farmer.farmName} の取引レビュー</h2>
        <ReviewList summary={await getFarmerReviews(prisma, listing.farmerId, 5)} />
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="section-title">🚚 受け渡し・支払いの条件</h2>
        {listing.deliveryOptions.map((o) => (
          <div key={o.id} className="rounded-2xl bg-leaf-light/40 p-3 text-sm">
            <div className="font-bold">
              {DELIVERY_METHOD_LABELS[o.method]} ・ {PAYMENT_TIMING_LABELS[o.paymentTiming]}（{PAYMENT_METHOD_LABELS[o.paymentMethod]}）
            </div>
            <div className="text-xs">
              {o.paymentTiming === "PREPAID" && o.prepayDeadlineAt ? `支払期限：${formatJst(o.prepayDeadlineAt)}` : "支払期限：受け渡しのとき"}
              {` ・ 入金確認の目安：申告から${o.paymentConfirmGuideHours}時間`}
            </div>
            <div className="mt-1 flex flex-wrap gap-1 text-xs">
              {o.shippingRates.length === 0 ? (
                <span className="flex flex-wrap items-center gap-2">
                  <span className="badge bg-amber-100 px-3 py-1 text-sm text-amber-950">{profile.prefecture}への送料は未設定</span>
                  <a href={`${searchHref(q, { ask: "shipping" }, `/shop/listings/${listing.id}`)}#ask`} className="btn-secondary btn-sm">
                    📮 送料を問い合わせる
                  </a>
                </span>
              ) : (
                o.shippingRates.map((r) => (
                  <span key={r.id} className="badge bg-white">
                    {r.prefecture} {gramsToKgText(r.minGramsExclusive)}kg超〜{gramsToKgText(r.maxGramsInclusive)}kg以下 {r.feeYen === 0 ? "0円" : formatYen(r.feeYen)}
                  </span>
                ))
              )}
            </div>
          </div>
        ))}
        <p className="hint">アプリ内で決済・配送の手配はしません。支払い・発送は当事者が行い、アプリには記録だけを残します。</p>
      </section>

      {/* 申込 */}
      <section id="order" className="card flex flex-col gap-4">
        <h2 className="section-title">🧺 購入希望を送る</h2>
        {!accepting ? (
          <Notice tone="warn">この出品はいま新しい申込を受け付けていません。</Notice>
        ) : (
          <>
            <p className="hint">申し込む前に、下の条件をすべて入れて「合計と期限を確認する」を押してください。</p>
            {trialOffered && (
              <div className="rounded-2xl border-2 border-orange-200 bg-orange-50/70 p-3">
                <p className="font-bold text-orange-950">
                  🧺 お試しセット：1セット{formatKg(listing.trialSetGrams!)}・商品代{formatYen(listing.trialSetPriceYen!)}（送料は別。残り{trialRemaining}セット）
                </p>
                <p className="text-sm">
                  通常の注文の前に少量を試せます（農家さんの承認制・同じ農家さんにつき1回）。お試しを使わなくても、通常の注文はできます。
                  {myTrial && (myTrial.status === "CONFIRMED" ? " この農家さんのお試しは利用済みです。" : " この農家さんのお試しを申込中です。")}
                  {!myTrial && trialRemaining === 0 && " いまはお試しセットの残りがありません。"}
                </p>
              </div>
            )}
            <form className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2" action={`/shop/listings/${listing.id}#order`}>
              {Object.entries(q)
                .filter(([k]) => !["purchaseKg", "purchase", "budget", "use", "by", "choice", "early", "kind"].includes(k))
                .map(([k, v]) => (
                  <input key={k} type="hidden" name={k} value={v} />
                ))}
              {trialChoosable && (
                <fieldset className="flex flex-col gap-2 sm:col-span-2">
                  <legend className="label mb-1">申し込む内容</legend>
                  <div className="flex flex-col gap-2 min-[420px]:flex-row">
                    <label className="flex min-h-11 items-center gap-2 rounded-lg border-2 border-green-200 bg-white px-3 font-bold has-checked:border-leaf has-checked:bg-leaf-light">
                      <input type="radio" name="kind" value="normal" defaultChecked={!isTrial} className="size-5 accent-green-700" />
                      通常の注文
                    </label>
                    <label className="flex min-h-11 items-center gap-2 rounded-lg border-2 border-orange-200 bg-white px-3 font-bold has-checked:border-orange-500 has-checked:bg-orange-50">
                      <input type="radio" name="kind" value="trial" defaultChecked={isTrial} className="size-5 accent-orange-600" />
                      🧺 お試しセット（{formatKg(listing.trialSetGrams!)}）
                    </label>
                  </div>
                </fieldset>
              )}
              <Labeled label="⚖️ 購入する量（kg）" required={!isTrial}>
                <input name="purchaseKg" className="input" inputMode="decimal" defaultValue={purchaseKg} required={!isTrial} />
                {trialChoosable && (
                  <span className="hint">
                    {isTrial ? `お試しセットでは、この欄は使わず1セット（${formatKg(listing.trialSetGrams!)}）で申し込みます。` : "お試しセットを選んだ場合は、1セットの量で申し込みます。"}
                  </span>
                )}
              </Labeled>
              <Labeled label="💴 送料込み予算（円）">
                <input name="budget" className="input" inputMode="numeric" defaultValue={budget} required />
              </Labeled>
              <Labeled label="🍽️ 使用日">
                <input name="use" type="date" className="input" defaultValue={use} required />
              </Labeled>
              <Labeled label="⏰ 仕入れ確定希望時刻">
                <input name="by" type="datetime-local" className="input" defaultValue={by} required />
              </Labeled>
              <div className="flex flex-col gap-2 sm:col-span-2">
                {!useEnd ? (
                  <p className="rounded-xl bg-[#fbf0e6] px-3 py-2 text-sm text-[#3d3a37]">
                    使用日を入れて下のボタンを押すと、使用日までに受け取れる日程が選べるようになります。
                  </p>
                ) : (
                  <Labeled label="📅 受け取り方法と日程">
                    <select name="choice" className="input" defaultValue={q.choice ?? ""} required>
                      <option value="" disabled>
                        選んでください
                      </option>
                      {nearChoices.length > 0 && (
                        <optgroup label="使用日の3日前〜当日（目安）">
                          {nearChoices.map((c) => (
                            <option key={c.value} value={c.value} disabled={c.full}>
                              {c.label}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {showEarly && earlyChoices.length > 0 && (
                        <optgroup label="それより前の日程">
                          {earlyChoices.map((c) => (
                            <option key={c.value} value={c.value} disabled={c.full}>
                              {c.label}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </Labeled>
                )}
                {useEnd && nearChoices.length === 0 && (
                  <p className="text-sm">使用日の3日前〜当日に受け取れる日程はありません。</p>
                )}
                {useEnd && earlyChoices.length > 0 && (
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input type="checkbox" name="early" value="1" defaultChecked={showEarly} className="size-5 accent-green-700" />
                    それより前の日程（{earlyChoices.length}件）も選択肢に表示する
                  </label>
                )}
                {laterCount > 0 && (
                  <p className="text-sm">使用日より後の日程が{laterCount}件あります。その日程で受け取りたい場合は、使用日を変えてもう一度確認してください。</p>
                )}
                <p className="hint">
                  日程は農家さんが登録した「お店が受け取る予定の日時」です（宅配の場合も発送日ではありません）。届く時間は前後することがあるので、使う時間に間に合うかは相談欄で確認できます。3日前〜当日は目安で、保存できる期間や鮮度を保証するものではありません。
                </p>
              </div>
              <div className="sm:col-span-2">
                <button className="btn-secondary w-full">{useEnd ? "🧮 合計と期限を確認する" : "📅 受け取れる日程を表示する"}</button>
              </div>
            </form>

            {quote && !quote.ok && <Notice tone="error">⚠️ {quote.error}</Notice>}
            {quote?.ok && (
              <div className="flex flex-col gap-3">
                <div className="rounded-3xl border-2 border-leaf bg-leaf-light/40 p-4">
                  <div className="grid gap-2 text-sm min-[400px]:grid-cols-2 sm:grid-cols-4">
                    <Info label={isTrial ? "数量（お試しセット）" : "数量"} value={formatKg(quote.quote.quantityGrams)} />
                    <Info label="商品代" value={formatYen(quote.quote.itemSubtotalYen)} />
                    <Info label="送料" value={quote.quote.shippingFeeYen === 0 ? "0円" : formatYen(quote.quote.shippingFeeYen)} />
                    <Info label="合計（アプリが計算）" value={formatYen(quote.quote.totalYen)} strong />
                  </div>
                  <p className="mt-3 text-sm font-bold text-amber-800">
                    ⏰ {formatJst(quote.quote.deadlineAt)} までに販売確定しなければ仮押さえ解除
                  </p>
                  <p className="hint mt-1">商品代は「単価×数量」を1円未満切り捨て。税や別料金は加えていません。</p>
                </div>
                {lossWarning ? (
                  <LossNotice
                    receivedOn={formatJstDate(lossWarning.receivedAt)}
                    daysAgo={Math.max(0, Math.floor((now.getTime() - lossWarning.receivedAt.getTime()) / 86_400_000))}
                    receivedText={formatKg(lossWarning.receivedGrams)}
                    wasteText={formatKg(lossWarning.wasteGrams)}
                    approximate={lossWarning.approximate}
                  >
                    {orderForm}
                  </LossNotice>
                ) : (
                  orderForm
                )}
              </div>
            )}
          </>
        )}
      </section>

      {/* 農家さんへの質問（購入希望とは別。在庫は確保されない） */}
      <section id="ask" className="card-soft flex scroll-mt-24 flex-col gap-3">
        <h2 className="section-title">💬 農家さんに質問する</h2>
        <p className="rounded-xl bg-white px-3 py-2 text-sm font-bold">メッセージだけでは注文や在庫の確保はされません。</p>
        {openInquiry && (
          <p className="text-sm">
            この出品への質問が続いています。
            <Link href={`/inquiries/${openInquiry.id}`} className="link ml-1">
              これまでのやり取りを見る
            </Link>
            （ここから送ると、同じ相談に続けて書き込まれます）
          </p>
        )}
        <ActionButton
          action={openInquiryAction.bind(null, listing.id)}
          className="btn-secondary self-start"
          fields={
            <label className="flex flex-col gap-1">
              <span className="label">質問の内容（500文字以内）</span>
              <textarea
                name="body"
                required
                maxLength={500}
                rows={3}
                className="input"
                defaultValue={q.ask === "shipping" ? `${profile.prefecture}${q.purchaseKg || q.qty ? `への${q.purchaseKg || q.qty}kgの` : "への"}送料を教えてください。` : ""}
                placeholder="例：大阪市への送料を教えてください／野菜の大きさを教えてください"
              />
            </label>
          }
        >
          ✉️ 質問を送る
        </ActionButton>
      </section>
    </div>
  );
}

function Info({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl bg-white px-3 py-1.5">
      <div className="text-xs text-gray-700">{label}</div>
      <div className={strong ? "text-xl font-bold text-leaf-dark" : "font-bold"}>{value}</div>
    </div>
  );
}

// 申し込み前に必要な条件なので「必須」と表示する（一覧の閲覧では任意）
function Labeled({ label, children, required = true }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label">
        {label}
        <ReqMark required={required} />
      </span>
      {children}
    </label>
  );
}
