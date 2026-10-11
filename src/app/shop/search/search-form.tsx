"use client";
// 検索条件の入力。送信ごとに新しい並び順のシードを作る（同じ検索の間は順番を保つ）
// 条件はこのブラウザに保存して、次回呼び出せる（日付と期限は今回の値を確認してもらう）
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useHasStored } from "@/components/use-stored-flag";
import { DELIVERY_METHOD_LABELS } from "@/lib/validation/listing";
import { ITEM_MODE_LABELS } from "@/lib/validation/search";

const LAST_KEY = "locai:search-last";

type Values = {
  item: string;
  mode: keyof typeof ITEM_MODE_LABELS;
  qty: string;
  budget: string;
  use: string;
  by: string;
  method: string;
  purpose: string;
  unset: boolean;
};

export function SearchForm({ initial, prefecture }: { initial: Values; prefecture: string }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const hasLast = useHasStored(LAST_KEY);
  const [loadedLast, setLoadedLast] = useState(false);
  const set = <K extends keyof Values>(k: K, value: Values[K]) => setV((p) => ({ ...p, [k]: value }));

  function loadLast() {
    try {
      const last = JSON.parse(localStorage.getItem(LAST_KEY) ?? "{}");
      // 日付と期限は今回の値を使う
      setV((p) => ({ ...p, ...last, use: p.use, by: p.by }));
      setLoadedLast(true);
    } catch {}
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify(v));
    } catch {}
    const seed = Math.random().toString(36).slice(2, 10);
    const sp = new URLSearchParams({
      item: v.item,
      mode: v.mode,
      qty: v.qty,
      budget: v.budget,
      use: v.use,
      by: v.by,
      method: v.method,
      seed,
    });
    if (v.purpose) sp.set("purpose", v.purpose);
    if (v.unset) sp.set("unset", "1");
    router.push(`/shop/search?${sp}`);
  }

  return (
    <form onSubmit={onSubmit} className="card flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-title">🧺 仕入れの条件</h2>
        {hasLast && (
          <button type="button" onClick={loadLast} className="btn-secondary btn-sm">
            ↩️ 前回の条件を呼び出す
          </button>
        )}
      </div>
      {loadedLast && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">📅 前回の条件を入れました。使用日と仕入れ確定希望時刻は今回の値を確認してください。</p>}

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="flex flex-col gap-1">
          <span className="label">🥬 食材</span>
          <input className="input" value={v.item} onChange={(e) => set("item", e.target.value)} placeholder="例：万願寺唐辛子" maxLength={50} />
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend className="label mb-1">食材の指定</legend>
          <div className="flex gap-1">
            {(Object.keys(ITEM_MODE_LABELS) as Values["mode"][]).map((m) => (
              <label key={m} className="badge cursor-pointer bg-leaf-light px-3 py-2 text-sm has-checked:bg-leaf has-checked:text-white">
                <input type="radio" name="mode" className="sr-only" checked={v.mode === m} onChange={() => set("mode", m)} />
                {ITEM_MODE_LABELS[m]}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="label">⚖️ 希望数量（kg）</span>
          <input className="input" inputMode="decimal" value={v.qty} onChange={(e) => set("qty", e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">💴 送料込み予算（円）</span>
          <input className="input" inputMode="numeric" value={v.budget} onChange={(e) => set("budget", e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">🍽️ 使用日</span>
          <input type="date" className="input" value={v.use} onChange={(e) => set("use", e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">🚚 受け取り方法</span>
          <select className="input" value={v.method} onChange={(e) => set("method", e.target.value)}>
            <option value="ANY">どれでもよい</option>
            {Object.entries(DELIVERY_METHOD_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="label">⏰ 仕入れ確定希望時刻</span>
          <input type="datetime-local" className="input" value={v.by} onChange={(e) => set("by", e.target.value)} required />
          <span className="hint">この時刻までに農家さんの回答が必要な出品だけを表示します（日本時間）</span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">📝 用途（任意）</span>
          <input className="input" value={v.purpose} onChange={(e) => set("purpose", e.target.value)} maxLength={200} placeholder="例：焼き浸しと天ぷらに" />
          <span className="hint">AIが「お店に合う理由」を説明するときに使います</span>
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-green-700" checked={v.unset} onChange={(e) => set("unset", e.target.checked)} />
          送料未確定の出品も相談候補として見る
        </label>
        <span className="text-xs text-green-900/60">📍 配送先：{prefecture}（店舗情報の地域）</span>
      </div>

      <button type="submit" className="btn-primary py-3 text-lg">
        🔍 この条件でさがす
      </button>
    </form>
  );
}
