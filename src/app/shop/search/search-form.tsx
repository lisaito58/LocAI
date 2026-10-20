"use client";
// 検索フォーム
//   1. 食材名 2. 希望数量 3. 使用日（いつも表示）
//   4. 「送料込み予算・受け取り方法などを指定する」（同じ画面で開閉。閉じても入力は残り、要約を表示）
//   5. 「この条件で探す」
// - 見るための条件はすべて任意。入力した条件だけを適用し、条件を黙って緩めない
// - 申し込みに必要な条件は出品の詳細画面で必ず確認する
// - 「この条件で探す」で並び順のシードを新しくする（同じ検索の間は順番を保つ）
// - 条件はこのブラウザに保存して次回呼び出せる（日付と期限は今回の値を確認してもらう）
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type ReactNode } from "react";
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

// 追加条件の要約（閉じていても、何が設定されているか分かるように）
function extraSummary(v: SearchValues): string[] {
  const out: string[] = [];
  if (v.budget) out.push(`予算${Number(v.budget).toLocaleString("ja-JP")}円`);
  if (v.method !== "ANY") out.push(DELIVERY_METHOD_LABELS[v.method as keyof typeof DELIVERY_METHOD_LABELS] ?? v.method);
  if (v.by) out.push(`確定希望${v.by.replace("T", " ")}`);
  if (v.purpose) out.push(`用途：${v.purpose}`);
  if (v.item && v.mode === "ALT_OK") out.push("代替も可");
  if (v.unset) out.push("送料未登録も相談候補に");
  return out;
}

// 適用中の条件（検索済みの条件）
function appliedChips(v: SearchValues, prefecture: string): string[] {
  const out: string[] = [];
  if (v.item) out.push(`食材：${v.item}`);
  if (v.qty) out.push(`数量：${v.qty}kg`);
  if (v.use) out.push(`使用日：${v.use}`);
  out.push(...extraSummary(v));
  out.push(`届け先：${prefecture}`);
  return out;
}

export function SearchForm({ initial, prefecture, sort, view }: { initial: SearchValues; prefecture: string; sort: string; view: "list" | "map" }) {
  const router = useRouter();
  const id = useId();
  const [v, setV] = useState(initial);
  const hasLast = useHasStored(LAST_KEY);
  const [loadedLast, setLoadedLast] = useState(false);
  const summary = extraSummary(v);
  const [open, setOpen] = useState(false);
  const set = <K extends keyof SearchValues>(k: K, value: SearchValues[K]) => setV((p) => ({ ...p, [k]: value }));

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
    router.push(`/shop/search?${sp}`);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    go(v);
  }

  function clearExtra() {
    setV((p) => ({ ...p, budget: "", by: "", method: "ANY", purpose: "", unset: false, mode: "EXACT" }));
  }

  function loadLast() {
    try {
      const last = JSON.parse(localStorage.getItem(LAST_KEY) ?? "{}");
      setV((p) => ({ ...p, ...last, use: p.use, by: p.by })); // 日付と期限は今回の値
      setLoadedLast(true);
    } catch {}
  }

  const applied = appliedChips(initial, prefecture);

  return (
    <div className="flex flex-col gap-3">
      <form id="search" tabIndex={-1} onSubmit={onSubmit} className="card flex scroll-mt-24 flex-col gap-4 p-4 outline-none">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">🔍 条件を入れて探す</h2>
          {hasLast && (
            <button type="button" onClick={loadLast} className="btn-ghost btn-sm">
              ↩️ 前回の条件を呼び出す
            </button>
          )}
        </div>
        <p className="hint">どれも任意です。入れた条件だけで探します。</p>
        {loadedLast && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950">使用日と仕入れ確定希望時刻は、今回の値を確認してください。</p>}

        <Field id={`${id}-item`} label="🥬 食材名" hint="ひらがな・カタカナ・漢字のどれでも探せます（例：なす／ナス／茄子）">
          <input id={`${id}-item`} className="input" value={v.item} onChange={(e) => set("item", e.target.value)} maxLength={50} placeholder="例：万願寺唐辛子" />
        </Field>
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <Field id={`${id}-qty`} label="⚖️ 希望数量（kg）" hint="入れると送料込みの合計を計算します">
            <input id={`${id}-qty`} className="input" inputMode="decimal" value={v.qty} onChange={(e) => set("qty", e.target.value)} placeholder="例：3" />
          </Field>
          <Field id={`${id}-use`} label="🍽️ 使用日" hint="この日までに受け取れる日程がある出品にしぼります">
            <input id={`${id}-use`} type="date" className="input" value={v.use} onChange={(e) => set("use", e.target.value)} />
          </Field>
        </div>

        {/* 追加条件（同じ画面で開閉。閉じても入力は残る） */}
        <div className="rounded-2xl border-2 border-green-200">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`${id}-extra`}
            onClick={() => setOpen(!open)}
            className="flex min-h-12 w-full items-start justify-between gap-2 rounded-2xl px-4 py-3 text-left font-bold text-leaf-dark"
          >
            <span>送料込み予算・受け取り方法などを指定する</span>
            <span className="shrink-0">{open ? "▲ 閉じる" : "▼ 開く"}</span>
          </button>
          {!open && summary.length > 0 && (
            <p className="px-4 pb-3 text-sm font-bold text-gray-800">追加条件：{summary.join("・")}</p>
          )}
          {open && (
            <div id={`${id}-extra`} className="flex flex-col gap-4 border-t-2 border-green-100 p-4">
              <div className="grid items-start gap-4 sm:grid-cols-2">
                <Field id={`${id}-budget`} label="💴 送料込み予算（円）" hint="希望数量と一緒に入れてください">
                  <input id={`${id}-budget`} className="input" inputMode="numeric" value={v.budget} onChange={(e) => set("budget", e.target.value)} placeholder="例：5000" />
                </Field>
                <Field id={`${id}-method`} label="🚚 受け取り方法">
                  <select id={`${id}-method`} className="input" value={v.method} onChange={(e) => set("method", e.target.value)}>
                    <option value="ANY">どれでもよい</option>
                    {Object.entries(DELIVERY_METHOD_LABELS).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id={`${id}-by`} label="⏰ 仕入れ確定希望時刻" hint="この時刻までに農家さんの回答が間に合う出品にしぼります">
                  <input id={`${id}-by`} type="datetime-local" className="input" value={v.by} onChange={(e) => set("by", e.target.value)} />
                </Field>
                <Field id={`${id}-purpose`} label="📝 用途" hint="AIが「お店に合う理由」を説明するときに使います">
                  <input id={`${id}-purpose`} className="input" value={v.purpose} onChange={(e) => set("purpose", e.target.value)} maxLength={200} placeholder="例：焼き浸しに" />
                </Field>
              </div>
              <div className="flex flex-col gap-1">
                <span className="label">📍 届け先</span>
                <p className="rounded-xl bg-leaf-light/60 px-3 py-2">
                  {prefecture}（店舗情報の地域。送料の計算に使います）
                  <Link href="/shop/profile" className="link ml-2">
                    変更する
                  </Link>
                </p>
              </div>
              {v.item.trim() && (
                <label className="flex min-h-11 items-start gap-2">
                  <input type="checkbox" className="mt-1 size-5 accent-green-700" checked={v.mode === "ALT_OK"} onChange={(e) => set("mode", e.target.checked ? "ALT_OK" : "EXACT")} />
                  <span>
                    代わりに使えそうな別の野菜も見る（代替も可）
                    <span className="hint block">条件に合う掲載中の野菜だけを、AIの用途の説明つきで表示します。</span>
                  </span>
                </label>
              )}
              <label className="flex min-h-11 items-start gap-2">
                <input type="checkbox" className="mt-1 size-5 accent-green-700" checked={v.unset} onChange={(e) => set("unset", e.target.checked)} />
                送料が未登録の出品も、相談の候補として見る
              </label>
              {summary.length > 0 && (
                <button type="button" onClick={clearExtra} className="btn-ghost self-start">
                  追加条件をすべて解除
                </button>
              )}
            </div>
          )}
        </div>

        <button type="submit" className="btn-primary w-full py-3 text-lg">
          🔍 この条件で探す
        </button>
      </form>

      {/* いま検索に使っている条件（届け先を含めて常に表示） */}
      <div className="flex flex-col gap-2 rounded-2xl bg-white px-3 py-2 ring-1 ring-green-100">
        <p className="text-sm font-bold">いま適用中の条件</p>
        <ul className="flex flex-wrap gap-2">
          {applied.map((c) => (
            <li key={c} className="rounded-lg bg-leaf-light px-2.5 py-1 text-sm font-bold break-all text-leaf-dark">
              {c}
            </li>
          ))}
        </ul>
        {applied.length > 1 && (
          <button
            type="button"
            onClick={() => {
              setV(EMPTY);
              go(EMPTY);
            }}
            className="btn-ghost btn-sm self-start"
          >
            条件をリセット
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="label">
        {label}
        <ReqMark optional />
      </label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}
