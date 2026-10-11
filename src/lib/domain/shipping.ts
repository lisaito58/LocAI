// 送料表（地域×数量帯）のルール
// 帯は「下限を含まない・上限を含む」。最初の帯は 0g 超から。穴・重複は登録エラー。

export type ShippingBand = {
  prefecture: string;
  minGramsExclusive: number;
  maxGramsInclusive: number;
  feeYen: number;
};

// 登録時の検証。問題があれば日本語のエラーを返す
export function validateShippingBands(bands: ShippingBand[]): string[] {
  const errors: string[] = [];
  const byPref = new Map<string, ShippingBand[]>();
  for (const b of bands) {
    if (!b.prefecture) errors.push("送料の地域を選んでください");
    if (b.maxGramsInclusive <= b.minGramsExclusive) {
      errors.push(`${b.prefecture}：上限は下限より大きくしてください`);
    }
    if (b.feeYen < 0 || b.feeYen > 100_000) errors.push(`${b.prefecture}：送料は0〜100,000円にしてください`);
    byPref.set(b.prefecture, [...(byPref.get(b.prefecture) ?? []), b]);
  }
  for (const [pref, list] of byPref) {
    const sorted = [...list].sort((a, b) => a.minGramsExclusive - b.minGramsExclusive);
    if (sorted[0].minGramsExclusive !== 0) errors.push(`${pref}：最初の帯は0kg超から始めてください`);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (cur.minGramsExclusive < prev.maxGramsInclusive) errors.push(`${pref}：数量帯が重なっています`);
      if (cur.minGramsExclusive > prev.maxGramsInclusive) errors.push(`${pref}：数量帯に抜けがあります`);
    }
  }
  return [...new Set(errors)];
}

// 送料を探す。設定がなければ null（＝送料未設定。0円とは区別する）
export function findShippingFee(bands: ShippingBand[], prefecture: string, grams: number): number | null {
  const band = bands.find(
    (b) => b.prefecture === prefecture && grams > b.minGramsExclusive && grams <= b.maxGramsInclusive,
  );
  return band ? band.feeYen : null;
}
