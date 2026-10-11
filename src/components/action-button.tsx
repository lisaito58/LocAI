"use client";
// サーバーアクションを1つ実行するボタン。結果（エラー）をその場に表示する
import { useActionState, type ReactNode } from "react";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string } | undefined;

export function ActionButton({
  action,
  children,
  className = "btn-primary btn-sm",
  confirmText,
  fields,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  children: ReactNode;
  className?: string;
  confirmText?: string;
  fields?: ReactNode; // チェックボックスなど追加の入力
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
      className="flex flex-col gap-2"
    >
      {fields}
      <button type="submit" disabled={pending} className={className}>
        {pending ? "処理中…" : children}
      </button>
      {state && !state.ok && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm whitespace-pre-line text-red-800">
          ⚠️ {state.error}
        </p>
      )}
      {state?.ok && state.message && (
        <p role="status" className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-900">
          ✅ {state.message}
        </p>
      )}
    </form>
  );
}
