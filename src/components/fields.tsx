// 入力欄の共通部品（サーバー・ブラウザどちらの画面でも使える）
import type { InputHTMLAttributes, ReactNode } from "react";
import { FieldError } from "@/app/form-parts";
import { PREFECTURES } from "@/lib/validation/listing";

export function Field({
  label,
  hint,
  errors,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  errors?: string[];
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
      <FieldError errors={errors} />
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input ${props.className ?? ""}`} />;
}

export function PrefectureSelect({ name, defaultValue }: { name: string; defaultValue?: string }) {
  return (
    <select name={name} defaultValue={defaultValue ?? ""} className="input" required>
      <option value="" disabled>
        選んでください
      </option>
      {PREFECTURES.map((p) => (
        <option key={p}>{p}</option>
      ))}
    </select>
  );
}
