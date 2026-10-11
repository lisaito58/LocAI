"use server";
// 費用メモ（農家だけが閲覧・編集。店の請求額や支払い記録には影響しない）
import { refresh } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/components/action-button";
import { kgTextToGrams } from "@/lib/domain/units";
import { requireFarmer } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { blankToUndefined } from "@/lib/validation/listing";

// 空欄は「未入力」(null)。0円とはみなさない
const optionalYen = z.preprocess(
  blankToUndefined,
  z.coerce.number("金額は数字で入力してください").int("金額は円の整数で入力してください").min(0).max(1_000_000).optional(),
);

const costSchema = z.object({
  actualShippingYen: optionalYen,
  packingYen: optionalYen,
  otherSalesCostYen: optionalYen,
  note: z.string().trim().max(200).optional(),
});

export async function saveOrderCostAction(orderId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { profile } = await requireFarmer();
  if (!profile) return { ok: false, error: "農園情報を登録してください" };
  const order = await prisma.order.findFirst({ where: { id: orderId, farmerId: profile.id } });
  if (!order) return { ok: false, error: "注文が見つかりません" };
  const parsed = costSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const data = {
    actualShippingYen: parsed.data.actualShippingYen ?? null,
    packingYen: parsed.data.packingYen ?? null,
    otherSalesCostYen: parsed.data.otherSalesCostYen ?? null,
    note: parsed.data.note || null,
  };
  const existing = await prisma.costMemo.findFirst({ where: { orderId, farmerId: profile.id, kind: "ACTUAL" } });
  if (existing) await prisma.costMemo.update({ where: { id: existing.id }, data });
  else await prisma.costMemo.create({ data: { ...data, farmerId: profile.id, orderId, kind: "ACTUAL" } });
  refresh();
  return { ok: true, message: "費用メモを保存しました" };
}

const simSchema = z.object({
  itemName: z.string().trim().min(1, "品目を入力してください").max(50),
  quantityKg: z.string(),
  unitPriceYenPerKg: z.preprocess(blankToUndefined, z.coerce.number("仮の単価を入力してください").int().min(1).max(100_000)),
  receivedShippingYen: optionalYen,
  actualShippingYen: optionalYen,
  packingYen: optionalYen,
  otherSalesCostYen: optionalYen,
  marketItemName: z.string().trim().max(50).optional(),
  marketKg: z.string().optional(),
  marketAmountYen: optionalYen,
});

// 値下げ検討などの試算（実績とは区別して保存する）
export async function saveSimulationAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { profile } = await requireFarmer();
  if (!profile) return { ok: false, error: "農園情報を登録してください" };
  const parsed = simSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  const grams = kgTextToGrams(d.quantityKg);
  if (grams === null || grams <= 0) return { ok: false, error: "仮の販売量をkgで入力してください" };
  const marketGrams = d.marketKg ? kgTextToGrams(d.marketKg) : null;
  if (d.marketKg && marketGrams === null) return { ok: false, error: "市場の量をkgで入力してください" };
  await prisma.costMemo.create({
    data: {
      farmerId: profile.id,
      kind: "SIMULATION",
      quantityGrams: grams,
      itemSubtotalYen: Math.floor((d.unitPriceYenPerKg * grams) / 1000),
      receivedShippingYen: d.receivedShippingYen ?? null,
      actualShippingYen: d.actualShippingYen ?? null,
      packingYen: d.packingYen ?? null,
      otherSalesCostYen: d.otherSalesCostYen ?? null,
      marketItemName: d.marketItemName || null,
      marketGrams,
      marketAmountYen: d.marketAmountYen ?? null,
      note: `試算：${d.itemName}（単価${d.unitPriceYenPerKg}円/kg）`,
    },
  });
  refresh();
  return { ok: true, message: "試算を保存しました（実績とは別に記録しています）" };
}
