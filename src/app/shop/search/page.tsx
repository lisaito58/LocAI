import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState, Loading, Notice, Page, PageTitle } from "@/components/ui";
import {
  explainAlternatives,
  explainCandidates,
  type PublicCandidate,
  type SearchContext,
} from "@/lib/ai/gemini";
import { searchListings, type Candidate } from "@/lib/domain/search";
import { dbNow } from "@/lib/domain/tx";
import { dateToJstDateText, gramsToKgText } from "@/lib/domain/units";
import { requireRestaurant } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { DELIVERY_METHOD_LABELS } from "@/lib/validation/listing";
import { ITEM_MODE_LABELS, parseSearchQuery, searchHref, type ParsedSearch } from "@/lib/validation/search";
import { CandidateCard } from "./candidate-card";
import { SearchForm } from "./search-form";

export const metadata: Metadata = { title: "野菜をさがす | LocAI" };

const PAGE_SIZE = 8;

export default function SearchPage({ searchParams }: PageProps<"/shop/search">) {
  return (
    <Page>
      <PageTitle emoji="🔍" title="野菜をさがす" lead="必要な量・送料込みの予算・使用日に合う、地元の農家さんの出品を探します。" />
      <Suspense fallback={<Loading />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}

async function Content({ searchParams }: Pick<PageProps<"/shop/search">, "searchParams">) {
  const { user, profile } = await requireRestaurant();
  if (!profile) {
    return (
      <Notice tone="warn">
        はじめに <Link href="/shop/profile" className="link">店舗情報</Link> を登録してください 🏮（配送先の地域を送料計算に使います）
      </Notice>
    );
  }
  const query = await searchParams;
  const hasQuery = typeof query.qty === "string";
  const parsed = hasQuery ? parseSearchQuery(query) : null;
  const now = await dbNow(prisma);

  const raw = parsed && "params" in parsed ? parsed.raw : null;
  const initial = {
    item: raw?.item ?? "",
    mode: (raw?.mode as keyof typeof ITEM_MODE_LABELS) ?? "EXACT",
    qty: raw?.qty ?? "",
    budget: raw?.budget ?? "",
    use: raw?.use ?? dateToJstDateText(new Date(now.getTime() + 3 * 86_400_000)),
    by: raw?.by ?? `${dateToJstDateText(new Date(now.getTime() + 2 * 86_400_000))}T18:00`,
    method: raw?.method ?? "ANY",
    purpose: raw?.purpose ?? "",
    unset: raw?.unset === "1",
  };

  return (
    <div className="flex flex-col gap-6">
      <SearchForm key={raw?.seed ?? "new"} initial={initial} prefecture={profile.prefecture} />
      {parsed && "errors" in parsed && (
        <Notice tone="error">
          {parsed.errors.map((e) => (
            <div key={e}>⚠️ {e}</div>
          ))}
        </Notice>
      )}
      {parsed && "params" in parsed && (
        <Suspense key={JSON.stringify(parsed.raw)} fallback={<Loading label="出品をさがしています" />}>
          <Results userId={user.id} parsed={parsed} />
        </Suspense>
      )}
      {!hasQuery && (
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          {[
            ["🍆", "必要な量だけ", "販売単位に合わせて、最小の購入量を計算します"],
            ["💴", "送料込みで比較", "お店の地域の送料表から合計を出します"],
            ["⏰", "期限がわかる", "いつまでに回答が来るかを申込前に表示します"],
          ].map(([e, t, d]) => (
            <div key={t} className="card-soft">
              <div className="text-2xl">{e}</div>
              <div className="font-bold">{t}</div>
              <div className="text-xs text-green-900/70">{d}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function toPublic(c: Candidate): PublicCandidate {
  return {
    id: c.listingId,
    itemName: c.itemName,
    farmArea: `${c.farmPrefecture}${c.farmCity}`,
    description: c.description,
    selfDeclaredFeatures: c.selfDeclaredFeatures,
    sizeLabel: c.sizeLabel,
    totalYenComputedByApp: c.totalYen,
    purchaseKgComputedByApp: gramsToKgText(c.purchaseGrams),
    deliveryMethod: DELIVERY_METHOD_LABELS[c.deliveryMethod],
  };
}

async function Results({ userId, parsed }: { userId: string; parsed: ParsedSearch }) {
  const { params: p, raw, page } = parsed;
  const result = await searchListings(prisma, userId, p);
  const totalPages = Math.max(1, Math.ceil(result.normal.length / PAGE_SIZE));
  const pageItems = result.normal.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const ctx: SearchContext = {
    itemQuery: p.itemQuery,
    itemMode: ITEM_MODE_LABELS[p.itemMode],
    quantityKg: gramsToKgText(p.quantityGrams),
    budgetYen: p.budgetYen,
    useDate: p.useDate,
    purpose: p.purpose ?? null,
  };
  // AIの説明は検索結果とは別に呼ぶ。待たずに一覧を先に表示し、失敗しても一覧はそのまま
  const reasons = explainCandidates(ctx, pageItems.map(toPublic));
  const alternatives = p.itemMode === "ALT_OK" ? explainAlternatives(ctx, result.alternatives.map(toPublic)) : null;
  const detailHref = (c: Candidate) => searchHref(raw, { purchase: String(c.purchaseGrams), page: null }, `/shop/listings/${c.listingId}`);

  const sortTabs = [
    ["fair", "🌱 おすすめ順（公平に混ぜる）"],
    ["total", "💴 送料込み総額順"],
    ["deadline", "⏰ 受付期限が近い順"],
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">🧺 条件に合う出品 {result.normal.length}件</h2>
          <span className="text-xs text-green-900/60">📍{result.prefecture}への受け渡しで計算</span>
        </div>
        <nav className="flex flex-wrap gap-1.5 text-sm">
          {sortTabs.map(([key, label]) => (
            <Link
              key={key}
              href={searchHref(raw, { sort: key, page: null })}
              className={`rounded-full px-3 py-1.5 font-bold ${p.sort === key ? "bg-leaf text-white" : "bg-white text-leaf-dark ring-1 ring-green-100 hover:bg-leaf-light"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        {p.sort === "fair" && (
          <p className="hint">人気順ではなく、検索ごとに順番を入れ替え、同じ農家さんが続かないように並べています。AIは並び順を決めません。</p>
        )}
        {pageItems.length === 0 ? (
          <EmptyState emoji="🥲">
            条件に合う出品が見つかりませんでした。
            <br />
            希望数量・予算・使用日・受け取り方法、または仕入れ確定希望時刻（回答を待てる時間）を変えてみてください。
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-3">
            {pageItems.map((c) => (
              <CandidateCard key={c.listingId} c={c} href={detailHref(c)} wantedGrams={p.quantityGrams} ai={<AiReason promise={reasons} id={c.listingId} />} />
            ))}
          </div>
        )}
        {totalPages > 1 && (
          <nav className="flex items-center justify-center gap-2 text-sm">
            {page > 1 && (
              <Link href={searchHref(raw, { page: String(page - 1) })} className="btn-secondary btn-sm">
                ← 前へ
              </Link>
            )}
            <span>
              {page} / {totalPages}
            </span>
            {page < totalPages && (
              <Link href={searchHref(raw, { page: String(page + 1) })} className="btn-secondary btn-sm">
                次へ →
              </Link>
            )}
          </nav>
        )}
      </section>

      {/* 希望より多い候補 */}
      <section className="card flex flex-col gap-3">
        <h2 className="section-title">➕ 希望より多い候補も見る</h2>
        <p className="text-sm text-green-900/70">
          販売単位の都合で、希望（{gramsToKgText(p.quantityGrams)}kg）より少し多く買う必要がある出品です。許容できる追加量を選んでください。
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          {["0.5", "1", "2"].map((x) => (
            <Link
              key={x}
              href={searchHref(raw, { extra: x })}
              className={`rounded-full px-3 py-1.5 font-bold ${raw.extra === x ? "bg-leaf text-white" : "bg-leaf-light text-leaf-dark"}`}
            >
              ＋{x}kg まで
            </Link>
          ))}
          <form action="/shop/search" className="flex items-center gap-1">
            {Object.entries(raw)
              .filter(([k]) => k !== "extra" && k !== "page")
              .map(([k, val]) => (
                <input key={k} type="hidden" name={k} value={val} />
              ))}
            <input name="extra" className="input w-20 py-1.5" inputMode="decimal" placeholder="任意" defaultValue={["0.5", "1", "2"].includes(raw.extra ?? "") ? "" : raw.extra} />
            <button className="btn-secondary btn-sm">kgまで</button>
          </form>
        </div>
        {p.extraGrams > 0 &&
          (result.extra.length === 0 ? (
            <p className="text-sm text-green-900/60">追加{gramsToKgText(p.extraGrams)}kgまでで条件に合う出品はありません。</p>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="hint">申込量は自動で変わりません。詳細画面で数量を確認してから申し込んでください。</p>
              {result.extra.map((c) => (
                <CandidateCard key={c.listingId} c={c} href={detailHref(c)} wantedGrams={p.quantityGrams} />
              ))}
            </div>
          ))}
      </section>

      {/* 代替提案 */}
      {alternatives && (
        <section className="card flex flex-col gap-3">
          <h2 className="section-title">🔄 代わりに使えそうな掲載中の野菜</h2>
          <p className="text-sm text-green-900/70">
            「代替も可」を選んだので、数量・総額・受け渡し条件に合う別の品目を表示しています。用途の説明はAIによる目安です。使えるかどうかはお店で判断してください。
          </p>
          {result.alternatives.length === 0 ? (
            <p className="text-sm text-green-900/60">条件に合う代替候補はありません。</p>
          ) : (
            result.alternatives.map((c) => (
              <CandidateCard key={c.listingId} c={c} href={detailHref(c)} wantedGrams={p.quantityGrams} ai={<AiAlternative promise={alternatives} id={c.listingId} />} />
            ))
          )}
        </section>
      )}

      {/* 送料未確定 */}
      <section className="card-soft flex flex-col gap-3">
        <h2 className="section-title">📦 送料未確定の出品（相談のみ）</h2>
        {!p.showUnsetShipping ? (
          <Link href={searchHref(raw, { unset: "1" })} className="btn-secondary btn-sm self-start">
            送料未確定の出品も相談する
          </Link>
        ) : result.unsetShipping.length === 0 ? (
          <p className="text-sm text-green-900/60">該当する出品はありません。</p>
        ) : (
          <>
            <p className="text-sm text-amber-900">
              お店の地域・この数量の送料が登録されていないため、予算内かどうかは分かりません。購入希望は送れず、仮押さえもされません。相談して農家さんが送料を登録したら、最新の総額で申し込めます。
            </p>
            {result.unsetShipping.map((c) => (
              <CandidateCard key={c.listingId} c={c} href={detailHref(c)} wantedGrams={p.quantityGrams} />
            ))}
          </>
        )}
      </section>
    </div>
  );
}

async function AiReason({ promise, id }: { promise: Promise<Map<string, string>>; id: string }) {
  const reason = (await promise).get(id);
  if (!reason) return null;
  return (
    <p className="rounded-2xl bg-sky-50 px-3 py-2 text-sm text-sky-900">
      <span className="font-bold">🤖 AIのひとこと：</span>
      {reason}
    </p>
  );
}

async function AiAlternative({ promise, id }: { promise: Promise<Map<string, { usage: string; difference: string }>>; id: string }) {
  const alt = (await promise).get(id);
  if (!alt) return <p className="text-xs text-green-900/50">（AIの説明は今は表示できません）</p>;
  return (
    <div className="rounded-2xl bg-sky-50 px-3 py-2 text-sm text-sky-900">
      <div>
        <span className="font-bold">🍳 使えそうな用途：</span>
        {alt.usage}
      </div>
      <div className="mt-1">
        <span className="font-bold">🔍 違い・注意点：</span>
        {alt.difference}
      </div>
      <div className="mt-1 text-xs opacity-70">※AIによる目安です。代わりになることを保証するものではありません。</div>
    </div>
  );
}

