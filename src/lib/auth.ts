// ログインの設定（サーバー側専用）
import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/prisma";

// 初期版のロールは飲食店・農家だけ（一般消費者は作らない）
const ROLES = ["RESTAURANT", "FARMER"] as const;

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      // 登録時に本人が選ぶ。登録後は変更させない（下の hooks で拒否する）
      role: {
        type: [...ROLES],
        required: true,
        input: true,
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email") {
        const role = ctx.body?.role;
        if (!ROLES.includes(role)) {
          throw new APIError("BAD_REQUEST", { message: "ロールが正しくありません" });
        }
      }
      if (ctx.path === "/update-user" && ctx.body && "role" in ctx.body) {
        throw new APIError("BAD_REQUEST", { message: "ロールは変更できません" });
      }
    }),
  },
  telemetry: { enabled: false },
  // nextCookies はサーバーアクションからCookieを設定するため。必ず最後に置く
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
