// 注文・仮押さえ・期限切れの処理
// 申込可能数量 = 出品総量 − 販売確定量 − 有効な仮押さえ量
// 注文・在庫・日程枠の検証と更新は同じトランザクションの中で行い、出品の行ロックで順番を守る。
import { Prisma } from "@/generated/prisma/client";
import type { OrderStatus } from "@/generated/prisma/enums";
import { ORDER_STATUS_LABELS } from "./order-labels";
import { findShippingFee, type ShippingBand } from "./shipping";
import {
  dbNow,
  DomainError,
  fail,
  isUniqueViolation,
  lockListing,
  lockOrder,
  lockSlot,
  runTx,
  softFail,
  type Db,
  type Result,
  type Tx,
} from "./tx";
import { endOfJstDay, formatYen, isAllowedQuantity, itemSubtotalYen, LIMITS, minDate } from "./units";

const HOLDING: OrderStatus[] = ["AWAITING_RESPONSE", "AWAITING_REAGREEMENT"];

// ------------------------------------------------------------
// 期限切れ
// ------------------------------------------------------------

// 仮押さえ中の注文が使っている日程枠（条件変更中は変更先の枠）
async function activeSlotId(tx: Tx, order: { id: string; scheduleSlotId: string }) {
  const proposal = await tx.orderChangeProposal.findUnique({ where: { orderId: order.id } });
  return proposal && !proposal.respondedAt ? proposal.newScheduleSlotId : order.scheduleSlotId;
}

// 仮押さえを解除して終端状態にする（出品の行ロックを取得済みであること）
async function terminate(
  tx: Tx,
  orderId: string,
  toStatus: "DECLINED" | "CANCELLED" | "EXPIRED",
  now: Date,
  actorId: string | null,
  note?: string,
) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  if (!HOLDING.includes(order.status)) fail("この注文はすでに終了しています");
  const slotId = await activeSlotId(tx, order);
  await tx.listing.update({ where: { id: order.listingId }, data: { heldGrams: { decrement: order.heldGrams } } });
  await tx.scheduleSlot.update({ where: { id: slotId }, data: { usedCount: { decrement: 1 } } });
  await tx.order.update({ where: { id: orderId }, data: { status: toStatus, heldGrams: 0, decidedAt: now } });
  await tx.orderEvent.create({ data: { orderId, actorId, fromStatus: order.status, toStatus, note } });
}

// 出品の期限切れ注文を処理する（出品の行ロックを取得済みであること）
export async function expireDueOrdersInListing(tx: Tx, listingId: string, now: Date) {
  const due = await tx.order.findMany({
    where: { listingId, status: { in: HOLDING }, deadlineAt: { lte: now } },
    select: { id: true },
  });
  for (const o of due) await terminate(tx, o.id, "EXPIRED", now, null, "注文期限に達したため仮押さえを解除");
  return due.length;
}

// 画面表示・在庫照会の前に、期限を過ぎた注文の仮押さえを解除する（バッチだけに頼らない）
export async function expireDueOrders(
  db: Db,
  filter: { listingIds?: string[]; restaurantId?: string; farmerId?: string; orderIds?: string[] } = {},
) {
  // 期限の判定は DB の時刻で行う（1回の問い合わせで対象の出品を探す）
  const conds = [Prisma.sql`status IN ('AWAITING_RESPONSE', 'AWAITING_REAGREEMENT')`, Prisma.sql`"deadlineAt" <= clock_timestamp()`];
  if (filter.listingIds) conds.push(Prisma.sql`"listingId" = ANY(${filter.listingIds})`);
  if (filter.restaurantId) conds.push(Prisma.sql`"restaurantId" = ${filter.restaurantId}`);
  if (filter.farmerId) conds.push(Prisma.sql`"farmerId" = ${filter.farmerId}`);
  if (filter.orderIds) conds.push(Prisma.sql`id = ANY(${filter.orderIds})`);
  const rows = await db.$queryRaw<{ listingId: string }[]>`
    SELECT DISTINCT "listingId" FROM "Order" WHERE ${Prisma.join(conds, " AND ")} LIMIT 50`;
  for (const { listingId } of rows) {
    await db.$transaction(async (tx) => {
      await lockListing(tx, listingId);
      await expireDueOrdersInListing(tx, listingId, await dbNow(tx));
    });
  }
}

// ------------------------------------------------------------
// 申込（回答待ち・仮押さえ）
// ------------------------------------------------------------

export type CreateOrderInput = {
  restaurantUserId: string;
  listingId: string;
  deliveryOptionId: string;
  scheduleSlotId: string;
  quantityGrams: number;
  budgetYen: number;
  useDate: string; // YYYY-MM-DD（日本時間）
  purchaseConfirmByAt: Date;
  message?: string;
  idempotencyKey: string;
  expectedTotalYen?: number; // 画面に表示した合計。変わっていたら申し込まずに知らせる（金額としては使わない）
  inquiryId?: string;
};

export type Quote = {
  quantityGrams: number;
  itemSubtotalYen: number;
  shippingFeeYen: number;
  totalYen: number;
  deadlineAt: Date;
};

export async function createOrder(db: Db, input: CreateOrderInput): Promise<Result<{ orderId: string; duplicate: boolean }>> {
  const restaurant = await db.restaurantProfile.findUnique({ where: { userId: input.restaurantUserId } });
  if (!restaurant) return { ok: false, error: "先に店舗プロフィールを登録してください" };

  // 連打・再試行：同じキーの注文がすでにあればそれを返す
  const existing = await db.order.findUnique({
    where: { restaurantId_idempotencyKey: { restaurantId: restaurant.id, idempotencyKey: input.idempotencyKey } },
  });
  if (existing) return { ok: true, orderId: existing.id, duplicate: true };

  // 予備相談からの申込：第一候補の期限切れを先に反映する
  let primaryOrderId: string | null = null;
  if (input.inquiryId) {
    const inquiry = await db.listingInquiry.findUnique({ where: { id: input.inquiryId } });
    if (!inquiry || inquiry.restaurantId !== restaurant.id || inquiry.listingId !== input.listingId) {
      return { ok: false, error: "相談が見つかりません" };
    }
    if (inquiry.status !== "OPEN") return { ok: false, error: "この相談はすでに終了しています" };
    primaryOrderId = inquiry.primaryOrderId;
    if (primaryOrderId) await expireDueOrders(db, { orderIds: [primaryOrderId] });
  }

  // 期限切れの反映は、申込が失敗しても確定させておく
  await expireDueOrders(db, { listingIds: [input.listingId] });

  try {
    return await runTx(db, async (tx) => {
      await lockListing(tx, input.listingId);
      const now = await dbNow(tx);
      await expireDueOrdersInListing(tx, input.listingId, now);

      if (primaryOrderId) {
        await lockOrder(tx, primaryOrderId);
        const primary = await tx.order.findUniqueOrThrow({ where: { id: primaryOrderId } });
        if (HOLDING.includes(primary.status)) fail("第一候補の注文がまだ回答待ちです。第一候補が終了してから申し込めます");
        if (primary.status === "CONFIRMED") {
          fail("第一候補はすでに販売確定しています。追加で買う場合は、別の購入予定として通常の検索から申し込んでください");
        }
      }

      const quote = await quoteInTx(tx, { ...input, prefecture: restaurant.prefecture }, now);
      if (input.expectedTotalYen !== undefined && input.expectedTotalYen !== quote.totalYen) {
        fail(`出品の条件が変わり、合計が${formatYen(quote.totalYen)}になりました。内容を確認してからもう一度送ってください`);
      }

      const listing = await tx.listing.findUniqueOrThrow({ where: { id: input.listingId } });
      const option = await tx.deliveryOption.findUniqueOrThrow({
        where: { id: input.deliveryOptionId },
        include: { shippingRates: { where: { prefecture: restaurant.prefecture } } },
      });
      const slot = await tx.scheduleSlot.findUniqueOrThrow({ where: { id: input.scheduleSlotId } });

      const bands: ShippingBand[] = option.shippingRates.map(({ prefecture, minGramsExclusive, maxGramsInclusive, feeYen }) => ({
        prefecture,
        minGramsExclusive,
        maxGramsInclusive,
        feeYen,
      }));
      const message = input.message?.trim();

      const order = await tx.order.create({
        data: {
          listingId: listing.id,
          restaurantId: restaurant.id,
          farmerId: listing.farmerId,
          idempotencyKey: input.idempotencyKey,
          quantityGrams: quote.quantityGrams,
          heldGrams: quote.quantityGrams,
          deadlineAt: quote.deadlineAt,
          purchaseConfirmByAt: input.purchaseConfirmByAt,
          useDate: new Date(`${input.useDate}T00:00:00Z`),
          budgetYen: input.budgetYen,
          scheduleSlotId: slot.id,
          hasConsultation: Boolean(message),
          snapItemName: listing.itemName,
          snapUnitPriceYenPerKg: listing.unitPriceYenPerKg,
          snapMinOrderGrams: listing.minOrderGrams,
          snapOrderStepGrams: listing.orderStepGrams,
          snapDeliveryMethod: option.method,
          snapPrefecture: restaurant.prefecture,
          snapShippingRates: bands,
          snapScheduleStartsAt: slot.startsAt,
          snapScheduleEndsAt: slot.endsAt,
          snapPaymentTiming: option.paymentTiming,
          snapPaymentMethod: option.paymentMethod,
          snapPaymentDeadlineAt: option.paymentTiming === "PREPAID" ? option.prepayDeadlineAt! : slot.startsAt,
          snapPaymentConfirmGuideHours: option.paymentConfirmGuideHours,
          itemSubtotalYen: quote.itemSubtotalYen,
          shippingFeeYen: quote.shippingFeeYen,
          totalYen: quote.totalYen,
        },
      });
      await tx.listing.update({ where: { id: listing.id }, data: { heldGrams: { increment: quote.quantityGrams } } });
      await tx.scheduleSlot.update({ where: { id: slot.id }, data: { usedCount: { increment: 1 } } });
      await tx.orderEvent.create({
        data: { orderId: order.id, actorId: input.restaurantUserId, toStatus: "AWAITING_RESPONSE", note: "購入希望を送信（仮押さえ）" },
      });
      if (message) {
        await tx.orderMessage.create({ data: { orderId: order.id, senderId: input.restaurantUserId, body: message } });
      }
      if (input.inquiryId) {
        await tx.listingInquiry.update({
          where: { id: input.inquiryId },
          data: { status: "CONVERTED", convertedOrderId: order.id },
        });
      }
      return { orderId: order.id, duplicate: false };
    });
  } catch (error) {
    // 同時に届いた同じ申込：先に成功した注文を返す
    if (isUniqueViolation(error)) {
      const again = await db.order.findUnique({
        where: { restaurantId_idempotencyKey: { restaurantId: restaurant.id, idempotencyKey: input.idempotencyKey } },
      });
      if (again) return { ok: true, orderId: again.id, duplicate: true };
    }
    throw error;
  }
}

// 申込前の見積もりと全条件の検証。申込時も同じ関数で再検証する
export async function quoteInTx(
  tx: Tx,
  input: Omit<CreateOrderInput, "restaurantUserId" | "idempotencyKey" | "message"> & { prefecture: string },
  now: Date,
): Promise<Quote> {
  const listing = await tx.listing.findUnique({ where: { id: input.listingId } });
  if (!listing || listing.status !== "PUBLISHED") fail("この出品は現在受け付けていません");
  if (now >= listing.acceptDeadlineAt) fail("受付期限を過ぎました。別の出品を検索してください");

  const q = input.quantityGrams;
  if (q < LIMITS.minQuantityGrams || q > LIMITS.maxQuantityGrams) fail("数量は0.5〜1,000kgで指定してください");
  if (!isAllowedQuantity(q, listing.minOrderGrams, listing.orderStepGrams)) {
    fail("数量が最低量・注文単位に合っていません");
  }
  const available = listing.totalGrams - listing.soldGrams - listing.heldGrams;
  if (q > available) fail(`残りが足りません。申込可能数量は${(available / 1000).toLocaleString("ja-JP")}kgです`);

  const option = await tx.deliveryOption.findUnique({
    where: { id: input.deliveryOptionId },
    include: { shippingRates: true },
  });
  if (!option || option.listingId !== listing.id || !option.active) fail("受け渡し方法が見つかりません");

  await lockSlot(tx, input.scheduleSlotId);
  const slot = await tx.scheduleSlot.findUnique({ where: { id: input.scheduleSlotId } });
  if (!slot || slot.deliveryOptionId !== option.id) fail("受け渡し日程が見つかりません");
  if (slot.startsAt <= now) fail("この受け渡し日程はすでに過ぎています");
  if (slot.startsAt >= endOfJstDay(input.useDate)) fail("受け渡し日は使用日以前の日程を選んでください");
  if (slot.capacity !== null && slot.usedCount >= slot.capacity) fail("この日程は受付件数の上限に達しました。別の日程を選んでください");

  const fee = findShippingFee(option.shippingRates, input.prefecture, q);
  if (fee === null) fail("この地域・数量の送料が未設定です。出品の相談欄から農家さんに相談してください");

  const subtotal = itemSubtotalYen(listing.unitPriceYenPerKg, q);
  const total = subtotal + fee;
  if (total > LIMITS.maxYen) fail("注文合計が100,000円を超えます。数量を減らしてください");
  if (total > input.budgetYen) fail(`合計${formatYen(total)}が予算${formatYen(input.budgetYen)}を超えています`);

  // 回答猶予の全時間が、仕入れ確定希望時刻と回答最終期限の両方に収まること
  const graceEnd = new Date(now.getTime() + listing.responseGraceMinutes * 60_000);
  if (graceEnd > input.purchaseConfirmByAt || graceEnd > listing.responseDeadlineAt) {
    fail("農家さんの回答猶予が、仕入れ確定希望時刻または出品の回答期限に収まらなくなりました。条件を変えて再検索してください");
  }
  const deadlineAt = minDate(graceEnd, input.purchaseConfirmByAt, listing.responseDeadlineAt);

  return { quantityGrams: q, itemSubtotalYen: subtotal, shippingFeeYen: fee, totalYen: total, deadlineAt };
}

// 画面表示用の見積もり（DBは変更しない）
export async function quoteOrder(
  db: Db,
  input: Parameters<typeof quoteInTx>[1],
): Promise<Result<{ quote: Quote }>> {
  try {
    const quote = await db.$transaction(async (tx) => quoteInTx(tx, input, await dbNow(tx)));
    return { ok: true, quote };
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.message };
    throw error;
  }
}

// ------------------------------------------------------------
// 回答・取消・再同意
// ------------------------------------------------------------

// 対象注文を出品ごとロックし、期限切れを反映してから読み直す
async function loadLockedOrder(tx: Tx, orderId: string) {
  const head = await tx.order.findUnique({ where: { id: orderId }, select: { listingId: true } });
  if (!head) fail("注文が見つかりません");
  await lockListing(tx, head.listingId);
  await lockOrder(tx, orderId);
  const now = await dbNow(tx);
  await expireDueOrdersInListing(tx, head.listingId, now);
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { farmer: { select: { userId: true } }, restaurant: { select: { userId: true } }, changeProposal: true },
  });
  return { order, now };
}

function currentStateError(status: OrderStatus): string {
  return `この注文は現在「${ORDER_STATUS_LABELS[status]}」です。画面を更新して確認してください`;
}

async function confirmSale(tx: Tx, orderId: string, listingId: string, heldGrams: number) {
  await tx.listing.update({
    where: { id: listingId },
    data: { heldGrams: { decrement: heldGrams }, soldGrams: { increment: heldGrams } },
  });
  await tx.paymentRecord.create({ data: { orderId } });
  await tx.fulfillmentRecord.create({ data: { orderId } });
}

export async function approveOrder(
  db: Db,
  input: { orderId: string; farmerUserId: string; consultationReviewed?: boolean },
): Promise<Result<{ status: OrderStatus }>> {
  return runTx(db, async (tx) => {
    const { order, now } = await loadLockedOrder(tx, input.orderId);
    if (order.farmer.userId !== input.farmerUserId) fail("注文が見つかりません");
    if (order.status !== "AWAITING_RESPONSE") return softFail(currentStateError(order.status));
    if (now >= order.deadlineAt) fail("注文期限を過ぎています");
    if (order.hasConsultation && !input.consultationReviewed) return softFail("相談内容を確認してから承認してください");

    await confirmSale(tx, order.id, order.listingId, order.heldGrams);
    await tx.order.update({ where: { id: order.id }, data: { status: "CONFIRMED", heldGrams: 0, decidedAt: now } });
    await tx.orderEvent.create({
      data: { orderId: order.id, actorId: input.farmerUserId, fromStatus: order.status, toStatus: "CONFIRMED", note: "農家が承認" },
    });
    return { status: "CONFIRMED" as const };
  });
}

export async function declineOrder(db: Db, input: { orderId: string; farmerUserId: string }): Promise<Result> {
  return runTx(db, async (tx) => {
    const { order, now } = await loadLockedOrder(tx, input.orderId);
    if (order.farmer.userId !== input.farmerUserId) fail("注文が見つかりません");
    if (!HOLDING.includes(order.status)) return softFail(currentStateError(order.status));
    await terminate(tx, order.id, "DECLINED", now, input.farmerUserId, "農家が見送り");
    return {};
  });
}

export async function cancelOrder(db: Db, input: { orderId: string; restaurantUserId: string }): Promise<Result> {
  return runTx(db, async (tx) => {
    const { order, now } = await loadLockedOrder(tx, input.orderId);
    if (order.restaurant.userId !== input.restaurantUserId) fail("注文が見つかりません");
    if (!HOLDING.includes(order.status)) return softFail(currentStateError(order.status));
    await terminate(tx, order.id, "CANCELLED", now, input.restaurantUserId, "店が取消");
    return {};
  });
}

export type ProposeChangeInput = {
  orderId: string;
  farmerUserId: string;
  newQuantityGrams: number;
  newScheduleSlotId: string;
  exceptionFeeYen?: number; // 送料表と別の送料を使う場合
  exceptionReason?: string;
};

// 条件変更（数量の減少・受け渡し日時・送料のみ。1回だけ）
export async function proposeChange(db: Db, input: ProposeChangeInput): Promise<Result> {
  return runTx(db, async (tx) => {
    const { order, now } = await loadLockedOrder(tx, input.orderId);
    if (order.farmer.userId !== input.farmerUserId) fail("注文が見つかりません");
    if (order.status !== "AWAITING_RESPONSE") return softFail(currentStateError(order.status));
    if (now >= order.deadlineAt) fail("注文期限を過ぎています");
    if (order.changeProposal) fail("条件変更は1回だけです。再変更する場合は見送って、新しい申込を待ってください");

    const q = input.newQuantityGrams;
    if (q > order.quantityGrams) fail("数量は増やせません");
    if (!isAllowedQuantity(q, order.snapMinOrderGrams, order.snapOrderStepGrams)) {
      fail("変更後の数量が最低量・注文単位に合っていません");
    }

    // 日程：同じ受け渡し方法の枠だけ。移動先の枠を検証する
    const currentSlot = await tx.scheduleSlot.findUniqueOrThrow({ where: { id: order.scheduleSlotId } });
    const slotChanged = input.newScheduleSlotId !== order.scheduleSlotId;
    let newSlot = currentSlot;
    if (slotChanged) {
      await lockSlot(tx, input.newScheduleSlotId);
      const s = await tx.scheduleSlot.findUnique({ where: { id: input.newScheduleSlotId } });
      if (!s || s.deliveryOptionId !== currentSlot.deliveryOptionId) fail("同じ受け渡し方法の日程を選んでください");
      if (s.startsAt <= now) fail("過ぎた日程は選べません");
      if (order.snapPaymentTiming === "PREPAID" && s.startsAt <= order.snapPaymentDeadlineAt) {
        fail("前払いの支払期限より後の日程を選んでください");
      }
      if (s.capacity !== null && s.usedCount >= s.capacity) fail("この日程は受付件数の上限に達しています");
      newSlot = s;
    }

    // 送料：申込時の送料表で再計算。例外送料は理由が必要
    const bands = order.snapShippingRates as ShippingBand[];
    let fee: number;
    let reason: string | null = null;
    if (input.exceptionFeeYen !== undefined) {
      if (!Number.isInteger(input.exceptionFeeYen) || input.exceptionFeeYen < 0 || input.exceptionFeeYen > LIMITS.maxYen) {
        fail("例外送料は0〜100,000円の整数で入力してください");
      }
      reason = input.exceptionReason?.trim() ?? "";
      if (!reason || reason.length > 200) fail("例外送料の理由を200文字以内で入力してください");
      fee = input.exceptionFeeYen;
    } else {
      const found = findShippingFee(bands, order.snapPrefecture, q);
      if (found === null) fail("この数量は申込時の送料表にありません。例外送料と理由を入力してください");
      fee = found;
    }
    const subtotal = itemSubtotalYen(order.snapUnitPriceYenPerKg, q);
    const total = subtotal + fee;
    if (total > LIMITS.maxYen) fail("合計が100,000円を超えます");
    if (q === order.quantityGrams && !slotChanged && fee === order.shippingFeeYen) fail("変更点がありません");

    const warnings: string[] = [];
    if (order.budgetYen !== null && total > order.budgetYen) {
      warnings.push(`合計${formatYen(total)}が店の予算${formatYen(order.budgetYen)}を超えます`);
    }
    if (newSlot.startsAt >= endOfJstDay(order.useDate.toISOString().slice(0, 10))) {
      warnings.push("受け渡し日時が店の使用日より後になります");
    }

    // 減った分の仮押さえはすぐ解除する
    const released = order.heldGrams - q;
    await tx.listing.update({ where: { id: order.listingId }, data: { heldGrams: { decrement: released } } });
    if (slotChanged) {
      await tx.scheduleSlot.update({ where: { id: currentSlot.id }, data: { usedCount: { decrement: 1 } } });
      await tx.scheduleSlot.update({ where: { id: newSlot.id }, data: { usedCount: { increment: 1 } } });
    }
    await tx.orderChangeProposal.create({
      data: {
        orderId: order.id,
        newQuantityGrams: q,
        newScheduleSlotId: newSlot.id,
        newShippingFeeYen: fee,
        exceptionFeeReason: reason,
        newItemSubtotalYen: subtotal,
        newTotalYen: total,
        warnings,
      },
    });
    // 期限は延長しない
    await tx.order.update({ where: { id: order.id }, data: { status: "AWAITING_REAGREEMENT", heldGrams: q } });
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        actorId: input.farmerUserId,
        fromStatus: order.status,
        toStatus: "AWAITING_REAGREEMENT",
        note: `条件変更を提案（${order.quantityGrams}g→${q}g、送料${order.shippingFeeYen}円→${fee}円）`,
      },
    });
    return {};
  });
}

export async function reagreeOrder(db: Db, input: { orderId: string; restaurantUserId: string }): Promise<Result> {
  return runTx(db, async (tx) => {
    const { order, now } = await loadLockedOrder(tx, input.orderId);
    if (order.restaurant.userId !== input.restaurantUserId) fail("注文が見つかりません");
    if (order.status !== "AWAITING_REAGREEMENT") return softFail(currentStateError(order.status));
    if (now >= order.deadlineAt) fail("注文期限を過ぎています");
    const p = order.changeProposal!;
    const slot = await tx.scheduleSlot.findUniqueOrThrow({ where: { id: p.newScheduleSlotId } });

    await confirmSale(tx, order.id, order.listingId, order.heldGrams);
    await tx.orderChangeProposal.update({ where: { id: p.id }, data: { respondedAt: now } });
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "CONFIRMED",
        heldGrams: 0,
        decidedAt: now,
        quantityGrams: p.newQuantityGrams,
        scheduleSlotId: slot.id,
        snapScheduleStartsAt: slot.startsAt,
        snapScheduleEndsAt: slot.endsAt,
        ...(order.snapPaymentTiming === "ON_HANDOVER" && { snapPaymentDeadlineAt: slot.startsAt }),
        itemSubtotalYen: p.newItemSubtotalYen,
        shippingFeeYen: p.newShippingFeeYen,
        totalYen: p.newTotalYen,
      },
    });
    await tx.orderEvent.create({
      data: { orderId: order.id, actorId: input.restaurantUserId, fromStatus: order.status, toStatus: "CONFIRMED", note: "店が変更条件に再同意" },
    });
    return {};
  });
}

// 全件承認：条件どおり（相談なし）で期限内の回答待ちだけを、注文ごとに承認する
export async function approveAllPlain(db: Db, input: { listingId: string; farmerUserId: string }) {
  const listing = await db.listing.findUnique({ where: { id: input.listingId }, include: { farmer: true } });
  if (!listing || listing.farmer.userId !== input.farmerUserId) return [];
  await expireDueOrders(db, { listingIds: [listing.id] });
  const targets = await db.order.findMany({
    where: { listingId: listing.id, status: "AWAITING_RESPONSE", hasConsultation: false },
    orderBy: { deadlineAt: "asc" },
    select: { id: true, restaurant: { select: { shopName: true } } },
  });
  const results: { orderId: string; shopName: string; ok: boolean; error?: string }[] = [];
  for (const t of targets) {
    const r = await approveOrder(db, { orderId: t.id, farmerUserId: input.farmerUserId });
    results.push({ orderId: t.id, shopName: t.restaurant.shopName, ok: r.ok, error: r.ok ? undefined : r.error });
  }
  return results;
}
