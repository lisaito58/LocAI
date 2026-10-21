// 動作確認用のテストアカウントの投入（すべて架空の人物・店・農園）
// 実行：npm run seed:test
// すでに同じメールのアカウントがあれば作り直さない。パスワードは TEST_PASSWORD（未設定なら下の初期値）。
// 出品の受付期限は投入した時点から4日後。期限が過ぎたら、農家アカウントで「残りを再公開」するか新しく出品する。
import "./load-env";
import { seedAccounts, type FarmerSeed, type RestaurantSeed } from "./seed-lib";

const PASSWORD = process.env.TEST_PASSWORD || "locai-test-2026";

const farmers: FarmerSeed[] = [
  {
    email: "test-farmer1@locai.example",
    name: "テスト農家1",
    joinedDaysAgo: 200,
    profile: {
      farmName: "テスト農園 南丹",
      prefecture: "京都府",
      city: "南丹市",
      mainItems: "賀茂茄子、万願寺唐辛子",
      commitment: "朝どれをその日に発送（テスト用の自己申告）",
      introduction: "テスト用の架空の農園です。在庫が多めで、複数の店からの申込を試せます。",
      responseGuide: "当日中に返信します",
      availableWeekdays: "月・火・水・木・金",
    },
    listings: [
      { itemName: "賀茂茄子", description: "在庫多め。複数店舗からの申込の確認用。", sizeLabel: "大きめ", price: 900, totalKg: 40, minKg: 1, stepKg: 0.5, graceHours: 24 },
      { itemName: "万願寺唐辛子", description: "宅配と引き取りの両方を選べます。", sizeLabel: "混在", price: 1500, totalKg: 10, minKg: 0.5, stepKg: 0.5, graceHours: 24, pickup: true },
    ],
  },
  {
    email: "test-farmer2@locai.example",
    name: "テスト農家2",
    joinedDaysAgo: 3,
    profile: {
      farmName: "テスト畑 亀岡",
      prefecture: "京都府",
      city: "亀岡市",
      mainItems: "九条ねぎ、聖護院かぶ",
      commitment: "登録したばかりの農家（「新しく参加」ラベルの確認用）",
      introduction: "テスト用の架空の畑です。",
      responseGuide: "翌朝までに返信します",
      availableWeekdays: "火・木・土",
    },
    listings: [
      { itemName: "九条ねぎ", description: "1kg単位。", price: 650, totalKg: 25, minKg: 1, stepKg: 1, graceHours: 24 },
      { itemName: "聖護院かぶ", description: "最低2kgから（「希望より多い候補」の確認用）。", price: 500, totalKg: 15, minKg: 2, stepKg: 1, graceHours: 24 },
    ],
  },
  {
    email: "test-farmer3@locai.example",
    name: "テスト農家3",
    joinedDaysAgo: 45,
    profile: {
      farmName: "テストファーム 能勢",
      prefecture: "大阪府",
      city: "豊能郡能勢町",
      mainItems: "トマト、きゅうり",
      commitment: "完熟で収穫（テスト用の自己申告）",
      introduction: "テスト用の架空のファームです。",
      responseGuide: "半日以内に返信します",
      availableWeekdays: "月・水・金・土",
    },
    listings: [
      { itemName: "トマト", description: "前払い（銀行振込）。", sizeLabel: "中くらい", price: 600, totalKg: 20, minKg: 1, stepKg: 1, graceHours: 24 },
      { itemName: "きゅうり", description: "宅配でも受け渡し時払い。", price: 450, totalKg: 12, minKg: 1, stepKg: 1, graceHours: 12, onHandoverShipping: true },
    ],
  },
  {
    email: "test-farmer4@locai.example",
    name: "テスト農家4",
    joinedDaysAgo: 10,
    profile: {
      farmName: "テスト農場 丹波",
      prefecture: "兵庫県",
      city: "丹波篠山市",
      mainItems: "黒枝豆、賀茂茄子",
      commitment: "少量だけ出品（売り切れの確認用）",
      introduction: "テスト用の架空の農場です。",
      responseGuide: "2日以内に返信します",
      availableWeekdays: "土・日",
    },
    listings: [
      { itemName: "黒枝豆", description: "回答猶予48時間（期限の確認用）。", price: 1800, totalKg: 8, minKg: 0.5, stepKg: 0.5, graceHours: 48 },
      { itemName: "賀茂茄子", description: "残り2kgだけ（同時申込・売り切れの確認用）。", price: 850, totalKg: 2, minKg: 1, stepKg: 1, graceHours: 24 },
    ],
  },
  {
    email: "test-farmer5@locai.example",
    name: "テスト農家5",
    joinedDaysAgo: 1,
    profile: {
      farmName: "テスト農園 京丹後",
      prefecture: "京都府",
      city: "京丹後市",
      mainItems: "（まだ出品なし）",
      commitment: "出品がないアカウント（新しく出品する流れの確認用）",
      introduction: "テスト用の架空の農園です。",
      responseGuide: "当日中に返信します",
      availableWeekdays: "月・火・水・木・金・土",
    },
    listings: [],
  },
];

const restaurants: RestaurantSeed[] = [
  { email: "test-shop1@locai.example", name: "テスト店主1", profile: { shopName: "テスト小料理 福島", prefecture: "大阪府", city: "大阪市福島区" } },
  { email: "test-shop2@locai.example", name: "テスト店主2", profile: { shopName: "テスト居酒屋 梅田", prefecture: "大阪府", city: "大阪市北区" } },
  { email: "test-shop3@locai.example", name: "テスト店主3", profile: { shopName: "テストビストロ 中京", prefecture: "京都府", city: "京都市中京区" } },
  { email: "test-shop4@locai.example", name: "テスト店主4", profile: { shopName: "テスト和食 堺", prefecture: "大阪府", city: "堺市堺区" } },
  // 兵庫県は送料表がないので「送料未確定の出品（相談のみ）」になる
  { email: "test-shop5@locai.example", name: "テスト店主5", profile: { shopName: "テスト食堂 神戸", prefecture: "兵庫県", city: "神戸市中央区" } },
  // 店舗情報が未登録（初回の登録の流れを確認する用）
  { email: "test-shop6@locai.example", name: "テスト店主6", profile: null },
];

const { listingCount } = await seedAccounts({ password: PASSWORD, dataLabel: "テストデータ", farmers, restaurants });
console.log(`\n完了：出品 ${listingCount} 件を作成しました。テストアカウントのパスワードは TEST_PASSWORD（未設定なら初期値）です。`);
process.exit(0);
