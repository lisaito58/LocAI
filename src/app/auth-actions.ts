"use server";
// 登録・ログイン・ログアウトの処理（サーバー側で実行）
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isAPIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { allowAction } from "@/lib/guard";
import { signInSchema, signUpSchema, type FormState } from "@/lib/validation/auth";

// ログイン・登録の試行回数の制限（総当たり・大量登録への対策）。
// 画面のフォームはサーバーから直接ログイン処理を呼ぶため、ライブラリ標準の回数制限（/api/auth 経由のみ）が効かない。
// 正常な利用では届かない回数にしている。メールアドレスは元に戻せない形（ハッシュ）にしてから記録する。
const TRY_AGAIN_LATER = "試行が続いています。しばらく時間をおいてから、もう一度お試しください。";

function hashKey(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

async function clientIp() {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  // 同じ接続元からの登録は1時間に30件まで（接続元が分からないときは制限しない）
  const ip = await clientIp();
  if (ip && !(await allowAction(hashKey(ip), "signup", 30, 3600))) return { message: TRY_AGAIN_LATER };

  try {
    await auth.api.signUpEmail({ body: parsed.data, headers: await headers() });
  } catch (error) {
    if (isAPIError(error)) {
      // 既存アカウントの有無を詳しく教えない
      return { message: "このメールアドレスでは登録できません。入力内容を確認してください。" };
    }
    throw error;
  }
  // 登録後はまずプロフィールを入力してもらう
  redirect(parsed.data.role === "FARMER" ? "/farm/profile" : "/shop/profile");
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  // 同じメールアドレスへのログインは10分に20回まで
  if (!(await allowAction(hashKey(parsed.data.email.trim().toLowerCase()), "signin", 20, 600))) return { message: TRY_AGAIN_LATER };

  let role: unknown;
  try {
    const result = await auth.api.signInEmail({ body: parsed.data, headers: await headers() });
    role = (result.user as { role?: unknown }).role;
  } catch (error) {
    if (isAPIError(error)) {
      return { message: "メールアドレスまたはパスワードが違います。" };
    }
    throw error;
  }
  redirect(role === "FARMER" ? "/farm" : role === "RESTAURANT" ? "/shop" : "/");
}

export async function signOut() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/");
}
