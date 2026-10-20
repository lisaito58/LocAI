import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CalmNotice, Loading, Notice, Page, PageTitle } from "@/components/ui";
import {
  explainAlternatives,
  explainCandidates,
  type PublicCandidate,
  type SearchContext,
} from "@/lib/ai/gemini";
import { pickEarlySale, searchListings, type Candidate, type SearchResult } from "@/lib/domain/search";
import { formatJst, gramsToKgText } from "@/lib/domain/units";
import { requireRestaurant } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { cityPoint, prefecturePoint } from "@/lib/data/municipality-points";
import { DELIVERY_METHOD_LABELS, isServicePrefecture, SERVICE_PREFECTURES } from "@/lib/validation/listing";
import { ITEM_MODE_LABELS, newSeed, parseSearchQuery, searchHref, SORT_LABELS, type ParsedSearch } from "@/lib/validation/search";
import { CandidateCard } from "./candidate-card";
import { EditSearchButton } from "./edit-search-button";
import { FarmMap, type MapArea } from "./farm-map";
import { SearchForm, type SearchValues } from "./search-form";

export const metadata: Metadata = { title: "野菜をさがす | LocAI" };

const PAGE_SIZE = 8;

export default function SearchPage({ searchParams }: PageProps<"/shop/search">) {
  return (
    <Page>
      <PageTitle emoji="🔍" title="野菜をさがす" lead="地元の農家さんの、いま受付中の出品です。食材や詳しい条件で絞り込めます。" />
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
        はじめに <Link href="/shop/profile" className="link">店舗情報</Link> を登録してください 🏮（届け先の地域を送料の計算に使います）
      </Notice>
    );
  }
  const query = await searchParams;
  // 並び順を固定するシードがなければ作って、同じURLで表示し直す（戻る・ページ移動で順番が変わらないように）
  if (typeof query.seed !== "string") {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (typeof v === "string") sp.set(k, v);
    sp.set("seed", newSeed());
    redirect(`/shop/search?${sp}`);
  }
  const parsed = parseSearchQuery(query);
  const raw: Record<string, string> = {};
  for (const [k, v] of Object.entries(query)) if (typeof v === "string") raw[k] = v;

  const initial: SearchValues = {
    item: raw.item ?? "",
    mode: (raw.mode as keyof typeof ITEM_MODE_LABELS) ?? "EXACT",
    qty: raw.qty ?? "",
    budget: raw.budget ?? "",
    use: raw.use ?? "",
    by: raw.by ?? "",
    method: raw.method ?? "ANY",
    purpose: raw.purpose ?? "",
    unset: raw.unset === "1",
  };

  return (
    <div className="flex flex-col gap-6">
      {!isServicePrefecture(profile.prefecture) && (
        <Notice tone="warn">
          登録済みの届け先（{profile.prefecture}）は対象地域外です。対象は関西2府4県です。<Link href="/shop/profile" className="link">マイページ</Link>で設定し直してください（これまでの注文の情報はそのまま残ります）。
        </Notice>
      )}
      <SearchForm key={raw.seed} initial={initial} prefecture={profile.prefecture} sort={raw.sort ?? "fair"} view={raw.view === "map" ? "map" : "list"} />
      {"errors" in parsed ? (
        <Notice tone="error">
          <p className="font-bold">入力を確認してください</p>
          {parsed.errors.map((e) => (
            <div key={e}>⚠️ {e}</div>
          ))}
        </Notice>
      ) : (
        <Suspense key={JSON.stringify(parsed.raw)} fallback={<Loading label="出品を読み込んでいます" />}>
          <Results userId={user.id} parsed={parsed} />
        </Suspense>
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
    purchaseKgComputedByApp: c.purchaseGrams === null ? "未指定" : gramsToKgText(c.purchaseGrams),
    deliveryMethod: DELIVERY_METHOD_LABELS[c.deliveryMethod],
  };
}

async function Results({ userId, parsed }: { userId: string; parsed: ParsedSearch }) {
  const { params: p, raw, page, hasConditions, notices } = parsed;
  let result: SearchResult;
  try {
    result = await searchListings(prisma, userId, p);
  } catch {
    return (
      <Notice tone="error">
        出品を読み込めませんでした（「0件」という意味ではありません）。少し待ってから、画面を再読み込みしてください。
      </Notice>
    );
  }
  const totalPages = Math.max(1, Math.ceil(result.normal.length / PAGE_SIZE));
  const pageItems = result.normal.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const ctx: SearchContext = {
    itemQuery: p.itemQuery,
    itemMode: ITEM_MODE_LABELS[p.itemMode],
    quantityKg: p.quantityGrams === undefined ? "未指定" : gramsToKgText(p.quantityGrams),
    budgetYen: p.budgetYen ?? null,
    useDate: p.useDate ?? "未指定",
    purpose: p.purpose ?? null,
  };
  // AIの説明は検索結果とは別に呼ぶ。待たずに一覧を先に表示し、失敗しても一覧はそのまま
  const reasons = explainCandidates(ctx, pageItems.map(toPublic));
  const alternatives = p.itemMode === "ALT_OK" ? explainAlternatives(ctx, result.alternatives.map(toPublic)) : null;
  const detailHref = (c: Candidate) =>
    searchHref(raw, { purchase: c.purchaseGrams === null ? null : String(c.purchaseGrams), page: null }, `/shop/listings/${c.listingId}`);
  const qtyGiven = p.quantityGrams !== undefined;

  // 指定していない条件は「確認済み」として扱わない
  const unchecked = [
    !qtyGiven && "数量",
    p.budgetYen === undefined && "予算",
    !p.useDate && "使用日",
    !p.purchaseConfirmByAt && "仕入れ確定希望時刻",
  ].filter(Boolean) as string[];
  const early = pickEarlySale(result.normal, p.seed);

  // 地図：農家が表示を許可した出品だけを、市区町村の「おおよその位置」ごとにまとめる
  const view = raw.view === "map" ? "map" : "list";
  const areaMap = new Map<string, MapArea>();
  let hiddenOnMap = 0;
  for (const c of result.normal) {
    const point = c.farmMapVisible ? cityPoint(c.farmPrefecture, c.farmCity) : null;
    if (!point) {
      hiddenOnMap++;
      continue;
    }
    const key = `${c.farmPrefecture}${c.farmCity}`;
    const area = areaMap.get(key) ?? { key, prefecture: c.farmPrefecture, city: c.farmCity, point, farms: [] };
    let farm = area.farms.find((f) => f.farmName === c.farmName);
    if (!farm) {
      farm = { farmName: c.farmName, listings: [] };
      area.farms.push(farm);
    }
    farm.listings.push({ id: c.listingId, itemName: c.itemName, href: detailHref(c) });
    areaMap.set(key, area);
  }
  const areas = [...areaMap.values()];
  const mapCenter = prefecturePoint(result.prefecture) ?? areas[0]?.point ?? [34.99, 135.76];
  const prefecturePoints = SERVICE_PREFECTURES.map((name) => ({ name, point: prefecturePoint(name) })).filter(
    (x): x is { name: (typeof SERVICE_PREFECTURES)[number]; point: [number, number] } => x.point !== null,
  );

  return (
    <div className="flex flex-col gap-6">
      {notices.map((n) => (
        <Notice key={n} tone="info">
          💡 {n}
        </Notice>
      ))}

      {/* 早めに販売したい野菜（承認や即納を保証しない） */}
      {early.length > 0 && (
        <section className="rounded-3xl border-2 border-orange-200 bg-orange-50/70 p-4">
          <h2 className="section-title text-orange-950">⏳ 早めに販売したい野菜</h2>
          <p className="mt-1 text-sm text-gray-800">
            農家さんが「この日時までに販売を決めたい」と希望している出品です。早く届くという意味ではありません。受け渡し日は各出品の日程で確認してください。
            {unchecked.length > 0 && `（${unchecked.join("・")}は未確認です）`}
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {early.map((c) => (
              <li key={c.listingId}>
                <Link href={detailHref(c)} className="flex flex-col rounded-2xl bg-white p-3 hover:ring-2 hover:ring-orange-300">
                  <span className="font-bold">
                    {c.itemName}（{c.farmName}）
                  </span>
                  <span className="text-sm">販売希望期限 {formatJst(c.saleTargetAt!)} ・ 受け渡し {formatJst(c.firstSlotAt)}〜</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link href={searchHref(raw, { sort: "saleTarget", page: null })} className="link mt-2 inline-block text-sm">
            販売希望期限が近い順で一覧を見る →
          </Link>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">
            🧺 {hasConditions ? "条件に合う出品" : "受付中の出品"} {result.normal.length}件
          </h2>
          <span className="text-sm text-gray-700">📍{result.prefecture}への受け渡しで計算</span>
        </div>
        {/* 一覧と地図は同じ検索条件で切り替える */}
        <nav aria-label="表示の切り替え" className="grid grid-cols-2 gap-2">
          {(
            [
              ["list", "📋 一覧で見る"],
              ["map", "🗺 地図で見る"],
            ] as const
          ).map(([key, label]) => {
            const active = (view === "map") === (key === "map");
            return (
              <Link
                key={key}
                href={searchHref(raw, { view: key === "map" ? "map" : null, page: null })}
                aria-current={active ? "true" : undefined}
                className={`btn ${active ? "bg-leaf text-white" : "border-2 border-green-200 bg-white text-leaf-dark"}`}
              >
                {active && "✓ "}
                {label}
              </Link>
            );
          })}
        </nav>
        {unchecked.length > 0 && result.normal.length > 0 && (
          <p className="rounded-2xl bg-white px-3 py-2 text-sm text-gray-800 ring-1 ring-green-200">
            ℹ️ 未指定のため確認していない条件：{unchecked.join("・")}。申し込む前に、出品の詳しい画面で確認します。
          </p>
        )}

        {result.normal.length === 0 ? (
          result.openCount === 0 ? (
            <CalmNotice title="いま受付中の出品はありません">
              <p>新しい出品が登録されるまで、少し時間をおいてからもう一度ご覧ください。</p>
            </CalmNotice>
          ) : (
            <CalmNotice title="条件に合う出品はありませんでした">
              <p>数量・予算・受け取り日などの条件を変えて、もう一度探してみてください。</p>
              <p className="text-sm">いま適用中の条件は、上の「いま適用中の条件」に表示しています。数量・使用日・追加条件を外すと、候補が増えることがあります。</p>
              <p className="text-sm">いま受付中の出品は全部で {result.openCount}件あります。</p>
              <div className="flex flex-wrap gap-2">
                <EditSearchButton />
                {qtyGiven && p.extraGrams === 0 && (
                  <Link href={searchHref(raw, { extra: "1", page: null })} className="btn-secondary">
                    ➕ 希望より多い候補も見る（＋1kgまで）
                  </Link>
                )}
              </div>
            </CalmNotice>
          )
        ) : view === "map" ? (
          <>
            {hiddenOnMap > 0 && (
              <p className="text-sm text-gray-700">地図に位置を表示していない出品が {hiddenOnMap}件あります（「📋 一覧で見る」で表示されます）。</p>
            )}
            <FarmMap areas={areas} center={mapCenter} prefectures={prefecturePoints} />
          </>
        ) : (
          <>
            <nav aria-label="並べ替え" className="flex flex-wrap gap-2 text-sm">
              {(Object.keys(SORT_LABELS) as (keyof typeof SORT_LABELS)[]).map((key) => {
                const active = p.sort === key;
                if (key === "total" && !qtyGiven) {
                  return (
                    <span key={key} aria-disabled="true" className="flex min-h-10 items-center rounded-lg bg-gray-100 px-3 font-bold text-gray-700">
                      {SORT_LABELS[key]}（数量を入れると使えます）
                    </span>
                  );
                }
                return (
                  <Link
                    key={key}
                    href={searchHref(raw, { sort: key, page: null })}
                    aria-current={active ? "true" : undefined}
                    className={`flex min-h-10 items-center rounded-lg px-3 py-1.5 leading-snug font-bold ${
                      active ? "bg-leaf text-white" : "bg-white text-leaf-dark ring-1 ring-green-200 hover:bg-leaf-light"
                    }`}
                  >
                    {active && "✓ "}
                    {SORT_LABELS[key]}
                  </Link>
                );
              })}
            </nav>
            <details className="text-sm">
              <summary className="cursor-pointer font-bold text-leaf-dark">並び順のしくみ</summary>
              <ul className="mt-1 ml-5 list-disc text-gray-800">
                <li>おすすめ順：人気順ではなく、検索ごとに順番を入れ替え、同じ農家さんが続かないように並べます。AIは並び順を決めません。</li>
                <li>並び順は「この条件で探す」を押したときに入れ替わります。ページの移動や詳細から戻ったときは同じ順番のままです。</li>
                <li>送料込み総額順：同じ希望数量で計算した合計が安い順です（数量の入力が必要）。</li>
                <li>受付期限が近い順：新しい申込を受け付ける期限が近い順です。</li>
                <li>販売希望期限が近い順：農家さんの「この日時までに販売を決めたい」期限が近い出品が先、その後ろはおすすめ順です。</li>
              </ul>
            </details>
            <div className="flex flex-col gap-3">
              {pageItems.map((c) => (
                <CandidateCard key={c.listingId} c={c} href={detailHref(c)} wantedGrams={p.quantityGrams} ai={<AiReason promise={reasons} id={c.listingId} />} />
              ))}
            </div>
            {totalPages > 1 && (
              <nav aria-label="ページ" className="flex items-center justify-center gap-2 text-sm">
                {page > 1 && (
                  <Link href={searchHref(raw, { page: String(page - 1) })} className="btn-secondary btn-sm">
                    ← 前へ
                  </Link>
                )}
                <span>
                  {page} / {totalPages} ページ
                </span>
                {page < totalPages && (
                  <Link href={searchHref(raw, { page: String(page + 1) })} className="btn-secondary btn-sm">
                    次へ →
                  </Link>
                )}
              </nav>
            )}
          </>
        )}
      </section>

      {/* 希望より多い候補（数量を指定したときだけ） */}
      {qtyGiven && (
        <section className="card flex flex-col gap-3">
          <h2 className="section-title">➕ 希望より多い候補も見る</h2>
          <p className="text-sm text-gray-700">
            販売単位の都合で、希望（{gramsToKgText(p.quantityGrams!)}kg）より少し多く買う必要がある出品です。許容できる追加量を選んでください。申込量は自動では変わりません。
          </p>
          <div className="flex flex-wrap gap-2 text-sm">
            {["0.5", "1", "2"].map((x) => (
              <Link
                key={x}
                href={searchHref(raw, { extra: x, page: null })}
                className={`flex min-h-10 items-center rounded-lg px-3 py-1.5 leading-snug font-bold ${raw.extra === x ? "bg-leaf text-white" : "bg-leaf-light text-leaf-dark"}`}
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
              <label className="sr-only" htmlFor="extra-kg">
                追加許容量（kg）
              </label>
              <input id="extra-kg" name="extra" className="input w-24" inputMode="decimal" placeholder="任意" defaultValue={["0.5", "1", "2"].includes(raw.extra ?? "") ? "" : raw.extra} />
              <button className="btn-secondary btn-sm">kgまで</button>
            </form>
          </div>
          {p.extraGrams > 0 &&
            (result.extra.length === 0 ? (
              <p className="text-sm text-gray-700">追加{gramsToKgText(p.extraGrams)}kgまでで条件に合う出品はありません。</p>
            ) : (
              <div className="flex flex-col gap-3">
                {result.extra.map((c) => (
                  <CandidateCard key={c.listingId} c={c} href={detailHref(c)} wantedGrams={p.quantityGrams} />
                ))}
              </div>
            ))}
        </section>
      )}

      {/* 代替提案（店が「代替も可」を選んだときだけ） */}
      {alternatives && (
        <section className="card flex flex-col gap-3">
          <h2 className="section-title">🔄 代わりに使えそうな掲載中の野菜</h2>
          <p className="text-sm text-gray-700">
            「代替も可」を選んだので、指定した条件に合う別の品目を表示しています。用途の説明はAIによる目安です。使えるかどうかはお店で判断してください。
          </p>
          {result.alternatives.length === 0 ? (
            <p className="text-sm text-gray-700">条件に合う代替候補はありません。</p>
          ) : (
            result.alternatives.map((c) => (
              <CandidateCard key={c.listingId} c={c} href={detailHref(c)} wantedGrams={p.quantityGrams} ai={<AiAlternative promise={alternatives} id={c.listingId} />} />
            ))
          )}
        </section>
      )}

      {/* 送料未確定（数量を指定したときだけ判定できる） */}
      {qtyGiven && (
        <section className="card-soft flex flex-col gap-3">
          <h2 className="section-title">📦 送料が未登録の出品（相談のみ）</h2>
          {!p.showUnsetShipping ? (
            <Link href={searchHref(raw, { unset: "1" })} className="btn-secondary btn-sm self-start">
              送料が未登録の出品も相談する
            </Link>
          ) : result.unsetShipping.length === 0 ? (
            <p className="text-sm text-gray-700">該当する出品はありません。</p>
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
      )}
    </div>
  );
}

async function AiReason({ promise, id }: { promise: Promise<Map<string, string>>; id: string }) {
  const reason = (await promise).get(id);
  if (!reason) return null;
  return (
    <p className="rounded-2xl bg-sky-50 px-3 py-2 text-sm text-sky-950">
      <span className="font-bold">🤖 AIのひとこと：</span>
      {reason}
    </p>
  );
}

async function AiAlternative({ promise, id }: { promise: Promise<Map<string, { usage: string; difference: string }>>; id: string }) {
  const alt = (await promise).get(id);
  if (!alt) return <p className="text-sm text-gray-700">（AIの説明は今は表示できません）</p>;
  return (
    <div className="rounded-2xl bg-sky-50 px-3 py-2 text-sm text-sky-950">
      <div>
        <span className="font-bold">🍳 使えそうな用途：</span>
        {alt.usage}
      </div>
      <div className="mt-1">
        <span className="font-bold">🔍 違い・注意点：</span>
        {alt.difference}
      </div>
      <div className="mt-1 text-xs">※AIによる目安です。代わりになることを保証するものではありません。</div>
    </div>
  );
}
