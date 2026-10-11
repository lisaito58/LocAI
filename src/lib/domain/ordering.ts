// 通常一覧の並び順（人気順にしない）
// 検索ごとの固定シードで並べ替え、同じ農家が続かないよう農家ごとに交互に出す。
// 同じシードなら同じ順番になるので、ページ移動・戻る操作でも順番が変わらない。

// 文字列から再現可能な乱数を作る（mulberry32）
function seededRandom(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function fairOrder<T extends { id: string; farmerId: string }>(items: T[], seed: string): T[] {
  const rand = seededRandom(seed);
  // DBの返す順番に左右されないよう、まずIDで揃える
  const stable = [...items].sort((a, b) => a.id.localeCompare(b.id));
  const groups = new Map<string, T[]>();
  for (const item of stable) groups.set(item.farmerId, [...(groups.get(item.farmerId) ?? []), item]);
  const queues = shuffle([...groups.keys()].sort(), rand).map((f) => shuffle(groups.get(f)!, rand));
  const result: T[] = [];
  while (queues.some((q) => q.length)) {
    for (const q of queues) {
      const next = q.shift();
      if (next) result.push(next);
    }
  }
  return result;
}
