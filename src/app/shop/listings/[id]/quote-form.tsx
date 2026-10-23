"use client";
// 申込条件のフォーム（数量・予算・使用日・確定希望時刻・日程）。
// 送信はページ全体を読み込み直さず、同じ画面の中で URL の条件だけを更新する（ページ先頭に戻らない）。
// 表示位置は、新しい内容が描画されたあとに StepFocus が次の手順の見出しへ合わせる。
// 条件を変えたら、購入希望フォームに「計算し直しが必要」と知らせる（古い見積もりで申し込ませない）。
import { useRouter } from "next/navigation";
import { useTransition, type FormEvent, type ReactNode } from "react";
import { markStepPending } from "./step-focus";

export const CONDITIONS_CHANGED_EVENT = "locai:order-conditions-changed";

export function QuoteForm({ action, submitLabel, children }: { action: string; submitLabel: string; children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    // ブラウザの入力チェック（必須など）を通ったあとにだけ呼ばれる
    e.preventDefault();
    if (pending) return;
    const params = new URLSearchParams();
    for (const [k, v] of new FormData(e.currentTarget)) if (typeof v === "string") params.append(k, v);
    markStepPending();
    startTransition(() => router.push(`${action}?${params}`, { scroll: false }));
  }

  return (
    <form
      onSubmit={onSubmit}
      onChange={() => window.dispatchEvent(new Event(CONDITIONS_CHANGED_EVENT))}
      className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2"
      aria-busy={pending}
    >
      {children}
      <div className="sm:col-span-2">
        <button className="btn-secondary w-full" disabled={pending}>
          {pending ? "確認しています…🌱" : submitLabel}
        </button>
      </div>
    </form>
  );
}
