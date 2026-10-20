import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState, itemEmoji, Loading, Notice, Page, PageTitle } from "@/components/ui";
import { getLossSummary, type LossTotals } from "@/lib/domain/loss";
import { jstDayRange } from "@/lib/domain/todo";
import { dateToJstDateText, formatJstDate, formatKg, formatYen, jstDateToDate } from "@/lib/domain/units";
import { requireRestaurant } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "仕入れの振り返り | LocAI" };

export default function LossPage({ searchParams }: PageProps<"/shop/loss">) {
  return (
    <Page>
      <PageTitle
        emoji="📝"
        title="仕入れの振り返り"
        lead="受け取った食材を使い切れたかを記録して、次の注文量を考えるためのページです。記録は任意で、あなただけが見られます。"
      />
      <Suspense fallback={<Loading />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

async function Content({ searchParams }: Pick<PageProps<"/shop/loss">, "searchParams">) {
  const { profile } = await requireRestaurant();
  if (!profile) {
    return (
      <Notice tone="warn">
        はじめに <Link href="/shop/profile" className="link">マイページ</Link> で店舗情報を登録してください。
      </Notice>
    );
  }
  const q = await searchParams;
  // 期間は日本時間の日付で指定（初期値：今日までの30日）。基準は注文の受取日
  const { start: todayStart, end: todayEnd } = jstDayRange(new Date());
  const today = dateToJstDateText(todayStart);
  const defaultFrom = dateToJstDateText(new Date(todayStart.getTime() - 29 * 86_400_000));
  const fromText = typeof q.from === "string" && jstDateToDate(q.from) ? q.from : defaultFrom;
  const toText = typeof q.to === "string" && jstDateToDate(q.to) ? q.to : today;
  const from = jstDateToDate(fromText)!;
  const to = new Date(jstDateToDate(toText)!.getTime() + 86_400_000);
  const { rows, totals, items } = await getLossSummary(prisma, profile.id, from, to < todayEnd ? to : todayEnd);
  const presets = [7, 30, 90].map((d) => ({ d, from: dateToJstDateText(new Date(todayStart.getTime() - (d - 1) * 86_400_000)) }));

  return (
    <div className="flex flex-col gap-6">
      <form className="card flex flex-col gap-3" action="/shop/loss">
        <h2 className="section-title">📅 期間（受け取った日）</h2>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <Link key={p.d} href={`/shop/loss?from=${p.from}&to=${today}`} className={`btn-sm btn ${fromText === p.from && toText === today ? "bg-leaf text-white" : "border-2 border-green-200 bg-white text-leaf-dark"}`}>
              直近{p.d}日
            </Link>
          ))}
        </div>
        <div className="grid items-start gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="label">開始日</span>
            <input type="date" name="from" defaultValue={fromText} className="input" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label">終了日</span>
            <input type="date" name="to" defaultValue={toText} className="input" />
          </label>
        </div>
        <button className="btn-secondary w-full sm:w-auto sm:self-start">この期間で集計する</button>
      </form>

      <section className="flex flex-col gap-3">
        <h2 className="section-title">📊 集計（{formatJstDate(from)}〜{toText.slice(5).replace("-", "/")}）</h2>
        <p className="rounded-2xl bg-white px-3 py-2 text-sm ring-1 ring-green-100">
          このアプリで受け取った注文だけの集計です（お店全体の食品ロスではありません）。
          {totals.approximate && " 割合ボタンで入れた記録を含むため「概算」です。"}
        </p>
        <Totals t={totals} />
      </section>

      {items.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="section-title">🥬 食材別</h2>
          <ul className="flex flex-col gap-2">
            {items.map((it) => (
              <li key={it.name} className="card-soft p-3">
                <p className="font-bold">
                  {itemEmoji(it.name)} {it.name}
                </p>
                <p className="text-sm">
                  仕入れ{it.totals.purchaseCount}回・{formatKg(it.totals.purchaseGrams)} ／ 振り返り済み{it.totals.doneCount}件・未完了{it.totals.pendingCount}件
                </p>
                <p className="text-sm">
                  {it.totals.lossRate === null
                    ? "ロス：記録がありません"
                    : `ロス率 ${pct(it.totals.lossRate)}・廃棄 ${formatKg(it.totals.wasteGrams)}・食材代換算 約${formatYen(it.totals.lossYen!)}${it.totals.approximate ? "（概算）" : ""}`}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="section-title">🧺 受け取った注文（記録・訂正）</h2>
        {rows.length === 0 ? (
          <EmptyState emoji="🧺">この期間に受け取った注文はありません。</EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((r) => (
              <li key={r.orderId}>
                <Link href={`/shop/loss/${r.orderId}`} className="card flex flex-wrap items-center gap-2 p-3 hover:ring-2 hover:ring-sprout">
                  <span className="font-bold">
                    {itemEmoji(r.itemName)} {r.itemName} {formatKg(r.receivedGrams)}
                  </span>
                  <span className="text-sm">{r.farmName}・受取 {formatJstDate(r.receivedAt)}</span>
                  <span className={`badge ml-auto px-3 py-1 text-sm ${r.status === "DONE" ? "bg-green-100 text-green-900" : "bg-amber-100 text-amber-950"}`}>
                    {r.status === "DONE"
                      ? `✓ 記録済み：廃棄${formatKg(r.wasteGrams ?? 0)}${r.approximate ? "（概算）" : ""}`
                      : r.status === "IN_USE"
                        ? "使用中（未完了）"
                        : "未記録"}
                  </span>
                  <span className="w-full text-sm font-bold text-leaf-dark">{r.status === "NONE" ? "記録する →" : "訂正する →"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="card-soft text-sm">
        <summary className="cursor-pointer font-bold">計算のしかた</summary>
        <ul className="mt-2 ml-5 list-disc">
          <li>仕入れ回数・量：期間内に受け取った注文から数えます（受取量は注文の数量。実際と違うと記録した場合はその量）。</li>
          <li>振り返り済み：使用を終えて廃棄量を記録した注文です。「まだ使用中」と未記録は含めず、ロス0とも数えません。</li>
          <li>ロス率：振り返り済み注文の廃棄量の合計 ÷ 同じ注文の受取量の合計（注文ごとの割合の平均ではありません）。</li>
          <li>食材代換算のロス額：各注文の商品代 × その注文の廃棄割合の合計（送料は含めません）。</li>
          <li>記録した量は、食品ロスを減らせた量・保証を表すものではありません。</li>
        </ul>
      </details>
    </div>
  );
}

function Totals({ t }: { t: LossTotals }) {
  const cell = (label: string, value: string) => (
    <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-green-100">
      <div className="text-sm text-gray-700">{label}</div>
      <div className="text-xl font-bold text-leaf-dark">{value}</div>
    </div>
  );
  return (
    <div className="grid gap-2 min-[400px]:grid-cols-2 lg:grid-cols-3">
      {cell("仕入れ回数", `${t.purchaseCount}回`)}
      {cell("仕入れ量", formatKg(t.purchaseGrams))}
      {cell("振り返り済み／未完了", `${t.doneCount}件／${t.pendingCount}件`)}
      {cell("記録した廃棄量", t.doneCount ? `${formatKg(t.wasteGrams)}${t.approximate ? "（概算）" : ""}` : "記録がありません")}
      {cell("ロス率", t.lossRate === null ? "記録がありません" : `${pct(t.lossRate)}${t.approximate ? "（概算）" : ""}`)}
      {cell("食材代換算のロス額", t.lossYen === null ? "記録がありません" : `約${formatYen(t.lossYen)}${t.approximate ? "（概算）" : ""}`)}
    </div>
  );
}
