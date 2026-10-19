"use client";
// 電話番号の欄。入力例を最初から表示し、欄を離れたときにサーバーと同じルールで確認する
import { useState } from "react";
import { FieldError } from "@/app/form-parts";
import { ReqMark } from "@/components/fields";
import { checkPhone, PHONE_HINT } from "@/lib/validation/phone";

export function PhoneField({ label, defaultValue, serverErrors }: { label: string; defaultValue?: string; serverErrors?: string[] }) {
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const shown = touched ? (error ? [error] : undefined) : serverErrors;
  return (
    <label className="flex flex-col gap-1">
      <span className="label">
        {label}
        <ReqMark required />
      </span>
      <input
        name="contactPhone"
        className="input"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        defaultValue={defaultValue}
        required
        aria-invalid={Boolean(shown) || undefined}
        aria-describedby="phone-hint"
        onBlur={(e) => {
          setTouched(true);
          const r = checkPhone(e.target.value);
          setError(r.ok ? null : r.message);
          if (r.ok) e.target.value = r.value; // 全角数字などを整えて見せる
        }}
      />
      <span id="phone-hint" className="hint">
        {PHONE_HINT}
      </span>
      <FieldError errors={shown} />
    </label>
  );
}
