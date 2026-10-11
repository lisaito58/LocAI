// 画面表示用の名前（ブラウザ側でも使えるよう、DB処理と分けておく）
import type { OrderStatus, PaymentRecordStatus } from "@/generated/prisma/enums";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  AWAITING_RESPONSE: "回答待ち",
  AWAITING_REAGREEMENT: "条件変更の確認待ち",
  CONFIRMED: "販売確定",
  DECLINED: "見送り",
  CANCELLED: "取消",
  EXPIRED: "期限切れ",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentRecordStatus, string> = {
  AWAITING_PAYMENT: "支払い待ち",
  BUYER_REPORTED: "支払ったと申告・確認待ち",
  FARMER_CONFIRMED: "入金確認済み／代金受取済み",
};
