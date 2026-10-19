// 検索条件（URLのクエリ）の入力ルール
// 見るための条件はすべて任意。指定された値だけを検証して適用する。
// 申し込みに必要な条件（数量・使用日・仕入れ確定希望時刻など）は、出品の詳細画面で必ず確認する。
import { z } from "zod";
import type { SearchParams } from "@/lib/domain/search";
import { jstLocalToDate, kgTextToGrams, LIMITS } from "@/lib/domain/units";

export const ITEM_MODE_LABELS = {
  EXACT: "指定",
  ALT_OK: "代替も可",
  ANY: "種類を問わない",
} as const;

export const SORT_LABELS = {
  fair: "🌱 おすすめ順（公平に混ぜる）",
  total: "💴 送料込み総額順",
  deadline: "⏰ 受付期限が近い順",
  saleTarget: "⏳ 販売希望期限が近い順",
} as const;

const optText = (max: number, label: string) => z.string().trim().max(max, `${label}は${max}文字以内で入力してください`).optional();

const searchQuerySchema = z.object({
  item: optText(50, "食材").default(""),
  mode: z.enum(["EXACT", "ALT_OK", "ANY"]).default("EXACT"),
  qty: z.string().trim().optional(),
  budget: z.string().trim().optional(),
  use: z.string().trim().optional(),
  by: z.string().trim().optional(),
  method: z.enum(["ANY", "SHIPPING", "HAND_DELIVERY", "PICKUP"]).default("ANY"),
  purpose: optText(200, "用途"),
  extra: z.string().trim().optional(),
  unset: z.enum(["1"]).optional(),
  sort: z.enum(["fair", "total", "deadline", "saleTarget"]).default("fair"),
  seed: z.string().regex(/^[a-z0-9]{4,16}$/).default("default"),
  page: z.coerce.number().int().min(1).max(100).default(1),
});

export type ParsedSearch = {
  params: SearchParams;
  page: number;
  raw: Record<string, string>;
  hasConditions: boolean; // 食材や詳しい条件が1つでも指定されたか
  notices: string[]; // 指定されたが、そのままでは適用できない条件の説明
};

export function parseSearchQuery(query: Record<string, string | string[] | undefined>): ParsedSearch | { errors: string[] } {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(query)) if (typeof v === "string") flat[k] = v;
  const parsed = searchQuerySchema.safeParse(flat);
  if (!parsed.success) return { errors: [...new Set(parsed.error.issues.map((i) => i.message))] };
  const d = parsed.data;
  const errors: string[] = [];
  const notices: string[] = [];

  let grams: number | undefined;
  if (d.qty) {
    const g = kgTextToGrams(d.qty);
    if (g === null) errors.push("希望数量はkgで、小数3桁までの数字で入力してください");
    else if (g < LIMITS.minQuantityGrams || g > LIMITS.maxQuantityGrams) errors.push("希望数量は0.5〜1,000kgにしてください");
    else grams = g;
  }
  let budget: number | undefined;
  if (d.budget) {
    const b = Number(d.budget.replace(/,/g, ""));
    if (!Number.isInteger(b) || b < LIMITS.minYen || b > LIMITS.maxYen) errors.push("送料込み予算は1〜100,000円の整数で入力してください");
    else budget = b;
  }
  // 総額は数量がないと計算できないので、予算だけ指定された場合は黙って無視せず案内する
  if (budget !== undefined && !d.qty) {
    errors.push("送料込み予算で絞り込むには、希望数量も入力してください（数量がないと総額を計算できません）");
  }
  if (d.use && !/^\d{4}-\d{2}-\d{2}$/.test(d.use)) errors.push("使用日の形式が正しくありません");
  let by: Date | undefined;
  if (d.by) {
    const t = jstLocalToDate(d.by);
    if (!t) errors.push("仕入れ確定希望時刻の形式が正しくありません");
    else by = t;
  }
  let extraGrams = 0;
  if (d.extra) {
    const e = kgTextToGrams(d.extra);
    if (e === null || e > 100_000) errors.push("追加許容量は100kg以下の数字で入力してください");
    else if (!d.qty) errors.push("「希望より多い候補」を見るには、希望数量を入力してください");
    else extraGrams = e;
  }
  if (d.sort === "total" && !d.qty) {
    notices.push("送料込み総額順にするには、詳しい条件で「希望数量」を入力してください。いまはおすすめ順で表示しています。");
  }
  if (errors.length) return { errors };

  const hasConditions = Boolean(d.item || d.qty || d.budget || d.use || d.by || d.method !== "ANY" || d.purpose);
  return {
    page: d.page,
    raw: flat,
    hasConditions,
    notices,
    params: {
      itemQuery: d.item,
      itemMode: d.item ? d.mode : "ANY",
      quantityGrams: grams,
      budgetYen: budget,
      useDate: d.use || undefined,
      deliveryMethod: d.method,
      purchaseConfirmByAt: by,
      purpose: d.purpose || undefined,
      extraGrams,
      showUnsetShipping: d.unset === "1",
      sort: d.sort === "total" && !d.qty ? "fair" : d.sort,
      seed: d.seed,
    },
  };
}

// 同じ検索のまま一部だけ変えたURL
export function searchHref(raw: Record<string, string>, patch: Record<string, string | null>, path = "/shop/search") {
  const sp = new URLSearchParams(raw);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) sp.delete(k);
    else sp.set(k, v);
  }
  return `${path}?${sp.toString()}`;
}

// 並び順のシード（検索をやり直すたびに新しくする）
export function newSeed() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}
