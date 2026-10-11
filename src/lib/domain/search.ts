// 店の条件検索
// 候補・価格・数量・順番はアプリが決める。AIはあとから説明を添えるだけ。
import type { DeliveryMethod, PaymentMethod, PaymentTiming } from "@/generated/prisma/enums";
import { fairOrder } from "./ordering";
import { expireDueOrders } from "./orders";
import { findShippingFee } from "./shipping";
import { dbNow, type Db } from "./tx";
import { endOfJstDay, itemSubtotalYen, minDate, smallestAllowedAtLeast } from "./units";

export type ItemMode = "EXACT" | "ALT_OK" | "ANY";
export type SortMode = "fair" | "total" | "deadline";

export type SearchParams = {
  itemQuery: string;
  itemMode: ItemMode;
  quantityGrams: number;
  budgetYen: number;
  useDate: string; // YYYY-MM-DD
  deliveryMethod: DeliveryMethod | "ANY";
  purchaseConfirmByAt: Date;
  purpose?: string;
  extraGrams: number; // 「希望より多い候補も見る」の追加許容量（0なら使わない）
  showUnsetShipping: boolean;
  sort: SortMode;
  seed: string;
};

export type Candidate = {
  listingId: string;
  farmerId: string;
  farmName: string;
  farmCity: string;
  farmPrefecture: string;
  responseGuide: string | null;
  itemName: string;
  description: string | null;
  selfDeclaredFeatures: string | null;
  sizeLabel: string | null;
  unitPriceYenPerKg: number;
  minOrderGrams: number;
  orderStepGrams: number;
  availableGrams: number;
  purchaseGrams: number;
  itemSubtotalYen: number;
  shippingFeeYen: number | null; // null は送料未設定
  totalYen: number | null;
  deliveryMethod: DeliveryMethod;
  paymentTiming: PaymentTiming;
  paymentMethod: PaymentMethod;
  firstSlotAt: Date;
  acceptDeadlineAt: Date;
  orderDeadlineAt: Date;
  photoUrl: string | null;
  isNewFarmer: boolean;
  isRepeat: boolean;
};

export type SearchResult = {
  now: Date;
  normal: Candidate[];
  extra: Candidate[];
  unsetShipping: Candidate[];
  alternatives: Candidate[];
  prefecture: string;
};

const NEW_FARMER_DAYS = 30;

function normalize(s: string) {
  // カタカナをひらがなにそろえ、空白を除く
  return s
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s/g, "")
    .toLowerCase();
}

export function itemMatches(itemName: string, query: string) {
  const a = normalize(itemName);
  const b = normalize(query);
  return b.length > 0 && (a.includes(b) || b.includes(a));
}

export async function searchListings(db: Db, restaurantUserId: string, p: SearchParams): Promise<SearchResult> {
  const restaurant = await db.restaurantProfile.findUniqueOrThrow({ where: { userId: restaurantUserId } });
  const now = await dbNow(db);
  const useDateEnd = endOfJstDay(p.useDate);

  const listings = await db.listing.findMany({
    where: { status: "PUBLISHED", acceptDeadlineAt: { gt: now } },
    take: 500,
    select: { id: true },
  });
  // 在庫を見る前に期限切れの仮押さえを解除する
  await expireDueOrders(db, { listingIds: listings.map((l) => l.id) });

  const rows = await db.listing.findMany({
    where: { id: { in: listings.map((l) => l.id) }, status: "PUBLISHED", acceptDeadlineAt: { gt: now } },
    include: {
      farmer: { select: { id: true, farmName: true, city: true, prefecture: true, responseGuide: true, user: { select: { createdAt: true } } } },
      photos: { orderBy: [{ publishRound: "desc" }, { createdAt: "asc" }], take: 1, select: { url: true } },
      deliveryOptions: {
        where: { active: true, ...(p.deliveryMethod !== "ANY" && { method: p.deliveryMethod }) },
        include: {
          shippingRates: { where: { prefecture: restaurant.prefecture } },
          scheduleSlots: { where: { startsAt: { gt: now, lt: useDateEnd } }, orderBy: { startsAt: "asc" } },
        },
      },
    },
  });

  const repeatFarmers = new Set(
    (
      await db.order.findMany({
        where: { restaurantId: restaurant.id, status: "CONFIRMED" },
        select: { farmerId: true },
        distinct: ["farmerId"],
      })
    ).map((o) => o.farmerId),
  );
  const newSince = new Date(now.getTime() - NEW_FARMER_DAYS * 24 * 60 * 60 * 1000);

  const result: SearchResult = { now, normal: [], extra: [], unsetShipping: [], alternatives: [], prefecture: restaurant.prefecture };

  for (const l of rows) {
    // 回答猶予の全時間が、店の仕入れ確定希望時刻と出品の回答最終期限の両方に収まること
    const graceEnd = new Date(now.getTime() + l.responseGraceMinutes * 60_000);
    if (graceEnd > p.purchaseConfirmByAt || graceEnd > l.responseDeadlineAt) continue;

    const matches = p.itemMode === "ANY" || itemMatches(l.itemName, p.itemQuery);
    if (!matches && p.itemMode !== "ALT_OK") continue;

    const available = l.totalGrams - l.soldGrams - l.heldGrams;
    const purchase = smallestAllowedAtLeast(p.quantityGrams, l.minOrderGrams, l.orderStepGrams);
    if (purchase > available) continue;
    const isExtra = purchase > p.quantityGrams;
    if (isExtra && (!matches || p.extraGrams <= 0 || purchase - p.quantityGrams > p.extraGrams)) continue;

    const subtotal = itemSubtotalYen(l.unitPriceYenPerKg, purchase);
    // 受け渡し方法ごとに、空きのある日程と送料を確認し、総額が一番低い方法を代表にする
    let best: { option: (typeof l.deliveryOptions)[number]; fee: number | null; firstSlot: Date } | null = null;
    for (const o of l.deliveryOptions) {
      const slot = o.scheduleSlots.find((s) => s.capacity === null || s.usedCount < s.capacity);
      if (!slot) continue;
      const fee = findShippingFee(o.shippingRates, restaurant.prefecture, purchase);
      const better =
        !best ||
        (fee !== null && best.fee === null) ||
        (fee !== null && best.fee !== null && fee < best.fee);
      if (better) best = { option: o, fee, firstSlot: slot.startsAt };
    }
    if (!best) continue;

    const total = best.fee === null ? null : subtotal + best.fee;
    if (total !== null && total > p.budgetYen) continue;

    const c: Candidate = {
      listingId: l.id,
      farmerId: l.farmer.id,
      farmName: l.farmer.farmName,
      farmCity: l.farmer.city,
      farmPrefecture: l.farmer.prefecture,
      responseGuide: l.farmer.responseGuide,
      itemName: l.itemName,
      description: l.description,
      selfDeclaredFeatures: l.selfDeclaredFeatures,
      sizeLabel: l.sizeLabel,
      unitPriceYenPerKg: l.unitPriceYenPerKg,
      minOrderGrams: l.minOrderGrams,
      orderStepGrams: l.orderStepGrams,
      availableGrams: available,
      purchaseGrams: purchase,
      itemSubtotalYen: subtotal,
      shippingFeeYen: best.fee,
      totalYen: total,
      deliveryMethod: best.option.method,
      paymentTiming: best.option.paymentTiming,
      paymentMethod: best.option.paymentMethod,
      firstSlotAt: best.firstSlot,
      acceptDeadlineAt: l.acceptDeadlineAt,
      orderDeadlineAt: minDate(graceEnd, p.purchaseConfirmByAt, l.responseDeadlineAt),
      photoUrl: l.photos[0]?.url ?? null,
      isNewFarmer: l.farmer.user.createdAt > newSince,
      isRepeat: repeatFarmers.has(l.farmer.id),
    };

    if (total === null) {
      if (p.showUnsetShipping && matches) result.unsetShipping.push(c);
    } else if (!matches) {
      result.alternatives.push(c);
    } else if (isExtra) {
      result.extra.push(c);
    } else {
      result.normal.push(c);
    }
  }

  const sortList = (list: Candidate[]) => {
    if (p.sort === "total") return [...list].sort((a, b) => a.totalYen! - b.totalYen! || a.listingId.localeCompare(b.listingId));
    if (p.sort === "deadline") {
      return [...list].sort(
        (a, b) => a.acceptDeadlineAt.getTime() - b.acceptDeadlineAt.getTime() || a.listingId.localeCompare(b.listingId),
      );
    }
    return fairOrder(list.map((c) => ({ ...c, id: c.listingId })), p.seed);
  };
  result.normal = sortList(result.normal);
  result.extra = sortList(result.extra);
  result.alternatives = fairOrder(result.alternatives.map((c) => ({ ...c, id: c.listingId })), p.seed).slice(0, 6);
  result.unsetShipping = fairOrder(result.unsetShipping.map((c) => ({ ...c, id: c.listingId })), p.seed);
  return result;
}
