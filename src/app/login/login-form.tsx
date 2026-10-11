"use client";
import { useActionState } from "react";
import { signIn } from "@/app/auth-actions";
import { FieldError, FormMessage, inputClass, labelClass, submitClass } from "@/app/form-parts";

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, undefined);
  const errors = state?.fieldErrors;

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className={labelClass}>メールアドレス</span>
        <input name="email" type="email" required autoComplete="email" className={inputClass} />
        <FieldError errors={errors?.email} />
      </label>

      <label className="flex flex-col gap-1">
        <span className={labelClass}>パスワード</span>
        <input
          name="password"
          type="password"
          required
          maxLength={128}
          autoComplete="current-password"
          className={inputClass}
        />
        <FieldError errors={errors?.password} />
      </label>

      <FormMessage message={state?.message} />

      <button type="submit" disabled={pending} className={submitClass}>
        {pending ? "ログインしています…" : "ログイン"}
      </button>
    </form>
  );
}
