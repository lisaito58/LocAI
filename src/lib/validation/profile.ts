// プロフィールの入力ルール
import { z } from "zod";
import { isValidCity } from "@/lib/data/municipalities";
import { blankToUndefined, SERVICE_AREA_LABEL, SERVICE_PREFECTURES } from "./listing";
import { checkPhone } from "./phone";
import { checkPostal } from "./postal";

const required = (label: string, max: number) =>
  z.string().trim().min(1, `${label}を入力してください`).max(max, `${label}は${max}文字以内で入力してください`);
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max}文字以内で入力してください`)
    .optional()
    .transform((v) => (v ? v : null));

const base = {
  // 郵便番号は任意。入っていれば整えてから保存する（住所の実在確認ではない）
  postalCode: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v || !v.trim()) return null;
      const r = checkPostal(v);
      if (!r.ok) {
        ctx.addIssue({ code: "custom", message: r.message });
        return z.NEVER;
      }
      return r.display;
    }),
  prefecture: z.enum(SERVICE_PREFECTURES, `都道府県は${SERVICE_AREA_LABEL}から選んでください`),
  city: z.string().trim().min(1, "市区町村を選んでください"),
  town: optional(50),
  addressLine: required("番地など、住所の続き", 100),
  building: optional(100),
  contactPhone: z.string().transform((v, ctx) => {
    const r = checkPhone(v);
    if (!r.ok) {
      ctx.addIssue({ code: "custom", message: r.message });
      return z.NEVER;
    }
    return r.value;
  }),
};

// 市区町村は、選んだ都道府県の一覧にあるものだけ受け付ける
const cityMatchesPrefecture = (v: { prefecture: string; city: string }, ctx: z.RefinementCtx) => {
  if (v.city && !isValidCity(v.prefecture, v.city)) {
    ctx.addIssue({ code: "custom", path: ["city"], message: "市区町村を、選んだ都道府県の一覧から選び直してください" });
  }
};

export const restaurantProfileSchema = z
  .object({
    shopName: required("店名", 50),
    ...base,
  })
  .superRefine(cityMatchesPrefecture);

export const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"] as const;

export const farmerProfileSchema = z.object({
  farmName: required("農園名", 50),
  ...base,
  mainItems: optional(100),
  commitment: optional(300),
  introduction: optional(500),
  responseGuide: optional(50),
  availableWeekdays: z.array(z.enum(WEEKDAYS)).max(7),
  mapVisible: z.preprocess((v) => v === "on", z.boolean()),
  trialDailyLimit: z.preprocess(
    blankToUndefined,
    z.coerce.number("お試しの件数は数字で入力してください").int("お試しの件数は整数で入力してください").min(0).max(100, "お試しの件数は100件以下にしてください").optional(),
  ).transform((v) => v ?? null),
  paymentConfirmGuideHours: z.preprocess(
    blankToUndefined,
    z.coerce
      .number("入金確認目安を数字で入力してください")
      .int("入金確認目安は時間単位の整数で入力してください")
      .min(1, "入金確認目安は1時間以上にしてください")
      .max(336, "入金確認目安は336時間（14日）以内にしてください"),
  ),
}).superRefine(cityMatchesPrefecture);

// AI紹介文の下書きに使う、本人が入力した公開用テキストだけ
export const introDraftSchema = z.object({
  farmName: required("農園名", 50),
  prefecture: z.enum(SERVICE_PREFECTURES, `都道府県は${SERVICE_AREA_LABEL}から選んでください`),
  city: required("市区町村", 30),
  mainItems: required("主な品目", 100),
  commitment: required("栽培のこだわり", 300),
}).superRefine(cityMatchesPrefecture);
