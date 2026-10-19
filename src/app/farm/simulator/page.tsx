import type { Metadata } from "next";
import { Suspense } from "react";
import { saveSimulationAction } from "@/app/actions/costs";
import { ActionButton } from "@/components/action-button";
import { EmptyState, Loading, Page, PageTitle } from "@/components/ui";
import { estimateReceipt } from "@/lib/domain/estimate";
import { formatJst, formatKg, formatYen } from "@/lib/domain/units";
import { requireFarmer } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "受取額の試算 | LocAI" };

export default function SimulatorPage() {
  return (
    <Page>
      <PageTitle
        emoji="🧮"
        title="受取額の試算"
        lead="価格を見直す前に、仮の量・単価・費用で概算受取額を試せます。試算は実績とは別に保存され、値下げを強制・自動実行することはありません。"
      />
      <Suspense fallback={<Loading />}>
        <Content />
      </Suspense>
    </Page>
  );
}

async function Content() {
  const { profile } = await requireFarmer();
  const sims = profile
    ? await prisma.costMemo.findMany({ where: { farmerId: profile.id, kind: "SIMULATION" }, orderBy: { createdAt: "desc" }, take: 10 })
    : [];
  return (
    <div className="flex flex-col gap-6">
      <section className="card">
        <ActionButton
          action={saveSimulationAction}
          className="btn-primary self-start"
          fields={
            <div className="flex flex-col gap-4 text-sm">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <In name="itemName" label="🥬 品目" placeholder="賀茂茄子" />
                <In name="quantityKg" label="⚖️ 仮の販売量（kg）" placeholder="10" />
                <In name="unitPriceYenPerKg" label="💴 仮の単価（円/kg）" placeholder="900" />
                <In name="receivedShippingYen" label="📦 受け取る送料（円）" placeholder="未入力" />
                <In name="actualShippingYen" label="🚚 配送実費（円）" placeholder="未入力" />
                <In name="packingYen" label="🎁 梱包費（円）" placeholder="未入力" />
                <In name="otherSalesCostYen" label="🧾 その他の販売費用（円）" placeholder="未入力" />
              </div>
              <fieldset className="rounded-2xl bg-leaf-light/40 p-3">
                <legend className="label px-1">🏪 市場販売との比較（任意・あなたが入力した実績のみ）</legend>
                <div className="grid grid-cols-3 gap-2">
                  <In name="marketItemName" label="品目" placeholder="賀茂茄子" />
                  <In name="marketKg" label="量（kg）" placeholder="10" />
                  <In name="marketAmountYen" label="手元に残った額（円）" placeholder="6000" />
                </div>
                <p className="hint mt-1">同じ品目・同じ量のときだけ比較します。AIが相場を補うことはありません。</p>
              </fieldset>
            </div>
          }
        >
          🧮 試算して保存
        </ActionButton>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="section-title">📒 これまでの試算</h2>
        {sims.length === 0 ? (
          <EmptyState emoji="🧮">まだ試算はありません。</EmptyState>
        ) : (
          sims.map((s) => {
            const est = estimateReceipt(s.itemSubtotalYen ?? 0, s.receivedShippingYen ?? 0, s);
            const itemName = s.note?.match(/^試算：(.+?)（/)?.[1] ?? "";
            const comparable =
              s.marketAmountYen !== null && s.marketGrams !== null && s.marketItemName === itemName && s.marketGrams === s.quantityGrams && est.complete;
            return (
              <div key={s.id} className="card-soft flex flex-col gap-1 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-bold">
                    {s.note}・{formatKg(s.quantityGrams ?? 0)}
                  </span>
                  <span className="text-xs text-gray-700">{formatJst(s.createdAt)}（試算・実績ではありません）</span>
                </div>
                <div>
                  商品代 {formatYen(s.itemSubtotalYen ?? 0)}
                  {s.receivedShippingYen === null ? "・受け取る送料 未入力" : ` ＋ 送料 ${formatYen(s.receivedShippingYen)}`}
                </div>
                <div className="text-lg font-bold text-leaf-dark">
                  概算受取額 {est.complete ? "" : "（入力済みの範囲）"}約 {formatYen(est.amountYen)}
                </div>
                {!est.complete && <div className="text-xs text-amber-800">費用未入力：{est.missing.join("・")}</div>}
                {s.marketAmountYen !== null &&
                  (comparable ? (
                    <div className="rounded-xl bg-white px-3 py-1.5">
                      🏪 市場（あなたの入力）{formatYen(s.marketAmountYen)} と比べて{" "}
                      <strong>{est.amountYen - s.marketAmountYen >= 0 ? "+" : ""}{formatYen(est.amountYen - s.marketAmountYen)}</strong>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-600">🏪 品目・量が同じでない、または費用が未入力のため、市場との比較はできません。</div>
                  ))}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}

function In({ name, label, placeholder }: { name: string; label: string; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label">{label}</span>
      <input name={name} className="input" placeholder={placeholder} />
    </label>
  );
}
