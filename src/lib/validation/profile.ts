// プロフィールの入力ルール
import { z } from "zod";
import { blankToUndefined, PREFECTURES } from "./listing";

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
  prefecture: z.enum(PREFECTURES, "都道府県を選んでください"),
  city: required("市区町村", 30),
  addressLine: required("詳細住所", 100),
  contactPhone: z
    .string()
    .trim()
    .regex(/^[0-9-]{10,13}$/, "電話番号は数字とハイフンで入力してください"),
};

export const restaurantProfileSchema = z.object({
  shopName: required("店名", 50),
  ...base,
});

export const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"] as const;

export const farmerProfileSchema = z.object({
  farmName: required("農園名", 50),
  ...base,
  mainItems: optional(100),
  commitment: optional(300),
  introduction: optional(500),
  responseGuide: optional(50),
  availableWeekdays: z.array(z.enum(WEEKDAYS)).max(7),
  paymentConfirmGuideHours: z.preprocess(
    blankToUndefined,
    z.coerce
      .number("入金確認目安を数字で入力してください")
      .int("入金確認目安は時間単位の整数で入力してください")
      .min(1, "入金確認目安は1時間以上にしてください")
      .max(336, "入金確認目安は336時間（14日）以内にしてください"),
  ),
});

// AI紹介文の下書きに使う、本人が入力した公開用テキストだけ
export const introDraftSchema = z.object({
  farmName: required("農園名", 50),
  prefecture: z.enum(PREFECTURES, "都道府県を選んでください"),
  city: required("市区町村", 30),
  mainItems: required("主な品目", 100),
  commitment: required("栽培のこだわり", 300),
});
