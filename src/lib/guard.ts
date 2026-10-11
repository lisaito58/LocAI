// サーバーアクション・ページで使う認証・ロール確認と連続操作の制限（サーバー側専用）
import "server-only";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, type CurrentUser } from "@/lib/session";

export async function requireUser(role?: CurrentUser["role"]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (role && user.role !== role) redirect("/");
  return user;
}

export async function requireRestaurant() {
  const user = await requireUser("RESTAURANT");
  const profile = await prisma.restaurantProfile.findUnique({ where: { userId: user.id } });
  return { user, profile };
}

export async function requireFarmer() {
  const user = await requireUser("FARMER");
  const profile = await prisma.farmerProfile.findUnique({ where: { userId: user.id } });
  return { user, profile };
}

// 同じ人が短時間に同じ操作を繰り返したら false（DBで数えるので、サーバーが複数台でも効く）
export async function allowAction(userId: string, action: string, limit: number, windowSeconds: number) {
  const key = `${action}:${userId}`;
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "windowStart", "count") VALUES (${key}, now(), 1)
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."windowStart" < now() - make_interval(secs => ${windowSeconds}) THEN 1 ELSE "RateLimit"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimit"."windowStart" < now() - make_interval(secs => ${windowSeconds}) THEN now() ELSE "RateLimit"."windowStart" END
    RETURNING "count"`;
  return rows[0].count <= limit;
}

export const RATE_LIMIT_MESSAGE = "操作が続いています。少し時間をおいてからもう一度お試しください。";
