"use server";
// 初回の使い方案内を「見た」と記録する（完了・スキップのどちらでも、次回から自動表示しない）
import { refresh } from "next/cache";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

export async function completeOnboarding() {
  const user = await requireUser();
  await prisma.user.updateMany({ where: { id: user.id, onboardedAt: null }, data: { onboardedAt: new Date() } });
  refresh();
}
