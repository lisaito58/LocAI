// 出品の入力ルール（サーバーで必ず検証する）
import { z } from "zod";
import { kgTextToGrams } from "@/lib/domain/units";

export const SIZE_LABELS = ["小さめ", "中くらい", "大きめ", "混在"] as const;

export const DELIVERY_METHOD_LABELS = {
  SHIPPING: "宅配発送",
  HAND_DELIVERY: "農家が配達",
  PICKUP: "店が引き取り",
} as const;

export const PAYMENT_TIMING_LABELS = {
  PREPAID: "前払い",
  ON_HANDOVER: "受け渡し時払い",
} as const;

export const PAYMENT_METHOD_LABELS = {
  BANK_TRANSFER: "銀行振込",
  CASH: "現金",
  CREDIT_CARD: "クレジットカード（アプリ外）",
  PAYPAY: "PayPay（アプリ外）",
} as const;

export const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県",
  "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
  "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県",
  "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
] as const;

export const kgText = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => kgTextToGrams(v) !== null, `${label}はkgで、小数3桁までの数字で入力してください`)
    .transform((v) => kgTextToGrams(v)!);

// 空欄を 0 と扱わない（Number("") は 0 になるため）
export const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const yen = (label: string, min = 0) =>
  z.preprocess(
    blankToUndefined,
    z.coerce
    .number(`${label}を数字で入力してください`)
    .int(`${label}は整数で入力してください`)
    .min(min, `${label}は${min}円以上にしてください`)
    .max(100_000, `${label}は100,000円以下にしてください`),
  );

const localDateTime = (label: string) =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, `${label}を入力してください`);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max}文字以内で入力してください`)
    .optional()
    .transform((v) => (v ? v : undefined));

export const deliveryOptionSchema = z
  .object({
    method: z.enum(["SHIPPING", "HAND_DELIVERY", "PICKUP"], "受け渡し方法を選んでください"),
    paymentTiming: z.enum(["PREPAID", "ON_HANDOVER"], "支払いのタイミングを選んでください"),
    paymentMethod: z.enum(["BANK_TRANSFER", "CASH", "CREDIT_CARD", "PAYPAY"], "支払方法を選んでください"),
    prepayDeadlineAt: z.string().optional(),
    paymentConfirmGuideHours: z.preprocess(
      blankToUndefined,
      z.coerce
        .number("入金確認目安を数字で入力してください")
        .int()
        .min(1, "入金確認目安は1時間以上にしてください")
        .max(336, "入金確認目安は336時間（14日）以内にしてください"),
    ),
    rates: z
      .array(
        z.object({
          prefecture: z.enum(PREFECTURES, "送料の地域を選んでください"),
          minKg: kgText("送料帯の下限"),
          maxKg: kgText("送料帯の上限"),
          feeYen: yen("送料"),
        }),
      )
      .min(1, "送料（無料・引き取りは0円）を1行以上登録してください")
      .max(100),
    slots: z
      .array(
        z.object({
          startsAt: localDateTime("受け渡し日時"),
          endsAt: z.string().optional(),
          capacity: z.union([z.literal(""), z.coerce.number().int().min(1, "受付件数は1件以上にしてください").max(999)]).optional(),
        }),
      )
      .min(1, "受け渡し日程を1つ以上登録してください")
      .max(30),
  })
  .refine((o) => o.paymentTiming !== "PREPAID" || Boolean(o.prepayDeadlineAt), {
    message: "前払いの場合は支払期限を入力してください",
  });

export const listingSchema = z.object({
  itemName: z.string().trim().min(1, "食材名を入力してください").max(50, "食材名は50文字以内で入力してください"),
  description: optionalText(500),
  selfDeclaredFeatures: optionalText(500),
  sizeLabel: z.union([z.enum(SIZE_LABELS), z.literal("")]).optional(),
  conditionNote: optionalText(200),
  unitPriceYenPerKg: yen("単価", 1),
  totalKg: kgText("出品総量"),
  minKg: kgText("最低量"),
  stepKg: kgText("注文単位"),
  responseGraceHours: z.coerce
    .number("回答猶予を数字で入力してください")
    .int("回答猶予は時間単位の整数で入力してください")
    .min(1, "回答猶予は1時間以上にしてください")
    .max(168, "回答猶予は168時間（7日）以内にしてください"),
  acceptDeadlineAt: localDateTime("受付期限"),
  responseDeadlineAt: localDateTime("回答の最終期限"),
  photoTakenOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "写真の撮影日を入力してください"),
  photoSelfTaken: z.literal(true, "「自分で撮った販売する野菜の写真です」を確認してください"),
  deliveryOptions: z.array(deliveryOptionSchema).min(1, "受け渡し方法を1つ以上登録してください").max(3),
});

export type ListingInput = z.infer<typeof listingSchema>;

// 公開後の簡単な編集（価格・説明・総量）。既存注文は申込時の条件を保持する
export const listingEditSchema = z.object({
  unitPriceYenPerKg: yen("単価", 1),
  totalKg: kgText("出品総量"),
  description: optionalText(500),
  selfDeclaredFeatures: optionalText(500),
  conditionNote: optionalText(200),
});

// 写真のファイル検証（種類は中身の先頭バイトで確認する）
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

export function detectImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}
