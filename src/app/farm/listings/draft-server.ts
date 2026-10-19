// 出品フォームの初期値をサーバーで作る（日時は日本時間）
import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { dateToJstDateText, gramsToKgText } from "@/lib/domain/units";
import { newOption, type ListingDraft, type Option } from "./listing-defaults";

function jstAt(now: Date, plusDays: number, hhmm: string) {
  const day = dateToJstDateText(new Date(now.getTime() + plusDays * 86_400_000));
  return `${day}T${hhmm}`;
}

export function blankDraft(now: Date, prefecture: string, confirmHours: number): ListingDraft {
  const option = newOption("SHIPPING", prefecture, String(confirmHours), jstAt(now, 3, "10:00"));
  option.prepayDeadlineAt = jstAt(now, 2, "18:00");
  return {
    itemName: "",
    description: "",
    selfDeclaredFeatures: "",
    sizeLabel: "",
    conditionNote: "",
    unitPriceYenPerKg: "",
    totalKg: "",
    minKg: "1",
    stepKg: "0.5",
    responseGraceHours: "24",
    acceptDeadlineAt: jstAt(now, 1, "18:00"),
    responseDeadlineAt: jstAt(now, 2, "12:00"),
    photoTakenOn: dateToJstDateText(now),
    deliveryOptions: [option],
    earlySale: false,
    saleTargetAt: "",
  };
}

type ListingWithOptions = Prisma.ListingGetPayload<{
  include: { deliveryOptions: { include: { shippingRates: true } } };
}>;

// 複製・再公開：説明・単位・送料表などは引き継ぎ、期限・日程・写真は今回の値を入れ直す
export function draftFromListing(
  l: ListingWithOptions,
  now: Date,
  mode: "copy" | "republish",
  availableGrams: number,
): ListingDraft {
  const base = blankDraft(now, "京都府", 24);
  const options: Option[] = l.deliveryOptions
    .filter((o) => o.active)
    .map((o) => ({
      method: o.method,
      paymentTiming: o.paymentTiming,
      paymentMethod: o.paymentMethod,
      prepayDeadlineAt: o.paymentTiming === "PREPAID" ? jstAt(now, 2, "18:00") : "",
      paymentConfirmGuideHours: String(o.paymentConfirmGuideHours),
      rates: [...o.shippingRates]
        .sort((a, b) => a.prefecture.localeCompare(b.prefecture) || a.minGramsExclusive - b.minGramsExclusive)
        .map((r) => ({
          prefecture: r.prefecture,
          minKg: gramsToKgText(r.minGramsExclusive),
          maxKg: gramsToKgText(r.maxGramsInclusive),
          feeYen: String(r.feeYen),
        })),
      slots: [{ startsAt: jstAt(now, 3, "10:00"), endsAt: "", capacity: "" }],
    }));
  return {
    ...base,
    itemName: l.itemName,
    description: l.description ?? "",
    selfDeclaredFeatures: l.selfDeclaredFeatures ?? "",
    sizeLabel: l.sizeLabel ?? "",
    conditionNote: l.conditionNote ?? "",
    unitPriceYenPerKg: String(l.unitPriceYenPerKg),
    // 複製は別の在庫として新しく入力する。再公開は現在の残りを初期値にする
    totalKg: mode === "republish" ? gramsToKgText(availableGrams) : "",
    minKg: gramsToKgText(l.minOrderGrams),
    stepKg: gramsToKgText(l.orderStepGrams),
    responseGraceHours: String(Math.round(l.responseGraceMinutes / 60)),
    deliveryOptions: options.length ? options : base.deliveryOptions,
  };
}

