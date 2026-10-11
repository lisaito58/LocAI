"use server";
// 注文・相談・手動記録の操作。すべて認証・ロール・当事者を確認してから実行する
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/components/action-button";
import {
  approveOrder,
  cancelOrder,
  createOrder,
  declineOrder,
  proposeChange,
  reagreeOrder,
} from "@/lib/domain/orders";
import {
  closeInquiry,
  confirmPayment,
  correctRecord,
  markReceived,
  markSent,
  openInquiry,
  postInquiryMessage,
  postOrderMessage,
  reportPayment,
  setNeedsDiscussion,
  type CorrectionTarget,
} from "@/lib/domain/records";
import type { Result } from "@/lib/domain/tx";
import { jstLocalToDate, kgTextToGrams } from "@/lib/domain/units";
import { allowAction, RATE_LIMIT_MESSAGE, requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { blankToUndefined } from "@/lib/validation/listing";

function done(r: Result, message?: string): ActionResult {
  refresh();
  return r.ok ? { ok: true, message } : { ok: false, error: r.error };
}

async function limited(userId: string) {
  return !(await allowAction(userId, "order-write", 30, 60));
}

// ---- 申込 ----

const orderSchema = z.object({
  listingId: z.string().min(1),
  deliveryOptionId: z.string().min(1, "受け渡し方法を選んでください"),
  scheduleSlotId: z.string().min(1, "受け渡し日程を選んでください"),
  quantityKg: z.string(),
  budgetYen: z.preprocess(blankToUndefined, z.coerce.number("予算を入力してください").int().min(1).max(100_000)),
  useDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "使用日を入力してください"),
  purchaseConfirmByAt: z.string(),
  message: z.string().max(500, "相談文は500文字以内で入力してください").optional(),
  idempotencyKey: z.string().uuid(),
  expectedTotalYen: z.coerce.number().int(),
  inquiryId: z.string().optional(),
  agree: z.literal("on", "内容と期限を確認したら、チェックを入れてください"),
});

export type OrderFormState = { error?: string } | undefined;

export async function submitOrder(_prev: OrderFormState, formData: FormData): Promise<OrderFormState> {
  const user = await requireUser("RESTAURANT");
  if (await limited(user.id)) return { error: RATE_LIMIT_MESSAGE };
  const parsed = orderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const grams = kgTextToGrams(d.quantityKg);
  const confirmBy = jstLocalToDate(d.purchaseConfirmByAt);
  if (grams === null) return { error: "数量はkgで、小数3桁までの数字で入力してください" };
  if (!confirmBy) return { error: "仕入れ確定希望時刻を入力してください" };

  const r = await createOrder(prisma, {
    restaurantUserId: user.id,
    listingId: d.listingId,
    deliveryOptionId: d.deliveryOptionId,
    scheduleSlotId: d.scheduleSlotId,
    quantityGrams: grams,
    budgetYen: d.budgetYen,
    useDate: d.useDate,
    purchaseConfirmByAt: confirmBy,
    message: d.message,
    idempotencyKey: d.idempotencyKey,
    expectedTotalYen: d.expectedTotalYen,
    inquiryId: d.inquiryId || undefined,
  });
  if (!r.ok) return { error: r.error };
  redirect(`/orders/${r.orderId}?done=${r.duplicate ? "duplicate" : "created"}`);
}

// ---- 回答（農家） ----

export async function approveAction(orderId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser("FARMER");
  if (await limited(user.id)) return { ok: false, error: RATE_LIMIT_MESSAGE };
  const r = await approveOrder(prisma, {
    orderId,
    farmerUserId: user.id,
    consultationReviewed: formData.get("consultationReviewed") === "on",
  });
  return done(r, "販売確定しました");
}

export async function declineAction(orderId: string): Promise<ActionResult> {
  const user = await requireUser("FARMER");
  if (await limited(user.id)) return { ok: false, error: RATE_LIMIT_MESSAGE };
  return done(await declineOrder(prisma, { orderId, farmerUserId: user.id }), "見送りました");
}

export async function proposeChangeAction(orderId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser("FARMER");
  if (await limited(user.id)) return { ok: false, error: RATE_LIMIT_MESSAGE };
  const grams = kgTextToGrams(String(formData.get("quantityKg") ?? ""));
  if (grams === null) return { ok: false, error: "数量はkgで、小数3桁までの数字で入力してください" };
  const feeText = String(formData.get("exceptionFeeYen") ?? "").trim();
  const useException = formData.get("useException") === "on";
  if (useException && !/^\d+$/.test(feeText)) return { ok: false, error: "例外送料を円の整数で入力してください" };
  const r = await proposeChange(prisma, {
    orderId,
    farmerUserId: user.id,
    newQuantityGrams: grams,
    newScheduleSlotId: String(formData.get("scheduleSlotId") ?? ""),
    exceptionFeeYen: useException ? Number(feeText) : undefined,
    exceptionReason: useException ? String(formData.get("exceptionReason") ?? "") : undefined,
  });
  return done(r, "条件変更を送りました。店の再同意を待っています");
}

// ---- 店の操作 ----

export async function cancelAction(orderId: string): Promise<ActionResult> {
  const user = await requireUser("RESTAURANT");
  if (await limited(user.id)) return { ok: false, error: RATE_LIMIT_MESSAGE };
  return done(await cancelOrder(prisma, { orderId, restaurantUserId: user.id }), "取り消しました");
}

export async function reagreeAction(orderId: string): Promise<ActionResult> {
  const user = await requireUser("RESTAURANT");
  if (await limited(user.id)) return { ok: false, error: RATE_LIMIT_MESSAGE };
  return done(await reagreeOrder(prisma, { orderId, restaurantUserId: user.id }), "再同意し、販売確定しました");
}

// ---- 確定後の記録 ----

export async function reportPaymentAction(orderId: string): Promise<ActionResult> {
  const user = await requireUser("RESTAURANT");
  if (await limited(user.id)) return { ok: false, error: RATE_LIMIT_MESSAGE };
  return done(await reportPayment(prisma, { orderId, userId: user.id }), "支払ったことを申告しました");
}

export async function confirmPaymentAction(orderId: string): Promise<ActionResult> {
  const user = await requireUser("FARMER");
  if (await limited(user.id)) return { ok: false, error: RATE_LIMIT_MESSAGE };
  return done(await confirmPayment(prisma, { orderId, userId: user.id }), "入金確認を記録しました");
}

export async function markSentAction(orderId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser("FARMER");
  if (await limited(user.id)) return { ok: false, error: RATE_LIMIT_MESSAGE };
  const r = await markSent(prisma, { orderId, userId: user.id, acknowledgeUnpaid: formData.get("acknowledgeUnpaid") === "on" });
  return done(r, "発送・引き渡しを記録しました");
}

export async function markReceivedAction(orderId: string): Promise<ActionResult> {
  const user = await requireUser("RESTAURANT");
  if (await limited(user.id)) return { ok: false, error: RATE_LIMIT_MESSAGE };
  return done(await markReceived(prisma, { orderId, userId: user.id }), "受け取りを記録しました");
}

const TARGETS = ["paymentReport", "paymentConfirm", "sent", "received"] as const;

export async function correctRecordAction(orderId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (await limited(user.id)) return { ok: false, error: RATE_LIMIT_MESSAGE };
  const target = String(formData.get("target"));
  if (!TARGETS.includes(target as CorrectionTarget)) return { ok: false, error: "訂正する記録を選んでください" };
  const r = await correctRecord(prisma, {
    orderId,
    userId: user.id,
    target: target as CorrectionTarget,
    reason: String(formData.get("reason") ?? ""),
  });
  return done(r, "記録を訂正しました（履歴に残ります）");
}

export async function needsDiscussionAction(orderId: string, value: boolean): Promise<ActionResult> {
  const user = await requireUser();
  return done(await setNeedsDiscussion(prisma, { orderId, userId: user.id, value }));
}

// ---- 相談 ----

export async function postOrderMessageAction(orderId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await allowAction(user.id, "message", 20, 60))) return { ok: false, error: RATE_LIMIT_MESSAGE };
  return done(await postOrderMessage(prisma, { orderId, userId: user.id, body: String(formData.get("body") ?? "") }));
}

export async function postInquiryMessageAction(inquiryId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await allowAction(user.id, "message", 20, 60))) return { ok: false, error: RATE_LIMIT_MESSAGE };
  return done(await postInquiryMessage(prisma, { inquiryId, userId: user.id, body: String(formData.get("body") ?? "") }));
}

export async function closeInquiryAction(inquiryId: string): Promise<ActionResult> {
  const user = await requireUser();
  return done(await closeInquiry(prisma, { inquiryId, userId: user.id }), "相談を終了しました");
}

export async function openInquiryAction(listingId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser("RESTAURANT");
  if (!(await allowAction(user.id, "message", 20, 60))) return { ok: false, error: RATE_LIMIT_MESSAGE };
  const r = await openInquiry(prisma, {
    listingId,
    restaurantUserId: user.id,
    primaryOrderId: String(formData.get("primaryOrderId") ?? "") || undefined,
    body: String(formData.get("body") ?? ""),
  });
  if (!r.ok) return { ok: false, error: r.error };
  redirect(`/inquiries/${r.inquiryId}`);
}
