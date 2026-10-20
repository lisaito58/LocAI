// 市区町村の「おおよその位置」（地図の目印用。農家の住所ではない）
// 出典：Geolonia 住所データ（https://github.com/geolonia/japanese-addresses、CC BY 4.0）
//       国土交通省「位置参照情報」をもとに作成されたデータ。
// 作り方：市区町村ごとに町丁目の代表点の平均に最も近い町丁目の座標を選び、小数3桁（約100m）に丸めた。
// 2026年10月20日に1回だけ取得して作成。地図表示のたびに外部へ問い合わせない。
import data from "./municipality-points.json";

const POINTS: Record<string, Record<string, number[]>> = data;

export function cityPoint(prefecture: string, city: string): [number, number] | null {
  const p = POINTS[prefecture]?.[city];
  return p && p.length === 2 ? [p[0], p[1]] : null;
}

// 都道府県の中心の目安（市区町村の代表点の平均）。地図の初期表示・地域の移動に使う
export function prefecturePoint(prefecture: string): [number, number] | null {
  const list = Object.values(POINTS[prefecture] ?? {}).filter((p) => p.length === 2);
  if (list.length === 0) return null;
  const lat = list.reduce((s, p) => s + p[0], 0) / list.length;
  const lng = list.reduce((s, p) => s + p[1], 0) / list.length;
  return [Math.round(lat * 1000) / 1000, Math.round(lng * 1000) / 1000];
}
