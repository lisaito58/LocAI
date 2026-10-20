// ロス記録の計算ルール（DBを使わない部分。ブラウザの画面でも同じ計算を使う）

export const RATIO_CHOICES = [
  { q: 0, label: "ロスなし・使い切った" },
  { q: 1, label: "約4分の1を廃棄" },
  { q: 2, label: "約半分を廃棄" },
  { q: 3, label: "約4分の3を廃棄" },
  { q: 4, label: "全部廃棄" },
] as const;

// 同じ食材かどうか：表記の揺れ（全角半角・空白）だけをそろえ、完全に一致するものを同じとみなす
// （食材の分類・識別のデータがないため、「賀茂茄子」と「賀茂なす」は別の食材として扱う）
export function itemKey(name: string): string {
  return name.normalize("NFKC").replace(/\s/g, "");
}

// 割合ボタンからの廃棄量（g整数）。受取量の割合をアプリが計算する
export function wasteFromRatio(receivedGrams: number, quarters: number): number {
  return Math.round((receivedGrams * quarters) / 4);
}
