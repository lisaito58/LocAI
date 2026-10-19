"use server";
// 登録・ログイン・ログアウトの処理（サーバー側で実行）
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isAPIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { signInSchema, signUpSchema, type FormState } from "@/lib/validation/auth";

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
