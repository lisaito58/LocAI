// 概算受取額 = 商品代 + 受け取る送料 − 配送実費 − 梱包費 − その他の販売費用
// 未入力の費用は 0円とみなさず、入力済みの範囲の参考値として扱う。

export type CostInput = {
  actualShippingYen: number | null;
  packingYen: number | null;
  otherSalesCostYen: number | null;
};

export function estimateReceipt(itemSubtotalYen: number, receivedShippingYen: number, costs: CostInput | null) {
  const entries = [
    ["配送実費", costs?.actualShippingYen ?? null],
    ["梱包費", costs?.packingYen ?? null],
    ["その他の販売費用", costs?.otherSalesCostYen ?? null],
  ] as const;
  const missing = entries.filter(([, v]) => v === null).map(([k]) => k);
  const deducted = entries.reduce((sum, [, v]) => sum + (v ?? 0), 0);
  return {
    amountYen: itemSubtotalYen + receivedShippingYen - deducted,
    missing,
    complete: missing.length === 0,
  };
}
