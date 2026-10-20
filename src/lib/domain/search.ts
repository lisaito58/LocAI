// 店の出品一覧・条件検索
// 候補・価格・数量・順番はアプリが決める。AIはあとから説明を添えるだけ。
// 条件は任意。指定された条件だけを適用し、未指定の条件を「確認済み」として扱わない。
// 申込前の確認（数量・在庫・送料込み総額・地域・日程・回答期限）は orders.ts の quoteInTx で必ず行う。
import type { DeliveryMethod, PaymentMethod, PaymentTiming } from "@/generated/prisma/enums";
import { fairOrder } from "./ordering";
import { expireDueOrders } from "./orders";
import { findShippingFee } from "./shipping";
import { dbNow, type Db } from "./tx";
import { endOfJstDay, itemSubtotalYen, minDate, smallestAllowedAtLeast } from "./units";

export type ItemMode = "EXACT" | "ALT_OK" | "ANY";
export type SortMode = "fair" | "total" | "deadline" | "saleTarget";

export type SearchParams = {
  itemQuery: string; // 空なら食材を問わない
  itemMode: ItemMode;
  quantityGrams?: number;
  budgetYen?: number; // 数量があるときだけ使える（総額を計算できないため）
  useDate?: string; // YYYY-MM-DD
  deliveryMethod: DeliveryMethod | "ANY";
  purchaseConfirmByAt?: Date;
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
  farmMapVisible: boolean; // 地図に「市区町村のおおよその位置」で表示してよいか（農家の設定）
  responseGuide: string | null;
  itemName: string;
  description: string | null;
  selfDeclaredFeatures: string | null;
  sizeLabel: string | null;
  unitPriceYenPerKg: number;
  minOrderGrams: number;
  orderStepGrams: number;
  availableGrams: number;
  purchaseGrams: number | null; // 数量未指定なら null（未計算）
  itemSubtotalYen: number | null;
  shippingFeeYen: number | null; // null は送料未設定、または未計算
  totalYen: number | null;
  priced: boolean; // 数量が指定され、送料込み総額を計算できたか
  deliveryMethod: DeliveryMethod;
  paymentTiming: PaymentTiming;
  paymentMethod: PaymentMethod;
  firstSlotAt: Date;
  acceptDeadlineAt: Date;
  orderDeadlineAt: Date; // いま申し込んだ場合の回答期限（確定希望時刻が未指定なら、それを考慮していない）
  earlySale: boolean;
  saleTargetAt: Date | null;
  saleTargetReachable: boolean; // いま申し込めば、回答猶予を含めて販売希望期限までに合意できる見込みがある
  photoUrl: string | null;
  isNewFarmer: boolean;
  isRepeat: boolean;
};

export type SearchResult = {
  now: Date;
  openCount: number; // 条件に関係なく、いま受付中で残りがある出品の数
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

// 早めに販売したい野菜：いま申し込めば、回答猶予を含めて販売希望期限までに合意できる見込みがあるか
export function isSaleTargetReachable(l: { earlySale: boolean; saleTargetAt: Date | null; responseGraceMinutes: number }, now: Date) {
  return Boolean(l.earlySale && l.saleTargetAt && now.getTime() + l.responseGraceMinutes * 60_000 <= l.saleTargetAt.getTime());
}

export async function searchListings(db: Db, restaurantUserId: string, p: SearchParams): Promise<SearchResult> {
  const restaurant = await db.restaurantProfile.findUniqueOrThrow({ where: { userId: restaurantUserId } });
  const now = await dbNow(db);
  const useDateEnd = p.useDate ? endOfJstDay(p.useDate) : null;
  const q = p.quantityGrams ?? null;
  const itemQuery = p.itemQuery.trim();
  const mode: ItemMode = itemQuery ? p.itemMode : "ANY";

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
      farmer: {
        select: { id: true, farmName: true, city: true, prefecture: true, mapVisible: true, responseGuide: true, user: { select: { createdAt: true } } },
      },
      photos: { orderBy: [{ publishRound: "desc" }, { createdAt: "asc" }], take: 1, select: { url: true } },
      deliveryOptions: {
        where: { active: true, ...(p.deliveryMethod !== "ANY" && { method: p.deliveryMethod }) },
        include: {
          shippingRates: { where: { prefecture: restaurant.prefecture } },
          scheduleSlots: { where: { startsAt: { gt: now, ...(useDateEnd && { lt: useDateEnd }) } }, orderBy: { startsAt: "asc" } },
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

  const result: SearchResult = {
    now,
    openCount: 0,
    normal: [],
    extra: [],
    unsetShipping: [],
    alternatives: [],
    prefecture: restaurant.prefecture,
  };

  for (const l of rows) {
    const available = l.totalGrams - l.soldGrams - l.heldGrams;
    const graceEnd = new Date(now.getTime() + l.responseGraceMinutes * 60_000);
    // 申し込める出品だけを数える（残りが最低量以上、回答猶予が回答の最終期限に収まる）
    if (available < l.minOrderGrams || graceEnd > l.responseDeadlineAt) continue;
    result.openCount++;

    // 仕入れ確定希望時刻を指定した場合：回答猶予の全時間がその時刻に収まること
    if (p.purchaseConfirmByAt && graceEnd > p.purchaseConfirmByAt) continue;

    const matches = mode === "ANY" || itemMatches(l.itemName, itemQuery);
    if (!matches && mode !== "ALT_OK") continue;

    // 数量を指定した場合だけ、購入量・在庫・追加量を確認する
    let purchase: number | null = null;
    let isExtra = false;
    if (q !== null) {
      purchase = smallestAllowedAtLeast(q, l.minOrderGrams, l.orderStepGrams);
      if (purchase > available) continue;
      isExtra = purchase > q;
      if (isExtra && (!matches || p.extraGrams <= 0 || purchase - q > p.extraGrams)) continue;
    }

    // 受け渡し方法ごとに、空きのある日程（使用日を指定した場合はそれ以前）と送料を確認する
    let best: { option: (typeof l.deliveryOptions)[number]; fee: number | null; firstSlot: Date } | null = null;
    for (const o of l.deliveryOptions) {
      const slot = o.scheduleSlots.find((s) => s.capacity === null || s.usedCount < s.capacity);
      if (!slot) continue;
      const fee = purchase === null ? null : findShippingFee(o.shippingRates, restaurant.prefecture, purchase);
      const better =
        !best ||
        (fee !== null && best.fee === null) ||
        (fee !== null && best.fee !== null && fee < best.fee) ||
        (fee === null && best.fee === null && slot.startsAt < best.firstSlot);
      if (better) best = { option: o, fee, firstSlot: slot.startsAt };
    }
    if (!best) continue;

    const subtotal = purchase === null ? null : itemSubtotalYen(l.unitPriceYenPerKg, purchase);
    const total = subtotal !== null && best.fee !== null ? subtotal + best.fee : null;
    if (total !== null && p.budgetYen !== undefined && total > p.budgetYen) continue;

    const c: Candidate = {
      listingId: l.id,
      farmerId: l.farmer.id,
      farmName: l.farmer.farmName,
      farmCity: l.farmer.city,
      farmPrefecture: l.farmer.prefecture,
      farmMapVisible: l.farmer.mapVisible,
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
      priced: total !== null,
      deliveryMethod: best.option.method,
      paymentTiming: best.option.paymentTiming,
      paymentMethod: best.option.paymentMethod,
      firstSlotAt: best.firstSlot,
      acceptDeadlineAt: l.acceptDeadlineAt,
      orderDeadlineAt: minDate(graceEnd, l.responseDeadlineAt, ...(p.purchaseConfirmByAt ? [p.purchaseConfirmByAt] : [])),
      earlySale: l.earlySale,
      saleTargetAt: l.saleTargetAt,
      saleTargetReachable: isSaleTargetReachable(l, now),
      photoUrl: l.photos[0]?.url ?? null,
      isNewFarmer: l.farmer.user.createdAt > newSince,
      isRepeat: repeatFarmers.has(l.farmer.id),
    };

    if (purchase !== null && total === null) {
      // 数量はあるのに送料が登録されていない：通常候補にせず、相談の枠だけ
      if (p.showUnsetShipping && matches) result.unsetShipping.push(c);
    } else if (!matches) {
      result.alternatives.push(c);
    } else if (isExtra) {
      result.extra.push(c);
    } else {
      result.normal.push(c);
    }
  }

  const fair = (list: Candidate[]) => fairOrder(list.map((c) => ({ ...c, id: c.listingId })), p.seed);
  const sortList = (list: Candidate[]) => {
    if (p.sort === "total" && q !== null) {
      return [...list].sort((a, b) => a.totalYen! - b.totalYen! || a.listingId.localeCompare(b.listingId));
    }
    if (p.sort === "deadline") {
      return [...list].sort(
        (a, b) => a.acceptDeadlineAt.getTime() - b.acceptDeadlineAt.getTime() || a.listingId.localeCompare(b.listingId),
      );
    }
    if (p.sort === "saleTarget") {
      // 早めに販売したい（合意の見込みあり）出品を販売希望期限の早い順に。残りはおすすめ順でその後ろ
      const targets = list
        .filter((c) => c.saleTargetReachable)
        .sort((a, b) => a.saleTargetAt!.getTime() - b.saleTargetAt!.getTime() || a.listingId.localeCompare(b.listingId));
      return [...targets, ...fair(list.filter((c) => !c.saleTargetReachable))];
    }
    return fair(list);
  };
  result.normal = sortList(result.normal);
  result.extra = sortList(result.extra);
  result.alternatives = fair(result.alternatives).slice(0, 6);
  result.unsetShipping = fair(result.unsetShipping);
  return result;
}

// 「早めに販売したい野菜」の紹介枠：同じ農家は1件まで、最大 limit 件
export function pickEarlySale(candidates: Candidate[], seed: string, limit = 4): Candidate[] {
  const eligible = candidates.filter((c) => c.saleTargetReachable);
  const seen = new Set<string>();
  const picked: Candidate[] = [];
  for (const c of fairOrder(eligible.map((x) => ({ ...x, id: x.listingId })), seed)) {
    if (seen.has(c.farmerId)) continue;
    seen.add(c.farmerId);
    picked.push(c);
    if (picked.length >= limit) break;
  }
  return picked.sort((a, b) => a.saleTargetAt!.getTime() - b.saleTargetAt!.getTime());
}
