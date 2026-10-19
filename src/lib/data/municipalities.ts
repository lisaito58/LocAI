// 都道府県ごとの市区町村の一覧（政令指定都市は区ごと、町村は郡名つき）
// 出典：Geolonia 住所データ（https://github.com/geolonia/japanese-addresses）
//       国土交通省「位置参照情報」をもとに作成されたデータ。ライセンス：CC BY 4.0
// 2026年10月19日に取得。AIで自治体名を作らず、このデータだけを候補・検証に使う。
import data from "./municipalities.json";

export const MUNICIPALITIES: Record<string, string[]> = data;

export function isValidCity(prefecture: string, city: string): boolean {
  return MUNICIPALITIES[prefecture]?.includes(city) ?? false;
}
