"use client";
// 販売条件の見直し：今の単価と新しい単価で概算受取額を比べてから、必要なら変更する
// 費用の未入力は0円とみなさない。値下げは任意で、ここで「変更する」を押すまで何も変わらない。
import { useState } from "react";
import { reviewSalesTermsAction } from "@/app/actions/listings";
import { ActionButton } from "@/components/action-button";
import { ReqMark } from "@/components/fields";
import { estimateReceipt } from "@/lib/domain/estimate";
import { formatYen, itemSubtotalYen, kgTextToGrams } from "@/lib/domain/units";

type Costs = { actualShippingYen: string; packingYen: string; otherSalesCostYen: string };

const toNum = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s) : null);

export function PriceReview({
  listingId,
  currentPrice,
  availableKg,
  lastCosts,
  earlySale,
  saleTargetAt,
}: {
  listingId: string;
  currentPrice: number;
  availableKg: string;
  lastCosts: Costs | null;
  earlySale: boolean;
  saleTargetAt: string;
}) {
  const [qty, setQty] = useState(availableKg);
  const [price, setPrice] = useState(String(currentPrice));
  const [shipping, setShipping] = useState("");
  const [costs, setCosts] = useState<Costs>(lastCosts ?? { actualShippingYen: "", packingYen: "", otherSalesCostYen: "" });
  const [early, setEarly] = useState(earlySale);

  const grams = kgTextToGrams(qty);
  const newPrice = toNum(price);
  const costInput = {
    actualShippingYen: toNum(costs.actualShippingYen),
    packingYen: toNum(costs.packingYen),
    otherSalesCostYen: toNum(costs.otherSalesCostYen),
  };
  const received = toNum(shipping) ?? 0;
  const calc = (p: number) => (grams === null ? null : estimateReceipt(itemSubtotalYen(p, grams), received, costInput));
  const before = calc(currentPrice);
  const after = newPrice ? calc(newPrice) : null;

  return (
    <div className="flex flex-col gap-5">
      <section className="card flex flex-col gap-3">
        <h2 className="section-title">🧮 変更する前に試算する（保存はされません）</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Num label="試算する販売量（kg）" value={qty} onChange={setQty} hint="初期値は今の申込可能量" />
          <Num label="新しい単価（円/kg）" value={price} onChange={setPrice} hint={`今の単価：${formatYen(currentPrice)}/kg`} />
          <Num label="受け取る送料の見込み（円）" value={shipping} onChange={setShipping} optional hint="空欄なら0円で計算（送料収入なし）" />
        </div>
        <fieldset className="rounded-2xl bg-leaf-light/40 p-3">
          <legend className="label px-1">差し引く費用（任意）</legend>
          {lastCosts && <p className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950">前回の注文の費用を入れています。今回の値か確認してください。</p>}
          <div className="grid gap-2 sm:grid-cols-3">
            <Num label="配送実費（円）" value={costs.actualShippingYen} onChange={(x) => setCosts({ ...costs, actualShippingYen: x })} optional />
            <Num label="梱包費（円）" value={costs.packingYen} onChange={(x) => setCosts({ ...costs, packingYen: x })} optional />
            <Num label="その他の販売費用（円）" value={costs.otherSalesCostYen} onChange={(x) => setCosts({ ...costs, otherSalesCostYen: x })} optional />
          </div>
        </fieldset>
        {grams === null ? (
          <p className="text-sm text-red-800">⚠️ 販売量をkgの数字で入力してください</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Result title={`今の単価（${formatYen(currentPrice)}/kg）`} r={before} />
            <Result title={newPrice ? `新しい単価（${formatYen(newPrice)}/kg）` : "新しい単価"} r={after} />
          </div>
        )}
        {before && !before.complete && <p className="text-sm text-amber-900">費用未入力：{before.missing.join("・")}（0円とはみなしていないため、入力済みの範囲の参考値です）</p>}
        <p className="hint">栽培費・税金・労働時間などは含まない参考値です。売り切れることや利益を保証するものではありません。</p>
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="section-title">✏️ 販売条件を変更する（任意）</h2>
        <ActionButton
          action={reviewSalesTermsAction.bind(null, listingId)}
          className="btn-primary self-start"
          confirmText="販売条件を変更しますか？（新しい申し込みにだけ使われます）"
          fields={
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="label">
                  単価（円/kg）
                  <ReqMark required />
                </span>
                <input name="unitPriceYenPerKg" className="input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
                <span className="hint">値下げは任意です。同じ単価のままでも「早めに販売したい」だけを設定できます。</span>
              </label>
              <label className="flex min-h-11 items-center gap-2 font-bold">
                <input type="checkbox" name="earlySale" className="size-5 accent-green-700" checked={early} onChange={(e) => setEarly(e.target.checked)} />
                ⏳ 早めに販売したい
                <ReqMark optional />
              </label>
              {early && (
                <label className="flex flex-col gap-1">
                  <span className="label">
                    販売希望期限（この日時までに販売確定させたい）
                    <ReqMark required />
                  </span>
                  <input name="saleTargetAt" type="datetime-local" className="input" defaultValue={saleTargetAt} />
                  <span className="hint">回答の最終期限以前で、「いま＋返事の時間」より後にしてください。受付・回答・受け渡しの期限は変わりません。</span>
                </label>
              )}
              <p className="rounded-2xl bg-leaf-light/60 px-3 py-2 text-sm">
                ✅ 変更は新しい申し込みにだけ使われます。すでに届いている購入希望や販売確定した注文の価格・送料・合意内容は変わりません。
              </p>
            </div>
          }
        >
          💾 この条件に変更する
        </ActionButton>
      </section>
    </div>
  );
}

function Num({ label, value, onChange, hint, optional }: { label: string; value: string; onChange: (v: string) => void; hint?: string; optional?: boolean }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label">
        {label}
        <ReqMark optional={optional} />
      </span>
      <input className="input" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder={optional ? "未入力" : undefined} />
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

function Result({ title, r }: { title: string; r: ReturnType<typeof estimateReceipt> | null }) {
  return (
    <div className="rounded-2xl border-2 border-green-200 bg-white p-3">
      <div className="text-sm font-bold">{title}</div>
      {r ? (
        <div className="text-2xl font-bold text-leaf-dark">
          {r.complete ? "" : <span className="text-sm">入力済みの範囲で </span>}約 {formatYen(r.amountYen)}
        </div>
      ) : (
        <div className="text-gray-700">単価を入力してください</div>
      )}
    </div>
  );
}
