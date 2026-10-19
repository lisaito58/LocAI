// 入力欄の共通部品（サーバー・ブラウザどちらの画面でも使える）
import type { InputHTMLAttributes, ReactNode } from "react";
import { FieldError } from "@/app/form-parts";
import { PREFECTURES } from "@/lib/validation/listing";

// 「必須」「任意」は色だけでなく文字で示す
export function ReqMark({ required, optional }: { required?: boolean; optional?: boolean }) {
  if (required) return <span className="req">必須</span>;
  if (optional) return <span className="opt">任意</span>;
  return null;
}

export function Field({
  label,
  hint,
  errors,
  required,
  optional,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  errors?: string[];
  required?: boolean;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label">
        {label}
        <ReqMark required={required} optional={optional} />
      </span>
      {children}
      {hint && <span className="hint">{hint}</span>}
      <FieldError errors={errors} />
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input ${props.className ?? ""}`} />;
}

export function PrefectureSelect({
  name,
  defaultValue,
  value,
  onChange,
}: {
  name: string;
  defaultValue?: string;
  value?: string;
  onChange?: (v: string) => void;
}) {
  return (
    <select
      name={name}
      {...(value !== undefined ? { value } : { defaultValue: defaultValue ?? "" })}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      className="input"
      required
    >
      <option value="" disabled>
        選んでください
      </option>
      {PREFECTURES.map((p) => (
        <option key={p}>{p}</option>
      ))}
    </select>
  );
}
