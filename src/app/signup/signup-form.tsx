"use client";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { signUp } from "@/app/auth-actions";
import { FieldError, FormMessage, inputClass, labelClass, submitClass } from "@/app/form-parts";
import { ROLE_LABELS } from "@/lib/validation/auth";

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUp, undefined);
  const errors = state?.fieldErrors;
  const preset = useSearchParams().get("role");

  return (
    <form action={action} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className={labelClass}>登録する立場</legend>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(ROLE_LABELS) as (keyof typeof ROLE_LABELS)[]).map((role) => (
            <label
              key={role}
              className="flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-green-100 bg-white p-3 font-bold has-checked:border-leaf has-checked:bg-leaf-light"
            >
              <span className="text-3xl" aria-hidden>
                {role === "FARMER" ? "👩‍🌾" : "🏮"}
              </span>
              <span>
                <input type="radio" name="role" value={role} required defaultChecked={preset === role} className="mr-1 accent-green-700" />
                {ROLE_LABELS[role]}
              </span>
            </label>
          ))}
        </div>
        <p className="hint">
          購入者は飲食店のみです。両方の立場で使う場合は、別のアカウントを作ってください。
        </p>
        <FieldError errors={errors?.role} />
      </fieldset>

      <label className="flex flex-col gap-1">
        <span className={labelClass}>名前（店名・農園名でも可）</span>
        <input name="name" type="text" required maxLength={50} className={inputClass} />
        <FieldError errors={errors?.name} />
      </label>

      <label className="flex flex-col gap-1">
        <span className={labelClass}>メールアドレス</span>
        <input name="email" type="email" required autoComplete="email" className={inputClass} />
        <FieldError errors={errors?.email} />
      </label>

      <label className="flex flex-col gap-1">
        <span className={labelClass}>パスワード（8文字以上）</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          className={inputClass}
        />
        <FieldError errors={errors?.password} />
      </label>

      <FormMessage message={state?.message} />

      <button type="submit" disabled={pending} className={submitClass}>
        {pending ? "登録しています…" : "登録する"}
      </button>
    </form>
  );
}
