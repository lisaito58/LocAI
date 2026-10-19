"use server";
// 出品の作成・再公開・編集・受付終了
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/components/action-button";
import { approveAllPlain } from "@/lib/domain/orders";
import { closeListing, createListing, republishListing, updateListing, type PhotoUpload } from "@/lib/domain/listings";
import { allowAction, RATE_LIMIT_MESSAGE, requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { detectImageType, listingEditSchema, listingSchema, MAX_PHOTO_BYTES } from "@/lib/validation/listing";

export type ListingFormState = { error?: string; fieldErrors?: Record<string, string[] | undefined> } | undefined;

async function readPhoto(formData: FormData): Promise<PhotoUpload | string> {
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return "実物の写真を1枚以上選んでください";
  if (file.size > MAX_PHOTO_BYTES) return "写真は3MB以下にしてください";
  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = detectImageType(bytes);
  if (!contentType) return "写真は JPEG・PNG・WebP のいずれかにしてください";
  return { bytes, contentType };
}

function parsePayload(formData: FormData) {
  try {
    return listingSchema.safeParse(JSON.parse(String(formData.get("payload") ?? "{}")));
  } catch {
    return null;
  }
}

function zodMessages(error: z.ZodError) {
  return [...new Set(error.issues.map((i) => i.message))].join("\n");
}

export async function submitListing(_prev: ListingFormState, formData: FormData): Promise<ListingFormState> {
  const user = await requireUser("FARMER");
  if (!(await allowAction(user.id, "listing-write", 10, 60))) return { error: RATE_LIMIT_MESSAGE };
  const parsed = parsePayload(formData);
  if (!parsed) return { error: "入力を読み取れませんでした。もう一度お試しください" };
  if (!parsed.success) return { error: zodMessages(parsed.error) };
  const photo = await readPhoto(formData);
  if (typeof photo === "string") return { error: photo };

  const mode = String(formData.get("mode") ?? "new");
  const sourceId = String(formData.get("sourceId") ?? "") || undefined;

  if (mode === "republish" && sourceId) {
    const r = await republishListing(prisma, { farmerUserId: user.id, listingId: sourceId, data: parsed.data, photo });
    if (!r.ok) return { error: r.error };
    redirect(`/farm/listings/${sourceId}?done=republished`);
  }
  const r = await createListing(prisma, {
    farmerUserId: user.id,
    data: parsed.data,
    photo,
    copiedFromListingId: mode === "copy" ? sourceId : undefined,
  });
  if (!r.ok) return { error: r.error };
  redirect(`/farm/listings/${r.listingId}?done=created`);
}

export async function editListing(listingId: string, _prev: ListingFormState, formData: FormData): Promise<ListingFormState> {
  const user = await requireUser("FARMER");
  const parsed = listingEditSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const r = await updateListing(prisma, {
    farmerUserId: user.id,
    listingId,
    unitPriceYenPerKg: parsed.data.unitPriceYenPerKg,
    totalGrams: parsed.data.totalKg,
    description: parsed.data.description,
    selfDeclaredFeatures: parsed.data.selfDeclaredFeatures,
    conditionNote: parsed.data.conditionNote,
    // 「早めに販売したい」の欄があるフォームから送られたときだけ変更する（ほかの編集で勝手に外さない）
    earlySale: formData.has("earlySaleSection") ? parsed.data.earlySale : undefined,
    saleTargetAt: parsed.data.saleTargetAt,
  });
  if (!r.ok) return { error: r.error };
  refresh();
  return {};
}

export async function closeListingAction(listingId: string): Promise<ActionResult> {
  const user = await requireUser("FARMER");
  const r = await closeListing(prisma, { farmerUserId: user.id, listingId });
  refresh();
  return r.ok ? { ok: true, message: "新しい申込の受付を終了しました" } : r;
}

export async function approveAllAction(listingId: string): Promise<ActionResult> {
  const user = await requireUser("FARMER");
  if (!(await allowAction(user.id, "order-write", 30, 60))) return { ok: false, error: RATE_LIMIT_MESSAGE };
  const results = await approveAllPlain(prisma, { listingId, farmerUserId: user.id });
  refresh();
  if (results.length === 0) return { ok: false, error: "条件どおりで承認できる回答待ちの注文はありません" };
  const okCount = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).map((r) => `・${r.shopName}：${r.error}`);
  if (failed.length) return { ok: false, error: `${okCount}件を承認しました。承認できなかった注文：\n${failed.join("\n")}` };
  return { ok: true, message: `${okCount}件を承認しました` };
}

// 販売条件の見直し（単価・早めに販売したい）。値下げは任意で、自動では行わない。
// 変更は新しい申し込みにだけ使う（既存の購入希望・確定注文は申込時の条件のまま）。
const reviewSchema = z.object({
  unitPriceYenPerKg: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce.number("単価を数字で入力してください").int("単価は円の整数で入力してください").min(1, "単価は1円以上にしてください").max(100_000, "単価は100,000円以下にしてください"),
  ),
  earlySale: z.preprocess((v) => v === "on", z.boolean()),
  saleTargetAt: z.string().optional(),
});

export async function reviewSalesTermsAction(listingId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser("FARMER");
  if (!(await allowAction(user.id, "listing-write", 10, 60))) return { ok: false, error: RATE_LIMIT_MESSAGE };
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const current = await prisma.listing.findFirst({ where: { id: listingId, farmer: { userId: user.id } } });
  if (!current) return { ok: false, error: "出品が見つかりません" };
  const r = await updateListing(prisma, {
    farmerUserId: user.id,
    listingId,
    unitPriceYenPerKg: parsed.data.unitPriceYenPerKg,
    totalGrams: current.totalGrams,
    description: current.description ?? undefined,
    selfDeclaredFeatures: current.selfDeclaredFeatures ?? undefined,
    conditionNote: current.conditionNote ?? undefined,
    earlySale: parsed.data.earlySale,
    saleTargetAt: parsed.data.saleTargetAt,
  });
  refresh();
  return r.ok ? { ok: true, message: "販売条件を更新しました。新しい申し込みから使われます" } : r;
}
