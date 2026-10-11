"use server";
// プロフィールの保存とAI紹介文の下書き
import { refresh } from "next/cache";
import { z } from "zod";
import { draftIntroduction } from "@/lib/ai/gemini";
import { allowAction, RATE_LIMIT_MESSAGE, requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { farmerProfileSchema, introDraftSchema, restaurantProfileSchema } from "@/lib/validation/profile";
import type { FormState } from "@/lib/validation/auth";

export async function saveRestaurantProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("RESTAURANT");
  const parsed = restaurantProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  await prisma.restaurantProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...parsed.data },
    update: parsed.data,
  });
  refresh();
  return { ok: true, message: "保存しました" };
}

export async function saveFarmerProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("FARMER");
  const parsed = farmerProfileSchema.safeParse({
    ...Object.fromEntries(formData),
    availableWeekdays: formData.getAll("availableWeekdays"),
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const { availableWeekdays, ...rest } = parsed.data;
  const data = { ...rest, availableWeekdays: availableWeekdays.join("・") || null };
  await prisma.farmerProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });
  refresh();
  return { ok: true, message: "保存しました" };
}

export type DraftState = { draft?: string; error?: string } | undefined;

// 本人が入力した公開用テキスト（農園名・地域・品目・こだわり）だけをAIへ送る。
// 住所・連絡先・写真は送らない。下書きは本人が確認・修正してから保存する。
export async function generateIntroDraft(input: {
  farmName: string;
  prefecture: string;
  city: string;
  mainItems: string;
  commitment: string;
}): Promise<DraftState> {
  const user = await requireUser("FARMER");
  const parsed = introDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "農園名・都道府県・市区町村・主な品目・栽培のこだわりを入力してから押してください" };
  }
  if (!(await allowAction(user.id, "ai-intro", 5, 60))) return { error: RATE_LIMIT_MESSAGE };
  const { farmName, prefecture, city, mainItems, commitment } = parsed.data;
  const draft = await draftIntroduction({ farmName, area: `${prefecture}${city}`, mainItems, commitment });
  if (!draft) return { error: "いまはAIの下書きを作れませんでした。紹介文は手で入力して保存できます。" };
  return { draft };
}
