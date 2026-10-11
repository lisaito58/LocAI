// 登録・ログインの入力ルール（サーバーで必ず検証する）
import { z } from "zod";

export const ROLE_LABELS = {
  RESTAURANT: "飲食店",
  FARMER: "農家",
} as const;

export const signUpSchema = z.object({
  name: z.string().trim().min(1, "名前を入力してください").max(50, "名前は50文字以内で入力してください"),
  email: z.email("メールアドレスの形式が正しくありません").max(254),
  password: z
    .string()
    .min(8, "パスワードは8文字以上にしてください")
    .max(128, "パスワードは128文字以内にしてください"),
  role: z.enum(["RESTAURANT", "FARMER"], "登録する立場を選んでください"),
});

export const signInSchema = z.object({
  email: z.email("メールアドレスの形式が正しくありません").max(254),
  password: z.string().min(1, "パスワードを入力してください").max(128),
});

export type FormState =
  | {
      message?: string;
      fieldErrors?: Record<string, string[] | undefined>;
    }
  | undefined;
