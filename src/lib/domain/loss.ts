// 仕入れの振り返り・ロス記録（任意。飲食店本人だけが閲覧・変更する）
// - 対象：販売確定し、店が受取を記録した注文
// - 1注文1件。訂正は同じ記録を更新し、二重に数えない
// - 「まだ使用中」と未入力は振り返り未完了。ロス0として数えない
// - 注文・在庫・支払い・レビュー・農家の評価には影響させない
import { DomainError, fail, isUniqueViolation, type Db, type Result } from "./tx";
import { itemKey, wasteFromRatio } from "./loss-rules";
import { kgTextToGrams } from "./units";

export { itemKey, RATIO_CHOICES, wasteFromRatio } from "./loss-rules";

export type LossChoice = { kind: "IN_USE" } | { kind: "RATIO"; quarters: number } | { kind: "DIRECT"; wasteKg: string };

export async function saveLossRecord(
  db: Db,
  input: { orderId: string; userId: string; choice: LossChoice; receivedKg?: string; reason?: string },
  retried = false,
): Promise<Result<{ wasteGrams: number | null; receivedGrams: number }>> {
  try {
    const order = await db.order.findUnique({
      where: { id: input.orderId },
      include: { restaurant: { select: { id: true, userId: true } }, fulfillment: true, lossRecord: true },
    });
    if (!order || order.restaurant.userId !== input.userId) fail("注文が見つかりません");
    if (order.status !== "CONFIRMED" || !order.fulfillment?.buyerReceivedAt) fail("振り返りは、受け取りを記録した注文だけに付けられます");

    // 受取量：初期値は販売確定数量。実際に違った場合だけ本人が訂正する（元の注文は書き換えない）
    let received = order.lossRecord?.receivedGrams ?? order.quantityGrams;
    if (input.receivedKg && input.receivedKg.trim()) {
      const g = kgTextToGrams(input.receivedKg);
      if (g === null || g <= 0) fail("実際の受取量はkgで、小数3桁までの数字で入力してください");
      received = g;
    }
    const reason = input.reason?.trim() || null;
    if (reason && reason.length > 200) fail("理由は200文字以内で入力してください");

    let data: { status: "IN_USE" | "DONE"; method: "RATIO" | "DIRECT" | null; ratioQuarters: number | null; wasteGrams: number | null; approximate: boolean };
    const c = input.choice;
    if (c.kind === "IN_USE") {
      data = { status: "IN_USE", method: null, ratioQuarters: null, wasteGrams: null, approximate: false };
    } else if (c.kind === "RATIO") {
      if (!Number.isInteger(c.quarters) || c.quarters < 0 || c.quarters > 4) fail("選択肢を選び直してください");
      // 「ロスなし」は0gで確定。割合（4分の1など）は概算として保存する
      data = { status: "DONE", method: "RATIO", ratioQuarters: c.quarters, wasteGrams: wasteFromRatio(received, c.quarters), approximate: c.quarters !== 0 };
    } else {
      const g = kgTextToGrams(c.wasteKg);
      if (g === null) fail("廃棄量はkgで、小数3桁までの数字で入力してください");
      if (g > received) fail("廃棄量が受取量を超えています。数字を確認してください");
      data = { status: "DONE", method: "DIRECT", ratioQuarters: null, wasteGrams: g, approximate: false };
    }
    const values = { ...data, receivedGrams: received, reason };
    // 1注文1件。すでにあれば同じ記録を更新する（同時に送られても1件になる）
    await db.lossRecord.upsert({
      where: { orderId: order.id },
      create: { orderId: order.id, restaurantId: order.restaurant.id, ...values },
      update: values,
    });
    return { ok: true, wasteGrams: values.wasteGrams, receivedGrams: received };
  } catch (error) {
    // 同時作成の競合：1回だけやり直す（今度は同じ記録の更新になる）
    if (isUniqueViolation(error) && !retried) return saveLossRecord(db, input, true);
    if (error instanceof DomainError) return { ok: false, error: error.message };
    throw error;
  }
}

export type LossRow = {
  orderId: string;
  itemName: string;
  farmName: string;
  receivedAt: Date;
  receivedGrams: number;
  itemSubtotalYen: number;
  status: "DONE" | "IN_USE" | "NONE";
  wasteGrams: number | null;
  approximate: boolean;
};

export type LossTotals = {
  purchaseCount: number;
  purchaseGrams: number;
  doneCount: number;
  pendingCount: number;
  wasteGrams: number;
  doneReceivedGrams: number;
  lossRate: number | null; // 振り返り済みがなければ null（0%と表示しない）
  lossYen: number | null;
  approximate: boolean;
};

function totals(rows: LossRow[]): LossTotals {
  const done = rows.filter((r) => r.status === "DONE");
  const wasteGrams = done.reduce((s, r) => s + (r.wasteGrams ?? 0), 0);
  const doneReceivedGrams = done.reduce((s, r) => s + r.receivedGrams, 0);
  // 食材代換算のロス額＝各注文の商品代×その注文の廃棄割合の合計（送料は含めない）
  const lossYenExact = done.reduce((s, r) => s + (r.itemSubtotalYen * (r.wasteGrams ?? 0)) / r.receivedGrams, 0);
  return {
    purchaseCount: rows.length,
    purchaseGrams: rows.reduce((s, r) => s + r.receivedGrams, 0),
    doneCount: done.length,
    pendingCount: rows.length - done.length,
    wasteGrams,
    doneReceivedGrams,
    lossRate: done.length ? wasteGrams / doneReceivedGrams : null,
    lossYen: done.length ? Math.round(lossYenExact) : null,
    approximate: done.some((r) => r.approximate),
  };
}

// 期間の集計（基準は振り返りの入力日ではなく、注文の受取日）
export async function getLossSummary(db: Db, restaurantId: string, from: Date, to: Date) {
  const orders = await db.order.findMany({
    where: { restaurantId, status: "CONFIRMED", fulfillment: { buyerReceivedAt: { gte: from, lt: to } } },
    select: {
      id: true,
      snapItemName: true,
      quantityGrams: true,
      itemSubtotalYen: true,
      farmer: { select: { farmName: true } },
      fulfillment: { select: { buyerReceivedAt: true } },
      lossRecord: true,
    },
  });
  const rows: LossRow[] = orders
    .map((o) => ({
      orderId: o.id,
      itemName: o.snapItemName,
      farmName: o.farmer.farmName,
      receivedAt: o.fulfillment!.buyerReceivedAt!,
      receivedGrams: o.lossRecord?.receivedGrams ?? o.quantityGrams,
      itemSubtotalYen: o.itemSubtotalYen,
      status: (o.lossRecord?.status ?? "NONE") as LossRow["status"],
      wasteGrams: o.lossRecord?.status === "DONE" ? o.lossRecord.wasteGrams : null,
      approximate: o.lossRecord?.status === "DONE" ? o.lossRecord.approximate : false,
    }))
    .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
  const byItem = new Map<string, { name: string; rows: LossRow[] }>();
  for (const r of rows) {
    const k = itemKey(r.itemName);
    const g = byItem.get(k) ?? { name: r.itemName, rows: [] };
    g.rows.push(r);
    byItem.set(k, g);
  }
  return {
    rows,
    totals: totals(rows),
    items: [...byItem.values()].map((g) => ({ name: g.name, totals: totals(g.rows) })).sort((a, b) => a.name.localeCompare(b.name, "ja")),
  };
}

// 注文前の案内：同じ食材の直近（受取日の新しい順）の振り返り済み注文で、受取量の50%以上を廃棄していたか
export async function getLossWarning(db: Db, restaurantId: string, itemName: string) {
  const key = itemKey(itemName);
  const records = await db.lossRecord.findMany({
    where: { restaurantId, status: "DONE" },
    select: {
      receivedGrams: true,
      wasteGrams: true,
      approximate: true,
      order: { select: { snapItemName: true, fulfillment: { select: { buyerReceivedAt: true } } } },
    },
  });
  const latest = records
    .filter((r) => itemKey(r.order.snapItemName) === key && r.order.fulfillment?.buyerReceivedAt && r.wasteGrams !== null)
    .sort((a, b) => b.order.fulfillment!.buyerReceivedAt!.getTime() - a.order.fulfillment!.buyerReceivedAt!.getTime())[0];
  if (!latest) return null;
  // 50%ちょうどを含む（廃棄量×2 ≧ 受取量）
  if (latest.wasteGrams! * 2 < latest.receivedGrams) return null;
  return {
    receivedAt: latest.order.fulfillment!.buyerReceivedAt!,
    receivedGrams: latest.receivedGrams,
    wasteGrams: latest.wasteGrams!,
    approximate: latest.approximate,
    itemName: latest.order.snapItemName,
  };
}
