// 計算ルールの単体テスト（DB不要）
// 実行：npm run test:unit
import assert from "node:assert/strict";
import { test } from "node:test";
import { fairOrder } from "../src/lib/domain/ordering";
import { findShippingFee, validateShippingBands } from "../src/lib/domain/shipping";
import {
  dateToJstLocal,
  endOfJstDay,
  gramsToKgText,
  isAllowedQuantity,
  itemSubtotalYen,
  jstLocalToDate,
  kgTextToGrams,
  smallestAllowedAtLeast,
} from "../src/lib/domain/units";

test("kg ⇔ g の変換（小数3桁まで）", () => {
  assert.equal(kgTextToGrams("1.5"), 1500);
  assert.equal(kgTextToGrams("0.001"), 1);
  assert.equal(kgTextToGrams("2"), 2000);
  assert.equal(kgTextToGrams("1.2345"), null);
  assert.equal(kgTextToGrams("-1"), null);
  assert.equal(kgTextToGrams("abc"), null);
  assert.equal(gramsToKgText(1500), "1.5");
  assert.equal(gramsToKgText(2001), "2.001");
});

test("商品代は商品代全体で1円未満切り捨て", () => {
  assert.equal(itemSubtotalYen(333, 2000), 666);
  assert.equal(itemSubtotalYen(333, 2001), 666); // 666.333 → 666
  assert.equal(itemSubtotalYen(999, 1500), 1498); // 1498.5 → 1498
});

test("許可量 = 最低量 + 注文単位 × 0以上の整数", () => {
  assert.ok(isAllowedQuantity(1000, 1000, 500));
  assert.ok(isAllowedQuantity(1500, 1000, 500));
  assert.ok(!isAllowedQuantity(1200, 1000, 500));
  assert.ok(!isAllowedQuantity(500, 1000, 500));
  assert.equal(smallestAllowedAtLeast(1200, 1000, 500), 1500);
  assert.equal(smallestAllowedAtLeast(300, 1000, 500), 1000);
  assert.equal(smallestAllowedAtLeast(2000, 1000, 500), 2000);
});

const bands = [
  { prefecture: "大阪府", minGramsExclusive: 0, maxGramsInclusive: 2000, feeYen: 800 },
  { prefecture: "大阪府", minGramsExclusive: 2000, maxGramsInclusive: 5000, feeYen: 1000 },
  { prefecture: "京都府", minGramsExclusive: 0, maxGramsInclusive: 10000, feeYen: 0 },
];

test("送料：2kgちょうどと2kg超の境界、無料、未設定", () => {
  assert.equal(findShippingFee(bands, "大阪府", 2000), 800);
  assert.equal(findShippingFee(bands, "大阪府", 2001), 1000);
  assert.equal(findShippingFee(bands, "京都府", 3000), 0); // 無料は 0円
  assert.equal(findShippingFee(bands, "兵庫県", 1000), null); // 未設定は null（0円と区別）
  assert.equal(findShippingFee(bands, "大阪府", 5001), null); // 範囲外
});

test("送料帯の穴・重なり・開始位置は登録エラー", () => {
  assert.deepEqual(validateShippingBands(bands), []);
  const gap = [bands[0], { ...bands[1], minGramsExclusive: 2500 }];
  assert.ok(validateShippingBands(gap).some((e) => e.includes("抜け")));
  const overlap = [bands[0], { ...bands[1], minGramsExclusive: 1500 }];
  assert.ok(validateShippingBands(overlap).some((e) => e.includes("重なって")));
  const badStart = [{ ...bands[0], minGramsExclusive: 100 }];
  assert.ok(validateShippingBands(badStart).some((e) => e.includes("0kg超")));
});

test("日本時間の入力 ⇔ UTC保存", () => {
  const d = jstLocalToDate("2026-10-12T09:00")!;
  assert.equal(d.toISOString(), "2026-10-12T00:00:00.000Z");
  assert.equal(dateToJstLocal(d), "2026-10-12T09:00");
  assert.equal(endOfJstDay("2026-10-12").toISOString(), "2026-10-12T15:00:00.000Z");
});

test("公平な並び：同じシードなら同じ順、同じ農家が続かない", () => {
  const items = [
    { id: "a1", farmerId: "A" },
    { id: "a2", farmerId: "A" },
    { id: "a3", farmerId: "A" },
    { id: "b1", farmerId: "B" },
    { id: "b2", farmerId: "B" },
    { id: "c1", farmerId: "C" },
  ];
  const x = fairOrder(items, "seed1").map((i) => i.id);
  const y = fairOrder([...items].reverse(), "seed1").map((i) => i.id);
  assert.deepEqual(x, y);
  const farmers = fairOrder(items, "seed1").map((i) => i.farmerId);
  // 最初の3件は3つの農家が1件ずつ
  assert.equal(new Set(farmers.slice(0, 3)).size, 3);
  // シードを変えると順番が変わりうる（複数のシードのどれかで違う順）
  const others = ["s2", "s3", "s4", "s5"].map((s) => fairOrder(items, s).map((i) => i.id).join());
  assert.ok(others.some((o) => o !== x.join()));
});

import { isValidCity } from "../src/lib/data/municipalities";
import { checkPhone } from "../src/lib/validation/phone";

test("電話番号：整形してから原因別に案内する", () => {
  const ok = (s: string) => checkPhone(s);
  assert.deepEqual(ok("06-1234-5678"), { ok: true, value: "06-1234-5678" });
  assert.deepEqual(ok("０９０－１２３４－５６７８"), { ok: true, value: "090-1234-5678" }); // 全角
  assert.deepEqual(ok(" 0612345678 "), { ok: true, value: "0612345678" }); // 前後の空白
  assert.deepEqual(ok("090 1234 5678"), { ok: true, value: "090-1234-5678" }); // 空白区切り
  assert.deepEqual(ok("06(1234)5678"), { ok: true, value: "06-1234-5678" }); // かっこ
  assert.ok(ok("0120-123-456").ok);
  const msg = (s: string) => {
    const r = checkPhone(s);
    return r.ok ? "" : r.message;
  };
  assert.match(msg(""), /入力してください/);
  assert.match(msg("06-1234-abcd"), /文字や記号は使えません/);
  assert.match(msg("+81-90-1234-5678"), /国際電話/);
  assert.match(msg("6-1234-5678"), /0から/);
  assert.match(msg("06-1234-567"), /桁数/); // 9桁
  assert.match(msg("06-1234-56789"), /桁数/); // 11桁だが携帯ではない
  assert.match(msg("0000000000"), /桁数/);
});

test("市区町村：都道府県との組み合わせを検証", () => {
  assert.ok(isValidCity("大阪府", "大阪市福島区"));
  assert.ok(isValidCity("大阪府", "豊能郡能勢町"));
  assert.ok(!isValidCity("大阪府", "能勢町")); // 郡名なしは一覧にない表記
  assert.ok(!isValidCity("京都府", "大阪市福島区")); // 別の都道府県
  assert.ok(!isValidCity("存在しない県", "南丹市"));
});

import { itemKey, wasteFromRatio } from "../src/lib/domain/loss";
import { checkPostal } from "../src/lib/validation/postal";

test("郵便番号：全角・ハイフン・〒を整えてから7桁を確認", () => {
  assert.deepEqual(checkPostal("553-0003"), { ok: true, digits: "5530003", display: "553-0003" });
  assert.deepEqual(checkPostal("〒５５３－０００３"), { ok: true, digits: "5530003", display: "553-0003" });
  assert.deepEqual(checkPostal(" 5530003 "), { ok: true, digits: "5530003", display: "553-0003" });
  const msg = (s: string) => {
    const r = checkPostal(s);
    return r.ok ? "" : r.message;
  };
  assert.match(msg(""), /入力してください/);
  assert.match(msg("553-000"), /桁数/);
  assert.match(msg("553-00a3"), /数字7桁/);
});

test("ロス記録：割合ボタンから廃棄量（g整数）を計算", () => {
  assert.equal(wasteFromRatio(2000, 2), 1000); // 受取量2kgの約半分
  assert.equal(wasteFromRatio(2000, 1), 500);
  assert.equal(wasteFromRatio(1500, 3), 1125);
  assert.equal(wasteFromRatio(1001, 2), 501); // 0.5gは四捨五入
  assert.equal(wasteFromRatio(2000, 0), 0);
  assert.equal(wasteFromRatio(2000, 4), 2000);
});

test("同じ食材の判定は、表記の揺れをそろえた完全一致だけ", () => {
  assert.equal(itemKey("賀茂茄子"), itemKey("賀茂茄子 "));
  assert.equal(itemKey("ﾄﾏﾄ"), itemKey("トマト")); // 半角カナ→全角
  assert.notEqual(itemKey("賀茂茄子"), itemKey("賀茂なす")); // 似ていても別の食材
  assert.notEqual(itemKey("トマト"), itemKey("ミニトマト"));
});

import { itemMatches } from "../src/lib/domain/item-search";

test("食材名の表記ゆれ：ひらがな・カタカナ・漢字の読みをそろえて検索できる", () => {
  for (const q of ["とうがらし", "トウガラシ", "唐辛子", "ﾄｳｶﾞﾗｼ"]) assert.ok(itemMatches("万願寺唐辛子", q), q);
  for (const q of ["ねぎ", "ネギ", "葱"]) {
    assert.ok(itemMatches("九条ねぎ", q), q);
    assert.ok(itemMatches("九条葱", q), q);
  }
  for (const q of ["なす", "ナス", "茄子"]) assert.ok(itemMatches("賀茂茄子", q), q);
  assert.ok(itemMatches("玉ねぎ", "玉葱"));
  assert.ok(!itemMatches("トマト", "なす"), "別の野菜は一致しない");
  assert.ok(!itemMatches("きゅうり", ""), "空の検索語は一致させない");
});

test("AI相談：数量の目安はアプリが計算し、0.1kg単位に切り上げる／範囲外は計算しない", async () => {
  const { estimateQuantity } = await import("../src/lib/domain/ai-chat-calc");
  assert.deepEqual(estimateQuantity(30, 80), { rawGrams: 2400, grams: 2400 });
  assert.deepEqual(estimateQuantity(7, 45), { rawGrams: 315, grams: 400 });
  assert.equal(estimateQuantity(0, 80), null, "人数が分からなければ計算しない");
  assert.equal(estimateQuantity(30, 0), null);
  assert.equal(estimateQuantity(2.5, 80), null);
  assert.equal(estimateQuantity(1001, 80), null);
});

test("AI相談：掲載価格の参考は3件以上で、最低・中央値・最高を出す", async () => {
  const { priceReference } = await import("../src/lib/domain/ai-chat-calc");
  assert.deepEqual(priceReference([500, 300]), { enough: false, count: 2 });
  assert.deepEqual(priceReference([500, 300, 400]), { enough: true, count: 3, minYen: 300, medianYen: 400, maxYen: 500 });
  assert.deepEqual(priceReference([600, 300, 401, 500]), { enough: true, count: 4, minYen: 300, medianYen: 450, maxYen: 600 }, "偶数件は中央2件の平均（円未満切り捨て）");
});

test("AI相談：AIへ送る前に連絡先らしい文字列を伏せる（数量などの数字は残す）", async () => {
  const { redactPersonal } = await import("../src/lib/domain/ai-chat-calc");
  assert.equal(redactPersonal("電話は090-1234-5678です"), "電話は［電話番号］です");
  assert.equal(redactPersonal("06-6123-4567"), "［電話番号］");
  assert.equal(redactPersonal("〒530-0001に届けて"), "［郵便番号］に届けて");
  assert.equal(redactPersonal("mail: a.b@example.com"), "mail: ［メールアドレス］");
  assert.equal(redactPersonal("カレー30人分、玉ねぎ2.4kg、予算10000円"), "カレー30人分、玉ねぎ2.4kg、予算10000円");
});

test("地図の位置：郡名なし・区なしの政令市の登録でも、おおよその位置を出す", async () => {
  const { cityPoint } = await import("../src/lib/data/municipality-points");
  assert.ok(cityPoint("大阪府", "豊能郡能勢町"));
  assert.deepEqual(cityPoint("大阪府", "能勢町"), cityPoint("大阪府", "豊能郡能勢町"), "郡名なしでも同じ位置");
  assert.ok(cityPoint("京都府", "京都市"), "区なしの政令市は区の平均");
  assert.ok(cityPoint("京都府", "南丹市"));
  assert.equal(cityPoint("京都府", "ああああ"), null, "一覧にない名前は出さない");
  assert.equal(cityPoint("京都府", "京都"), null);
});
