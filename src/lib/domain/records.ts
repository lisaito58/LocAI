// 販売確定後の手動記録・相談・要相談フラグ
// 決済・銀行・配送会社とは連携しない。当事者が自分の記録だけを付ける。
import { dbNow, fail, runTx, type Db, type Result, type Tx } from "./tx";
import { LIMITS } from "./units";

type Party = "RESTAURANT" | "FARMER";

// 当事者確認。他人の注文は「見つからない」として扱う
async function loadParty(tx: Tx | Db, orderId: string, userId: string) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: {
      farmer: { select: { userId: true } },
      restaurant: { select: { userId: true } },
      payment: true,
      fulfillment: true,
    },
  });
  if (!order) fail("注文が見つかりません");
  const party: Party | null =
    order.farmer.userId === userId ? "FARMER" : order.restaurant.userId === userId ? "RESTAURANT" : null;
  if (!party) fail("注文が見つかりません");
  return { order, party };
}

async function lockRecords(tx: Tx, orderId: string) {
  await tx.$queryRaw`SELECT id FROM "PaymentRecord" WHERE "orderId" = ${orderId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "FulfillmentRecord" WHERE "orderId" = ${orderId} FOR UPDATE`;
}

function requireConfirmed(order: { status: string; payment: unknown; fulfillment: unknown }) {
  if (order.status !== "CONFIRMED" || !order.payment || !order.fulfillment) fail("販売確定後に記録できます");
}

// 店：アプリ外で支払ったことを申告（入金確認の証明ではない）。連打しても確認予定の起点は最初の申告のまま
export async function reportPayment(db: Db, input: { orderId: string; userId: string }): Promise<Result> {
  return runTx(db, async (tx) => {
    await lockRecords(tx, input.orderId);
    const { order, party } = await loadParty(tx, input.orderId, input.userId);
    if (party !== "RESTAURANT") fail("支払申告は店が行います");
    requireConfirmed(order);
    if (order.payment!.status === "FARMER_CONFIRMED") fail("すでに農家さんが入金を確認済みです");
    const now = await dbNow(tx);
    await tx.paymentRecord.update({
      where: { orderId: order.id },
      data: { status: "BUYER_REPORTED", firstReportedAt: order.payment!.firstReportedAt ?? now, lastReportedAt: now },
    });
    return {};
  });
}

// 農家：実際の入金・代金受取を確認して記録（店の申告がなくても記録できる）
export async function confirmPayment(db: Db, input: { orderId: string; userId: string }): Promise<Result> {
  return runTx(db, async (tx) => {
    await lockRecords(tx, input.orderId);
    const { order, party } = await loadParty(tx, input.orderId, input.userId);
    if (party !== "FARMER") fail("入金確認は農家が行います");
    requireConfirmed(order);
    if (order.payment!.status === "FARMER_CONFIRMED") return {};
    await tx.paymentRecord.update({
      where: { orderId: order.id },
      data: { status: "FARMER_CONFIRMED", confirmedAt: await dbNow(tx), confirmedBy: input.userId },
    });
    return {};
  });
}

// 農家：発送済み／引き渡し済み。前払いで入金未確認なら、再確認がないと記録しない
export async function markSent(
  db: Db,
  input: { orderId: string; userId: string; acknowledgeUnpaid?: boolean },
): Promise<Result<{ needsAcknowledge?: boolean }>> {
  return runTx(db, async (tx) => {
    await lockRecords(tx, input.orderId);
    const { order, party } = await loadParty(tx, input.orderId, input.userId);
    if (party !== "FARMER") fail("発送の記録は農家が行います");
    requireConfirmed(order);
    if (order.fulfillment!.farmerSentAt) return {};
    if (order.snapPaymentTiming === "PREPAID" && order.payment!.status !== "FARMER_CONFIRMED" && !input.acknowledgeUnpaid) {
      fail("前払いの注文ですが、まだ入金確認が記録されていません。確認したうえで発送する場合は、チェックを入れてもう一度押してください");
    }
    await tx.fulfillmentRecord.update({
      where: { orderId: order.id },
      data: { farmerSentAt: await dbNow(tx), farmerSentBy: input.userId },
    });
    return {};
  });
}

// 店：受取済み
export async function markReceived(db: Db, input: { orderId: string; userId: string }): Promise<Result> {
  return runTx(db, async (tx) => {
    await lockRecords(tx, input.orderId);
    const { order, party } = await loadParty(tx, input.orderId, input.userId);
    if (party !== "RESTAURANT") fail("受取の記録は店が行います");
    requireConfirmed(order);
    if (order.fulfillment!.buyerReceivedAt) return {};
    await tx.fulfillmentRecord.update({
      where: { orderId: order.id },
      data: { buyerReceivedAt: await dbNow(tx), buyerReceivedBy: input.userId },
    });
    return {};
  });
}

export type CorrectionTarget = "paymentReport" | "paymentConfirm" | "sent" | "received";

// 自分が付けた記録だけを取り消す。理由と変更前後を履歴に残す
export async function correctRecord(
  db: Db,
  input: { orderId: string; userId: string; target: CorrectionTarget; reason: string },
): Promise<Result> {
  const reason = input.reason.trim();
  if (!reason || reason.length > 200) return { ok: false, error: "訂正の理由を200文字以内で入力してください" };
  return runTx(db, async (tx) => {
    await lockRecords(tx, input.orderId);
    const { order, party } = await loadParty(tx, input.orderId, input.userId);
    requireConfirmed(order);
    const pay = order.payment!;
    const ful = order.fulfillment!;
    let recordType: "payment" | "fulfillment";
    let before: object;
    let after: object;

    if (input.target === "paymentReport") {
      if (party !== "RESTAURANT") fail("自分の記録だけ訂正できます");
      if (pay.status !== "BUYER_REPORTED") fail("取り消せる支払申告がありません");
      recordType = "payment";
      before = { status: pay.status, firstReportedAt: pay.firstReportedAt, lastReportedAt: pay.lastReportedAt };
      after = { status: "AWAITING_PAYMENT", firstReportedAt: null, lastReportedAt: null };
      await tx.paymentRecord.update({ where: { orderId: order.id }, data: after });
    } else if (input.target === "paymentConfirm") {
      if (party !== "FARMER") fail("自分の記録だけ訂正できます");
      if (pay.status !== "FARMER_CONFIRMED") fail("取り消せる入金確認がありません");
      recordType = "payment";
      before = { status: pay.status, confirmedAt: pay.confirmedAt };
      after = { status: pay.firstReportedAt ? "BUYER_REPORTED" : "AWAITING_PAYMENT", confirmedAt: null, confirmedBy: null };
      await tx.paymentRecord.update({ where: { orderId: order.id }, data: after });
    } else if (input.target === "sent") {
      if (party !== "FARMER") fail("自分の記録だけ訂正できます");
      if (!ful.farmerSentAt) fail("取り消せる発送記録がありません");
      recordType = "fulfillment";
      before = { farmerSentAt: ful.farmerSentAt };
      after = { farmerSentAt: null, farmerSentBy: null };
      await tx.fulfillmentRecord.update({ where: { orderId: order.id }, data: after });
    } else {
      if (party !== "RESTAURANT") fail("自分の記録だけ訂正できます");
      if (!ful.buyerReceivedAt) fail("取り消せる受取記録がありません");
      recordType = "fulfillment";
      before = { buyerReceivedAt: ful.buyerReceivedAt };
      after = { buyerReceivedAt: null, buyerReceivedBy: null };
      await tx.fulfillmentRecord.update({ where: { orderId: order.id }, data: after });
    }
    await tx.recordCorrection.create({
      data: {
        orderId: order.id,
        actorId: input.userId,
        recordType,
        before: JSON.parse(JSON.stringify(before)),
        after: JSON.parse(JSON.stringify(after)),
        reason,
      },
    });
    return {};
  });
}

// 要相談フラグ（補助。注文状態は変えない）
export async function setNeedsDiscussion(
  db: Db,
  input: { orderId: string; userId: string; value: boolean },
): Promise<Result> {
  return runTx(db, async (tx) => {
    await loadParty(tx, input.orderId, input.userId);
    await tx.order.update({
      where: { id: input.orderId },
      data: input.value
        ? { needsDiscussion: true, needsDiscussionBy: input.userId, needsDiscussionAt: await dbNow(tx) }
        : { needsDiscussion: false, needsDiscussionBy: null, needsDiscussionAt: null },
    });
    return {};
  });
}

function checkBody(body: string): string {
  const t = body.trim();
  if (!t) fail("メッセージを入力してください");
  if (t.length > LIMITS.maxTextLength) fail("メッセージは500文字以内で入力してください");
  return t;
}

// 注文スレッドへの投稿（当事者だけ）
export async function postOrderMessage(db: Db, input: { orderId: string; userId: string; body: string }): Promise<Result> {
  return runTx(db, async (tx) => {
    await loadParty(tx, input.orderId, input.userId);
    await tx.orderMessage.create({ data: { orderId: input.orderId, senderId: input.userId, body: checkBody(input.body) } });
    return {};
  });
}

// 出品スレッド（予備相談・送料未設定の相談）。仮押さえ・注文状態は持たない
export async function openInquiry(
  db: Db,
  input: { listingId: string; restaurantUserId: string; primaryOrderId?: string; body: string },
): Promise<Result<{ inquiryId: string }>> {
  return runTx(db, async (tx) => {
    const restaurant = await tx.restaurantProfile.findUnique({ where: { userId: input.restaurantUserId } });
    if (!restaurant) fail("先に店舗プロフィールを登録してください");
    const listing = await tx.listing.findUnique({ where: { id: input.listingId } });
    if (!listing || listing.status === "DRAFT") fail("出品が見つかりません");
    if (input.primaryOrderId) {
      const primary = await tx.order.findUnique({ where: { id: input.primaryOrderId } });
      if (!primary || primary.restaurantId !== restaurant.id) fail("第一候補の注文が見つかりません");
      if (primary.listingId === listing.id) fail("第一候補と同じ出品は予備にできません");
    }
    const body = checkBody(input.body);
    const now = await dbNow(tx);
    // 同じ出品への質問が続いていれば、新しく作らずそこに書き足す（会話を分けない）
    const existing = input.primaryOrderId
      ? null
      : await tx.listingInquiry.findFirst({
          where: { listingId: listing.id, restaurantId: restaurant.id, status: "OPEN", primaryOrderId: null },
          orderBy: { createdAt: "desc" },
        });
    const inquiry =
      existing ??
      (await tx.listingInquiry.create({
        data: { listingId: listing.id, restaurantId: restaurant.id, primaryOrderId: input.primaryOrderId ?? null, restaurantReadAt: now },
      }));
    await tx.inquiryMessage.create({ data: { inquiryId: inquiry.id, senderId: input.restaurantUserId, body } });
    await tx.listingInquiry.update({ where: { id: inquiry.id }, data: { restaurantReadAt: now } });
    return { inquiryId: inquiry.id };
  });
}

async function loadInquiryParty(tx: Tx | Db, inquiryId: string, userId: string) {
  const inquiry = await tx.listingInquiry.findUnique({
    where: { id: inquiryId },
    include: { restaurant: { select: { userId: true } }, listing: { select: { farmer: { select: { userId: true } } } } },
  });
  if (!inquiry) fail("相談が見つかりません");
  const party: Party | null =
    inquiry.restaurant.userId === userId ? "RESTAURANT" : inquiry.listing.farmer.userId === userId ? "FARMER" : null;
  if (!party) fail("相談が見つかりません");
  return { inquiry, party };
}

export async function postInquiryMessage(db: Db, input: { inquiryId: string; userId: string; body: string }): Promise<Result> {
  return runTx(db, async (tx) => {
    const { inquiry, party } = await loadInquiryParty(tx, input.inquiryId, input.userId);
    // 出品の受付終了や注文への切り替えとは関係なく、明示的に「終える」まで会話を続けられる
    if (inquiry.status === "CLOSED") fail("この相談は終えています。新しく質問してください");
    await tx.inquiryMessage.create({ data: { inquiryId: inquiry.id, senderId: input.userId, body: checkBody(input.body) } });
    const now = await dbNow(tx);
    await tx.listingInquiry.update({
      where: { id: inquiry.id },
      data: party === "FARMER" ? { farmerReadAt: now } : { restaurantReadAt: now },
    });
    return {};
  });
}

export async function closeInquiry(db: Db, input: { inquiryId: string; userId: string }): Promise<Result> {
  return runTx(db, async (tx) => {
    const { inquiry } = await loadInquiryParty(tx, input.inquiryId, input.userId);
    if (inquiry.status !== "OPEN") return {};
    await tx.listingInquiry.update({ where: { id: inquiry.id }, data: { status: "CLOSED" } });
    return {};
  });
}

export { loadInquiryParty, loadParty };

// 相談を開いたら、その人の既読時刻を更新する（画面を閉じても相談は終わらない）
export async function markInquiryRead(db: Db, input: { inquiryId: string; userId: string }) {
  const { inquiry, party } = await loadInquiryParty(db, input.inquiryId, input.userId);
  const now = await dbNow(db);
  await db.listingInquiry.update({
    where: { id: inquiry.id },
    data: party === "FARMER" ? { farmerReadAt: now } : { restaurantReadAt: now },
  });
}

export type InquirySummary = {
  id: string;
  status: "OPEN" | "CONVERTED" | "CLOSED";
  itemName: string;
  listingId: string;
  counterpart: string;
  lastBody: string;
  lastAt: Date;
  lastFromMe: boolean;
  unread: boolean; // 相手からのメッセージで、まだ開いていないものがある
};

// 自分が当事者の相談の一覧（新しいメッセージ順）
export async function listMyInquiries(db: Db, userId: string, role: Party): Promise<InquirySummary[]> {
  const rows = await db.listingInquiry.findMany({
    where: role === "FARMER" ? { listing: { farmer: { userId } } } : { restaurant: { userId } },
    take: 100,
    include: {
      listing: { select: { id: true, itemName: true, farmer: { select: { farmName: true } } } },
      restaurant: { select: { shopName: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  return rows
    .filter((r) => r.messages.length > 0)
    .map((r) => {
      const last = r.messages[0];
      const myRead = role === "FARMER" ? r.farmerReadAt : r.restaurantReadAt;
      const fromMe = last.senderId === userId;
      return {
        id: r.id,
        status: r.status,
        itemName: r.listing.itemName,
        listingId: r.listing.id,
        counterpart: role === "FARMER" ? r.restaurant.shopName : r.listing.farmer.farmName,
        lastBody: last.body,
        lastAt: last.createdAt,
        lastFromMe: fromMe,
        unread: !fromMe && (!myRead || last.createdAt > myRead),
      };
    })
    .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
}

// 新着の件数（相手からの未読メッセージがある相談の数）。注文の件数とは別に数える
export async function countUnreadInquiries(db: Db, userId: string, role: Party): Promise<number> {
  return (await listMyInquiries(db, userId, role)).filter((i) => i.unread && i.status !== "CLOSED").length;
}
