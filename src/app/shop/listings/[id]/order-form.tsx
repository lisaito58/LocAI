"use client";
// 購入希望の送信。冪等性キーで、連打・通信の再試行でも注文を1件にまとめる
// 見積もりのあとに条件（数量・予算・日程など）を変えたら送信できなくし、計算し直しを案内する（古い見積もりで申し込ませない）
import { useEffect, useState } from "react";
import { submitOrder, type OrderFormState } from "@/app/actions/orders";
import { FormMessage } from "@/app/form-parts";
import { useKeepForm } from "@/components/use-keep-form";
import { CONDITIONS_CHANGED_EVENT } from "./quote-form";

export function OrderForm({ hidden, deadlineText }: { hidden: Record<string, string>; deadlineText: string }) {
  // 画面を開いたときに1回だけ作る。同じ画面からの再送信は同じキーになる
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [state, onSubmit, pending] = useKeepForm<OrderFormState>(submitOrder);
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const onChanged = () => setStale(true);
    window.addEventListener(CONDITIONS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(CONDITIONS_CHANGED_EVENT, onChanged);
  }, []);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <label className="flex flex-col gap-1">
        <span className="label">💬 相談したいこと（任意・500文字以内）</span>
        <textarea name="message" maxLength={500} rows={3} className="input" placeholder="例：形が不揃いでも大丈夫です。午前中の受け取りを希望します。" />
        <span className="hint">相談文を添えると「相談あり」の注文になり、農家さんが内容を確認してから回答します。相談文で条件は自動では変わりません。</span>
      </label>
      <label className="flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">
        <input type="checkbox" name="agree" className="mt-1 size-4 accent-green-700" />
        <span>
          数量・合計金額・受け渡し条件・支払条件を確認しました。送信すると<strong>仮押さえ</strong>になり、
          <strong>{deadlineText}</strong> までに農家さんが承認しなければ仮押さえは解除されます（まだ販売確定ではありません）。
        </span>
      </label>
      <FormMessage message={state?.error} />
      {stale && (
        <p role="status" className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-950">
          ⚠️ 申込条件が変わりました。上の「🧮 合計と期限を確認する」をもう一度押して、新しい合計と期限を確認してから送ってください。
        </p>
      )}
      <button type="submit" disabled={pending || stale} className="btn-primary py-3 text-lg">
        {pending ? "送信しています…🌱" : "🧺 購入希望を送る"}
      </button>
    </form>
  );
}
