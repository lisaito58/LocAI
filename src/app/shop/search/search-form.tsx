"use client";
// 検索の入口：一覧の上に「食材の簡単な検索」と「絞り込み」。詳しい条件はパネル（ダイアログ）で入力する。
// - 入力中の条件はこの画面が持っているので、パネルを閉じても消えない
// - 「この条件で探す」で並び順のシードを新しくして一覧に戻る（同じ検索の間は順番を保つ）
// - 見るための条件はすべて任意。申し込みに必要な条件は出品の詳細画面で確認する
// - 条件はこのブラウザに保存して次回呼び出せる（日付と期限は今回の値を確認してもらう）
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { ReqMark } from "@/components/fields";
import { useHasStored } from "@/components/use-stored-flag";
import { DELIVERY_METHOD_LABELS } from "@/lib/validation/listing";
import { ITEM_MODE_LABELS } from "@/lib/validation/search";

const LAST_KEY = "locai:search-last";

export type SearchValues = {
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

const EMPTY: SearchValues = { item: "", mode: "EXACT", qty: "", budget: "", use: "", by: "", method: "ANY", purpose: "", unset: false };

function newSeed() {
  return Math.random().toString(36).slice(2, 10);
}

// 適用中の条件を短い札（チップ）にする
function chips(v: SearchValues): string[] {
  const out: string[] = [];
  if (v.item) out.push(`食材：${v.item}（${ITEM_MODE_LABELS[v.mode] ?? "指定"}）`);
  if (v.qty) out.push(`数量：${v.qty}kg`);
  if (v.budget) out.push(`予算：${v.budget}円`);
  if (v.use) out.push(`使用日：${v.use}`);
  if (v.method !== "ANY") out.push(`受け取り：${DELIVERY_METHOD_LABELS[v.method as keyof typeof DELIVERY_METHOD_LABELS] ?? v.method}`);
  if (v.by) out.push(`確定希望：${v.by.replace("T", " ")}`);
  if (v.purpose) out.push(`用途：${v.purpose}`);
  if (v.unset) out.push("送料未登録も相談候補に");
  return out;
}

export function SearchForm({
  initial,
  prefecture,
  sort,
  view,
}: {
  initial: SearchValues;
  prefecture: string;
  sort: string;
  view: "list" | "map";
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const hasLast = useHasStored(LAST_KEY);
  const [loadedLast, setLoadedLast] = useState(false);
  const panelRef = useRef<HTMLDialogElement>(null);
  const set = <K extends keyof SearchValues>(k: K, value: SearchValues[K]) => setV((p) => ({ ...p, [k]: value }));
  const applied = chips(initial);
  const detailCount = [v.qty, v.budget, v.use, v.by, v.purpose, v.method !== "ANY" ? "x" : "", v.unset ? "x" : ""].filter(Boolean).length;

  function go(values: SearchValues) {
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify(values));
    } catch {}
    const sp = new URLSearchParams({ seed: newSeed() });
    const add = (k: string, val: string) => val.trim() && sp.set(k, val.trim());
    add("item", values.item);
    if (values.item.trim()) sp.set("mode", values.mode);
    add("qty", values.qty);
    add("budget", values.budget);
    add("use", values.use);
    add("by", values.by);
    if (values.method !== "ANY") sp.set("method", values.method);
    add("purpose", values.purpose);
    if (values.unset) sp.set("unset", "1");
    if (sort !== "fair") sp.set("sort", sort);
    if (view === "map") sp.set("view", "map");
    panelRef.current?.close();
    router.push(`/shop/search?${sp}`);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    go(v);
  }

  function reset() {
    setV(EMPTY);
    go(EMPTY);
  }

  function loadLast() {
    try {
      const last = JSON.parse(localStorage.getItem(LAST_KEY) ?? "{}");
      // 日付と期限は今回の値を使う
      setV((p) => ({ ...p, ...last, use: p.use, by: p.by }));
      setLoadedLast(true);
    } catch {}
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 簡単な検索 */}
      <form id="search" tabIndex={-1} onSubmit={onSubmit} className="card flex scroll-mt-24 flex-col gap-3 p-4 outline-none">
        <label htmlFor="search-item" className="label">
          🥬 食材でさがす
          <ReqMark optional />
        </label>
        <input
          id="search-item"
          className="input"
          value={v.item}
          onChange={(e) => set("item", e.target.value)}
          placeholder="例：万願寺唐辛子"
          maxLength={50}
          aria-describedby="search-item-hint"
        />
        <span id="search-item-hint" className="hint">
          空欄なら、すべての野菜を表示します
        </span>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="submit" className="btn-primary w-full sm:flex-[2]">
            🔍 この条件で探す
          </button>
          <button type="button" onClick={() => panelRef.current?.showModal()} aria-haspopup="dialog" className="btn-secondary w-full sm:flex-1">
            ⚙️ 絞り込み{detailCount > 0 && `（${detailCount}件）`}
          </button>
        </div>
      </form>

      {/* 適用中の条件（常に表示） */}
      <div className="flex flex-col gap-2 rounded-2xl bg-white px-3 py-2 ring-1 ring-green-100">
        <p className="text-sm font-bold">適用中の条件</p>
        {applied.length === 0 ? (
          <p className="text-sm text-gray-700">なし（受付中の出品をすべて表示）</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {applied.map((c) => (
              <li key={c} className="rounded-lg bg-leaf-light px-2.5 py-1 text-sm font-bold break-all text-leaf-dark">
                {c}
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-gray-700">📍 届け先の地域：{prefecture}</p>
        {applied.length > 0 && (
          <button type="button" onClick={reset} className="btn-ghost btn-sm self-start">
            条件をリセット
          </button>
        )}
      </div>

      {/* 詳しい条件のパネル */}
      <dialog
        ref={panelRef}
        aria-labelledby="filter-title"
        onClick={(e) => {
          if (e.target === panelRef.current) panelRef.current?.close();
        }}
        className="m-auto max-h-[92dvh] w-[min(40rem,calc(100vw-1rem))] max-w-full rounded-2xl bg-white p-0 text-foreground backdrop:bg-black/40"
      >
        <form onSubmit={onSubmit} className="flex flex-col gap-4 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 id="filter-title" className="text-lg font-bold text-leaf-dark">
              ⚙️ 絞り込み
            </h2>
            <button type="button" onClick={() => panelRef.current?.close()} className="btn-secondary btn-sm">
              ✕ 閉じる
            </button>
          </div>
          <p className="hint">入れた条件だけで絞り込みます。閉じても入力は残ります。申し込む前には、出品の詳しい画面で必要な条件を確認します。</p>
          {hasLast && (
            <button type="button" onClick={loadLast} className="btn-ghost btn-sm self-start">
              ↩️ 前回の条件を呼び出す
            </button>
          )}
          {loadedLast && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950">使用日と仕入れ確定希望時刻は、今回の値を確認してください。</p>}

          <Field label="🥬 食材">
            <input className="input" value={v.item} onChange={(e) => set("item", e.target.value)} maxLength={50} placeholder="例：万願寺唐辛子" />
          </Field>
          {v.item.trim() && (
            <fieldset className="flex flex-col gap-1">
              <legend className="label mb-1">食材の指定</legend>
              <div className="flex flex-col gap-2 min-[400px]:flex-row">
                {(["EXACT", "ALT_OK"] as const).map((m) => (
                  <label
                    key={m}
                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border-2 border-green-200 bg-white px-3 font-bold has-checked:border-leaf has-checked:bg-leaf-light has-focus-visible:ring-4 has-focus-visible:ring-green-200"
                  >
                    <input type="radio" name="mode" className="size-5 accent-green-700" checked={v.mode === m} onChange={() => set("mode", m)} />
                    {ITEM_MODE_LABELS[m]}
                  </label>
                ))}
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer text-gray-700">「代替も可」とは？</summary>
                <p className="mt-1">条件に合う掲載中の別の野菜も、AIによる用途の説明つきで表示します。代わりになるかはお店で判断してください。</p>
              </details>
            </fieldset>
          )}
          <div className="grid items-start gap-3 sm:grid-cols-2">
            <Field label="⚖️ 希望数量（kg）" hint="入れると送料込みの合計を計算します">
              <input className="input" inputMode="decimal" value={v.qty} onChange={(e) => set("qty", e.target.value)} placeholder="例：3" />
            </Field>
            <Field label="💴 送料込み予算（円）" hint="希望数量と一緒に入れてください">
              <input className="input" inputMode="numeric" value={v.budget} onChange={(e) => set("budget", e.target.value)} placeholder="例：5000" />
            </Field>
            <Field label="🍽️ 使用日" hint="この日までに受け取れる出品にしぼります">
              <input type="date" className="input" value={v.use} onChange={(e) => set("use", e.target.value)} />
            </Field>
            <Field label="🚚 受け取り方法">
              <select className="input" value={v.method} onChange={(e) => set("method", e.target.value)}>
                <option value="ANY">どれでもよい</option>
                {Object.entries(DELIVERY_METHOD_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="⏰ 仕入れ確定希望時刻" hint="この時刻までに農家さんの回答が間に合う出品にしぼります">
              <input type="datetime-local" className="input" value={v.by} onChange={(e) => set("by", e.target.value)} />
            </Field>
            <Field label="📝 用途" hint="AIが「お店に合う理由」を説明するときに使います">
              <input className="input" value={v.purpose} onChange={(e) => set("purpose", e.target.value)} maxLength={200} placeholder="例：焼き浸しに" />
            </Field>
          </div>
          <label className="flex min-h-11 items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-5 accent-green-700" checked={v.unset} onChange={(e) => set("unset", e.target.checked)} />
            送料が未登録の出品も、相談の候補として見る
          </label>
          <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-green-100 bg-white px-4 pt-3 pb-1">
            <button type="submit" className="btn-primary w-full">
              🔍 この条件で探す
            </button>
            <button type="button" onClick={reset} className="btn-ghost w-full">
              条件をリセット
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label">
        {label}
        <ReqMark optional />
      </span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}
