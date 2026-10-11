// 検索条件（URLのクエリ）の入力ルール
import { z } from "zod";
import type { SearchParams } from "@/lib/domain/search";
import { jstLocalToDate, kgTextToGrams, LIMITS } from "@/lib/domain/units";
import { blankToUndefined } from "./listing";

export const ITEM_MODE_LABELS = {
  EXACT: "指定",
  ALT_OK: "代替も可",
  ANY: "種類を問わない",
} as const;

const searchQuerySchema = z
  .object({
    item: z.string().trim().max(50, "食材は50文字以内で入力してください").default(""),
    mode: z.enum(["EXACT", "ALT_OK", "ANY"]).default("EXACT"),
    qty: z.string({ error: "希望数量を入力してください" }),
    budget: z.preprocess(
      blankToUndefined,
      z.coerce
        .number("送料込み予算を入力してください")
        .int("予算は円の整数で入力してください")
        .min(LIMITS.minYen, "予算は1円以上にしてください")
        .max(LIMITS.maxYen, "予算は100,000円以下にしてください"),
    ),
    use: z.string({ error: "使用日を入力してください" }).regex(/^\d{4}-\d{2}-\d{2}$/, "使用日を入力してください"),
    by: z.string({ error: "仕入れ確定希望時刻を入力してください" }),
    method: z.enum(["ANY", "SHIPPING", "HAND_DELIVERY", "PICKUP"]).default("ANY"),
    purpose: z.string().trim().max(200, "用途は200文字以内で入力してください").optional(),
    extra: z.string().optional(),
    unset: z.enum(["1"]).optional(),
    sort: z.enum(["fair", "total", "deadline"]).default("fair"),
    seed: z.string().regex(/^[a-z0-9]{4,16}$/).default("default"),
    page: z.coerce.number().int().min(1).max(100).default(1),
  })
  .refine((v) => v.mode === "ANY" || v.item.length > 0, { message: "食材を入力するか「種類を問わない」を選んでください" });

export type ParsedSearch = { params: SearchParams; page: number; raw: Record<string, string> };

export function parseSearchQuery(query: Record<string, string | string[] | undefined>): ParsedSearch | { errors: string[] } {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(query)) if (typeof v === "string") flat[k] = v;
  const parsed = searchQuerySchema.safeParse(flat);
  if (!parsed.success) return { errors: [...new Set(parsed.error.issues.map((i) => i.message))] };
  const d = parsed.data;
  const errors: string[] = [];
  const grams = kgTextToGrams(d.qty);
  if (grams === null) errors.push("希望数量はkgで、小数3桁までの数字で入力してください");
  else if (grams < LIMITS.minQuantityGrams || grams > LIMITS.maxQuantityGrams) errors.push("希望数量は0.5〜1,000kgにしてください");
  const by = jstLocalToDate(d.by);
  if (!by) errors.push("仕入れ確定希望時刻を入力してください");
  const extraGrams = d.extra ? kgTextToGrams(d.extra) : 0;
  if (extraGrams === null || (extraGrams ?? 0) > 100_000) errors.push("追加許容量は100kg以下の数字で入力してください");
  if (errors.length) return { errors };
  return {
    page: d.page,
    raw: flat,
    params: {
      itemQuery: d.item,
      itemMode: d.mode,
      quantityGrams: grams!,
      budgetYen: d.budget,
      useDate: d.use,
      deliveryMethod: d.method,
      purchaseConfirmByAt: by!,
      purpose: d.purpose || undefined,
      extraGrams: extraGrams ?? 0,
      showUnsetShipping: d.unset === "1",
      sort: d.sort,
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
