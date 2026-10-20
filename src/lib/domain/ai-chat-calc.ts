// AI相談で使う計算（AIには計算させず、アプリが行う）。DBに触れない純粋な関数だけを置く。

// 何人分×1人分の量 → 合計量。0.1kg単位に切り上げる（足りなくならないよう）。
// 1人分の量はAIの目安なので、画面では「目安」と表示し、店が自分で直せるようにする。
export function estimateQuantity(servings: number, gramsPerServing: number) {
  if (!Number.isInteger(servings) || !Number.isInteger(gramsPerServing)) return null;
  if (servings < 1 || servings > 1000 || gramsPerServing < 1 || gramsPerServing > 1000) return null;
  const rawGrams = servings * gramsPerServing;
  const grams = Math.ceil(rawGrams / 100) * 100;
  return { rawGrams, grams };
}

// アプリ内の掲載価格の参考（円/kg、送料を含まない）。件数が少ないときは数値を出さない。
export const PRICE_REF_MIN_COUNT = 3;

export type PriceReference =
  | { enough: true; count: number; minYen: number; medianYen: number; maxYen: number }
  | { enough: false; count: number };

export function priceReference(unitPrices: number[]): PriceReference {
  const xs = unitPrices.filter((p) => Number.isInteger(p) && p > 0).sort((a, b) => a - b);
  if (xs.length < PRICE_REF_MIN_COUNT) return { enough: false, count: xs.length };
  const mid = xs.length / 2;
  // 偶数件は中央2件の平均を円未満切り捨て
  const median = xs.length % 2 ? xs[Math.floor(mid)] : Math.floor((xs[mid - 1] + xs[mid]) / 2);
  return { enough: true, count: xs.length, minYen: xs[0], medianYen: median, maxYen: xs.at(-1)! };
}

// AIへ送る前に、うっかり入力された連絡先らしい文字列を伏せる（完全ではないので画面でも入力しないよう案内する）
export function redactPersonal(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "［メールアドレス］")
    .replace(/(?<!\d)(\+81[-\s]?|0)\d{1,4}[-－ー\s]?\d{1,4}[-－ー\s]?\d{3,4}(?!\d)/g, "［電話番号］")
    .replace(/〒?\s*(?<!\d)\d{3}[-－ー]\d{4}(?![\d-])/g, "［郵便番号］");
}
