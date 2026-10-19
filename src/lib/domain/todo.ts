// ホームと下部メニューのバッジで使う「今やること」の件数
// 件数を数えるだけで、承認・確認などは自動で実行しない。
// 期限を過ぎた注文は数えない（期限切れの反映は各画面の表示前にも行う）。
import type { Db } from "./tx";

// 「期限が近い」の共通設定（販売希望期限など）
export const SOON_HOURS = 48;

const DAY_MS = 86_400_000;
const JST_MS = 9 * 3_600_000;

// 日本時間の「今日」の始まりと終わり
export function jstDayRange(now: Date) {
  const start = new Date(Math.floor((now.getTime() + JST_MS) / DAY_MS) * DAY_MS - JST_MS);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

export type FarmerTodo = {
  awaitingResponse: number; // 回答待ちの購入希望（農家が承認・条件変更・見送りを選ぶもの）
  dueToday: number; // 上のうち、今日が回答期限のもの（内数）
  waitingShopReagreement: number; // 店の再同意待ち（農家の対応は不要。参考表示）
  paymentToConfirm: number; // 店が支払いを申告し、農家の入金確認待ち
  handoverToday: number; // 今日が受け渡し予定で、発送・引き渡しが未記録
  saleTargetSoon: number; // 販売希望期限が近い（受付中・残りあり）出品
};

export async function getFarmerTodo(db: Db, farmerId: string, now: Date): Promise<FarmerTodo> {
  const { start, end } = jstDayRange(now);
  const soon = new Date(now.getTime() + SOON_HOURS * 3_600_000);
  const [awaitingResponse, dueToday, waitingShopReagreement, paymentToConfirm, handoverToday, soonRows] = await Promise.all([
    db.order.count({ where: { farmerId, status: "AWAITING_RESPONSE", deadlineAt: { gt: now } } }),
    db.order.count({ where: { farmerId, status: "AWAITING_RESPONSE", deadlineAt: { gt: now, lt: end } } }),
    db.order.count({ where: { farmerId, status: "AWAITING_REAGREEMENT", deadlineAt: { gt: now } } }),
    db.order.count({ where: { farmerId, status: "CONFIRMED", payment: { status: "BUYER_REPORTED" } } }),
    db.order.count({
      where: { farmerId, status: "CONFIRMED", snapScheduleStartsAt: { gte: start, lt: end }, fulfillment: { farmerSentAt: null } },
    }),
    db.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "Listing"
      WHERE "farmerId" = ${farmerId} AND status = 'PUBLISHED' AND "acceptDeadlineAt" > ${now}
        AND "earlySale" = true AND "saleTargetAt" > ${now} AND "saleTargetAt" <= ${soon}
        AND "totalGrams" - "soldGrams" - "heldGrams" > 0`,
  ]);
  return { awaitingResponse, dueToday, waitingShopReagreement, paymentToConfirm, handoverToday, saleTargetSoon: soonRows[0].n };
}

// 下部メニュー「注文」のバッジ：回答待ち＋入金確認待ち
export const farmerBadge = (t: FarmerTodo) => t.awaitingResponse + t.paymentToConfirm;

export type ShopTodo = {
  awaitingFarmer: number; // 農家の回答待ち（まだ確保できていない）
  needsReagreement: number; // 農家の条件変更に、店の確認・再同意が必要
  paymentNeeded: number; // 販売確定し、支払い（アプリ外）と申告が必要
  receiveNeeded: number; // 発送済み、または受け渡し予定を過ぎ、受取の記録が必要
};

export async function getShopTodo(db: Db, restaurantId: string, now: Date): Promise<ShopTodo> {
  const [awaitingFarmer, needsReagreement, paymentNeeded, receiveNeeded] = await Promise.all([
    db.order.count({ where: { restaurantId, status: "AWAITING_RESPONSE", deadlineAt: { gt: now } } }),
    db.order.count({ where: { restaurantId, status: "AWAITING_REAGREEMENT", deadlineAt: { gt: now } } }),
    db.order.count({ where: { restaurantId, status: "CONFIRMED", payment: { status: "AWAITING_PAYMENT" } } }),
    db.order.count({
      where: {
        restaurantId,
        status: "CONFIRMED",
        fulfillment: { buyerReceivedAt: null },
        OR: [{ fulfillment: { farmerSentAt: { not: null } } }, { snapScheduleStartsAt: { lte: now } }],
      },
    }),
  ]);
  return { awaitingFarmer, needsReagreement, paymentNeeded, receiveNeeded };
}

// 下部メニュー「注文」のバッジ：再同意＋支払い＋受取確認
export const shopBadge = (t: ShopTodo) => t.needsReagreement + t.paymentNeeded + t.receiveNeeded;
