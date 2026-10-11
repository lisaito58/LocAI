// 出品フォームの型と初期値（サーバー・ブラウザの両方で使う）
import { DELIVERY_METHOD_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_TIMING_LABELS } from "@/lib/validation/listing";

export type Method = keyof typeof DELIVERY_METHOD_LABELS;
export type Rate = { prefecture: string; minKg: string; maxKg: string; feeYen: string };
export type Slot = { startsAt: string; endsAt: string; capacity: string };
export type Option = {
  method: Method;
  paymentTiming: keyof typeof PAYMENT_TIMING_LABELS;
  paymentMethod: keyof typeof PAYMENT_METHOD_LABELS;
  prepayDeadlineAt: string;
  paymentConfirmGuideHours: string;
  rates: Rate[];
  slots: Slot[];
};
export type ListingDraft = {
  itemName: string;
  description: string;
  selfDeclaredFeatures: string;
  sizeLabel: string;
  conditionNote: string;
  unitPriceYenPerKg: string;
  totalKg: string;
  minKg: string;
  stepKg: string;
  responseGraceHours: string;
  acceptDeadlineAt: string;
  responseDeadlineAt: string;
  photoTakenOn: string;
  deliveryOptions: Option[];
};

export type ListingFormProps = {
  mode: "new" | "copy" | "republish";
  sourceId?: string;
  initial: ListingDraft;
  farmPrefecture: string;
  currentAvailableKg?: string;
};

export const METHOD_EMOJI: Record<Method, string> = { SHIPPING: "📦", HAND_DELIVERY: "🚚", PICKUP: "🏡" };

export function newOption(method: Method, prefecture: string, confirmHours: string, slotAt: string): Option {
  return {
    method,
    paymentTiming: method === "SHIPPING" ? "PREPAID" : "ON_HANDOVER",
    paymentMethod: method === "SHIPPING" ? "BANK_TRANSFER" : "CASH",
    prepayDeadlineAt: "",
    paymentConfirmGuideHours: confirmHours,
    rates:
      method === "PICKUP"
        ? [{ prefecture, minKg: "0", maxKg: "1000", feeYen: "0" }]
        : [
            { prefecture, minKg: "0", maxKg: "2", feeYen: "800" },
            { prefecture, minKg: "2", maxKg: "5", feeYen: "1000" },
            { prefecture, minKg: "5", maxKg: "10", feeYen: "1300" },
          ],
    slots: [{ startsAt: slotAt, endsAt: "", capacity: "" }],
  };
}

