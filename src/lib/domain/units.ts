// 数量・金額・日時の共通ルール
// 入力・表示は kg（小数3桁まで）、内部は g の整数。金額は円の整数、単価は円/kg。
// 表示は日本時間、保存はUTC。

export const LIMITS = {
  minQuantityGrams: 500, // 0.5kg
  maxQuantityGrams: 1_000_000, // 1,000kg
  minYen: 1,
  maxYen: 100_000,
  maxTextLength: 500,
} as const;

// "1.5" → 1500。小数4桁以上や数値でない文字は null
export function kgTextToGrams(text: string): number | null {
  const t = text.trim();
  if (!/^\d+(\.\d{1,3})?$/.test(t)) return null;
  const [whole, frac = ""] = t.split(".");
  return Number(whole) * 1000 + Number(frac.padEnd(3, "0"));
}

// 1500 → "1.5"
export function gramsToKgText(grams: number): string {
  const whole = Math.floor(grams / 1000);
  const frac = String(grams % 1000).padStart(3, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : String(whole);
}

export function formatKg(grams: number): string {
  return `${gramsToKgText(grams)}kg`;
}

export function formatYen(yen: number): string {
  return `${yen.toLocaleString("ja-JP")}円`;
}

// 商品代 = 単価円/kg × 数量g ÷ 1000（商品代全体で1円未満切り捨て）
export function itemSubtotalYen(unitPriceYenPerKg: number, grams: number): number {
  return Math.floor((unitPriceYenPerKg * grams) / 1000);
}

// 許可量 = 最低量 + 注文単位 × 0以上の整数
export function isAllowedQuantity(grams: number, minGrams: number, stepGrams: number): boolean {
  return grams >= minGrams && (grams - minGrams) % stepGrams === 0;
}

// 希望量以上で、最低量・単位に合う最小の量
export function smallestAllowedAtLeast(grams: number, minGrams: number, stepGrams: number): number {
  if (grams <= minGrams) return minGrams;
  return minGrams + Math.ceil((grams - minGrams) / stepGrams) * stepGrams;
}

// ---- 日時（日本時間 ⇔ UTC） ----

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

// "2026-10-12T18:00"（日本時間）→ Date(UTC)
export function jstLocalToDate(text: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) return null;
  const d = new Date(`${text}:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// "2026-10-12"（日本時間の日付）→ その日の 0:00 JST の Date
export function jstDateToDate(text: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const d = new Date(`${text}T00:00:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// DBの @db.Date（UTCの0時で保存）⇔ "YYYY-MM-DD"
export function dateOnlyToText(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function textToDateOnly(text: string): Date {
  return new Date(`${text}T00:00:00Z`);
}

// 使用日（YYYY-MM-DD）の終わり＝翌日 0:00 JST。受け渡し日時はこれより前
export function endOfJstDay(dateText: string): Date {
  const start = jstDateToDate(dateText)!;
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

// Date → "2026-10-12T18:00"（datetime-local 入力用、日本時間）
export function dateToJstLocal(d: Date): string {
  return new Date(d.getTime() + JST_OFFSET_MS).toISOString().slice(0, 16);
}

// Date → "YYYY-MM-DD"（日本時間）
export function dateToJstDateText(d: Date): string {
  return new Date(d.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

const jstFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const jstDateFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  weekday: "short",
});

// 「10/12(日) 18:00」
export function formatJst(d: Date): string {
  return jstFormatter.format(d);
}
export function formatJstDate(d: Date): string {
  return jstDateFormatter.format(d);
}
// @db.Date の値（UTC 0時）を日付として表示
export function formatDateOnly(d: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "UTC",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(d);
}

export function minDate(...dates: Date[]): Date {
  return new Date(Math.min(...dates.map((d) => d.getTime())));
}
