"use client";
// 検索条件の入力。見るための条件はすべて任意。
// 「さがす」を押すたびに並び順のシードを新しくする（同じ検索の間は順番を保つ）。
// 条件はこのブラウザに保存して次回呼び出せる（日付と期限は今回の値を確認してもらう）。
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
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

export function SearchForm({ initial, prefecture, sort }: { initial: SearchValues; prefecture: string; sort: string }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const hasLast = useHasStored(LAST_KEY);
  const [loadedLast, setLoadedLast] = useState(false);
  const set = <K extends keyof SearchValues>(k: K, value: SearchValues[K]) => setV((p) => ({ ...p, [k]: value }));
  const detailCount = [v.qty, v.budget, v.use, v.by, v.purpose, v.method !== "ANY" ? "x" : ""].filter(Boolean).length;
  const [open, setOpen] = useState(detailCount > 0);

  function loadLast() {
    try {
      const last = JSON.parse(localStorage.getItem(LAST_KEY) ?? "{}");
      // 日付と期限は今回の値を使う
      setV((p) => ({ ...p, ...last, use: p.use, by: p.by }));
      setLoadedLast(true);
      setOpen(true);
    } catch {}
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify(v));
    } catch {}
    const seed = Math.random().toString(36).slice(2, 10);
    const sp = new URLSearchParams({ seed });
    const add = (k: string, val: string) => val.trim() && sp.set(k, val.trim());
    add("item", v.item);
    if (v.item.trim()) sp.set("mode", v.mode);
    add("qty", v.qty);
    add("budget", v.budget);
    add("use", v.use);
    add("by", v.by);
    if (v.method !== "ANY") sp.set("method", v.method);
    add("purpose", v.purpose);
    if (v.unset) sp.set("unset", "1");
    if (sort !== "fair") sp.set("sort", sort);
    router.push(`/shop/search?${sp}`);
  }

  function clearAll() {
    setV({ item: "", mode: "EXACT", qty: "", budget: "", use: "", by: "", method: "ANY", purpose: "", unset: false });
    router.push(`/shop/search?seed=${Math.random().toString(36).slice(2, 10)}`);
  }

  return (
    <form id="search" tabIndex={-1} onSubmit={onSubmit} className="card flex scroll-mt-24 flex-col gap-4 outline-none">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-title">🔍 さがす・絞り込む</h2>
        {hasLast && (
          <button type="button" onClick={loadLast} className="btn-secondary btn-sm">
            ↩️ 前回の条件を呼び出す
          </button>
        )}
      </div>
      {loadedLast && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          📅 前回の条件を入れました。使用日と仕入れ確定希望時刻は今回の値を確認してください。
        </p>
      )}

      <label className="flex flex-col gap-1">
        <span className="label">
          🥬 食材
          <ReqMark optional />
        </span>
        <input className="input" value={v.item} onChange={(e) => set("item", e.target.value)} placeholder="例：万願寺唐辛子" maxLength={50} />
        <span className="hint">空欄なら、すべての野菜を表示します</span>
      </label>
      {v.item.trim() && (
        <fieldset className="flex flex-col gap-1">
          <legend className="label mb-1">食材の指定</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(ITEM_MODE_LABELS) as SearchValues["mode"][])
              .filter((m) => m !== "ANY")
              .map((m) => (
                <label
                  key={m}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-2 border-green-200 bg-white px-4 font-bold has-checked:border-leaf has-checked:bg-leaf has-checked:text-white has-focus-visible:ring-4 has-focus-visible:ring-green-200"
                >
                  <input type="radio" name="mode" className="sr-only" checked={v.mode === m} onChange={() => set("mode", m)} />
                  {v.mode === m ? "● " : "○ "}
                  {ITEM_MODE_LABELS[m]}
                </label>
              ))}
          </div>
          <span className="hint">「代替も可」にすると、条件に合う掲載中の別の野菜もAIの説明つきで表示します。</span>
        </fieldset>
      )}
      <p className="text-sm text-gray-700">📍 届け先の地域：{prefecture}（マイページの店舗情報で変更できます）</p>

      <div className="rounded-2xl border-2 border-green-100">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="search-detail"
          onClick={() => setOpen(!open)}
          className="flex min-h-12 w-full items-center justify-between gap-2 px-4 font-bold text-leaf-dark"
        >
          <span>
            ⚙️ 詳しい条件（任意）{detailCount > 0 && <span className="badge ml-2 bg-leaf text-white">{detailCount}件指定中</span>}
          </span>
          <span aria-hidden>{open ? "▲ 閉じる" : "▼ 開く"}</span>
        </button>
        {open && (
          <div id="search-detail" className="flex flex-col gap-3 border-t-2 border-green-100 p-4">
            <p className="hint">
              入れた条件だけで絞り込みます。申し込む前には、出品の詳しい画面で数量・使用日・仕入れ確定希望時刻などを必ず確認します。
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Labeled label="⚖️ 希望数量（kg）" hint="入れると送料込みの合計を計算します">
                <input className="input" inputMode="decimal" value={v.qty} onChange={(e) => set("qty", e.target.value)} placeholder="例：3" />
              </Labeled>
              <Labeled label="💴 送料込み予算（円）" hint="希望数量と一緒に入れてください">
                <input className="input" inputMode="numeric" value={v.budget} onChange={(e) => set("budget", e.target.value)} placeholder="例：5000" />
              </Labeled>
              <Labeled label="🍽️ 使用日" hint="この日までに受け取れる日程がある出品にしぼります">
                <input type="date" className="input" value={v.use} onChange={(e) => set("use", e.target.value)} />
              </Labeled>
              <Labeled label="🚚 受け取り方法">
                <select className="input" value={v.method} onChange={(e) => set("method", e.target.value)}>
                  <option value="ANY">どれでもよい</option>
                  {Object.entries(DELIVERY_METHOD_LABELS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </Labeled>
              <Labeled label="⏰ 仕入れ確定希望時刻" hint="この時刻までに農家さんの回答が間に合う出品にしぼります（日本時間）">
                <input type="datetime-local" className="input" value={v.by} onChange={(e) => set("by", e.target.value)} />
              </Labeled>
              <Labeled label="📝 用途" hint="AIが「お店に合う理由」を説明するときに使います">
                <input className="input" value={v.purpose} onChange={(e) => set("purpose", e.target.value)} maxLength={200} placeholder="例：焼き浸しと天ぷらに" />
              </Labeled>
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="size-5 accent-green-700" checked={v.unset} onChange={(e) => set("unset", e.target.checked)} />
              送料が未登録の出品も、相談の候補として見る
            </label>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary flex-1 py-3 text-lg">
          🔍 この条件でさがす
        </button>
        <button type="button" onClick={clearAll} className="btn-secondary">
          条件をすべて外す
        </button>
      </div>
      <p className="hint">並び順は「さがす」を押したときに入れ替わります。ページの移動や詳細から戻ったときは同じ順番のままです。</p>
    </form>
  );
}

function Labeled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
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
